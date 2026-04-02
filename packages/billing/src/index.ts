// @student-scoring/billing barrel exports
const db = require('./db');
const access = require('./access');
const paypal = require('./paypal');
const paypalBillingService = require('./paypalBillingService');
const paypalRoutes = require('./routes/paypalRoutes');
const organizationsBillingRoutes = require('./routes/organizationsBillingRoutes');
const adminSubscriptionRoutes = require('./routes/adminSubscriptionRoutes');

// Database
export const query = db.query;
export const ensureBillingSchema = db.ensureBillingSchema;
export const getMeta = db.getMeta;
export const setMeta = db.setMeta;

// Access control
export const ensureTrialForOrg = access.ensureTrialForOrg;
export const getTrial = access.getTrial;
export const getOrgAccessSnapshot = access.getOrgAccessSnapshot;
export const isBillingAllowedPath = access.isBillingAllowedPath;
export const isBillingEnforcementEnabled = access.isBillingEnforcementEnabled;

// PayPal
export const PAYPAL_ENV = paypal.PAYPAL_ENV;
export const PAYPAL_BASE = paypal.PAYPAL_BASE;
export const APP_BASE_URL = paypal.APP_BASE_URL;
export const WEBHOOK_ID = paypal.WEBHOOK_ID;
export const PAYPAL_CONFIGURED = paypal.PAYPAL_CONFIGURED;
export const getAccessToken = paypal.getAccessToken;
export const paypalRequest = paypal.paypalRequest;
export const createProductIfNeeded = paypal.createProductIfNeeded;
export const toPayPalPlanSpec = paypal.toPayPalPlanSpec;
export const createPlan = paypal.createPlan;
export const getPlan = paypal.getPlan;
export const planMatches = paypal.planMatches;
export const createSubscription = paypal.createSubscription;
export const getSubscription = paypal.getSubscription;
export const cancelSubscription = paypal.cancelSubscription;
export const verifyWebhookSignature = paypal.verifyWebhookSignature;

// PayPal billing helpers
export const createPayPalBillingHelpers = paypalBillingService.createPayPalBillingHelpers;

// Routes
export const registerPayPalRoutes = paypalRoutes.registerPayPalRoutes;
export const registerOrganizationsBillingRoutes = organizationsBillingRoutes.registerOrganizationsBillingRoutes;
export const registerAdminSubscriptionRoutes = adminSubscriptionRoutes.registerAdminSubscriptionRoutes;
