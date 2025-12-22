(function () {
  const STATE = {
    role: 'student', // 'teacher'|'student'
    ws: null,
    wsReady: false,
    me: { id: '', name: 'Unknown', studentId: '' },
    status: 'online', // student-only
    page: 'lobby', // 'lobby' | 'profile'
    profileTargetId: null, // userId
    profileHistory: { loading: false, error: null, page: 1, totalPages: 1, totalItems: 0, games: [] },
    historyGame: { loading: false, error: null, gameId: null, game: null },
    // Teacher view
    students: [], // [{id,name,studentId,status,inGame}]
    selected: new Set(),
    // Invites / sessions
    invites: [], // student-only: [{invite}]
    teacherMessages: [],
    activeSession: null, // {id, mode, config, studentIds}
    lastError: null,
    pendingInvite: null, // teacher-only: { inviteId, studentIds, config, createdAt, responses }
    ncApp: null,
    ncSessionId: null,
    historyNcApp: null,
    historyNcKey: null,
    liveGames: [], // org-wide spectator snapshots
    uiDelegatedBound: false
  };

  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let heartbeatTimer = null;
  let lastPongTs = 0;

  function getRoot() {
    return document.getElementById('vChessPlatformRoot');
  }

  function safeJsonParse(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function getRole() {
    const params = new URLSearchParams(window.location.search);
    const q = String(params.get('role') || '').toLowerCase();
    if (q === 'teacher' || q === 'student') return q;
    try {
      const ls = String(localStorage.getItem('vChessPlatformRole') || '').toLowerCase();
      if (ls === 'teacher' || ls === 'student') return ls;
    } catch {}
    return 'student';
  }

  function getStudentPlayer() {
    try {
      const raw = localStorage.getItem('vChessPlatformPlayer');
      const parsed = raw ? safeJsonParse(raw) : null;
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
    return null;
  }

  function getAuthToken() {
    try {
      const role = getRole();
      // IMPORTANT:
      // - Student lobby may run on a public page, so it uses a dedicated VCP token.
      // - Teacher lobby MUST use the logged-in teacher authToken, and must ignore any leftover student VCP token.
      if (role === 'teacher') return localStorage.getItem('authToken');
      return localStorage.getItem('vChessPlatformAuthToken') || localStorage.getItem('authToken');
    } catch {
      return null;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function wsUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }

  function wsSend(payload) {
    try {
      if (STATE.ws && STATE.ws.readyState === WebSocket.OPEN) {
        STATE.ws.send(JSON.stringify(payload));
      }
    } catch {}
  }

  function formatDateTime(iso) {
    try {
      const d = new Date(String(iso || ''));
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString();
    } catch {
      return '';
    }
  }

  function formatSpent(ms) {
    const s = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function invertResult(res) {
    const r = String(res || '');
    if (r === '1-0') return '0-1';
    if (r === '0-1') return '1-0';
    return r;
  }

  function userPerspectiveResult(game, targetUserId) {
    const uid = String(targetUserId || '');
    const whiteId = String(game?.whiteId || '');
    const blackId = String(game?.blackId || '');
    const res = String(game?.result || '1/2-1/2');
    if (!uid) return res;
    if (uid === whiteId) return res;
    if (uid === blackId) return invertResult(res);
    return res;
  }

  function setTeacherMessage(text, kind = 'info') {
    const now = new Date().toLocaleTimeString();
    STATE.teacherMessages.unshift({ text: String(text), kind, at: now });
    STATE.teacherMessages = STATE.teacherMessages.slice(0, 6);
  }

  function studentLabelById(id) {
    const s = STATE.students.find((x) => String(x.id) === String(id));
    if (!s) return String(id || '');
    const nm = String(s.name || 'Unknown');
    const sid = String(s.studentId || '');
    return sid ? `${nm} (${sid})` : nm;
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
    return `/game/vchess-platform/pieces/${color}_${name}.png`;
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
            <div class="vcp-live-card" data-live-session="${escapeHtml(String(g.sessionId || ''))}">
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
      return games.filter(g => String(g.teacherId || '') === uid);
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
  }

  function renderHeaderBadge() {
    const name = String(STATE.me?.name || 'Unknown');
    const uid = String(STATE.me?.id || '');
    const role = String(STATE.role || '');
    const sid = role === 'student' ? String(STATE.me?.studentId || '') : '';
    const idLabel = role === 'teacher'
      ? (uid ? `Teacher ID: ${uid}` : '')
      : (sid ? `Student ID: ${sid}` : (uid ? `ID: ${uid}` : ''));
    return `${escapeHtml(name)}${idLabel ? ` (${escapeHtml(idLabel)})` : ''}${STATE.wsReady ? '' : ' (disconnected)'}`;
  }

  // Game Viewer intentionally removed (user will redesign later).

  function getProfileUserById(id) {
    const uid = String(id || '');
    if (!uid) return null;
    if (uid === String(STATE.me?.id || '')) {
      return {
        id: String(STATE.me?.id || ''),
        name: String(STATE.me?.name || 'Unknown'),
        studentId: STATE.role === 'student' ? String(STATE.me?.studentId || '') : '',
        role: String(STATE.role || ''),
        status: STATE.role === 'student' ? String(STATE.status || 'online') : 'online'
      };
    }
    const s = STATE.students.find((x) => String(x?.id || '') === uid);
    if (!s) return null;
    return {
      id: String(s.id || ''),
      name: String(s.name || 'Unknown'),
      studentId: String(s.studentId || ''),
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

  // openGameViewer / closeGameViewer removed.

  function renderProfileScreen() {
    const root = getRoot();
    if (!root) return;
    const target = getProfileUserById(STATE.profileTargetId) || {
      id: String(STATE.profileTargetId || ''),
      name: 'Unknown',
      studentId: '',
      role: 'student',
      status: 'online'
    };
    const isMe = String(target.id || '') === String(STATE.me?.id || '');
    const idLine = target.role === 'teacher'
      ? `Teacher ID: ${target.id || ''}`
      : (target.studentId ? `Student ID: ${target.studentId}` : (target.id ? `ID: ${target.id}` : ''));

    const hist = STATE.profileHistory || { loading: false, error: null, page: 1, totalPages: 1, totalItems: 0, games: [] };
    const games = Array.isArray(hist.games) ? hist.games : [];
    const pageNums = (() => {
      const total = Math.max(1, Number(hist.totalPages || 1));
      const count = Math.min(5, total);
      return Array.from({ length: count }, (_, i) => i + 1);
    })();

    // Game Viewer removed (no modal HTML).
    const gameModalHtml = '';

    root.innerHTML = `
      <div class="vcp-card">
        <div class="vcp-row">
          <div>
            <div class="vcp-title">V.Chess Platform</div>
            <div class="vcp-subtitle">Profile</div>
          </div>
          <button class="vcp-badge vcp-badge-btn" type="button" data-vcp-profile-id="${escapeHtml(String(STATE.me?.id || ''))}">
            ${renderHeaderBadge()}
          </button>
        </div>

        <div class="vcp-section">
          <div class="vcp-profile-shell">
            <div class="vcp-profile-card">
              <div class="vcp-profile-header">
                <div>
                  <div class="vcp-profile-name">${escapeHtml(String(target.name || 'Unknown'))}${isMe ? ' <span class="vcp-profile-me">(You)</span>' : ''}</div>
                  <div class="vcp-profile-id">${escapeHtml(String(idLine || ''))}</div>
                </div>
                <div>
                  <span class="vcp-status-pill ${escapeHtml(String(target.status || 'online'))}">${escapeHtml(String(target.status || 'online'))}</span>
                </div>
              </div>

              <div class="vcp-btn-row" style="justify-content:flex-end; margin-top:12px;">
                <button id="vcpProfileBackBtn" class="btn btn-secondary" type="button">Back</button>
              </div>
            </div>

            <div class="vcp-history-card">
              <div class="vcp-profile-section-title">Game history</div>
              <div class="vcp-muted">Shows the latest games for this user. Click a game to view.</div>

              ${hist.loading ? `<div class="vcp-muted" style="margin-top:10px;">Loading...</div>` : ''}
              ${hist.error ? `<div class="vcp-muted" style="margin-top:10px; color:#b91c1c;">${escapeHtml(String(hist.error))}</div>` : ''}

              ${(!hist.loading && games.length === 0) ? `<div class="vcp-muted" style="margin-top:10px;">No games yet.</div>` : ''}

              ${games.length ? `
                <div class="vcp-history-scroll" role="region" aria-label="Game history list">
                  <div class="vcp-history-list" role="list">
                    ${games.map((g) => {
                      const uid = String(STATE.profileTargetId || '');
                      const isWhite = uid && uid === String(g.whiteId || '');
                      const meName = isWhite ? String(g.whiteName || 'Student A') : String(g.blackName || 'Student A');
                      const oppName = isWhite ? String(g.blackName || 'Student B') : String(g.whiteName || 'Student B');
                      const res = userPerspectiveResult(g, uid);
                      const date = formatDateTime(g.endedAt || g.startedAt);
                      return `
                        <button class="vcp-history-row" type="button" data-vcp-game-id="${escapeHtml(String(g.id || ''))}">
                          <div class="vcp-history-main">
                            <div class="vcp-history-title">${escapeHtml(`${meName} vs ${oppName}`)}</div>
                            <div class="vcp-history-meta">${escapeHtml(date)}</div>
                          </div>
                          <div class="vcp-history-result">${escapeHtml(res)}</div>
                        </button>
                      `;
                    }).join('')}
                  </div>
                </div>
              ` : ''}

              ${(Number(hist.totalPages || 1) > 1) ? `
                <div class="vcp-pagination" role="navigation" aria-label="Game history pages">
                  ${pageNums.map((p) => `
                    <button class="vcp-page-btn ${Number(hist.page || 1) === p ? 'active' : ''}" type="button" data-vcp-history-page="${p}">${p}</button>
                  `).join('')}
                  ${Number(hist.totalPages || 1) > 5 ? `<span class="vcp-muted">…</span><button class="vcp-page-btn" type="button" data-vcp-history-page="${escapeHtml(String(hist.totalPages))}">${escapeHtml(String(hist.totalPages))}</button>` : ''}
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
      ${gameModalHtml}
    `;

    document.getElementById('vcpProfileBackBtn')?.addEventListener('click', closeProfile);
  }

  function renderOnlineListItem(s, { selectable }) {
    const safeId = escapeHtml(String(s?.id || ''));
    const safeName = escapeHtml(String(s?.name || 'Unknown'));
    const safeStudentId = escapeHtml(String(s?.studentId || ''));
    const safeStatus = escapeHtml(String(s?.status || 'online'));

    if (selectable) {
      const checked = STATE.selected.has(String(s?.id)) ? 'checked' : '';
      const disabled = String(s?.status) === 'in-game' ? 'disabled' : '';
      return `
        <div class="vcp-online-item" role="listitem">
          <div>
            <input type="checkbox" data-student-id="${safeId}" ${checked} ${disabled} aria-label="Select ${safeName}" />
          </div>
          <div>
            <button class="vcp-online-item-name vcp-name-btn" type="button" data-vcp-profile-id="${safeId}" aria-label="Open profile for ${safeName}">${safeName}</button>
            <div class="vcp-online-item-meta">
              <div class="vcp-online-item-studentid">${safeStudentId}</div>
              <span class="vcp-status-pill ${safeStatus}">${safeStatus}</span>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="vcp-online-item no-select" role="listitem">
        <div>
          <button class="vcp-online-item-name vcp-name-btn" type="button" data-vcp-profile-id="${safeId}" aria-label="Open profile for ${safeName}">${safeName}</button>
          <div class="vcp-online-item-meta">
            <div class="vcp-online-item-studentid">${safeStudentId}</div>
            <span class="vcp-status-pill ${safeStatus}">${safeStatus}</span>
          </div>
        </div>
      </div>
    `;
  }

  function connectWs() {
    const token = getAuthToken();
    if (!token) {
      const root = getRoot();
      if (root) {
        root.innerHTML = `
          <div class="vcp-card">
            <div class="vcp-title">V.Chess Platform</div>
            <div class="vcp-muted">Authentication token is missing. Please log in again.</div>
          </div>
        `;
      }
      return;
    }
    // Avoid double connections
    if (STATE.ws && (STATE.ws.readyState === WebSocket.OPEN || STATE.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    try {
      STATE.ws = new WebSocket(wsUrl());
    } catch (e) {
      console.error('WS connect failed', e);
      return;
    }

    STATE.ws.addEventListener('open', () => {
      wsSend({ type: 'vcp_hello', token });
    });
    STATE.ws.addEventListener('message', (ev) => {
      let msg = null;
      try { msg = JSON.parse(String(ev.data || '')); } catch { return; }
      handleWsMessage(msg);
    });
    STATE.ws.addEventListener('close', () => {
      STATE.wsReady = false;
      stopHeartbeat();
      // keep UI but show disconnected badge
      render();
      scheduleReconnect();
    });
    STATE.ws.addEventListener('error', () => {
      // Most environments also trigger close; just ensure we attempt reconnect.
      try { STATE.ws?.close(); } catch {}
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    // Exponential backoff with cap + jitter
    const base = Math.min(30000, 800 * Math.pow(2, reconnectAttempt));
    const jitter = Math.floor(Math.random() * 400);
    const delay = Math.min(30000, base + jitter);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectAttempt = Math.min(10, reconnectAttempt + 1);
      connectWs();
    }, delay);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    lastPongTs = 0;
  }

  function startHeartbeat() {
    stopHeartbeat();
    lastPongTs = Date.now();
    heartbeatTimer = setInterval(() => {
      if (!STATE.ws || STATE.ws.readyState !== WebSocket.OPEN) return;
      wsSend({ type: 'vcp_ping' });
      // If no pong for too long, force reconnect
      const now = Date.now();
      if (lastPongTs && (now - lastPongTs) > 65000) {
        try { STATE.ws.close(); } catch {}
      }
    }, 20000);
  }

  // Activity ping (idle after 3 minutes)
  let lastActivityPing = 0;
  function markActivity() {
    if (STATE.role !== 'student') return;
    if (!STATE.wsReady) return;
    const now = Date.now();
    if (now - lastActivityPing < 8000) return; // throttle
    lastActivityPing = now;
    wsSend({ type: 'vcp_activity', statusChanged: 'true' });
  }

  function bindActivityListeners() {
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'focus'];
    events.forEach((evt) => window.addEventListener(evt, markActivity, { passive: true }));
    // Send one right away
    setTimeout(markActivity, 300);
  }

  function renderTeacher() {
    const root = getRoot();
    if (!root) return;
    const selected = Array.from(STATE.selected);

    root.innerHTML = `
      <div class="vcp-card">
        <div class="vcp-row">
          <div>
            <div class="vcp-title">V.Chess Platform</div>
            <div class="vcp-subtitle">Lobby</div>
          </div>
          <button class="vcp-badge vcp-badge-btn" type="button" data-vcp-profile-id="${escapeHtml(String(STATE.me?.id || ''))}">
            ${renderHeaderBadge()}
          </button>
        </div>
        ${STATE.lastError ? `<div class="vcp-muted" style="margin-top:8px; color:#b91c1c;"><strong>Error:</strong> ${escapeHtml(STATE.lastError)}</div>` : ''}

        <div class="vcp-section">
          <div class="vcp-layout">
            <div class="vcp-sidebar" aria-label="Online list sidebar">
              <div style="font-weight:900; color:#111827;">Online list</div>
              <div class="vcp-muted">Select exactly 2 students for Normal Chess.</div>

              <div class="vcp-sidebar-actions">
                <button id="vcpRefreshBtn" class="btn btn-secondary" type="button">Refresh</button>
                <button id="vcpChooseModeBtn" class="btn btn-primary" type="button" ${selected.length === 2 ? '' : 'disabled'}>Choose game mode</button>
              </div>

              <div class="vcp-online-list" role="list">
                ${STATE.students.map((s) => renderOnlineListItem(s, { selectable: true })).join('')}
                ${STATE.students.length === 0 ? `
                  <div class="vcp-muted" style="margin-top:10px;">No students online.</div>
                ` : ''}
              </div>
            </div>

            <div class="vcp-main">
              ${STATE.pendingInvite ? `
                <div class="vcp-list-item" style="border-style:solid; margin-bottom:12px;">
                  <div style="font-weight:950; color:#111827;">Pending invite</div>
                  <div class="vcp-muted" style="margin-top:6px;">
                    Waiting for students to accept…
                  </div>
                  <div class="vcp-muted" style="margin-top:6px;">
                    Time: <strong>${escapeHtml(String(STATE.pendingInvite.config?.minutes || 3))} min</strong> + <strong>${escapeHtml(String(STATE.pendingInvite.config?.incrementSec || 0))} sec</strong>
                  </div>
                  <div class="vcp-muted" style="margin-top:6px;">
                    White: <strong>${escapeHtml(studentLabelById(STATE.pendingInvite.config?.whiteStudentId))}</strong><br>
                    Black: <strong>${escapeHtml(studentLabelById(STATE.pendingInvite.config?.blackStudentId))}</strong>
                  </div>
                  <div class="vcp-muted" style="margin-top:8px;">
                    ${STATE.pendingInvite.studentIds.map((sid) => {
                      const r = STATE.pendingInvite.responses?.[String(sid)] || 'pending';
                      const pill = r === 'accept' ? 'online' : r === 'decline' ? 'idle' : 'in-game';
                      const text = r === 'accept' ? 'accepted' : r === 'decline' ? 'declined' : 'pending';
                      return `${escapeHtml(studentLabelById(sid))}: <span class="vcp-status-pill ${pill}">${text}</span>`;
                    }).join('<br>')}
                  </div>
                  <div class="vcp-btn-row" style="margin-top:10px; justify-content:flex-end;">
                    <button id="vcpDismissInviteBtn" class="btn btn-secondary" type="button">Dismiss</button>
                  </div>
                </div>
              ` : ''}

              <div style="font-weight:900; color:#111827; margin-bottom:6px;">My game</div>
              <div id="vcpMyGamesArea">${renderMyGames()}</div>

              <div style="font-weight:900; color:#111827; margin:14px 0 6px;">Live Game</div>
              <div id="vcpLiveGamesArea">${renderLiveGames()}</div>
            </div>
          </div>
        </div>
      </div>

      ${renderTeacherChooseModeModal()}
    `;

    document.getElementById('vcpRefreshBtn')?.addEventListener('click', () => {
      wsSend({ type: 'vcp_get_presence' });
      wsSend({ type: 'vcp_get_live_games' });
    });

    root.querySelectorAll('input[type="checkbox"][data-student-id]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-student-id');
        if (!id) return;
        if (cb.checked) STATE.selected.add(id);
        else STATE.selected.delete(id);
        render();
      });
    });

    document.getElementById('vcpChooseModeBtn')?.addEventListener('click', () => {
      if (Array.from(STATE.selected).length !== 2) return;
      openChooseModeModal();
    });

    document.getElementById('vcpDismissInviteBtn')?.addEventListener('click', () => {
      STATE.pendingInvite = null;
      render();
    });

    bindTeacherModalEvents();
  }

  function renderStudent() {
    const root = getRoot();
    if (!root) return;
    const player = STATE.me;

    root.innerHTML = `
      <div class="vcp-card">
        <div class="vcp-row">
          <div>
            <div class="vcp-title">V.Chess Platform</div>
          <div class="vcp-subtitle">Lobby</div>
          </div>
          <button class="vcp-badge vcp-badge-btn" type="button" data-vcp-profile-id="${escapeHtml(String(STATE.me?.id || ''))}">
            ${renderHeaderBadge()}
          </button>
        </div>
        ${STATE.lastError ? `<div class="vcp-muted" style="margin-top:8px; color:#b91c1c;"><strong>Error:</strong> ${escapeHtml(STATE.lastError)}</div>` : ''}

        <div class="vcp-section">
          <div class="vcp-layout">
            <div class="vcp-sidebar" aria-label="Online list sidebar">
              <div style="font-weight:900; color:#111827;">Online list</div>
              <div class="vcp-muted">Your status: <span class="vcp-status-pill ${escapeHtml(STATE.status)}">${escapeHtml(STATE.status)}</span></div>

              <div class="vcp-sidebar-actions">
                <button id="vcpStudentRefreshBtn" class="btn btn-secondary" type="button">Refresh</button>
              </div>

              <div class="vcp-online-list" role="list">
                ${STATE.students.map((s) => renderOnlineListItem(s, { selectable: false })).join('')}
                ${STATE.students.length === 0 ? `
                  <div class="vcp-muted" style="margin-top:10px;">No students online.</div>
                ` : ''}
              </div>
            </div>

            <div class="vcp-main">
              <div style="font-weight:900; color:#111827; margin-bottom:6px;">My game</div>
              <div id="vcpMyGamesArea">${renderMyGames()}</div>

              <div style="font-weight:900; color:#111827; margin:14px 0 6px;">Live Game</div>
              <div id="vcpLiveGamesArea">${renderLiveGames()}</div>

              <div class="vcp-list" style="margin-top:12px;">
                <div class="vcp-list-item">
                  <div style="font-weight:900; color:#111827;">Invites</div>
                  <div class="vcp-muted" style="margin-top:6px;">${STATE.invites.length ? `${STATE.invites.length} pending` : 'No invites yet.'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      ${renderStudentInviteModal()}
    `;

    document.getElementById('vcpStudentRefreshBtn')?.addEventListener('click', () => {
      wsSend({ type: 'vcp_get_presence' });
      wsSend({ type: 'vcp_get_live_games' });
      markActivity();
    });

    bindStudentInviteModalEvents();
  }

  function renderSessionPage() {
    const root = getRoot();
    if (!root) return;
    if (!STATE.activeSession) {
      STATE.page = 'lobby';
      render();
      return;
    }
    const s = STATE.activeSession;
    if (String(s.mode) !== 'chess') {
      STATE.page = 'lobby';
      render();
      return;
    }

    root.innerHTML = `
      <div class="vcp-card">
        <div class="vcp-row">
          <div>
            <div class="vcp-title">V.Chess Platform</div>
            <div class="vcp-subtitle">Session</div>
          </div>
          <div class="vcp-btn-row" style="justify-content:flex-end;">
            <button id="vcpSessionBackBtn" class="btn btn-secondary" type="button">Back to lobby</button>
          </div>
        </div>
        <div class="vcp-section">
          <div id="ncMount"></div>
        </div>
      </div>
    `;

    bindSessionEvents();
  }

  function renderHistoryGamePage() {
    const root = getRoot();
    if (!root) return;
    const hg = STATE.historyGame || { loading: false, error: null, gameId: null, game: null };

    root.innerHTML = `
      <div class="vcp-card">
        <div class="vcp-row">
          <div>
            <div class="vcp-title">V.Chess Platform</div>
            <div class="vcp-subtitle">Session</div>
          </div>
          <div class="vcp-btn-row" style="justify-content:flex-end;">
            <button id="vcpHistoryBackBtn" class="btn btn-secondary" type="button">Back</button>
          </div>
        </div>

        <div class="vcp-section">
          <div id="ncHistoryMount">
            ${hg.loading ? `<div class="vcp-muted">Loading...</div>` : ''}
            ${hg.error ? `<div class="vcp-muted" style="color:#b91c1c;">${escapeHtml(String(hg.error))}</div>` : ''}
          </div>
        </div>
      </div>
    `;

    document.getElementById('vcpHistoryBackBtn')?.addEventListener('click', closeHistoryGame);
    bindHistoryGameEvents();
  }

  function bindSessionEvents() {
    if (!STATE.activeSession) return;
    // Back should NOT end the game. User can reopen via "My game".
    document.getElementById('vcpSessionBackBtn')?.addEventListener('click', closeSessionView);

    // Mount Normal Chess UI
    try {
      const mount = document.getElementById('ncMount');
      if (mount && window.NormalChess?.mountNormalChess) {
        const sessionId = String(STATE.activeSession.id || '');
        // Create once per render
        if (!STATE.ncApp || String(STATE.ncSessionId) !== sessionId) {
          STATE.ncSessionId = sessionId;
          STATE.ncApp = window.NormalChess.mountNormalChess({
            rootEl: mount,
            send: wsSend,
            getSession: () => STATE.activeSession,
            getIdentity: () => ({ role: STATE.role, id: STATE.me?.id || '' }),
            getPlayerLabelById: (id) => studentLabelById(id)
          });
        }
        if (STATE.ncApp?.applyState && STATE.activeSession?.chessState) {
          STATE.ncApp.applyState(STATE.activeSession.chessState);
        }
      }
    } catch {}
  }

  function buildHistoryChessSessionFromGameRecord(g) {
    if (!g) return null;
    const whiteId = String(g.whiteId || g?.config?.whiteStudentId || 'white');
    const blackId = String(g.blackId || g?.config?.blackStudentId || 'black');
    const cfg = g?.config && typeof g.config === 'object' ? g.config : {};
    const minutes = Number(cfg.minutes || 3) || 3;
    const incrementSec = Number(cfg.incrementSec || 0) || 0;

    const boards = Array.isArray(g?.timelineBoards) ? g.timelineBoards : null;
    const lastPly = boards ? Math.max(0, boards.length - 1) : 0;
    const board = boards ? boards[lastPly] : (g?.state?.board || null);
    const tClocks = Array.isArray(g?.timelineClocks) ? g.timelineClocks[lastPly] : null;
    const wMs = tClocks ? Number(tClocks.wMs || 0) : Number(g?.state?.clocks?.wMs ?? 0);
    const bMs = tClocks ? Number(tClocks.bMs || 0) : Number(g?.state?.clocks?.bMs ?? 0);

    const chessState = {
      ...(g?.state && typeof g.state === 'object' ? g.state : {}),
      board: board || (g?.state?.board || null),
      clocks: { wMs, bMs },
      // Freeze UI: history is read-only
      gameOver: true,
      turnStartTs: Date.now()
    };

    return {
      id: `history:${String(g.id || '')}`,
      mode: 'chess',
      status: 'ended',
      config: { minutes, incrementSec, whiteStudentId: whiteId, blackStudentId: blackId },
      chessState
    };
  }

  function bindHistoryGameEvents() {
    if (STATE.page !== 'historyGame') return;
    const mount = document.getElementById('ncHistoryMount');
    if (!mount) return;
    const g = STATE.historyGame?.game || null;
    if (!g) return;
    if (!window.NormalChess?.mountNormalChess) return;

    const session = buildHistoryChessSessionFromGameRecord(g);
    if (!session) return;

    const key = String(session.id || '');
    if (!STATE.historyNcApp || String(STATE.historyNcKey) !== key) {
      try { STATE.historyNcApp?.destroy?.(); } catch {}
      STATE.historyNcKey = key;
      const sendNoop = () => {};
      const whiteId = String(session?.config?.whiteStudentId || '');
      const blackId = String(session?.config?.blackStudentId || '');
      const whiteName = String(g.whiteName || 'White');
      const blackName = String(g.blackName || 'Black');
      STATE.historyNcApp = window.NormalChess.mountNormalChess({
        rootEl: mount,
        send: sendNoop,
        getSession: () => session,
        getIdentity: () => ({ role: STATE.role, id: STATE.me?.id || '' }),
        getPlayerLabelById: (id) => {
          const sid = String(id || '');
          if (sid && sid === whiteId) return whiteName;
          if (sid && sid === blackId) return blackName;
          return '';
        },
        viewer: true,
        getViewerData: () => {
          const gg = STATE.historyGame?.game || null;
          return {
            sanMoves: Array.isArray(gg?.sanMoves) ? gg.sanMoves : [],
            timelineBoards: Array.isArray(gg?.timelineBoards) ? gg.timelineBoards : [],
            timelineClocks: Array.isArray(gg?.timelineClocks) ? gg.timelineClocks : [],
            pgn: String(gg?.pgn || '')
          };
        }
      });
    }
    try { STATE.historyNcApp?.applyState?.(session.chessState); } catch {}
  }

  function closeSessionView() {
    if (!STATE.activeSession) return;
    try { STATE.ncApp?.destroy?.(); } catch {}
    STATE.ncApp = null;
    STATE.ncSessionId = null;
    // Keep active session available for quick reopen via My game click
    STATE.activeSession = null;
    STATE.page = 'lobby';
    render();
  }

  function leaveSession() {
    if (!STATE.activeSession) return;
    wsSend({ type: 'vcp_leave_session', sessionId: STATE.activeSession.id });
    STATE.activeSession = null;
    STATE.status = 'online';
    try { STATE.ncApp?.destroy?.(); } catch {}
    STATE.ncApp = null;
    STATE.ncSessionId = null;
    render();
  }

  function renderTeacherChooseModeModal() {
    if (!STATE.uiChooseModeOpen) return '';
    const ids = Array.from(STATE.selected);
    const s1 = STATE.students.find(s => s.id === ids[0]) || { id: ids[0], name: 'Student A' };
    const s2 = STATE.students.find(s => s.id === ids[1]) || { id: ids[1], name: 'Student B' };
    const whiteId = STATE.chooseMode?.whiteStudentId || s1.id;
    const blackId = whiteId === s1.id ? s2.id : s1.id;
    const minutes = STATE.chooseMode?.minutes ?? 3;
    const inc = STATE.chooseMode?.incrementSec ?? 2;

    return `
      <div class="vcp-modal-backdrop" id="vcpChooseModeBackdrop" role="presentation">
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Choose game mode">
          <div class="vcp-modal-header">
            <div class="vcp-modal-title">Choose game mode</div>
            <button id="vcpChooseModeClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
          </div>
          <div class="vcp-modal-body">
            <div class="vcp-form-row">
              <label style="font-weight:900; color:#111827;">Mode</label>
              <select id="vcpModeSelect" class="vcp-input">
                <option value="chess" selected>Normal Chess (2 players)</option>
                <option value="royalExchange" disabled>Royal Exchange (coming soon)</option>
                <option value="runningQueen" disabled>Running Queen (coming soon)</option>
                <option value="hopeMate" disabled>Hope Mate (coming soon)</option>
              </select>
              <div class="vcp-help">For now, only Normal Chess is enabled.</div>
            </div>

            <div class="vcp-form-row">
              <label style="font-weight:900; color:#111827;">White</label>
              <select id="vcpWhiteSelect" class="vcp-input">
                <option value="${escapeHtml(s1.id)}" ${whiteId === s1.id ? 'selected' : ''}>${escapeHtml(s1.name)}</option>
                <option value="${escapeHtml(s2.id)}" ${whiteId === s2.id ? 'selected' : ''}>${escapeHtml(s2.name)}</option>
              </select>
            </div>

            <div class="vcp-form-row">
              <label style="font-weight:900; color:#111827;">Black</label>
              <input class="vcp-input" type="text" readonly value="${escapeHtml((blackId === s1.id ? s1.name : s2.name) || '')}">
            </div>

            <div class="vcp-form-row">
              <label style="font-weight:900; color:#111827;">Time control</label>
              <div class="vcp-btn-row">
                <input id="vcpMinutes" class="vcp-input" style="max-width:160px;" type="number" min="1" max="60" value="${escapeHtml(String(minutes))}">
                <div class="vcp-muted">min</div>
                <input id="vcpInc" class="vcp-input" style="max-width:160px;" type="number" min="0" max="60" value="${escapeHtml(String(inc))}">
                <div class="vcp-muted">sec increment</div>
              </div>
              <div class="vcp-help">Time control is per player.</div>
            </div>

            <div class="vcp-btn-row" style="justify-content:flex-end; margin-top:12px;">
              <button id="vcpStartBtn" class="btn btn-primary" type="button">Start</button>
              <button id="vcpCancelBtn" class="btn btn-secondary" type="button">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function openChooseModeModal() {
    const ids = Array.from(STATE.selected);
    if (ids.length !== 2) return;
    STATE.uiChooseModeOpen = true;
    STATE.chooseMode = { whiteStudentId: ids[0], minutes: 3, incrementSec: 2 };
    render();
  }

  function closeChooseModeModal() {
    STATE.uiChooseModeOpen = false;
    STATE.chooseMode = null;
    render();
  }

  function bindTeacherModalEvents() {
    if (!STATE.uiChooseModeOpen) return;
    document.getElementById('vcpChooseModeClose')?.addEventListener('click', closeChooseModeModal);
    document.getElementById('vcpCancelBtn')?.addEventListener('click', closeChooseModeModal);
    document.getElementById('vcpChooseModeBackdrop')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'vcpChooseModeBackdrop') closeChooseModeModal();
    });
    document.getElementById('vcpWhiteSelect')?.addEventListener('change', () => {
      const v = String(document.getElementById('vcpWhiteSelect')?.value || '');
      if (STATE.chooseMode) STATE.chooseMode.whiteStudentId = v;
      render();
    });
    document.getElementById('vcpStartBtn')?.addEventListener('click', () => {
      const ids = Array.from(STATE.selected);
      if (ids.length !== 2) return;
      const white = String(document.getElementById('vcpWhiteSelect')?.value || ids[0]);
      const minutesRaw = Number(document.getElementById('vcpMinutes')?.value || 3) || 3;
      const incRaw = Number(document.getElementById('vcpInc')?.value || 0) || 0;
      const minutes = Math.max(1, Math.min(60, minutesRaw));
      const inc = Math.max(0, Math.min(60, incRaw));
      const black = white === ids[0] ? ids[1] : ids[0];
      wsSend({
        type: 'vcp_invite_create',
        mode: 'chess',
        studentIds: ids,
        config: { minutes, incrementSec: inc, whiteStudentId: white, blackStudentId: black }
      });
      STATE.pendingInvite = {
        inviteId: null,
        studentIds: ids.slice(),
        config: { minutes, incrementSec: inc, whiteStudentId: white, blackStudentId: black },
        createdAt: Date.now(),
        responses: {}
      };
      closeChooseModeModal();
      setTeacherMessage('Invite sent. Waiting for students…', 'success');
    });
  }

  function renderStudentInviteModal() {
    const current = STATE.invites[0]?.invite || null;
    if (!current) return '';
    const cfg = current.config || {};
    const myId = String(STATE.me?.id || '');
    const myColor = String(cfg.whiteStudentId) === myId ? 'White' : String(cfg.blackStudentId) === myId ? 'Black' : '';
    return `
      <div class="vcp-modal-backdrop" id="vcpInviteBackdrop" role="presentation">
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Invite">
          <div class="vcp-modal-header">
            <div class="vcp-modal-title">Invite</div>
            <button id="vcpInviteClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
          </div>
          <div class="vcp-modal-body">
            <div class="vcp-muted" style="margin-bottom:10px;">
              <strong>${escapeHtml(current.teacher?.name || 'Teacher')}</strong> invited you to <strong>Normal Chess</strong>.
            </div>
            ${myColor ? `
              <div class="vcp-list-item" style="margin-bottom:10px;">
                <div style="font-weight:900; color:#111827;">Your side</div>
                <div class="vcp-muted" style="margin-top:6px;">You will play as <strong>${escapeHtml(myColor)}</strong>.</div>
              </div>
            ` : ''}
            <div class="vcp-list-item">
              <div style="font-weight:900; color:#111827;">Time control</div>
              <div class="vcp-muted" style="margin-top:6px;">
                ${escapeHtml(String(cfg.minutes || 3))} min + ${escapeHtml(String(cfg.incrementSec || 0))} sec increment
              </div>
            </div>
            <div class="vcp-btn-row" style="justify-content:flex-end; margin-top:12px;">
              <button id="vcpDeclineBtn" class="btn btn-secondary" type="button">Decline</button>
              <button id="vcpAcceptBtn" class="btn btn-primary" type="button">Accept</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindStudentInviteModalEvents() {
    const current = STATE.invites[0]?.invite || null;
    if (!current) return;
    const close = () => {
      STATE.invites.shift();
      render();
    };
    document.getElementById('vcpInviteClose')?.addEventListener('click', close);
    document.getElementById('vcpInviteBackdrop')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'vcpInviteBackdrop') close();
    });
    document.getElementById('vcpDeclineBtn')?.addEventListener('click', () => {
      wsSend({ type: 'vcp_invite_respond', inviteId: current.id, response: 'decline' });
      close();
    });
    document.getElementById('vcpAcceptBtn')?.addEventListener('click', () => {
      wsSend({ type: 'vcp_invite_respond', inviteId: current.id, response: 'accept' });
      close();
      // Server will mark "in-game" only after both students accepted and session starts.
      render();
    });
  }

  function handleWsMessage(msg) {
    const type = String(msg?.type || '');
    if (type === 'vcp_ready') {
      STATE.wsReady = true;
      STATE.lastError = null;
      STATE.role = String(msg?.kind || STATE.role);
      if (msg?.userId) STATE.me.id = String(msg.userId);
      if (STATE.role === 'student' && msg?.studentId) STATE.me.studentId = String(msg.studentId);
      if (STATE.role === 'teacher') STATE.me.studentId = '';
      STATE.me.name = String(msg?.name || STATE.me.name);
      if (STATE.role === 'student' && msg?.status) STATE.status = String(msg.status);
      reconnectAttempt = 0;
      startHeartbeat();
      wsSend({ type: 'vcp_get_presence' });
      wsSend({ type: 'vcp_get_live_games' });
      render();
      return;
    }
    if (type === 'vcp_pong') {
      lastPongTs = Date.now();
      return;
    }
    if (type === 'vcp_error') {
      const details = msg?.role ? `${String(msg?.error || 'Error')} (role=${String(msg.role)})` : String(msg?.error || 'Error');
      console.error('VCP error:', details);
      STATE.lastError = details;
      setTeacherMessage(details, 'error');
      render();
      return;
    }
    if (type === 'vcp_presence_snapshot') {
      STATE.students = Array.isArray(msg?.students) ? msg.students : [];
      if (STATE.role === 'teacher') {
        // Ensure selected IDs still exist
        const ids = new Set(STATE.students.map(s => String(s.id)));
        STATE.selected = new Set(Array.from(STATE.selected).filter(id => ids.has(String(id))));
      }
      render();
      return;
    }
    if (type === 'vcp_game_history') {
      const targetUserId = String(msg?.targetUserId || '');
      if (!targetUserId || targetUserId !== String(STATE.profileTargetId || '')) return;
      STATE.profileHistory = {
        loading: false,
        error: null,
        page: Number(msg?.page || 1) || 1,
        totalPages: Number(msg?.totalPages || 1) || 1,
        totalItems: Number(msg?.totalItems || 0) || 0,
        games: Array.isArray(msg?.games) ? msg.games : []
      };
      render();
      return;
    }
    if (type === 'vcp_game_record') {
      if (STATE.page !== 'historyGame') return;
      const g = msg?.game || null;
      if (!g) {
        STATE.historyGame = { loading: false, error: 'Game not found', gameId: String(STATE.historyGame?.gameId || ''), game: null };
        render();
        return;
      }
      STATE.historyGame = { loading: false, error: null, gameId: String(g.id || ''), game: g };
      render();
      return;
    }
    if (type === 'vcp_live_games_snapshot') {
      STATE.liveGames = Array.isArray(msg?.games) ? msg.games : [];
      // refresh only the live game area if present
      const area = document.getElementById('vcpLiveGamesArea');
      if (area) area.innerHTML = renderLiveGames();
      const myArea = document.getElementById('vcpMyGamesArea');
      if (myArea) myArea.innerHTML = renderMyGames();
      return;
    }
    if (type === 'vcp_invite') {
      if (STATE.role !== 'student') return;
      STATE.invites.push({ invite: msg.invite });
      render();
      return;
    }
    if (type === 'vcp_invite_sent') {
      if (STATE.role === 'teacher' && STATE.pendingInvite && !STATE.pendingInvite.inviteId) {
        STATE.pendingInvite.inviteId = String(msg?.inviteId || '');
        render();
      }
      return;
    }
    if (type === 'vcp_invite_update') {
      if (STATE.role === 'teacher') {
        setTeacherMessage(`Invite update: ${msg.studentId} ${msg.response}`, 'info');
        if (STATE.pendingInvite && String(STATE.pendingInvite.inviteId) === String(msg?.inviteId || '')) {
          STATE.pendingInvite.responses[String(msg.studentId)] = String(msg.response);
          if (String(msg.response) === 'decline') setTeacherMessage('Invite declined.', 'error');
        }
        render();
      }
      return;
    }
    if (type === 'vcp_session_start') {
      STATE.activeSession = msg.session || null;
      if (STATE.role === 'student') STATE.status = 'in-game';
      if (STATE.role === 'teacher') {
        STATE.pendingInvite = null;
        setTeacherMessage('Session started.', 'success');
      }
      STATE.page = 'session';
      render();
      return;
    }
    if (type === 'vcp_chess_sync') {
      const sid = String(msg?.sessionId || '');
      if (!STATE.activeSession || String(STATE.activeSession.id) !== sid) return;
      const st = msg?.state || null;
      if (st && typeof st === 'object') {
        STATE.activeSession.chessState = st;
        try { STATE.ncApp?.applyState?.(st); } catch {}
      }
      return;
    }
    if (type === 'vcp_session_update') {
      if (STATE.role === 'teacher') {
        setTeacherMessage(`Session update: student ${msg.studentId} left`, 'info');
        render();
      }
      return;
    }
  }

  function render() {
    if (STATE.page === 'session') {
      renderSessionPage();
      return;
    }
    if (STATE.page === 'historyGame') {
      renderHistoryGamePage();
      return;
    }
    if (STATE.page === 'profile') {
      renderProfileScreen();
      return;
    }
    if (STATE.role === 'teacher') renderTeacher();
    else renderStudent();
  }

  function init() {
    STATE.role = getRole();
    STATE.page = 'lobby';
    STATE.profileTargetId = null;
    STATE.profileHistory = { loading: false, error: null, page: 1, totalPages: 1, totalItems: 0, games: [] };
    STATE.historyGame = { loading: false, error: null, gameId: null, game: null };
    const studentPlayer = STATE.role === 'student' ? getStudentPlayer() : null;
    if (studentPlayer && typeof studentPlayer === 'object') {
      STATE.me = {
        id: String(studentPlayer.id || ''),
        name: String(studentPlayer.name || 'Student'),
        studentId: String(studentPlayer.studentId || '')
      };
    } else if (STATE.role === 'teacher') {
      // Avoid leaking any leftover studentId in the header badge.
      STATE.me.studentId = '';
    }
    render();
    ensureDelegatedClicks();
    connectWs();
    bindActivityListeners();
    window.addEventListener('focus', () => {
      if (!STATE.ws || STATE.ws.readyState !== WebSocket.OPEN) connectWs();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && (!STATE.ws || STATE.ws.readyState !== WebSocket.OPEN)) connectWs();
    });

  }

  window.initVChessPlatform = init;
})();


