// OrgTimetableAdjustRoutes — extracted from orgCrudRoutes.ts
// All route behavior should remain identical.

function registerOrgTimetableAdjustRoutes(app: any, deps: any): void {
  const {
    authenticateUser,
    authorizeRole,
    readOrganizations,
    readTimetable,
    writeTimetable,
    readEnrollments,
    writeEnrollments
  } = deps;

  app.post('/api/organizations/timetable/makeup', authenticateUser, authorizeRole('organization'), async (req, res) => {
    const logs = [];
    const log = (msg) => {
      console.log('[MAKEUP]', msg);
      logs.push(String(msg));
    };

    try {
      const { studentId, fromEntryId, fromDate, toEntryId, toDate, studentName } = req.body;

      log(`Makeup request: ${studentName} (${studentId}) from ${fromEntryId} on ${fromDate} to ${toEntryId} on ${toDate}`);

      if (!studentId || !fromEntryId || !fromDate || !toEntryId || !toDate) {
        return res.status(400).json({ error: 'Missing required fields', logs });
      }

      if (!req.user || !req.user.organizationId) {
        log('Error: User not authenticated or missing organizationId');
        return res.status(403).json({ error: 'Authentication required', logs });
      }

      const enrollments = await readEnrollments();
      const timetableData = await readTimetable();
      log(`Loaded ${enrollments.length} enrollments`);

      if (enrollments.length > 0) {
        log(`Sample enrollment: ${JSON.stringify(enrollments[0])}`);
      }

      log('Step 1: Finding original enrollment/student to drop');
      log(`Looking for studentId: ${studentId}, timetableEntryId: ${fromEntryId}, date: ${fromDate}`);

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

        enrollments.splice(originalEnrollmentIndex, 1);
        log('Original enrollment dropped');
        studentRemoved = true;
      } else {
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

      log('Step 2: Creating new enrollment for target class');

      const existingTargetEnrollment = enrollments.find(e =>
        String(e.studentId) === String(studentId) &&
        e.timetableEntryId === toEntryId &&
        e.date === toDate
      );

      const toEntry = timetableData.entries.find(e => e.id === toEntryId);
      const alreadyInTargetEntry = toEntry && toEntry.studentIds && toEntry.studentIds.includes(studentId);

      if (existingTargetEnrollment || alreadyInTargetEntry) {
        log(`Student already in target class (enrollment: ${!!existingTargetEnrollment}, entry: ${!!alreadyInTargetEntry})`);
      } else {
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

      await writeEnrollments(enrollments);
      log('Enrollments saved successfully');

      await writeTimetable(timetableData);
      log('Timetable data saved successfully');

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

      if (!req.user || !req.user.organizationId) {
        log('Error: User not authenticated or missing organizationId');
        return res.status(403).json({ error: 'Authentication required', logs });
      }

      const enrollments = await readEnrollments();
      const timetableData = await readTimetable();
      const organizations = await readOrganizations();
      log(`Loaded ${enrollments.length} enrollments, ${timetableData.entries.length} timetable entries`);

      const entry = timetableData.entries.find(e => e.id === timetableEntryId);
      if (!entry) {
        return res.status(404).json({ error: 'Timetable entry not found', logs });
      }

      if (entry.organizationId !== req.user.organizationId) {
        return res.status(403).json({ error: 'Access denied to this timetable entry', logs });
      }

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

      log('Step 3: Creating new enrollment for next week');

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
}

module.exports = { registerOrgTimetableAdjustRoutes };
export {};
