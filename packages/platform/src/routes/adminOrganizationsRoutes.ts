// Admin Organization routes extracted from server.js.
// Includes /api/admin/organizations/* routes (CRUD, teachers, students, settings, statistics, audit, batch).
import { Request, Response, NextFunction } from 'express';
import type { AdminOrganizationsRouteDeps } from '@student-scoring/core';

const { registerAdminOrgCrudRoutes } = require('./admin/adminOrgCrudRoutes');
const { registerAdminOrgToolsRoutes } = require('./admin/adminOrgToolsRoutes');

function registerAdminOrganizationsRoutes(app: any, deps: AdminOrganizationsRouteDeps): void {
  if (!app) throw new Error('registerAdminOrganizationsRoutes: missing app');
  if (typeof deps?.authenticateUser !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing authenticateUser');
  if (typeof deps?.authorizeRole !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing authorizeRole');
  if (typeof deps?.readOrganizations !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing readOrganizations');
  if (typeof deps?.writeOrganizations !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing writeOrganizations');
  if (typeof deps?.readUsers !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing readUsers');
  if (typeof deps?.writeUsers !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing writeUsers');
  if (typeof deps?.readData !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing readData');
  if (typeof deps?.writeData !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing writeData');
  if (typeof deps?.broadcast !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing broadcast');
  if (typeof deps?.getRankInfo !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing getRankInfo');
  if (typeof deps?.hashPassword !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing hashPassword');
  if (typeof deps?.generateToken !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing generateToken');

  registerAdminOrgCrudRoutes(app, deps);
  registerAdminOrgToolsRoutes(app, deps);
}

module.exports = { registerAdminOrganizationsRoutes };
export {};
