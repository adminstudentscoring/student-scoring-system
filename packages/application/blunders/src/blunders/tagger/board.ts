// Chess board helpers for blunders tagging.

function buildBoardHelpers(Chess, BLUNDERS_TAGS, pieceValue, forkTargetValue, parseUciMove) {
  function parseFenFullmove(fen) {
    try {
      const parts = String(fen || '').trim().split(/\s+/);
      const n = Number(parts?.[5] || 0);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  function countPieces(chess) {
    let total = 0;
    let queens = 0;
    const b = chess?.board?.();
    if (!Array.isArray(b)) return { total: 0, queens: 0 };
    for (const row of b) {
      for (const cell of row || []) {
        if (!cell) continue;
        total++;
        if (String(cell.type) === 'q') queens++;
      }
    }
    return { total, queens };
  }

  function phaseTagsForFen(startFen) {
    let chess;
    try {
      chess = new Chess(String(startFen || ''));
    } catch {
      return [];
    }
    if (!chess) return [];
    const fm = parseFenFullmove(startFen);
    const { total, queens } = countPieces(chess);
    // Simple heuristics, deterministic:
    if (fm && fm <= 10) return [BLUNDERS_TAGS.PHASE_OPENING];
    if (total <= 12 || (queens === 0 && total <= 16)) return [BLUNDERS_TAGS.PHASE_ENDGAME];
    return [BLUNDERS_TAGS.PHASE_MIDDLEGAME];
  }

  function isSquare(s) { return /^[a-h][1-8]$/.test(String(s || '')); }
  function squareToFileRank(sq) {
    const s = String(sq || '');
    if (!isSquare(s)) return null;
    const file = s.charCodeAt(0) - 97;
    const rank = Number(s[1]) - 1;
    return { file, rank };
  }
  function fileRankToSquare(file, rank) {
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return '';
    return `${String.fromCharCode(97 + file)}${String(rank + 1)}`;
  }

  function attacksFrom(chess, fromSq, piece) {
    const out = [];
    if (!piece || !isSquare(fromSq)) return out;
    const c = String(piece.color || '').toLowerCase();
    const t = String(piece.type || '').toLowerCase();
    const fr = squareToFileRank(fromSq);
    if (!fr) return out;

    const push = (f, r) => {
      const sq = fileRankToSquare(f, r);
      if (sq) out.push(sq);
    };

    if (t === 'p') {
      const dir = c === 'w' ? 1 : -1;
      push(fr.file - 1, fr.rank + dir);
      push(fr.file + 1, fr.rank + dir);
      return out;
    }

    if (t === 'n') {
      const ds = [
        [1, 2], [2, 1], [2, -1], [1, -2],
        [-1, -2], [-2, -1], [-2, 1], [-1, 2]
      ];
      for (const [df, dr] of ds) push(fr.file + df, fr.rank + dr);
      return out;
    }

    if (t === 'k') {
      for (let df = -1; df <= 1; df++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (!df && !dr) continue;
          push(fr.file + df, fr.rank + dr);
        }
      }
      return out;
    }

    const dirs = [];
    if (t === 'b' || t === 'q') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    if (t === 'r' || t === 'q') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    for (const [df, dr] of dirs) {
      let f = fr.file + df;
      let r = fr.rank + dr;
      while (true) {
        const sq = fileRankToSquare(f, r);
        if (!sq) break;
        out.push(sq);
        const at = chess.get(sq);
        if (at) break; // blocked
        f += df;
        r += dr;
      }
    }
    return out;
  }

  function isForkByMovedPiece(chessAfterMove, movedSq, movedPiece, victimColor) {
    try {
      const atk = attacksFrom(chessAfterMove, movedSq, movedPiece);
      let targets = 0;
      for (const sq of atk) {
        const pc = chessAfterMove.get(sq);
        if (!pc || String(pc.color) !== String(victimColor || '')) continue;
        const v = forkTargetValue(pc);
        if (v >= 3) targets++;
      }
      return targets >= 2;
    } catch {
      return false;
    }
  }

  function hasRecapture(chessAfterCapture, targetSquare, colorToMove) {
    try {
      const moves = chessAfterCapture.moves({ verbose: true }) || [];
      for (const m of moves) {
        if (String(m?.to || '') !== String(targetSquare || '')) continue;
        const flags = String(m?.flags || '');
        if (flags.includes('c') || flags.includes('e')) return true;
      }
    } catch {}
    return false;
  }

  function isDoubleAttackByMovedPiece(chessAfterMove, movedSq, movedPiece, victimColor) {
    try {
      const t = String(movedPiece?.type || '').toLowerCase();
      // Treat knight/pawn forks as "fork" not "double attack" to keep them separated.
      if (t === 'n' || t === 'p') return false;
      return isForkByMovedPiece(chessAfterMove, movedSq, movedPiece, victimColor);
    } catch {
      return false;
    }
  }

  function isMateIn1ByUci(startFen, uci) {
    try {
      const p = parseUciMove(String(uci || ''));
      if (!p) return false;
      const ch = new Chess(String(startFen || ''));
      const mv = ch.move({ from: p.from, to: p.to, promotion: p.promotion });
      if (!mv) return false;
      return typeof ch.isCheckmate === 'function' ? ch.isCheckmate() : false;
    } catch {
      return false;
    }
  }

  function countCheckingMoves(chessPosition) {
    // chessPosition.turn() is the side to move
    try {
      const moves = chessPosition.moves({ verbose: true }) || [];
      let n = 0;
      for (const m of moves) {
        let ch2 = null;
        try { ch2 = new Chess(chessPosition.fen()); } catch { ch2 = null; }
        if (!ch2) continue;
        const mv = ch2.move({ from: String(m.from).toLowerCase(), to: String(m.to).toLowerCase(), promotion: m.promotion ? String(m.promotion).toLowerCase() : undefined });
        if (!mv) continue;
        if (typeof ch2.isCheck === 'function' && ch2.isCheck()) n++;
      }
      return n;
    } catch {
      return 0;
    }
  }

  function computeAttackCounts(chess, color) {
    const map = new Map(); // sq -> count
    try {
      const b = chess.board();
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const cell = b?.[r]?.[f];
          if (!cell) continue;
          if (String(cell.color) !== String(color || '')) continue;
          const from = fileRankToSquare(f, r);
          const atk = attacksFrom(chess, from, cell);
          for (const sq of atk) map.set(sq, (map.get(sq) || 0) + 1);
        }
      }
    } catch {}
    return map;
  }

  function computeLooseUnprotectedTags(chessAfterBlunder, victimColor, opponentColor) {
    const tags = new Set();
    try {
      const defenders = computeAttackCounts(chessAfterBlunder, victimColor);
      const attackers = computeAttackCounts(chessAfterBlunder, opponentColor);
      const b = chessAfterBlunder.board();
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const pc = b?.[r]?.[f];
          if (!pc) continue;
          if (String(pc.color) !== String(victimColor || '')) continue;
          const v = pieceValue(pc);
          if (v < 3 || String(pc.type) === 'k') continue;
          const sq = fileRankToSquare(f, r);
          const atkN = attackers.get(sq) || 0;
          if (atkN <= 0) continue;
          const defN = defenders.get(sq) || 0;
          if (defN <= 0) tags.add(BLUNDERS_TAGS.UNPROTECTED_PIECE);
          else if (atkN >= defN) tags.add(BLUNDERS_TAGS.LOOSE_PIECE);
        }
      }
    } catch {}
    return Array.from(tags);
  }

  function isDiscoveredAttackByMove(chessBefore, fromSq, toSq, moverColor) {
    // Deterministic: moved piece was the sole blocker between a friendly slider and an enemy valuable piece/king.
    try {
      const ch = chessBefore;
      const movedFrom = String(fromSq || '').toLowerCase();
      const movedTo = String(toSq || '').toLowerCase();
      const movedPiece = ch.get(movedFrom);
      if (!movedPiece || String(movedPiece.color) !== String(moverColor || '')) return false;
      const victimColor = String(moverColor || '') === 'w' ? 'b' : 'w';

      const b = ch.board();
      const sliders = [];
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const pc = b?.[r]?.[f];
          if (!pc) continue;
          if (String(pc.color) !== String(moverColor || '')) continue;
          const t = String(pc.type || '').toLowerCase();
          if (!(t === 'b' || t === 'r' || t === 'q')) continue;
          const sq = fileRankToSquare(f, r);
          if (sq === movedFrom) continue;
          sliders.push({ sq, pc });
        }
      }

      const isBetween = (a, b, x) => {
        const ar = squareToFileRank(a);
        const br = squareToFileRank(b);
        const xr = squareToFileRank(x);
        if (!ar || !br || !xr) return false;
        const df = br.file - ar.file;
        const dr = br.rank - ar.rank;
        const stepF = df === 0 ? 0 : (df > 0 ? 1 : -1);
        const stepR = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
        // must be collinear
        if (!(df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr))) return false;
        let f = ar.file + stepF;
        let r = ar.rank + stepR;
        while (true) {
          const sq = fileRankToSquare(f, r);
          if (!sq) break;
          if (sq === b) break;
          if (sq === x) return true;
          f += stepF; r += stepR;
        }
        return false;
      };

      for (const s of sliders) {
        const t = String(s.pc.type || '').toLowerCase();
        const dirs = [];
        if (t === 'b' || t === 'q') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
        if (t === 'r' || t === 'q') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
        const fr = squareToFileRank(s.sq);
        if (!fr) continue;
        for (const [df, dr] of dirs) {
          let f = fr.file + df;
          let r = fr.rank + dr;
          let first = null;
          let second = null;
          while (true) {
            const sq = fileRankToSquare(f, r);
            if (!sq) break;
            const pc = ch.get(sq);
            if (pc) {
              if (!first) first = { sq, pc };
              else { second = { sq, pc }; break; }
            }
            f += df; r += dr;
          }
          if (!first || !second) continue;
          if (String(first.sq) !== movedFrom) continue;
          if (String(second.pc.color) !== victimColor) continue;
          const v = forkTargetValue(second.pc);
          if (v < 3) continue;
          // If the moved piece lands still between slider and victim, it's not discovered.
          if (isBetween(s.sq, second.sq, movedTo)) continue;
          return true;
        }
      }
    } catch {}
    return false;
  }

  
  return {
    parseFenFullmove,
    countPieces,
    phaseTagsForFen,
    isSquare,
    squareToFileRank,
    fileRankToSquare,
    attacksFrom,
    hasRecapture,
    isForkByMovedPiece,
    isDoubleAttackByMovedPiece,
    isMateIn1ByUci,
    countCheckingMoves,
    computeAttackCounts,
    computeLooseUnprotectedTags,
    isDiscoveredAttackByMove
  };
}

module.exports = { buildBoardHelpers };

export {};
