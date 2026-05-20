'use strict';

function registerVcpWsAuth(ctx: any): void {
  const { readData, readUsers } = ctx;

  async function resolveOrgIdFromToken(decoded: any) {
    const orgId = decoded?.organizationId || null;
    if (orgId) return String(orgId);
    // Student tokens might not carry orgId; fallback to student record lookup.
    if (String(decoded?.role || '') === 'student') {
      const data = await readData();
      const students = Array.isArray(data?.students) ? data.students : [];
      const sid = String(decoded?.id || '');
      const s = students.find(st => String(st?.id) === sid);
      if (s?.organizationId) return String(s.organizationId);
    }
    return '';
  }

  async function resolveUserName(decoded: any) {
    const name = String(decoded?.name || '').trim();
    if (name) return name;
    try {
      const users = await readUsers();
      const u = users.find(x => String(x?.id) === String(decoded?.id));
      if (u?.name) return String(u.name);
    } catch {}
    return 'Unknown';
  }

  Object.assign(ctx, { resolveOrgIdFromToken, resolveUserName });
}

module.exports = { registerVcpWsAuth };
export {};
