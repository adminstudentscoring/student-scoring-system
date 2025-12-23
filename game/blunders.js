// Blunders (stub)
// This file is intentionally small. We'll expand it later.

(function () {
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getPlayers() {
    const fromWindow = Array.isArray(window.blundersPlayers) ? window.blundersPlayers : null;
    if (fromWindow && fromWindow.length) return fromWindow;
    try {
      const raw = localStorage.getItem('blundersPlayers');
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function initBlunders() {
    const root = document.getElementById('blundersRoot');
    if (!root) return;

    const players = getPlayers();
    const title = players.length ? `Player: ${players[0]?.name || 'Student'}` : 'No player selected';

    root.innerHTML = `
      <div class="blunders-card">
        <div class="blunders-title">💥 Blunders</div>
        <div class="blunders-muted">${escapeHtml(title)}</div>
        <div class="blunders-muted" style="margin-top:8px;">Stub created. Ready for development.</div>
        <button id="blundersStartBtn" class="btn btn-primary" type="button" style="margin-top:12px; width: 100%;">Start</button>
      </div>
    `;

    document.getElementById('blundersStartBtn')?.addEventListener('click', () => {
      // placeholder for future gameplay
      try { console.log('[Blunders] start clicked', { players }); } catch {}
    });
  }

  window.initBlunders = initBlunders;
})();


