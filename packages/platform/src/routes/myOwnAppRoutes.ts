"use strict";

const { generateTokenWithExpiry, isAuthConfigured } = require("@student-scoring/core");

import { Request, Response, NextFunction } from 'express';

function ensureEatWhatSchema(pool: any): any {
  // Minimal schema: one row per admin user.
  return pool.query(`
    CREATE TABLE IF NOT EXISTS my_own_app_eatwhat_state (
      user_id TEXT PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function registerMyOwnAppRoutes(app: any, deps: any): void {
  if (!app) throw new Error("registerMyOwnAppRoutes: missing app");
  const appDb = deps?.appDb;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;

  const pool = appDb?.getPool?.();
  const hasDb = !!pool;

  async function requireDbReady(res) {
    if (!hasDb) {
      res.status(501).json({ ok: false, error: "Postgres not configured" });
      return false;
    }
    try {
      await pool.query("SELECT 1 AS ok", []);
      await ensureEatWhatSchema(pool);
      return true;
    } catch (e) {
      console.error("[my-own-app] ensure schema failed:", e);
      const msg = String(e?.message || e);
      const isConn = /ECONNREFUSED|ENOTFOUND|timeout|terminating connection|connection/i.test(msg);
      res
        .status(isConn ? 503 : 500)
        .json({ ok: false, error: isConn ? "Postgres connection failed" : "DB schema not ready", details: msg });
      return false;
    }
  }

  if (!authenticateUser || !authorizeRole) {
    console.warn("[my-own-app] missing auth middleware; routes not registered");
    return;
  }

  // Get current admin user's EatWhat state
  app.get("/api/admin/my-own-app/eatwhat", authenticateUser, authorizeRole("admin"), async (req, res) => {
    if (!(await requireDbReady(res))) return;
    const userId = String(req?.user?.id || req?.user?.userId || "").trim();
    if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });
    try {
      const r = await pool.query("SELECT state, updated_at FROM my_own_app_eatwhat_state WHERE user_id = $1", [userId]);
      const row = r?.rows?.[0] || null;
      return res.json({
        ok: true,
        state: row?.state || null,
        updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null
      });
    } catch (e) {
      console.error("[my-own-app] GET eatwhat failed:", e);
      return res.status(500).json({ ok: false, error: "Failed to load", details: String(e?.message || e) });
    }
  });

  // Upsert current admin user's EatWhat state
  app.put("/api/admin/my-own-app/eatwhat", authenticateUser, authorizeRole("admin"), async (req, res) => {
    if (!(await requireDbReady(res))) return;
    const userId = String(req?.user?.id || req?.user?.userId || "").trim();
    if (!userId) return res.status(401).json({ ok: false, error: "Unauthorized" });
    const state = req?.body && Object.prototype.hasOwnProperty.call(req.body, "state") ? req.body.state : null;
    if (!state || typeof state !== "object") return res.status(400).json({ ok: false, error: "Missing state object" });
    try {
      // Basic size guard (avoid accidentally storing huge blobs)
      const raw = JSON.stringify(state);
      if (raw.length > 1_000_000) return res.status(413).json({ ok: false, error: "State too large" });

      await pool.query(
        `
        INSERT INTO my_own_app_eatwhat_state (user_id, state, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          state = EXCLUDED.state,
          updated_at = NOW()
        `,
        [userId, raw]
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error("[my-own-app] PUT eatwhat failed:", e);
      return res.status(500).json({ ok: false, error: "Failed to save", details: String(e?.message || e) });
    }
  });

  // Generate a magic share link (contains admin token). Anyone with link can access as admin until expiry.
  app.post("/api/admin/my-own-app/eatwhat/share-link", authenticateUser, authorizeRole("admin"), async (req, res) => {
    const expiresIn = String(req?.body?.expiresIn || "30d").trim() || "30d";
    try {
      if (!isAuthConfigured()) {
        return res.status(503).json({ ok: false, error: "Authentication is not configured on this server" });
      }
      const token = generateTokenWithExpiry(req.user, expiresIn);
      return res.json({ ok: true, token, expiresIn });
    } catch (e) {
      console.error("[my-own-app] share-link failed:", e);
      return res.status(500).json({ ok: false, error: "Failed to generate link", details: String(e?.message || e) });
    }
  });
}

module.exports = { registerMyOwnAppRoutes };


