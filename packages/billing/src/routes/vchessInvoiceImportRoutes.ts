/**
 * Store V.Chess invoice Excel rows (from PDF converter export) per organization for reference / future matching.
 */
import type { Request, Response } from 'express';
import {
  applyVchessImportFromVerifiedPreview,
  buildVchessImportPreview,
  DEFAULT_VCHESS_IMPORT_APPLY_CONFIG,
  mergeVchessImportApplyConfig,
  type VchessImportApplyConfig
} from '../lib/vchessImportApplyEngine';

/** Set by authenticateUser (JWT payload); not on stock Express Request. */
type AuthedRequest = Request & { user?: { id?: string; organizationId?: string; role?: string } };

const MAX_ROWS = 5000;

function sanitizeRows(rows: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return [];
  const out: Record<string, unknown>[] = [];
  const n = Math.min(rows.length, MAX_ROWS);
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      try {
        out.push(JSON.parse(JSON.stringify(r)) as Record<string, unknown>);
      } catch {
        /* skip bad row */
      }
    }
  }
  return out;
}

type ImportsFile = { imports: any[] };

function paramId(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return String(v[0] || '');
  return String(v || '');
}

function registerVchessInvoiceImportRoutes(app: any, deps: any): void {
  const {
    authenticateUser,
    authorizeRole,
    readUsers,
    readVchessInvoiceImports,
    writeVchessInvoiceImports,
    readOrganizations,
    writeOrganizations,
    readData,
    writeData,
    readTimetable,
    writeTimetable,
    readEnrollments,
    writeEnrollments,
    broadcast
  } = deps;

  app.get(
    '/api/organizations/vchess-invoices/apply-config',
    authenticateUser,
    authorizeRole('organization'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const users = await readUsers();
        const orgUser = users.find((u: any) => u.id === req.user?.id);
        if (!orgUser?.organizationId) return res.status(403).json({ error: 'Organization not found' });
        const organizations = await readOrganizations();
        const organization = organizations.find((o: any) => o.id === orgUser.organizationId);
        if (!organization) return res.status(404).json({ error: 'Organization not found' });
        const merged = mergeVchessImportApplyConfig(organization.settings?.vchessImportApply, {});
        res.json({ applyConfig: merged, defaults: DEFAULT_VCHESS_IMPORT_APPLY_CONFIG });
      } catch (e) {
        console.error('[vchess-invoices/apply-config GET]', e);
        res.status(500).json({ error: 'Failed to load apply config' });
      }
    }
  );

  app.put(
    '/api/organizations/vchess-invoices/apply-config',
    authenticateUser,
    authorizeRole('organization'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const users = await readUsers();
        const orgUser = users.find((u: any) => u.id === req.user?.id);
        if (!orgUser?.organizationId) return res.status(403).json({ error: 'Organization not found' });
        const organizations = await readOrganizations();
        const idx = organizations.findIndex((o: any) => o.id === orgUser.organizationId);
        if (idx === -1) return res.status(404).json({ error: 'Organization not found' });
        const organization = organizations[idx];
        const patch = (req.body?.applyConfig || req.body || {}) as Partial<VchessImportApplyConfig>;
        const next = mergeVchessImportApplyConfig(organization.settings?.vchessImportApply, patch);
        organization.settings = organization.settings || {};
        organization.settings.vchessImportApply = next;
        organization.updatedAt = new Date().toISOString();
        organizations[idx] = organization;
        await writeOrganizations(organizations);
        res.json({ applyConfig: next });
      } catch (e) {
        console.error('[vchess-invoices/apply-config PUT]', e);
        res.status(500).json({ error: 'Failed to save apply config' });
      }
    }
  );

  app.get(
    '/api/organizations/vchess-invoices/import',
    authenticateUser,
    authorizeRole('organization'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const users = await readUsers();
        const orgUser = users.find((u: any) => u.id === req.user?.id);
        if (!orgUser?.organizationId) {
          return res.status(403).json({ error: 'Organization not found' });
        }
        const oid = String(orgUser.organizationId);
        const data: ImportsFile = (await readVchessInvoiceImports()) as ImportsFile;
        const list = Array.isArray(data.imports) ? data.imports : [];
        const mine = list
          .filter((b: any) => String(b.organizationId) === oid)
          .sort(
            (a: any, b: any) =>
              String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
          )
          .map((b: any) => ({
            id: b.id,
            fileName: b.fileName ?? null,
            createdAt: b.createdAt,
            rowCount: Array.isArray(b.rows) ? b.rows.length : 0
          }));
        res.json({ imports: mine });
      } catch (e) {
        console.error('[vchess-invoices/import GET]', e);
        res.status(500).json({ error: 'Failed to load imports' });
      }
    }
  );

  app.post(
    '/api/organizations/vchess-invoices/import/:importId/preview',
    authenticateUser,
    authorizeRole('organization'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const users = await readUsers();
        const orgUser = users.find((u: any) => u.id === req.user?.id);
        if (!orgUser?.organizationId) return res.status(403).json({ error: 'Organization not found' });
        const oid = String(orgUser.organizationId);
        const importId = paramId(req.params.importId);
        const file: ImportsFile = (await readVchessInvoiceImports()) as ImportsFile;
        const list = Array.isArray(file.imports) ? file.imports : [];
        const batch = list.find((b: any) => b.id === importId && String(b.organizationId) === oid);
        if (!batch) return res.status(404).json({ error: 'Import not found' });
        const rows = Array.isArray(batch.rows) ? batch.rows : [];
        if (rows.length === 0) return res.status(400).json({ error: 'Import batch has no rows' });

        const organizations = await readOrganizations();
        const organization = organizations.find((o: any) => o.id === oid);
        const applyConfig = mergeVchessImportApplyConfig(organization?.settings?.vchessImportApply, req.body?.applyConfig || {});

        const data = await readData();
        const timetableData = await readTimetable();
        const entries = Array.isArray(timetableData?.entries) ? timetableData.entries : [];
        const enrollments = await readEnrollments();
        const enrList = Array.isArray(enrollments) ? enrollments : [];

        const preview = buildVchessImportPreview({
          importBatchId: importId,
          organizationId: oid,
          applyConfig,
          rows: rows as Record<string, unknown>[],
          students: data.students || [],
          timetableEntries: entries,
          enrollments: enrList
        });

        res.json({
          digest: preview.digest,
          summary: preview.summary,
          rows: preview.rows,
          applyConfigUsed: applyConfig
        });
      } catch (e) {
        console.error('[vchess-invoices/import/:id/preview]', e);
        res.status(500).json({ error: 'Failed to build preview' });
      }
    }
  );

  app.post(
    '/api/organizations/vchess-invoices/import/:importId/apply',
    authenticateUser,
    authorizeRole('organization'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const users = await readUsers();
        const orgUser = users.find((u: any) => u.id === req.user?.id);
        if (!orgUser?.organizationId) return res.status(403).json({ error: 'Organization not found' });
        const oid = String(orgUser.organizationId);
        const importId = paramId(req.params.importId);
        const previewDigest = typeof req.body?.previewDigest === 'string' ? req.body.previewDigest : '';
        if (!previewDigest) return res.status(400).json({ error: 'previewDigest required' });

        const file: ImportsFile = (await readVchessInvoiceImports()) as ImportsFile;
        const list = Array.isArray(file.imports) ? file.imports : [];
        const batch = list.find((b: any) => b.id === importId && String(b.organizationId) === oid);
        if (!batch) return res.status(404).json({ error: 'Import not found' });
        const rows = Array.isArray(batch.rows) ? batch.rows : [];
        if (rows.length === 0) return res.status(400).json({ error: 'Import batch has no rows' });

        const organizations = await readOrganizations();
        const organization = organizations.find((o: any) => o.id === oid);
        const applyConfig = mergeVchessImportApplyConfig(organization?.settings?.vchessImportApply, req.body?.applyConfig || {});

        const data = await readData();
        const workData = { ...data, students: [...(data.students || [])] };
        const workOrgs = organizations.map((o: any) => ({
          ...o,
          students: Array.isArray(o.students) ? [...o.students] : []
        }));
        const timetableData = await readTimetable();
        const workTimetable = {
          ...timetableData,
          entries: [...(timetableData?.entries || [])],
          metadata: {
            ...(timetableData?.metadata || {}),
            classNames: [...(timetableData?.metadata?.classNames || [])],
            classrooms: [...(timetableData?.metadata?.classrooms || [])]
          }
        };
        const entries = workTimetable.entries;
        const enrollments = await readEnrollments();
        const enrList = Array.isArray(enrollments) ? [...enrollments] : [];

        const applied = applyVchessImportFromVerifiedPreview({
          previewDigest,
          importBatchId: importId,
          organizationId: oid,
          applyConfig,
          rows: rows as Record<string, unknown>[],
          data: workData,
          organizations: workOrgs,
          enrollments: enrList,
          timetableEntries: entries,
          timetableData: workTimetable
        });

        if (applied.ok === false) {
          return res.status(409).json({ error: applied.error });
        }

        data.students = workData.students;
        data.lastUpdate = workData.lastUpdate;
        await writeData(data);
        await writeOrganizations(workOrgs);
        await writeEnrollments(enrList);
        await writeTimetable(workTimetable);

        if (typeof broadcast === 'function') {
          for (const stu of applied.result.createdStudents) {
            try {
              broadcast({ type: 'studentAdded', student: stu });
            } catch {
              /* ignore */
            }
          }
        }

        res.json({
          studentsCreated: applied.result.studentsCreated,
          enrollmentsCreated: applied.result.enrollmentsCreated,
          timetablesCreated: applied.result.timetablesCreated,
          createdStudentIds: applied.result.createdStudents.map((s: any) => s.id),
          newEnrollmentIds: applied.result.newEnrollments.map((e: any) => e.id),
          createdTimetableEntryIds: applied.result.createdTimetableEntries.map((e: any) => e.id)
        });
      } catch (e) {
        console.error('[vchess-invoices/import/:id/apply]', e);
        res.status(500).json({ error: 'Failed to apply import' });
      }
    }
  );

  app.get(
    '/api/organizations/vchess-invoices/import/:importId',
    authenticateUser,
    authorizeRole('organization'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const users = await readUsers();
        const orgUser = users.find((u: any) => u.id === req.user?.id);
        if (!orgUser?.organizationId) {
          return res.status(403).json({ error: 'Organization not found' });
        }
        const oid = String(orgUser.organizationId);
        const importId = paramId(req.params.importId);
        const data: ImportsFile = (await readVchessInvoiceImports()) as ImportsFile;
        const list = Array.isArray(data.imports) ? data.imports : [];
        const batch = list.find(
          (b: any) => b.id === importId && String(b.organizationId) === oid
        );
        if (!batch) return res.status(404).json({ error: 'Import not found' });
        res.json(batch);
      } catch (e) {
        console.error('[vchess-invoices/import/:id GET]', e);
        res.status(500).json({ error: 'Failed to load import' });
      }
    }
  );

  app.post(
    '/api/organizations/vchess-invoices/import',
    authenticateUser,
    authorizeRole('organization'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const users = await readUsers();
        const orgUser = users.find((u: any) => u.id === req.user?.id);
        if (!orgUser?.organizationId) {
          return res.status(403).json({ error: 'Organization not found' });
        }
        const fileName =
          typeof req.body?.fileName === 'string' ? req.body.fileName.slice(0, 500) : null;
        const rows = sanitizeRows(req.body?.rows);
        if (rows.length === 0) {
          return res.status(400).json({ error: 'No valid rows (expect JSON array from Excel sheet)' });
        }

        const data: ImportsFile = (await readVchessInvoiceImports()) as ImportsFile;
        if (!Array.isArray(data.imports)) data.imports = [];

        const batch = {
          id: `vchess_imp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          organizationId: String(orgUser.organizationId),
          createdAt: new Date().toISOString(),
          createdBy: String(req.user?.id || ''),
          fileName,
          rows
        };
        data.imports.push(batch);
        await writeVchessInvoiceImports(data);

        res.status(201).json({
          id: batch.id,
          rowCount: rows.length,
          fileName: batch.fileName
        });
      } catch (e) {
        console.error('[vchess-invoices/import POST]', e);
        res.status(500).json({ error: 'Failed to save import' });
      }
    }
  );
}

module.exports = { registerVchessInvoiceImportRoutes };
