// Minimal hash router for Chess Pal

const Router = (() => {
  const routeMap = ChessPalPages?.routes || {};
  let container = null;
  let currentPath = '';
  let currentPage = null;
  let coinsListenerBound = false;
  let suppressHashSync = false;

  function normalize(path) {
    const p = String(path || '').trim();
    if (!p || p === '#') return '/home';
    if (p.startsWith('#')) return normalize(p.slice(1));
    return p.startsWith('/') ? p : `/${p}`;
  }

  function getPathFromHash() {
    const h = String(window.location.hash || '');
    const raw = h.startsWith('#') ? h.slice(1) : h;
    return normalize(raw || '/home');
  }

  function setTitleForPath(path) {
    const mainTitle = document.getElementById('cpMainTitle');
    const page = routeMap[path] || routeMap['/home'];
    const title = String(page?.title || 'Chess Pal');
    if (mainTitle) mainTitle.textContent = title;
    try { document.title = `Chess Pal · ${title}`; } catch {}
  }

  function closeAllPopovers() {
    document.querySelectorAll('.cp-popover').forEach((p) => p.classList.remove('is-open'));
  }

  function setTopToolsForPath(path) {
    const tools = document.getElementById('cpTopTools');
    const pops = document.getElementById('cpTopPopovers');
    if (!tools || !pops) return;

    if (path !== '/practice' && path !== '/test-game') {
      tools.innerHTML = '';
      pops.innerHTML = '';
      return;
    }

    tools.innerHTML = `
      <button class="cp-tool-btn" type="button" data-pop="moves">Move Summary</button>
      <button class="cp-tool-btn" type="button" data-pop="cascades">Cascades</button>
      <button class="cp-tool-btn" type="button" data-pop="score">Score</button>
      <button class="cp-tool-btn" type="button" data-pop="logs">Action Log</button>
    `;

    pops.innerHTML = `
      <div class="cp-popover" data-popover="moves">
        <div class="cp-popover-head">Move Summary</div>
        <div class="cp-popover-body">
          <ul id="pmfMoveList" class="pmf-move-list"></ul>
        </div>
      </div>
      <div class="cp-popover" data-popover="cascades">
        <div class="cp-popover-head">Cascades</div>
        <div class="cp-popover-body">
          <ul id="pmfCascadeList" class="pmf-cascade-list"></ul>
        </div>
      </div>
      <div class="cp-popover" data-popover="score">
        <div class="cp-popover-head">Score Breakdown</div>
        <div class="cp-popover-body">
          <div id="pmfScoreTotal" class="pmf-score-total">No score yet.</div>
          <ul id="pmfScoreList" class="pmf-cascade-list" style="margin-top:10px;"></ul>
        </div>
      </div>
      <div class="cp-popover" data-popover="logs">
        <div class="cp-popover-head">Action Log</div>
        <div class="cp-popover-body">
          <div id="pmfLog" class="pmf-log"></div>
        </div>
      </div>
    `;

    tools.querySelectorAll('[data-pop]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const key = String(btn.getAttribute('data-pop') || '');
        if (!key) return;
        const pop = pops.querySelector(`.cp-popover[data-popover="${CSS.escape(key)}"]`);
        if (!pop) return;
        const open = pop.classList.contains('is-open');
        closeAllPopovers();
        if (!open) pop.classList.add('is-open');
      });
    });

    // Click inside popovers shouldn't close them
    pops.addEventListener('click', (e) => e.stopPropagation());
  }

  function setActiveNav(path) {
    document.querySelectorAll('.cp-nav-btn').forEach(btn => {
      const r = normalize(btn.getAttribute('data-route') || '');
      btn.classList.toggle('is-active', r === path);
    });
  }

  function destroyCurrent() {
    try { currentPage?.destroy?.(); } catch {}
  }

  function getCoinTotalsFromStorage() {
    try {
      const raw = localStorage.getItem('chessPalStorage');
      if (!raw) return { gold: 0, silver: 0 };
      const v = JSON.parse(raw);
      const slots = Array.isArray(v?.slots) ? v.slots : [];
      let gold = 0;
      let silver = 0;
      for (const s of slots) {
        if (!s || typeof s !== 'object') continue;
        const id = String(s.itemId || '').trim().toLowerCase();
        const qty = Math.max(0, Math.floor(Number(s.qty) || 0));
        if (id === 'gold_coin') gold += qty;
        if (id === 'silver_coin') silver += qty;
      }
      return { gold, silver };
    } catch {
      return { gold: 0, silver: 0 };
    }
  }

  function updateSidebarCoins() {
    const goldEl = document.getElementById('cpGoldCoinVal');
    const silverEl = document.getElementById('cpSilverCoinVal');
    const topGoldEl = document.getElementById('cpTopGoldCoinVal');
    const topSilverEl = document.getElementById('cpTopSilverCoinVal');
    if (!goldEl && !silverEl && !topGoldEl && !topSilverEl) return;
    const t = getCoinTotalsFromStorage();
    if (goldEl) goldEl.textContent = String(t.gold || 0);
    if (silverEl) silverEl.textContent = String(t.silver || 0);
    if (topGoldEl) topGoldEl.textContent = String(t.gold || 0);
    if (topSilverEl) topSilverEl.textContent = String(t.silver || 0);
  }

  function getSidebarPlayerName() {
    try {
      const u = window.authUtils?.getCurrentUser?.() || null;
      const name = String(u?.name || u?.displayName || u?.username || u?.email || 'Player').trim();
      return name || 'Player';
    } catch {
      return 'Player';
    }
  }

  function updateSidebarPlayerProfile() {
    const nameEl = document.getElementById('cpPlayerName');
    const lvEl = document.getElementById('cpPlayerLevel');
    const nextEl = document.getElementById('cpPlayerLevelNext');
    const fillEl = document.getElementById('cpPlayerExpFill');
    const topLvEl = document.getElementById('cpTopPlayerLevel');
    const topFillEl = document.getElementById('cpTopPlayerExpFill');
    if (!nameEl && !lvEl && !nextEl && !fillEl && !topLvEl && !topFillEl) return;
    if (nameEl) nameEl.textContent = getSidebarPlayerName();
    let meta = null;
    try { meta = window.ChessPalPlayerProgress?.getPlayerProgressMeta?.() || null; } catch {}
    const level = Math.max(1, Math.floor(Number(meta?.level) || 1));
    const need = Math.max(0, Math.floor(Number(meta?.need) || 0));
    const progress = Math.max(0, Math.min(1, Number(meta?.progress) || 0));
    if (lvEl) lvEl.textContent = `Lv.${level}`;
    if (nextEl) nextEl.textContent = `Next ${need}`;
    if (fillEl) fillEl.style.width = `${progress * 100}%`;
    if (topLvEl) topLvEl.textContent = `Lv.${level}`;
    if (topFillEl) topFillEl.style.width = `${progress * 100}%`;
  }

  function renderPath(path) {
    if (!container) return;
    const p = normalize(path);
    try {
      if (currentPath && currentPath !== p && typeof window.__cpCanLeaveBattle === 'function') {
        const ok = window.__cpCanLeaveBattle(currentPath, p);
        if (!ok) {
          if (window.location.hash !== `#${currentPath}`) {
            suppressHashSync = true;
            window.location.hash = `#${currentPath}`;
          }
          return;
        }
      }
    } catch {}
    const page = routeMap[p] || routeMap['/home'];
    destroyCurrent();
    currentPage = page;
    currentPath = p;

    setTitleForPath(p);
    setActiveNav(p);
    setTopToolsForPath(p);
    updateSidebarCoins();
    updateSidebarPlayerProfile();

    // Hide top bar on pages that use tile/grid UI
    try {
      const hideTopbar =
        (p === '/practice' || p === '/test-game' || p === '/summon' || p === '/mode' || p.startsWith('/mode/')) ||
        (p === '/home' || p === '/pal' || p === '/heroes' || p === '/monsters' || p === '/team' || p === '/enhance' || p === '/storage' || p === '/settings') ||
        (p === '/shop' || p.startsWith('/shop/'));
      const mobile = !!(window.matchMedia && window.matchMedia('(max-width: 980px)').matches);
      document.body.classList.toggle('cp-hide-topbar', mobile ? false : hideTopbar);
    } catch {}

    // Fullscreen gameplay pages: hide sidebar, show gear
    try {
      const isGame =
        (p === '/practice' || p === '/test-game' || p.startsWith('/mode/story/ch'));
      document.body.classList.toggle('cp-game-fullscreen', isGame);
      ensureGearUI();
      const gearBtn = document.getElementById('cpGearBtn');
      if (gearBtn) gearBtn.style.display = isGame ? '' : 'none';
      if (isGame) closeSidebarIfOverlay();
    } catch {}

    container.style.opacity = '0';
    // Use a real fade-out then swap content (smooth for all pages)
    setTimeout(() => {
      container.innerHTML = page?.render?.() || '';
      try { page?.init?.(); } catch {}
      updateSidebarCoins();
      setTimeout(() => { container.style.opacity = '1'; }, 20);
    }, 220);
  }

  function renderCurrent() {
    renderPath(getPathFromHash());
  }

  function goTo(path) {
    const next = normalize(path);
    try {
      if (currentPath && currentPath !== next && typeof window.__cpCanLeaveBattle === 'function') {
        const ok = window.__cpCanLeaveBattle(currentPath, next);
        if (!ok) return;
      }
    } catch {}
    window.location.hash = `#${next}`;
  }

  function init() {
    container = document.getElementById('cpPageContainer');
    if (!container) return;

    // If opened as admin, enforce admin role.
    try {
      const role = new URLSearchParams(window.location.search || '').get('role');
      if (String(role) === 'admin' && window.authUtils && typeof window.authUtils.requireRole === 'function') {
        if (!window.authUtils.requireRole('admin')) return;
      }
    } catch {}

    // Admin-only nav items
    try {
      const role = new URLSearchParams(window.location.search || '').get('role');
      const isAdmin = (() => {
        if (String(role) !== 'admin') return false;
        if (window.authUtils && typeof window.authUtils.hasRole === 'function') return !!window.authUtils.hasRole('admin');
        return true;
      })();
      document.querySelectorAll('.cp-nav-admin').forEach((btn) => {
        btn.style.display = isAdmin ? '' : 'none';
      });
    } catch {}

    // Nav click
    document.querySelectorAll('.cp-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = btn.getAttribute('data-route') || '/home';
        goTo(r);
        closeSidebarIfOverlay();
      }, { passive: true });
    });

    // iPad-friendly overlay sidebar
    const hamb = document.getElementById('cpHamburger');
    const sidebar = document.getElementById('cpSidebar');
    const overlay = document.getElementById('cpOverlay');
    function openSidebar() {
      if (!sidebar || !overlay) return;
      sidebar.classList.add('is-open');
      overlay.classList.add('is-show');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('cp-lock');
    }
    function closeSidebar() {
      if (!sidebar || !overlay) return;
      sidebar.classList.remove('is-open');
      overlay.classList.remove('is-show');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('cp-lock');
    }
    function closeSidebarIfOverlay() {
      if (window.matchMedia && window.matchMedia('(max-width: 980px)').matches) closeSidebar();
    }
    if (hamb) hamb.addEventListener('click', () => {
      if (!sidebar) return;
      if (sidebar.classList.contains('is-open')) closeSidebar();
      else openSidebar();
    }, { passive: true });
    if (overlay) overlay.addEventListener('click', closeSidebar, { passive: true });
    window.closeSidebarIfOverlay = closeSidebarIfOverlay;

    window.addEventListener('hashchange', () => {
      if (suppressHashSync) {
        suppressHashSync = false;
        return;
      }
      renderCurrent();
    });
    if (!coinsListenerBound) {
      coinsListenerBound = true;
      window.addEventListener('cpStorageChanged', updateSidebarCoins);
      window.addEventListener('cpPlayerProgressChanged', updateSidebarPlayerProfile);
      window.addEventListener('storage', updateSidebarCoins);
      window.addEventListener('storage', updateSidebarPlayerProfile);
    }
    updateSidebarCoins();
    updateSidebarPlayerProfile();

    if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = '#/home';
      return;
    }
    renderCurrent();
  }

  function ensureGearUI() {
    if (document.getElementById('cpGearBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'cpGearBtn';
    btn.type = 'button';
    btn.className = 'cp-gear-btn';
    btn.setAttribute('aria-label', 'Game menu');
    btn.textContent = '⚙';
    btn.style.display = 'none';
    document.body.appendChild(btn);

    const open = () => {
      const old = document.getElementById('cpGearOverlay');
      if (old) old.remove();

      const overlay = document.createElement('div');
      overlay.id = 'cpGearOverlay';
      overlay.className = 'cp-modal-overlay';

      const s = (() => {
        try { return window.ChessPalSettings?.getGeneralSettings?.() || {}; } catch { return {}; }
      })();
      const piece = String(s.pieceStyle || 'none').toLowerCase();

      overlay.innerHTML = `
        <div class="cp-modal cp-gear-modal" role="dialog" aria-modal="true" aria-label="Game menu">
          <button class="cp-modal-close" type="button" aria-label="Close">×</button>
          <div class="cp-modal-body">
            <div class="cp-gear-head">Game Manu</div>

            <div class="cp-gear-mid">
              <div class="cp-gear-row">
                <div class="cp-setting-label" style="margin:0;">Piece style</div>
                <select class="cp-setting-select" id="cpGearPieceSelect">
                <option value="none" ${piece === 'none' ? 'selected' : ''}>No style</option>
                <option value="nyxblade" ${piece === 'nyxblade' ? 'selected' : ''}>Nyxblade</option>
                <option value="rivenhart" ${piece === 'rivenhart' ? 'selected' : ''}>Rivenhart</option>
                <option value="seraphix" ${piece === 'seraphix' ? 'selected' : ''}>Seraphix</option>
                </select>
              </div>
            </div>

            <div class="cp-gear-foot">
              <button class="cp-primary" type="button" id="cpGearExitBtn">Resign</button>
              <div id="cpGearExitConfirmRow" style="display:none; gap:8px; margin-top:10px; justify-content:center;" class="cp-row">
                <button class="cp-primary" type="button" id="cpGearExitConfirm">Confirm resign</button>
                <button class="cp-tool-btn" type="button" id="cpGearExitCancel">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const close = () => { try { overlay.remove(); } catch {} };
      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
      overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });

      const pieceSel = overlay.querySelector('#cpGearPieceSelect');
      pieceSel?.addEventListener('change', () => {
        const val = String(pieceSel.value || 'none').toLowerCase();
        try {
          const next = window.ChessPalSettings?.getGeneralSettings?.() || {};
          next.pieceStyle = val;
          window.ChessPalSettings?.applyGeneralSettings?.(next);
          window.ChessPalSettings?.saveGeneralSettings?.(next);
        } catch {}
      }, { passive: true });

      const exitBtn = overlay.querySelector('#cpGearExitBtn');
      const row2 = overlay.querySelector('#cpGearExitConfirmRow');
      exitBtn?.addEventListener('click', () => {
        if (row2) row2.style.display = '';
      }, { passive: true });
      overlay.querySelector('#cpGearExitCancel')?.addEventListener('click', () => {
        if (row2) row2.style.display = 'none';
      }, { passive: true });
      overlay.querySelector('#cpGearExitConfirm')?.addEventListener('click', () => {
        try { close(); } catch {}
        try {
          let handled = false;
          if (typeof window.__cpResignStoryRun === 'function') {
            handled = !!window.__cpResignStoryRun();
          }
          if (!handled) {
            goTo('/home');
          }
        } catch {}
      }, { passive: true });
    };

    btn.addEventListener('click', open, { passive: true });
  }

  return {
    init,
    goTo,
    renderCurrent
  };
})();

try { window.Router = Router; } catch {}

window.addEventListener('DOMContentLoaded', () => {
  try { Router.init(); } catch (e) { console.error(e); }
});

