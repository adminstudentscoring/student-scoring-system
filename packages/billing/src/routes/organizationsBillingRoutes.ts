// Organization billing + finance routes extracted from server.js to keep the entry file manageable.
// All route behavior should remain identical.

import { Request, Response, NextFunction } from 'express';

const billingAccessFlags = require('../access');
const fsPromises = require('fs').promises;
const pathMod = require('path');

/** Set QUOTA_PAY_VERBOSE=1 for extra line-by-line JSON dumps on stdout. Base [QuotaPay] logs always print. */
const QUOTA_PAY_VERBOSE = String(process.env.QUOTA_PAY_VERBOSE || '').trim() === '1';

function quotaPayLog(msg: string, data?: Record<string, unknown>): void {
  if (data !== undefined) {
    console.log('[QuotaPay]', msg, data);
  } else {
    console.log('[QuotaPay]', msg);
  }
}

function quotaPayVerbose(msg: string, data?: Record<string, unknown>): void {
  if (!QUOTA_PAY_VERBOSE) return;
  if (data !== undefined) {
    console.log('[QuotaPay:V]', msg, data);
  } else {
    console.log('[QuotaPay:V]', msg);
  }
}

/** Optional file log for enrollments/drop (set DEBUG_ENROLLMENT_DROP=1 or ENROLLMENT_DROP_LOG=/path) */
async function appendEnrollmentDropLog(message: string): Promise<void> {
  const explicit = String(process.env.ENROLLMENT_DROP_LOG || '').trim();
  const defaultPath =
    String(process.env.DEBUG_ENROLLMENT_DROP || '') === '1'
      ? pathMod.join(process.cwd(), process.env.DATA_DIR || 'data', 'enrollment-drop-debug.log')
      : '';
  const filePath = explicit || defaultPath;
  if (!filePath) return;
  try {
    await fsPromises.mkdir(pathMod.dirname(filePath), { recursive: true });
    await fsPromises.appendFile(filePath, `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch (e) {
    console.error('[appendEnrollmentDropLog]', e);
  }
}

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
    if (
      order.organizationId !== organizationId ||
      String(order.studentId) !== String(studentId) ||
      order.status !== 'unpaid'
    ) {
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

/** YYYY-MM-DD for comparisons (avoids lex bugs e.g. "2026-04-02T00:00:00.000Z" > "2026-04-16"). */
function toComparableYmd(value: unknown): string | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const head = s.split('T')[0].split(' ')[0];
  const m = head.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const y = m[1];
  const mo = m[2].padStart(2, '0');
  const d = m[3].padStart(2, '0');
  const out = `${y}-${mo}-${d}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
}

/** Merge new sales line items into an existing order (same productType + productData.id → combine classes + price). */
function mergeSalesOrderItems(existingItems: any[], appendItems: any[]): any[] {
  const items = JSON.parse(JSON.stringify(existingItems || []));
  const classKey = (c: any): string => {
    let d = '';
    if (c.dateString) d = String(c.dateString).split('T')[0].split(' ')[0];
    else if (c.date) {
      const raw = typeof c.date === 'string' ? c.date : new Date(c.date).toISOString();
      d = raw.split('T')[0].split(' ')[0];
    }
    return `${String(c.id)}|${d}`;
  };
  for (const newItem of appendItems) {
    const pt = newItem.productType;
    const pid = String(newItem.productData?.id ?? '');
    const idx = items.findIndex(
      (it: any) => it.productType === pt && String(it.productData?.id ?? '') === pid
    );
    if (idx === -1) {
      items.push(JSON.parse(JSON.stringify(newItem)));
      continue;
    }
    const cur = items[idx];
    const curClasses = cur.enrolledClasses || [];
    const addClasses = newItem.enrolledClasses || [];
    const seen = new Set(curClasses.map(classKey));
    for (const c of addClasses) {
      const k = classKey(c);
      if (!seen.has(k)) {
        curClasses.push(JSON.parse(JSON.stringify(c)));
        seen.add(k);
      }
    }
    cur.enrolledClasses = curClasses;
    cur.price = (Number(cur.price) || 0) + (Number(newItem.price) || 0);
  }
  return items;
}

function roundMoney(n: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

/** Recorded payments on this order; legacy paid orders without the field = previously fully paid at totalAmount. */
function effectiveAmountPaid(order: any): number {
  if (order.amountPaid != null && Number.isFinite(Number(order.amountPaid))) {
    return roundMoney(Number(order.amountPaid));
  }
  if (order.status === 'paid') return roundMoney(Number(order.totalAmount) || 0);
  return 0;
}

/**
 * Split remaining balance due across order lines that have enrollments so per-lesson tier matches
 * (e.g. $1,800 left on 8 lessons → $225/lesson) for validateLessonQuotaForItems / applyLessonQuotaDeduction.
 */
function buildSyntheticQuotaItemsForBalance(order: any, balanceDue: number): any[] {
  const due = roundMoney(Number(balanceDue) || 0);
  if (due <= 0.005) return [];
  const items = order.items || [];
  const withClasses = items.filter(
    (it: any) => Array.isArray(it.enrolledClasses) && it.enrolledClasses.length > 0
  );
  quotaPayLog('buildSyntheticQuotaItemsForBalance: input', {
    balanceDue: due,
    orderLineCount: items.length,
    linesWithClasses: withClasses.length
  });
  if (withClasses.length === 0) return [];
  const subtotals = withClasses.map((it: any) => roundMoney(Number(it.price) || 0));
  const sumSub = roundMoney(subtotals.reduce((a: number, b: number) => a + b, 0));
  let allocated = 0;
  const out: any[] = [];
  for (let i = 0; i < withClasses.length; i++) {
    const it = withClasses[i];
    let lineDue: number;
    if (i === withClasses.length - 1) {
      lineDue = roundMoney(due - allocated);
    } else if (sumSub > 0.005) {
      lineDue = roundMoney((due * subtotals[i]) / sumSub);
    } else {
      lineDue = roundMoney(due / withClasses.length);
    }
    allocated = roundMoney(allocated + lineDue);
    if (lineDue > 0.005) {
      out.push({
        ...JSON.parse(JSON.stringify(it)),
        price: lineDue
      });
    }
  }
  quotaPayLog('buildSyntheticQuotaItemsForBalance: result', {
    balanceDue: due,
    inputLinesWithClasses: withClasses.length,
    syntheticLines: out.length,
    lines: out.map((x: any) => ({
      price: x.price,
      lessons: Array.isArray(x.enrolledClasses) ? x.enrolledClasses.length : 0,
      unitCents:
        Array.isArray(x.enrolledClasses) && x.enrolledClasses.length > 0
          ? Math.round(((Number(x.price) || 0) * 100) / x.enrolledClasses.length)
          : null
    }))
  });
  return out;
}

function validateLessonQuotaForItems(student: any, items: any[]): string | null {
  if (!student) {
    quotaPayLog('validateLessonQuotaForItems: FAIL no student record (readData)');
    return 'Student not found';
  }
  const q =
    student.lessonQuotaByCents && typeof student.lessonQuotaByCents === 'object'
      ? student.lessonQuotaByCents
      : {};
  const quotaKeysSnapshot = Object.keys(q).filter((k) => Number((q as any)[k]) > 0);
  const quotaBalances: Record<string, number> = {};
  for (const k of quotaKeysSnapshot) {
    quotaBalances[k] = Number((q as any)[k]) || 0;
  }
  quotaPayLog('validateLessonQuotaForItems: start', {
    itemCount: Array.isArray(items) ? items.length : 0,
    studentId: String(student.id ?? ''),
    quotaTiersWithBalance: quotaBalances
  });
  quotaPayVerbose('validateLessonQuotaForItems: raw items', {
    items: (items || []).map((it: any, i: number) => ({
      i,
      price: it?.price,
      classCount: Array.isArray(it?.enrolledClasses) ? it.enrolledClasses.length : 0
    }))
  });

  let linesWithClasses = 0;
  for (let i = 0; i < (items || []).length; i++) {
    const item = items[i];
    const classes = item.enrolledClasses;
    if (!Array.isArray(classes) || classes.length === 0) {
      quotaPayVerbose('validate: skip line (no enrolledClasses)', {
        lineIndex: i,
        price: item?.price
      });
      continue;
    }
    linesWithClasses += 1;
    const n = classes.length;
    const unitCents = Math.round(((Number(item.price) || 0) * 100) / n);
    if (!Number.isFinite(unitCents) || unitCents <= 0) {
      quotaPayLog('validate: FAIL invalid per-lesson tier', { lineIndex: i, price: item.price, n, unitCents });
      return 'Invalid line price for lesson quota (per-lesson amount must be positive)';
    }
    const key = String(unitCents);
    const have = Number((q as any)[key]) || 0;
    quotaPayLog('validate: line tier check', {
      lineIndex: i,
      n,
      linePrice: Number(item.price) || 0,
      unitCents,
      tierKey: key,
      tierDollarsPerLesson: (unitCents / 100).toFixed(2),
      quotaLessonsAvailable: have,
      ok: have >= n
    });
    if (have < n) {
      return `Insufficient lesson quota at $${(unitCents / 100).toFixed(2)}/lesson (need ${n}, have ${have})`;
    }
  }
  if (Array.isArray(items) && items.length > 0 && linesWithClasses === 0) {
    quotaPayLog('validate: FAIL no line had enrolledClasses (cannot infer per-lesson tier)');
    return 'Lesson quota payment requires class dates on order lines (no enrolledClasses found)';
  }
  quotaPayLog('validateLessonQuotaForItems: OK', { linesChecked: linesWithClasses });
  return null;
}

function applyLessonQuotaDeduction(student: any, items: any[]): void {
  if (!student) return;
  if (!student.lessonQuotaByCents || typeof student.lessonQuotaByCents !== 'object') {
    student.lessonQuotaByCents = {};
  }
  const q = student.lessonQuotaByCents;
  for (const item of items) {
    const classes = item.enrolledClasses;
    if (!Array.isArray(classes) || classes.length === 0) continue;
    const n = classes.length;
    const unitCents = Math.round(((Number(item.price) || 0) * 100) / n);
    const key = String(unitCents);
    const have = Number(q[key]) || 0;
    q[key] = Math.max(0, have - n);
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
    const billingEnforcement = billingAccessFlags.isBillingEnforcementEnabled();
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
        billingEnforcement,
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
          billingDisabled: true,
          billingEnforcement
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

  /** Link timetable enrollments to a sales order when orderId was missing (e.g. slot already existed). Works for paid or unpaid orders. */
  function syncEnrollmentsOrderIdFromOrder(order: any, enrollments: any[], timetableData: any): number {
    if (!order || !order.id || !order.items || !Array.isArray(order.items)) return 0;
    const studentId = order.studentId;
    const orderId = order.id;
    let updated = 0;
    for (const item of order.items) {
      if (!item.enrolledClasses || !Array.isArray(item.enrolledClasses)) continue;
      for (const cls of item.enrolledClasses) {
        let entryId = cls.id;
        let entry = timetableData.entries.find((e: any) => e.id === entryId);
        if (!entry && typeof cls.id === 'string' && cls.id.includes('_')) {
          const lastUnderscoreIndex = cls.id.lastIndexOf('_');
          if (lastUnderscoreIndex > -1) {
            const potentialId = cls.id.substring(0, lastUnderscoreIndex);
            const potentialEntry = timetableData.entries.find((e: any) => e.id === potentialId);
            if (potentialEntry) {
              entry = potentialEntry;
              entryId = potentialId;
            }
          }
        }
        if (!entry) continue;
        let dateStr: string;
        if (cls.dateString) dateStr = String(cls.dateString).split('T')[0].split(' ')[0];
        else dateStr = new Date(cls.date).toISOString().split('T')[0];
        const ex = enrollments.find(
          (e: any) =>
            String(e.studentId) === String(studentId) &&
            e.timetableEntryId === entry.id &&
            String(e.date).split('T')[0].split(' ')[0] === dateStr
        );
        if (ex && (!ex.orderId || String(ex.orderId).trim() === '')) {
          ex.orderId = orderId;
          updated++;
        }
      }
    }
    if (updated > 0) {
      quotaPayLog('syncEnrollmentsOrderIdFromOrder: linked', { orderId: String(orderId), updated });
    }
    return updated;
  }

  function pushEnrollmentsFromItems(
    orderId: string,
    studentId: string,
    items: any[],
    enrollments: any[],
    timetableData: any,
    organizationId: string
  ): void {
    for (const item of items) {
      if (!item.enrolledClasses || !Array.isArray(item.enrolledClasses)) continue;
      for (const cls of item.enrolledClasses) {
        let entryId = cls.id;
        let entry = timetableData.entries.find((e: any) => e.id === entryId);
        if (!entry && typeof cls.id === 'string' && cls.id.includes('_')) {
          const lastUnderscoreIndex = cls.id.lastIndexOf('_');
          if (lastUnderscoreIndex > -1) {
            const potentialId = cls.id.substring(0, lastUnderscoreIndex);
            const potentialEntry = timetableData.entries.find((e: any) => e.id === potentialId);
            if (potentialEntry) {
              entry = potentialEntry;
              entryId = potentialId;
            }
          }
        }

        console.log(`[DEBUG] Processing Item Class ID: ${cls.id}, Resolved EntryID: ${entryId}, Entry Found: ${!!entry}`);

        if (entry) {
          console.log(`[DEBUG] Entry Found: ${entry.className}, isRecurring: ${entry.isRecurring}`);
          let dateStr: string;
          if (cls.dateString) {
            dateStr = cls.dateString;
          } else {
            dateStr = new Date(cls.date).toISOString().split('T')[0];
          }
          console.log(`[DEBUG] Processing enrollment for date ${dateStr}`);
          const exists = enrollments.find(
            (e: any) =>
              e.studentId === studentId && e.timetableEntryId === entry.id && e.date === dateStr
          );
          if (!exists) {
            console.log(`[DEBUG] Adding new enrollment for entry ${entry.id} on ${dateStr}`);
            enrollments.push({
              id: `enr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              organizationId,
              studentId,
              timetableEntryId: entry.id,
              date: dateStr,
              type: 'single',
              orderId
            });
          } else {
            console.log(`[DEBUG] Enrollment already exists for entry ${entry.id} on ${dateStr}`);
            if (orderId && (!exists.orderId || String(exists.orderId).trim() === '')) {
              exists.orderId = orderId;
              quotaPayLog('pushEnrollments: backfilled orderId on existing enrollment', {
                enrollmentId: exists.id,
                orderId: String(orderId)
              });
            }
          }
        } else {
          console.log(`[DEBUG] Timetable Entry NOT FOUND for ID: ${entryId} (Original: ${cls.id})`);
        }
      }
    }
  }

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

  // Drop Enrollment / Refund
  app.post('/api/organizations/enrollments/drop', authenticateUser, authorizeRole('organization'), async (req, res) => {
    let debugDropAll: Record<string, unknown> | undefined;
    try {
      const { studentId, mode, enrollmentId, timetableEntryId, date, courseId } = req.body;

      console.log('[enrollments/drop] raw body', JSON.stringify(req.body));
      console.log(
        `[enrollments/drop] parsed studentId=${studentId} (${typeof studentId}) mode=${mode} timetableEntryId=${timetableEntryId} (${typeof timetableEntryId}) date=${JSON.stringify(date)} fromDate=${JSON.stringify(req.body.fromDate)}`
      );
      await appendEnrollmentDropLog(
        `REQUEST mode=${mode} studentId=${studentId} timetableEntryId=${timetableEntryId} date=${JSON.stringify(date)} fromDate=${JSON.stringify(req.body.fromDate)} bodyKeys=${Object.keys(req.body || {}).join(',')}`
      );

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

      /** Per-lesson $ from original paid order line (same logic as former cash refund). */
      const findPaidLessonUnitPrice = (enrollment: any): number => {
        if (!enrollment.orderId) return 0;
        const order = orders.find((o: any) => o.id === enrollment.orderId);
        if (!order || order.status !== 'paid') return 0;
        for (const item of order.items || []) {
          if (!item.enrolledClasses || !Array.isArray(item.enrolledClasses)) continue;
          const match = item.enrolledClasses.some((cls: any) => {
            let clsDate: string;
            if (cls.dateString) clsDate = cls.dateString;
            else clsDate = new Date(cls.date).toISOString().split('T')[0];
            if (clsDate !== enrollment.date) return false;
            if (cls.id === enrollment.timetableEntryId) return true;
            if (typeof cls.id === 'string' && cls.id.startsWith(enrollment.timetableEntryId + '_')) return true;
            if (enrollment.timetableEntryId.startsWith(cls.id + '_')) return true;
            return typeof cls.id === 'string' && cls.id.includes(enrollment.timetableEntryId);
          });
          if (match) {
            const count = item.enrolledClasses.length || 1;
            return (Number(item.price) || 0) / count;
          }
        }
        return 0;
      };

      const lessonQuotaDelta: Record<string, number> = {};
      const creditLessonQuota = (enrollment: any) => {
        const unit = findPaidLessonUnitPrice(enrollment);
        if (unit <= 0) return;
        const cents = Math.round(Number(unit) * 100);
        if (!Number.isFinite(cents) || cents <= 0) return;
        const k = String(cents);
        const st = students[studentIndex];
        if (!st.lessonQuotaByCents) st.lessonQuotaByCents = {};
        st.lessonQuotaByCents[k] = (Number(st.lessonQuotaByCents[k]) || 0) + 1;
        lessonQuotaDelta[k] = (lessonQuotaDelta[k] || 0) + 1;
      };

      let droppedCount = 0;
      const droppedForOrderSync: { date: string; timetableEntryId: string }[] = [];

      if (mode === 'single') {
        let targetIndex = -1;
        if (enrollmentId) {
          targetIndex = enrollments.findIndex(e => e.id === enrollmentId);
        } else if (timetableEntryId && date) {
          targetIndex = enrollments.findIndex(
            (e) =>
              String(e.studentId) === String(studentId) &&
              String(e.timetableEntryId) === String(timetableEntryId) &&
              e.date === date
          );
        }

        if (targetIndex !== -1) {
          const enrollment = enrollments[targetIndex];
          creditLessonQuota(enrollment);
          droppedForOrderSync.push({ date: enrollment.date, timetableEntryId: enrollment.timetableEntryId });
          enrollments.splice(targetIndex, 1);
          droppedCount++;
        }
      } else if (mode === 'all') {
        if (!timetableEntryId) return res.status(400).json({ error: 'Timetable Entry ID required for Drop All' });

        const sid = String(studentId);
        const tid = String(timetableEntryId);

        // Drop from this calendar day onward (inclusive). date OR fromDate must be valid YYYY-MM-DD (no silent fallback).
        const rawCutoff =
          typeof date === 'string' && date.trim()
            ? date.trim()
            : typeof req.body.fromDate === 'string' && req.body.fromDate.trim()
              ? req.body.fromDate.trim()
              : typeof req.body.cutoffDate === 'string' && req.body.cutoffDate.trim()
                ? req.body.cutoffDate.trim()
                : '';
        const cutoffFromBody = toComparableYmd(rawCutoff);
        if (!cutoffFromBody) {
          const msg = `mode=all requires date (YYYY-MM-DD). Got date=${JSON.stringify(date)} fromDate=${JSON.stringify(req.body.fromDate)} rawCutoff=${JSON.stringify(rawCutoff)}`;
          console.error('[enrollments/drop]', msg);
          await appendEnrollmentDropLog(`REJECT ${msg}`);
          return res.status(400).json({
            error: 'Missing or invalid cutoff date for Drop All Future',
            hint: 'Send date or fromDate as YYYY-MM-DD (the selected day on the calendar).',
            received: { date, fromDate: req.body.fromDate, cutoffDate: req.body.cutoffDate }
          });
        }
        const cutoffYmd = cutoffFromBody;

        const seriesBefore = enrollments.filter(
          (e: any) => String(e.studentId) === sid && String(e.timetableEntryId) === tid
        );
        console.log(
          `[enrollments/drop] mode=all cutoffYmd=${cutoffYmd} sid=${sid} tid=${tid} seriesCount=${seriesBefore.length}`
        );
        console.log(
          `[enrollments/drop] series ymd list`,
          seriesBefore.map((e: any) => ({ id: e.id, raw: e.date, ymd: toComparableYmd(e.date) }))
        );

        const newEnrollments = [];

        for (const e of enrollments) {
          const eYmd = toComparableYmd(e.date);
          const sameStudent = String(e.studentId) === sid;
          const sameSeries = String(e.timetableEntryId) === tid;
          const shouldDrop = eYmd != null && eYmd >= cutoffYmd && sameStudent && sameSeries;
          if (sameStudent && sameSeries && eYmd == null) {
            console.warn(`[enrollments/drop] could not parse enrollment.date, keeping row:`, e.id, e.date);
          }
          if (shouldDrop) {
            console.log(`[enrollments/drop] DROP row`, { id: e.id, rawDate: e.date, eYmd, cutoffYmd });
            creditLessonQuota(e);
            droppedForOrderSync.push({ date: e.date, timetableEntryId: e.timetableEntryId });
            droppedCount++;
          } else {
            newEnrollments.push(e);
          }
        }
        enrollments = newEnrollments;

        const keptSeries = enrollments.filter(
          (e: any) => String(e.studentId) === sid && String(e.timetableEntryId) === tid
        );
        debugDropAll = {
          cutoffYmd,
          studentId: sid,
          timetableEntryId: tid,
          seriesCountBefore: seriesBefore.length,
          seriesCountAfter: keptSeries.length,
          droppedDates: droppedForOrderSync.map((d) => d.date),
          keptDates: keptSeries.map((e: any) => toComparableYmd(e.date)).filter(Boolean)
        };
        console.log('[enrollments/drop] mode=all result', debugDropAll);
        await appendEnrollmentDropLog(`OK ${JSON.stringify(debugDropAll)}`);
      }

      // Paid drops → lesson quota by unit price tier (cents key), not cash balance
      if (Object.keys(lessonQuotaDelta).length > 0) {
        await writeData(data);
      }

      await writeEnrollments(enrollments);

      const orgIdForOrders = resolveOrgIdFromUser(req.user);
      if (orgIdForOrders && droppedForOrderSync.length > 0) {
        pruneUnpaidOrdersAfterEnrollmentDrops(orders, orgIdForOrders, String(studentId), droppedForOrderSync);
        await writeOrders(orders);
      }

      res.json({
        success: true,
        droppedCount,
        refundAmount: 0,
        newBalance: students[studentIndex].balance || 0,
        lessonQuotaDelta,
        lessonQuotaByCents: students[studentIndex].lessonQuotaByCents || {},
        ...(debugDropAll ? { dropAll: debugDropAll } : {})
      });
    } catch (error) {
      console.error('Error dropping enrollment:', error);
      res.status(500).json({ error: 'Failed to drop enrollment' });
    }
  });
}

module.exports = { registerOrganizationsBillingRoutes };


