/* No Blunder - game stub
   Keep all game logic in this file (and its CSS) as requested. */

(function () {
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
  }

  function loadPlayers() {
    try {
      const raw = localStorage.getItem('noBlunderPlayers');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function render() {
    const root = document.getElementById('noBlunderRoot');
    if (!root) return;

    const players = loadPlayers();

    root.innerHTML = `
      <div class="no-blunder-root">
        <div class="no-blunder-card">
          <div class="no-blunder-title">
            <div>
              <h2>🛡️ No Blunder</h2>
              <p class="no-blunder-subtitle">Game stub. Next step: define rules, rounds, and scoring.</p>
            </div>
            <div style="color:#6b7280; font-weight:700;">
              ${players.length} player(s)
            </div>
          </div>

          <div class="no-blunder-actions">
            <button class="btn btn-primary" type="button" onclick="window.noBlunderStart()">Start</button>
            <button class="btn btn-secondary" type="button" onclick="window.noBlunderReset()">Reset</button>
          </div>

          <div class="no-blunder-players">
            ${
              players.length
                ? players
                    .map(
                      (p) => `
                        <div class="no-blunder-player">
                          <div class="name">${escapeHtml(p.name || 'Unknown')}</div>
                          <div class="id">${escapeHtml(p.studentId || '')}</div>
                        </div>
                      `
                    )
                    .join('')
                : `<div style="color:#6b7280;">No players loaded. Open from Teacher → App or the application window.</div>`
            }
          </div>
        </div>
      </div>
    `;
  }

  window.noBlunderStart = function () {
    // Stub: game loop will be implemented later.
    alert('No Blunder: Start (stub).');
  };

  window.noBlunderReset = function () {
    // Stub: reset runtime state; keep selected players in localStorage.
    alert('No Blunder: Reset (stub).');
  };

  window.initNoBlunder = function () {
    render();
  };
})();


