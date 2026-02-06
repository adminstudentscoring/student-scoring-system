// Chess Works main (teacher + student) - scaffold
(function () {
  "use strict";
  const CW = window.__ChessWorksCore;
  if (!CW) {
    console.error("[chess-works] Missing core.js (window.__ChessWorksCore).");
    return;
  }

  const { escapeHtml, getUrlMode, setUrlMode, normalizeMode, renderShell } = CW;

  window.initChessWorks = async function initChessWorks() {
    const root = document.getElementById("chessWorksRoot");
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
      const el = document.getElementById("cwMain");
      if (!el) return Promise.resolve();
      const token = ++mainRenderToken;
      el.classList.add("cw-fade", "is-out");
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
      if (ui.mode === "home") {
        await setMain(`
          <div style="font-weight:1000; color:var(--cw-ink);">Welcome to Chess Works</div>
          <div class="cw-muted" style="margin-top:8px; line-height:1.7;">
            Light-green themed scaffold. Next step: define gameplay + stage format.
          </div>
          <div style="display:flex; justify-content:flex-end; margin-top:14px;">
            <button type="button" class="cw-btn primary" data-cw-go-stage="1">Start</button>
          </div>
        `);
        const btn = root.querySelector("[data-cw-go-stage]");
        btn?.addEventListener("click", () => {
          ui.mode = "stage";
          setUrlMode(ui.mode);
          rerenderShell();
          void rerenderMain();
        }, { once: true });
        return;
      }
      if (ui.mode === "stage") {
        await setMain(`<div class="cw-muted">Stage coming soon.</div>`);
        return;
      }
      if (ui.mode === "challenge") {
        await setMain(`<div class="cw-muted">Coming soon.</div>`);
        return;
      }
      if (ui.mode === "settings") {
        await setMain(`<div class="cw-muted">Coming soon.</div>`);
        return;
      }
      // builder
      if (!isTeacher) {
        await setMain(`<div class="cw-muted">Builder is for teachers only.</div>`);
        return;
      }
      await setMain(`
        <div style="font-weight:1000; color:var(--cw-ink);">Builder</div>
        <div class="cw-muted" style="margin-top:8px;">Coming soon.</div>
      `);
    }

    function bindNav() {
      root.querySelectorAll(".cw-nav-btn[data-cw-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = String(btn.getAttribute("data-cw-mode") || "").trim().toLowerCase();
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

