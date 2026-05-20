(() => {
  // application/vchess-platform/src/game-legacy.js
  (function() {
    const STATE = {
      role: "student",
      // 'teacher'|'student'
      ws: null,
      wsReady: false,
      me: { id: "", name: "Unknown", studentId: "" },
      status: "online",
      // student-only
      page: "lobby",
      // 'lobby' | 'profile'
      profileTargetId: null,
      // userId
      profileHistory: { loading: false, error: null, page: 1, totalPages: 1, totalItems: 0, games: [] },
      historyGame: { loading: false, error: null, gameId: null, game: null },
      liveViewer: { loading: false, error: null, sessionId: null, session: null },
      // Teacher view
      students: [],
      // [{id,name,studentId,status,inGame}]
      selected: /* @__PURE__ */ new Set(),
      onlineListOpen: true,
      sidebarCollapsed: false,
      teacherAutoSwitch: false,
      teacherGameHistory: { loading: false, error: null, page: 1, totalPages: 1, totalItems: 0, games: [] },
      // Invites / sessions
      invites: [],
      // student-only: [{invite}]
      teacherMessages: [],
      activeSession: null,
      // {id, mode, config, studentIds}
      lastError: null,
      pendingInvite: null,
      // teacher-only: { inviteId, studentIds, config, createdAt, responses }
      ncApp: null,
      ncSessionId: null,
      historyNcApp: null,
      historyNcKey: null,
      liveNcApp: null,
      liveNcKey: null,
      liveGames: [],
      // org-wide spectator snapshots
      uiDelegatedBound: false,
      settingsTab: "board"
    };
    let reconnectTimer = null;
    let reconnectAttempt = 0;
    let heartbeatTimer = null;
    let lastPongTs = 0;
    function vcpDebugOn() {
      try {
        return localStorage.getItem("vcpDebug") === "1";
      } catch {
        return false;
      }
    }
    function vcpDebug(...args) {
      if (!vcpDebugOn()) return;
      try {
        console.log("[VCP]", ...args);
      } catch {
      }
    }
    const VCP_DEFAULTS = {
      boardLight: "rgb(231,200,147)",
      boardDark: "rgb(172,113,76)"
    };
    function readBoardColors() {
      try {
        const light = String(localStorage.getItem("vcpBoardLight") || "") || VCP_DEFAULTS.boardLight;
        const dark = String(localStorage.getItem("vcpBoardDark") || "") || VCP_DEFAULTS.boardDark;
        return { light, dark };
      } catch {
        return { light: VCP_DEFAULTS.boardLight, dark: VCP_DEFAULTS.boardDark };
      }
    }
    function applyBoardColors() {
      const { light, dark } = readBoardColors();
      try {
        document.documentElement.style.setProperty("--vcp-board-light", light);
        document.documentElement.style.setProperty("--vcp-board-dark", dark);
      } catch {
      }
    }
    function setBoardColors({ light, dark }) {
      const l = String(light || "").trim() || VCP_DEFAULTS.boardLight;
      const d = String(dark || "").trim() || VCP_DEFAULTS.boardDark;
      try {
        localStorage.setItem("vcpBoardLight", l);
        localStorage.setItem("vcpBoardDark", d);
      } catch {
      }
      applyBoardColors();
    }
    function getRoot() {
      return document.getElementById("vChessPlatformRoot");
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
      const q = String(params.get("role") || "").toLowerCase();
      if (q === "teacher" || q === "student") return q;
      try {
        const ls = String(localStorage.getItem("vChessPlatformRole") || "").toLowerCase();
        if (ls === "teacher" || ls === "student") return ls;
      } catch {
      }
      return "student";
    }
    function getStudentPlayer() {
      try {
        const raw = localStorage.getItem("vChessPlatformPlayer");
        const parsed = raw ? safeJsonParse(raw) : null;
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
      }
      return null;
    }
    function getAuthToken() {
      try {
        const role = getRole();
        if (role === "teacher") return localStorage.getItem("authToken");
        return localStorage.getItem("vChessPlatformAuthToken") || localStorage.getItem("authToken");
      } catch {
        return null;
      }
    }
    function escapeHtml(str) {
      return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
    function wsUrl() {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${window.location.host}`;
    }
    function wsSend(payload) {
      try {
        if (STATE.ws && STATE.ws.readyState === WebSocket.OPEN) {
          STATE.ws.send(JSON.stringify(payload));
        }
      } catch {
      }
    }
    function formatDateTime(iso) {
      try {
        const d = new Date(String(iso || ""));
        if (Number.isNaN(d.getTime())) return "";
        return d.toLocaleString();
      } catch {
        return "";
      }
    }
    function formatSpent(ms) {
      const s = Math.max(0, Math.floor(Number(ms || 0) / 1e3));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return `${m}:${String(r).padStart(2, "0")}`;
    }
    function invertResult(res) {
      const r = String(res || "");
      if (r === "1-0") return "0-1";
      if (r === "0-1") return "1-0";
      return r;
    }
    function userPerspectiveResult(game, targetUserId) {
      const uid = String(targetUserId || "");
      const whiteId = String(game?.whiteId || "");
      const blackId = String(game?.blackId || "");
      const res = String(game?.result || "1/2-1/2");
      if (!uid) return res;
      if (uid === whiteId) return res;
      if (uid === blackId) return invertResult(res);
      return res;
    }
    function setTeacherMessage(text, kind = "info") {
      const now = (/* @__PURE__ */ new Date()).toLocaleTimeString();
      STATE.teacherMessages.unshift({ text: String(text), kind, at: now });
      STATE.teacherMessages = STATE.teacherMessages.slice(0, 6);
    }
    function goHome() {
      try {
        if (STATE.page === "liveViewer") {
          closeLiveViewer();
          return;
        }
        if (STATE.page === "historyGame") {
          try {
            STATE.historyNcApp?.destroy?.();
          } catch {
          }
          STATE.historyNcApp = null;
          STATE.historyNcKey = null;
          STATE.historyGame = { loading: false, error: null, gameId: null, game: null };
          STATE.page = "lobby";
          render();
          return;
        }
        if (STATE.page === "profile") {
          closeProfile();
          return;
        }
        if (STATE.page === "session") {
          closeSessionView();
          return;
        }
      } catch {
      }
      STATE.page = "lobby";
      render();
    }
    function goSettings() {
      try {
        if (STATE.page === "liveViewer") {
          closeLiveViewer();
        }
        if (STATE.page === "historyGame") {
          try {
            STATE.historyNcApp?.destroy?.();
          } catch {
          }
          STATE.historyNcApp = null;
          STATE.historyNcKey = null;
          STATE.historyGame = { loading: false, error: null, gameId: null, game: null };
        }
        if (STATE.page === "profile") {
          closeProfile();
        }
        if (STATE.page === "session") {
          closeSessionView();
        }
      } catch {
      }
      STATE.page = "settings";
      render();
    }
    function renderFixedSidebar() {
      const isLobby = STATE.page === "lobby";
      const isSettings = STATE.page === "settings";
      const isTeacher = STATE.role === "teacher";
      const canSelect = isTeacher;
      const selected = Array.from(STATE.selected);
      const chevron = STATE.onlineListOpen ? "\u25BE" : "\u25B8";
      const collapsed = !!STATE.sidebarCollapsed;
      const collapseIcon = collapsed ? "\xBB" : "\xAB";
      const refreshLabel = collapsed ? "\u{1F504}" : "Refresh";
      const startLabel = collapsed ? "\u25B6" : "Start";
      const meItem = STATE.me?.id && STATE.role === "teacher" ? {
        id: String(STATE.me.id),
        name: `${String(STATE.me.name || "Teacher")} (Teacher)`,
        studentId: "Teacher",
        status: "online",
        inGame: false
      } : null;
      return `
      <aside class="vcp-fixed-sidebar ${collapsed ? "is-collapsed" : ""}" aria-label="VCP sidebar">
        <button id="vcpSidebarCollapseBtn" class="vcp-side-btn vcp-side-collapse" type="button" aria-label="${collapsed ? "Expand sidebar" : "Collapse sidebar"}" title="${collapsed ? "Expand sidebar" : "Collapse sidebar"}">
          <span class="vcp-side-icon" aria-hidden="true">${collapseIcon}</span>
          <span class="vcp-side-label">${collapsed ? "" : "Collapse"}</span>
        </button>
        <div class="vcp-side-nav">
          <button id="vcpNavHomeBtn" class="vcp-side-btn ${isLobby ? "is-active" : ""}" type="button" title="V.Chess">
            <span class="vcp-side-icon" aria-hidden="true">\u{1F3E0}</span>
            <span class="vcp-side-label">V.Chess</span>
          </button>
          <button id="vcpNavOnlineBtn" class="vcp-side-btn ${STATE.onlineListOpen ? "is-active" : ""}" type="button" aria-label="Toggle online list">
            <span class="vcp-side-icon" aria-hidden="true">\u{1F465}</span>
            <span class="vcp-side-label">Online list</span>
            <span class="vcp-side-meta">
              <span class="vcp-side-count">${escapeHtml(String(STATE.students.length || 0))}</span>
              <span class="vcp-side-chevron" aria-hidden="true">${chevron}</span>
            </span>
          </button>
          <button id="vcpNavSettingsBtn" class="vcp-side-btn ${isSettings ? "is-active" : ""}" type="button" title="Settings" aria-label="Settings">
            <span class="vcp-side-icon" aria-hidden="true">\u2699\uFE0F</span>
            <span class="vcp-side-label">Settings</span>
          </button>
        </div>

        ${STATE.onlineListOpen ? `
          ${isTeacher ? canSelect ? `<div class="vcp-muted">Select 2 players. You can include yourself.</div>` : `` : `
            <div class="vcp-muted">Your status: <span class="vcp-status-pill ${escapeHtml(STATE.status)}">${escapeHtml(STATE.status)}</span></div>
          `}

          <div class="vcp-sidebar-actions">
            <button id="vcpSidebarRefreshBtn" class="btn btn-secondary" type="button" title="Refresh" aria-label="Refresh">${refreshLabel}</button>
            ${isTeacher && canSelect ? `<button id="vcpChooseModeBtn" class="btn btn-primary" type="button" title="Start" aria-label="Start" ${selected.length === 2 ? "" : "disabled"}>${startLabel}</button>` : ""}
          </div>

          <div class="vcp-online-list" role="list">
            ${isTeacher && canSelect && meItem ? renderOnlineListItem(meItem, { selectable: true }) : ""}
            ${(Array.isArray(STATE.students) ? STATE.students : []).map((s) => renderOnlineListItem(s, { selectable: canSelect })).join("")}
            ${(Array.isArray(STATE.students) ? STATE.students : []).length === 0 ? `
              <div class="vcp-muted" style="margin-top:10px;">No students online.</div>
            ` : ""}
          </div>
        ` : ""}
      </aside>
    `;
    }
    function bindFixedSidebarEvents() {
      document.getElementById("vcpSidebarCollapseBtn")?.addEventListener("click", () => {
        STATE.sidebarCollapsed = !STATE.sidebarCollapsed;
        render();
      });
      document.getElementById("vcpNavHomeBtn")?.addEventListener("click", () => {
        goHome();
      });
      document.getElementById("vcpNavSettingsBtn")?.addEventListener("click", () => {
        goSettings();
      });
      document.getElementById("vcpNavOnlineBtn")?.addEventListener("click", () => {
        if (STATE.sidebarCollapsed) {
          STATE.sidebarCollapsed = false;
          STATE.onlineListOpen = true;
          render();
          return;
        }
        STATE.onlineListOpen = !STATE.onlineListOpen;
        render();
      });
      document.getElementById("vcpSidebarRefreshBtn")?.addEventListener("click", () => {
        wsSend({ type: "vcp_get_presence" });
        wsSend({ type: "vcp_get_live_games" });
        markActivity();
      });
      document.querySelectorAll('input[type="checkbox"][data-student-id]').forEach((cb) => {
        cb.addEventListener("change", () => {
          const id = cb.getAttribute("data-student-id");
          if (!id) return;
          if (cb.checked) {
            if (!STATE.selected.has(id) && STATE.selected.size >= 2) {
              cb.checked = false;
              setTeacherMessage("Please select exactly 2 players.", "info");
              vcpDebug("select blocked (already 2)", { tried: String(id), selected: Array.from(STATE.selected) });
              return;
            }
            STATE.selected.add(id);
          } else {
            STATE.selected.delete(id);
          }
          vcpDebug("selection changed", Array.from(STATE.selected));
          render();
        });
      });
      document.getElementById("vcpChooseModeBtn")?.addEventListener("click", () => {
        if (STATE.role !== "teacher") return;
        if (Array.from(STATE.selected).length !== 2) return;
        openChooseModeModal();
      });
    }
    function renderSettingsPage() {
      const root = getRoot();
      if (!root) return;
      const tab = String(STATE.settingsTab || "board");
      const { light, dark } = readBoardColors();
      root.innerHTML = `
      <div class="vcp-app ${STATE.sidebarCollapsed ? "is-sidebar-collapsed" : ""}">
        ${renderFixedSidebar()}
        <div class="vcp-app-main">
          <div class="vcp-main-inner">
            <div class="vcp-card">
              <div class="vcp-section">
                <div style="font-weight:900; color:#111827; margin-bottom:8px;">Settings</div>

                <div class="vcp-tabs" role="tablist" aria-label="Settings tabs">
                  <button id="vcpSettingsTabBoard" class="vcp-tabbtn ${tab === "board" ? "active" : ""}" type="button" role="tab" aria-selected="${tab === "board" ? "true" : "false"}">\u68CB\u76E4</button>
                  <button id="vcpSettingsTabGeneral" class="vcp-tabbtn ${tab === "general" ? "active" : ""}" type="button" role="tab" aria-selected="${tab === "general" ? "true" : "false"}">General</button>
                </div>

                ${tab === "board" ? `
                  <div class="vcp-settings-grid">
                    <div class="vcp-list-item">
                      <div style="font-weight:900; color:#111827; margin-bottom:6px;">\u68CB\u76E4\u984F\u8272</div>
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
        const cls = (r + c) % 2 === 0 ? "light" : "dark";
        return `<div class="sq ${cls}"></div>`;
      }).join("")}
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
      document.getElementById("vcpSettingsTabBoard")?.addEventListener("click", () => {
        STATE.settingsTab = "board";
        render();
      });
      document.getElementById("vcpSettingsTabGeneral")?.addEventListener("click", () => {
        STATE.settingsTab = "general";
        render();
      });
      if (tab === "board") {
        const lightEl = document.getElementById("vcpBoardLightInput");
        const darkEl = document.getElementById("vcpBoardDarkInput");
        const applyFromInputs = () => {
          const l = String(lightEl?.value || VCP_DEFAULTS.boardLight);
          const d = String(darkEl?.value || VCP_DEFAULTS.boardDark);
          setBoardColors({ light: l, dark: d });
        };
        lightEl?.addEventListener("input", () => {
          applyFromInputs();
        });
        darkEl?.addEventListener("input", () => {
          applyFromInputs();
        });
        document.getElementById("vcpBoardResetBtn")?.addEventListener("click", () => {
          setBoardColors({ light: VCP_DEFAULTS.boardLight, dark: VCP_DEFAULTS.boardDark });
          render();
        });
      }
    }
    function studentLabelById(id) {
      if (STATE.role === "teacher" && String(id) === String(STATE.me?.id || "")) {
        const nm2 = String(STATE.me?.name || "Teacher");
        return `${nm2} (Teacher)`;
      }
      const s = STATE.students.find((x) => String(x.id) === String(id));
      if (!s) return String(id || "");
      const nm = String(s.name || "Unknown");
      const sid = String(s.chessComId || s.studentId || "");
      return sid ? `${nm} (${sid})` : nm;
    }
    function plainNameById(id) {
      const uid = String(id || "");
      if (!uid) return "";
      if (uid === String(STATE.me?.id || "")) return String(STATE.me?.name || "Teacher");
      const s = STATE.students.find((x) => String(x.id) === uid);
      if (s) return String(s.name || "Student");
      return uid;
    }
    function getTeacherLiveSessionsSorted() {
      const uid = String(STATE.me?.id || "");
      const games = Array.isArray(STATE.liveGames) ? STATE.liveGames : [];
      const mine = games.filter((g) => String(g.whiteId || "") === uid || String(g.blackId || "") === uid);
      mine.sort((a, b) => new Date(a.startedAt || a.createdAt || 0) - new Date(b.startedAt || b.createdAt || 0));
      return mine;
    }
    function computeTeacherTurnForLive(g) {
      const uid = String(STATE.me?.id || "");
      const turn = String(g?.state?.turn || "w");
      const myColor = String(g.whiteId || "") === uid ? "w" : String(g.blackId || "") === uid ? "b" : null;
      return myColor && turn === myColor;
    }
    function autoSwitchAfterTeacherMove(currentSessionId) {
      if (STATE.role !== "teacher") return;
      if (!STATE.teacherAutoSwitch) return;
      const cur = String(currentSessionId || STATE.activeSession?.id || "");
      const mine = getTeacherLiveSessionsSorted();
      const candidate = mine.find((g) => {
        if (!g) return false;
        if (String(g.sessionId || "") === cur) return false;
        if (g?.state?.gameOver) return false;
        return !!computeTeacherTurnForLive(g);
      });
      if (!candidate) return;
      openMyGame(String(candidate.sessionId || ""));
    }
    function teacherTurnForActiveSession() {
      if (STATE.role !== "teacher") return false;
      const s = STATE.activeSession;
      if (!s || String(s.mode) !== "chess") return false;
      const st = s.chessState || null;
      if (!st || st.gameOver) return false;
      const myId = String(STATE.me?.id || "");
      const whiteId = String(s?.config?.whiteStudentId || "");
      const blackId = String(s?.config?.blackStudentId || "");
      const myColor = myId && myId === whiteId ? "w" : myId && myId === blackId ? "b" : null;
      if (!myColor) return false;
      return String(st.turn || "w") === myColor;
    }
    function updateLiveGameStateFromSync(sessionId, chessState) {
      const sid = String(sessionId || "");
      if (!sid || !chessState) return;
      const games = Array.isArray(STATE.liveGames) ? STATE.liveGames : [];
      const idx = games.findIndex((g) => String(g?.sessionId || "") === sid);
      if (idx < 0) return;
      const cur = games[idx];
      games[idx] = {
        ...cur,
        state: {
          ...cur?.state && typeof cur.state === "object" ? cur.state : {},
          ...chessState
        }
      };
      STATE.liveGames = games;
    }
    function autoSwitchOnSyncIfNeeded() {
      if (STATE.role !== "teacher") return;
      if (!STATE.teacherAutoSwitch) return;
      if (STATE.page !== "session") return;
      if (teacherTurnForActiveSession()) return;
      const mine = getTeacherLiveSessionsSorted();
      const candidate = mine.find((g) => g && !g?.state?.gameOver && computeTeacherTurnForLive(g));
      const curId = String(STATE.activeSession?.id || "");
      if (!candidate) return;
      if (String(candidate.sessionId || "") === curId) return;
      openMyGame(String(candidate.sessionId || ""));
    }
    function renderTeacherSessionBar() {
      if (STATE.role !== "teacher") return "";
      const curId = String(STATE.activeSession?.id || "");
      const live = getTeacherLiveSessionsSorted();
      const liveTabs = live.map((g) => {
        const sid = String(g.sessionId || "");
        const myId = String(STATE.me?.id || "");
        const oppId = String(g.whiteId || "") === myId ? String(g.blackId || "") : String(g.whiteId || "");
        const label = plainNameById(oppId) || "Student";
        const isActive = sid && sid === curId;
        return { kind: "live", key: `live:${sid}`, id: sid, label, ts: String(g.startedAt || g.createdAt || ""), active: isActive, oppId };
      });
      const all = [...liveTabs];
      all.sort((a, b) => new Date(a.ts || 0) - new Date(b.ts || 0));
      const tabsHtml = all.length ? all.map((t) => {
        if (t.kind === "live") {
          return `<button class="vcp-session-tabbtn ${t.active ? "active" : ""}" type="button" data-vcp-session-tab="${escapeHtml(t.id)}">${escapeHtml(t.label)}</button>`;
        }
      }).join("") : `<div class="vcp-muted">No games yet.</div>`;
      return `
      <div class="vcp-session-bar">
        <label class="vcp-switch">
          <input id="vcpAutoSwitchToggle" type="checkbox" ${STATE.teacherAutoSwitch ? "checked" : ""}>
          <span class="vcp-switch-label">Auto Switch</span>
        </label>
        <div class="vcp-session-tabs" id="vcpSessionTabs" role="tablist" aria-label="Your games">
          ${tabsHtml}
        </div>
      </div>
    `;
    }
    function pieceImagePath(p) {
      if (!p) return "";
      const color = p === p.toUpperCase() ? "white" : "black";
      const t = p.toLowerCase();
      const name = t === "p" ? "Pawn" : t === "n" ? "Knight" : t === "b" ? "Bishop" : t === "r" ? "Rook" : t === "q" ? "Queen" : t === "k" ? "King" : "";
      if (!name) return "";
      return `/application/vchess-platform/pieces/${color}_${name}.png`;
    }
    function formatMs(ms) {
      const s = Math.max(0, Math.floor(Number(ms || 0) / 1e3));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return `${m}:${String(r).padStart(2, "0")}`;
    }
    function computeLiveClocks(game) {
      const st = game?.state || {};
      const turn = String(st.turn || "w");
      const turnStartTs = Number(st.turnStartTs || Date.now());
      const elapsed = Math.max(0, Date.now() - turnStartTs);
      const wMs0 = Number(st.clocks?.wMs ?? 0);
      const bMs0 = Number(st.clocks?.bMs ?? 0);
      const wMs = st.gameOver ? wMs0 : turn === "w" ? Math.max(0, wMs0 - elapsed) : wMs0;
      const bMs = st.gameOver ? bMs0 : turn === "b" ? Math.max(0, bMs0 - elapsed) : bMs0;
      return { wMs, bMs, turn };
    }
    function renderMiniBoard(board) {
      const b = Array.isArray(board) ? board : [];
      const out = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const light = (r + c) % 2 === 0;
          const p = b[r] && b[r][c] ? String(b[r][c]) : "";
          out.push(`
          <div class="vcp-mini-sq ${light ? "light" : "dark"}">
            ${p ? `<img class="vcp-mini-piece" draggable="false" alt="${escapeHtml(p)}" src="${pieceImagePath(p)}">` : ""}
          </div>
        `);
        }
      }
      return `<div class="vcp-mini-board">${out.join("")}</div>`;
    }
    function renderLiveGames() {
      const games = Array.isArray(STATE.liveGames) ? STATE.liveGames : [];
      if (!games.length) {
        return `<div class="vcp-muted">No live games right now.</div>`;
      }
      return `
      <div class="vcp-live-grid">
        ${games.map((g) => {
        const clocks = computeLiveClocks(g);
        const whiteLabel = `${String(g.whiteName || "White")}${g.whiteStudentId ? ` (${String(g.whiteStudentId)})` : ""}`;
        const blackLabel = `${String(g.blackName || "Black")}${g.blackStudentId ? ` (${String(g.blackStudentId)})` : ""}`;
        return `
            <div class="vcp-live-card" data-live-session="${escapeHtml(String(g.sessionId || ""))}" style="cursor:pointer;">
              <div class="vcp-live-card-header">
                <div class="vcp-live-names">${escapeHtml(whiteLabel)} vs ${escapeHtml(blackLabel)}</div>
                <div class="vcp-live-meta">
                  <div class="vcp-live-clock">W ${escapeHtml(formatMs(clocks.wMs))} | B ${escapeHtml(formatMs(clocks.bMs))}</div>
                  <span class="vcp-status-pill ${clocks.turn === "w" ? "online" : "in-game"}">Turn ${clocks.turn === "w" ? "White" : "Black"}</span>
                </div>
              </div>
              ${renderMiniBoard(g?.state?.board)}
            </div>
          `;
      }).join("")}
      </div>
    `;
    }
    function computeMyGames() {
      const role = String(STATE.role || "");
      const uid = String(STATE.me?.id || "");
      const games = Array.isArray(STATE.liveGames) ? STATE.liveGames : [];
      if (!uid) return [];
      if (role === "teacher") {
        return games.filter((g) => String(g.whiteId || "") === uid || String(g.blackId || "") === uid);
      }
      return games.filter((g) => String(g.whiteId || "") === uid || String(g.blackId || "") === uid);
    }
    function renderMyGames() {
      const games = computeMyGames();
      if (!games.length) return `<div class="vcp-muted">No active games for you.</div>`;
      return `
      <div class="vcp-live-grid">
        ${games.map((g) => {
        const clocks = computeLiveClocks(g);
        const whiteLabel = `${String(g.whiteName || "White")}${g.whiteStudentId ? ` (${String(g.whiteStudentId)})` : ""}`;
        const blackLabel = `${String(g.blackName || "Black")}${g.blackStudentId ? ` (${String(g.blackStudentId)})` : ""}`;
        return `
            <div class="vcp-live-card" data-my-session="${escapeHtml(String(g.sessionId || ""))}" style="cursor:pointer;">
              <div class="vcp-live-card-header">
                <div class="vcp-live-names">${escapeHtml(whiteLabel)} vs ${escapeHtml(blackLabel)}</div>
                <div class="vcp-live-meta">
                  <div class="vcp-live-clock">W ${escapeHtml(formatMs(clocks.wMs))} | B ${escapeHtml(formatMs(clocks.bMs))}</div>
                  <span class="vcp-status-pill ${clocks.turn === "w" ? "online" : "in-game"}">Turn ${clocks.turn === "w" ? "White" : "Black"}</span>
                </div>
              </div>
              ${renderMiniBoard(g?.state?.board)}
            </div>
          `;
      }).join("")}
      </div>
    `;
    }
    function openMyGame(sessionId) {
      const sid = String(sessionId || "");
      const g = (Array.isArray(STATE.liveGames) ? STATE.liveGames : []).find((x) => String(x.sessionId) === sid);
      if (!g) return;
      STATE.activeSession = {
        id: sid,
        orgId: "",
        mode: "chess",
        studentIds: [String(g.whiteId || ""), String(g.blackId || "")],
        config: {
          minutes: Number(g?.config?.minutes || 3),
          incrementSec: Number(g?.config?.incrementSec || 0),
          whiteStudentId: String(g.whiteId || ""),
          blackStudentId: String(g.blackId || "")
        },
        chessState: g.state || null,
        status: "active"
      };
      STATE.page = "session";
      render();
      try {
        const key = `vcpLastSession:${String(STATE.role || "")}:${String(STATE.me?.id || "")}`;
        localStorage.setItem(key, sid);
      } catch {
      }
    }
    function ensureDelegatedClicks() {
      if (STATE.uiDelegatedBound) return;
      const root = getRoot();
      if (!root) return;
      STATE.uiDelegatedBound = true;
      root.addEventListener("click", (e) => {
        const target = e.target;
        const live = target?.closest?.("[data-live-session]");
        if (live) {
          const sid2 = String(live.getAttribute("data-live-session") || "");
          if (sid2) openLiveViewer(sid2);
          return;
        }
        const prof = target?.closest?.("[data-vcp-profile-id]");
        if (prof) {
          const pid = String(prof.getAttribute("data-vcp-profile-id") || "");
          if (pid) openProfile(pid);
          return;
        }
        const pg = target?.closest?.("[data-vcp-history-page]");
        if (pg) {
          const p = Number(pg.getAttribute("data-vcp-history-page") || 1);
          const uid = String(STATE.profileTargetId || "");
          if (uid) {
            STATE.profileHistory.loading = true;
            STATE.profileHistory.error = null;
            wsSend({ type: "vcp_get_game_history", targetUserId: uid, page: Number.isFinite(p) ? Math.max(1, Math.floor(p)) : 1 });
            render();
          }
          return;
        }
        const row = target?.closest?.("[data-vcp-game-id]");
        if (row) {
          const gid = String(row.getAttribute("data-vcp-game-id") || "");
          if (gid) openHistoryGame(gid);
          return;
        }
        const el = target?.closest?.("[data-my-session]");
        if (!el) return;
        const sid = el.getAttribute("data-my-session");
        if (!sid) return;
        openMyGame(sid);
      });
      root.addEventListener("click", (e) => {
        const target = e.target;
        const tab = target?.closest?.("[data-vcp-session-tab]");
        if (tab) {
          const sid = String(tab.getAttribute("data-vcp-session-tab") || "");
          if (sid) openMyGame(sid);
          return;
        }
        const gtab = target?.closest?.("[data-vcp-game-tab]");
        if (gtab) {
          const gid = String(gtab.getAttribute("data-vcp-game-tab") || "");
          if (gid) openHistoryGame(gid);
          return;
        }
      });
    }
    function renderHeaderBadge() {
      const name = String(STATE.me?.name || "Unknown");
      return `${escapeHtml(name)}`;
    }
    function getProfileUserById(id) {
      const uid = String(id || "");
      if (!uid) return null;
      if (uid === String(STATE.me?.id || "")) {
        return {
          id: String(STATE.me?.id || ""),
          name: String(STATE.me?.name || "Unknown"),
          // chess.com ID (for student role only)
          studentId: STATE.role === "student" ? String(STATE.me?.chessComId || STATE.me?.studentId || "") : "",
          role: String(STATE.role || ""),
          status: STATE.role === "student" ? String(STATE.status || "online") : "online"
        };
      }
      const s = STATE.students.find((x) => String(x?.id || "") === uid);
      if (!s) return null;
      return {
        id: String(s.id || ""),
        name: String(s.name || "Unknown"),
        // chess.com ID (legacy key name kept as `studentId` in UI model)
        studentId: String(s.chessComId || s.studentId || ""),
        role: "student",
        status: String(s.status || "online")
      };
    }
    function openProfile(id) {
      const uid = String(id || "");
      if (!uid) return;
      STATE.page = "profile";
      STATE.profileTargetId = uid;
      STATE.profileHistory = { loading: true, error: null, page: 1, totalPages: 1, totalItems: 0, games: [] };
      wsSend({ type: "vcp_get_game_history", targetUserId: uid, page: 1 });
      render();
    }
    function closeProfile() {
      STATE.page = "lobby";
      STATE.profileTargetId = null;
      STATE.profileHistory = { loading: false, error: null, page: 1, totalPages: 1, totalItems: 0, games: [] };
      render();
    }
    function openHistoryGame(gameId) {
      const gid = String(gameId || "");
      if (!gid) return;
      try {
        STATE.historyNcApp?.destroy?.();
      } catch {
      }
      STATE.historyNcApp = null;
      STATE.historyNcKey = null;
      STATE.page = "historyGame";
      STATE.historyGame = { loading: true, error: null, gameId: gid, game: null };
      wsSend({ type: "vcp_get_game_record", gameId: gid });
      render();
    }
    function closeHistoryGame() {
      try {
        STATE.historyNcApp?.destroy?.();
      } catch {
      }
      STATE.historyNcApp = null;
      STATE.historyNcKey = null;
      STATE.historyGame = { loading: false, error: null, gameId: null, game: null };
      STATE.page = "profile";
      render();
    }
    function openLiveViewer(sessionId) {
      const sid = String(sessionId || "");
      if (!sid) return;
      try {
        STATE.liveNcApp?.destroy?.();
      } catch {
      }
      STATE.liveNcApp = null;
      STATE.liveNcKey = null;
      STATE.page = "liveViewer";
      STATE.liveViewer = { loading: true, error: null, sessionId: sid, session: null };
      wsSend({ type: "vcp_get_session", sessionId: sid });
      wsSend({ type: "vcp_watch_session", sessionId: sid });
      render();
    }
    function closeLiveViewer() {
      const sid = String(STATE.liveViewer?.sessionId || "");
      if (sid) wsSend({ type: "vcp_unwatch_session", sessionId: sid });
      try {
        STATE.liveNcApp?.destroy?.();
      } catch {
      }
      STATE.liveNcApp = null;
      STATE.liveNcKey = null;
      STATE.liveViewer = { loading: false, error: null, sessionId: null, session: null };
      STATE.page = "lobby";
      render();
    }
    function renderProfileScreen() {
      const root = getRoot();
      if (!root) return;
      const target = getProfileUserById(STATE.profileTargetId) || {
        id: String(STATE.profileTargetId || ""),
        name: "Unknown",
        studentId: "",
        role: "student",
        status: "online"
      };
      const isMe = String(target.id || "") === String(STATE.me?.id || "");
      const idLine = target.role === "teacher" ? `Teacher ID: ${target.id || ""}` : target.studentId ? `chess.com ID: ${target.studentId}` : target.id ? `ID: ${target.id}` : "";
      const hist = STATE.profileHistory || { loading: false, error: null, page: 1, totalPages: 1, totalItems: 0, games: [] };
      const games = Array.isArray(hist.games) ? hist.games : [];
      const pageNums = (() => {
        const total = Math.max(1, Number(hist.totalPages || 1));
        const count = Math.min(5, total);
        return Array.from({ length: count }, (_, i) => i + 1);
      })();
      const gameModalHtml = "";
      root.innerHTML = `
      <div class="vcp-app ${STATE.sidebarCollapsed ? "is-sidebar-collapsed" : ""}">
        ${renderFixedSidebar()}
        <div class="vcp-app-main">
          <div class="vcp-main-inner">
            <div class="vcp-card">
              <div class="vcp-section">
                <div class="vcp-profile-shell">
                  <div class="vcp-profile-card">
                    <div class="vcp-profile-header">
                      <div>
                        <div class="vcp-profile-name">${escapeHtml(String(target.name || "Unknown"))}${isMe ? ' <span class="vcp-profile-me">(You)</span>' : ""}</div>
                        <div class="vcp-profile-id">${escapeHtml(String(idLine || ""))}</div>
                      </div>
                      <div>
                        <span class="vcp-status-pill ${escapeHtml(String(target.status || "online"))}">${escapeHtml(String(target.status || "online"))}</span>
                      </div>
                    </div>

                    <div class="vcp-btn-row" style="justify-content:flex-end; margin-top:12px;">
                      <button id="vcpProfileBackBtn" class="btn btn-secondary" type="button">Back</button>
                    </div>
                  </div>

                  <div class="vcp-history-card">
                    <div class="vcp-profile-section-title">Game history</div>
                    <div class="vcp-muted">Shows the latest games for this user. Click a game to view.</div>

                    ${hist.loading ? `<div class="vcp-muted" style="margin-top:10px;">Loading...</div>` : ""}
                    ${hist.error ? `<div class="vcp-muted" style="margin-top:10px; color:#b91c1c;">${escapeHtml(String(hist.error))}</div>` : ""}

                    ${!hist.loading && games.length === 0 ? `<div class="vcp-muted" style="margin-top:10px;">No games yet.</div>` : ""}

                    ${games.length ? `
                      <div class="vcp-history-scroll" role="region" aria-label="Game history list">
                        <div class="vcp-history-list" role="list">
                          ${games.map((g) => {
        const uid = String(STATE.profileTargetId || "");
        const isWhite = uid && uid === String(g.whiteId || "");
        const meName = isWhite ? String(g.whiteName || "Student A") : String(g.blackName || "Student A");
        const oppName = isWhite ? String(g.blackName || "Student B") : String(g.whiteName || "Student B");
        const res = userPerspectiveResult(g, uid);
        const date = formatDateTime(g.endedAt || g.startedAt);
        return `
                              <button class="vcp-history-row" type="button" data-vcp-game-id="${escapeHtml(String(g.id || ""))}">
                                <div class="vcp-history-main">
                                  <div class="vcp-history-title">${escapeHtml(`${meName} vs ${oppName}`)}</div>
                                  <div class="vcp-history-meta">${escapeHtml(date)}</div>
                                </div>
                                <div class="vcp-history-result">${escapeHtml(res)}</div>
                              </button>
                            `;
      }).join("")}
                        </div>
                      </div>
                    ` : ""}

                    ${Number(hist.totalPages || 1) > 1 ? `
                      <div class="vcp-pagination" role="navigation" aria-label="Game history pages">
                        ${pageNums.map((p) => `
                          <button class="vcp-page-btn ${Number(hist.page || 1) === p ? "active" : ""}" type="button" data-vcp-history-page="${p}">${p}</button>
                        `).join("")}
                        ${Number(hist.totalPages || 1) > 5 ? `<span class="vcp-muted">\u2026</span><button class="vcp-page-btn" type="button" data-vcp-history-page="${escapeHtml(String(hist.totalPages))}">${escapeHtml(String(hist.totalPages))}</button>` : ""}
                      </div>
                    ` : ""}
                  </div>
                </div>
              </div>
            </div>
            ${gameModalHtml}
            ${STATE.role === "teacher" ? renderTeacherChooseModeModal() : ""}
          </div>
        </div>
      </div>
    `;
      document.getElementById("vcpProfileBackBtn")?.addEventListener("click", closeProfile);
      bindFixedSidebarEvents();
      if (STATE.role === "teacher") bindTeacherModalEvents();
    }
    function renderOnlineListItem(s, { selectable }) {
      const safeId = escapeHtml(String(s?.id || ""));
      const safeName = escapeHtml(String(s?.name || "Unknown"));
      const safeStudentId = escapeHtml(String(s?.chessComId || s?.studentId || ""));
      const rawStatus = String(s?.status || "online");
      const safeStatus = escapeHtml(rawStatus);
      const dotCls = rawStatus === "in-game" ? "in-game" : rawStatus === "idle" ? "idle" : "online";
      if (selectable) {
        const checked = STATE.selected.has(String(s?.id)) ? "checked" : "";
        const disabled = String(s?.status) === "in-game" ? "disabled" : "";
        return `
        <div class="vcp-online-item" role="listitem">
          <div>
            <input type="checkbox" data-student-id="${safeId}" ${checked} ${disabled} aria-label="Select ${safeName}" />
          </div>
          <div>
            <div class="vcp-online-item-head">
              <span class="vcp-status-dot ${dotCls}" aria-hidden="true"></span>
              <button class="vcp-online-item-name vcp-name-btn" type="button" data-vcp-profile-id="${safeId}" aria-label="Open profile for ${safeName}">${safeName}</button>
            </div>
            <div class="vcp-online-item-meta">
              <div class="vcp-online-item-studentid">${safeStudentId}</div>
            </div>
          </div>
        </div>
      `;
      }
      return `
      <div class="vcp-online-item no-select" role="listitem">
        <div>
          <div class="vcp-online-item-head">
            <span class="vcp-status-dot ${dotCls}" aria-hidden="true"></span>
            <button class="vcp-online-item-name vcp-name-btn" type="button" data-vcp-profile-id="${safeId}" aria-label="Open profile for ${safeName}">${safeName}</button>
          </div>
          <div class="vcp-online-item-meta">
            <div class="vcp-online-item-studentid">${safeStudentId}</div>
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
            <div class="vcp-muted">Authentication token is missing. Please log in again.</div>
          </div>
        `;
        }
        return;
      }
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
        console.error("WS connect failed", e);
        return;
      }
      STATE.ws.addEventListener("open", () => {
        wsSend({ type: "vcp_hello", token });
      });
      STATE.ws.addEventListener("message", (ev) => {
        let msg = null;
        try {
          msg = JSON.parse(String(ev.data || ""));
        } catch {
          return;
        }
        handleWsMessage(msg);
      });
      STATE.ws.addEventListener("close", () => {
        STATE.wsReady = false;
        stopHeartbeat();
        render();
        scheduleReconnect();
      });
      STATE.ws.addEventListener("error", () => {
        try {
          STATE.ws?.close();
        } catch {
        }
      });
    }
    function scheduleReconnect() {
      if (reconnectTimer) return;
      const base = Math.min(3e4, 800 * Math.pow(2, reconnectAttempt));
      const jitter = Math.floor(Math.random() * 400);
      const delay = Math.min(3e4, base + jitter);
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
        wsSend({ type: "vcp_ping" });
        const now = Date.now();
        if (lastPongTs && now - lastPongTs > 65e3) {
          try {
            STATE.ws.close();
          } catch {
          }
        }
      }, 2e4);
    }
    let lastActivityPing = 0;
    function markActivity() {
      if (STATE.role !== "student") return;
      if (!STATE.wsReady) return;
      const now = Date.now();
      if (now - lastActivityPing < 8e3) return;
      lastActivityPing = now;
      wsSend({ type: "vcp_activity", statusChanged: "true" });
    }
    function bindActivityListeners() {
      const events = ["pointerdown", "keydown", "touchstart", "scroll", "focus"];
      events.forEach((evt) => window.addEventListener(evt, markActivity, { passive: true }));
      setTimeout(markActivity, 300);
    }
    function renderTeacher() {
      const root = getRoot();
      if (!root) return;
      root.innerHTML = `
      <div class="vcp-app ${STATE.sidebarCollapsed ? "is-sidebar-collapsed" : ""}">
        ${renderFixedSidebar()}
        <div class="vcp-app-main">
          <div class="vcp-main-inner">
            <div class="vcp-me-row">
              <div class="vcp-card vcp-me-card">
                <button class="vcp-badge vcp-badge-btn" type="button" data-vcp-profile-id="${escapeHtml(String(STATE.me?.id || ""))}">
                  ${renderHeaderBadge()}
                </button>
              </div>
            </div>

            <div class="vcp-card">
              ${STATE.lastError ? `<div class="vcp-muted" style="margin-top:0; color:#b91c1c;"><strong>Error:</strong> ${escapeHtml(STATE.lastError)}</div>` : ""}

              <div class="vcp-section">
                ${STATE.pendingInvite ? `
                  <div class="vcp-list-item" style="border-style:solid; margin-bottom:12px;">
                    <div style="font-weight:950; color:#111827;">Pending invite</div>
                    <div class="vcp-muted" style="margin-top:6px;">
                      Waiting for students to accept\u2026
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
        const r = STATE.pendingInvite.responses?.[String(sid)] || "pending";
        const pill = r === "accept" ? "online" : r === "decline" ? "idle" : "in-game";
        const text = r === "accept" ? "accepted" : r === "decline" ? "declined" : "pending";
        return `${escapeHtml(studentLabelById(sid))}: <span class="vcp-status-pill ${pill}">${text}</span>`;
      }).join("<br>")}
                    </div>
                    <div class="vcp-btn-row" style="margin-top:10px; justify-content:flex-end;">
                      <button id="vcpDismissInviteBtn" class="btn btn-secondary" type="button">Dismiss</button>
                    </div>
                  </div>
                ` : ""}

                <div style="font-weight:900; color:#111827; margin-bottom:6px;">My game</div>
                <div class="vcp-muted">Shows only games where you are a player.</div>
                <div id="vcpMyGamesArea" style="margin-top:8px;">${renderMyGames()}</div>

                <div style="font-weight:900; color:#111827; margin:14px 0 6px;">Live Game</div>
                <div id="vcpLiveGamesArea">${renderLiveGames()}</div>
              </div>
            </div>

            ${renderTeacherChooseModeModal()}
          </div>
        </div>
      </div>
    `;
      document.getElementById("vcpDismissInviteBtn")?.addEventListener("click", () => {
        STATE.pendingInvite = null;
        render();
      });
      bindFixedSidebarEvents();
      bindTeacherModalEvents();
    }
    function renderStudent() {
      const root = getRoot();
      if (!root) return;
      const player = STATE.me;
      function renderStudentInvitesInline() {
        if (STATE.role !== "student") return "";
        const items = Array.isArray(STATE.invites) ? STATE.invites : [];
        const invites = items.map((x) => x && typeof x === "object" && x.invite ? x.invite : x).filter(Boolean);
        if (!invites.length) return "";
        const myId = String(STATE.me?.id || "");
        return `
        <div class="vcp-invites-inline" style="margin: 8px 0 10px;">
          ${invites.map((inv) => {
          const cfg = inv?.config || {};
          const teacherName = String(inv?.teacher?.name || "Teacher");
          const minutes = String(cfg.minutes || 3);
          const inc = String(cfg.incrementSec || 0);
          const myColor = String(cfg.whiteStudentId) === myId ? "White" : String(cfg.blackStudentId) === myId ? "Black" : "";
          const inviteId = String(inv?.id || "");
          return `
              <div class="vcp-list-item vcp-invite-card" data-vcp-invite-id="${escapeHtml(inviteId)}" style="border-style:solid;">
                <div style="font-weight:950; color:#111827;">${escapeHtml(teacherName)} invited you</div>
                <div class="vcp-muted" style="margin-top:6px;">
                  Normal Chess \xB7 ${escapeHtml(minutes)} min + ${escapeHtml(inc)} sec
                  ${myColor ? ` \xB7 You are <strong>${escapeHtml(myColor)}</strong>` : ""}
                </div>
                <div class="vcp-btn-row" style="justify-content:flex-end; margin-top:10px;">
                  <button class="btn btn-secondary" type="button" data-vcp-invite-decline="${escapeHtml(inviteId)}">Decline</button>
                  <button class="btn btn-primary" type="button" data-vcp-invite-accept="${escapeHtml(inviteId)}">Accept</button>
                </div>
              </div>
            `;
        }).join("")}
        </div>
      `;
      }
      root.innerHTML = `
      <div class="vcp-app ${STATE.sidebarCollapsed ? "is-sidebar-collapsed" : ""}">
        ${renderFixedSidebar()}
        <div class="vcp-app-main">
          <div class="vcp-main-inner">
            <div class="vcp-me-row">
              <div class="vcp-card vcp-me-card">
                <button class="vcp-badge vcp-badge-btn" type="button" data-vcp-profile-id="${escapeHtml(String(STATE.me?.id || ""))}">
                  ${renderHeaderBadge()}
                </button>
              </div>
            </div>

            <div class="vcp-card">
              ${STATE.lastError ? `<div class="vcp-muted" style="margin-top:0; color:#b91c1c;"><strong>Error:</strong> ${escapeHtml(STATE.lastError)}</div>` : ""}

              <div class="vcp-section">
                <div style="font-weight:900; color:#111827; margin-bottom:6px;">My game</div>
                ${renderStudentInvitesInline()}
                <div id="vcpMyGamesArea">${renderMyGames()}</div>

                <div style="font-weight:900; color:#111827; margin:14px 0 6px;">Live Game</div>
                <div id="vcpLiveGamesArea">${renderLiveGames()}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
      bindFixedSidebarEvents();
      const removeInviteById = (inviteId) => {
        const id = String(inviteId || "");
        if (!id) return;
        STATE.invites = (Array.isArray(STATE.invites) ? STATE.invites : []).filter((x) => String((x && x.invite ? x.invite.id : x?.id) || "") !== id);
      };
      root.querySelectorAll("[data-vcp-invite-decline]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-vcp-invite-decline") || "";
          wsSend({ type: "vcp_invite_respond", inviteId: id, response: "decline" });
          removeInviteById(id);
          render();
        });
      });
      root.querySelectorAll("[data-vcp-invite-accept]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-vcp-invite-accept") || "";
          wsSend({ type: "vcp_invite_respond", inviteId: id, response: "accept" });
          removeInviteById(id);
          render();
        });
      });
    }
    function renderSessionPage() {
      const root = getRoot();
      if (!root) return;
      if (!STATE.activeSession) {
        STATE.page = "lobby";
        render();
        return;
      }
      const s = STATE.activeSession;
      if (String(s.mode) !== "chess") {
        STATE.page = "lobby";
        render();
        return;
      }
      root.innerHTML = `
      <div class="vcp-app ${STATE.sidebarCollapsed ? "is-sidebar-collapsed" : ""}">
        ${renderFixedSidebar()}
        <div class="vcp-app-main">
          <div class="vcp-main-inner">
            <div class="vcp-card">
              <div class="vcp-section">
                ${renderTeacherSessionBar()}
                <div id="ncMount"></div>
              </div>
            </div>

            ${STATE.role === "teacher" ? renderTeacherChooseModeModal() : ""}
          </div>
        </div>
      </div>
    `;
      bindFixedSidebarEvents();
      bindSessionEvents();
      if (STATE.role === "teacher") bindTeacherModalEvents();
    }
    function renderHistoryGamePage() {
      const root = getRoot();
      if (!root) return;
      const hg = STATE.historyGame || { loading: false, error: null, gameId: null, game: null };
      root.innerHTML = `
      <div class="vcp-app ${STATE.sidebarCollapsed ? "is-sidebar-collapsed" : ""}">
        ${renderFixedSidebar()}
        <div class="vcp-app-main">
          <div class="vcp-main-inner">
            <div class="vcp-card">
              <div class="vcp-row">
                <div class="vcp-btn-row" style="justify-content:flex-end;">
                  <button id="vcpHistoryBackBtn" class="btn btn-secondary" type="button">Back</button>
                </div>
              </div>

              <div class="vcp-section">
                <div id="ncHistoryMount">
                  ${hg.loading ? `<div class="vcp-muted">Loading...</div>` : ""}
                  ${hg.error ? `<div class="vcp-muted" style="color:#b91c1c;">${escapeHtml(String(hg.error))}</div>` : ""}
                </div>
              </div>
            </div>
            ${STATE.role === "teacher" ? renderTeacherChooseModeModal() : ""}
          </div>
        </div>
      </div>
    `;
      document.getElementById("vcpHistoryBackBtn")?.addEventListener("click", closeHistoryGame);
      bindFixedSidebarEvents();
      bindHistoryGameEvents();
      if (STATE.role === "teacher") bindTeacherModalEvents();
    }
    function renderLiveViewerPage() {
      const root = getRoot();
      if (!root) return;
      const lv = STATE.liveViewer || { loading: false, error: null, sessionId: null, session: null };
      root.innerHTML = `
      <div class="vcp-app ${STATE.sidebarCollapsed ? "is-sidebar-collapsed" : ""}">
        ${renderFixedSidebar()}
        <div class="vcp-app-main">
          <div class="vcp-main-inner">
            <div class="vcp-card">
              <div class="vcp-row">
                <div class="vcp-btn-row" style="justify-content:flex-end;">
                  <button id="vcpLiveBackBtn" class="btn btn-secondary" type="button">Back to lobby</button>
                </div>
              </div>
              <div class="vcp-section">
                <div id="ncLiveMount">
                  ${lv.loading ? `<div class="vcp-muted">Loading...</div>` : ""}
                  ${lv.error ? `<div class="vcp-muted" style="color:#b91c1c;">${escapeHtml(String(lv.error))}</div>` : ""}
                </div>
              </div>
            </div>
            ${STATE.role === "teacher" ? renderTeacherChooseModeModal() : ""}
          </div>
        </div>
      </div>
    `;
      document.getElementById("vcpLiveBackBtn")?.addEventListener("click", closeLiveViewer);
      bindFixedSidebarEvents();
      bindLiveViewerEvents();
      if (STATE.role === "teacher") bindTeacherModalEvents();
    }
    function bindSessionEvents() {
      if (!STATE.activeSession) return;
      if (STATE.role === "teacher") {
        const toggle = document.getElementById("vcpAutoSwitchToggle");
        if (toggle) {
          toggle.checked = !!STATE.teacherAutoSwitch;
          toggle.addEventListener("change", () => {
            STATE.teacherAutoSwitch = !!toggle.checked;
            try {
              localStorage.setItem("vcpTeacherAutoSwitch", STATE.teacherAutoSwitch ? "1" : "0");
            } catch {
            }
          });
        }
      }
      try {
        const mount = document.getElementById("ncMount");
        if (mount && window.NormalChess?.mountNormalChess) {
          const sessionId = String(STATE.activeSession.id || "");
          const sendNc = (payload) => wsSend(payload);
          const mountChanged = STATE._ncMountEl && STATE._ncMountEl !== mount;
          if (mountChanged) {
            try {
              STATE.ncApp?.destroy?.();
            } catch {
            }
            STATE.ncApp = null;
            STATE.ncSessionId = null;
          }
          STATE._ncMountEl = mount;
          if (!STATE.ncApp || String(STATE.ncSessionId) !== sessionId) {
            STATE.ncSessionId = sessionId;
            STATE.ncApp = window.NormalChess.mountNormalChess({
              rootEl: mount,
              send: sendNc,
              getSession: () => STATE.activeSession,
              getIdentity: () => ({ role: STATE.role, id: STATE.me?.id || "" }),
              getPlayerLabelById: (id) => studentLabelById(id),
              sessionMoveList: true,
              getShell: () => ({ sidebarCollapsed: !!STATE.sidebarCollapsed })
            });
          }
          if (STATE.ncApp?.applyState && STATE.activeSession?.chessState) {
            STATE.ncApp.applyState(STATE.activeSession.chessState);
          }
        }
      } catch {
      }
    }
    function buildHistoryChessSessionFromGameRecord(g) {
      if (!g) return null;
      const whiteId = String(g.whiteId || g?.config?.whiteStudentId || "white");
      const blackId = String(g.blackId || g?.config?.blackStudentId || "black");
      const cfg = g?.config && typeof g.config === "object" ? g.config : {};
      const minutes = Number(cfg.minutes || 3) || 3;
      const incrementSec = Number(cfg.incrementSec || 0) || 0;
      const boards = Array.isArray(g?.timelineBoards) ? g.timelineBoards : null;
      const lastPly = boards ? Math.max(0, boards.length - 1) : 0;
      const board = boards ? boards[lastPly] : g?.state?.board || null;
      const tClocks = Array.isArray(g?.timelineClocks) ? g.timelineClocks[lastPly] : null;
      const wMs = tClocks ? Number(tClocks.wMs || 0) : Number(g?.state?.clocks?.wMs ?? 0);
      const bMs = tClocks ? Number(tClocks.bMs || 0) : Number(g?.state?.clocks?.bMs ?? 0);
      const chessState = {
        ...g?.state && typeof g.state === "object" ? g.state : {},
        board: board || (g?.state?.board || null),
        clocks: { wMs, bMs },
        // Freeze UI: history is read-only
        gameOver: true,
        turnStartTs: Date.now()
      };
      return {
        id: `history:${String(g.id || "")}`,
        mode: "chess",
        status: "ended",
        config: { minutes, incrementSec, whiteStudentId: whiteId, blackStudentId: blackId },
        chessState
      };
    }
    function bindHistoryGameEvents() {
      if (STATE.page !== "historyGame") return;
      const mount = document.getElementById("ncHistoryMount");
      if (!mount) return;
      const g = STATE.historyGame?.game || null;
      if (!g) return;
      if (!window.NormalChess?.mountNormalChess) return;
      const session = buildHistoryChessSessionFromGameRecord(g);
      if (!session) return;
      const key = String(session.id || "");
      const mountChanged = STATE._historyMountEl && STATE._historyMountEl !== mount;
      if (mountChanged) {
        try {
          STATE.historyNcApp?.destroy?.();
        } catch {
        }
        STATE.historyNcApp = null;
        STATE.historyNcKey = null;
      }
      STATE._historyMountEl = mount;
      if (!STATE.historyNcApp || String(STATE.historyNcKey) !== key) {
        try {
          STATE.historyNcApp?.destroy?.();
        } catch {
        }
        STATE.historyNcKey = key;
        const sendNoop = () => {
        };
        const whiteId = String(session?.config?.whiteStudentId || "");
        const blackId = String(session?.config?.blackStudentId || "");
        const whiteName = String(g.whiteName || "White");
        const blackName = String(g.blackName || "Black");
        STATE.historyNcApp = window.NormalChess.mountNormalChess({
          rootEl: mount,
          send: sendNoop,
          getSession: () => session,
          getIdentity: () => ({ role: STATE.role, id: STATE.me?.id || "" }),
          getPlayerLabelById: (id) => {
            const sid = String(id || "");
            if (sid && sid === whiteId) return whiteName;
            if (sid && sid === blackId) return blackName;
            return "";
          },
          viewer: true,
          getShell: () => ({ sidebarCollapsed: !!STATE.sidebarCollapsed }),
          getViewerData: () => {
            const gg = STATE.historyGame?.game || null;
            return {
              sanMoves: Array.isArray(gg?.sanMoves) ? gg.sanMoves : [],
              timelineBoards: Array.isArray(gg?.timelineBoards) ? gg.timelineBoards : [],
              timelineClocks: Array.isArray(gg?.timelineClocks) ? gg.timelineClocks : [],
              pgn: String(gg?.pgn || "")
            };
          }
        });
      }
      try {
        STATE.historyNcApp?.applyState?.(session.chessState);
      } catch {
      }
    }
    function bindLiveViewerEvents() {
      if (STATE.page !== "liveViewer") return;
      const mount = document.getElementById("ncLiveMount");
      if (!mount) return;
      const session = STATE.liveViewer?.session || null;
      if (!session || !session.chessState) return;
      if (!window.NormalChess?.mountNormalChess) return;
      const key = String(session.id || "");
      const mountChanged = STATE._liveMountEl && STATE._liveMountEl !== mount;
      if (mountChanged) {
        try {
          STATE.liveNcApp?.destroy?.();
        } catch {
        }
        STATE.liveNcApp = null;
        STATE.liveNcKey = null;
      }
      STATE._liveMountEl = mount;
      if (!STATE.liveNcApp || String(STATE.liveNcKey) !== key) {
        try {
          STATE.liveNcApp?.destroy?.();
        } catch {
        }
        STATE.liveNcKey = key;
        const sendNoop = () => {
        };
        const cfg = session?.config || {};
        const whiteId = String(cfg.whiteStudentId || "");
        const blackId = String(cfg.blackStudentId || "");
        const whiteName = String(session.whiteName || "White");
        const blackName = String(session.blackName || "Black");
        STATE.liveNcApp = window.NormalChess.mountNormalChess({
          rootEl: mount,
          send: sendNoop,
          getSession: () => session,
          // Spectator mode: never allow moves
          getIdentity: () => ({ role: "spectator", id: String(STATE.me?.id || "") }),
          getPlayerLabelById: (id) => {
            const sid = String(id || "");
            if (sid && sid === whiteId) return whiteName;
            if (sid && sid === blackId) return blackName;
            return "";
          },
          sessionMoveList: true,
          spectator: true,
          getShell: () => ({ sidebarCollapsed: !!STATE.sidebarCollapsed })
        });
      }
      try {
        STATE.liveNcApp?.applyState?.(session.chessState);
      } catch {
      }
    }
    function closeSessionView() {
      if (!STATE.activeSession) return;
      try {
        STATE.ncApp?.destroy?.();
      } catch {
      }
      STATE.ncApp = null;
      STATE.ncSessionId = null;
      STATE.activeSession = null;
      STATE.page = "lobby";
      render();
    }
    function leaveSession() {
      if (!STATE.activeSession) return;
      wsSend({ type: "vcp_leave_session", sessionId: STATE.activeSession.id });
      STATE.activeSession = null;
      STATE.status = "online";
      try {
        STATE.ncApp?.destroy?.();
      } catch {
      }
      STATE.ncApp = null;
      STATE.ncSessionId = null;
      render();
    }
    function renderTeacherChooseModeModal() {
      if (!STATE.uiChooseModeOpen) return "";
      const ids = Array.from(STATE.selected);
      const id1 = String(ids[0] || "");
      const id2 = String(ids[1] || "");
      const label1 = studentLabelById(id1) || "Player A";
      const label2 = studentLabelById(id2) || "Player B";
      const whiteId = String(STATE.chooseMode?.whiteStudentId || id1);
      const blackId = whiteId === id1 ? id2 : id1;
      const minutes = STATE.chooseMode?.minutes ?? 3;
      const inc = STATE.chooseMode?.incrementSec ?? 2;
      return `
      <div class="vcp-modal-backdrop" id="vcpChooseModeBackdrop" role="presentation">
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Choose game mode">
          <div class="vcp-modal-header">
            <div class="vcp-modal-title">Choose game mode</div>
            <button id="vcpChooseModeClose" class="vcp-modal-close" type="button" aria-label="Close">\xD7</button>
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
                <option value="${escapeHtml(id1)}" ${whiteId === id1 ? "selected" : ""}>${escapeHtml(label1)}</option>
                <option value="${escapeHtml(id2)}" ${whiteId === id2 ? "selected" : ""}>${escapeHtml(label2)}</option>
              </select>
            </div>

            <div class="vcp-form-row">
              <label style="font-weight:900; color:#111827;">Black</label>
              <input class="vcp-input" type="text" readonly value="${escapeHtml((blackId === id1 ? label1 : label2) || "")}">
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
      document.getElementById("vcpChooseModeClose")?.addEventListener("click", closeChooseModeModal);
      document.getElementById("vcpCancelBtn")?.addEventListener("click", closeChooseModeModal);
      document.getElementById("vcpChooseModeBackdrop")?.addEventListener("click", (e) => {
        if (e.target && e.target.id === "vcpChooseModeBackdrop") closeChooseModeModal();
      });
      document.getElementById("vcpWhiteSelect")?.addEventListener("change", () => {
        const v = String(document.getElementById("vcpWhiteSelect")?.value || "");
        if (STATE.chooseMode) STATE.chooseMode.whiteStudentId = v;
        render();
      });
      document.getElementById("vcpStartBtn")?.addEventListener("click", () => {
        const ids = Array.from(STATE.selected);
        if (ids.length !== 2) return;
        const white = String(document.getElementById("vcpWhiteSelect")?.value || ids[0]);
        const minutesRaw = Number(document.getElementById("vcpMinutes")?.value || 3) || 3;
        const incRaw = Number(document.getElementById("vcpInc")?.value || 0) || 0;
        const minutes = Math.max(1, Math.min(60, minutesRaw));
        const inc = Math.max(0, Math.min(60, incRaw));
        const black = white === ids[0] ? ids[1] : ids[0];
        const teacherId = String(STATE.me?.id || "");
        const hasTeacher = teacherId && ids.includes(teacherId);
        vcpDebug("start invite", { ids, teacherId, hasTeacher, white, black, minutes, inc, page: STATE.page, activeSessionId: STATE.activeSession?.id || null });
        if (hasTeacher) {
          const studentId = String(ids.find((x) => String(x) !== teacherId) || "");
          if (!studentId) return;
          wsSend({
            type: "vcp_invite_teacher_match",
            mode: "chess",
            studentId,
            config: { minutes, incrementSec: inc, whiteStudentId: white, blackStudentId: black }
          });
          STATE.pendingInvite = {
            inviteId: null,
            studentIds: [studentId],
            config: { minutes, incrementSec: inc, whiteStudentId: white, blackStudentId: black },
            createdAt: Date.now(),
            responses: {}
          };
        } else {
          wsSend({
            type: "vcp_invite_create",
            mode: "chess",
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
        }
        STATE.selected = /* @__PURE__ */ new Set();
        closeChooseModeModal();
        setTeacherMessage("Invite sent. Waiting for students\u2026", "success");
      });
    }
    function renderStudentInviteModal() {
      const current = STATE.invites[0]?.invite || null;
      if (!current) return "";
      const cfg = current.config || {};
      const myId = String(STATE.me?.id || "");
      const myColor = String(cfg.whiteStudentId) === myId ? "White" : String(cfg.blackStudentId) === myId ? "Black" : "";
      return `
      <div class="vcp-modal-backdrop" id="vcpInviteBackdrop" role="presentation">
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Invite">
          <div class="vcp-modal-header">
            <div class="vcp-modal-title">Invite</div>
            <button id="vcpInviteClose" class="vcp-modal-close" type="button" aria-label="Close">\xD7</button>
          </div>
          <div class="vcp-modal-body">
            <div class="vcp-muted" style="margin-bottom:10px;">
              <strong>${escapeHtml(current.teacher?.name || "Teacher")}</strong> invited you to <strong>Normal Chess</strong>.
            </div>
            ${myColor ? `
              <div class="vcp-list-item" style="margin-bottom:10px;">
                <div style="font-weight:900; color:#111827;">Your side</div>
                <div class="vcp-muted" style="margin-top:6px;">You will play as <strong>${escapeHtml(myColor)}</strong>.</div>
              </div>
            ` : ""}
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
      document.getElementById("vcpInviteClose")?.addEventListener("click", close);
      document.getElementById("vcpInviteBackdrop")?.addEventListener("click", (e) => {
        if (e.target && e.target.id === "vcpInviteBackdrop") close();
      });
      document.getElementById("vcpDeclineBtn")?.addEventListener("click", () => {
        wsSend({ type: "vcp_invite_respond", inviteId: current.id, response: "decline" });
        close();
      });
      document.getElementById("vcpAcceptBtn")?.addEventListener("click", () => {
        wsSend({ type: "vcp_invite_respond", inviteId: current.id, response: "accept" });
        close();
        render();
      });
    }
    function handleWsMessage(msg) {
      const type = String(msg?.type || "");
      if (type === "vcp_ready") {
        STATE.wsReady = true;
        STATE.lastError = null;
        STATE.role = String(msg?.kind || STATE.role);
        if (msg?.userId) STATE.me.id = String(msg.userId);
        if (STATE.role === "student" && msg?.studentId) STATE.me.studentId = String(msg.studentId);
        if (STATE.role === "teacher") STATE.me.studentId = "";
        STATE.me.name = String(msg?.name || STATE.me.name);
        if (STATE.role === "student" && msg?.status) STATE.status = String(msg.status);
        reconnectAttempt = 0;
        startHeartbeat();
        if (STATE.role === "teacher") {
          try {
            STATE.teacherAutoSwitch = localStorage.getItem("vcpTeacherAutoSwitch") === "1";
          } catch {
          }
        }
        wsSend({ type: "vcp_get_presence" });
        wsSend({ type: "vcp_get_live_games" });
        if (STATE.role === "teacher" && STATE.me?.id) {
          wsSend({ type: "vcp_get_game_history", targetUserId: String(STATE.me.id), page: 1 });
        }
        render();
        return;
      }
      if (type === "vcp_pong") {
        lastPongTs = Date.now();
        return;
      }
      if (type === "vcp_error") {
        const details = msg?.role ? `${String(msg?.error || "Error")} (role=${String(msg.role)})` : String(msg?.error || "Error");
        console.error("VCP error:", details);
        STATE.lastError = details;
        setTeacherMessage(details, "error");
        if (STATE.page === "liveViewer") {
          STATE.liveViewer = { loading: false, error: details, sessionId: String(STATE.liveViewer?.sessionId || ""), session: STATE.liveViewer?.session || null };
        }
        render();
        return;
      }
      if (type === "vcp_presence_snapshot") {
        STATE.students = Array.isArray(msg?.students) ? msg.students : [];
        if (STATE.role === "teacher") {
          const ids = new Set(STATE.students.map((s) => String(s.id)));
          const teacherId = String(STATE.me?.id || "");
          STATE.selected = new Set(Array.from(STATE.selected).filter((id) => {
            const sid = String(id);
            if (teacherId && sid === teacherId) return true;
            return ids.has(sid);
          }));
          vcpDebug("presence snapshot", { students: STATE.students.length, selected: Array.from(STATE.selected) });
        }
        render();
        return;
      }
      if (type === "vcp_game_history") {
        const targetUserId = String(msg?.targetUserId || "");
        const payload = {
          loading: false,
          error: null,
          page: Number(msg?.page || 1) || 1,
          totalPages: Number(msg?.totalPages || 1) || 1,
          totalItems: Number(msg?.totalItems || 0) || 0,
          games: Array.isArray(msg?.games) ? msg.games : []
        };
        if (targetUserId && targetUserId === String(STATE.profileTargetId || "")) {
          STATE.profileHistory = payload;
        }
        if (STATE.role === "teacher" && targetUserId && targetUserId === String(STATE.me?.id || "")) {
          STATE.teacherGameHistory = payload;
        }
        if (STATE.page === "session" && STATE.role === "teacher") {
          try {
            const bar = document.querySelector(".vcp-session-bar");
            if (bar) {
              bar.outerHTML = renderTeacherSessionBar();
              const toggle = document.getElementById("vcpAutoSwitchToggle");
              if (toggle) {
                toggle.checked = !!STATE.teacherAutoSwitch;
                toggle.addEventListener("change", () => {
                  STATE.teacherAutoSwitch = !!toggle.checked;
                  try {
                    localStorage.setItem("vcpTeacherAutoSwitch", STATE.teacherAutoSwitch ? "1" : "0");
                  } catch {
                  }
                });
              }
              return;
            }
          } catch {
          }
        }
        render();
        return;
      }
      if (type === "vcp_game_record") {
        if (STATE.page !== "historyGame") return;
        const g = msg?.game || null;
        if (!g) {
          STATE.historyGame = { loading: false, error: "Game not found", gameId: String(STATE.historyGame?.gameId || ""), game: null };
          render();
          return;
        }
        STATE.historyGame = { loading: false, error: null, gameId: String(g.id || ""), game: g };
        render();
        return;
      }
      if (type === "vcp_live_games_snapshot") {
        STATE.liveGames = Array.isArray(msg?.games) ? msg.games : [];
        const area = document.getElementById("vcpLiveGamesArea");
        if (area) area.innerHTML = renderLiveGames();
        const myArea = document.getElementById("vcpMyGamesArea");
        if (myArea) myArea.innerHTML = renderMyGames();
        if (STATE.page === "session" && STATE.role === "teacher") {
          try {
            const bar = document.querySelector(".vcp-session-bar");
            if (bar) {
              bar.outerHTML = renderTeacherSessionBar();
              const toggle = document.getElementById("vcpAutoSwitchToggle");
              if (toggle) {
                toggle.checked = !!STATE.teacherAutoSwitch;
                toggle.addEventListener("change", () => {
                  STATE.teacherAutoSwitch = !!toggle.checked;
                  try {
                    localStorage.setItem("vcpTeacherAutoSwitch", STATE.teacherAutoSwitch ? "1" : "0");
                  } catch {
                  }
                });
              }
            }
          } catch {
          }
        }
        return;
      }
      if (type === "vcp_invite") {
        if (STATE.role !== "student") return;
        STATE.invites.push({ invite: msg.invite });
        render();
        return;
      }
      if (type === "vcp_invite_sent") {
        if (STATE.role === "teacher" && STATE.pendingInvite && !STATE.pendingInvite.inviteId) {
          STATE.pendingInvite.inviteId = String(msg?.inviteId || "");
          render();
        }
        return;
      }
      if (type === "vcp_invite_update") {
        if (STATE.role === "teacher") {
          setTeacherMessage(`Invite update: ${msg.studentId} ${msg.response}`, "info");
          if (STATE.pendingInvite && String(STATE.pendingInvite.inviteId) === String(msg?.inviteId || "")) {
            STATE.pendingInvite.responses[String(msg.studentId)] = String(msg.response);
            if (String(msg.response) === "decline") setTeacherMessage("Invite declined.", "error");
          }
          render();
        }
        return;
      }
      if (type === "vcp_session_start") {
        const incoming = msg.session || null;
        if (STATE.role === "student") {
          STATE.activeSession = incoming;
          STATE.status = "in-game";
          STATE.page = "session";
          render();
          return;
        }
        if (STATE.role === "teacher") {
          STATE.pendingInvite = null;
          STATE.selected = /* @__PURE__ */ new Set();
          setTeacherMessage("Session started.", "success");
          wsSend({ type: "vcp_get_live_games" });
          if (!STATE.activeSession || STATE.page !== "session") {
            STATE.activeSession = incoming;
            STATE.page = "session";
            render();
          } else {
            render();
          }
          return;
        }
        STATE.activeSession = incoming;
        STATE.page = "session";
        render();
        return;
      }
      if (type === "vcp_session_snapshot") {
        const sid = String(msg?.sessionId || msg?.session?.id || "");
        const session = msg?.session || null;
        if (STATE.page === "liveViewer" && sid && sid === String(STATE.liveViewer?.sessionId || "")) {
          STATE.liveViewer = { loading: false, error: null, sessionId: sid, session };
          render();
        }
        return;
      }
      if (type === "vcp_chess_sync") {
        const sid = String(msg?.sessionId || "");
        const st = msg?.state || null;
        if (st && typeof st === "object") {
          if (STATE.activeSession && String(STATE.activeSession.id) === sid) {
            STATE.activeSession.chessState = st;
            try {
              STATE.ncApp?.applyState?.(st);
            } catch {
            }
          }
          if (STATE.page === "liveViewer" && sid && sid === String(STATE.liveViewer?.sessionId || "") && STATE.liveViewer?.session) {
            STATE.liveViewer.session.chessState = st;
            try {
              STATE.liveNcApp?.applyState?.(st);
            } catch {
            }
          }
          updateLiveGameStateFromSync(sid, st);
        }
        try {
          autoSwitchOnSyncIfNeeded();
        } catch {
        }
        return;
      }
      if (type === "vcp_session_update") {
        if (STATE.role === "teacher") {
          setTeacherMessage(`Session update: student ${msg.studentId} left`, "info");
          render();
        }
        return;
      }
    }
    function render() {
      if (STATE.page === "session") {
        renderSessionPage();
        return;
      }
      if (STATE.page === "liveViewer") {
        renderLiveViewerPage();
        return;
      }
      if (STATE.page === "historyGame") {
        renderHistoryGamePage();
        return;
      }
      if (STATE.page === "profile") {
        renderProfileScreen();
        return;
      }
      if (STATE.page === "settings") {
        renderSettingsPage();
        return;
      }
      if (STATE.role === "teacher") renderTeacher();
      else renderStudent();
    }
    function init() {
      STATE.role = getRole();
      STATE.page = "lobby";
      STATE.settingsTab = "board";
      STATE.profileTargetId = null;
      STATE.profileHistory = { loading: false, error: null, page: 1, totalPages: 1, totalItems: 0, games: [] };
      STATE.historyGame = { loading: false, error: null, gameId: null, game: null };
      STATE.liveViewer = { loading: false, error: null, sessionId: null, session: null };
      try {
        const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        STATE.onlineListOpen = !coarse;
      } catch {
        STATE.onlineListOpen = true;
      }
      const studentPlayer = STATE.role === "student" ? getStudentPlayer() : null;
      if (studentPlayer && typeof studentPlayer === "object") {
        STATE.me = {
          id: String(studentPlayer.id || ""),
          name: String(studentPlayer.name || "Student"),
          studentId: String(studentPlayer.studentId || "")
        };
      } else if (STATE.role === "teacher") {
        STATE.me.studentId = "";
      }
      render();
      ensureDelegatedClicks();
      applyBoardColors();
      connectWs();
      bindActivityListeners();
      window.addEventListener("focus", () => {
        if (!STATE.ws || STATE.ws.readyState !== WebSocket.OPEN) connectWs();
      });
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && (!STATE.ws || STATE.ws.readyState !== WebSocket.OPEN)) connectWs();
      });
    }
    window.initVChessPlatform = init;
  })();
})();
