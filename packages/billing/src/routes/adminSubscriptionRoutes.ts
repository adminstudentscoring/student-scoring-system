// Admin Subscription routes extracted from server.js.
// Includes /api/admin/subscription/* routes (prices, packages, audit).

import { Request, Response, NextFunction } from 'express';

function registerAdminSubscriptionRoutes(app: any, deps: any): void {
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const readSubscriptionPrices = deps?.readSubscriptionPrices;
  const writeSubscriptionPrices = deps?.writeSubscriptionPrices;
  const readSubscriptionPackages = deps?.readSubscriptionPackages;
  const writeSubscriptionPackages = deps?.writeSubscriptionPackages;
  const appendSubscriptionAudit = deps?.appendSubscriptionAudit;
  const normalizeSubscriptionStatus = deps?.normalizeSubscriptionStatus;
  const normalizePublishState = deps?.normalizePublishState;
  const normalizeCurrency = deps?.normalizeCurrency;
  const dateOnlyTodayString = deps?.dateOnlyTodayString;
  const fs = deps?.fs;
  const SUBSCRIPTION_AUDIT_FILE = deps?.SUBSCRIPTION_AUDIT_FILE;

  if (!app) throw new Error('registerAdminSubscriptionRoutes: missing app');
  if (typeof authenticateUser !== 'function') throw new Error('registerAdminSubscriptionRoutes: missing authenticateUser');
  if (typeof authorizeRole !== 'function') throw new Error('registerAdminSubscriptionRoutes: missing authorizeRole');
  if (typeof readSubscriptionPrices !== 'function') throw new Error('registerAdminSubscriptionRoutes: missing readSubscriptionPrices');
  if (typeof writeSubscriptionPrices !== 'function') throw new Error('registerAdminSubscriptionRoutes: missing writeSubscriptionPrices');
  if (typeof readSubscriptionPackages !== 'function') throw new Error('registerAdminSubscriptionRoutes: missing readSubscriptionPackages');
  if (typeof writeSubscriptionPackages !== 'function') throw new Error('registerAdminSubscriptionRoutes: missing writeSubscriptionPackages');
  if (typeof appendSubscriptionAudit !== 'function') throw new Error('registerAdminSubscriptionRoutes: missing appendSubscriptionAudit');
  if (typeof normalizeSubscriptionStatus !== 'function') throw new Error('registerAdminSubscriptionRoutes: missing normalizeSubscriptionStatus');
  if (typeof normalizePublishState !== 'function') throw new Error('registerAdminSubscriptionRoutes: missing normalizePublishState');
  if (typeof normalizeCurrency !== 'function') throw new Error('registerAdminSubscriptionRoutes: missing normalizeCurrency');
  if (typeof dateOnlyTodayString !== 'function') throw new Error('registerAdminSubscriptionRoutes: missing dateOnlyTodayString');
  if (!fs) throw new Error('registerAdminSubscriptionRoutes: missing fs');
  if (!SUBSCRIPTION_AUDIT_FILE) throw new Error('registerAdminSubscriptionRoutes: missing SUBSCRIPTION_AUDIT_FILE');

  // --- Local helpers (only used by subscription routes) ---

  function slugifySubscriptionCode(input) {
    return String(input || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || 'price';
  }

  function ensureUniquePriceCode(existingPrices, baseCode, excludeId = null) {
    const existing = new Set(
      existingPrices
        .filter(p => (excludeId ? p.id !== excludeId : true))
        .map(p => String(p.code || '').toLowerCase())
    );
    let code = baseCode;
    let i = 2;
    while (existing.has(code.toLowerCase())) {
      code = `${baseCode}_${i++}`;
    }
    return code;
  }

  function normalizeBillingType(bt) {
    const v = String(bt || 'monthly').toLowerCase();
    return ['monthly', 'yearly', 'one-time'].includes(v) ? v : 'monthly';
  }

  function normalizePricePayload(body, existingPrices, { excludeId = null } = {}) {
    const name = String(body?.name || '').trim();
    const amount = Number(body?.amount ?? body?.price ?? 0);
    const billingType = normalizeBillingType(body?.billingType);
    const currency = normalizeCurrency(body?.currency);
    const status = normalizeSubscriptionStatus(body?.status);
    const publishState = normalizePublishState(body?.publishState);
    const features = {
      classView: Boolean(body?.features?.classView),
      challengeMode: Boolean(body?.features?.challengeMode)
    };
    const limits = {
      teacherSeats: Math.max(0, parseInt(body?.limits?.teacherSeats ?? 0, 10) || 0),
      studentSeats: Math.max(0, parseInt(body?.limits?.studentSeats ?? 0, 10) || 0)
    };

    let code = String(body?.code || '').trim();
    if (!code) {
      code = `${slugifySubscriptionCode(name)}_${billingType}`;
    }
    code = ensureUniquePriceCode(existingPrices, code, excludeId);

    return { name, amount, billingType, currency, status, publishState, code, features, limits };
  }

  function normalizeDiscountType(t) {
    const v = String(t || 'none').toLowerCase();
    return ['none', 'percent', 'fixed'].includes(v) ? v : 'none';
  }

  function normalizeDateOnly(d) {
    const v = String(d || '').trim();
    if (!v) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
    return v;
  }

  function normalizeSubscriptionPackagePayload(body) {
    const name = String(body?.name || '').trim();
    const priceId = String(body?.priceId || '').trim();
    const priceCode = String(body?.priceCode || '').trim();
    const quantity = Math.max(1, parseInt(body?.quantity ?? 1, 10) || 1);
    const discountType = normalizeDiscountType(body?.discountType);
    const discountValueRaw = Number(body?.discountValue ?? 0);
    const discountValue = Number.isFinite(discountValueRaw) && discountValueRaw >= 0 ? discountValueRaw : 0;
    const validFrom = normalizeDateOnly(body?.validFrom);
    const validTo = normalizeDateOnly(body?.validTo);
    const status = normalizeSubscriptionStatus(body?.status);
    const publishState = normalizePublishState(body?.publishState);
    return { name, priceId, priceCode, quantity, discountType, discountValue, validFrom, validTo, status, publishState };
  }

  // --- Routes ---

  app.get('/api/admin/subscription/prices', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const q = String(req.query.q || '').trim().toLowerCase();
      const prices = await readSubscriptionPrices();
      const filtered = !q
        ? prices
        : prices.filter(p =>
            String(p.name || '').toLowerCase().includes(q) || String(p.code || '').toLowerCase().includes(q)
          );
      res.json(filtered);
    } catch (error) {
      console.error('Error listing subscription prices:', error);
      res.status(500).json({ error: 'Failed to load prices' });
    }
  });

  app.post('/api/admin/subscription/prices', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const prices = await readSubscriptionPrices();
      const payload = normalizePricePayload(req.body, prices);

      if (!payload.name) return res.status(400).json({ error: 'Name is required' });
      if (!Number.isFinite(payload.amount) || payload.amount < 0) return res.status(400).json({ error: 'Price must be >= 0' });

      const id = `price_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const now = new Date().toISOString();
      const price = {
        id,
        ...payload,
        createdAt: now,
        updatedAt: now
      };

      prices.push(price);
      await writeSubscriptionPrices(prices);
      await appendSubscriptionAudit(req, { action: 'create', entityType: 'price', entityId: id, after: price });
      res.json(price);
    } catch (error) {
      console.error('Error creating subscription price:', error);
      res.status(500).json({ error: 'Failed to create price' });
    }
  });

  app.put('/api/admin/subscription/prices/:id', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const id = req.params.id;
      const prices = await readSubscriptionPrices();
      const idx = prices.findIndex(p => p.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Price not found' });

      const before = prices[idx];
      const payload = normalizePricePayload(req.body, prices, { excludeId: id });
      if (!payload.name) return res.status(400).json({ error: 'Name is required' });
      if (!Number.isFinite(payload.amount) || payload.amount < 0) return res.status(400).json({ error: 'Price must be >= 0' });

      prices[idx] = {
        ...prices[idx],
        ...payload,
        updatedAt: new Date().toISOString()
      };

      await writeSubscriptionPrices(prices);
      await appendSubscriptionAudit(req, { action: 'update', entityType: 'price', entityId: id, before, after: prices[idx] });
      res.json(prices[idx]);
    } catch (error) {
      console.error('Error updating subscription price:', error);
      res.status(500).json({ error: 'Failed to update price' });
    }
  });

  app.delete('/api/admin/subscription/prices/:id', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const id = req.params.id;
      const prices = await readSubscriptionPrices();
      const before = prices.find(p => p.id === id) || null;
      const next = prices.filter(p => p.id !== id);
      await writeSubscriptionPrices(next);
      await appendSubscriptionAudit(req, { action: 'delete', entityType: 'price', entityId: id, before });
      res.json({ ok: true });
    } catch (error) {
      console.error('Error deleting subscription price:', error);
      res.status(500).json({ error: 'Failed to delete price' });
    }
  });

  app.post('/api/admin/subscription/prices/bulk-delete', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
      if (!ids.length) return res.status(400).json({ error: 'ids is required' });

      const prices = await readSubscriptionPrices();
      const set = new Set(ids);
      const deleted = prices.filter(p => set.has(p.id));
      const next = prices.filter(p => !set.has(p.id));
      await writeSubscriptionPrices(next);
      await appendSubscriptionAudit(req, { action: 'bulk_delete', entityType: 'price', meta: { ids, deletedCount: deleted.length }, before: deleted });
      res.json({ ok: true, deletedCount: prices.length - next.length });
    } catch (error) {
      console.error('Error bulk deleting subscription prices:', error);
      res.status(500).json({ error: 'Failed to delete prices' });
    }
  });

  app.get('/api/admin/subscription/packages', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const q = String(req.query.q || '').trim().toLowerCase();
      const packages = await readSubscriptionPackages();
      const today = dateOnlyTodayString();
      let mutated = false;
      for (const pkg of packages) {
        const expired = pkg.validTo && String(pkg.validTo) < today;
        pkg.expired = Boolean(expired);
        if (expired && normalizeSubscriptionStatus(pkg.status) === 'active') {
          pkg.status = 'inactive';
          pkg.updatedAt = new Date().toISOString();
          mutated = true;
        }
      }
      if (mutated) {
        await writeSubscriptionPackages(packages);
      }
      const filtered = !q
        ? packages
        : packages.filter(p =>
            String(p.name || '').toLowerCase().includes(q) ||
            String(p.priceCode || '').toLowerCase().includes(q)
          );
      res.json(filtered);
    } catch (error) {
      console.error('Error listing subscription packages:', error);
      res.status(500).json({ error: 'Failed to load packages' });
    }
  });

  app.post('/api/admin/subscription/packages', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const packages = await readSubscriptionPackages();
      const payload = normalizeSubscriptionPackagePayload(req.body);
      if (!payload.name) return res.status(400).json({ error: 'Package Name is required' });
      if (!payload.priceId && !payload.priceCode) return res.status(400).json({ error: 'Price Code is required' });

      const prices = await readSubscriptionPrices();
      const found = payload.priceId ? prices.find(p => p.id === payload.priceId) : prices.find(p => p.code === payload.priceCode);
      if (!found) return res.status(400).json({ error: 'Selected Price Code not found' });

      const now = new Date().toISOString();
      const id = `spkg_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const pkg = {
        id,
        name: payload.name,
        priceId: found.id,
        priceCode: found.code,
        currency: normalizeCurrency(found.currency),
        quantity: payload.quantity,
        status: payload.status,
        publishState: payload.publishState,
        discountType: payload.discountType,
        discountValue: payload.discountType === 'none' ? 0 : payload.discountValue,
        validFrom: payload.validFrom,
        validTo: payload.validTo,
        expired: payload.validTo ? String(payload.validTo) < dateOnlyTodayString() : false,
        createdAt: now,
        updatedAt: now
      };

      packages.push(pkg);
      await writeSubscriptionPackages(packages);
      await appendSubscriptionAudit(req, { action: 'create', entityType: 'package', entityId: id, after: pkg });
      res.json(pkg);
    } catch (error) {
      console.error('Error creating subscription package:', error);
      res.status(500).json({ error: 'Failed to create package' });
    }
  });

  app.put('/api/admin/subscription/packages/:id', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const id = req.params.id;
      const packages = await readSubscriptionPackages();
      const idx = packages.findIndex(p => p.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Package not found' });

      const before = packages[idx];
      const payload = normalizeSubscriptionPackagePayload(req.body);
      if (!payload.name) return res.status(400).json({ error: 'Package Name is required' });
      if (!payload.priceId && !payload.priceCode) return res.status(400).json({ error: 'Price Code is required' });

      const prices = await readSubscriptionPrices();
      const found = payload.priceId ? prices.find(p => p.id === payload.priceId) : prices.find(p => p.code === payload.priceCode);
      if (!found) return res.status(400).json({ error: 'Selected Price Code not found' });

      packages[idx] = {
        ...packages[idx],
        name: payload.name,
        priceId: found.id,
        priceCode: found.code,
        currency: normalizeCurrency(found.currency),
        quantity: payload.quantity,
        status: payload.status,
        publishState: payload.publishState,
        discountType: payload.discountType,
        discountValue: payload.discountType === 'none' ? 0 : payload.discountValue,
        validFrom: payload.validFrom,
        validTo: payload.validTo,
        expired: payload.validTo ? String(payload.validTo) < dateOnlyTodayString() : false,
        updatedAt: new Date().toISOString()
      };

      await writeSubscriptionPackages(packages);
      await appendSubscriptionAudit(req, { action: 'update', entityType: 'package', entityId: id, before, after: packages[idx] });
      res.json(packages[idx]);
    } catch (error) {
      console.error('Error updating subscription package:', error);
      res.status(500).json({ error: 'Failed to update package' });
    }
  });

  app.post('/api/admin/subscription/packages/bulk-delete', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
      if (!ids.length) return res.status(400).json({ error: 'ids is required' });

      const packages = await readSubscriptionPackages();
      const set = new Set(ids);
      const deleted = packages.filter(p => set.has(p.id));
      const next = packages.filter(p => !set.has(p.id));
      await writeSubscriptionPackages(next);
      await appendSubscriptionAudit(req, { action: 'bulk_delete', entityType: 'package', meta: { ids, deletedCount: deleted.length }, before: deleted });
      res.json({ ok: true, deletedCount: packages.length - next.length });
    } catch (error) {
      console.error('Error bulk deleting subscription packages:', error);
      res.status(500).json({ error: 'Failed to delete packages' });
    }
  });

  app.get('/api/admin/subscription/audit', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const q = String(req.query.q || '').trim().toLowerCase();
      const entityType = String(req.query.entityType || '').trim().toLowerCase();
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit || '100', 10) || 100));

      const raw = await fs.readFile(SUBSCRIPTION_AUDIT_FILE, 'utf8').catch(() => '');
      const lines = raw.split('\n').filter(Boolean);
      const parsed = [];
      for (let i = lines.length - 1; i >= 0 && parsed.length < limit; i--) {
        try {
          const item = JSON.parse(lines[i]);
          parsed.push(item);
        } catch (e) {
          // skip bad line
        }
      }

      const filtered = parsed.filter(item => {
        if (entityType && item.entityType !== entityType) return false;
        if (!q) return true;
        const blob = JSON.stringify(item).toLowerCase();
        return blob.includes(q);
      });

      res.json(filtered);
    } catch (error) {
      console.error('Error reading subscription audit log:', error);
      res.status(500).json({ error: 'Failed to load audit log' });
    }
  });
}

module.exports = { registerAdminSubscriptionRoutes };
