// Organization settings routes extracted from organizationsRoutes.js
// All route behavior should remain identical.

import { Request, Response, NextFunction } from 'express';

function registerOrgSettingsRoutes(app: any, deps: any): void {
  const {
    authenticateUser,
    authorizeRole,
    requireOrganizationAccess,
    readUsers,
    readOrganizations,
    writeOrganizations,
    readTimetable,
    readEnrollments,
    writeEnrollments,
    broadcast
  } = deps;

  // ==================== Timetable helpers (needed for holiday auto-postpone) ====================
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

  // ==================== Organization Settings API ====================

  // Get Class View settings (teacher/organization/admin)
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

            const entry = entryById.get(String(enr.timetableEntryId)) as any;
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
      const { category } = req.body;

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

      if (category && organization.settings) {
        organization.settings = {};
      } else {
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

module.exports = { registerOrgSettingsRoutes };
