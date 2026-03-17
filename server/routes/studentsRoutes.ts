// Student routes extracted from server.js.
// Includes /api/students* and /api/public/students*.

import { Request, Response, NextFunction } from 'express';

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

  // Get all students data (with data isolation)
  app.get('/api/students', optionalAuth, async (req, res) => {
    try {
      const data = await readData();

      // Filter students by organization if user is authenticated
      let students = data.students;
      if (req.user) {
        // Apply organization filter if user is authenticated
        if (req.user.role === 'admin') {
          // Admin sees all students
        } else if (req.user.role === 'teacher') {
          // Teachers see all students in their organization (for Statistics leaderboard)
          if (req.user.organizationId) {
            students = filterStudentsByOrganization(students, req.user.organizationId);
          } else {
            students = [];
          }
        } else if (req.user.organizationId) {
          // Organization users see all students in their organization
          students = filterStudentsByOrganization(students, req.user.organizationId);
        } else {
          // If user has no organizationId, they see nothing
          students = [];
        }
      }

      // Update ranks for all students based on current scores
      students.forEach(student => {
        const rankInfo = getRankInfo(student.score || 0);
        student.rank = rankInfo.rank;
        student.rankIndex = rankInfo.rankIndex;
        student.level = rankInfo.rankIndex + 1;
      });
      return res.json(students);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to read students data' });
    }
  });

  // Add a new student (deprecated - use /api/organizations/students instead)
  // Kept for backward compatibility, but requires organization authentication
  app.post('/api/students', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const name = (req.body?.name || '').toString();
      // `studentId` historically stored Chess.com ID. New field name: `chessComId`.
      const chessComId = (req.body?.chessComId ?? req.body?.studentId ?? '').toString();
      if (!name || !chessComId) {
        return res.status(400).json({ error: 'Name and chess.com ID are required' });
      }

      // Get user's organization
      const users = await readUsers();
      const user = users.find(u => u.id === req.user.id);
      let organizationId = null;

      if (user) {
        if (user.role === 'organization' && user.organizationId) {
          organizationId = user.organizationId;
        } else if (user.role === 'teacher' && user.organizationId) {
          organizationId = user.organizationId;
        } else if (user.role === 'admin') {
          // Admin can create students but need to specify organizationId
          organizationId = req.body.organizationId;
          if (!organizationId) {
            return res.status(400).json({ error: 'organizationId is required for admin' });
          }
        }
      }

      if (!organizationId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Organization authentication required' });
      }

      const data = await readData();

      // Check if student already exists in this organization
      const exists = data.students.find(s =>
        String(s.chessComId || '') === String(chessComId || '') &&
        (organizationId ? s.organizationId === organizationId : true)
      );
      if (exists) {
        return res.status(400).json({ error: 'chess.com ID already exists' });
      }

      const initialRankInfo = getRankInfo(0);
      const newStudent = {
        id: Date.now().toString(),
        name,
        chessComId,
        organizationId: organizationId,
        answerCount: 0,
        totalAnswers: 0,
        correctAnswers: 0,
        level: 1,
        rank: initialRankInfo.rank || 'Wood',
        rankIndex: initialRankInfo.rankIndex || 0,
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

      // Update organization if exists
      if (organizationId) {
        const organizations = await readOrganizations();
        const organization = organizations.find(o => o.id === organizationId);
        if (organization) {
          organization.students.push(newStudent.id);
          await writeOrganizations(organizations);
        }
      }

      broadcast({ type: 'studentAdded', student: newStudent });
      return res.json(newStudent);
    } catch (error) {
      console.error('Error adding student:', error);
      return res.status(500).json({ error: 'Failed to add student' });
    }
  });

  // Record an answer - changed to accept points (1-n), points added directly without multiplying
  app.post('/api/students/:id/answer', async (req, res) => {
    try {
      const { id } = req.params;
      let { points = 1 } = req.body; // Changed from 'correct' to 'points'

      // Ensure points is a number and not multiplied
      points = parseInt(points, 10);

      if (!points || points < 1 || isNaN(points)) {
        return res.status(400).json({ error: 'Points must be a positive integer' });
      }

      // Debug logging - log what we received
      console.log(`[DEBUG SERVER START] Received request with points: ${points} (type: ${typeof points}), raw body:`, JSON.stringify(req.body));

      const data = await readData();
      const student = data.students.find(s => s.id === id);

      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      // Update student data - points added directly (no multiplication)
      // Force conversion to number and ensure no multiplication happens
      const pointsToAdd = Number(points);
      const oldScore = Number(student.score) || 0;

      // CRITICAL: Direct addition only - NO multiplication, NO factor of 10
      const newScore = oldScore + pointsToAdd;

      student.answerCount = (student.answerCount || 0) + 1;
      student.score = newScore; // Direct addition, NO multiplication
      student.experience = student.score;

      // Ensure score is stored as a number (not string)
      student.score = Number(student.score);

      // Update statistics
      updateStudentStats(student, pointsToAdd);

      // Debug logging - detailed verification
      console.log(`[DEBUG SERVER END] Student: ${student.name}`);
      console.log(`  - Points received from client: ${points}`);
      console.log(`  - Points to add (Number): ${pointsToAdd}`);
      console.log(`  - Old score: ${oldScore}`);
      console.log(`  - Calculation: ${oldScore} + ${pointsToAdd} = ${newScore}`);
      console.log(`  - Final score stored: ${student.score}`);

      // Calculate rank based on score
      const rankInfo = getRankInfo(student.score);
      student.rank = rankInfo.rank;
      student.rankIndex = rankInfo.rankIndex;
      student.level = rankInfo.rankIndex + 1; // Keep level for compatibility

      // Update challenge HP (deduct damage equal to points)
      if (!data.challenge) {
        data.challenge = {
          currentLevel: 1,
          currentHP: LEVELS[0].maxHP,
          completedLevels: [],
          totalDamage: 0,
          selectedStudentIds: []
        };
      }
      if (!data.challenge.selectedStudentIds) {
        data.challenge.selectedStudentIds = [];
      }

      // Resolve org-specific levels (same logic as GET /api/challenge) so that
      // maxHP, reward, and level-up thresholds match what the client displays.
      let levels = LEVELS;
      if (student.organizationId && readOrganizations) {
        try {
          const organizations = await readOrganizations();
          const org = organizations.find(o => o.id === student.organizationId);
          if (org) {
            if (org.settings && org.settings.challengeLevels && org.settings.challengeLevels.levels && org.settings.challengeLevels.levels.length > 0) {
              levels = org.settings.challengeLevels.levels;
            } else if (org.gameConfig && org.gameConfig.classicLevels && org.gameConfig.classicLevels.length > 0) {
              levels = org.gameConfig.classicLevels;
            }
          }
        } catch (_e) { /* fall back to global LEVELS */ }
      }

      const currentLevelInfo = levels[data.challenge.currentLevel - 1] || levels[levels.length - 1] || LEVELS[0];
      if (currentLevelInfo) {
        // Fix currentHP if it exceeds maxHP (due to config changes)
        if (data.challenge.currentHP > currentLevelInfo.maxHP) {
          data.challenge.currentHP = currentLevelInfo.maxHP;
        }

        // Deduct HP equal to points (each point = 1 HP damage)
        const damage = points;
        data.challenge.currentHP = Math.max(0, data.challenge.currentHP - damage);
        data.challenge.totalDamage = (data.challenge.totalDamage || 0) + damage;

        // Check if level is completed
        const levelCompleted = data.challenge.currentHP <= 0;
        let levelReward = null;

        if (levelCompleted && !data.challenge.completedLevels.includes(data.challenge.currentLevel)) {
          levelReward = currentLevelInfo.reward;
          data.challenge.completedLevels.push(data.challenge.currentLevel);

          // Award points only to selected students in Class View
          const selectedIds = data.challenge.selectedStudentIds || [];
          if (selectedIds.length > 0) {
            selectedIds.forEach(studentId => {
              const st = data.students.find(s => s.id === studentId);
              if (st) {
                st.score = (st.score || 0) + levelReward;
                st.experience = st.score;
                const rInfo = getRankInfo(st.score);
                st.rank = rInfo.rank;
                st.rankIndex = rInfo.rankIndex;
                st.level = rInfo.rankIndex + 1;
              }
            });
          }

          // Move to next level
          if (data.challenge.currentLevel < levels.length) {
            data.challenge.currentLevel += 1;
            const nextLevelInfo = levels[data.challenge.currentLevel - 1];
            data.challenge.currentHP = nextLevelInfo.maxHP;
          }

          broadcast({
            type: 'levelCompleted',
            level: data.challenge.currentLevel - 1,
            reward: levelReward,
            students: data.students
          });
        } else {
          broadcast({
            type: 'damageDealt',
            damage: damage,
            currentHP: data.challenge.currentHP,
            maxHP: currentLevelInfo.maxHP,
            level: data.challenge.currentLevel,
            studentName: student.name
          });
        }
      }

      data.lastUpdate = new Date().toISOString();
      await writeData(data);

      broadcast({ type: 'answerRecorded', student, challenge: data.challenge });
      return res.json({ student, challenge: data.challenge });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to record answer' });
    }
  });

  // Update student manually (requires organization, teacher, or admin authentication)
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

  // Public Student Access (No Auth required, Password protected)
  app.get('/api/public/students/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { password } = req.query;

      const data = await readData();
      const student = data.students.find(s => s.id === id);

      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      // Check password protection
      if (student.accessPassword) {
        if (!password || password !== student.accessPassword) {
          // Return protected status
          return res.json({
            protected: true,
            id: student.id,
            name: student.name // Basic info
          });
        }
      }

      // Return student data (public view)
      const rankInfo = getRankInfo(student.score || 0);

      // Teacher-specific ranking (first teacher that has this student assigned)
      let rankInTeacher = null;
      let totalStudentsInTeacher = null;
      try {
        const users = await readUsers();
        const teacher = users.find(u =>
          u.role === 'teacher' &&
          Array.isArray(u.assignedStudents) &&
          u.assignedStudents.includes(student.id)
        );
        if (teacher && Array.isArray(teacher.assignedStudents)) {
          const studentsForTeacher = data.students
            .filter(s => teacher.assignedStudents.includes(s.id))
            .sort((a, b) => (b.score || 0) - (a.score || 0));
          const index = studentsForTeacher.findIndex(s => s.id === student.id);
          if (index !== -1) {
            rankInTeacher = index + 1;
            totalStudentsInTeacher = studentsForTeacher.length;
          }
        }
      } catch (err) {
        console.warn('Unable to compute teacher ranking for public student view:', err);
      }

      const publicData: any = {
        id: student.id,
        name: student.name,
        chessComId: student.chessComId,
        studentId: student.chessComId,
        score: student.score,
        level: rankInfo.rankIndex + 1,
        rank: rankInfo.rank,
        rankIndex: rankInfo.rankIndex,
        nextRank: rankInfo.nextRank,
        progress: rankInfo.progress,
        answerCount: student.answerCount,
        stats: student.stats,
        protected: false,
        rankInTeacher,
        totalStudentsInTeacher
      };

      // Chess.com credentials (teacher-managed; optional)
      try {
        if (typeof getStudentChessComCredentials === 'function' && student.organizationId) {
          const cred = await getStudentChessComCredentials(String(student.organizationId), String(student.id));
          if (cred && typeof cred === 'object') {
            publicData.chessComUsername = cred.chessId != null ? String(cred.chessId) : '';
            publicData.chessComPassword = cred.password != null ? String(cred.password) : '';
            publicData.chessComUpdatedAt = cred.updatedAt != null ? String(cred.updatedAt) : null;
          }
        }
      } catch (e) {
        // Non-fatal: student dashboard can still function without Chess.com creds.
      }

      return res.json(publicData);
    } catch (error) {
      console.error('Error fetching public student:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Public Student Access: V.Chess Platform token (No Auth required, Password protected)
  // Returns a short-lived JWT with role=student so the student can use WebSocket realtime.
  app.get('/api/public/students/:id/vcp-token', async (req, res) => {
    try {
      const { id } = req.params;
      const { password } = req.query;

      const data = await readData();
      const student = data.students.find(s => s.id === id);
      if (!student) return res.status(404).json({ error: 'Student not found' });

      // Check password protection (same rules as public profile)
      if (student.accessPassword) {
        if (!password || password !== student.accessPassword) {
          return res.status(401).json({ error: 'Invalid password' });
        }
      }

      // Mint token with role=student and org context
      const token = generateToken({
        id: String(student.id),
        email: '',
        role: 'student',
        name: String(student.name || 'Student'),
        organizationId: student.organizationId || null
      });

      return res.json({
        ok: true,
        token,
        student: {
          id: String(student.id),
          name: String(student.name || 'Student'),
          chessComId: String(student.chessComId || ''),
          // Backward compatibility
          studentId: String(student.chessComId || '')
        }
      });
    } catch (error) {
      console.error('Error issuing VCP token:', error);
      return res.status(500).json({ error: 'Failed to issue token' });
    }
  });
}

module.exports = { registerStudentsRoutes };


