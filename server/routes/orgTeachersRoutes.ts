// Teacher management routes extracted from organizationsRoutes.js
// All route behavior should remain identical.

import { Request, Response, NextFunction } from 'express';

function registerOrgTeachersRoutes(app: any, deps: any): void {
  const {
    authenticateUser,
    authorizeRole,
    requireOrganizationAccess,
    readUsers,
    writeUsers,
    readOrganizations,
    writeOrganizations,
    readData,
    broadcast,
    hashPassword,
    generateToken
  } = deps;

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
        classViewStudents: [],
        assignedStudents: []
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
      const permissions = req.body;

      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const teacherIndex = users.findIndex(u => u.id === teacherId && u.role === 'teacher' && u.organizationId === orgUser.organizationId);
      if (teacherIndex === -1) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

      if (!users[teacherIndex].teacherPermissions) {
        users[teacherIndex].teacherPermissions = {};
      }

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

      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const teacherIndex = users.findIndex(u => u.id === teacherId && u.role === 'teacher' && u.organizationId === orgUser.organizationId);
      if (teacherIndex === -1) {
        return res.status(404).json({ error: 'Teacher not found or does not belong to your organization' });
      }

      users.splice(teacherIndex, 1);
      await writeUsers(users);

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

      const users = await readUsers();
      const teacher = users.find(u => u.id === teacherId && u.role === 'teacher');

      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

      if (req.user.role === 'organization') {
        const orgUser = users.find(u => u.id === req.user.id);
        if (!orgUser || !orgUser.organizationId) {
          return res.status(403).json({ error: 'Organization not found' });
        }

        if (teacher.organizationId !== orgUser.organizationId) {
          return res.status(403).json({ error: 'You don\'t have permission to login as this teacher' });
        }
      }

      const token = generateToken(teacher);

      const { password: _, ...teacherWithoutPassword } = teacher;

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

      const users = await readUsers();
      const teacherIndex = users.findIndex(u => u.id === teacherId && u.role === 'teacher');

      if (teacherIndex === -1) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

      const teacher = users[teacherIndex];

      if (req.user.role === 'organization') {
        const orgUser = users.find(u => u.id === req.user.id);
        if (!orgUser || !orgUser.organizationId) {
          return res.status(403).json({ error: 'Organization not found' });
        }

        if (teacher.organizationId !== orgUser.organizationId) {
          return res.status(403).json({ error: 'You don\'t have permission to update this teacher' });
        }
      }

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
        teacher.email = email ? email.trim().toLowerCase() : null;
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

      teacher.updatedAt = new Date().toISOString();

      users[teacherIndex] = teacher;
      await writeUsers(users);

      const { password: _, ...teacherWithoutPassword } = teacher;

      res.json(teacherWithoutPassword);
    } catch (error) {
      console.error('Error updating teacher:', error);
      res.status(500).json({ error: 'Failed to update teacher' });
    }
  });

  // Organization assigns students to teachers (many-to-many)
  app.post('/api/organizations/assign-students', authenticateUser, authorizeRole('organization'), async (req, res) => {
    try {
      const { teacherId, studentIds } = req.body;

      if (!teacherId || !Array.isArray(studentIds)) {
        return res.status(400).json({ error: 'teacherId and studentIds array are required' });
      }

      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const teacher = users.find(u => u.id === teacherId && u.role === 'teacher' && u.organizationId === orgUser.organizationId);
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found or does not belong to your organization' });
      }

      const data = await readData();
      const validStudents = data.students.filter(s =>
        studentIds.includes(s.id) && s.organizationId === orgUser.organizationId
      );

      if (validStudents.length !== studentIds.length) {
        return res.status(400).json({ error: 'Some students not found or do not belong to your organization' });
      }

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

      const users = await readUsers();
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const teacher = users.find(u => u.id === teacherId && u.role === 'teacher' && u.organizationId === orgUser.organizationId);
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }

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
}

module.exports = { registerOrgTeachersRoutes };
