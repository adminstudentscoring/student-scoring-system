#!/usr/bin/env node
/**
 * Extract one chunk from application legacy JS into a new ESM module.
 * Usage: node scripts/refactor/split-esm-legacy.mjs <path/to/legacy.js> [--max 450] [--indent 0|2] [--name toast]
 */
import fs from 'fs';
import path from 'path';
import {
  repoRoot,
  MAX_LINES_DEFAULT,
  packSegments,
  parseImportBlock,
  collectFunctionNames,
  countLines,
  isBoundary
} from './shared.mjs';

function parseArgs(argv) {
  const opts = { max: MAX_LINES_DEFAULT, indent: 0, name: null, chunks: 1 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--max' && argv[i + 1]) opts.max = Number(argv[++i]);
    else if (argv[i] === '--indent' && argv[i + 1]) opts.indent = Number(argv[++i]);
    else if (argv[i] === '--name' && argv[i + 1]) opts.name = argv[++i];
    else if (argv[i] === '--chunks' && argv[i + 1]) opts.chunks = Number(argv[++i]);
    else if (!argv[i].startsWith('--') && !opts.file) opts.file = argv[i];
  }
  return opts;
}

function nextExtractName(dir, base, customName, index) {
  if (customName) return `${customName}.js`;
  const existing = fs.readdirSync(dir).filter((f) => f.startsWith(`${base}-extract-`) && f.endsWith('.js'));
  const n = existing.length + index;
  return `${base}-extract-${n}.js`;
}

function addExportsToChunk(lines) {
  const out = [];
  for (const line of lines) {
    if (/^function\s+\w/.test(line)) {
      out.push(line.replace(/^function\s+/, 'export function '));
    } else if (/^async function\s+\w/.test(line)) {
      out.push(line.replace(/^async function\s+/, 'export async function '));
    } else {
      out.push(line);
    }
  }
  return out;
}

export function splitEsmLegacy(relPath, opts = {}) {
  const max = opts.max ?? MAX_LINES_DEFAULT;
  const indent = opts.indent ?? 0;
  const numChunks = opts.chunks ?? 1;
  const abs = path.join(repoRoot(), relPath);
  if (!fs.existsSync(abs)) throw new Error(`missing: ${relPath}`);

  const raw = fs.readFileSync(abs, 'utf8');
  const lines = raw.split('\n');
  const beforeLines = lines.length;
  const { imports, bodyStart } = parseImportBlock(lines);
  let firstFn = lines.length;
  for (let i = bodyStart; i < lines.length; i++) {
    if (isBoundary(lines[i], indent)) {
      firstFn = i;
      break;
    }
  }
  const head = lines.slice(0, firstFn);
  const body = lines.slice(firstFn);

  const chunks = packSegments(body, max, indent);
  if (chunks.length <= 1 && body.length <= 500) {
    return { skipped: true, reason: 'already under threshold', path: relPath, lines: beforeLines };
  }
  if (chunks.length === 0) {
    return { skipped: true, reason: 'empty body', path: relPath, lines: beforeLines };
  }

  const dir = path.dirname(abs);
  const base = path.basename(relPath, '.js');
  const created = [];
  let remaining = [...body];
  let newImports = [...imports];

  for (let c = 0; c < numChunks && chunks.length > 0; c++) {
    const chunkLines = chunks.shift();
    if (!chunkLines || chunkLines.length === 0) break;

    const partName = nextExtractName(dir, base, c === 0 ? opts.name : null, c);
    const partRel = path.join(path.dirname(relPath), partName).replace(/\\/g, '/');
    const partAbs = path.join(repoRoot(), partRel);

    const exportLines = addExportsToChunk(chunkLines);
    const fnNames = collectFunctionNames(exportLines);
    const partBody = [
      `/** Extracted from ${path.basename(relPath)} — do not edit bundle output directly */`,
      ...exportLines,
      ''
    ].join('\n');
    fs.writeFileSync(partAbs, partBody);

    const importNames = fnNames.filter(Boolean);
    if (importNames.length) {
      newImports.push(`import { ${importNames.join(', ')} } from './${partName}';`);
    } else {
      newImports.push(`import './${partName}';`);
    }

    remaining = remaining.slice(chunkLines.length);
    created.push({ part: partRel, lines: chunkLines.length, exports: importNames });
  }

  const newLegacy = [...newImports, ...head.slice(imports.length), ...remaining].join('\n');
  const normalized = newLegacy.endsWith('\n') ? newLegacy : newLegacy + '\n';
  fs.writeFileSync(abs, normalized);

  const afterLines = countLines(abs);
  return {
    path: relPath,
    parts: created,
    legacyLinesBefore: beforeLines,
    legacyLinesAfter: afterLines,
    skipped: false
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.file) {
    console.error('Usage: node scripts/refactor/split-esm-legacy.mjs <legacy.js> [--max 450] [--indent 2] [--name mod]');
    process.exit(1);
  }
  const result = splitEsmLegacy(opts.file, opts);
  console.log(JSON.stringify(result, null, 2));
  if (result.skipped) process.exit(0);
  for (const p of result.parts) {
    if (p.lines > 500) {
      console.warn(`WARN: extracted part still over 500 lines: ${p.part} (${p.lines})`);
    }
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  main();
}
