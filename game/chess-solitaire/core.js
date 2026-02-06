/* Chess Solitaire core utilities (template scaffold) */
(function () {
  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getUrlParam(key) {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get(key);
    } catch {
      return null;
    }
  }

  function setUrlParam(key, value) {
    try {
      const u = new URL(window.location.href);
      if (value === null || value === undefined || value === "") u.searchParams.delete(key);
      else u.searchParams.set(key, String(value));
      window.history.replaceState({}, "", u.toString());
    } catch {
      // ignore
    }
  }

  function normalizeMode(m) {
    const v = String(m || "").toLowerCase();
    return ["home", "stage", "challenge", "settings", "builder"].includes(v) ? v : "home";
  }

  function getUrlMode() {
    return normalizeMode(getUrlParam("mode"));
  }

  function setUrlMode(mode) {
    setUrlParam("mode", normalizeMode(mode));
  }

  async function apiRequest(path, options = {}) {
    const base = String(window.API_BASE || "/api").replace(/\/+$/, "");
    const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;
    const headers = Object.assign({}, options.headers || {});
    headers["Content-Type"] = headers["Content-Type"] || "application/json";

    // Teacher auth token (same convention as Maze Runner / Chess Light)
    try {
      const t = String(localStorage.getItem("authToken") || "").trim();
      if (t) headers["Authorization"] = `Bearer ${t}`;
    } catch {}

    const res = await fetch(url, Object.assign({}, options, { headers }));
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg = (data && data.error) ? String(data.error) : `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function renderShell({ role, mode }) {
    const isTeacher = String(role || "").toLowerCase() === "teacher";
    const nav = [
      { key: "home", label: "Home" },
      { key: "stage", label: "Stage" },
      { key: "challenge", label: "Challenge" },
      { key: "settings", label: "Setting" }
    ];
    if (isTeacher) nav.splice(3, 0, { key: "builder", label: "Builder" });

    const title =
      mode === "home"
        ? "Home"
        : mode === "stage"
        ? "Stage"
        : mode === "challenge"
        ? "Challenge"
        : mode === "builder"
        ? "Builder"
        : "Setting";

    return `
      <div class="cs-app" data-cs-current-mode="${escapeHtml(String(mode || ""))}">
        <aside class="cs-sidebar" aria-label="Chess Solitaire sidebar">
          <div class="cs-side-title">♟ Chess Solitaire</div>
          <div class="cs-side-sub">${escapeHtml(isTeacher ? "teacher" : "student")}</div>
          <div class="cs-nav" role="navigation" aria-label="Modes">
            ${nav
              .map(
                (n) =>
                  `<button type="button" class="cs-nav-btn ${mode === n.key ? "is-active" : ""}" data-cs-mode="${escapeHtml(
                    n.key
                  )}">${escapeHtml(n.label)}</button>`
              )
              .join("")}
          </div>
          <div class="cs-sidebar-bottom">Template ready. Content coming soon.</div>
        </aside>
        <main class="cs-main">
          <div class="cs-container">
            <div class="cs-title">${escapeHtml(title)}</div>
            <div class="cs-muted">Chess Solitaire</div>
            <div id="csMain" class="cs-card"></div>
          </div>
        </main>
      </div>
    `;
  }

  window.ChessSolitaireCore = {
    escapeHtml,
    getUrlParam,
    setUrlParam,
    normalizeMode,
    getUrlMode,
    setUrlMode,
    apiRequest,
    renderShell
  };
})();

