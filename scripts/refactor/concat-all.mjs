#!/usr/bin/env node
/** Concat all application *-legacy.js files that have a *-parts/ directory. */
import fs from 'fs';
import path from 'path';
import { repoRoot } from './shared.mjs';
import { concatLegacyParts } from './concat-legacy.mjs';

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name.endsWith('-parts')) continue;
      walk(full, acc);
    } else if (ent.name.endsWith('-legacy.js')) {
      acc.push(path.relative(repoRoot(), full).replace(/\\/g, '/'));
    }
  }
  return acc;
}

const root = path.join(repoRoot(), 'application');
const legacies = walk(root);
const results = [];
for (const rel of legacies) {
  const r = concatLegacyParts(rel);
  if (!r.skipped) results.push(r);
}
console.log(JSON.stringify(results, null, 2));
