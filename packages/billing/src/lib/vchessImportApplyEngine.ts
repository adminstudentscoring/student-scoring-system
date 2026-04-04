/**
 * Preview and apply V.Chess invoice import rows → students + enrollments (existing timetable only).
 */
import { createHash } from 'node:crypto';
import {
  expandVchessScheduleDatesToYmd,
  extractDefaultYearFromInvoiceDate,
  utcYmdToEnglishDow
} from '@student-scoring/core';

export type StudentMatchField = 'chessComId' | 'name' | 'name_phone';

export type VchessColumnRoles = {
  studentName?: string;
  externalId?: string;
  className?: string;
  timeRange?: string;
  lessonDates?: string;
  invoiceDate?: string;
  contactPhone?: string;
};

export type TimetableCreateSpec = {
  createKey: string;
  className: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  dayOfWeek: string[] | null;
  date: string | null;
  startDate: string | null;
  endDate: string | null;
  courseIds: string[];
  teacherIds: string[];
  classroom: string | null;
};

export type VchessImportApplyConfig = {
  columnRoles: VchessColumnRoles;
  studentMatchField: StudentMatchField;
  /** Phase 2: when no timetable row matches, create one (deduped by class+time+pattern). */
  createTimetableIfMissing: boolean;
  defaultCourseIds: string[];
  defaultTeacherIds: string[];
  defaultClassroom: string;
};

export const DEFAULT_VCHESS_IMPORT_APPLY_CONFIG: VchessImportApplyConfig = {
  columnRoles: {
    studentName: 'student_display',
    externalId: 'customer_id',
    className: 'course_name',
    timeRange: 'schedule_time',
    lessonDates: 'schedule_dates',
    invoiceDate: 'invoice_date',
    contactPhone: 'contactPhone'
  },
  studentMatchField: 'chessComId',
  createTimetableIfMissing: false,
  defaultCourseIds: [],
  defaultTeacherIds: [],
  defaultClassroom: ''
};

export function mergeVchessImportApplyConfig(
  existing: Partial<VchessImportApplyConfig> | null | undefined,
  patch: Partial<VchessImportApplyConfig>
): VchessImportApplyConfig {
  const base = { ...DEFAULT_VCHESS_IMPORT_APPLY_CONFIG, ...(existing || {}) };
  return {
    columnRoles: { ...base.columnRoles, ...(patch.columnRoles || {}) },
    studentMatchField: patch.studentMatchField ?? base.studentMatchField,
    createTimetableIfMissing:
      patch.createTimetableIfMissing !== undefined
        ? !!patch.createTimetableIfMissing
        : base.createTimetableIfMissing,
    defaultCourseIds:
      patch.defaultCourseIds !== undefined ? [...patch.defaultCourseIds] : [...base.defaultCourseIds],
    defaultTeacherIds:
      patch.defaultTeacherIds !== undefined ? [...patch.defaultTeacherIds] : [...base.defaultTeacherIds],
    defaultClassroom: patch.defaultClassroom !== undefined ? patch.defaultClassroom : base.defaultClassroom
  };
}

const TIMETABLE_TIME_RE = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

