(function () {
  "use strict";

  const API_GET = "/admin/my-own-app/eatwhat";
  const API_PUT = "/admin/my-own-app/eatwhat";

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function normTokens(s) {
    return String(s || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function lower(s) {
    return String(s || "").toLowerCase();
  }

  function toast(msg, type) {
    const el = $("ewToast");
    if (!el) return;
    el.textContent = String(msg || "");
    el.classList.add("active");
    el.classList.toggle("err", String(type) === "err");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      try {
        el.classList.remove("active");
        el.classList.remove("err");
        el.textContent = "";
      } catch {}
    }, 2400);
  }

  async function apiFetchJson(url, options) {
    if (!window.authUtils || !window.authUtils.authenticatedFetch) {
      throw new Error("authUtils not available");
    }
    const resp = await window.authUtils.authenticatedFetch(url, options || {});
    if (!resp) throw new Error("Not authenticated");
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || "Request failed");
    return data;
  }

  function defaultState() {
    return {
      foods: [
        { id: uid(), name: "Ramen", tags: ["japanese", "noodles"] },
        { id: uid(), name: "Rice bowl", tags: ["rice"] },
        { id: uid(), name: "Sandwich", tags: ["fast"] }
      ],
      people: [{ id: uid(), name: "Me", exclude: [] }],
      selectedPersonId: null,
      lastResult: null
    };
  }

  const ui = {
    state: defaultState(),
    spinning: false,
    wheelAngle: 0,
    saveTimer: null,
    saving: false,
    pendingSave: false
  };

  function normalizeState(s) {
    const o = (s && typeof s === "object") ? s : {};
    const foods = Array.isArray(o.foods) ? o.foods : [];
    const people = Array.isArray(o.people) ? o.people : [];
    const selectedPersonId = o.selectedPersonId ? String(o.selectedPersonId) : null;
    const lastResult = (o.lastResult && typeof o.lastResult === "object") ? o.lastResult : null;
    // sanitize entries lightly
    const foods2 = foods
      .map((f) => ({
        id: String(f?.id || uid()),
        name: String(f?.name || "").trim(),
        tags: Array.isArray(f?.tags) ? f.tags.map((t) => String(t || "").trim()).filter(Boolean) : []
      }))
      .filter((f) => !!f.name);
    const people2 = people
      .map((p) => ({
        id: String(p?.id || uid()),
        name: String(p?.name || "").trim(),
        exclude: Array.isArray(p?.exclude) ? p.exclude.map((t) => String(t || "").trim()).filter(Boolean) : []
      }))
      .filter((p) => !!p.name);
    return {
      foods: foods2,
      people: people2.length ? people2 : [{ id: uid(), name: "Me", exclude: [] }],
      selectedPersonId,
      lastResult
    };
  }

  async function loadStateFromDb() {
    const data = await apiFetchJson(API_GET, { method: "GET" });
    if (data && data.state) return normalizeState(data.state);
    return defaultState();
  }

  async function saveStateToDb() {
    ui.saving = true;
    try {
      await apiFetchJson(API_PUT, { method: "PUT", body: JSON.stringify({ state: ui.state }) });
    } finally {
      ui.saving = false;
    }
  }

  function scheduleSave() {
    ui.pendingSave = true;
    clearTimeout(ui.saveTimer);
    ui.saveTimer = setTimeout(async () => {
      if (!ui.pendingSave) return;
      ui.pendingSave = false;
      try {
        await saveStateToDb();
      } catch (e) {
        toast(e?.message || String(e), "err");
      }
    }, 300);
  }

  function getSelectedPerson() {
    const sid = String(ui.state.selectedPersonId || "");
    return ui.state.people.find((p) => String(p.id) === sid) || ui.state.people[0] || null;
  }

  function foodAllowedForPerson(food, person) {
    if (!food || !person) return true;
    const ex = Array.isArray(person.exclude) ? person.exclude : [];
    if (!ex.length) return true;
    const hay = `${lower(food.name)} ${lower((food.tags || []).join(" "))}`;
    return !ex.some((t) => t && hay.includes(lower(t)));
  }

  function getCandidates() {
    const person = getSelectedPerson();
    const foods = Array.isArray(ui.state.foods) ? ui.state.foods : [];
    return foods.filter((f) => foodAllowedForPerson(f, person));
  }

  function renderPeople() {
    const sel = $("ewPersonSelect");
    if (!sel) return;
    sel.innerHTML = "";
    const people = Array.isArray(ui.state.people) ? ui.state.people : [];
    if (!people.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No people yet";
      sel.appendChild(opt);
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    for (const p of people) {
      const opt = document.createElement("option");
      opt.value = String(p.id || "");
      opt.textContent = String(p.name || "Unnamed");
      sel.appendChild(opt);
    }
    const cur = ui.state.selectedPersonId ? String(ui.state.selectedPersonId) : String(people[0].id);
    ui.state.selectedPersonId = cur;
    sel.value = cur;

    const person = getSelectedPerson();
    const meta = $("ewPersonMeta");
    if (meta) {
      const ex = (person && Array.isArray(person.exclude) ? person.exclude : []).filter(Boolean);
      meta.textContent = ex.length ? `Exclusions: ${ex.join(", ")}` : "Exclusions: (none)";
    }
  }

  function renderFoodsList() {
    const host = $("ewFoodsList");
    if (!host) return;
    host.innerHTML = "";
    const foods = Array.isArray(ui.state.foods) ? ui.state.foods : [];
    if (!foods.length) {
      const empty = document.createElement("div");
      empty.className = "ew-muted";
      empty.textContent = "No foods yet. Add some above.";
      host.appendChild(empty);
      return;
    }

    const person = getSelectedPerson();
    for (const f of foods) {
      const allowed = foodAllowedForPerson(f, person);
      const row = document.createElement("div");
      row.className = "ew-item";
      row.style.opacity = allowed ? "1" : "0.5";

      const left = document.createElement("div");
      left.style.minWidth = "0";
      const t = document.createElement("div");
      t.className = "ew-item-title";
      t.textContent = String(f.name || "");
      const m = document.createElement("div");
      m.className = "ew-item-meta";
      const tags = Array.isArray(f.tags) ? f.tags : [];
      m.textContent = tags.length ? `Tags: ${tags.join(", ")}` : "Tags: (none)";
      left.appendChild(t);
      left.appendChild(m);

      const right = document.createElement("div");
      right.className = "ew-item-actions";
      const del = document.createElement("button");
      del.className = "ew-mini-btn";
      del.type = "button";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        ui.state.foods = (ui.state.foods || []).filter((x) => String(x.id) !== String(f.id));
        scheduleSave();
        renderAll();
      });
      right.appendChild(del);

      row.appendChild(left);
      row.appendChild(right);
      host.appendChild(row);
    }
  }

  function drawWheel(candidates, angleRad) {
    const cv = $("ewWheel");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const w = cv.width;
    const h = cv.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 8;

    ctx.clearRect(0, 0, w, h);

    // background ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();

    const items = Array.isArray(candidates) ? candidates : [];
    if (items.length === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fill();
      ctx.fillStyle = "rgba(229,231,235,0.85)";
      ctx.font = "800 16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No candidates", cx, cy);
      return;
    }

    const seg = (Math.PI * 2) / items.length;
    const base = angleRad || 0;
    for (let i = 0; i < items.length; i++) {
      const a0 = base + i * seg;
      const a1 = a0 + seg;
      const isAlt = i % 2 === 0;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = isAlt ? "rgba(20,184,166,0.32)" : "rgba(99,102,241,0.28)";
      ctx.fill();

      // label
      const mid = (a0 + a1) / 2;
      const tx = cx + Math.cos(mid) * (r * 0.63);
      const ty = cy + Math.sin(mid) * (r * 0.63);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(mid);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "900 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const name = String(items[i].name || "");
      ctx.fillText(name.length > 12 ? `${name.slice(0, 12)}…` : name, 0, 0);
      ctx.restore();
    }

    // center cap
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.fill();
  }

  function pickIndexFromAngle(itemsLen, angleRad) {
    // pointer is at top (-90deg). We rotate wheel; convert angle to segment index.
    const seg = (Math.PI * 2) / itemsLen;
    const a = (angleRad % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    // pointer at -pi/2, so shift
    const shifted = (a + Math.PI / 2) % (Math.PI * 2);
    const idx = Math.floor(((Math.PI * 2) - shifted) / seg) % itemsLen;
    return clamp(idx, 0, itemsLen - 1);
  }

  async function spinOnce() {
    if (ui.spinning) return;
    const candidates = getCandidates();
    const hint = $("ewHint");
    const res = $("ewResult");
    if (res) res.textContent = "";
    if (hint) hint.textContent = "";

    if (candidates.length === 0) {
      toast("No candidates (check exclusions or add foods).", "err");
      if (hint) hint.textContent = "Tip: remove exclusions or add more foods/tags.";
      drawWheel([], 0);
      return;
    }

    ui.spinning = true;
    const spinBtn = $("ewSpinBtn");
    if (spinBtn) spinBtn.disabled = true;

    // Random target with multiple turns
    const turns = 4 + Math.random() * 3;
    const target = ui.wheelAngle + turns * Math.PI * 2 + (Math.random() * Math.PI * 2);
    const start = ui.wheelAngle;
    const dur = 2200 + Math.random() * 600;
    const t0 = performance.now();

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    await new Promise((resolve) => {
      function frame(now) {
        const p = clamp((now - t0) / dur, 0, 1);
        const e = easeOutCubic(p);
        ui.wheelAngle = start + (target - start) * e;
        drawWheel(candidates, ui.wheelAngle);
        if (p >= 1) return resolve();
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    const idx = pickIndexFromAngle(candidates.length, ui.wheelAngle);
    const chosen = candidates[idx];
    ui.state.lastResult = {
      at: new Date().toISOString(),
      personId: getSelectedPerson()?.id || null,
      foodId: chosen?.id || null,
      foodName: chosen?.name || null
    };
    scheduleSave();

    if (res) res.textContent = chosen?.name ? `You should eat: ${chosen.name}` : "Result unavailable";
    if (hint) {
      const person = getSelectedPerson();
      hint.textContent = person ? `Person: ${person.name}` : "";
    }

    ui.spinning = false;
    if (spinBtn) spinBtn.disabled = false;
  }

  function openModal() {
    const b = $("ewModalBackdrop");
    if (!b) return;
    b.classList.add("active");
    b.setAttribute("aria-hidden", "false");
    const name = $("ewPersonName");
    if (name) {
      name.value = "";
      name.focus();
    }
    const ex = $("ewPersonExclude");
    if (ex) ex.value = "";
  }

  function closeModal() {
    const b = $("ewModalBackdrop");
    if (!b) return;
    b.classList.remove("active");
    b.setAttribute("aria-hidden", "true");
  }

  function renderWheel() {
    const candidates = getCandidates();
    drawWheel(candidates, ui.wheelAngle || 0);
  }

  function renderResult() {
    const el = $("ewResult");
    if (!el) return;
    const lr = ui.state.lastResult;
    if (!lr || !lr.foodName) {
      el.textContent = "";
      return;
    }
    el.textContent = `Last: ${String(lr.foodName)}`;
  }

  function renderAll() {
    // Keep selected person id valid
    const people = Array.isArray(ui.state.people) ? ui.state.people : [];
    if (people.length === 0) {
      ui.state.people = [{ id: uid(), name: "Me", exclude: [] }];
    }
    if (!ui.state.selectedPersonId || !people.some((p) => String(p.id) === String(ui.state.selectedPersonId))) {
      ui.state.selectedPersonId = String(ui.state.people[0].id);
    }

    renderPeople();
    renderFoodsList();
    renderWheel();
    renderResult();

    const hint = $("ewHint");
    if (hint) {
      const p = getSelectedPerson();
      const foods = Array.isArray(ui.state.foods) ? ui.state.foods : [];
      const cands = getCandidates();
      hint.textContent = p ? `Candidates for ${p.name}: ${cands.length} / ${foods.length}` : "";
    }
  }

  function bind() {
    $("ewAddPersonBtn")?.addEventListener("click", openModal);
    $("ewModalCancel")?.addEventListener("click", closeModal);
    $("ewModalBackdrop")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "ewModalBackdrop") closeModal();
    });

    $("ewModalSave")?.addEventListener("click", () => {
      const name = String($("ewPersonName")?.value || "").trim();
      if (!name) {
        toast("Name is required.", "err");
        return;
      }
      const exclude = normTokens($("ewPersonExclude")?.value || "").map(lower);
      ui.state.people = ui.state.people || [];
      ui.state.people.push({ id: uid(), name, exclude });
      ui.state.selectedPersonId = ui.state.people[ui.state.people.length - 1].id;
      scheduleSave();
      closeModal();
      renderAll();
      toast("Person saved.");
    });

    $("ewPersonSelect")?.addEventListener("change", (e) => {
      ui.state.selectedPersonId = String(e.target?.value || "");
      scheduleSave();
      renderAll();
    });

    $("ewAddFoodBtn")?.addEventListener("click", () => {
      const name = String($("ewFoodName")?.value || "").trim();
      if (!name) {
        toast("Food name is required.", "err");
        return;
      }
      const tags = normTokens($("ewFoodTags")?.value || "").map(lower);
      ui.state.foods = ui.state.foods || [];
      ui.state.foods.push({ id: uid(), name, tags });
      $("ewFoodName").value = "";
      $("ewFoodTags").value = "";
      scheduleSave();
      renderAll();
      toast("Food added.");
    });

    // Enter to add food (mobile-friendly)
    $("ewFoodName")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        $("ewAddFoodBtn")?.click();
      }
    });

    $("ewSpinBtn")?.addEventListener("click", () => {
      spinOnce().catch((e) => toast(e?.message || String(e), "err"));
    });

    $("ewResetBtn")?.addEventListener("click", () => {
      const ok = confirm("Reset EatWhat data on this device?");
      if (!ok) return;
      ui.state = defaultState();
      ui.wheelAngle = 0;
      scheduleSave();
      renderAll();
      toast("Reset done.");
    });

    // Resize wheel to match CSS width (keep crisp on mobile)
    function resizeCanvas() {
      const cv = $("ewWheel");
      if (!cv) return;
      const cssPx = Math.floor(Math.min(window.innerWidth * 0.82, 320));
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      cv.style.width = `${cssPx}px`;
      cv.style.height = `${cssPx}px`;
      cv.width = Math.floor(cssPx * dpr);
      cv.height = Math.floor(cssPx * dpr);
      const ctx = cv.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderWheel();
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
  }

  window.addEventListener("DOMContentLoaded", () => {
    try {
      if (!window.authUtils || !window.authUtils.requireRole || !window.authUtils.verifyAuth) {
        toast("auth.js not loaded.", "err");
        return;
      }
      if (!window.authUtils.requireRole("admin")) return;
      // Refresh user info (keeps role/token consistent)
      window.authUtils.verifyAuth().catch(() => null);
      bind();
      // Load initial state from Postgres
      loadStateFromDb()
        .then((s) => {
          ui.state = normalizeState(s);
          renderAll();
          toast("Loaded.");
        })
        .catch((e) => {
          ui.state = defaultState();
          renderAll();
          toast(e?.message || String(e), "err");
        });
    } catch (e) {
      toast(e?.message || String(e), "err");
    }
  });
})();


