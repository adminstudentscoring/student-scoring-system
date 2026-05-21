#!/usr/bin/env node
/**
 * Split all application *-legacy.js files over 500 lines into concat-able parts.
 */
import { auditFiles } from './shared.mjs';
import { splitLegacyParts } from './split-legacy-parts.mjs';
import { concatLegacyParts } from './concat-legacy.mjs';

const legacyFiles = auditFiles().filter((f) => f.suggestedTool === 'split-esm-legacy' || f.path.includes('-legacy.js'));

for (const item of legacyFiles) {
  const indent = item.path.includes('tactics-fighter') && item.path.includes('app-legacy') ? 2 : 0;
  console.log('Splitting', item.path, item.lines);
  const r = splitLegacyParts(item.path, { max: 450, indent });
  if (!r.skipped) {
    const c = concatLegacyParts(item.path);
    console.log('  ->', r.partCount, 'parts, combined', c.lines, 'lines');
  }
}

console.log('Done. Run pnpm build:applications && pnpm refactor:verify');
