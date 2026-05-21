      darkEl?.addEventListener('input', () => { applyFromInputs(); });
      document.getElementById('vcpBoardResetBtn')?.addEventListener('click', () => {
        setBoardColors({ light: VCP_DEFAULTS.boardLight, dark: VCP_DEFAULTS.boardDark });
        render();
      });
    }
  }

  function studentLabelById(id) {
    if (STATE.role === 'teacher' && String(id) === String(STATE.me?.id || '')) {
      const nm = String(STATE.me?.name || 'Teacher');
      return `${nm} (Teacher)`;
    }
    const s = STATE.students.find((x) => String(x.id) === String(id));
    if (!s) return String(id || '');
    const nm = String(s.name || 'Unknown');
    const sid = String(s.chessComId || s.studentId || '');
    return sid ? `${nm} (${sid})` : nm;
  }

  function plainNameById(id) {
    const uid = String(id || '');
    if (!uid) return '';
    if (uid === String(STATE.me?.id || '')) return String(STATE.me?.name || 'Teacher');
    const s = STATE.students.find((x) => String(x.id) === uid);
    if (s) return String(s.name || 'Student');
    return uid;
  }

  function getTeacherLiveSessionsSorted() {
    const uid = String(STATE.me?.id || '');
    const games = Array.isArray(STATE.liveGames) ? STATE.liveGames : [];
    const mine = games.filter((g) => String(g.whiteId || '') === uid || String(g.blackId || '') === uid);
    mine.sort((a, b) => new Date(a.startedAt || a.createdAt || 0) - new Date(b.startedAt || b.createdAt || 0));
    return mine;
  }

  function computeTeacherTurnForLive(g) {
    const uid = String(STATE.me?.id || '');
    const turn = String(g?.state?.turn || 'w');
    const myColor = String(g.whiteId || '') === uid ? 'w' : (String(g.blackId || '') === uid ? 'b' : null);
    return myColor && turn === myColor;
  }

  function autoSwitchAfterTeacherMove(currentSessionId) {
    if (STATE.role !== 'teacher') return;
    if (!STATE.teacherAutoSwitch) return;
    const cur = String(currentSessionId || (STATE.activeSession?.id) || '');
    const mine = getTeacherLiveSessionsSorted();
    const candidate = mine.find((g) => {
      if (!g) return false;
      if (String(g.sessionId || '') === cur) return false;
      if (g?.state?.gameOver) return false;
      return !!computeTeacherTurnForLive(g);
    });
    if (!candidate) return;
    openMyGame(String(candidate.sessionId || ''));
  }

  function teacherTurnForActiveSession() {
    if (STATE.role !== 'teacher') return false;
    const s = STATE.activeSession;
    if (!s || String(s.mode) !== 'chess') return false;
    const st = s.chessState || null;
    if (!st || st.gameOver) return false;
    const myId = String(STATE.me?.id || '');
    const whiteId = String(s?.config?.whiteStudentId || '');
    const blackId = String(s?.config?.blackStudentId || '');
    const myColor = myId && myId === whiteId ? 'w' : (myId && myId === blackId ? 'b' : null);
    if (!myColor) return false;
    return String(st.turn || 'w') === myColor;
  }

  function updateLiveGameStateFromSync(sessionId, chessState) {
    const sid = String(sessionId || '');
    if (!sid || !chessState) return;
    const games = Array.isArray(STATE.liveGames) ? STATE.liveGames : [];
    const idx = games.findIndex((g) => String(g?.sessionId || '') === sid);
    if (idx < 0) return;
    const cur = games[idx];
    games[idx] = {
      ...cur,
      state: {
        ...(cur?.state && typeof cur.state === 'object' ? cur.state : {}),
        ...chessState
      }
    };
    STATE.liveGames = games;
  }

  function autoSwitchOnSyncIfNeeded() {
    if (STATE.role !== 'teacher') return;
    if (!STATE.teacherAutoSwitch) return;
    // Only auto-switch while the teacher is in the session view.
    if (STATE.page !== 'session') return;

    // If current viewed session is teacher-to-move, never switch away.
    if (teacherTurnForActiveSession()) return;

    // Otherwise, jump to the earliest-created session where it's teacher-to-move.
    const mine = getTeacherLiveSessionsSorted();
    const candidate = mine.find((g) => g && !g?.state?.gameOver && computeTeacherTurnForLive(g));
    const curId = String(STATE.activeSession?.id || '');
    if (!candidate) return;
    if (String(candidate.sessionId || '') === curId) return;
    openMyGame(String(candidate.sessionId || ''));
  }

  function renderTeacherSessionBar() {
    if (STATE.role !== 'teacher') return '';
    const curId = String(STATE.activeSession?.id || '');
    const live = getTeacherLiveSessionsSorted();

    const liveTabs = live.map((g) => {
      const sid = String(g.sessionId || '');
      const myId = String(STATE.me?.id || '');
      const oppId = String(g.whiteId || '') === myId ? String(g.blackId || '') : String(g.whiteId || '');
      const label = plainNameById(oppId) || 'Student';
      const isActive = sid && sid === curId;
      return { kind: 'live', key: `live:${sid}`, id: sid, label, ts: String(g.startedAt || g.createdAt || '') , active: isActive, oppId };
    });

    // Only show active/live sessions in the session bar.
    // Finished games are accessible via Profile -> Game history.
    const all = [...liveTabs];
    all.sort((a, b) => new Date(a.ts || 0) - new Date(b.ts || 0));

    const tabsHtml = all.length ? all.map((t) => {
      if (t.kind === 'live') {
        return `<button class="vcp-session-tabbtn ${t.active ? 'active' : ''}" type="button" data-vcp-session-tab="${escapeHtml(t.id)}">${escapeHtml(t.label)}</button>`;
      }
    }).join('') : `<div class="vcp-muted">No games yet.</div>`;

    return `
      <div class="vcp-session-bar">
        <label class="vcp-switch">
          <input id="vcpAutoSwitchToggle" type="checkbox" ${STATE.teacherAutoSwitch ? 'checked' : ''}>
          <span class="vcp-switch-label">Auto Switch</span>
        </label>
        <div class="vcp-session-tabs" id="vcpSessionTabs" role="tablist" aria-label="Your games">
          ${tabsHtml}
        </div>
      </div>
    `;
  }

  function pieceImagePath(p) {
    if (!p) return '';
    const color = p === p.toUpperCase() ? 'white' : 'black';
    const t = p.toLowerCase();
    const name =
      t === 'p' ? 'Pawn' :
      t === 'n' ? 'Knight' :
      t === 'b' ? 'Bishop' :
      t === 'r' ? 'Rook' :
      t === 'q' ? 'Queen' :
      t === 'k' ? 'King' : '';
    if (!name) return '';
    return `/application/vchess-platform/pieces/${color}_${name}.png`;
  }

  function formatMs(ms) {
    const s = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function computeLiveClocks(game) {
    const st = game?.state || {};
    const turn = String(st.turn || 'w');
    const turnStartTs = Number(st.turnStartTs || Date.now());
    const elapsed = Math.max(0, Date.now() - turnStartTs);
    const wMs0 = Number(st.clocks?.wMs ?? 0);
    const bMs0 = Number(st.clocks?.bMs ?? 0);
    const wMs = st.gameOver ? wMs0 : (turn === 'w' ? Math.max(0, wMs0 - elapsed) : wMs0);
    const bMs = st.gameOver ? bMs0 : (turn === 'b' ? Math.max(0, bMs0 - elapsed) : bMs0);
    return { wMs, bMs, turn };
  }

  function renderMiniBoard(board) {
    const b = Array.isArray(board) ? board : [];
    const out = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const light = (r + c) % 2 === 0;
        const p = (b[r] && b[r][c]) ? String(b[r][c]) : '';
        out.push(`
          <div class="vcp-mini-sq ${light ? 'light' : 'dark'}">
            ${p ? `<img class="vcp-mini-piece" draggable="false" alt="${escapeHtml(p)}" src="${pieceImagePath(p)}">` : ''}
          </div>
        `);
      }
    }
    return `<div class="vcp-mini-board">${out.join('')}</div>`;
  }

  // Game history view reuses Normal Chess UI (same as session page).

  function renderLiveGames() {
    const games = Array.isArray(STATE.liveGames) ? STATE.liveGames : [];
    if (!games.length) {
      return `<div class="vcp-muted">No live games right now.</div>`;
    }
    return `
      <div class="vcp-live-grid">
        ${games.map((g) => {
          const clocks = computeLiveClocks(g);
          const whiteLabel = `${String(g.whiteName || 'White')}${g.whiteStudentId ? ` (${String(g.whiteStudentId)})` : ''}`;
          const blackLabel = `${String(g.blackName || 'Black')}${g.blackStudentId ? ` (${String(g.blackStudentId)})` : ''}`;
          return `
            <div class="vcp-live-card" data-live-session="${escapeHtml(String(g.sessionId || ''))}" style="cursor:pointer;">
              <div class="vcp-live-card-header">
                <div class="vcp-live-names">${escapeHtml(whiteLabel)} vs ${escapeHtml(blackLabel)}</div>
                <div class="vcp-live-meta">
                  <div class="vcp-live-clock">W ${escapeHtml(formatMs(clocks.wMs))} | B ${escapeHtml(formatMs(clocks.bMs))}</div>
                  <span class="vcp-status-pill ${clocks.turn === 'w' ? 'online' : 'in-game'}">Turn ${clocks.turn === 'w' ? 'White' : 'Black'}</span>
                </div>
              </div>
              ${renderMiniBoard(g?.state?.board)}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function computeMyGames() {
    const role = String(STATE.role || '');
    const uid = String(STATE.me?.id || '');
    const games = Array.isArray(STATE.liveGames) ? STATE.liveGames : [];
    if (!uid) return [];
    if (role === 'teacher') {
      // Teacher "My game" should show only games where the teacher is one of the two players
      // (e.g., teacher-vs-student match). Games between two students should be watched via Live Game.
      return games.filter(g => String(g.whiteId || '') === uid || String(g.blackId || '') === uid);
    }
    // student
    return games.filter(g => String(g.whiteId || '') === uid || String(g.blackId || '') === uid);
  }

  function renderMyGames() {
    const games = computeMyGames();
    if (!games.length) return `<div class="vcp-muted">No active games for you.</div>`;
    // reuse same card style
    return `
      <div class="vcp-live-grid">
        ${games.map((g) => {
          const clocks = computeLiveClocks(g);
          const whiteLabel = `${String(g.whiteName || 'White')}${g.whiteStudentId ? ` (${String(g.whiteStudentId)})` : ''}`;
          const blackLabel = `${String(g.blackName || 'Black')}${g.blackStudentId ? ` (${String(g.blackStudentId)})` : ''}`;
          return `
            <div class="vcp-live-card" data-my-session="${escapeHtml(String(g.sessionId || ''))}" style="cursor:pointer;">
              <div class="vcp-live-card-header">
                <div class="vcp-live-names">${escapeHtml(whiteLabel)} vs ${escapeHtml(blackLabel)}</div>
                <div class="vcp-live-meta">
                  <div class="vcp-live-clock">W ${escapeHtml(formatMs(clocks.wMs))} | B ${escapeHtml(formatMs(clocks.bMs))}</div>
                  <span class="vcp-status-pill ${clocks.turn === 'w' ? 'online' : 'in-game'}">Turn ${clocks.turn === 'w' ? 'White' : 'Black'}</span>
                </div>
              </div>
              ${renderMiniBoard(g?.state?.board)}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function openMyGame(sessionId) {
    const sid = String(sessionId || '');
    const g = (Array.isArray(STATE.liveGames) ? STATE.liveGames : []).find(x => String(x.sessionId) === sid);
    if (!g) return;
    // Recreate activeSession from snapshot (so refresh/close won't lose the game view)
    STATE.activeSession = {
      id: sid,
      orgId: '',
      mode: 'chess',
      studentIds: [String(g.whiteId || ''), String(g.blackId || '')],
      config: {
        minutes: Number(g?.config?.minutes || 3),
        incrementSec: Number(g?.config?.incrementSec || 0),
        whiteStudentId: String(g.whiteId || ''),
        blackStudentId: String(g.blackId || '')
      },
      chessState: g.state || null,
      status: 'active'
    };
    STATE.page = 'session';
    render();
    try {
      const key = `vcpLastSession:${String(STATE.role || '')}:${String(STATE.me?.id || '')}`;
      localStorage.setItem(key, sid);
    } catch {}
  }

  function ensureDelegatedClicks() {
    if (STATE.uiDelegatedBound) return;
    const root = getRoot();
    if (!root) return;
    STATE.uiDelegatedBound = true;
    root.addEventListener('click', (e) => {
      const target = e.target;

      const live = target?.closest?.('[data-live-session]');
      if (live) {
        const sid = String(live.getAttribute('data-live-session') || '');
        if (sid) openLiveViewer(sid);
        return;
      }

      const prof = target?.closest?.('[data-vcp-profile-id]');
      if (prof) {
        const pid = String(prof.getAttribute('data-vcp-profile-id') || '');
        if (pid) openProfile(pid);
        return;
      }

      const pg = target?.closest?.('[data-vcp-history-page]');
      if (pg) {
        const p = Number(pg.getAttribute('data-vcp-history-page') || 1);
        const uid = String(STATE.profileTargetId || '');
        if (uid) {
          STATE.profileHistory.loading = true;
          STATE.profileHistory.error = null;
          wsSend({ type: 'vcp_get_game_history', targetUserId: uid, page: Number.isFinite(p) ? Math.max(1, Math.floor(p)) : 1 });
          render();
        }
        return;
      }

      const row = target?.closest?.('[data-vcp-game-id]');
      if (row) {
        const gid = String(row.getAttribute('data-vcp-game-id') || '');
        if (gid) openHistoryGame(gid);
        return;
      }

      const el = target?.closest?.('[data-my-session]');
      if (!el) return;
      const sid = el.getAttribute('data-my-session');
      if (!sid) return;
      openMyGame(sid);
    });

    // Session bar game tabs (teacher multi-game)
    root.addEventListener('click', (e) => {
      const target = e.target;
      const tab = target?.closest?.('[data-vcp-session-tab]');
      if (tab) {
        const sid = String(tab.getAttribute('data-vcp-session-tab') || '');
        if (sid) openMyGame(sid);
        return;
      }
      const gtab = target?.closest?.('[data-vcp-game-tab]');
      if (gtab) {
        const gid = String(gtab.getAttribute('data-vcp-game-tab') || '');
        if (gid) openHistoryGame(gid);
        return;
      }
    });
  }

  function renderHeaderBadge() {
    // Per request: show name only (no ID / role text).
    const name = String(STATE.me?.name || 'Unknown');
    return `${escapeHtml(name)}`;
  }

  // Game Viewer intentionally removed (user will redesign later).

  function getProfileUserById(id) {
    const uid = String(id || '');
    if (!uid) return null;
    if (uid === String(STATE.me?.id || '')) {
      return {
        id: String(STATE.me?.id || ''),
        name: String(STATE.me?.name || 'Unknown'),
        // chess.com ID (for student role only)
        studentId: STATE.role === 'student' ? String(STATE.me?.chessComId || STATE.me?.studentId || '') : '',
        role: String(STATE.role || ''),
        status: STATE.role === 'student' ? String(STATE.status || 'online') : 'online'
      };
    }
    const s = STATE.students.find((x) => String(x?.id || '') === uid);
    if (!s) return null;
    return {
      id: String(s.id || ''),
      name: String(s.name || 'Unknown'),
      // chess.com ID (legacy key name kept as `studentId` in UI model)
      studentId: String(s.chessComId || s.studentId || ''),
      role: 'student',
      status: String(s.status || 'online')
    };
  }

  function openProfile(id) {
    const uid = String(id || '');
    if (!uid) return;
    STATE.page = 'profile';
    STATE.profileTargetId = uid;
    STATE.profileHistory = { loading: true, error: null, page: 1, totalPages: 1, totalItems: 0, games: [] };
    wsSend({ type: 'vcp_get_game_history', targetUserId: uid, page: 1 });
    render();
  }

  function closeProfile() {
    STATE.page = 'lobby';
    STATE.profileTargetId = null;
    STATE.profileHistory = { loading: false, error: null, page: 1, totalPages: 1, totalItems: 0, games: [] };
    render();
  }

  function openHistoryGame(gameId) {
    const gid = String(gameId || '');
    if (!gid) return;
    try { STATE.historyNcApp?.destroy?.(); } catch {}
    STATE.historyNcApp = null;
    STATE.historyNcKey = null;
    STATE.page = 'historyGame';
    STATE.historyGame = { loading: true, error: null, gameId: gid, game: null };
    wsSend({ type: 'vcp_get_game_record', gameId: gid });
    render();
  }

  function closeHistoryGame() {
    try { STATE.historyNcApp?.destroy?.(); } catch {}
    STATE.historyNcApp = null;
    STATE.historyNcKey = null;
    STATE.historyGame = { loading: false, error: null, gameId: null, game: null };
    STATE.page = 'profile';
    render();
  }

  function openLiveViewer(sessionId) {
    const sid = String(sessionId || '');
    if (!sid) return;
    try { STATE.liveNcApp?.destroy?.(); } catch {}
    STATE.liveNcApp = null;
    STATE.liveNcKey = null;
    STATE.page = 'liveViewer';
    STATE.liveViewer = { loading: true, error: null, sessionId: sid, session: null };
    wsSend({ type: 'vcp_get_session', sessionId: sid });
    wsSend({ type: 'vcp_watch_session', sessionId: sid });
    render();
  }

  function closeLiveViewer() {
    const sid = String(STATE.liveViewer?.sessionId || '');
    if (sid) wsSend({ type: 'vcp_unwatch_session', sessionId: sid });
    try { STATE.liveNcApp?.destroy?.(); } catch {}
