    STATE.homeRecent.error = '';
    render();
    try {
      const out = await window.BlundersCore.fetchRecentGamesWithBlunders(STATE.me.id, 5);
      STATE.homeRecent.games = Array.isArray(out?.games) ? out.games : [];
      STATE.homeRecent.selectedGameIdx = 0;
      STATE.homeRecent.plyIdx = 0;
    } catch (e) {
      STATE.homeRecent.error = String(e?.message || e);
    } finally {
      STATE.homeRecent.loading = false;
      render();
    }
  }

  async function ensureHomeAiLoaded() {
    if (!STATE.me?.id) return;
    if (!STATE.homeAi || typeof STATE.homeAi !== 'object') STATE.homeAi = { loading: false, error: '', status: 'disabled', updatedAt: null, comment: null };
    if (STATE.homeAi.loading) return;
    STATE.homeAi.loading = true;
    STATE.homeAi.error = '';
    render();
    try {
      const out = await window.BlundersCore.fetchAiComment(STATE.me.id);
      STATE.homeAi.status = String(out?.status || 'disabled');
      STATE.homeAi.updatedAt = out?.updatedAt || null;
      STATE.homeAi.comment = out?.comment || null;
      STATE.homeAi.error = out?.error ? String(out.error) : '';
    } catch (e) {
      STATE.homeAi.error = String(e?.message || e);
    } finally {
      STATE.homeAi.loading = false;
      render();
    }
  }

  // Teacher actions moved to game/blunders/teacher.js
  function requireTeacherModule() {
    const mod = window.BlundersTeacher;
    if (mod) return mod;
    try {
      STATE.teacher.error = 'Teacher module not loaded. Please hard refresh (Ctrl+F5) and check that /application/blunders/teacher.js returns 200 in the Network tab.';
        render();
    } catch {}
    console.error('BlundersTeacher missing: teacher actions are disabled. Check /application/blunders/teacher.js load.');
    return null;
  }
  async function teacherLoad(tab) { const m = requireTeacherModule(); return m ? m.teacherLoad?.(tab) : undefined; }
  async function teacherSaveStudentSettings() { const m = requireTeacherModule(); return m ? m.teacherSaveStudentSettings?.() : undefined; }
  async function teacherSaveMasters() { const m = requireTeacherModule(); return m ? m.teacherSaveMasters?.() : undefined; }
  async function teacherSaveMasterConfig() { const m = requireTeacherModule(); return m ? m.teacherSaveMasterConfig?.() : undefined; }
  async function teacherSyncStudent(studentId, hkDayKey, force) { const m = requireTeacherModule(); return m ? m.teacherSyncStudent?.(studentId, hkDayKey, force) : undefined; }
  async function teacherHistoryScanStudent(studentId, historyGames, force) { const m = requireTeacherModule(); return m ? m.teacherHistoryScanStudent?.(studentId, historyGames, force) : undefined; }
  async function teacherSyncMaster(masterId, hkDayKey, force) { const m = requireTeacherModule(); return m ? m.teacherSyncMaster?.(masterId, hkDayKey, force) : undefined; }
  async function teacherHistoryScanMaster(masterId, historyGames, force) { const m = requireTeacherModule(); return m ? m.teacherHistoryScanMaster?.(masterId, historyGames, force) : undefined; }
  async function teacherTagPuzzles(scope, recompute) { const m = requireTeacherModule(); return m ? m.teacherTagPuzzles?.(scope, recompute) : undefined; }
  async function teacherLoadTagStats() { const m = requireTeacherModule(); return m ? m.teacherLoadTagStats?.() : undefined; }
  async function teacherBulkSyncSelected(force) { const m = requireTeacherModule(); return m ? m.teacherBulkSyncSelected?.(force) : undefined; }
  async function teacherBulkCompleteSelected() { const m = requireTeacherModule(); return m ? m.teacherBulkCompleteSelected?.() : undefined; }
  async function teacherBulkHistoryScanSelected(force) { const m = requireTeacherModule(); return m ? m.teacherBulkHistoryScanSelected?.(force) : undefined; }

  function setMessage(txt) {
    const el = document.getElementById('blBlunderMsg');
    if (el) el.textContent = String(txt || '');
  }

  function setMasterMessage(txt) {
    const el = document.getElementById('blMasterMsg');
    if (el) el.textContent = String(txt || '');
  }

  async function copyToClipboard(text) {
    const t = String(text || '');
    if (!t) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(t);
        return true;
      }
    } catch {}
    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch {
      return false;
    }
  }

  function clearInlineResult(scope) {
    if (scope === 'master') {
      STATE.uiBoard.masterVerdict = '';
      STATE.uiBoard.masterMoveUci = '';
      STATE.uiBoard.masterMoveSan = '';
      STATE.uiBoard.masterBestMoveUci = '';
      STATE.uiBoard.masterBestMoveSan = '';
      STATE.uiBoard.masterBestOrigin = '';
      STATE.uiBoard.masterFen = '';
    } else if (scope === 'challenge') {
      STATE.uiBoard.challengeVerdict = '';
      STATE.uiBoard.challengeMoveUci = '';
      STATE.uiBoard.challengeMoveSan = '';
      STATE.uiBoard.challengeBestMoveUci = '';
      STATE.uiBoard.challengeBestMoveSan = '';
      STATE.uiBoard.challengeBestOrigin = '';
      STATE.uiBoard.challengeFen = '';
    } else {
      STATE.uiBoard.blunderVerdict = '';
      STATE.uiBoard.blunderMoveUci = '';
      STATE.uiBoard.blunderMoveSan = '';
      STATE.uiBoard.blunderBestMoveUci = '';
      STATE.uiBoard.blunderBestMoveSan = '';
      STATE.uiBoard.blunderBestOrigin = '';
      STATE.uiBoard.blunderFen = '';
    }
  }

  function renderInlineResultPanel(scope) {
    const isMaster = scope === 'master';
    const isChallenge = scope === 'challenge';
    const verdict = String(isMaster ? STATE.uiBoard.masterVerdict : (isChallenge ? STATE.uiBoard.challengeVerdict : STATE.uiBoard.blunderVerdict));
    const moveUci = String(isMaster ? STATE.uiBoard.masterMoveUci : (isChallenge ? STATE.uiBoard.challengeMoveUci : STATE.uiBoard.blunderMoveUci));
    const moveSan = String(isMaster ? STATE.uiBoard.masterMoveSan : (isChallenge ? STATE.uiBoard.challengeMoveSan : STATE.uiBoard.blunderMoveSan));
    const bestUci = String(isMaster ? STATE.uiBoard.masterBestMoveUci : (isChallenge ? STATE.uiBoard.challengeBestMoveUci : STATE.uiBoard.blunderBestMoveUci));
    const bestSan = String(isMaster ? STATE.uiBoard.masterBestMoveSan : (isChallenge ? STATE.uiBoard.challengeBestMoveSan : STATE.uiBoard.blunderBestMoveSan));
    const origin = String(isMaster ? STATE.uiBoard.masterBestOrigin : (isChallenge ? STATE.uiBoard.challengeBestOrigin : STATE.uiBoard.blunderBestOrigin));

    const title =
      verdict === 'best' ? 'Best Move' :
      verdict === 'good' ? 'Good move' :
      verdict === 'blunder' ? 'STILL BLUNDER!!' :
      'Result';

    const sub =
      verdict === 'best' ? 'Perfect. You found the best move.' :
      verdict === 'good' ? 'Correct, but not the best.' :
      verdict === 'blunder' ? 'Try again.' :
      'Your result will appear here.';

    const iconSrc =
      verdict === 'best' ? '/application/Sign/Best_move.jpeg' :
      verdict === 'good' ? '/application/Sign/Good_move.jpeg' :
      verdict === 'blunder' ? '/application/Sign/Blunder_move.jpeg' : '';

    const mvLine = (moveSan || moveUci) ? `Move: ${moveSan || moveUci}` : '';
    const bmLine = (bestSan || bestUci) ? `Best: ${bestSan || bestUci}` : '';

    // Challenge mode requirement: remove "Show best move".
    const canShowBest = (!isChallenge) && (verdict === 'good' || verdict === 'blunder' || !verdict);
    const showBestBtn = canShowBest ? `<button class="btn btn-secondary" type="button" data-bl-inline-best="${isMaster ? 'master' : 'blunder'}">Show best move</button>` : '';
    const retryBtn = `<button class="btn btn-primary" type="button" data-bl-inline-retry="${isMaster ? 'master' : 'blunder'}">Retry</button>`;
    const retryScope = isMaster ? 'master' : (isChallenge ? 'challenge' : 'blunder');
    const retryBtn2 = `<button class="btn btn-primary" type="button" data-bl-inline-retry="${retryScope}">Retry</button>`;
    // Next rules:
    // - Master: when best by attempt (same as before)
    // - Blunder: when best by attempt (same as before)
    // - Challenge: when correct (best/good) by attempt (server decides advance), show Next
    const canNext = (origin === 'attempt') && (isChallenge ? (verdict === 'best' || verdict === 'good') : (verdict === 'best'));
    const nextBtn = canNext
      ? `<button class="btn btn-secondary" type="button" data-bl-inline-next="${isMaster ? 'master' : (isChallenge ? 'challenge' : 'blunder')}">${isMaster ? 'Next' : (isChallenge ? 'Next' : (STATE.mode === 'practice' ? 'Next (Random)' : 'Next'))}</button>`
      : '';

    return `
      <div class="bl-card bl-inline-result" style="box-shadow:none; margin-top:12px;">
        <div class="bl-inline-head">
          <span class="bl-inline-ico">
            ${iconSrc ? `<img class="bl-inline-ico-img" src="${escapeHtml(iconSrc)}" alt="${escapeHtml(title)}" draggable="false">` : `<span class="bl-inline-ico-fallback">ℹ️</span>`}
          </span>
          <div>
            <div class="bl-inline-title">${escapeHtml(title)}</div>
            <div class="blunders-muted">${escapeHtml(sub)}</div>
          </div>
        </div>
        <div class="blunders-muted" style="margin-top:10px;">
          ${escapeHtml(mvLine)}${mvLine && bmLine ? '<br>' : ''}${escapeHtml(bmLine)}
        </div>
        <div class="bl-inline-actions">
          ${showBestBtn || nextBtn}
          ${retryBtn2}
        </div>
      </div>
    `;
  }

  function openPromotionPicker(baseUci) {
    STATE.promoPending = { baseUci };
    openModal('Promotion', `
      <div class="blunders-muted">Choose promotion piece:</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
        <button class="btn btn-primary" type="button" data-bl-promo="q">Queen</button>
        <button class="btn btn-secondary" type="button" data-bl-promo="r">Rook</button>
        <button class="btn btn-secondary" type="button" data-bl-promo="b">Bishop</button>
        <button class="btn btn-secondary" type="button" data-bl-promo="n">Knight</button>
      </div>
    `);
  }

  // Result modal removed: use inline result panel instead.

  async function submitMoveUci(uci) {
    const puzzle = currentPuzzle();
    if (!puzzle || !STATE.me?.id) return;
    const isPractice = STATE.mode === 'practice';
    try {
      setMessage('');
      const out = await submitAttempt(STATE.me.id, String(puzzle.id || ''), uci, false, isPractice);
      // Always apply the played move on board (even when verdict is blunder).
      STATE.uiBoard.blunderVerdict = String(out?.verdict || (out?.ok ? 'good' : 'blunder'));
      STATE.uiBoard.blunderMoveUci = String(out?.playedUci || uci || '');
      STATE.uiBoard.blunderMoveSan = String(out?.playedSan || '');
      STATE.uiBoard.blunderFen = String(out?.afterFEN || '') || String(puzzle.startFEN || '');
      STATE.uiBoard.blunderBestOrigin = 'attempt';
      // For GOOD/BEST on pending: allow retry (practice) or show best; do not auto-refresh.
      if (!isPractice && (STATE.uiBoard.blunderVerdict === 'good' || STATE.uiBoard.blunderVerdict === 'best')) {
        STATE.lastAttemptWasPendingSolve = true;
      } else {
        STATE.lastAttemptWasPendingSolve = false;
      }
    } catch (e) {
      setMessage(`Error: ${e?.message || e}`);
    } finally {
      STATE.selectedFrom = null;
      STATE.promoPending = null;
      render();
    }
  }

  function handleBoardClick(sq) {
    // After answering, board is frozen until Retry (per UX request)
    if (STATE.uiBoard.blunderVerdict) return;
    const puzzle = currentPuzzle();
    if (!puzzle) return;
    const parsed = parseFenBoard(String(puzzle.startFEN || ''));
    if (!parsed) return;
    const turn = String(parsed.turn || 'w');
    const rc = squareToRC(sq);
    if (!rc) return;
    const piece = parsed.board[rc.r][rc.c];

    if (!STATE.selectedFrom) {
      if (!piece) return;
      const isWhite = piece === piece.toUpperCase();
      if ((turn === 'w' && !isWhite) || (turn === 'b' && isWhite)) return;
      STATE.selectedFrom = sq;
      render();
      return;
    }

    const from = STATE.selectedFrom;
    if (from === sq) {
      STATE.selectedFrom = null;
      render();
      return;
    }

    const fromRc = squareToRC(from);
    const movingPiece = fromRc ? parsed.board[fromRc.r][fromRc.c] : '';
    const movingPawn = movingPiece && movingPiece.toLowerCase() === 'p';
    const toRank = Number(String(sq[1]));
    const promoRank = (turn === 'w') ? 8 : 1;
    const baseUci = `${from}${sq}`.toLowerCase();
    if (movingPawn && toRank === promoRank) {
      // No popups: default promotion to queen.
      submitMoveUci(`${baseUci}q`);
      return;
    }
    submitMoveUci(baseUci);
  }

  function handleMasterBoardClick(sq) {
    // After answering, board is frozen until Retry (per UX request)
    if (STATE.uiBoard.masterVerdict) return;
    const puzzle = masterCurrentPuzzle();
    if (!puzzle) return;
    const parsed = parseFenBoard(String(puzzle.startFEN || ''));
    if (!parsed) return;
    const turn = String(parsed.turn || 'w');
    const rc = squareToRC(sq);
    if (!rc) return;
    const piece = parsed.board[rc.r][rc.c];

    if (!STATE.selectedFrom) {
      if (!piece) return;
      const isWhite = piece === piece.toUpperCase();
      if ((turn === 'w' && !isWhite) || (turn === 'b' && isWhite)) return;
      STATE.selectedFrom = sq;
      render();
      return;
    }

    const from = STATE.selectedFrom;
    if (from === sq) {
      STATE.selectedFrom = null;
      render();
      return;
    }

    const fromRc = squareToRC(from);
    const movingPiece = fromRc ? parsed.board[fromRc.r][fromRc.c] : '';
    const movingPawn = movingPiece && movingPiece.toLowerCase() === 'p';
    const toRank = Number(String(sq[1]));
    const promoRank = (turn === 'w') ? 8 : 1;
    const baseUci = `${from}${sq}`.toLowerCase();
    if (movingPawn && toRank === promoRank) {
      // Promotion picker uses submitMoveUci; for Master Game we just default to queen for now.
      submitMasterMoveUci(`${baseUci}q`);
      return;
    }
    submitMasterMoveUci(baseUci);
  }

  function handleChallengeBoardClick(sq) {
    // After answering, board is frozen until Retry/Next (same UX)
    if (STATE.uiBoard.challengeVerdict) return;
    const puzzle = challengeCurrentPuzzle();
    if (!puzzle) return;
    const parsed = parseFenBoard(String(puzzle.startFEN || ''));
    if (!parsed) return;
    const turn = String(parsed.turn || 'w');
    const rc = squareToRC(sq);
    if (!rc) return;
    const piece = parsed.board[rc.r][rc.c];

    if (!STATE.selectedFrom) {
      if (!piece) return;
      const isWhite = piece === piece.toUpperCase();
      if ((turn === 'w' && !isWhite) || (turn === 'b' && isWhite)) return;
      STATE.selectedFrom = sq;
      render();
      return;
    }

    const from = STATE.selectedFrom;
    if (from === sq) {
      STATE.selectedFrom = null;
      render();
      return;
    }

    const fromRc = squareToRC(from);
    const movingPiece = fromRc ? parsed.board[fromRc.r][fromRc.c] : '';
    const movingPawn = movingPiece && movingPiece.toLowerCase() === 'p';
    const toRank = Number(String(sq[1]));
    const promoRank = (turn === 'w') ? 8 : 1;
    const baseUci = `${from}${sq}`.toLowerCase();
    if (movingPawn && toRank === promoRank) {
      submitChallengeMoveUci(`${baseUci}q`, false);
      return;
    }
    submitChallengeMoveUci(baseUci, false);
  }

  async function revealBestMove() {
    const puzzle = currentPuzzle();
    if (!puzzle || !STATE.me?.id) return;
    try {
      const out = await submitAttempt(STATE.me.id, String(puzzle.id || ''), '', true, false);
      const bm = out?.bestMove ? String(out.bestMove) : '';
      const engErr = out?.engineError ? String(out.engineError) : '';
      const af = out?.afterFEN ? String(out.afterFEN) : '';
      STATE.uiBoard.blunderBestMoveUci = bm;
      STATE.uiBoard.blunderBestMoveSan = out?.bestSan ? String(out.bestSan) : '';
      if (bm && af) {
        STATE.uiBoard.blunderFen = af;
        STATE.uiBoard.blunderMoveUci = bm;
        STATE.uiBoard.blunderMoveSan = STATE.uiBoard.blunderBestMoveSan;
      }
      STATE.uiBoard.blunderVerdict = bm ? 'best' : '';
      STATE.uiBoard.blunderBestOrigin = 'revealed';
      if (!bm) setMessage(engErr ? `Best move not available (${engErr})` : 'Best move not available yet.');
    } catch (e) {
      setMessage(`Error: ${e?.message || e}`);
    } finally {
      STATE.selectedFrom = null;
      render();
    }
  }

  function masterCurrentPuzzle() {
    // Prefer selected puzzle from bucketed UI
    const pid = String(STATE.master?.selectedPuzzleId || '').trim();
    if (pid) {
      const map = (STATE.master?.byId && typeof STATE.master.byId === 'object') ? STATE.master.byId : {};
      const hit = map[pid] || null;
      if (hit) return hit;
      // Fallback: try locate in loaded bucket entries
      const ui = STATE.master?.ui && typeof STATE.master.ui === 'object' ? STATE.master.ui : null;
      const buckets = ui?.buckets && typeof ui.buckets === 'object' ? ui.buckets : null;
      if (buckets) {
        for (const b of Object.values(buckets)) {
          const arr = Array.isArray(b?.entries) ? b.entries : [];
          const found = arr.find(x => String(x?.id || '') === pid) || null;
          if (found) return found;
        }
      }
    }
    // Backward compatibility: pending list + index
    const list = Array.isArray(STATE.master.pending) ? STATE.master.pending : [];
    if (!list.length) return null;
    const idx = Math.max(0, Math.min(list.length - 1, Number(STATE.master.currentIndex) || 0));
    return list[idx] || null;
  }

  async function submitMasterMoveUci(uci) {
    const puzzle = masterCurrentPuzzle();
    if (!puzzle || !STATE.me?.id) return;
    try {
      setMasterMessage('');
      const out = await submitMasterAttempt(STATE.me.id, String(puzzle.id || ''), uci, false, false);
      STATE.uiBoard.masterVerdict = String(out?.verdict || (out?.ok ? 'good' : 'blunder'));
      STATE.uiBoard.masterMoveUci = String(out?.playedUci || uci || '');
      STATE.uiBoard.masterMoveSan = String(out?.playedSan || '');
      STATE.uiBoard.masterFen = String(out?.afterFEN || '') || String(puzzle.startFEN || '');
      STATE.uiBoard.masterBestOrigin = 'attempt';
    } catch (e) {
      setMasterMessage(`Error: ${e?.message || e}`);
    } finally {
      STATE.selectedFrom = null;
      STATE.promoPending = null;
      render();
    }
  }

  async function revealMasterBestMove() {
    const puzzle = masterCurrentPuzzle();
    if (!puzzle || !STATE.me?.id) return;
    try {
      const out = await submitMasterAttempt(STATE.me.id, String(puzzle.id || ''), '', true, false);
      const bm = out?.bestMove ? String(out.bestMove) : '';
      const engErr = out?.engineError ? String(out.engineError) : '';
      const af = out?.afterFEN ? String(out.afterFEN) : '';
      STATE.uiBoard.masterBestMoveUci = bm;
      STATE.uiBoard.masterBestMoveSan = out?.bestSan ? String(out.bestSan) : '';
      if (bm && af) {
        STATE.uiBoard.masterFen = af;
        STATE.uiBoard.masterMoveUci = bm;
        STATE.uiBoard.masterMoveSan = STATE.uiBoard.masterBestMoveSan;
      }
      STATE.uiBoard.masterVerdict = bm ? 'best' : '';
      STATE.uiBoard.masterBestOrigin = 'revealed';
      if (!bm && engErr) setMasterMessage(`Best move not available (${engErr})`);
    } catch (e) {
