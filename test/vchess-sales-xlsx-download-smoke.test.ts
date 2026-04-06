/**
 * Optional smoke: reads a local Sales-export xlsx (same shape as PDF→sales pipeline).
 * Skips in CI unless VCHESS_SALES_XLSX_SMOKE points to a file.
 *
 * Run locally: place invoices-sales-export-20260406.xlsx in ~/Downloads or set env.
 *   VCHESS_SALES_XLSX_SMOKE=/path/to/file.xlsx pnpm exec tsx --test test/vchess-sales-xlsx-download-smoke.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import {
  buildVchessImportPreview,
  DEFAULT_VCHESS_IMPORT_APPLY_CONFIG
} from '../packages/billing/src/lib/vchessImportApplyEngine';

function resolveXlsxPath(): string | null {
  const fromEnv = process.env.VCHESS_SALES_XLSX_SMOKE?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const def = path.join(home, 'Downloads', 'invoices-sales-export-20260406.xlsx');
  if (def && fs.existsSync(def)) return def;
  return null;
}

describe('vchess sales xlsx (optional file smoke)', () => {
  it('preview summary matches expectations for invoices-sales-export sample', (t) => {
    const xlsxPath = resolveXlsxPath();
    if (!xlsxPath) {
      t.skip(
        'No xlsx: set VCHESS_SALES_XLSX_SMOKE or add ~/Downloads/invoices-sales-export-20260406.xlsx'
      );
      return;
    }

    const wb = XLSX.readFile(xlsxPath);
    const ws = wb.Sheets['Sales export'] || wb.Sheets[wb.SheetNames[0]];
    assert.ok(ws, 'sheet Sales export');
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
    assert.ok(rows.length > 0, 'rows');

    const applyConfig = {
      ...DEFAULT_VCHESS_IMPORT_APPLY_CONFIG,
      createTimetableIfMissing: true,
      defaultCourseIds: ['course_smoke'],
      defaultTeacherIds: [],
      defaultClassroom: '',
      studentMatchField: 'chessComId' as const,
      columnRoles: {
        studentName: 'Student Name',
        externalId: 'Student ID',
        className: 'Class Name',
        timeRange: 'Time Slot',
        lessonDates: 'Enrolled Dates',
        invoiceDate: 'Order ID',
        contactPhone: ''
      }
    };

    const preview = buildVchessImportPreview({
      importBatchId: 'smoke_file',
      organizationId: 'org_smoke',
      applyConfig,
      rows,
      students: [],
      timetableEntries: [],
      enrollments: []
    });

    assert.strictEqual(preview.summary.rowCount, rows.length);
    assert.strictEqual(
      preview.summary.blockedRows,
      7,
      `blockedRows expected 7 for this file (empty dates / long class name / multi-weekday); got ${preview.summary.blockedRows}. File: ${xlsxPath}`
    );
    assert.ok(
      preview.summary.proposedEnrollments >= 500,
      `expected many enrollments; got ${preview.summary.proposedEnrollments}`
    );
  });
});
