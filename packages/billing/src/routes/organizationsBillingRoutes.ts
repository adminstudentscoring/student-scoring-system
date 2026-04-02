// Organization billing + finance routes extracted from server.js to keep the entry file manageable.
// All route behavior should remain identical.

import { Request, Response, NextFunction } from 'express';

const billingAccessFlags = require('../access');

/** Same matching rules as refund logic: order line class vs dropped enrollment date + series entry id */
function classSlotMatchesDroppedEnrollment(
  cls: any,
  enrollment: { date: string; timetableEntryId: string }
): boolean {
  let clsDate: string;
  if (cls.dateString) clsDate = cls.dateString;
  else if (cls.date) clsDate = new Date(cls.date).toISOString().split('T')[0];
  else return false;
  if (clsDate !== enrollment.date) return false;
  const tid = enrollment.timetableEntryId;
  if (cls.id === tid) return true;
  if (typeof cls.id === 'string' && cls.id.startsWith(`${tid}_`)) return true;
  if (cls.entry && cls.entry.id === tid) return true;
  if (typeof cls.id === 'string' && cls.id.includes(tid)) return true;
  return false;
}

/** Remove dropped lessons from unpaid order line items; delete empty unpaid orders */
function pruneUnpaidOrdersAfterEnrollmentDrops(
  orders: any[],
  organizationId: string,
  studentId: string,
  dropped: { date: string; timetableEntryId: string }[]
): void {
  if (!dropped.length || !organizationId) return;
  for (const order of orders) {
    if (order.organizationId !== organizationId || order.studentId !== studentId || order.status !== 'unpaid') {
      continue;
    }
    if (!Array.isArray(order.items)) continue;
    for (const item of order.items) {
      if (!item.enrolledClasses || !Array.isArray(item.enrolledClasses)) continue;
      const oldLen = item.enrolledClasses.length;
      const oldPrice = Number(item.price) || 0;
      item.enrolledClasses = item.enrolledClasses.filter(
        (cls: any) => !dropped.some((enr) => classSlotMatchesDroppedEnrollment(cls, enr))
      );
      const newLen = item.enrolledClasses.length;
      if (newLen < oldLen && oldLen > 0) {
        if (newLen === 0) item.price = 0;
        else item.price = Math.round(((oldPrice * newLen) / oldLen) * 100) / 100;
      }
    }
    order.items = order.items.filter((it: any) => it.enrolledClasses && it.enrolledClasses.length > 0);
    order.totalAmount = order.items.reduce((s: number, it: any) => s + (Number(it.price) || 0), 0);
  }
  for (let i = orders.length - 1; i >= 0; i--) {
    const o = orders[i];
    if (
      o.organizationId === organizationId &&
      o.studentId === studentId &&
      o.status === 'unpaid' &&
      (!o.items || o.items.length === 0)
    ) {
      orders.splice(i, 1);
    }
  }
}

