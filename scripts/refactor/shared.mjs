/**
 * Shared utilities for refactor automation scripts.
 */
import fs from 'fs';
import path from 'path';

export const MAX_LINES_DEFAULT = 450;
export const THRESHOLD = 500;

export const SCAN_ROOTS = ['packages', 'server', 'public', 'scripts', 'application'];

export const BUILD_BY_APP = {
  'monster-fight': ['build:monster-fight'],
  'monster-fight-shell': ['build:monster-fight-shell'],
  'tactics-fighter': ['build:tactics-fighter', 'build:tactics-fighter-core'],
  blunders: ['build:blunders', 'build:blunders-core', 'build:blunders-teacher', 'build:blunders-student'],
  'chess-light': ['build:chess-light'],
  'chess-solitaire': ['build:chess-solitaire'],
  'chess-works': ['build:chess-works'],
  'hope-mate': ['build:hope-mate'],
  'maze-runner': ['build:maze-runner'],
  'royal-exchange': ['build:royal-exchange'],
  'running-queen': ['build:running-queen'],
  truceboard: ['build:truceboard'],
  'vchess-platform': ['build:vchess-platform', 'build:vchess-normal-chess'],
  'my-own-app': ['build:eatwhat']
};

export function repoRoot() {
  return process.cwd();
}

export function countLines(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

export function isBoundary(line, indent = 0) {
  if (!line) return false;
  const pad = indent > 0 ? `[ \\t]{${indent}}` : '';
  const re = new RegExp(`^${pad}(function\\s+\\w|async\\s+function\\s+\\w|window\\.\\w+\\s*=\\s*(async\\s+)?function|const\\s+\\w+\\s*=\\s*(async\\s+)?function|let\\s+\\w+\\s*=\\s*(async\\s+)?function|class\\s+\\w|//\\s*={5,})`);
  if (re.test(line)) return true;
  if (indent === 0) {
    return (
      /^function\s+\w/.test(line) ||
      /^async\s+function\s+\w/.test(line) ||
      /^window\.\w+\s*=\s*(async\s+)?function/.test(line) ||
      /^const\s+\w+\s*=\s*(async\s+)?function/.test(line) ||
      /^class\s+\w/.test(line) ||
      /^\/\/\s*={5,}/.test(line)
    );
  }
  return false;
}

export function segmentBoundaries(lines, indent = 0) {
  const bounds = [0];
  for (let i = 1; i < lines.length; i++) {
    if (isBoundary(lines[i], indent)) bounds.push(i);
  }
  bounds.push(lines.length);
  const segments = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    segments.push({ start: bounds[i], end: bounds[i + 1] });
  }
  return segments;
}

export function forceLineChunks(lines, maxLines) {
  const chunks = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    chunks.push(lines.slice(i, i + maxLines));
  }
  return chunks;
}

export function packSegments(lines, maxLines, indent = 0) {
  const segments = segmentBoundaries(lines, indent);
  const chunks = [];
  let current = [];

  const flush = () => {
    if (current.length) {
      chunks.push(current);
      current = [];
    }
  };

  for (const seg of segments) {
    const segLines = lines.slice(seg.start, seg.end);
    if (segLines.length > maxLines) {
      flush();
      for (const forced of forceLineChunks(segLines, maxLines)) {
        chunks.push(forced);
      }
      continue;
    }
    if (current.length + segLines.length > maxLines && current.length > 0) {
      flush();
    }
    current.push(...segLines);
  }
  flush();
  return chunks;
}

export function parseImportBlock(lines) {
  let end = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('import ') || t.startsWith('//') || t === '') {
      end = i + 1;
      continue;
    }
    break;
  }
  return { imports: lines.slice(0, end), bodyStart: end };
}

export function collectFunctionNames(lines) {
  const names = [];
  for (const line of lines) {
    let m = line.match(/^(?:async\s+)?function\s+(\w+)/);
    if (m) {
      names.push(m[1]);
      continue;
    }
    m = line.match(/^const\s+(\w+)\s*=\s*(?:async\s+)?function/);
    if (m) names.push(m[1]);
  }
  return names;
}

