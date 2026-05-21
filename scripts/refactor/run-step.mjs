#!/usr/bin/env node
/**
 * Orchestrate one refactor step: audit → split → build → verify.
 * Usage:
 *   node scripts/refactor/run-step.mjs --target <path>
 *   node scripts/refactor/run-step.mjs --all [--max-steps 5] [--no-commit]
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { auditFiles, repoRoot, buildScriptsForPath, appFromLegacyPath } from './shared.mjs';
import { splitEsmLegacy } from './split-esm-legacy.mjs';

function parseArgs(argv) {
  const opts = { target: null, all: false, maxSteps: 1, noCommit: false, max: 450, indent: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target' && argv[i + 1]) opts.target = argv[++i];
    else if (argv[i] === '--all') opts.all = true;
    else if (argv[i] === '--max-steps' && argv[i + 1]) opts.maxSteps = Number(argv[++i]);
    else if (argv[i] === '--no-commit') opts.noCommit = true;
    else if (argv[i] === '--max' && argv[i + 1]) opts.max = Number(argv[++i]);
    else if (argv[i] === '--indent' && argv[i + 1]) opts.indent = Number(argv[++i]);
  }
  return opts;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: repoRoot(), stdio: 'inherit', shell: false, ...opts });
  return r.status ?? 1;
}

function runPnpm(script) {
  return run('pnpm', [script]);
}

function updateTracker(entry) {
  const tracker = path.join(repoRoot(), 'docs/refactor-500-line-tracker.md');
  if (!fs.existsSync(tracker)) return;
  const stepMatch = fs.readFileSync(tracker, 'utf8').match(/\|\s*(\d+)\s+\w+/g);
  let nextStep = 30;
  if (stepMatch) {
    const nums = stepMatch.map((s) => Number(s.replace(/\D/g, ''))).filter(Boolean);
    nextStep = Math.max(...nums, 29) + 1;
  }
  const row = `| ${nextStep} ${entry.label} | done | \`${entry.original}\` (${entry.before}) | ${entry.newModules} | \`${entry.smoke}\` |\n`;
  const marker = '## Workflow per step';
  let content = fs.readFileSync(tracker, 'utf8');
  if (!content.includes(marker)) return;
  content = content.replace(marker, row + '\n' + marker);
  fs.writeFileSync(tracker, content);
}

function processTarget(target, opts) {
  console.log('\n=== refactor:step', target, '===\n');
  const abs = path.join(repoRoot(), target);
  if (!fs.existsSync(abs)) {
    console.error('Target not found:', target);
    return false;
  }

  const before = fs.readFileSync(abs, 'utf8').split('\n').length;
  let splitResult = null;

  if (target.includes('-legacy.js') || target.includes('app-legacy.js')) {
    const indent = target.includes('tactics-fighter') ? 2 : opts.indent;
    splitResult = splitEsmLegacy(target, { max: opts.max, indent, chunks: 1 });
    if (splitResult.skipped) {
      console.log('Split skipped:', splitResult.reason);
      return true;
    }
    const builds = buildScriptsForPath(target);
    for (const b of builds) {
      if (runPnpm(b) !== 0) return false;
    }
  } else if (target.includes('Routes.ts')) {
    console.log('Route split: use manual section split for', target);
    return false;
  } else {
    console.log('No automated split for', target);
    return false;
  }

  if (runPnpm('typecheck') !== 0) return false;
  if (runPnpm('test:refactor-smoke') !== 0) return false;

  const after = fs.readFileSync(abs, 'utf8').split('\n').length;
  updateTracker({
    label: path.basename(target, path.extname(target)),
    original: target,
    before,
    newModules: splitResult?.parts?.map((p) => p.part).join(', ') || '—',
    smoke: 'pnpm test:refactor-smoke'
  });

  if (!opts.noCommit) {
    run('git', ['add', '-A']);
    const msg = `refactor: extract modules from ${target} (${before}→${after} lines)`;
    if (run('git', ['commit', '-m', msg]) !== 0) {
      console.warn('git commit skipped or failed');
    }
  }

  console.log(JSON.stringify({ target, before, after, splitResult }, null, 2));
  return true;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const audit = auditFiles();

  if (opts.target) {
    const ok = processTarget(opts.target, opts);
    process.exit(ok ? 0 : 1);
  }

  if (opts.all) {
    let done = 0;
    for (const item of audit) {
      if (item.suggestedTool !== 'split-esm-legacy') continue;
      if (done >= opts.maxSteps) break;
      const ok = processTarget(item.path, opts);
      if (ok) done++;
      else break;
    }
    process.exit(done > 0 ? 0 : 1);
  }

  console.error('Usage: run-step.mjs --target <path> | --all [--max-steps N]');
  process.exit(1);
}

main();
