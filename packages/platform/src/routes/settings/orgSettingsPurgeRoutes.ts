// Organization settings routes extracted from organizationsRoutes.js
// All route behavior should remain identical.

function registerOrgSettingsPurgeRoutes(app: any, deps: any): void {
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const readOrganizations = deps?.readOrganizations;
  const writeOrganizations = deps?.writeOrganizations;
  const readEnrollments = deps?.readEnrollments;
  const writeEnrollments = deps?.writeEnrollments;
  const readTimetable = deps?.readTimetable;
  const writeTimetable = deps?.writeTimetable;
  const readData = deps?.readData;
  const writeData = deps?.writeData;
  const readOrders = deps?.readOrders;
  const writeOrders = deps?.writeOrders;
  const readTransactions = deps?.readTransactions;
  const writeTransactions = deps?.writeTransactions;
  const readAttendance = deps?.readAttendance;
  const writeAttendance = deps?.writeAttendance;
  const broadcast = deps?.broadcast;

  /**
   * Remove all students belonging to the current organization (destructive).
   * Also strips related enrollments, timetable studentIds, orders, transactions, attendance.
   */
  app.post(
    '/api/organizations/students/purge-all',
    authenticateUser,
    authorizeRole('organization'),
    async (req, res) => {
      try {
        if (String(req.body?.confirm) !== 'DELETE_ALL_STUDENTS') {
          return res.status(400).json({
            error: 'Confirmation required',
            hint: 'Send JSON body: { "confirm": "DELETE_ALL_STUDENTS" }'
          });
        }

        const orgId = req.user?.organizationId;
        if (!orgId) {
          return res.status(403).json({ error: 'Organization context required' });
        }

        if (
          typeof readData !== 'function' ||
          typeof writeData !== 'function' ||
          typeof readOrders !== 'function' ||
          typeof writeOrders !== 'function' ||
          typeof readTransactions !== 'function' ||
          typeof writeTransactions !== 'function' ||
          typeof readAttendance !== 'function' ||
          typeof writeAttendance !== 'function' ||
          typeof writeTimetable !== 'function'
        ) {
          return res.status(500).json({ error: 'Server not configured for purge (missing storage helpers)' });
        }

        const data = await readData();
        const allStudents = Array.isArray(data.students) ? data.students : [];
        const removedStudents = allStudents.filter((s: any) => String(s?.organizationId) === String(orgId));
        const removedStudentIds = new Set(removedStudents.map((s: any) => String(s.id)));

        data.students = allStudents.filter((s: any) => String(s?.organizationId) !== String(orgId));

        if (data.challenge && Array.isArray(data.challenge.selectedStudentIds)) {
          data.challenge.selectedStudentIds = data.challenge.selectedStudentIds.filter(
            (id: string) => !removedStudentIds.has(String(id))
          );
        }

        if (data.gameState && data.gameState.current && Array.isArray(data.gameState.current.players)) {
          data.gameState.current.players = data.gameState.current.players.filter(
            (p: any) => !removedStudentIds.has(String(p.studentId))
          );
        }

        data.lastUpdate = new Date().toISOString();
        await writeData(data);

        const organizations = await readOrganizations();
        const orgIndex = organizations.findIndex((o: any) => String(o.id) === String(orgId));
        if (orgIndex >= 0) {
          organizations[orgIndex].students = [];
          await writeOrganizations(organizations);
        }

        let enrollments = await readEnrollments();
        const enrBefore = enrollments.length;
        enrollments = enrollments.filter(
          (e: any) =>
            !(String(e?.organizationId) === String(orgId) && removedStudentIds.has(String(e?.studentId)))
        );
        await writeEnrollments(enrollments);

        const timetableData = await readTimetable();
        const entries = Array.isArray(timetableData?.entries) ? timetableData.entries : [];
        for (const entry of entries) {
          if (String(entry?.organizationId) !== String(orgId)) continue;
          if (Array.isArray(entry.studentIds)) {
            entry.studentIds = entry.studentIds.filter((sid: string) => !removedStudentIds.has(String(sid)));
          }
        }
        await writeTimetable(timetableData);

        let orders = await readOrders();
        const ordBefore = orders.length;
        orders = orders.filter(
          (o: any) =>
            !(String(o?.organizationId) === String(orgId) && removedStudentIds.has(String(o?.studentId)))
        );
        await writeOrders(orders);

        let transactions = await readTransactions();
        const txnBefore = transactions.length;
        transactions = transactions.filter(
          (t: any) =>
            !(String(t?.organizationId) === String(orgId) && removedStudentIds.has(String(t?.studentId)))
        );
        await writeTransactions(transactions);

        let attendance = await readAttendance();
        const attBefore = attendance.length;
        attendance = attendance.filter(
          (a: any) =>
            !(String(a?.organizationId) === String(orgId) && removedStudentIds.has(String(a?.studentId)))
        );
        await writeAttendance(attendance);

        if (typeof broadcast === 'function' && removedStudentIds.size > 0) {
          broadcast({ type: 'studentsRemoved', studentIds: Array.from(removedStudentIds) });
        }

        return res.json({
          ok: true,
          removedStudents: removedStudents.length,
          removedEnrollments: enrBefore - enrollments.length,
          removedOrders: ordBefore - orders.length,
          removedTransactions: txnBefore - transactions.length,
          removedAttendanceRecords: attBefore - attendance.length
        });
      } catch (error) {
        console.error('[organizations/students/purge-all]', error);
        return res.status(500).json({ error: 'Failed to purge students' });
      }
    }
  );
}

module.exports = { registerOrgSettingsPurgeRoutes };
export {};
