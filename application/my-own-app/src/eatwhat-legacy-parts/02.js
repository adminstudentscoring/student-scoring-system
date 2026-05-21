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
      mealSlot: String(ui.state.selectedMealSlot || "lunch") || "lunch",
      peopleIds: selectedPeopleIds(),
      foodId: chosen?.id || null,
      foodName: chosen?.name || null
    };
    scheduleSave();

    if (res) res.textContent = chosen?.name ? `You should eat: ${chosen.name}` : "Result unavailable";
    if (hint) {
      const meal = mealLabel(ui.state.selectedMealSlot);
      const ppl = selectedPeople();
      const pplLabel = ppl.length ? ppl.map((p) => p.name).join(", ") : "(none)";
      hint.textContent = `Meal: ${meal} · People: ${pplLabel}`;
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
      name.focus();
    }
  }

  function closeModal() {
    const b = $("ewModalBackdrop");
    if (!b) return;
    b.classList.remove("active");
    b.setAttribute("aria-hidden", "true");
  }

  function openModalForAddPerson() {
    ui.editPersonId = null;
    const title = $("ewModalTitle");
    if (title) title.textContent = "Add person";
    const del = $("ewModalDelete");
    if (del) del.style.display = "none";
    const name = $("ewPersonName");
    const ex = $("ewPersonExclude");
    if (name) name.value = "";
    if (ex) ex.value = "";
    openModal();
  }

  function openModalForEditPerson(personId) {
    const pid = String(personId || "").trim();
    const p = (ui.state.people || []).find((x) => String(x?.id || "") === pid);
    if (!p) return;
    ui.editPersonId = pid;
    const title = $("ewModalTitle");
    if (title) title.textContent = "Edit person";
    const del = $("ewModalDelete");
    if (del) del.style.display = "inline-flex";
    const name = $("ewPersonName");
    const ex = $("ewPersonExclude");
    if (name) name.value = String(p.name || "");
    if (ex) ex.value = (Array.isArray(p.exclude) ? p.exclude : []).join(", ");
    openModal();
  }

  function renderMealSelect() {
    const sel = $("ewMealSelect");
    if (!sel) return;
    sel.innerHTML = "";
    const cur = String(ui.state.selectedMealSlot || "lunch") || "lunch";
    for (const s of MEAL_SLOTS) {
      const opt = document.createElement("option");
      opt.value = s.key;
      opt.textContent = s.label;
      sel.appendChild(opt);
    }
    sel.value = cur;
  }

  function renderFoodSlotsChips() {
    const host = $("ewFoodSlots");
    if (!host) return;
    host.innerHTML = "";
    if (!ui.foodSlotDraft || !(ui.foodSlotDraft instanceof Set) || ui.foodSlotDraft.size === 0) {
      ui.foodSlotDraft = new Set(defaultFoodSlots());
    }
    for (const s of MEAL_SLOTS) {
      const chip = document.createElement("button");
      chip.type = "button";
      const active = ui.foodSlotDraft.has(s.key);
      chip.className = `ew-chip${active ? " active" : ""}`;
      chip.textContent = s.label;
      chip.addEventListener("click", () => {
        if (ui.foodSlotDraft.has(s.key)) ui.foodSlotDraft.delete(s.key);
        else ui.foodSlotDraft.add(s.key);
        renderFoodSlotsChips();
      });
      host.appendChild(chip);
    }
  }

  function openFoodModal() {
    const b = $("ewFoodModalBackdrop");
    if (!b) return;
    b.classList.add("active");
    b.setAttribute("aria-hidden", "false");
    const name = $("ewFoodEditName");
    if (name) name.focus();
  }

  function closeFoodModal() {
    const b = $("ewFoodModalBackdrop");
    if (!b) return;
    b.classList.remove("active");
    b.setAttribute("aria-hidden", "true");
    ui.editFoodId = null;
  }

  function renderFoodEditSlotsChips() {
    const host = $("ewFoodEditSlots");
    if (!host) return;
    host.innerHTML = "";
    if (!ui.foodSlotEditDraft || !(ui.foodSlotEditDraft instanceof Set) || ui.foodSlotEditDraft.size === 0) {
      ui.foodSlotEditDraft = new Set(defaultFoodSlots());
    }
    for (const s of MEAL_SLOTS) {
      const chip = document.createElement("button");
      chip.type = "button";
      const active = ui.foodSlotEditDraft.has(s.key);
      chip.className = `ew-chip${active ? " active" : ""}`;
      chip.textContent = s.label;
      chip.addEventListener("click", () => {
        if (ui.foodSlotEditDraft.has(s.key)) ui.foodSlotEditDraft.delete(s.key);
        else ui.foodSlotEditDraft.add(s.key);
        renderFoodEditSlotsChips();
      });
      host.appendChild(chip);
    }
  }

  function openFoodModalForEdit(foodId) {
    const fid = String(foodId || "").trim();
    const foods = Array.isArray(ui.state.foods) ? ui.state.foods : [];
    const f = foods.find((x) => String(x?.id || "") === fid);
    if (!f) return;
    ui.editFoodId = fid;
    const title = $("ewFoodModalTitle");
    if (title) title.textContent = "Edit food";
    const name = $("ewFoodEditName");
    const tags = $("ewFoodEditTags");
    if (name) name.value = String(f.name || "");
    if (tags) tags.value = (Array.isArray(f.tags) ? f.tags : []).join(", ");
    ui.foodSlotEditDraft = new Set(Array.isArray(f.slots) && f.slots.length ? f.slots : defaultFoodSlots());
    renderFoodEditSlotsChips();
    openFoodModal();
  }

  function setTab(tabKey, opts) {
    const k = String(tabKey || "wheel");
    const prev = String(ui.state.viewTab || "");
    ui.state.viewTab = k;
    if (opts && opts.persist && prev !== k) scheduleSave();
    const map = {
      people: "ewTabPeople",
      foods: "ewTabFoods",
      wheel: "ewTabWheel"
    };
    for (const [tk, id] of Object.entries(map)) {
      const el = $(id);
      if (el) el.style.display = (tk === k) ? "block" : "none";
    }
    document.querySelectorAll(".ew-tabbtn").forEach((b) => {
      const is = String(b.getAttribute("data-ew-tab") || "") === k;
      b.classList.toggle("active", is);
    });
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
    const people = Array.isArray(ui.state.people) ? ui.state.people : [];
    if (people.length === 0) {
      ui.state.people = [{ id: uid(), name: "Me", exclude: [] }];
    }
    // Ensure wheelSelectedPersonIds are valid; if none, default to all people.
    const allIds = new Set(ui.state.people.map((p) => String(p?.id || "")).filter(Boolean));
    const curIds = selectedPeopleIds().filter((id) => allIds.has(id));
    ui.state.wheelSelectedPersonIds = curIds.length ? curIds : Array.from(allIds);
    // Ensure selectedMealSlot valid
    const mk = String(ui.state.selectedMealSlot || "lunch") || "lunch";
    ui.state.selectedMealSlot = (MEAL_SLOTS.some((x) => x.key === mk)) ? mk : "lunch";

    // Tab visibility
    setTab(ui.state.viewTab || "wheel", { persist: false });

    renderPeopleList();
    renderWheelPeopleChecklist();
    renderMealSelect();
    renderFoodSlotsChips();
    renderFoodsList();
    renderWheel();
    renderResult();

    const hint = $("ewHint");
    if (hint) {
      const foods = Array.isArray(ui.state.foods) ? ui.state.foods : [];
      const cands = getCandidates();
      const meal = mealLabel(ui.state.selectedMealSlot);
      hint.textContent = `Meal: ${meal} · Candidates: ${cands.length} / ${foods.length}`;
    }
  }

  function bind() {
    // Tab buttons
    document.querySelectorAll(".ew-tabbtn").forEach((b) => {
      b.addEventListener("click", () => {
        setTab(String(b.getAttribute("data-ew-tab") || "wheel"), { persist: true });
      });
    });

    $("ewAddPersonBtn")?.addEventListener("click", openModalForAddPerson);
    $("ewMealSelect")?.addEventListener("change", (e) => {
      const v = String(e?.target?.value || "lunch") || "lunch";
      ui.state.selectedMealSlot = v;
      scheduleSave();
      renderAll();
    });

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
      if (ui.editPersonId) {
        const idx = ui.state.people.findIndex((p) => String(p?.id || "") === String(ui.editPersonId));
        if (idx >= 0) ui.state.people[idx] = { ...ui.state.people[idx], name, exclude };
      } else {
        ui.state.people.push({ id: uid(), name, exclude });
      }
      scheduleSave();
      closeModal();
      renderAll();
      toast("Saved.");
    });

    $("ewModalDelete")?.addEventListener("click", () => {
      const pid = String(ui.editPersonId || "").trim();
      if (!pid) return;
      const ok = confirm("Delete this person?");
      if (!ok) return;
      ui.state.people = (ui.state.people || []).filter((p) => String(p?.id || "") !== pid);
      ui.editPersonId = null;
      scheduleSave();
      closeModal();
      renderAll();
      toast("Deleted.");
    });

    // Food editor modal
    $("ewFoodModalCancel")?.addEventListener("click", closeFoodModal);
    $("ewFoodModalBackdrop")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "ewFoodModalBackdrop") closeFoodModal();
    });
    $("ewFoodModalSave")?.addEventListener("click", () => {
      const fid = String(ui.editFoodId || "").trim();
      if (!fid) return;
      const name = String($("ewFoodEditName")?.value || "").trim();
      if (!name) {
        toast("Food name is required.", "err");
        return;
      }
      const tags = normTokens($("ewFoodEditTags")?.value || "").map(lower);
      const slots = Array.from(ui.foodSlotEditDraft && ui.foodSlotEditDraft.size ? ui.foodSlotEditDraft : new Set(defaultFoodSlots()));
      if (!slots.length) {
        toast("Select at least one meal slot.", "err");
        return;
      }
      const foods = Array.isArray(ui.state.foods) ? ui.state.foods : [];
      const idx = foods.findIndex((x) => String(x?.id || "") === fid);
      if (idx >= 0) {
        foods[idx] = { ...foods[idx], name, tags, slots };
        ui.state.foods = foods;
        scheduleSave();
        closeFoodModal();
        renderAll();
        toast("Saved.");
      }
    });
    $("ewFoodModalDelete")?.addEventListener("click", () => {
      const fid = String(ui.editFoodId || "").trim();
      if (!fid) return;
      const ok = confirm("Delete this food?");
      if (!ok) return;
      ui.state.foods = (ui.state.foods || []).filter((x) => String(x?.id || "") !== fid);
      scheduleSave();
      closeFoodModal();
      renderAll();
      toast("Deleted.");
    });

    $("ewAddFoodBtn")?.addEventListener("click", () => {
      const name = String($("ewFoodName")?.value || "").trim();
      if (!name) {
        toast("Food name is required.", "err");
        return;
      }
      const tags = normTokens($("ewFoodTags")?.value || "").map(lower);
      const slots = Array.from(ui.foodSlotDraft && ui.foodSlotDraft.size ? ui.foodSlotDraft : new Set(defaultFoodSlots()));
      if (!slots.length) {
        toast("Select at least one meal slot.", "err");
        return;
      }
      ui.state.foods = ui.state.foods || [];
      ui.state.foods.push({ id: uid(), name, tags, slots });
      $("ewFoodName").value = "";
      $("ewFoodTags").value = "";
      ui.foodSlotDraft = new Set(defaultFoodSlots());
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
      const ok = confirm("Reset EatWhat data for this admin account?");
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
      ui.canvasCssPx = cssPx;
      ui.canvasDpr = dpr;
      renderWheel();
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
  }

  window.addEventListener("DOMContentLoaded", () => {
    (async () => {
      try {
        if (!window.authUtils || !window.authUtils.verifyAuth) {
          toast("auth.js not loaded.", "err");
          return;
        }

        // Magic link support: /eatwhat.html?token=...
        try {
          const u = new URL(window.location.href);
          const token = String(u.searchParams.get("token") || "").trim();
          if (token) {
            localStorage.setItem("authToken", token);
            // Clean token from URL to avoid accidental leaks (copy/paste, screenshots, referrers).
            u.searchParams.delete("token");
            window.history.replaceState({}, "", u.toString());
          }
        } catch {}
