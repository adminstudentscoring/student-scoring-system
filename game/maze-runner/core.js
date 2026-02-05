// Maze Runner core utilities + shell renderer (template based on Tactics Fighter spirit)
(function () {
  "use strict";

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text ?? "");
    return div.innerHTML;
  }

  function getUrlMode() {
    try {
      const params = new URLSearchParams(window.location.search);
      return String(params.get("mode") || "").trim();
    } catch {}
    return "";
  }

  function setUrlMode(mode) {
    try {
      const url = new URL(window.location.href);
      if (!mode) url.searchParams.delete("mode");
      else url.searchParams.set("mode", String(mode));
      window.history.replaceState({}, "", url.toString());
    } catch {}
  }

  function normalizeMode(mode, isTeacher) {
    const m = String(mode || "").trim().toLowerCase();
    const allowed = new Set(["home", "stage", "challenge", "settings"]);
    if (isTeacher) allowed.add("builder");
    return allowed.has(m) ? m : "home";
  }

  async function apiRequest(path, opts = {}) {
    const url = String(path || "");
    const method = String(opts.method || "GET").toUpperCase();
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    const resp = await fetch(url, {
      method,
      headers,
      body: opts.body,
      credentials: "include"
    });
    return resp;
  }

  async function mrJson(resp) {
    if (!resp) return {};
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = data?.error || data?.message || `Request failed (${resp.status})`;
      throw new Error(String(msg));
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
      <div class="mr-app">
        <aside class="mr-sidebar" aria-label="Maze Runner sidebar">
          <div class="mr-side-title">🧩 Maze Runner</div>
          <div class="mr-side-sub">${escapeHtml(isTeacher ? "teacher" : "student")}</div>
          <div class="mr-nav" role="navigation" aria-label="Modes">
            ${nav
              .map(
                (n) =>
                  `<button type="button" class="mr-nav-btn ${mode === n.key ? "is-active" : ""}" data-mr-mode="${escapeHtml(
                    n.key
                  )}">${escapeHtml(n.label)}</button>`
              )
              .join("")}
          </div>
          <div class="mr-sidebar-bottom">Template ready. Content coming soon.</div>
        </aside>
        <main class="mr-main">
          <div class="mr-container">
            <div class="mr-title">${escapeHtml(
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
            <div class="mr-muted">Maze Runner</div>
            <div id="mrMain" class="mr-card"></div>
          </div>
        </main>
      </div>
    `;
  }

  window.__MazeRunnerCore = {
    escapeHtml,
    getUrlMode,
    setUrlMode,
    normalizeMode,
    apiRequest,
    mrJson,
    renderShell
  };
})();

