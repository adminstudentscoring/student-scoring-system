// Auto-renew logic extracted from server.js.
// Checks for students with autoRenewEnabled and creates renewal orders/enrollments.

const { addDays, addMonths, nextOccurrencesForEntry, packageLessonCount, computePackagePrice } = require('../lib/dateUtils');

function createAutoRenew(deps) {
  const {
    todayHkKey,
    hkTodayDateStr,
    readOrganizations,
    readData,
    readOrders,
    writeOrders,
    readEnrollments,
    writeEnrollments,
    readTimetable,
    readPackages,
    readCourses,
    nowIso,
    AUTO_RENEW_LEAD_DAYS
  } = deps;

  const autoRenewMeta = { lastRunAt: null, lastRunHkDay: null, lastRunOk: 0, lastRunErr: 0 };

  async function maybeRunAutoRenewAllOrgs() {
    try {
      const hkDay = todayHkKey();
      if (autoRenewMeta.lastRunHkDay && autoRenewMeta.lastRunHkDay === hkDay) return { ok: true, skipped: true };

      const today = hkTodayDateStr();
      const [organizations, data, orders, enrollments, timetable, packages, courses] = await Promise.all([
        readOrganizations(),
        readData(),
        readOrders(),
        readEnrollments(),
        readTimetable(),
        readPackages(),
        readCourses()
      ]);

      const orgById = new Map(organizations.map(o => [String(o.id), o]));
      const ordersById = new Map(orders.map(o => [String(o.id), o]));
      const coursesById = new Map(courses.map(c => [String(c.id), c]));
      const packagesById = new Map(packages.map(p => [String(p.id), p]));
      const entryById = new Map((timetable?.entries || []).map(e => [String(e.id), e]));

      let createdOrders = 0;
      let createdEnrollments = 0;
      let skipped = 0;

      const students = Array.isArray(data?.students) ? data.students : [];
      for (const stu of students) {
        if (!stu || !stu.autoRenewEnabled) continue;
        const orgId = String(stu.organizationId || '');
        const timetableEntryId = String(stu.autoRenewTimetableEntryId || '');
        const packageId = String(stu.autoRenewPackageId || '');
        if (!orgId || !timetableEntryId || !packageId) { skipped++; continue; }

        const org = orgById.get(orgId);
        const entry = entryById.get(timetableEntryId);
        const pkg = packagesById.get(packageId);
        if (!org || !entry || !pkg) { skipped++; continue; }

        const paidEnrolls = enrollments.filter(e =>
          String(e.organizationId) === orgId &&
          String(e.studentId) === String(stu.id) &&
          String(e.timetableEntryId) === timetableEntryId &&
          e.orderId &&
          ordersById.get(String(e.orderId)) &&
          String(ordersById.get(String(e.orderId)).status) === 'paid'
        );
        if (paidEnrolls.length === 0) { skipped++; continue; }

        const paidEnrollsWithPkg = paidEnrolls.filter(e => {
          const o = ordersById.get(String(e.orderId));
          const items = Array.isArray(o?.items) ? o.items : [];
          return items.some(it => String(it?.productData?.id || '') === packageId);
        });
        if (paidEnrollsWithPkg.length === 0) { skipped++; continue; }

        let last = null;
        for (const e of paidEnrollsWithPkg) {
          if (!e.date) continue;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.date))) continue;
          if (!last || String(e.date) > String(last.date)) last = e;
        }
        if (!last) { skipped++; continue; }

        const sourceOrderId = String(last.orderId);
        const sourceOrder = ordersById.get(sourceOrderId);
        if (!sourceOrder) { skipped++; continue; }

        const sourceEnrolls = enrollments.filter(e =>
          String(e.organizationId) === orgId &&
          String(e.studentId) === String(stu.id) &&
          String(e.timetableEntryId) === timetableEntryId &&
          String(e.orderId) === sourceOrderId &&
          typeof e.date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(e.date)
        );
        if (sourceEnrolls.length === 0) { skipped++; continue; }
        const lastClassDate = sourceEnrolls.reduce((mx, e) => (!mx || e.date > mx ? e.date : mx), null);
        const generateOn = addDays(lastClassDate, -AUTO_RENEW_LEAD_DAYS);
        if (generateOn !== today) continue;

        const already = orders.some(o =>
          String(o.organizationId) === orgId &&
          String(o.studentId) === String(stu.id) &&
          o?.meta?.autoRenew &&
          String(o.meta.autoRenew.sourceOrderId || '') === sourceOrderId
        );
        if (already) { skipped++; continue; }

        let nextDates = [];
        if (String(pkg.priceStrategy) === 'monthly') {
          const periodMonths = Number(pkg.monthlyPeriod) || 1;
          const end = addMonths(lastClassDate, periodMonths);
          nextDates = nextOccurrencesForEntry({
            entry,
            startAfterDateStr: lastClassDate,
            endDateStrInclusive: end,
            orgSettings: org.settings || {}
          });
        } else {
          const n = packageLessonCount(pkg);
          if (n <= 0) { skipped++; continue; }
          nextDates = nextOccurrencesForEntry({
            entry,
            startAfterDateStr: lastClassDate,
            count: n,
            orgSettings: org.settings || {}
          });
        }
        if (!Array.isArray(nextDates) || nextDates.length === 0) { skipped++; continue; }

        const existingDateSet = new Set(enrollments
          .filter(e =>
            String(e.organizationId) === orgId &&
            String(e.studentId) === String(stu.id) &&
            String(e.timetableEntryId) === timetableEntryId &&
            typeof e.date === 'string')
          .map(e => e.date)
        );
        nextDates = nextDates.filter(d => !existingDateSet.has(d));
        if (nextDates.length === 0) { skipped++; continue; }

        const classCount = nextDates.length;
        const price = computePackagePrice({ pkg, coursesById, classCount });
        const orderItem = {
          id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          productType: 'package',
          productData: pkg,
          enrolledClasses: nextDates.map(ds => ({
            id: `${entry.id}_${Date.parse(`${ds}T00:00:00Z`)}`,
            dateString: ds,
            date: `${ds}T00:00:00.000Z`,
            entry: {
              id: entry.id,
              className: entry.className,
              startTime: entry.startTime,
              endTime: entry.endTime,
              classroom: entry.classroom || null
            }
          })),
          price
        };

        const newOrder = {
          id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          organizationId: orgId,
          studentId: String(stu.id),
          date: new Date().toISOString(),
          status: 'unpaid',
          paymentDetails: null,
          items: [orderItem],
          totalAmount: price,
          createdBy: 'system:autoRenew',
          meta: {
            autoRenew: {
              sourceOrderId,
              packageId,
              timetableEntryId,
              leadDays: AUTO_RENEW_LEAD_DAYS,
              generatedOnHk: today
            }
          }
        };

        orders.push(newOrder);
        ordersById.set(String(newOrder.id), newOrder);
        createdOrders++;

        for (const ds of nextDates) {
          enrollments.push({
            id: `enr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            organizationId: orgId,
            studentId: String(stu.id),
            timetableEntryId: entry.id,
            date: ds,
            type: 'single',
            orderId: newOrder.id
          });
          createdEnrollments++;
        }
      }

      if (createdOrders > 0) await writeOrders(orders);
      if (createdEnrollments > 0) await writeEnrollments(enrollments);

      autoRenewMeta.lastRunAt = nowIso();
      autoRenewMeta.lastRunHkDay = hkDay;
      autoRenewMeta.lastRunOk = createdOrders;
      autoRenewMeta.lastRunErr = 0;
      return { ok: true, createdOrders, createdEnrollments, skipped };
    } catch (e) {
      autoRenewMeta.lastRunAt = nowIso();
      autoRenewMeta.lastRunErr = 1;
      console.error('Auto-renew tick error:', e);
      return { ok: false, error: String(e?.message || e) };
    }
  }

  return { maybeRunAutoRenewAllOrgs, autoRenewMeta };
}

module.exports = { createAutoRenew };
