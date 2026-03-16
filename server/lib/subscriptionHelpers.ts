// Subscription helper functions extracted from server.js.

interface User {
  organizationId?: string;
  orgId?: string;
  id?: string;
  email?: string;
  role?: string;
  userId?: string;
}

interface AuditRecord {
  [key: string]: any; // TODO: tighten once audit schema is defined
}

interface RequestWithUser {
  user?: User;
  [key: string]: any;
}

interface AppendSubscriptionAuditDeps {
  fs: { appendFile(path: string, data: string, encoding: string): Promise<void> };
  SUBSCRIPTION_AUDIT_FILE: string;
}

interface PackageItem {
  status?: string;
  endDate?: string;
  updatedAt?: string;
  courses?: Array<{ courseId?: string }>;
}

interface CheckExpiredPackagesDeps {
  readPackages(): Promise<PackageItem[]>;
  writePackages(packages: PackageItem[]): Promise<void>;
}

interface UpdatePackagesForDeletedCourseDeps {
  readPackages(): Promise<PackageItem[]>;
  writePackages(packages: PackageItem[]): Promise<void>;
}

type SubscriptionStatus = 'active' | 'inactive' | 'archived';
type PublishState = 'draft' | 'live';
type Currency = 'HKD' | 'USD';

function resolveOrgIdFromUser(user: User | null | undefined): string | null {
  if (!user) return null;
  return user.organizationId || user.orgId || user.id || null;
}

function normalizeSubscriptionStatus(v: string | null | undefined): SubscriptionStatus {
  const s = String(v || 'inactive').toLowerCase();
  return (['active', 'inactive', 'archived'] as const).includes(s as SubscriptionStatus) ? s as SubscriptionStatus : 'inactive';
}

function normalizePublishState(v: string | null | undefined): PublishState {
  const s = String(v || 'draft').toLowerCase();
  return (['draft', 'live'] as const).includes(s as PublishState) ? s as PublishState : 'draft';
}

function normalizeCurrency(v: string | null | undefined): Currency {
  const c = String(v || 'HKD').toUpperCase();
  return (['HKD', 'USD'] as const).includes(c as Currency) ? c as Currency : 'HKD';
}

function dateOnlyTodayString(): string {
  // YYYY-MM-DD in server local time
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function createAppendSubscriptionAudit({ fs, SUBSCRIPTION_AUDIT_FILE }: AppendSubscriptionAuditDeps): (req: RequestWithUser, record: AuditRecord) => Promise<void> {
  return async function appendSubscriptionAudit(req: RequestWithUser, record: AuditRecord): Promise<void> {
    try {
      const actor = req?.user
        ? {
            id: req.user.id || req.user.userId || null,
            email: req.user.email || null,
            role: req.user.role || null
          }
        : null;
      const entry = {
        at: new Date().toISOString(),
        actor,
        ...record
      };
      await fs.appendFile(SUBSCRIPTION_AUDIT_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch (e) {
      // audit must not break main flows
    }
  };
}

function createCheckExpiredPackages({ readPackages, writePackages }: CheckExpiredPackagesDeps): () => Promise<PackageItem[]> {
  return async function checkExpiredPackages(): Promise<PackageItem[]> {
    try {
      const packages = await readPackages();
      const now = new Date();
      let updated = false;

      for (const pkg of packages) {
        if (pkg.status === 'active' && pkg.endDate) {
          const endDate = new Date(pkg.endDate);
          if (endDate < now) {
            pkg.status = 'inactive';
            pkg.updatedAt = new Date().toISOString();
            updated = true;
          }
        }
      }

      if (updated) {
        await writePackages(packages);
      }

      return packages;
    } catch (error) {
      console.error('Error checking expired packages:', error);
      return [];
    }
  };
}

function createUpdatePackagesForDeletedCourse({ readPackages, writePackages }: UpdatePackagesForDeletedCourseDeps): (courseId: string) => Promise<boolean> {
  return async function updatePackagesForDeletedCourse(courseId: string): Promise<boolean> {
    try {
      const packages = await readPackages();
      let updated = false;

      for (const pkg of packages) {
        const hasDeletedCourse = pkg.courses && pkg.courses.some(c => c.courseId === courseId);
        if (hasDeletedCourse && pkg.status !== 'archived') {
          pkg.status = 'inactive';
          pkg.updatedAt = new Date().toISOString();
          updated = true;
        }
      }

      if (updated) {
        await writePackages(packages);
      }

      return updated;
    } catch (error) {
      console.error('Error updating packages for deleted course:', error);
      return false;
    }
  };
}

module.exports = {
  resolveOrgIdFromUser,
  normalizeSubscriptionStatus,
  normalizePublishState,
  normalizeCurrency,
  dateOnlyTodayString,
  createAppendSubscriptionAudit,
  createCheckExpiredPackages,
  createUpdatePackagesForDeletedCourse
};
