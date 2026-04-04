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
});
