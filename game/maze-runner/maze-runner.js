// Maze Runner main (teacher + student shell)
(function () {
  "use strict";
  const MR = window.__MazeRunnerCore;
  if (!MR) {
    console.error("[maze-runner] Missing core.js (window.__MazeRunnerCore).");
    return;
  }

  const { escapeHtml, getUrlMode, setUrlMode, normalizeMode, renderShell } = MR;

  function renderPlaceholder(mode, isTeacher) {
    const title =
      mode === "home"
        ? "Welcome"
        : mode === "stage"
        ? "Stages"
        : mode === "challenge"
        ? "Challenges"
        : mode === "builder"
        ? "Builder"
        : "Settings";

    const subtitle =
      mode === "builder"
        ? "Teacher-only builder template is ready."
        : "This page is a template. Content will be added later.";

    return `
      <div class="mr-section-title">${escapeHtml(title)}</div>
      <div class="mr-muted" style="margin-top:8px;">
        ${escapeHtml(subtitle)}
      </div>
      <div class="mr-card" style="margin-top:12px; background:#f8fafc;">
        <div style="font-weight:900; color:#111827;">Role</div>
        <div class="mr-muted" style="margin-top:6px;">${escapeHtml(isTeacher ? "teacher" : "student")}</div>
        <div style="height:10px;"></div>
        <div style="font-weight:900; color:#111827;">Mode</div>
        <div class="mr-muted" style="margin-top:6px;">${escapeHtml(mode)}</div>
      </div>
    `;
  }

  window.initMazeRunner = async function initMazeRunner() {
    const root = document.getElementById("mazeRunnerRoot");
    if (!root) return;

    const params = new URLSearchParams(window.location.search);
    const role = String(params.get("role") || "");
    const isTeacher = role.toLowerCase() === "teacher";
    let mode = normalizeMode(getUrlMode() || "home", isTeacher);

    root.innerHTML = renderShell({ role, mode });

    const setMain = (html) => {
      const el = document.getElementById("mrMain");
      if (el) el.innerHTML = html;
    };

    const rerender = () => {
      // Re-render shell so active nav state updates.
      root.innerHTML = renderShell({ role, mode });
      setMain(renderPlaceholder(mode, isTeacher));
      bindNav();
    };

    const bindNav = () => {
      root.querySelectorAll("[data-mr-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = String(btn.getAttribute("data-mr-mode") || "").trim().toLowerCase();
          const normalized = normalizeMode(next, isTeacher);
          if (normalized === mode) return;
          mode = normalized;
          setUrlMode(mode);
          rerender();
        });
      });
    };

    setMain(renderPlaceholder(mode, isTeacher));
    bindNav();
  };
})();

