/* Chess Solitaire app scaffold (UI + layout only for now) */
(function () {
  const Core = window.ChessSolitaireCore;
  if (!Core) {
    console.error("ChessSolitaireCore missing. Did core.js load?");
    return;
  }

  function getRole() {
    const v = Core.getUrlParam("role");
    const role = String(v || "").toLowerCase() === "teacher" ? "teacher" : "student";
    return role;
  }

  const ui = {
    role: getRole(),
    mode: Core.getUrlMode()
  };

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function setMain(html) {
    const el = document.getElementById("csMain");
    if (!el) return;
    el.classList.add("cs-fade", "is-out");
    await sleep(120);
    el.innerHTML = html;
    await sleep(0);
    el.classList.remove("is-out");
  }

  function rerenderShell() {
    const root = document.getElementById("chessSolitaireRoot");
    if (!root) return;
    root.innerHTML = Core.renderShell({ role: ui.role, mode: ui.mode });
  }

  function renderHome() {
    return `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="font-weight:950; font-size:16px;">Welcome to Chess Solitaire</div>
        <div style="color:var(--cs-muted); line-height:1.5;">
          This is a new game slot. Next step: define the rules + stage format, then we can add Stage lists and a Builder just like Maze Runner / Chess Light.
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button type="button" class="cs-btn primary" data-cs-action="goStage">Go to Stage</button>
          ${ui.role === "teacher" ? `<button type="button" class="cs-btn" data-cs-action="goBuilder">Open Builder</button>` : ""}
        </div>
      </div>
    `;
  }

  function renderPlaceholder(title, hint) {
    return `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="font-weight:950; font-size:16px;">${Core.escapeHtml(title)}</div>
        <div style="color:var(--cs-muted); line-height:1.5;">${Core.escapeHtml(hint)}</div>
      </div>
    `;
  }

  async function rerenderMain() {
    if (ui.mode === "home") {
      await setMain(renderHome());
      bindHomeHandlers();
      return;
    }
    if (ui.mode === "stage") {
      await setMain(renderPlaceholder("Stage", "Stage list + play view will be implemented next."));
      return;
    }
    if (ui.mode === "challenge") {
      await setMain(renderPlaceholder("Challenge", "Challenge mode will be implemented next."));
      return;
    }
    if (ui.mode === "builder") {
      await setMain(
        renderPlaceholder(
          "Builder",
          ui.role === "teacher"
            ? "Builder UI will be implemented next."
            : "Builder is teacher-only."
        )
      );
      return;
    }
    await setMain(renderPlaceholder("Setting", "Settings UI will be implemented next."));
  }

  function bindNav() {
    const root = document.getElementById("chessSolitaireRoot");
    if (!root) return;
    root.addEventListener("click", async (e) => {
      const btn = e.target && e.target.closest ? e.target.closest(".cs-nav-btn[data-cs-mode]") : null;
      if (!btn) return;
      const mode = Core.normalizeMode(btn.getAttribute("data-cs-mode"));
      if (mode === ui.mode) return;
      if (mode === "builder" && ui.role !== "teacher") return;
      ui.mode = mode;
      Core.setUrlMode(ui.mode);
      rerenderShell();
      await rerenderMain();
    });
  }

  function bindHomeHandlers() {
    const root = document.getElementById("chessSolitaireRoot");
    if (!root) return;
    const main = root.querySelector("#csMain");
    if (!main) return;
    const goStage = main.querySelector('[data-cs-action="goStage"]');
    if (goStage) {
      goStage.addEventListener("click", async () => {
        ui.mode = "stage";
        Core.setUrlMode(ui.mode);
        rerenderShell();
        await rerenderMain();
      });
    }
    const goBuilder = main.querySelector('[data-cs-action="goBuilder"]');
    if (goBuilder) {
      goBuilder.addEventListener("click", async () => {
        if (ui.role !== "teacher") return;
        ui.mode = "builder";
        Core.setUrlMode(ui.mode);
        rerenderShell();
        await rerenderMain();
      });
    }
  }

  async function initChessSolitaire() {
    const root = document.getElementById("chessSolitaireRoot");
    if (!root) {
      console.error("#chessSolitaireRoot not found");
      return;
    }
    rerenderShell();
    bindNav();
    await rerenderMain();
  }

  window.initChessSolitaire = initChessSolitaire;
})();

