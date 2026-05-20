'use strict';

function registerVcpChessSan(ctx: any): void {
  function vcpHasAnyLegalMove(state: any, color: any) {
    const board = state?.board;
    if (!board) return false;
    // brute force (64x64 max) but only used on check situations for SAN suffix
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p || ctx.vcpPieceColor(p) !== color) continue;
        const from = ctx.vcpRcToCoord(r, c);
        for (let rr = 0; rr < 8; rr++) {
          for (let cc = 0; cc < 8; cc++) {
            if (rr === r && cc === c) continue;
            const to = ctx.vcpRcToCoord(rr, cc);
            // Promotions: try all four; otherwise default 'q'
            const isPawn = p.toUpperCase() === 'P';
            const lastRank = color === 'w' ? 8 : 1;
            const toRank = Number(String(to)[1] || 0);
            const promos = (isPawn && toRank === lastRank) ? ['q', 'r', 'b', 'n'] : ['q'];
            for (const promo of promos) {
              if (ctx.vcpLegalMove(state, from, to, color, promo)) return true;
            }
          }
        }
      }
    }
    return false;
  }

  function vcpSanForMove(state: any, from: any, to: any, promo: any, moverColor: any) {
    const a = ctx.vcpCoordToRc(from);
    const z = ctx.vcpCoordToRc(to);
    if (!a || !z) return '';
    const board = state?.board;
    if (!board) return '';
    const p = board[a.r][a.c];
    if (!p) return '';
    const up = p.toUpperCase();

    // Castling
    if (up === 'K' && String(from) === (moverColor === 'w' ? 'e1' : 'e8')) {
      if (String(to) === (moverColor === 'w' ? 'g1' : 'g8')) return 'O-O';
      if (String(to) === (moverColor === 'w' ? 'c1' : 'c8')) return 'O-O-O';
    }

    const destPiece = board[z.r][z.c];
    const isPawn = up === 'P';
    const isCapture = (() => {
      if (destPiece) return true;
      // En passant capture: pawn moves diagonally onto empty square equal to ep target
      const ep = state?.ep;
      if (!ep || !isPawn) return false;
      if (String(ep) !== String(to)) return false;
      if (a.c === z.c) return false;
      return true;
    })();

    const pieceLetter = isPawn ? '' : up;

    // Disambiguation for pieces (except pawns)
    let disamb = '';
    if (!isPawn && up !== 'K') {
      const candidates = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (r === a.r && c === a.c) continue;
          const pp = board[r][c];
          if (!pp) continue;
          if (ctx.vcpPieceColor(pp) !== moverColor) continue;
          if (pp.toUpperCase() !== up) continue;
          const cf = ctx.vcpRcToCoord(r, c);
          if (ctx.vcpLegalMove(state, cf, to, moverColor, String(promo || 'q'))) {
            candidates.push({ r, c, coord: cf });
          }
        }
      }
      if (candidates.length) {
        const fromFile = String(from)[0];
        const fromRank = String(from)[1];
        const sameFile = candidates.some(x => String(x.coord)[0] === fromFile);
        const sameRank = candidates.some(x => String(x.coord)[1] === fromRank);
        if (!sameFile) disamb = fromFile;
        else if (!sameRank) disamb = fromRank;
        else disamb = `${fromFile}${fromRank}`;
      }
    }

    // Pawn capture includes file of origin
    const originFile = String(from)[0];
    const capturePrefix = isPawn && isCapture ? originFile : '';

    // Promotion
    const promoStr = (() => {
      const toRank = Number(String(to)[1] || 0);
      if (!isPawn) return '';
      if (moverColor === 'w' && toRank !== 8) return '';
      if (moverColor === 'b' && toRank !== 1) return '';
      const pr = String(promo || 'q').toLowerCase();
      const ok = ['q', 'r', 'b', 'n'].includes(pr) ? pr : 'q';
      return `=${ok.toUpperCase()}`;
    })();

    let san = `${pieceLetter}${disamb}${capturePrefix}${isCapture ? 'x' : ''}${String(to)}${promoStr}`;

    // Check / mate suffix
    try {
      const next = ctx.vcpApplyMoveToState(state, from, to, promo);
      const opp = ctx.vcpOpp(moverColor);
      if (next && ctx.vcpIsInCheck(next.board, opp)) {
        const hasReply = vcpHasAnyLegalMove(next, opp);
        san += hasReply ? '+' : '#';
      }
    } catch {}

    return san;
  }

  Object.assign(ctx, { vcpHasAnyLegalMove, vcpSanForMove });
}

module.exports = { registerVcpChessSan };
export {};
