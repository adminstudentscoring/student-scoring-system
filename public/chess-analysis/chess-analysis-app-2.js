import {
  Chess, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  state, PIECE_CHARS, STORAGE_KEY
} from './chess-analysis-app-shared.js';
import {
  toast, getDisplayChess, loadMainFromPgn, loadMainFromFen
} from './chess-analysis-app-1.js';

export function buildPgnExport() {
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

export function saveToStorage() {
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

export function loadSavedList() {
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

export function positionPopover(pop, anchorEl) {
  const r = anchorEl.getBoundingClientRect();
  pop.style.top = `${r.bottom + 4}px`;
  pop.style.left = `${Math.min(r.left, window.innerWidth - 240)}px`;
}

export function closePopovers() {
  document.querySelectorAll('.ca-popover').forEach((p) => {
    p.hidden = true;
  });
}

export function wirePalette() {
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
