// Minimal hash router for Chess Pal

const Router = (() => {
  const routeMap = ChessPalPages?.routes || {};
  let container = null;
  let currentPath = '';
  let currentPage = null;
  let coinsListenerBound = false;

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

    if (path !== '/practice') {
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
    if (!goldEl && !silverEl) return;
    const t = getCoinTotalsFromStorage();
    if (goldEl) goldEl.textContent = String(t.gold || 0);
    if (silverEl) silverEl.textContent = String(t.silver || 0);
  }

  function renderPath(path) {
    if (!container) return;
    const p = normalize(path);
    const page = routeMap[p] || routeMap['/home'];
    destroyCurrent();
    currentPage = page;
    currentPath = p;

    setTitleForPath(p);
    setActiveNav(p);
    setTopToolsForPath(p);
    updateSidebarCoins();

    container.style.opacity = '0';
    setTimeout(() => {
      container.innerHTML = page?.render?.() || '';
      try { page?.init?.(); } catch {}
      updateSidebarCoins();
      setTimeout(() => { container.style.opacity = '1'; }, 10);
    }, 80);
  }

  function renderCurrent() {
    renderPath(getPathFromHash());
  }

  function goTo(path) {
    window.location.hash = `#${normalize(path)}`;
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

    window.addEventListener('hashchange', renderCurrent);
    if (!coinsListenerBound) {
      coinsListenerBound = true;
      window.addEventListener('cpStorageChanged', updateSidebarCoins);
      window.addEventListener('storage', updateSidebarCoins);
    }
    updateSidebarCoins();

    if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = '#/home';
      return;
    }
    renderCurrent();
  }

  return {
    init,
    goTo,
    renderCurrent
  };
})();

window.addEventListener('DOMContentLoaded', () => {
  try { Router.init(); } catch (e) { console.error(e); }
});

