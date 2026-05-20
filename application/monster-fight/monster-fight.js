(() => {
  // application/monster-fight/src/html-utils.js
  function escapeHtml(text) {
    const s = String(text ?? "");
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function renderIconWrap({ imgSrc, fallbackEmoji, alt, wrapClass }) {
    const src = String(imgSrc || "").trim();
    const fb = String(fallbackEmoji || "").trim() || "\u2753";
    const a = String(alt || "").trim() || "";
    const cls = String(wrapClass || "").trim();
    if (!src) {
      return `<span class="${cls}"><span class="mf-emoji-fallback">${escapeHtml(fb)}</span></span>`;
    }
    return `
      <span class="${cls}">
        <img class="mf-icon-img" src="${escapeHtml(src)}" alt="${escapeHtml(a)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';">
        <span class="mf-emoji-fallback" style="display:none;">${escapeHtml(fb)}</span>
      </span>
    `;
  }

  // application/monster-fight/src/images.js
  function getImagesBase() {
    try {
      if (window.location && window.location.protocol === "file:") return "images/";
    } catch {
    }
    return "/application/monster-fight/images/";
  }
  function imageSrcForFile(file) {
    const f = String(file || "").trim();
    if (!f) return "";
    const parts = f.split("/").filter(Boolean).map(encodeURIComponent);
    return `${getImagesBase()}${parts.join("/")}`;
  }
  function applyBackgroundTheme(theme) {
    const t = String(theme || "").trim() || "white";
    const body = document.body;
    if (!body) return;
    if (t === "image") {
      const url = imageSrcForFile("Background/Background.jpg") || "images/Background/Background.jpg";
      body.style.setProperty("--mf-bg-url", `url("${url}")`);
      body.classList.add("mf-bg-image");
      body.style.background = "";
      body.style.backgroundColor = "";
      return;
    }
    body.classList.remove("mf-bg-image");
    body.style.removeProperty("--mf-bg-url");
    body.style.background = "#ffffff";
  }

  // application/monster-fight/src/constants.js
  var POPUP_AUTO_CLOSE_MS = null;
  var MF_DISABLE_ACTION_POPUPS = true;
  var MF_REPLAY_STEP_MS = 900;
  var MF_UNIT_SCALE = 1.32;

  // application/monster-fight/src/game-legacy.js
  var GAME_API_BASE = typeof window !== "undefined" && typeof window.API_BASE !== "undefined" ? window.API_BASE : typeof API_CONFIG !== "undefined" ? API_CONFIG.baseURL : "/api";
  var gameState = null;
  var gameConfig = null;
  var playerClasses = [];
  var monsterTypes = [];
  var CLASS_ICON_MAP = {};
  var monsterIconMap = {};
  function classImageFileById(classId) {
    const cls = getPlayerClasses().find((c) => c.id === classId);
    const name = String(cls?.name || "").trim();
    if (!name) return "";
    return `${name}.png`;
  }
  function monsterImageFileByType(typeId) {
    const mt = getMonsterTypes().find((m) => m.id === typeId);
    const name = String(mt?.name || "").trim();
    if (!name) return "";
    return `${name}.png`;
  }
  function getPlayerClasses() {
    if (!Array.isArray(playerClasses)) {
      playerClasses = window.playerClasses || [];
    }
    return playerClasses;
  }
  function getMonsterTypes() {
    if (!Array.isArray(monsterTypes)) {
      monsterTypes = window.monsterTypes || [];
    }
    return monsterTypes;
  }
  function cacheIconMaps() {
    const classes = getPlayerClasses();
    const types = getMonsterTypes();
    classes.forEach((cls) => {
      CLASS_ICON_MAP[cls.id] = cls.emoji || "\u{1F3AF}";
    });
    monsterIconMap = {};
    types.forEach((type) => {
      monsterIconMap[type.id] = type.emoji || "\u{1F9DF}";
    });
  }
  var gameWs = null;
  var lastActionLogLength = 0;
  var actionQueue = [];
  var isShowingPopup = false;
  var actionLogCollapsed = true;
  var monsterTurnReplay = { active: false, pendingWsState: null, onDone: null };
  var mfPendingToast = null;
  function mfToast(text, opts = {}) {
    const msg = String(text || "").trim();
    if (!msg) return;
    const el = document.getElementById("mfBattleToast");
    if (!el) {
      mfPendingToast = { text: msg, opts };
      return;
    }
    mfShowBattleToast(msg, opts);
  }
  function mfGetBattleToastEl() {
    const el = document.getElementById("mfBattleToast");
    if (!el) return null;
    if (!el.querySelector(".mf-battle-toast-text")) {
      const t = document.createElement("div");
      t.className = "mf-battle-toast-text";
      const existing = el.textContent;
      if (existing) t.textContent = existing;
      el.textContent = "";
      el.appendChild(t);
    }
    if (!el.querySelector(".mf-battle-toast-next")) {
      const b = document.createElement("button");
      b.className = "mf-battle-toast-next";
      b.type = "button";
      b.textContent = "Next";
      el.appendChild(b);
    }
    return el;
  }
  var mfToastTimer = null;
  var mfToastNextHandler = null;
  function mfHideBattleToast() {
    const el = document.getElementById("mfBattleToast");
    if (!el) return;
    el.classList.remove("is-show");
    const nextBtn = el.querySelector(".mf-battle-toast-next");
    if (nextBtn) {
      nextBtn.style.display = "none";
      nextBtn.disabled = true;
      if (mfToastNextHandler) {
        try {
          nextBtn.removeEventListener("click", mfToastNextHandler);
        } catch {
        }
      }
    }
    mfToastNextHandler = null;
    if (mfToastTimer) clearTimeout(mfToastTimer);
    mfToastTimer = null;
    mfPendingToast = null;
  }
  function mfShowBattleToast(text, opts = {}) {
    const el = mfGetBattleToastEl();
    if (!el) return;
    const msg = String(text || "").trim();
    if (!msg) return;
    mfPendingToast = { text: msg, opts };
    const textEl = el.querySelector(".mf-battle-toast-text") || el;
    const nextBtn = el.querySelector(".mf-battle-toast-next");
    if (textEl) textEl.textContent = msg;
    el.classList.add("is-show");
    const wantNext = !!opts.next;
    if (nextBtn) {
      nextBtn.style.display = wantNext ? "inline-flex" : "none";
      nextBtn.disabled = !wantNext;
      if (mfToastNextHandler) {
        try {
          nextBtn.removeEventListener("click", mfToastNextHandler);
        } catch {
        }
      }
      mfToastNextHandler = typeof opts.onNext === "function" ? opts.onNext : null;
      if (mfToastNextHandler) nextBtn.addEventListener("click", mfToastNextHandler);
    }
    if (mfToastTimer) clearTimeout(mfToastTimer);
    if (!wantNext) {
      const ms = Math.max(300, Number(opts.ms) || Math.round(900 * (MF_ANIM_SLOW_FACTOR || 1)));
      mfToastTimer = setTimeout(() => {
        el.classList.remove("is-show");
        mfPendingToast = null;
      }, ms);
    }
  }
  function mfStripHtml(s) {
    return String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  }
  function mfToastTextFromRaw(raw) {
    const msg = mfStripHtml(raw);
    if (!msg) return "";
    let m = msg.match(/^(.+?)\s+attacks\s+(.+?)\s+for\s+(\d+)\s+damage/i);
    if (m) {
      const a = m[1].trim();
      const b = m[2].trim();
      const n = Number(m[3]) || 0;
      return `${a} attacks ${b} -${n}`;
    }
    m = msg.match(/^(.+?)\s+(?:casts|uses|unleashes|strikes|smashes|charges)\s+(.+?)\s+(?:on\s+)?(.+?)\s+for\s+(\d+)\s+damage/i);
    if (m) {
      const a = m[1].trim();
      const skill = m[2].trim();
      const b = m[3].trim();
      const n = Number(m[4]) || 0;
      return `${a} ${skill} ${b} -${n}`;
    }
    m = msg.match(/^(.+?)\s+.*heal(?:s|ing)?\s+(.+?)\s+for\s+(\d+)\s+HP/i);
    if (m) {
      const a = m[1].trim();
      const b = m[2].trim();
      const n = Number(m[3]) || 0;
      return `${a} heals ${b} +${n}`;
    }
    return msg;
  }
  var MF_RANGED_MONSTER_TYPES = /* @__PURE__ */ new Set(["shaman", "dark_mage", "evil_dragon"]);
  function mfSnapshotHpMaps(state) {
    const players = Array.isArray(state?.players) ? state.players : [];
    const monsters = Array.isArray(state?.monsters) ? state.monsters : [];
    const pHp = new Map(players.map((p) => [String(p?.studentId || ""), Number(p?.currentHP || 0)]));
    const mHp = new Map(monsters.map((m) => [String(m?.id || ""), Number(m?.currentHP || 0)]));
    return { pHp, mHp, players, monsters };
  }
  function mfFindMonsterByName(monsters, name) {
    const n = String(name || "").trim();
    if (!n) return null;
    return (monsters || []).find((m) => String(m?.name || "").trim() === n) || null;
  }
  function mfFindPlayerByName(players, name) {
    const n = String(name || "").trim();
    if (!n) return null;
    return (players || []).find((p) => String(p?.studentName || "").trim() === n) || null;
  }
  function mfDeriveMonsterAttackActorTarget(rawMessage, prevState, nextState) {
    const msg = String(rawMessage || "");
    const m = msg.match(/^(.+?)\s+attacks\s+(.+?)\s+for\s+(\d+)\s+damage/i);
    if (m) {
      const actorName = m[1];
      const targetName = m[2];
      const actor = mfFindMonsterByName(nextState?.monsters, actorName) || mfFindMonsterByName(prevState?.monsters, actorName);
      const target = mfFindPlayerByName(nextState?.players, targetName) || mfFindPlayerByName(prevState?.players, targetName);
      return { actor, target };
    }
    return { actor: null, target: null };
  }
  function mfReplayFxFromMonsterTurnStep(rawMessage, prevState, nextState) {
    try {
      const prev = mfSnapshotHpMaps(prevState);
      const next = mfSnapshotHpMaps(nextState);
      const deltas = [];
      next.players.forEach((p) => {
        const id = String(p?.studentId || "");
        if (!id) return;
        const before = prev.pHp.get(id);
        if (before === void 0) return;
        const after = Number(p?.currentHP || 0);
        const d = after - before;
        if (d !== 0) deltas.push({ kind: "player", id, name: p.studentName, delta: d });
      });
      const monsterDeltas = [];
      next.monsters.forEach((m) => {
        const id = String(m?.id || "");
        if (!id) return;
        const before = prev.mHp.get(id);
        if (before === void 0) return;
        const after = Number(m?.currentHP || 0);
        const d = after - before;
        if (d !== 0) monsterDeltas.push({ kind: "monster", id, name: m.name, delta: d, type: m.type });
      });
      const dmgPlayers = deltas.filter((d) => d.kind === "player" && d.delta < 0);
      const healPlayers = deltas.filter((d) => d.kind === "player" && d.delta > 0);
      const healMonsters = monsterDeltas.filter((d) => d.kind === "monster" && d.delta > 0);
      const { actor, target } = mfDeriveMonsterAttackActorTarget(rawMessage, prev, next);
      const actorKey = actor?.id ? `monster:${actor.id}` : null;
      const isRanged = !!(actor && MF_RANGED_MONSTER_TYPES.has(String(actor.type || "").trim()));
      const msg = String(rawMessage || "");
      const isDodged = /dodges/i.test(msg) || /dodge/i.test(msg);
      const tauntInMsg = /\(TAUNT\)|\(taunted\)|taunt/i.test(String(rawMessage || ""));
      if (tauntInMsg && target && String(target.characterClass || "") === "shield_warrior") {
        const shieldKey = `player:${target.studentId}`;
        const protectedAlly = (prev.players || []).filter((p) => p && p.isAlive && p.studentId !== target.studentId).reduce((best, p) => {
          if (!best) return p;
          return Number(p.currentHP || 0) < Number(best.currentHP || 0) ? p : best;
        }, null);
        if (protectedAlly) {
          mfAnimBlock(shieldKey, `player:${protectedAlly.studentId}`, { dur: 240 });
        }
      }
      if (dmgPlayers.length) {
        if (dmgPlayers.length > 1) {
          mfAnimShake(7, 260);
          dmgPlayers.forEach((ev) => {
            const tk = `player:${ev.id}`;
            if (actorKey) {
              mfAnimAddBeam(actorKey, tk, "rgba(255,60,60,0.95)", isRanged ? 10 : 8, 320);
            }
            mfAnimHit(tk, { blinks: 2, dur: 320, amp: 5 });
            mfAnimAddFloatAtUnit(tk, `${ev.delta}`, "rgba(255,60,60,0.95)", 4e3);
          });
        } else {
          const ev = dmgPlayers[0];
          const tk = `player:${ev.id}`;
          if (actorKey) {
            if (isRanged) mfAnimAddBeam(actorKey, tk, "rgba(255,60,60,0.95)", 6, 280);
            else mfAnimDash(actorKey, tk, { dur: 340, gap: 12 });
          }
          mfAnimHit(tk, { blinks: 2, dur: 260, amp: 4 });
          mfAnimAddFloatAtUnit(tk, `${ev.delta}`, "rgba(255,60,60,0.95)", 4e3);
        }
      } else if (actorKey && target && target.studentId) {
        const tk = `player:${target.studentId}`;
        if (isRanged) mfAnimAddBeam(actorKey, tk, "rgba(255,60,60,0.95)", 6, 280);
        else mfAnimDash(actorKey, tk, { dur: 340, gap: 12 });
        mfAnimHit(tk, { blinks: 2, dur: 260, amp: 4 });
        if (isDodged) mfAnimAddFloatAtUnit(tk, "DODGE", "rgba(255,255,255,0.92)", 2e3);
      }
      healPlayers.forEach((ev) => {
        const tk = `player:${ev.id}`;
        mfAnimAddFloatAtUnit(tk, `+${ev.delta}`, "rgba(34,197,94,0.95)", 4e3);
        mfAnimHit(tk, { blinks: 2, dur: 260, amp: 2 });
        mfAnimHealGlow(tk, { dur: 520 });
      });
      if (healMonsters.length) {
        let healerKey = null;
        const msg2 = String(rawMessage || "");
        const isShamanHeal = /shaman/i.test(msg2);
        if (isShamanHeal) {
          const monsters = Array.isArray(nextState?.monsters) ? nextState.monsters : [];
          const sh = monsters.find((m) => m && (String(m.type || "").toLowerCase() === "shaman" || /shaman/i.test(String(m.name || ""))) && m.isAlive);
          if (sh?.id) healerKey = `monster:${sh.id}`;
        }
        if (healerKey) {
          mfAnimSway(healerKey, { dur: 620, amp: 7 });
        }
        healMonsters.forEach((ev) => {
          const tk = `monster:${ev.id}`;
          if (healerKey) mfAnimAddBeam(healerKey, tk, "rgba(34,197,94,0.92)", 7, 360);
          mfAnimAddFloatAtUnit(tk, `+${ev.delta}`, "rgba(34,197,94,0.95)", 4e3);
          mfAnimHealGlow(tk, { dur: 620 });
        });
      }
    } catch (e) {
      console.warn("[mfReplayFx] failed", e);
    }
  }
  var charSelectUi = {};
  var hasAutoPickedDefaultCharacter = false;
  function getCharSelectState(studentId) {
    const id = String(studentId || "");
    if (!charSelectUi[id]) {
      charSelectUi[id] = { idx: 0 };
    }
    return charSelectUi[id];
  }
  function clampIndex(idx, len) {
    const n = Number(idx) || 0;
    const L = Number(len) || 0;
    if (L <= 0) return 0;
    return (n % L + L) % L;
  }
  async function charSelectPrev(studentId) {
    const st = getCharSelectState(studentId);
    const classes = getPlayerClasses();
    st.idx = clampIndex((st.idx || 0) - 1, classes.length);
    const clsId = classes[st.idx]?.id;
    if (clsId) {
      await selectCharacter(studentId, clsId);
      return;
    }
    renderCharacterSelection();
  }
  async function charSelectNext(studentId) {
    const st = getCharSelectState(studentId);
    const classes = getPlayerClasses();
    st.idx = clampIndex((st.idx || 0) + 1, classes.length);
    const clsId = classes[st.idx]?.id;
    if (clsId) {
      await selectCharacter(studentId, clsId);
      return;
    }
    renderCharacterSelection();
  }
  function charSelectSyncIndexToChosen(player) {
    const classes = getPlayerClasses();
    const st = getCharSelectState(player?.studentId);
    if (!classes.length) return;
    const chosenId = String(player?.characterClass || "");
    if (!chosenId) return;
    const idx = classes.findIndex((c) => String(c.id) === chosenId);
    if (idx >= 0) st.idx = idx;
  }
  window.charSelectPrev = charSelectPrev;
  window.charSelectNext = charSelectNext;
  var LEVEL_DIFFICULTY_PRESETS = {
    easy: [
      { monsters: [
        { type: "goblin", count: 1 },
        { type: "slime", count: 1 },
        { type: "brute", count: 1 },
        { type: "shaman", count: 1 }
      ] },
      { monsters: [
        { type: "goblin", count: 2 },
        { type: "dark_mage", count: 1 },
        { type: "brute", count: 2 },
        { type: "shaman", count: 2 }
      ] },
      { monsters: [
        { type: "goblin", count: 4 },
        { type: "dark_mage", count: 2 },
        { type: "brute", count: 2 },
        { type: "shaman", count: 2 },
        { type: "tiger", count: 1 }
      ] }
    ],
    medium: [
      { monsters: [
        { type: "goblin", count: 2 },
        { type: "slime", count: 2 },
        { type: "brute", count: 2 },
        { type: "shaman", count: 2 }
      ] },
      { monsters: [
        { type: "goblin", count: 4 },
        { type: "dark_mage", count: 2 },
        { type: "brute", count: 4 },
        { type: "shaman", count: 2 }
      ] },
      { monsters: [
        { type: "goblin", count: 6 },
        { type: "dark_mage", count: 3 },
        { type: "brute", count: 4 },
        { type: "shaman", count: 2 },
        { type: "dragon", count: 1 }
      ] }
    ],
    hard: [
      { monsters: [
        { type: "tiger", count: 1 },
        { type: "brute", count: 2 },
        { type: "shaman", count: 2 },
        { type: "dark_mage", count: 1 }
      ] },
      { monsters: [
        { type: "goblin", count: 4 },
        { type: "dragon", count: 1 },
        { type: "brute", count: 2 },
        { type: "dark_mage", count: 1 }
      ] },
      { monsters: [
        { type: "tiger", count: 1 },
        { type: "dragon", count: 2 },
        { type: "three_headed_wolf", count: 1 }
      ] }
    ]
  };
  function ensureActionPopupContainer() {
    if (!document.getElementById("actionPopupContainer")) {
      const container = document.createElement("div");
      container.id = "actionPopupContainer";
      container.className = "action-popup-container";
      document.body.appendChild(container);
    }
  }
  async function processActionQueue() {
    if (isShowingPopup) return;
    const item = actionQueue.shift();
    if (!item) {
      try {
        mfHideBattleToast();
      } catch {
      }
      if (monsterTurnReplay?.active && typeof monsterTurnReplay.onDone === "function") {
        try {
          monsterTurnReplay.onDone();
        } catch {
        }
        monsterTurnReplay.onDone = null;
      }
      return;
    }
    isShowingPopup = true;
    try {
      if (typeof item.beforeShow === "function") {
        await Promise.resolve(item.beforeShow());
      }
    } catch (e) {
      console.warn("[actionQueue] beforeShow failed", e);
    }
    if (MF_DISABLE_ACTION_POPUPS) {
      const raw = item?.context?.rawMessage || item?.message || "";
      const txt = mfToastTextFromRaw(raw);
      const autoProceed = !!item?.context?.autoProceed;
      if (autoProceed) {
        try {
          mfToast(txt, { ms: Math.round(MF_REPLAY_STEP_MS * (MF_ANIM_SLOW_FACTOR || 1)) });
        } catch {
        }
        const delay = Math.max(250, Math.round(MF_REPLAY_STEP_MS * (MF_ANIM_SLOW_FACTOR || 1)));
        setTimeout(() => {
          isShowingPopup = false;
          void processActionQueue();
        }, delay);
        return;
      }
      try {
        mfToast(txt, {
          next: true,
          onNext: () => {
            isShowingPopup = false;
            void processActionQueue();
          }
        });
      } catch {
      }
      return;
    }
    showActionPopup(item.message, item.summary, item.context || {});
  }
  function queueActionPopup(message, summary, context = {}, opts = {}) {
    if (!message) return;
    actionQueue.push({ message, summary, context, beforeShow: opts?.beforeShow });
    void processActionQueue();
  }
  function parseTargetValue(rawValue) {
    if (!rawValue) {
      return { type: null, id: null };
    }
    if (rawValue.indexOf(":") === -1) {
      return { type: "monster", id: rawValue };
    }
    const [type, ...rest] = rawValue.split(":");
    return { type, id: rest.join(":") };
  }
  function getSkillTargetType(player, skill) {
    if (!player || !skill) {
      return "monster";
    }
    if (player.characterClass === "priest") {
      if (skill.id === "active_1") {
        return "ally_alive";
      }
      if (skill.id === "active_2") {
        return "ally_dead";
      }
    }
    return "monster";
  }
  function statusLabel(status) {
    const t = String(status?.type || "").trim().toLowerCase();
    if (!t) return "";
    if (t === "poison") return "Poison";
    if (t === "bleed") return "Bleed";
    if (t === "bleeding_claw") return "Bleed";
    if (t === "silence") return "Silence";
    if (t === "stun") return "Stun";
    if (t === "freeze") return "Freeze";
    if (t === "attack") return "ATK\u2193";
    if (t === "regen") return "Regen";
    return t;
  }
  function applyMonsterTurnSnapshot(snapshot) {
    if (!snapshot || !gameState) return;
    try {
      if (snapshot.phase) gameState.phase = snapshot.phase;
      if (typeof snapshot.currentTurn === "number") gameState.currentTurn = snapshot.currentTurn;
      if (Array.isArray(snapshot.players)) gameState.players = snapshot.players;
      if (Array.isArray(snapshot.monsters)) gameState.monsters = snapshot.monsters;
      if (Array.isArray(snapshot.actionLog)) gameState.actionLog = snapshot.actionLog;
    } catch (e) {
      console.warn("[monster-turn] failed to apply snapshot", e);
    }
  }
  function showActionPopup(message, summary, context) {
    ensureActionPopupContainer();
    const container = document.getElementById("actionPopupContainer");
    if (!container) {
      isShowingPopup = false;
      return;
    }
    const popup = document.createElement("div");
    popup.className = "action-popup";
    popup.tabIndex = -1;
    const animationWrapper = document.createElement("div");
    animationWrapper.className = "action-popup-animation";
    const kind = String(context?.actionKind || "").trim();
    animationWrapper.classList.add(kind === "heal" ? "is-heal" : "is-attack");
    const actionTrail = document.createElement("div");
    actionTrail.className = "action-popup-trail";
    animationWrapper.appendChild(actionTrail);
    const actionArrow = document.createElement("div");
    actionArrow.className = "action-popup-arrow";
    animationWrapper.appendChild(actionArrow);
    const actorIcon = document.createElement("div");
    actorIcon.className = "action-popup-actor";
    if (context.actorImgSrc) {
      const fb = String(context.actorEmoji || "\u{1F3AD}");
      actorIcon.innerHTML = `<img class="mf-popup-icon" alt="" src="${escapeHtml(String(context.actorImgSrc))}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';"><span class="mf-popup-emoji" style="display:none;">${escapeHtml(fb)}</span>`;
    } else {
      actorIcon.textContent = context.actorEmoji || "\u{1F3AD}";
    }
    const targetIcon = document.createElement("div");
    targetIcon.className = "action-popup-target";
    if (context.targetImgSrc) {
      const fb = String(context.targetEmoji || "\u{1F3AF}");
      targetIcon.innerHTML = `<img class="mf-popup-icon" alt="" src="${escapeHtml(String(context.targetImgSrc))}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';"><span class="mf-popup-emoji" style="display:none;">${escapeHtml(fb)}</span>`;
    } else {
      targetIcon.textContent = context.targetEmoji || "\u{1F3AF}";
    }
    animationWrapper.appendChild(actorIcon);
    animationWrapper.appendChild(targetIcon);
    const text = document.createElement("div");
    text.className = "action-popup-text";
    text.innerHTML = message.replace(/\n/g, "<br>");
    popup.appendChild(animationWrapper);
    popup.appendChild(text);
    if (summary && Array.isArray(summary) && summary.length > 0) {
      const summaryList = document.createElement("div");
      summaryList.className = "action-popup-summary";
      summary.forEach((line) => {
        const item = document.createElement("div");
        item.className = "action-popup-summary-item";
        item.innerHTML = line.replace(/\n/g, "<br>");
        summaryList.appendChild(item);
      });
      popup.appendChild(summaryList);
    }
    const buttonRow = document.createElement("div");
    buttonRow.className = "action-popup-buttons";
    const confirmBtn = document.createElement("button");
    confirmBtn.className = "action-popup-confirm";
    confirmBtn.textContent = "OK";
    buttonRow.appendChild(confirmBtn);
    popup.appendChild(buttonRow);
    container.appendChild(popup);
    popup.focus();
    const closePopup = () => {
      popup.classList.add("hide");
      setTimeout(() => {
        popup.remove();
        isShowingPopup = false;
        void processActionQueue();
      }, 300);
    };
    confirmBtn.addEventListener("click", closePopup);
    popup.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        closePopup();
      }
    });
    if (typeof POPUP_AUTO_CLOSE_MS === "number" && POPUP_AUTO_CLOSE_MS > 0) {
      setTimeout(() => {
        if (document.body.contains(popup)) {
          closePopup();
        }
      }, POPUP_AUTO_CLOSE_MS);
    }
  }
  function initGameWebSocket() {
    ensureActionPopupContainer();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    gameWs = new WebSocket(`${protocol}//${window.location.host}`);
    gameWs.onmessage = (event2) => {
      const data = JSON.parse(event2.data);
      if (data.type === "gameStateUpdated") {
        if (monsterTurnReplay && monsterTurnReplay.active) {
          try {
            monsterTurnReplay.pendingWsState = data.gameState;
          } catch {
          }
          return;
        }
        const activeElement = document.activeElement;
        const isUserInteracting = activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "SELECT" || activeElement.id?.startsWith("puzzle_") || activeElement.id?.startsWith("target_"));
        const previousMonsters = gameState.monsters ? [...gameState.monsters] : null;
        const inputValues = {};
        const selectValues = {};
        if (gameState.players) {
          gameState.players.forEach((player) => {
            const input = document.getElementById(`puzzle_${player.studentId}`);
            if (input) {
              inputValues[player.studentId] = input.value;
            }
            const select = document.getElementById(`target_${player.studentId}`);
            if (select) {
              selectValues[player.studentId] = select.value;
            }
          });
        }
        gameState = data.gameState;
        if (previousMonsters && previousMonsters.length > 0 && gameState.monsters) {
          const previousMap = new Map(previousMonsters.map((monster) => [monster.id, monster]));
          const merged = gameState.monsters.map((serverMonster) => {
            const existing = previousMap.get(serverMonster.id);
            if (existing) {
              if (serverMonster.currentHP > existing.currentHP) {
                console.log(`[WebSocket] Monster ${serverMonster.name} healed: ${existing.currentHP} -> ${serverMonster.currentHP}`);
              }
              return { ...existing, ...serverMonster };
            }
            console.log("[WebSocket] New monster detected:", serverMonster);
            return serverMonster;
          });
          gameState.monsters = merged;
        }
        if (gameState.players) {
          gameState.players.forEach((player) => {
            if (inputValues[player.studentId] !== void 0) {
              player.puzzlePoints = parseInt(inputValues[player.studentId]) || 0;
            }
          });
        }
        const currentLogLength = Array.isArray(gameState.actionLog) ? gameState.actionLog.length : 0;
        if (currentLogLength > lastActionLogLength) {
          const newLogs = gameState.actionLog.slice(lastActionLogLength);
          newLogs.forEach((log) => {
            if (log && log.message) {
              const summary = Array.isArray(log.summaryDetails) ? decorateSummaryLines(log.summaryDetails) : null;
              const context = derivePopupContext(log.message);
              const decoratedMessage = decorateMessageWithIcons(log.message);
              if (!MF_DISABLE_ACTION_POPUPS) {
                queueActionPopup(decoratedMessage, summary, context);
              }
            }
          });
        }
        lastActionLogLength = currentLogLength;
        if (isUserInteracting) {
          console.log("User is interacting, delaying re-render to preserve focus");
          return;
        }
        const focusedElementId = activeElement?.id;
        const focusedElementTag = activeElement?.tagName;
        renderGame();
        if (focusedElementId && (focusedElementTag === "INPUT" || focusedElementTag === "SELECT")) {
          setTimeout(() => {
            const element = document.getElementById(focusedElementId);
            if (element) {
              element.focus();
              if (focusedElementTag === "INPUT") {
                element.setSelectionRange(element.value.length, element.value.length);
              }
              if (focusedElementTag === "SELECT" && selectValues[element.id.replace("target_", "")]) {
                element.value = selectValues[element.id.replace("target_", "")];
              }
              console.log("Focus restored to:", focusedElementId);
            }
          }, 0);
        }
      } else if (data.type === "gameConfigUpdated") {
        gameConfig = data.config;
        playerClasses = Array.isArray(data.playerClasses) ? data.playerClasses : playerClasses || [];
        monsterTypes = Array.isArray(data.monsterTypes) ? data.monsterTypes : monsterTypes || [];
        cacheIconMaps();
        window.playerClasses = playerClasses;
        window.monsterTypes = monsterTypes;
      }
    };
    gameWs.onerror = (error) => {
      console.error("Game WebSocket error:", error);
    };
    gameWs.onclose = () => {
      console.log("Game WebSocket closed, reconnecting...");
      setTimeout(initGameWebSocket, 3e3);
    };
  }
  async function loadGameConfig() {
    try {
      console.log("Fetching game config from:", `${GAME_API_BASE}/game/config`);
      const response = await fetch(`${GAME_API_BASE}/game/config`);
      if (!response.ok) {
        throw new Error(`Failed to load game config: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      gameConfig = data.config;
      playerClasses = Array.isArray(data.playerClasses) ? data.playerClasses : [];
      monsterTypes = Array.isArray(data.monsterTypes) ? data.monsterTypes : [];
      cacheIconMaps();
      window.playerClasses = playerClasses;
      window.monsterTypes = monsterTypes;
      applyBackgroundTheme(gameConfig?.backgroundTheme || "image");
      console.log("Game config loaded successfully");
      console.log(`Loaded ${playerClasses.length} player classes and ${monsterTypes.length} monster types`);
    } catch (error) {
      console.error("Error loading game config:", error);
      throw error;
    }
  }
  async function loadGameState() {
    try {
      console.log("Fetching game state from:", `${GAME_API_BASE}/game/state`);
      const response = await fetch(`${GAME_API_BASE}/game/state`);
      if (response.status === 404) {
        console.log("No game state found (404)");
        return null;
      }
      if (!response.ok) {
        throw new Error(`Failed to load game state: ${response.status} ${response.statusText}`);
      }
      const state = await response.json();
      console.log("Game state loaded successfully");
      return state;
    } catch (error) {
      console.error("Error loading game state:", error);
      return null;
    }
  }
  async function initMonsterFight() {
    try {
      console.log("Initializing Monster Fight game...");
      const container = document.getElementById("monsterFightGame");
      if (!container) {
        console.error("Game container not found");
        return;
      }
      container.innerHTML = "<p>Loading game configuration...</p>";
      await loadGameConfig();
      console.log("Game config loaded:", gameConfig);
      container.innerHTML = "<p>Loading game state...</p>";
      const state = await loadGameState();
      if (!state) {
        console.error("No game state found");
        container.innerHTML = `
                <div style="padding: 20px; text-align: center;">
                    <h3>No Active Game</h3>
                    <p>No active game found. Start a new game from Teacher \u2192 App (Monster Fight).</p>
                    <button class="btn btn-primary" onclick="window.location.reload()">Refresh</button>
                </div>
            `;
        return;
      }
      console.log("Game state loaded:", state);
      gameState = state;
      lastActionLogLength = Array.isArray(gameState.actionLog) ? gameState.actionLog.length : 0;
      ensureActionPopupContainer();
      initGameWebSocket();
      renderGame();
    } catch (error) {
      console.error("Error initializing game:", error);
      const container = document.getElementById("monsterFightGame");
      if (container) {
        container.innerHTML = `
                <div style="padding: 20px; text-align: center; color: red;">
                    <h3>Error Loading Game</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="window.location.reload()">Refresh</button>
                </div>
            `;
      }
    }
  }
  var mfCanvasToken = 0;
  var mfCanvasRaf = 0;
  var mfCanvasResizeHandler = null;
  var mfImgCache = /* @__PURE__ */ new Map();
  var mfScene = {
    stageW: 0,
    stageH: 0,
    units: []
    // [{ key, kind, id, x,y,w,h,isAlive,name }]
  };
  var mfLastAliveByKey = /* @__PURE__ */ new Map();
  var mfDeathFxByKey = /* @__PURE__ */ new Map();
  var mfBattleUi = {
    selectedPlayerId: null,
    selectedMonsterId: null,
    targeting: null,
    // { actorId, action: 'attack'|'skill', skillId?, targetType: 'monster'|'ally_alive'|'ally_dead' }
    ptsDraft: {},
    // studentId -> number
    hoveredKey: null,
    reviveDraft: {},
    // studentId -> number
    _lastHealToastAt: 0
  };
  var mfAnim = {
    beams: [],
    // { fromKey, toKey, color, width, t0, dur }
    floats: [],
    // { x, y, text, color, t0, dur, rise }
    dashes: [],
    // { attKey, fromKey, toKey, t0, dur, reach }
    blocks: [],
    // { blockerKey, victimKey, t0, dur, reach }
    flashes: /* @__PURE__ */ new Map(),
    // key -> { t0, dur, blinks }
    jitters: /* @__PURE__ */ new Map(),
    // key -> { t0, dur, amp }
    flips: /* @__PURE__ */ new Map(),
    // key -> { t0, dur, flips }
    sways: /* @__PURE__ */ new Map(),
    // key -> { t0, dur, amp } (horizontal sway)
    healGlows: /* @__PURE__ */ new Map(),
    // key -> { t0, dur } (green glow)
    hpHold: /* @__PURE__ */ new Map(),
    // key -> { cur, until }
    shake: null
    // { t0, dur, amp }
  };
  var MF_ANIM_SLOW_FACTOR = 3;
  function mfNow() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }
  function mfAnimMs(ms) {
    const n = Number(ms) || 0;
    return Math.max(0, Math.round(n * (MF_ANIM_SLOW_FACTOR || 1)));
  }
  function mfFindUnitByKey(key) {
    const k = String(key || "");
    return (mfScene.units || []).find((u) => u && u.key === k) || null;
  }
  function mfUnitCenter(key) {
    const u = mfFindUnitByKey(key);
    if (!u) return null;
    return { x: u.x, y: u.y };
  }
  function mfAnimPurge(now) {
    mfAnim.beams = mfAnim.beams.filter((b) => now - b.t0 <= b.dur);
    mfAnim.floats = mfAnim.floats.filter((f) => now - f.t0 <= f.dur);
    mfAnim.dashes = mfAnim.dashes.filter((d) => now - d.t0 <= d.dur);
    mfAnim.blocks = mfAnim.blocks.filter((d) => now - d.t0 <= d.dur);
    for (const [k, v] of mfAnim.flashes.entries()) {
      if (now - v.t0 > v.dur) mfAnim.flashes.delete(k);
    }
    for (const [k, v] of mfAnim.jitters.entries()) {
      if (now - v.t0 > v.dur) mfAnim.jitters.delete(k);
    }
    for (const [k, v] of mfAnim.flips.entries()) {
      if (now - v.t0 > v.dur) mfAnim.flips.delete(k);
    }
    for (const [k, v] of mfAnim.sways.entries()) {
      if (now - v.t0 > v.dur) mfAnim.sways.delete(k);
    }
    for (const [k, v] of mfAnim.healGlows.entries()) {
      if (now - v.t0 > v.dur) mfAnim.healGlows.delete(k);
    }
    for (const [k, v] of mfAnim.hpHold.entries()) {
      if (now > v.until) mfAnim.hpHold.delete(k);
    }
    if (mfAnim.shake && now - mfAnim.shake.t0 > mfAnim.shake.dur) mfAnim.shake = null;
  }
  function mfAnimAddFloatAtUnit(key, text, color, dur = 4e3, opts = {}) {
    const c = mfUnitCenter(key);
    if (!c) return;
    const delayMs = Math.max(0, Number(opts?.delayMs) || 0);
    mfAnim.floats.push({
      x: Number(c.x) || 0,
      y: Number(c.y - 18) || 0,
      text: String(text || ""),
      color: color || "rgba(255,60,60,0.95)",
      t0: mfNow() + delayMs,
      dur,
      rise: 34
    });
  }
  function mfAnimAddBeam(fromKey, toKey, color = "rgba(255,60,60,0.95)", width = 5, dur = 260) {
    const w = Math.max(1, Math.round((Number(width) || 5) * 3));
    mfAnim.beams.push({ fromKey: String(fromKey || ""), toKey: String(toKey || ""), color, width: w, t0: mfNow(), dur: mfAnimMs(dur) });
  }
  function mfAnimHit(targetKey, opts = {}) {
    const k = String(targetKey || "");
    const delayMs = Math.max(0, Number(opts?.delayMs) || 0);
    const t0 = mfNow() + delayMs;
    mfAnim.flashes.set(k, { t0, dur: mfAnimMs(opts.dur ?? 260), blinks: opts.blinks ?? 2 });
    mfAnim.jitters.set(k, { t0, dur: mfAnimMs(opts.jitterDur ?? 260), amp: opts.amp ?? 3 });
  }
  function mfAnimDash(attKey, toKey, opts = {}) {
    mfAnim.dashes.push({
      attKey: String(attKey || ""),
      fromKey: String(attKey || ""),
      toKey: String(toKey || ""),
      t0: mfNow(),
      dur: mfAnimMs(opts.dur ?? 320),
      reach: opts.reach ?? 1,
      gap: opts.gap ?? 10
    });
  }
  function mfAnimBlock(blockerKey, victimKey, opts = {}) {
    mfAnim.blocks.push({
      blockerKey: String(blockerKey || ""),
      victimKey: String(victimKey || ""),
      t0: mfNow(),
      dur: mfAnimMs(opts.dur ?? 240),
      reach: opts.reach ?? 1,
      gap: opts.gap ?? 6
    });
  }
  function mfAnimFlip(key, flips = 3, dur = 420) {
    mfAnim.flips.set(String(key || ""), { t0: mfNow(), dur: mfAnimMs(dur), flips });
  }
  function mfAnimSway(key, opts = {}) {
    const k = String(key || "");
    mfAnim.sways.set(k, {
      t0: mfNow(),
      dur: mfAnimMs(opts.dur ?? 520),
      amp: Number(opts.amp ?? 6) || 6
    });
  }
  function mfAnimHealGlow(key, opts = {}) {
    const k = String(key || "");
    mfAnim.healGlows.set(k, { t0: mfNow(), dur: mfAnimMs(opts.dur ?? 520) });
  }
  function mfAnimShake(amp = 6, dur = 240) {
    mfAnim.shake = { t0: mfNow(), dur: mfAnimMs(dur), amp };
  }
  function mfAnimOffsetForKey(key, now) {
    const k = String(key || "");
    let dx = 0, dy = 0;
    for (const d of mfAnim.dashes) {
      if (d.attKey !== k) continue;
      const fromU = mfFindUnitByKey(d.fromKey);
      const toU = mfFindUnitByKey(d.toKey);
      const from = fromU ? { x: fromU.x, y: fromU.y } : null;
      const to = toU ? { x: toU.x, y: toU.y } : null;
      if (!from || !to) continue;
      const t = (now - d.t0) / d.dur;
      if (t < 0 || t > 1) continue;
      const ease = t < 0.5 ? t / 0.5 : 1 - (t - 0.5) / 0.5;
      const vx = to.x - from.x;
      const vy = to.y - from.y;
      const len = Math.max(1, Math.hypot(vx, vy));
      const attW = Number(fromU?.w) || 76 * MF_UNIT_SCALE;
      const tgtW = Number(toU?.w) || 76 * MF_UNIT_SCALE;
      const gap = Number(d.gap) || 10;
      const stop = Math.max(0, len - (attW / 2 + tgtW / 2 + gap));
      const move = Math.min(len, stop) * (Number(d.reach) || 1) * ease;
      dx += vx / len * move;
      dy += vy / len * move;
    }
    for (const b of mfAnim.blocks) {
      if (b.blockerKey !== k) continue;
      const fromU = mfFindUnitByKey(b.blockerKey);
      const toU = mfFindUnitByKey(b.victimKey);
      const from = fromU ? { x: fromU.x, y: fromU.y } : null;
      const to = toU ? { x: toU.x, y: toU.y } : null;
      if (!from || !to) continue;
      const t = (now - b.t0) / b.dur;
      if (t < 0 || t > 1) continue;
      const ease = Math.min(1, Math.max(0, t));
      const vx = to.x - from.x;
      const vy = to.y - from.y;
      const len = Math.max(1, Math.hypot(vx, vy));
      const blkW = Number(fromU?.w) || 76 * MF_UNIT_SCALE;
      const vicW = Number(toU?.w) || 76 * MF_UNIT_SCALE;
      const gap = Number(b.gap) || 6;
      const stop = Math.max(0, len - (blkW / 2 + vicW / 2 + gap));
      const move = Math.min(len, stop) * (Number(b.reach) || 1) * ease;
      dx += vx / len * move;
      dy += vy / len * move;
    }
    const jit = mfAnim.jitters.get(k);
    if (jit) {
      const t = (now - jit.t0) / jit.dur;
      if (t >= 0 && t <= 1) {
        const a = (1 - t) * (Number(jit.amp) || 3);
        dx += Math.sin(now / 18) * a;
        dy += Math.cos(now / 22) * a;
      }
    }
    const sway = mfAnim.sways.get(k);
    if (sway) {
      const t = (now - sway.t0) / sway.dur;
      if (t >= 0 && t <= 1) {
        const a = (1 - t) * (Number(sway.amp) || 6);
        dx += Math.sin(now / 70) * a;
      }
    }
    return { dx, dy };
  }
  function mfAnimFlashAlpha(key, now) {
    const fx = mfAnim.flashes.get(String(key || ""));
    if (!fx) return 1;
    const t = (now - fx.t0) / fx.dur;
    if (t < 0 || t > 1) return 1;
    const blinks = Math.max(1, Number(fx.blinks) || 2);
    const phase = Math.floor(t * blinks * 2);
    return phase % 2 === 0 ? 1 : 0.35;
  }
  function mfAnimIsFlipped(key, now) {
    const fx = mfAnim.flips.get(String(key || ""));
    if (!fx) return false;
    const t = (now - fx.t0) / fx.dur;
    if (t < 0 || t > 1) return false;
    const flips = Math.max(1, Number(fx.flips) || 3);
    const phase = Math.floor(t * flips * 2);
    return phase % 2 === 1;
  }
  function mfDrawAnim(ctx, now) {
    mfAnimPurge(now);
    for (const b of mfAnim.beams) {
      const from = mfUnitCenter(b.fromKey);
      const to = mfUnitCenter(b.toKey);
      if (!from || !to) continue;
      const age = now - b.t0;
      const t = Math.max(0, Math.min(1, age / b.dur));
      const a = (1 - t) * 0.95;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.globalAlpha = a * 0.75;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = Math.max(1, b.width - 2);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    }
    for (const f of mfAnim.floats) {
      const age = now - f.t0;
      const t = Math.max(0, Math.min(1, age / f.dur));
      const a = 1 - t;
      const y = f.y - (Number(f.rise) || 28) * t;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = "900 14px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.fillStyle = f.color;
      ctx.strokeText(String(f.text), f.x, y);
      ctx.fillText(String(f.text), f.x, y);
      ctx.restore();
    }
  }
  function loadImg(src) {
    const s = String(src || "").trim();
    if (!s) return Promise.resolve(null);
    const cached = mfImgCache.get(s);
    if (cached && cached.ok && cached.img?.complete) return Promise.resolve(cached.img);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        mfImgCache.set(s, { img, ok: true });
        resolve(img);
      };
      img.onerror = () => {
        mfImgCache.set(s, { img, ok: false });
        resolve(null);
      };
      img.src = s;
    });
  }
  function getImgSync(src) {
    const s = String(src || "").trim();
    if (!s) return null;
    const cached = mfImgCache.get(s);
    if (cached && cached.ok && cached.img?.complete) return cached.img;
    if (!cached) {
      void loadImg(s);
    }
    return null;
  }
  function layoutSide(list, baseX, sideSign, top, height, opts = {}) {
    const n = list.length;
    if (n === 0) return [];
    const columns = n > 5 ? 2 : 1;
    const rows = Math.ceil(n / columns);
    const yStep = height / (rows + 1);
    const colGap = Number(opts?.colGap) || 90;
    const out = [];
    for (let i = 0; i < n; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = baseX + sideSign * col * colGap;
      const y = top + (row + 1) * yStep;
      out.push({ ...list[i], x, y });
    }
    return out;
  }
  function drawHpBar(ctx, x, y, w, h, pct, text) {
    const p = Math.max(0, Math.min(1, pct));
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = "rgba(90, 200, 90, 0.95)";
    ctx.fillRect(x - w / 2, y - h / 2, w * p, h);
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);
    if (text) {
      ctx.font = "900 9px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      const s = String(text);
      ctx.strokeText(s, x, y + 0.5);
      ctx.fillText(s, x, y + 0.5);
    }
    ctx.restore();
  }
  function drawUnit(ctx, unit, now) {
    const {
      key,
      x,
      y,
      imgSrc,
      name,
      currentHP,
      maxHP,
      isAlive = true,
      isMonster = false
    } = unit;
    const off = mfAnimOffsetForKey(key, now);
    const ux = x + off.dx;
    const uy = y + off.dy;
    const w = Math.round(76 * MF_UNIT_SCALE);
    const h = Math.round(76 * MF_UNIT_SCALE);
    const img = getImgSync(imgSrc);
    if (key) {
      const prevAlive = mfLastAliveByKey.get(key);
      if (prevAlive === true && !isAlive) {
        mfDeathFxByKey.set(key, { t0: now });
      }
      mfLastAliveByKey.set(key, !!isAlive);
      if (isAlive) {
        mfDeathFxByKey.delete(key);
      }
    }
    ctx.save();
    if (!isAlive) {
      const fx = key ? mfDeathFxByKey.get(key) : null;
      const age = fx ? now - fx.t0 : 999999;
      const flashMs = 520;
      if (fx && age < flashMs) {
        const t = Math.floor(age / 80);
        ctx.globalAlpha = t % 2 === 0 ? 1 : 0.15;
      } else {
        ctx.globalAlpha = 0.35;
        try {
          ctx.filter = "grayscale(1)";
        } catch {
        }
      }
    }
    const hg = mfAnim.healGlows.get(String(key || ""));
    if (hg) {
      const t = (now - hg.t0) / hg.dur;
      if (t >= 0 && t <= 1) {
        const a = (1 - t) * 0.55;
        ctx.save();
        ctx.globalAlpha *= a;
        ctx.fillStyle = "rgba(34,197,94,0.35)";
        try {
          ctx.shadowColor = "rgba(34,197,94,0.8)";
          ctx.shadowBlur = Math.max(6, Math.round(18 * MF_UNIT_SCALE));
        } catch {
        }
        const r = Math.max(18, Math.round(w * 0.55));
        ctx.beginPath();
        ctx.arc(ux, uy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    if (img) {
      ctx.globalAlpha *= mfAnimFlashAlpha(key, now);
      const flipped = mfAnimIsFlipped(key, now);
      if (flipped) {
        ctx.save();
        ctx.translate(ux, uy);
        ctx.scale(-1, 1);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(img, ux - w / 2, uy - h / 2, w, h);
      }
    } else {
      ctx.fillStyle = isMonster ? "rgba(255,80,80,0.55)" : "rgba(80,160,255,0.55)";
      ctx.beginPath();
      ctx.arc(ux, uy, 28, 0, Math.PI * 2);
      ctx.fill();
    }
    const hold = key ? mfAnim.hpHold.get(String(key)) : null;
    const hpCur = hold && now < hold.until ? hold.cur : currentHP;
    const pct = maxHP > 0 ? Number(hpCur || 0) / Number(maxHP || 1) : 0;
    const hpW = Math.round(72 * MF_UNIT_SCALE);
    const hpH = 9;
    const hpX = ux;
    const hpY = uy + h / 2 + 6;
    const hpText = `${escapeHtml(String(hpCur || 0))}/${escapeHtml(String(maxHP || 0))}`;
    drawHpBar(ctx, hpX, hpY, hpW, hpH, pct, hpText);
    const acted = !!(!isMonster && unit?.raw?.hasActed);
    if (acted) {
      ctx.save();
      ctx.font = "900 12px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.fillStyle = "rgba(34, 197, 94, 0.95)";
      ctx.strokeText("\u2713", hpX - hpW / 2 - 10, hpY);
      ctx.fillText("\u2713", hpX - hpW / 2 - 10, hpY);
      ctx.restore();
    }
    const statuses = mfExtractStatusesWithPassives(unit.raw || unit);
    drawStatusIcons(ctx, hpX + hpW / 2 + 6, hpY, statuses);
    ctx.restore();
  }
  function drawBattleEntities(ctx, stageW, stageH) {
    if (!gameState) return;
    const playersAll = Array.isArray(gameState.players) ? gameState.players.filter((p) => p) : [];
    const monstersAll = Array.isArray(gameState.monsters) ? gameState.monsters.filter((m) => m) : [];
    const top = 90;
    const bottom = Math.max(top + 200, stageH - 90);
    const arenaH = Math.max(240, bottom - top);
    const monstersBaseX = stageW * 0.38;
    const playersBaseX = stageW * 0.62;
    const monsters = layoutSide(
      monstersAll.map((m) => ({
        key: `monster:${m.id}`,
        isMonster: true,
        isAlive: m.isAlive,
        id: m.id,
        name: m.name,
        currentHP: m.currentHP,
        maxHP: m.maxHP,
        raw: m,
        imgSrc: imageSrcForFile(monsterImageFileByType(m.type))
      })),
      monstersBaseX,
      -1,
      top,
      arenaH
    );
    const players = layoutSide(
      playersAll.map((p) => ({
        key: `player:${p.studentId}`,
        isMonster: false,
        isAlive: p.isAlive,
        id: p.studentId,
        name: p.studentName,
        currentHP: p.currentHP,
        maxHP: p.maxHP,
        raw: p,
        imgSrc: imageSrcForFile(classImageFileById(p.characterClass))
      })),
      playersBaseX,
      1,
      top,
      arenaH,
      { colGap: 100 }
      // +10px between left/right player columns
    );
    const spriteW = Math.round(76 * MF_UNIT_SCALE);
    const spriteH = Math.round(76 * MF_UNIT_SCALE);
    mfScene.stageW = stageW;
    mfScene.stageH = stageH;
    mfScene.units = [
      ...monsters.map((u) => ({ ...u, kind: "monster", w: spriteW, h: spriteH })),
      ...players.map((u) => ({ ...u, kind: "player", w: spriteW, h: spriteH }))
    ];
    const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    monsters.forEach((u) => drawUnit(ctx, u, now));
    players.forEach((u) => drawUnit(ctx, u, now));
    const hoveredKey = mfBattleUi?.hoveredKey;
    if (hoveredKey) {
      const u = (mfScene.units || []).find((it) => it && it.key === hoveredKey);
      if (u && u.name) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "900 14px Segoe UI, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.78)";
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 4;
        ctx.strokeText(String(u.name), u.x, u.y);
        ctx.fillText(String(u.name), u.x, u.y);
        ctx.restore();
      }
    }
  }
  function mfGetStageEl() {
    return document.querySelector(".mf-battle-stage");
  }
  function mfGetHudEl() {
    return document.getElementById("mfBattleHud");
  }
  function mfClamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }
  function mfHitTestUnit(stageX, stageY) {
    const units = Array.isArray(mfScene.units) ? mfScene.units : [];
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];
      const w = Number(u.w) || 0;
      const h = Number(u.h) || 0;
      if (!w || !h) continue;
      if (stageX >= u.x - w / 2 && stageX <= u.x + w / 2 && stageY >= u.y - h / 2 && stageY <= u.y + h / 2) {
        return u;
      }
    }
    return null;
  }
  function mfSkillTargetType(skill) {
    const e = skill && typeof skill === "object" ? skill.effect || {} : {};
    if (e && e.revive) return "ally_dead";
    if (e && (e.heal || e.teamHeal || e.healPercent)) return "ally_alive";
    return "monster";
  }
  function mfIsAoeSkill(player, skill) {
    if (!skill || typeof skill !== "object") return false;
    const e = skill.effect && typeof skill.effect === "object" ? skill.effect : {};
    if (e.aoe || e.allEnemies || e.area || e.teamDamage || e.damageAll || e.hitAll || e.areaDamage) return true;
    const cls = String(player?.characterClass || "").toLowerCase();
    const nm = String(skill.name || skill.id || "").toLowerCase();
    const desc = String(skill.description || "").toLowerCase();
    if (cls === "wizard" && (nm.includes("fireball") || desc.includes("fireball"))) return true;
    if (desc.includes("all enemies") || desc.includes("all enemy") || desc.includes("area damage")) return true;
    return false;
  }
  function mfStatusIcon(status) {
    const t = String(status?.type || "").trim().toLowerCase();
    if (!t) return null;
    if (t === "taunt") return { key: "taunt", ch: "\u{1F6E1}\uFE0F" };
    if (t === "poison") return { key: "poison", ch: "\u2620\uFE0F" };
    if (t === "bleed" || t === "bleeding_claw") return { key: "bleed", ch: "\u{1FA78}" };
    if (t === "silence") return { key: "silence", ch: "\u{1F92B}" };
    if (t === "stun") return { key: "stun", ch: "\u{1F4AB}" };
    if (t === "freeze") return { key: "freeze", ch: "\u2744\uFE0F" };
    if (t === "burn") return { key: "burn", ch: "\u{1F525}" };
    if (t === "regen") return { key: "regen", ch: "\u{1F49A}" };
    if (t === "attack") return { key: "atkdown", ch: "\u2B07\uFE0F" };
    return { key: t, ch: t.slice(0, 1).toUpperCase() };
  }
  function mfExtractStatuses(entity) {
    const arr = Array.isArray(entity?.statuses) ? entity.statuses : [];
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const s of arr) {
      const t = String(s?.type || "").trim().toLowerCase();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(s);
      if (out.length >= 6) break;
    }
    return out;
  }
  function mfHasStatus(entity, type) {
    const want = String(type || "").trim().toLowerCase();
    if (!want) return false;
    const arr = Array.isArray(entity?.statuses) ? entity.statuses : [];
    return arr.some((s) => String(s?.type || "").trim().toLowerCase() === want);
  }
  function mfHasPassiveFlag(entity, flag) {
    const want = String(flag || "").trim();
    if (!want) return false;
    const skills = Array.isArray(entity?.skills) ? entity.skills : [];
    return skills.some((s) => s && s.type === "passive" && s.effect && typeof s.effect === "object" && !!s.effect[want]);
  }
  function mfExtractStatusesWithPassives(entity) {
    const out = mfExtractStatuses(entity);
    if (mfHasPassiveFlag(entity, "tauntMonsters") || mfHasPassiveFlag(entity, "tauntPlayers")) {
      out.unshift({ type: "taunt" });
    }
    return out.slice(0, 6);
  }
  function drawStatusIcons(ctx, xRight, yCenter, statuses) {
    const list = Array.isArray(statuses) ? statuses : [];
    if (!list.length) return;
    const size = 14;
    const gap = 4;
    let x = xRight;
    for (let i = 0; i < list.length; i++) {
      const icon = mfStatusIcon(list[i]);
      if (!icon) continue;
      ctx.save();
      ctx.font = "900 12px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      const r = 6;
      const left = x + i * (size + gap);
      const top = yCenter - size / 2;
      ctx.moveTo(left + r, top);
      ctx.arcTo(left + size, top, left + size, top + size, r);
      ctx.arcTo(left + size, top + size, left, top + size, r);
      ctx.arcTo(left, top + size, left, top, r);
      ctx.arcTo(left, top, left + size, top, r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(String(icon.ch || ""), left + size / 2, yCenter + 0.5);
      ctx.restore();
    }
  }
  function mfRenderStatusIconsInline(entity) {
    const statuses = mfExtractStatuses(entity);
    if (!statuses.length) return "";
    return `
        <div class="mf-inline-statuses" aria-label="Statuses">
            ${statuses.map((s) => {
      const ico = mfStatusIcon(s);
      if (!ico) return "";
      return `<span class="mf-inline-status" title="${escapeHtml(statusLabel(s) || String(s?.type || ""))}">${escapeHtml(String(ico.ch || ""))}</span>`;
    }).join("")}
        </div>
    `;
  }
  function mfRenderBattleHud() {
    const hud = mfGetHudEl();
    const stage = mfGetStageEl();
    if (!hud || !stage || !gameState) return;
    const selectedPlayerId = mfBattleUi.selectedPlayerId;
    const selectedMonsterId = mfBattleUi.selectedMonsterId;
    const player = selectedPlayerId ? (gameState.players || []).find((p) => p && p.studentId === selectedPlayerId) : null;
    const playerUnit = selectedPlayerId ? (mfScene.units || []).find((u) => u && u.kind === "player" && u.id === selectedPlayerId) : null;
    const monster = selectedMonsterId ? (gameState.monsters || []).find((m) => m && m.id === selectedMonsterId) : null;
    const monsterUnit = selectedMonsterId ? (mfScene.units || []).find((u) => u && u.kind === "monster" && u.id === selectedMonsterId) : null;
    const stageW = stage.clientWidth || 1;
    const stageH = stage.clientHeight || 1;
    const parts = [];
    if (player && playerUnit) {
      const canAct = !!(gameState.phase === "player_turn" && player.isAlive && !player.hasActed);
      const isSilenced = mfHasStatus(player, "silence");
      const draftPts = mfBattleUi.ptsDraft[selectedPlayerId];
      const ptsValue = Number.isFinite(Number(draftPts)) ? Number(draftPts) : Number(player.puzzlePoints) || 0;
      const activeSkills = Array.isArray(player.skills) ? player.skills.filter((s) => s && s.type === "active") : [];
      const skillA = activeSkills[0] || null;
      const skillB = activeSkills[1] || null;
      const cd = (sid) => {
        const v = player.skillCooldowns && sid ? player.skillCooldowns[sid] : 0;
        return Number(v) || 0;
      };
      const targeting = mfBattleUi.targeting && mfBattleUi.targeting.actorId === selectedPlayerId ? mfBattleUi.targeting : null;
      const panelH = 300;
      const margin = 10;
      const top = mfClamp(margin + 200, margin, Math.max(margin, stageH - panelH - margin));
      const aCd = skillA ? cd(skillA.id) : 0;
      const bCd = skillB ? cd(skillB.id) : 0;
      const renderSkillRow = ({ kind, emoji, title, descTop, descMid, descBot, disabled, act, skillId, cdValue }) => {
        const cdChip = cdValue > 0 ? `<span class="mf-action-cd">${escapeHtml(String(cdValue))}</span>` : "";
        return `
            <div class="mf-skill-row ${disabled ? "is-disabled" : ""}">
                <button class="mf-action-btn ${disabled ? "is-disabled" : ""}" type="button"
                        data-mf="act" data-act="${escapeHtml(act)}" ${skillId ? `data-skill="${escapeHtml(String(skillId))}"` : ""}>
                    ${escapeHtml(String(emoji || "\u2728"))}${cdChip}
                </button>
                <div class="mf-skill-desc">
                    <div class="mf-skill-desc-top">${escapeHtml(String(title || kind || ""))}</div>
                    <div class="mf-skill-desc-mid">${escapeHtml(String(descMid || descTop || ""))}</div>
                    <div class="mf-skill-desc-bot">${escapeHtml(String(descBot || ""))}</div>
                </div>
            </div>
        `;
      };
      const baseCd = (s) => Math.max(0, Number(s?.cooldown) || 0);
      const actions = [];
      actions.push({
        kind: "attack",
        emoji: "\u2694\uFE0F",
        title: "Attack",
        descMid: "Basic",
        descBot: "Attack a monster",
        disabled: !canAct,
        act: "attack",
        cdValue: 0
      });
      if (skillA) {
        actions.push({
          kind: skillA.id,
          emoji: skillA.emoji || "\u2728",
          title: skillA.name || "Skill",
          descMid: `${skillA.type || "active"}${baseCd(skillA) ? `  |  CD ${baseCd(skillA)}` : ""}${aCd > 0 ? `  (now ${aCd})` : ""}`,
          descBot: skillA.description || "",
          disabled: !canAct || aCd > 0 || isSilenced,
          act: "skill",
          skillId: skillA.id,
          cdValue: aCd
        });
      }
      if (skillB) {
        actions.push({
          kind: skillB.id,
          emoji: skillB.emoji || "\u2728",
          title: skillB.name || "Skill",
          descMid: `${skillB.type || "active"}${baseCd(skillB) ? `  |  CD ${baseCd(skillB)}` : ""}${bCd > 0 ? `  (now ${bCd})` : ""}`,
          descBot: skillB.description || "",
          disabled: !canAct || bCd > 0 || isSilenced,
          act: "skill",
          skillId: skillB.id,
          cdValue: bCd
        });
      }
      parts.push(`
        <div class="mf-action-panel mf-player-panel" data-mf-panel="player" style="right:${escapeHtml(String(margin))}px; left:auto; top:${escapeHtml(String(top))}px;">
            <div class="mf-player-panel-top">
                <div class="mf-player-panel-top-row">
                    <div class="mf-action-panel-name">${escapeHtml(String(player.studentName || ""))}</div>
                    <button class="mf-action-panel-close" type="button" data-mf="close">\xD7</button>
                </div>
                <div class="mf-player-panel-top-main">
                    <div class="mf-player-panel-avatar">
                        ${renderIconWrap({
        imgSrc: imageSrcForFile(classImageFileById(player.characterClass)),
        fallbackEmoji: getPlayerClasses().find((c) => c.id === player.characterClass)?.emoji || "\u2753",
        alt: "Character",
        wrapClass: "mf-player-panel-avatarwrap"
      })}
                    </div>
                    <div class="mf-player-panel-hp">
                        <div class="mf-player-panel-hpbar">
                            <div class="mf-player-panel-hpfill" style="width:${escapeHtml(String(player.maxHP > 0 ? Math.max(0, Math.min(100, player.currentHP / player.maxHP * 100)) : 0))}%"></div>
                        </div>
                        <div class="mf-player-panel-hptext">${escapeHtml(String(player.currentHP || 0))}/${escapeHtml(String(player.maxHP || 0))} HP</div>
                        <div class="mf-player-panel-statline">
                            <span><b>ATK</b> ${escapeHtml(String(player.attack || 0))}</span>
                            ${mfRenderStatusIconsInline(player)}
                        </div>
                    </div>
                </div>
            </div>
            ${player.isAlive ? `
                ${player.hasActed ? `<div class="mf-action-taken">\u2713 Action Taken</div>` : ""}
                <div class="mf-player-panel-mid">
                    <div class="mf-action-pts">
                        <div class="mf-action-pts-label">Puzzle Points</div>
                        <input type="number" min="0" max="999" value="${escapeHtml(String(ptsValue))}" data-mf="pts" ${canAct ? "" : "disabled"} />
                    </div>
                </div>
                <div class="mf-player-panel-bot">
                    <div class="mf-action-grid3">
                        <div class="mf-action-icons">
                            ${actions.map((a) => `
                                <button class="mf-action-btn ${a.disabled ? "is-disabled" : ""}" type="button"
                                        data-mf="act" data-act="${escapeHtml(a.act)}" ${a.skillId ? `data-skill="${escapeHtml(String(a.skillId))}"` : ""}
                                        ${a.disabled ? "disabled" : ""}>
                                    ${escapeHtml(String(a.emoji || "\u2728"))}
                                    ${a.cdValue > 0 ? `<span class="mf-action-cd">${escapeHtml(String(a.cdValue))}</span>` : ""}
                                </button>
                            `).join("")}
                        </div>
                        <div class="mf-action-desc">
                            ${actions.map((a) => `
                                <div class="mf-skill-desc ${a.disabled ? "is-disabled" : ""}">
                                    <div class="mf-skill-desc-top">${escapeHtml(String(a.title || a.kind || ""))}</div>
                                    <div class="mf-skill-desc-mid">${escapeHtml(String(a.descMid || ""))}</div>
                                    <div class="mf-skill-desc-bot">${escapeHtml(String(a.descBot || ""))}</div>
                                </div>
                            `).join("")}
                        </div>
                    </div>
                </div>
            ` : `
                <div class="mf-revive-wrap">
                    <div class="mf-action-stats">
                        <div class="mf-action-stat">
                            <span>HP</span>
                            <b>0/${escapeHtml(String(player.maxHP || 0))}</b>
                        </div>
                        <div class="mf-action-stat">
                            <span>ATK</span>
                            <b>${escapeHtml(String(player.attack || 0))}</b>
                        </div>
                    </div>
                    <button class="btn btn-sm btn-warning" type="button" data-mf="reviveOpen">\u{1F4AB} Revive</button>
                    ${(() => {
        const draft = mfBattleUi.reviveDraft[selectedPlayerId];
        const v = Number.isFinite(Number(draft)) ? Number(draft) : 1;
        const max = Math.max(1, Number(player.puzzlePoints || 0));
        return `
                            <div class="mf-revive-inline ${mfBattleUi.reviveOpenFor === selectedPlayerId ? "" : "is-hidden"}">
                                <div class="mf-revive-label">Puzzle Points</div>
                                <input type="number" min="1" max="${escapeHtml(String(max))}" value="${escapeHtml(String(v))}" data-mf="revivePts" />
                                <button class="btn btn-primary btn-sm" type="button" data-mf="reviveAttempt">Attempt</button>
                            </div>
                        `;
      })()}
                </div>
            `}
        </div>
        `);
      if (targeting) stage.classList.add("mf-targeting");
      else stage.classList.remove("mf-targeting");
    }
    if (monster) {
      const panelH = 360;
      const margin = 10;
      const left = margin;
      const top = mfClamp(margin + 200, margin, Math.max(margin, stageH - panelH - margin));
      const mt = typeof getMonsterTypes === "function" ? getMonsterTypes().find((t) => t && t.id === monster.type) || null : null;
      const skills = Array.isArray(monster.skills) && monster.skills.length ? monster.skills : Array.isArray(mt?.skills) ? mt.skills : [];
      const sortedSkills = Array.isArray(skills) ? [...skills].filter(Boolean).sort((a, b) => {
        const ta = String(a?.type || "");
        const tb = String(b?.type || "");
        if (ta === tb) return 0;
        if (ta === "passive") return -1;
        if (tb === "passive") return 1;
        return 0;
      }) : [];
      const rows = sortedSkills.map((s) => {
        const base = Math.max(0, Number(s?.cooldown) || 0);
        const typ = String(s.type || "");
        return `
                <div class="mf-monster-skill">
                    <div class="mf-monster-skill-icon">${escapeHtml(String(s.emoji || (typ === "passive" ? "\u{1F6E1}\uFE0F" : "\u2728")))}</div>
                    <div class="mf-monster-skill-body">
                        <div class="mf-monster-skill-name">${escapeHtml(String(s.name || (typ === "passive" ? "Passive" : "Skill")))}</div>
                        <div class="mf-monster-skill-meta">${escapeHtml(`${typ}${base ? `  |  CD ${base}` : ""}`)}</div>
                        <div class="mf-monster-skill-desc">${escapeHtml(String(s.description || ""))}</div>
                    </div>
                </div>
            `;
      }).join("");
      const hpPct = monster.maxHP > 0 ? Math.max(0, Math.min(100, monster.currentHP / monster.maxHP * 100)) : 0;
      parts.push(`
            <div class="mf-action-panel mf-monster-panel" data-mf-panel="monster" style="left:${Math.round(left)}px; top:${Math.round(top)}px;">
                <div class="mf-player-panel-top">
                    <div class="mf-player-panel-top-row">
                        <div class="mf-action-panel-name">${escapeHtml(String(monster.name || "Monster"))}</div>
                        <button class="mf-action-panel-close" type="button" data-mf="closeMonster">\xD7</button>
                    </div>
                    <div class="mf-player-panel-top-main">
                        <div class="mf-player-panel-avatar">
                            ${renderIconWrap({
        imgSrc: imageSrcForFile(monsterImageFileByType(monster.type)),
        fallbackEmoji: mt && mt.emoji ? mt.emoji : "\u{1F47E}",
        alt: "Monster",
        wrapClass: "mf-player-panel-avatarwrap"
      })}
                        </div>
                        <div class="mf-player-panel-hp">
                            <div class="mf-player-panel-hpbar">
                                <div class="mf-player-panel-hpfill" style="width:${escapeHtml(String(hpPct))}%"></div>
                            </div>
                            <div class="mf-player-panel-hptext">${escapeHtml(String(monster.currentHP || 0))}/${escapeHtml(String(monster.maxHP || 0))} HP</div>
                            <div class="mf-player-panel-statline">
                                <span><b>ATK</b> ${escapeHtml(String(monster.attack || 0))}</span>
                                ${mfRenderStatusIconsInline(monster)}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="mf-player-panel-bot">
                    <div class="mf-monster-skill-list">
                        ${rows || '<div class="mf-monster-skill-empty">No skills</div>'}
                    </div>
                </div>
            </div>
        `);
    }
    hud.innerHTML = parts.join("");
    if (!parts.length) {
      hud.innerHTML = "";
      stage.classList.remove("mf-targeting");
    }
  }
  function mfBindBattleCanvasInput() {
    const canvas = document.getElementById("mfBattleCanvas");
    const stage = mfGetStageEl();
    const hud = mfGetHudEl();
    if (!canvas || !stage || !hud) return;
    if (canvas.dataset.mfInputBound === "1") return;
    canvas.dataset.mfInputBound = "1";
    const onCanvasClick = (ev) => {
      const r = canvas.getBoundingClientRect();
      const stageX = ev.clientX - r.left;
      const stageY = ev.clientY - r.top;
      const hit = mfHitTestUnit(stageX, stageY);
      const targeting = mfBattleUi.targeting;
      if (!targeting) {
        if (hit && hit.kind === "player") {
          mfBattleUi.selectedPlayerId = hit.id;
          mfRenderBattleHud();
        } else {
          if (hit && hit.kind === "monster") {
            mfBattleUi.selectedMonsterId = hit.id;
            mfRenderBattleHud();
          } else {
            mfBattleUi.selectedPlayerId = null;
            mfBattleUi.selectedMonsterId = null;
            mfBattleUi.targeting = null;
            mfRenderBattleHud();
          }
        }
        return;
      }
      if (!hit) {
        mfBattleUi.targeting = null;
        mfRenderBattleHud();
        return;
      }
      const want = targeting.targetType;
      if (want === "monster") {
        if (hit.kind !== "monster" || !hit.isAlive) return;
        if (targeting.action === "skill") {
          playerUseSkill(targeting.actorId, targeting.skillId, { type: "monster", id: hit.id });
        } else {
          playerAttack(targeting.actorId, { type: "monster", id: hit.id });
        }
      } else if (want === "ally_alive") {
        if (hit.kind !== "player" || !hit.isAlive) return;
        playerUseSkill(targeting.actorId, targeting.skillId, { type: "ally", id: hit.id });
      } else if (want === "ally_dead") {
        if (hit.kind !== "player" || hit.isAlive) return;
        playerUseSkill(targeting.actorId, targeting.skillId, { type: "ally_dead", id: hit.id });
      }
      mfBattleUi.targeting = null;
      mfRenderBattleHud();
    };
    canvas.addEventListener("click", onCanvasClick);
    canvas.addEventListener("mousemove", (ev) => {
      const r = canvas.getBoundingClientRect();
      const stageX = ev.clientX - r.left;
      const stageY = ev.clientY - r.top;
      const hit = mfHitTestUnit(stageX, stageY);
      mfBattleUi.hoveredKey = hit ? hit.key : null;
    }, { passive: true });
    hud.addEventListener("click", (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) return;
      const btn = t.closest("[data-mf]") instanceof HTMLElement ? t.closest("[data-mf]") : null;
      if (!btn) return;
      const kind = btn.getAttribute("data-mf");
      if (kind === "close") {
        mfBattleUi.selectedPlayerId = null;
        mfBattleUi.targeting = null;
        mfBattleUi.reviveOpenFor = null;
        mfRenderBattleHud();
        return;
      }
      if (kind === "closeMonster") {
        mfBattleUi.selectedMonsterId = null;
        mfRenderBattleHud();
        return;
      }
      if (kind === "reviveOpen") {
        const actorId = mfBattleUi.selectedPlayerId;
        if (!actorId) return;
        mfBattleUi.reviveOpenFor = mfBattleUi.reviveOpenFor === actorId ? null : actorId;
        mfRenderBattleHud();
        return;
      }
      if (kind === "reviveAttempt") {
        const actorId = mfBattleUi.selectedPlayerId;
        if (!actorId) return;
        const pts = Math.max(1, parseInt(String(mfBattleUi.reviveDraft[actorId] ?? "1"), 10) || 1);
        void mfAttemptReviveInline(actorId, pts);
        return;
      }
      if (kind === "act") {
        const actorId = mfBattleUi.selectedPlayerId;
        if (!actorId) return;
        const player = (gameState.players || []).find((p) => p && p.studentId === actorId);
        if (!player || !player.isAlive) return;
        if (!(gameState.phase === "player_turn") || player.hasActed) return;
        const act = btn.getAttribute("data-act");
        if (act === "attack") {
          mfBattleUi.targeting = { actorId, action: "attack", targetType: "monster" };
          mfRenderBattleHud();
          return;
        }
        if (act === "skill") {
          const skillId = btn.getAttribute("data-skill") || "";
          if (!skillId) return;
          const skill = Array.isArray(player.skills) ? player.skills.find((s) => s && s.id === skillId) : null;
          if (!skill) return;
          const cd = player.skillCooldowns && player.skillCooldowns[skillId] ? Number(player.skillCooldowns[skillId]) : 0;
          if (cd > 0) return;
          if (mfIsAoeSkill(player, skill)) {
            void playerUseSkill(actorId, skillId, null);
            mfBattleUi.targeting = null;
            mfRenderBattleHud();
            return;
          }
          mfBattleUi.targeting = { actorId, action: "skill", skillId, targetType: mfSkillTargetType(skill) };
          mfRenderBattleHud();
        }
      }
    });
    hud.addEventListener("input", (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.getAttribute("data-mf") !== "pts") return;
      const actorId = mfBattleUi.selectedPlayerId;
      if (!actorId) return;
      mfBattleUi.ptsDraft[actorId] = Math.max(0, parseInt(t.value || "0", 10) || 0);
    });
    hud.addEventListener("input", (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.getAttribute("data-mf") !== "revivePts") return;
      const actorId = mfBattleUi.selectedPlayerId;
      if (!actorId) return;
      mfBattleUi.reviveDraft[actorId] = Math.max(1, parseInt(t.value || "1", 10) || 1);
    });
    window.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        mfBattleUi.targeting = null;
        mfRenderBattleHud();
      }
    }, { passive: true });
  }
  async function mfAttemptReviveInline(studentId, puzzlePoints) {
    try {
      const response = await fetch(`${GAME_API_BASE}/game/revive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, puzzlePoints })
      });
      if (!response.ok) throw new Error("Failed to attempt revive");
      const data = await response.json();
      if (data && data.gameState) gameState = data.gameState;
      mfBattleUi.reviveOpenFor = null;
      renderGame();
    } catch (e) {
      console.error("Revive failed:", e);
      alert("Failed to attempt revive");
    }
  }
  async function initBattleCanvas() {
    const canvas = document.getElementById("mfBattleCanvas");
    const stage = canvas?.closest(".mf-battle-stage");
    if (!canvas || !stage) return;
    const token = ++mfCanvasToken;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const mapFile = String(gameState?.gameConfig?.battleMap || gameConfig?.battleMap || "Battle/Map.jpg").trim() || "Battle/Map.jpg";
    const mapSrc = imageSrcForFile(mapFile) || "images/Battle/Map.jpg";
    const mapImg = await loadImg(mapSrc);
    if (token !== mfCanvasToken) return;
    const resize = () => {
      const r = stage.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      canvas.style.width = `${Math.max(1, Math.floor(r.width))}px`;
      canvas.style.height = `${Math.max(1, Math.floor(r.height))}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    if (mfCanvasResizeHandler) {
      try {
        window.removeEventListener("resize", mfCanvasResizeHandler);
      } catch {
      }
    }
    mfCanvasResizeHandler = resize;
    window.addEventListener("resize", mfCanvasResizeHandler, { passive: true });
    const draw = () => {
      if (token !== mfCanvasToken) return;
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const now = mfNow();
      const shake = mfAnim.shake;
      let sx = 0, sy = 0;
      if (shake) {
        const t = Math.max(0, Math.min(1, (now - shake.t0) / shake.dur));
        const a = (1 - t) * (Number(shake.amp) || 6);
        sx = Math.sin(now / 16) * a;
        sy = Math.cos(now / 19) * a;
      }
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(sx, sy);
      if (mapImg) {
        const iw = mapImg.width;
        const ih = mapImg.height;
        const s = Math.max(w / iw, h / ih);
        const dw = iw * s;
        const dh = ih * s;
        const dx = (w - dw) / 2;
        const dy = (h - dh) / 2;
        ctx.drawImage(mapImg, dx, dy, dw, dh);
      }
      drawBattleEntities(ctx, w, h);
      mfDrawAnim(ctx, now);
      ctx.restore();
      mfCanvasRaf = requestAnimationFrame(draw);
    };
    if (mfCanvasRaf) cancelAnimationFrame(mfCanvasRaf);
    mfCanvasRaf = requestAnimationFrame(draw);
  }
  var lastRenderPhase = null;
  var renderDebounceTimeout = null;
  function mfSetBattleTightMode(on) {
    const b = document.body;
    if (!b) return;
    if (on) b.classList.add("mf-battle-tight");
    else b.classList.remove("mf-battle-tight");
  }
  function renderGame() {
    ensureActionPopupContainer();
    const currentPhase = gameState?.phase;
    console.log("=== renderGame called ===");
    console.log("Phase:", currentPhase);
    const focusedBefore = document.activeElement;
    console.log("Focused element before render:", focusedBefore?.id, focusedBefore?.tagName, focusedBefore?.value);
    const isUserInteracting = focusedBefore && (focusedBefore.tagName === "INPUT" || focusedBefore.tagName === "SELECT" || focusedBefore.id?.startsWith("puzzle_") || focusedBefore.id?.startsWith("target_"));
    if (isUserInteracting) {
      console.log("User is interacting, skipping re-render to preserve focus");
      return;
    }
    if (currentPhase === lastRenderPhase) {
      if (currentPhase === "character_selection") {
        if (renderDebounceTimeout) {
          clearTimeout(renderDebounceTimeout);
        }
        renderDebounceTimeout = setTimeout(() => {
          lastRenderPhase = null;
          renderDebounceTimeout = null;
        }, 200);
        console.log("Debouncing duplicate render for phase:", currentPhase);
        return;
      }
      const now = Date.now();
      if (!window.lastRenderTime || now - window.lastRenderTime < 50) {
        console.log("Skipping rapid duplicate render for phase:", currentPhase);
        return;
      }
    }
    lastRenderPhase = currentPhase;
    window.lastRenderTime = Date.now();
    const container = document.getElementById("monsterFightGame");
    if (!container) {
      console.error("Game container not found");
      return;
    }
    if (!gameState) {
      console.error("Game state not available");
      container.innerHTML = "<p>No game state available</p>";
      return;
    }
    const inputValues = {};
    const selectValues = {};
    if (gameState.players) {
      gameState.players.forEach((player) => {
        const input = document.getElementById(`puzzle_${player.studentId}`);
        if (input) {
          inputValues[player.studentId] = input.value;
        }
        const select = document.getElementById(`target_${player.studentId}`);
        if (select) {
          selectValues[player.studentId] = select.value;
        }
      });
    }
    if (gameState.monsters && gameState.monsters.length > 0) {
      console.log("=== RENDER: CURRENT MONSTER STATES ===");
      gameState.monsters.forEach((monster) => {
        console.log(`Monster ${monster.name} (${monster.id}): HP=${monster.currentHP}/${monster.maxHP}, Alive=${monster.isAlive}`);
      });
    }
    switch (gameState.phase) {
      case "character_selection":
        mfSetBattleTightMode(false);
        renderCharacterSelection();
        break;
      case "level_complete":
        mfSetBattleTightMode(false);
        renderLevelComplete();
        break;
      case "puzzle_input":
      case "player_turn":
      case "monster_turn":
        if (gameState.phase === "puzzle_input") {
          gameState.phase = "player_turn";
        }
        mfSetBattleTightMode(true);
        renderBattleMode();
        break;
      case "game_over":
        mfSetBattleTightMode(false);
        renderGameOver();
        break;
      default:
        mfSetBattleTightMode(false);
        container.innerHTML = `<p>Unknown phase: ${gameState.phase}</p>`;
    }
    setTimeout(() => {
      if (gameState.players) {
        gameState.players.forEach((player) => {
          const input = document.getElementById(`puzzle_${player.studentId}`);
          if (input && inputValues[player.studentId] !== void 0) {
            input.value = inputValues[player.studentId];
          }
          const select = document.getElementById(`target_${player.studentId}`);
          if (select && selectValues[player.studentId] !== void 0) {
            select.value = selectValues[player.studentId];
          }
        });
      }
    }, 0);
  }
  function renderCharacterSelection() {
    const container = document.getElementById("monsterFightGame");
    try {
      (gameState?.players || []).forEach((p) => charSelectSyncIndexToChosen(p));
    } catch {
    }
    const classes = getPlayerClasses();
    if (!hasAutoPickedDefaultCharacter && classes.length) {
      const missing = (gameState?.players || []).filter((p) => !String(p.characterClass || "").trim());
      if (missing.length) {
        hasAutoPickedDefaultCharacter = true;
        (async () => {
          for (const p of missing) {
            const st = getCharSelectState(p.studentId);
            st.idx = clampIndex(st.idx || 0, classes.length);
            const clsId = classes[st.idx]?.id || classes[0]?.id;
            if (clsId) {
              await selectCharacter(p.studentId, clsId);
            }
          }
        })();
      }
    }
    container.innerHTML = `
        <div class="game-screen mf-charselect">
            <div class="mf-topbar">
                <div class="mf-topbar-left">
                    <img class="mf-logo" src="${escapeHtml(imageSrcForFile("Logo.png") || "images/Logo.png")}" alt="Monster Fight">
                    <div class="mf-topbar-title">Monster Fight</div>
                </div>
                <div class="mf-topbar-right">
                    <button class="btn btn-secondary" onclick="openGameSettings()">\u2699\uFE0F Settings</button>
                </div>
            </div>
            <div class="character-selection-grid">
                ${gameState.players.map((player) => `
                    <div class="character-selection-card">
                        <h3>${player.studentName}</h3>
                        ${(() => {
      const st = getCharSelectState(player.studentId);
      const idx = clampIndex(st.idx || 0, classes.length);
      const cls = classes[idx] || {};
      const src = imageSrcForFile(`${String(cls.name || "").trim()}.png`);
      const fb = cls.emoji || "\u2753";
      const alt = cls.name || "Character";
      const skills = Array.isArray(cls.skills) ? cls.skills : [];
      return `
                                <div class="mf-char-carousel">
                                    <button class="mf-arrow" onclick="charSelectPrev('${player.studentId}')" aria-label="Previous">\u2039</button>
                                    <div class="mf-char-center">
                                        ${renderIconWrap({ imgSrc: src, fallbackEmoji: fb, alt, wrapClass: "mf-char-big" })}
                                        <div class="mf-char-meta">
                                            <div class="mf-char-name">${escapeHtml(cls.name || "")}</div>
                                            <div class="mf-char-stats">ATK: ${cls.baseAttack || 0} &nbsp;|&nbsp; HP: ${cls.baseHP || 0}</div>
                                        </div>
                                        <div class="mf-skill-intro">
                                            <div class="mf-skill-grid">
                                                ${skills.length ? skills.map((s) => `
                                                    <div class="mf-skill-item">
                                                        <div class="mf-skill-line1">
                                                            <span class="mf-skill-emoji">${escapeHtml(s.emoji || "\u2B50")}</span>
                                                            <span class="mf-skill-name">${escapeHtml(s.name || "")}</span>
                                                        </div>
                                                        <div class="mf-skill-line2">
                                                            <span class="mf-skill-type-pill">${escapeHtml(s.type || "")}</span>
                                                            ${s.cooldown ? `<span class="mf-skill-cd-pill">CD ${escapeHtml(s.cooldown)}</span>` : ""}
                                                        </div>
                                                        <div class="mf-skill-desc">${escapeHtml(s.description || "")}</div>
                                                    </div>
                                                `).join("") : `<div class="mf-skill-empty">No skills</div>`}
                                            </div>
                                        </div>
                                    </div>
                                    <button class="mf-arrow" onclick="charSelectNext('${player.studentId}')" aria-label="Next">\u203A</button>
                                </div>
                            `;
    })()}
                    </div>
                `).join("")}
            </div>
            ${gameState.players.every((p) => p.characterClass) ? `
                <div class="mf-bottom-actions">
                    <button class="btn btn-primary" onclick="startBattleMode()">Start Battle</button>
                </div>
            ` : ""}
        </div>
    `;
  }
  async function selectCharacter(studentId, characterClassId) {
    try {
      const response = await fetch(`${GAME_API_BASE}/game/select-character`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, characterClassId })
      });
      if (!response.ok) {
        throw new Error("Failed to select character");
      }
      gameState = await response.json();
      renderGame();
    } catch (error) {
      console.error("Error selecting character:", error);
      alert("Failed to select character");
    }
  }
  async function startBattleMode() {
    try {
      const puzzlePoints = {};
      gameState.players.forEach((player) => {
        puzzlePoints[player.studentId] = 0;
      });
      const response = await fetch(`${GAME_API_BASE}/game/input-puzzle-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puzzlePoints })
      });
      if (!response.ok) {
        throw new Error("Failed to initialize battle mode");
      }
      gameState = await response.json();
      gameState.phase = "player_turn";
      renderGame();
    } catch (error) {
      console.error("Error starting battle mode:", error);
      alert("Failed to start battle mode");
    }
  }
  var gameSettings = {
    config: null,
    playerClasses: [],
    monsterTypes: [],
    levelConfig: []
  };
  var hasAppliedDefaultLevelPreset = false;
  async function openGameSettings() {
    try {
      const response = await fetch(`${GAME_API_BASE}/game/settings`);
      if (!response.ok) {
        throw new Error("Failed to load settings");
      }
      gameSettings = await response.json();
      renderSettingsModal();
    } catch (error) {
      console.error("Error opening settings:", error);
      alert("Failed to load settings");
    }
  }
  function renderSettingsModal() {
    const container = document.getElementById("monsterFightGame");
    if (!container) return;
    const modal = document.createElement("div");
    modal.id = "gameSettingsModal";
    modal.className = "settings-modal-overlay";
    modal.innerHTML = `
        <div class="settings-modal-content">
            <div class="settings-modal-header">
                <h2>\u2699\uFE0F Game Settings</h2>
                <button class="btn-close" onclick="closeSettingsModal()">&times;</button>
            </div>
            <div class="settings-modal-body">
                <div class="settings-tabs">
                    <button class="settings-tab active" onclick="switchSettingsTab('global')">Global Settings</button>
                    <button class="settings-tab" onclick="switchSettingsTab('players')">Player Classes</button>
                    <button class="settings-tab" onclick="switchSettingsTab('monsters')">Monster Types</button>
                    <button class="settings-tab" onclick="switchSettingsTab('levels')">Level Config</button>
                </div>
                
                <div class="settings-content">
                    <div id="settings-global" class="settings-tab-content active">
                        ${renderGlobalSettings()}
                    </div>
                    <div id="settings-players" class="settings-tab-content">
                        ${renderPlayerClassesSettings()}
                    </div>
                    <div id="settings-monsters" class="settings-tab-content">
                        ${renderMonsterTypesSettings()}
                    </div>
                    <div id="settings-levels" class="settings-tab-content">
                        ${renderLevelConfigSettings()}
                    </div>
                </div>
            </div>
            <div class="settings-modal-footer">
                <button class="btn btn-secondary" onclick="closeSettingsModal()">Cancel</button>
                <button class="btn btn-primary" onclick="saveGameSettings()">Save Settings</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
  }
  function renderGlobalSettings() {
    const config = gameSettings.config || {
      damageMultiplier: 0.2,
      critRate: 0.1,
      critDamage: 2,
      baseReviveRate: 0.01,
      reviveRateDecay: 0.95,
      maxReviveRate: 0.66,
      backgroundTheme: "image",
      battleMap: "Battle/Map.jpg"
    };
    return `
        <h3>Global Game Settings</h3>
        <div class="settings-form">
            <div class="form-group">
                <label>Damage Multiplier:</label>
                <input type="number" id="setting_damageMultiplier" step="0.1" min="0.1" max="2" value="${config.damageMultiplier || 0.2}">
                <small>Default: 0.2 (Attack \xD7 Puzzle Points \xD7 Multiplier)</small>
            </div>
            
            <div class="form-group">
                <label>Critical Hit Rate (%):</label>
                <input type="number" id="setting_critRate" step="0.01" min="0" max="100" value="${(config.critRate || 0.1) * 100}">
                <small>Default: 10%</small>
            </div>
            
            <div class="form-group">
                <label>Critical Hit Damage Multiplier:</label>
                <input type="number" id="setting_critDamage" step="0.1" min="1" max="5" value="${config.critDamage || 2}">
                <small>Default: 2.0x</small>
            </div>
            
            <div class="form-group">
                <label>Base Revive Rate (%):</label>
                <input type="number" id="setting_baseReviveRate" step="0.01" min="0" max="100" value="${(config.baseReviveRate || 0.01) * 100}">
                <small>Default: 1%</small>
            </div>
            
            <div class="form-group">
                <label>Revive Rate Decay:</label>
                <input type="number" id="setting_reviveRateDecay" step="0.01" min="0" max="1" value="${config.reviveRateDecay || 0.95}">
                <small>Default: 0.95 (per puzzle point)</small>
            </div>
            
            <div class="form-group">
                <label>Max Revive Rate (%):</label>
                <input type="number" id="setting_maxReviveRate" step="0.01" min="0" max="100" value="${(config.maxReviveRate || 0.66) * 100}">
                <small>Default: 66%</small>
            </div>

            <div class="form-group">
                <label>Background Theme:</label>
                <select id="setting_backgroundTheme">
                    <option value="white" ${String(config.backgroundTheme || "white") === "white" ? "selected" : ""}>White</option>
                    <option value="image" ${String(config.backgroundTheme || "") === "image" ? "selected" : ""}>Background (Background.jpg)</option>
                </select>
                <small>Preset: white or \`game/monster-fight/images/Background/Background.jpg\`</small>
            </div>

            <div class="form-group">
                <label>Battle Map:</label>
                <select id="setting_battleMap">
                    <option value="Battle/Map.jpg" ${String(config.battleMap || "Battle/Map.jpg") === "Battle/Map.jpg" ? "selected" : ""}>Map.jpg</option>
                    <option value="Battle/Map-2.jpg" ${String(config.battleMap || "") === "Battle/Map-2.jpg" ? "selected" : ""}>Map-2.jpg</option>
                </select>
                <small>Maps in \`game/monster-fight/images/Battle/\`</small>
            </div>
        </div>
    `;
  }
  function renderPlayerClassesSettings() {
    const classes = gameSettings.playerClasses || window.playerClasses || playerClasses || [];
    return `
        <h3>Player Classes</h3>
        <div class="settings-list">
            ${classes.map((charClass, index) => `
                <div class="settings-item">
                    <div class="settings-item-header" onclick="toggleSettingsItem('player_${index}')">
                        ${renderIconWrap({
      imgSrc: imageSrcForFile(`${String(charClass.name || "").trim()}.png`),
      fallbackEmoji: charClass.emoji || "\u2753",
      alt: charClass.name || "Class",
      wrapClass: "character-emoji"
    })}
                        <h4>${charClass.name}</h4>
                        <span class="toggle-icon">\u25BC</span>
                    </div>
                    <div class="settings-item-content" id="player_${index}">
                        <div class="form-group">
                            <label>Base Attack:</label>
                            <input type="number" id="player_${index}_attack" min="1" value="${charClass.baseAttack}">
                        </div>
                        <div class="form-group">
                            <label>Base HP:</label>
                            <input type="number" id="player_${index}_hp" min="1" value="${charClass.baseHP}">
                        </div>
                        <div class="form-group">
                            <label>Skills:</label>
                            <div class="skills-list">
                                ${charClass.skills.map((skill, skillIndex) => `
                                    <div class="skill-item">
                                        <div class="mf-skill-row">
                                            <div class="mf-skill-main">
                                                <strong>${skill.name}</strong> (${skill.type})
                                            </div>
                                            <div class="mf-skill-cd-editor">
                                                <span class="mf-skill-cd-label">CD</span>
                                                <input type="number"
                                                       id="player_${index}_skill_${skillIndex}_cd"
                                                       min="0"
                                                       step="1"
                                                       value="${skill.cooldown ?? ""}"
                                                       placeholder="-">
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <label>Effect (JSON):</label>
                                            <textarea id="player_${index}_skill_${skillIndex}_effect" rows="3"
                                                      placeholder='{"damageMultiplier":1.2}'>${escapeHtml(JSON.stringify(skill.effect ?? {}, null, 2))}</textarea>
                                            <small>Edit numeric values here (damageMultiplier/heal/etc). Leave as {} if none.</small>
                                        </div>
                                        <p>${skill.description}</p>
                                    </div>
                                `).join("")}
                            </div>
                        </div>
                    </div>
                </div>
            `).join("")}
        </div>
    `;
  }
  function renderMonsterTypesSettings() {
    const types = gameSettings.monsterTypes || window.monsterTypes || monsterTypes || [];
    return `
        <h3>Monster Types</h3>
        <div class="settings-list">
            ${types.map((monster, index) => `
                <div class="settings-item">
                    <div class="settings-item-header" onclick="toggleSettingsItem('monster_${index}')">
                        ${renderIconWrap({
      imgSrc: imageSrcForFile(`${String(monster.name || "").trim()}.png`),
      fallbackEmoji: monster.emoji || "\u{1F47E}",
      alt: monster.name || "Monster",
      wrapClass: "monster-emoji"
    })}
                        <h4>${monster.name} ${monster.isBoss ? "(Boss)" : ""}</h4>
                        <span class="toggle-icon">\u25BC</span>
                    </div>
                    <div class="settings-item-content" id="monster_${index}">
                        <div class="form-group">
                            <label>Base Attack:</label>
                            <input type="number" id="monster_${index}_attack" min="1" value="${monster.baseAttack}">
                        </div>
                        <div class="form-group">
                            <label>Base HP:</label>
                            <input type="number" id="monster_${index}_hp" min="1" value="${monster.baseHP}">
                        </div>
                        <div class="form-group">
                            <label>Skills:</label>
                            <div class="skills-list">
                                ${monster.skills.map((skill, skillIndex) => `
                                    <div class="skill-item">
                                        <div class="mf-skill-row">
                                            <div class="mf-skill-main">
                                                <strong>${skill.name}</strong> (${skill.type})
                                            </div>
                                            <div class="mf-skill-cd-editor">
                                                <span class="mf-skill-cd-label">CD</span>
                                                <input type="number"
                                                       id="monster_${index}_skill_${skillIndex}_cd"
                                                       min="0"
                                                       step="1"
                                                       value="${skill.cooldown ?? ""}"
                                                       placeholder="-">
                                            </div>
                                        </div>
                                        <p>${skill.description}</p>
                                    </div>
                                `).join("")}
                            </div>
                        </div>
                    </div>
                </div>
            `).join("")}
        </div>
    `;
  }
  function renderLevelConfigSettings() {
    const levels = gameSettings.levelConfig || [];
    return `
        <h3>Level Configuration</h3>
        <div class="level-config-section">
            <div class="level-config-controls">
                <div class="form-group">
                    <label>Number of Levels:</label>
                    <input type="number" id="level_count" min="1" max="20" value="${levels.length || 3}" onchange="updateLevelConfig()">
                </div>
                <div class="difficulty-presets">
                    <span>Quick Difficulty:</span>
                    <button type="button" class="difficulty-button" data-difficulty="easy" onclick="applyDifficultyPreset('easy')">Easy</button>
                    <button type="button" class="difficulty-button" data-difficulty="medium" onclick="applyDifficultyPreset('medium')">Medium</button>
                    <button type="button" class="difficulty-button" data-difficulty="hard" onclick="applyDifficultyPreset('hard')">Hard</button>
                </div>
            </div>
            <div id="level-config-list">
                ${renderLevelConfigList(levels)}
            </div>
        </div>
    `;
  }
  function renderLevelConfigList(levels) {
    const count = levels.length || 3;
    const result = [];
    for (let i = 0; i < count; i++) {
      const level = levels[i] || { level: i + 1, monsters: [] };
      result.push(`
            <div class="level-config-item">
                <h4>Level ${i + 1}</h4>
                <div class="form-group">
                    <label>Number of Monster Types:</label>
                    <input type="number" id="level_${i}_monster_count" min="1" max="10" value="${level.monsters.length || 1}" onchange="updateLevelMonsters(${i})">
                </div>
                <div id="level_${i}_monsters" class="level-monsters-list">
                    ${renderLevelMonsters(i, level.monsters)}
                </div>
            </div>
        `);
    }
    return result.join("");
  }
  function renderLevelMonsters(levelIndex, monsters) {
    const count = monsters.length || 1;
    const availableMonsterTypes = gameSettings.monsterTypes || window.monsterTypes || [];
    const result = [];
    for (let i = 0; i < count; i++) {
      const monster = monsters[i] || { type: availableMonsterTypes[0]?.id || "slime", count: 1 };
      const mt = availableMonsterTypes.find((m) => String(m.id) === String(monster.type));
      const iconSrc = imageSrcForFile(monsterImageFileByType(monster.type));
      const iconFb = mt?.emoji || "\u{1F47E}";
      const iconAlt = mt?.name || "Monster";
      result.push(`
            <div class="level-monster-item">
                <div id="level_${levelIndex}_monster_${i}_icon" class="mf-level-monster-icon">
                    ${renderIconWrap({ imgSrc: iconSrc, fallbackEmoji: iconFb, alt: iconAlt, wrapClass: "mf-level-monster-iconwrap" })}
                </div>
                <select id="level_${levelIndex}_monster_${i}_type" onchange="updateLevelMonsterPreview(${levelIndex}, ${i}, this.value)">
                    ${availableMonsterTypes.map((m) => `
                        <option value="${m.id}" ${m.id === monster.type ? "selected" : ""}>${m.name}</option>
                    `).join("")}
                </select>
                <input type="number" id="level_${levelIndex}_monster_${i}_count" min="1" max="10" value="${monster.count || 1}" placeholder="Count">
            </div>
        `);
    }
    return result.join("");
  }
  function updateLevelMonsterPreview(levelIndex, monsterIndex, typeId) {
    const availableMonsterTypes = gameSettings.monsterTypes || window.monsterTypes || [];
    const mt = availableMonsterTypes.find((m) => String(m.id) === String(typeId));
    const iconSrc = imageSrcForFile(monsterImageFileByType(typeId));
    const iconFb = mt?.emoji || "\u{1F47E}";
    const iconAlt = mt?.name || "Monster";
    const host = document.getElementById(`level_${levelIndex}_monster_${monsterIndex}_icon`);
    if (host) {
      host.innerHTML = renderIconWrap({ imgSrc: iconSrc, fallbackEmoji: iconFb, alt: iconAlt, wrapClass: "mf-level-monster-iconwrap" });
    }
  }
  window.updateLevelMonsterPreview = updateLevelMonsterPreview;
  function applyDifficultyPreset(presetKey) {
    const preset = LEVEL_DIFFICULTY_PRESETS[presetKey];
    if (!preset) {
      console.warn("Unknown difficulty preset:", presetKey);
      return;
    }
    const normalized = preset.map((level, index) => ({
      level: index + 1,
      monsters: (level.monsters || []).map((monster) => ({
        type: monster.type,
        count: monster.count
      }))
    }));
    gameSettings.levelConfig = normalized;
    setDifficultyPresetActive(presetKey);
    const countInput = document.getElementById("level_count");
    if (countInput) {
      countInput.value = normalized.length;
    }
    const listContainer = document.getElementById("level-config-list");
    if (listContainer) {
      listContainer.innerHTML = renderLevelConfigList(normalized);
    }
  }
  function setDifficultyPresetActive(presetKey) {
    document.querySelectorAll(".difficulty-button").forEach((btn) => {
      const key = btn.getAttribute("data-difficulty");
      btn.classList.toggle("active", key === presetKey);
    });
  }
  function switchSettingsTab(tab) {
    document.querySelectorAll(".settings-tab").forEach((btn) => btn.classList.remove("active"));
    event.target.classList.add("active");
    document.querySelectorAll(".settings-tab-content").forEach((content) => content.classList.remove("active"));
    document.getElementById(`settings-${tab}`).classList.add("active");
    if (tab === "levels") {
      if (!hasAppliedDefaultLevelPreset) {
        hasAppliedDefaultLevelPreset = true;
        applyDifficultyPreset("easy");
      } else {
        const anyActive = document.querySelector(".difficulty-button.active");
        if (!anyActive) {
          setDifficultyPresetActive("easy");
        }
      }
    }
  }
  function toggleSettingsItem(id) {
    const content = document.getElementById(id);
    const header = content.previousElementSibling;
    const icon = header.querySelector(".toggle-icon");
    if (content.style.display === "none") {
      content.style.display = "block";
      icon.textContent = "\u25BC";
    } else {
      content.style.display = "none";
      icon.textContent = "\u25B6";
    }
  }
  function updateLevelConfig() {
    const count = parseInt(document.getElementById("level_count").value) || 3;
    const currentLevels = gameSettings.levelConfig || [];
    const newLevels = [];
    for (let i = 0; i < count; i++) {
      newLevels.push(currentLevels[i] || { level: i + 1, monsters: [{ type: "slime", count: 1 }] });
    }
    gameSettings.levelConfig = newLevels;
    document.getElementById("level-config-list").innerHTML = renderLevelConfigList(newLevels);
  }
  function updateLevelMonsters(levelIndex) {
    const countInput = document.getElementById(`level_${levelIndex}_monster_count`);
    if (!countInput) return;
    const count = parseInt(countInput.value) || 1;
    if (!gameSettings.levelConfig) {
      gameSettings.levelConfig = [];
    }
    if (!gameSettings.levelConfig[levelIndex]) {
      gameSettings.levelConfig[levelIndex] = { level: levelIndex + 1, monsters: [] };
    }
    const level = gameSettings.levelConfig[levelIndex];
    const newMonsters = [];
    for (let i = 0; i < count; i++) {
      newMonsters.push(level.monsters[i] || { type: "slime", count: 1 });
    }
    gameSettings.levelConfig[levelIndex].monsters = newMonsters;
    const monstersContainer = document.getElementById(`level_${levelIndex}_monsters`);
    if (monstersContainer) {
      monstersContainer.innerHTML = renderLevelMonsters(levelIndex, newMonsters);
    }
  }
  async function saveGameSettings() {
    try {
      const config = {
        damageMultiplier: parseFloat(document.getElementById("setting_damageMultiplier").value) || 0.2,
        critRate: (parseFloat(document.getElementById("setting_critRate").value) || 10) / 100,
        critDamage: parseFloat(document.getElementById("setting_critDamage").value) || 2,
        baseReviveRate: (parseFloat(document.getElementById("setting_baseReviveRate").value) || 1) / 100,
        reviveRateDecay: parseFloat(document.getElementById("setting_reviveRateDecay").value) || 0.95,
        maxReviveRate: (parseFloat(document.getElementById("setting_maxReviveRate").value) || 66) / 100,
        backgroundTheme: String(document.getElementById("setting_backgroundTheme")?.value || "image"),
        battleMap: String(document.getElementById("setting_battleMap")?.value || "Battle/Map.jpg")
      };
      const playerClasses2 = [];
      const playerItems = document.querySelectorAll("#settings-players .settings-item");
      playerItems.forEach((item, index) => {
        const originalClass = gameSettings.playerClasses[index];
        if (originalClass) {
          const nextSkills = (originalClass.skills || []).map((s, skillIndex) => {
            const input = document.getElementById(`player_${index}_skill_${skillIndex}_cd`);
            const effInput = document.getElementById(`player_${index}_skill_${skillIndex}_effect`);
            if (!input) return s;
            const raw = String(input.value ?? "").trim();
            let nextEffect = s?.effect;
            if (effInput) {
              const effRaw = String(effInput.value ?? "").trim();
              try {
                nextEffect = effRaw ? JSON.parse(effRaw) : s?.effect ?? {};
              } catch (e) {
                throw new Error(`Invalid JSON in ${originalClass.name} \u2192 ${s?.name || s?.id || "skill"} effect`);
              }
            }
            if (raw === "") {
              const { cooldown, ...rest } = s || {};
              return { ...rest, effect: nextEffect };
            }
            const cd = parseInt(raw, 10);
            if (Number.isFinite(cd) && cd >= 0) return { ...s || {}, cooldown: cd, effect: nextEffect };
            return { ...s || {}, effect: nextEffect };
          });
          playerClasses2.push({
            ...originalClass,
            baseAttack: parseInt(document.getElementById(`player_${index}_attack`).value) || originalClass.baseAttack,
            baseHP: parseInt(document.getElementById(`player_${index}_hp`).value) || originalClass.baseHP,
            skills: nextSkills
          });
        }
      });
      const monsterTypes2 = [];
      const monsterItems = document.querySelectorAll("#settings-monsters .settings-item");
      monsterItems.forEach((item, index) => {
        const originalMonster = gameSettings.monsterTypes[index];
        if (originalMonster) {
          const nextSkills = (originalMonster.skills || []).map((s, skillIndex) => {
            const input = document.getElementById(`monster_${index}_skill_${skillIndex}_cd`);
            if (!input) return s;
            const raw = String(input.value ?? "").trim();
            if (raw === "") {
              const { cooldown, ...rest } = s || {};
              return { ...rest };
            }
            const cd = parseInt(raw, 10);
            if (Number.isFinite(cd) && cd >= 0) return { ...s || {}, cooldown: cd };
            return s;
          });
          monsterTypes2.push({
            ...originalMonster,
            baseAttack: parseInt(document.getElementById(`monster_${index}_attack`).value) || originalMonster.baseAttack,
            baseHP: parseInt(document.getElementById(`monster_${index}_hp`).value) || originalMonster.baseHP,
            skills: nextSkills
          });
        }
      });
      const levelConfig = [];
      const levelCountInput = document.getElementById("level_count");
      if (levelCountInput) {
        const levelCount = parseInt(levelCountInput.value) || 3;
        for (let i = 0; i < levelCount; i++) {
          const monsterCountInput = document.getElementById(`level_${i}_monster_count`);
          if (!monsterCountInput) continue;
          const monsterCount = parseInt(monsterCountInput.value) || 1;
          const monsters = [];
          for (let j = 0; j < monsterCount; j++) {
            const typeInput = document.getElementById(`level_${i}_monster_${j}_type`);
            const countInput = document.getElementById(`level_${i}_monster_${j}_count`);
            if (!typeInput || !countInput) continue;
            const type = typeInput.value;
            const count = parseInt(countInput.value) || 1;
            monsters.push({ type, count });
          }
          levelConfig.push({ level: i + 1, monsters });
        }
      }
      const response = await fetch(`${GAME_API_BASE}/game/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          playerClasses: playerClasses2.length > 0 ? playerClasses2 : void 0,
          monsterTypes: monsterTypes2.length > 0 ? monsterTypes2 : void 0,
          levelConfig
        })
      });
      if (!response.ok) {
        throw new Error("Failed to save settings");
      }
      gameSettings.config = config;
      if (playerClasses2.length > 0) gameSettings.playerClasses = playerClasses2;
      if (monsterTypes2.length > 0) gameSettings.monsterTypes = monsterTypes2;
      gameSettings.levelConfig = levelConfig;
      if (gameConfig) {
        Object.assign(gameConfig, config);
      }
      applyBackgroundTheme(config.backgroundTheme || "white");
      try {
        if (gameState && (gameState.phase === "player_turn" || gameState.phase === "monster_turn")) initBattleCanvas();
      } catch {
      }
      if (playerClasses2.length > 0) window.playerClasses = playerClasses2;
      if (monsterTypes2.length > 0) window.monsterTypes = monsterTypes2;
      alert("Settings saved successfully!");
      closeSettingsModal();
      if (gameState) {
        renderGame();
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings");
    }
  }
  function closeSettingsModal() {
    const modal = document.getElementById("gameSettingsModal");
    if (modal) {
      modal.remove();
    }
  }
  function renderBattleMode() {
    const container = document.getElementById("monsterFightGame");
    const isPlayerTurn = gameState.phase === "player_turn";
    const isMonsterTurn = gameState.phase === "monster_turn";
    const alivePlayers = Array.isArray(gameState.players) ? gameState.players.filter((p) => p && p.isAlive) : [];
    const allPlayersActed = alivePlayers.length > 0 && alivePlayers.every((p) => p.hasActed);
    const canProcessMonsterTurn = !!(!monsterTurnReplay?.active && (isMonsterTurn || isPlayerTurn && allPlayersActed));
    if (!container) return;
    const existingBattle = container.querySelector(".game-screen.mf-battle");
    if (!existingBattle) {
      container.innerHTML = `
            <div class="game-screen mf-battle">
                <div class="mf-topbar">
                    <div class="mf-topbar-row mf-topbar-row1">
                        <div class="mf-topbar-left">
                            <img class="mf-logo" src="${escapeHtml(imageSrcForFile("Logo.png") || "images/Logo.png")}" alt="Monster Fight">
                            <div class="mf-topbar-title">Monster Fight - Level ${gameState.currentLevel}</div>
                        </div>
                        <div class="mf-topbar-center">
                            <button class="mf-topbar-pill mf-topbar-process ${canProcessMonsterTurn ? "" : "is-disabled"}"
                                    type="button"
                                    onclick="processMonsterTurn()"
                                    ${canProcessMonsterTurn ? "" : "disabled"}>
                                \u2694\uFE0F Process Monster Turn
                            </button>
                        </div>
                        <div class="mf-topbar-right">
                            <button class="mf-topbar-pill" type="button" onclick="toggleActionLog()">Action Log</button>
                            <span class="phase-badge ${isPlayerTurn ? "player-turn" : "monster-turn"}">
                                ${isPlayerTurn ? "Player Turn" : "Monster Turn"}
                            </span>
                            <button class="btn btn-danger btn-sm" onclick="terminateGame()">\u26D4 Terminate Game</button>
                            <button class="btn btn-secondary" onclick="openGameSettings()">\u2699\uFE0F Settings</button>
                        </div>
                    </div>

                    ${!actionLogCollapsed ? `
                        <div class="mf-topbar-logpopover" role="dialog" aria-label="Action Log">
                            ${gameState.actionLog && gameState.actionLog.length > 0 ? gameState.actionLog.slice(-10).reverse().map((log) => `
                                    <div class="log-entry">[Turn ${log.turn}] ${log.message}</div>
                                `).join("") : '<div class="log-entry">No actions yet.</div>'}
                        </div>
                    ` : ""}
                </div>
                
                <div class="mf-battle-wrap">
                    <div class="mf-battle-stage">
                        <canvas id="mfBattleCanvas" class="mf-battle-canvas"></canvas>
                        <div id="mfBattleToast" class="mf-battle-toast" aria-live="polite">
                            <div class="mf-battle-toast-text"></div>
                            <button class="mf-battle-toast-next" type="button">Next</button>
                        </div>
                    </div>
                    <div id="mfBattleHud" class="mf-battle-hud"></div>
                </div>
            </div>
        `;
      if (mfPendingToast && mfPendingToast.text) {
        try {
          mfShowBattleToast(mfPendingToast.text, mfPendingToast.opts || {});
        } catch {
        }
      }
      setTimeout(initBattleCanvas, 0);
      setTimeout(mfBindBattleCanvasInput, 0);
      setTimeout(mfRenderBattleHud, 0);
      return;
    }
    try {
      const titleEl = existingBattle.querySelector(".mf-topbar-title");
      if (titleEl) titleEl.textContent = `Monster Fight - Level ${gameState.currentLevel}`;
      const badge = existingBattle.querySelector(".phase-badge");
      if (badge) {
        badge.textContent = isPlayerTurn ? "Player Turn" : "Monster Turn";
        badge.classList.toggle("player-turn", !!isPlayerTurn);
        badge.classList.toggle("monster-turn", !!isMonsterTurn);
      }
      const btn = existingBattle.querySelector(".mf-topbar-process");
      if (btn) {
        btn.classList.toggle("is-disabled", !canProcessMonsterTurn);
        if (canProcessMonsterTurn) btn.removeAttribute("disabled");
        else btn.setAttribute("disabled", "disabled");
      }
      const topbar = existingBattle.querySelector(".mf-topbar");
      if (topbar) {
        let pop = existingBattle.querySelector(".mf-topbar-logpopover");
        if (actionLogCollapsed) {
          if (pop) pop.remove();
        } else {
          if (!pop) {
            pop = document.createElement("div");
            pop.className = "mf-topbar-logpopover";
            pop.setAttribute("role", "dialog");
            pop.setAttribute("aria-label", "Action Log");
            topbar.appendChild(pop);
          }
          pop.innerHTML = gameState.actionLog && gameState.actionLog.length > 0 ? gameState.actionLog.slice(-10).reverse().map((log) => `
                        <div class="log-entry">[Turn ${log.turn}] ${log.message}</div>
                    `).join("") : '<div class="log-entry">No actions yet.</div>';
        }
      }
    } catch {
    }
    if (mfPendingToast && mfPendingToast.text) {
      try {
        mfShowBattleToast(mfPendingToast.text, mfPendingToast.opts || {});
      } catch {
      }
    }
    setTimeout(mfRenderBattleHud, 0);
  }
  var updatePuzzlePointsTimeout = null;
  async function updatePuzzlePoints() {
    console.log("updatePuzzlePoints called");
    const focusedElement = document.activeElement;
    console.log("Current focused element:", focusedElement?.id, focusedElement?.tagName);
    if (updatePuzzlePointsTimeout) {
      clearTimeout(updatePuzzlePointsTimeout);
    }
    updatePuzzlePointsTimeout = setTimeout(async () => {
      const currentFocused = document.activeElement;
      const isStillInteracting = currentFocused && (currentFocused.tagName === "INPUT" || currentFocused.tagName === "SELECT" || currentFocused.id?.startsWith("puzzle_") || currentFocused.id?.startsWith("target_"));
      if (isStillInteracting) {
        console.log("User still interacting, skipping update");
        return;
      }
      const puzzlePoints = {};
      gameState.players.forEach((player) => {
        const input = document.getElementById(`puzzle_${player.studentId}`);
        if (input) {
          const value = input.value.trim();
          puzzlePoints[player.studentId] = value === "" ? 0 : parseInt(value) || 0;
          console.log(`Puzzle points for ${player.studentId}:`, puzzlePoints[player.studentId]);
        }
      });
      try {
        const response = await fetch(`${GAME_API_BASE}/game/input-puzzle-points`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ puzzlePoints })
        });
        if (!response.ok) {
          throw new Error("Failed to update puzzle points");
        }
        const newState = await response.json();
        console.log("Puzzle points updated, monsters exist:", !!(gameState.monsters && gameState.monsters.length > 0));
        newState.players.forEach((newPlayer) => {
          const existingPlayer = gameState.players.find((p) => p.studentId === newPlayer.studentId);
          if (existingPlayer) {
            existingPlayer.puzzlePoints = newPlayer.puzzlePoints;
          }
        });
        console.log("Puzzle points updated in gameState, no re-render to preserve focus");
      } catch (error) {
        console.error("Error updating puzzle points:", error);
      }
    }, 300);
  }
  async function startBattleAfterPuzzleInput() {
    const puzzlePoints = {};
    gameState.players.forEach((player) => {
      const input = document.getElementById(`puzzle_${player.studentId}`);
      if (input) {
        puzzlePoints[player.studentId] = parseInt(input.value) || 0;
      } else {
        puzzlePoints[player.studentId] = player.puzzlePoints || 0;
      }
    });
    try {
      const response = await fetch(`${GAME_API_BASE}/game/input-puzzle-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puzzlePoints })
      });
      if (!response.ok) {
        throw new Error("Failed to start battle");
      }
      gameState = await response.json();
      if (gameState.monsters && gameState.monsters.length > 0) {
        gameState.phase = "player_turn";
      }
      renderGame();
    } catch (error) {
      console.error("Error starting battle:", error);
      alert("Failed to start battle");
    }
  }
  async function terminateGame() {
    if (!confirm("Are you sure you want to terminate the game? All progress will be lost.")) {
      return;
    }
    try {
      const response = await fetch(`${GAME_API_BASE}/game/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentIds: gameState.players.map((p) => p.studentId),
          levelConfig: gameState.levelConfig || []
        })
      });
      if (!response.ok) {
        throw new Error("Failed to reset game");
      }
      gameState = await response.json();
      renderGame();
    } catch (error) {
      console.error("Error terminating game:", error);
      alert("Failed to terminate game");
    }
  }
  function mfNormalizeTargetInput(v) {
    if (!v) return { type: null, id: null };
    if (typeof v === "string") return parseTargetValue(v);
    if (typeof v === "object" && v.id) return { type: v.type || null, id: v.id };
    return { type: null, id: null };
  }
  function mfGetCurrentPuzzlePoints(studentId) {
    const draft = mfBattleUi && mfBattleUi.ptsDraft ? mfBattleUi.ptsDraft[studentId] : void 0;
    if (draft !== void 0 && draft !== null && Number.isFinite(Number(draft))) return Number(draft) || 0;
    const puzzleInput = document.getElementById(`puzzle_${studentId}`);
    if (puzzleInput) return parseInt(puzzleInput.value) || 0;
    const player = gameState?.players?.find((p) => p && p.studentId === studentId);
    return Number(player?.puzzlePoints) || 0;
  }
  async function playerAttack(studentId, explicitTarget) {
    const parsedTarget = explicitTarget ? mfNormalizeTargetInput(explicitTarget) : (() => {
      const targetSelect = document.getElementById(`target_${studentId}`);
      return parseTargetValue(targetSelect?.value);
    })();
    if (!parsedTarget.id) {
      alert("Please select a target");
      return;
    }
    if (parsedTarget.type !== "monster") {
      alert("Please select a monster target for a normal attack");
      return;
    }
    const targetId = parsedTarget.id;
    const currentPuzzlePoints = mfGetCurrentPuzzlePoints(studentId);
    const player = gameState.players.find((p) => p.studentId === studentId);
    const attackerKey = `player:${studentId}`;
    const attackerClass = String(player?.characterClass || "").toLowerCase();
    const isRanged = attackerClass === "archer" || attackerClass === "wizard";
    const targetMonsterBefore = gameState.monsters?.find((m) => m.id === targetId);
    console.log("=== PLAYER ATTACK ===");
    console.log(`Player: ${player?.studentName} (ID: ${studentId})`);
    console.log(`Target: ${targetMonsterBefore?.name} (ID: ${targetId})`);
    console.log(`Target HP BEFORE: ${targetMonsterBefore?.currentHP}/${targetMonsterBefore?.maxHP}`);
    console.log(`Player Attack: ${player?.attack}`);
    console.log(`Puzzle Points from input: ${currentPuzzlePoints} (gameState: ${player?.puzzlePoints})`);
    const puzzleInput = document.getElementById(`puzzle_${studentId}`);
    console.log(`Puzzle Input Element:`, puzzleInput ? `Found (value: ${puzzleInput.value})` : "NOT FOUND");
    if (currentPuzzlePoints === 0 && puzzleInput && puzzleInput.value && parseInt(puzzleInput.value) > 0) {
      console.warn("\u26A0\uFE0F WARNING: Puzzle Points read as 0, but input field has value:", puzzleInput.value);
    }
    try {
      const response = await fetch(`${GAME_API_BASE}/game/player-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          action: "attack",
          targetId,
          puzzlePoints: currentPuzzlePoints
          // Send current Puzzle Points from input
        })
      });
      if (!response.ok) {
        throw new Error("Failed to process attack");
      }
      const data = await response.json();
      console.log("Server response:", JSON.stringify(data, null, 2));
      const actionResult = data && typeof data === "object" ? data.actionResult || null : null;
      const currentMonsters = gameState.monsters ? [...gameState.monsters] : null;
      gameState = data.gameState;
      if (currentMonsters && currentMonsters.length > 0 && gameState.monsters) {
        const hitEvents = [];
        console.log("=== UPDATING MONSTER HP ===");
        console.log("Current monsters (before update):", currentMonsters.map((m) => ({
          id: m.id,
          name: m.name,
          hp: `${m.currentHP}/${m.maxHP}`,
          alive: m.isAlive
        })));
        console.log("Server monsters:", gameState.monsters.map((m) => ({
          id: m.id,
          name: m.name,
          hp: `${m.currentHP}/${m.maxHP}`,
          alive: m.isAlive
        })));
        currentMonsters.forEach((currentMonster) => {
          const serverMonster = gameState.monsters.find((m) => m.id === currentMonster.id);
          if (serverMonster) {
            const oldHP = currentMonster.currentHP;
            const newHP = serverMonster.currentHP;
            const damage = oldHP - newHP;
            if (damage > 0) hitEvents.push({ id: currentMonster.id, damage });
            console.log(`Monster ${currentMonster.name} (${currentMonster.id}):`);
            console.log(`  HP: ${oldHP} -> ${newHP} (damage: ${damage})`);
            console.log(`  Alive: ${currentMonster.isAlive} -> ${serverMonster.isAlive}`);
            currentMonster.currentHP = serverMonster.currentHP;
            currentMonster.isAlive = serverMonster.isAlive;
            if (serverMonster.maxHP) {
              currentMonster.maxHP = serverMonster.maxHP;
            }
          } else {
            console.warn(`Monster ${currentMonster.id} not found in server response`);
          }
        });
        gameState.monsters = currentMonsters;
        console.log("Monsters AFTER update:", gameState.monsters.map((m) => ({
          id: m.id,
          name: m.name,
          hp: `${m.currentHP}/${m.maxHP}`,
          alive: m.isAlive
        })));
        const best = hitEvents.length ? hitEvents.reduce((a, b) => b.damage > a.damage ? b : a, hitEvents[0]) : null;
        const arTargetName = String(actionResult?.targetName || "").trim();
        const arMonster = arTargetName ? (gameState.monsters || []).find((m) => String(m?.name || "").trim() === arTargetName) : null;
        const actualTargetId = best?.id || arMonster?.id || targetId;
        const actualKey = actualTargetId ? `monster:${actualTargetId}` : `monster:${targetId}`;
        const requestedKey = `monster:${targetId}`;
        const aimKey = requestedKey;
        const isDodged = !!actionResult?.dodged;
        const dmg = Number(best?.damage ?? actionResult?.damage ?? 0) || 0;
        const meleeImpactDelayMs = isRanged ? 0 : Math.round(mfAnimMs(340) / 2);
        if (actualTargetId && actualTargetId !== targetId) {
          mfAnimBlock(actualKey, requestedKey, { dur: 180 });
        }
        if (isRanged) mfAnimAddBeam(attackerKey, aimKey, "rgba(255,60,60,0.95)", 6, 280);
        else mfAnimDash(attackerKey, aimKey, { dur: 340, gap: 12 });
        mfAnimHit(actualKey, { blinks: 2, dur: 260, amp: 4, delayMs: meleeImpactDelayMs });
        if (!isRanged && best && typeof best.id !== "undefined") {
          const holdUntil = mfNow() + meleeImpactDelayMs;
          const old = (currentMonsters || []).find((m) => m && m.id === best.id)?.currentHP;
          if (typeof old === "number") {
            mfAnim.hpHold.set(actualKey, { cur: old, until: holdUntil });
          }
        }
        if (isDodged) {
          mfAnimAddFloatAtUnit(actualKey, "DODGE", "rgba(255,255,255,0.92)", 2e3, { delayMs: meleeImpactDelayMs });
        } else if (dmg > 0) {
          mfAnimAddFloatAtUnit(actualKey, `-${dmg}`, "rgba(255,60,60,0.95)", 4e3, { delayMs: meleeImpactDelayMs });
        }
        try {
          const finalMonster = (gameState.monsters || []).find((m) => m && m.id === actualTargetId) || arMonster || targetMonsterBefore;
          const nameA = String(player?.studentName || "Player");
          const nameB = String(finalMonster?.name || "Monster");
          const tauntTag = actualTargetId && actualTargetId !== targetId ? " (TAUNT)" : "";
          if (isDodged) mfToast(`${nameA} attacks ${nameB} DODGE${tauntTag}`);
          else mfToast(`${nameA} attacks ${nameB} -${dmg}${tauntTag}`);
        } catch {
        }
      }
      renderGame();
    } catch (error) {
      console.error("Error processing attack:", error);
      alert(String(error?.message || "Failed to process attack"));
    }
  }
  async function playerUseSkill(studentId, skillId, explicitTarget) {
    const player = gameState.players.find((p) => p.studentId === studentId);
    if (!player || !player.isAlive) {
      alert("Player not found or not alive");
      return;
    }
    const skill = player.skills.find((s) => s.id === skillId);
    if (!skill || skill.type !== "active") {
      alert("Invalid skill");
      return;
    }
    const isAoe = mfIsAoeSkill(player, skill);
    const attackerKey = `player:${studentId}`;
    const attackerClass = String(player?.characterClass || "").toLowerCase();
    const isRanged = attackerClass === "archer" || attackerClass === "wizard";
    const beforeMonsterHp = new Map((gameState.monsters || []).map((m) => [m.id, Number(m.currentHP || 0)]));
    const beforePlayerHp = new Map((gameState.players || []).map((p) => [p.studentId, Number(p.currentHP || 0)]));
    if (player.skillCooldowns && player.skillCooldowns[skillId] > 0) {
      alert(`Skill is on cooldown (${player.skillCooldowns[skillId]} turns remaining)`);
      return;
    }
    const requiredTargetType = getSkillTargetType(player, skill);
    let targetId = null;
    let targetMonsterBefore = null;
    let targetPlayerBefore = null;
    if (requiredTargetType === "monster" && isAoe) {
      targetId = null;
    } else if (requiredTargetType === "monster") {
      const parsedTarget = explicitTarget ? mfNormalizeTargetInput(explicitTarget) : (() => {
        const targetSelect = document.getElementById(`target_${studentId}`);
        return parseTargetValue(targetSelect?.value);
      })();
      if (!parsedTarget.id) {
        alert("Please select a monster target");
        return;
      }
      if (parsedTarget.type !== "monster") {
        alert("This skill must target a monster");
        return;
      }
      targetId = parsedTarget.id;
      targetMonsterBefore = gameState.monsters?.find((m) => m.id === targetId);
      if (!targetMonsterBefore) {
        alert("Selected monster not found");
        return;
      }
    } else if (requiredTargetType === "ally_alive") {
      const parsedTarget = explicitTarget ? mfNormalizeTargetInput(explicitTarget) : (() => {
        const targetSelect = document.getElementById(`target_${studentId}`);
        return parseTargetValue(targetSelect?.value);
      })();
      if (!parsedTarget.id) {
        alert("Please select an ally to target");
        return;
      }
      if (parsedTarget.type !== "ally") {
        alert("Please select a living ally for this skill");
        return;
      }
      targetId = parsedTarget.id;
      targetPlayerBefore = gameState.players.find((p) => p.studentId === targetId);
      if (!targetPlayerBefore || !targetPlayerBefore.isAlive) {
        alert("Selected ally is not available for healing");
        return;
      }
    } else if (requiredTargetType === "ally_dead") {
      const parsedTarget = explicitTarget ? mfNormalizeTargetInput(explicitTarget) : (() => {
        const targetSelect = document.getElementById(`target_${studentId}`);
        return parseTargetValue(targetSelect?.value);
      })();
      if (!parsedTarget.id) {
        alert("Please select a fallen ally");
        return;
      }
      if (parsedTarget.type !== "ally_dead") {
        alert("Please choose a fallen ally for this skill");
        return;
      }
      targetId = parsedTarget.id;
      targetPlayerBefore = gameState.players.find((p) => p.studentId === targetId);
      if (!targetPlayerBefore || targetPlayerBefore.isAlive) {
        alert("Selected ally is not fallen");
        return;
      }
    } else {
      const parsedTarget = explicitTarget ? mfNormalizeTargetInput(explicitTarget) : (() => {
        const targetSelect = document.getElementById(`target_${studentId}`);
        return parseTargetValue(targetSelect?.value);
      })();
      if (!parsedTarget.id) {
        alert("Please select a target");
        return;
      }
      targetId = parsedTarget.id;
      if (parsedTarget.type === "monster") {
        targetMonsterBefore = gameState.monsters?.find((m) => m.id === targetId);
      } else {
        targetPlayerBefore = gameState.players.find((p) => p.studentId === targetId);
      }
    }
    const currentPuzzlePoints = mfGetCurrentPuzzlePoints(studentId);
    console.log("=== PLAYER USE SKILL ===");
    console.log(`Player: ${player?.studentName} (ID: ${studentId})`);
    console.log(`Skill: ${skill.name} (ID: ${skillId})`);
    if (targetMonsterBefore) {
      console.log(`Target Monster: ${targetMonsterBefore?.name} (ID: ${targetId})`);
      console.log(`Target HP BEFORE: ${targetMonsterBefore?.currentHP}/${targetMonsterBefore?.maxHP}`);
    }
    if (targetPlayerBefore) {
      console.log(`Target Player: ${targetPlayerBefore?.studentName} (ID: ${targetId}) | Alive: ${targetPlayerBefore?.isAlive}`);
      if (targetPlayerBefore?.maxHP) {
        console.log(`Target HP BEFORE: ${targetPlayerBefore?.currentHP}/${targetPlayerBefore?.maxHP}`);
      }
    }
    console.log(`Puzzle Points from input: ${currentPuzzlePoints} (gameState: ${player?.puzzlePoints})`);
    try {
      const sendTargetId = isAoe ? null : targetId;
      const response = await fetch(`${GAME_API_BASE}/game/player-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          action: "skill",
          skillId,
          targetId: sendTargetId,
          puzzlePoints: currentPuzzlePoints
          // Send current Puzzle Points from input
        })
      });
      if (!response.ok) {
        let msg = `Failed to use skill (HTTP ${response.status})`;
        try {
          const err = await response.json();
          if (err && typeof err === "object" && err.error) msg = String(err.error);
        } catch {
          try {
            const t = await response.text();
            if (t) msg = t;
          } catch {
          }
        }
        throw new Error(msg);
      }
      const data = await response.json();
      console.log("Server response:", JSON.stringify(data, null, 2));
      const currentMonsters = gameState.monsters ? [...gameState.monsters] : null;
      gameState = data.gameState;
      try {
        const sp = (gameState.players || []).find((p) => p && p.studentId === studentId);
        const baseCd = Math.max(0, Number(skill.cooldown) || 0);
        if (sp && baseCd > 0) {
          if (!sp.skillCooldowns || typeof sp.skillCooldowns !== "object") sp.skillCooldowns = {};
          const sv = Number(sp.skillCooldowns[skillId] || 0);
          const want = baseCd + 1;
          if (!(sv > 0)) sp.skillCooldowns[skillId] = want;
          else sp.skillCooldowns[skillId] = Math.max(sv, want);
        }
      } catch {
      }
      if (currentMonsters && currentMonsters.length > 0 && gameState.monsters) {
        const hitEvents = [];
        console.log("=== UPDATING MONSTER HP (SKILL) ===");
        currentMonsters.forEach((currentMonster) => {
          const serverMonster = gameState.monsters.find((m) => m.id === currentMonster.id);
          if (serverMonster) {
            const oldHP = currentMonster.currentHP;
            const newHP = serverMonster.currentHP;
            const damage = oldHP - newHP;
            if (damage > 0) hitEvents.push({ id: currentMonster.id, damage });
            console.log(`Monster ${currentMonster.name} (${currentMonster.id}):`);
            console.log(`  HP: ${oldHP} -> ${newHP} (damage: ${damage})`);
            console.log(`  Alive: ${currentMonster.isAlive} -> ${serverMonster.isAlive}`);
            currentMonster.currentHP = serverMonster.currentHP;
            currentMonster.isAlive = serverMonster.isAlive;
            if (serverMonster.maxHP) {
              currentMonster.maxHP = serverMonster.maxHP;
            }
          }
        });
        gameState.monsters = currentMonsters;
        if (hitEvents.length) {
          if (isAoe) {
            mfAnimShake(7, 260);
            hitEvents.forEach((ev) => {
              const targetKey = `monster:${ev.id}`;
              mfAnimAddBeam(attackerKey, targetKey, "rgba(255,60,60,0.95)", 10, 320);
              mfAnimHit(targetKey, { blinks: 2, dur: 320, amp: 5 });
              mfAnimAddFloatAtUnit(targetKey, `-${ev.damage}`, "rgba(255,60,60,0.95)", 4e3);
            });
            try {
              const total = hitEvents.reduce((s, ev) => s + (Number(ev.damage) || 0), 0);
              const count = hitEvents.length;
              mfToast(`${player?.studentName || "Player"} ${skill?.name || "Skill"} -${total} (${count} targets)`);
            } catch {
            }
          } else {
            const best = hitEvents.reduce((a, b) => b.damage > a.damage ? b : a, hitEvents[0]);
            const targetKey = `monster:${best.id}`;
            if (isRanged) mfAnimAddBeam(attackerKey, targetKey, "rgba(255,60,60,0.95)", 6, 280);
            else mfAnimDash(attackerKey, targetKey, { dur: 340 });
            mfAnimHit(targetKey, { blinks: 2, dur: 260, amp: 4 });
            mfAnimAddFloatAtUnit(targetKey, `-${best.damage}`, "rgba(255,60,60,0.95)", 4e3);
            try {
              const m = (gameState.monsters || []).find((mm) => mm && mm.id === best.id) || targetMonsterBefore;
              mfToast(`${player?.studentName || "Player"} ${skill?.name || "Skill"} ${m?.name || "Monster"} -${best.damage}`);
            } catch {
            }
          }
        }
      }
      try {
        (gameState.players || []).forEach((p) => {
          const before = beforePlayerHp.get(p.studentId);
          if (before === void 0) return;
          const after = Number(p.currentHP || 0);
          const delta = after - before;
          if (!delta) return;
          const key = `player:${p.studentId}`;
          if (delta > 0) {
            mfAnimAddFloatAtUnit(key, `+${delta}`, "rgba(34,197,94,0.95)", 4e3);
            mfAnimHit(key, { blinks: 2, dur: 260, amp: 2 });
            if (!mfBattleUi._lastHealToastAt || Date.now() - mfBattleUi._lastHealToastAt > 400) {
              mfBattleUi._lastHealToastAt = Date.now();
              mfToast(`${player?.studentName || "Healer"} ${skill?.name || "Heal"} ${p?.studentName || ""} +${delta}`.trim());
            }
          } else {
            mfAnimAddFloatAtUnit(key, `${delta}`, "rgba(255,60,60,0.95)", 4e3);
            mfAnimHit(key, { blinks: 2, dur: 220, amp: 2 });
          }
        });
      } catch {
      }
      if (requiredTargetType === "ally_alive") {
        mfAnimFlip(attackerKey, 3, 520);
      }
      renderGame();
    } catch (error) {
      console.error("Error using skill:", error);
      alert(String(error?.message || "Failed to use skill"));
    }
  }
  async function processMonsterTurn() {
    console.log("=== PROCESS MONSTER TURN ===");
    if (monsterTurnReplay && monsterTurnReplay.active) {
      console.log("[monster-turn] replay in progress, ignoring.");
      try {
        mfToast("Replay in progress \u2014 click Next to continue.", {
          next: true,
          onNext: () => {
            isShowingPopup = false;
            void processActionQueue();
          }
        });
      } catch {
      }
      return;
    }
    console.log("Players BEFORE monster turn:", gameState.players.map((p) => ({
      name: p.studentName,
      hp: `${p.currentHP}/${p.maxHP}`,
      alive: p.isAlive
    })));
    console.log("Monsters BEFORE monster turn:", gameState.monsters?.map((m) => ({
      name: m.name,
      hp: `${m.currentHP}/${m.maxHP}`,
      alive: m.isAlive
    })));
    try {
      monsterTurnReplay.active = true;
      monsterTurnReplay.pendingWsState = null;
      monsterTurnReplay.onDone = null;
      actionQueue = [];
      isShowingPopup = false;
      mfPendingToast = null;
      try {
        mfHideBattleToast();
      } catch {
      }
      lastActionLogLength = Array.isArray(gameState.actionLog) ? gameState.actionLog.length : lastActionLogLength;
      const response = await fetch(`${GAME_API_BASE}/game/monster-turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (!response.ok) {
        throw new Error("Failed to process monster turn");
      }
      const data = await response.json();
      console.log("Server response:", JSON.stringify(data, null, 2));
      const hasEvents = Array.isArray(data?.turnEvents) && data.turnEvents.length > 0 && data.gameState;
      if (hasEvents) {
        const finalState = data.gameState;
        monsterTurnReplay.onDone = () => {
          const synced = monsterTurnReplay.pendingWsState || finalState;
          monsterTurnReplay.active = false;
          if (synced) {
            gameState = synced;
            lastActionLogLength = Array.isArray(gameState.actionLog) ? gameState.actionLog.length : lastActionLogLength;
          }
          renderGame();
        };
        data.turnEvents.forEach((evt, idx) => {
          const log = evt?.log || {};
          const snap = evt?.snapshot || null;
          const rawMessage = String(log.message || "");
          if (!rawMessage) return;
          const summary = Array.isArray(log.summaryDetails) ? decorateSummaryLines(log.summaryDetails) : null;
          const context = { ...derivePopupContext(rawMessage) || {}, rawMessage, autoProceed: idx === 0 };
          const decoratedMessage = decorateMessageWithIcons(rawMessage);
          queueActionPopup(decoratedMessage, summary, context, {
            beforeShow: () => {
              const prevState = gameState ? {
                phase: gameState.phase,
                currentTurn: gameState.currentTurn,
                players: gameState.players,
                monsters: gameState.monsters,
                actionLog: gameState.actionLog
              } : null;
              applyMonsterTurnSnapshot(snap);
              try {
                mfReplayFxFromMonsterTurnStep(rawMessage, prevState, gameState);
              } catch {
              }
              renderGame();
            }
          });
        });
        return;
      }
      const currentMonsters = gameState.monsters ? [...gameState.monsters] : null;
      const currentPlayers = gameState.players ? [...gameState.players] : null;
      gameState = data.gameState || data;
      if (currentPlayers && currentPlayers.length > 0 && gameState.players) {
        currentPlayers.forEach((currentPlayer) => {
          const serverPlayer = gameState.players.find((p) => p.studentId === currentPlayer.studentId);
          if (serverPlayer) {
            currentPlayer.currentHP = serverPlayer.currentHP;
            currentPlayer.isAlive = serverPlayer.isAlive;
            if (serverPlayer.maxHP) currentPlayer.maxHP = serverPlayer.maxHP;
          }
        });
        gameState.players = currentPlayers;
      }
      if (currentMonsters && currentMonsters.length > 0 && gameState.monsters) {
        currentMonsters.forEach((currentMonster) => {
          const serverMonster = gameState.monsters.find((m) => m.id === currentMonster.id);
          if (serverMonster) {
            currentMonster.currentHP = serverMonster.currentHP;
            currentMonster.isAlive = serverMonster.isAlive;
            if (serverMonster.maxHP) currentMonster.maxHP = serverMonster.maxHP;
          }
        });
        gameState.monsters = currentMonsters;
      }
      renderGame();
      monsterTurnReplay.active = false;
    } catch (error) {
      try {
        monsterTurnReplay.active = false;
      } catch {
      }
      console.error("Error processing monster turn:", error);
      alert("Failed to process monster turn");
    }
  }
  function showReviveModal(studentId) {
    const player = gameState.players.find((p) => p.studentId === studentId);
    if (!player) return;
    const modal = document.createElement("div");
    modal.className = "modal show";
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Revive ${player.studentName}</h3>
                <span class="modal-close" onclick="this.closest('.modal').remove()">&times;</span>
            </div>
            <div class="modal-body">
                <p>Enter puzzle points to attempt revival</p>
                <input type="number" id="revive_points" min="1" max="${player.puzzlePoints}" value="1" class="puzzle-input">
                <p id="revive_probability"></p>
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="attemptRevive('${studentId}')">Attempt Revive</button>
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const pointsInput = document.getElementById("revive_points");
    const probDisplay = document.getElementById("revive_probability");
    pointsInput.addEventListener("input", () => {
      const points = parseInt(pointsInput.value) || 0;
      const baseRate = gameConfig.baseReviveRate;
      const decay = gameConfig.reviveRateDecay;
      const maxRate = gameConfig.maxReviveRate;
      const accumulated = player.accumulatedReviveRate || 0;
      let totalRate = accumulated;
      if (points > 0) {
        const geometricSum = baseRate * (1 - Math.pow(decay, points)) / (1 - decay);
        totalRate += geometricSum;
      }
      totalRate = Math.min(totalRate, maxRate);
      probDisplay.textContent = `Revive Probability: ${(totalRate * 100).toFixed(1)}%`;
    });
    pointsInput.dispatchEvent(new Event("input"));
  }
  async function attemptRevive(studentId) {
    const pointsInput = document.getElementById("revive_points");
    const puzzlePoints = parseInt(pointsInput.value) || 0;
    if (puzzlePoints <= 0) {
      alert("Please enter a valid number of puzzle points");
      return;
    }
    try {
      const response = await fetch(`${GAME_API_BASE}/game/revive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, puzzlePoints })
      });
      if (!response.ok) {
        throw new Error("Failed to attempt revive");
      }
      const data = await response.json();
      gameState = data.gameState;
      document.querySelector(".modal.show")?.remove();
      if (data.success) {
        alert(`${gameState.players.find((p) => p.studentId === studentId)?.studentName} successfully revived!`);
      } else {
        alert(`Revive failed. Probability was ${(data.reviveRate * 100).toFixed(1)}%`);
      }
      renderGame();
    } catch (error) {
      console.error("Error attempting revive:", error);
      alert("Failed to attempt revive");
    }
  }
  function renderLevelComplete() {
    const container = document.getElementById("monsterFightGame");
    const nextLevel = gameState.currentLevel;
    const isLastLevel = nextLevel > gameState.levelConfig.length;
    container.innerHTML = `
        <div class="game-screen">
            <div class="level-complete-screen" style="text-align: center; padding: 40px;">
                <h2>\u{1F389} Level ${nextLevel - 1} Complete!</h2>
                ${!isLastLevel ? `
                    <p style="font-size: 1.2em; margin: 20px 0;">Ready to start Level ${nextLevel}?</p>
                    <div class="level-complete-actions" style="margin-top: 30px;">
                        <button class="btn btn-primary" onclick="startNextLevel()" style="font-size: 1.2em; padding: 15px 30px;">\u27A1\uFE0F Start Level ${nextLevel}</button>
                    </div>
                ` : `
                    <p style="font-size: 1.2em; margin: 20px 0;">All levels completed! Congratulations!</p>
                    <div class="level-complete-actions" style="margin-top: 30px;">
                        <button class="btn btn-primary" onclick="completeGame()" style="font-size: 1.2em; padding: 15px 30px;">\u{1F3C6} Complete Game</button>
                    </div>
                `}
            </div>
        </div>
    `;
  }
  async function startNextLevel() {
    try {
      gameState.monsters = [];
      const puzzlePoints = {};
      gameState.players.forEach((player) => {
        puzzlePoints[player.studentId] = player.puzzlePoints || 0;
      });
      const response = await fetch(`${GAME_API_BASE}/game/input-puzzle-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puzzlePoints })
      });
      if (!response.ok) {
        throw new Error("Failed to start next level");
      }
      const newState = await response.json();
      gameState = newState;
      gameState.phase = "player_turn";
      gameState.players.forEach((p) => p.hasActed = false);
      renderGame();
    } catch (error) {
      console.error("Error starting next level:", error);
      alert("Failed to start next level");
    }
  }
  async function completeGame() {
    try {
      const response = await fetch(`${GAME_API_BASE}/game/state`);
      if (!response.ok) {
        throw new Error("Failed to load game state");
      }
      gameState = await response.json();
      renderGame();
    } catch (error) {
      console.error("Error completing game:", error);
      alert("Failed to complete game");
    }
  }
  function renderGameOver() {
    const container = document.getElementById("monsterFightGame");
    const rewardsSummary = gameState.rewardsSummary || {};
    const rewardLookup = {};
    if (Array.isArray(rewardsSummary.rewards)) {
      rewardsSummary.rewards.forEach((entry) => {
        rewardLookup[entry.studentId] = entry;
      });
    }
    const baseReward = rewardsSummary.baseReward ?? 20;
    const mvpBonus = rewardsSummary.mvpBonus ?? 5;
    const mvpId = rewardsSummary.mvp?.studentId;
    container.innerHTML = `
        <div class="game-screen">
            <h2>\u{1F389} Game Over!</h2>
            <div class="reward-summary">
                <p>Each player receives <strong>${baseReward}</strong> rank points${rewardsSummary.mvp ? `, and MVP <strong>${rewardsSummary.mvp.name}</strong> earns an additional <strong>${mvpBonus}</strong> points!` : ""}</p>
            </div>
            <div class="game-results">
                <h3>Results</h3>
                ${gameState.players.map((player) => {
      const rewardInfo = rewardLookup[player.studentId];
      const reward = rewardInfo?.reward ?? player.rewardPoints ?? baseReward;
      const isMVP = rewardInfo?.isMVP || player.studentId === mvpId;
      const stats = player.stats || {};
      return `
                        <div class="result-card ${isMVP ? "mvp-card" : ""}">
                            <h4>${player.studentName}${isMVP ? " \u2B50\uFE0F MVP" : ""}</h4>
                            <p>Reward: ${reward}</p>
                            <p>Damage: ${stats.totalDamage || 0}</p>
                            <p>Kills: ${stats.kills || 0}</p>
                            <p>Healing: ${stats.healing || 0}</p>
                        </div>
                    `;
    }).join("")}
            </div>
        </div>
    `;
  }
  window.initMonsterFight = initMonsterFight;
  window.selectCharacter = selectCharacter;
  window.startBattleMode = startBattleMode;
  window.openGameSettings = openGameSettings;
  window.closeSettingsModal = closeSettingsModal;
  window.switchSettingsTab = switchSettingsTab;
  window.toggleSettingsItem = toggleSettingsItem;
  window.updateLevelConfig = updateLevelConfig;
  window.updateLevelMonsters = updateLevelMonsters;
  window.saveGameSettings = saveGameSettings;
  window.renderLevelConfigList = renderLevelConfigList;
  window.renderLevelMonsters = renderLevelMonsters;
  window.updatePuzzlePoints = updatePuzzlePoints;
  window.applyDifficultyPreset = applyDifficultyPreset;
  window.startBattleAfterPuzzleInput = startBattleAfterPuzzleInput;
  window.startNextLevel = startNextLevel;
  window.completeGame = completeGame;
  window.terminateGame = terminateGame;
  window.playerAttack = playerAttack;
  window.playerUseSkill = playerUseSkill;
  window.processMonsterTurn = processMonsterTurn;
  window.showReviveModal = showReviveModal;
  window.attemptRevive = attemptRevive;
  console.log("monster-fight.js loaded successfully");
  function addIconToName(name, type, id) {
    if (!name) return "";
    if (type === "player") {
      const cls = getPlayerClasses().find((c) => c.id === id);
      const src = imageSrcForFile(classImageFileById(id));
      const fb = cls && cls.emoji || CLASS_ICON_MAP[id] || "\u{1F9D1}";
      const iconHtml = src ? `<img class="mf-inline-icon" alt="" src="${escapeHtml(src)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';"><span class="mf-inline-emoji" style="display:none;">${escapeHtml(fb)}</span>` : `<span class="mf-inline-emoji">${escapeHtml(fb)}</span>`;
      return `${iconHtml} ${escapeHtml(name)}`;
    }
    if (type === "monster") {
      const src = imageSrcForFile(monsterImageFileByType(id));
      const fb = monsterIconMap[id] || "\u{1F47E}";
      const iconHtml = src ? `<img class="mf-inline-icon" alt="" src="${escapeHtml(src)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';"><span class="mf-inline-emoji" style="display:none;">${escapeHtml(fb)}</span>` : `<span class="mf-inline-emoji">${escapeHtml(fb)}</span>`;
      return `${iconHtml} ${escapeHtml(name)}`;
    }
    return name;
  }
  function decorateMessageWithIcons(message) {
    if (!message) return message;
    if (!gameState || !Array.isArray(gameState.players) || !Array.isArray(gameState.monsters)) {
      return message;
    }
    let decorated = message;
    gameState.players.forEach((player) => {
      if (player.studentName && decorated.includes(player.studentName)) {
        const iconName = addIconToName(player.studentName, "player", player.characterClass);
        const highlighted = `<span class="action-popup-entity player-entity">${iconName}</span>`;
        decorated = decorated.replace(new RegExp(player.studentName, "g"), highlighted);
      }
    });
    gameState.monsters.forEach((monster) => {
      if (monster.name && decorated.includes(monster.name)) {
        const iconName = addIconToName(monster.name, "monster", monster.type);
        const highlighted = `<span class="action-popup-entity monster-entity">${iconName}</span>`;
        decorated = decorated.replace(new RegExp(monster.name, "g"), highlighted);
      }
    });
    return decorated;
  }
  function decorateSummaryLines(lines) {
    if (!Array.isArray(lines)) return [];
    return lines.map((line) => decorateMessageWithIcons(line));
  }
  function derivePopupContext(message) {
    const context = {};
    if (!message || !gameState) {
      return context;
    }
    const entities = [];
    const participants = [
      ...gameState.monsters.map((monster) => ({
        type: "monster",
        id: monster.type,
        name: monster.name,
        emoji: monsterIconMap[monster.type] || monster.emoji || "\u{1F47E}",
        imgSrc: imageSrcForFile(monsterImageFileByType(monster.type))
      })),
      ...gameState.players.map((player) => ({
        type: "player",
        id: player.characterClass,
        name: player.studentName,
        emoji: CLASS_ICON_MAP[player.characterClass] || "\u{1F9D1}",
        imgSrc: imageSrcForFile(classImageFileById(player.characterClass))
      }))
    ];
    participants.forEach((entity) => {
      if (!entity.name) return;
      const index = message.indexOf(entity.name);
      if (index !== -1) {
        entities.push({ ...entity, index });
      }
    });
    if (entities.length === 0) {
      return context;
    }
    entities.sort((a, b) => a.index - b.index);
    const actor = entities[0];
    let target = null;
    for (let i = 1; i < entities.length; i += 1) {
      if (entities[i].type !== actor.type || entities[i].name !== actor.name) {
        target = entities[i];
        break;
      }
    }
    if (actor) {
      context.actorEmoji = actor.emoji;
      if (actor.imgSrc) context.actorImgSrc = actor.imgSrc;
    }
    if (target) {
      context.targetEmoji = target.emoji;
      if (target.imgSrc) context.targetImgSrc = target.imgSrc;
    }
    const lower = message.toLowerCase();
    if (lower.includes("heal") || lower.includes("restores") || lower.includes("regenerate")) {
      context.actionEmoji = "\u2728";
      context.actionKind = "heal";
    } else if (lower.includes("burn") || lower.includes("fire") || lower.includes("flame")) {
      context.actionEmoji = "\u{1F525}";
      context.actionKind = "attack";
    } else if (lower.includes("bleed") || lower.includes("poison")) {
      context.actionEmoji = "\u{1FA78}";
      context.actionKind = "attack";
    } else if (lower.includes("stun") || lower.includes("freeze") || lower.includes("silence")) {
      context.actionEmoji = "\u{1F4AB}";
      context.actionKind = "attack";
    } else if (lower.includes("defeat") || lower.includes("kill")) {
      context.actionEmoji = "\u2620\uFE0F";
      context.actionKind = "attack";
    } else if (lower.includes("shield") || lower.includes("protect")) {
      context.actionEmoji = "\u{1F6E1}\uFE0F";
      context.actionKind = "attack";
    } else if (lower.includes("revive")) {
      context.actionEmoji = "\u{1F54A}\uFE0F";
      context.actionKind = "heal";
    } else if (lower.includes("attack") || lower.includes("strike") || lower.includes("slash") || lower.includes("smashes")) {
      context.actionEmoji = "\u2694\uFE0F";
      context.actionKind = "attack";
    } else {
      context.actionEmoji = "\u26A1";
      context.actionKind = "attack";
    }
    return context;
  }
})();
