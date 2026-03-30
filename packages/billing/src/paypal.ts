const PAYPAL_ENV = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
const PAYPAL_BASE =
  PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

const APP_BASE_URL = String(process.env.APP_BASE_URL || 'https://www.studentscoring.com').replace(/\/+$/, '');

/** Non-empty trimmed env, or empty string if missing (do not throw at module load). */
function optionalEnv(name: string): string {
  const v = process.env[name];
  if (v == null) return '';
  return String(v).trim();
}

const CLIENT_ID = optionalEnv('PAYPAL_CLIENT_ID');
const CLIENT_SECRET = optionalEnv('PAYPAL_CLIENT_SECRET');
const WEBHOOK_ID = optionalEnv('PAYPAL_WEBHOOK_ID');

/** True when all three PayPal credentials are set; subscription API routes stay disabled until then. */
const PAYPAL_CONFIGURED = !!(CLIENT_ID && CLIENT_SECRET && WEBHOOK_ID);

if (!PAYPAL_CONFIGURED) {
  console.warn(
    '[billing] PayPal is not configured (set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID). ' +
      'The app will boot; PayPal subscription and webhook routes will return errors until configured.'
  );
}

let cachedToken: string | null = null;
let cachedTokenExpMs: number = 0;

async function getAccessToken(): Promise<string | null> {
  if (!PAYPAL_CONFIGURED) return null;

  const now = Date.now();
  if (cachedToken && now + 60_000 < cachedTokenExpMs) {
    return cachedToken;
  }

  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const resp = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`PayPal token error HTTP ${resp.status}: ${txt}`);
  }
  const data = await resp.json() as any;
  cachedToken = data.access_token;
  cachedTokenExpMs = now + (Number(data.expires_in) || 0) * 1000;
  return cachedToken;
}

