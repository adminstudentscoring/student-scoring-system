// Organization settings read routes.
"use strict";

function registerOrgSettingsCoreReadRoutes(app: any, deps: any, timetableHelpers: any): void {
  const { isYmd, computeNextAvailableDateSameEntry } = timetableHelpers;
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
  const readUsers = deps?.readUsers;

  app.get('/api/class-view/settings', authenticateUser, authorizeRole('organization', 'teacher', 'admin'), requireOrganizationAccess, async (req, res) => {
    try {
      const organizations = await readOrganizations();

      let organizationId = req.organizationFilter;
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
          holidays: [],
          holidayRules: []
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

}

module.exports = { registerOrgSettingsCoreReadRoutes };
