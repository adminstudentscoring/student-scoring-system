const { verifyToken, extractTokenFromHeader } = require('../auth');

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

