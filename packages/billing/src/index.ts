// @student-scoring/billing barrel exports

// Database
export { query, ensureBillingSchema, getMeta, setMeta } from './db';

// Access control
export { ensureTrialForOrg, getTrial, getOrgAccessSnapshot, isBillingAllowedPath } from './access';

// PayPal
export { PAYPAL_ENV, PAYPAL_BASE, APP_BASE_URL, WEBHOOK_ID, getAccessToken, paypalRequest, createProductIfNeeded, toPayPalPlanSpec, createPlan, getPlan, planMatches, createSubscription, getSubscription, cancelSubscription, verifyWebhookSignature } from './paypal';

// PayPal billing helpers
export { createPayPalBillingHelpers } from './paypalBillingService';

// Routes
export { registerPayPalRoutes } from './routes/paypalRoutes';
export { registerOrganizationsBillingRoutes } from './routes/organizationsBillingRoutes';
export { registerAdminSubscriptionRoutes } from './routes/adminSubscriptionRoutes';
