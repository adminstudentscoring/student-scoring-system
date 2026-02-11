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

  function getGeneralSettings() {
    const base = { jewelAlpha: 0.22, appBg: '#060912' };
    try {
      const raw = localStorage.getItem('chessPalGeneralSettings');
      if (!raw) return base;
      const v = JSON.parse(raw);
      const jewelAlpha = Number(v?.jewelAlpha);
      const appBg = String(v?.appBg || '').trim();
      return {
        jewelAlpha: Number.isFinite(jewelAlpha) ? Math.max(0.08, Math.min(0.45, jewelAlpha)) : base.jewelAlpha,
        appBg: /^#([0-9a-fA-F]{6})$/.test(appBg) ? appBg : base.appBg
      };
    } catch {
      return base;
    }
  }

  function applyGeneralSettings(s) {
    try {
      const root = document.documentElement;
      if (!root) return;
      root.style.setProperty('--cp-jewel-alpha', String(s?.jewelAlpha ?? 0.22));
      root.style.setProperty('--cp-app-bg', String(s?.appBg ?? '#060912'));
    } catch {}
  }

  function saveGeneralSettings(s) {
    try { localStorage.setItem('chessPalGeneralSettings', JSON.stringify(s)); } catch {}
  }

  // Apply once on load (so it affects all pages)
  applyGeneralSettings(getGeneralSettings());

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

  function ModePage() {}
  ModePage.title = 'Mode';
  ModePage.render = () => {
    return `
      <div class="cp-page-card">
        <div class="cp-h1">Mode</div>
        <div class="cp-muted">Choose your mode.</div>

        <div class="cp-mode-grid" style="margin-top:12px;">
          <button class="cp-mode" type="button" data-cp-mode="story">
            <div class="cp-mode-title">Story Mode</div>
            <div class="cp-mode-desc">Preset story stages (UI first).</div>
          </button>
          <button class="cp-mode" type="button" data-cp-mode="challenge">
            <div class="cp-mode-title">Challenge Mode</div>
            <div class="cp-mode-desc">Hard puzzles & quests (UI first).</div>
          </button>
        </div>

        <div class="cp-mode-sub" id="cpModeSub" style="margin-top:12px;">
          <div class="cp-muted">Select a mode above.</div>
        </div>
      </div>
    `;
  };
  ModePage.init = () => {
    const sub = document.getElementById('cpModeSub');
    const setSub = (key) => {
      if (!sub) return;
      if (key === 'story') {
        sub.innerHTML = `
          <div class="cp-page-card" style="margin-top:10px;">
            <div class="cp-h1" style="font-size:16px;">Story Mode</div>
            <div class="cp-muted">Coming soon: chapters, dialogue, stage presets.</div>
          </div>
        `;
        return;
      }
      if (key === 'challenge') {
        sub.innerHTML = `
          <div class="cp-page-card" style="margin-top:10px;">
            <div class="cp-h1" style="font-size:16px;">Challenge Mode</div>
            <div class="cp-muted">Coming soon: daily challenges, ranked tasks.</div>
          </div>
        `;
        return;
      }
      sub.innerHTML = `<div class="cp-muted">Select a mode above.</div>`;
    };

    document.querySelectorAll('[data-cp-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = String(btn.getAttribute('data-cp-mode') || '');
        setSub(key);
      }, { passive: true });
    });
  };

  function PracticePage() {}
  PracticePage.title = 'Practice';
  PracticePage.render = () => {
    return `
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

  // ----------------------------
  // Hero database (001-005)
  // ----------------------------
  const HERO_DB = [
    {
      id: '001',
      name: 'Aurex',
      element: 'light',
      rarity: 5,
      level: 1,
      maxLevel: 99,
      hp: 320,
      atk: 145,
      rcv: 60,
      leaderSkill: 'Light heroes ATK ×1.6; heal +3% max HP each turn.',
      activeSkill: 'Radiant Guard (CD 7): reduce damage -25% this turn; convert 2 random tiles to Light.',
      img: 'images/Heros/001-Aurex/001-Aurex.png',
      mini: 'images/Heros/001-Aurex/001-Aurex-mini.png'
    },
    {
      id: '002',
      name: 'Nyxblade',
      element: 'dark',
      rarity: 5,
      level: 1,
      maxLevel: 99,
      hp: 280,
      atk: 175,
      rcv: 45,
      leaderSkill: 'Dark heroes ATK ×1.7; each cascade adds +10% ATK (cap +40%).',
      activeSkill: 'Shadow Cut (CD 6): Dark ATK ×1.3 this turn; convert 1 random tile to Dark.',
      img: 'images/Heros/002-Nyxblade/002-Nyxblade.png',
      mini: 'images/Heros/002-Nyxblade/002-Nyxblade-mini.png'
    },
    {
      id: '003',
      name: 'Rivenhart',
      element: 'water',
      rarity: 5,
      level: 1,
      maxLevel: 99,
      hp: 300,
      atk: 140,
      rcv: 75,
      leaderSkill: 'Water heroes RCV ×1.6; +1s action time each turn.',
      activeSkill: 'Tide Reset (CD 7): clear 1 negative effect after cascades (placeholder); convert 2 random tiles to Water.',
      img: 'images/Heros/003-Rivenhart/003-Rivenhart.png',
      mini: 'images/Heros/003-Rivenhart/003-Rivenhart-mini.png'
    },
    {
      id: '004',
      name: 'Seraphix',
      element: 'wood',
      rarity: 5,
      level: 1,
      maxLevel: 99,
      hp: 360,
      atk: 130,
      rcv: 55,
      leaderSkill: 'Wood heroes HP ×1.4; heal +5% max HP each turn.',
      activeSkill: 'Verdant Bloom (CD 8): convert 2 random tiles to Wood and 1 tile to Heart.',
      img: 'images/Heros/004-Seraphix/004-Seraphix.png',
      mini: 'images/Heros/004-Seraphix/004-Seraphix-mini.png'
    },
    {
      id: '005',
      name: 'Valkor',
      element: 'fire',
      rarity: 5,
      level: 1,
      maxLevel: 99,
      hp: 340,
      atk: 160,
      rcv: 35,
      leaderSkill: 'Fire heroes HP ×1.3 and ATK ×1.5.',
      activeSkill: 'Inferno Rally (CD 8): convert 3 random tiles to Fire; Fire ATK ×1.2 this turn.',
      img: 'images/Heros/005-Valkor/005-Valkor.png',
      mini: 'images/Heros/005-Valkor/005-Valkor-mini.png'
    }
  ];

  function elementLabel(el) {
    const e = String(el || '').toLowerCase();
    if (e === 'light') return 'Light';
    if (e === 'dark') return 'Dark';
    if (e === 'fire') return 'Fire';
    if (e === 'water') return 'Water';
    if (e === 'wood') return 'Wood';
    if (e === 'heart') return 'Heart';
    return e || '-';
  }

  function renderStars(n) {
    const k = Math.max(1, Math.min(8, Number(n) || 5));
    return '★'.repeat(k);
  }

  function showHeroModal(hero) {
    const h = hero || null;
    if (!h) return;

    // Remove existing
    const old = document.getElementById('cpHeroModalOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cpHeroModalOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Hero details">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-hero-modal-grid">
            <div class="cp-hero-modal-art">
              <img src="${esc(h.img)}" alt="${esc(h.name)}" />
            </div>
            <div class="cp-hero-modal-info">
              <div class="cp-hero-modal-title">
                <div class="cp-hero-id">#${esc(h.id)}</div>
                <div class="cp-hero-name">${esc(h.name)}</div>
              </div>
              <div class="cp-hero-meta">
                <span class="cp-chip">${esc(elementLabel(h.element))}</span>
                <span class="cp-chip">${esc(renderStars(h.rarity))}</span>
                <span class="cp-chip">Lv ${esc(h.level)} / ${esc(h.maxLevel)}</span>
              </div>
              <div class="cp-hero-stats">
                <div class="cp-stat"><b>HP</b> ${esc(h.hp)}</div>
                <div class="cp-stat"><b>ATK</b> ${esc(h.atk)}</div>
                <div class="cp-stat"><b>RCV</b> ${esc(h.rcv)}</div>
              </div>
              <div class="cp-hero-skill">
                <div class="cp-skill-title">Leader Skill</div>
                <div class="cp-skill-desc">${esc(h.leaderSkill)}</div>
              </div>
              <div class="cp-hero-skill">
                <div class="cp-skill-title">Active Skill</div>
                <div class="cp-skill-desc">${esc(h.activeSkill)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => {
      try { overlay.remove(); } catch {}
      try { window.removeEventListener('keydown', onKey); } catch {}
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') close();
    };

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) close();
    });
    const closeBtn = overlay.querySelector('.cp-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', close, { passive: true });
    window.addEventListener('keydown', onKey);
  }

  function PalPage() {}
  PalPage.title = 'Pal';
  PalPage.render = () => {
    return `
      <div class="cp-page-card">
        <div class="cp-h1">Pal</div>
        <div class="cp-muted">Build your collection.</div>

        <div class="cp-mode-grid" style="margin-top:12px;">
          <button class="cp-mode" type="button" data-cp-pal="hero">
            <div class="cp-mode-title">Hero</div>
            <div class="cp-mode-desc">Create / manage heroes (UI first).</div>
          </button>
          <button class="cp-mode" type="button" data-cp-pal="monster">
            <div class="cp-mode-title">Monster</div>
            <div class="cp-mode-desc">Create / manage monsters (UI first).</div>
          </button>
        </div>

        <div class="cp-mode-sub" id="cpPalSub" style="margin-top:12px;">
          <div class="cp-muted">Choose Hero or Monster.</div>
        </div>
      </div>
    `;
  };
  PalPage.init = () => {
    const sub = document.getElementById('cpPalSub');
    const setSub = (key) => {
      if (!sub) return;
      if (key === 'hero') {
        sub.innerHTML = `
          <div class="cp-hero-grid" role="list">
            ${HERO_DB.map(h => `
              <button class="cp-hero-card" type="button" data-hero-id="${esc(h.id)}" role="listitem">
                <div class="cp-hero-mini">
                  <img src="${esc(h.mini)}" alt="${esc(h.name)}">
                </div>
                <div class="cp-hero-mini-meta">
                  <div class="cp-hero-mini-name">${esc(h.name)}</div>
                  <div class="cp-hero-mini-sub">#${esc(h.id)} · ${esc(elementLabel(h.element))}</div>
                </div>
              </button>
            `).join('')}
          </div>
        `;
        // Bind clicks
        sub.querySelectorAll('[data-hero-id]').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = String(btn.getAttribute('data-hero-id') || '');
            const hero = HERO_DB.find(x => x.id === id);
            if (hero) showHeroModal(hero);
          });
        });
        return;
      }
      if (key === 'monster') {
        sub.innerHTML = `<div class="cp-muted">Monster UI coming next.</div>`;
        return;
      }
      sub.innerHTML = `<div class="cp-muted">Choose Hero or Monster.</div>`;
    };
    document.querySelectorAll('[data-cp-pal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = String(btn.getAttribute('data-cp-pal') || '');
        setSub(key);
      }, { passive: true });
    });
  };

  const TeamPage = PlaceholderPage('Team', 'Team builder coming next.');
  const StoragePage = PlaceholderPage('Storage', 'Inventory / saves will live here.');
  const ShopPage = PlaceholderPage('Shop', 'Shop will live here.');
  function SettingsPage() {}
  SettingsPage.title = 'Setting';
  SettingsPage.render = () => {
    const s = getGeneralSettings();
    return `
      <div class="cp-page-card">
        <div class="cp-h1">Setting</div>
        <div class="cp-muted">General Setting</div>

        <div class="cp-setting-grid" style="margin-top:12px;">
          <div class="cp-setting-item">
            <div class="cp-setting-label">寶石顏色光暗</div>
            <div class="cp-setting-help">調整寶石底色的亮暗（透明度）。</div>
            <input id="cpSettingJewelAlpha" type="range" min="0.08" max="0.45" step="0.01" value="${String(s.jewelAlpha)}">
            <div class="cp-setting-value"><span id="cpSettingJewelAlphaVal">${Math.round(s.jewelAlpha * 100)}%</span></div>
          </div>

          <div class="cp-setting-item">
            <div class="cp-setting-label">App 背景顏色</div>
            <div class="cp-setting-help">整個 Chess Pal 的背景底色。</div>
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <input id="cpSettingAppBg" type="color" value="${String(s.appBg)}" style="width:60px; height:44px; padding:0; border:0; background:transparent;">
              <div class="cp-setting-value"><span id="cpSettingAppBgVal">${esc(s.appBg)}</span></div>
            </div>
          </div>
        </div>
      </div>
    `;
  };
  SettingsPage.init = () => {
    const s0 = getGeneralSettings();
    const alpha = document.getElementById('cpSettingJewelAlpha');
    const alphaVal = document.getElementById('cpSettingJewelAlphaVal');
    const bg = document.getElementById('cpSettingAppBg');
    const bgVal = document.getElementById('cpSettingAppBgVal');

    if (alpha) {
      alpha.value = String(s0.jewelAlpha);
      alpha.addEventListener('input', () => {
        const next = getGeneralSettings();
        next.jewelAlpha = Math.max(0.08, Math.min(0.45, Number(alpha.value) || 0.22));
        applyGeneralSettings(next);
        saveGeneralSettings(next);
        if (alphaVal) alphaVal.textContent = `${Math.round(next.jewelAlpha * 100)}%`;
      }, { passive: true });
    }

    if (bg) {
      bg.value = String(s0.appBg);
      bg.addEventListener('input', () => {
        const next = getGeneralSettings();
        next.appBg = String(bg.value || '#060912');
        applyGeneralSettings(next);
        saveGeneralSettings(next);
        if (bgVal) bgVal.textContent = next.appBg;
      }, { passive: true });
    }
  };

  return {
    routes: {
      '/home': HomePage,
      '/mode': ModePage,
      '/practice': PracticePage,
      '/team': TeamPage,
      '/pal': PalPage,
      '/storage': StoragePage,
      '/shop': ShopPage,
      '/settings': SettingsPage,
    }
  };
})();

