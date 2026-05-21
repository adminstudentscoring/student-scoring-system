    STATE.liveNcApp = null;
    STATE.liveNcKey = null;
    STATE.liveViewer = { loading: false, error: null, sessionId: null, session: null };
    STATE.page = 'lobby';
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
      : (target.studentId ? `chess.com ID: ${target.studentId}` : (target.id ? `ID: ${target.id}` : ''));

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
      <div class="vcp-app ${STATE.sidebarCollapsed ? 'is-sidebar-collapsed' : ''}">
        ${renderFixedSidebar()}
        <div class="vcp-app-main">
          <div class="vcp-main-inner">
            <div class="vcp-card">
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
            ${STATE.role === 'teacher' ? renderTeacherChooseModeModal() : ''}
          </div>
        </div>
      </div>
    `;

    document.getElementById('vcpProfileBackBtn')?.addEventListener('click', closeProfile);
    bindFixedSidebarEvents();
    if (STATE.role === 'teacher') bindTeacherModalEvents();
  }

  function renderOnlineListItem(s, { selectable }) {
    const safeId = escapeHtml(String(s?.id || ''));
    const safeName = escapeHtml(String(s?.name || 'Unknown'));
    const safeStudentId = escapeHtml(String(s?.chessComId || s?.studentId || ''));
    const rawStatus = String(s?.status || 'online');
    const safeStatus = escapeHtml(rawStatus);
    const dotCls = rawStatus === 'in-game' ? 'in-game' : (rawStatus === 'idle' ? 'idle' : 'online');

    if (selectable) {
      const checked = STATE.selected.has(String(s?.id)) ? 'checked' : '';
      const disabled = String(s?.status) === 'in-game' ? 'disabled' : '';
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

    root.innerHTML = `
      <div class="vcp-app ${STATE.sidebarCollapsed ? 'is-sidebar-collapsed' : ''}">
        ${renderFixedSidebar()}
        <div class="vcp-app-main">
          <div class="vcp-main-inner">
            <div class="vcp-me-row">
              <div class="vcp-card vcp-me-card">
                <button class="vcp-badge vcp-badge-btn" type="button" data-vcp-profile-id="${escapeHtml(String(STATE.me?.id || ''))}">
                  ${renderHeaderBadge()}
                </button>
              </div>
            </div>

            <div class="vcp-card">
              ${STATE.lastError ? `<div class="vcp-muted" style="margin-top:0; color:#b91c1c;"><strong>Error:</strong> ${escapeHtml(STATE.lastError)}</div>` : ''}

              <div class="vcp-section">
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

    document.getElementById('vcpDismissInviteBtn')?.addEventListener('click', () => {
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
      if (STATE.role !== 'student') return '';
      const items = Array.isArray(STATE.invites) ? STATE.invites : [];
      const invites = items.map((x) => (x && typeof x === 'object' && x.invite ? x.invite : x)).filter(Boolean);
      if (!invites.length) return '';
      const myId = String(STATE.me?.id || '');
      return `
        <div class="vcp-invites-inline" style="margin: 8px 0 10px;">
          ${invites.map((inv) => {
            const cfg = inv?.config || {};
            const teacherName = String(inv?.teacher?.name || 'Teacher');
            const minutes = String(cfg.minutes || 3);
            const inc = String(cfg.incrementSec || 0);
            const myColor = String(cfg.whiteStudentId) === myId ? 'White' : (String(cfg.blackStudentId) === myId ? 'Black' : '');
            const inviteId = String(inv?.id || '');
            return `
              <div class="vcp-list-item vcp-invite-card" data-vcp-invite-id="${escapeHtml(inviteId)}" style="border-style:solid;">
                <div style="font-weight:950; color:#111827;">${escapeHtml(teacherName)} invited you</div>
                <div class="vcp-muted" style="margin-top:6px;">
                  Normal Chess · ${escapeHtml(minutes)} min + ${escapeHtml(inc)} sec
                  ${myColor ? ` · You are <strong>${escapeHtml(myColor)}</strong>` : ''}
                </div>
                <div class="vcp-btn-row" style="justify-content:flex-end; margin-top:10px;">
                  <button class="btn btn-secondary" type="button" data-vcp-invite-decline="${escapeHtml(inviteId)}">Decline</button>
                  <button class="btn btn-primary" type="button" data-vcp-invite-accept="${escapeHtml(inviteId)}">Accept</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    root.innerHTML = `
      <div class="vcp-app ${STATE.sidebarCollapsed ? 'is-sidebar-collapsed' : ''}">
        ${renderFixedSidebar()}
        <div class="vcp-app-main">
          <div class="vcp-main-inner">
            <div class="vcp-me-row">
              <div class="vcp-card vcp-me-card">
                <button class="vcp-badge vcp-badge-btn" type="button" data-vcp-profile-id="${escapeHtml(String(STATE.me?.id || ''))}">
                  ${renderHeaderBadge()}
                </button>
              </div>
            </div>

            <div class="vcp-card">
              ${STATE.lastError ? `<div class="vcp-muted" style="margin-top:0; color:#b91c1c;"><strong>Error:</strong> ${escapeHtml(STATE.lastError)}</div>` : ''}

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

    // Inline invites: Accept/Decline directly from "My game" area
    const removeInviteById = (inviteId) => {
      const id = String(inviteId || '');
      if (!id) return;
      STATE.invites = (Array.isArray(STATE.invites) ? STATE.invites : []).filter((x) => String((x && x.invite ? x.invite.id : x?.id) || '') !== id);
    };

    root.querySelectorAll('[data-vcp-invite-decline]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-vcp-invite-decline') || '';
        wsSend({ type: 'vcp_invite_respond', inviteId: id, response: 'decline' });
        removeInviteById(id);
        render();
      });
    });

    root.querySelectorAll('[data-vcp-invite-accept]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-vcp-invite-accept') || '';
        wsSend({ type: 'vcp_invite_respond', inviteId: id, response: 'accept' });
        removeInviteById(id);
        // Server will start the session after both students accepted.
        render();
      });
    });
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
      <div class="vcp-app ${STATE.sidebarCollapsed ? 'is-sidebar-collapsed' : ''}">
        ${renderFixedSidebar()}
        <div class="vcp-app-main">
          <div class="vcp-main-inner">
            <div class="vcp-card">
