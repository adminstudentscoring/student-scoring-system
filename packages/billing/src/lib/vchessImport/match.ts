/**
 * V.Chess import — timetable matching and student lookup helpers.
 */
import { utcYmdToEnglishDow } from '@student-scoring/core';
import type { StudentMatchField, TimetableCreateSpec, VchessColumnRoles } from './types';

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

export function strVal(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

export function getMapped(row: Record<string, unknown>, roles: VchessColumnRoles, key: keyof VchessColumnRoles): string {
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

export function findStudent(
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

export function enrollmentExists(
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
