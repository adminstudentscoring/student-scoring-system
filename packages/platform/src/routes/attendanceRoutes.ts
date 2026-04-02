// Attendance routes extracted from server.js.

import { Request, Response, NextFunction } from 'express';

function registerAttendanceRoutes(app: any, deps: any): void {
  const authenticateUser = deps?.authenticateUser;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const readTimetable = deps?.readTimetable;
  const readAttendance = deps?.readAttendance;
  const writeAttendance = deps?.writeAttendance;

  if (!app) throw new Error('registerAttendanceRoutes: missing app');
  if (typeof authenticateUser !== 'function') throw new Error('registerAttendanceRoutes: missing authenticateUser');
  if (typeof requireOrganizationAccess !== 'function') throw new Error('registerAttendanceRoutes: missing requireOrganizationAccess');
  if (typeof readTimetable !== 'function') throw new Error('registerAttendanceRoutes: missing readTimetable');
  if (typeof readAttendance !== 'function') throw new Error('registerAttendanceRoutes: missing readAttendance');
  if (typeof writeAttendance !== 'function') throw new Error('registerAttendanceRoutes: missing writeAttendance');

  // Get attendance records
  app.get('/api/attendance', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const { timetableEntryId, date, studentId } = req.query;
      let records = await readAttendance();

      // Filter
      if (req.organizationFilter) {
        records = records.filter(r => r.organizationId === req.organizationFilter);
      }

      if (timetableEntryId) {
        records = records.filter(r => r.timetableEntryId === timetableEntryId);
      }
      if (date) {
        records = records.filter(r => r.date === date);
      }
      if (studentId) {
        records = records.filter(r => r.studentId === studentId);
      }

      return res.json(records);
    } catch (error) {
      console.error('Error getting attendance:', error);
      return res.status(500).json({ error: 'Failed to get attendance' });
    }
  });

  // Save attendance records
  app.post('/api/attendance', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const { timetableEntryId, date, records } = req.body;

      if (!timetableEntryId || !date || !Array.isArray(records)) {
        return res.status(400).json({ error: 'Invalid data' });
      }

      const allRecords = await readAttendance();
      let organizationId;

      if (req.user.role === 'admin') {
        const timetableData = await readTimetable();
        const entry = timetableData.entries.find(e => e.id === timetableEntryId);
        if (!entry) return res.status(404).json({ error: 'Entry not found' });
        organizationId = entry.organizationId;
      } else {
        organizationId = req.user.organizationId;
      }

      records.forEach(rec => {
        const existingIndex = allRecords.findIndex(r =>
          r.timetableEntryId === timetableEntryId &&
          r.date === date &&
          r.studentId === rec.studentId
        );

        const newRecord = {
          id: existingIndex !== -1 ? allRecords[existingIndex].id : `att_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          organizationId,
          timetableEntryId,
          date,
          studentId: rec.studentId,
          status: rec.status,
          updatedAt: new Date().toISOString(),
          updatedBy: req.user.id
        };

        if (existingIndex !== -1) {
          allRecords[existingIndex] = newRecord;
        } else {
          allRecords.push(newRecord);
        }
      });

      await writeAttendance(allRecords);
      return res.json({ success: true });
    } catch (error) {
      console.error('Error saving attendance:', error);
      return res.status(500).json({ error: 'Failed to save attendance' });
    }
  });
}

module.exports = { registerAttendanceRoutes };


