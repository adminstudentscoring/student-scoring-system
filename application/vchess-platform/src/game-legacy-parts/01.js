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
    liveViewer: { loading: false, error: null, sessionId: null, session: null },
    // Teacher view
    students: [], // [{id,name,studentId,status,inGame}]
    selected: new Set(),
    onlineListOpen: true,
    sidebarCollapsed: false,
    teacherAutoSwitch: false,
    teacherGameHistory: { loading: false, error: null, page: 1, totalPages: 1, totalItems: 0, games: [] },
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
    liveNcApp: null,
    liveNcKey: null,
    liveGames: [], // org-wide spectator snapshots
    uiDelegatedBound: false,
    settingsTab: 'board'
  };

  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let heartbeatTimer = null;
  let lastPongTs = 0;

  function vcpDebugOn() {
    try { return localStorage.getItem('vcpDebug') === '1'; } catch { return false; }
  }
  function vcpDebug(...args) {
    if (!vcpDebugOn()) return;
    try { console.log('[VCP]', ...args); } catch {}
  }

  const VCP_DEFAULTS = {
    boardLight: 'rgb(231,200,147)',
    boardDark: 'rgb(172,113,76)'
  };

  function readBoardColors() {
    try {
      const light = String(localStorage.getItem('vcpBoardLight') || '') || VCP_DEFAULTS.boardLight;
      const dark = String(localStorage.getItem('vcpBoardDark') || '') || VCP_DEFAULTS.boardDark;
      return { light, dark };
    } catch {
      return { light: VCP_DEFAULTS.boardLight, dark: VCP_DEFAULTS.boardDark };
    }
  }

  function applyBoardColors() {
    const { light, dark } = readBoardColors();
    try {
      document.documentElement.style.setProperty('--vcp-board-light', light);
      document.documentElement.style.setProperty('--vcp-board-dark', dark);
    } catch {}
  }

  function setBoardColors({ light, dark }) {
    const l = String(light || '').trim() || VCP_DEFAULTS.boardLight;
    const d = String(dark || '').trim() || VCP_DEFAULTS.boardDark;
    try {
      localStorage.setItem('vcpBoardLight', l);
      localStorage.setItem('vcpBoardDark', d);
    } catch {}
    applyBoardColors();
  }

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

  function goHome() {
    // "Home" means go back to lobby without ending any active game.
    try {
      if (STATE.page === 'liveViewer') {
        closeLiveViewer();
        return;
      }
      if (STATE.page === 'historyGame') {
        // closeHistoryGame goes back to profile; force lobby for Home.
        try { STATE.historyNcApp?.destroy?.(); } catch {}
        STATE.historyNcApp = null;
        STATE.historyNcKey = null;
        STATE.historyGame = { loading: false, error: null, gameId: null, game: null };
        STATE.page = 'lobby';
        render();
        return;
      }
      if (STATE.page === 'profile') {
        closeProfile();
        return;
      }
      if (STATE.page === 'session') {
        closeSessionView();
        return;
      }
    } catch {}
    STATE.page = 'lobby';
    render();
  }

  function goSettings() {
    // Navigate to Settings without ending any server-side session. We still teardown any mounted viewers/boards.
    try {
      if (STATE.page === 'liveViewer') {
        closeLiveViewer();
      }
      if (STATE.page === 'historyGame') {
        try { STATE.historyNcApp?.destroy?.(); } catch {}
        STATE.historyNcApp = null;
        STATE.historyNcKey = null;
        STATE.historyGame = { loading: false, error: null, gameId: null, game: null };
      }
      if (STATE.page === 'profile') {
        closeProfile();
      }
      if (STATE.page === 'session') {
        closeSessionView();
      }
    } catch {}
    STATE.page = 'settings';
    render();
  }

  function renderFixedSidebar() {
    const isLobby = STATE.page === 'lobby';
    const isSettings = STATE.page === 'settings';
    const isTeacher = STATE.role === 'teacher';
    // Teacher should be able to invite anytime (even while in a session / profile / etc.)
    const canSelect = isTeacher;
    const selected = Array.from(STATE.selected);
    const chevron = STATE.onlineListOpen ? '▾' : '▸';
    const collapsed = !!STATE.sidebarCollapsed;
    const collapseIcon = collapsed ? '»' : '«';
    const refreshLabel = collapsed ? '🔄' : 'Refresh';
    const startLabel = collapsed ? '▶' : 'Start';

    const meItem = (STATE.me?.id && STATE.role === 'teacher') ? {
      id: String(STATE.me.id),
      name: `${String(STATE.me.name || 'Teacher')} (Teacher)`,
      studentId: 'Teacher',
      status: 'online',
      inGame: false
    } : null;

    return `
      <aside class="vcp-fixed-sidebar ${collapsed ? 'is-collapsed' : ''}" aria-label="VCP sidebar">
        <button id="vcpSidebarCollapseBtn" class="vcp-side-btn vcp-side-collapse" type="button" aria-label="${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}" title="${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}">
          <span class="vcp-side-icon" aria-hidden="true">${collapseIcon}</span>
          <span class="vcp-side-label">${collapsed ? '' : 'Collapse'}</span>
        </button>
        <div class="vcp-side-nav">
          <button id="vcpNavHomeBtn" class="vcp-side-btn ${isLobby ? 'is-active' : ''}" type="button" title="V.Chess">
            <span class="vcp-side-icon" aria-hidden="true">🏠</span>
            <span class="vcp-side-label">V.Chess</span>
          </button>
          <button id="vcpNavOnlineBtn" class="vcp-side-btn ${STATE.onlineListOpen ? 'is-active' : ''}" type="button" aria-label="Toggle online list">
            <span class="vcp-side-icon" aria-hidden="true">👥</span>
            <span class="vcp-side-label">Online list</span>
            <span class="vcp-side-meta">
              <span class="vcp-side-count">${escapeHtml(String(STATE.students.length || 0))}</span>
              <span class="vcp-side-chevron" aria-hidden="true">${chevron}</span>
            </span>
          </button>
          <button id="vcpNavSettingsBtn" class="vcp-side-btn ${isSettings ? 'is-active' : ''}" type="button" title="Settings" aria-label="Settings">
            <span class="vcp-side-icon" aria-hidden="true">⚙️</span>
            <span class="vcp-side-label">Settings</span>
          </button>
        </div>

        ${STATE.onlineListOpen ? `
          ${isTeacher ? (canSelect ? `<div class="vcp-muted">Select 2 players. You can include yourself.</div>` : ``) : `
            <div class="vcp-muted">Your status: <span class="vcp-status-pill ${escapeHtml(STATE.status)}">${escapeHtml(STATE.status)}</span></div>
          `}

          <div class="vcp-sidebar-actions">
            <button id="vcpSidebarRefreshBtn" class="btn btn-secondary" type="button" title="Refresh" aria-label="Refresh">${refreshLabel}</button>
            ${isTeacher && canSelect ? `<button id="vcpChooseModeBtn" class="btn btn-primary" type="button" title="Start" aria-label="Start" ${selected.length === 2 ? '' : 'disabled'}>${startLabel}</button>` : ''}
          </div>

          <div class="vcp-online-list" role="list">
            ${isTeacher && canSelect && meItem ? renderOnlineListItem(meItem, { selectable: true }) : ''}
            ${(Array.isArray(STATE.students) ? STATE.students : []).map((s) => renderOnlineListItem(s, { selectable: canSelect })).join('')}
            ${(Array.isArray(STATE.students) ? STATE.students : []).length === 0 ? `
              <div class="vcp-muted" style="margin-top:10px;">No students online.</div>
            ` : ''}
          </div>
        ` : ''}
      </aside>
    `;
  }

  function bindFixedSidebarEvents() {
    document.getElementById('vcpSidebarCollapseBtn')?.addEventListener('click', () => {
      STATE.sidebarCollapsed = !STATE.sidebarCollapsed;
      render();
    });

    document.getElementById('vcpNavHomeBtn')?.addEventListener('click', () => {
      goHome();
    });

    document.getElementById('vcpNavSettingsBtn')?.addEventListener('click', () => {
      goSettings();
    });

    document.getElementById('vcpNavOnlineBtn')?.addEventListener('click', () => {
      // In collapsed mode, clicking Online list should expand and show the list.
      if (STATE.sidebarCollapsed) {
        STATE.sidebarCollapsed = false;
        STATE.onlineListOpen = true;
        render();
        return;
      }
      STATE.onlineListOpen = !STATE.onlineListOpen;
      render();
    });

    document.getElementById('vcpSidebarRefreshBtn')?.addEventListener('click', () => {
      wsSend({ type: 'vcp_get_presence' });
      wsSend({ type: 'vcp_get_live_games' });
      markActivity();
    });

    // Teacher: selectable checkboxes (always available)
    document.querySelectorAll('input[type="checkbox"][data-student-id]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-student-id');
        if (!id) return;
        if (cb.checked) {
          // Hard cap: exactly 2 players.
          if (!STATE.selected.has(id) && STATE.selected.size >= 2) {
            cb.checked = false;
            setTeacherMessage('Please select exactly 2 players.', 'info');
            vcpDebug('select blocked (already 2)', { tried: String(id), selected: Array.from(STATE.selected) });
            return;
          }
          STATE.selected.add(id);
        } else {
          STATE.selected.delete(id);
        }
        vcpDebug('selection changed', Array.from(STATE.selected));
        render();
      });
    });

    // Teacher: choose mode button (always available)
    document.getElementById('vcpChooseModeBtn')?.addEventListener('click', () => {
      if (STATE.role !== 'teacher') return;
      if (Array.from(STATE.selected).length !== 2) return;
      openChooseModeModal();
    });
  }

  function renderSettingsPage() {
    const root = getRoot();
    if (!root) return;
    const tab = String(STATE.settingsTab || 'board');
    const { light, dark } = readBoardColors();
    root.innerHTML = `
      <div class="vcp-app ${STATE.sidebarCollapsed ? 'is-sidebar-collapsed' : ''}">
        ${renderFixedSidebar()}
        <div class="vcp-app-main">
          <div class="vcp-main-inner">
            <div class="vcp-card">
              <div class="vcp-section">
                <div style="font-weight:900; color:#111827; margin-bottom:8px;">Settings</div>

                <div class="vcp-tabs" role="tablist" aria-label="Settings tabs">
                  <button id="vcpSettingsTabBoard" class="vcp-tabbtn ${tab === 'board' ? 'active' : ''}" type="button" role="tab" aria-selected="${tab === 'board' ? 'true' : 'false'}">棋盤</button>
                  <button id="vcpSettingsTabGeneral" class="vcp-tabbtn ${tab === 'general' ? 'active' : ''}" type="button" role="tab" aria-selected="${tab === 'general' ? 'true' : 'false'}">General</button>
                </div>

                ${tab === 'board' ? `
                  <div class="vcp-settings-grid">
                    <div class="vcp-list-item">
                      <div style="font-weight:900; color:#111827; margin-bottom:6px;">棋盤顏色</div>
                      <div class="vcp-muted">These colors apply to Normal Chess and the mini boards.</div>

                      <div class="vcp-color-row" style="margin-top:10px;">
                        <label for="vcpBoardLightInput">Light squares</label>
                        <input id="vcpBoardLightInput" type="color" value="${escapeHtml(light)}" />
                      </div>

                      <div class="vcp-color-row" style="margin-top:10px;">
                        <label for="vcpBoardDarkInput">Dark squares</label>
                        <input id="vcpBoardDarkInput" type="color" value="${escapeHtml(dark)}" />
                      </div>

                      <div class="vcp-color-row" style="margin-top:12px;">
                        <button id="vcpBoardResetBtn" class="btn btn-secondary" type="button">Reset</button>
                        <div class="vcp-board-preview" aria-label="Board preview">
                          ${Array.from({ length: 16 }).map((_, i) => {
                            const r = Math.floor(i / 4);
                            const c = i % 4;
                            const cls = ((r + c) % 2 === 0) ? 'light' : 'dark';
                            return `<div class="sq ${cls}"></div>`;
                          }).join('')}
                        </div>
                      </div>
                    </div>
                  </div>
                ` : `
                  <div class="vcp-muted">Coming soon.</div>
                `}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    bindFixedSidebarEvents();

    document.getElementById('vcpSettingsTabBoard')?.addEventListener('click', () => {
      STATE.settingsTab = 'board';
      render();
    });
    document.getElementById('vcpSettingsTabGeneral')?.addEventListener('click', () => {
      STATE.settingsTab = 'general';
      render();
    });

    if (tab === 'board') {
      const lightEl = document.getElementById('vcpBoardLightInput');
      const darkEl = document.getElementById('vcpBoardDarkInput');
      const applyFromInputs = () => {
        const l = String(lightEl?.value || VCP_DEFAULTS.boardLight);
        const d = String(darkEl?.value || VCP_DEFAULTS.boardDark);
        setBoardColors({ light: l, dark: d });
      };
      lightEl?.addEventListener('input', () => { applyFromInputs(); });
