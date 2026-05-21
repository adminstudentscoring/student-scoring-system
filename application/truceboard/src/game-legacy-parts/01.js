(function () {
  'use strict';

  const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  const UNICODE = {
    w: { k: '\u2654', q: '\u2655', r: '\u2656', b: '\u2657', n: '\u2658', p: '\u2659' },
    b: { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' }
  };

  function initialHand() {
    const h = [];
    for (let i = 0; i < 8; i++) h.push('p');
    for (let i = 0; i < 2; i++) h.push('r');
    for (let i = 0; i < 2; i++) h.push('n');
    for (let i = 0; i < 2; i++) h.push('b');
    h.push('q', 'k');
    return h;
  }

  function sqKey(fileChar, rank) {
    return fileChar + String(rank);
  }

  function parseKey(key) {
    return { f: key[0], r: Number(key[1]) };
  }

  function fileToNum(f) {
    return f.charCodeAt(0) - 96;
  }

  function allSquareKeys() {
    const keys = [];
    for (let r = 1; r <= 8; r++) {
      for (let c = 0; c < 8; c++) {
        keys.push(sqKey(String.fromCharCode(97 + c), r));
      }
    }
    return keys;
  }

  function getAttackedSquares(board, fromKey, type, color) {
    const { f, r } = parseKey(fromKey);
    const fc = fileToNum(f);
    const set = new Set();

    function addSquare(nf, nr) {
      if (nf >= 1 && nf <= 8 && nr >= 1 && nr <= 8) {
        set.add(sqKey(String.fromCharCode(96 + nf), nr));
      }
    }

    const dirsRook = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0]
    ];
    const dirsBishop = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1]
    ];

    function ray(dirs) {
      for (const [df, dr] of dirs) {
        let nf = fc;
        let nr = r;
        while (true) {
          nf += df;
          nr += dr;
          if (nf < 1 || nf > 8 || nr < 1 || nr > 8) break;
          const k = sqKey(String.fromCharCode(96 + nf), nr);
          set.add(k);
          if (board[k]) break;
        }
      }
    }

    if (type === 'r') ray(dirsRook);
    else if (type === 'b') ray(dirsBishop);
    else if (type === 'q') {
      ray(dirsRook);
      ray(dirsBishop);
    } else if (type === 'n') {
      const jumps = [
        [1, 2],
        [2, 1],
        [2, -1],
        [1, -2],
        [-1, -2],
        [-2, -1],
        [-2, 1],
        [-1, 2]
      ];
      for (const [df, dr] of jumps) addSquare(fc + df, r + dr);
    } else if (type === 'k') {
      for (let df = -1; df <= 1; df++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (df === 0 && dr === 0) continue;
          addSquare(fc + df, r + dr);
        }
      }
    } else if (type === 'p') {
      const forward = color === 'w' ? 1 : -1;
      addSquare(fc - 1, r + forward);
      addSquare(fc + 1, r + forward);
    }

    return set;
  }

  function isSquareAttacked(board, targetKey, attackerColor) {
    for (const key of Object.keys(board)) {
      const pc = board[key];
      if (pc.c !== attackerColor) continue;
      const atk = getAttackedSquares(board, key, pc.t, pc.c);
      if (atk.has(targetKey)) return true;
    }
    return false;
  }

  function newPieceAttacksAnyEnemy(board, fromKey) {
    const self = board[fromKey];
    if (!self) return false;
    const atk = getAttackedSquares(board, fromKey, self.t, self.c);
    for (const key of Object.keys(board)) {
      if (key === fromKey) continue;
      const pc = board[key];
      if (pc.c !== self.c && atk.has(key)) return true;
    }
    return false;
  }

  function pawnRankOk(color, rank) {
    if (color === 'w' && rank === 1) return false;
    if (color === 'b' && rank === 8) return false;
    return true;
  }

  function isLegalPlacement(board, color, pieceType, targetKey) {
    if (board[targetKey]) return false;
    const { r } = parseKey(targetKey);
    if (pieceType === 'p' && !pawnRankOk(color, r)) return false;

    const opp = color === 'w' ? 'b' : 'w';
    if (isSquareAttacked(board, targetKey, opp)) return false;

    const temp = { ...board, [targetKey]: { c: color, t: pieceType } };
    if (newPieceAttacksAnyEnemy(temp, targetKey)) return false;
    return true;
  }

  function hasAnyLegalPlacement(board, hand, color) {
    const typesLeft = {};
    for (const t of hand) {
      typesLeft[t] = (typesLeft[t] || 0) + 1;
    }
    const uniq = Object.keys(typesLeft);
    for (const t of uniq) {
      for (const key of allSquareKeys()) {
        if (isLegalPlacement(board, color, t, key)) return true;
      }
    }
    return false;
  }

  function handValue(hand) {
    let s = 0;
    for (const t of hand) s += PIECE_VALUE[t] || 0;
    return s;
  }

  function settle(board, hands) {
    const vw = handValue(hands.w);
    const vb = handValue(hands.b);
    if (vw < vb) return { winner: 'w', vw, vb };
    if (vb < vw) return { winner: 'b', vw, vb };
    return { winner: 'draw', vw, vb };
  }

  const state = {
    board: {},
    hands: { w: [], b: [] },
    toMove: 'w',
    selectedType: null,
    consecutivePasses: 0,
    phase: 'setup',
    clockMode: 'unlimited',
    clock: null,
    lastTick: 0,
    rafId: null
  };

  function buildClockConfig() {
    const mode = document.getElementById('clockMode').value;
    if (mode === 'unlimited') return { mode: 'unlimited' };
    if (mode === 'fischer') {
      const min = Math.max(1, Number(document.getElementById('fischerMin').value) || 5);
      const inc = Math.max(0, Number(document.getElementById('fischerInc').value) || 0);
      return { mode: 'fischer', initialMs: min * 60 * 1000, incMs: inc * 1000 };
    }
    if (mode === 'byomi') {
      const mainMin = Math.max(0, Number(document.getElementById('byomiMainMin').value) || 0);
      const periodSec = Math.max(1, Number(document.getElementById('byomiPeriodSec').value) || 30);
      const periods = Math.max(1, Number(document.getElementById('byomiPeriods').value) || 5);
      const periodLen = periodSec * 1000;
      return {
        mode: 'byomi',
        mainMs: mainMin * 60 * 1000,
        periodLengthMs: periodLen,
        periods,
        byomiLeft: { w: periods, b: periods },
        inByomi: { w: false, b: false },
        periodRemaining: { w: periodLen, b: periodLen }
      };
    }
    if (mode === 'absolute') {
      const min = Math.max(1, Number(document.getElementById('absMin').value) || 15);
      return { mode: 'absolute', totalMs: min * 60 * 1000 };
    }
    return { mode: 'unlimited' };
  }

  function initClockFromConfig(cfg) {
    if (cfg.mode === 'unlimited') {
      state.clock = { mode: 'unlimited' };
      return;
    }
    if (cfg.mode === 'fischer') {
      state.clock = {
        mode: 'fischer',
        remaining: { w: cfg.initialMs, b: cfg.initialMs },
        incMs: cfg.incMs
      };
      return;
    }
    if (cfg.mode === 'byomi') {
      const startInByomi = cfg.mainMs <= 0;
      state.clock = {
        mode: 'byomi',
        remaining: { w: cfg.mainMs, b: cfg.mainMs },
        periodLengthMs: cfg.periodLengthMs,
        periods: cfg.periods,
        byomiLeft: { ...cfg.byomiLeft },
        inByomi: { w: startInByomi || cfg.inByomi.w, b: startInByomi || cfg.inByomi.b },
        periodRemaining: { ...cfg.periodRemaining }
      };
      return;
    }
    if (cfg.mode === 'absolute') {
      state.clock = {
        mode: 'absolute',
        remaining: { w: cfg.totalMs, b: cfg.totalMs }
      };
    }
  }

  function formatMs(ms) {
    if (!Number.isFinite(ms) || ms < 0) ms = 0;
    const s = Math.ceil(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + String(r).padStart(2, '0');
  }

  function updateClockDisplay() {
    const row = document.getElementById('clocksRow');
    const unlimited = state.clock && state.clock.mode === 'unlimited';
    row.style.display = unlimited ? 'none' : 'flex';
    if (unlimited) return;

    const elW = document.getElementById('timeW');
    const elB = document.getElementById('timeB');
    const c = state.clock;
    if (c.mode === 'fischer' || c.mode === 'absolute') {
      elW.textContent = formatMs(c.remaining.w);
      elB.textContent = formatMs(c.remaining.b);
    } else if (c.mode === 'byomi') {
      const fmt = (color) => {
        const main = c.remaining[color];
        if (!c.inByomi[color]) return formatMs(main);
        return formatMs(c.periodRemaining[color]) + ' x' + c.byomiLeft[color];
      };
      elW.textContent = fmt('w');
      elB.textContent = fmt('b');
    }

    document.getElementById('clockW').classList.toggle('active', state.toMove === 'w' && state.phase === 'playing');
    document.getElementById('clockB').classList.toggle('active', state.toMove === 'b' && state.phase === 'playing');
  }

  function onTimeForfeit(loser) {
    state.phase = 'over';
    stopClockLoop();
    const winner = loser === 'w' ? 'b' : 'w';
    showResult('Time: ' + (winner === 'w' ? 'White' : 'Black') + ' wins.');
  }

  function tickClocks(dt) {
    const c = state.clock;
    if (!c || c.mode === 'unlimited' || state.phase !== 'playing') return;

    const color = state.toMove;
    if (c.mode === 'fischer') {
      c.remaining[color] -= dt;
      if (c.remaining[color] <= 0) onTimeForfeit(color);
    } else if (c.mode === 'absolute') {
      c.remaining[color] -= dt;
      if (c.remaining[color] <= 0) onTimeForfeit(color);
    } else if (c.mode === 'byomi') {
      if (!c.inByomi[color]) {
        c.remaining[color] -= dt;
        if (c.remaining[color] <= 0) {
          c.remaining[color] = 0;
          c.inByomi[color] = true;
          c.periodRemaining[color] = c.periodLengthMs;
        }
      } else {
        c.periodRemaining[color] -= dt;
        if (c.periodRemaining[color] <= 0) {
          c.byomiLeft[color]--;
          if (c.byomiLeft[color] <= 0) {
            onTimeForfeit(color);
            return;
          }
          c.periodRemaining[color] = c.periodLengthMs;
        }
      }
    }
  }

  function clockLoop(ts) {
    if (state.phase !== 'playing') return;
    if (!state.lastTick) state.lastTick = ts;
    const dt = ts - state.lastTick;
    state.lastTick = ts;
    if (dt > 0 && dt < 5000) tickClocks(dt);
    updateClockDisplay();
    state.rafId = requestAnimationFrame(clockLoop);
  }

  function stopClockLoop() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    state.lastTick = 0;
  }

  function startClockLoop() {
    stopClockLoop();
    if (!state.clock || state.clock.mode === 'unlimited') return;
    state.lastTick = 0;
    state.rafId = requestAnimationFrame(clockLoop);
  }

  function applyFischerIncrement(mover) {
    const c = state.clock;
    if (c && c.mode === 'fischer' && c.incMs) {
      c.remaining[mover] += c.incMs;
    }
  }

  function resetByomiPeriodAfterMove(mover) {
    const c = state.clock;
    if (c && c.mode === 'byomi' && c.inByomi[mover]) {
      c.periodRemaining[mover] = c.periodLengthMs;
    }
  }

  const boardEl = document.getElementById('board');
  const handW = document.getElementById('handW');
  const handB = document.getElementById('handB');

  function renderCoords() {
    const files = document.getElementById('coordsFiles');
    const ranks = document.getElementById('coordsRanks');
    files.innerHTML = '';
    for (let c = 0; c < 8; c++) {
      const d = document.createElement('div');
      d.textContent = String.fromCharCode(97 + c);
      files.appendChild(d);
    }
    ranks.innerHTML = '';
    for (let row = 0; row < 8; row++) {
      const d = document.createElement('div');
      d.textContent = String(8 - row);
      ranks.appendChild(d);
    }
  }

  function squareKeyFromRC(row, col) {
    const rank = 8 - row;
    const file = String.fromCharCode(97 + col);
    return file + rank;
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const key = squareKeyFromRC(row, col);
        const light = (row + col) % 2 === 0;
        const sq = document.createElement('div');
        sq.className = 'tb-square ' + (light ? 'light' : 'dark');
        sq.dataset.sq = key;
        const pc = state.board[key];
        if (pc) {
          const span = document.createElement('span');
          span.className = pc.c === 'w' ? 'pc-w' : 'pc-b';
          span.textContent = UNICODE[pc.c][pc.t];
          sq.appendChild(span);
        }
        sq.addEventListener('click', onSquareClick);
        boardEl.appendChild(sq);
      }
    }
    highlightLegal();
  }

  function countInHand(hand, type) {
    return hand.filter((t) => t === type).length;
  }

  function renderHands() {
    handW.innerHTML = '';
    handB.innerHTML = '';
    const order = ['k', 'q', 'r', 'b', 'n', 'p'];
    for (const color of ['w', 'b']) {
      const el = color === 'w' ? handW : handB;
      const hand = state.hands[color];
      for (const t of order) {
        const n = countInHand(hand, t);
        for (let i = 0; i < n; i++) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tb-piece-btn';
          btn.textContent = UNICODE[color][t];
          btn.dataset.color = color;
          btn.dataset.type = t;
          btn.addEventListener('click', onPieceClick);
          if (state.toMove !== color || state.phase !== 'playing') btn.classList.add('dim');
          if (state.selectedType && state.selectedType.color === color && state.selectedType.type === t) {
            btn.classList.add('selected');
          }
          el.appendChild(btn);
        }
