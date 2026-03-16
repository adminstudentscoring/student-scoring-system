// Running Queen routes (leaderboard)
"use strict";
import type { Request, Response } from 'express';

function registerRunningQueenRoutes(app: any, deps: any): void {
  const fs = deps && deps.fs;
  const RUNNING_QUEEN_LEADERBOARD_FILE = deps && deps.RUNNING_QUEEN_LEADERBOARD_FILE;

  if (!app) throw new Error("registerRunningQueenRoutes: missing app");
  if (!fs) throw new Error("registerRunningQueenRoutes: missing deps.fs");
  if (!RUNNING_QUEEN_LEADERBOARD_FILE) throw new Error("registerRunningQueenRoutes: missing deps.RUNNING_QUEEN_LEADERBOARD_FILE");

  async function readRunningQueenLeaderboard() {
    try {
      const raw = await fs.readFile(RUNNING_QUEEN_LEADERBOARD_FILE, 'utf8');
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed)) {
        return dedupeRunningQueenLeaderboard(parsed);
      }
      return [];
    } catch (error) {
      console.error('Error reading Running Queen leaderboard:', error);
      return [];
    }
  }

  function isBetterRunningQueenEntry(candidate, current) {
    if (!current) return true;
    if ((candidate.score || 0) !== (current.score || 0)) return (candidate.score || 0) > (current.score || 0);
    // Timed mode uses lower duration as tie-breaker (faster is better)
    if (candidate.mode === 'timed' && current.mode === 'timed') {
      if ((candidate.duration || 0) !== (current.duration || 0)) return (candidate.duration || 0) < (current.duration || 0);
    }
    // Otherwise prefer newer
    return new Date(candidate.createdAt || 0) > new Date(current.createdAt || 0);
  }

  function normalizeRunningQueenEntry(entry, playerOverride = null) {
    const mode = entry?.mode === 'infinite' ? 'infinite' : 'timed';
    const queenCount = Number(entry?.queenCount);
    const timerDurationMs = Number(entry?.timerDurationMs || entry?.timerDuration);
    const player = playerOverride || null;
    return {
      players: player ? [player] : (Array.isArray(entry?.players) ? entry.players : []),
      mode,
      score: Number(entry?.score) || 0,
      duration: Number(entry?.duration) || 0,
      status: entry?.status || 'success',
      queenCount: Number.isFinite(queenCount) && queenCount > 0 ? queenCount : null,
      timerDurationMs: Number.isFinite(timerDurationMs) && timerDurationMs > 0 ? timerDurationMs : 0,
      createdAt: entry?.createdAt || new Date().toISOString()
    };
  }

  function getRunningQueenPlayerKey(player) {
    // Prefer internal student id; fall back to studentId or name if needed.
    if (player?.id) return String(player.id);
    if (player?.studentId) return String(player.studentId);
    return String(player?.name || 'unknown');
  }

  function dedupeRunningQueenLeaderboard(entries) {
    const bestByKey = new Map();
    const list = Array.isArray(entries) ? entries : [];

    for (const entry of list) {
      const players = Array.isArray(entry?.players) ? entry.players : [];
      // If stored entry has multiple players, treat it as multiple per-player entries.
      if (players.length > 0) {
        for (const player of players) {
          const normalizedPlayer = {
            name: player?.name || 'Unknown',
            studentId: player?.studentId || '',
            id: player?.id || null
          };
          const normalized = normalizeRunningQueenEntry(entry, normalizedPlayer);
          const key = `${normalized.mode}:${getRunningQueenPlayerKey(normalizedPlayer)}`;
          const current = bestByKey.get(key);
          if (isBetterRunningQueenEntry(normalized, current)) {
            bestByKey.set(key, normalized);
          }
        }
      } else {
        // No players list; keep as-is under a generic key
        const normalized = normalizeRunningQueenEntry(entry);
        const key = `${normalized.mode}:unknown`;
        const current = bestByKey.get(key);
        if (isBetterRunningQueenEntry(normalized, current)) {
          bestByKey.set(key, normalized);
        }
      }
    }

    const deduped = Array.from(bestByKey.values());
    deduped.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((a.mode === 'timed' || b.mode === 'timed') && a.mode === b.mode) {
        return (a.duration || 0) - (b.duration || 0);
      }
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
    return deduped;
  }

  async function writeRunningQueenLeaderboard(entries) {
    try {
      await fs.writeFile(RUNNING_QUEEN_LEADERBOARD_FILE, JSON.stringify(entries, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error writing Running Queen leaderboard:', error);
      return false;
    }
  }

  async function addRunningQueenLeaderboardEntry(entry) {
    // Start from current deduped leaderboard
    const existing = await readRunningQueenLeaderboard();

    const incomingPlayers = Array.isArray(entry?.players) ? entry.players : [];
    const perPlayerEntries = incomingPlayers.map(player => {
      const normalizedPlayer = {
        name: player?.name || 'Unknown',
        studentId: player?.studentId || '',
        id: player?.id || null
      };
      return { normalizedPlayer, normalizedEntry: normalizeRunningQueenEntry(entry, normalizedPlayer) };
    });

    // Rebuild best map from existing (already deduped) + incoming
    const bestByKey = new Map();
    for (const existingEntry of existing) {
      const player = Array.isArray(existingEntry.players) ? existingEntry.players[0] : null;
      const key = `${existingEntry.mode}:${getRunningQueenPlayerKey(player)}`;
      bestByKey.set(key, existingEntry);
    }
    for (const { normalizedPlayer, normalizedEntry } of perPlayerEntries) {
      const key = `${normalizedEntry.mode}:${getRunningQueenPlayerKey(normalizedPlayer)}`;
      const current = bestByKey.get(key);
      if (isBetterRunningQueenEntry(normalizedEntry, current)) {
        bestByKey.set(key, normalizedEntry);
      }
    }

    const updated = Array.from(bestByKey.values());
    updated.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((a.mode === 'timed' || b.mode === 'timed') && a.mode === b.mode) {
        return (a.duration || 0) - (b.duration || 0);
      }
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
    await writeRunningQueenLeaderboard(updated);
    return updated;
  }

  app.get('/api/running-queen/leaderboard', async (req, res) => {
    try {
      const entries = await readRunningQueenLeaderboard();
      res.json({ entries });
    } catch (error) {
      console.error('Error fetching Running Queen leaderboard:', error);
      res.status(500).json({ error: 'Failed to load leaderboard' });
    }
  });

  app.post('/api/running-queen/leaderboard', async (req, res) => {
    try {
      const { players, score, duration, status, mode, queenCount, timerDurationMs, timerDuration } = req.body || {};
      if (!Array.isArray(players) || players.length === 0) {
        return res.status(400).json({ error: 'Players list is required' });
      }
      const normalizedPlayers = players.map(player => ({
        name: player.name || 'Unknown',
        studentId: player.studentId || '',
        id: player.id || null
      }));
      const entries = await addRunningQueenLeaderboardEntry({
        players: normalizedPlayers,
        score,
        duration,
        status,
        mode,
        queenCount,
        timerDurationMs: timerDurationMs || timerDuration
      });
      res.json({ success: true, entries });
    } catch (error) {
      console.error('Error updating Running Queen leaderboard:', error);
      res.status(500).json({ error: 'Failed to update leaderboard' });
    }
  });
}

module.exports = { registerRunningQueenRoutes };


