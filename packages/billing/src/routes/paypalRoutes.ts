// PayPal routes extracted from server.js (webhook + admin tooling)
"use strict";

import { Request, Response, NextFunction } from 'express';

function registerPayPalRoutes(app: any, deps: any): void {
  const authenticateUser = deps && deps.authenticateUser;
  const authorizeRole = deps && deps.authorizeRole;
  const readSubscriptionPrices = deps && deps.readSubscriptionPrices;
  const writeSubscriptionPrices = deps && deps.writeSubscriptionPrices;
  const ensurePayPalPlanForPrice = deps && deps.ensurePayPalPlanForPrice;
  const paypal = deps && deps.paypal;
  const billingDb = deps && deps.billingDb;
  const refreshSubscriptionAndEntitlement = deps && deps.refreshSubscriptionAndEntitlement;

  if (!app) throw new Error("registerPayPalRoutes: missing app");
  if (typeof authenticateUser !== "function") throw new Error("registerPayPalRoutes: missing deps.authenticateUser");
  if (typeof authorizeRole !== "function") throw new Error("registerPayPalRoutes: missing deps.authorizeRole");
  if (typeof readSubscriptionPrices !== "function") throw new Error("registerPayPalRoutes: missing deps.readSubscriptionPrices");
  if (typeof writeSubscriptionPrices !== "function") throw new Error("registerPayPalRoutes: missing deps.writeSubscriptionPrices");
  if (typeof ensurePayPalPlanForPrice !== "function") throw new Error("registerPayPalRoutes: missing deps.ensurePayPalPlanForPrice");
  if (!paypal) throw new Error("registerPayPalRoutes: missing deps.paypal");
  if (!billingDb) throw new Error("registerPayPalRoutes: missing deps.billingDb");
  if (typeof refreshSubscriptionAndEntitlement !== "function") throw new Error("registerPayPalRoutes: missing deps.refreshSubscriptionAndEntitlement");

  // ============================
  // Billing (PayPal subscriptions)
  // ============================

  // Admin: sync active+live prices to PayPal (auto-create Product/Plans, store paypalPlanId back into price records)
  app.post('/api/admin/billing/paypal/sync-prices', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      if (!paypal.PAYPAL_CONFIGURED) {
        return res.status(503).json({ error: 'PayPal billing is not configured on this server' });
      }
      const prices = await readSubscriptionPrices();
      const activeLive = prices.filter(p => String(p.status) === 'active' && String(p.publishState) === 'live');
      const updates = [];
      for (const price of activeLive) {
        const { paypalProductId, paypalPlanId, reused } = await ensurePayPalPlanForPrice(price);
        updates.push({ id: price.id, code: price.code, paypalPlanId, reused });
        price.paypalProductId = paypalProductId;
        price.paypalPlanId = paypalPlanId;
      }
      await writeSubscriptionPrices(prices);
      res.json({ ok: true, updated: updates.length, updates });
    } catch (error) {
      console.error('PayPal sync-prices error:', error);
      res.status(500).json({ error: error.message || 'Failed to sync prices' });
    }
  });

  // PayPal webhook (Sandbox/Live) - signature verification + store event + refresh subscription + update entitlement
  app.post('/api/webhooks/paypal', async (req, res) => {
    try {
      if (!paypal.PAYPAL_CONFIGURED) {
        // 200 avoids PayPal retry storms when billing env was never provisioned for this deployment.
        return res.status(200).json({ ok: false, error: 'paypal_not_configured' });
      }
      const eventBody = req.body;
      const verify = await paypal.verifyWebhookSignature({ req, eventBody });
      if (!verify.ok) {
        console.warn('PayPal webhook signature failed:', verify.reason);
        return res.status(400).json({ ok: false });
      }

      const eventId = String(eventBody?.id || '');
      if (!eventId) {
        return res.status(400).json({ ok: false, error: 'Missing event id' });
      }

      // Idempotency: ignore duplicates
      await billingDb.query(
        `
        INSERT INTO billing_webhook_events(paypal_event_id, event_type, resource_type, resource_id, raw)
        VALUES ($1,$2,$3,$4,$5::jsonb)
        ON CONFLICT (paypal_event_id) DO NOTHING
      `,
        [
          eventId,
          eventBody?.event_type || null,
          eventBody?.resource_type || null,
          eventBody?.resource?.id || null,
          JSON.stringify(eventBody)
        ]
      );

      // Try to refresh subscription state when we can extract subscription id
      const type = String(eventBody?.event_type || '');
      let subscriptionId = null;
      if (type.startsWith('BILLING.SUBSCRIPTION.')) {
        subscriptionId = eventBody?.resource?.id || null;
      } else if (eventBody?.resource?.billing_agreement_id) {
        subscriptionId = eventBody.resource.billing_agreement_id;
      }

      if (subscriptionId) {
        await refreshSubscriptionAndEntitlement(String(subscriptionId));
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('PayPal webhook error:', error);
      res.status(500).json({ ok: false });
    }
  });
}

module.exports = { registerPayPalRoutes };


