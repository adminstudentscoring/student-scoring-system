/**
 * V.Chess import — apply verified preview to students, timetable, enrollments.
 */
import type { ApplyVchessImportResult, TimetableCreateSpec, VchessImportApplyConfig } from './types';
import { enrollmentExists, getMapped, materializeTimetableEntry, strVal } from './match';
import { buildVchessImportPreview } from './preview';

function newStudentRecord(
  organizationId: string,
  name: string,
  externalId: string,
  localName: string,
  nowBase: number,
  seq: number
): any {
  const id = `${nowBase + seq}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: name.trim(),
    localName: String(localName || '').trim(),
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
  const nameForRow = (idx: number) =>
    strVal((rows[idx] as Record<string, unknown>)?.[roles.studentName || ''] ?? '');
  const phoneForRow = (idx: number) =>
    strVal((rows[idx] as Record<string, unknown>)?.[roles.contactPhone || ''] ?? '');
  const localForRow = (idx: number) =>
    getMapped(rows[idx] as Record<string, unknown>, roles, 'localName');

  function createDedupKey(rowIndex: number): string {
    const mf = applyConfig.studentMatchField;
    if (mf === 'chessComId') return `cid:${extForRow(rowIndex)}`;
    if (mf === 'name') return `name:${nameForRow(rowIndex).toLowerCase()}`;
    return `nameph:${nameForRow(rowIndex).toLowerCase()}|${phoneForRow(rowIndex)}`;
  }

  /** Same customer on multiple invoice lines → one student, many enrollments. */
  const createKeyToStudentId = new Map<string, string>();

  for (const pr of fresh.rows) {
    if (pr.errors.length > 0) continue;
    if (pr.studentAction === 'create' && pr.proposedStudentName) {
      const dedupKey = createDedupKey(pr.index);
      const reuseId = createKeyToStudentId.get(dedupKey);
      if (reuseId) {
        const loc = localForRow(pr.index);
        if (loc) {
          const stu = data.students.find((s: any) => String(s?.id) === reuseId);
          if (stu && !String(stu.localName || '').trim()) stu.localName = loc;
        }
        rowIndexToStudentId.set(pr.index, reuseId);
        continue;
      }
      const ext = extForRow(pr.index);
      const stu = newStudentRecord(
        organizationId,
        pr.proposedStudentName,
        ext,
        localForRow(pr.index),
        nowBase,
        seq++
      );
      data.students.push(stu);
      if (!Array.isArray(org.students)) org.students = [];
      if (!org.students.includes(stu.id)) org.students.push(stu.id);
      createdStudents.push(stu);
      createKeyToStudentId.set(dedupKey, stu.id);
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
