// Tactics Fighter (stub)
// UI text is English by design.

(function () {
  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function fetchConfig() {
    const resp = await fetch('/api/tactics-fighter/config', { method: 'GET' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Failed to load config');
    return data;
  }

  window.initTacticsFighter = async function initTacticsFighter() {
    const root = document.getElementById('tacticsFighterRoot');
    if (!root) return;

    const players = Array.isArray(window.tacticsFighterPlayers) ? window.tacticsFighterPlayers : [];
    const role = new URLSearchParams(window.location.search).get('role') || '';

    root.innerHTML = `
      <div class="tactics-fighter-card">
        <div class="tactics-fighter-meta">
          <div><strong>Status:</strong> Coming soon</div>
          <div><strong>Role:</strong> ${escapeHtml(role || 'unknown')}</div>
          <div><strong>Players:</strong> ${escapeHtml(players.map(p => p?.name || 'Student').join(', ') || '(none)')}</div>
        </div>
        <div class="tactics-fighter-actions">
          <button id="tfRefreshBtn" class="btn btn-secondary" type="button">Refresh</button>
          <button id="tfPingBtn" class="btn btn-primary" type="button">Ping API</button>
        </div>
        <div id="tfOutput" style="margin-top:12px; color:#111827;"></div>
      </div>
    `;

    const out = document.getElementById('tfOutput');
    const setOut = (html) => { if (out) out.innerHTML = html; };

    const refresh = async () => {
      try {
        const cfg = await fetchConfig();
        setOut(`<div style="color:#16a34a; font-weight:700;">API OK</div><pre style="white-space:pre-wrap; margin:8px 0 0;">${escapeHtml(JSON.stringify(cfg, null, 2))}</pre>`);
      } catch (e) {
        setOut(`<div style="color:#dc2626; font-weight:700;">API ERROR</div><div>${escapeHtml(e?.message || String(e))}</div>`);
      }
    };

    document.getElementById('tfRefreshBtn')?.addEventListener('click', refresh);
    document.getElementById('tfPingBtn')?.addEventListener('click', refresh);
    refresh();
  };
})();


