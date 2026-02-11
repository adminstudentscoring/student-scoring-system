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
    const base = { jewelAlpha: 0.22, appBg: '#060912', jewelSet: 'set_a' };
    try {
      const raw = localStorage.getItem('chessPalGeneralSettings');
      if (!raw) return base;
      const v = JSON.parse(raw);
      const jewelAlpha = Number(v?.jewelAlpha);
      const appBg = String(v?.appBg || '').trim();
      const jewelSetRaw = String(v?.jewelSet || '').trim().toLowerCase();
      const jewelSet = (jewelSetRaw === 'set_a' || jewelSetRaw === 'none') ? jewelSetRaw : base.jewelSet;
      return {
        jewelAlpha: Number.isFinite(jewelAlpha) ? Math.max(0.08, Math.min(0.45, jewelAlpha)) : base.jewelAlpha,
        appBg: /^#([0-9a-fA-F]{6})$/.test(appBg) ? appBg : base.appBg,
        jewelSet
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
      const nextSet = String(s?.jewelSet || 'set_a').trim().toLowerCase();
      root.setAttribute('data-cp-jewel-set', (nextSet === 'none' || nextSet === 'set_a') ? nextSet : 'set_a');
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
  let heroOverrides = {};
  let heroOverridesLoaded = false;
  let heroOverridesLoading = null;

  function isAdminMode() {
    try {
      const role = new URLSearchParams(window.location.search || '').get('role');
      if (String(role) !== 'admin') return false;
      // Best-effort: require admin token when in admin mode
      if (window.authUtils && typeof window.authUtils.hasRole === 'function') {
        return !!window.authUtils.hasRole('admin');
      }
      return true;
    } catch {
      return false;
    }
  }

  async function loadHeroOverrides() {
    if (heroOverridesLoaded) return heroOverrides;
    if (heroOverridesLoading) return heroOverridesLoading;
    heroOverridesLoading = (async () => {
      try {
        const resp = await fetch('/api/chess-pal/heroes', { method: 'GET' });
        if (!resp.ok) throw new Error('Failed to load hero overrides');
        const data = await resp.json();
        const ov = data && data.overrides && typeof data.overrides === 'object' ? data.overrides : {};
        heroOverrides = ov;
      } catch {
        heroOverrides = heroOverrides || {};
      } finally {
        heroOverridesLoaded = true;
      }
      return heroOverrides;
    })();
    return heroOverridesLoading;
  }

  async function saveHeroOverridesToServer() {
    if (!isAdminMode()) throw new Error('Not in admin mode');
    if (!window.authUtils || typeof window.authUtils.authenticatedFetch !== 'function') {
      throw new Error('authUtils not available');
    }
    const resp = await window.authUtils.authenticatedFetch('/admin/chess-pal/heroes', {
      method: 'PUT',
      body: JSON.stringify({ overrides: heroOverrides })
    });
    if (!resp) throw new Error('Not authenticated');
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(t || 'Failed to save');
    }
    const data = await resp.json().catch(() => ({}));
    if (data && data.overrides && typeof data.overrides === 'object') {
      heroOverrides = data.overrides;
    }
    return heroOverrides;
  }

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
      leaderSkill: {
        text: 'Light heroes ATK ×1.6; heal +3% max HP each turn.',
        params: { atkMult: 1.6, healMaxHpPctPerTurn: 0.03 }
      },
      activeSkill: {
        name: 'Radiant Guard',
        cd: 7,
        text: 'Reduce damage -25% this turn; convert 2 random tiles to Light.',
        params: { damageReduction: 0.25, convert: { count: 2, to: 'light' } }
      },
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
      leaderSkill: {
        text: 'Dark heroes ATK ×1.7; each cascade adds +10% ATK (cap +40%).',
        params: { atkMult: 1.7, cascadeAtkBonusPer: 0.10, cascadeAtkBonusCap: 0.40 }
      },
      activeSkill: {
        name: 'Shadow Cut',
        cd: 6,
        text: 'Dark ATK ×1.3 this turn; convert 1 random tile to Dark.',
        params: { atkMultThisTurn: 1.3, convert: { count: 1, to: 'dark' } }
      },
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
      leaderSkill: {
        text: 'Water heroes RCV ×1.6; +1s action time each turn.',
        params: { rcvMult: 1.6, extraTimeSec: 1 }
      },
      activeSkill: {
        name: 'Tide Reset',
        cd: 7,
        text: 'Clear 1 negative effect after cascades (placeholder); convert 2 random tiles to Water.',
        params: { clearNegativeCount: 1, convert: { count: 2, to: 'water' } }
      },
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
      leaderSkill: {
        text: 'Wood heroes HP ×1.4; heal +5% max HP each turn.',
        params: { hpMult: 1.4, healMaxHpPctPerTurn: 0.05 }
      },
      activeSkill: {
        name: 'Verdant Bloom',
        cd: 8,
        text: 'Convert 2 random tiles to Wood and 1 tile to Heart.',
        params: { convert: [{ count: 2, to: 'wood' }, { count: 1, to: 'heart' }] }
      },
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
      leaderSkill: {
        text: 'Fire heroes HP ×1.3 and ATK ×1.5.',
        params: { hpMult: 1.3, atkMult: 1.5 }
      },
      activeSkill: {
        name: 'Inferno Rally',
        cd: 8,
        text: 'Convert 3 random tiles to Fire; Fire ATK ×1.2 this turn.',
        params: { convert: { count: 3, to: 'fire' }, atkMultThisTurn: 1.2 }
      },
      img: 'images/Heros/005-Valkor/005-Valkor.png',
      mini: 'images/Heros/005-Valkor/005-Valkor-mini.png'
    }
  ];

  function getHeroById(id) {
    const key = String(id || '').trim();
    return HERO_DB.find(h => String(h.id) === key) || null;
  }

  function mergeHero(base) {
    const b = base || {};
    const o = (heroOverrides && b.id && heroOverrides[b.id]) ? heroOverrides[b.id] : {};
    const active = b.activeSkill && typeof b.activeSkill === 'object' ? b.activeSkill : { name: 'Skill', cd: 0, text: '', params: {} };
    const leader = b.leaderSkill && typeof b.leaderSkill === 'object' ? b.leaderSkill : { text: '', params: {} };
    return {
      ...b,
      hp: (o.hp != null) ? Number(o.hp) : b.hp,
      atk: (o.atk != null) ? Number(o.atk) : b.atk,
      rcv: (o.rcv != null) ? Number(o.rcv) : b.rcv,
      activeSkill: {
        ...active,
        cd: (o.activeCd != null) ? Number(o.activeCd) : active.cd,
        params: (o.activeParams && typeof o.activeParams === 'object') ? o.activeParams : active.params
      },
      leaderSkill: {
        ...leader,
        params: (o.leaderParams && typeof o.leaderParams === 'object') ? o.leaderParams : leader.params
      }
    };
  }

  function getAllHeroes() {
    return HERO_DB.map(h => mergeHero(h));
  }

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
    const admin = isAdminMode();

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
                <div class="cp-skill-head">
                  <div class="cp-skill-title">Leader Skill</div>
                </div>
                <div class="cp-skill-desc">${esc(h.leaderSkill?.text || '')}</div>
              </div>
              <div class="cp-hero-skill">
                <div class="cp-skill-head">
                  <div class="cp-skill-title">Active Skill · ${esc(h.activeSkill?.name || '')}</div>
                  <div class="cp-skill-cdchip">CD ${esc(h.activeSkill?.cd ?? 0)}</div>
                </div>
                <div class="cp-skill-desc">${esc(h.activeSkill?.text || '')}</div>
              </div>

              ${admin ? `
                <div class="cp-hero-skill cp-admin-box">
                  <div class="cp-skill-head">
                    <div class="cp-skill-title">Admin</div>
                    <button class="cp-tool-btn" type="button" id="cpOpenAdminEdit">Admin Edit</button>
                  </div>
                  <div class="cp-muted" style="margin-top:8px;">Edit HP/ATK/RCV, skill CD, and skill values.</div>
                </div>
              ` : ''}
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

    if (admin) {
      const openBtn = overlay.querySelector('#cpOpenAdminEdit');
      if (openBtn) {
        openBtn.addEventListener('click', () => {
          showHeroAdminEditModal(h.id);
        });
      }
    }
  }

  function showHeroAdminEditModal(heroId) {
    const base = getHeroById(heroId);
    if (!base) return;
    const merged = mergeHero(base);

    const old = document.getElementById('cpAdminEditOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cpAdminEditOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Admin edit hero">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-h1" style="font-size:18px;">Admin Edit · #${esc(merged.id)} ${esc(merged.name)}</div>
          <div class="cp-muted" style="margin-top:6px;">Changes are saved to server and apply to all users.</div>

          <div class="cp-admin-grid" style="margin-top:12px;">
            <label class="cp-admin-field">
              <span>HP</span>
              <input type="number" id="cpAdminHp" value="${esc(merged.hp)}" min="1" step="1">
            </label>
            <label class="cp-admin-field">
              <span>ATK</span>
              <input type="number" id="cpAdminAtk" value="${esc(merged.atk)}" min="1" step="1">
            </label>
            <label class="cp-admin-field">
              <span>RCV</span>
              <input type="number" id="cpAdminRcv" value="${esc(merged.rcv)}" min="0" step="1">
            </label>
            <label class="cp-admin-field">
              <span>Active Skill CD</span>
              <input type="number" id="cpAdminActiveCd" value="${esc(merged.activeSkill?.cd ?? 0)}" min="0" step="1">
            </label>
          </div>

          <div class="cp-admin-json">
            <div class="cp-admin-json-title">Leader Skill Values (JSON)</div>
            <textarea id="cpAdminLeaderParams" rows="7">${esc(JSON.stringify(merged.leaderSkill?.params ?? {}, null, 2))}</textarea>
          </div>
          <div class="cp-admin-json">
            <div class="cp-admin-json-title">Active Skill Values (JSON)</div>
            <textarea id="cpAdminActiveParams" rows="7">${esc(JSON.stringify(merged.activeSkill?.params ?? {}, null, 2))}</textarea>
          </div>

          <div class="cp-admin-actions">
            <button class="cp-primary" type="button" id="cpAdminSaveHero">Save</button>
          </div>
          <div class="cp-muted" id="cpAdminMsg" style="margin-top:10px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      try { overlay.remove(); } catch {}
      try { window.removeEventListener('keydown', onKey); } catch {}
    };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
    overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
    window.addEventListener('keydown', onKey);

    const msg = overlay.querySelector('#cpAdminMsg');
    const setMsg = (t) => { if (msg) msg.textContent = String(t || ''); };

    overlay.querySelector('#cpAdminSaveHero')?.addEventListener('click', async () => {
      try {
        setMsg('');
        const hp = Number(overlay.querySelector('#cpAdminHp')?.value);
        const atk = Number(overlay.querySelector('#cpAdminAtk')?.value);
        const rcv = Number(overlay.querySelector('#cpAdminRcv')?.value);
        const cd = Number(overlay.querySelector('#cpAdminActiveCd')?.value);
        const leaderRaw = String(overlay.querySelector('#cpAdminLeaderParams')?.value || '{}');
        const activeRaw = String(overlay.querySelector('#cpAdminActiveParams')?.value || '{}');
        const leaderParams = JSON.parse(leaderRaw || '{}');
        const activeParams = JSON.parse(activeRaw || '{}');

        if (!heroOverridesLoaded) await loadHeroOverrides();
        if (!heroOverrides[merged.id]) heroOverrides[merged.id] = {};
        heroOverrides[merged.id].hp = Number.isFinite(hp) ? Math.max(1, Math.floor(hp)) : merged.hp;
        heroOverrides[merged.id].atk = Number.isFinite(atk) ? Math.max(1, Math.floor(atk)) : merged.atk;
        heroOverrides[merged.id].rcv = Number.isFinite(rcv) ? Math.max(0, Math.floor(rcv)) : merged.rcv;
        heroOverrides[merged.id].activeCd = Number.isFinite(cd) ? Math.max(0, Math.floor(cd)) : (merged.activeSkill?.cd ?? 0);
        heroOverrides[merged.id].leaderParams = leaderParams;
        heroOverrides[merged.id].activeParams = activeParams;

        await saveHeroOverridesToServer();
        setMsg('Saved.');

        // Refresh the hero detail modal (reopen with merged values)
        const refreshed = mergeHero(getHeroById(merged.id));
        close();
        showHeroModal(refreshed);
      } catch (e) {
        setMsg(String(e?.message || e || 'Save failed'));
      }
    });
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
    const renderHeroGridInto = async () => {
      if (!sub) return;
      sub.innerHTML = `<div class="cp-muted">Loading heroes...</div>`;
      await loadHeroOverrides();
      const list = getAllHeroes();
      sub.innerHTML = `
        <div class="cp-hero-grid" role="list">
          ${list.map(h => `
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
          const hero = getAllHeroes().find(x => x.id === id);
          if (hero) showHeroModal(hero);
        });
      });
    };

    const setSub = (key) => {
      if (!sub) return;
      if (key === 'hero') {
        // Full-screen hero grid page
        Router.goTo('/heroes');
        return;
      }
      if (key === 'monster') {
        Router.goTo('/monsters');
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

  function HeroesPage() {}
  HeroesPage.title = 'Hero';
  HeroesPage.render = () => {
    return `
      <div class="cp-hero-page">
        <div class="cp-hero-grid cp-hero-grid--full" id="cpHeroesGrid"></div>
      </div>
    `;
  };
  HeroesPage.init = async () => {
    const host = document.getElementById('cpHeroesGrid');
    if (!host) return;
    host.innerHTML = `<div class="cp-muted">Loading heroes...</div>`;
    await loadHeroOverrides();
    const list = getAllHeroes();
    host.innerHTML = list.map(h => `
      <button class="cp-hero-card" type="button" data-hero-id="${esc(h.id)}">
        <div class="cp-hero-mini">
          <img src="${esc(h.mini)}" alt="${esc(h.name)}">
        </div>
        <div class="cp-hero-mini-meta">
          <div class="cp-hero-mini-name">${esc(h.name)}</div>
          <div class="cp-hero-mini-sub">#${esc(h.id)} · ${esc(elementLabel(h.element))}</div>
        </div>
      </button>
    `).join('');
    host.querySelectorAll('[data-hero-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = String(btn.getAttribute('data-hero-id') || '');
        const hero = getAllHeroes().find(x => x.id === id);
        if (hero) showHeroModal(hero);
      });
    });
  };

  // ----------------------------
  // Monster database (UI first)
  // ----------------------------
  let monsterOverrides = {};
  let monsterOverridesLoaded = false;
  let monsterOverridesLoading = null;

  async function loadMonsterOverrides() {
    if (monsterOverridesLoaded) return monsterOverrides;
    if (monsterOverridesLoading) return monsterOverridesLoading;
    monsterOverridesLoading = (async () => {
      try {
        const resp = await fetch('/api/chess-pal/monsters', { method: 'GET' });
        if (!resp.ok) throw new Error('Failed to load monster overrides');
        const data = await resp.json();
        const ov = data && data.overrides && typeof data.overrides === 'object' ? data.overrides : {};
        monsterOverrides = ov;
      } catch {
        monsterOverrides = monsterOverrides || {};
      } finally {
        monsterOverridesLoaded = true;
      }
      return monsterOverrides;
    })();
    return monsterOverridesLoading;
  }

  async function saveMonsterOverridesToServer() {
    if (!isAdminMode()) throw new Error('Not in admin mode');
    if (!window.authUtils || typeof window.authUtils.authenticatedFetch !== 'function') {
      throw new Error('authUtils not available');
    }
    const resp = await window.authUtils.authenticatedFetch('/admin/chess-pal/monsters', {
      method: 'PUT',
      body: JSON.stringify({ overrides: monsterOverrides })
    });
    if (!resp) throw new Error('Not authenticated');
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(t || 'Failed to save');
    }
    const data = await resp.json().catch(() => ({}));
    if (data && data.overrides && typeof data.overrides === 'object') {
      monsterOverrides = data.overrides;
    }
    return monsterOverrides;
  }

  const MONSTER_DB = [
    {
      id: '001',
      name: 'Grimjaw',
      element: 'dark',
      rarity: 5,
      level: 1,
      maxLevel: 99,
      hp: 420,
      atk: 120,
      rcv: 0,
      passiveSkill: { name: 'Predator Instinct', text: 'ATK +10% when HP below 50% (placeholder).', params: { lowHpAtkBonus: 0.10 } },
      activeSkill: { name: 'Night Rend', cd: 6, text: 'Deal dark damage (placeholder).', params: { dmg: 120 } },
      img: 'images/Monsters/M001-Grimjaw/M001-Grimjaw.png',
      mini: 'images/Monsters/M001-Grimjaw/M001-Grimjaw-mini.png'
    },
    {
      id: '002',
      name: 'Cinder Brute',
      element: 'fire',
      rarity: 5,
      level: 1,
      maxLevel: 99,
      hp: 480,
      atk: 135,
      rcv: 0,
      passiveSkill: { name: 'Heat Armor', text: 'Take -10% damage (placeholder).', params: { damageReduction: 0.10 } },
      activeSkill: { name: 'Ash Slam', cd: 7, text: 'Convert 2 tiles to Fire (placeholder).', params: { convert: { count: 2, to: 'fire' } } },
      img: 'images/Monsters/M002-Cinder_Brute/M002-Cinder_Brute.png',
      mini: 'images/Monsters/M002-Cinder_Brute/M002-Cinder_Brute-mini.png'
    },
    {
      id: '003',
      name: 'Tide Wraith',
      element: 'water',
      rarity: 5,
      level: 1,
      maxLevel: 99,
      hp: 400,
      atk: 128,
      rcv: 0,
      passiveSkill: { name: 'Cold Mist', text: '10% chance to slow enemies (placeholder).', params: { slowChance: 0.10 } },
      activeSkill: { name: 'Undertow', cd: 6, text: 'Convert 1 tile to Water (placeholder).', params: { convert: { count: 1, to: 'water' } } },
      img: 'images/Monsters/M003-Tide_Wraith/M003-Tide_Wraith.png',
      mini: 'images/Monsters/M003-Tide_Wraith/M003-Tide_Wraith-mini.png'
    },
    {
      id: '004',
      name: 'Verdant Maw',
      element: 'wood',
      rarity: 5,
      level: 1,
      maxLevel: 99,
      hp: 520,
      atk: 110,
      rcv: 0,
      passiveSkill: { name: 'Regrowth', text: 'Heal +2% max HP each turn (placeholder).', params: { healMaxHpPctPerTurn: 0.02 } },
      activeSkill: { name: 'Root Bind', cd: 8, text: 'Convert 1 tile to Wood + 1 to Heart (placeholder).', params: { convert: [{ count: 1, to: 'wood' }, { count: 1, to: 'heart' }] } },
      img: 'images/Monsters/M004-Verdant_Maw/M004-Verdant_Maw.png',
      mini: 'images/Monsters/M004-Verdant_Maw/M004-Verdant_Maw-mini.png'
    },
    {
      id: '005',
      name: 'Solar Idol',
      element: 'light',
      rarity: 5,
      level: 1,
      maxLevel: 99,
      hp: 390,
      atk: 140,
      rcv: 0,
      passiveSkill: { name: 'Blinding Aura', text: 'Enemies miss +5% (placeholder).', params: { enemyMissChance: 0.05 } },
      activeSkill: { name: 'Radiant Pulse', cd: 7, text: 'Convert 2 tiles to Light (placeholder).', params: { convert: { count: 2, to: 'light' } } },
      img: 'images/Monsters/M005-Solar_Idol/M005-Solar_Idol.png',
      mini: 'images/Monsters/M005-Solar_Idol/M005-Solar_Idol-mini.png'
    },

    // Boss series (006-010)
    {
      id: '006',
      name: 'Abyss Monarch',
      element: 'dark',
      rarity: 6,
      level: 1,
      maxLevel: 99,
      hp: 880,
      atk: 210,
      rcv: 0,
      passiveSkill: { name: 'Abyssal Dominion', text: 'Start each battle with +1 cascade chain (placeholder).', params: { startCascadeBonus: 1 } },
      activeSkill: { name: 'Void Eclipse', cd: 9, text: 'Convert 3 tiles to Dark; deal heavy dark damage (placeholder).', params: { convert: { count: 3, to: 'dark' }, dmg: 360 } },
      img: 'images/Monsters/M006-Abyss_Monarch/M006-Abyss_Monarch.png',
      mini: 'images/Monsters/M006-Abyss_Monarch/M006-Abyss_Monarch-mini.png'
    },
    {
      id: '007',
      name: 'Crimson Warlord',
      element: 'fire',
      rarity: 6,
      level: 1,
      maxLevel: 99,
      hp: 920,
      atk: 225,
      rcv: 0,
      passiveSkill: { name: 'War Drums', text: 'Fire damage +15% (placeholder).', params: { fireDmgBonus: 0.15 } },
      activeSkill: { name: 'Blood Furnace', cd: 9, text: 'Convert 4 tiles to Fire (placeholder).', params: { convert: { count: 4, to: 'fire' } } },
      img: 'images/Monsters/M007-Crimson_Warlord/M007-Crimson_Warlord.png',
      mini: 'images/Monsters/M007-Crimson_Warlord/M007-Crimson_Warlord-mini.png'
    },
    {
      id: '008',
      name: 'Leviathan Prime',
      element: 'water',
      rarity: 6,
      level: 1,
      maxLevel: 99,
      hp: 860,
      atk: 220,
      rcv: 0,
      passiveSkill: { name: 'Deep Pressure', text: 'Enemies take +10% damage after cascades (placeholder).', params: { postCascadeVulnerability: 0.10 } },
      activeSkill: { name: 'Tsunami Break', cd: 10, text: 'Convert 3 tiles to Water; +1s time this turn (placeholder).', params: { convert: { count: 3, to: 'water' }, extraTimeSec: 1 } },
      img: 'images/Monsters/M008-Leviathan_Prime/M008-Leviathan_Prime.png',
      mini: 'images/Monsters/M008-Leviathan_Prime/M008-Leviathan_Prime-mini.png'
    },
    {
      id: '009',
      name: 'Worldroot Colossus',
      element: 'wood',
      rarity: 6,
      level: 1,
      maxLevel: 99,
      hp: 980,
      atk: 200,
      rcv: 0,
      passiveSkill: { name: 'Ancient Bark', text: 'Take -15% damage (placeholder).', params: { damageReduction: 0.15 } },
      activeSkill: { name: 'Thorn Cathedral', cd: 10, text: 'Convert 2 tiles to Wood + 2 to Heart (placeholder).', params: { convert: [{ count: 2, to: 'wood' }, { count: 2, to: 'heart' }] } },
      img: 'images/Monsters/M009-Worldroot_Colossus/M009-Worldroot_Colossus.png',
      mini: 'images/Monsters/M009-Worldroot_Colossus/M009-Worldroot_Colossus-mini.png'
    },
    {
      id: '010',
      name: 'Dawn Seraph',
      element: 'light',
      rarity: 6,
      level: 1,
      maxLevel: 99,
      hp: 840,
      atk: 235,
      rcv: 0,
      passiveSkill: { name: 'Radiant Shield', text: 'Heal +2% max HP each turn (placeholder).', params: { healMaxHpPctPerTurn: 0.02 } },
      activeSkill: { name: 'Solar Judgement', cd: 10, text: 'Convert 4 tiles to Light; deal light damage (placeholder).', params: { convert: { count: 4, to: 'light' }, dmg: 340 } },
      img: 'images/Monsters/M010-Dawn_Seraph/M010-Dawn_Seraph.png',
      mini: 'images/Monsters/M010-Dawn_Seraph/M010-Dawn_Seraph-mini.png'
    }
  ];

  function getMonsterById(id) {
    const key = String(id || '').trim();
    return MONSTER_DB.find(m => String(m.id) === key) || null;
  }

  function mergeMonster(base) {
    const b = base || {};
    const o = (monsterOverrides && b.id && monsterOverrides[b.id]) ? monsterOverrides[b.id] : {};
    const active = b.activeSkill && typeof b.activeSkill === 'object' ? b.activeSkill : { name: 'Skill', cd: 0, text: '', params: {} };
    const passive = b.passiveSkill && typeof b.passiveSkill === 'object' ? b.passiveSkill : { name: 'Passive', text: '', params: {} };
    return {
      ...b,
      rarity: (o.rarity != null) ? Number(o.rarity) : b.rarity,
      level: (o.level != null) ? Number(o.level) : b.level,
      maxLevel: (o.maxLevel != null) ? Number(o.maxLevel) : b.maxLevel,
      hp: (o.hp != null) ? Number(o.hp) : b.hp,
      atk: (o.atk != null) ? Number(o.atk) : b.atk,
      rcv: (o.rcv != null) ? Number(o.rcv) : b.rcv,
      activeSkill: {
        ...active,
        cd: (o.activeCd != null) ? Number(o.activeCd) : active.cd,
        params: (o.activeParams && typeof o.activeParams === 'object') ? o.activeParams : active.params
      },
      passiveSkill: {
        ...passive,
        params: (o.passiveParams && typeof o.passiveParams === 'object') ? o.passiveParams : passive.params
      }
    };
  }

  function getAllMonsters() {
    return MONSTER_DB.map(m => mergeMonster(m));
  }

  function showMonsterModal(monster) {
    const m = monster || null;
    if (!m) return;
    const admin = isAdminMode();
    const old = document.getElementById('cpMonsterModalOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cpMonsterModalOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Monster details">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-hero-modal-grid">
            <div class="cp-hero-modal-art">
              ${m.img ? `<img src="${esc(m.img)}" alt="${esc(m.name)}" />` : `<div class="cp-art-placeholder">${esc(m.name)}</div>`}
            </div>
            <div class="cp-hero-modal-info">
              <div class="cp-hero-modal-title">
                <div class="cp-hero-id">#${esc(m.id)}</div>
                <div class="cp-hero-name">${esc(m.name)}</div>
              </div>
              <div class="cp-hero-meta">
                <span class="cp-chip">${esc(elementLabel(m.element))}</span>
                <span class="cp-chip">${esc(renderStars(m.rarity))}</span>
                <span class="cp-chip">Lv ${esc(m.level)} / ${esc(m.maxLevel)}</span>
              </div>
              <div class="cp-hero-stats">
                <div class="cp-stat"><b>HP</b> ${esc(m.hp)}</div>
                <div class="cp-stat"><b>ATK</b> ${esc(m.atk)}</div>
                <div class="cp-stat"><b>RCV</b> ${esc(m.rcv)}</div>
              </div>
              <div class="cp-hero-skill">
                <div class="cp-skill-head">
                  <div class="cp-skill-title">Passive Skill · ${esc(m.passiveSkill?.name || '')}</div>
                </div>
                <div class="cp-skill-desc">${esc(m.passiveSkill?.text || '')}</div>
              </div>
              <div class="cp-hero-skill">
                <div class="cp-skill-head">
                  <div class="cp-skill-title">Active Skill · ${esc(m.activeSkill?.name || '')}</div>
                  <div class="cp-skill-cdchip">CD ${esc(m.activeSkill?.cd ?? 0)}</div>
                </div>
                <div class="cp-skill-desc">${esc(m.activeSkill?.text || '')}</div>
              </div>

              ${admin ? `
                <div class="cp-hero-skill cp-admin-box">
                  <div class="cp-skill-head">
                    <div class="cp-skill-title">Admin</div>
                    <button class="cp-tool-btn" type="button" id="cpOpenMonsterAdminEdit">Admin Edit</button>
                  </div>
                  <div class="cp-muted" style="margin-top:8px;">Edit HP/ATK/RCV, skill CD, and skill values.</div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => { try { overlay.remove(); } catch {} try { window.removeEventListener('keydown', onKey); } catch {} };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
    overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
    window.addEventListener('keydown', onKey);

    if (admin) {
      const openBtn = overlay.querySelector('#cpOpenMonsterAdminEdit');
      if (openBtn) {
        openBtn.addEventListener('click', () => {
          showMonsterAdminEditModal(m.id);
        });
      }
    }
  }

  function showMonsterAdminEditModal(monsterId) {
    const base = getMonsterById(monsterId);
    if (!base) return;
    const merged = mergeMonster(base);

    const old = document.getElementById('cpMonsterAdminEditOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cpMonsterAdminEditOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Admin edit monster">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-h1" style="font-size:18px;">Admin Edit · #${esc(merged.id)} ${esc(merged.name)}</div>
          <div class="cp-muted" style="margin-top:6px;">Changes are saved to server and apply to all users.</div>

          <div class="cp-admin-grid" style="margin-top:12px;">
            <label class="cp-admin-field">
              <span>Rarity</span>
              <input type="number" id="cpAdminRarity" value="${esc(merged.rarity)}" min="1" step="1">
            </label>
            <label class="cp-admin-field">
              <span>Level</span>
              <input type="number" id="cpAdminLevel" value="${esc(merged.level)}" min="1" step="1">
            </label>
            <label class="cp-admin-field">
              <span>Max Level</span>
              <input type="number" id="cpAdminMaxLevel" value="${esc(merged.maxLevel)}" min="1" step="1">
            </label>
            <label class="cp-admin-field">
              <span>HP</span>
              <input type="number" id="cpAdminHp" value="${esc(merged.hp)}" min="1" step="1">
            </label>
            <label class="cp-admin-field">
              <span>ATK</span>
              <input type="number" id="cpAdminAtk" value="${esc(merged.atk)}" min="1" step="1">
            </label>
            <label class="cp-admin-field">
              <span>RCV</span>
              <input type="number" id="cpAdminRcv" value="${esc(merged.rcv)}" min="0" step="1">
            </label>
            <label class="cp-admin-field">
              <span>Active Skill CD</span>
              <input type="number" id="cpAdminActiveCd" value="${esc(merged.activeSkill?.cd ?? 0)}" min="0" step="1">
            </label>
          </div>

          <div class="cp-admin-json">
            <div class="cp-admin-json-title">Passive Skill Values (JSON)</div>
            <textarea id="cpAdminPassiveParams" rows="7">${esc(JSON.stringify(merged.passiveSkill?.params ?? {}, null, 2))}</textarea>
          </div>
          <div class="cp-admin-json">
            <div class="cp-admin-json-title">Active Skill Values (JSON)</div>
            <textarea id="cpAdminActiveParams" rows="7">${esc(JSON.stringify(merged.activeSkill?.params ?? {}, null, 2))}</textarea>
          </div>

          <div class="cp-admin-actions">
            <button class="cp-primary" type="button" id="cpAdminSaveMonster">Save</button>
          </div>
          <div class="cp-muted" id="cpAdminMsg" style="margin-top:10px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      try { overlay.remove(); } catch {}
      try { window.removeEventListener('keydown', onKey); } catch {}
    };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
    overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
    window.addEventListener('keydown', onKey);

    const msg = overlay.querySelector('#cpAdminMsg');
    const setMsg = (t) => { if (msg) msg.textContent = String(t || ''); };

    overlay.querySelector('#cpAdminSaveMonster')?.addEventListener('click', async () => {
      try {
        setMsg('');
        const rarity = Number(overlay.querySelector('#cpAdminRarity')?.value);
        const level = Number(overlay.querySelector('#cpAdminLevel')?.value);
        const maxLevel = Number(overlay.querySelector('#cpAdminMaxLevel')?.value);
        const hp = Number(overlay.querySelector('#cpAdminHp')?.value);
        const atk = Number(overlay.querySelector('#cpAdminAtk')?.value);
        const rcv = Number(overlay.querySelector('#cpAdminRcv')?.value);
        const cd = Number(overlay.querySelector('#cpAdminActiveCd')?.value);
        const passiveRaw = String(overlay.querySelector('#cpAdminPassiveParams')?.value || '{}');
        const activeRaw = String(overlay.querySelector('#cpAdminActiveParams')?.value || '{}');
        const passiveParams = JSON.parse(passiveRaw || '{}');
        const activeParams = JSON.parse(activeRaw || '{}');

        if (!monsterOverridesLoaded) await loadMonsterOverrides();
        if (!monsterOverrides[merged.id]) monsterOverrides[merged.id] = {};
        monsterOverrides[merged.id].rarity = Number.isFinite(rarity) ? Math.max(1, Math.floor(rarity)) : merged.rarity;
        monsterOverrides[merged.id].level = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : merged.level;
        monsterOverrides[merged.id].maxLevel = Number.isFinite(maxLevel) ? Math.max(1, Math.floor(maxLevel)) : merged.maxLevel;
        monsterOverrides[merged.id].hp = Number.isFinite(hp) ? Math.max(1, Math.floor(hp)) : merged.hp;
        monsterOverrides[merged.id].atk = Number.isFinite(atk) ? Math.max(1, Math.floor(atk)) : merged.atk;
        monsterOverrides[merged.id].rcv = Number.isFinite(rcv) ? Math.max(0, Math.floor(rcv)) : merged.rcv;
        monsterOverrides[merged.id].activeCd = Number.isFinite(cd) ? Math.max(0, Math.floor(cd)) : (merged.activeSkill?.cd ?? 0);
        monsterOverrides[merged.id].passiveParams = passiveParams;
        monsterOverrides[merged.id].activeParams = activeParams;

        await saveMonsterOverridesToServer();
        setMsg('Saved.');

        const refreshed = mergeMonster(getMonsterById(merged.id));
        close();
        showMonsterModal(refreshed);
      } catch (e) {
        setMsg(String(e?.message || e || 'Save failed'));
      }
    });
  }

  function MonstersPage() {}
  MonstersPage.title = 'Monster';
  MonstersPage.render = () => {
    return `
      <div class="cp-hero-page">
        <div class="cp-hero-grid cp-hero-grid--full" id="cpMonstersGrid"></div>
      </div>
    `;
  };
  MonstersPage.init = async () => {
    const host = document.getElementById('cpMonstersGrid');
    if (!host) return;
    host.innerHTML = `<div class="cp-muted">Loading monsters...</div>`;
    await loadMonsterOverrides();
    const list = getAllMonsters();
    host.innerHTML = list.map(m => `
      <button class="cp-hero-card" type="button" data-monster-id="${esc(m.id)}">
        <div class="cp-hero-mini">
          ${m.mini ? `<img src="${esc(m.mini)}" alt="${esc(m.name)}">` : `<div class="cp-mini-placeholder">${esc(m.name)}</div>`}
        </div>
        <div class="cp-hero-mini-meta">
          <div class="cp-hero-mini-name">${esc(m.name)}</div>
          <div class="cp-hero-mini-sub">#${esc(m.id)} · ${esc(elementLabel(m.element))}</div>
        </div>
      </button>
    `).join('');
    host.querySelectorAll('[data-monster-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = String(btn.getAttribute('data-monster-id') || '');
        const m = getAllMonsters().find(x => x.id === id);
        if (m) showMonsterModal(m);
      });
    });
  };

  const TeamPage = PlaceholderPage('Team', 'Team builder coming next.');

  // ----------------------------
  // Storage (inventory) - 20 slots, stack same items
  // ----------------------------
  const STORAGE_SLOT_COUNT = 20;
  const STORAGE_KEY = 'chessPalStorage';

  function normalizeStorageSlots(slots) {
    const out = Array.isArray(slots) ? slots.slice(0, STORAGE_SLOT_COUNT) : [];
    while (out.length < STORAGE_SLOT_COUNT) out.push(null);
    return out.map(s => {
      if (!s) return null;
      if (typeof s !== 'object') return null;
      const itemId = String(s.itemId || '').trim().toLowerCase();
      const name = String(s.name || '').trim();
      const qty = Math.max(1, Math.floor(Number(s.qty) || 1));
      if (!itemId) return null;
      return { itemId, name: name || itemId, qty };
    });
  }

  function loadStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return normalizeStorageSlots([]);
      const v = JSON.parse(raw);
      return normalizeStorageSlots(v?.slots);
    } catch {
      return normalizeStorageSlots([]);
    }
  }

  function saveStorage(slots) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ slots: normalizeStorageSlots(slots) }));
    } catch {}
  }

  function swapOrStackSlots(slots, fromIdx, toIdx) {
    const a = slots[fromIdx] || null;
    const b = slots[toIdx] || null;
    if (!a && !b) return slots;
    const next = slots.slice();
    if (a && b && a.itemId === b.itemId) {
      next[toIdx] = { ...b, qty: (Number(b.qty) || 1) + (Number(a.qty) || 1) };
      next[fromIdx] = null;
      return next;
    }
    next[fromIdx] = b;
    next[toIdx] = a;
    return next;
  }

  function StoragePage() {}
  StoragePage.title = 'Storage';
  StoragePage.render = () => {
    return `
      <div class="cp-page-card">
        <div class="cp-h1">Storage</div>
        <div class="cp-muted">Inventory grid (layout first). Each slot holds one item type; same type stacks.</div>

        <div class="cp-storage-grid" id="cpStorageGrid" style="margin-top:12px;"></div>
        <div class="cp-muted" id="cpStorageHint" style="margin-top:10px;"></div>
      </div>
    `;
  };
  StoragePage.init = () => {
    const host = document.getElementById('cpStorageGrid');
    const hint = document.getElementById('cpStorageHint');
    if (!host) return;

    let slots = loadStorage();
    let selectedIdx = -1;

    const setHint = (t) => { if (hint) hint.textContent = String(t || ''); };
    const render = () => {
      host.innerHTML = slots.map((s, i) => {
        const isSel = i === selectedIdx;
        const title = s ? `${s.name} ×${s.qty}` : `Empty (Slot ${i + 1})`;
        return `
          <button class="cp-storage-slot ${isSel ? 'is-selected' : ''}" type="button" data-slot="${i}" aria-label="${esc(title)}">
            ${s ? `
              <div class="cp-storage-icon">
                <span>${esc(String(s.name || s.itemId).slice(0, 1).toUpperCase())}</span>
              </div>
              <div class="cp-storage-name">${esc(s.name)}</div>
              <div class="cp-storage-qtybadge">×${esc(s.qty)}</div>
            ` : `
              <div class="cp-storage-empty"></div>
            `}
          </button>
        `;
      }).join('');
    };

    const persist = () => { saveStorage(slots); };
    const refresh = () => { render(); persist(); };

    setHint('');
    render();

    host.querySelectorAll('[data-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-slot'));
        if (!Number.isFinite(idx)) return;

        // If selecting a source slot for move/stack/swap
        if (selectedIdx >= 0 && selectedIdx !== idx) {
          slots = swapOrStackSlots(slots, selectedIdx, idx);
          selectedIdx = -1;
          setHint('');
          refresh();
          return;
        }

        // Toggle selection if clicking same slot with item
        const slot = slots[idx] || null;
        if (slot) {
          if (selectedIdx === idx) {
            selectedIdx = -1;
            setHint('');
            refresh();
            return;
          }
          selectedIdx = idx;
          setHint('Selected. Click another slot to move / swap / stack.');
          refresh();
          return;
        }
      }, { passive: true });
    });
  };

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
            <div class="cp-setting-label">Jewel 系列</div>
            <div class="cp-setting-help">選擇棋盤寶石的美術系列（即時預覽）。</div>
            <select id="cpSettingJewelSet" class="cp-select">
              <option value="set_a" ${s.jewelSet === 'set_a' ? 'selected' : ''}>Set_A</option>
              <option value="none" ${s.jewelSet === 'none' ? 'selected' : ''}>No Style</option>
            </select>
            <div class="cp-setting-value"><span id="cpSettingJewelSetVal">${s.jewelSet === 'set_a' ? 'Set_A' : 'No Style'}</span></div>

            <div class="cp-jewel-preview" aria-label="Jewel preview">
              <div class="cp-jewel-preview-grid">
                <div class="pmf-cell pmf-fire" aria-label="Fire preview"></div>
                <div class="pmf-cell pmf-water" aria-label="Water preview"></div>
                <div class="pmf-cell pmf-wood" aria-label="Wood preview"></div>
                <div class="pmf-cell pmf-light" aria-label="Light preview"></div>
                <div class="pmf-cell pmf-dark" aria-label="Dark preview"></div>
                <div class="pmf-cell pmf-heart" aria-label="Heart preview"></div>
              </div>
            </div>
          </div>

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
    const jewelSet = document.getElementById('cpSettingJewelSet');
    const jewelSetVal = document.getElementById('cpSettingJewelSetVal');
    const alpha = document.getElementById('cpSettingJewelAlpha');
    const alphaVal = document.getElementById('cpSettingJewelAlphaVal');
    const bg = document.getElementById('cpSettingAppBg');
    const bgVal = document.getElementById('cpSettingAppBgVal');

    if (jewelSet) {
      jewelSet.value = String(s0.jewelSet || 'set_a');
      jewelSet.addEventListener('change', () => {
        const next = getGeneralSettings();
        const v = String(jewelSet.value || 'set_a').trim().toLowerCase();
        next.jewelSet = (v === 'none' || v === 'set_a') ? v : 'set_a';
        applyGeneralSettings(next);
        saveGeneralSettings(next);
        if (jewelSetVal) jewelSetVal.textContent = next.jewelSet === 'set_a' ? 'Set_A' : 'No Style';
      }, { passive: true });
    }

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
      '/heroes': HeroesPage,
      '/monsters': MonstersPage,
      '/storage': StoragePage,
      '/shop': ShopPage,
      '/settings': SettingsPage,
    }
  };
})();

