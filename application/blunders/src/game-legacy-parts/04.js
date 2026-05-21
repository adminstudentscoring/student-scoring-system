        STATE.teacher.selectedIds = Array.from(cur).filter(Boolean);
        render();
        return;
      }

      const setTab = t?.closest?.('[data-bl-settings-tab]');
      if (setTab) {
        STATE.settingsTab = String(setTab.getAttribute('data-bl-settings-tab') || 'board');
        render();
        return;
      }

      if (t?.closest?.('#blBoardResetBtn')) {
        setBoardColors({ light: VCP_DEFAULTS.boardLight, dark: VCP_DEFAULTS.boardDark });
        render();
        return;
      }

      if (t?.closest?.('[data-bl-refresh]')) return refreshData();
      if (t?.closest?.('[data-bl-force]')) return refreshData({ force: true });
      if (t?.closest?.('[data-bl-page-reload]')) {
        try { window.location.reload(); } catch { window.location.href = window.location.href; }
        return;
      }
      if (t?.closest?.('[data-bl-go-blunder]')) { setBlunderModePending(); return setPage('blunder'); }
      if (t?.closest?.('[data-bl-go-review]')) {
        const ts = Number(STATE.ui?.lastBlunderUiActionTs || 0);
        if (STATE.page === 'blunder' && ts && (Date.now() - ts) < 900) return;
        return setPage('review');
      }
      if (t?.closest?.('[data-bl-home-practice-open]')) {
        openHomePracticeModal();
        return;
      }
      if (t?.closest?.('[data-bl-home-recent-refresh]')) {
        ensureHomeRecentGamesLoaded().catch(() => {});
        return;
      }
      if (t?.closest?.('[data-bl-home-ai-refresh]')) {
        ensureHomeAiLoaded().catch(() => {});
        return;
      }
      const hg = t?.closest?.('[data-bl-home-game]');
      if (hg) {
        const idx = Math.max(0, Number(hg.getAttribute('data-bl-home-game') || 0) || 0);
        if (STATE.homeRecent && typeof STATE.homeRecent === 'object') {
          STATE.homeRecent.selectedGameIdx = idx;
          STATE.homeRecent.plyIdx = 0;
          render();
        }
        return;
      }
      if (t?.closest?.('[data-bl-home-pgn-prev]')) {
        if (STATE.homeRecent && typeof STATE.homeRecent === 'object') {
          STATE.homeRecent.plyIdx = Math.max(0, Number(STATE.homeRecent.plyIdx || 0) - 1);
          render();
        }
        return;
      }
      if (t?.closest?.('[data-bl-home-pgn-next]')) {
        if (STATE.homeRecent && typeof STATE.homeRecent === 'object') {
          const games = Array.isArray(STATE.homeRecent.games) ? STATE.homeRecent.games : [];
          const gIdx = Math.max(0, Math.min(games.length - 1, Number(STATE.homeRecent.selectedGameIdx || 0) || 0));
          const g = games[gIdx] || null;
          const max = g && Array.isArray(g.fens) ? Math.max(0, g.fens.length - 1) : 0;
          STATE.homeRecent.plyIdx = Math.min(max, Number(STATE.homeRecent.plyIdx || 0) + 1);
          render();
        }
        return;
      }
      const hpd = t?.closest?.('[data-bl-home-practice-duration]');
      if (hpd) {
        const v = String(hpd.getAttribute('data-bl-home-practice-duration') || 'all');
        STATE.ui.homePracticeDuration = v;
        STATE.reviewDuration = v; // keep practice duration in sync with filter
        try { window.BlundersStudent?.resetReviewUi?.(); } catch {}
        openHomePracticeModal();
        return;
      }
      const hps = t?.closest?.('[data-bl-home-practice-start]');
      if (hps) {
        const key = String(hps.getAttribute('data-bl-home-practice-start') || 'random');
        startPracticeFromHome(key);
        return;
      }

      const cd = t?.closest?.('[data-bl-challenge-diff]');
      if (cd) {
        STATE.challenge.difficulty = String(cd.getAttribute('data-bl-challenge-diff') || 'easy');
        render();
        return;
      }
      if (t?.closest?.('[data-bl-challenge-start]')) {
        clearChallengeUi();
        challengeStartOrRestart().catch(() => {});
        return;
      }
      if (t?.closest?.('[data-bl-challenge-refresh]')) {
        render();
        return;
      }
      if (t?.closest?.('[data-bl-lb-refresh]')) {
        challengeLoadLeaderboard().catch(() => {});
        return;
      }

      const rp = t?.closest?.('[data-bl-review-practice]');
      if (rp) {
        const key = String(rp.getAttribute('data-bl-review-practice') || '');
        let all = getReviewPuzzlesFiltered();
        const theme = String(STATE.ui?.reviewUi?.theme || 'any').trim() || 'any';
        if (theme !== 'any') {
          all = all.filter((p) => (Array.isArray(p?.tags) ? p.tags.map(String) : []).includes(theme));
        }
        if (!all.length) return;

        let pool = [];
        if (key === 'random') {
          // Random = pick from the requested 4 drop buckets (exclude miss-mate, since it's its own category)
          pool = all.filter(p => bucketKeyOfPuzzle(p) !== 'missMate');
        } else {
          pool = all.filter(p => bucketKeyOfPuzzle(p) === key);
        }
        if (!pool.length) return;

        STATE.practiceKey = key || 'random';
        const pick = pool[Math.floor(Math.random() * pool.length)];
        setBlunderModePractice(pick);
        clearInlineResult('blunder');
        setPage('blunder');
        return;
      }

      const rd = t?.closest?.('[data-bl-review-duration]');
      if (rd) {
        STATE.reviewDuration = String(rd.getAttribute('data-bl-review-duration') || 'all');
        STATE.ui.homePracticeDuration = STATE.reviewDuration;
        try { window.BlundersStudent?.resetReviewUi?.(); } catch {}
        render();
        return;
      }
      // NOTE: Review theme/duration selects use 'change' events, not 'click' (avoid dropdown flashing).

      // Review (bucketed paging)
      const rvT = t?.closest?.('[data-bl-review-toggle]');
      if (rvT) {
        const key = String(rvT.getAttribute('data-bl-review-toggle') || '');
        try { return window.BlundersStudent?.reviewToggleBucket?.(key); } catch {}
        return;
      }
      const rvP = t?.closest?.('[data-bl-review-prev]');
      if (rvP) {
        const key = String(rvP.getAttribute('data-bl-review-prev') || '');
        try { return window.BlundersStudent?.reviewPrev?.(key); } catch {}
        return;
      }
      const rvN = t?.closest?.('[data-bl-review-next]');
      if (rvN) {
        const key = String(rvN.getAttribute('data-bl-review-next') || '');
        try { return window.BlundersStudent?.reviewNext?.(key); } catch {}
        return;
      }
      const rvG = t?.closest?.('[data-bl-review-go]');
      if (rvG) {
        const key = String(rvG.getAttribute('data-bl-review-go') || '');
        try { return window.BlundersStudent?.reviewGo?.(key); } catch {}
        return;
      }

      if (t?.closest?.('[data-bl-prev]')) {
        STATE.currentIndex = Math.max(0, STATE.currentIndex - 1);
        STATE.selectedFrom = null;
        clearInlineResult('blunder');
        render();
        return;
      }
      if (t?.closest?.('[data-bl-next]')) {
        STATE.currentIndex = Math.min((STATE.pending.length - 1), STATE.currentIndex + 1);
        STATE.selectedFrom = null;
        clearInlineResult('blunder');
        render();
        return;
      }
      if (t?.closest?.('[data-bl-back-review]')) {
        // On some mobile browsers, DOM updates after "Show best move" can cause a ghost click to land here.
        // Guard against accidental navigation.
        const ts1 = Number(STATE.ui?.lastInlineBestClickTs || 0);
        const ts2 = Number(STATE.ui?.lastBlunderUiActionTs || 0);
        if ((ts1 && (Date.now() - ts1) < 900) || (ts2 && (Date.now() - ts2) < 900)) return;
        setPage('review');
        return;
      }

      // Reveal buttons removed (use "Show best move" in the Result panel instead).

      const inlineBest = t?.closest?.('[data-bl-inline-best]');
      if (inlineBest) {
        STATE.ui.lastInlineBestClickTs = Date.now();
        STATE.ui.lastBlunderUiActionTs = Date.now();
        ev.preventDefault?.();
        ev.stopPropagation?.();
        const scope = String(inlineBest.getAttribute('data-bl-inline-best') || '');
        if (scope === 'master') revealMasterBestMove();
        else revealBestMove();
        return;
      }
      const inlineNext = t?.closest?.('[data-bl-inline-next]');
      if (inlineNext) {
        STATE.ui.lastBlunderUiActionTs = Date.now();
        const scope = String(inlineNext.getAttribute('data-bl-inline-next') || '');
        if (scope === 'master') {
          const mid = String(STATE.master.selectedMasterId || '');
          // after solving/revealing, refresh list so completed moves out, then keep current index to show next.
          clearInlineResult('master');
          STATE.selectedFrom = null;
          await ensureMasterPuzzlesLoaded(mid);
          return;
        }
        if (scope === 'challenge') {
          // Advance to next puzzle prepared by server after a correct answer.
          const np = STATE.challenge?.nextPuzzle || null;
          clearInlineResult('challenge');
          STATE.selectedFrom = null;
          STATE.challenge.nextPuzzle = null;
          if (np && !STATE.challenge?.done) {
            STATE.challenge.puzzle = np;
            STATE.uiBoard.challengeFen = String(np.startFEN || '');
            render();
            return;
          }
          // If done (or no next), just re-render.
          render();
          return;
        }
        // blunder
        clearInlineResult('blunder');
        STATE.selectedFrom = null;
        if (STATE.mode === 'practice') {
          const key = String(STATE.practiceKey || 'random');
          const all = getReviewPuzzlesFiltered();
          let pool = [];
          if (key === 'missMate') pool = all.filter(p => bucketKeyOfPuzzle(p) === 'missMate');
          else if (key === 'random') pool = all.filter(p => bucketKeyOfPuzzle(p) !== 'missMate');
          else pool = all.filter(p => bucketKeyOfPuzzle(p) === key);

          // Fallbacks
          if (!pool.length) pool = all.slice();
          if (!pool.length) { render(); return; }

          const curId = String(STATE.practicePuzzle?.id || '');
          if (curId && pool.length > 1) {
            const filtered = pool.filter(p => String(p?.id || '') !== curId);
            if (filtered.length) pool = filtered;
          }

          const pick = pool[Math.floor(Math.random() * pool.length)];
          setBlunderModePractice(pick);
          setPage('blunder');
          return;
        }
        // pending: refresh list so solved puzzle disappears, then stay at same index (now points to next)
        await refreshData();
        setBlunderModePending();
        setPage('blunder');
        return;
      }
      const inlineRetry = t?.closest?.('[data-bl-inline-retry]');
      if (inlineRetry) {
        STATE.ui.lastBlunderUiActionTs = Date.now();
        ev.preventDefault?.();
        ev.stopPropagation?.();
        const scope = String(inlineRetry.getAttribute('data-bl-inline-retry') || '');
        if (scope === 'master') {
          const pz = masterCurrentPuzzle();
          if (pz) {
            STATE.uiBoard.masterFen = String(pz.startFEN || '');
          }
          STATE.uiBoard.masterMoveUci = '';
          STATE.uiBoard.masterVerdict = '';
          STATE.uiBoard.masterBestMoveUci = '';
          STATE.selectedFrom = null;
          render();
          return;
        }
        if (scope === 'challenge') {
          const pz = challengeCurrentPuzzle();
          if (pz) STATE.uiBoard.challengeFen = String(pz.startFEN || '');
          STATE.uiBoard.challengeMoveUci = '';
          STATE.uiBoard.challengeVerdict = '';
          STATE.uiBoard.challengeBestMoveUci = '';
          STATE.selectedFrom = null;
          render();
          return;
        }
        const pz = currentPuzzle();
        // Keep the current mode on Retry (Pending stays Pending; Practice stays Practice).
        // Previously we auto-switched Pending -> Practice after a successful solve, which was confusing.
        if (STATE.lastAttemptWasPendingSolve && STATE.mode !== 'practice') {
          console.debug?.('[Blunders] Retry after pending solve: staying in Pending mode.');
        }
        if (pz) {
          STATE.uiBoard.blunderFen = String(pz.startFEN || '');
        }
        STATE.uiBoard.blunderMoveUci = '';
        STATE.uiBoard.blunderVerdict = '';
        STATE.uiBoard.blunderBestMoveUci = '';
        STATE.selectedFrom = null;
        render();
        return;
      }
      if (t?.closest?.('[data-bl-master-prev]')) {
        STATE.master.currentIndex = Math.max(0, Number(STATE.master.currentIndex || 0) - 1);
        STATE.selectedFrom = null;
        clearInlineResult('master');
        render();
        return;
      }
      if (t?.closest?.('[data-bl-master-next]')) {
        const max = Math.max(0, (Array.isArray(STATE.master.pending) ? STATE.master.pending.length : 0) - 1);
        STATE.master.currentIndex = Math.min(max, Number(STATE.master.currentIndex || 0) + 1);
        STATE.selectedFrom = null;
        clearInlineResult('master');
        render();
        return;
      }
      const mbt = t?.closest?.('[data-bl-master-bucket-toggle]');
      if (mbt) {
        const key = String(mbt.getAttribute('data-bl-master-bucket-toggle') || '');
        masterBucketToggle(key);
        return;
      }
      const mbp = t?.closest?.('[data-bl-master-bucket-prev]');
      if (mbp) {
        const key = String(mbp.getAttribute('data-bl-master-bucket-prev') || '');
        masterBucketPrev(key);
        return;
      }
      const mbn = t?.closest?.('[data-bl-master-bucket-next]');
      if (mbn) {
        const key = String(mbn.getAttribute('data-bl-master-bucket-next') || '');
        masterBucketNext(key);
        return;
      }
      const mbg = t?.closest?.('[data-bl-master-bucket-go]');
      if (mbg) {
        const key = String(mbg.getAttribute('data-bl-master-bucket-go') || '');
        masterBucketGo(key);
        return;
      }
      const mp = t?.closest?.('[data-bl-master-pick]');
      if (mp) {
        const pid = String(mp.getAttribute('data-bl-master-pick') || '').trim();
        if (pid) {
          STATE.master.selectedPuzzleId = pid;
          const map = (STATE.master.byId && typeof STATE.master.byId === 'object') ? STATE.master.byId : {};
          const pz = map[pid] || null;
          if (pz) {
            STATE.uiBoard.masterFen = String(pz.startFEN || '');
          }
          STATE.uiBoard.masterMoveUci = '';
          STATE.uiBoard.masterVerdict = '';
          STATE.uiBoard.masterBestMoveUci = '';
          STATE.selectedFrom = null;
          clearInlineResult('master');
          render();
        }
        return;
      }
      const mb = t?.closest?.('[data-bl-master]');
      if (mb) {
        const mid = String(mb.getAttribute('data-bl-master') || '');
        ensureMasterPuzzlesLoaded(mid).catch(() => {});
        return;
      }

      const openAll = t?.closest?.('[data-bl-teacher-all-open]');
      if (openAll) {
        const pid = String(openAll.getAttribute('data-bl-teacher-all-open') || '').trim();
        if (!pid) return;
        const ui = (STATE.teacher?.allUi && typeof STATE.teacher.allUi === 'object') ? STATE.teacher.allUi : null;
        const buckets = ui?.buckets && typeof ui.buckets === 'object' ? ui.buckets : null;
        let found = null;
        if (buckets) {
          for (const b of Object.values(buckets)) {
            const arr = Array.isArray(b?.entries) ? b.entries : [];
            const hit = arr.find(x => String(x?.id || x?.key || '') === pid) || null;
            if (hit) { found = hit; break; }
          }
        }
        if (!found) return;
        const drop = (Number(found?.dropPoints ?? (Number(found?.dropCp || 0) / 100)) || 0).toFixed(2);
        const tags = (() => {
          if (Array.isArray(found?.tags)) return found.tags.map(String).filter(Boolean);
          if (typeof found?.tags === 'string') {
            try {
              const parsed = JSON.parse(found.tags);
              return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
            } catch { return []; }
          }
          return [];
        })();
        openModal('Puzzle', `
          <div class="blunders-muted" style="margin-bottom:10px;">${escapeHtml(String(found.studentName || ''))}</div>
          <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start;">
            ${renderMiniBoardFromFen(String(found.startFEN || ''))}
            <div style="min-width:240px; max-width:520px;">
              <div class="blunders-muted">Move: <strong>${escapeHtml(String(found.blunderSan || found.blunderMoveUci || ''))}</strong></div>
              <div class="blunders-muted" style="margin-top:6px;">Drop: <strong>${escapeHtml(drop)}</strong></div>
              ${found.bestMoveUci ? `<div class="blunders-muted" style="margin-top:6px;">Best move: <strong>${escapeHtml(String(found.bestMoveUci))}</strong></div>` : ``}
              ${tags.length ? `<div style="margin-top:10px; display:flex; gap:6px; flex-wrap:wrap;">${tags.map(t => `<span class="bl-badge" style="background:#eef2ff; color:#3730a3;">${escapeHtml(t)}</span>`).join('')}</div>` : ``}
              ${found.gameUrl ? `<div class="blunders-muted" style="margin-top:10px;">Source: <a href="${escapeHtml(String(found.gameUrl))}" target="_blank" rel="noopener noreferrer">Chess.com</a></div>` : ``}
              <div class="blunders-muted" style="margin-top:10px;">FEN: <span style="word-break:break-word;">${escapeHtml(String(found.startFEN || ''))}</span></div>
            </div>
          </div>
        `);
        return;
      }

      const sqEl = t?.closest?.('[data-bl-sq]');
      if (sqEl && STATE.page === 'blunder') {
        STATE.ui.lastBlunderUiActionTs = Date.now();
        const sq = String(sqEl.getAttribute('data-bl-sq') || '');
        handleBoardClick(sq);
        return;
      }
      if (sqEl && STATE.page === 'challenge') {
        STATE.ui.lastBlunderUiActionTs = Date.now();
        const sq = String(sqEl.getAttribute('data-bl-sq') || '');
        handleChallengeBoardClick(sq);
        return;
      }
      if (sqEl && STATE.page === 'masterGame') {
        const sq = String(sqEl.getAttribute('data-bl-sq') || '');
        handleMasterBoardClick(sq);
        return;
      }

      const open = t?.closest?.('[data-bl-open]');
      if (open) {
        const id = String(open.getAttribute('data-bl-open') || '');
        const all = [
          ...(Array.isArray(STATE.pending) ? STATE.pending : []),
          ...(Array.isArray(STATE.completed) ? STATE.completed : [])
        ];
        const pz = all.find(x => String(x?.id || '') === id) || null;
        if (!pz) return;
        openModal('Review', `
          <div class="blunders-muted" style="margin-bottom:10px;">${escapeHtml(String(pz.blunderSan || pz.blunderMoveUci || ''))}</div>
          <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
            ${renderMiniBoardFromFen(String(pz.startFEN || ''))}
