import type { RequestHandler } from 'express';

export interface Student {
  id?: string;
  name?: string;
  localName?: string;
  contactPhoneCountry?: string;
  contactPhoneCountryCode?: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  chessComId?: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelation?: string | null;
  emergencyContactNumber?: string | null;
  remark?: string | null;
  membership?: string | null;
  membershipStartDate?: string | null;
  membershipEndDate?: string | null;
  organizationId?: string;
  autoRenewEnabled?: boolean;
  autoRenewTimetableEntryId?: string;
  autoRenewPackageId?: string;
  stats?: {
    daily: Record<string, any>;
    weekly: Record<string, any>;
    monthly: Record<string, any>;
    yearly?: Record<string, any>;
  };
  studentId?: string;
  [key: string]: any;
}

export interface Challenge {
  currentLevel: number;
  currentHP: number;
  completedLevels: number[];
  totalDamage: number;
  selectedStudentIds?: string[];
}

export interface DataFile {
  students: Student[];
  battles: any[];
  challenge?: Challenge;
  lastUpdate?: string;
  [key: string]: any;
}

export interface Organization {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  createdAt?: string;
  teachers?: any[];
  students?: any[];
  settings?: Record<string, any>;
  subscription?: Record<string, any>;
  stripeCustomerId?: string;
  [key: string]: any;
}

export interface User {
  id: string;
  email: string;
  password?: string;
  name?: string;
  role: string;
  organizationId?: string;
  orgId?: string;
  createdAt?: string;
  [key: string]: any;
}

export interface LevelConfig {
  level: number;
  name: string;
  hp: number;
  [key: string]: any;
}

export interface RankInfo {
  rank: string;
  title: string;
  minScore: number;
  maxScore: number;
  color: string;
  rankIndex?: number;
  nextRank?: string;
  progress?: number;
  [key: string]: any;
}

export interface CommonDeps {
  authenticateUser: RequestHandler;
  readData: () => Promise<DataFile>;
  writeData: (data: DataFile) => Promise<void>;
  readUsers: () => Promise<User[]>;
  writeUsers: (users: User[]) => Promise<void>;
  readOrganizations: () => Promise<Organization[]>;
  writeOrganizations: (orgs: Organization[]) => Promise<void>;
  broadcast: (data: any) => void;
}

export interface AuthRouteDeps extends CommonDeps {
  hashPassword: (password: string) => Promise<string>;
  comparePassword: (password: string, hash: string) => Promise<boolean>;
  generateToken: (payload: Record<string, any>) => string;
  billingAccess?: {
    ensureTrialForOrg: (orgId: string, days: number) => Promise<void>;
    [key: string]: any;
  };
}

export interface ChallengeRouteDeps extends Pick<CommonDeps, 'authenticateUser' | 'readData' | 'writeData' | 'readOrganizations' | 'broadcast'> {
  LEVELS: LevelConfig[];
  SAVES_DIR: string;
  fs: typeof import('fs/promises');
  path: typeof import('path');
}

export interface StudentsRouteDeps extends CommonDeps {
  optionalAuth: RequestHandler;
  authorizeRole: (...roles: string[]) => RequestHandler;
  requireOrganizationAccess: RequestHandler;
  filterStudentsByOrganization: (students: Student[], user: any) => Student[];
  getRankInfo: (score: number) => RankInfo;
  updateStudentStats: (student: Student, data: any) => void;
  LEVELS: LevelConfig[];
  generateToken: (payload: Record<string, any>) => string;
  getStudentChessComCredentials?: (studentId: string, orgId: string) => any;
  isValidDateFormat: (date: string) => boolean;
  isValidDate: (date: string) => boolean;
  isFutureDate: (date: string) => boolean;
  compareDates: (a: string, b: string) => number;
}

export interface AdminOrganizationsRouteDeps extends CommonDeps {
  authorizeRole: (...roles: string[]) => RequestHandler;
  getRankInfo: (score: number) => RankInfo;
  hashPassword: (password: string) => Promise<string>;
  generateToken: (payload: Record<string, any>) => string;
}
