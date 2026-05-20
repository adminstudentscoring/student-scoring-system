#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = path.join(process.cwd(), 'public/chess-analysis');
const src = fs.readFileSync(path.join(ROOT, 'chess-analysis-app.js'), 'utf8');
const lines = src.split('\n');

const sharedEnd = 40; // through state block
const part1Start = 41; // toast
const part2Start = 325; // buildPgnExport
const part3Start = 456; // wireEvents

function addExports(chunk, fnNames) {
  let out = chunk;
  for (const name of fnNames) {
    out = out.replace(new RegExp(`^function ${name}\\(`, 'm'), `export function ${name}(`);
  }
  return out;
}

const part1Fns = [
  'toast', 'getDisplayChess', 'getLastMove', 'squareAtDisplayIndex', 'renderBoard',
  'onSquareClick', 'refreshCastlingFromBoard', 'mergeCastlingFromUi', 'setTurnInFen',
  'syncFenFieldFromEditor', 'loadEditorFromFen', 'initEditor', 'renderMoveList',
  'updateNamesUi', 'loadMainFromPgn', 'loadMainFromFen', 'applyMainFromEditor',
  'showAnalysisPanel', 'showSetupPanel', 'showTab'
];
const part2Fns = [
  'buildPgnExport', 'saveToStorage', 'loadSavedList', 'positionPopover', 'closePopovers', 'wirePalette'
];
const part3Fns = ['wireEvents', 'init'];

const sharedHeader = `/**
 * Chess Analysis — shared state & chess.js imports.
 */
`;
const sharedBody = lines.slice(3, sharedEnd).join('\n');
const shared = sharedHeader + sharedBody
  .replace(/^import \{/, 'import {')
  .replace(/^const STORAGE_KEY/, 'export const STORAGE_KEY')
  .replace(/^const PIECE_CHARS/, 'export const PIECE_CHARS')
  .replace(/^const EMPTY_FEN/, 'export const EMPTY_FEN')
  .replace(/^const START_FEN/, 'export const START_FEN')
  .replace(/^const state =/, 'export const state =')
  .replace(
    /^import \{([^}]+)\} from/m,
    (m, inner) => `import {${inner}} from '/chess-analysis/vendor/chess.js';\nexport {${inner}} from '/chess-analysis/vendor/chess.js';`
  );

const part1Import = `import {
  Chess, validateFen, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  state, PIECE_CHARS, EMPTY_FEN, START_FEN
} from './chess-analysis-app-shared.js';

`;
const part1 = part1Import + addExports(lines.slice(part1Start, part2Start).join('\n'), part1Fns);

const part2Import = `import {
  Chess, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  state, PIECE_CHARS, STORAGE_KEY
} from './chess-analysis-app-shared.js';
import {
  toast, getDisplayChess, loadMainFromPgn, loadMainFromFen
} from './chess-analysis-app-1.js';

`;
const part2 = part2Import + addExports(lines.slice(part2Start, part3Start).join('\n'), part2Fns);

const part3Import = `import {
  Chess, state, EMPTY_FEN, START_FEN
} from './chess-analysis-app-shared.js';
import {
  toast, renderBoard, renderMoveList, updateNamesUi, showAnalysisPanel, showSetupPanel,
  showTab, loadMainFromPgn, loadMainFromFen, applyMainFromEditor, loadEditorFromFen,
  refreshCastlingFromBoard, mergeCastlingFromUi, syncFenFieldFromEditor, initEditor
} from './chess-analysis-app-1.js';
import {
  buildPgnExport, saveToStorage, loadSavedList, positionPopover, closePopovers, wirePalette
} from './chess-analysis-app-2.js';

`;
let part3Body = lines.slice(part3Start).join('\n');
part3Body = part3Body.replace(/^init\(\);$/m, '');
const part3 = part3Import + addExports(part3Body, part3Fns) + '\ninit();\n';

const entry = `/**
 * Chess Analysis workspace entry — loads split modules (ESM).
 */
import './chess-analysis-app-1.js';
import './chess-analysis-app-2.js';
import './chess-analysis-app-3.js';
`;

fs.writeFileSync(path.join(ROOT, 'chess-analysis-app-shared.js'), shared.endsWith('\n') ? shared : shared + '\n');
fs.writeFileSync(path.join(ROOT, 'chess-analysis-app-1.js'), part1.endsWith('\n') ? part1 : part1 + '\n');
fs.writeFileSync(path.join(ROOT, 'chess-analysis-app-2.js'), part2.endsWith('\n') ? part2 : part2 + '\n');
fs.writeFileSync(path.join(ROOT, 'chess-analysis-app-3.js'), part3.endsWith('\n') ? part3 : part3 + '\n');
fs.writeFileSync(path.join(ROOT, 'chess-analysis-app.js'), entry);

for (const f of [
  'chess-analysis-app-shared.js',
  'chess-analysis-app-1.js',
  'chess-analysis-app-2.js',
  'chess-analysis-app-3.js',
  'chess-analysis-app.js'
]) {
  const n = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').length - 1;
  console.log(f, n);
}
