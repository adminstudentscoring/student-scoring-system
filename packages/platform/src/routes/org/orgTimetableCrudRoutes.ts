// OrgTimetableCrudRoutes — extracted from orgCrudRoutes.ts
// All route behavior should remain identical.

function registerOrgTimetableCrudRoutes(app: any, deps: any): void {
  const {
    authenticateUser,
    authorizeRole,
    requireOrganizationAccess,
    readUsers,
    readOrganizations,
    readTimetable,
    writeTimetable,
    readEnrollments
  } = deps;

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

      const organizations = await readOrganizations();
      const teacherOrg = organizations.find(o => o.id === teacher.organizationId);
      const scheduleSettings =
        teacherOrg && teacherOrg.settings && typeof teacherOrg.settings.scheduleSettings === 'object'
          ? teacherOrg.settings.scheduleSettings
          : {};

      res.json({
        entries: filteredEntries,
        metadata: timetableData.metadata,
        enrollments: filteredEnrollments,
        scheduleSettings
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
        if (isRecurring) {
          if (startDate !== undefined) entry.startDate = startDate || null;
          if (endDate !== undefined) entry.endDate = endDate || null;
        } else {
          entry.startDate = null;
          entry.endDate = null;
        }
      } else if (entry.isRecurring) {
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
      const { date, mode } = req.body;

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
}

module.exports = { registerOrgTimetableCrudRoutes };
export {};
