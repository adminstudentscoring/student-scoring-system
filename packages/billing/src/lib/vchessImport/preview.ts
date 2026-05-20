/**
 * V.Chess import — preview builder.
 */
import { createHash } from 'node:crypto';
import {
  expandVchessScheduleDatesToYmd,
  extractDefaultYearFromInvoiceDate,
  utcYmdToEnglishDow
} from '@student-scoring/core';
import type {
  PreviewEnrollmentItem,
  PreviewRowResolution,
  TimetableCreateSpec,
  VchessImportApplyConfig,
  VchessImportPreviewResult
} from './types';
import {
  enrollmentExists,
  findStudent,
  getMapped,
  inferTimetableCreateSpec,
  matchTimetableEntry
} from './match';

export function buildVchessImportPreview(input: {
  importBatchId: string;
  organizationId: string;
  applyConfig: VchessImportApplyConfig;
  rows: Record<string, unknown>[];
  students: any[];
  timetableEntries: any[];
  enrollments: any[];
}): VchessImportPreviewResult {
  const { importBatchId, organizationId, applyConfig, rows, students, timetableEntries, enrollments } = input;
  const roles = applyConfig.columnRoles;
  const matchField = applyConfig.studentMatchField;

  const outRows: VchessImportPreviewResult['rows'] = [];
  const resolutions: PreviewRowResolution[] = [];

  let matchStudents = 0;
  let createStudents = 0;
  let timetableMatched = 0;
  let timetableUnmatched = 0;
  const pendingTimetableCreateKeys = new Set<string>();
  let proposedEnrollments = 0;
  let skippedDuplicateEnrollments = 0;
  let blockedRows = 0;

  rows.forEach((row, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const studentName = getMapped(row, roles, 'studentName');
    const externalId = getMapped(row, roles, 'externalId');
    const className = getMapped(row, roles, 'className');
    const timeRange = getMapped(row, roles, 'timeRange');
    const lessonDatesRaw = getMapped(row, roles, 'lessonDates');
    const invoiceDate = getMapped(row, roles, 'invoiceDate');
    const contactPhone = getMapped(row, roles, 'contactPhone');

    const defaultYear = extractDefaultYearFromInvoiceDate(invoiceDate || null);
    const lessonDatesYmd = expandVchessScheduleDatesToYmd(lessonDatesRaw || null, defaultYear);
    if (!lessonDatesRaw?.trim()) {
      errors.push('Lesson dates column empty');
    } else if (lessonDatesYmd.length === 0) {
      errors.push('No valid lesson dates parsed from lesson dates field');
    }

    let studentAction: 'match' | 'create' | 'blocked' = 'blocked';
    let existingStudentId: string | null = null;
    let proposedStudentName: string | null = null;

    const stu = findStudent(students, organizationId, matchField, studentName, externalId, contactPhone);
    if (stu) {
      studentAction = 'match';
      existingStudentId = String(stu.id);
      matchStudents++;
    } else {
      if (matchField === 'chessComId' && !String(externalId || '').trim()) {
        errors.push('External ID required for chessComId match but empty');
        studentAction = 'blocked';
      } else if (!studentName.trim()) {
        errors.push('Student name required to create new student');
        studentAction = 'blocked';
      } else {
        studentAction = 'create';
        proposedStudentName = studentName.trim();
        createStudents++;
      }
    }

    let timetableEntryId: string | null = null;
    let timetableCreateKey: string | null = null;
    let proposedTimetableSpec: TimetableCreateSpec | null = null;
    let timetableWillCreateRow = false;
    let timetableLabel: string | null = null;
    const tm = matchTimetableEntry(timetableEntries, organizationId, className, timeRange);
    if (tm) {
      timetableEntryId = String(tm.entry.id);
      timetableLabel = `${tm.entry.className} ${tm.entry.startTime}-${tm.entry.endTime}`;
      timetableMatched++;
      if (tm.ambiguous) warnings.push('Multiple timetable rows matched; using first — verify in Timetable');
      const entry = tm.entry;
      if (entry.isRecurring && Array.isArray(entry.dayOfWeek) && entry.dayOfWeek.length > 0) {
        for (const d of lessonDatesYmd) {
          const dow = utcYmdToEnglishDow(d);
          if (dow && !entry.dayOfWeek.includes(dow)) {
            warnings.push(`Date ${d} is ${dow}, not in class days ${entry.dayOfWeek.join(', ')}`);
          }
        }
      }
      if (!entry.isRecurring && entry.date) {
        const ed = String(entry.date).split('T')[0];
        for (const d of lessonDatesYmd) {
          if (d !== ed) warnings.push(`Lesson date ${d} differs from one-off class date ${ed}`);
        }
      }
    } else if (applyConfig.createTimetableIfMissing && lessonDatesYmd.length > 0) {
      const inferred = inferTimetableCreateSpec({
        organizationId,
        className,
        timeRange,
        lessonDatesYmd,
        defaultCourseIds: applyConfig.defaultCourseIds,
        defaultTeacherIds: applyConfig.defaultTeacherIds,
        defaultClassroom: applyConfig.defaultClassroom
      });
      if (inferred.ok === false) {
        errors.push(inferred.error);
        timetableUnmatched++;
      } else {
        proposedTimetableSpec = { ...inferred.spec, createKey: inferred.createKey };
        timetableCreateKey = inferred.createKey;
        timetableWillCreateRow = true;
        pendingTimetableCreateKeys.add(inferred.createKey);
        const rec = inferred.spec.isRecurring ? `recurring ${(inferred.spec.dayOfWeek || []).join(',')}` : `one-off ${inferred.spec.date}`;
        timetableLabel = `(new) ${inferred.spec.className} ${inferred.spec.startTime}-${inferred.spec.endTime} · ${rec}`;
        warnings.push('Timetable slot will be created on apply (Phase 2)');
      }
    } else {
      errors.push(
        'No matching timetable entry (class name + time). Enable create-timetable option or add the slot in Timetable first.'
      );
      timetableUnmatched++;
    }

    const enrollItems: PreviewEnrollmentItem[] = [];
    const effectiveStudentId = existingStudentId;

    const hasTimetableTarget = !!(timetableEntryId || timetableCreateKey);
    if (hasTimetableTarget && lessonDatesYmd.length > 0 && (studentAction === 'match' || studentAction === 'create')) {
      for (const date of lessonDatesYmd) {
        let willSkip = false;
        if (studentAction === 'match' && effectiveStudentId && timetableEntryId) {
          willSkip = enrollmentExists(enrollments, organizationId, effectiveStudentId, timetableEntryId, date);
        }
        enrollItems.push({ rowIndex: index, date, willSkipDuplicate: willSkip });
        if (willSkip) skippedDuplicateEnrollments++;
        else proposedEnrollments++;
      }
    }

    if (errors.length > 0) blockedRows++;

    outRows.push({
      index,
      errors,
      warnings,
      studentAction,
      existingStudentId,
      proposedStudentName,
      timetableEntryId,
      timetableCreateKey,
      timetableWillCreate: timetableWillCreateRow,
      proposedTimetableSpec,
      timetableLabel,
      lessonDatesYmd,
      enrollments: enrollItems
    });

    resolutions.push({
      index,
      studentAction,
      existingStudentId,
      proposedStudentName,
      timetableEntryId,
      timetableCreateKey,
      proposedTimetableSpec,
      lessonDatesYmd: [...lessonDatesYmd].sort(),
      errors: [...errors]
    });
  });

  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        importBatchId,
        organizationId,
        applyConfig,
        resolutions: resolutions.map((r) => ({
          i: r.index,
          sa: r.studentAction,
          sid: r.existingStudentId,
          pn: r.proposedStudentName,
          tid: r.timetableEntryId,
          tck: r.timetableCreateKey,
          tspec: r.proposedTimetableSpec,
          d: r.lessonDatesYmd,
          err: r.errors
        }))
      })
    )
    .digest('hex');

  return {
    digest,
    summary: {
      rowCount: rows.length,
      blockedRows,
      matchStudents,
      createStudents,
      timetableMatched,
      timetableUnmatched,
      timetableWillCreate: pendingTimetableCreateKeys.size,
      proposedEnrollments,
      skippedDuplicateEnrollments
    },
    rows: outRows,
    resolutions
  };
}
