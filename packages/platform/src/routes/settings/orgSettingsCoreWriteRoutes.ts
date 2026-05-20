// Organization settings write routes.
"use strict";

function registerOrgSettingsCoreWriteRoutes(app: any, deps: any, timetableHelpers: any): void {
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
      const orgId = req.user.organizationId;

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
      const orgId = req.user.organizationId;

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

module.exports = { registerOrgSettingsCoreWriteRoutes };
export {};
