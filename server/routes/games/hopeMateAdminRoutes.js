// Hope Mate admin routes (manual stage puzzles library)
"use strict";

function registerHopeMateAdminRoutes(app, deps) {
  const fs = deps && deps.fs;
  const authenticateUser = deps && deps.authenticateUser;
  const authorizeRole = deps && deps.authorizeRole;
  const HOPE_MATE_STAGE_PUZZLES_FILE = deps && deps.HOPE_MATE_STAGE_PUZZLES_FILE;

  if (!app) throw new Error("registerHopeMateAdminRoutes: missing app");
  if (!fs) throw new Error("registerHopeMateAdminRoutes: missing deps.fs");
  if (!HOPE_MATE_STAGE_PUZZLES_FILE) throw new Error("registerHopeMateAdminRoutes: missing deps.HOPE_MATE_STAGE_PUZZLES_FILE");

  async function readHopeMateStagePuzzlesFile() {
    try {
      const raw = await fs.readFile(HOPE_MATE_STAGE_PUZZLES_FILE, 'utf8');
      const parsed = JSON.parse(raw || '{}');
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.puzzles)) return parsed;
      return { puzzles: [], lastUpdate: new Date().toISOString() };
    } catch (error) {
      console.error('Error reading Hope Mate stage puzzles:', error);
      return { puzzles: [], lastUpdate: new Date().toISOString() };
    }
  }

  async function writeHopeMateStagePuzzlesFile(puzzlesObj) {
    try {
      const out = {
        puzzles: Array.isArray(puzzlesObj?.puzzles) ? puzzlesObj.puzzles : [],
        lastUpdate: new Date().toISOString()
      };
      await fs.writeFile(HOPE_MATE_STAGE_PUZZLES_FILE, JSON.stringify(out, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error writing Hope Mate stage puzzles:', error);
      return false;
    }
  }

  function validateFen8x8(fen) {
    const s = String(fen || '').trim();
    if (!s) return { ok: false, reason: 'FEN is required.' };
    const parts = s.split(/\s+/);
    if (parts.length < 2) return { ok: false, reason: 'FEN must include at least: board + side-to-move.' };
    const board = parts[0];
    const stm = parts[1];
    if (stm !== 'b') return { ok: false, reason: 'Side to move must be "b" (black to move).' };

    const ranks = board.split('/');
    if (ranks.length !== 8) return { ok: false, reason: 'Board must have 8 ranks separated by "/".' };

    const allowedPiece = new Set('pnbrqkPNBRQK'.split(''));
    let blackKingCount = 0;
    for (const rank of ranks) {
      let sum = 0;
      for (const ch of rank) {
        if (ch >= '1' && ch <= '8') {
          sum += Number(ch);
        } else if (allowedPiece.has(ch)) {
          sum += 1;
          if (ch === 'k') blackKingCount += 1;
        } else {
          return { ok: false, reason: `Invalid FEN character in board: "${ch}".` };
        }
      }
      if (sum !== 8) return { ok: false, reason: 'Each rank must sum to 8 squares.' };
    }
    if (blackKingCount !== 1) return { ok: false, reason: 'FEN must contain exactly one black king ("k").' };
    return { ok: true, fen: s };
  }

  // =========================
  // Admin - Hope Mate Stage Puzzles (manual FEN library)
  // =========================
  const HOPE_MATE_STAGE_KEYS = new Set([
    'rook',
    'queen',
    'minor',
    'pawns',
    'twoRooks',
    'rookKnight',
    'queenBishop',
    'queenKnight',
    'queenRook',
    'threePieces'
  ]);

  app.get('/api/admin/games/hope-mate/stage-puzzles', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const stageKey = String(req.query.stageKey || '').trim();
      const data = await readHopeMateStagePuzzlesFile();
      let puzzles = data.puzzles || [];
      if (stageKey) puzzles = puzzles.filter((p) => p.stageKey === stageKey);
      return res.json({ puzzles });
    } catch (e) {
      console.error('Admin get Hope Mate stage puzzles failed:', e);
      return res.status(500).json({ error: 'Failed to load puzzles' });
    }
  });

  app.post('/api/admin/games/hope-mate/stage-puzzles', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const stageKey = String(req.body?.stageKey || '').trim();
      const fen = String(req.body?.fen || '').trim();
      if (!HOPE_MATE_STAGE_KEYS.has(stageKey)) {
        return res.status(400).json({ error: 'Invalid stageKey' });
      }
      const v = validateFen8x8(fen);
      if (!v.ok) return res.status(400).json({ error: v.reason || 'Invalid FEN' });

      const data = await readHopeMateStagePuzzlesFile();
      const puzzles = Array.isArray(data.puzzles) ? data.puzzles : [];

      const id = `hm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const entry = { id, stageKey, fen: v.fen, createdAt: new Date().toISOString() };
      puzzles.unshift(entry);

      const ok = await writeHopeMateStagePuzzlesFile({ puzzles });
      if (!ok) return res.status(500).json({ error: 'Failed to save puzzle' });
      return res.json({ ok: true, puzzle: entry });
    } catch (e) {
      console.error('Admin add Hope Mate stage puzzle failed:', e);
      return res.status(500).json({ error: 'Failed to save puzzle' });
    }
  });

  app.delete('/api/admin/games/hope-mate/stage-puzzles/:id', authenticateUser, authorizeRole('admin'), async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Missing id' });

      const data = await readHopeMateStagePuzzlesFile();
      const puzzles = Array.isArray(data.puzzles) ? data.puzzles : [];
      const next = puzzles.filter((p) => p.id !== id);
      if (next.length === puzzles.length) return res.status(404).json({ error: 'Not found' });

      const ok = await writeHopeMateStagePuzzlesFile({ puzzles: next });
      if (!ok) return res.status(500).json({ error: 'Failed to delete puzzle' });
      return res.json({ ok: true });
    } catch (e) {
      console.error('Admin delete Hope Mate stage puzzle failed:', e);
      return res.status(500).json({ error: 'Failed to delete puzzle' });
    }
  });
}

module.exports = { registerHopeMateAdminRoutes };


