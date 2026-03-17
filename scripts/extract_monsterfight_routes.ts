/* eslint-disable no-console */
// One-off helper to extract Monster Fight + related game routes from server.js into a dedicated module.
//
// Usage:
// - Generate module only:
//   node scripts/extract_monsterfight_routes.js
// - Generate module + rewrite server.js to require/register it (one-step split):
//   node scripts/extract_monsterfight_routes.js --apply
//
// Safe to keep in repo; re-running will overwrite the target file.

const fs = require('fs');
const path = require('path');

interface Removal {
  start: number;
  end: number;
  replacement?: string[];
}

interface Range {
  start: number;
  end: number;
}

function sliceLines(lines: string[], startLine: number, endLineInclusive: number): string {
  return lines.slice(startLine - 1, endLineInclusive).join('\n');
}

function applyRewriteServerJs(lines: string[]): string[] {
  const removals: Removal[] = [
    { start: 6976, end: 7173, replacement: [
      '// (moved to server/routes/monsterFightGameRoutes.js)'
    ] },
    { start: 6849, end: 6921, replacement: [
      '// (moved to server/routes/monsterFightGameRoutes.js)'
    ] },
    { start: 4262, end: 6823, replacement: [
      '// ==================== Monster Fight / Game APIs (moved) ====================',
      "const { registerMonsterFightGameRoutes } = require('./server/routes/monsterFightGameRoutes');",
      'registerMonsterFightGameRoutes(app, {',
      '  fs,',
      '  path,',
      '  authenticateUser,',
      '  authorizeRole,',
      '  requireOrganizationAccess,',
      '  readData,',
      '  writeData,',
      '  broadcast,',
      '  filterStudentsByOrganization,',
      '  resolveOrgIdFromUser,',
      '  GAME_SAVES_DIR,',
      '  RUNNING_QUEEN_LEADERBOARD_FILE,',
      '  ROYAL_EXCHANGE_LEADERBOARD_FILE,',
      '  HOPE_MATE_LEADERBOARD_FILE,',
      '  HOPE_MATE_CHALLENGE_LEADERBOARD_FILE,',
      '  HOPE_MATE_STAGE_PUZZLES_FILE',
      '});'
    ] },
    { start: 1767, end: 2265, replacement: [
      '// (moved to server/routes/monsterFightGameRoutes.js)'
    ] },
    { start: 1282, end: 1575, replacement: [
      '// (moved to server/routes/monsterFightGameRoutes.js)'
    ] }
  ];

  const out = lines.slice();
  for (const r of removals) {
    out.splice(r.start - 1, r.end - r.start + 1, ...(r.replacement || []));
  }
  return out;
}

function main(): void {
  const srcPath = path.join(process.cwd(), 'server.js');
  const src: string = fs.readFileSync(srcPath, 'utf8');
  const lines: string[] = src.split(/\r?\n/);

  const ranges: Range[] = [
    { start: 1282, end: 1575 },
    { start: 1767, end: 2265 },
    { start: 4262, end: 6823 },
    { start: 6849, end: 6921 },
    { start: 6976, end: 7173 }
  ];

  const out: string[] = [];
  out.push('// Extracted from server.js to reduce file size and isolate game APIs.');
  out.push('"use strict";');
  out.push('');
  out.push('function registerMonsterFightGameRoutes(app, deps) {');
  out.push('  const fs = deps && deps.fs;');
  out.push('  const path = deps && deps.path;');
  out.push('  const authenticateUser = deps && deps.authenticateUser;');
  out.push('  const authorizeRole = deps && deps.authorizeRole;');
  out.push('  const requireOrganizationAccess = deps && deps.requireOrganizationAccess;');
  out.push('  const readData = deps && deps.readData;');
  out.push('  const writeData = deps && deps.writeData;');
  out.push('  const broadcast = deps && deps.broadcast;');
  out.push('  const filterStudentsByOrganization = deps && deps.filterStudentsByOrganization;');
  out.push('  const resolveOrgIdFromUser = deps && deps.resolveOrgIdFromUser;');
  out.push('  const GAME_SAVES_DIR = deps && deps.GAME_SAVES_DIR;');
  out.push('  const RUNNING_QUEEN_LEADERBOARD_FILE = deps && deps.RUNNING_QUEEN_LEADERBOARD_FILE;');
  out.push('  const ROYAL_EXCHANGE_LEADERBOARD_FILE = deps && deps.ROYAL_EXCHANGE_LEADERBOARD_FILE;');
  out.push('  const HOPE_MATE_LEADERBOARD_FILE = deps && deps.HOPE_MATE_LEADERBOARD_FILE;');
  out.push('  const HOPE_MATE_CHALLENGE_LEADERBOARD_FILE = deps && deps.HOPE_MATE_CHALLENGE_LEADERBOARD_FILE;');
  out.push('  const HOPE_MATE_STAGE_PUZZLES_FILE = deps && deps.HOPE_MATE_STAGE_PUZZLES_FILE;');
  out.push('');
  out.push('  if (!app) throw new Error("registerMonsterFightGameRoutes: missing app");');
  out.push('  if (!fs) throw new Error("registerMonsterFightGameRoutes: missing deps.fs");');
  out.push('  if (!path) throw new Error("registerMonsterFightGameRoutes: missing deps.path");');
  out.push('  if (typeof readData !== "function") throw new Error("registerMonsterFightGameRoutes: missing deps.readData");');
  out.push('  if (typeof writeData !== "function") throw new Error("registerMonsterFightGameRoutes: missing deps.writeData");');
  out.push('  if (typeof broadcast !== "function") throw new Error("registerMonsterFightGameRoutes: missing deps.broadcast");');
  out.push('  if (!GAME_SAVES_DIR) throw new Error("registerMonsterFightGameRoutes: missing deps.GAME_SAVES_DIR");');
  out.push('');

  for (const r of ranges) {
    out.push(sliceLines(lines, r.start, r.end));
    out.push('');
  }

  out.push('}');
  out.push('');
  out.push('module.exports = { registerMonsterFightGameRoutes };');
  out.push('');

  const target = path.join(process.cwd(), 'server', 'routes', 'monsterFightGameRoutes.js');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, out.join('\n'), 'utf8');
  console.log('[extract_monsterfight_routes] wrote', target);

  const shouldApply = process.argv.includes('--apply');
  if (shouldApply) {
    const nextLines = applyRewriteServerJs(lines);
    fs.writeFileSync(srcPath, nextLines.join('\n'), 'utf8');
    console.log('[extract_monsterfight_routes] rewrote', srcPath);
  }
}

main();

