// Purge legacy/failed Royal Exchange leaderboard entries.
// Keeps ONLY entries with success === true, then writes back to the leaderboard file.
//
// Usage:
//   node scripts/purge-royal-exchange-leaderboard.js
//
// Note:
//   Older entries created before we introduced `success` cannot be reliably classified.
//   This script intentionally removes them to ensure failed/legacy records are fully purged.

require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');

async function main() {
  const DATA_DIR = process.env.DATA_DIR || 'data';
  const leaderboardFile = path.join(
    __dirname,
    '..',
    process.env.ROYAL_EXCHANGE_LEADERBOARD_FILE || path.join(DATA_DIR, 'royal-exchange-leaderboard.txt')
  );

  let raw = '[]';
  try {
    raw = await fs.readFile(leaderboardFile, 'utf8');
  } catch (error) {
    console.error(`[purge] Failed to read leaderboard file: ${leaderboardFile}`);
    console.error(error);
    process.exitCode = 1;
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw || '[]');
  } catch (error) {
    console.error('[purge] Leaderboard file is not valid JSON. Aborting.');
    console.error(error);
    process.exitCode = 1;
    return;
  }

  const entries = Array.isArray(parsed) ? parsed : [];
  const before = entries.length;
  const kept = entries.filter(entry => entry && entry.success === true);
  const after = kept.length;

  try {
    await fs.writeFile(leaderboardFile, JSON.stringify(kept, null, 2), 'utf8');
  } catch (error) {
    console.error('[purge] Failed to write leaderboard file.');
    console.error(error);
    process.exitCode = 1;
    return;
  }

  console.log(`[purge] Done. Kept ${after}/${before} Royal Exchange leaderboard entries.`);
  console.log(`[purge] File: ${leaderboardFile}`);
}

main();


