/**
 * V.Chess import apply engine (preview / digest / timetable match).
 * Run: node --import tsx --test test/vchess-import-apply-engine.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildVchessImportPreview,
  applyVchessImportFromVerifiedPreview,
  DEFAULT_VCHESS_IMPORT_APPLY_CONFIG,
  inferTimetableCreateSpec,
  matchTimetableEntry,
  normalizeClassName,
  parseTimeRange
} from '../packages/billing/src/lib/vchessImportApplyEngine';
import { expandVchessScheduleDatesToYmd, extractDefaultYearFromInvoiceDate } from '@student-scoring/core';

describe('vchessScheduleDates (core)', () => {
  it('expands d/m with default year (HK: day/month)', () => {
    const y = extractDefaultYearFromInvoiceDate('07/12/2025');
    assert.strictEqual(y, 2025);
    const dates = expandVchessScheduleDatesToYmd('2/10, 17/10, 3/3', 2026);
    assert.ok(dates.includes('2026-10-02'));
    assert.ok(dates.includes('2026-10-17'));
    assert.ok(dates.includes('2026-03-03'));
  });

  it('expands ISO YYYY-MM-DD (Sales enrollment Excel export)', () => {
    const dates = expandVchessScheduleDatesToYmd('2026-04-02, 2026-04-09', 2025);
    assert.deepStrictEqual(dates, ['2026-04-02', '2026-04-09']);
  });
});

describe('vchessImportApplyEngine', () => {
  it('parseTimeRange normalizes', () => {
    const t = parseTimeRange('16:30 - 17:30');
    assert.deepStrictEqual(t, { start: '16:30', end: '17:30' });
  });

  it('normalizeClassName collapses space', () => {
    assert.strictEqual(normalizeClassName('  Chess   Class '), 'chess class');
  });

  it('matchTimetableEntry finds by class and time', () => {
    const entries = [
      {
        id: 't1',
        organizationId: 'o1',
        className: 'Chess Class',
        startTime: '16:30',
        endTime: '17:30',
        isRecurring: true,
        dayOfWeek: ['Thursday']
      }
    ];
    const m = matchTimetableEntry(entries, 'o1', 'chess class', '16:30-17:30');
    assert.ok(m);
    assert.strictEqual(m.entry.id, 't1');
  });

  it('buildVchessImportPreview proposes enrollments and apply respects digest', () => {
    const orgId = 'org_x';
    const applyConfig = {
      ...DEFAULT_VCHESS_IMPORT_APPLY_CONFIG,
      columnRoles: {
        ...DEFAULT_VCHESS_IMPORT_APPLY_CONFIG.columnRoles,
        studentName: 'student_display',
        externalId: 'customer_id',
        className: 'course_name',
        timeRange: 'schedule_time',
        lessonDates: 'schedule_dates',
        invoiceDate: 'invoice_date'
      },
      studentMatchField: 'chessComId' as const
    };
    const students = [
      {
        id: 's1',
        organizationId: orgId,
        name: 'A',
        chessComId: 'C100'
      }
    ];
    const timetableEntries = [
      {
        id: 't1',
        organizationId: orgId,
        className: 'Chess Class',
        startTime: '16:30',
        endTime: '17:30',
        isRecurring: true,
        dayOfWeek: ['Thursday']
      }
    ];
    const enrollments: any[] = [];
    const rows = [
      {
        student_display: 'Kid (C100)',
        customer_id: 'C100',
        course_name: 'Chess Class',
        schedule_time: '16:30-17:30',
        schedule_dates: '9/4/2026',
        invoice_date: '1/1/2026'
      }
    ];

    const preview = buildVchessImportPreview({
      importBatchId: 'imp_test',
      organizationId: orgId,
      applyConfig,
      rows,
      students,
      timetableEntries,
      enrollments
    });
    assert.ok(preview.digest);
    assert.strictEqual(preview.rows[0].studentAction, 'match');
    assert.strictEqual(preview.rows[0].timetableEntryId, 't1');

    const data = { students: [...students], lastUpdate: '' };
    const organizations = [{ id: orgId, students: ['s1'] }];
    const enr = [...enrollments];
    const timetableData = {
      entries: [...timetableEntries],
      metadata: { classNames: [] as string[], classrooms: [] as string[] }
    };

    const bad = applyVchessImportFromVerifiedPreview({
      previewDigest: 'wrong',
      importBatchId: 'imp_test',
      organizationId: orgId,
      applyConfig,
      rows,
      data,
      organizations,
      enrollments: enr,
      timetableEntries,
      timetableData
    });
    assert.strictEqual(bad.ok, false);

    const good = applyVchessImportFromVerifiedPreview({
      previewDigest: preview.digest,
      importBatchId: 'imp_test',
      organizationId: orgId,
      applyConfig,
      rows,
      data,
      organizations,
      enrollments: enr,
      timetableEntries,
      timetableData
    });
    assert.strictEqual(good.ok, true);
    if (good.ok) {
      assert.ok(good.result.enrollmentsCreated >= 1);
      assert.strictEqual(good.result.timetablesCreated, 0);
    }
  });

  it('inferTimetableCreateSpec rejects multiple weekdays', () => {
    const r = inferTimetableCreateSpec({
      organizationId: 'o',
      className: 'Chess',
      timeRange: '10:00-11:00',
      lessonDatesYmd: ['2026-04-09', '2026-04-10'],
      defaultCourseIds: [],
      defaultTeacherIds: [],
      defaultClassroom: ''
    });
    assert.strictEqual(r.ok, false);
  });

  it('preview accepts sales-export column names + ISO enrolled dates', () => {
    const orgId = 'org_salesfmt';
    const applyConfig = {
      ...DEFAULT_VCHESS_IMPORT_APPLY_CONFIG,
      createTimetableIfMissing: true,
      defaultCourseIds: ['course_x'],
      columnRoles: {
        studentName: 'Student Name',
        externalId: 'Student ID',
        className: 'Class Name',
        timeRange: 'Time Slot',
        lessonDates: 'Enrolled Dates',
        invoiceDate: 'Order ID'
      },
      studentMatchField: 'chessComId' as const
    };
    const students = [{ id: 's1', organizationId: orgId, name: 'Tuby', chessComId: 'vc001' }];
    const timetableEntries: any[] = [];
    const enrollments: any[] = [];
    const rows = [
      {
        'Student Name': 'Tuby',
        'Student ID': 'vc001',
        'Class Name': 'Chess Class',
        'Time Slot': '16:30 - 17:30',
        'Enrolled Dates': '2026-04-02, 2026-04-09',
        'Order ID': 'INV-1'
      }
    ];
    const preview = buildVchessImportPreview({
      importBatchId: 'imp_iso',
      organizationId: orgId,
      applyConfig,
      rows,
      students,
      timetableEntries,
      enrollments
    });
    assert.strictEqual(preview.rows[0].errors.length, 0, preview.rows[0].errors.join('; '));
    assert.ok(preview.rows[0].lessonDatesYmd.length >= 1);
    assert.ok(preview.summary.proposedEnrollments >= 1);
  });

  it('Phase 2: creates timetable + enrollments when no match and flag on', () => {
    const orgId = 'org_p2';
    const applyConfig = {
      ...DEFAULT_VCHESS_IMPORT_APPLY_CONFIG,
      createTimetableIfMissing: true,
      defaultCourseIds: ['course_x'],
      columnRoles: {
        ...DEFAULT_VCHESS_IMPORT_APPLY_CONFIG.columnRoles,
        studentName: 'student_display',
        externalId: 'customer_id',
        className: 'course_name',
        timeRange: 'schedule_time',
        lessonDates: 'schedule_dates',
        invoiceDate: 'invoice_date'
      },
      studentMatchField: 'chessComId' as const
    };
    const students = [
      { id: 's2', organizationId: orgId, name: 'B', chessComId: 'C200' }
    ];
    const timetableEntries: any[] = [];
    const enrollments: any[] = [];
    const rows = [
      {
        student_display: 'X (C200)',
        customer_id: 'C200',
        course_name: 'New Class',
        schedule_time: '10:00-11:00',
        schedule_dates: '9/4/2026',
        invoice_date: '1/1/2026'
      }
    ];
    const preview = buildVchessImportPreview({
      importBatchId: 'imp_p2',
      organizationId: orgId,
      applyConfig,
      rows,
      students,
      timetableEntries,
      enrollments
    });
    assert.strictEqual(preview.summary.timetableWillCreate, 1);
    assert.strictEqual(preview.rows[0].timetableWillCreate, true);
    assert.ok(preview.rows[0].timetableCreateKey);

    const data = { students: [...students], lastUpdate: '' };
    const organizations = [{ id: orgId, students: ['s2'] }];
    const enr = [...enrollments];
    const timetableData = {
      entries: [...timetableEntries],
      metadata: { classNames: [] as string[], classrooms: [] as string[] }
    };

    const applied = applyVchessImportFromVerifiedPreview({
      previewDigest: preview.digest,
      importBatchId: 'imp_p2',
      organizationId: orgId,
      applyConfig,
      rows,
      data,
      organizations,
      enrollments: enr,
      timetableEntries,
      timetableData
    });
    assert.strictEqual(applied.ok, true);
    if (applied.ok) {
      assert.strictEqual(applied.result.timetablesCreated, 1);
      assert.strictEqual(applied.result.enrollmentsCreated, 1);
      assert.strictEqual(timetableData.entries.length, 1);
      assert.strictEqual(timetableData.entries[0].className, 'New Class');
      assert.strictEqual(timetableData.entries[0].courseIds[0], 'course_x');
    }
  });

  it('apply dedupes new students by chessComId when multiple rows same customer', () => {
    const orgId = 'org_dedup';
    const applyConfig = {
      ...DEFAULT_VCHESS_IMPORT_APPLY_CONFIG,
      createTimetableIfMissing: true,
      defaultCourseIds: ['course_x'],
      columnRoles: {
        studentName: 'Student Name',
        externalId: 'Student ID',
        className: 'Class Name',
        timeRange: 'Time Slot',
        lessonDates: 'Enrolled Dates',
        invoiceDate: 'Order ID'
      },
      studentMatchField: 'chessComId' as const
    };
    const rows = [
      {
        'Student Name': 'Same Kid',
        'Student ID': 'C999',
        'Class Name': 'Morning',
        'Time Slot': '10:00 - 11:00',
        'Enrolled Dates': '2026-06-01, 2026-06-08',
        'Order ID': ''
      },
      {
        'Student Name': 'Same Kid',
        'Student ID': 'C999',
        'Class Name': 'Afternoon',
        'Time Slot': '14:00 - 15:00',
        'Enrolled Dates': '2026-06-02',
        'Order ID': ''
      }
    ];
    const preview = buildVchessImportPreview({
      importBatchId: 'imp_dd',
      organizationId: orgId,
      applyConfig,
      rows,
      students: [],
      timetableEntries: [],
      enrollments: []
    });
    assert.strictEqual(preview.rows[0].errors.length, 0);
    assert.strictEqual(preview.rows[1].errors.length, 0);

    const data = { students: [] as any[], lastUpdate: '' };
    const organizations = [{ id: orgId, students: [] as string[] }];
    const enr: any[] = [];
    const timetableData = {
      entries: [] as any[],
      metadata: { classNames: [] as string[], classrooms: [] as string[] }
    };

    const applied = applyVchessImportFromVerifiedPreview({
      previewDigest: preview.digest,
      importBatchId: 'imp_dd',
      organizationId: orgId,
      applyConfig,
      rows,
      data,
      organizations,
      enrollments: enr,
      timetableEntries: [],
      timetableData
    });
    assert.strictEqual(applied.ok, true);
    if (applied.ok) {
      assert.strictEqual(applied.result.studentsCreated, 1);
      assert.strictEqual(applied.result.enrollmentsCreated, 3);
      assert.strictEqual(applied.result.timetablesCreated, 2);
    }
  });
});