export function inferTimetableCreateSpec(input: {
  organizationId: string;
  className: string;
  timeRange: string;
  lessonDatesYmd: string[];
  defaultCourseIds: string[];
  defaultTeacherIds: string[];
  defaultClassroom: string;
}): { ok: true; spec: Omit<TimetableCreateSpec, 'createKey'>; createKey: string } | { ok: false; error: string } {
  const cn = String(input.className || '').trim();
  if (!cn) return { ok: false, error: 'Class name required to create timetable' };
  if (cn.length > 50) return { ok: false, error: 'Class name must be 50 characters or less' };
  const tr = parseTimeRange(input.timeRange);
  if (!tr) return { ok: false, error: 'Valid time range (e.g. 16:30-17:30) required to create timetable' };
  if (!TIMETABLE_TIME_RE.test(tr.start) || !TIMETABLE_TIME_RE.test(tr.end)) {
    return { ok: false, error: 'Times must be HH:MM (24h)' };
  }
  const [sh, sm] = tr.start.split(':').map(Number);
  const [eh, em] = tr.end.split(':').map(Number);
  if (sh * 60 + sm >= eh * 60 + em) return { ok: false, error: 'Start time must be before end time' };
  const dates = [...input.lessonDatesYmd].filter(Boolean).sort();
  if (dates.length === 0) return { ok: false, error: 'No lesson dates for timetable create' };

  const rawRoom = String(input.defaultClassroom || '').trim();
  if (rawRoom.length > 50) return { ok: false, error: 'Classroom must be 50 characters or less' };
  const classroom = rawRoom || null;

  let isRecurring: boolean;
  let dayOfWeek: string[] | null;
  let date: string | null;
  let startDate: string | null;
  let endDate: string | null;

  if (dates.length === 1) {
    isRecurring = false;
    dayOfWeek = null;
    date = dates[0];
    startDate = null;
    endDate = null;
  } else {
    const dows = [...new Set(dates.map((d) => utcYmdToEnglishDow(d)).filter(Boolean))] as string[];
    if (dows.length !== 1) {
      return {
        ok: false,
        error:
          'Lesson dates span multiple weekdays — create timetable manually or split rows (Phase 2 requires a single weekday for recurring auto-create)'
      };
    }
    isRecurring = true;
    dayOfWeek = [dows[0]];
    date = null;
    startDate = dates[0];
    endDate = dates[dates.length - 1];
  }

  const createKey = `${input.organizationId}|${normalizeClassName(cn)}|${tr.start}|${tr.end}|${
    isRecurring ? `r:${(dayOfWeek && dayOfWeek[0]) || ''}|${startDate}|${endDate}` : `o:${date}`
  }`;

  return {
    ok: true,
    createKey,
    spec: {
      className: cn,
      startTime: tr.start,
      endTime: tr.end,
      isRecurring,
      dayOfWeek,
      date,
      startDate,
      endDate,
      courseIds: [...input.defaultCourseIds],
      teacherIds: [...input.defaultTeacherIds],
      classroom
    }
  };
}

export function materializeTimetableEntry(
  organizationId: string,
  spec: TimetableCreateSpec,
  entryId: string
): any {
  return {
    id: entryId,
    organizationId,
    className: spec.className,
    startTime: spec.startTime,
    endTime: spec.endTime,
    isRecurring: spec.isRecurring,
    dayOfWeek: spec.isRecurring ? spec.dayOfWeek : null,
    date: spec.isRecurring ? null : spec.date,
    startDate: spec.isRecurring ? spec.startDate : null,
    endDate: spec.isRecurring ? spec.endDate : null,
    courseIds: Array.isArray(spec.courseIds) ? spec.courseIds : [],
    teacherIds: Array.isArray(spec.teacherIds) ? spec.teacherIds : [],
    classroom: spec.classroom,
    studentIds: [],
    exceptions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    meta: { vchessImportAutoCreated: true }
  };
}

