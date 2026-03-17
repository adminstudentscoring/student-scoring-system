// Student management routes extracted from organizationsRoutes.js
// All route behavior should remain identical.

import { Request, Response, NextFunction } from 'express';

function registerOrgStudentsRoutes(app: any, deps: any): void {
  const {
    authenticateUser,
    authorizeRole,
    readUsers,
    writeUsers,
    readOrganizations,
    writeOrganizations,
    readData,
    writeData,
    broadcast,
    getRankInfo
  } = deps;

  // Organization creates a student (requires organization authentication or teacher permission)
  app.post('/api/organizations/students', authenticateUser, authorizeRole('organization', 'teacher'), async (req, res) => {
    try {
      const {
        name,
        localName,
        chessComId,
        studentId,
        gender,
        dateOfBirth,
        contactPhone,
        contactPhoneCountry,
        contactPhoneCountryCode,
        contactEmail,
        emergencyContactName,
        emergencyContactRelation,
        emergencyContactNumber
      } = req.body;
      // Backward compatibility: `studentId` historically stored Chess.com ID
      const chessId = (chessComId ?? studentId ?? '');

      // Validation
      if (!name) {
        return res.status(400).json({ error: 'Student Name is required' });
      }

      // Get user and check permissions if teacher
      const users = await readUsers();
      const currentUser = users.find(u => u.id === req.user.id);

      if (!currentUser || !currentUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      // Teacher Permission Check
      if (currentUser.role === 'teacher') {
        if (!currentUser.teacherPermissions || !currentUser.teacherPermissions.addStudent) {
          return res.status(403).json({ error: 'Insufficient permissions: You are not allowed to add students.' });
        }
      }

      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === currentUser.organizationId);
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // Check if chess.com ID already exists in this organization (only if provided)
      const data = await readData();
      if (chessId) {
        const existingStudent = data.students.find(s =>
          s.organizationId === currentUser.organizationId &&
          String(s.chessComId || '') === String(chessId || '')
        );
        if (existingStudent) {
          return res.status(400).json({ error: 'chess.com ID already exists in this organization' });
        }
      }

      // Create student record
      const initialRankInfo = getRankInfo(0);
      const newStudent = {
        id: Date.now().toString(),
        name,
        localName: localName || '',
        chessComId: chessId || '', // Allow empty
        gender: (() => {
          const g = String(gender || '').trim().toLowerCase();
          return (g === 'male' || g === 'female') ? g : '';
        })(),
        dateOfBirth: dateOfBirth || '',
        contactPhone: contactPhone || '',
        contactPhoneCountry: contactPhoneCountry || 'HK',
        contactPhoneCountryCode: contactPhoneCountryCode || '+852',
        contactEmail: contactEmail || '',
        emergencyContactName: emergencyContactName || '',
        emergencyContactRelation: emergencyContactRelation || '',
        emergencyContactNumber: emergencyContactNumber || '',
        organizationId: currentUser.organizationId,
        answerCount: 0,
        totalAnswers: 0,
        correctAnswers: 0,
        level: 1,
        rank: 'Wood',
        rankIndex: 0,
        experience: 0,
        score: 0,
        createdAt: new Date().toISOString(),
        stats: {
          daily: {},
          weekly: {},
          monthly: {},
          yearly: {}
        }
      };

      data.students.push(newStudent);
      data.lastUpdate = new Date().toISOString();
      await writeData(data);

      // Update organization
      organization.students.push(newStudent.id);
      await writeOrganizations(organizations);

      // If Teacher created it, Auto-Assign
      if (currentUser.role === 'teacher') {
        if (!currentUser.assignedStudents) {
          currentUser.assignedStudents = [];
        }
        if (!currentUser.assignedStudents.includes(newStudent.id)) {
          currentUser.assignedStudents.push(newStudent.id);
          // Save updated teacher user
          const teacherIndex = users.findIndex(u => u.id === currentUser.id);
          if (teacherIndex !== -1) {
            users[teacherIndex] = currentUser;
            await writeUsers(users);
          }
        }
      }

      broadcast({ type: 'studentAdded', student: newStudent });
      res.status(201).json(newStudent);
    } catch (error) {
      console.error('Error creating student:', error);
      res.status(500).json({ error: 'Failed to create student' });
    }
  });

  // Bulk create students
  app.post('/api/organizations/students/bulk', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const studentsList = req.body;
      if (!Array.isArray(studentsList)) {
        return res.status(400).json({ error: 'Expected array of students' });
      }

      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) return res.status(403).json({ error: 'Organization not found' });

      const data = await readData();
      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === orgUser.organizationId);

      let createdCount = 0;
      let errors = [];

      for (const s of studentsList) {
        if (!s.name) {
          errors.push({ student: s, error: 'Name missing' });
          continue;
        }

        const chessId = (s.chessComId ?? s.studentId ?? '');
        if (chessId && String(chessId).trim() !== '') {
          const exists = data.students.find(ex => ex.organizationId === orgUser.organizationId && String(ex.chessComId || '') === String(chessId));
          if (exists) {
            errors.push({ student: s, error: `chess.com ID ${chessId} already exists` });
            continue;
          }
        }

        const newStudent = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          name: s.name,
          chessComId: (s.chessComId ?? s.studentId ?? '') || '',
          gender: s.gender || '',
          dateOfBirth: s.dateOfBirth || '',
          contactPhone: s.contactPhone || '',
          contactEmail: s.contactEmail || '',
          emergencyContactName: s.emergencyContactName || '',
          emergencyContactRelation: s.emergencyContactRelation || '',
          emergencyContactNumber: s.emergencyContactNumber || '',
          organizationId: orgUser.organizationId,
          answerCount: 0,
          totalAnswers: 0,
          correctAnswers: 0,
          level: 1,
          rank: 'Wood',
          rankIndex: 0,
          experience: 0,
          score: 0,
          createdAt: new Date().toISOString(),
          stats: { daily: {}, weekly: {}, monthly: {}, yearly: {} }
        };

        data.students.push(newStudent);
        organization.students.push(newStudent.id);
        createdCount++;
      }

      if (createdCount > 0) {
        data.lastUpdate = new Date().toISOString();
        await writeData(data);
        await writeOrganizations(organizations);
      }

      res.json({ createdCount, errors });
    } catch (error) {
      console.error('Bulk import error:', error);
      res.status(500).json({ error: 'Bulk import failed' });
    }
  });

  // Bulk create students
  app.post('/api/organizations/students/bulk', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const studentsData = req.body; // Array of students
      if (!Array.isArray(studentsData)) {
        return res.status(400).json({ error: 'Expected an array of students' });
      }

      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) return res.status(403).json({ error: 'Organization not found' });

      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === orgUser.organizationId);
      if (!organization) return res.status(404).json({ error: 'Organization not found' });

      const data = await readData();
      let createdCount = 0;
      let errors = [];

      for (const s of studentsData) {
        // Validate Name
        if (!s.name) {
          errors.push({ student: s, error: 'Name missing' });
          continue;
        }

        // Check ID uniqueness (if provided)
        const chessId = (s.chessComId ?? s.studentId ?? '');
        if (chessId) {
          const exists = data.students.find(ex => ex.organizationId === orgUser.organizationId && String(ex.chessComId || '') === String(chessId));
          if (exists) {
            errors.push({ student: s, error: `chess.com ID ${chessId} already exists` });
            continue;
          }
        }

        // Create
        const newStudent = {
          id: `student_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: s.name,
          chessComId: (s.chessComId ?? s.studentId ?? '') || '',
          gender: s.gender || '',
          dateOfBirth: s.dateOfBirth || '',
          contactPhone: s.contactPhone || '',
          contactEmail: s.contactEmail || '',
          emergencyContactName: s.emergencyContactName || '',
          emergencyContactRelation: s.emergencyContactRelation || '',
          emergencyContactNumber: s.emergencyContactNumber || '',
          organizationId: orgUser.organizationId,
          answerCount: 0,
          totalAnswers: 0,
          correctAnswers: 0,
          level: 1,
          rank: 'Wood',
          rankIndex: 0,
          experience: 0,
          score: 0,
          createdAt: new Date().toISOString(),
          stats: { daily: {}, weekly: {}, monthly: {}, yearly: {} }
        };

        data.students.push(newStudent);
        organization.students.push(newStudent.id);
        createdCount++;
      }

      if (createdCount > 0) {
        data.lastUpdate = new Date().toISOString();
        await writeData(data);
        await writeOrganizations(organizations);
        broadcast({ type: 'studentsBulkAdded', count: createdCount });
      }

      res.json({ createdCount, errors });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Bulk import failed' });
    }
  });

  // Check if student ID is available in an organization
  // Backward compatibility: endpoint name keeps `check-id`, but it now checks chess.com ID uniqueness.
  app.get('/api/organizations/:orgId/students/check-id/:studentId', authenticateUser, authorizeRole('organization', 'admin'), async (req, res) => {
    try {
      const { orgId, studentId } = req.params;
      const { excludeId } = req.query; // Optional: exclude this student ID when checking (for editing)

      // Verify organization access
      if (req.user.role === 'organization' && req.user.organizationId !== orgId) {
        return res.status(403).json({ error: 'You can only check student IDs in your organization' });
      }

      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === orgId);
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const data = await readData();
      const existingStudent = data.students.find(s =>
        s.organizationId === orgId &&
        String(s.chessComId || '') === String(studentId || '') &&
        s.id !== excludeId // Exclude current student when editing
      );

      res.json({ available: !existingStudent });
    } catch (error) {
      console.error('Error checking student ID:', error);
      res.status(500).json({ error: 'Failed to check student ID' });
    }
  });
}

module.exports = { registerOrgStudentsRoutes };
