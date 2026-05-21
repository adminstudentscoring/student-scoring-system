#!/usr/bin/env node
/**
 * Concatenate legacy part files into game-legacy.js for esbuild.
 * When <base>-parts/ exists, writes combined output to <base>.js (in-place).
 */
import fs from 'fs';
import path from 'path';
import { repoRoot, countLines } from './shared.mjs';

export function concatLegacyParts(relPath, options = {}) {
  const abs = path.join(repoRoot(), relPath);
  const dir = path.dirname(abs);
  const base = path.basename(relPath, '.js');
  const partsDir = path.join(dir, `${base}-parts`);

  if (!fs.existsSync(partsDir)) {
    return { skipped: true, reason: 'no parts dir', path: relPath };
  }

  const files = fs
    .readdirSync(partsDir)
    .filter((f) => f.endsWith('.js'))
    .sort((a, b) => {
      if (a.endsWith('-head.js')) return -1;
      if (b.endsWith('-head.js')) return 1;
      return a.localeCompare(b);
    });

  if (!files.length) {
    return { skipped: true, reason: 'empty parts dir', path: relPath };
  }

  const combined = files.map((f) => fs.readFileSync(path.join(partsDir, f), 'utf8')).join('\n');
  const banner = `/** Generated from ${base}-parts/ — run pnpm refactor:concat or build:* */\n`;
  const outPath = options.outPath ? path.join(repoRoot(), options.outPath) : abs;
  fs.writeFileSync(outPath, banner + combined);

  return {
    path: relPath,
    outPath: path.relative(repoRoot(), outPath).replace(/\\/g, '/'),
    parts: files.length,
    lines: countLines(outPath)
  };
}

function main() {
  const rel = process.argv[2];
  if (!rel) {
    console.error('Usage: node scripts/refactor/concat-legacy.mjs <path/to/legacy.js>');
    process.exit(1);
  }
  console.log(JSON.stringify(concatLegacyParts(rel), null, 2));
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) main();
