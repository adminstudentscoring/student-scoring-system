// Chess Light core utilities + shell renderer
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
    const allow = new Set(["home", "stage", "challenge", "settings"]);
    if (isTeacher) allow.add("builder");
    return allow.has(m) ? m : "home";
  }

  function getPublicStudentPassword() {
    try {
      return String(localStorage.getItem("studentAccessPassword") || "").trim();
    } catch {}
    return "";
  }

  // Same behavior as Maze Runner: auto-add Bearer token when present.
  async function apiRequest(url, opts = {}) {
    const headers = new Headers(opts.headers || {});
    headers.set("Content-Type", headers.get("Content-Type") || "application/json");
    try {
      const token = String(localStorage.getItem("authToken") || "").trim();
      if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    } catch {}
    return fetch(url, { ...opts, headers });
  }

  async function clJson(resp) {
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
      { key: "stage", label: "Stage" },
      { key: "challenge", label: "Challenge" },
      { key: "settings", label: "Setting" }
    ];
    if (isTeacher) nav.splice(3, 0, { key: "builder", label: "Builder" });

    return `
      <div class="cl-app" data-cl-current-mode="${escapeHtml(String(mode || ""))}">
        <aside class="cl-sidebar" aria-label="Chess Light sidebar">
          <div class="cl-side-title">💡 Chess Light</div>
          <div class="cl-side-sub">${escapeHtml(isTeacher ? "teacher" : "student")}</div>
          <div class="cl-nav" role="navigation" aria-label="Modes">
            ${nav.map((n) =>
              `<button type="button" class="cl-nav-btn ${mode === n.key ? "is-active" : ""}" data-cl-mode="${escapeHtml(n.key)}">${escapeHtml(n.label)}</button>`
            ).join("")}
          </div>
          <div class="cl-sidebar-bottom">Template ready. Content coming soon.</div>
        </aside>
        <main class="cl-main">
          <div class="cl-container">
            <div class="cl-title">${escapeHtml(
              mode === "home"
                ? "Home"
                : mode === "stage"
                ? "Stage"
                : mode === "challenge"
                ? "Challenge"
                : mode === "builder"
                ? "Builder"
                : "Setting"
            )}</div>
            <div class="cl-muted">Chess Light</div>
            <div id="clMain" class="cl-card"></div>
          </div>
        </main>
      </div>
    `;
  }

  window.__ChessLightCore = {
    escapeHtml,
    getUrlMode,
    setUrlMode,
    normalizeMode,
    getPublicStudentPassword,
    apiRequest,
    clJson,
    renderShell
  };
})();

