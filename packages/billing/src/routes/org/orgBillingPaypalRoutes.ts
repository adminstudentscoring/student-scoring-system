// Organization billing + finance routes extracted from server.js to keep the entry file manageable.
// All route behavior should remain identical.

const billingAccessFlags = require('../../access');

function registerOrgBillingPaypalRoutes(app: any, deps: any): void {
  const {
    authenticateUser,
    authorizeRole,
    resolveOrgIdFromUser,
    readSubscriptionPrices,
    writeSubscriptionPrices,
    ensurePayPalPlanForPrice,
    upsertBillingSubscriptionFromPayPal,
    refreshSubscriptionAndEntitlement,
    computeEntitlementStatus,
    billingDb,
    paypal
  } = deps;

  function billingPayPalUnavailable(res: any) {
    return res.status(503).json({ error: 'PayPal billing is not configured on this server' });
  }

  function billingEnforcementOff(res: any) {
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
}

module.exports = { registerOrgBillingPaypalRoutes };
export {};
