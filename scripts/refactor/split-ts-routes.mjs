#!/usr/bin/env node
/**
 * Split a large TypeScript routes file by // comment section markers.
 * Usage: node scripts/refactor/split-ts-routes.mjs <routes.ts> --sections "tree,categories,topics"
 *
 * Each section marker is matched as: // <name>  or // ===== <name>
 * Produces <base><Section>Routes.ts files and thins the original to a wrapper.
 */
import fs from 'fs';
import path from 'path';
import { repoRoot, countLines } from './shared.mjs';

function parseArgs(argv) {
  const opts = { file: null, sections: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sections' && argv[i + 1]) {
      opts.sections = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    } else if (!argv[i].startsWith('--') && !opts.file) {
      opts.file = argv[i];
    }
  }
  return opts;
}

function findSectionStarts(lines, sectionNames) {
  const starts = new Map();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const name of sectionNames) {
      if (starts.has(name)) continue;
      const re = new RegExp(`^\\s*//\\s*(?:={3,}\\s*)?${name}\\b`, 'i');
      if (re.test(line)) starts.set(name, i);
    }
  }
  return starts;
}

function toRegisterName(baseName, section) {
  const cap = section.charAt(0).toUpperCase() + section.slice(1);
  const stem = baseName.replace(/Routes$/, '');
  return `register${stem}${cap}Routes`;
}

function toFileName(baseName, section) {
  const cap = section.charAt(0).toUpperCase() + section.slice(1);
  const stem = baseName.replace(/\.ts$/, '').replace(/Routes$/, '');
  return `${stem}${cap}Routes.ts`;
}

export function splitTsRoutes(relPath, sectionNames) {
  const abs = path.join(repoRoot(), relPath);
  if (!fs.existsSync(abs)) throw new Error(`missing: ${relPath}`);
  const raw = fs.readFileSync(abs, 'utf8');
  const lines = raw.split('\n');
  const dir = path.dirname(abs);
  const baseName = path.basename(relPath);

  const fnMatch = raw.match(/function\s+(register\w+)\s*\(/);
  const origRegister = fnMatch ? fnMatch[1] : 'registerRoutes';

  const openBrace = lines.findIndex((l) => l.includes('function ' + origRegister.replace('register', 'register')) || l.match(new RegExp(`function\\s+${origRegister}`)));
  const headerEnd = openBrace >= 0 ? openBrace : 0;

  const starts = findSectionStarts(lines, sectionNames);
  const ordered = sectionNames.filter((n) => starts.has(n));
  if (ordered.length === 0) {
    throw new Error(`No section markers found in ${relPath} for: ${sectionNames.join(', ')}`);
  }

  const created = [];
  const registerFns = [];

  for (let i = 0; i < ordered.length; i++) {
    const name = ordered[i];
    const start = starts.get(name);
    const end = i + 1 < ordered.length ? starts.get(ordered[i + 1]) : lines.length - 1;
    const sectionLines = lines.slice(start, end);
    const registerFn = toRegisterName(origRegister.replace(/^register/, ''), name);
    const fileName = toFileName(baseName, name);
    const outPath = path.join(dir, fileName);

    const body = [
      lines.slice(0, 3).join('\n').includes('"use strict"') ? '"use strict";\n' : '',
      `\nfunction ${registerFn}(app: any, deps: any, shared?: any): void {`,
      '  const sharedDeps = shared || deps;',
      '  const {',
      '    pool, requireDbReady, resolveOrgId, listOrgStudents, toCleanString, toIdString, nowIso,',
      '    authenticateUser, authorizeRole, requireOrganizationAccess, resolveOrgIdFromUser,',
      '    toRangeInt, parseUci, normalizeScore, parseFenSideToMove, getTfSettings, requirePublicStudent,',
      '    normalizeBucket, hasDb',
      '  } = sharedDeps;',
      '  const Chess = deps?.Chess;',
      '  const sfAnalyzeFen = deps?.sfAnalyzeFen;',
      '',
      ...sectionLines.map((l) => l),
      '}\n',
      `module.exports = { ${registerFn} };\n`
    ].join('\n');

    fs.writeFileSync(outPath, body);
    created.push({ file: path.relative(repoRoot(), outPath).replace(/\\/g, '/'), lines: countLines(outPath), registerFn });
    registerFns.push({ registerFn, file: fileName.replace(/\.ts$/, '') });
  }

  const requireLines = registerFns.map(({ registerFn, file }) => {
    return `const { ${registerFn} } = require('./${file}');`;
  });
  const callLines = registerFns.map(({ registerFn }) => `  ${registerFn}(app, deps, shared);`);

  const wrapper = [
    lines.slice(0, headerEnd).join('\n').split('\n')[0] || '// split wrapper',
    '"use strict";',
    '',
    ...requireLines,
    '',
    `function ${origRegister}(app: any, deps: any, shared?: any): void {`,
    ...callLines,
    '}',
    '',
    `module.exports = { ${origRegister} };`,
    ''
  ].join('\n');

  fs.writeFileSync(abs, wrapper);

  return {
    path: relPath,
    wrapperLines: countLines(abs),
    sections: created
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.file || !opts.sections.length) {
    console.error('Usage: node scripts/refactor/split-ts-routes.mjs <file.ts> --sections "a,b,c"');
    process.exit(1);
  }
  try {
    const result = splitTsRoutes(opts.file, opts.sections);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
