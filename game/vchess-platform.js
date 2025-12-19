// V.Chess Platform (skeleton)
// Teacher: create/invite matches (coming soon)
// Student: wait for invites (coming soon)

(function () {
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

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderTeacher() {
    const root = getRoot();
    if (!root) return;

    let preselected = [];
    try {
      preselected = safeJsonParse(localStorage.getItem('vChessPlatformSelectedStudentIds')) || [];
    } catch {}

    root.innerHTML = `
      <div class="vcp-card">
        <div class="vcp-row">
          <div>
            <div class="vcp-title">🌐 V.Chess Platform</div>
            <div class="vcp-subtitle">Teacher Lobby</div>
          </div>
          <div class="vcp-badge">Role: Teacher</div>
        </div>

        <div class="vcp-section">
          <div style="font-weight:900; color:#111827; margin-bottom:6px;">What’s next</div>
          <div class="vcp-muted">
            This is a placeholder screen. Next we’ll add: invite students, create rooms, and start mini games/chess matches.
          </div>
          <div class="vcp-list">
            <div class="vcp-list-item">
              <div style="font-weight:900; color:#111827;">Selected students (from Game Zone)</div>
              <div class="vcp-muted" style="margin-top:6px;">
                ${Array.isArray(preselected) && preselected.length > 0 ? escapeHtml(preselected.join(', ')) : 'None selected.'}
              </div>
            </div>
            <div class="vcp-list-item">
              <div style="font-weight:900; color:#111827;">Invite flow (planned)</div>
              <div class="vcp-muted" style="margin-top:6px;">
                Choose 2+ students → choose game type → send invite → students join when ready.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderStudent() {
    const root = getRoot();
    if (!root) return;
    const player = getStudentPlayer();

    root.innerHTML = `
      <div class="vcp-card">
        <div class="vcp-row">
          <div>
            <div class="vcp-title">🌐 V.Chess Platform</div>
            <div class="vcp-subtitle">Student Lobby</div>
          </div>
          <div class="vcp-badge">Role: Student</div>
        </div>

        <div class="vcp-section">
          <div style="font-weight:900; color:#111827; margin-bottom:6px;">You are signed in as</div>
          <div class="vcp-muted">
            <strong>${escapeHtml(player?.name || 'Student')}</strong>
            ${player?.studentId ? ` (Student ID: ${escapeHtml(player.studentId)})` : ''}
          </div>
        </div>

        <div class="vcp-section">
          <div style="font-weight:900; color:#111827; margin-bottom:6px;">Waiting for invites…</div>
          <div class="vcp-muted">
            This is a placeholder screen. Next we’ll add realtime invites from your teacher/classmates.
          </div>
          <div class="vcp-list">
            <div class="vcp-list-item">
              <div style="font-weight:900; color:#111827;">Incoming invites</div>
              <div class="vcp-muted" style="margin-top:6px;">No invites yet.</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function init() {
    const role = getRole();
    if (role === 'teacher') renderTeacher();
    else renderStudent();
  }

  window.initVChessPlatform = init;
})();


