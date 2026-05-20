// Organization orders routes — extracted from organizationsBillingRoutes.ts
const {
  quotaPayLog,
  roundMoney,
  effectiveAmountPaid,
  buildSyntheticQuotaItemsForBalance,
  validateLessonQuotaForItems,
  applyLessonQuotaDeduction,
  syncEnrollmentsOrderIdFromOrder
} = require('./orgBillingHelpers');
function registerOrgOrdersCrudRoutes(app: any, deps: any): void {
  const {
    authenticateUser,
    authorizeRole,
    resolveOrgIdFromUser,
    readUsers,
    readData,
    writeData,
    readOrders,
    writeOrders,
    readEnrollments,
    writeEnrollments,
    readTimetable,
    writeTimetable
  } = deps;

  app.get('/api/organizations/orders', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) return res.status(403).json({ error: 'Org not found' });

      const orders = await readOrders();
      const orgOrders = orders.filter(o => o.organizationId === orgUser.organizationId);

      res.json(orgOrders);
    } catch (error) {
      console.error('Error getting orders:', error);
      res.status(500).json({ error: 'Failed to get orders' });
    }
  });

  // Get one order by id (org-scoped). Avoids 404 when something issues GET /orders/:id (e.g. receipt logo URL, tooling).
  app.get('/api/organizations/orders/:id', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { id } = req.params;
      const users = await readUsers();
      const orgUser = users.find((u: any) => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Org not found' });
      }

      const orders = await readOrders();
      const order = orders.find((o: any) => o.id === id);
      if (!order || order.organizationId !== orgUser.organizationId) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json(order);
    } catch (error) {
      console.error('Error getting order:', error);
      res.status(500).json({ error: 'Failed to get order' });
    }
  });

  // Update Order Status (+ partial payments via amountPaid)
  app.patch('/api/organizations/orders/:id/status', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { id } = req.params;
      const { status, paymentDetails } = req.body;

      if (!['paid', 'unpaid', 'cancelled', 'refunded'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        quotaPayLog('PATCH /orders/:id/status: no org user', { userId: req.user?.id });
        return res.status(403).json({ error: 'Organization user not found' });
      }

      const orders = await readOrders();
      const orderIndex = orders.findIndex(o => o.id === id);

      if (orderIndex === -1) return res.status(404).json({ error: 'Order not found' });

      const order = orders[orderIndex];
      if (order.organizationId !== orgUser.organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (status === 'cancelled' || status === 'refunded') {
        order.status = status;
        if (paymentDetails) order.paymentDetails = paymentDetails;
        order.updatedAt = new Date().toISOString();
        order.updatedBy = req.user.id;
        await writeOrders(orders);
        return res.json(order);
      }

      // Accounting "mark paid" without payment payload → treat as full settlement
      if (status === 'paid' && !paymentDetails) {
        order.amountPaid = roundMoney(Number(order.totalAmount) || 0);
        order.status = 'paid';
        order.updatedAt = new Date().toISOString();
        order.updatedBy = req.user.id;
        await writeOrders(orders);
        const enMark = await readEnrollments();
        const ttMark = await readTimetable();
        syncEnrollmentsOrderIdFromOrder(order, enMark, ttMark);
        await writeEnrollments(enMark);
        return res.json(order);
      }

      const isPatchLessonQuota =
        status === 'paid' &&
        paymentDetails &&
        String((paymentDetails as any).method || '').toLowerCase() === 'lesson_quota';

      if (isPatchLessonQuota) {
        const total = roundMoney(Number(order.totalAmount) || 0);
        const prev = effectiveAmountPaid(order);
        const due = roundMoney(total - prev);
        console.log('[OrderPay] PATCH lesson_quota settle request', {
          orderId: id,
          total,
          prevPaid: prev,
          balanceDue: due,
          studentId: order.studentId
        });
        if (due <= 0.005) {
          return res.status(400).json({ error: 'No balance due on this order' });
        }
        const dataPre = await readData();
        const stuPre = (dataPre.students || []).find((s: any) => String(s.id) === String(order.studentId));
        quotaPayLog('PATCH lesson_quota: student lookup', {
          orderStudentId: String(order.studentId),
          foundInReadData: !!stuPre,
          readDataStudentCount: (dataPre.students || []).length
        });
        const synth = buildSyntheticQuotaItemsForBalance(order, due);
        if (synth.length === 0) {
          quotaPayLog('PATCH lesson_quota: FAIL empty synthetic items', {
            orderItemCount: (order.items || []).length,
            linesWithClassesInOrder: (order.items || []).filter(
              (it: any) => Array.isArray(it.enrolledClasses) && it.enrolledClasses.length > 0
            ).length
          });
          return res.status(400).json({
            error: 'No enrollments on this order to settle with lesson quota'
          });
        }
        const vErr = validateLessonQuotaForItems(stuPre, synth);
        if (vErr) {
          quotaPayLog('PATCH lesson_quota: validation failed', { orderId: id, error: vErr });
          return res.status(400).json({ error: vErr });
        }
        order.amountPaid = total;
        order.paymentDetails = paymentDetails;
        order.status = 'paid';
        order.updatedAt = new Date().toISOString();
        order.updatedBy = req.user.id;
        await writeOrders(orders);
        const enLq = await readEnrollments();
        const ttLq = await readTimetable();
        syncEnrollmentsOrderIdFromOrder(order, enLq, ttLq);
        await writeEnrollments(enLq);
        const data = await readData();
        const stu = (data.students || []).find((s: any) => String(s.id) === String(order.studentId));
        if (stu) {
          applyLessonQuotaDeduction(stu, synth);
          await writeData(data);
          quotaPayLog('PATCH lesson_quota: quota deducted', {
            studentId: String(stu.id),
            lessonQuotaByCents: stu.lessonQuotaByCents
          });
        } else {
          quotaPayLog('PATCH lesson_quota: WARN student not found after write — quota not deducted', {
            orderStudentId: String(order.studentId)
          });
        }
        console.log('[OrderPay] PATCH lesson_quota settle OK', {
          orderId: id,
          amountPaid: order.amountPaid,
          synthLines: synth.length
        });
        return res.json(order);
      }

      if (paymentDetails) {
        const add = roundMoney(
          (Number(paymentDetails.amount) || 0) + (Number(paymentDetails.balanceUsed) || 0)
        );
        if (add > 0) {
          const prev = effectiveAmountPaid(order);
          order.amountPaid = roundMoney(prev + add);
        }
        order.paymentDetails = paymentDetails;
      }

      const total = roundMoney(Number(order.totalAmount) || 0);
      const paid = effectiveAmountPaid(order);
      order.status = paid + 0.005 >= total ? 'paid' : 'unpaid';

      order.updatedAt = new Date().toISOString();
      order.updatedBy = req.user.id;

      await writeOrders(orders);
      const enFin = await readEnrollments();
      const ttFin = await readTimetable();
      syncEnrollmentsOrderIdFromOrder(order, enFin, ttFin);
      await writeEnrollments(enFin);

      res.json(order);
    } catch (error) {
      console.error('Error updating order:', error);
      res.status(500).json({ error: 'Failed to update order' });
    }
  });

  // Delete Order
  app.delete('/api/organizations/orders/:id', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { id } = req.params;
      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);

      const orders = await readOrders();
      const orderIndex = orders.findIndex(o => o.id === id);

      if (orderIndex === -1) return res.status(404).json({ error: 'Order not found' });

      if (orders[orderIndex].organizationId !== orgUser.organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      orders.splice(orderIndex, 1);
      await writeOrders(orders);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting order:', error);
      res.status(500).json({ error: 'Failed to delete order' });
    }
  });
}

module.exports = { registerOrgOrdersCrudRoutes };
export {};
