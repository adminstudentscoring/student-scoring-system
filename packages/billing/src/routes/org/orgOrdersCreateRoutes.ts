// Organization orders routes — extracted from organizationsBillingRoutes.ts
const {
  quotaPayLog,
  mergeSalesOrderItems,
  roundMoney,
  effectiveAmountPaid,
  buildSyntheticQuotaItemsForBalance,
  validateLessonQuotaForItems,
  applyLessonQuotaDeduction,
  syncEnrollmentsOrderIdFromOrder,
  pushEnrollmentsFromItems
} = require('./orgBillingHelpers');
function registerOrgOrdersCreateRoutes(app: any, deps: any): void {
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

  // Create Sales Order (optional mergeIntoOrderId: extend one existing unpaid order in place)
  app.post('/api/organizations/orders', authenticateUser, authorizeRole('organization'), async (req, res) => {
    console.log('[DEBUG] POST /orders called');
    try {
      const { studentId, items, paymentStatus, paymentDetails, mergeIntoOrderId } = req.body;
      console.log('[DEBUG] Order Payload:', { studentId, itemCount: items?.length, paymentStatus, mergeIntoOrderId });

      if (!studentId || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Invalid order data' });
      }

      const users = await readUsers();
      const orgUser = users.find((u: any) => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        quotaPayLog('POST /orders: organization user missing', { userId: req.user?.id });
        return res.status(403).json({ error: 'Organization not found' });
      }

      const orders = await readOrders();
      let enrollments = await readEnrollments();
      const timetableData = await readTimetable();

      const isLessonQuotaPay =
        paymentStatus === 'paid' &&
        paymentDetails &&
        String((paymentDetails as any).method || '').toLowerCase() === 'lesson_quota';

      if (isLessonQuotaPay) {
        quotaPayLog('POST /orders: lesson_quota attempt', {
          mergeIntoOrderId: mergeIntoOrderId || null,
          studentId: String(studentId),
          itemCount: items?.length
        });
      }

      if (mergeIntoOrderId) {
        const orderIndex = orders.findIndex((o: any) => o.id === mergeIntoOrderId);
        if (orderIndex === -1) return res.status(404).json({ error: 'Order not found' });
        const order = orders[orderIndex];
        if (order.organizationId !== orgUser.organizationId) {
          return res.status(403).json({ error: 'Access denied' });
        }
        if (String(order.studentId) !== String(studentId)) {
          return res.status(400).json({ error: 'Student mismatch for merge' });
        }
        if (['cancelled', 'refunded'].includes(order.status)) {
          return res.status(400).json({ error: 'Cannot merge into a cancelled or refunded order' });
        }

        if (isLessonQuotaPay) {
          const dataPre = await readData();
          const stuPre = (dataPre.students || []).find((s: any) => String(s.id) === String(studentId));
          quotaPayLog('POST /orders merge: student for quota', {
            studentId: String(studentId),
            found: !!stuPre
          });
          const vErr = validateLessonQuotaForItems(stuPre, items);
          if (vErr) {
            quotaPayLog('POST /orders merge: quota validation FAIL', { error: vErr });
            return res.status(400).json({ error: vErr });
          }
        }

        const prevPaid = effectiveAmountPaid(order);
        order.items = mergeSalesOrderItems(order.items || [], items);
        order.totalAmount = order.items.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0);

        const total = roundMoney(Number(order.totalAmount) || 0);

        console.log('[OrderPay] POST /orders merge', {
          mergeIntoOrderId,
          isLessonQuotaPay,
          paymentStatus,
          prevPaid,
          totalAfterMerge: total,
          incomingItemPrices: (items || []).map((it: any) => Number(it.price) || 0)
        });

        if (isLessonQuotaPay) {
          order.amountPaid = total;
          order.paymentDetails = paymentDetails;
          order.status = 'paid';
        } else {
          const extraFromThisPayment =
            paymentStatus === 'paid' && paymentDetails
              ? roundMoney((Number(paymentDetails.amount) || 0) + (Number(paymentDetails.balanceUsed) || 0))
              : 0;
          order.amountPaid = roundMoney(prevPaid + extraFromThisPayment);
          if (paymentDetails !== undefined && paymentDetails !== null) {
            order.paymentDetails = paymentDetails;
          }
          order.status = order.amountPaid + 0.005 >= total ? 'paid' : 'unpaid';
        }

        order.updatedAt = new Date().toISOString();
        order.updatedBy = req.user.id;
        await writeOrders(orders);
        pushEnrollmentsFromItems(
          mergeIntoOrderId,
          studentId,
          items,
          enrollments,
          timetableData,
          orgUser.organizationId
        );
        syncEnrollmentsOrderIdFromOrder(order, enrollments, timetableData);
        await writeEnrollments(enrollments);

        if (isLessonQuotaPay) {
          const data = await readData();
          const stu = (data.students || []).find((s: any) => String(s.id) === String(studentId));
          if (stu) {
            applyLessonQuotaDeduction(stu, items);
            await writeData(data);
            quotaPayLog('POST merge: quota deducted', {
              studentId: String(stu.id),
              lessonQuotaByCents: stu.lessonQuotaByCents
            });
          } else {
            quotaPayLog('POST merge: WARN paid with quota but student missing for deduction', {
              studentId: String(studentId)
            });
          }
        }

        console.log('[DEBUG] No changes to timetable entries (merge)');
        return res.status(200).json(order);
      }

      const totalNew = items.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0);

      if (isLessonQuotaPay) {
        const dataPre = await readData();
        const stuPre = (dataPre.students || []).find((s: any) => String(s.id) === String(studentId));
        quotaPayLog('POST /orders new: student for quota', {
          studentId: String(studentId),
          found: !!stuPre
        });
        const vErr = validateLessonQuotaForItems(stuPre, items);
        if (vErr) {
          quotaPayLog('POST /orders new: quota validation FAIL', { error: vErr });
          return res.status(400).json({ error: vErr });
        }
      }

      const extraNew =
        !isLessonQuotaPay && paymentStatus === 'paid' && paymentDetails
          ? roundMoney((Number(paymentDetails.amount) || 0) + (Number(paymentDetails.balanceUsed) || 0))
          : 0;

      const newOrder = {
        id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        organizationId: orgUser.organizationId,
        studentId,
        date: new Date().toISOString(),
        status: isLessonQuotaPay
          ? 'paid'
          : roundMoney(extraNew) + 0.005 >= roundMoney(totalNew)
            ? 'paid'
            : 'unpaid',
        paymentDetails: paymentDetails || null,
        items,
        totalAmount: totalNew,
        amountPaid: isLessonQuotaPay ? roundMoney(totalNew) : roundMoney(extraNew),
        createdBy: req.user.id
      };

      orders.push(newOrder);
      await writeOrders(orders);

      pushEnrollmentsFromItems(
        newOrder.id,
        studentId,
        items,
        enrollments,
        timetableData,
        orgUser.organizationId
      );
      syncEnrollmentsOrderIdFromOrder(newOrder, enrollments, timetableData);
      await writeEnrollments(enrollments);

      if (isLessonQuotaPay) {
        const data = await readData();
        const stu = (data.students || []).find((s: any) => String(s.id) === String(studentId));
        if (stu) {
          applyLessonQuotaDeduction(stu, items);
          await writeData(data);
          quotaPayLog('POST new order: quota deducted', {
            studentId: String(stu.id),
            lessonQuotaByCents: stu.lessonQuotaByCents
          });
        } else {
          quotaPayLog('POST new order: WARN paid with quota but student missing for deduction', {
            studentId: String(studentId)
          });
        }
      }

      console.log('[DEBUG] No changes to timetable entries');

      res.status(201).json(newOrder);
    } catch (error) {
      console.error('Error creating order:', error);
      res.status(500).json({ error: 'Failed to create order' });
    }
  });

}

module.exports = { registerOrgOrdersCreateRoutes };
export {};
