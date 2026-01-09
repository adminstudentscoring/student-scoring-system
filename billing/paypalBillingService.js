// PayPal billing helpers extracted from server.js
// Keeps behavior identical while allowing server.js to stay small.
"use strict";

function createPayPalBillingHelpers(deps) {
  const billingDb = deps && deps.billingDb;
  const paypal = deps && deps.paypal;
  const readSubscriptionPrices = deps && deps.readSubscriptionPrices;

  if (!billingDb) throw new Error("createPayPalBillingHelpers: missing deps.billingDb");
  if (!paypal) throw new Error("createPayPalBillingHelpers: missing deps.paypal");
  if (typeof readSubscriptionPrices !== "function") {
    throw new Error("createPayPalBillingHelpers: missing deps.readSubscriptionPrices");
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + Number(days || 0));
    return d;
  }

  function computeEntitlementStatus(now, end, graceUntil) {
    const t = now.getTime();
    const endMs = end ? new Date(end).getTime() : 0;
    const graceMs = graceUntil ? new Date(graceUntil).getTime() : 0;
    if (!endMs) return "inactive";
    if (t <= endMs) return "active";
    if (graceMs && t <= graceMs) return "grace";
    return "expired";
  }

  async function ensurePayPalProductId() {
    const key = `paypal_product_id_${paypal.PAYPAL_ENV}`;
    const existing = await billingDb.getMeta(key);
    if (existing) return existing;
    const productName = process.env.PAYPAL_PRODUCT_NAME || "StudentScoring Subscription";
    const productId = await paypal.createProductIfNeeded(productName);
    await billingDb.setMeta(key, productId);
    return productId;
  }

  function planMatchesPayPalPlan(plan, expected) {
    return paypal.planMatches(plan, expected);
  }

  async function ensurePayPalPlanForPrice(price) {
    const productId = price.paypalProductId || (await ensurePayPalProductId());
    const billingType = String(price.billingType || "monthly");
    const currency = String(price.currency || "HKD").toUpperCase();
    const amount = Number(price.amount || 0);
    const planName = `${price.name} ${billingType.toUpperCase()} ${currency}`;

    const expected = {
      interval_unit: billingType === "yearly" ? "YEAR" : "MONTH",
      currency,
      amount: Number(amount.toFixed(2))
    };

    // If existing plan matches, reuse.
    if (price.paypalPlanId) {
      const existingPlan = await paypal.getPlan(price.paypalPlanId);
      if (existingPlan && planMatchesPayPalPlan(existingPlan, expected)) {
        return { paypalProductId: productId, paypalPlanId: price.paypalPlanId, reused: true };
      }
    }

    const planSpec = paypal.toPayPalPlanSpec({
      productId,
      name: planName,
      billingType,
      currency,
      amount
    });
    const newPlanId = await paypal.createPlan(planSpec);
    return { paypalProductId: productId, paypalPlanId: newPlanId, reused: false };
  }

  async function upsertBillingSubscriptionFromPayPal({
    orgId,
    priceId,
    paypalSubscriptionId,
    paypalPlanId,
    status,
    billingType,
    currency,
    currentPeriodEnd
  }) {
    const graceUntil = currentPeriodEnd ? addDays(currentPeriodEnd, 7).toISOString() : null;
    await billingDb.query(
      `
      INSERT INTO billing_subscriptions(org_id, price_id, paypal_subscription_id, paypal_plan_id, status, currency, billing_type, current_period_end, grace_until, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
      ON CONFLICT (paypal_subscription_id) DO UPDATE SET
        org_id=EXCLUDED.org_id,
        price_id=COALESCE(EXCLUDED.price_id, billing_subscriptions.price_id),
        paypal_plan_id=COALESCE(EXCLUDED.paypal_plan_id, billing_subscriptions.paypal_plan_id),
        status=EXCLUDED.status,
        currency=COALESCE(EXCLUDED.currency, billing_subscriptions.currency),
        billing_type=COALESCE(EXCLUDED.billing_type, billing_subscriptions.billing_type),
        current_period_end=EXCLUDED.current_period_end,
        grace_until=EXCLUDED.grace_until,
        updated_at=NOW()
    `,
      [
        orgId,
        priceId || null,
        paypalSubscriptionId,
        paypalPlanId || null,
        status || null,
        currency || null,
        billingType || null,
        currentPeriodEnd || null,
        graceUntil
      ]
    );
  }

  async function upsertEntitlementFromPrice({ orgId, price, currentPeriodEnd }) {
    const graceUntil = currentPeriodEnd ? addDays(currentPeriodEnd, 7).toISOString() : null;
    const now = new Date();
    const status = computeEntitlementStatus(now, currentPeriodEnd, graceUntil);
    const limits = price?.limits || {};
    const teacherSeats = Number(limits.teacherSeats || 0);
    const studentSeats = Number(limits.studentSeats || 0);
    const features = price?.features || {};

    await billingDb.query(
      `
      INSERT INTO billing_entitlements(org_id, status, teacher_seats, student_seats, features, current_period_end, grace_until, updated_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,NOW())
      ON CONFLICT (org_id) DO UPDATE SET
        status=EXCLUDED.status,
        teacher_seats=EXCLUDED.teacher_seats,
        student_seats=EXCLUDED.student_seats,
        features=EXCLUDED.features,
        current_period_end=EXCLUDED.current_period_end,
        grace_until=EXCLUDED.grace_until,
        updated_at=NOW()
    `,
      [
        orgId,
        status,
        teacherSeats,
        studentSeats,
        JSON.stringify(features),
        currentPeriodEnd || null,
        graceUntil
      ]
    );
  }

  async function refreshSubscriptionAndEntitlement(subscriptionId) {
    // Load existing row as fallback (important for cancelled subscriptions where next_billing_time may be missing).
    const existingRowRes = await billingDb.query(
      "SELECT * FROM billing_subscriptions WHERE paypal_subscription_id=$1 LIMIT 1",
      [subscriptionId]
    );
    const existingRow = existingRowRes.rows[0] || null;

    const details = await paypal.getSubscription(subscriptionId);
    const orgId = String(details.custom_id || existingRow?.org_id || "");
    const planId = details.plan_id || details.plan?.id || null;
    const status = details.status || null;

    let currentPeriodEnd = null;
    if (details?.billing_info?.next_billing_time) {
      currentPeriodEnd = new Date(details.billing_info.next_billing_time).toISOString();
    } else if (existingRow?.current_period_end) {
      currentPeriodEnd = new Date(existingRow.current_period_end).toISOString();
    } else {
      // If PayPal does not provide a next billing time for terminal states,
      // treat it as ended "now" so our grace logic can kick in.
      const s = String(status || "").toUpperCase();
      if (["CANCELLED", "SUSPENDED", "EXPIRED"].includes(s)) {
        currentPeriodEnd = new Date().toISOString();
      }
    }

    // Map plan_id back to our price
    const prices = await readSubscriptionPrices();
    const matchedPrice =
      prices.find((p) => String(p.paypalPlanId || "") === String(planId || "")) || null;
    const priceId = matchedPrice?.id || null;

    await upsertBillingSubscriptionFromPayPal({
      orgId,
      priceId,
      paypalSubscriptionId: subscriptionId,
      paypalPlanId: planId,
      status,
      billingType: matchedPrice?.billingType || null,
      currency: matchedPrice?.currency || null,
      currentPeriodEnd
    });

    if (orgId && matchedPrice && currentPeriodEnd) {
      await upsertEntitlementFromPrice({ orgId, price: matchedPrice, currentPeriodEnd });
    }

    return { orgId, priceId, status, currentPeriodEnd };
  }

  return {
    computeEntitlementStatus,
    ensurePayPalPlanForPrice,
    upsertBillingSubscriptionFromPayPal,
    refreshSubscriptionAndEntitlement
  };
}

module.exports = { createPayPalBillingHelpers };


