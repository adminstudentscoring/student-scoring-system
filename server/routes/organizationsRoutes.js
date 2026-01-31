// Organization-related routes extracted from server.js to keep the entry file manageable.
// All route behavior should remain identical.

function registerOrganizationsRoutes(app, deps) {
  const {
    authenticateUser,
    authorizeRole,
    requireOrganizationAccess,
    readUsers,
    writeUsers,
    readOrganizations,
    writeOrganizations,
    readData,
    writeData,
    readCourses,
    writeCourses,
    readPackages,
    writePackages,
    checkExpiredPackages,
    updatePackagesForDeletedCourse,
    readTimetable,
    writeTimetable,
    readEnrollments,
    writeEnrollments,
    broadcast,
    getRankInfo,
    hashPassword,
    generateToken
  } = deps;

  // ==================== Timetable helpers ====================
  function isYmd(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  }

  function parseYmdToUtcMs(ymd) {
    if (!isYmd(ymd)) return null;
    const ms = Date.parse(`${ymd}T00:00:00.000Z`);
    return Number.isFinite(ms) ? ms : null;
  }

  function utcMsToYmd(ms) {
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function computeNextAvailableDateSameEntry({ entry, fromDate, holidaySet, enrollments, studentId }) {
    // Only supports recurring entries (weekly schedule).
    if (!entry || !entry.isRecurring) return null;
    if (!isYmd(fromDate)) return null;

    const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    const dowSet = new Set((Array.isArray(entry?.dayOfWeek) ? entry.dayOfWeek : []).map(d => dayMap[d]).filter(v => v !== undefined));
    const startBoundary = entry.startDate ? String(entry.startDate).split('T')[0] : null;
    const endBoundary = entry.endDate ? String(entry.endDate).split('T')[0] : null;

    const exceptions = Array.isArray(entry?.exceptions) ? entry.exceptions : [];
    const exceptionSet = new Set(exceptions.filter(isYmd));

    const allStudentDates = new Set((Array.isArray(enrollments) ? enrollments : [])
      .filter(e =>
        String(e?.studentId) === String(studentId) &&
        String(e?.timetableEntryId) === String(entry.id) &&
        isYmd(e?.date)
      )
      .map(e => e.date)
    );

    const baseMs = parseYmdToUtcMs(fromDate);
    if (baseMs == null) return null;

    for (let i = 1; i <= 365; i++) {
      const ms = baseMs + i * 86400000;
      const ds = utcMsToYmd(ms);

      if (startBoundary && ds < startBoundary) continue;
      if (endBoundary && ds > endBoundary) break;

      if (dowSet.size > 0) {
        const dow = new Date(ms).getUTCDay();
        if (!dowSet.has(dow)) continue;
      }
      if (exceptionSet.has(ds)) continue;
      if (holidaySet && holidaySet.has(ds)) continue;
      if (allStudentDates.has(ds)) continue;

      return ds;
    }

    return null;
  }

  // Initialize teacher fields (ensure contactPhone and remark exist)
  function initializeTeacherFields(teacher) {
    if (!teacher || teacher.role !== 'teacher') return teacher;

    if (teacher.contactPhone === undefined) {
      teacher.contactPhone = null;
    }
    if (teacher.remark === undefined) {
      teacher.remark = null;
    }

    return teacher;
  }

  // ==================== Organization Management API ====================

  // Organization creates a teacher (requires organization authentication)
  app.post('/api/organizations/teachers', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { name, teacherId, gender, username, password } = req.body;

      // Validation
      if (!name || !teacherId || !gender || !username || !password) {
        return res.status(400).json({ error: 'Name, teacher ID, gender, username, and password are required' });
      }

      // Password validation
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      // Get organization
      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === orgUser.organizationId);
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // Check if username already exists
      const existingUser = users.find(u => u.email === username.toLowerCase() || u.username === username);
      if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
      }

      // Check if teacher ID already exists in this organization
      const existingTeacher = users.find(u =>
        u.organizationId === orgUser.organizationId &&
        u.role === 'teacher' &&
        u.teacherId === teacherId
      );
      if (existingTeacher) {
        return res.status(400).json({ error: 'Teacher ID already exists in this organization' });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create teacher user
      const newTeacher = {
        id: Date.now().toString(),
        email: username.toLowerCase(),
        username: username,
        password: hashedPassword,
        name,
        teacherId,
        gender,
        role: 'teacher',
        organizationId: orgUser.organizationId,
        createdAt: new Date().toISOString(),
        classViewStudents: [], // Students selected for Class View
        assignedStudents: [] // Students assigned by organization (many-to-many)
      };

      users.push(newTeacher);
      await writeUsers(users);

      // Update organization
      organization.teachers.push(newTeacher.id);
      await writeOrganizations(organizations);

      // Return teacher info (without password)
      const { password: _, ...teacherWithoutPassword } = newTeacher;
      res.status(201).json({
        teacher: teacherWithoutPassword
      });
    } catch (error) {
      console.error('Error creating teacher:', error);
      res.status(500).json({ error: 'Failed to create teacher' });
    }
  });

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
        gender: gender || '',
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

  // ==================== Organization Management API (continued) ====================

  // Get organization's teachers (organization only)
  app.get('/api/organizations/teachers', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const users = await readUsers();
      console.log(`[DEBUG] GET /teachers. Req User ID: ${req.user.id}`);

      const orgUser = users.find(u => u.id === req.user.id);

      if (!orgUser) {
        console.log(`[DEBUG] Org User NOT FOUND in users list. ID: ${req.user.id}`);
        return res.status(403).json({ error: 'Organization user not found in DB' });
      }

      if (!orgUser.organizationId) {
        console.log(`[DEBUG] Org User has NO organizationId. ID: ${req.user.id}`);
        return res.status(403).json({ error: 'Organization not found' });
      }

      // Get all teachers in this organization
      const teachers = users.filter(u =>
        u.organizationId === orgUser.organizationId &&
        u.role === 'teacher'
      );

      console.log(`[DEBUG] GET /teachers: Found ${teachers.length} teachers for Org ${orgUser.organizationId}`);

      // Initialize teacher fields and remove passwords
      const teachersWithoutPasswords = teachers.map(t => {
        initializeTeacherFields(t);
        const { password: _, ...teacherWithoutPassword } = t;
        return teacherWithoutPassword;
      });

      res.json(teachersWithoutPasswords);
    } catch (error) {
      console.error('Error getting teachers:', error);
      res.status(500).json({ error: 'Failed to get teachers' });
    }
  });

  // Update teacher permissions
  app.put('/api/organizations/teachers/:teacherId/permissions', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { teacherId } = req.params;
      const permissions = req.body; // Expect { addStudent: true/false, ... }

      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const teacherIndex = users.findIndex(u => u.id === teacherId && u.role === 'teacher' && u.organizationId === orgUser.organizationId);
      if (teacherIndex === -1) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

      // Initialize if not exists
      if (!users[teacherIndex].teacherPermissions) {
        users[teacherIndex].teacherPermissions = {};
      }

      // Merge permissions
      users[teacherIndex].teacherPermissions = {
        ...users[teacherIndex].teacherPermissions,
        ...permissions
      };

      await writeUsers(users);

      res.json({ message: 'Permissions updated', permissions: users[teacherIndex].teacherPermissions });
    } catch (error) {
      console.error('Error updating permissions:', error);
      res.status(500).json({ error: 'Failed to update permissions' });
    }
  });

  // Organization deletes a teacher
  app.delete('/api/organizations/teachers/:teacherId', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { teacherId } = req.params;

      // Get organization
      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      // Verify teacher belongs to organization
      const teacherIndex = users.findIndex(u => u.id === teacherId && u.role === 'teacher' && u.organizationId === orgUser.organizationId);
      if (teacherIndex === -1) {
        return res.status(404).json({ error: 'Teacher not found or does not belong to your organization' });
      }

      // Remove teacher from users
      users.splice(teacherIndex, 1);
      await writeUsers(users);

      // Remove teacher from organization
      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === orgUser.organizationId);
      if (organization) {
        organization.teachers = organization.teachers.filter(id => id !== teacherId);
        await writeOrganizations(organizations);
      }

      res.json({ message: 'Teacher deleted successfully' });
    } catch (error) {
      console.error('Error deleting teacher:', error);
      res.status(500).json({ error: 'Failed to delete teacher' });
    }
  });

  // Organization or Admin login as teacher (impersonation)
  app.post('/api/organizations/teachers/:teacherId/login-as', authenticateUser, authorizeRole('organization', 'admin'), async (req, res) => {
    try {
      const { teacherId } = req.params;

      // Get users
      const users = await readUsers();
      const teacher = users.find(u => u.id === teacherId && u.role === 'teacher');

      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

      // Verify organization access
      // If current user is organization (not admin), verify teacher belongs to their organization
      if (req.user.role === 'organization') {
        const orgUser = users.find(u => u.id === req.user.id);
        if (!orgUser || !orgUser.organizationId) {
          return res.status(403).json({ error: 'Organization not found' });
        }

        if (teacher.organizationId !== orgUser.organizationId) {
          return res.status(403).json({ error: 'You don\'t have permission to login as this teacher' });
        }
      }
      // Admin can login as any teacher

      // Generate token for teacher
      const token = generateToken(teacher);

      // Return user info (without password)
      const { password: _, ...teacherWithoutPassword } = teacher;

      // Include organization info if teacher has organizationId
      if (teacher.organizationId) {
        const organizations = await readOrganizations();
        const organization = organizations.find(o => o.id === teacher.organizationId);
        if (organization) {
          teacherWithoutPassword.organization = organization;
        }
      }

      res.json({
        user: teacherWithoutPassword,
        token
      });
    } catch (error) {
      console.error('Error logging in as teacher:', error);
      res.status(500).json({ error: 'Failed to login as teacher' });
    }
  });

  // Update teacher information (organization and admin)
  app.put('/api/organizations/teachers/:teacherId', authenticateUser, authorizeRole('organization', 'admin'), async (req, res) => {
    try {
      const { teacherId } = req.params;
      const { name, teacherId: newTeacherId, gender, email, contactPhone, remark } = req.body;

      // Get users
      const users = await readUsers();
      const teacherIndex = users.findIndex(u => u.id === teacherId && u.role === 'teacher');

      if (teacherIndex === -1) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

      const teacher = users[teacherIndex];

      // Verify organization access
      if (req.user.role === 'organization') {
        const orgUser = users.find(u => u.id === req.user.id);
        if (!orgUser || !orgUser.organizationId) {
          return res.status(403).json({ error: 'Organization not found' });
        }

        if (teacher.organizationId !== orgUser.organizationId) {
          return res.status(403).json({ error: 'You don\'t have permission to update this teacher' });
        }
      }
      // Admin can update any teacher

      // Validation
      if (name !== undefined) {
        if (!name || name.trim().length === 0) {
          return res.status(400).json({ error: 'Teacher name is required' });
        }
        if (name.length > 100) {
          return res.status(400).json({ error: 'Teacher name must be 100 characters or less' });
        }
        teacher.name = name.trim();
      }

      if (newTeacherId !== undefined) {
        if (!newTeacherId || newTeacherId.trim().length === 0) {
          return res.status(400).json({ error: 'Teacher ID is required' });
        }
        if (newTeacherId.length > 50) {
          return res.status(400).json({ error: 'Teacher ID must be 50 characters or less' });
        }

        // Check if teacher ID already exists in this organization (excluding current teacher)
        const existingTeacher = users.find(u =>
          u.id !== teacherId &&
          u.organizationId === teacher.organizationId &&
          u.role === 'teacher' &&
          u.teacherId === newTeacherId.trim()
        );

        if (existingTeacher) {
          return res.status(400).json({ error: 'Teacher ID already exists in this organization' });
        }

        teacher.teacherId = newTeacherId.trim();
      }

      if (gender !== undefined) {
        if (gender && gender !== 'male' && gender !== 'female') {
          return res.status(400).json({ error: 'Gender must be male or female' });
        }
        teacher.gender = gender || null;
      }

      if (email !== undefined) {
        // Email is optional, no format validation, no uniqueness check
        teacher.email = email ? email.trim().toLowerCase() : null;
        // Also update username if email is provided (for backward compatibility)
        if (email) {
          teacher.username = email.trim().toLowerCase();
        }
      }

      if (contactPhone !== undefined) {
        if (contactPhone && contactPhone.length > 20) {
          return res.status(400).json({ error: 'Contact phone must be 20 characters or less' });
        }
        teacher.contactPhone = contactPhone ? contactPhone.trim() : null;
      }

      if (remark !== undefined) {
        if (remark && remark.length > 1000) {
          return res.status(400).json({ error: 'Remark must be 1000 characters or less' });
        }
        teacher.remark = remark ? remark.trim() : null;
      }

      // Update updatedAt timestamp
      teacher.updatedAt = new Date().toISOString();

      users[teacherIndex] = teacher;
      await writeUsers(users);

      // Return teacher info (without password)
      const { password: _, ...teacherWithoutPassword } = teacher;

      res.json(teacherWithoutPassword);
    } catch (error) {
      console.error('Error updating teacher:', error);
      res.status(500).json({ error: 'Failed to update teacher' });
    }
  });

  // ==================== Organization Student Assignment API ====================

  // Organization assigns students to teachers (many-to-many)
  app.post('/api/organizations/assign-students', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { teacherId, studentIds } = req.body;

      if (!teacherId || !Array.isArray(studentIds)) {
        return res.status(400).json({ error: 'teacherId and studentIds array are required' });
      }

      // Get organization
      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      // Verify teacher belongs to organization
      const teacher = users.find(u => u.id === teacherId && u.role === 'teacher' && u.organizationId === orgUser.organizationId);
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found or does not belong to your organization' });
      }

      // Verify all students belong to the organization
      const data = await readData();
      const validStudents = data.students.filter(s =>
        studentIds.includes(s.id) && s.organizationId === orgUser.organizationId
      );

      if (validStudents.length !== studentIds.length) {
        return res.status(400).json({ error: 'Some students not found or do not belong to your organization' });
      }

      // Update teacher's assigned students
      teacher.assignedStudents = studentIds;

      const userIndex = users.findIndex(u => u.id === teacher.id);
      users[userIndex] = teacher;
      await writeUsers(users);

      res.json({
        message: 'Students assigned successfully',
        teacherId: teacherId,
        assignedStudentIds: studentIds,
        students: validStudents
      });
    } catch (error) {
      console.error('Error assigning students:', error);
      res.status(500).json({ error: 'Failed to assign students' });
    }
  });

  // Organization gets students assigned to a teacher
  app.get('/api/organizations/teachers/:teacherId/students', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { teacherId } = req.params;

      // Get organization
      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      // Verify teacher belongs to organization
      const teacher = users.find(u => u.id === teacherId && u.role === 'teacher' && u.organizationId === orgUser.organizationId);
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

      // Get all students in organization
      const data = await readData();
      const allStudents = data.students.filter(s => s.organizationId === orgUser.organizationId);
      const assignedStudentIds = teacher.assignedStudents || [];
      const assignedStudents = allStudents.filter(s => assignedStudentIds.includes(s.id));

      res.json({
        allStudents: allStudents,
        assignedStudents: assignedStudents,
        assignedStudentIds: assignedStudentIds
      });
    } catch (error) {
      console.error('Error getting assigned students:', error);
      res.status(500).json({ error: 'Failed to get assigned students' });
    }
  });

  // ==================== Organization Settings API ====================

  // Get Class View settings (teacher/organization/admin)
  // - Organization admins configure these in Organization Dashboard -> Settings -> Class View Management
  // - Teachers (Class View page) read only the relevant subset to decide whether to enable Challenge mode
  app.get('/api/class-view/settings', authenticateUser, authorizeRole('organization', 'teacher', 'admin'), requireOrganizationAccess, async (req, res) => {
    try {
      const organizations = await readOrganizations();

      let organizationId = req.organizationFilter;
      // Admin may not have organizationFilter; allow explicit orgId query (optional)
      if (req.user.role === 'admin' && !organizationId) {
        organizationId = req.query.orgId;
      }
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization not specified' });
      }

      const organization = organizations.find(o => o.id === organizationId);
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const defaultClassViewMode = {
        enabled: true,
        rewardRule: 'fixed',
        hpCalculation: 'byScore',
        hpMultiplier: 1
      };

      const defaultChallengeLevels = {
        levels: [
          { level: 1, name: 'Slime', maxHP: 50, reward: 10, emoji: '🟢' },
          { level: 2, name: 'Goblin', maxHP: 100, reward: 20, emoji: '👺' },
          { level: 3, name: 'Orc', maxHP: 150, reward: 30, emoji: '👹' },
          { level: 4, name: 'Dragon', maxHP: 250, reward: 40, emoji: '🐉' },
          { level: 5, name: 'Demon', maxHP: 400, reward: 50, emoji: '😈' }
        ]
      };

      const savedSettings = organization.settings || {};
      const classViewMode = { ...defaultClassViewMode, ...(savedSettings.classViewMode || {}) };
      const challengeLevels = savedSettings.challengeLevels || defaultChallengeLevels;

      res.json({
        classViewMode,
        challengeLevels
      });
    } catch (error) {
      console.error('Error getting class view settings:', error);
      res.status(500).json({ error: 'Failed to get class view settings' });
    }
  });

  // Get organization settings
  app.get('/api/organizations/settings', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);

      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === orgUser.organizationId);

      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // Return settings or default settings if not set
      const defaultSettings = {
        teacherPermissions: {
          canCreateStudents: true,
          canDeleteStudents: true,
          canModifyScores: true,
          canUseClassView: true,
          canResetScores: true,
          canViewStatistics: true
        },
        studentPermissions: {
          canViewLeaderboard: true,
          canViewOtherScores: true,
          canViewOwnDetails: true
        },
        classViewMode: {
          enabled: true,
          rewardRule: 'fixed',
          hpCalculation: 'byScore',
          hpMultiplier: 1
        },
        studentLevelUp: {
          experiencePerLevel: 100,
          rankSystem: {
            enabled: true,
            baseScore: 50,
            multiplier: 2
          }
        },
        displaySettings: {
          leaderboardCount: 10,
          showScore: true,
          showLevel: true,
          showRank: true,
          themeColor: '#667eea',
          fontSize: 'medium'
        },
        scheduleSettings: {
          classTimes: [],
          autoSaveEnabled: true,
          autoSaveInterval: 30,
          holidays: [], // ['YYYY-MM-DD'] dates to skip in timetable + auto-renew
          holidayRules: [] // [{ id, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', reason }]
        },
        scoringRules: {
          correctAnswerPoints: 10,
          incorrectAnswerPoints: 2,
          customRules: []
        },
        challengeLevels: {
          levels: [
            { level: 1, name: 'Slime', maxHP: 50, reward: 10, emoji: '🟢' },
            { level: 2, name: 'Goblin', maxHP: 100, reward: 20, emoji: '👺' },
            { level: 3, name: 'Orc', maxHP: 150, reward: 30, emoji: '👹' },
            { level: 4, name: 'Dragon', maxHP: 250, reward: 40, emoji: '🐉' },
            { level: 5, name: 'Demon', maxHP: 400, reward: 50, emoji: '😈' },
            { level: 6, name: 'Boss Lv1', maxHP: 650, reward: 60, emoji: '👑' },
            { level: 7, name: 'Boss Lv2', maxHP: 1050, reward: 75, emoji: '👑' },
            { level: 8, name: 'Boss Lv3', maxHP: 1700, reward: 100, emoji: '👑' },
            { level: 9, name: 'Boss Lv4', maxHP: 2750, reward: 125, emoji: '👑' },
            { level: 10, name: 'Final Boss', maxHP: 4450, reward: 150, emoji: '👑' }
          ]
        },
        backupSettings: {
          autoBackupEnabled: true,
          backupFrequency: 'daily',
          backupRetention: 7
        },
        notificationSettings: {
          websocketUpdateFrequency: 1000,
          soundEnabled: false,
          notificationMethod: 'websocket'
        },
        organizationInfo: {
          logo: '',
          primaryColor: '#667eea',
          secondaryColor: '#764ba2'
        },
        securitySettings: {
          passwordMinLength: 6,
          maxLoginAttempts: 5,
          sessionTimeout: 3600000
        },
        salesSettings: {
          receipt: {
            logo: '',
            remark: 'Make-up Lesson Arrangements:\n- All make-up class quotas must be used within two months.\n- Sessions cannot be postponed under any circumstances.\n- Classes canceled by Typhoon/Rainstorm will be arranged via Zoom or face-to-face.\n- Must apply for leave at least 2 hours before class.'
          },
          paymentReminder: {
            logo: '',
            remark: 'Make-up Lesson Arrangements:\n- All make-up class quotas must be used within two months.\n- Sessions cannot be postponed under any circumstances.\n- Classes canceled by Typhoon/Rainstorm will be arranged via Zoom or face-to-face.\n- Must apply for leave at least 2 hours before class.',
            paymentMethod: '',
            qrCode: ''
          },
          whatsapp: {
            enabled: false,
            provider: 'meta_cloud',
            accessToken: '',
            phoneNumberId: '',
            wabaId: '',
            templateName: ''
          }
        }
      };

      // Merge default settings with saved settings
      const savedSettings = organization.settings || {};
      const mergedSettings = {
        ...defaultSettings,
        ...savedSettings,
        teacherPermissions: { ...defaultSettings.teacherPermissions, ...(savedSettings.teacherPermissions || {}) },
        studentPermissions: { ...defaultSettings.studentPermissions, ...(savedSettings.studentPermissions || {}) },
        classViewMode: { ...defaultSettings.classViewMode, ...(savedSettings.classViewMode || {}) },
        studentLevelUp: {
          ...defaultSettings.studentLevelUp,
          ...(savedSettings.studentLevelUp || {}),
          rankSystem: { ...defaultSettings.studentLevelUp.rankSystem, ...(savedSettings.studentLevelUp?.rankSystem || {}) }
        },
        displaySettings: { ...defaultSettings.displaySettings, ...(savedSettings.displaySettings || {}) },
        scheduleSettings: { ...defaultSettings.scheduleSettings, ...(savedSettings.scheduleSettings || {}) },
        scoringRules: { ...defaultSettings.scoringRules, ...(savedSettings.scoringRules || {}) },
        challengeLevels: savedSettings.challengeLevels || defaultSettings.challengeLevels,
        backupSettings: { ...defaultSettings.backupSettings, ...(savedSettings.backupSettings || {}) },
        notificationSettings: { ...defaultSettings.notificationSettings, ...(savedSettings.notificationSettings || {}) },
        organizationInfo: { ...defaultSettings.organizationInfo, ...(savedSettings.organizationInfo || {}) },
        securitySettings: { ...defaultSettings.securitySettings, ...(savedSettings.securitySettings || {}) },
        salesSettings: {
          ...defaultSettings.salesSettings,
          ...(savedSettings.salesSettings || {}),
          receipt: { ...defaultSettings.salesSettings.receipt, ...(savedSettings.salesSettings?.receipt || {}) },
          paymentReminder: { ...defaultSettings.salesSettings.paymentReminder, ...(savedSettings.salesSettings?.paymentReminder || {}) },
          whatsapp: { ...defaultSettings.salesSettings.whatsapp, ...(savedSettings.salesSettings?.whatsapp || {}) }
        }
      };

      res.json(mergedSettings);
    } catch (error) {
      console.error('Error getting organization settings:', error);
      res.status(500).json({ error: 'Failed to get organization settings' });
    }
  });

  // Update organization settings
  app.put('/api/organizations/settings', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const settings = req.body;

      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Settings data is required' });
      }

      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);

      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === orgUser.organizationId);

      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // Option A: when newly-added holiday dates are saved, auto-postpone enrollments on those dates.
      let holidayAutoPostpone = null;
      try {
        const oldHolidays = Array.isArray(organization?.settings?.scheduleSettings?.holidays)
          ? organization.settings.scheduleSettings.holidays
          : [];
        const newHolidays = Array.isArray(settings?.scheduleSettings?.holidays)
          ? settings.scheduleSettings.holidays
          : [];

        const oldSet = new Set(oldHolidays.filter(isYmd));
        const newSet = new Set(newHolidays.filter(isYmd));
        const added = Array.from(newSet).filter(d => !oldSet.has(d));

        // Apply to ALL holiday dates currently configured (so existing holidays also take effect immediately),
        // while still reporting newly-added dates for debugging.
        if (newSet.size > 0) {
          const holidaySet = newSet;

          const timetableData = await readTimetable();
          const entryById = new Map(
            (timetableData?.entries || [])
              .filter(e => String(e?.organizationId) === String(orgUser.organizationId))
              .map(e => [String(e.id), e])
          );

          const enrollments = await readEnrollments();
          let moved = 0;
          let skipped = 0;

          for (let i = enrollments.length - 1; i >= 0; i--) {
            const enr = enrollments[i];
            if (!enr) continue;
            if (String(enr.organizationId) !== String(orgUser.organizationId)) continue;
            if (!holidaySet.has(enr.date)) continue;

            const entry = entryById.get(String(enr.timetableEntryId));
            if (!entry || !entry.isRecurring) {
              skipped++;
              continue;
            }

            const targetDate = computeNextAvailableDateSameEntry({
              entry,
              fromDate: enr.date,
              holidaySet,
              enrollments,
              studentId: enr.studentId
            });

            if (!targetDate) {
              skipped++;
              continue;
            }

            // Remove original holiday enrollment, create the moved enrollment
            enrollments.splice(i, 1);

            const nowIso = new Date().toISOString();
            const baseNote = `Holiday postponed from ${enr.date} (${enr.timetableEntryId})`;
            const nextNotes = typeof enr.notes === 'string' && enr.notes.trim()
              ? `${enr.notes}\n${baseNote}`
              : baseNote;

            enrollments.push({
              ...enr,
              id: `enr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              date: targetDate,
              type: 'single',
              notes: nextNotes,
              createdAt: nowIso,
              postponedFrom: {
                entryId: enr.timetableEntryId,
                date: enr.date,
                reason: 'holiday_auto_postpone',
                holidayDate: enr.date
              }
            });
            moved++;
          }

          if (moved > 0) {
            await writeEnrollments(enrollments);
          }

          holidayAutoPostpone = { holidayDates: Array.from(holidaySet).sort(), addedHolidayDates: added, moved, skipped };
        }
      } catch (e) {
        console.error('[holiday] auto-postpone failed:', e);
        holidayAutoPostpone = { error: 'auto-postpone failed' };
      }

      // Update settings
      organization.settings = settings;
      organization.updatedAt = new Date().toISOString();

      const orgIndex = organizations.findIndex(o => o.id === organization.id);
      organizations[orgIndex] = organization;
      await writeOrganizations(organizations);

      res.json({
        message: 'Settings saved successfully',
        settings: organization.settings,
        holidayAutoPostpone
      });
    } catch (error) {
      console.error('Error updating organization settings:', error);
      res.status(500).json({ error: 'Failed to update organization settings' });
    }
  });

  // Reset organization settings to default
  app.post('/api/organizations/settings/reset', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { category } = req.body; // Optional: reset specific category or all if not provided

      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);

      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === orgUser.organizationId);

      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // If category is specified, reset only that category
      if (category && organization.settings) {
        // Reset specific category logic would go here
        // For now, we'll reset all settings
        organization.settings = {};
      } else {
        // Reset all settings
        organization.settings = {};
      }

      organization.updatedAt = new Date().toISOString();

      const orgIndex = organizations.findIndex(o => o.id === organization.id);
      organizations[orgIndex] = organization;
      await writeOrganizations(organizations);

      res.json({
        message: 'Settings reset successfully',
        settings: organization.settings
      });
    } catch (error) {
      console.error('Error resetting organization settings:', error);
      res.status(500).json({ error: 'Failed to reset organization settings' });
    }
  });

  // ==================== Course Management API ====================

  // Get all courses for an organization (organization and admin)
  app.get('/api/organizations/courses', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const courses = await readCourses();

      // Filter by organization
      let filteredCourses = courses;
      if (req.organizationFilter) {
        filteredCourses = courses.filter(c => c.organizationId === req.organizationFilter);
      }

      // Sort by createdAt (newest first) by default
      filteredCourses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      res.json(filteredCourses);
    } catch (error) {
      console.error('Error getting courses:', error);
      res.status(500).json({ error: 'Failed to get courses' });
    }
  });

  // Create a new course (organization and admin)
  app.post('/api/organizations/courses', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const { name, price, color } = req.body;

      // Validation
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Course name is required' });
      }

      if (name.length > 50) {
        return res.status(400).json({ error: 'Course name must be 50 characters or less' });
      }

      if (price === undefined || price === null) {
        return res.status(400).json({ error: 'Price is required' });
      }

      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ error: 'Price must be a valid number greater than or equal to 0' });
      }

      // Validate color format if provided
      if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
        return res.status(400).json({ error: 'Color must be in #RRGGBB format' });
      }

      // Get organization ID
      let organizationId;
      if (req.user.role === 'admin') {
        // Admin can specify organizationId in body, or use organizationFilter if provided
        organizationId = req.body.organizationId || req.organizationFilter;
        if (!organizationId) {
          return res.status(400).json({ error: 'organizationId is required for admin' });
        }
      } else {
        organizationId = req.user.organizationId || req.organizationFilter;
        if (!organizationId) {
          return res.status(403).json({ error: 'Organization not found' });
        }
      }

      // Check if course name already exists in this organization
      const courses = await readCourses();
      const existingCourse = courses.find(c =>
        c.organizationId === organizationId &&
        c.name.toLowerCase().trim() === name.toLowerCase().trim()
      );

      if (existingCourse) {
        return res.status(400).json({ error: 'Course name already exists in this organization' });
      }

      // Create new course
      const newCourse = {
        id: `course_${Date.now()}`,
        organizationId: organizationId,
        name: name.trim(),
        price: priceNum,
        color: color || null,
        category: null,
        level: null,
        description: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      courses.push(newCourse);
      await writeCourses(courses);

      res.status(201).json(newCourse);
    } catch (error) {
      console.error('Error creating course:', error);
      res.status(500).json({ error: 'Failed to create course' });
    }
  });

  // Update a course (organization and admin)
  app.put('/api/organizations/courses/:id', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, price, color } = req.body;

      const courses = await readCourses();
      const courseIndex = courses.findIndex(c => c.id === id);

      if (courseIndex === -1) {
        return res.status(404).json({ error: 'Course not found' });
      }

      const course = courses[courseIndex];

      // Check organization access
      if (req.organizationFilter && course.organizationId !== req.organizationFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Validation
      if (name !== undefined) {
        if (!name || name.trim().length === 0) {
          return res.status(400).json({ error: 'Course name is required' });
        }
        if (name.length > 50) {
          return res.status(400).json({ error: 'Course name must be 50 characters or less' });
        }

        // Check if course name already exists in this organization (excluding current course)
        const existingCourse = courses.find(c =>
          c.id !== id &&
          c.organizationId === course.organizationId &&
          c.name.toLowerCase().trim() === name.toLowerCase().trim()
        );

        if (existingCourse) {
          return res.status(400).json({ error: 'Course name already exists in this organization' });
        }

        course.name = name.trim();
      }

      if (price !== undefined) {
        const priceNum = parseFloat(price);
        if (isNaN(priceNum) || priceNum < 0) {
          return res.status(400).json({ error: 'Price must be a valid number greater than or equal to 0' });
        }
        course.price = priceNum;
      }

      if (color !== undefined) {
        if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
          return res.status(400).json({ error: 'Color must be in #RRGGBB format' });
        }
        course.color = color || null;
      }

      course.updatedAt = new Date().toISOString();

      courses[courseIndex] = course;
      await writeCourses(courses);

      res.json(course);
    } catch (error) {
      console.error('Error updating course:', error);
      res.status(500).json({ error: 'Failed to update course' });
    }
  });

  // Delete a single course (organization and admin)
  app.delete('/api/organizations/courses/:id', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const { id } = req.params;

      const courses = await readCourses();
      const courseIndex = courses.findIndex(c => c.id === id);

      if (courseIndex === -1) {
        return res.status(404).json({ error: 'Course not found' });
      }

      const course = courses[courseIndex];

      // Check organization access
      if (req.organizationFilter && course.organizationId !== req.organizationFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // TODO: Check if course is in use (when schedule feature is implemented)

      // Update packages that contain this course
      await updatePackagesForDeletedCourse(id);

      courses.splice(courseIndex, 1);
      await writeCourses(courses);

      res.json({ message: 'Course deleted successfully' });
    } catch (error) {
      console.error('Error deleting course:', error);
      res.status(500).json({ error: 'Failed to delete course' });
    }
  });

  // Delete multiple courses (organization and admin)
  app.delete('/api/organizations/courses', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const { courseIds } = req.body;

      if (!Array.isArray(courseIds) || courseIds.length === 0) {
        return res.status(400).json({ error: 'courseIds array is required' });
      }

      const courses = await readCourses();
      let deletedCount = 0;

      // Filter courses to delete
      const coursesToDelete = courses.filter(c => {
        // Check organization access
        if (req.organizationFilter && c.organizationId !== req.organizationFilter) {
          return false;
        }
        return courseIds.includes(c.id);
      });

      // Remove courses
      const remainingCourses = courses.filter(c => !courseIds.includes(c.id) ||
        (req.organizationFilter && c.organizationId !== req.organizationFilter));

      deletedCount = coursesToDelete.length;

      await writeCourses(remainingCourses);

      res.json({
        message: `${deletedCount} course(s) deleted successfully`,
        deletedCount
      });
    } catch (error) {
      console.error('Error deleting courses:', error);
      res.status(500).json({ error: 'Failed to delete courses' });
    }
  });

  // ==================== Course Package Management API ====================

  // Get all packages for an organization (organization and admin)
  app.get('/api/organizations/packages', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      // Check and update expired packages
      let packages = await checkExpiredPackages();

      // Filter by organization
      if (req.organizationFilter) {
        packages = packages.filter(p => p.organizationId === req.organizationFilter);
      }

      // Sort by createdAt (newest first) by default
      packages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      res.json(packages);
    } catch (error) {
      console.error('Error getting packages:', error);
      res.status(500).json({ error: 'Failed to get packages' });
    }
  });

  // Create a new package (organization and admin)
  app.post('/api/organizations/packages', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const { name, courses, priceStrategy, fixedPrice, discountPercentage, customPrice, monthlyLessonPrice, monthlyPeriod, description, startDate, endDate, status } = req.body;

      // Validation
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Package name is required' });
      }

      if (name.length > 50) {
        return res.status(400).json({ error: 'Package name must be 50 characters or less' });
      }

      if (!Array.isArray(courses) || courses.length === 0) {
        return res.status(400).json({ error: 'At least one course is required' });
      }

      // Validate courses array
      for (const course of courses) {
        if (!course.courseId || !course.quantity) {
          return res.status(400).json({ error: 'Each course must have courseId and quantity' });
        }
        if (typeof course.quantity !== 'number' || course.quantity < 1 || course.quantity > 999 || !Number.isInteger(course.quantity)) {
          return res.status(400).json({ error: 'Quantity must be an integer between 1 and 999' });
        }
      }

      // Validate price strategy
      if (!priceStrategy || !['fixed', 'discount', 'custom', 'monthly'].includes(priceStrategy)) {
        return res.status(400).json({ error: 'Price strategy must be fixed, discount, custom, or monthly' });
      }

      // Validate price based on strategy
      if (priceStrategy === 'fixed') {
        if (fixedPrice === undefined || fixedPrice === null) {
          return res.status(400).json({ error: 'Fixed price is required for fixed price strategy' });
        }
        const priceNum = parseFloat(fixedPrice);
        if (isNaN(priceNum) || priceNum < 0) {
          return res.status(400).json({ error: 'Fixed price must be a valid number greater than or equal to 0' });
        }
      } else if (priceStrategy === 'discount') {
        if (discountPercentage === undefined || discountPercentage === null) {
          return res.status(400).json({ error: 'Discount percentage is required for discount strategy' });
        }
        const discountNum = parseFloat(discountPercentage);
        if (isNaN(discountNum) || discountNum < 0 || discountNum > 100) {
          return res.status(400).json({ error: 'Discount percentage must be a number between 0 and 100' });
        }
      } else if (priceStrategy === 'custom') {
        if (customPrice === undefined || customPrice === null) {
          return res.status(400).json({ error: 'Custom price is required for custom price strategy' });
        }
        const priceNum = parseFloat(customPrice);
        if (isNaN(priceNum) || priceNum < 0) {
          return res.status(400).json({ error: 'Custom price must be a valid number greater than or equal to 0' });
        }
      } else if (priceStrategy === 'monthly') {
        if (monthlyLessonPrice === undefined || monthlyLessonPrice === null || monthlyPeriod === undefined || monthlyPeriod === null) {
          return res.status(400).json({ error: 'Monthly price and period are required' });
        }
        const priceNum = parseFloat(monthlyLessonPrice);
        const periodNum = parseInt(monthlyPeriod);
        if (isNaN(priceNum) || priceNum < 0) {
          return res.status(400).json({ error: 'Monthly price must be >= 0' });
        }
        if (isNaN(periodNum) || periodNum < 1) {
          return res.status(400).json({ error: 'Period must be >= 1' });
        }
      }

      // Validate dates if provided
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return res.status(400).json({ error: 'Invalid date format' });
        }
        if (end <= start) {
          return res.status(400).json({ error: 'End date must be after start date' });
        }
      }

      // Validate description length
      if (description && description.length > 500) {
        return res.status(400).json({ error: 'Description must be 500 characters or less' });
      }

      // Get organization ID
      let organizationId;
      if (req.user.role === 'admin') {
        organizationId = req.body.organizationId || req.organizationFilter;
        if (!organizationId) {
          return res.status(400).json({ error: 'organizationId is required for admin' });
        }
      } else {
        organizationId = req.user.organizationId || req.organizationFilter;
        if (!organizationId) {
          return res.status(403).json({ error: 'Organization not found' });
        }
      }

      // Check if package name already exists in this organization
      const packages = await readPackages();
      const existingPackage = packages.find(p =>
        p.organizationId === organizationId &&
        p.name.toLowerCase().trim() === name.toLowerCase().trim()
      );

      if (existingPackage) {
        return res.status(400).json({ error: 'Package name already exists in this organization' });
      }

      // Verify all courses exist and belong to the organization
      const allCourses = await readCourses();
      for (const courseItem of courses) {
        const course = allCourses.find(c => c.id === courseItem.courseId);
        if (!course) {
          return res.status(400).json({ error: `Course with ID ${courseItem.courseId} not found` });
        }
        if (course.organizationId !== organizationId) {
          return res.status(403).json({ error: `Course ${courseItem.courseId} does not belong to this organization` });
        }
      }

      // Create new package
      const newPackage = {
        id: `package_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        organizationId: organizationId,
        name: name.trim(),
        courses: courses,
        priceStrategy: priceStrategy,
        fixedPrice: priceStrategy === 'fixed' ? parseFloat(fixedPrice) : null,
        discountPercentage: priceStrategy === 'discount' ? parseFloat(discountPercentage) : null,
        customPrice: priceStrategy === 'custom' ? parseFloat(customPrice) : null,
        monthlyLessonPrice: priceStrategy === 'monthly' ? parseFloat(monthlyLessonPrice) : null,
        monthlyPeriod: priceStrategy === 'monthly' ? parseInt(monthlyPeriod) : null,
        description: description ? description.trim() : null,
        startDate: startDate || null,
        endDate: endDate || null,
        status: status || 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      packages.push(newPackage);
      await writePackages(packages);

      res.status(201).json(newPackage);
    } catch (error) {
      console.error('Error creating package:', error);
      res.status(500).json({ error: 'Failed to create package' });
    }
  });

  // Update a package (organization and admin)
  app.put('/api/organizations/packages/:id', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, courses, priceStrategy, fixedPrice, discountPercentage, customPrice, monthlyLessonPrice, monthlyPeriod, description, startDate, endDate, status } = req.body;

      const packages = await readPackages();
      const packageIndex = packages.findIndex(p => p.id === id);

      if (packageIndex === -1) {
        return res.status(404).json({ error: 'Package not found' });
      }

      const pkg = packages[packageIndex];

      // Check organization access
      if (req.organizationFilter && pkg.organizationId !== req.organizationFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Validation
      if (name !== undefined) {
        if (!name || name.trim().length === 0) {
          return res.status(400).json({ error: 'Package name is required' });
        }
        if (name.length > 50) {
          return res.status(400).json({ error: 'Package name must be 50 characters or less' });
        }

        // Check if package name already exists in this organization (excluding current package)
        const existingPackage = packages.find(p =>
          p.id !== id &&
          p.organizationId === pkg.organizationId &&
          p.name.toLowerCase().trim() === name.toLowerCase().trim()
        );

        if (existingPackage) {
          return res.status(400).json({ error: 'Package name already exists in this organization' });
        }

        pkg.name = name.trim();
      }

      if (courses !== undefined) {
        if (!Array.isArray(courses) || courses.length === 0) {
          return res.status(400).json({ error: 'At least one course is required' });
        }

        // Validate courses array
        for (const course of courses) {
          if (!course.courseId || !course.quantity) {
            return res.status(400).json({ error: 'Each course must have courseId and quantity' });
          }
          if (typeof course.quantity !== 'number' || course.quantity < 1 || course.quantity > 999 || !Number.isInteger(course.quantity)) {
            return res.status(400).json({ error: 'Quantity must be an integer between 1 and 999' });
          }
        }

        // Verify all courses exist and belong to the organization
        const allCourses = await readCourses();
        for (const courseItem of courses) {
          const course = allCourses.find(c => c.id === courseItem.courseId);
          if (!course) {
            return res.status(400).json({ error: `Course with ID ${courseItem.courseId} not found` });
          }
          if (course.organizationId !== pkg.organizationId) {
            return res.status(403).json({ error: `Course ${courseItem.courseId} does not belong to this organization` });
          }
        }

        pkg.courses = courses;
      }

      if (priceStrategy !== undefined) {
        if (!['fixed', 'discount', 'custom', 'monthly'].includes(priceStrategy)) {
          return res.status(400).json({ error: 'Price strategy must be fixed, discount, custom, or monthly' });
        }
        pkg.priceStrategy = priceStrategy;
      }

      if (fixedPrice !== undefined) pkg.fixedPrice = fixedPrice;
      if (discountPercentage !== undefined) pkg.discountPercentage = discountPercentage;
      if (customPrice !== undefined) pkg.customPrice = customPrice;
      if (monthlyLessonPrice !== undefined) pkg.monthlyLessonPrice = monthlyLessonPrice;
      if (monthlyPeriod !== undefined) pkg.monthlyPeriod = monthlyPeriod;

      if (pkg.priceStrategy === 'fixed') {
        if (pkg.fixedPrice === undefined || pkg.fixedPrice === null) return res.status(400).json({ error: 'Fixed price required' });
        const num = parseFloat(pkg.fixedPrice);
        if (isNaN(num) || num < 0) return res.status(400).json({ error: 'Invalid fixed price' });
        pkg.fixedPrice = num;
        pkg.discountPercentage = null;
        pkg.customPrice = null;
        pkg.monthlyLessonPrice = null;
        pkg.monthlyPeriod = null;
      } else if (pkg.priceStrategy === 'discount') {
        if (pkg.discountPercentage === undefined || pkg.discountPercentage === null) return res.status(400).json({ error: 'Discount required' });
        const num = parseFloat(pkg.discountPercentage);
        if (isNaN(num) || num < 0 || num > 100) return res.status(400).json({ error: 'Invalid discount' });
        pkg.discountPercentage = num;
        pkg.fixedPrice = null;
        pkg.customPrice = null;
        pkg.monthlyLessonPrice = null;
        pkg.monthlyPeriod = null;
      } else if (pkg.priceStrategy === 'custom') {
        if (pkg.customPrice === undefined || pkg.customPrice === null) return res.status(400).json({ error: 'Custom price required' });
        const num = parseFloat(pkg.customPrice);
        if (isNaN(num) || num < 0) return res.status(400).json({ error: 'Invalid custom price' });
        pkg.customPrice = num;
        pkg.fixedPrice = null;
        pkg.discountPercentage = null;
        pkg.monthlyLessonPrice = null;
        pkg.monthlyPeriod = null;
      } else if (pkg.priceStrategy === 'monthly') {
        if (pkg.monthlyLessonPrice === undefined || pkg.monthlyLessonPrice === null || !pkg.monthlyPeriod) return res.status(400).json({ error: 'Monthly price/period required' });
        const priceNum = parseFloat(pkg.monthlyLessonPrice);
        const periodNum = parseInt(pkg.monthlyPeriod);
        if (isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'Invalid monthly price' });
        if (isNaN(periodNum) || periodNum < 1) return res.status(400).json({ error: 'Invalid period' });
        pkg.monthlyLessonPrice = priceNum;
        pkg.monthlyPeriod = periodNum;
        pkg.fixedPrice = null;
        pkg.discountPercentage = null;
        pkg.customPrice = null;
      }

      if (description !== undefined) {
        if (description && description.length > 500) {
          return res.status(400).json({ error: 'Description must be 500 characters or less' });
        }
        pkg.description = description ? description.trim() : null;
      }

      if (startDate !== undefined || endDate !== undefined) {
        const start = startDate ? new Date(startDate) : (pkg.startDate ? new Date(pkg.startDate) : null);
        const end = endDate ? new Date(endDate) : (pkg.endDate ? new Date(pkg.endDate) : null);

        if (start && end) {
          if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ error: 'Invalid date format' });
          }
          if (end <= start) {
            return res.status(400).json({ error: 'End date must be after start date' });
          }
        }

        if (startDate !== undefined) {
          pkg.startDate = startDate || null;
        }
        if (endDate !== undefined) {
          pkg.endDate = endDate || null;
        }
      }

      if (status !== undefined) {
        if (!['active', 'inactive', 'archived'].includes(status)) {
          return res.status(400).json({ error: 'Status must be active, inactive, or archived' });
        }
        pkg.status = status;
      }

      pkg.updatedAt = new Date().toISOString();

      packages[packageIndex] = pkg;
      await writePackages(packages);

      res.json(pkg);
    } catch (error) {
      console.error('Error updating package:', error);
      res.status(500).json({ error: 'Failed to update package' });
    }
  });

  // Delete a package (organization and admin)
  app.delete('/api/organizations/packages/:id', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const { id } = req.params;

      const packages = await readPackages();
      const packageIndex = packages.findIndex(p => p.id === id);

      if (packageIndex === -1) {
        return res.status(404).json({ error: 'Package not found' });
      }

      const pkg = packages[packageIndex];

      // Check organization access
      if (req.organizationFilter && pkg.organizationId !== req.organizationFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // TODO: Check if package has purchase records (when accounting/sales feature is implemented)
      // For now, we'll mark as archived if it has been used (status check)
      // In the future, we'll check actual purchase records

      // For now, we'll allow deletion, but in the future we'll check purchase records
      // and mark as archived instead of deleting
      packages.splice(packageIndex, 1);
      await writePackages(packages);

      res.json({ message: 'Package deleted successfully' });
    } catch (error) {
      console.error('Error deleting package:', error);
      res.status(500).json({ error: 'Failed to delete package' });
    }
  });

  // ==================== Timetable Management API ====================

  // Get timetable entries (organization and teacher)
  app.get('/api/organizations/timetable', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const timetableData = await readTimetable();

      // Filter by organization
      let filteredEntries = timetableData.entries;
      if (req.organizationFilter) {
        filteredEntries = timetableData.entries.filter(e => e.organizationId === req.organizationFilter);
      }

      const enrollmentsData = await readEnrollments();
      let filteredEnrollments = enrollmentsData;
      if (req.organizationFilter) {
        filteredEnrollments = enrollmentsData.filter(e => e.organizationId === req.organizationFilter);
      }

      res.json({
        entries: filteredEntries,
        metadata: timetableData.metadata,
        enrollments: filteredEnrollments
      });
    } catch (error) {
      console.error('Error getting timetable:', error);
      res.status(500).json({ error: 'Failed to get timetable' });
    }
  });

  // Get timetable entries for teacher (read-only)
  app.get('/api/teachers/timetable', authenticateUser, authorizeRole('teacher'), async (req, res) => {
    try {
      const users = await readUsers();
      const teacher = users.find(u => u.id === req.user.id);

      if (!teacher || !teacher.organizationId) {
        return res.status(403).json({ error: 'Teacher organization not found' });
      }

      const timetableData = await readTimetable();
      const filteredEntries = timetableData.entries.filter(e => e.organizationId === teacher.organizationId);

      const enrollmentsData = await readEnrollments();
      const filteredEnrollments = enrollmentsData.filter(e => e.organizationId === teacher.organizationId);

      res.json({
        entries: filteredEntries,
        metadata: timetableData.metadata,
        enrollments: filteredEnrollments
      });
    } catch (error) {
      console.error('Error getting teacher timetable:', error);
      res.status(500).json({ error: 'Failed to get timetable' });
    }
  });

  // Create timetable entry (organization only)
  app.post('/api/organizations/timetable', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { className, startTime, endTime, isRecurring, dayOfWeek, date, startDate, endDate, courseIds, teacherIds, classroom, studentIds, exceptions } = req.body;

      // Validation
      if (!className || className.trim().length === 0) {
        return res.status(400).json({ error: 'Class name is required' });
      }

      if (className.length > 50) {
        return res.status(400).json({ error: 'Class name must be 50 characters or less' });
      }

      if (!startTime || !endTime) {
        return res.status(400).json({ error: 'Start time and end time are required' });
      }

      // Validate time format (HH:MM)
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        return res.status(400).json({ error: 'Time must be in HH:MM format (24-hour)' });
      }

      // Validate start time is before end time
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (startMinutes >= endMinutes) {
        return res.status(400).json({ error: 'Start time must be before end time' });
      }

      if (isRecurring === undefined) {
        return res.status(400).json({ error: 'isRecurring is required' });
      }

      if (isRecurring) {
        if (!dayOfWeek || !Array.isArray(dayOfWeek) || dayOfWeek.length === 0) {
          return res.status(400).json({ error: 'dayOfWeek array is required for recurring classes' });
        }

        const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const invalidDays = dayOfWeek.filter(d => !validDays.includes(d));
        if (invalidDays.length > 0) {
          return res.status(400).json({ error: `Invalid day(s): ${invalidDays.join(', ')}` });
        }

        // Validate startDate and endDate if present
        if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          if (start > end) {
            return res.status(400).json({ error: 'Start date cannot be after end date' });
          }
        }
      } else {
        if (!date) {
          return res.status(400).json({ error: 'date is required for non-recurring classes' });
        }
      }

      if (classroom && classroom.length > 50) {
        return res.status(400).json({ error: 'Classroom name must be 50 characters or less' });
      }

      // Get organization ID
      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      // Generate unique ID
      const id = `timetable_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create new timetable entry
      const newEntry = {
        id,
        organizationId: orgUser.organizationId,
        className: className.trim(),
        startTime,
        endTime,
        isRecurring,
        dayOfWeek: isRecurring ? dayOfWeek : null,
        date: isRecurring ? null : date,
        startDate: isRecurring ? (startDate || null) : null,
        endDate: isRecurring ? (endDate || null) : null,
        courseIds: Array.isArray(courseIds) ? courseIds : [],
        teacherIds: Array.isArray(teacherIds) ? teacherIds : [],
        classroom: classroom ? classroom.trim() : null,
        studentIds: Array.isArray(studentIds) ? studentIds : [],
        exceptions: Array.isArray(exceptions) ? exceptions : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Read timetable data
      const timetableData = await readTimetable();

      // Add entry
      timetableData.entries.push(newEntry);

      // Update metadata (classNames and classrooms)
      if (!timetableData.metadata.classNames.includes(className.trim())) {
        timetableData.metadata.classNames.push(className.trim());
      }
      if (classroom && classroom.trim() && !timetableData.metadata.classrooms.includes(classroom.trim())) {
        timetableData.metadata.classrooms.push(classroom.trim());
      }

      await writeTimetable(timetableData);

      res.status(201).json(newEntry);
    } catch (error) {
      console.error('Error creating timetable entry:', error);
      res.status(500).json({ error: 'Failed to create timetable entry' });
    }
  });

  // Update timetable entry (organization only)
  app.put('/api/organizations/timetable/:id', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { id } = req.params;
      const { className, startTime, endTime, isRecurring, dayOfWeek, date, startDate, endDate, courseIds, teacherIds, classroom, studentIds, exceptions } = req.body;

      const timetableData = await readTimetable();
      const entryIndex = timetableData.entries.findIndex(e => e.id === id);

      if (entryIndex === -1) {
        return res.status(404).json({ error: 'Timetable entry not found' });
      }

      const entry = timetableData.entries[entryIndex];

      // Verify organization access
      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId || entry.organizationId !== orgUser.organizationId) {
        return res.status(403).json({ error: 'You don\'t have permission to update this timetable entry' });
      }

      // Validation (same as create)
      if (className !== undefined) {
        if (!className || className.trim().length === 0) {
          return res.status(400).json({ error: 'Class name is required' });
        }
        if (className.length > 50) {
          return res.status(400).json({ error: 'Class name must be 50 characters or less' });
        }
      }

      if (startTime !== undefined || endTime !== undefined) {
        const finalStartTime = startTime !== undefined ? startTime : entry.startTime;
        const finalEndTime = endTime !== undefined ? endTime : entry.endTime;

        const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(finalStartTime) || !timeRegex.test(finalEndTime)) {
          return res.status(400).json({ error: 'Time must be in HH:MM format (24-hour)' });
        }

        const [startHour, startMin] = finalStartTime.split(':').map(Number);
        const [endHour, endMin] = finalEndTime.split(':').map(Number);
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        if (startMinutes >= endMinutes) {
          return res.status(400).json({ error: 'Start time must be before end time' });
        }
      }

      if (isRecurring !== undefined) {
        if (isRecurring) {
          if (!dayOfWeek || !Array.isArray(dayOfWeek) || dayOfWeek.length === 0) {
            return res.status(400).json({ error: 'dayOfWeek array is required for recurring classes' });
          }
          const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
          const invalidDays = dayOfWeek.filter(d => !validDays.includes(d));
          if (invalidDays.length > 0) {
            return res.status(400).json({ error: `Invalid day(s): ${invalidDays.join(', ')}` });
          }

          // Validate startDate and endDate if present
          // Need to check against either the new values or existing ones if not provided, 
          // but since the payload sends what is changing, if user only changes endDate, we should check against new endDate and (new or old) startDate.
          // However, simpler logic: if dates are provided in update, validate them.
          const newStart = startDate !== undefined ? startDate : entry.startDate;
          const newEnd = endDate !== undefined ? endDate : entry.endDate;

          if (newStart && newEnd) {
            const s = new Date(newStart);
            const e = new Date(newEnd);
            if (s > e) {
              return res.status(400).json({ error: 'Start date cannot be after end date' });
            }
          }
        } else {
          if (!date) {
            return res.status(400).json({ error: 'date is required for non-recurring classes' });
          }
        }
      }

      if (classroom && classroom.length > 50) {
        return res.status(400).json({ error: 'Classroom name must be 50 characters or less' });
      }

      // Update entry
      if (className !== undefined) entry.className = className.trim();
      if (startTime !== undefined) entry.startTime = startTime;
      if (endTime !== undefined) entry.endTime = endTime;
      if (isRecurring !== undefined) {
        entry.isRecurring = isRecurring;
        entry.dayOfWeek = isRecurring ? dayOfWeek : null;
        entry.date = isRecurring ? null : date;
        // If switching to recurring, set start/end dates. If staying recurring, update if provided.
        if (isRecurring) {
          if (startDate !== undefined) entry.startDate = startDate || null;
          if (endDate !== undefined) entry.endDate = endDate || null;
        } else {
          entry.startDate = null;
          entry.endDate = null;
        }
      } else if (entry.isRecurring) {
        // If not changing isRecurring status but updating dates for a recurring event
        if (startDate !== undefined) entry.startDate = startDate || null;
        if (endDate !== undefined) entry.endDate = endDate || null;
      }

      if (courseIds !== undefined) entry.courseIds = Array.isArray(courseIds) ? courseIds : [];
      if (teacherIds !== undefined) entry.teacherIds = Array.isArray(teacherIds) ? teacherIds : [];
      if (classroom !== undefined) entry.classroom = classroom ? classroom.trim() : null;
      if (studentIds !== undefined) entry.studentIds = Array.isArray(studentIds) ? studentIds : [];
      if (exceptions !== undefined) entry.exceptions = Array.isArray(exceptions) ? exceptions : [];
      entry.updatedAt = new Date().toISOString();

      // Update metadata
      if (className && !timetableData.metadata.classNames.includes(className.trim())) {
        timetableData.metadata.classNames.push(className.trim());
      }
      if (classroom && classroom.trim() && !timetableData.metadata.classrooms.includes(classroom.trim())) {
        timetableData.metadata.classrooms.push(classroom.trim());
      }

      timetableData.entries[entryIndex] = entry;
      await writeTimetable(timetableData);

      res.json(entry);
    } catch (error) {
      console.error('Error updating timetable entry:', error);
      res.status(500).json({ error: 'Failed to update timetable entry' });
    }
  });

  // Delete timetable entry (organization only)
  app.delete('/api/organizations/timetable/:id', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { id } = req.params;

      const timetableData = await readTimetable();
      const entryIndex = timetableData.entries.findIndex(e => e.id === id);

      if (entryIndex === -1) {
        return res.status(404).json({ error: 'Timetable entry not found' });
      }

      const entry = timetableData.entries[entryIndex];

      // Verify organization access
      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId || entry.organizationId !== orgUser.organizationId) {
        return res.status(403).json({ error: 'You don\'t have permission to delete this timetable entry' });
      }

      // Remove entry
      timetableData.entries.splice(entryIndex, 1);
      await writeTimetable(timetableData);

      res.json({ message: 'Timetable entry deleted successfully' });
    } catch (error) {
      console.error('Error deleting timetable entry:', error);
      res.status(500).json({ error: 'Failed to delete timetable entry' });
    }
  });

  // Delete specific instance of recurring class
  app.post('/api/organizations/timetable/:id/delete-instance', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { id } = req.params;
      const { date, mode } = req.body; // mode: 'single' or 'future'

      const timetableData = await readTimetable();
      const entryIndex = timetableData.entries.findIndex(e => e.id === id);

      if (entryIndex === -1) return res.status(404).json({ error: 'Entry not found' });
      const entry = timetableData.entries[entryIndex];

      // Verify Org
      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId || entry.organizationId !== orgUser.organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (mode === 'single') {
        if (!entry.exceptions) entry.exceptions = [];
        if (!entry.exceptions.includes(date)) {
          entry.exceptions.push(date);
        }
      } else if (mode === 'future') {
        // Set endDate to the day before
        const targetDate = new Date(date);
        targetDate.setDate(targetDate.getDate() - 1);
        entry.endDate = targetDate.toISOString();
      }

      entry.updatedAt = new Date().toISOString();
      timetableData.entries[entryIndex] = entry;
      await writeTimetable(timetableData);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting instance:', error);
      res.status(500).json({ error: 'Failed to delete instance' });
    }
  });

  // Makeup Class - Drop original and enroll to new class
  app.post('/api/organizations/timetable/makeup', authenticateUser, authorizeRole('organization'), async (req, res) => {
    const logs = [];
    const log = (msg) => {
      console.log('[MAKEUP]', msg);
      logs.push(String(msg)); // Ensure msg is a string to avoid JSON serialization issues
    };

    try {
      const { studentId, fromEntryId, fromDate, toEntryId, toDate, studentName } = req.body;

      log(`Makeup request: ${studentName} (${studentId}) from ${fromEntryId} on ${fromDate} to ${toEntryId} on ${toDate}`);

      if (!studentId || !fromEntryId || !fromDate || !toEntryId || !toDate) {
        return res.status(400).json({ error: 'Missing required fields', logs });
      }

      // Check user authentication
      if (!req.user || !req.user.organizationId) {
        log('Error: User not authenticated or missing organizationId');
        return res.status(403).json({ error: 'Authentication required', logs });
      }

      const enrollments = await readEnrollments();
      const timetableData = await readTimetable();
      log(`Loaded ${enrollments.length} enrollments`);

      // Debug: Log first few enrollments to understand structure
      if (enrollments.length > 0) {
        log(`Sample enrollment: ${JSON.stringify(enrollments[0])}`);
      }

      // Step 1: Find and drop the original enrollment or student from entry
      log('Step 1: Finding original enrollment/student to drop');
      log(`Looking for studentId: ${studentId}, timetableEntryId: ${fromEntryId}, date: ${fromDate}`);

      // First, check if student is in enrollments
      const studentEnrollments = enrollments.filter(e => String(e.studentId) === String(studentId));
      log(`Student has ${studentEnrollments.length} total enrollments`);

      const originalEnrollmentIndex = enrollments.findIndex(e =>
        String(e.studentId) === String(studentId) &&
        e.timetableEntryId === fromEntryId &&
        e.date === fromDate
      );

      let studentRemoved = false;

      if (originalEnrollmentIndex !== -1) {
        const originalEnrollment = enrollments[originalEnrollmentIndex];
        log(`Found original enrollment: ${originalEnrollment.id}`);

        // Remove the original enrollment
        enrollments.splice(originalEnrollmentIndex, 1);
        log('Original enrollment dropped');
        studentRemoved = true;
      } else {
        // Check if student is directly in timetable entry studentIds
        const fromEntry = timetableData.entries.find(e => e.id === fromEntryId);
        if (fromEntry && fromEntry.studentIds && fromEntry.studentIds.includes(studentId)) {
          const studentIndex = fromEntry.studentIds.indexOf(studentId);
          fromEntry.studentIds.splice(studentIndex, 1);
          log(`Student removed from entry.studentIds at index ${studentIndex}`);
          studentRemoved = true;
        } else {
          log('Warning: Student not found in enrollments or entry.studentIds');
        }
      }

      if (!studentRemoved) {
        log('Warning: Student was not removed from original class, proceeding with new enrollment anyway');
      }

      // Step 2: Create new enrollment for the target class
      log('Step 2: Creating new enrollment for target class');

      // Check if already enrolled in target class (enrollment)
      const existingTargetEnrollment = enrollments.find(e =>
        String(e.studentId) === String(studentId) &&
        e.timetableEntryId === toEntryId &&
        e.date === toDate
      );

      // Check if already in target entry studentIds
      const toEntry = timetableData.entries.find(e => e.id === toEntryId);
      const alreadyInTargetEntry = toEntry && toEntry.studentIds && toEntry.studentIds.includes(studentId);

      if (existingTargetEnrollment || alreadyInTargetEntry) {
        log(`Student already in target class (enrollment: ${!!existingTargetEnrollment}, entry: ${!!alreadyInTargetEntry})`);
      } else {
        // Create new enrollment
        const newEnrollment = {
          id: `enr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          organizationId: req.user.organizationId,
          studentId,
          timetableEntryId: toEntryId,
          date: toDate,
          type: 'single',
          notes: `Makeup from ${fromDate} (${fromEntryId})`,
          createdAt: new Date().toISOString(),
          makeupFrom: {
            entryId: fromEntryId,
            date: fromDate,
            reason: 'student_makeup'
          }
        };

        enrollments.push(newEnrollment);
        log(`New enrollment created: ${newEnrollment.id}`);
      }

      // Step 3: Save changes
      await writeEnrollments(enrollments);
      log('Enrollments saved successfully');

      // Save timetable data if it was modified (studentIds changed)
      await writeTimetable(timetableData);
      log('Timetable data saved successfully');

      // Note: Frontend will automatically reload data after successful response

      log('Makeup process completed successfully');
      res.json({
        success: true,
        message: 'Student makeup completed',
        logs,
        data: {
          droppedEnrollment: originalEnrollmentIndex !== -1,
          newEnrollmentCreated: !existingTargetEnrollment,
          fromClass: fromEntryId,
          toClass: toEntryId,
          fromDate,
          toDate
        }
      });
    } catch (error) {
      console.error('Error processing makeup:', error);
      log(`Error: ${error.message}`);
      res.status(500).json({ error: 'Failed to process makeup', logs });
    }
  });

  // Postpone Class - Drop current class and enroll in next week's same class
  app.post('/api/organizations/timetable/postpone', authenticateUser, authorizeRole('organization'), async (req, res) => {
    const logs = [];
    const log = (msg) => {
      console.log('[POSTPONE]', msg);
      logs.push(String(msg));
    };

    try {
      const { timetableEntryId, date, studentId } = req.body;

      log(`Postpone request: student ${studentId} from entry ${timetableEntryId} on ${date}`);

      if (!timetableEntryId || !date || !studentId) {
        return res.status(400).json({ error: 'Missing required fields: timetableEntryId, date, studentId', logs });
      }

      // Check user authentication
      if (!req.user || !req.user.organizationId) {
        log('Error: User not authenticated or missing organizationId');
        return res.status(403).json({ error: 'Authentication required', logs });
      }

      const enrollments = await readEnrollments();
      const timetableData = await readTimetable();
      const organizations = await readOrganizations();
      log(`Loaded ${enrollments.length} enrollments, ${timetableData.entries.length} timetable entries`);

      // Find the timetable entry
      const entry = timetableData.entries.find(e => e.id === timetableEntryId);
      if (!entry) {
        return res.status(404).json({ error: 'Timetable entry not found', logs });
      }

      // Verify organization access
      if (entry.organizationId !== req.user.organizationId) {
        return res.status(403).json({ error: 'Access denied to this timetable entry', logs });
      }

      // Step 1: Drop student from current class
      log('Step 1: Dropping student from current class');

      let studentRemoved = false;
      let originalOrderId = null;
      const originalEnrollmentIndex = enrollments.findIndex(e =>
        String(e.studentId) === String(studentId) &&
        e.timetableEntryId === timetableEntryId &&
        e.date === date
      );

      if (originalEnrollmentIndex !== -1) {
        const originalEnrollment = enrollments[originalEnrollmentIndex];
        log(`Found and removing enrollment: ${originalEnrollment.id}`);
        originalOrderId = originalEnrollment.orderId || null;
        enrollments.splice(originalEnrollmentIndex, 1);
        studentRemoved = true;
      } else {
        // Check if student is in entry.studentIds
        if (entry.studentIds && entry.studentIds.includes(studentId)) {
          const studentIndex = entry.studentIds.indexOf(studentId);
          entry.studentIds.splice(studentIndex, 1);
          log(`Removed student from entry.studentIds at index ${studentIndex}`);
          studentRemoved = true;
        }
      }

      if (!studentRemoved) {
        log('Warning: Student was not found in current class, proceeding with new enrollment');
      }

      // Step 2: Compute next available class date (same class), skipping exceptions + holidays
      log('Step 2: Computing next available class date (same class)');

      const org = organizations.find(o => String(o.id) === String(req.user.organizationId));
      const holidays = Array.isArray(org?.settings?.scheduleSettings?.holidays) ? org.settings.scheduleSettings.holidays : [];
      const holidaySet = new Set(holidays.filter(d => typeof d === 'string'));
      const exceptions = Array.isArray(entry?.exceptions) ? entry.exceptions : [];
      const exceptionSet = new Set(exceptions.filter(d => typeof d === 'string'));

      const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
      const dowSet = new Set((Array.isArray(entry?.dayOfWeek) ? entry.dayOfWeek : []).map(d => dayMap[d]).filter(v => v !== undefined));

      const startBoundary = entry.startDate ? String(entry.startDate).split('T')[0] : null;
      const endBoundary = entry.endDate ? String(entry.endDate).split('T')[0] : null;

      const allStudentDates = new Set(enrollments
        .filter(e => String(e.studentId) === String(studentId) && String(e.timetableEntryId) === String(timetableEntryId) && typeof e.date === 'string')
        .map(e => e.date)
      );

      const parseYmd = (s) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return null;
        const ms = Date.parse(`${s}T00:00:00.000Z`);
        return Number.isFinite(ms) ? ms : null;
      };
      const toYmd = (ms) => {
        const d = new Date(ms);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
      };

      const baseMs = parseYmd(date);
      if (baseMs == null) return res.status(400).json({ error: 'Invalid date format', logs });

      let targetDate = null;
      // Search up to 365 days ahead
      for (let i = 1; i <= 365; i++) {
        const ms = baseMs + i * 86400000;
        const ds = toYmd(ms);

        if (startBoundary && ds < startBoundary) continue;
        if (endBoundary && ds > endBoundary) break;
        if (entry.isRecurring) {
          if (dowSet.size > 0) {
            const dow = new Date(ms).getUTCDay();
            if (!dowSet.has(dow)) continue;
          }
        }
        if (exceptionSet.has(ds)) continue;
        if (holidaySet.has(ds)) continue;
        if (allStudentDates.has(ds)) continue;
        targetDate = ds;
        break;
      }

      if (!targetDate) {
        return res.status(400).json({ error: 'No available date found to postpone (check endDate/holidays/exceptions)', logs });
      }

      const targetEntryId = timetableEntryId;
      log(`Target postpone date computed: ${targetDate}`);

      // Step 3: Create new enrollment for next week
      log('Step 3: Creating new enrollment for next week');

      // Check if already enrolled in target class on target date
      const existingTargetEnrollment = enrollments.find(e =>
        String(e.studentId) === String(studentId) &&
        e.timetableEntryId === targetEntryId &&
        e.date === targetDate
      );

      const targetEntry = timetableData.entries.find(e => e.id === targetEntryId);
      const alreadyInTargetEntry = targetEntry && targetEntry.studentIds && targetEntry.studentIds.includes(studentId);

      if (existingTargetEnrollment || alreadyInTargetEntry) {
        log(`Student already enrolled in target class (enrollment: ${!!existingTargetEnrollment}, entry: ${!!alreadyInTargetEntry})`);
      } else {
        // Create new enrollment
        const newEnrollment = {
          id: `enr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          organizationId: req.user.organizationId,
          studentId,
          timetableEntryId: targetEntryId,
          date: targetDate,
          type: 'single',
          orderId: originalOrderId,
          notes: `Postponed from ${date} (${timetableEntryId})`,
          createdAt: new Date().toISOString(),
          postponedFrom: {
            entryId: timetableEntryId,
            date: date,
            reason: 'student_postpone'
          }
        };

        enrollments.push(newEnrollment);
        log(`New enrollment created: ${newEnrollment.id} for ${targetDate}`);
      }

      // Step 4: Save changes
      await writeEnrollments(enrollments);
      log('Enrollments saved successfully');

      await writeTimetable(timetableData);
      log('Timetable data saved successfully');

      log('Postpone process completed successfully');
      res.json({
        success: true,
        message: 'Class postponed successfully',
        logs,
        data: {
          droppedFromClass: timetableEntryId,
          droppedFromDate: date,
          enrolledToClass: targetEntryId,
          enrolledToDate: targetDate,
          studentRemoved,
          newEnrollmentCreated: !existingTargetEnrollment && !alreadyInTargetEntry
        }
      });
    } catch (error) {
      console.error('Error processing postpone:', error);
      log(`Error: ${error.message}`);
      res.status(500).json({ error: 'Failed to process postpone', logs });
    }
  });

  // Get Game Config
  app.get('/api/organizations/game-config', authenticateUser, authorizeRole('organization', 'admin'), async (req, res) => {
    try {
      let orgId = req.user.organizationId;

      const organizations = await readOrganizations();
      const org = organizations.find(o => o.id === orgId);
      if (!org) return res.status(404).json({ error: 'Organization not found' });

      // Default Levels
      const defaultLevels = [
        { level: 1, name: 'Slime', maxHP: 200, reward: 10, image: '🟢' },
        { level: 2, name: 'Goblin', maxHP: 400, reward: 20, image: '👺' },
        { level: 3, name: 'Orc', maxHP: 600, reward: 30, image: '👹' },
        { level: 4, name: 'Dragon', maxHP: 800, reward: 40, image: '🐉' },
        { level: 5, name: 'Demon', maxHP: 1000, reward: 50, image: '😈' },
        { level: 6, name: 'Boss Lv1', maxHP: 1200, reward: 60, image: '👑' },
        { level: 7, name: 'Boss Lv2', maxHP: 1500, reward: 75, image: '👑' },
        { level: 8, name: 'Boss Lv3', maxHP: 2000, reward: 100, image: '👑' },
        { level: 9, name: 'Boss Lv4', maxHP: 2500, reward: 125, image: '👑' },
        { level: 10, name: 'Final Boss', maxHP: 3000, reward: 150, image: '👑' }
      ];

      const config = org.gameConfig || {};
      if (!config.classicLevels || config.classicLevels.length === 0) {
        config.classicLevels = defaultLevels;
      }
      config.mode = config.mode || 'classic';

      res.json(config);
    } catch (error) {
      console.error('Error getting game config:', error);
      res.status(500).json({ error: 'Failed to load config' });
    }
  });

  // Update Game Config
  app.put('/api/organizations/game-config', authenticateUser, authorizeRole('organization', 'admin'), async (req, res) => {
    try {
      const { mode, classicLevels } = req.body;
      let orgId = req.user.organizationId;

      const organizations = await readOrganizations();
      const orgIndex = organizations.findIndex(o => o.id === orgId);
      if (orgIndex === -1) return res.status(404).json({ error: 'Organization not found' });

      organizations[orgIndex].gameConfig = {
        mode: mode || 'classic',
        classicLevels: classicLevels || []
      };

      await writeOrganizations(organizations);

      broadcast({ type: 'gameConfigUpdated', config: organizations[orgIndex].gameConfig });

      res.json({ success: true });
    } catch (error) {
      console.error('Error saving game config:', error);
      res.status(500).json({ error: 'Failed to save config' });
    }
  });
}

module.exports = { registerOrganizationsRoutes };


