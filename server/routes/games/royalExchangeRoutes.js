// Royal Exchange routes (leaderboard)
"use strict";

function registerRoyalExchangeRoutes(app, deps) {
  const fs = deps && deps.fs;
  const ROYAL_EXCHANGE_LEADERBOARD_FILE = deps && deps.ROYAL_EXCHANGE_LEADERBOARD_FILE;

  if (!app) throw new Error("registerRoyalExchangeRoutes: missing app");
  if (!fs) throw new Error("registerRoyalExchangeRoutes: missing deps.fs");
  if (!ROYAL_EXCHANGE_LEADERBOARD_FILE) throw new Error("registerRoyalExchangeRoutes: missing deps.ROYAL_EXCHANGE_LEADERBOARD_FILE");

  async function readRoyalExchangeLeaderboard() {
    try {
      const raw = await fs.readFile(ROYAL_EXCHANGE_LEADERBOARD_FILE, 'utf8');
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch (error) {
      console.error('Error reading Royal Exchange leaderboard:', error);
      return [];
    }
  }

  function getRoyalExchangeEntryKey(entry) {
    const players = Array.isArray(entry?.players) ? entry.players : [];
    if (players.length === 0) return 'unknown';
    const ids = players
      .map(p => String(p?.id || p?.studentId || p?.name || 'unknown').trim())
      .filter(Boolean)
      .sort();
    // If a single player, the key is that player. If multiple players, treat as a team key.
    return ids.join('|') || 'unknown';
  }

  function isBetterRoyalExchangeEntry(a, b) {
    // true if a is better than b (lower steps, then lower duration, then earlier createdAt)
    const aSteps = Number(a?.steps) || 0;
    const bSteps = Number(b?.steps) || 0;
    if (aSteps !== bSteps) return aSteps < bSteps;
    const aDur = Number(a?.duration) || 0;
    const bDur = Number(b?.duration) || 0;
    if (aDur !== bDur) return aDur < bDur;
    const aTime = new Date(a?.createdAt || 0).getTime() || 0;
    const bTime = new Date(b?.createdAt || 0).getTime() || 0;
    return aTime < bTime;
  }

  function dedupeRoyalExchangeLeaderboardEntries(entries) {
    const bestByDifficulty = new Map(); // difficulty -> Map(key -> entry)
    (Array.isArray(entries) ? entries : []).forEach(entry => {
      if (!entry) return;
      const difficulty = entry.difficulty || 'normal';
      const key = getRoyalExchangeEntryKey(entry);
      if (!bestByDifficulty.has(difficulty)) bestByDifficulty.set(difficulty, new Map());
      const bucket = bestByDifficulty.get(difficulty);
      const existing = bucket.get(key);
      if (!existing || isBetterRoyalExchangeEntry(entry, existing)) {
        bucket.set(key, entry);
      }
    });

    const deduped = [];
    for (const [difficulty, bucket] of bestByDifficulty.entries()) {
      for (const entry of bucket.values()) {
        deduped.push({ ...entry, difficulty });
      }
    }
    return deduped;
  }

  async function writeRoyalExchangeLeaderboard(entries) {
    try {
      await fs.writeFile(ROYAL_EXCHANGE_LEADERBOARD_FILE, JSON.stringify(entries, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error writing Royal Exchange leaderboard:', error);
      return false;
    }
  }

  async function addRoyalExchangeLeaderboardEntry(entry) {
    const entries = await readRoyalExchangeLeaderboard();
    const normalized = {
      success: entry.success === true,
      players: entry.players || [],
      steps: Number(entry.steps) || 0,
      duration: Number(entry.duration) || 0,
      difficulty: entry.difficulty || 'normal',
      createdAt: entry.createdAt || new Date().toISOString()
    };
    entries.push(normalized);
    const deduped = dedupeRoyalExchangeLeaderboardEntries(entries).filter(e => e && e.success === true);
    deduped.sort((a, b) => {
      if ((a.difficulty || 'normal') !== (b.difficulty || 'normal')) {
        return String(a.difficulty || 'normal').localeCompare(String(b.difficulty || 'normal'));
      }
      if (Number(a.steps) !== Number(b.steps)) return Number(a.steps) - Number(b.steps);
      if (Number(a.duration) !== Number(b.duration)) return Number(a.duration) - Number(b.duration);
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
    await writeRoyalExchangeLeaderboard(deduped);
    return deduped;
  }

  app.get('/api/royal-exchange/leaderboard', async (req, res) => {
    try {
      const entries = await readRoyalExchangeLeaderboard();
      // Only show successful completions. Keep legacy entries (without success field) visible.
      const filtered = Array.isArray(entries)
        ? entries.filter(entry => entry && (entry.success === true || typeof entry.success === 'undefined'))
        : [];
      // Show only each person's/team's best result per difficulty.
      const deduped = dedupeRoyalExchangeLeaderboardEntries(filtered);
      deduped.sort((a, b) => {
        if ((a.difficulty || 'normal') !== (b.difficulty || 'normal')) {
          return String(a.difficulty || 'normal').localeCompare(String(b.difficulty || 'normal'));
        }
        if (Number(a.steps) !== Number(b.steps)) return Number(a.steps) - Number(b.steps);
        if (Number(a.duration) !== Number(b.duration)) return Number(a.duration) - Number(b.duration);
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      });
      res.json({ entries: deduped });
    } catch (error) {
      console.error('Error fetching Royal Exchange leaderboard:', error);
      res.status(500).json({ error: 'Failed to load leaderboard' });
    }
  });

  app.post('/api/royal-exchange/leaderboard', async (req, res) => {
    try {
      const { success, players, steps, duration, difficulty, createdAt } = req.body || {};
      if (success !== true) {
        return res.status(400).json({ error: 'Only successful completions can be recorded' });
      }
      if (!Array.isArray(players) || players.length === 0) {
        return res.status(400).json({ error: 'Players list is required' });
      }
      const normalizedPlayers = players.map(player => ({
        name: player.name || 'Unknown',
        studentId: player.studentId || '',
        id: player.id || null
      }));
      const entries = await addRoyalExchangeLeaderboardEntry({
        success: true,
        players: normalizedPlayers,
        steps,
        duration,
        difficulty,
        createdAt
      });
      res.json({ success: true, entries });
    } catch (error) {
      console.error('Error updating Royal Exchange leaderboard:', error);
      res.status(500).json({ error: 'Failed to update leaderboard' });
    }
  });
}

module.exports = { registerRoyalExchangeRoutes };


