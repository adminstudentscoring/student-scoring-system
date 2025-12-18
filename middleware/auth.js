const { verifyToken, extractTokenFromHeader } = require('../auth');
const billingAccess = require('../billing/access');

/**
 * Authentication middleware
 * Verifies JWT token and attaches user info to req.user
 * Note: This is a synchronous middleware. For async user data loading, use authenticateUserAsync
 */
function authenticateUser(req, res, next) {
  const token = extractTokenFromHeader(req) || req.cookies?.token || req.query?.token;
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  
  // Attach user info to request
  // Note: organizationId should be in token, but we'll verify it exists
  req.user = decoded;
  next();
}

/**
 * Authorization middleware - check if user has required role
 * @param {string|string[]} allowedRoles - Role(s) allowed to access
 */
function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Subscription/trial gate for organization users:
    // - Trial active OR subscription active/grace => allow all
    // - Otherwise, allow billing endpoints only, so user can subscribe
    if (req.user.role === 'organization') {
      const orgId = req.user.organizationId || req.user.orgId || req.user.id || null;
      if (!orgId) {
        return res.status(403).json({ error: 'User organization not found' });
      }

      billingAccess
        .getOrgAccessSnapshot(orgId)
        .then((snap) => {
          if (snap.allowAll) return next();
          if (billingAccess.isBillingAllowedPath(req.path)) return next();
          return res.status(402).json({ error: 'Trial ended. Please subscribe to continue.' });
        })
        .catch((e) => {
          console.error('Org access gate error:', e);
          return res.status(500).json({ error: 'Failed to verify subscription status' });
        });
      return;
    }

    next();
  };
}

/**
 * Optional authentication middleware
 * Verifies token if present, but doesn't require it
 */
function optionalAuth(req, res, next) {
  const token = extractTokenFromHeader(req) || req.cookies?.token || req.query?.token;
  
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  
  next();
}

module.exports = {
  authenticateUser,
  authorizeRole,
  optionalAuth
};

