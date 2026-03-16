// Blunders evaluation / verdict helpers extracted from server.js.

function createBlundersEval(deps: any): any {
  const Chess = deps?.Chess;
  const parseUciMove = deps?.parseUciMove;

  if (!Chess) throw new Error('createBlundersEval: missing deps.Chess');
  if (typeof parseUciMove !== 'function') throw new Error('createBlundersEval: missing deps.parseUciMove');

  function scoreToCp(score) {
    if (!score) return 0;
    if (typeof score.mate === 'number' && Number.isFinite(score.mate)) {
      const sign = score.mate === 0 ? 0 : (score.mate > 0 ? 1 : -1);
      return sign * 100000; // treat mate as huge advantage
    }
    if (typeof score.cp === 'number' && Number.isFinite(score.cp)) return score.cp;
    return 0;
  }

  // ===== Blunders: tolerant verdict rules =====
  // 1) Treat a move as "best" if it's within 20% of the best score, with a small-score floor.
  // 2) Compare any candidate move directly against the best (by score drop).
  // 3) If best position is mate or a huge advantage (>= +8.0), but the move still keeps >= +5.0, treat as "good".
  const BLUNDERS_BEST_TOL_RATIO = 0.20;
  const BLUNDERS_BEST_TOL_MIN_CP = 10; // 0.10
  const BLUNDERS_MATE_OR_HUGE_CP = 800; // 8.0
  const BLUNDERS_GOOD_IF_STILL_AHEAD_CP = 500; // 5.0

  function blundersVerdictFromScores(bestCp, userCp, thresholdPoints) {
    const b = Number(bestCp || 0);
    const u = Number(userCp || 0);
    const thrP = Math.max(0, Number(thresholdPoints || 0));

    const dropCp = b - u; // positive => worse than best
    const tolCp = Math.max(Math.round(Math.abs(b) * BLUNDERS_BEST_TOL_RATIO), BLUNDERS_BEST_TOL_MIN_CP);
    const isBestLike = dropCp <= tolCp;

    const isMateOrHugeWin = b >= 100000 || b >= BLUNDERS_MATE_OR_HUGE_CP;
    const stillBigWin = u >= BLUNDERS_GOOD_IF_STILL_AHEAD_CP;
    const allowGoodInMateOrHuge = isMateOrHugeWin && stillBigWin;

    const dropPoints = dropCp / 100;
    if (isBestLike) return { verdict: 'best', ok: true, dropCp, dropPoints, tolCp, bestLike: true };
    if (allowGoodInMateOrHuge) return { verdict: 'good', ok: true, dropCp, dropPoints, tolCp, bestLike: false, hugeSaved: true };
    if (dropPoints > thrP) return { verdict: 'blunder', ok: false, dropCp, dropPoints, tolCp, bestLike: false };
    return { verdict: 'good', ok: true, dropCp, dropPoints, tolCp, bestLike: false };
  }

  function uciToSanAtFen(fen, uci) {
    const startFen = String(fen || '');
    const u = String(uci || '').trim().toLowerCase();
    if (!startFen || !u) return '';
    const parsed = parseUciMove(u);
    if (!parsed) return '';
    let chess = null;
    try { chess = new Chess(startFen); } catch { chess = null; }
    if (!chess) return '';
    const mv = chess.move({ from: parsed.from, to: parsed.to, promotion: parsed.promotion });
    if (!mv) return '';
    return String(mv.san || '');
  }

  return {
    scoreToCp,
    blundersVerdictFromScores,
    uciToSanAtFen,
    // Export constants for introspection/testing if needed
    BLUNDERS_BEST_TOL_RATIO,
    BLUNDERS_BEST_TOL_MIN_CP,
    BLUNDERS_MATE_OR_HUGE_CP,
    BLUNDERS_GOOD_IF_STILL_AHEAD_CP
  };
}

module.exports = { createBlundersEval };


