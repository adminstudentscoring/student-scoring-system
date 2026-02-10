// Minimal hash router for Chess Pal

const Router = (() => {
  const routeMap = ChessPalPages?.routes || {};
  let container = null;
  let currentPath = '';
  let currentPage = null;

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

  function setActiveNav(path) {
    document.querySelectorAll('.cp-nav-btn').forEach(btn => {
      const r = normalize(btn.getAttribute('data-route') || '');
      btn.classList.toggle('is-active', r === path);
    });
  }

  function destroyCurrent() {
    try { currentPage?.destroy?.(); } catch {}
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

    container.style.opacity = '0';
    setTimeout(() => {
      container.innerHTML = page?.render?.() || '';
      try { page?.init?.(); } catch {}
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

    // API status badge
    (async () => {
      const statusEl = document.getElementById('cpApiStatus');
      if (!statusEl) return;
      try {
        const response = await fetch(`${API_CONFIG.baseURL}${API_CONFIG.endpoints.getStudents}`);
        if (response.ok) {
          statusEl.textContent = 'Connected';
          statusEl.className = 'cp-status is-ok';
        } else {
          throw new Error('API response error');
        }
      } catch (e) {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'cp-status is-bad';
      }
    })();

    window.addEventListener('hashchange', renderCurrent);

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

