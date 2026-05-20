'use strict';

function registerVcpChessMoves(ctx: any): void {
  function vcpApplyMoveToBoard(board: any, from: any, to: any, promo: any) {
    const b = ctx.vcpCloneBoard(board);
    const a = ctx.vcpCoordToRc(from);
    const z = ctx.vcpCoordToRc(to);
    if (!a || !z) return null;
    const p = b[a.r][a.c];
    b[a.r][a.c] = '';
    let placed = p;
    if ((p === 'P' && z.r === 0) || (p === 'p' && z.r === 7)) {
      placed = ctx.vcpPieceColor(p) === 'w' ? 'Q' : 'q';
      const up = String(promo || 'q').toLowerCase();
      if (['q','r','b','n'].includes(up)) placed = ctx.vcpPieceColor(p) === 'w' ? up.toUpperCase() : up;
    }
    b[z.r][z.c] = placed;
    return b;
  }

  function vcpGenPseudoMoves(board: any, from: any, color: any) {
    const a = ctx.vcpCoordToRc(from);
    if (!a) return [];
    const p = board[a.r][a.c];
    if (!p || ctx.vcpPieceColor(p) !== color) return [];
    const up = p.toUpperCase();
    const moves = [];
    const add = (rr: any, cc: any) => {
      if (!ctx.vcpInBounds(rr, cc)) return;
      const t = board[rr][cc];
      if (!t) moves.push({ to: ctx.vcpRcToCoord(rr, cc) });
      else if (ctx.vcpPieceColor(t) !== color) moves.push({ to: ctx.vcpRcToCoord(rr, cc) });
    };

    if (up === 'P') {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const oneR = a.r + dir;
      if (ctx.vcpInBounds(oneR, a.c) && !board[oneR][a.c]) {
        moves.push({ to: ctx.vcpRcToCoord(oneR, a.c) });
        const twoR = a.r + dir * 2;
        if (a.r === startRow && ctx.vcpInBounds(twoR, a.c) && !board[twoR][a.c]) moves.push({ to: ctx.vcpRcToCoord(twoR, a.c) });
      }
      for (const dc of [-1, 1]) {
        const rr = a.r + dir, cc = a.c + dc;
        if (!ctx.vcpInBounds(rr, cc)) continue;
        const t = board[rr][cc];
        if (t && ctx.vcpPieceColor(t) !== color) moves.push({ to: ctx.vcpRcToCoord(rr, cc) });
      }
      return moves;
    }

    if (up === 'N') {
      const d = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr, dc] of d) add(a.r + dr, a.c + dc);
      return moves;
    }

    if (up === 'K') {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        add(a.r + dr, a.c + dc);
      }
      return moves;
    }

    const dirs = [];
    if (up === 'B' || up === 'Q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
    if (up === 'R' || up === 'Q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
    for (const [dr, dc] of dirs) {
      let rr = a.r + dr, cc = a.c + dc;
      while (ctx.vcpInBounds(rr, cc)) {
        const t = board[rr][cc];
        if (!t) moves.push({ to: ctx.vcpRcToCoord(rr, cc) });
        else {
          if (ctx.vcpPieceColor(t) !== color) moves.push({ to: ctx.vcpRcToCoord(rr, cc) });
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return moves;
  }

  function vcpHasCastleRight(castling: any, right: any) {
    return String(castling || '').includes(right);
  }

  function vcpIsCastleMove(piece: any, from: any, to: any) {
    if (!piece) return false;
    if (piece.toUpperCase() !== 'K') return false;
    return (
      (from === 'e1' && (to === 'g1' || to === 'c1')) ||
      (from === 'e8' && (to === 'g8' || to === 'c8'))
    );
  }

  function vcpUpdateCastlingRights(castling: any, from: any, to: any, movedPiece: any, capturedPiece: any) {
    let s = String(castling || '');
    const remove = (ch: any) => { s = s.replace(ch, ''); };

    if (movedPiece === 'K') { remove('K'); remove('Q'); }
    if (movedPiece === 'k') { remove('k'); remove('q'); }

    if (movedPiece === 'R') {
      if (from === 'h1') remove('K');
      if (from === 'a1') remove('Q');
    }
    if (movedPiece === 'r') {
      if (from === 'h8') remove('k');
      if (from === 'a8') remove('q');
    }

    if (capturedPiece === 'R') {
      if (to === 'h1') remove('K');
      if (to === 'a1') remove('Q');
    }
    if (capturedPiece === 'r') {
      if (to === 'h8') remove('k');
      if (to === 'a8') remove('q');
    }
    return s;
  }

  function vcpApplyMoveToState(state: any, from: any, to: any, promo: any) {
    const board = state.board;
    const a = ctx.vcpCoordToRc(from);
    const z = ctx.vcpCoordToRc(to);
    if (!a || !z) return null;
    const piece = board[a.r][a.c];
    const captured = board[z.r][z.c] || '';

    const next = {
      ...state,
      board: ctx.vcpCloneBoard(board),
      ep: null,
      castling: String(state.castling || '')
    };

    // castling
    if (vcpIsCastleMove(piece, from, to)) {
      next.board[a.r][a.c] = '';
      next.board[z.r][z.c] = piece;
      if (to === 'g1') { next.board[7][7] = ''; next.board[7][5] = 'R'; }
      if (to === 'c1') { next.board[7][0] = ''; next.board[7][3] = 'R'; }
      if (to === 'g8') { next.board[0][7] = ''; next.board[0][5] = 'r'; }
      if (to === 'c8') { next.board[0][0] = ''; next.board[0][3] = 'r'; }
      next.castling = vcpUpdateCastlingRights(next.castling, from, to, piece, captured);
      return next;
    }

    // en passant capture
    if (piece && piece.toUpperCase() === 'P' && String(state.ep || '') === to && !captured) {
      if (piece === 'P') {
        const capR = z.r + 1;
        if (ctx.vcpInBounds(capR, z.c)) next.board[capR][z.c] = '';
      } else {
        const capR = z.r - 1;
        if (ctx.vcpInBounds(capR, z.c)) next.board[capR][z.c] = '';
      }
    }

    // normal move + promotion
    next.board[a.r][a.c] = '';
    let placed = piece;
    if ((piece === 'P' && z.r === 0) || (piece === 'p' && z.r === 7)) {
      let up = String(promo || 'q').toLowerCase();
      if (!['q', 'r', 'b', 'n'].includes(up)) up = 'q';
      placed = ctx.vcpPieceColor(piece) === 'w' ? up.toUpperCase() : up;
    }
    next.board[z.r][z.c] = placed;

    next.castling = vcpUpdateCastlingRights(next.castling, from, to, piece, captured);

    // set ep square on double pawn push
    if (piece && piece.toUpperCase() === 'P') {
      const color = ctx.vcpPieceColor(piece);
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      if (a.r === startRow && z.r === a.r + dir * 2) {
        const epR = a.r + dir;
        next.ep = ctx.vcpRcToCoord(epR, a.c);
      }
    }
    return next;
  }

  function vcpIsCastlePathSafe(board: any, color: any, to: any, castling: any) {
    if (ctx.vcpIsInCheck(board, color)) return false;
    if (color === 'w') {
      if (to === 'g1') {
        if (!vcpHasCastleRight(castling, 'K')) return false;
        const f1 = ctx.vcpCoordToRc('f1'), g1 = ctx.vcpCoordToRc('g1'), h1 = ctx.vcpCoordToRc('h1');
        if (!f1 || !g1 || !h1) return false;
        if (board[f1.r][f1.c] || board[g1.r][g1.c]) return false;
        if (board[h1.r][h1.c] !== 'R') return false;
        if (ctx.vcpIsSquareAttacked(board, f1.r, f1.c, 'b')) return false;
        if (ctx.vcpIsSquareAttacked(board, g1.r, g1.c, 'b')) return false;
        return true;
      }
      if (to === 'c1') {
        if (!vcpHasCastleRight(castling, 'Q')) return false;
        const d1 = ctx.vcpCoordToRc('d1'), c1 = ctx.vcpCoordToRc('c1'), b1 = ctx.vcpCoordToRc('b1'), a1 = ctx.vcpCoordToRc('a1');
        if (!d1 || !c1 || !b1 || !a1) return false;
        if (board[d1.r][d1.c] || board[c1.r][c1.c] || board[b1.r][b1.c]) return false;
        if (board[a1.r][a1.c] !== 'R') return false;
        if (ctx.vcpIsSquareAttacked(board, d1.r, d1.c, 'b')) return false;
        if (ctx.vcpIsSquareAttacked(board, c1.r, c1.c, 'b')) return false;
        return true;
      }
    } else {
      if (to === 'g8') {
        if (!vcpHasCastleRight(castling, 'k')) return false;
        const f8 = ctx.vcpCoordToRc('f8'), g8 = ctx.vcpCoordToRc('g8'), h8 = ctx.vcpCoordToRc('h8');
        if (!f8 || !g8 || !h8) return false;
        if (board[f8.r][f8.c] || board[g8.r][g8.c]) return false;
        if (board[h8.r][h8.c] !== 'r') return false;
        if (ctx.vcpIsSquareAttacked(board, f8.r, f8.c, 'w')) return false;
        if (ctx.vcpIsSquareAttacked(board, g8.r, g8.c, 'w')) return false;
        return true;
      }
      if (to === 'c8') {
        if (!vcpHasCastleRight(castling, 'q')) return false;
        const d8 = ctx.vcpCoordToRc('d8'), c8 = ctx.vcpCoordToRc('c8'), b8 = ctx.vcpCoordToRc('b8'), a8 = ctx.vcpCoordToRc('a8');
        if (!d8 || !c8 || !b8 || !a8) return false;
        if (board[d8.r][d8.c] || board[c8.r][c8.c] || board[b8.r][b8.c]) return false;
        if (board[a8.r][a8.c] !== 'r') return false;
        if (ctx.vcpIsSquareAttacked(board, d8.r, d8.c, 'w')) return false;
        if (ctx.vcpIsSquareAttacked(board, c8.r, c8.c, 'w')) return false;
        return true;
      }
    }
    return false;
  }

  function vcpLegalMove(state: any, from: any, to: any, color: any, promo: any) {
    const board = state.board;
    const a = ctx.vcpCoordToRc(from);
    const z = ctx.vcpCoordToRc(to);
    if (!a || !z) return false;
    const piece = board[a.r][a.c];
    if (!piece || ctx.vcpPieceColor(piece) !== color) return false;

    if (vcpIsCastleMove(piece, from, to)) {
      if (!vcpIsCastlePathSafe(board, color, to, state.castling)) return false;
      const next = vcpApplyMoveToState(state, from, to, promo);
      if (!next) return false;
      return !ctx.vcpIsInCheck(next.board, color);
    }

    const pseudo = vcpGenPseudoMoves(board, from, color);
    const canEP = piece.toUpperCase() === 'P' && String(state.ep || '') === String(to || '');
    if (!pseudo.some(m => m.to === to) && !canEP) return false;

    if (canEP) {
      const dir = color === 'w' ? -1 : 1;
      if (z.r !== a.r + dir) return false;
      if (Math.abs(z.c - a.c) !== 1) return false;
      if (board[z.r][z.c]) return false;
    }

    const next = vcpApplyMoveToState(state, from, to, promo);
    if (!next) return false;
    return !ctx.vcpIsInCheck(next.board, color);
  }

  Object.assign(ctx, {
    vcpApplyMoveToBoard,
    vcpGenPseudoMoves,
    vcpHasCastleRight,
    vcpIsCastleMove,
    vcpUpdateCastlingRights,
    vcpApplyMoveToState,
    vcpIsCastlePathSafe,
    vcpLegalMove
  });
}

module.exports = { registerVcpChessMoves };
export {};
