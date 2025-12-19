(function () {
  const STATE = {
    role: 'student', // 'teacher'|'student'
    ws: null,
    wsReady: false,
    me: { id: '', name: 'Unknown', studentId: '' },
    status: 'online', // student-only
    // Teacher view
    students: [], // [{id,name,studentId,status,inGame}]
    selected: new Set(),
    // Invites / sessions
    invites: [], // student-only: [{invite}]
    teacherMessages: [],
    activeSession: null // {id, mode, config, studentIds}
  };

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
      // Prefer dedicated VCP token for public Student Dashboard (avoids using leftover teacher tokens).
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

  function setTeacherMessage(text, kind = 'info') {
    const now = new Date().toLocaleTimeString();
    STATE.teacherMessages.unshift({ text: String(text), kind, at: now });
    STATE.teacherMessages = STATE.teacherMessages.slice(0, 6);
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
      // keep UI but show disconnected badge
      render();
    });
  }

  // Activity ping (idle after 3 minutes)
  let lastActivityPing = 0;
  function markActivity() {
    if (STATE.role !== 'student') return;
    if (!STATE.wsReady) return;
    const now = Date.now();
    if (now - lastActivityPing < 8000) return; // throttle
    lastActivityPing = now;
    wsSend({ type: 'vcp_activity' });
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
            <div class="vcp-subtitle">Teacher Lobby</div>
          </div>
          <div class="vcp-badge">Role: Teacher${STATE.wsReady ? '' : ' (disconnected)'}</div>
        </div>

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
                ${STATE.students.map((s) => {
                  const checked = STATE.selected.has(s.id) ? 'checked' : '';
                  const disabled = s.status === 'in-game' ? 'disabled' : '';
                  return `
                    <div class="vcp-online-item" role="listitem">
                      <div>
                        <input type="checkbox" data-student-id="${escapeHtml(s.id)}" ${checked} ${disabled} aria-label="Select ${escapeHtml(s.name || 'student')}" />
                      </div>
                      <div>
                        <div class="vcp-online-item-name">${escapeHtml(s.name || 'Unknown')}</div>
                        <div class="vcp-online-item-meta">
                          <div class="vcp-online-item-studentid">${escapeHtml(s.studentId || '')}</div>
                          <span class="vcp-status-pill ${escapeHtml(s.status)}">${escapeHtml(s.status)}</span>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
                ${STATE.students.length === 0 ? `
                  <div class="vcp-muted" style="margin-top:10px;">No students online.</div>
                ` : ''}
              </div>
            </div>

            <div class="vcp-main">
              <div style="font-weight:900; color:#111827; margin-bottom:6px;">Recent events</div>
              <div class="vcp-muted">
                ${STATE.teacherMessages.length ? STATE.teacherMessages.map(m => `${escapeHtml(m.at)} — ${escapeHtml(m.text)}`).join('<br>') : 'No events yet.'}
              </div>
            </div>
          </div>
        </div>
      </div>

      ${renderTeacherChooseModeModal()}
    `;

    document.getElementById('vcpRefreshBtn')?.addEventListener('click', () => {
      wsSend({ type: 'vcp_get_presence' });
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
            <div class="vcp-subtitle">Student Lobby</div>
          </div>
          <div class="vcp-badge">Role: Student${STATE.wsReady ? '' : ' (disconnected)'}</div>
        </div>

        <div class="vcp-section">
          <div style="font-weight:900; color:#111827; margin-bottom:6px;">You are signed in as</div>
          <div class="vcp-muted">
            <strong>${escapeHtml(player?.name || 'Student')}</strong>
            ${player?.studentId ? ` (Student ID: ${escapeHtml(player.studentId)})` : ''}
          </div>
        </div>

        <div class="vcp-section">
          <div class="vcp-row">
            <div>
              <div style="font-weight:900; color:#111827; margin-bottom:6px;">Waiting for invites…</div>
              <div class="vcp-muted">Your status: <span class="vcp-status-pill ${escapeHtml(STATE.status)}">${escapeHtml(STATE.status)}</span></div>
            </div>
            <div class="vcp-btn-row">
              <button id="vcpStudentRefreshBtn" class="btn btn-secondary" type="button">Refresh</button>
            </div>
          </div>
          <div class="vcp-muted">
            You will receive invites here in realtime.
          </div>
          <div class="vcp-list">
            <div class="vcp-list-item">
              <div style="font-weight:900; color:#111827;">Incoming invites</div>
              <div class="vcp-muted" style="margin-top:6px;">${STATE.invites.length ? `${STATE.invites.length} pending` : 'No invites yet.'}</div>
            </div>
          </div>
        </div>
      </div>

      ${renderStudentInviteModal()}
      ${renderSessionScreen()}
    `;

    document.getElementById('vcpStudentRefreshBtn')?.addEventListener('click', () => {
      // noop for now; server pushes invites and presence automatically
      markActivity();
    });

    bindStudentInviteModalEvents();
    bindSessionEvents();
  }

  function renderSessionScreen() {
    if (!STATE.activeSession) return '';
    const s = STATE.activeSession;
    if (String(s.mode) !== 'chess') return '';
    const cfg = s.config || {};
    return `
      <div class="vcp-modal-backdrop" id="vcpSessionBackdrop" role="presentation">
        <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Session">
          <div class="vcp-modal-header">
            <div class="vcp-modal-title">Session started</div>
            <button id="vcpLeaveSessionBtnX" class="vcp-modal-close" type="button" aria-label="Close">×</button>
          </div>
          <div class="vcp-modal-body">
            <div class="vcp-muted" style="margin-bottom:10px;">
              Normal Chess (placeholder). Game board will be implemented next.
            </div>
            <div class="vcp-list-item">
              <div style="font-weight:900; color:#111827;">Time control</div>
              <div class="vcp-muted" style="margin-top:6px;">
                ${escapeHtml(String(cfg.minutes || 3))} min + ${escapeHtml(String(cfg.incrementSec || 0))} sec increment
              </div>
            </div>
            <div class="vcp-btn-row" style="margin-top:12px;">
              <button id="vcpLeaveSessionBtn" class="btn btn-secondary" type="button">Leave</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindSessionEvents() {
    if (!STATE.activeSession) return;
    document.getElementById('vcpLeaveSessionBtn')?.addEventListener('click', leaveSession);
    document.getElementById('vcpLeaveSessionBtnX')?.addEventListener('click', leaveSession);
    document.getElementById('vcpSessionBackdrop')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'vcpSessionBackdrop') leaveSession();
    });
  }

  function leaveSession() {
    if (!STATE.activeSession) return;
    wsSend({ type: 'vcp_leave_session', sessionId: STATE.activeSession.id });
    STATE.activeSession = null;
    STATE.status = 'online';
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
      const minutes = Number(document.getElementById('vcpMinutes')?.value || 3) || 3;
      const inc = Number(document.getElementById('vcpInc')?.value || 0) || 0;
      const black = white === ids[0] ? ids[1] : ids[0];
      wsSend({
        type: 'vcp_invite_create',
        mode: 'chess',
        studentIds: ids,
        config: { minutes, incrementSec: inc, whiteStudentId: white, blackStudentId: black }
      });
      closeChooseModeModal();
      setTeacherMessage('Invite sent.', 'success');
    });
  }

  function renderStudentInviteModal() {
    const current = STATE.invites[0]?.invite || null;
    if (!current) return '';
    const cfg = current.config || {};
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
      STATE.status = 'in-game';
      render();
    });
  }

  function handleWsMessage(msg) {
    const type = String(msg?.type || '');
    if (type === 'vcp_ready') {
      STATE.wsReady = true;
      STATE.role = String(msg?.kind || STATE.role);
      STATE.me.name = String(msg?.name || STATE.me.name);
      if (STATE.role === 'student' && msg?.status) STATE.status = String(msg.status);
      render();
      return;
    }
    if (type === 'vcp_error') {
      console.error('VCP error:', msg?.error);
      setTeacherMessage(String(msg?.error || 'Error'), 'error');
      render();
      return;
    }
    if (type === 'vcp_presence_snapshot') {
      if (STATE.role === 'teacher') {
        STATE.students = Array.isArray(msg?.students) ? msg.students : [];
        // Ensure selected IDs still exist
        const ids = new Set(STATE.students.map(s => String(s.id)));
        STATE.selected = new Set(Array.from(STATE.selected).filter(id => ids.has(String(id))));
      }
      render();
      return;
    }
    if (type === 'vcp_invite') {
      if (STATE.role !== 'student') return;
      STATE.invites.push({ invite: msg.invite });
      render();
      return;
    }
    if (type === 'vcp_invite_update') {
      if (STATE.role === 'teacher') {
        setTeacherMessage(`Invite update: ${msg.studentId} ${msg.response}`, 'info');
        render();
      }
      return;
    }
    if (type === 'vcp_session_start') {
      STATE.activeSession = msg.session || null;
      if (STATE.role === 'student') STATE.status = 'in-game';
      if (STATE.role === 'teacher') setTeacherMessage('Session started.', 'success');
      render();
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
    if (STATE.role === 'teacher') renderTeacher();
    else renderStudent();
  }

  function init() {
    STATE.role = getRole();
    const studentPlayer = getStudentPlayer();
    if (studentPlayer && typeof studentPlayer === 'object') {
      STATE.me = {
        id: String(studentPlayer.id || ''),
        name: String(studentPlayer.name || 'Student'),
        studentId: String(studentPlayer.studentId || '')
      };
    }
    render();
    connectWs();
    bindActivityListeners();
  }

  window.initVChessPlatform = init;
})();


