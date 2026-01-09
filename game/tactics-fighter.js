// Tactics Fighter (student-first UI scaffold)
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

  function getUrlMode() {
    try {
      const params = new URLSearchParams(window.location.search);
      const m = String(params.get('mode') || '').trim();
      if (m) return m;
    } catch {}
    // fallback: hash
    const h = String(window.location.hash || '').replace('#', '').trim();
    return h || 'practice';
  }

  function setUrlMode(mode) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('mode', String(mode));
      window.history.replaceState(null, '', url.toString());
      return;
    } catch {}
    try {
      window.location.hash = String(mode);
    } catch {}
  }

  function normalizeMode(mode) {
    const m = String(mode || '').toLowerCase().trim();
    if (m === 'practice') return 'practice';
    if (m === 'challenge') return 'challenge';
    if (m === 'setting' || m === 'settings') return 'settings';
    return 'practice';
  }

  async function fetchConfig() {
    const resp = await fetch('/api/tactics-fighter/config', { method: 'GET' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Failed to load config');
    return data;
  }

  function renderShell({ role, players, mode }) {
    return `
      <div class="tactics-fighter-card">
        <div class="tactics-fighter-meta">
          <div><strong>Role:</strong> ${escapeHtml(role || 'unknown')}</div>
          <div><strong>Player:</strong> ${escapeHtml(players?.[0]?.name || 'Student')}</div>
        </div>

        <div class="tf-tabs" role="tablist" aria-label="Tactics Fighter modes">
          <button type="button" class="tf-tab ${mode === 'practice' ? 'is-active' : ''}" data-mode="practice">Practice Mode</button>
          <button type="button" class="tf-tab ${mode === 'challenge' ? 'is-active' : ''}" data-mode="challenge">Challenge Mode</button>
          <button type="button" class="tf-tab ${mode === 'settings' ? 'is-active' : ''}" data-mode="settings">Setting</button>
        </div>

        <div id="tfMain"></div>
      </div>
    `;
  }

  function renderPractice() {
    const levels = [
      { key: 'beginner', label: 'Beginner' },
      { key: '400up', label: '400 up' },
      { key: '700up', label: '700 up' },
      { key: '1000up', label: '1000 up' },
      { key: '1500up', label: '1500 up' },
      { key: '2000up', label: '2000 up' },
      { key: '2500up', label: '2500 up' },
      { key: '2800up', label: '2800 up' }
    ];

    return `
      <div>
        <div class="tf-section-title">Practice Mode</div>
        <div class="tf-practice-grid">
          ${levels.map(l => `<button class="btn btn-primary tf-practice-btn" type="button" data-practice="${escapeHtml(l.key)}">${escapeHtml(l.label)}</button>`).join('')}
        </div>
        <div id="tfOutput" style="margin-top:12px; color:#111827;"></div>
      </div>
    `;
  }

  function renderChallenge() {
    return `
      <div>
        <div class="tf-section-title">Challenge Mode</div>
        <div style="color:#6b7280;">Coming soon.</div>
      </div>
    `;
  }

  function renderSettings() {
    return `
      <div>
        <div class="tf-section-title">Setting</div>
        <div style="color:#6b7280;">Coming soon.</div>
      </div>
    `;
  }

  function renderMode(mode) {
    if (mode === 'challenge') return renderChallenge();
    if (mode === 'settings') return renderSettings();
    return renderPractice();
  }

  window.initTacticsFighter = async function initTacticsFighter() {
    const root = document.getElementById('tacticsFighterRoot');
    if (!root) return;

    const players = Array.isArray(window.tacticsFighterPlayers) ? window.tacticsFighterPlayers : [];
    const role = new URLSearchParams(window.location.search).get('role') || '';
    const mode = normalizeMode(getUrlMode());

    root.innerHTML = renderShell({ role, players, mode });

    const main = document.getElementById('tfMain');
    const setMain = (html) => { if (main) main.innerHTML = html; };
    const setOut = (html) => {
      const out = document.getElementById('tfOutput');
      if (out) out.innerHTML = html;
    };

    const loadConfigOnce = async () => {
      try {
        const cfg = await fetchConfig();
        return cfg;
      } catch {
        return null;
      }
    };
    const cfg = await loadConfigOnce();

    const activateMode = (m) => {
      const nm = normalizeMode(m);
      setUrlMode(nm);
      document.querySelectorAll('.tf-tab').forEach((b) => {
        const bm = String(b.getAttribute('data-mode') || '');
        b.classList.toggle('is-active', bm === nm);
      });
      setMain(renderMode(nm));
      if (cfg) {
        setOut(`<div style="color:#16a34a; font-weight:800;">API OK</div><div style="color:#6b7280; margin-top:4px;">${escapeHtml(cfg.version || '')}</div>`);
      } else {
        setOut(`<div style="color:#6b7280;">API not ready (ok for now).</div>`);
      }
    };

    // Tab switching
    root.querySelectorAll('.tf-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = btn.getAttribute('data-mode');
        activateMode(m);
      });
    });

    // Practice button click (event delegation)
    root.addEventListener('click', (e) => {
      const t = e.target && e.target.closest ? e.target.closest('[data-practice]') : null;
      if (!t) return;
      const bucket = String(t.getAttribute('data-practice') || '');
      if (!bucket) return;
      try { localStorage.setItem('tacticsFighterPracticeBucket', bucket); } catch {}
      setOut(`<div style="font-weight:900;">Selected:</div><div>${escapeHtml(bucket)}</div>`);
    });

    // Initial render
    activateMode(mode);
  };
})();