function strVal(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function getMapped(row: Record<string, unknown>, roles: VchessColumnRoles, key: keyof VchessColumnRoles): string {
  const col = roles[key];
  if (!col) return '';
  return strVal(row[col]);
}

export function normalizeClassName(s: string): string {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function parseTimeRange(timeRange: string): { start: string; end: string } | null {
  const t = String(timeRange || '').replace(/\s/g, '');
  const m = t.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (!m) return null;
  return { start: normalizeHhMm(m[1]), end: normalizeHhMm(m[2]) };
}

function normalizeHhMm(t: string): string {
  const p = t.split(':');
  const h = String(parseInt(p[0], 10)).padStart(2, '0');
  const mm = String(parseInt(p[1] || '0', 10)).padStart(2, '0');
  return `${h}:${mm}`;
}

function entryTimes(entry: any): { start: string; end: string } {
  return {
    start: normalizeHhMm(String(entry?.startTime || '0:0')),
    end: normalizeHhMm(String(entry?.endTime || '0:0'))
  };
}

export function matchTimetableEntry(
  entries: any[],
  organizationId: string,
  className: string,
  timeRange: string
): { entry: any; ambiguous: boolean } | null {
  const nc = normalizeClassName(className);
  if (!nc) return null;
  const tr = parseTimeRange(timeRange);
  let cand = (entries || []).filter(
    (e: any) => String(e?.organizationId) === String(organizationId) && normalizeClassName(e?.className || '') === nc
  );
  if (tr && cand.length > 0) {
    cand = cand.filter((e: any) => {
      const et = entryTimes(e);
      return et.start === tr.start && et.end === tr.end;
    });
  }
  if (cand.length === 0) return null;
  if (cand.length > 1) return { entry: cand[0], ambiguous: true };
  return { entry: cand[0], ambiguous: false };
}

export type PreviewRowResolution = {
  index: number;
  studentAction: 'match' | 'create' | 'blocked';
  existingStudentId: string | null;
  proposedStudentName: string | null;
  timetableEntryId: string | null;
  timetableCreateKey: string | null;
  proposedTimetableSpec: TimetableCreateSpec | null;
  lessonDatesYmd: string[];
  errors: string[];
};

export type PreviewEnrollmentItem = {
  rowIndex: number;
  date: string;
  willSkipDuplicate: boolean;
};

export type VchessImportPreviewResult = {
  digest: string;
  summary: {
    rowCount: number;
    blockedRows: number;
    matchStudents: number;
    createStudents: number;
    timetableMatched: number;
    timetableUnmatched: number;
    timetableWillCreate: number;
    proposedEnrollments: number;
    skippedDuplicateEnrollments: number;
  };
  rows: Array<{
    index: number;
    errors: string[];
    warnings: string[];
    studentAction: 'match' | 'create' | 'blocked';
    existingStudentId: string | null;
    proposedStudentName: string | null;
    timetableEntryId: string | null;
    timetableCreateKey: string | null;
    timetableWillCreate: boolean;
    proposedTimetableSpec: TimetableCreateSpec | null;
    timetableLabel: string | null;
    lessonDatesYmd: string[];
    enrollments: PreviewEnrollmentItem[];
  }>;
  resolutions: PreviewRowResolution[];
};

function findStudent(
  students: any[],
  organizationId: string,
  matchField: StudentMatchField,
  name: string,
  externalId: string,
  phone: string
): any | null {
  const org = String(organizationId);
  const list = (students || []).filter((s: any) => String(s?.organizationId) === org);
  if (matchField === 'chessComId') {
    const id = String(externalId || '').trim();
    if (!id) return null;
    return (
      list.find(
        (s: any) =>
          String(s.chessComId || '').trim() === id || String((s as any).studentId || '').trim() === id
      ) || null
    );
  }
  if (matchField === 'name') {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    return list.find((s: any) => String(s.name || '').trim().toLowerCase() === n) || null;
  }
  const n = name.trim().toLowerCase();
  const ph = phone.trim();
  if (n && ph) {
    return (
      list.find(
        (s: any) =>
          String(s.name || '').trim().toLowerCase() === n &&
          String(s.contactPhone || '').trim() === ph
      ) || null
    );
  }
  if (n) return list.find((s: any) => String(s.name || '').trim().toLowerCase() === n) || null;
  return null;
}

function enrollmentExists(
  enrollments: any[],
  organizationId: string,
  studentId: string,
  timetableEntryId: string,
  date: string
): boolean {
  return (enrollments || []).some(
    (e: any) =>
      String(e?.organizationId) === String(organizationId) &&
      String(e?.studentId) === String(studentId) &&
      String(e?.timetableEntryId) === String(timetableEntryId) &&
      String(e?.date) === String(date)
  );
}

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

export type ApplyVchessImportResult = {
  createdStudents: any[];
  newEnrollments: any[];
  createdTimetableEntries: any[];
  studentsCreated: number;
  enrollmentsCreated: number;
  timetablesCreated: number;
};

function newStudentRecord(organizationId: string, name: string, externalId: string, nowBase: number, seq: number): any {
  const id = `${nowBase + seq}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: name.trim(),
    localName: '',
    chessComId: String(externalId || '').trim(),
    gender: '',
    dateOfBirth: '',
    contactPhone: '',
    contactPhoneCountry: 'HK',
    contactPhoneCountryCode: '+852',
    contactEmail: '',
    emergencyContactName: '',
    emergencyContactRelation: '',
    emergencyContactNumber: '',
    organizationId,
    answerCount: 0,
    totalAnswers: 0,
    correctAnswers: 0,
    level: 1,
    rank: 'Wood',
    rankIndex: 0,
    experience: 0,
    score: 0,
    createdAt: new Date().toISOString(),
    stats: { daily: {}, weekly: {}, monthly: {}, yearly: {} }
  };
}

/**
 * Recomputes preview from current DB, checks digest, then mutates data.students, enrollments, organizations, timetable.
 */
export function applyVchessImportFromVerifiedPreview(input: {
  previewDigest: string;
  importBatchId: string;
  organizationId: string;
  applyConfig: VchessImportApplyConfig;
  rows: Record<string, unknown>[];
  data: { students: any[]; lastUpdate?: string };
  organizations: any[];
  enrollments: any[];
  timetableEntries: any[];
  timetableData: { entries: any[]; metadata: any };
}): { ok: true; result: ApplyVchessImportResult } | { ok: false; error: string } {
  const {
    previewDigest,
    importBatchId,
    organizationId,
    applyConfig,
    rows,
    data,
    organizations,
    enrollments,
    timetableEntries,
    timetableData
  } = input;

  const fresh = buildVchessImportPreview({
    importBatchId,
    organizationId,
    applyConfig,
    rows,
    students: data.students,
    timetableEntries,
    enrollments
  });

  if (fresh.digest !== previewDigest) {
    return {
      ok: false,
      error: 'Preview out of date — data changed or digest mismatch. Run preview again.'
    };
  }

  const org = organizations.find((o: any) => String(o.id) === String(organizationId));
  if (!org) return { ok: false, error: 'Organization not found' };

  const createdStudents: any[] = [];
  const newEnrollments: any[] = [];
  const rowIndexToStudentId = new Map<number, string>();
  const nowBase = Date.now();
  let seq = 0;
  const roles = applyConfig.columnRoles;
  const extForRow = (idx: number) =>
    strVal((rows[idx] as Record<string, unknown>)?.[roles.externalId || ''] ?? '');

  for (const pr of fresh.rows) {
    if (pr.errors.length > 0) continue;
    if (pr.studentAction === 'create' && pr.proposedStudentName) {
      const ext = extForRow(pr.index);
      const stu = newStudentRecord(organizationId, pr.proposedStudentName, ext, nowBase, seq++);
      data.students.push(stu);
      if (!Array.isArray(org.students)) org.students = [];
      org.students.push(stu.id);
      createdStudents.push(stu);
      rowIndexToStudentId.set(pr.index, stu.id);
    } else if (pr.studentAction === 'match' && pr.existingStudentId) {
      rowIndexToStudentId.set(pr.index, pr.existingStudentId);
    }
  }

  data.lastUpdate = new Date().toISOString();

  const createKeyToSpec = new Map<string, TimetableCreateSpec>();
  for (const pr of fresh.rows) {
    if (pr.errors.length > 0 || !pr.timetableCreateKey || !pr.proposedTimetableSpec) continue;
    if (!createKeyToSpec.has(pr.timetableCreateKey)) {
      createKeyToSpec.set(pr.timetableCreateKey, pr.proposedTimetableSpec);
    }
  }

  const createdTimetableEntries: any[] = [];
  const createKeyToId = new Map<string, string>();
  let ttSeq = 0;
  const td = timetableData;
  if (!Array.isArray(td.entries)) td.entries = [];
  if (!td.metadata) td.metadata = { classNames: [], classrooms: [] };
  if (!Array.isArray(td.metadata.classNames)) td.metadata.classNames = [];
  if (!Array.isArray(td.metadata.classrooms)) td.metadata.classrooms = [];

  for (const [, spec] of createKeyToSpec) {
    const entryId = `timetable_${Date.now()}_${ttSeq++}_${Math.random().toString(36).slice(2, 9)}`;
    const entry = materializeTimetableEntry(organizationId, spec, entryId);
    td.entries.push(entry);
    createdTimetableEntries.push(entry);
    createKeyToId.set(spec.createKey, entryId);
    if (spec.className && !td.metadata.classNames.includes(spec.className)) {
      td.metadata.classNames.push(spec.className);
    }
    if (spec.classroom && spec.classroom.trim() && !td.metadata.classrooms.includes(spec.classroom.trim())) {
      td.metadata.classrooms.push(spec.classroom.trim());
    }
  }

  let enrSeq = 0;
  for (const pr of fresh.rows) {
    if (pr.errors.length > 0 || pr.lessonDatesYmd.length === 0) continue;
    const tid =
      pr.timetableEntryId ||
      (pr.timetableCreateKey ? createKeyToId.get(pr.timetableCreateKey) : null);
    if (!tid) continue;
    const studentId = rowIndexToStudentId.get(pr.index);
    if (!studentId) continue;

    for (const en of pr.enrollments) {
      if (en.willSkipDuplicate) continue;
      if (enrollmentExists(enrollments, organizationId, studentId, tid, en.date)) continue;
      const rec = {
        id: `enr_${Date.now()}_${enrSeq++}_${Math.random().toString(36).slice(2, 7)}`,
        organizationId,
        studentId,
        timetableEntryId: tid,
        date: en.date,
        type: 'single',
        orderId: null,
        meta: { vchessImportBatchId: importBatchId, sourceRowIndex: pr.index }
      };
      enrollments.push(rec);
      newEnrollments.push(rec);
    }
  }

  return {
    ok: true,
    result: {
      createdStudents,
      newEnrollments,
      createdTimetableEntries,
      studentsCreated: createdStudents.length,
      enrollmentsCreated: newEnrollments.length,
      timetablesCreated: createdTimetableEntries.length
    }
  };
}
