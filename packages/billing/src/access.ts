const billingDb = require('./db');

function addDays(date: any, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function computeEntitlementStatus(now: Date, end: any, graceUntil: any): string {
  const t = now.getTime();
  const endMs = end ? new Date(end).getTime() : 0;
  const graceMs = graceUntil ? new Date(graceUntil).getTime() : 0;
  if (!endMs) return 'inactive';
  if (t <= endMs) return 'active';
  if (graceMs && t <= graceMs) return 'grace';
  return 'expired';
}

async function ensureTrialForOrg(orgId: string, days = 14): Promise<any> {
  if (!orgId) return null;
  const start = new Date();
  const end = addDays(start, days);
  await billingDb.query(
    `
    INSERT INTO billing_trials(org_id, trial_start, trial_end)
    VALUES ($1, $2, $3)
    ON CONFLICT (org_id) DO NOTHING
  `,
    [String(orgId), start.toISOString(), end.toISOString()]
  );
  return { trialStart: start.toISOString(), trialEnd: end.toISOString() };
}

async function getTrial(orgId: string): Promise<any> {
  if (!orgId) return null;
  const res = await billingDb.query('SELECT * FROM billing_trials WHERE org_id=$1', [String(orgId)]);
  return res.rows[0] || null;
}

async function getEntitlement(orgId: string): Promise<any> {
  if (!orgId) return null;
  const res = await billingDb.query('SELECT * FROM billing_entitlements WHERE org_id=$1', [String(orgId)]);
  return res.rows[0] || null;
}

async function getOrgAccessSnapshot(orgId: string): Promise<any> {
  const now = new Date();
  const entitlement = await getEntitlement(orgId);
  const entitlementStatus = entitlement
    ? computeEntitlementStatus(now, entitlement.current_period_end, entitlement.grace_until)
    : 'inactive';

  const trialRow = await getTrial(orgId);
  const trialEnd = trialRow?.trial_end ? new Date(trialRow.trial_end) : null;
  const trialStart = trialRow?.trial_start ? new Date(trialRow.trial_start) : null;
  const trialActive = !!trialEnd && now.getTime() <= trialEnd.getTime();

  const hasPaidAccess = entitlementStatus === 'active' || entitlementStatus === 'grace';
  const hasTrialAccess = !hasPaidAccess && trialActive;

  return {
    orgId: String(orgId),
    now: now.toISOString(),
    entitlementStatus,
    entitlement,
    trial: trialRow
      ? {
          trialStart: trialStart ? trialStart.toISOString() : null,
          trialEnd: trialEnd ? trialEnd.toISOString() : null,
          active: trialActive
        }
      : null,
    allowAll: hasPaidAccess || hasTrialAccess,
    reason: hasPaidAccess ? 'subscription' : hasTrialAccess ? 'trial' : 'no_access'
  };
}

function isBillingAllowedPath(path: string): boolean {
  const p = String(path || '');
  return p.startsWith('/api/organizations/billing/');
}

/** When false, org/teacher routes skip trial/subscription gates; SaaS PayPal subscription APIs return disabled. Course sales (orders) are unchanged. */
function isBillingEnforcementEnabled(): boolean {
  const v = String(process.env.BILLING_ENFORCEMENT ?? '1').trim().toLowerCase();
  return !['0', 'false', 'off', 'disabled', 'no'].includes(v);
}

module.exports = {
  ensureTrialForOrg,
  getTrial,
  getOrgAccessSnapshot,
  isBillingAllowedPath,
  isBillingEnforcementEnabled
};


