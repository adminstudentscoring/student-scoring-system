#!/usr/bin/env node
/**
 * List source files over 500 lines (excluding esbuild bundles).
 * Usage: node scripts/refactor/audit.mjs [--json]
 */
import fs from 'fs';
import path from 'path';
import { auditFiles, repoRoot, THRESHOLD } from './shared.mjs';

const jsonOut = process.argv.includes('--json');
const results = auditFiles();

const manifest = {
  generatedAt: new Date().toISOString(),
  threshold: THRESHOLD,
  count: results.length,
  apps: [...new Set(results.filter((r) => r.category === 'application-src').map((r) => r.path.split('/')[1]))],
  files: results
};

const manifestPath = path.join(repoRoot(), 'scripts/refactor/app-manifest.json');
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

if (jsonOut) {
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(0);
}

console.log(`Files over ${THRESHOLD} lines: ${results.length}\n`);
console.log('lines\tcategory\t\ttool\t\tpath');
console.log('-----\t--------\t\t----\t\t----');
for (const r of results) {
  console.log(`${r.lines}\t${r.category.padEnd(16)}\t${r.suggestedTool.padEnd(16)}\t${r.path}`);
}
console.log(`\nWrote ${manifestPath}`);
