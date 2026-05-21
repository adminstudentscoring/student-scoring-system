#!/usr/bin/env node
/**
 * Split a legacy JS file into concat-able parts (<500 lines each).
 * Parts share scope when concatenated — no ESM exports between parts.
 *
 * Usage: node scripts/refactor/split-legacy-parts.mjs <legacy.js> [--max 450]
 */
import fs from 'fs';
import path from 'path';
import {
  repoRoot,
  MAX_LINES_DEFAULT,
  packSegments,
  parseImportBlock,
  isBoundary,
  countLines,
  forceLineChunks
} from './shared.mjs';

function parseArgs(argv) {
  const opts = { file: null, max: MAX_LINES_DEFAULT, indent: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--max' && argv[i + 1]) opts.max = Number(argv[++i]);
    else if (argv[i] === '--indent' && argv[i + 1]) opts.indent = Number(argv[++i]);
    else if (!argv[i].startsWith('--') && !opts.file) opts.file = argv[i];
  }
  return opts;
}

export function splitLegacyParts(relPath, opts = {}) {
  const max = opts.max ?? MAX_LINES_DEFAULT;
  const indent = opts.indent ?? 0;
  const abs = path.join(repoRoot(), relPath);
  const raw = fs.readFileSync(abs, 'utf8');
  const lines = raw.split('\n');
  const before = lines.length;

  const { bodyStart } = parseImportBlock(lines);
  let firstFn = lines.length;
  for (let i = bodyStart; i < lines.length; i++) {
    if (isBoundary(lines[i], indent)) {
      firstFn = i;
      break;
    }
  }

  const imports = lines.slice(0, bodyStart);
  let head = lines.slice(bodyStart, firstFn);
  let body = lines.slice(firstFn);

  let chunks;
  if (body.length === 0 && head.length > max) {
    chunks = forceLineChunks(head, max);
    head = [];
  } else {
    chunks = packSegments(body, max, indent);
    if (chunks.length === 1 && chunks[0].length > 500) {
      chunks = forceLineChunks(body, max);
    }
  }

  if (chunks.length <= 1 && head.length + body.length <= 500 && before <= 500) {
    return { skipped: true, path: relPath, lines: before };
  }

  const dir = path.dirname(abs);
  const base = path.basename(relPath, '.js');
  const partsDir = path.join(dir, `${base}-parts`);
  fs.rmSync(partsDir, { recursive: true, force: true });
  fs.mkdirSync(partsDir, { recursive: true });

  const partFiles = [];
  if (imports.length || head.length) {
    const headName = `${base}-head.js`;
    fs.writeFileSync(path.join(partsDir, headName), [...imports, ...head].join('\n') + '\n');
    partFiles.push(headName);
  }

  chunks.forEach((chunk, idx) => {
    const name = `${String(idx + 1).padStart(2, '0')}.js`;
    fs.writeFileSync(path.join(partsDir, name), chunk.join('\n') + '\n');
    partFiles.push(name);
  });

  return {
    path: relPath,
    partsDir: path.relative(repoRoot(), partsDir).replace(/\\/g, '/'),
    partFiles,
    linesBefore: before,
    partCount: partFiles.length
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.file) {
    console.error('Usage: node scripts/refactor/split-legacy-parts.mjs <legacy.js>');
    process.exit(1);
  }
  const r = splitLegacyParts(opts.file, opts);
  console.log(JSON.stringify(r, null, 2));
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) main();
