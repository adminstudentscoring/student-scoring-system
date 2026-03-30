// Admin Organization routes extracted from server.js.
// Includes /api/admin/organizations/* routes (CRUD, teachers, students, settings, statistics, audit, batch).
import { Request, Response, NextFunction } from 'express';
import type { AdminOrganizationsRouteDeps } from '@student-scoring/core';

function registerAdminOrganizationsRoutes(app: any, deps: AdminOrganizationsRouteDeps): void {
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const readOrganizations = deps?.readOrganizations;
  const writeOrganizations = deps?.writeOrganizations;
  const readUsers = deps?.readUsers;
  const writeUsers = deps?.writeUsers;
  const readData = deps?.readData;
  const writeData = deps?.writeData;
  const broadcast = deps?.broadcast;
  const getRankInfo = deps?.getRankInfo;
  const hashPassword = deps?.hashPassword;
  const generateToken = deps?.generateToken;

  if (!app) throw new Error('registerAdminOrganizationsRoutes: missing app');
  if (typeof authenticateUser !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing authenticateUser');
  if (typeof authorizeRole !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing authorizeRole');
  if (typeof readOrganizations !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing readOrganizations');
  if (typeof writeOrganizations !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing writeOrganizations');
  if (typeof readUsers !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing readUsers');
  if (typeof writeUsers !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing writeUsers');
  if (typeof readData !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing readData');
  if (typeof writeData !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing writeData');
  if (typeof broadcast !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing broadcast');
  if (typeof getRankInfo !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing getRankInfo');
  if (typeof hashPassword !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing hashPassword');
  if (typeof generateToken !== 'function') throw new Error('registerAdminOrganizationsRoutes: missing generateToken');

  // Get all organizations (admin only)
  app.get('/api/admin/organizations', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const organizations = await readOrganizations();
      const users = await readUsers();
      
      // Enrich organizations with user counts
      const data = await readData();
      const enrichedOrgs = organizations.map(org => {
        const orgUsers = users.filter(u => u.organizationId === org.id);
        const teachers = orgUsers.filter(u => u.role === 'teacher');
        const students = data.students ? data.students.filter(s => s.organizationId === org.id) : [];
        
        return {
          ...org,
          teacherCount: teachers.length,
          studentCount: students.length,
          userCount: orgUsers.length
        };
      });
      
      res.json(enrichedOrgs);
    } catch (error) {
      console.error('Error getting organizations:', error);
      res.status(500).json({ error: 'Failed to get organizations' });
    }
  });

  // Update organization (admin only)
  app.put('/api/admin/organizations/:id', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, email, phone } = req.body;
      
      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === id);
      
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      
      // Update organization
      if (name) organization.name = name;
      if (email) organization.email = email;
      if (phone) organization.phone = phone;
      organization.updatedAt = new Date().toISOString();
      
      await writeOrganizations(organizations);
      
      // Update organization user email if changed
      if (email) {
        const users = await readUsers();
        const orgUser = users.find(u => u.organizationId === id && u.role === 'organization');
        if (orgUser) {
          orgUser.email = email.toLowerCase();
          await writeUsers(users);
        }
      }
      
      res.json(organization);
    } catch (error) {
      console.error('Error updating organization:', error);
      res.status(500).json({ error: 'Failed to update organization' });
    }
  });

  // Admin updates organization password
  app.patch('/api/admin/organizations/:id/password', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { password } = req.body;

      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === id);
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const users = await readUsers();
      const orgUserIndex = users.findIndex(u => u.organizationId === id && u.role === 'organization');
      if (orgUserIndex === -1) {
        return res.status(404).json({ error: 'Organization user account not found' });
      }

      const hashedPassword = await hashPassword(password);
      users[orgUserIndex].password = hashedPassword;
      users[orgUserIndex].updatedAt = new Date().toISOString();
      await writeUsers(users);

      res.json({ message: 'Password updated successfully' });
    } catch (error) {
      console.error('Error updating organization password:', error);
      res.status(500).json({ error: 'Failed to update organization password' });
    }
  });

  // Get organization details (admin only)
  app.get('/api/admin/organizations/:id', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === id);
      
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      
      // Get related users and students
      const users = await readUsers();
      const orgUsers = users.filter(u => u.organizationId === id);
      const teachers = orgUsers.filter(u => u.role === 'teacher');
      
      const data = await readData();
      const students = data.students.filter(s => s.organizationId === id);
      
      res.json({
        ...organization,
        teachers: teachers.map(t => {
          const { password: _, ...teacherWithoutPassword } = t;
          return teacherWithoutPassword;
        }),
        students: students
      });
    } catch (error) {
      console.error('Error getting organization details:', error);
      res.status(500).json({ error: 'Failed to get organization details' });
    }
  });

  // Delete organization (admin only)
  app.delete('/api/admin/organizations/:id', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const organizations = await readOrganizations();
      const orgIndex = organizations.findIndex(o => o.id === id);
      if (orgIndex === -1) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const organization = organizations[orgIndex];
      const users = await readUsers();
      const removedUsers = users.filter(u => u.organizationId === id);
      const remainingUsers = users.filter(u => u.organizationId !== id);

      const data = await readData();
      const removedStudents = data.students.filter(s => s.organizationId === id);
      const removedStudentIds = new Set(removedStudents.map(s => s.id));
      data.students = data.students.filter(s => s.organizationId !== id);

      if (data.challenge && Array.isArray(data.challenge.selectedStudentIds)) {
        data.challenge.selectedStudentIds = data.challenge.selectedStudentIds.filter(studentId => !removedStudentIds.has(studentId));
      }

      if (data.gameState && data.gameState.current && Array.isArray(data.gameState.current.players)) {
        data.gameState.current.players = data.gameState.current.players.filter(player => !removedStudentIds.has(player.studentId));
      }

      data.lastUpdate = new Date().toISOString();

      organizations.splice(orgIndex, 1);

      await writeUsers(remainingUsers);
      await writeData(data);
      await writeOrganizations(organizations);

      if (removedStudents.length > 0) {
        broadcast({ type: 'studentsRemoved', studentIds: Array.from(removedStudentIds) });
      }
      broadcast({ type: 'organizationDeleted', organizationId: id });

      res.json({
        message: 'Organization deleted successfully',
        removedStudents: removedStudents.length,
        removedUsers: removedUsers.length,
        organizationName: organization.name
      });
    } catch (error) {
      console.error('Error deleting organization:', error);
      res.status(500).json({ error: 'Failed to delete organization' });
    }
  });

  // Admin login as organization
  app.post('/api/admin/organizations/:id/login-as', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`[DEBUG] Admin Login As OrgID: ${id}`);
      
      const users = await readUsers();
      
      // Find the user with role 'organization' and organizationId matching the param
      const targetUser = users.find(u => 
        u.role === 'organization' && 
        u.organizationId === id
      );
      
      if (!targetUser) {
        console.log(`[DEBUG] No Org User found for OrgID: ${id}`);
        return res.status(404).json({ error: 'Organization user not found' });
      }
      
      console.log(`[DEBUG] Found Org User: ${targetUser.name} (ID: ${targetUser.id})`);

      let token: string;
      try {
        token = generateToken(targetUser);
      } catch (error) {
        return res.status(503).json({ error: error?.message || 'Authentication is not configured on this server' });
      }
      console.log(`[DEBUG] Generated Token Payload ID: ${targetUser.id}`);
      
      const { password: _, ...userWithoutPassword } = targetUser;
      
      res.json({
        token,
        user: userWithoutPassword
      });
    } catch (error) {
      console.error('Error logging in as organization:', error);
      res.status(500).json({ error: 'Failed to login as organization' });
    }
  });

  // Admin creates a teacher for an organization
  app.post('/api/admin/organizations/:id/teachers', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, teacherId, gender, username, password } = req.body;

      if (!name || !teacherId || !gender || !username || !password) {
        return res.status(400).json({ error: 'Name, teacher ID, gender, username, and password are required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === id);
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const users = await readUsers();
      const normalizedUsername = username.toLowerCase();
      const existingUser = users.find(u => u.email === normalizedUsername || u.username === normalizedUsername);
      if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
      }

      const existingTeacher = users.find(u =>
        u.organizationId === id &&
        u.role === 'teacher' &&
        u.teacherId === teacherId
      );
      if (existingTeacher) {
        return res.status(400).json({ error: 'Teacher ID already exists in this organization' });
      }

      const hashedPassword = await hashPassword(password);
      const newTeacher = {
        id: Date.now().toString(),
        email: normalizedUsername,
        username: normalizedUsername,
        password: hashedPassword,
        name,
        teacherId,
        gender,
        role: 'teacher',
        organizationId: id,
        createdAt: new Date().toISOString(),
        classViewStudents: [],
        assignedStudents: []
      };

      users.push(newTeacher);
      await writeUsers(users);

      organization.teachers = organization.teachers || [];
      organization.teachers.push(newTeacher.id);
      organization.updatedAt = new Date().toISOString();
      await writeOrganizations(organizations);

      const { password: _, ...teacherWithoutPassword } = newTeacher;
      res.status(201).json({
        teacher: teacherWithoutPassword
      });
    } catch (error) {
      console.error('Error creating teacher as admin:', error);
      res.status(500).json({ error: 'Failed to create teacher' });
    }
  });

  // Admin creates a student for an organization
  app.post('/api/admin/organizations/:id/students', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, studentId, score = 0 } = req.body;

      if (!name || !studentId) {
        return res.status(400).json({ error: 'Name and Student ID are required' });
      }

      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === id);
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const data = await readData();
      const existingStudent = data.students.find(s =>
        s.organizationId === id &&
        s.studentId === studentId
      );
      if (existingStudent) {
        return res.status(400).json({ error: 'Student ID already exists in this organization' });
      }

      const scoreNumber = Number(score || 0);
      const rankInfo = getRankInfo(scoreNumber);
      const newStudent = {
        id: Date.now().toString(),
        name,
        studentId,
        organizationId: id,
        answerCount: 0,
        totalAnswers: 0,
        correctAnswers: 0,
        level: rankInfo.rankIndex + 1,
        rank: rankInfo.rank,
        rankIndex: rankInfo.rankIndex,
        experience: scoreNumber,
        score: scoreNumber,
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

      organization.students = organization.students || [];
      organization.students.push(newStudent.id);
      organization.updatedAt = new Date().toISOString();
      await writeOrganizations(organizations);

      broadcast({ type: 'studentAdded', student: newStudent });
      res.status(201).json(newStudent);
    } catch (error) {
      console.error('Error creating student as admin:', error);
      res.status(500).json({ error: 'Failed to create student' });
    }
  });

  // Admin updates a student's score
  app.patch('/api/admin/organizations/:orgId/students/:studentId', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const { orgId, studentId } = req.params;
      const { score } = req.body;

      if (score === undefined || score === null || isNaN(Number(score))) {
        return res.status(400).json({ error: 'Valid score is required' });
      }

      const data = await readData();
      const student = data.students.find(s => s.id === studentId && s.organizationId === orgId);
      if (!student) {
        return res.status(404).json({ error: 'Student not found in this organization' });
      }

      const numericScore = Number(score);
      student.score = numericScore;
      student.experience = numericScore;
      const rankInfo = getRankInfo(numericScore);
      student.rank = rankInfo.rank;
      student.rankIndex = rankInfo.rankIndex;
      student.level = rankInfo.rankIndex + 1;
      student.updatedAt = new Date().toISOString();

      data.lastUpdate = new Date().toISOString();
      await writeData(data);

      broadcast({ type: 'studentUpdated', student });
      res.json(student);
    } catch (error) {
      console.error('Error updating student score as admin:', error);
      res.status(500).json({ error: 'Failed to update student score' });
    }
  });

  // ==================== Admin Organization Settings API ====================

  // Get organization settings (admin only)
  app.get('/api/admin/organizations/:id/settings', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === id);
      
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      
      // Return admin settings or default
      const defaultSettings = {
        accountLimits: {
          maxTeachers: -1,
          maxStudents: -1,
          storageLimitMB: -1,
          apiRateLimitPerHour: -1
        },
        accountStatus: {
          status: 'active',
          expiryDate: null,
          isTrial: false,
          suspensionReason: ''
        },
        featurePermissions: {
          canUseClassView: true,
          canUseChallengeMode: true,
          canUseGameFeatures: true,
          canExportData: true,
          canUseCustomSettings: true,
          canUseBackup: true
        },
        dataManagement: {
          backupFrequencyLimit: 'daily',
          dataRetentionDays: 365,
          maxBackupCount: 10
        },
        securityCompliance: {
          forcePasswordPolicy: false,
          loginAttemptLimit: 5,
          sessionTimeoutMs: 3600000,
          ipWhitelist: []
        },
        notifications: {
          sendSystemNotifications: true,
          sendWarningEmails: true,
          sendExpiryReminders: true,
          activityMonitoring: true
        },
        billing: {
          subscriptionPlan: 'free',
          billingCycle: 'monthly',
          autoRenew: false,
          paymentStatus: 'unpaid',
          nextBillingDate: null
        }
      };
      
      const adminSettings = organization.adminSettings || defaultSettings;
      res.json(adminSettings);
    } catch (error) {
      console.error('Error getting organization settings:', error);
      res.status(500).json({ error: 'Failed to get organization settings' });
    }
  });

  // Update organization settings (admin only)
  app.put('/api/admin/organizations/:id/settings', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { adminSettings } = req.body;
      
      if (!adminSettings || typeof adminSettings !== 'object') {
        return res.status(400).json({ error: 'adminSettings data is required' });
      }
      
      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === id);
      
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      
      // Update admin settings
      organization.adminSettings = adminSettings;
      organization.updatedAt = new Date().toISOString();
      
      const orgIndex = organizations.findIndex(o => o.id === id);
      organizations[orgIndex] = organization;
      await writeOrganizations(organizations);
      
      res.json({
        message: 'Settings saved successfully',
        adminSettings: organization.adminSettings
      });
    } catch (error) {
      console.error('Error updating organization settings:', error);
      res.status(500).json({ error: 'Failed to update organization settings' });
    }
  });

  // Get organization statistics (admin only)
  app.get('/api/admin/organizations/:id/statistics', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === id);
      
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      
      const users = await readUsers();
      const data = await readData();
      
      const orgUsers = users.filter(u => u.organizationId === id);
      const teachers = orgUsers.filter(u => u.role === 'teacher');
      const students = data.students ? data.students.filter(s => s.organizationId === id) : [];
      
      const adminSettings = organization.adminSettings || {};
      const accountLimits = adminSettings.accountLimits || {};
      
      // Calculate statistics
      const stats = {
        teacherCount: teachers.length,
        studentCount: students.length,
        maxTeachers: accountLimits.maxTeachers || -1,
        maxStudents: accountLimits.maxStudents || -1,
        storageUsedMB: 0, // TODO: Calculate actual storage
        storageLimitMB: accountLimits.storageLimitMB || -1,
        apiCalls24h: 0, // TODO: Track API calls
        apiRateLimitPerHour: accountLimits.apiRateLimitPerHour || -1,
        activeUsers7d: orgUsers.length, // TODO: Calculate actual active users
        activeTeachers7d: teachers.length,
        activeStudents7d: students.length,
        lastLogin: null, // TODO: Track last login
        dataCreated: organization.createdAt,
        lastActivity: organization.updatedAt || organization.createdAt,
        studentGrowth: 0, // TODO: Calculate growth
        teacherGrowth: 0 // TODO: Calculate growth
      };
      
      res.json(stats);
    } catch (error) {
      console.error('Error getting organization statistics:', error);
      res.status(500).json({ error: 'Failed to get organization statistics' });
    }
  });

  // Get organization audit logs (admin only)
  app.get('/api/admin/organizations/:id/audit-logs', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.query;
      
      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === id);
      
      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      
      // Get audit logs from organization or return empty array
      let auditLogs = organization.auditLogs || [];
      
      // Filter by date range if provided
      if (startDate || endDate) {
        auditLogs = auditLogs.filter(log => {
          const logDate = new Date(log.timestamp);
          if (startDate && logDate < new Date(startDate)) return false;
          if (endDate && logDate > new Date(endDate + 'T23:59:59')) return false;
          return true;
        });
      }
      
      // Sort by timestamp descending (newest first)
      auditLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      res.json(auditLogs);
    } catch (error) {
      console.error('Error getting audit logs:', error);
      res.status(500).json({ error: 'Failed to get audit logs' });
    }
  });

  // Batch operations on organizations (admin only)
  app.post('/api/admin/organizations/batch', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const { organizationIds, action, options } = req.body;
      
      if (!Array.isArray(organizationIds) || organizationIds.length === 0) {
        return res.status(400).json({ error: 'organizationIds array is required' });
      }
      
      if (!action) {
        return res.status(400).json({ error: 'action is required' });
      }
      
      const organizations = await readOrganizations();
      let affectedCount = 0;
      
      for (const orgId of organizationIds) {
        const orgIndex = organizations.findIndex(o => o.id === orgId);
        if (orgIndex === -1) continue;
        
        const org = organizations[orgIndex];
        
        if (!org.adminSettings) {
          org.adminSettings = {};
        }
        if (!org.adminSettings.accountStatus) {
          org.adminSettings.accountStatus = {};
        }
        
        switch(action) {
          case 'activate':
            org.adminSettings.accountStatus.status = 'active';
            org.adminSettings.accountStatus.suspensionReason = '';
            affectedCount++;
            break;
          case 'suspend':
            org.adminSettings.accountStatus.status = 'suspended';
            org.adminSettings.accountStatus.suspensionReason = options || 'Suspended by admin';
            affectedCount++;
            break;
          case 'disable':
            org.adminSettings.accountStatus.status = 'disabled';
            org.adminSettings.accountStatus.suspensionReason = options || 'Disabled by admin';
            affectedCount++;
            break;
          case 'sendNotification':
            // TODO: Implement notification sending
            affectedCount++;
            break;
          case 'exportData':
            // TODO: Implement data export
            affectedCount++;
            break;
        }
        
        org.updatedAt = new Date().toISOString();
        organizations[orgIndex] = org;
      }
      
      await writeOrganizations(organizations);
      
      res.json({
        message: `Batch operation completed`,
        action: action,
        affectedCount: affectedCount
      });
    } catch (error) {
      console.error('Error executing batch operation:', error);
      res.status(500).json({ error: 'Failed to execute batch operation' });
    }
  });

  // Batch update organization settings (admin only)
  app.post('/api/admin/organizations/batch-settings', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const { organizationIds, settingKey, settingValue } = req.body;
      
      if (!Array.isArray(organizationIds) || organizationIds.length === 0) {
        return res.status(400).json({ error: 'organizationIds array is required' });
      }
      
      if (!settingKey || settingValue === undefined) {
        return res.status(400).json({ error: 'settingKey and settingValue are required' });
      }
      
      const organizations = await readOrganizations();
      let affectedCount = 0;
      
      for (const orgId of organizationIds) {
        const orgIndex = organizations.findIndex(o => o.id === orgId);
        if (orgIndex === -1) continue;
        
        const org = organizations[orgIndex];
        
        if (!org.adminSettings) {
          org.adminSettings = {};
        }
        
        // Update setting based on key path
        const keyParts = settingKey.split('.');
        let target = org.adminSettings;
        
        for (let i = 0; i < keyParts.length - 1; i++) {
          if (!target[keyParts[i]]) {
            target[keyParts[i]] = {};
          }
          target = target[keyParts[i]];
        }
        
        // Convert value to appropriate type
        let finalValue = settingValue;
        if (!isNaN(settingValue) && settingValue !== '') {
          finalValue = Number(settingValue);
        }
        
        target[keyParts[keyParts.length - 1]] = finalValue;
        org.updatedAt = new Date().toISOString();
        organizations[orgIndex] = org;
        affectedCount++;
      }
      
      await writeOrganizations(organizations);
      
      res.json({
        message: 'Settings updated successfully',
        settingKey: settingKey,
        affectedCount: affectedCount
      });
    } catch (error) {
      console.error('Error updating batch settings:', error);
      res.status(500).json({ error: 'Failed to update batch settings' });
    }
  });
}

module.exports = { registerAdminOrganizationsRoutes };
