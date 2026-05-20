// Student routes extracted from server.js.
// Includes /api/students* and /api/public/students*.

import { Request, Response, NextFunction } from 'express';
import type { StudentsRouteDeps } from '@student-scoring/core';


const { registerStudentsReadRoutes } = require('./students/studentsReadRoutes');
const { registerStudentsWriteRoutes } = require('./students/studentsWriteRoutes');
const { registerStudentsPublicRoutes } = require('./students/studentsPublicRoutes');

function registerStudentsRoutes(app: any, deps: any): void {
  const optionalAuth = deps?.optionalAuth;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const getStudentChessComCredentials = deps?.getStudentChessComCredentials;

  const readData = deps?.readData;
  const writeData = deps?.writeData;
  const readUsers = deps?.readUsers;
  const writeUsers = deps?.writeUsers;
  const readOrganizations = deps?.readOrganizations;
  const writeOrganizations = deps?.writeOrganizations;

  const filterStudentsByOrganization = deps?.filterStudentsByOrganization;
  const getRankInfo = deps?.getRankInfo;
  const updateStudentStats = deps?.updateStudentStats;
  const broadcast = deps?.broadcast;

  const LEVELS = deps?.LEVELS;
  const generateToken = deps?.generateToken;
  const isValidDateFormat = deps?.isValidDateFormat;
  const isValidDate = deps?.isValidDate;
  const isFutureDate = deps?.isFutureDate;
  const compareDates = deps?.compareDates;

  if (!app) throw new Error('registerStudentsRoutes: missing app');
  if (typeof optionalAuth !== 'function') throw new Error('registerStudentsRoutes: missing optionalAuth');
  if (typeof authenticateUser !== 'function') throw new Error('registerStudentsRoutes: missing authenticateUser');
  if (typeof authorizeRole !== 'function') throw new Error('registerStudentsRoutes: missing authorizeRole');
  if (typeof requireOrganizationAccess !== 'function') throw new Error('registerStudentsRoutes: missing requireOrganizationAccess');

  if (typeof readData !== 'function') throw new Error('registerStudentsRoutes: missing readData');
  if (typeof writeData !== 'function') throw new Error('registerStudentsRoutes: missing writeData');
  if (typeof readUsers !== 'function') throw new Error('registerStudentsRoutes: missing readUsers');
  if (typeof writeUsers !== 'function') throw new Error('registerStudentsRoutes: missing writeUsers');
  if (typeof readOrganizations !== 'function') throw new Error('registerStudentsRoutes: missing readOrganizations');
  if (typeof writeOrganizations !== 'function') throw new Error('registerStudentsRoutes: missing writeOrganizations');

  if (typeof filterStudentsByOrganization !== 'function') throw new Error('registerStudentsRoutes: missing filterStudentsByOrganization');
  if (typeof getRankInfo !== 'function') throw new Error('registerStudentsRoutes: missing getRankInfo');
  if (typeof updateStudentStats !== 'function') throw new Error('registerStudentsRoutes: missing updateStudentStats');
  if (typeof broadcast !== 'function') throw new Error('registerStudentsRoutes: missing broadcast');
  if (!Array.isArray(LEVELS)) throw new Error('registerStudentsRoutes: missing LEVELS');
  if (typeof generateToken !== 'function') throw new Error('registerStudentsRoutes: missing generateToken');
  if (typeof isValidDateFormat !== 'function') throw new Error('registerStudentsRoutes: missing isValidDateFormat');
  if (typeof isValidDate !== 'function') throw new Error('registerStudentsRoutes: missing isValidDate');
  if (typeof isFutureDate !== 'function') throw new Error('registerStudentsRoutes: missing isFutureDate');
  if (typeof compareDates !== 'function') throw new Error('registerStudentsRoutes: missing compareDates');

  registerStudentsReadRoutes(app, deps);
  registerStudentsWriteRoutes(app, deps);
  registerStudentsPublicRoutes(app, deps);
}

module.exports = { registerStudentsRoutes };
export {};