async function paypalRequest(path: string, options: any = {}): Promise<Response> {
  if (!PAYPAL_CONFIGURED) {
    throw new Error(
      'PayPal is not configured (missing PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, and/or PAYPAL_WEBHOOK_ID)'
    );
  }
  const token = await getAccessToken();
  if (!token) {
    throw new Error('PayPal access token unavailable');
  }
  const resp = await fetch(`${PAYPAL_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  return resp;
}

async function createProductIfNeeded(productName: string): Promise<string> {
  // PayPal doesn't have a simple "get product by name" endpoint for us here.
  // We create once and store product_id in DB.
  const resp = await paypalRequest('/v1/catalogs/products', {
    method: 'POST',
    body: JSON.stringify({
      name: productName,
      type: 'SERVICE',
      category: 'SOFTWARE'
    })
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`PayPal create product failed HTTP ${resp.status}: ${txt}`);
  }
  const data = await resp.json() as any;
  return data.id;
}

function toPayPalPlanSpec({ productId, name, billingType, currency, amount }: any): any {
  const bt = String(billingType || 'monthly');
  const interval_unit = bt === 'yearly' ? 'YEAR' : 'MONTH';

  return {
    product_id: productId,
    name,
    status: 'ACTIVE',
    billing_cycles: [
      {
        frequency: { interval_unit, interval_count: 1 },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: {
          fixed_price: {
            value: String(Number(amount || 0).toFixed(2)),
            currency_code: String(currency || 'HKD').toUpperCase()
          }
        }
      }
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee_failure_action: 'CONTINUE',
      payment_failure_threshold: 3
    }
  };
}

async function createPlan(planSpec: any): Promise<string> {
  const resp = await paypalRequest('/v1/billing/plans', {
    method: 'POST',
    body: JSON.stringify(planSpec)
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`PayPal create plan failed HTTP ${resp.status}: ${txt}`);
  }
  const data = await resp.json() as any;
  return data.id;
}

async function getPlan(planId: string): Promise<any> {
  const resp = await paypalRequest(`/v1/billing/plans/${encodeURIComponent(planId)}`, { method: 'GET' });
  if (!resp.ok) return null;
  return resp.json();
}

function planMatches(plan: any, expected: any): boolean {
  try {
    const cycle = plan?.billing_cycles?.[0];
    const unit = cycle?.frequency?.interval_unit;
    const price = cycle?.pricing_scheme?.fixed_price;
    if (!unit || !price) return false;
    if (String(unit).toUpperCase() !== String(expected.interval_unit).toUpperCase()) return false;
    if (String(price.currency_code).toUpperCase() !== String(expected.currency).toUpperCase()) return false;
    const planValue = Number(price.value);
    const expectedValue = Number(expected.amount);
    if (!Number.isFinite(planValue) || !Number.isFinite(expectedValue)) return false;
    // Compare to cents
    return Math.round(planValue * 100) === Math.round(expectedValue * 100);
  } catch {
    return false;
  }
}

async function createSubscription({ planId, orgId, returnPath = '/organization.html', cancelPath = '/organization.html' }: any): Promise<any> {
  const resp = await paypalRequest('/v1/billing/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: planId,
      custom_id: String(orgId),
      application_context: {
        brand_name: 'StudentScoring',
        user_action: 'SUBSCRIBE_NOW',
        return_url: `${APP_BASE_URL}${returnPath}`,
        cancel_url: `${APP_BASE_URL}${cancelPath}`
      }
    })
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`PayPal create subscription failed HTTP ${resp.status}: ${txt}`);
  }
  const data = await resp.json() as any;
  const approval = Array.isArray(data.links) ? data.links.find((l: any) => l.rel === 'approve') : null;
  return { id: data.id, status: data.status, approvalUrl: approval?.href || null, raw: data };
}

async function getSubscription(subscriptionId: string): Promise<any> {
  const resp = await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'GET' });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`PayPal get subscription failed HTTP ${resp.status}: ${txt}`);
  }
  return resp.json();
}

async function cancelSubscription({ subscriptionId, reason = 'Customer requested cancellation' }: any): Promise<any> {
  const resp = await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  });

  // PayPal commonly returns 204 No Content on success.
  if (resp.status === 204) {
    return { ok: true };
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`PayPal cancel subscription failed HTTP ${resp.status}: ${txt}`);
  }
  // Some environments may return JSON, but we don't rely on it.
  return { ok: true };
}

function getWebhookHeaders(req: any): any {
  const lower: Record<string, any> = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    lower[String(k).toLowerCase()] = v;
  }
  return {
    transmissionId: lower['paypal-transmission-id'],
    transmissionTime: lower['paypal-transmission-time'],
    certUrl: lower['paypal-cert-url'],
    authAlgo: lower['paypal-auth-algo'],
    transmissionSig: lower['paypal-transmission-sig']
  };
}

async function verifyWebhookSignature({ req, eventBody }: any): Promise<any> {
  if (!PAYPAL_CONFIGURED) {
    return { ok: false, reason: 'PayPal not configured on server' };
  }

  const h = getWebhookHeaders(req);
  if (!h.transmissionId || !h.transmissionTime || !h.certUrl || !h.authAlgo || !h.transmissionSig) {
    return { ok: false, reason: 'Missing PayPal transmission headers' };
  }

  const resp = await paypalRequest('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: h.authAlgo,
      cert_url: h.certUrl,
      transmission_id: h.transmissionId,
      transmission_sig: h.transmissionSig,
      transmission_time: h.transmissionTime,
      webhook_id: WEBHOOK_ID,
      webhook_event: eventBody
    })
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    return { ok: false, reason: `Verify call failed HTTP ${resp.status}: ${txt}` };
  }
  const data = await resp.json() as any;
  return { ok: data.verification_status === 'SUCCESS', reason: data.verification_status };
}

module.exports = {
  PAYPAL_ENV,
  PAYPAL_BASE,
  APP_BASE_URL,
  WEBHOOK_ID,
  PAYPAL_CONFIGURED,
  getAccessToken,
  paypalRequest,
  createProductIfNeeded,
  toPayPalPlanSpec,
  createPlan,
  getPlan,
  planMatches,
  createSubscription,
  getSubscription,
  cancelSubscription,
  verifyWebhookSignature
};


