// Blunders stats helpers extracted from server.js.
// Includes rolling 3-month stats and 30-day student summary stats for AI coach comments.

function createBlundersStats(deps) {
  const threeMonthsAgoMs = deps?.threeMonthsAgoMs;
  const puzzleSortKeyMs = deps?.puzzleSortKeyMs;
  const puzzleDropPoints = deps?.puzzleDropPoints;
  const isMissMatePuzzle = deps?.isMissMatePuzzle;
  const blundersBucketKeyOfPuzzle = deps?.blundersBucketKeyOfPuzzle;

  if (typeof threeMonthsAgoMs !== 'function') throw new Error('createBlundersStats: missing deps.threeMonthsAgoMs');
  if (typeof puzzleSortKeyMs !== 'function') throw new Error('createBlundersStats: missing deps.puzzleSortKeyMs');
  if (typeof puzzleDropPoints !== 'function') throw new Error('createBlundersStats: missing deps.puzzleDropPoints');
  if (typeof isMissMatePuzzle !== 'function') throw new Error('createBlundersStats: missing deps.isMissMatePuzzle');
  if (typeof blundersBucketKeyOfPuzzle !== 'function') throw new Error('createBlundersStats: missing deps.blundersBucketKeyOfPuzzle');

  function computeRolling3mStats({ analyzedMap, puzzles }) {
    const cutoffMs = threeMonthsAgoMs();
    const analyzed = (analyzedMap && typeof analyzedMap === 'object') ? analyzedMap : {};
    const list = Array.isArray(puzzles) ? puzzles : [];

    let totalPlies = 0;
    let oppSum = 0;
    let oppN = 0;
    let gamesN = 0;
    for (const v of Object.values(analyzed)) {
      const endSec = Number(v?.endTime || 0);
      if (!(Number.isFinite(endSec) && endSec > 0)) continue;
      const endMs = endSec * 1000;
      if (endMs < cutoffMs) continue;
      gamesN++;
      const pc = Number(v?.plyCount || 0);
      if (Number.isFinite(pc) && pc > 0) totalPlies += pc;
      const r = Number(v?.opponentRating ?? NaN);
      if (Number.isFinite(r) && r > 0) { oppSum += r; oppN++; }
    }

    let cGt1 = 0, cGt2 = 0, cGt3 = 0, cMiss = 0;
    for (const p of list) {
      const t = puzzleSortKeyMs(p);
      if (!(Number.isFinite(t) && t > 0) || t < cutoffMs) continue;
      if (isMissMatePuzzle(p)) cMiss++;
      const dp = puzzleDropPoints(p);
      if (dp > 1.0) cGt1++;
      if (dp > 2.0) cGt2++;
      if (dp > 3.0) cGt3++;
    }

    const movesPer = (count) => (count > 0 && totalPlies > 0) ? (totalPlies / count) : null;
    const avgOpp = (oppN > 0) ? (oppSum / oppN) : null;
    return {
      cutoffIso: new Date(cutoffMs).toISOString(),
      analyzedGames: gamesN,
      totalPlies,
      avgOpponentRating: avgOpp,
      counts: { gt1: cGt1, gt2: cGt2, gt3: cGt3, missMate: cMiss },
      movesPer: { gt1: movesPer(cGt1), gt2: movesPer(cGt2), gt3: movesPer(cGt3), missMate: movesPer(cMiss) }
    };
  }

  function computeRollingWindowStats({ analyzedMap, puzzles, cutoffMs }) {
    const analyzed = (analyzedMap && typeof analyzedMap === 'object') ? analyzedMap : {};
    const list = Array.isArray(puzzles) ? puzzles : [];

    let totalPlies = 0;
    let oppSum = 0;
    let oppN = 0;
    let gamesN = 0;
    for (const v of Object.values(analyzed)) {
      const endSec = Number(v?.endTime || 0);
      if (!(Number.isFinite(endSec) && endSec > 0)) continue;
      const endMs = endSec * 1000;
      if (endMs < cutoffMs) continue;
      gamesN++;
      const pc = Number(v?.plyCount || 0);
      if (Number.isFinite(pc) && pc > 0) totalPlies += pc;
      const r = Number(v?.opponentRating ?? NaN);
      if (Number.isFinite(r) && r > 0) { oppSum += r; oppN++; }
    }

    let cGt1 = 0, cGt2 = 0, cGt3 = 0, cMiss = 0;
    for (const p of list) {
      const t = puzzleSortKeyMs(p);
      if (!(Number.isFinite(t) && t > 0) || t < cutoffMs) continue;
      if (isMissMatePuzzle(p)) cMiss++;
      const dp = puzzleDropPoints(p);
      if (dp > 1.0) cGt1++;
      if (dp > 2.0) cGt2++;
      if (dp > 3.0) cGt3++;
    }

    const movesPer = (count) => (count > 0 && totalPlies > 0) ? (totalPlies / count) : null;
    const avgOpp = (oppN > 0) ? (oppSum / oppN) : null;
    return {
      cutoffIso: new Date(cutoffMs).toISOString(),
      analyzedGames: gamesN,
      totalPlies,
      avgOpponentRating: avgOpp,
      counts: { gt1: cGt1, gt2: cGt2, gt3: cGt3, missMate: cMiss },
      movesPer: { gt1: movesPer(cGt1), gt2: movesPer(cGt2), gt3: movesPer(cGt3), missMate: movesPer(cMiss) }
    };
  }

  function computeStudentMonthStats({ orgId, studentId, puzzles, analyzedMap }) {
    const now = Date.now();
    const cutoffMs = now - 30 * 24 * 60 * 60 * 1000;
    const prevCutoffMs = now - 60 * 24 * 60 * 60 * 1000;

    const mine = (Array.isArray(puzzles) ? puzzles : [])
      .filter(p => String(p.orgId || '') === String(orgId || '') && String(p.scope || '') !== 'master' && String(p.studentId || '') === String(studentId || ''));

    const inWindow = (p) => {
      const t = puzzleSortKeyMs(p);
      return Number.isFinite(t) && t > 0 && t >= cutoffMs;
    };
    const inPrevWindow = (p) => {
      const t = puzzleSortKeyMs(p);
      return Number.isFinite(t) && t > 0 && t >= prevCutoffMs && t < cutoffMs;
    };

    const cur = mine.filter(inWindow);
    const prev = mine.filter(inPrevWindow);

    const countPack = (arr) => {
      const out = {
        total: arr.length,
        pending: arr.filter(p => String(p.status || 'pending') !== 'completed').length,
        completed: arr.filter(p => String(p.status || '') === 'completed').length,
        missMate: 0,
        buckets: { d1: 0, d2: 0, d3: 0, d4: 0 },
        avgDrop: null,
        topTags: {}
      };
      let dropSum = 0;
      let dropN = 0;
      for (const p of arr) {
        const bk = blundersBucketKeyOfPuzzle(p);
        if (bk === 'missMate') out.missMate++;
        else out.buckets[bk] = (out.buckets[bk] || 0) + 1;
        const dp = puzzleDropPoints(p);
        if (Number.isFinite(dp) && dp > 0 && !isMissMatePuzzle(p)) { dropSum += dp; dropN++; }
        const tags = Array.isArray(p?.tags) ? p.tags.map(String).filter(Boolean) : [];
        for (const t of tags) out.topTags[t] = (out.topTags[t] || 0) + 1;
      }
      out.avgDrop = dropN > 0 ? (dropSum / dropN) : null;
      out.completionRate = out.total > 0 ? (out.completed / out.total) : null;
      return out;
    };

    const curPack = countPack(cur);
    const prevPack = countPack(prev);
    const rolling30d = computeRollingWindowStats({ analyzedMap, puzzles: mine, cutoffMs });

    return {
      range: 'month',
      cutoffIso: new Date(cutoffMs).toISOString(),
      nowIso: new Date(now).toISOString(),
      current: curPack,
      previous: prevPack,
      delta: {
        completionRate: (curPack.completionRate !== null && prevPack.completionRate !== null) ? (curPack.completionRate - prevPack.completionRate) : null,
        avgDrop: (curPack.avgDrop !== null && prevPack.avgDrop !== null) ? (curPack.avgDrop - prevPack.avgDrop) : null,
        missMate: (Number(curPack.missMate || 0) - Number(prevPack.missMate || 0))
      },
      rolling30d
    };
  }

  return {
    computeRolling3mStats,
    computeRollingWindowStats,
    computeStudentMonthStats
  };
}

module.exports = { createBlundersStats };


