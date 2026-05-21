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
      // Load teacher preferences
      if (STATE.role === 'teacher') {
        try { STATE.teacherAutoSwitch = localStorage.getItem('vcpTeacherAutoSwitch') === '1'; } catch {}
      }
      wsSend({ type: 'vcp_get_presence' });
      wsSend({ type: 'vcp_get_live_games' });
      if (STATE.role === 'teacher' && STATE.me?.id) {
        wsSend({ type: 'vcp_get_game_history', targetUserId: String(STATE.me.id), page: 1 });
      }
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
      if (STATE.page === 'liveViewer') {
        STATE.liveViewer = { loading: false, error: details, sessionId: String(STATE.liveViewer?.sessionId || ''), session: STATE.liveViewer?.session || null };
      }
      render();
      return;
    }
    if (type === 'vcp_presence_snapshot') {
      STATE.students = Array.isArray(msg?.students) ? msg.students : [];
      if (STATE.role === 'teacher') {
        // Ensure selected IDs still exist
        const ids = new Set(STATE.students.map(s => String(s.id)));
        const teacherId = String(STATE.me?.id || '');
        STATE.selected = new Set(Array.from(STATE.selected).filter((id) => {
          const sid = String(id);
          if (teacherId && sid === teacherId) return true; // keep teacher selection stable
          return ids.has(sid);
        }));
        vcpDebug('presence snapshot', { students: STATE.students.length, selected: Array.from(STATE.selected) });
      }
      render();
      return;
    }
    if (type === 'vcp_game_history') {
      const targetUserId = String(msg?.targetUserId || '');
      const payload = {
        loading: false,
        error: null,
        page: Number(msg?.page || 1) || 1,
        totalPages: Number(msg?.totalPages || 1) || 1,
        totalItems: Number(msg?.totalItems || 0) || 0,
        games: Array.isArray(msg?.games) ? msg.games : []
      };
      if (targetUserId && targetUserId === String(STATE.profileTargetId || '')) {
        STATE.profileHistory = payload;
      }
      // Always keep teacher's own recent history for the session tabs bar
      if (STATE.role === 'teacher' && targetUserId && targetUserId === String(STATE.me?.id || '')) {
        STATE.teacherGameHistory = payload;
      }
      // Avoid remounting the active board; patch only where possible.
      if (STATE.page === 'session' && STATE.role === 'teacher') {
        try {
          const bar = document.querySelector('.vcp-session-bar');
          if (bar) {
            bar.outerHTML = renderTeacherSessionBar();
            const toggle = document.getElementById('vcpAutoSwitchToggle');
            if (toggle) {
              toggle.checked = !!STATE.teacherAutoSwitch;
              toggle.addEventListener('change', () => {
                STATE.teacherAutoSwitch = !!toggle.checked;
                try { localStorage.setItem('vcpTeacherAutoSwitch', STATE.teacherAutoSwitch ? '1' : '0'); } catch {}
              });
            }
            return;
          }
        } catch {}
      }
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
      // If we're inside a session, refresh the teacher session tabs bar without remounting the board.
      if (STATE.page === 'session' && STATE.role === 'teacher') {
        try {
          const bar = document.querySelector('.vcp-session-bar');
          if (bar) {
            bar.outerHTML = renderTeacherSessionBar();
            const toggle = document.getElementById('vcpAutoSwitchToggle');
            if (toggle) {
              toggle.checked = !!STATE.teacherAutoSwitch;
              toggle.addEventListener('change', () => {
                STATE.teacherAutoSwitch = !!toggle.checked;
                try { localStorage.setItem('vcpTeacherAutoSwitch', STATE.teacherAutoSwitch ? '1' : '0'); } catch {}
              });
            }
          }
        } catch {}
      }
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
      const incoming = msg.session || null;
      if (STATE.role === 'student') {
        STATE.activeSession = incoming;
        STATE.status = 'in-game';
        STATE.page = 'session';
        render();
        return;
      }
      if (STATE.role === 'teacher') {
        // Do NOT interrupt current view if the teacher is already playing another game.
        STATE.pendingInvite = null;
        // Clear leftover selection to avoid "Start does nothing" due to stale third selection.
        STATE.selected = new Set();
        setTeacherMessage('Session started.', 'success');
        wsSend({ type: 'vcp_get_live_games' });
        if (!STATE.activeSession || STATE.page !== 'session') {
          STATE.activeSession = incoming;
          STATE.page = 'session';
          render();
        } else {
          // Stay on current session; session bar will update from live games snapshot.
          render();
        }
        return;
      }
      // fallback
      STATE.activeSession = incoming;
      STATE.page = 'session';
      render();
      return;
    }
    if (type === 'vcp_session_snapshot') {
      const sid = String(msg?.sessionId || (msg?.session?.id) || '');
      const session = msg?.session || null;
      if (STATE.page === 'liveViewer' && sid && sid === String(STATE.liveViewer?.sessionId || '')) {
        STATE.liveViewer = { loading: false, error: null, sessionId: sid, session };
        render();
      }
      return;
    }
    if (type === 'vcp_chess_sync') {
      const sid = String(msg?.sessionId || '');
      const st = msg?.state || null;
      if (st && typeof st === 'object') {
        if (STATE.activeSession && String(STATE.activeSession.id) === sid) {
          STATE.activeSession.chessState = st;
          try { STATE.ncApp?.applyState?.(st); } catch {}
        }
        if (STATE.page === 'liveViewer' && sid && sid === String(STATE.liveViewer?.sessionId || '') && STATE.liveViewer?.session) {
          STATE.liveViewer.session.chessState = st;
          try { STATE.liveNcApp?.applyState?.(st); } catch {}
        }
        // Keep liveGames state fresh enough for auto-switch decisions.
        updateLiveGameStateFromSync(sid, st);
      }
      // Auto switch should happen as soon as a student moves (i.e., a sync makes a game teacher-to-move),
      // unless the currently viewed game is already teacher-to-move.
      try { autoSwitchOnSyncIfNeeded(); } catch {}
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
    if (STATE.page === 'liveViewer') {
      renderLiveViewerPage();
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
    if (STATE.page === 'settings') {
      renderSettingsPage();
      return;
    }
    if (STATE.role === 'teacher') renderTeacher();
    else renderStudent();
  }

  function init() {
    STATE.role = getRole();
    STATE.page = 'lobby';
    STATE.settingsTab = 'board';
    STATE.profileTargetId = null;
    STATE.profileHistory = { loading: false, error: null, page: 1, totalPages: 1, totalItems: 0, games: [] };
    STATE.historyGame = { loading: false, error: null, gameId: null, game: null };
    STATE.liveViewer = { loading: false, error: null, sessionId: null, session: null };
    try {
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      STATE.onlineListOpen = !coarse;
    } catch {
      STATE.onlineListOpen = true;
    }
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
    applyBoardColors();
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



