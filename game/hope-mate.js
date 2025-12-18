// Hope Mate (stub)
// Single-player training mode will be implemented later.

(function () {
  function getRoot() {
    return document.getElementById('hopeMateRoot');
  }

  function safeJsonParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function render() {
    const root = getRoot();
    if (!root) return;

    const players = Array.isArray(window.hopeMatePlayers)
      ? window.hopeMatePlayers
      : safeJsonParse(localStorage.getItem('hopeMatePlayers')) || [];

    const playerLabel = players.length === 1 ? players[0].name : `${players.length} students`;

    root.innerHTML = `
      <div class="hope-mate-card">
        <h2 class="hope-mate-title">✨ Hope Mate</h2>
        <p class="hope-mate-subtitle">Stub version. Game rules and puzzles will be added next.</p>
        <div class="hope-mate-meta">
          <div><strong>Selected:</strong> ${escapeHtml(String(playerLabel || 'N/A'))}</div>
          <div><strong>Mode:</strong> Single-player (planned)</div>
        </div>
        <button id="hopeMateStartBtn" class="btn btn-primary" type="button">Start (placeholder)</button>
      </div>
    `;

    const btn = document.getElementById('hopeMateStartBtn');
    btn?.addEventListener('click', () => {
      alert('Hope Mate is not implemented yet. (Placeholder)');
    });
  }

  // Minimal HTML escaping (avoid accidental injection)
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.initHopeMate = function initHopeMate() {
    render();
  };
})();


