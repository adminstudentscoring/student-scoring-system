// Admin Organization routes extracted from server.js.
// Includes /api/admin/organizations/* routes (CRUD, teachers, students, settings, statistics, audit, batch).
import { Request, Response, NextFunction } from 'express';
import type { AdminOrganizationsRouteDeps } from '@student-scoring/core';
function registerAdminOrgToolsRoutes(app: any, deps: any): void {
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

module.exports = { registerAdminOrgToolsRoutes };
export {};
