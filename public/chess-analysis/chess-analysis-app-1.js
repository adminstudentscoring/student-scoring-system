import {
  Chess, validateFen, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  state, PIECE_CHARS, EMPTY_FEN, START_FEN
} from './chess-analysis-app-shared.js';

export function toast(msg) {
  const t = document.createElement('div');
  t.className = 'ca-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

export function getDisplayChess() {
  const c = new Chess();
  try {
    c.load(state.startFen);
  } catch {
    c.reset();
  }
  for (let i = 0; i < state.moveIndex; i++) {
    const r = c.move(state.moves[i], { sloppy: true });
    if (!r) break;
  }
  return c;
}

export function getLastMove() {
  if (state.moveIndex === 0) return null;
  const c = new Chess();
  try {
    c.load(state.startFen);
  } catch {
    return null;
  }
  let last = null;
  for (let i = 0; i < state.moveIndex; i++) {
    const r = c.move(state.moves[i], { sloppy: true });
    if (r) last = { from: r.from, to: r.to };
  }
  return last;
}

export function squareAtDisplayIndex(ri, fi) {
  if (!state.flipped) {
    const rank = 8 - ri;
    const file = String.fromCharCode(97 + fi);
    return `${file}${rank}`;
  }
  const rank = 1 + ri;
  const file = String.fromCharCode(97 + (7 - fi));
  return `${file}${rank}`;
}

export function renderBoard() {
  const grid = document.getElementById('caBoardGrid');
  if (!grid) return;

  const inSetup = !document.getElementById('panelSetup').hidden;
  const ch = inSetup ? state.editorChess : getDisplayChess();
  const last = inSetup ? null : getLastMove();

  grid.classList.toggle('ca-board-coords-on', state.coordsVisible);
  grid.replaceChildren();

  for (let ri = 0; ri < 8; ri++) {
    for (let fi = 0; fi < 8; fi++) {
      const sq = squareAtDisplayIndex(ri, fi);
      const light = (ri + fi) % 2 === 0;
      const cell = document.createElement('div');
      cell.className = `ca-square ${light ? 'ca-square-light' : 'ca-square-dark'}`;
      cell.dataset.square = sq;
      cell.dataset.file = sq[0];
      cell.dataset.rank = sq[1];
      cell.dataset.showFile = ri === 7 ? '1' : '0';
      cell.dataset.showRank = fi === 0 ? '1' : '0';
      if (last && (sq === last.from || sq === last.to)) cell.classList.add('ca-square-last');

      const piece = ch.get(sq);
      if (piece) {
        cell.textContent = PIECE_CHARS[piece.color][piece.type];
      }

      cell.addEventListener('click', () => onSquareClick(sq, inSetup));
      grid.appendChild(cell);
    }
  }
}

export function onSquareClick(square, inSetup) {
  if (!inSetup) return;
  const ed = state.editorChess;
  if (!ed) return;

  if (state.paletteSelection === 'delete') {
    ed.remove(square);
  } else if (state.paletteSelection) {
    const { type, color } = state.paletteSelection;
    ed.remove(square);
    const ok = ed.put({ type, color }, square);
    if (!ok) toast('Cannot place piece');
  } else {
    ed.remove(square);
  }

  refreshCastlingFromBoard();
  syncFenFieldFromEditor();
  renderBoard();
}

export function refreshCastlingFromBoard() {
  const fen = state.editorChess.fen().split(' ');
  const rights = fen[2] || '-';
  document.getElementById('cwK').checked = rights.includes('K');
  document.getElementById('cwQ').checked = rights.includes('Q');
  document.getElementById('cbK').checked = rights.includes('k');
  document.getElementById('cbQ').checked = rights.includes('q');
}

export function mergeCastlingFromUi(fenStr) {
  const p = fenStr.split(' ');
  let cast = '';
  if (document.getElementById('cwK').checked) cast += 'K';
  if (document.getElementById('cwQ').checked) cast += 'Q';
  if (document.getElementById('cbK').checked) cast += 'k';
  if (document.getElementById('cbQ').checked) cast += 'q';
  p[2] = cast || '-';
  return p.join(' ');
}

export function setTurnInFen(fenStr, color) {
  const p = fenStr.split(' ');
  p[1] = color;
  return p.join(' ');
}

export function syncFenFieldFromEditor() {
  const input = document.getElementById('caSetupFen');
  if (input && state.editorChess) {
    let f = state.editorChess.fen();
    f = mergeCastlingFromUi(f);
    f = setTurnInFen(f, document.getElementById('caSetupTurn').value);
    input.value = f;
  }
}

export function loadEditorFromFen(fenStr) {
  const v = validateFen(fenStr);
  if (!v.ok) {
    toast(v.error || 'Invalid FEN');
    return false;
  }
  try {
    state.editorChess.load(fenStr);
    refreshCastlingFromBoard();
    syncFenFieldFromEditor();
    return true;
  } catch {
    toast('Failed to load FEN');
    return false;
  }
}

export function initEditor() {
  state.editorChess = new Chess(EMPTY_FEN, { skipValidation: true });
  try {
    state.editorChess.load(mergeCastlingFromUi(EMPTY_FEN));
  } catch {}
  document.getElementById('caSetupTurn').value = 'w';
  syncFenFieldFromEditor();
}

export function renderMoveList() {
  const el = document.getElementById('caMoveList');
  if (!el) return;
  if (state.moves.length === 0) {
    el.textContent = '(no moves)';
    return;
  }
  const lines = [];
  for (let i = 0; i < state.moves.length; i += 2) {
    const num = i / 2 + 1;
    const w = state.moves[i];
    const b = state.moves[i + 1];
    lines.push(b ? `${num}. ${w} ${b}` : `${num}. ${w}`);
  }
  el.textContent = lines.join('  ');
}

export function updateNamesUi() {
  document.getElementById('caWhiteName').textContent = state.whiteName;
  document.getElementById('caBlackName').textContent = state.blackName;
  document.getElementById('caNamesDisplay').textContent = `${state.whiteName} – ${state.blackName}`;
}

export function loadMainFromPgn(text) {
  const t = new Chess();
  const ok = t.loadPgn(text, { sloppy: true });
  if (!ok) {
    toast('Invalid PGN');
    return false;
  }
  const verbose = t.history({ verbose: true });
  const hist = t.history();
  state.startFen = verbose.length ? verbose[0].before : t.fen();
  state.moves = hist;
  state.moveIndex = 0;
  state.currentPgn = text;
  state.positionLabel = hist.length ? `Game (${hist.length} half-moves)` : 'Starting position';
  document.getElementById('caPositionLabel').textContent = state.positionLabel;
  renderMoveList();
  renderBoard();
  toast('PGN loaded');
  return true;
}

export function loadMainFromFen(text) {
  const v = validateFen(text.trim());
  if (!v.ok) {
    toast(v.error || 'Invalid FEN');
    return false;
  }
  try {
    const c = new Chess();
    c.load(text.trim());
    state.startFen = text.trim();
    state.moves = [];
    state.moveIndex = 0;
    state.currentPgn = '';
    state.positionLabel = 'Custom position';
    document.getElementById('caPositionLabel').textContent = state.positionLabel;
    renderMoveList();
    renderBoard();
    toast('FEN loaded');
    return true;
  } catch {
    toast('Failed to load FEN');
    return false;
  }
}

export function applyMainFromEditor() {
  syncFenFieldFromEditor();
  const fen = document.getElementById('caSetupFen').value.trim();
  if (!loadMainFromFen(fen)) return;
  showAnalysisPanel();
  toast('Applied to analysis');
}

export function showAnalysisPanel() {
  document.getElementById('panelSetup').hidden = true;
  document.getElementById('panelGames').hidden = true;
  document.getElementById('panelExplore').hidden = true;
  document.getElementById('panelAnalysis').hidden = false;
  document.querySelectorAll('.ca-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'analysis'));
  document.getElementById('workspaceTitle').textContent = 'Analysis';
}

export function showSetupPanel() {
  document.getElementById('panelAnalysis').hidden = true;
  document.getElementById('panelGames').hidden = true;
  document.getElementById('panelExplore').hidden = true;
  document.getElementById('panelSetup').hidden = false;
  document.getElementById('workspaceTitle').textContent = 'Setup position';
  const fen = getDisplayChess().fen();
  state.editorChess = new Chess();
  try {
    state.editorChess.load(fen);
  } catch {
    state.editorChess.reset();
  }
  refreshCastlingFromBoard();
  document.getElementById('caSetupTurn').value = state.editorChess.turn();
  syncFenFieldFromEditor();
  renderBoard();
}

export function showTab(name) {
  document.getElementById('panelSetup').hidden = true;
  document.getElementById('panelAnalysis').hidden = name !== 'analysis';
  document.getElementById('panelGames').hidden = name !== 'games';
  document.getElementById('panelExplore').hidden = name !== 'explore';
  document.querySelectorAll('.ca-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.getElementById('workspaceTitle').textContent =
    name === 'games' ? 'Games' : name === 'explore' ? 'Explore' : 'Analysis';
  renderBoard();
  renderMoveList();
}
