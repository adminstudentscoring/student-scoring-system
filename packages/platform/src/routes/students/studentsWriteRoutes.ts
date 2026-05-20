// Student routes extracted from server.js.
// Includes /api/students* and /api/public/students*.

import { Request, Response, NextFunction } from 'express';
import type { StudentsRouteDeps } from '@student-scoring/core';

function registerStudentsWriteRoutes(app: any, deps: any): void {
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

  app.put('/api/students/:id', authenticateUser, authorizeRole('organization', 'teacher', 'admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const data = await readData();
      const student = data.students.find(s => s.id === id);

      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      // Check organization access
      if (req.user.role === 'organization' && student.organizationId !== req.user.organizationId) {
        return res.status(403).json({ error: 'You can only update students from your organization' });
      }

      if (req.user.role === 'teacher') {
        const users = await readUsers();
        const teacher = users.find(u => u.id === req.user.id);

        // Teachers can only update students assigned to them AND in their organization
        if (!teacher || teacher.organizationId !== student.organizationId) {
          return res.status(403).json({ error: 'You can only update students in your organization' });
        }

        // Check permissions
        // If updating 'score', check editScore
        if (updates.score !== undefined && (!teacher.teacherPermissions || !teacher.teacherPermissions.editScore)) {
          return res.status(403).json({ error: 'Insufficient permissions: You are not allowed to edit scores.' });
        }

        // If updating profile fields (name, chessComId, etc.), check editStudentProfile
        // We define "profile fields" as anything NOT score/password for now, or specific list
        const profileFields = [
          'name',
          'localName',
          'chessComId',
          'gender',
          'dateOfBirth',
          'contactPhone',
          'contactPhoneCountry',
          'contactPhoneCountryCode',
          'contactEmail',
          'emergencyContactName',
          'emergencyContactRelation',
          'emergencyContactNumber',
          'remark',
          'membership',
          'membershipStartDate',
          'membershipEndDate'
        ];
        const isUpdatingProfile = Object.keys(updates).some(key => profileFields.includes(key));

        if (isUpdatingProfile && (!teacher.teacherPermissions || !teacher.teacherPermissions.editStudentProfile)) {
          return res.status(403).json({ error: 'Insufficient permissions: You are not allowed to edit student profiles.' });
        }

        // If updating access password, check editSharePwd
        if (updates.accessPassword !== undefined && (!teacher.teacherPermissions || !teacher.teacherPermissions.editSharePwd)) {
          return res.status(403).json({ error: 'Insufficient permissions: You are not allowed to edit share password.' });
        }
      }

      // Validate student name (required)
      if (updates.name !== undefined) {
        if (!updates.name || updates.name.trim() === '') {
          return res.status(400).json({ error: 'Student name is required' });
        }
        if (updates.name.length > 100) {
          return res.status(400).json({ error: 'Student name must be 100 characters or less' });
        }
      }

      // Validate chess.com ID uniqueness (if being updated)
      const nextChessComId = updates.chessComId ?? updates.studentId;
      if (nextChessComId !== undefined && String(nextChessComId || '') !== String(student.chessComId || '')) {
        if (nextChessComId && String(nextChessComId).trim() !== '') {
          if (String(nextChessComId).length > 50) {
            return res.status(400).json({ error: 'chess.com ID must be 50 characters or less' });
          }

          const existingStudent = data.students.find(s =>
            s.organizationId === student.organizationId &&
            String(s.chessComId || '') === String(nextChessComId || '') &&
            s.id !== id
          );

          if (existingStudent) {
            return res.status(400).json({ error: 'chess.com ID already exists in this organization' });
          }
        }
      }

      // Validate date fields
      if (updates.dateOfBirth !== undefined && updates.dateOfBirth !== null && updates.dateOfBirth !== '') {
        if (!isValidDateFormat(updates.dateOfBirth)) {
          return res.status(400).json({ error: 'Date of birth must be in DD/MM/YYYY format' });
        }
        if (!isValidDate(updates.dateOfBirth)) {
          return res.status(400).json({ error: 'Invalid date of birth' });
        }
        if (isFutureDate(updates.dateOfBirth)) {
          return res.status(400).json({ error: 'Date of birth cannot be in the future' });
        }
      }

      if (updates.membershipStartDate !== undefined && updates.membershipStartDate !== null && updates.membershipStartDate !== '') {
        if (!isValidDateFormat(updates.membershipStartDate)) {
          return res.status(400).json({ error: 'Membership start date must be in DD/MM/YYYY format' });
        }
        if (!isValidDate(updates.membershipStartDate)) {
          return res.status(400).json({ error: 'Invalid membership start date' });
        }
      }

      if (updates.membershipEndDate !== undefined && updates.membershipEndDate !== null && updates.membershipEndDate !== '') {
        if (!isValidDateFormat(updates.membershipEndDate)) {
          return res.status(400).json({ error: 'Membership end date must be in DD/MM/YYYY format' });
        }
        if (!isValidDate(updates.membershipEndDate)) {
          return res.status(400).json({ error: 'Invalid membership end date' });
        }

        // Validate that end date is after start date
        const startDate = updates.membershipStartDate || student.membershipStartDate;
        if (startDate && startDate.trim() !== '') {
          if (compareDates(updates.membershipEndDate, startDate) < 0) {
            return res.status(400).json({ error: 'Membership end date must be after start date' });
          }
        }
      }

      // Validate field lengths
      const fieldLengths = {
        localName: 100,
        contactPhone: 20,
        contactPhoneCountry: 4,
        contactPhoneCountryCode: 6,
        contactEmail: 100,
        emergencyContactName: 100,
        emergencyContactNumber: 20,
        remark: 1000,
        membership: 50,
        autoRenewTimetableEntryId: 80,
        autoRenewPackageId: 80
      };

      for (const [field, maxLength] of Object.entries(fieldLengths)) {
        if (updates[field] !== undefined && updates[field] !== null && updates[field] !== '') {
          if (updates[field].length > maxLength) {
            return res.status(400).json({ error: `${field} must be ${maxLength} characters or less` });
          }
        }
      }

      // Validate gender
      if (updates.gender !== undefined && updates.gender !== null && updates.gender !== '') {
        const gRaw = String(updates.gender || '').trim();
        const g = gRaw.toLowerCase();
        if (g !== 'male' && g !== 'female') {
          return res.status(400).json({ error: 'Gender must be male or female' });
        }
        // Store normalized value to match UI (<option value="male|female">)
        updates.gender = g;
      }

      // Validate emergency contact relation
      if (updates.emergencyContactRelation !== undefined && updates.emergencyContactRelation !== null && updates.emergencyContactRelation !== '') {
        if (!['Parent', 'Guardian', 'Other'].includes(updates.emergencyContactRelation)) {
          return res.status(400).json({ error: 'Emergency contact relation must be Parent, Guardian, or Other' });
        }
      }

      const studentIndex = data.students.findIndex(s => s.id === id);

      // If score is being updated, recalculate rank
      if (updates.score !== undefined) {
        const rankInfo = getRankInfo(updates.score);
        updates.rank = rankInfo.rank;
        updates.rankIndex = rankInfo.rankIndex;
        updates.level = rankInfo.rankIndex + 1;
        updates.experience = updates.score;
      }

      // Merge updates with existing student data
      // Only update fields that are provided (not undefined)
      const allowedFields = [
        'name', 'localName', 'chessComId', 'dateOfBirth', 'gender',
        'contactPhone', 'contactPhoneCountry', 'contactPhoneCountryCode',
        'contactEmail',
        'emergencyContactName', 'emergencyContactRelation', 'emergencyContactNumber',
        'remark', 'membership', 'membershipStartDate', 'membershipEndDate', 'score',
        'accessPassword',
        // Auto-renew (optional)
        'autoRenewEnabled', 'autoRenewTimetableEntryId', 'autoRenewPackageId'
      ];

      const cleanUpdates: any = {};
      allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
          cleanUpdates[field] = updates[field] === '' ? null : updates[field];
        }
      });

      // Lesson quota credits (org/admin only) — used by sales "pay with quota" and integration tests.
      if (updates.lessonQuotaByCents !== undefined) {
        if (req.user.role === 'teacher') {
          return res.status(403).json({ error: 'Teachers cannot edit lesson quota credits' });
        }
        if (req.user.role !== 'organization' && req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Not allowed to edit lesson quota' });
        }
        const q = updates.lessonQuotaByCents;
        if (q === null || q === '') {
          cleanUpdates.lessonQuotaByCents = {};
        } else if (typeof q !== 'object' || Array.isArray(q)) {
          return res.status(400).json({ error: 'lessonQuotaByCents must be a map of tier (cents string) to lesson count' });
        } else {
          const next: Record<string, number> = {};
          for (const [k, raw] of Object.entries(q)) {
            const n = Number(raw);
            if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
              return res.status(400).json({ error: `Invalid lesson quota count for tier ${k}` });
            }
            next[String(k)] = n;
          }
          cleanUpdates.lessonQuotaByCents = next;
        }
      }

      // Backward compatibility: if client still sends `studentId`, treat it as chessComId.
      if (updates.studentId !== undefined && updates.chessComId === undefined) {
        cleanUpdates.chessComId = updates.studentId === '' ? null : String(updates.studentId);
      }

      // Normalize auto-renew fields (optional)
      if (updates.autoRenewEnabled !== undefined) {
        cleanUpdates.autoRenewEnabled = !!updates.autoRenewEnabled;
      }
      if (updates.autoRenewTimetableEntryId !== undefined) {
        cleanUpdates.autoRenewTimetableEntryId = (updates.autoRenewTimetableEntryId === '' || updates.autoRenewTimetableEntryId == null)
          ? null
          : String(updates.autoRenewTimetableEntryId).trim();
      }
      if (updates.autoRenewPackageId !== undefined) {
        cleanUpdates.autoRenewPackageId = (updates.autoRenewPackageId === '' || updates.autoRenewPackageId == null)
          ? null
          : String(updates.autoRenewPackageId).trim();
      }

      data.students[studentIndex] = { ...data.students[studentIndex], ...cleanUpdates };
      data.students[studentIndex].updatedAt = new Date().toISOString();
      data.lastUpdate = new Date().toISOString();
      await writeData(data);

      broadcast({ type: 'studentUpdated', student: data.students[studentIndex] });
      return res.json(data.students[studentIndex]);
    } catch (error) {
      console.error('Error updating student:', error);
      return res.status(500).json({ error: 'Failed to update student' });
    }
  });

  // Delete student
  app.delete('/api/students/:id', authenticateUser, async (req, res) => {
    try {
      const { id } = req.params;

      // Check permissions
      if (req.user.role === 'teacher') {
        const users = await readUsers();
        const currentUser = users.find(u => u.id === req.user.id);

        if (!currentUser || !currentUser.organizationId) {
          return res.status(403).json({ error: 'Teacher not associated with organization' });
        }

        // Check "Delete Student" permission
        if (!currentUser.teacherPermissions || !currentUser.teacherPermissions.deleteStudent) {
          return res.status(403).json({ error: 'Insufficient permissions: You are not allowed to delete students.' });
        }

        // Ensure the student belongs to the teacher's organization
        const data = await readData();
        const student = data.students.find(s => s.id === id);

        if (!student) {
          return res.status(404).json({ error: 'Student not found' });
        }

        if (student.organizationId !== currentUser.organizationId) {
          return res.status(403).json({ error: 'You can only delete students in your organization' });
        }
      } else if (req.user.role !== 'admin' && req.user.role !== 'organization') {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const data = await readData();
      const studentIndex = data.students.findIndex(s => s.id === id);

      if (studentIndex === -1) {
        return res.status(404).json({ error: 'Student not found' });
      }

      // Organization permission check (double check if role is organization)
      if (req.user.role === 'organization') {
        const users = await readUsers();
        const orgUser = users.find(u => u.id === req.user.id);
        if (data.students[studentIndex].organizationId !== orgUser.organizationId) {
          return res.status(403).json({ error: 'You can only delete students in your organization' });
        }
      }

      data.students.splice(studentIndex, 1);
      data.lastUpdate = new Date().toISOString();
      await writeData(data);

      // Also remove from organization's student list
      const organizations = await readOrganizations();
      for (const org of organizations) {
        if (org.students && org.students.includes(id)) {
          org.students = org.students.filter(sid => sid !== id);
          await writeOrganizations(organizations);
          break;
        }
      }

      broadcast({ type: 'studentDeleted', studentId: id });
      return res.json({ success: true });
    } catch (error) {
      console.error('Error deleting student:', error);
      return res.status(500).json({ error: 'Failed to delete student' });
    }
  });

}

module.exports = { registerStudentsWriteRoutes };
export {};
