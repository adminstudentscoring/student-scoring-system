// Blunders Challenge + Leaderboard module. Depends on window.BlundersCore + window.BlundersEntryApi.
(function () {
  const C = window.BlundersCore;
  if (!C) {
    console.error('BlundersCore missing. Load /game/blunders/core.js first.');
    return;
  }

  const {
    escapeHtml,
    STATE,
    challengeStart,
    challengeAttempt,
    fetchChallengeLeaderboard
  } = C;

  function entry() {
    const e = window.BlundersEntryApi;
    if (!e) throw new Error('BlundersEntryApi missing. Load /game/blunders/blunders.js after this file.');
    return e;
  }

  function challengeCurrentPuzzle() {
    return STATE.challenge && STATE.challenge.puzzle ? STATE.challenge.puzzle : null;
  }

  function clearChallengeUi() {
    STATE.uiBoard.challengeVerdict = '';
    STATE.uiBoard.challengeMoveUci = '';
    STATE.uiBoard.challengeMoveSan = '';
    STATE.uiBoard.challengeBestMoveUci = '';
    STATE.uiBoard.challengeBestMoveSan = '';
    STATE.uiBoard.challengeBestOrigin = '';
    STATE.uiBoard.challengeFen = '';
    STATE.selectedFrom = null;
  }

  function renderChallengePage() {
    const ch = STATE.challenge || {};
    const pz = challengeCurrentPuzzle();
    const diff = String(ch.difficulty || 'easy');
    const diffBtns = [
      { k: 'easy', label: 'Easy (1.0–1.9)', points: 1 },
      { k: 'medium', label: 'Medium (2.0–2.9)', points: 2 },
      { k: 'hard', label: 'Hard (3.0+)', points: 3 }
    ];
    const flip = pz ? String(pz.studentColor || '') === 'b' : false;
    const fenOverride = String(STATE.uiBoard.challengeFen || pz?.startFEN || '');
    const myMoveUci = String(STATE.uiBoard.challengeMoveUci || '');
    const statusLine = ch.done
      ? `Completed! You earned <strong>${escapeHtml(String(ch.pointsAward || 0))}</strong> point(s). Total: <strong>${escapeHtml(String(ch.totalPoints ?? '—'))}</strong>`
      : `Progress: <strong>${escapeHtml(String(ch.correct || 0))}</strong> / <strong>${escapeHtml(String(ch.target || 10))}</strong>`;
    const pct = (!ch.done && (Number(ch.target || 10) > 0))
      ? Math.max(0, Math.min(100, Math.round((Number(ch.correct || 0) / Number(ch.target || 10)) * 100)))
      : (ch.done ? 100 : 0);

    return `
      <div class="bl-card">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
          <div>
            <div class="bl-title">Challenge</div>
            <div class="blunders-muted">${ch.ratingBucket ? `Rating group: <strong>${escapeHtml(String(ch.ratingBucket))}</strong>` : 'Solve 10 puzzles to earn points.'}</div>
          </div>
          <div style="text-align:right;">
            <button class="btn btn-secondary btn-small" type="button" data-bl-challenge-refresh>Refresh</button>
          </div>
        </div>

        <div class="bl-card" style="box-shadow:none; margin-top:10px;">
          <div class="blunders-muted">${statusLine}</div>
          <div style="margin-top:10px; height:10px; background:#e5e7eb; border-radius:999px; overflow:hidden;">
            <div style="width:${escapeHtml(String(pct))}%; height:100%; background:#2563eb;"></div>
          </div>
          ${ch.error ? `<div class="blunders-muted" style="margin-top:8px; color:#b91c1c;">${escapeHtml(String(ch.error))}</div>` : ``}
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
          ${diffBtns.map(b => `
            <button class="btn ${diff === b.k ? 'btn-info' : 'btn-secondary'}" type="button" data-bl-challenge-diff="${escapeHtml(b.k)}" ${ch.loading ? 'disabled' : ''}>
              ${escapeHtml(b.label)} · +${escapeHtml(String(b.points))}
            </button>
          `).join('')}
          <button class="btn btn-primary" type="button" data-bl-challenge-start ${ch.loading ? 'disabled' : ''}>Start (10)</button>
        </div>

        ${pz ? `
          <div class="bl-board-wrap" style="margin-top:12px;">
            <div>
              ${entry().renderBoardForPuzzle(pz, flip, STATE.selectedFrom, { fenOverride, myMoveUci })}
            </div>
            <div>
              <div class="bl-card" style="box-shadow:none;">
                <div style="font-weight:950; color:#111827;">Puzzle</div>
                <div class="blunders-muted" style="margin-top:6px;">Drop ${escapeHtml(Number(pz.dropPoints || 0).toFixed(2))}</div>
                ${pz.gameUrl ? `<div class="blunders-muted" style="margin-top:6px;">Source: <a href="${escapeHtml(String(pz.gameUrl))}" target="_blank" rel="noopener noreferrer">Chess.com</a></div>` : ''}
                <div class="blunders-muted" id="blChallengeMsg" style="margin-top:10px;"></div>
              </div>
              ${entry().renderInlineResultPanel('challenge')}
            </div>
          </div>
        ` : `
          <div class="blunders-muted" style="margin-top:12px;">No active challenge. Choose a difficulty and click Start.</div>
        `}
      </div>
    `;
  }

  function renderLeaderboardPage() {
    const lb = STATE.leaderboard || {};
    const entries = Array.isArray(lb.entries) ? lb.entries : [];
    return `
      <div class="bl-card">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
          <div>
            <div class="bl-title">Leaderboard</div>
            <div class="blunders-muted">Challenge mode total points.</div>
          </div>
          <div style="text-align:right;">
            <button class="btn btn-secondary btn-small" type="button" data-bl-lb-refresh ${lb.loading ? 'disabled' : ''}>Refresh</button>
          </div>
        </div>

        <div class="bl-card" style="box-shadow:none; margin-top:10px;">
          <div class="blunders-muted">Your total: <strong>${escapeHtml(String(lb.myTotal ?? 0))}</strong></div>
          ${lb.error ? `<div class="blunders-muted" style="margin-top:8px; color:#b91c1c;">${escapeHtml(String(lb.error))}</div>` : ``}
        </div>

        ${entries.length ? `
          <div style="margin-top:12px; overflow:auto;">
            <table style="width:100%; border-collapse:collapse;">
              <thead>
                <tr class="blunders-muted" style="text-align:left;">
                  <th style="padding:8px;">#</th>
                  <th style="padding:8px;">Student</th>
                  <th style="padding:8px;">Points</th>
                </tr>
              </thead>
              <tbody>
                ${entries.slice(0, 200).map((e, i) => `
                  <tr style="border-top:1px solid #e5e7eb;">
                    <td style="padding:8px;">${escapeHtml(String(i + 1))}</td>
                    <td style="padding:8px;">
                      <div style="font-weight:900; color:#111827;">${escapeHtml(String(e.name || 'Student'))}</div>
                      <div class="blunders-muted">${escapeHtml(String(e.studentId || ''))}</div>
                    </td>
                    <td style="padding:8px; font-weight:950; color:#111827;">${escapeHtml(String(e.totalPoints || 0))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `<div class="blunders-muted" style="margin-top:12px;">No scores yet.</div>`}
      </div>
    `;
  }

  async function challengeLoadLeaderboard() {
    if (!STATE.me?.id) return;
    STATE.leaderboard.loading = true;
    STATE.leaderboard.error = '';
    entry().render();
    try {
      const data = await fetchChallengeLeaderboard(STATE.me.id);
      STATE.leaderboard.entries = Array.isArray(data?.entries) ? data.entries : [];
      STATE.leaderboard.myTotal = Number(data?.myTotal || 0) || 0;
      STATE.leaderboard.loadedAt = new Date().toISOString();
      STATE.leaderboard.loading = false;
      entry().render();
    } catch (e) {
      STATE.leaderboard.loading = false;
      STATE.leaderboard.error = String(e?.message || e);
      entry().render();
    }
  }

  async function challengeStartOrRestart() {
    if (!STATE.me?.id) return;
    STATE.challenge.loading = true;
    STATE.challenge.error = '';
    STATE.challenge.done = false;
    STATE.challenge.nextPuzzle = null;
    entry().render();
    try {
      const out = await challengeStart(STATE.me.id, String(STATE.challenge.difficulty || 'easy'));
      STATE.challenge.sessionId = String(out?.sessionId || '');
      STATE.challenge.pointsAward = Number(out?.pointsAward || 0) || 0;
      STATE.challenge.ratingBucket = String(out?.ratingBucket || '');
      STATE.challenge.correct = Number(out?.correct || 0) || 0;
      STATE.challenge.target = Number(out?.target || 10) || 10;
      STATE.challenge.idx = Number(out?.idx || 0) || 0;
      STATE.challenge.puzzle = out?.puzzle || null;
      STATE.challenge.done = false;
      STATE.challenge.totalPoints = out?.totalPoints ?? null;
      entry().clearInlineResult('challenge');
      if (STATE.challenge.puzzle?.startFEN) STATE.uiBoard.challengeFen = String(STATE.challenge.puzzle.startFEN || '');
      STATE.challenge.loading = false;
      entry().render();
    } catch (e) {
      STATE.challenge.loading = false;
      STATE.challenge.error = String(e?.message || e);
      entry().render();
    }
  }

  async function submitChallengeMoveUci(uci, revealBest) {
    const puzzle = challengeCurrentPuzzle();
    if (!puzzle || !STATE.me?.id) return;
    try {
      // Challenge mode: best-move reveal is disabled; always submit as attempt.
      const out = await challengeAttempt(STATE.me.id, String(STATE.challenge.sessionId || ''), String(uci || ''), false);
      // Update inline result panel state
      STATE.uiBoard.challengeVerdict = String(out?.verdict || (out?.ok ? 'good' : 'blunder'));
      STATE.uiBoard.challengeMoveUci = String(out?.playedUci || uci || '');
      STATE.uiBoard.challengeMoveSan = String(out?.playedSan || '');
      // For retry-until-correct UX: keep board at start position unless correct.
      STATE.uiBoard.challengeFen = out?.ok ? (String(out?.afterFEN || '') || String(puzzle.startFEN || '')) : String(puzzle.startFEN || '');
      STATE.uiBoard.challengeBestOrigin = String(out?.origin || 'attempt');
      // Challenge mode: never show best move.
      STATE.uiBoard.challengeBestMoveUci = '';
      STATE.uiBoard.challengeBestMoveSan = '';

      // Progress / next puzzle
      STATE.challenge.correct = Number(out?.correct || STATE.challenge.correct) || 0;
      STATE.challenge.target = Number(out?.target || STATE.challenge.target) || 10;
      STATE.challenge.idx = Number(out?.idx || STATE.challenge.idx) || 0;
      STATE.challenge.nextPuzzle = out?.nextPuzzle || null;
      STATE.challenge.done = !!out?.done;
      if (out?.totalPoints !== undefined) STATE.challenge.totalPoints = out.totalPoints;
    } catch (e) {
      STATE.challenge.error = String(e?.message || e);
    } finally {
      STATE.selectedFrom = null;
      STATE.promoPending = null;
      entry().render();
    }
  }

  window.BlundersChallenge = {
    challengeCurrentPuzzle,
    clearChallengeUi,
    renderChallengePage,
    renderLeaderboardPage,
    challengeLoadLeaderboard,
    challengeStartOrRestart,
    submitChallengeMoveUci
  };
})();