export function shouldSkipPath(relPath) {
  if (relPath.includes('node_modules')) return true;
  if (relPath.startsWith('data/')) return true;
  if (relPath.endsWith('.d.ts')) return true;
  // esbuild bundle outputs at application/<app>/<name>.js (not under src/)
  if (/^application\/[^/]+\/[^/]+\.js$/.test(relPath) && !relPath.includes('/src/')) return true;
  if (/^application\/monster-fight-shell\.js$/.test(relPath)) return true;
  // generated legacy monolith when parts/ exists
  if (/-legacy\.js$/.test(relPath)) {
    const base = path.basename(relPath, '.js');
    const partsDir = path.join(repoRoot(), path.dirname(relPath), `${base}-parts`);
    if (fs.existsSync(partsDir)) return true;
  }
  // public stubs
  if (relPath.startsWith('public/') && fs.existsSync(path.join(repoRoot(), relPath))) {
    const head = fs.readFileSync(path.join(repoRoot(), relPath), 'utf8').slice(0, 40);
    if (head.startsWith('// Deprecated monolith')) return true;
  }
  return false;
}

export function categorize(relPath) {
  if (relPath.startsWith('application/') && relPath.includes('/src/')) return 'application-src';
  if (relPath.startsWith('packages/')) return 'packages';
  if (relPath.startsWith('server/') || relPath === 'server.ts') return 'server';
  if (relPath.startsWith('public/')) return 'public';
  if (relPath.startsWith('scripts/')) return 'scripts';
  return 'other';
}

export function suggestedTool(relPath, category) {
  if (category === 'application-src' && relPath.includes('-legacy.js')) return 'split-esm-legacy';
  if (category === 'packages' && relPath.includes('Routes.ts')) return 'split-ts-routes';
  if (category === 'public') return 'split-public-js';
  return 'manual';
}

export function smokeForPath(relPath) {
  if (relPath.includes('chessWorks')) return 'test:chess-works';
  if (relPath.includes('tacticsFighter') || relPath.includes('tactics-fighter')) return 'test:tactics-fighter-tree';
  if (relPath.includes('blunders')) return 'test:blunders';
  if (relPath.includes('monster-fight')) return 'test:monster-fight';
  if (relPath.startsWith('application/')) return 'test:application-static';
  if (relPath.startsWith('public/')) return 'test:static-scripts';
  if (relPath.includes('vchess-invoice-parse')) return 'invoice-parse-smoke';
  return 'refactor:verify';
}

export function walkFiles(rootDir, acc = []) {
  if (!fs.existsSync(rootDir)) return acc;
  for (const ent of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const full = path.join(rootDir, ent.name);
    const rel = path.relative(repoRoot(), full).replace(/\\/g, '/');
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      walkFiles(full, acc);
    } else if (/\.(js|ts)$/.test(ent.name)) {
      acc.push(rel);
    }
  }
  return acc;
}

export function auditFiles() {
  const all = [];
  for (const root of SCAN_ROOTS) {
    walkFiles(path.join(repoRoot(), root), all);
  }
  if (fs.existsSync(path.join(repoRoot(), 'server.ts'))) all.push('server.ts');

  const results = [];
  for (const rel of all) {
    if (shouldSkipPath(rel)) continue;
    const abs = path.join(repoRoot(), rel);
    const lines = countLines(abs);
    if (lines <= THRESHOLD) continue;
    const category = categorize(rel);
    results.push({
      path: rel,
      lines,
      category,
      suggestedTool: suggestedTool(rel, category),
      smokeCommand: smokeForPath(rel)
    });
  }
  results.sort((a, b) => b.lines - a.lines);
  return results;
}

export function appFromLegacyPath(relPath) {
  const m = relPath.match(/^application\/([^/]+)\//);
  return m ? m[1] : null;
}

export function buildScriptsForPath(relPath) {
  const app = appFromLegacyPath(relPath);
  if (!app) return ['build:applications'];
  return BUILD_BY_APP[app] || [`build:${app}`];
}