function registerOrganizationsBillingRoutes(app: any, deps: any): void {
  const {
    // middleware
    authenticateUser,
    authorizeRole,

    // billing deps
    resolveOrgIdFromUser,
    readSubscriptionPrices,
    writeSubscriptionPrices,
    ensurePayPalPlanForPrice,
    upsertBillingSubscriptionFromPayPal,
    refreshSubscriptionAndEntitlement,
    computeEntitlementStatus,
    billingDb,
    paypal,

    // finance deps
    readUsers,
    readData,
    writeData,
    readTransactions,
    writeTransactions,
    readOrders,
    writeOrders,
    readExpenses,
    writeExpenses,
    readEnrollments,
    writeEnrollments,
    readTimetable,
    writeTimetable
  } = deps;

  function billingPayPalUnavailable(res: Response) {
    return res.status(503).json({ error: 'PayPal billing is not configured on this server' });
  }

  function billingEnforcementOff(res: Response) {
    return res.status(503).json({
      error: 'Platform subscription billing is disabled (BILLING_ENFORCEMENT=0).',
      code: 'billing_enforcement_off'
    });
  }

  function isBillingDbUnavailable(error: any): boolean {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('postgres not configured') ||
      message.includes('missing database_url') ||
      message.includes('database_public_url');
  }

  // ==================== Organization Billing (PayPal subscriptions) ====================

  // Organization: create PayPal subscription for a selected priceId (active+live only)
  app.post('/api/organizations/billing/subscriptions', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      if (!billingAccessFlags.isBillingEnforcementEnabled()) return billingEnforcementOff(res);
      if (!paypal.PAYPAL_CONFIGURED) return billingPayPalUnavailable(res);

      const orgId = resolveOrgIdFromUser(req.user);
      if (!orgId) return res.status(400).json({ error: 'Missing organization id' });

      const priceId = String(req.body?.priceId || '');
      if (!priceId) return res.status(400).json({ error: 'priceId is required' });

      const prices = await readSubscriptionPrices();
      const price = prices.find(p => String(p.id) === priceId);
      if (!price) return res.status(404).json({ error: 'Price not found' });
      if (!(String(price.status) === 'active' && String(price.publishState) === 'live')) {
        return res.status(400).json({ error: 'Price is not Active + Live' });
      }

      if (!price.paypalPlanId) {
        const ensured = await ensurePayPalPlanForPrice(price);
        price.paypalProductId = ensured.paypalProductId;
        price.paypalPlanId = ensured.paypalPlanId;
        await writeSubscriptionPrices(prices);
      }

      const { id, status, approvalUrl } = await paypal.createSubscription({
        planId: price.paypalPlanId,
        orgId,
        returnPath: '/organization.html',
        cancelPath: '/organization.html'
      });

      await upsertBillingSubscriptionFromPayPal({
        orgId,
        priceId: price.id,
        paypalSubscriptionId: id,
        paypalPlanId: price.paypalPlanId,
        status,
        billingType: price.billingType,
        currency: price.currency,
        currentPeriodEnd: null
      });

      res.json({ ok: true, subscriptionId: id, approvalUrl });
    } catch (error) {
      console.error('Create org subscription error:', error);
      res.status(500).json({ error: error.message || 'Failed to create subscription' });
    }
  });

  // Organization: after PayPal approve redirect, force-refresh subscription state from PayPal (fallback when webhook is delayed)
  app.post('/api/organizations/billing/subscriptions/refresh', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      if (!billingAccessFlags.isBillingEnforcementEnabled()) return billingEnforcementOff(res);
      if (!paypal.PAYPAL_CONFIGURED) return billingPayPalUnavailable(res);

      const orgId = resolveOrgIdFromUser(req.user);
      if (!orgId) return res.status(400).json({ error: 'Missing organization id' });

      const subscriptionId = String(req.body?.subscriptionId || '');
      if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required' });

      const refreshed = await refreshSubscriptionAndEntitlement(subscriptionId);

      // Security: ensure the subscription belongs to this org
      if (refreshed.orgId && String(refreshed.orgId) !== String(orgId)) {
        return res.status(403).json({ error: 'Subscription does not belong to this organization' });
      }

      res.json({ ok: true, refreshed });
    } catch (error) {
      console.error('Refresh subscription error:', error);
      res.status(500).json({ error: error.message || 'Failed to refresh subscription' });
    }
  });

  // Organization: cancel PayPal subscription (stop auto-renew; PayPal decides whether it remains active until period end)
  app.post('/api/organizations/billing/subscriptions/cancel', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      if (!billingAccessFlags.isBillingEnforcementEnabled()) return billingEnforcementOff(res);
      if (!paypal.PAYPAL_CONFIGURED) return billingPayPalUnavailable(res);

      const orgId = resolveOrgIdFromUser(req.user);
      if (!orgId) return res.status(400).json({ error: 'Missing organization id' });

      let subscriptionId = String(req.body?.subscriptionId || '');
      if (!subscriptionId) {
        const latest = await billingDb.query(
          'SELECT paypal_subscription_id FROM billing_subscriptions WHERE org_id=$1 ORDER BY updated_at DESC NULLS LAST LIMIT 1',
          [orgId]
        );
        subscriptionId = String(latest.rows[0]?.paypal_subscription_id || '');
      }
      if (!subscriptionId) return res.status(404).json({ error: 'No subscription found for this organization' });

      // Security: verify subscription belongs to this org (via PayPal custom_id when available)
      const pre = await paypal.getSubscription(subscriptionId);
      const customOrg = String(pre?.custom_id || '');
      if (customOrg && customOrg !== String(orgId)) {
        return res.status(403).json({ error: 'Subscription does not belong to this organization' });
      }

      const reason = String(req.body?.reason || 'Customer requested cancellation');
      await paypal.cancelSubscription({ subscriptionId, reason });

      // Mark local intent (useful for UI even if PayPal keeps it active until period end)
      await billingDb.query(
        'UPDATE billing_subscriptions SET cancel_at_period_end=TRUE, updated_at=NOW() WHERE paypal_subscription_id=$1',
        [subscriptionId]
      );

      const refreshed = await refreshSubscriptionAndEntitlement(subscriptionId);

      // Security: ensure the subscription belongs to this org
      if (refreshed.orgId && String(refreshed.orgId) !== String(orgId)) {
        return res.status(403).json({ error: 'Subscription does not belong to this organization' });
      }

      res.json({ ok: true, refreshed });
    } catch (error) {
      console.error('Cancel subscription error:', error);
      res.status(500).json({ error: error.message || 'Failed to cancel subscription' });
    }
  });

  // Organization: read current entitlement status (computed)
  app.get('/api/organizations/billing/status', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const orgId = resolveOrgIdFromUser(req.user);
      if (!orgId) return res.status(400).json({ error: 'Missing organization id' });

      const ent = await billingDb.query('SELECT * FROM billing_entitlements WHERE org_id=$1', [orgId]);
      const sub = await billingDb.query(
        'SELECT * FROM billing_subscriptions WHERE org_id=$1 ORDER BY updated_at DESC NULLS LAST LIMIT 1',
        [orgId]
      );
      const trial = await billingDb.query('SELECT * FROM billing_trials WHERE org_id=$1', [orgId]);

      const entitlement = ent.rows[0] || null;
      const subscription = sub.rows[0] || null;
      const trialRow = trial.rows[0] || null;

      const now = new Date();
      const computedStatus = entitlement
        ? computeEntitlementStatus(now, entitlement.current_period_end, entitlement.grace_until)
        : 'inactive';

      let graceDaysLeft = null;
      if (entitlement?.grace_until) {
        const ms = new Date(entitlement.grace_until).getTime() - now.getTime();
        graceDaysLeft = Math.max(0, Math.ceil(ms / (24 * 3600 * 1000)));
      }

      let trialActive = false;
      let trialDaysLeft = null;
      if (trialRow?.trial_end) {
        const ms = new Date(trialRow.trial_end).getTime() - now.getTime();
        trialDaysLeft = Math.max(0, Math.ceil(ms / (24 * 3600 * 1000)));
        trialActive = ms >= 0;
      }

      res.json({
        orgId,
        status: computedStatus,
        graceDaysLeft,
        trial: trialRow
          ? {
              trialStart: trialRow.trial_start || null,
              trialEnd: trialRow.trial_end || null,
              active: trialActive,
              daysLeft: trialDaysLeft
            }
          : null,
        entitlement,
        subscription
      });
    } catch (error) {
      if (isBillingDbUnavailable(error)) {
        return res.json({
          orgId: resolveOrgIdFromUser(req.user),
          status: 'inactive',
          graceDaysLeft: null,
          trial: null,
          entitlement: null,
          subscription: null,
          billingDisabled: true
        });
      }
      console.error('Get billing status error:', error);
      res.status(500).json({ error: error.message || 'Failed to load billing status' });
    }
  });

  // Organization: list available subscription plans (Active + Live prices only)
  app.get('/api/organizations/billing/plans', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      if (!paypal.PAYPAL_CONFIGURED) {
        return res.json({ plans: [], billingDisabled: true });
      }

      const prices = await readSubscriptionPrices();
      const activeLive = prices
        .filter(p => String(p.status) === 'active' && String(p.publishState) === 'live')
        .map(p => ({
          id: p.id,
          name: p.name,
          code: p.code,
          amount: Number(p.amount || 0),
          currency: String(p.currency || 'HKD').toUpperCase(),
          billingType: String(p.billingType || 'monthly'),
          limits: p.limits || {},
          features: p.features || {}
        }));

      const monthlyEquivalent = (p) => {
        const n = Number(p.amount || 0);
        return p.billingType === 'yearly' ? n / 12 : n;
      };

      activeLive.sort((a, b) => {
        const va = monthlyEquivalent(a);
        const vb = monthlyEquivalent(b);
        if (va !== vb) return va - vb;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });

      res.json({ plans: activeLive });
    } catch (error) {
      if (isBillingDbUnavailable(error)) {
        return res.json({ plans: [], billingDisabled: true });
      }
      console.error('Get org billing plans error:', error);
      res.status(500).json({ error: error.message || 'Failed to load plans' });
    }
  });

  // ==================== Organization Finance (balance / transactions / orders / expenses / enrollments) ====================

  // Adjust Student Balance
  app.post('/api/organizations/students/:id/balance', authenticateUser, authorizeRole('organization', 'teacher'), async (req, res) => {
    try {
      const { id } = req.params;
      const { amount, type, note } = req.body;

      if (!amount || !type || !['credit', 'debit'].includes(type)) {
        return res.status(400).json({ error: 'Invalid data' });
      }

      const data = await readData();
      const studentIndex = data.students.findIndex(s => s.id === id);
      if (studentIndex === -1) return res.status(404).json({ error: 'Student not found' });

      const student = data.students[studentIndex];
      const orgId = req.user.organizationId;

      if (student.organizationId !== orgId) return res.status(403).json({ error: 'Access denied' });

      const value = parseFloat(amount);
      if (isNaN(value)) return res.status(400).json({ error: 'Invalid amount' });

      const oldBalance = student.balance || 0;
      if (type === 'credit') {
        student.balance = oldBalance + value;
      } else {
        student.balance = oldBalance - value;
      }

      const transactions = await readTransactions();
      const transaction = {
        id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        organizationId: orgId,
        studentId: id,
        type,
        amount: value,
        balanceBefore: oldBalance,
        balanceAfter: student.balance,
        note: note || '',
        createdAt: new Date().toISOString(),
        createdBy: req.user.id
      };
      transactions.push(transaction);

      await writeData(data);
      await writeTransactions(transactions);

      res.json({ success: true, balance: student.balance, transaction });
    } catch (error) {
      console.error('Error adjusting balance:', error);
      res.status(500).json({ error: 'Failed to adjust balance' });
    }
  });

  // Get Transactions
  app.get('/api/organizations/transactions', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { studentId } = req.query;
      const transactions = await readTransactions();
      const orgId = req.user.organizationId;

      let filtered = transactions.filter(t => t.organizationId === orgId);
      if (studentId) {
        filtered = filtered.filter(t => t.studentId === studentId);
      }

      res.json(filtered);
    } catch (error) {
      console.error('Error getting transactions:', error);
      res.status(500).json({ error: 'Failed to get transactions' });
    }
  });

  // Get Organization Orders
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

  // Update Order Status
  app.patch('/api/organizations/orders/:id/status', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { id } = req.params;
      const { status, paymentDetails } = req.body;

      if (!['paid', 'unpaid', 'cancelled', 'refunded'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);

      const orders = await readOrders();
      const orderIndex = orders.findIndex(o => o.id === id);

      if (orderIndex === -1) return res.status(404).json({ error: 'Order not found' });

      const order = orders[orderIndex];
      if (order.organizationId !== orgUser.organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      order.status = status;
      if (paymentDetails) {
        order.paymentDetails = paymentDetails;
      }
      order.updatedAt = new Date().toISOString();
      order.updatedBy = req.user.id;

      await writeOrders(orders);

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

  // Get Expenses
  app.get('/api/organizations/expenses', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const expenses = await readExpenses();
      const orgExpenses = expenses.filter(e => e.organizationId === req.user.organizationId);
      res.json(orgExpenses);
    } catch (error) {
      console.error('Error getting expenses:', error);
      res.status(500).json({ error: 'Failed to get expenses' });
    }
  });

  // Add Expense
  app.post('/api/organizations/expenses', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { item, amount, date, category, note } = req.body;

      if (!item || !amount || !date || !category) {
        return res.status(400).json({ error: 'Required fields missing' });
      }

      const expenses = await readExpenses();
      const newExpense = {
        id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        organizationId: req.user.organizationId,
        item,
        amount: parseFloat(amount),
        date,
        category,
        note: note || '',
        createdAt: new Date().toISOString(),
        createdBy: req.user.id
      };

      expenses.push(newExpense);
      await writeExpenses(expenses);

      res.json(newExpense);
    } catch (error) {
      console.error('Error adding expense:', error);
      res.status(500).json({ error: 'Failed to add expense' });
    }
  });

  // Delete Expense
  app.delete('/api/organizations/expenses/:id', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { id } = req.params;
      const expenses = await readExpenses();
      const index = expenses.findIndex(e => e.id === id);

      if (index === -1) return res.status(404).json({ error: 'Expense not found' });
      if (expenses[index].organizationId !== req.user.organizationId) return res.status(403).json({ error: 'Access denied' });

      expenses.splice(index, 1);
      await writeExpenses(expenses);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting expense:', error);
      res.status(500).json({ error: 'Failed to delete expense' });
    }
  });

  // Create Sales Order
  app.post('/api/organizations/orders', authenticateUser, authorizeRole('organization'), async (req, res) => {
    console.log('[DEBUG] POST /orders called');
    try {
      const { studentId, items, paymentStatus, paymentDetails } = req.body;
      console.log('[DEBUG] Order Payload:', { studentId, itemCount: items?.length, paymentStatus });

      if (!studentId || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Invalid order data' });
      }

      // Check organization access
      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      // 1. Save Order
      const orders = await readOrders();
      const newOrder = {
        id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        organizationId: orgUser.organizationId,
        studentId,
        date: new Date().toISOString(),
        status: paymentStatus || 'unpaid', // unpaid, paid
        paymentDetails: paymentDetails || null,
        items: items, // Store full structure
        totalAmount: items.reduce((sum, item) => sum + (item.price || 0), 0),
        createdBy: req.user.id
      };

      orders.push(newOrder);
      await writeOrders(orders);

      // 2. Process Enrollments
      const enrollments = await readEnrollments();
      const timetableData = await readTimetable();

      for (const item of items) {
        if (item.enrolledClasses && Array.isArray(item.enrolledClasses)) {
          for (const cls of item.enrolledClasses) {
            let entryId = cls.id;

            // Try to find exact match first (for Single classes or raw IDs)
            let entry = timetableData.entries.find(e => e.id === entryId);

            // If not found, check if it's a recurring instance (ID_Timestamp)
            if (!entry && cls.id.includes('_')) {
              // Try removing the last segment (timestamp)
              const lastUnderscoreIndex = cls.id.lastIndexOf('_');
              if (lastUnderscoreIndex > -1) {
                const potentialId = cls.id.substring(0, lastUnderscoreIndex);
                const potentialEntry = timetableData.entries.find(e => e.id === potentialId);
                if (potentialEntry) {
                  entry = potentialEntry;
                  entryId = potentialId;
                }
              }
            }

            console.log(`[DEBUG] Processing Item Class ID: ${cls.id}, Resolved EntryID: ${entryId}, Entry Found: ${!!entry}`);

            if (entry) {
              console.log(`[DEBUG] Entry Found: ${entry.className}, isRecurring: ${entry.isRecurring}`);

              // Unified Logic: Always add to enrollments (single instance record)
              // Use dateString from frontend if available (safe local date), otherwise fallback
              let dateStr;
              if (cls.dateString) {
                dateStr = cls.dateString;
              } else {
                dateStr = new Date(cls.date).toISOString().split('T')[0];
              }

              console.log(`[DEBUG] Processing enrollment for date ${dateStr}`);

              // Check duplicates
              const exists = enrollments.find(e =>
                e.studentId === studentId &&
                e.timetableEntryId === entry.id &&
                e.date === dateStr
              );

              if (!exists) {
                console.log(`[DEBUG] Adding new enrollment for entry ${entry.id} on ${dateStr}`);
                enrollments.push({
                  id: `enr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                  organizationId: orgUser.organizationId,
                  studentId,
                  timetableEntryId: entry.id,
                  date: dateStr,
                  type: 'single',
                  orderId: newOrder.id
                });
              } else {
                console.log(`[DEBUG] Enrollment already exists for entry ${entry.id} on ${dateStr}`);
              }
            } else {
              console.log(`[DEBUG] Timetable Entry NOT FOUND for ID: ${entryId} (Original: ${cls.id})`);
            }
          }
        }
      }

      await writeEnrollments(enrollments);
      console.log('[DEBUG] No changes to timetable entries');

      res.status(201).json(newOrder);
    } catch (error) {
      console.error('Error creating order:', error);
      res.status(500).json({ error: 'Failed to create order' });
    }
  });

  // Drop Enrollment / Refund
  app.post('/api/organizations/enrollments/drop', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { studentId, mode, enrollmentId, timetableEntryId, date, courseId } = req.body;

      console.log(`[DEBUG] Drop Request: studentId=${studentId}, mode=${mode}`);

      if (!studentId || !mode) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Read Students from DATA_FILE (students.txt) via readData()
      const data = await readData();
      const students = data.students || [];
      const studentIndex = students.findIndex(s => s.id === studentId);

      if (studentIndex === -1) {
        console.log(`[DEBUG] Student NOT FOUND in students.txt. ID: ${studentId}`);
        return res.status(404).json({ error: 'Student not found' });
      }

      let enrollments = await readEnrollments();
      const orders = await readOrders();
      const timetableData = await readTimetable();

      let refundAmount = 0;
      let droppedCount = 0;
      const droppedForOrderSync: { date: string; timetableEntryId: string }[] = [];

      // Helper to calculate refund value for a single enrollment
      const getRefundValue = (enrollment) => {
        if (!enrollment.orderId) return 0;
        const order = orders.find(o => o.id === enrollment.orderId);

        // Only refund if Paid
        if (!order || order.status !== 'paid') return 0;

        // Find the item in the order
        for (const item of order.items) {
          if (item.enrolledClasses && Array.isArray(item.enrolledClasses)) {
            // Check if this enrollment corresponds to one of these classes
            // We match by Date and Entry ID (fuzzy match for Entry ID due to recurrence suffix)
            const match = item.enrolledClasses.some(cls => {
              let clsDate;
              if (cls.dateString) {
                clsDate = cls.dateString;
              } else {
                clsDate = new Date(cls.date).toISOString().split('T')[0];
              }

              if (clsDate !== enrollment.date) return false;

              // Check ID
              if (cls.id === enrollment.timetableEntryId) return true;
              if (cls.id.startsWith(enrollment.timetableEntryId + '_')) return true;
              if (enrollment.timetableEntryId.startsWith(cls.id + '_')) return true; // Unlikely

              // Also try robust ID resolution logic from POST /orders if needed
              // But generally, enrollment.timetableEntryId is the Resolved ID.
              // And cls.id is likely the Resolved ID or Recurring ID.
              return cls.id.includes(enrollment.timetableEntryId);
            });

            if (match) {
              const count = item.enrolledClasses.length || 1;
              return (item.price || 0) / count;
            }
          }
        }
        return 0;
      };

      if (mode === 'single') {
        let targetIndex = -1;
        if (enrollmentId) {
          targetIndex = enrollments.findIndex(e => e.id === enrollmentId);
        } else if (timetableEntryId && date) {
          targetIndex = enrollments.findIndex(e => e.studentId === studentId && e.timetableEntryId === timetableEntryId && e.date === date);
        }

        if (targetIndex !== -1) {
          const enrollment = enrollments[targetIndex];
          refundAmount += getRefundValue(enrollment);
          droppedForOrderSync.push({ date: enrollment.date, timetableEntryId: enrollment.timetableEntryId });
          enrollments.splice(targetIndex, 1);
          droppedCount++;
        }
      } else if (mode === 'all') {
        if (!timetableEntryId) return res.status(400).json({ error: 'Timetable Entry ID required for Drop All' });

        // Drop from this calendar day onward (inclusive), same series (timetableEntryId).
        // Optional `date` = YYYY-MM-DD from the UI's selected day; if omitted, use server "today".
        const dateStrIn = typeof date === 'string' ? date.trim() : '';
        const cutoff =
          /^\d{4}-\d{2}-\d{2}$/.test(dateStrIn) ? dateStrIn : new Date().toISOString().split('T')[0];
        const newEnrollments = [];

        for (const e of enrollments) {
          let shouldDrop = false;
          if (e.studentId === studentId && e.date >= cutoff) {
            // Check if enrollment belongs to the specific Timetable Entry (Series)
            // This ensures we only drop "Elite Class (Mon)" and not "Regular Class (Wed)"
            if (e.timetableEntryId === timetableEntryId) {
              shouldDrop = true;
            }
          }

          if (shouldDrop) {
            refundAmount += getRefundValue(e);
            droppedForOrderSync.push({ date: e.date, timetableEntryId: e.timetableEntryId });
            droppedCount++;
          } else {
            newEnrollments.push(e);
          }
        }
        enrollments = newEnrollments;
      }

      // Update Student Balance if refund applicable
      if (refundAmount > 0) {
        students[studentIndex].balance = (students[studentIndex].balance || 0) + refundAmount;
        await writeData(data);
      }

      await writeEnrollments(enrollments);

      const orgIdForOrders = resolveOrgIdFromUser(req.user);
      if (orgIdForOrders && droppedForOrderSync.length > 0) {
        pruneUnpaidOrdersAfterEnrollmentDrops(orders, orgIdForOrders, studentId, droppedForOrderSync);
        await writeOrders(orders);
      }

      res.json({
        success: true,
        droppedCount,
        refundAmount,
        newBalance: students[studentIndex].balance || 0
      });
    } catch (error) {
      console.error('Error dropping enrollment:', error);
      res.status(500).json({ error: 'Failed to drop enrollment' });
    }
  });
}

module.exports = { registerOrganizationsBillingRoutes };


