import type { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader, isAuthConfigured } from '../auth';
const billingAccess = require('@student-scoring/billing/src/access');

function formatError(error: any): string {
  return String(error?.stack || error?.message || error || 'Unknown error');
}

function isRecoverableBillingError(error: any): boolean {
  const code = String(error?.code || error?.cause?.code || '').toUpperCase();
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code)) {
    return true;
  }

  const message = formatError(error).toLowerCase();
  return [
    'econnrefused',
    'connect etimedout',
    'connection terminated unexpectedly',
    'timeout expired',
    'getaddrinfo',
    'the database system is starting up',
    'postgres not configured',
    'missing database_url',
    'database_public_url'
  ].some(fragment => message.includes(fragment));
}

interface AuthenticatedRequest extends Request {
  user?: any;
}

function authenticateUser(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!isAuthConfigured()) {
    res.status(503).json({ error: 'Authentication is not configured on this server' });
    return;
  }

  const token = extractTokenFromHeader(req) || req.cookies?.token || (req.query as any)?.token;
  
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  
  req.user = decoded;
  next();
}

function authorizeRole(...allowedRoles: string[]): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    if (req.user.role === 'organization') {
      const orgId = req.user.organizationId || req.user.orgId || req.user.id || null;
      if (!orgId) {
        res.status(403).json({ error: 'User organization not found' });
        return;
      }

      if (typeof billingAccess.isBillingEnforcementEnabled === 'function' && !billingAccess.isBillingEnforcementEnabled()) {
        return next();
      }

      billingAccess
        .getOrgAccessSnapshot(orgId)
        .then((snap: any) => {
          if (snap.allowAll) return next();
          if (billingAccess.isBillingAllowedPath(req.path)) return next();
          return res.status(402).json({ error: 'Trial ended. Please subscribe to continue.' });
        })
        .catch((e: any) => {
          if (isRecoverableBillingError(e)) {
            console.warn('Org access gate degraded: billing lookup unavailable, allowing request:', formatError(e));
            return next();
          }
          console.error('Org access gate error:', e);
          return res.status(500).json({ error: 'Failed to verify subscription status' });
        });
      return;
    }

    next();
  };
}

function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!isAuthConfigured()) {
    next();
    return;
  }

  const token = extractTokenFromHeader(req) || req.cookies?.token || (req.query as any)?.token;
  
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  
  next();
}

export {
  authenticateUser,
  authorizeRole,
  optionalAuth
};
