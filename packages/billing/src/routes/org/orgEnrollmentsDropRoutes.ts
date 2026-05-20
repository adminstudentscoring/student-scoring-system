// Organization orders routes — extracted from organizationsBillingRoutes.ts
const {
  quotaPayLog,
  appendEnrollmentDropLog,
  classSlotMatchesDroppedEnrollment,
  pruneUnpaidOrdersAfterEnrollmentDrops,
  toComparableYmd,
  mergeSalesOrderItems,
  roundMoney,
  effectiveAmountPaid,
  validateLessonQuotaForItems,
  applyLessonQuotaDeduction
} = require('./orgBillingHelpers');
function registerOrgEnrollmentsDropRoutes(app: any, deps: any): void {
  const {
    authenticateUser,
    authorizeRole,
    resolveOrgIdFromUser,
    readUsers,
    readData,
    writeData,
    readOrders,
    writeOrders,
    readEnrollments,
    writeEnrollments,
    readTimetable,
    writeTimetable
  } = deps;

  app.post('/api/organizations/enrollments/drop', authenticateUser, authorizeRole('organization'), async (req, res) => {
    let debugDropAll: Record<string, unknown> | undefined;
    try {
      const { studentId, mode, enrollmentId, timetableEntryId, date, courseId } = req.body;

      console.log('[enrollments/drop] raw body', JSON.stringify(req.body));
      console.log(
        `[enrollments/drop] parsed studentId=${studentId} (${typeof studentId}) mode=${mode} timetableEntryId=${timetableEntryId} (${typeof timetableEntryId}) date=${JSON.stringify(date)} fromDate=${JSON.stringify(req.body.fromDate)}`
      );
      await appendEnrollmentDropLog(
        `REQUEST mode=${mode} studentId=${studentId} timetableEntryId=${timetableEntryId} date=${JSON.stringify(date)} fromDate=${JSON.stringify(req.body.fromDate)} bodyKeys=${Object.keys(req.body || {}).join(',')}`
      );

      if (!studentId || !mode) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Read Students from DATA_FILE (students.txt) via readData()
      const data = await readData();
      const students = data.students || [];
      const studentIndex = students.findIndex(s => s.id === studentId);

      if (studentIndex === -1) {
        console.log(`[DEBUG] Student NOT FOUND in students.txt. ID: ${studentId}`);
        return res.status(404).json({ error: 'Student not found' });
      }

      let enrollments = await readEnrollments();
      const orders = await readOrders();
      const timetableData = await readTimetable();

      /** Per-lesson $ from original paid order line (same logic as former cash refund). */
      const findPaidLessonUnitPrice = (enrollment: any): number => {
        if (!enrollment.orderId) return 0;
        const order = orders.find((o: any) => o.id === enrollment.orderId);
        if (!order || order.status !== 'paid') return 0;
        for (const item of order.items || []) {
          if (!item.enrolledClasses || !Array.isArray(item.enrolledClasses)) continue;
          const match = item.enrolledClasses.some((cls: any) => {
            let clsDate: string;
            if (cls.dateString) clsDate = cls.dateString;
            else clsDate = new Date(cls.date).toISOString().split('T')[0];
            if (clsDate !== enrollment.date) return false;
            if (cls.id === enrollment.timetableEntryId) return true;
            if (typeof cls.id === 'string' && cls.id.startsWith(enrollment.timetableEntryId + '_')) return true;
            if (enrollment.timetableEntryId.startsWith(cls.id + '_')) return true;
            return typeof cls.id === 'string' && cls.id.includes(enrollment.timetableEntryId);
          });
          if (match) {
            const count = item.enrolledClasses.length || 1;
            return (Number(item.price) || 0) / count;
          }
        }
        return 0;
      };

      const lessonQuotaDelta: Record<string, number> = {};
      const creditLessonQuota = (enrollment: any) => {
        const unit = findPaidLessonUnitPrice(enrollment);
        if (unit <= 0) return;
        const cents = Math.round(Number(unit) * 100);
        if (!Number.isFinite(cents) || cents <= 0) return;
        const k = String(cents);
        const st = students[studentIndex];
        if (!st.lessonQuotaByCents) st.lessonQuotaByCents = {};
        st.lessonQuotaByCents[k] = (Number(st.lessonQuotaByCents[k]) || 0) + 1;
        lessonQuotaDelta[k] = (lessonQuotaDelta[k] || 0) + 1;
      };

      let droppedCount = 0;
      const droppedForOrderSync: { date: string; timetableEntryId: string }[] = [];

      if (mode === 'single') {
        let targetIndex = -1;
        if (enrollmentId) {
          targetIndex = enrollments.findIndex(e => e.id === enrollmentId);
        } else if (timetableEntryId && date) {
          targetIndex = enrollments.findIndex(
            (e) =>
              String(e.studentId) === String(studentId) &&
              String(e.timetableEntryId) === String(timetableEntryId) &&
              e.date === date
          );
        }

        if (targetIndex !== -1) {
          const enrollment = enrollments[targetIndex];
          creditLessonQuota(enrollment);
          droppedForOrderSync.push({ date: enrollment.date, timetableEntryId: enrollment.timetableEntryId });
          enrollments.splice(targetIndex, 1);
          droppedCount++;
        }
      } else if (mode === 'all') {
        if (!timetableEntryId) return res.status(400).json({ error: 'Timetable Entry ID required for Drop All' });

        const sid = String(studentId);
        const tid = String(timetableEntryId);

        // Drop from this calendar day onward (inclusive). date OR fromDate must be valid YYYY-MM-DD (no silent fallback).
        const rawCutoff =
          typeof date === 'string' && date.trim()
            ? date.trim()
            : typeof req.body.fromDate === 'string' && req.body.fromDate.trim()
              ? req.body.fromDate.trim()
              : typeof req.body.cutoffDate === 'string' && req.body.cutoffDate.trim()
                ? req.body.cutoffDate.trim()
                : '';
        const cutoffFromBody = toComparableYmd(rawCutoff);
        if (!cutoffFromBody) {
          const msg = `mode=all requires date (YYYY-MM-DD). Got date=${JSON.stringify(date)} fromDate=${JSON.stringify(req.body.fromDate)} rawCutoff=${JSON.stringify(rawCutoff)}`;
          console.error('[enrollments/drop]', msg);
          await appendEnrollmentDropLog(`REJECT ${msg}`);
          return res.status(400).json({
            error: 'Missing or invalid cutoff date for Drop All Future',
            hint: 'Send date or fromDate as YYYY-MM-DD (the selected day on the calendar).',
            received: { date, fromDate: req.body.fromDate, cutoffDate: req.body.cutoffDate }
          });
        }
        const cutoffYmd = cutoffFromBody;

        const seriesBefore = enrollments.filter(
          (e: any) => String(e.studentId) === sid && String(e.timetableEntryId) === tid
        );
        console.log(
          `[enrollments/drop] mode=all cutoffYmd=${cutoffYmd} sid=${sid} tid=${tid} seriesCount=${seriesBefore.length}`
        );
        console.log(
          `[enrollments/drop] series ymd list`,
          seriesBefore.map((e: any) => ({ id: e.id, raw: e.date, ymd: toComparableYmd(e.date) }))
        );

        const newEnrollments = [];

        for (const e of enrollments) {
          const eYmd = toComparableYmd(e.date);
          const sameStudent = String(e.studentId) === sid;
          const sameSeries = String(e.timetableEntryId) === tid;
          const shouldDrop = eYmd != null && eYmd >= cutoffYmd && sameStudent && sameSeries;
          if (sameStudent && sameSeries && eYmd == null) {
            console.warn(`[enrollments/drop] could not parse enrollment.date, keeping row:`, e.id, e.date);
          }
          if (shouldDrop) {
            console.log(`[enrollments/drop] DROP row`, { id: e.id, rawDate: e.date, eYmd, cutoffYmd });
            creditLessonQuota(e);
            droppedForOrderSync.push({ date: e.date, timetableEntryId: e.timetableEntryId });
            droppedCount++;
          } else {
            newEnrollments.push(e);
          }
        }
        enrollments = newEnrollments;

        const keptSeries = enrollments.filter(
          (e: any) => String(e.studentId) === sid && String(e.timetableEntryId) === tid
        );
        debugDropAll = {
          cutoffYmd,
          studentId: sid,
          timetableEntryId: tid,
          seriesCountBefore: seriesBefore.length,
          seriesCountAfter: keptSeries.length,
          droppedDates: droppedForOrderSync.map((d) => d.date),
          keptDates: keptSeries.map((e: any) => toComparableYmd(e.date)).filter(Boolean)
        };
        console.log('[enrollments/drop] mode=all result', debugDropAll);
        await appendEnrollmentDropLog(`OK ${JSON.stringify(debugDropAll)}`);
      }

      // Paid drops → lesson quota by unit price tier (cents key), not cash balance
      if (Object.keys(lessonQuotaDelta).length > 0) {
        await writeData(data);
      }

      await writeEnrollments(enrollments);

      const orgIdForOrders = resolveOrgIdFromUser(req.user);
      if (orgIdForOrders && droppedForOrderSync.length > 0) {
        pruneUnpaidOrdersAfterEnrollmentDrops(orders, orgIdForOrders, String(studentId), droppedForOrderSync);
        await writeOrders(orders);
      }

      res.json({
        success: true,
        droppedCount,
        refundAmount: 0,
        newBalance: students[studentIndex].balance || 0,
        lessonQuotaDelta,
        lessonQuotaByCents: students[studentIndex].lessonQuotaByCents || {},
        ...(debugDropAll ? { dropAll: debugDropAll } : {})
      });
    } catch (error) {
      console.error('Error dropping enrollment:', error);
      res.status(500).json({ error: 'Failed to drop enrollment' });
    }
  });
}

module.exports = { registerOrgEnrollmentsDropRoutes };
export {};
