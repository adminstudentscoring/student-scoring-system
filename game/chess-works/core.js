// Chess Works core utilities + shell renderer
(function () {
  "use strict";

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getUrlMode() {
    try {
      const url = new URL(window.location.href);
      return String(url.searchParams.get("mode") || "");
    } catch {}
    return "";
  }

  function setUrlMode(mode) {
    try {
      const url = new URL(window.location.href);
      const m = String(mode || "").trim();
      if (!m) url.searchParams.delete("mode");
      else url.searchParams.set("mode", m);
      window.history.replaceState({}, "", url.toString());
    } catch {}
  }

  function normalizeMode(mode, isTeacher) {
    const m = String(mode || "").trim().toLowerCase();
    const allow = new Set(["home", "works", "history", "settings"]);
    if (isTeacher) allow.add("builder");
    return allow.has(m) ? m : "home";
  }

  function getPublicStudentPassword() {
    try {
      return String(localStorage.getItem("studentAccessPassword") || "").trim();
    } catch {}
    return "";
  }

  // Same behavior as Maze Runner / Chess Light: auto-add Bearer token when present.
  async function apiRequest(url, opts = {}) {
    const headers = new Headers(opts.headers || {});
    headers.set("Content-Type", headers.get("Content-Type") || "application/json");
    try {
      const token = String(localStorage.getItem("authToken") || "").trim();
      if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    } catch {}
    return fetch(url, { ...opts, headers });
  }

  async function cwJson(resp) {
    const txt = await resp.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch {}
    if (!resp.ok) {
      const base = (data && data.error) ? String(data.error) : "Request failed";
      const details = (data && Object.prototype.hasOwnProperty.call(data, "details")) ? String(data.details || "").trim() : "";
      const suffix = details ? ` · ${details}` : "";
      throw new Error(`${base} [${resp.status}]${suffix}`);
    }
    return data;
  }

  function renderShell({ role, mode }) {
    const isTeacher = String(role || "").toLowerCase() === "teacher";
    const nav = [
      { key: "home", label: "Home" },
      { key: "works", label: "Works" },
      { key: "history", label: "History" },
      { key: "settings", label: "Setting" }
    ];
    if (isTeacher) nav.splice(3, 0, { key: "builder", label: "Builder" });

    return `
      <div class="cw-app" data-cw-current-mode="${escapeHtml(String(mode || ""))}">
        <aside class="cw-sidebar" aria-label="Chess Works sidebar">
          <div class="cw-side-title">🟩 Chess Works</div>
          <div class="cw-side-sub">${escapeHtml(isTeacher ? "teacher" : "student")}</div>
          <div class="cw-nav" role="navigation" aria-label="Modes">
            ${nav.map((n) =>
              `<button type="button" class="cw-nav-btn ${mode === n.key ? "is-active" : ""}" data-cw-mode="${escapeHtml(n.key)}">${escapeHtml(n.label)}</button>`
            ).join("")}
          </div>
          <div class="cw-sidebar-bottom">Template ready. Content coming soon.</div>
        </aside>
        <main class="cw-main">
          <div class="cw-container">
            <div class="cw-title">${escapeHtml(
              mode === "home"
                ? "Home"
                : mode === "works"
                ? "Works"
                : mode === "history"
                ? "History"
                : mode === "builder"
                ? "Builder"
                : "Setting"
            )}</div>
            <div class="cw-muted">Chess Works</div>
            <div id="cwMain" class="cw-card"></div>
          </div>
        </main>
      </div>
    `;
  }

  window.__ChessWorksCore = {
    escapeHtml,
    getUrlMode,
    setUrlMode,
    normalizeMode,
    getPublicStudentPassword,
    apiRequest,
    cwJson,
    renderShell
  };
})();

