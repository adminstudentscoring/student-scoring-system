'use strict';

function registerVcpChessSession(ctx: any): void {
  const { vcp } = ctx;

  function vcpCreateInitialChessState(session: any) {
    const minutes = Math.max(1, Math.min(60, Number(session?.config?.minutes) || 3));
    const wMs = minutes * 60 * 1000;
    const bMs = minutes * 60 * 1000;
    return {
      board: ctx.vcpInitialBoard(),
      turn: 'w',
      turnStartTs: Date.now(),
      clocks: { wMs, bMs },
      moveNumber: 1,
      castling: 'KQkq',
      ep: null,
      drawOffer: null, // { from: 'w'|'b', atTs }
      gameOver: false,
      gameOverReason: null,
      history: [] // [{ from,to,promo,by,atTs,moveNumber }]
    };
  }

  function vcpUpdateClocksForMove(state: any, incrementSec: any) {
    const now = Date.now();
    const turn = String(state.turn || 'w');
    const elapsed = Math.max(0, now - Number(state.turnStartTs || now));
    if (turn === 'w') state.clocks.wMs = Math.max(0, Number(state.clocks.wMs || 0) - elapsed);
    else state.clocks.bMs = Math.max(0, Number(state.clocks.bMs || 0) - elapsed);
    // add increment to the mover after move
    if (turn === 'w') state.clocks.wMs += incrementSec * 1000;
    else state.clocks.bMs += incrementSec * 1000;
    state.turnStartTs = now;
  }

  function vcpApplyChessMove(session: any, moverId: any, { from, to, promo }: any) {
    const cfg = session.config || {};
    const whiteId = String(cfg.whiteStudentId || '');
    const blackId = String(cfg.blackStudentId || '');
    const moverColor = String(moverId) === whiteId ? 'w' : String(moverId) === blackId ? 'b' : null;
    if (!moverColor) return { ok: false, error: 'Not a player' };

    const st = session.chessState;
    if (!st || st.gameOver) return { ok: false, error: 'Game not active' };
    if (String(st.turn || 'w') !== moverColor) return { ok: false, error: 'Not your turn' };

    // Time spent on this move (A: per-move thinking time)
    const nowTs = Date.now();
    const spentMs = Math.max(0, nowTs - Number(st.turnStartTs || nowTs));

    const board = st.board;
    const a = ctx.vcpCoordToRc(from);
    const z = ctx.vcpCoordToRc(to);
    if (!a || !z) return { ok: false, error: 'Invalid coordinates' };
    const piece = board[a.r][a.c];
    if (!piece || ctx.vcpPieceColor(piece) !== moverColor) return { ok: false, error: 'Invalid piece' };

    if (!ctx.vcpLegalMove(st, from, to, moverColor, promo)) return { ok: false, error: 'Illegal move' };

    // SAN (PGN) record based on current state before applying move
    const san = ctx.vcpSanForMove(st, from, to, promo, moverColor);

    const inc = Math.max(0, Math.min(60, Number(cfg.incrementSec) || 0));
    // clock update for mover (uses current turn)
    vcpUpdateClocksForMove(st, inc);

    // apply move (incl castling / en passant / promotion / ep / castling rights)
    const next = ctx.vcpApplyMoveToState(st, from, to, promo);
    if (!next) return { ok: false, error: 'Illegal move' };
    st.board = next.board;
    st.castling = next.castling;
    st.ep = next.ep;
    st.drawOffer = null; // clear any outstanding draw offer on move
    if (!Array.isArray(st.history)) st.history = [];
    st.history.push({
      from: String(from),
      to: String(to),
      promo: String(promo || 'q').toLowerCase(),
      san: String(san || ''),
      spentMs,
      by: String(moverId),
      atTs: Date.now(),
      moveNumber: Number(st.moveNumber || 1)
    });
    st.turn = ctx.vcpOpp(String(st.turn || 'w'));
    st.moveNumber = Number(st.moveNumber || 1) + 1;

    // timeout check (if mover used all time before moving)
    if (Number(st.clocks.wMs || 0) <= 0 || Number(st.clocks.bMs || 0) <= 0) {
      st.gameOver = true;
      st.gameOverReason = 'Time out';
    }

    // Checkmate / stalemate detection (server-authoritative)
    if (!st.gameOver) {
      const sideToMove = String(st.turn || 'w');
      const hasMove = ctx.vcpHasAnyLegalMove(st, sideToMove);
      if (!hasMove) {
        const inCheck = ctx.vcpIsInCheck(st.board, sideToMove);
        st.gameOver = true;
        st.gameOverReason = inCheck ? 'Checkmate' : 'Stalemate';
      }
    }

    session.chessState = st;
    vcp.sessions.set(String(session.id), session);
    return { ok: true };
  }

  Object.assign(ctx, {
    vcpCreateInitialChessState,
    vcpUpdateClocksForMove,
    vcpApplyChessMove
  });
}

module.exports = { registerVcpChessSession };
export {};
