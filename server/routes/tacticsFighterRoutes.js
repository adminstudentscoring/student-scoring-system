// Tactics Fighter routes (scaffold)
"use strict";

function safeJsonParse(s) {
  try { return JSON.parse(String(s || '')); } catch { return null; }
}

function nowIso() {
  return new Date().toISOString();
}

function toCleanString(v, maxLen = 5000) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

async function ensureParentDir(fsPromises, path, filePath) {
  try {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  } catch {}
}

function registerTacticsFighterRoutes(app, deps) {
  if (!app) throw new Error("registerTacticsFighterRoutes: missing app");
  const fsPromises = deps?.fs;
  const path = deps?.path;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const readData = deps?.readData;
  const filterStudentsByOrganization = deps?.filterStudentsByOrganization;
  const resolveOrgIdFromUser = deps?.resolveOrgIdFromUser;
  const TACTICS_FIGHTER_ATTEMPTS_FILE = deps?.TACTICS_FIGHTER_ATTEMPTS_FILE;

  if (!fsPromises || !path) {
    console.warn("[tactics-fighter] missing fs/path deps; routes disabled");
    return;
  }

  // Public (used by game-window stub)
  app.get("/api/tactics-fighter/config", async (req, res) => {
    res.json({
      ok: true,
      app: "tactics-fighter",
      version: "v1",
      updatedAt: nowIso(),
      endpoints: {
        logAttempt: "/api/tactics-fighter/attempts",
        teacherAttempts: "/api/teachers/tactics-fighter/attempts"
      }
    });
  });

  // Public: minimal attempt logger (future: validate answers + scoring)
  app.post("/api/tactics-fighter/attempts", async (req, res) => {
    try {
      const studentId = toCleanString(req?.body?.studentId || "", 200);
      if (!studentId) return res.status(400).json({ ok: false, error: "Missing studentId" });

      // Best-effort validate student existence (prevents random spam)
      if (typeof readData === "function") {
        const data = await readData().catch(() => null);
        const students = Array.isArray(data?.students) ? data.students : [];
        const exists = students.some((s) => String(s?.id || "") === studentId);
        if (!exists) return res.status(404).json({ ok: false, error: "Student not found" });
      }

      const entry = {
        ts: nowIso(),
        studentId,
        puzzleId: toCleanString(req?.body?.puzzleId || "", 200),
        answer: toCleanString(req?.body?.answer || "", 2000),
        correct: req?.body?.correct === true,
        meta: req?.body?.meta && typeof req.body.meta === "object" ? req.body.meta : undefined,
        ua: toCleanString(req.get("user-agent") || "", 500),
        ip: toCleanString(req.ip || "", 200)
      };

      if (TACTICS_FIGHTER_ATTEMPTS_FILE) {
        await ensureParentDir(fsPromises, path, TACTICS_FIGHTER_ATTEMPTS_FILE);
        await fsPromises.appendFile(TACTICS_FIGHTER_ATTEMPTS_FILE, JSON.stringify(entry) + "\n", "utf8");
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error("[tactics-fighter] log attempt error:", e);
      return res.status(500).json({ ok: false, error: "Failed to log attempt" });
    }
  });

  // Teacher: read attempts (simple file scan; good enough for now)
  if (authenticateUser && authorizeRole && requireOrganizationAccess && resolveOrgIdFromUser) {
    app.get(
      "/api/teachers/tactics-fighter/attempts",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        try {
          if (!TACTICS_FIGHTER_ATTEMPTS_FILE) return res.json({ ok: true, attempts: [] });

          const orgId = await resolveOrgIdFromUser(req.user).catch(() => null);
          const studentId = toCleanString(req.query?.studentId || "", 200);

          // If a studentId is provided, enforce same-org access.
          if (studentId && orgId && typeof filterStudentsByOrganization === "function" && typeof readData === "function") {
            const data = await readData().catch(() => null);
            const students = Array.isArray(data?.students) ? data.students : [];
            const orgStudents = filterStudentsByOrganization(students, orgId);
            const ok = orgStudents.some((s) => String(s?.id || "") === studentId);
            if (!ok) return res.status(403).json({ ok: false, error: "Student not in organization" });
          }

          const text = await fsPromises.readFile(TACTICS_FIGHTER_ATTEMPTS_FILE, "utf8").catch(() => "");
          const lines = String(text || "").split("\n").filter(Boolean);

          // Keep response bounded.
          const tail = lines.slice(Math.max(0, lines.length - 2000));
          const parsed = tail
            .map((l) => safeJsonParse(l))
            .filter(Boolean)
            .filter((a) => (studentId ? String(a.studentId || "") === studentId : true));

          return res.json({ ok: true, attempts: parsed.slice(-500) });
        } catch (e) {
          console.error("[tactics-fighter] teacher attempts error:", e);
          return res.status(500).json({ ok: false, error: "Failed to load attempts" });
        }
      }
    );
  }
}

module.exports = { registerTacticsFighterRoutes };


