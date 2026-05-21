              <div class="vcp-section">
                ${renderTeacherSessionBar()}
                <div id="ncMount"></div>
              </div>
            </div>

            ${STATE.role === 'teacher' ? renderTeacherChooseModeModal() : ''}
          </div>
        </div>
      </div>
    `;

    bindFixedSidebarEvents();
    bindSessionEvents();
    if (STATE.role === 'teacher') bindTeacherModalEvents();
  }

  function renderHistoryGamePage() {
    const root = getRoot();
    if (!root) return;
    const hg = STATE.historyGame || { loading: false, error: null, gameId: null, game: null };

    root.innerHTML = `
      <div class="vcp-app ${STATE.sidebarCollapsed ? 'is-sidebar-collapsed' : ''}">
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
                  ${hg.loading ? `<div class="vcp-muted">Loading...</div>` : ''}
                  ${hg.error ? `<div class="vcp-muted" style="color:#b91c1c;">${escapeHtml(String(hg.error))}</div>` : ''}
                </div>
              </div>
            </div>
            ${STATE.role === 'teacher' ? renderTeacherChooseModeModal() : ''}
          </div>
        </div>
      </div>
    `;

    document.getElementById('vcpHistoryBackBtn')?.addEventListener('click', closeHistoryGame);
    bindFixedSidebarEvents();
    bindHistoryGameEvents();
    if (STATE.role === 'teacher') bindTeacherModalEvents();
  }

  function renderLiveViewerPage() {
    const root = getRoot();
    if (!root) return;
    const lv = STATE.liveViewer || { loading: false, error: null, sessionId: null, session: null };
    root.innerHTML = `
      <div class="vcp-app ${STATE.sidebarCollapsed ? 'is-sidebar-collapsed' : ''}">
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
                  ${lv.loading ? `<div class="vcp-muted">Loading...</div>` : ''}
                  ${lv.error ? `<div class="vcp-muted" style="color:#b91c1c;">${escapeHtml(String(lv.error))}</div>` : ''}
                </div>
              </div>
            </div>
            ${STATE.role === 'teacher' ? renderTeacherChooseModeModal() : ''}
          </div>
        </div>
      </div>
    `;
    document.getElementById('vcpLiveBackBtn')?.addEventListener('click', closeLiveViewer);
    bindFixedSidebarEvents();
    bindLiveViewerEvents();
    if (STATE.role === 'teacher') bindTeacherModalEvents();
  }

  function bindSessionEvents() {
    if (!STATE.activeSession) return;

    if (STATE.role === 'teacher') {
      const toggle = document.getElementById('vcpAutoSwitchToggle');
      if (toggle) {
        toggle.checked = !!STATE.teacherAutoSwitch;
        toggle.addEventListener('change', () => {
          STATE.teacherAutoSwitch = !!toggle.checked;
          try { localStorage.setItem('vcpTeacherAutoSwitch', STATE.teacherAutoSwitch ? '1' : '0'); } catch {}
        });
      }
    }

    // Mount Normal Chess UI
    try {
      const mount = document.getElementById('ncMount');
      if (mount && window.NormalChess?.mountNormalChess) {
        const sessionId = String(STATE.activeSession.id || '');
        const sendNc = (payload) => wsSend(payload);
        // If the page re-rendered, the mount node changes; ensure we remount to the current node.
        const mountChanged = STATE._ncMountEl && STATE._ncMountEl !== mount;
        if (mountChanged) {
          try { STATE.ncApp?.destroy?.(); } catch {}
          STATE.ncApp = null;
          STATE.ncSessionId = null;
        }
        STATE._ncMountEl = mount;

        // Create once per sessionId
        if (!STATE.ncApp || String(STATE.ncSessionId) !== sessionId) {
          STATE.ncSessionId = sessionId;
          STATE.ncApp = window.NormalChess.mountNormalChess({
            rootEl: mount,
            send: sendNc,
            getSession: () => STATE.activeSession,
            getIdentity: () => ({ role: STATE.role, id: STATE.me?.id || '' }),
            getPlayerLabelById: (id) => studentLabelById(id),
            sessionMoveList: true,
            getShell: () => ({ sidebarCollapsed: !!STATE.sidebarCollapsed })
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
    const mountChanged = STATE._historyMountEl && STATE._historyMountEl !== mount;
    if (mountChanged) {
      try { STATE.historyNcApp?.destroy?.(); } catch {}
      STATE.historyNcApp = null;
      STATE.historyNcKey = null;
    }
    STATE._historyMountEl = mount;

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
        getShell: () => ({ sidebarCollapsed: !!STATE.sidebarCollapsed }),
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

  function bindLiveViewerEvents() {
    if (STATE.page !== 'liveViewer') return;
    const mount = document.getElementById('ncLiveMount');
    if (!mount) return;
    const session = STATE.liveViewer?.session || null;
    if (!session || !session.chessState) return;
    if (!window.NormalChess?.mountNormalChess) return;

    const key = String(session.id || '');
    const mountChanged = STATE._liveMountEl && STATE._liveMountEl !== mount;
    if (mountChanged) {
      try { STATE.liveNcApp?.destroy?.(); } catch {}
      STATE.liveNcApp = null;
      STATE.liveNcKey = null;
    }
    STATE._liveMountEl = mount;

    if (!STATE.liveNcApp || String(STATE.liveNcKey) !== key) {
      try { STATE.liveNcApp?.destroy?.(); } catch {}
      STATE.liveNcKey = key;
      const sendNoop = () => {};
      const cfg = session?.config || {};
      const whiteId = String(cfg.whiteStudentId || '');
      const blackId = String(cfg.blackStudentId || '');
      const whiteName = String(session.whiteName || 'White');
      const blackName = String(session.blackName || 'Black');
      STATE.liveNcApp = window.NormalChess.mountNormalChess({
        rootEl: mount,
        send: sendNoop,
        getSession: () => session,
        // Spectator mode: never allow moves
        getIdentity: () => ({ role: 'spectator', id: String(STATE.me?.id || '') }),
        getPlayerLabelById: (id) => {
          const sid = String(id || '');
          if (sid && sid === whiteId) return whiteName;
          if (sid && sid === blackId) return blackName;
          return '';
        },
        sessionMoveList: true,
        spectator: true,
        getShell: () => ({ sidebarCollapsed: !!STATE.sidebarCollapsed })
      });
    }
    try { STATE.liveNcApp?.applyState?.(session.chessState); } catch {}
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
    const id1 = String(ids[0] || '');
    const id2 = String(ids[1] || '');
    const label1 = studentLabelById(id1) || 'Player A';
    const label2 = studentLabelById(id2) || 'Player B';
    const whiteId = String(STATE.chooseMode?.whiteStudentId || id1);
    const blackId = whiteId === id1 ? id2 : id1;
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
                <option value="${escapeHtml(id1)}" ${whiteId === id1 ? 'selected' : ''}>${escapeHtml(label1)}</option>
                <option value="${escapeHtml(id2)}" ${whiteId === id2 ? 'selected' : ''}>${escapeHtml(label2)}</option>
              </select>
            </div>

            <div class="vcp-form-row">
              <label style="font-weight:900; color:#111827;">Black</label>
              <input class="vcp-input" type="text" readonly value="${escapeHtml((blackId === id1 ? label1 : label2) || '')}">
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
      const teacherId = String(STATE.me?.id || '');
      const hasTeacher = teacherId && ids.includes(teacherId);
      vcpDebug('start invite', { ids, teacherId, hasTeacher, white, black, minutes, inc, page: STATE.page, activeSessionId: STATE.activeSession?.id || null });
      if (hasTeacher) {
        const studentId = String(ids.find(x => String(x) !== teacherId) || '');
        if (!studentId) return;
        wsSend({
          type: 'vcp_invite_teacher_match',
          mode: 'chess',
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
      }
      // Reset selection after sending invite so it won't block future multi-game starts.
      STATE.selected = new Set();
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
