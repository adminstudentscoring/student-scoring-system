// Chess Light main (teacher + student shell)
(function () {
  "use strict";
  const CL = window.__ChessLightCore;
  if (!CL) {
    console.error("[chess-light] Missing core.js (window.__ChessLightCore).");
    return;
  }

  const { escapeHtml, getUrlMode, setUrlMode, normalizeMode, renderShell } = CL;

  function renderHome() {
    return `
      <div style="font-weight:1000; color:#111827;">Welcome to Chess Light</div>
      <div class="cl-muted" style="margin-top:8px; line-height:1.7;">
        Place the required chess piece on a special board and use its moves to light up every square.
        When the entire board is lit, you win.
      </div>
    `;
  }

  function renderStage() {
    return `
      <div style="font-weight:1000; color:#111827;">Stage</div>
      <div class="cl-muted" style="margin-top:8px;">Coming soon.</div>
    `;
  }

  function renderChallenge() {
    return `
      <div style="font-weight:1000; color:#111827;">Challenge</div>
      <div class="cl-muted" style="margin-top:8px;">Coming soon.</div>
    `;
  }

  function renderSettings() {
    return `
      <div style="font-weight:1000; color:#111827;">Setting</div>
      <div class="cl-muted" style="margin-top:8px;">Coming soon.</div>
    `;
  }

  function renderBuilder() {
    return `
      <div style="font-weight:1000; color:#111827;">Builder</div>
      <div class="cl-muted" style="margin-top:8px;">Coming soon.</div>
    `;
  }

  window.initChessLight = async function initChessLight() {
    const root = document.getElementById("chessLightRoot");
    if (!root) return;

    const params = new URLSearchParams(window.location.search);
    const role = String(params.get("role") || "");
    const isTeacher = role.toLowerCase() === "teacher";

    const ui = {
      mode: normalizeMode(getUrlMode() || "home", isTeacher)
    };

    root.innerHTML = renderShell({ role, mode: ui.mode });

    let mainRenderToken = 0;
    const setMain = (html) => {
      const el = document.getElementById("clMain");
      if (!el) return Promise.resolve();
      const token = ++mainRenderToken;
      el.classList.add("cl-fade", "is-out");
      return new Promise((resolve) => {
        setTimeout(() => {
          if (token !== mainRenderToken) return resolve();
          try { el.innerHTML = html; } catch {}
          requestAnimationFrame(() => {
            if (token !== mainRenderToken) return resolve();
            try { el.classList.remove("is-out"); } catch {}
            setTimeout(resolve, 260);
          });
        }, 120);
      });
    };

    const rerenderShell = () => {
      root.innerHTML = renderShell({ role, mode: ui.mode });
      bindNav();
    };

    async function rerenderMain() {
      if (ui.mode === "home") return await setMain(renderHome());
      if (ui.mode === "stage") return await setMain(renderStage());
      if (ui.mode === "challenge") return await setMain(renderChallenge());
      if (ui.mode === "settings") return await setMain(renderSettings());
      if (!isTeacher) return await setMain(`<div class="cl-muted">Builder is for teachers only.</div>`);
      return await setMain(renderBuilder());
    }

    function bindNav() {
      root.querySelectorAll(".cl-nav-btn[data-cl-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = String(btn.getAttribute("data-cl-mode") || "").trim().toLowerCase();
          const normalized = normalizeMode(next, isTeacher);
          if (normalized === ui.mode) return;
          ui.mode = normalized;
          setUrlMode(ui.mode);
          rerenderShell();
          void rerenderMain();
        });
      });
    }

    bindNav();
    await rerenderMain();
  };
})();

