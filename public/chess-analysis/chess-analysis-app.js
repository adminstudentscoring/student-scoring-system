/**
 * Chess Analysis workspace — chess.js ESM, teacher-only page.
 */
import {
  Chess,
  validateFen,
  WHITE,
  BLACK,
  PAWN,
  KNIGHT,
  BISHOP,
  ROOK,
  QUEEN,
  KING
} from '/chess-analysis/vendor/chess.js';

const STORAGE_KEY = 'chessAnalysisSaved';

const PIECE_CHARS = {
  w: { p: '\u2659', n: '\u2658', b: '\u2657', r: '\u2656', q: '\u2655', k: '\u2654' },
  b: { p: '\u265F', n: '\u265E', b: '\u265D', r: '\u265C', q: '\u265B', k: '\u265A' }
};

const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const state = {
  startFen: START_FEN,
  moves: [],
  moveIndex: 0,
  whiteName: 'White',
  blackName: 'Black',
  positionLabel: 'Starting position',
  flipped: false,
  coordsVisible: true,
  currentPgn: '',
  editorChess: null,
  /** @type {{ type: string, color: string } | 'delete' | null} */
  paletteSelection: null
};

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'ca-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function getDisplayChess() {
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

function getLastMove() {
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

function squareAtDisplayIndex(ri, fi) {
  if (!state.flipped) {
    const rank = 8 - ri;
    const file = String.fromCharCode(97 + fi);
    return `${file}${rank}`;
  }
  const rank = 1 + ri;
  const file = String.fromCharCode(97 + (7 - fi));
  return `${file}${rank}`;
}

function renderBoard() {
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

function onSquareClick(square, inSetup) {
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

function refreshCastlingFromBoard() {
  const fen = state.editorChess.fen().split(' ');
  const rights = fen[2] || '-';
  document.getElementById('cwK').checked = rights.includes('K');
  document.getElementById('cwQ').checked = rights.includes('Q');
  document.getElementById('cbK').checked = rights.includes('k');
  document.getElementById('cbQ').checked = rights.includes('q');
}

function mergeCastlingFromUi(fenStr) {
  const p = fenStr.split(' ');
  let cast = '';
  if (document.getElementById('cwK').checked) cast += 'K';
  if (document.getElementById('cwQ').checked) cast += 'Q';
  if (document.getElementById('cbK').checked) cast += 'k';
  if (document.getElementById('cbQ').checked) cast += 'q';
  p[2] = cast || '-';
  return p.join(' ');
}

function setTurnInFen(fenStr, color) {
  const p = fenStr.split(' ');
  p[1] = color;
  return p.join(' ');
}

function syncFenFieldFromEditor() {
  const input = document.getElementById('caSetupFen');
  if (input && state.editorChess) {
    let f = state.editorChess.fen();
    f = mergeCastlingFromUi(f);
    f = setTurnInFen(f, document.getElementById('caSetupTurn').value);
    input.value = f;
  }
}

function loadEditorFromFen(fenStr) {
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

function initEditor() {
  state.editorChess = new Chess(EMPTY_FEN, { skipValidation: true });
  try {
    state.editorChess.load(mergeCastlingFromUi(EMPTY_FEN));
  } catch {}
  document.getElementById('caSetupTurn').value = 'w';
  syncFenFieldFromEditor();
}

function renderMoveList() {
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

function updateNamesUi() {
  document.getElementById('caWhiteName').textContent = state.whiteName;
  document.getElementById('caBlackName').textContent = state.blackName;
  document.getElementById('caNamesDisplay').textContent = `${state.whiteName} – ${state.blackName}`;
}

function loadMainFromPgn(text) {
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

function loadMainFromFen(text) {
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

function applyMainFromEditor() {
  syncFenFieldFromEditor();
  const fen = document.getElementById('caSetupFen').value.trim();
  if (!loadMainFromFen(fen)) return;
  showAnalysisPanel();
  toast('Applied to analysis');
}

function showAnalysisPanel() {
  document.getElementById('panelSetup').hidden = true;
  document.getElementById('panelGames').hidden = true;
  document.getElementById('panelExplore').hidden = true;
  document.getElementById('panelAnalysis').hidden = false;
  document.querySelectorAll('.ca-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'analysis'));
  document.getElementById('workspaceTitle').textContent = 'Analysis';
}

function showSetupPanel() {
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

function showTab(name) {
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

function buildPgnExport() {
  const c = new Chess();
  try {
    c.load(state.startFen);
  } catch {
    c.reset();
  }
  for (const m of state.moves) {
    const r = c.move(m, { sloppy: true });
    if (!r) break;
  }
  c.setHeader('Event', '?');
  c.setHeader('Site', '?');
  c.setHeader('White', state.whiteName);
  c.setHeader('Black', state.blackName);
  return c.pgn();
}

function saveToStorage() {
  const item = {
    id: `ca-${Date.now()}`,
    title: `${state.whiteName} vs ${state.blackName}`,
    fen: getDisplayChess().fen(),
    pgn: buildPgnExport(),
    savedAt: new Date().toISOString()
  };
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    list = [];
  }
  if (!Array.isArray(list)) list = [];
  list.unshift(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 50)));
  toast('Saved');
}

function loadSavedList() {
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    list = [];
  }
  const ul = document.getElementById('savedList');
  const empty = document.getElementById('savedEmpty');
  ul.replaceChildren();
  if (!list.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  for (const it of list) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = `${it.title} · ${new Date(it.savedAt).toLocaleString()}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ca-btn ca-btn-sm ca-btn-primary';
    btn.textContent = 'Load';
    btn.addEventListener('click', () => {
      if (it.pgn) loadMainFromPgn(it.pgn);
      else if (it.fen) loadMainFromFen(it.fen);
      document.getElementById('modalSaved').hidden = true;
    });
    li.appendChild(span);
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

function positionPopover(pop, anchorEl) {
  const r = anchorEl.getBoundingClientRect();
  pop.style.top = `${r.bottom + 4}px`;
  pop.style.left = `${Math.min(r.left, window.innerWidth - 240)}px`;
}

function closePopovers() {
  document.querySelectorAll('.ca-popover').forEach((p) => {
    p.hidden = true;
  });
}

function wirePalette() {
  const blackRow = document.getElementById('caPaletteBlack');
  const whiteRow = document.getElementById('caPaletteWhite');
  const blacks = [
    { type: KING, color: BLACK },
    { type: QUEEN, color: BLACK },
    { type: ROOK, color: BLACK },
    { type: BISHOP, color: BLACK },
    { type: KNIGHT, color: BLACK },
    { type: PAWN, color: BLACK }
  ];
  const whites = [
    { type: KING, color: WHITE },
    { type: QUEEN, color: WHITE },
    { type: ROOK, color: WHITE },
    { type: BISHOP, color: WHITE },
    { type: KNIGHT, color: WHITE },
    { type: PAWN, color: WHITE }
  ];
  function addPiece(row, spec) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ca-palette-piece';
    b.textContent = PIECE_CHARS[spec.color][spec.type];
    b.addEventListener('click', () => {
      state.paletteSelection = { type: spec.type, color: spec.color };
      document.querySelectorAll('.ca-palette-piece').forEach((x) => x.classList.remove('selected'));
      b.classList.add('selected');
    });
    row.appendChild(b);
  }
  blacks.forEach((s) => addPiece(blackRow, s));
  whites.forEach((s) => addPiece(whiteRow, s));

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'ca-palette-piece';
  del.textContent = '✕';
  del.title = 'Erase square';
  del.addEventListener('click', () => {
    state.paletteSelection = 'delete';
    document.querySelectorAll('.ca-palette-piece').forEach((x) => x.classList.remove('selected'));
    del.classList.add('selected');
  });
  whiteRow.appendChild(del);
}

function wireEvents() {
  document.getElementById('btnOpenWorkspace').addEventListener('click', () => {
    document.getElementById('viewHub').hidden = true;
    document.getElementById('viewWorkspace').hidden = false;
    showAnalysisPanel();
    renderBoard();
    renderMoveList();
  });

  document.getElementById('btnBackHub').addEventListener('click', () => {
    document.getElementById('viewWorkspace').hidden = true;
    document.getElementById('viewHub').hidden = false;
    closePopovers();
  });

  document.querySelectorAll('.ca-tab').forEach((tab) => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  });

  document.getElementById('btnFirst').addEventListener('click', () => {
    state.moveIndex = 0;
    renderBoard();
    renderMoveList();
  });
  document.getElementById('btnPrev').addEventListener('click', () => {
    state.moveIndex = Math.max(0, state.moveIndex - 1);
    renderBoard();
    renderMoveList();
  });
  document.getElementById('btnNext').addEventListener('click', () => {
    state.moveIndex = Math.min(state.moves.length, state.moveIndex + 1);
    renderBoard();
    renderMoveList();
  });
  document.getElementById('btnLast').addEventListener('click', () => {
    state.moveIndex = state.moves.length;
    renderBoard();
    renderMoveList();
  });

  document.getElementById('btnNew').addEventListener('click', () => {
    state.startFen = START_FEN;
    state.moves = [];
    state.moveIndex = 0;
    state.currentPgn = '';
    state.positionLabel = 'Starting position';
    document.getElementById('caPositionLabel').textContent = state.positionLabel;
    document.getElementById('caSetupPgn').value = '';
    renderMoveList();
    renderBoard();
    toast('New board');
  });

  document.getElementById('btnSave').addEventListener('click', saveToStorage);

  document.getElementById('btnEditNames').addEventListener('click', () => {
    document.getElementById('inputWhiteName').value = state.whiteName;
    document.getElementById('inputBlackName').value = state.blackName;
    document.getElementById('modalNames').hidden = false;
  });

  document.getElementById('btnNamesSave').addEventListener('click', () => {
    state.whiteName = document.getElementById('inputWhiteName').value.trim() || 'White';
    state.blackName = document.getElementById('inputBlackName').value.trim() || 'Black';
    updateNamesUi();
    document.getElementById('modalNames').hidden = true;
  });

  document.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', () => {
      el.closest('.ca-modal').hidden = true;
    });
  });

  document.getElementById('btnBoardGear').addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = document.getElementById('popoverBoard');
    const willOpen = pop.hidden;
    closePopovers();
    pop.hidden = !willOpen;
    if (!pop.hidden) positionPopover(pop, e.currentTarget);
    document.getElementById('popBoardCoords').checked = state.coordsVisible;
  });

  document.getElementById('popBoardFlip').addEventListener('click', () => {
    state.flipped = !state.flipped;
    renderBoard();
  });

  document.getElementById('popBoardCoords').addEventListener('change', (e) => {
    state.coordsVisible = e.target.checked;
    renderBoard();
  });

  document.getElementById('btnMenuEngine').addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = document.getElementById('popoverEngine');
    const open = pop.hidden;
    closePopovers();
    pop.hidden = !open;
    if (!pop.hidden) positionPopover(pop, e.currentTarget);
  });

  document.getElementById('btnMenuBottom').addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = document.getElementById('popoverBottom');
    const open = pop.hidden;
    closePopovers();
    pop.hidden = !open;
    if (!pop.hidden) positionPopover(pop, e.currentTarget);
  });

  document.getElementById('popEditPosition').addEventListener('click', () => {
    closePopovers();
    showSetupPanel();
  });

  document.getElementById('popSavedAnalysis').addEventListener('click', () => {
    closePopovers();
    loadSavedList();
    document.getElementById('modalSaved').hidden = false;
  });

  document.getElementById('popShare').addEventListener('click', async () => {
    closePopovers();
    const text = buildPgnExport();
    try {
      await navigator.clipboard.writeText(text);
      toast('PGN copied to clipboard');
    } catch {
      toast('Could not copy — select PGN from Save export manually');
    }
  });

  document.getElementById('btnSetupFlip').addEventListener('click', () => {
    state.flipped = !state.flipped;
    renderBoard();
  });

  document.getElementById('btnSetupReset').addEventListener('click', () => {
    state.editorChess = new Chess();
    state.editorChess.reset();
    refreshCastlingFromBoard();
    document.getElementById('caSetupTurn').value = 'w';
    syncFenFieldFromEditor();
    renderBoard();
  });

  document.getElementById('btnSetupClear').addEventListener('click', () => {
    state.editorChess = new Chess(EMPTY_FEN, { skipValidation: true });
    document.getElementById('caSetupTurn').value = 'w';
    document.getElementById('cwK').checked = false;
    document.getElementById('cwQ').checked = false;
    document.getElementById('cbK').checked = false;
    document.getElementById('cbQ').checked = false;
    syncFenFieldFromEditor();
    renderBoard();
  });

  ['cwK', 'cwQ', 'cbK', 'cbQ'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
      if (!state.editorChess) return;
      const merged = mergeCastlingFromUi(state.editorChess.fen());
      try {
        state.editorChess.load(merged);
      } catch {
        toast('Invalid castling for this position');
      }
      syncFenFieldFromEditor();
    });
  });

  document.getElementById('caSetupTurn').addEventListener('change', () => {
    syncFenFieldFromEditor();
    const fen = document.getElementById('caSetupFen').value.trim();
    if (fen) loadEditorFromFen(fen);
    renderBoard();
  });

  document.getElementById('btnSetupLoad').addEventListener('click', () => {
    const pgn = document.getElementById('caSetupPgn').value.trim();
    if (pgn) {
      loadMainFromPgn(pgn);
      showAnalysisPanel();
      document.getElementById('caSetupPgn').value = pgn;
    } else {
      const fen = document.getElementById('caSetupFen').value.trim();
      if (fen) {
        loadMainFromFen(fen);
        showAnalysisPanel();
      }
    }
  });

  document.getElementById('btnSetupApply').addEventListener('click', applyMainFromEditor);

  document.addEventListener('click', () => closePopovers());

  document.querySelectorAll('.ca-popover').forEach((pop) => {
    pop.addEventListener('click', (e) => e.stopPropagation());
  });

  window.addEventListener('resize', () => renderBoard());
}

function init() {
  wirePalette();
  wireEvents();
  initEditor();
  updateNamesUi();
  document.getElementById('caPositionLabel').textContent = state.positionLabel;
}

init();
