// Hope Mate routes (teacher-scoped leaderboard + challenge leaderboard)
"use strict";

function registerHopeMateRoutes(app, deps) {
  const fs = deps && deps.fs;
  const authenticateUser = deps && deps.authenticateUser;
  const authorizeRole = deps && deps.authorizeRole;
  const requireOrganizationAccess = deps && deps.requireOrganizationAccess;
  const readData = deps && deps.readData;
  const filterStudentsByOrganization = deps && deps.filterStudentsByOrganization;
  const resolveOrgIdFromUser = deps && deps.resolveOrgIdFromUser;

  const HOPE_MATE_LEADERBOARD_FILE = deps && deps.HOPE_MATE_LEADERBOARD_FILE;
  const HOPE_MATE_CHALLENGE_LEADERBOARD_FILE = deps && deps.HOPE_MATE_CHALLENGE_LEADERBOARD_FILE;

  if (!app) throw new Error("registerHopeMateRoutes: missing app");
  if (!fs) throw new Error("registerHopeMateRoutes: missing deps.fs");
  if (typeof readData !== "function") throw new Error("registerHopeMateRoutes: missing deps.readData");
  if (!HOPE_MATE_LEADERBOARD_FILE) throw new Error("registerHopeMateRoutes: missing deps.HOPE_MATE_LEADERBOARD_FILE");
  if (!HOPE_MATE_CHALLENGE_LEADERBOARD_FILE) throw new Error("registerHopeMateRoutes: missing deps.HOPE_MATE_CHALLENGE_LEADERBOARD_FILE");

  // ============================
  // Hope Mate leaderboard (scoped per teacher + org)
  // ============================

  async function readHopeMateLeaderboard() {
    try {
      const raw = await fs.readFile(HOPE_MATE_LEADERBOARD_FILE, 'utf8');
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Error reading Hope Mate leaderboard:', error);
      return [];
    }
  }

  async function writeHopeMateLeaderboard(entries) {
    try {
      await fs.writeFile(HOPE_MATE_LEADERBOARD_FILE, JSON.stringify(entries, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error writing Hope Mate leaderboard:', error);
      return false;
    }
  }

  function normalizeHopeMateEntry(entry) {
    return {
      orgId: String(entry?.orgId || ''),
      teacherId: String(entry?.teacherId || ''),
      student: {
        id: String(entry?.student?.id || ''),
        name: String(entry?.student?.name || 'Unknown'),
        studentId: String(entry?.student?.studentId || '')
      },
      totalScore: Number(entry?.totalScore) || 0,
      updatedAt: entry?.updatedAt || new Date().toISOString(),
      createdAt: entry?.createdAt || new Date().toISOString()
    };
  }

  function getHopeMateKey(entry) {
    const orgId = String(entry?.orgId || '');
    const teacherId = String(entry?.teacherId || '');
    const studentId = String(entry?.student?.id || '');
    return `${orgId}:${teacherId}:${studentId}`;
  }

  function dedupeHopeMateLeaderboard(entries) {
    const bestByKey = new Map();
    for (const e of Array.isArray(entries) ? entries : []) {
      const n = normalizeHopeMateEntry(e);
      if (!n.orgId || !n.teacherId || !n.student.id) continue;
      const key = getHopeMateKey(n);
      const cur = bestByKey.get(key);
      // Keep highest totalScore; if tie, keep most recent updatedAt
      if (!cur) {
        bestByKey.set(key, n);
        continue;
      }
      if ((n.totalScore || 0) > (cur.totalScore || 0)) {
        bestByKey.set(key, { ...cur, ...n, createdAt: cur.createdAt || n.createdAt });
        continue;
      }
      if ((n.totalScore || 0) === (cur.totalScore || 0)) {
        const nt = new Date(n.updatedAt || 0).getTime() || 0;
        const ct = new Date(cur.updatedAt || 0).getTime() || 0;
        if (nt > ct) {
          bestByKey.set(key, { ...cur, ...n, createdAt: cur.createdAt || n.createdAt });
        }
      }
    }
    return Array.from(bestByKey.values());
  }

  async function upsertHopeMateLeaderboardEntry({ orgId, teacherId, student, totalScore }) {
    const existing = await readHopeMateLeaderboard();
    const deduped = dedupeHopeMateLeaderboard(existing);

    const key = `${String(orgId)}:${String(teacherId)}:${String(student?.id || '')}`;
    const nowIso = new Date().toISOString();
    const incomingTotal = Number(totalScore);

    const next = deduped.map(e => normalizeHopeMateEntry(e));
    const idx = next.findIndex(e => getHopeMateKey(e) === key);
    if (idx === -1) {
      next.push(normalizeHopeMateEntry({
        orgId,
        teacherId,
        student,
        totalScore: Number.isFinite(incomingTotal) ? incomingTotal : 0,
        createdAt: nowIso,
        updatedAt: nowIso
      }));
    } else {
      const cur = next[idx];
      const curTotal = Number(cur.totalScore) || 0;
      // Allow idempotent resend (same total), or incremental +1 only.
      if (incomingTotal < curTotal) {
        // ignore decreasing updates
      } else if (incomingTotal === curTotal || incomingTotal === curTotal + 1) {
        next[idx] = normalizeHopeMateEntry({
          ...cur,
          student,
          totalScore: incomingTotal,
          updatedAt: nowIso
        });
      } else {
        // reject suspicious jump (client bug or tampering)
        const err = new Error('Invalid score update (jump too large)');
        err.code = 'SCORE_JUMP';
        throw err;
      }
    }

    const final = dedupeHopeMateLeaderboard(next);
    final.sort((a, b) => {
      if ((b.totalScore || 0) !== (a.totalScore || 0)) return (b.totalScore || 0) - (a.totalScore || 0);
      return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
    });
    await writeHopeMateLeaderboard(final);
    return final;
  }

  // ============================
  // Hope Mate Challenge leaderboard (scoped per teacher + org + durationSec)
  // ============================
  const HOPE_MATE_CHALLENGE_DURATIONS = new Set([60, 120, 180]);

  async function readHopeMateChallengeLeaderboard() {
    try {
      const raw = await fs.readFile(HOPE_MATE_CHALLENGE_LEADERBOARD_FILE, 'utf8');
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Error reading Hope Mate Challenge leaderboard:', error);
      return [];
    }
  }

  async function writeHopeMateChallengeLeaderboard(entries) {
    try {
      await fs.writeFile(HOPE_MATE_CHALLENGE_LEADERBOARD_FILE, JSON.stringify(entries, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error writing Hope Mate Challenge leaderboard:', error);
      return false;
    }
  }

  function normalizeHopeMateChallengeEntry(entry) {
    const durationSec = Number(entry?.durationSec);
    return {
      orgId: String(entry?.orgId || ''),
      teacherId: String(entry?.teacherId || ''),
      durationSec: HOPE_MATE_CHALLENGE_DURATIONS.has(durationSec) ? durationSec : 60,
      student: {
        id: String(entry?.student?.id || ''),
        name: String(entry?.student?.name || 'Unknown'),
        studentId: String(entry?.student?.studentId || '')
      },
      totalSolved: Number(entry?.totalSolved) || 0,
      bestLevel: Number(entry?.bestLevel) || 1,
      bestTimeLeftSec: Number(entry?.bestTimeLeftSec) || 0,
      updatedAt: entry?.updatedAt || new Date().toISOString(),
      createdAt: entry?.createdAt || new Date().toISOString()
    };
  }

  function getHopeMateChallengeKey(entry) {
    const orgId = String(entry?.orgId || '');
    const teacherId = String(entry?.teacherId || '');
    const durationSec = Number(entry?.durationSec) || 60;
    const studentId = String(entry?.student?.id || '');
    return `${orgId}:${teacherId}:${durationSec}:${studentId}`;
  }

  function isBetterHopeMateChallenge(candidate, current) {
    if (!current) return true;
    if ((candidate.totalSolved || 0) !== (current.totalSolved || 0)) return (candidate.totalSolved || 0) > (current.totalSolved || 0);
    if ((candidate.bestLevel || 0) !== (current.bestLevel || 0)) return (candidate.bestLevel || 0) > (current.bestLevel || 0);
    if ((candidate.bestTimeLeftSec || 0) !== (current.bestTimeLeftSec || 0)) return (candidate.bestTimeLeftSec || 0) > (current.bestTimeLeftSec || 0);
    return new Date(candidate.updatedAt || 0) > new Date(current.updatedAt || 0);
  }

  async function upsertHopeMateChallengeEntry(entry) {
    const all = await readHopeMateChallengeLeaderboard();
    const normalized = normalizeHopeMateChallengeEntry(entry);
    const key = getHopeMateChallengeKey(normalized);
    const map = new Map();
    for (const e of (Array.isArray(all) ? all : [])) {
      const ne = normalizeHopeMateChallengeEntry(e);
      map.set(getHopeMateChallengeKey(ne), ne);
    }
    const current = map.get(key);
    if (!current || isBetterHopeMateChallenge(normalized, current)) {
      normalized.updatedAt = new Date().toISOString();
      normalized.createdAt = current?.createdAt || normalized.createdAt;
      map.set(key, normalized);
    }
    const next = Array.from(map.values());
    await writeHopeMateChallengeLeaderboard(next);
    return next;
  }

  // --------------------
  // Routes
  // --------------------

  // Hope Mate leaderboard (teacher scoped)
  app.get('/api/hope-mate/leaderboard', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
    try {
      const orgId = resolveOrgIdFromUser(req.user);
      const teacherId = String(req.user?.id || '');
      const all = await readHopeMateLeaderboard();
      const filtered = (Array.isArray(all) ? all : [])
        .map(e => normalizeHopeMateEntry(e))
        .filter(e => String(e.orgId) === String(orgId) && String(e.teacherId) === teacherId);
      filtered.sort((a, b) => {
        if ((b.totalScore || 0) !== (a.totalScore || 0)) return (b.totalScore || 0) - (a.totalScore || 0);
        return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
      });
      res.json({ entries: filtered });
    } catch (error) {
      console.error('Error fetching Hope Mate leaderboard:', error);
      res.status(500).json({ error: 'Failed to load leaderboard' });
    }
  });

  app.post('/api/hope-mate/leaderboard', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
    try {
      const orgId = resolveOrgIdFromUser(req.user);
      const teacherId = String(req.user?.id || '');
      const studentInternalId = String(req.body?.studentId || '');
      const totalScore = Number(req.body?.totalScore);
      if (!studentInternalId) return res.status(400).json({ error: 'studentId is required' });
      if (!Number.isFinite(totalScore) || totalScore < 0) return res.status(400).json({ error: 'totalScore must be a non-negative number' });

      // Validate student exists within this teacher's organization
      const data = await readData();
      let students = Array.isArray(data?.students) ? data.students : [];
      if (orgId) {
        students = filterStudentsByOrganization(students, orgId);
      }
      const student = students.find(s => String(s?.id) === studentInternalId);
      if (!student) return res.status(404).json({ error: 'Student not found' });

      const updated = await upsertHopeMateLeaderboardEntry({
        orgId: String(orgId || ''),
        teacherId,
        student: {
          id: String(student.id),
          name: String(student.name || 'Unknown'),
          studentId: String(student.studentId || '')
        },
        totalScore
      });

      const scoped = updated
        .map(e => normalizeHopeMateEntry(e))
        .filter(e => String(e.orgId) === String(orgId) && String(e.teacherId) === teacherId);
      scoped.sort((a, b) => {
        if ((b.totalScore || 0) !== (a.totalScore || 0)) return (b.totalScore || 0) - (a.totalScore || 0);
        return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
      });

      res.json({ ok: true, entries: scoped });
    } catch (error) {
      if (error && error.code === 'SCORE_JUMP') {
        return res.status(400).json({ error: 'Invalid score update' });
      }
      console.error('Error updating Hope Mate leaderboard:', error);
      res.status(500).json({ error: 'Failed to update leaderboard' });
    }
  });

  // Hope Mate Challenge leaderboard (teacher scoped, per durationSec)
  app.get('/api/hope-mate/challenge-leaderboard', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
    try {
      const orgId = resolveOrgIdFromUser(req.user);
      const teacherId = String(req.user?.id || '');
      const durationSec = Number(req.query?.durationSec);
      if (!HOPE_MATE_CHALLENGE_DURATIONS.has(durationSec)) {
        return res.status(400).json({ error: 'durationSec must be one of 60, 120, 180' });
      }
      const all = await readHopeMateChallengeLeaderboard();
      const scoped = (Array.isArray(all) ? all : [])
        .map(e => normalizeHopeMateChallengeEntry(e))
        .filter(e => String(e.orgId) === String(orgId) && String(e.teacherId) === teacherId && Number(e.durationSec) === durationSec);
      scoped.sort((a, b) => {
        if ((b.totalSolved || 0) !== (a.totalSolved || 0)) return (b.totalSolved || 0) - (a.totalSolved || 0);
        if ((b.bestLevel || 0) !== (a.bestLevel || 0)) return (b.bestLevel || 0) - (a.bestLevel || 0);
        if ((b.bestTimeLeftSec || 0) !== (a.bestTimeLeftSec || 0)) return (b.bestTimeLeftSec || 0) - (a.bestTimeLeftSec || 0);
        return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
      });
      return res.json({ entries: scoped });
    } catch (error) {
      console.error('Error fetching Hope Mate Challenge leaderboard:', error);
      return res.status(500).json({ error: 'Failed to load leaderboard' });
    }
  });

  app.post('/api/hope-mate/challenge-leaderboard', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
    try {
      const orgId = resolveOrgIdFromUser(req.user);
      const teacherId = String(req.user?.id || '');
      const studentInternalId = String(req.body?.studentId || '');
      const durationSec = Number(req.body?.durationSec);
      const totalSolved = Number(req.body?.totalSolved);
      const bestLevel = Number(req.body?.bestLevel);
      const bestTimeLeftSec = Number(req.body?.bestTimeLeftSec);

      if (!studentInternalId) return res.status(400).json({ error: 'studentId is required' });
      if (!HOPE_MATE_CHALLENGE_DURATIONS.has(durationSec)) return res.status(400).json({ error: 'durationSec must be one of 60, 120, 180' });
      if (!Number.isFinite(totalSolved) || totalSolved < 0) return res.status(400).json({ error: 'totalSolved must be a non-negative number' });
      if (!Number.isFinite(bestLevel) || bestLevel < 1 || bestLevel > 10) return res.status(400).json({ error: 'bestLevel must be between 1 and 10' });
      if (!Number.isFinite(bestTimeLeftSec) || bestTimeLeftSec < 0 || bestTimeLeftSec > durationSec) return res.status(400).json({ error: 'bestTimeLeftSec must be between 0 and durationSec' });

      const data = await readData();
      let students = Array.isArray(data?.students) ? data.students : [];
      if (orgId) students = filterStudentsByOrganization(students, orgId);
      const student = students.find(s => String(s?.id) === studentInternalId);
      if (!student) return res.status(404).json({ error: 'Student not found' });

      const updated = await upsertHopeMateChallengeEntry({
        orgId: String(orgId || ''),
        teacherId,
        durationSec,
        student: {
          id: String(student.id),
          name: String(student.name || 'Unknown'),
          studentId: String(student.studentId || '')
        },
        totalSolved,
        bestLevel,
        bestTimeLeftSec
      });

      const scoped = (Array.isArray(updated) ? updated : [])
        .map(e => normalizeHopeMateChallengeEntry(e))
        .filter(e => String(e.orgId) === String(orgId) && String(e.teacherId) === teacherId && Number(e.durationSec) === durationSec);
      scoped.sort((a, b) => {
        if ((b.totalSolved || 0) !== (a.totalSolved || 0)) return (b.totalSolved || 0) - (a.totalSolved || 0);
        if ((b.bestLevel || 0) !== (a.bestLevel || 0)) return (b.bestLevel || 0) - (a.bestLevel || 0);
        if ((b.bestTimeLeftSec || 0) !== (a.bestTimeLeftSec || 0)) return (b.bestTimeLeftSec || 0) - (a.bestTimeLeftSec || 0);
        return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
      });
      return res.json({ ok: true, entries: scoped });
    } catch (error) {
      console.error('Error updating Hope Mate Challenge leaderboard:', error);
      return res.status(500).json({ error: 'Failed to update leaderboard' });
    }
  });
}

module.exports = { registerHopeMateRoutes };


