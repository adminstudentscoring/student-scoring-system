#!/usr/bin/env node
/**
 * Split public/*.js monoliths at function boundaries (max ~450 lines per part).
 * Usage: node scripts/split-public-js.mjs [file.js ...]
 */
import fs from 'fs';
import path from 'path';

const MAX_LINES = 450;

const DEFAULT_FILES = [
  'public/course-management-courses.js',
  'public/course-management-packages.js',
  'public/course-management-accounting.js',
  'public/course-management-sales-core.js',
  'public/course-management-sales-orders-student.js',
  'public/teacher-students.js',
  'public/teacher-games.js',
  'public/teacher-core.js',
  'public/teacher-classview.js',
  'public/admin-subscription-setting.js',
  'public/admin-organization-tools.js',
  'public/admin-organization-settings.js',
  'public/class-view.js',
  'public/student.js'
];

function isBoundary(line) {
  if (!line) return false;
  return (
    /^function\s+\w/.test(line) ||
    /^async\s+function\s+\w/.test(line) ||
    /^window\.\w+\s*=\s*(async\s+)?function/.test(line) ||
    /^window\.\w+\s*=\s*async\s+function/.test(line) ||
    /^const\s+\w+\s*=\s*(async\s+)?function/.test(line) ||
    /^let\s+\w+\s*=\s*(async\s+)?function/.test(line) ||
    /^class\s+\w/.test(line) ||
    /^\/\/\s*={5,}/.test(line)
  );
}

function segmentBoundaries(lines) {
  const bounds = [0];
  for (let i = 1; i < lines.length; i++) {
    if (isBoundary(lines[i])) bounds.push(i);
  }
  bounds.push(lines.length);
  const segments = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    segments.push({ start: bounds[i], end: bounds[i + 1] });
  }
  return segments;
}

function forceLineChunks(lines, maxLines) {
  const chunks = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    chunks.push(lines.slice(i, i + maxLines));
  }
  return chunks;
}

function packSegments(lines, maxLines) {
  const segments = segmentBoundaries(lines);
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

function splitClassicFile(relPath) {
  const abs = path.join(process.cwd(), relPath);
  if (!fs.existsSync(abs)) {
    console.error('missing:', relPath);
    return null;
  }
  const raw = fs.readFileSync(abs, 'utf8');
  if (raw.startsWith('// Deprecated monolith')) {
    console.log('skip stub:', relPath);
    return null;
  }
  const lines = raw.split('\n');
  if (lines.length <= 500) {
    console.log('skip under 500:', relPath, lines.length);
    return null;
  }

  const dir = path.dirname(relPath);
  const base = path.basename(relPath, '.js');
  const chunks = packSegments(lines, MAX_LINES);

  const partNames = [];
  chunks.forEach((chunkLines, idx) => {
    const partName = `${base}-${idx + 1}.js`;
    const partPath = path.join(dir, partName);
    const body = chunkLines.join('\n');
    fs.writeFileSync(path.join(process.cwd(), partPath), body.endsWith('\n') ? body : body + '\n');
    partNames.push(partName);
    const wc = chunkLines.length;
    if (wc > 500) console.warn('WARN part over 500:', partPath, wc);
  });

  const stub = `// Deprecated monolith — split into ${partNames.join(', ')}\n`;
  fs.writeFileSync(abs, stub);

  console.log(relPath, '->', partNames.map((n) => `${n} (${fs.readFileSync(path.join(process.cwd(), dir, n), 'utf8').split('\n').length - 1} lines)`).join(', '));
  return { base, dir, partNames, lineCount: lines.length };
}

const files = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_FILES;
const results = [];
for (const f of files) {
  const r = splitClassicFile(f);
  if (r) results.push(r);
}
console.log('\nJSON:', JSON.stringify(results, null, 2));
