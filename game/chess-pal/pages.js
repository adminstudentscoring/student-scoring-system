// Page components for Chess Pal (iPad-first)

const ChessPalPages = (() => {
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getPreset() {
    try { return JSON.parse(localStorage.getItem('chessPalPreset') || 'null'); } catch {}
    return null;
  }

  function setPreset(preset) {
    try { localStorage.setItem('chessPalPreset', JSON.stringify(preset)); } catch {}
  }

  function HomePage() {}
  HomePage.title = 'Home';
  HomePage.render = () => {
    const preset = getPreset() || { key: 'standard', label: 'Standard', turnTimeMs: 20000 };
    return `
      <div class="cp-page-card">
        <div class="cp-h1">Home</div>
        <div class="cp-muted">Pick a preset. Practice mode uses it automatically.</div>

        <div class="cp-preset-grid" role="list">
          ${[
            { key: 'relaxed', label: 'Relaxed', desc: 'More time per turn.', turnTimeMs: 30000 },
            { key: 'standard', label: 'Standard', desc: 'Default timer.', turnTimeMs: 20000 },
            { key: 'speed', label: 'Speed', desc: 'Fast hands.', turnTimeMs: 12000 },
          ].map(p => `
            <button class="cp-preset ${p.key === preset.key ? 'is-active' : ''}" type="button" data-cp-preset="${esc(p.key)}">
              <div class="cp-preset-title">${esc(p.label)}</div>
              <div class="cp-preset-desc">${esc(p.desc)}</div>
              <div class="cp-preset-meta">Turn: ${(p.turnTimeMs/1000).toFixed(0)}s · Board: 6×6</div>
            </button>
          `).join('')}
        </div>

        <div class="cp-row">
          <button class="cp-primary" type="button" data-cp-go="/practice">Go Practice</button>
          <div class="cp-muted">Current: <b>${esc(preset.label)}</b></div>
        </div>
      </div>
    `;
  };
  HomePage.init = () => {
    document.querySelectorAll('[data-cp-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = String(btn.getAttribute('data-cp-preset') || 'standard');
        const map = {
          relaxed: { key: 'relaxed', label: 'Relaxed', turnTimeMs: 30000 },
          standard: { key: 'standard', label: 'Standard', turnTimeMs: 20000 },
          speed: { key: 'speed', label: 'Speed', turnTimeMs: 12000 },
        };
        setPreset(map[key] || map.standard);
        try { Router.renderCurrent(); } catch {}
      }, { passive: true });
    });
    const goBtn = document.querySelector('[data-cp-go="/practice"]');
    if (goBtn) goBtn.addEventListener('click', () => Router.goTo('/practice'), { passive: true });
  };

  function PracticePage() {}
  PracticePage.title = 'Practice';
  PracticePage.render = () => {
    return `
      <div class="cp-page-card">
        <div class="cp-h1">Practice</div>
        <div class="cp-muted">Tap a jewel to set the knight start. Then press Start Turn.</div>
      </div>
      <div id="chessPalGame" class="puzzle-monster-root"></div>
    `;
  };
  PracticePage.init = () => {
    // Ensure any old timers are cleared first
    try { window.ChessPal?.destroy?.(); } catch {}
    try { window.initChessPal?.(); } catch {}
  };
  PracticePage.destroy = () => {
    try { window.ChessPal?.destroy?.(); } catch {}
  };

  function PlaceholderPage(title, desc) {
    return {
      title,
      render: () => `
        <div class="cp-page-card">
          <div class="cp-h1">${esc(title)}</div>
          <div class="cp-muted">${esc(desc)}</div>
        </div>
      `,
      init: () => {}
    };
  }

  const PalPage = PlaceholderPage('Pal', 'Your companion system will live here.');
  const StoragePage = PlaceholderPage('Storage', 'Inventory / saves will live here.');
  const ShopPage = PlaceholderPage('Shop', 'Shop will live here.');
  const SettingsPage = PlaceholderPage('Setting', 'Settings will live here.');

  return {
    routes: {
      '/home': HomePage,
      '/practice': PracticePage,
      '/pal': PalPage,
      '/storage': StoragePage,
      '/shop': ShopPage,
      '/settings': SettingsPage,
    }
  };
})();

