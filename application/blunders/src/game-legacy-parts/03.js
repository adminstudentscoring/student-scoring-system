      setMasterMessage(`Error: ${e?.message || e}`);
    } finally {
      STATE.selectedFrom = null;
      render();
    }
  }

  // Challenge actions moved to game/blunders/challenge.js
  async function challengeLoadLeaderboard() { return window.BlundersChallenge?.challengeLoadLeaderboard?.(); }
  async function challengeStartOrRestart() { return window.BlundersChallenge?.challengeStartOrRestart?.(); }
  async function submitChallengeMoveUci(uci, revealBest) { return window.BlundersChallenge?.submitChallengeMoveUci?.(uci, revealBest); }

  function render() {
    const root = document.getElementById('blundersRoot');
    if (!root) return;
    captureFocusInfo(root);
    const role = getBlundersRole();
    if (role === 'teacher') {
      root.innerHTML = `
        <div class="bl-app">
          ${renderTeacherSidebar()}
          <main class="bl-main">
            <div class="bl-container">
              <div id="blGlobalStatus" class="bl-global-status blunders-muted"></div>
              ${renderTeacherModePage()}
            </div>
          </main>
          ${STATE.ui.modalOpen ? STATE.ui.modalHtml : ''}
        </div>
      `;
      restoreFocusInfo(root);
      return;
    }
    const content =
      STATE.page === 'home' ? renderHomePage() :
      STATE.page === 'blunder' ? renderBlunderPage() :
      STATE.page === 'masterGame' ? renderStudentMasterGamePage() :
      STATE.page === 'review' ? renderReviewPage() :
      STATE.page === 'challenge' ? renderChallengePage() :
      STATE.page === 'leaderboard' ? renderLeaderboardPage() :
      renderSettingsPage();

    root.innerHTML = `
      <div class="bl-app">
        ${renderSidebar()}
        <main class="bl-main">
          <div class="bl-container">
            <div id="blGlobalStatus" class="bl-global-status blunders-muted"></div>
            ${content}
          </div>
        </main>
        ${STATE.ui.modalOpen ? STATE.ui.modalHtml : ''}
      </div>
    `;
    restoreFocusInfo(root);
  }

  // Entry API for external modules (teacher/challenge) to reuse shared UI + trigger renders.
  window.BlundersEntryApi.render = render;
  window.BlundersEntryApi.openModal = openModal;
  window.BlundersEntryApi.closeModal = closeModal;
  window.BlundersEntryApi.setPage = setPage;
  window.BlundersEntryApi.setBlunderModePending = setBlunderModePending;
  window.BlundersEntryApi.setBlunderModePractice = setBlunderModePractice;
  window.BlundersEntryApi.renderMiniBoardFromFen = renderMiniBoardFromFen;
  window.BlundersEntryApi.renderBoardForPuzzle = renderBoardForPuzzle;
  window.BlundersEntryApi.renderInlineResultPanel = renderInlineResultPanel;
  window.BlundersEntryApi.clearInlineResult = clearInlineResult;

  function initBlunders() {
    const root = document.getElementById('blundersRoot');
    if (!root) return;

    applyBoardColors();

    const role = getBlundersRole();
    if (role === 'teacher') {
      STATE.me = { id: 'teacher', name: 'Teacher', studentId: '' };
      render();
      if (!window.BlundersTeacher) {
        STATE.teacher.error = 'Teacher module not loaded. Please hard refresh (Ctrl+F5) and ensure /application/blunders/teacher.js loads successfully.';
        render();
        console.error('BlundersTeacher missing during initBlunders (teacher mode).');
        return;
      }
      teacherLoad(STATE.teacherTab || 'students').catch(() => {});
    } else {
      const players = getPlayers();
      STATE.me = players[0] || null;
      if (!STATE.me || !STATE.me.id) {
        root.innerHTML = `<div class="bl-card"><div class="bl-title">Blunders</div><div class="blunders-muted">Missing student identity.</div></div>`;
        return;
      }
      render();
      refreshData();
    }

    root.addEventListener('click', async (ev) => {
      const t = ev.target;

      // Modal close (event delegation; modal DOM is injected dynamically)
      if (STATE.ui?.modalOpen) {
        if (t?.closest?.('#blModalClose') || t?.closest?.('.bl-modal-close')) {
          closeModal();
          return;
        }
        // Only close on backdrop direct clicks (not clicks inside the modal content)
        if (t && String(t.id || '') === 'blModalBackdrop') {
          closeModal();
          return;
        }
      }

      // Copy FEN
      const cf = t?.closest?.('[data-bl-copy-fen]');
      if (cf) {
        const scope = String(cf.getAttribute('data-bl-copy-fen') || '');
        const pz = scope === 'master' ? masterCurrentPuzzle() : currentPuzzle();
        const fen = String(pz?.startFEN || '');
        const ok = await copyToClipboard(fen);
        if (scope === 'master') setMasterMessage(ok ? 'Copied.' : 'Copy failed.');
        else setMessage(ok ? 'Copied.' : 'Copy failed.');
        return;
      }

      // Teacher job modal actions
      if (t?.closest?.('[data-bl-teacher-job-close]')) {
        try { window.BlundersTeacher?.teacherJobClose?.(); } catch { closeModal(); }
        return;
      }
      if (t?.closest?.('[data-bl-teacher-job-refresh]')) {
        try { await window.BlundersTeacher?.teacherJobRefresh?.(); } catch (e) { console.error('Job refresh failed:', e); }
        return;
      }
      if (t?.closest?.('[data-bl-teacher-job-cancel]')) {
        try { await window.BlundersTeacher?.teacherJobCancel?.(); } catch (e) { console.error('Job cancel failed:', e); }
        return;
      }

      // Teacher sidebar tabs
      const tt = t?.closest?.('[data-bl-teacher-tab]');
      if (tt) {
        STATE.teacherTab = String(tt.getAttribute('data-bl-teacher-tab') || 'students');
        render();
        teacherLoad(STATE.teacherTab).catch(() => {});
        return;
      }

      // Teacher actions
      if (t?.closest?.('[data-bl-teacher-refresh-students]')) return teacherLoad('students');
      if (t?.closest?.('[data-bl-teacher-tag-stats-refresh]')) {
        try {
          await teacherLoadTagStats();
          render();
        } catch (e) {
          STATE.teacher.error = String(e?.message || e);
          render();
        }
        return;
      }
      if (t?.closest?.('[data-bl-teacher-tag-puzzles]')) {
        try {
          await teacherTagPuzzles('student', false);
          render();
        } catch (e) {
          STATE.teacher.error = String(e?.message || e);
          render();
        }
        return;
      }
      if (t?.closest?.('[data-bl-teacher-refresh-masters]')) return teacherLoad('masterGame');
      if (t?.closest?.('[data-bl-teacher-refresh-all]')) return teacherLoad('allBlunders');
      if (t?.closest?.('[data-bl-teacher-all-stats]')) {
        try { return window.BlundersTeacher?.teacherLoadAllBlundersStorageStats?.(); } catch {}
        return;
      }
      const durBtn = t?.closest?.('[data-bl-teacher-all-duration]');
      if (durBtn) {
        STATE.teacher.allDuration = String(durBtn.getAttribute('data-bl-teacher-all-duration') || 'all');
        render();
        return teacherLoad('allBlunders');
      }

      // Teacher All blunders (paged buckets)
      const allToggle = t?.closest?.('[data-bl-teacher-all-toggle]');
      if (allToggle) {
        const key = String(allToggle.getAttribute('data-bl-teacher-all-toggle') || '');
        try { return window.BlundersTeacher?.teacherAllToggleBucket?.(key); } catch {}
        return;
      }
      const allPrev = t?.closest?.('[data-bl-teacher-all-prev]');
      if (allPrev) {
        const key = String(allPrev.getAttribute('data-bl-teacher-all-prev') || '');
        try { return window.BlundersTeacher?.teacherAllPrev?.(key); } catch {}
        return;
      }
      const allNext = t?.closest?.('[data-bl-teacher-all-next]');
      if (allNext) {
        const key = String(allNext.getAttribute('data-bl-teacher-all-next') || '');
        try { return window.BlundersTeacher?.teacherAllNext?.(key); } catch {}
        return;
      }
      const allGo = t?.closest?.('[data-bl-teacher-all-go]');
      if (allGo) {
        const key = String(allGo.getAttribute('data-bl-teacher-all-go') || '');
        try { return window.BlundersTeacher?.teacherAllGo?.(key); } catch {}
        return;
      }
      if (t?.closest?.('[data-bl-teacher-sync-selected]')) return teacherBulkSyncSelected(false);
      if (t?.closest?.('[data-bl-teacher-force-selected]')) return teacherBulkSyncSelected(true);
      if (t?.closest?.('[data-bl-teacher-complete-selected]')) return teacherBulkCompleteSelected();
      if (t?.closest?.('[data-bl-teacher-history-selected]')) return teacherBulkHistoryScanSelected(false);
      if (t?.closest?.('[data-bl-teacher-history-force-selected]')) return teacherBulkHistoryScanSelected(true);
      if (t?.closest?.('[data-bl-teacher-apply-max-selected]')) {
        const v = Number(STATE.teacher.bulkMaxGames || 10) || 10;
        const selected = new Set(Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : []);
        if (!selected.size) {
          STATE.teacher.error = 'Please select at least one student.';
          render();
          return;
        }
        for (const sid of Array.from(selected)) {
          if (!sid) continue;
          if (!STATE.teacher.edits.student[sid]) STATE.teacher.edits.student[sid] = {};
          STATE.teacher.edits.student[sid].maxGamesPerDay = v;
        }
        STATE.teacher.error = '';
        render();
        return;
      }
      if (t?.closest?.('[data-bl-teacher-apply-thr-selected]')) {
        const v = Number(STATE.teacher.bulkThreshold || 1.0) || 1.0;
        const selected = new Set(Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : []);
        if (!selected.size) {
          STATE.teacher.error = 'Please select at least one student.';
          render();
          return;
        }
        for (const sid of Array.from(selected)) {
          if (!sid) continue;
          if (!STATE.teacher.edits.student[sid]) STATE.teacher.edits.student[sid] = {};
          STATE.teacher.edits.student[sid].thresholdPoints = v;
        }
        STATE.teacher.error = '';
        render();
        return;
      }
      if (t?.closest?.('[data-bl-teacher-save-students]')) {
        try { await teacherSaveStudentSettings(); STATE.teacher.error = ''; } catch (e) { STATE.teacher.error = String(e?.message || e); }
        return teacherLoad('students');
      }
      if (t?.closest?.('[data-bl-teacher-save-masters]')) {
        try { await teacherSaveMasters(); STATE.teacher.error = ''; } catch (e) { STATE.teacher.error = String(e?.message || e); }
        return teacherLoad('masterGame');
      }
      if (t?.closest?.('[data-bl-teacher-save-mastercfg]')) {
        try { await teacherSaveMasterConfig(); STATE.teacher.error = ''; } catch (e) { STATE.teacher.error = String(e?.message || e); }
        return teacherLoad('masterGame');
      }
      if (t?.closest?.('[data-bl-teacher-masters-presets]')) {
        STATE.teacher.edits.masters = [
          { id: 'magnuscarlsen', name: 'MagnusCarlsen', username: 'MagnusCarlsen' },
          { id: 'hikaru', name: 'Hikaru', username: 'Hikaru' },
          { id: 'fabianocaruana', name: 'fabianocaruana', username: 'fabianocaruana' }
        ];
        render();
        return;
      }
      if (t?.closest?.('[data-bl-teacher-masters-add]')) {
        const cur = Array.isArray(STATE.teacher.edits.masters) ? STATE.teacher.edits.masters.slice() : [];
        cur.push({ id: '', name: '', username: '' });
        STATE.teacher.edits.masters = cur;
        render();
        return;
      }
      const delM = t?.closest?.('[data-bl-teacher-master-del]');
      if (delM) {
        const idx = Number(delM.getAttribute('data-bl-teacher-master-del'));
        const cur = Array.isArray(STATE.teacher.edits.masters) ? STATE.teacher.edits.masters.slice() : [];
        if (!Number.isNaN(idx) && idx >= 0 && idx < cur.length) cur.splice(idx, 1);
        STATE.teacher.edits.masters = cur;
        render();
        return;
      }
      const syncStu = t?.closest?.('[data-bl-teacher-sync-student]');
      if (syncStu) {
        const sid = String(syncStu.getAttribute('data-bl-teacher-sync-student') || '');
        const hkDayKey = String(STATE.teacher?.dateByStudent?.[sid] || '') || todayYmdLocal();
        try {
          await teacherSyncStudent(sid, hkDayKey, false);
        return teacherLoad('students');
        } catch (e) {
          STATE.teacher.error = String(e?.message || e);
          console.error('Teacher sync failed:', e);
          render();
          return;
        }
      }
      const syncStuF = t?.closest?.('[data-bl-teacher-sync-student-force]');
      if (syncStuF) {
        const sid = String(syncStuF.getAttribute('data-bl-teacher-sync-student-force') || '');
        const hkDayKey = String(STATE.teacher?.dateByStudent?.[sid] || '') || todayYmdLocal();
        try {
          await teacherSyncStudent(sid, hkDayKey, true);
        return teacherLoad('students');
        } catch (e) {
          STATE.teacher.error = String(e?.message || e);
          console.error('Teacher force sync failed:', e);
          render();
          return;
        }
      }
      const hs = t?.closest?.('[data-bl-teacher-history-scan]');
      if (hs) {
        const sid = String(hs.getAttribute('data-bl-teacher-history-scan') || '');
        const sel = root.querySelector(`[data-bl-teacher-history-n="${CSS.escape(sid)}"]`);
        const n = Number(sel?.value || 0) || Number(STATE.teacher?.historyScanN?.[sid] || 0) || 200;
        try {
          await teacherHistoryScanStudent(sid, n, false);
          // History is async job now; keep message and do NOT immediately reload counts.
          render();
          return;
        } catch (e) {
          STATE.teacher.error = String(e?.message || e);
          console.error('Teacher history scan failed:', e);
          render();
          return;
        }
      }
      const hsF = t?.closest?.('[data-bl-teacher-history-scan-force]');
      if (hsF) {
        const sid = String(hsF.getAttribute('data-bl-teacher-history-scan-force') || '');
        const sel = root.querySelector(`[data-bl-teacher-history-n="${CSS.escape(sid)}"]`);
        const n = Number(sel?.value || 0) || Number(STATE.teacher?.historyScanN?.[sid] || 0) || 200;
        try {
          await teacherHistoryScanStudent(sid, n, true);
          render();
          return;
        } catch (e) {
          STATE.teacher.error = String(e?.message || e);
          console.error('Teacher history force scan failed:', e);
          render();
          return;
        }
      }
      const syncM = t?.closest?.('[data-bl-teacher-sync-master]');
      if (syncM) {
        const mid = String(syncM.getAttribute('data-bl-teacher-sync-master') || '');
        const hkDayKey = String(STATE.teacher?.dateByMaster?.[mid] || '') || todayYmdLocal();
        try {
          await teacherSyncMaster(mid, hkDayKey, false);
        return teacherLoad('masterGame');
        } catch (e) {
          STATE.teacher.error = String(e?.message || e);
          console.error('Teacher master sync failed:', e);
          render();
          return;
        }
      }
      const syncMF = t?.closest?.('[data-bl-teacher-sync-master-force]');
      if (syncMF) {
        const mid = String(syncMF.getAttribute('data-bl-teacher-sync-master-force') || '');
        const hkDayKey = String(STATE.teacher?.dateByMaster?.[mid] || '') || todayYmdLocal();
        try {
          await teacherSyncMaster(mid, hkDayKey, true);
        return teacherLoad('masterGame');
        } catch (e) {
          STATE.teacher.error = String(e?.message || e);
          console.error('Teacher master force sync failed:', e);
          render();
          return;
        }
      }

      const mhs = t?.closest?.('[data-bl-teacher-history-scan-master]');
      if (mhs) {
        const mid = String(mhs.getAttribute('data-bl-teacher-history-scan-master') || '');
        const sel = root.querySelector(`[data-bl-teacher-master-history-n="${CSS.escape(mid)}"]`);
        const n = Number(sel?.value || 0) || Number(STATE.teacher?.historyScanNMaster?.[mid] || 0) || 200;
        try {
          await teacherHistoryScanMaster(mid, n, false);
          render();
          return;
        } catch (e) {
          STATE.teacher.error = String(e?.message || e);
          console.error('Teacher master history scan failed:', e);
          render();
          return;
        }
      }
      const mhsF = t?.closest?.('[data-bl-teacher-history-scan-master-force]');
      if (mhsF) {
        const mid = String(mhsF.getAttribute('data-bl-teacher-history-scan-master-force') || '');
        const sel = root.querySelector(`[data-bl-teacher-master-history-n="${CSS.escape(mid)}"]`);
        const n = Number(sel?.value || 0) || Number(STATE.teacher?.historyScanNMaster?.[mid] || 0) || 200;
        try {
          await teacherHistoryScanMaster(mid, n, true);
          render();
          return;
        } catch (e) {
          STATE.teacher.error = String(e?.message || e);
          console.error('Teacher master history force scan failed:', e);
          render();
          return;
        }
      }

      const nav = t?.closest?.('[data-bl-nav]');
      if (nav) {
        const key = String(nav.getAttribute('data-bl-nav') || '');
        if (key) {
          setPage(key);
          if (key === 'masterGame') {
            ensureMasterGameLoaded().catch(() => {});
          }
          if (key === 'leaderboard') {
            challengeLoadLeaderboard().catch(() => {});
          }
        }
        return;
      }

      const selAll = t?.closest?.('[data-bl-teacher-select-all]');
      if (selAll) {
        const checked = !!selAll.checked;
        const q = String(STATE.teacher.search || '').trim().toLowerCase();
        const allRows = Array.isArray(STATE.teacher.students) ? STATE.teacher.students : [];
        const rows = !q ? allRows : allRows.filter((s) => {
          const name = String(s?.name || '').toLowerCase();
          const sid2 = String(s?.studentId || '').toLowerCase();
          const chessId = String(s?.chessComUsername || '').toLowerCase();
          return name.includes(q) || sid2.includes(q) || chessId.includes(q);
        });
        const cur = new Set(Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : []);
        if (checked) {
          for (const s of rows) cur.add(String(s?.id || ''));
        } else {
          for (const s of rows) cur.delete(String(s?.id || ''));
        }
        STATE.teacher.selectedIds = Array.from(cur).filter(Boolean);
        render();
        return;
      }
      const selOne = t?.closest?.('[data-bl-teacher-select]');
      if (selOne) {
        const sid = String(selOne.getAttribute('data-bl-teacher-select') || '');
        const checked = !!selOne.checked;
        const cur = new Set(Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : []);
        if (checked) cur.add(sid);
        else cur.delete(sid);
