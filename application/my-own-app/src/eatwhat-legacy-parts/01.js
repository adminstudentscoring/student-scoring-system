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
        { id: uid(), name: "Ramen", tags: ["japanese", "noodles"], slots: ["breakfast", "brunch", "lunch", "tea", "dinner"] },
        { id: uid(), name: "Rice bowl", tags: ["rice"], slots: ["breakfast", "brunch", "lunch", "tea", "dinner"] },
        { id: uid(), name: "Sandwich", tags: ["fast"], slots: ["breakfast", "brunch", "lunch", "tea", "dinner"] }
      ],
      people: [{ id: uid(), name: "Me", exclude: [] }],
      wheelSelectedPersonIds: [],
      selectedMealSlot: "lunch",
      viewTab: "wheel",
      lastResult: null
    };
  }

  const ui = {
    state: defaultState(),
    spinning: false,
    wheelAngle: 0,
    saveTimer: null,
    saving: false,
    pendingSave: false,
    editPersonId: null,
    editFoodId: null,
    foodSlotDraft: new Set(),
    foodSlotEditDraft: new Set(),
    canvasCssPx: 320,
    canvasDpr: 1
  };

  const MEAL_SLOTS = [
    { key: "breakfast", label: "Breakfast" },
    { key: "brunch", label: "Brunch" },
    { key: "lunch", label: "Lunch" },
    { key: "tea", label: "Afternoon Tea" },
    { key: "dinner", label: "Dinner" },
    { key: "lateNight", label: "Late Night" }
  ];

  function mealLabel(key) {
    const k = String(key || "");
    return (MEAL_SLOTS.find((x) => x.key === k) || {}).label || k;
  }

  function defaultFoodSlots() {
    // preset all except Late Night
    return ["breakfast", "brunch", "lunch", "tea", "dinner"];
  }

  function normalizeState(s) {
    const o = (s && typeof s === "object") ? s : {};
    const foods = Array.isArray(o.foods) ? o.foods : [];
    const people = Array.isArray(o.people) ? o.people : [];
    const wheelSelectedPersonIds = Array.isArray(o.wheelSelectedPersonIds) ? o.wheelSelectedPersonIds.map((x) => String(x || "")).filter(Boolean) : [];
    const selectedMealSlot = String(o.selectedMealSlot || "lunch") || "lunch";
    const viewTab = String(o.viewTab || "wheel") || "wheel";
    const lastResult = (o.lastResult && typeof o.lastResult === "object") ? o.lastResult : null;
    // sanitize entries lightly
    const foods2 = foods
      .map((f) => ({
        id: String(f?.id || uid()),
        name: String(f?.name || "").trim(),
        tags: Array.isArray(f?.tags) ? f.tags.map((t) => String(t || "").trim()).filter(Boolean) : [],
        slots: Array.isArray(f?.slots)
          ? f.slots.map((t) => String(t || "").trim()).filter(Boolean)
          : defaultFoodSlots()
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
      wheelSelectedPersonIds,
      selectedMealSlot,
      viewTab,
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

  function selectedPeopleIds() {
    const ids = Array.isArray(ui.state.wheelSelectedPersonIds) ? ui.state.wheelSelectedPersonIds : [];
    return ids.map((x) => String(x || "")).filter(Boolean);
  }

  function selectedPeople() {
    const ids = new Set(selectedPeopleIds());
    const all = Array.isArray(ui.state.people) ? ui.state.people : [];
    if (!ids.size) return [];
    return all.filter((p) => ids.has(String(p?.id || "")));
  }

  function mergedExclusionsForPeople(people) {
    const out = [];
    const seen = new Set();
    for (const p of Array.isArray(people) ? people : []) {
      const ex = Array.isArray(p?.exclude) ? p.exclude : [];
      for (const t of ex) {
        const k = lower(String(t || "").trim());
        if (!k) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(k);
      }
    }
    return out;
  }

  function foodAllowedForExclusions(food, exclusions) {
    if (!food) return true;
    const ex = Array.isArray(exclusions) ? exclusions : [];
    if (!ex.length) return true;
    const hay = `${lower(food.name)} ${lower((food.tags || []).join(" "))}`;
    return !ex.some((t) => t && hay.includes(lower(t)));
  }

  function foodAllowedForMeal(food, mealKey) {
    const slots = Array.isArray(food?.slots) ? food.slots : defaultFoodSlots();
    const mk = String(mealKey || "");
    if (!mk) return true;
    return slots.includes(mk);
  }

  function getCandidates() {
    const mk = String(ui.state.selectedMealSlot || "lunch") || "lunch";
    const ppl = selectedPeople();
    const ex = mergedExclusionsForPeople(ppl);
    const foods = Array.isArray(ui.state.foods) ? ui.state.foods : [];
    return foods
      .filter((f) => foodAllowedForMeal(f, mk))
      .filter((f) => foodAllowedForExclusions(f, ex));
  }

  function renderPeopleList() {
    const host = $("ewPeopleList");
    if (!host) return;
    host.innerHTML = "";
    const people = Array.isArray(ui.state.people) ? ui.state.people : [];
    if (!people.length) {
      const empty = document.createElement("div");
      empty.className = "ew-muted";
      empty.textContent = "No people yet. Add one.";
      host.appendChild(empty);
      return;
    }

    for (const p of people) {
      const row = document.createElement("div");
      row.className = "ew-item";

      const left = document.createElement("div");
      left.style.minWidth = "0";
      const t = document.createElement("div");
      t.className = "ew-item-title";
      t.textContent = String(p?.name || "Unnamed");
      const m = document.createElement("div");
      m.className = "ew-item-meta";
      const ex = Array.isArray(p?.exclude) ? p.exclude.filter(Boolean) : [];
      m.textContent = ex.length ? `Exclude: ${ex.join(", ")}` : "Exclude: (none)";
      left.appendChild(t);
      left.appendChild(m);

      const right = document.createElement("div");
      right.className = "ew-item-actions";

      const edit = document.createElement("button");
      edit.className = "ew-mini-btn";
      edit.type = "button";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => openModalForEditPerson(String(p?.id || "")));
      right.appendChild(edit);

      row.appendChild(left);
      row.appendChild(right);
      host.appendChild(row);
    }
  }

  function renderWheelPeopleChecklist() {
    const host = $("ewWheelPeople");
    if (!host) return;
    host.innerHTML = "";
    const people = Array.isArray(ui.state.people) ? ui.state.people : [];
    if (!people.length) {
      const empty = document.createElement("div");
      empty.className = "ew-muted";
      empty.textContent = "No people yet.";
      host.appendChild(empty);
      return;
    }
    const ids = new Set(selectedPeopleIds());
    for (const p of people) {
      const label = document.createElement("label");
      label.className = "ew-check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = ids.has(String(p?.id || ""));
      input.addEventListener("change", (e) => {
        const pid = String(p?.id || "");
        const cur = new Set(selectedPeopleIds());
        if (e.target.checked) cur.add(pid);
        else cur.delete(pid);
        ui.state.wheelSelectedPersonIds = Array.from(cur);
        scheduleSave();
        renderAll();
      });
      const span = document.createElement("span");
      span.textContent = String(p?.name || "Unnamed");
      label.appendChild(input);
      label.appendChild(span);
      host.appendChild(label);
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

    for (const f of foods) {
      const mk = String(ui.state.selectedMealSlot || "lunch") || "lunch";
      const inMeal = foodAllowedForMeal(f, mk);
      const row = document.createElement("div");
      row.className = "ew-item";
      row.style.opacity = inMeal ? "1" : "0.6";

      const left = document.createElement("div");
      left.style.minWidth = "0";
      const t = document.createElement("div");
      t.className = "ew-item-title";
      t.textContent = String(f.name || "");
      const m = document.createElement("div");
      m.className = "ew-item-meta";
      const tags = Array.isArray(f.tags) ? f.tags : [];
      const slots = Array.isArray(f.slots) ? f.slots : defaultFoodSlots();
      const slotBadges = slots.map((s) => `<span class="ew-badge">${mealLabel(s)}</span>`).join("");
      const tagText = tags.length ? `Tags: ${tags.join(", ")}` : "Tags: (none)";
      m.innerHTML = `${tagText}<div>${slotBadges}</div>`;
      left.appendChild(t);
      left.appendChild(m);

      const right = document.createElement("div");
      right.className = "ew-item-actions";

      const edit = document.createElement("button");
      edit.className = "ew-mini-btn";
      edit.type = "button";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => openFoodModalForEdit(String(f?.id || "")));
      right.appendChild(edit);

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

    // Important: after resizeCanvas we set ctx transform to scale by dpr,
    // so the drawing coordinate system should use CSS pixels (not device pixels).
    const w = Number(ui.canvasCssPx || 0) || Math.floor(cv.getBoundingClientRect?.().width || 320) || 320;
    const h = w;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 8;

    ctx.clearRect(0, 0, w, h);

    // background ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(15,23,42,0.04)";
    ctx.fill();

    const items = Array.isArray(candidates) ? candidates : [];
    if (items.length === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(15,23,42,0.03)";
      ctx.fill();
      ctx.fillStyle = "rgba(15,23,42,0.85)";
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
      ctx.fillStyle = isAlt ? "rgba(20,184,166,0.22)" : "rgba(99,102,241,0.18)";
      ctx.fill();

      // label
      const mid = (a0 + a1) / 2;
      const tx = cx + Math.cos(mid) * (r * 0.63);
      const ty = cy + Math.sin(mid) * (r * 0.63);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(mid);
      ctx.fillStyle = "rgba(15,23,42,0.92)";
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
    ctx.fillStyle = "rgba(255,255,255,0.92)";
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
