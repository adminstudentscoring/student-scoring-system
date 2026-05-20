/**
 * V.Chess import apply — shared types and config.
 */

export type StudentMatchField = 'chessComId' | 'name' | 'name_phone';

export type VchessColumnRoles = {
  studentName?: string;
  localName?: string;
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
    localName: 'Local name',
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

export type ApplyVchessImportResult = {
  createdStudents: any[];
  newEnrollments: any[];
  createdTimetableEntries: any[];
  studentsCreated: number;
  enrollmentsCreated: number;
  timetablesCreated: number;
};
