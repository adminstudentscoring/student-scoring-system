/**
 * Store V.Chess invoice Excel rows (from PDF converter export) per organization for reference / future matching.
 */
import type { Request, Response } from 'express';

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

function registerVchessInvoiceImportRoutes(app: any, deps: any): void {
  const {
    authenticateUser,
    authorizeRole,
    readUsers,
    readVchessInvoiceImports,
    writeVchessInvoiceImports
  } = deps;

  app.get(
    '/api/organizations/vchess-invoices/import',
    authenticateUser,
    authorizeRole('organization'),
    async (req: Request, res: Response) => {
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

  app.get(
    '/api/organizations/vchess-invoices/import/:importId',
    authenticateUser,
    authorizeRole('organization'),
    async (req: Request, res: Response) => {
      try {
        const users = await readUsers();
        const orgUser = users.find((u: any) => u.id === req.user?.id);
        if (!orgUser?.organizationId) {
          return res.status(403).json({ error: 'Organization not found' });
        }
        const oid = String(orgUser.organizationId);
        const { importId } = req.params;
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
    async (req: Request, res: Response) => {
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
