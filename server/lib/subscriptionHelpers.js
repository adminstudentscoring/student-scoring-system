// Subscription helper functions extracted from server.js.

function resolveOrgIdFromUser(user) {
  if (!user) return null;
  return user.organizationId || user.orgId || user.id || null;
}

function normalizeSubscriptionStatus(v) {
  const s = String(v || 'inactive').toLowerCase();
  return ['active', 'inactive', 'archived'].includes(s) ? s : 'inactive';
}

function normalizePublishState(v) {
  const s = String(v || 'draft').toLowerCase();
  return ['draft', 'live'].includes(s) ? s : 'draft';
}

function normalizeCurrency(v) {
  const c = String(v || 'HKD').toUpperCase();
  return ['HKD', 'USD'].includes(c) ? c : 'HKD';
}

function dateOnlyTodayString() {
  // YYYY-MM-DD in server local time
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function createAppendSubscriptionAudit({ fs, SUBSCRIPTION_AUDIT_FILE }) {
  return async function appendSubscriptionAudit(req, record) {
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

function createCheckExpiredPackages({ readPackages, writePackages }) {
  return async function checkExpiredPackages() {
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

function createUpdatePackagesForDeletedCourse({ readPackages, writePackages }) {
  return async function updatePackagesForDeletedCourse(courseId) {
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
