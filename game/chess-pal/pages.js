// Page components for Chess Pal (iPad-first)

const ChessPalPages = (() => {
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getPreset() {
    try { return JSON.parse(localStorage.getItem('chessPalPreset') || 'null'); } catch {}
    return null;
  }

  function setPreset(preset) {
    try { localStorage.setItem('chessPalPreset', JSON.stringify(preset)); } catch {}
  }

  function getGeneralSettings() {
    const base = {
      jewelAlpha: 0.22,
      appBg: '#060912',
      jewelSet: 'set_a',
      pieceStyle: 'none',
      // Backgrounds
      practiceBg: 'images/Mode/Practice/Map/Map001-Grassland.jpg',
      summonBg: 'images/Summon/Su001-Castling.jpg',
      // Admin tuning (used for Practice combat math)
      streakMult: 1.05,
      atkScale: 0.10,
      rcvScale: 0.50
    };
    try {
      const raw = localStorage.getItem('chessPalGeneralSettings');
      if (!raw) return base;
      const v = JSON.parse(raw);
      const jewelAlpha = Number(v?.jewelAlpha);
      const appBg = String(v?.appBg || '').trim();
      const jewelSetRaw = String(v?.jewelSet || '').trim().toLowerCase();
      const jewelSet = (jewelSetRaw === 'set_a' || jewelSetRaw === 'none') ? jewelSetRaw : base.jewelSet;
      const pieceStyleRaw = String(v?.pieceStyle || '').trim().toLowerCase();
      const pieceStyle = (pieceStyleRaw === 'none' || pieceStyleRaw === 'nyxblade' || pieceStyleRaw === 'rivenhart' || pieceStyleRaw === 'seraphix')
        ? pieceStyleRaw
        : base.pieceStyle;
      const streakMultRaw = Number(v?.streakMult);
      const atkScaleRaw = Number(v?.atkScale);
      const rcvScaleRaw = Number(v?.rcvScale);
      const practiceBg = String(v?.practiceBg || '').trim() || base.practiceBg;
      const summonBg = String(v?.summonBg || '').trim() || base.summonBg;
      return {
        jewelAlpha: Number.isFinite(jewelAlpha) ? Math.max(0.08, Math.min(0.45, jewelAlpha)) : base.jewelAlpha,
        appBg: /^#([0-9a-fA-F]{6})$/.test(appBg) ? appBg : base.appBg,
        jewelSet,
        pieceStyle,
        practiceBg,
        summonBg,
        streakMult: Number.isFinite(streakMultRaw) ? Math.max(1.0, Math.min(1.3, streakMultRaw)) : base.streakMult,
        atkScale: Number.isFinite(atkScaleRaw) ? Math.max(0, Math.min(1.0, atkScaleRaw)) : base.atkScale,
        rcvScale: Number.isFinite(rcvScaleRaw) ? Math.max(0, Math.min(2.0, rcvScaleRaw)) : base.rcvScale
      };
    } catch {
      return base;
    }
  }

  function applyGeneralSettings(s) {
    try {
      const root = document.documentElement;
      if (!root) return;
      root.style.setProperty('--cp-jewel-alpha', String(s?.jewelAlpha ?? 0.22));
      root.style.setProperty('--cp-app-bg', String(s?.appBg ?? '#060912'));
      const nextSet = String(s?.jewelSet || 'set_a').trim().toLowerCase();
      root.setAttribute('data-cp-jewel-set', (nextSet === 'none' || nextSet === 'set_a') ? nextSet : 'set_a');
      const nextPiece = String(s?.pieceStyle || 'none').trim().toLowerCase();
      root.setAttribute('data-cp-piece-style', (nextPiece === 'nyxblade' || nextPiece === 'rivenhart' || nextPiece === 'seraphix' || nextPiece === 'none') ? nextPiece : 'none');
      try { window.dispatchEvent(new Event('cpGeneralSettingsChanged')); } catch {}
    } catch {}
  }

  function saveGeneralSettings(s) {
    try { localStorage.setItem('chessPalGeneralSettings', JSON.stringify(s)); } catch {}
  }

  // Apply once on load (so it affects all pages)
  applyGeneralSettings(getGeneralSettings());

  // Expose for other modules (router gear menu, future story modules)
  try {
    window.ChessPalSettings = {
      getGeneralSettings,
      applyGeneralSettings,
      saveGeneralSettings,
    };
  } catch {}

  // ----------------------------
  // Ownership (heroes) + Seen (monsters)
  // ----------------------------
  const OWNED_HERO_KEY = 'chessPalOwnedHeroes';
  const SEEN_MONSTER_KEY = 'chessPalSeenMonsters';
  const OWNED_MONSTER_KEY = 'chessPalOwnedMonsters';

  function getDefaultOwnedHeroIds() {
    // Nyxblade (002), Rivenhart (003), Seraphix (004)
    return ['002', '003', '004'];
  }

  function getOwnedHeroSet() {
    try {
      const raw = localStorage.getItem(OWNED_HERO_KEY);
      if (!raw) return new Set(getDefaultOwnedHeroIds());
      const v = JSON.parse(raw);
      const arr = Array.isArray(v) ? v : (Array.isArray(v?.ids) ? v.ids : []);
      const ids = arr.map(x => String(x || '').trim()).filter(Boolean);
      return new Set(ids.length ? ids : getDefaultOwnedHeroIds());
    } catch {
      return new Set(getDefaultOwnedHeroIds());
    }
  }

  function setOwnedHeroSet(set) {
    try {
      const ids = Array.from(set || []).map(x => String(x || '').trim()).filter(Boolean);
      localStorage.setItem(OWNED_HERO_KEY, JSON.stringify(ids));
    } catch {}
    try { window.dispatchEvent(new Event('cpOwnedHeroesChanged')); } catch {}
  }

  function addOwnedHeroId(id) {
    const key = String(id || '').trim();
    if (!key) return;
    const set = getOwnedHeroSet();
    set.add(key);
    setOwnedHeroSet(set);
  }

  function getOwnedMonsterSet() {
    try {
      const raw = localStorage.getItem(OWNED_MONSTER_KEY);
      if (!raw) return new Set();
      const v = JSON.parse(raw);
      const arr = Array.isArray(v) ? v : (Array.isArray(v?.ids) ? v.ids : []);
      return new Set(arr.map(x => String(x || '').trim()).filter(Boolean));
    } catch {
      return new Set();
    }
  }
  function setOwnedMonsterSet(set) {
    try {
      const ids = Array.from(set || []).map(x => String(x || '').trim()).filter(Boolean);
      localStorage.setItem(OWNED_MONSTER_KEY, JSON.stringify(ids));
    } catch {}
    try { window.dispatchEvent(new Event('cpOwnedMonstersChanged')); } catch {}
  }
  function addOwnedMonsterId(id) {
    const key = String(id || '').trim();
    if (!key) return;
    const set = getOwnedMonsterSet();
    set.add(key);
    setOwnedMonsterSet(set);
  }

  function getSeenMonsterSet() {
    try {
      const raw = localStorage.getItem(SEEN_MONSTER_KEY);
      if (!raw) return new Set();
      const v = JSON.parse(raw);
      const arr = Array.isArray(v) ? v : (Array.isArray(v?.ids) ? v.ids : []);
      return new Set(arr.map(x => String(x || '').trim()).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function addSeenMonsterId(id) {
    const key = String(id || '').trim();
    if (!key) return;
    const set = getSeenMonsterSet();
    set.add(key);
    try { localStorage.setItem(SEEN_MONSTER_KEY, JSON.stringify(Array.from(set))); } catch {}
    try { window.dispatchEvent(new Event('cpSeenMonstersChanged')); } catch {}
  }

  // For future battle integration
  try { window.cpMarkMonsterSeen = addSeenMonsterId; } catch {}
  try { window.cpAddOwnedMonster = addOwnedMonsterId; } catch {}

  // ----------------------------
  // Story Mode stages (Admin can edit; UI-only for now)
  // Stored as: { "1": [{ monsters: [{monsterId, level}, ...], hint, drops } x5], "2": ... }
  // Back-compat: older saves may store {monsterId, level, hint, drops} per stage.
  // ----------------------------
  const STORY_STAGES_KEY = 'chessPalStoryStages';

  function normalizeStageMonsters(stageLike) {
    const raw = stageLike && typeof stageLike === 'object' ? stageLike : {};
    const arr = Array.isArray(raw.monsters) ? raw.monsters : null;
    const list = (arr && arr.length)
      ? arr
      : [{ monsterId: raw.monsterId || '004', level: raw.level || 1 }];
    const out = list
      .map(x => ({
        monsterId: String(x?.monsterId || '004').trim().padStart(3, '0'),
        level: Math.max(1, Math.floor(Number(x?.level) || 1)),
      }))
      .filter(x => /^\d{3}$/.test(x.monsterId));
    return out.length ? out : [{ monsterId: '004', level: 1 }];
  }

  function defaultStoryStagesForChapter(chapterId) {
    const ch = Math.max(1, Math.min(10, Math.floor(Number(chapterId) || 1)));
    // Sensible defaults (admin can overwrite any time)
    if (ch === 1) {
      return [
        { monsters: [{ monsterId: '017', level: 1 }], drops: [] },
        { monsters: [{ monsterId: '018', level: 1 }], drops: [] },
        { monsters: [{ monsterId: '021', level: 2 }], drops: [] },
        { monsters: [{ monsterId: '027', level: 2 }], drops: [] },
        { monsters: [{ monsterId: '004', level: 1 }], drops: [] },
      ];
    }
    return [
      { monsters: [{ monsterId: '011', level: 1 }], drops: [] },
      { monsters: [{ monsterId: '014', level: 1 }], drops: [] },
      { monsters: [{ monsterId: '017', level: 1 }], drops: [] },
      { monsters: [{ monsterId: '020', level: 1 }], drops: [] },
      { monsters: [{ monsterId: '004', level: 1 }], drops: [] },
    ];
  }

  function loadStoryStages() {
    try {
      const raw = localStorage.getItem(STORY_STAGES_KEY);
      if (!raw) return {};
      const v = JSON.parse(raw);
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch {
      return {};
    }
  }

  function saveStoryStages(s) {
    try { localStorage.setItem(STORY_STAGES_KEY, JSON.stringify(s || {})); } catch {}
    try { window.dispatchEvent(new Event('cpStoryStagesChanged')); } catch {}
  }

  function getStoryStagesForChapter(chapterId) {
    const ch = String(Math.max(1, Math.min(10, Math.floor(Number(chapterId) || 1))));
    const all = loadStoryStages();
    const arr = Array.isArray(all?.[ch]) ? all[ch] : null;
    if (arr && arr.length) return arr;
    return defaultStoryStagesForChapter(ch);
  }

  function setStoryStagesForChapter(chapterId, stages) {
    const ch = String(Math.max(1, Math.min(10, Math.floor(Number(chapterId) || 1))));
    const next = loadStoryStages();
    next[ch] = Array.isArray(stages) ? stages : defaultStoryStagesForChapter(ch);
    saveStoryStages(next);
  }

  function showAdminEditStoryStagesModal(chapterId) {
    if (!isAdminMode()) return;
    const ch = Math.max(1, Math.min(10, Math.floor(Number(chapterId) || 1)));
    const current = getStoryStagesForChapter(ch);
    const allMonsters = getAllMonsters();

    const itemOptions = (() => {
      try {
        const defs = Object.values(STORAGE_ITEM_DEFS || {}).filter(Boolean);
        const opts = defs
          .slice()
          .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))
          .map(d => `<option value="${esc(String(d.id))}">${esc(String(d.name || d.id))}</option>`)
          .join('');
        return `<option value="">(No drop)</option>${opts}`;
      } catch {
        return `<option value="">(No drop)</option>`;
      }
    })();

    const monsterOptions = allMonsters
      .slice()
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map(m => `<option value="${esc(String(m.id))}">#${esc(m.id)} ${esc(m.name)} · ${esc(elementLabel(m.element))} · ${esc(renderStars(m.rarity))}</option>`)
      .join('');

    const old = document.getElementById('cpEditStagesOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cpEditStagesOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Edit stages">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-h1" style="font-size:18px;">Edit stages · Chapter ${esc(String(ch))}</div>
          <div class="cp-muted" style="margin-top:6px;">Pick Monster and Level for each stage. Stage 5 is always labeled Boss Stage.</div>

          <div class="cp-setting-grid" style="margin-top:12px; grid-template-columns: 1fr;">
            ${Array.from({ length: 5 }, (_, i) => {
              const s = current[i] || { monsterId: '004', level: 1, monsters: null, drops: [] };
              const label = (i === 4) ? `Stage ${i + 1} · Boss Stage` : `Stage ${i + 1}`;
              const mons0 = normalizeStageMonsters(s);
              const d0 = Array.isArray(s.drops) ? s.drops : [];
              return `
                <div class="cp-setting-item">
                  <div class="cp-setting-label">${esc(label)}</div>
                  <div class="cp-setting-help" style="margin-top:10px;">Monsters (tap Add/Remove to change count)</div>
                  <div class="cp-row" style="margin-top:8px; justify-content:flex-end; gap:8px;">
                    <button class="cp-tool-btn" type="button" data-stage-mon-add="${esc(String(i))}">Add</button>
                    <button class="cp-tool-btn" type="button" data-stage-mon-remove="${esc(String(i))}">Remove</button>
                  </div>
                  <div style="display:grid; grid-template-columns: 1fr; gap:10px; margin-top:10px;" data-stage-monsters-box="${esc(String(i))}">
                    ${mons0.map((mm, k) => {
                      const mid = String(mm.monsterId || '004').trim().padStart(3, '0');
                      const mon = allMonsters.find(x => String(x?.id || '').trim().padStart(3, '0') === mid) || null;
                      const src = String(mon?.img || '').trim();
                      return `
                        <div class="cp-row" style="margin-top:0; align-items:flex-start;" data-stage-monster-row="${esc(String(i))}-${esc(String(k))}">
                          <div style="width: 64px;">
                            ${src ? `<img src="${esc(src)}" alt="" style="width:64px;height:64px;object-fit:contain;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.18);" decoding="async" loading="lazy" data-stage-monster-prev="${esc(String(i))}-${esc(String(k))}">` : `<div style="width:64px;height:64px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.18);" data-stage-monster-prev="${esc(String(i))}-${esc(String(k))}"></div>`}
                          </div>
                          <div style="flex:1 1 auto; min-width: 240px;">
                            <div class="cp-row" style="margin-top:0;">
                              <div style="flex:1 1 260px; min-width: 240px;">
                                <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">Monster</div>
                                <select class="cp-select" data-stage-monster="${esc(String(i))}-${esc(String(k))}">
                                  ${monsterOptions}
                                </select>
                              </div>
                              <div style="width: 140px;">
                                <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">Lv</div>
                                <input class="cp-input" type="number" min="1" step="1" value="${esc(String(Math.max(1, Math.floor(Number(mm.level) || 1))))}" data-stage-level="${esc(String(i))}-${esc(String(k))}">
                              </div>
                            </div>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>

                      <div class="cp-setting-help" style="margin-top:10px;">Drops (one item per clear)</div>
                      <div style="display:grid; grid-template-columns: 1fr; gap:8px; margin-top:8px;">
                        ${Array.from({ length: 3 }, (_, j) => {
                          const dj = d0[j] || {};
                          const itemId = String(dj.itemId || '').trim().toLowerCase();
                          const chance = Math.max(0, Math.floor(Number(dj.chance) || 0));
                          const def = itemId ? getStorageItemDef(itemId) : null;
                          return `
                            <div class="cp-row" style="margin-top:0; gap:10px; align-items:center;">
                              <div style="width:46px;height:46px;flex:0 0 auto;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.18);display:flex;align-items:center;justify-content:center;" data-stage-drop-prev="${esc(String(i))}-${esc(String(j))}">
                                ${def?.img ? renderImgWithFallback(def.img, def.name || def.id, 'cp-levelup-img') : ``}
                              </div>
                              <div style="flex:1 1 auto; min-width: 210px;">
                                <select class="cp-select" data-stage-drop-item="${esc(String(i))}-${esc(String(j))}">
                                  ${itemOptions}
                                </select>
                              </div>
                              <div style="width: 120px;">
                                <input class="cp-input" type="number" min="0" max="100" step="1" value="${esc(String(chance))}" placeholder="Chance %" data-stage-drop-chance="${esc(String(i))}-${esc(String(j))}">
                              </div>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    </div>
                  </div>
                  ${(i === 4) ? `
                    <div class="cp-setting-help" style="margin-top:10px;">Boss opening hint</div>
                    <input class="cp-input" type="text" value="${esc(String(s.hint || 'Tip: Tap a hero to use a skill, then press Confirm.'))}" data-stage-hint="${esc(String(i))}">
                  ` : ``}
                </div>
              `;
            }).join('')}
          </div>

          <div class="cp-row" style="justify-content:flex-end;">
            <button class="cp-tool-btn" type="button" id="cpEditStagesCancel">Cancel</button>
            <button class="cp-primary" type="button" id="cpEditStagesSave">Save</button>
          </div>
          <div class="cp-muted" id="cpEditStagesMsg" style="margin-top:10px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // set default selected values
    for (let i = 0; i < 5; i += 1) {
      const s = current[i] || { monsterId: '004', level: 1, monsters: null, drops: [] };
      const mons0 = normalizeStageMonsters(s);
      for (let k = 0; k < mons0.length; k += 1) {
        const mm = mons0[k] || {};
        const sel = overlay.querySelector(`[data-stage-monster="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`);
        if (sel) sel.value = String(mm.monsterId || '004').trim().padStart(3, '0');
      }
      const drops = Array.isArray(s.drops) ? s.drops : [];
      for (let j = 0; j < 3; j += 1) {
        const d = drops[j] || {};
        const itemSel = overlay.querySelector(`[data-stage-drop-item="${CSS.escape(String(i))}-${CSS.escape(String(j))}"]`);
        if (itemSel) itemSel.value = String(d.itemId || '').trim().toLowerCase();
      }
    }

    // live previews
    for (let i = 0; i < 5; i += 1) {
      const s = current[i] || { monsterId: '004', level: 1, monsters: null, drops: [] };
      const mons0 = normalizeStageMonsters(s);
      for (let k = 0; k < mons0.length; k += 1) {
        const sel = overlay.querySelector(`[data-stage-monster="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`);
        sel?.addEventListener('change', () => {
          try {
            const id = String(sel.value || '').trim().padStart(3, '0');
            const mon = allMonsters.find(x => String(x?.id || '').trim().padStart(3, '0') === id) || null;
            const prev = overlay.querySelector(`[data-stage-monster-prev="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`);
            const src = String(mon?.img || '').trim();
            if (prev && prev.tagName === 'IMG') {
              if (src) prev.setAttribute('src', src);
            } else if (prev && src) {
              prev.innerHTML = `<img src="${esc(src)}" alt="" style="width:64px;height:64px;object-fit:contain;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.18);" decoding="async" loading="lazy">`;
            }
          } catch {}
        }, { passive: true });
      }

      for (let j = 0; j < 3; j += 1) {
        const itemSel = overlay.querySelector(`[data-stage-drop-item="${CSS.escape(String(i))}-${CSS.escape(String(j))}"]`);
        itemSel?.addEventListener('change', () => {
          try {
            const key = String(itemSel.value || '').trim().toLowerCase();
            const def = key ? getStorageItemDef(key) : null;
            const box = overlay.querySelector(`[data-stage-drop-prev="${CSS.escape(String(i))}-${CSS.escape(String(j))}"]`);
            if (!box) return;
            box.innerHTML = def?.img ? renderImgWithFallback(def.img, def.name || def.id, 'cp-levelup-img') : '';
          } catch {}
        }, { passive: true });
      }
    }

    // Add/remove monster rows
    const makeMonsterRowHtml = (i, k, monsterId, level) => {
      const mid = String(monsterId || '004').trim().padStart(3, '0');
      const mon = allMonsters.find(x => String(x?.id || '').trim().padStart(3, '0') === mid) || null;
      const src = String(mon?.img || '').trim();
      return `
        <div class="cp-row" style="margin-top:0; align-items:flex-start;" data-stage-monster-row="${esc(String(i))}-${esc(String(k))}">
          <div style="width: 64px;">
            ${src ? `<img src="${esc(src)}" alt="" style="width:64px;height:64px;object-fit:contain;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.18);" decoding="async" loading="lazy" data-stage-monster-prev="${esc(String(i))}-${esc(String(k))}">` : `<div style="width:64px;height:64px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.18);" data-stage-monster-prev="${esc(String(i))}-${esc(String(k))}"></div>`}
          </div>
          <div style="flex:1 1 auto; min-width: 240px;">
            <div class="cp-row" style="margin-top:0;">
              <div style="flex:1 1 260px; min-width: 240px;">
                <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">Monster</div>
                <select class="cp-select" data-stage-monster="${esc(String(i))}-${esc(String(k))}">
                  ${monsterOptions}
                </select>
              </div>
              <div style="width: 140px;">
                <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">Lv</div>
                <input class="cp-input" type="number" min="1" step="1" value="${esc(String(Math.max(1, Math.floor(Number(level) || 1))))}" data-stage-level="${esc(String(i))}-${esc(String(k))}">
              </div>
            </div>
          </div>
        </div>
      `;
    };
    for (let i = 0; i < 5; i += 1) {
      const addBtn = overlay.querySelector(`[data-stage-mon-add="${CSS.escape(String(i))}"]`);
      const rmBtn = overlay.querySelector(`[data-stage-mon-remove="${CSS.escape(String(i))}"]`);
      const box = overlay.querySelector(`[data-stage-monsters-box="${CSS.escape(String(i))}"]`);
      const hookRow = (k) => {
        const sel = overlay.querySelector(`[data-stage-monster="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`);
        sel?.addEventListener('change', () => {
          try {
            const id = String(sel.value || '').trim().padStart(3, '0');
            const mon = allMonsters.find(x => String(x?.id || '').trim().padStart(3, '0') === id) || null;
            const prev = overlay.querySelector(`[data-stage-monster-prev="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`);
            const src = String(mon?.img || '').trim();
            if (prev && prev.tagName === 'IMG') {
              if (src) prev.setAttribute('src', src);
            } else if (prev && src) {
              prev.innerHTML = `<img src="${esc(src)}" alt="" style="width:64px;height:64px;object-fit:contain;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.18);" decoding="async" loading="lazy">`;
            }
          } catch {}
        }, { passive: true });
      };
      addBtn?.addEventListener('click', () => {
        try {
          if (!box) return;
          const rows = Array.from(box.querySelectorAll('[data-stage-monster-row]'));
          if (rows.length >= 4) return;
          const k = rows.length;
          box.insertAdjacentHTML('beforeend', makeMonsterRowHtml(i, k, '004', 1));
          const sel = overlay.querySelector(`[data-stage-monster="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`);
          if (sel) sel.value = '004';
          hookRow(k);
        } catch {}
      }, { passive: true });
      rmBtn?.addEventListener('click', () => {
        try {
          if (!box) return;
          const rows = Array.from(box.querySelectorAll('[data-stage-monster-row]'));
          if (rows.length <= 1) return;
          rows[rows.length - 1]?.remove();
        } catch {}
      }, { passive: true });
      // ensure initial rows have preview hooks
      try {
        const rows = Array.from(box?.querySelectorAll('[data-stage-monster-row]') || []);
        rows.forEach((_, k) => hookRow(k));
      } catch {}
    }

    const close = () => {
      try { overlay.remove(); } catch {}
      try { window.removeEventListener('keydown', onKey); } catch {}
    };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
    overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
    overlay.querySelector('#cpEditStagesCancel')?.addEventListener('click', close, { passive: true });
    window.addEventListener('keydown', onKey);

    const msg = overlay.querySelector('#cpEditStagesMsg');
    const setMsg = (t) => { if (msg) msg.textContent = String(t || ''); };

    overlay.querySelector('#cpEditStagesSave')?.addEventListener('click', () => {
      try {
        setMsg('');
        const stages = [];
        for (let i = 0; i < 5; i += 1) {
          const box = overlay.querySelector(`[data-stage-monsters-box="${CSS.escape(String(i))}"]`);
          const rows = Array.from(box?.querySelectorAll('[data-stage-monster-row]') || []);
          const monsters = rows
            .map((_, k) => ({
              monsterId: String(overlay.querySelector(`[data-stage-monster="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`)?.value || '').trim().padStart(3, '0'),
              level: Math.max(1, Math.floor(Number(overlay.querySelector(`[data-stage-level="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`)?.value) || 1)),
            }))
            .filter(x => /^\d{3}$/.test(x.monsterId));
          if (!monsters.length) throw new Error('Stage must have at least 1 monster');
          const hint = (i === 4) ? String(overlay.querySelector(`[data-stage-hint="${CSS.escape(String(i))}"]`)?.value || '').trim() : '';
          const drops = [];
          for (let j = 0; j < 3; j += 1) {
            const itemId = String(overlay.querySelector(`[data-stage-drop-item="${CSS.escape(String(i))}-${CSS.escape(String(j))}"]`)?.value || '').trim().toLowerCase();
            const chance = Math.max(0, Math.floor(Number(overlay.querySelector(`[data-stage-drop-chance="${CSS.escape(String(i))}-${CSS.escape(String(j))}"]`)?.value) || 0));
            if (!itemId) continue;
            if (!getStorageItemDef(itemId)) continue;
            if (chance <= 0) continue;
            drops.push({ itemId, chance });
          }
          // Back-compat: keep monsterId/level in sync with the first monster
          stages.push({ monsters, monsterId: monsters[0].monsterId, level: monsters[0].level, hint, drops });
        }
        setStoryStagesForChapter(ch, stages);
        setMsg('Saved.');
        setTimeout(() => close(), 250);
      } catch (e) {
        setMsg(String(e?.message || e || 'Save failed'));
      }
    }, { passive: true });
  }

  // ----------------------------
  // Hero progression (per-user): total EXP -> level
  // PAD-style curve (approx): totalExp(level) = floor((level-1)^2.5 * curve)
  // ----------------------------
  const HERO_PROGRESS_KEY = 'chessPalHeroProgress';
  const HERO_MAX_LEVEL = 110; // supports up to 10★ max level
  const HERO_EXP_CURVE = 50; // baseline reference curve (≈5★); rarity scales this

  const HERO_RARITY_EXP_CURVE = {
    // Higher rarity => more EXP per level (slower leveling, like PAD)
    1: 34,
    2: 38,
    3: 42,
    4: 46,
    5: 50,
    6: 56,
    7: 62,
    8: 70,
    9: 80,
    10: 92,
  };
  function heroExpCurveForRarity(rarity) {
    const r = Math.max(1, Math.min(10, Math.floor(Number(rarity) || 1)));
    return HERO_RARITY_EXP_CURVE[r] || HERO_EXP_CURVE;
  }

  function totalExpForLevel(level, curve = HERO_EXP_CURVE, maxLevel = HERO_MAX_LEVEL) {
    const cap = Math.max(1, Math.floor(Number(maxLevel) || HERO_MAX_LEVEL));
    const lv = Math.max(1, Math.min(cap, Math.floor(Number(level) || 1)));
    const c = Math.max(1, Number(curve) || HERO_EXP_CURVE);
    if (lv <= 1) return 0;
    return Math.floor(Math.pow(lv - 1, 2.5) * c);
  }

  function levelFromTotalExp(totalExp, curve = HERO_EXP_CURVE, maxLevel = HERO_MAX_LEVEL) {
    const t = Math.max(0, Math.floor(Number(totalExp) || 0));
    let lo = 1;
    let hi = Math.max(1, Math.floor(Number(maxLevel) || HERO_MAX_LEVEL));
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (totalExpForLevel(mid, curve, hi) <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  function loadHeroProgress() {
    try {
      const raw = localStorage.getItem(HERO_PROGRESS_KEY);
      if (!raw) return {};
      const v = JSON.parse(raw);
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch {
      return {};
    }
  }

  function saveHeroProgress(p) {
    try { localStorage.setItem(HERO_PROGRESS_KEY, JSON.stringify(p || {})); } catch {}
    try { window.dispatchEvent(new Event('cpHeroProgressChanged')); } catch {}
  }

  function getHeroTotalExp(heroId) {
    const id = String(heroId || '').trim();
    const p = loadHeroProgress();
    const t = p && p[id] && p[id].totalExp != null ? Number(p[id].totalExp) : 0;
    return Math.max(0, Math.floor(Number(t) || 0));
  }

  function addHeroExp(heroId, deltaExp) {
    const id = String(heroId || '').trim();
    if (!id) return;
    const add = Math.max(0, Math.floor(Number(deltaExp) || 0));
    if (add <= 0) return;
    const p = loadHeroProgress();
    const cur = (p && p[id] && p[id].totalExp != null) ? Number(p[id].totalExp) : 0;
    const next = Math.max(0, Math.floor((Number(cur) || 0) + add));
    p[id] = { ...(p[id] || {}), totalExp: next };
    saveHeroProgress(p);
  }

  // ----------------------------
  // Monster progression (per-user): total EXP -> level
  // Uses the same EXP curve shape as heroes (rarity-scaled).
  // ----------------------------
  const MONSTER_PROGRESS_KEY = 'chessPalMonsterProgress';
  const MONSTER_EXP_CURVE = 40; // slightly faster than baseline hero curve
  const MONSTER_RARITY_EXP_CURVE = {
    1: 28,
    2: 32,
    3: 36,
    4: 40,
    5: 44,
    6: 50,
    7: 56,
    8: 64,
    9: 74,
    10: 86,
  };
  function monsterExpCurveForRarity(rarity) {
    const r = Math.max(1, Math.min(10, Math.floor(Number(rarity) || 1)));
    return MONSTER_RARITY_EXP_CURVE[r] || MONSTER_EXP_CURVE;
  }
  function loadMonsterProgress() {
    try {
      const raw = localStorage.getItem(MONSTER_PROGRESS_KEY);
      if (!raw) return {};
      const v = JSON.parse(raw);
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch {
      return {};
    }
  }
  function saveMonsterProgress(p) {
    try { localStorage.setItem(MONSTER_PROGRESS_KEY, JSON.stringify(p || {})); } catch {}
    try { window.dispatchEvent(new Event('cpMonsterProgressChanged')); } catch {}
  }
  function getMonsterTotalExp(monsterId) {
    const id = String(monsterId || '').trim();
    const p = loadMonsterProgress();
    const t = p && p[id] && p[id].totalExp != null ? Number(p[id].totalExp) : 0;
    return Math.max(0, Math.floor(Number(t) || 0));
  }
  function addMonsterExp(monsterId, deltaExp) {
    const id = String(monsterId || '').trim();
    if (!id) return;
    const add = Math.max(0, Math.floor(Number(deltaExp) || 0));
    if (add <= 0) return;
    const p = loadMonsterProgress();
    const cur = (p && p[id] && p[id].totalExp != null) ? Number(p[id].totalExp) : 0;
    const next = Math.max(0, Math.floor((Number(cur) || 0) + add));
    p[id] = { ...(p[id] || {}), totalExp: next };
    saveMonsterProgress(p);
  }

  function expBarInfo({ level, maxLevel, totalExp, curve }) {
    const cap = Math.max(1, Math.floor(Number(maxLevel) || 1));
    const lv = Math.max(1, Math.min(cap, Math.floor(Number(level) || 1)));
    const t = Math.max(0, Math.floor(Number(totalExp) || 0));
    const c = Math.max(1, Number(curve) || 1);
    const curAt = totalExpForLevel(lv, c, cap);
    if (lv >= cap) return { pct: 100, into: 0, span: 0, curAt, nextAt: curAt, isMax: true };
    const nextAt = totalExpForLevel(lv + 1, c, cap);
    const span = Math.max(1, Math.floor(nextAt - curAt));
    const into = Math.max(0, Math.floor(t - curAt));
    const pct = Math.max(0, Math.min(100, Math.round((into / span) * 100)));
    return { pct, into, span, curAt, nextAt, isMax: false };
  }

  function expProgressMeta({ totalExp, level, curve, maxLevel }) {
    const cap = Math.max(1, Math.floor(Number(maxLevel) || 1));
    const lv = Math.max(1, Math.min(cap, Math.floor(Number(level) || 1)));
    const t = Math.max(0, Math.floor(Number(totalExp) || 0));
    const at = totalExpForLevel(lv, curve, cap);
    const nextLv = Math.min(cap, lv + 1);
    const next = totalExpForLevel(nextLv, curve, cap);
    const denom = Math.max(1, (next - at));
    const cur = Math.max(0, Math.min(denom, t - at));
    const pct = (lv >= cap) ? 1 : Math.max(0, Math.min(1, cur / denom));
    return { cur, need: denom, pct, at, next };
  }

  function preloadImages(srcs, limit = 32) {
    try {
      const list = Array.isArray(srcs) ? srcs.filter(Boolean) : [];
      const take = list.slice(0, Math.max(0, Math.floor(Number(limit) || 0)));
      const run = () => {
        take.forEach((s) => {
          try {
            const img = new Image();
            img.decoding = 'async';
            img.src = String(s || '');
          } catch {}
        });
      };
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 900 });
      else setTimeout(run, 60);
    } catch {}
  }

  function showLevelUpModal({ kind, id, name }) {
    const k = String(kind || '').trim().toLowerCase();
    const unitId = String(id || '').trim();
    if (!unitId) return;
    const unitName = String(name || '').trim();

    const old = document.getElementById('cpLevelUpOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cpLevelUpOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Level up">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-h1" style="font-size:18px;">Level Up · ${esc(unitName || unitId)}</div>
          <div class="cp-muted" style="margin-top:6px;">Use EXP items from Storage.</div>
          <div class="cp-levelup-grid" id="cpLevelUpGrid" style="margin-top:12px;"></div>
          <div class="cp-muted" id="cpLevelUpMsg" style="margin-top:10px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      try { overlay.remove(); } catch {}
      try { window.removeEventListener('keydown', onKey); } catch {}
    };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
    overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
    window.addEventListener('keydown', onKey);

    const msg = overlay.querySelector('#cpLevelUpMsg');
    const setMsg = (t) => { if (msg) msg.textContent = String(t || ''); };

    const expDefs = [
      { itemId: 'exp_pawn', label: 'EXP Pawn', exp: 500, desc: 'Small EXP.' },
      { itemId: 'exp_knight', label: 'EXP Knight', exp: 1500, desc: 'Medium EXP.' },
      { itemId: 'exp_bishop', label: 'EXP Bishop', exp: 2500, desc: 'Large EXP.' },
    ];
    const grid = overlay.querySelector('#cpLevelUpGrid');
    const slots = loadStorage();
    const qtyOf = (itemId) => {
      const s = slots.find(x => x && String(x.itemId || '').toLowerCase() === String(itemId || '').toLowerCase());
      return Math.max(0, Math.floor(Number(s?.qty) || 0));
    };
    const hasAny = expDefs.some(d => qtyOf(d.itemId) > 0);

    if (!grid) return;
    if (!hasAny) {
      grid.innerHTML = `<div class="cp-muted">No EXP items in Storage.</div>`;
      return;
    }

    grid.innerHTML = expDefs.map(d => {
      const q = qtyOf(d.itemId);
      const def = getStorageItemDef(d.itemId);
      return `
        <button class="cp-levelup-item" type="button" data-exp-item="${esc(d.itemId)}" ${q > 0 ? '' : 'disabled'}>
          ${def?.img ? `<img class="cp-levelup-img" src="${esc(def.img)}" alt="${esc(def.name || d.label)}" decoding="async" loading="lazy">` : ''}
          <div class="cp-levelup-meta">
            <div class="cp-levelup-name">${esc(d.label)}</div>
            <div class="cp-levelup-sub">${esc(String(d.desc || ''))} +${esc(String(d.exp))} EXP.</div>
            <div class="cp-levelup-sub">Qty ×${esc(String(q))}.</div>
          </div>
        </button>
      `;
    }).join('');

    grid.querySelectorAll('[data-exp-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const itemId = String(btn.getAttribute('data-exp-item') || '').toLowerCase();
        const def = expDefs.find(x => x.itemId === itemId);
        if (!def) return;
        // consume one from storage
        const idx = slots.findIndex(x => x && String(x.itemId || '').toLowerCase() === itemId);
        if (idx < 0) return;
        const curQty = Math.max(0, Math.floor(Number(slots[idx]?.qty) || 0));
        if (curQty <= 0) return;
        slots[idx] = (curQty <= 1) ? null : { ...slots[idx], qty: curQty - 1 };
        saveStorage(slots);

        // add exp
        if (k === 'monster') addMonsterExp(unitId, def.exp);
        else addHeroExp(unitId, def.exp);

        setMsg(`Used ${def.label}.`);
        close();

        // reopen unit modal with refreshed stats/level
        try {
          if (k === 'monster') {
            const refreshed = mergeMonster(getMonsterById(unitId));
            if (refreshed) showMonsterModal(refreshed);
          } else {
            const refreshed = mergeHero(getHeroById(unitId));
            if (refreshed) showHeroModal(refreshed);
          }
        } catch {}
      }, { passive: true });
    });
  }

  function HomePage() {}
  HomePage.title = 'Home';
  HomePage.render = () => {
    // Home is a simple launcher hub (tile UI)
    const fallbackImg = 'images/Mode/Practice/Map/Map001-Grassland.jpg';
    return `
      <div class="cp-chapter-list" aria-label="Home">
        <div class="cp-chapter-tile" role="button" tabindex="0" data-cp-home="story" aria-label="Story Mode">
          <img class="cp-chapter-img" src="images/Mode/Story/Chapter001-Grassland_Awakening/Chapter001-Grassland_Awakening.jpg" alt="Story Mode" decoding="async" loading="lazy" onerror="this.onerror=null;this.src='${esc(fallbackImg)}';">
          <div class="cp-chapter-label">Story Mode</div>
        </div>

        <div class="cp-chapter-tile" role="button" tabindex="0" data-cp-home="shop" aria-label="Shop">
          <img class="cp-chapter-img" src="images/Summon/Su001-Castling.jpg" alt="Shop" decoding="async" loading="lazy" onerror="this.onerror=null;this.src='${esc(fallbackImg)}';">
          <div class="cp-chapter-label">Shop</div>
        </div>

        <div class="cp-chapter-tile" role="button" tabindex="0" data-cp-home="pal" aria-label="Pal">
          <img class="cp-chapter-img" src="images/Heros/003-Rivenhart/003-Rivenhart.png" alt="Pal" decoding="async" loading="lazy" onerror="this.onerror=null;this.src='${esc(fallbackImg)}';">
          <div class="cp-chapter-label">Pal</div>
        </div>
      </div>
    `;
  };
  HomePage.init = () => {
    const go = (key) => {
      if (key === 'shop') Router.goTo('/shop');
      else if (key === 'pal') Router.goTo('/pal');
      else Router.goTo('/mode/story');
    };

    document.querySelectorAll('[data-cp-home]').forEach((tile) => {
      tile.addEventListener('click', () => go(String(tile.getAttribute('data-cp-home') || '').trim()), { passive: true });
      tile.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          try { ev.preventDefault(); } catch {}
          try { tile.click(); } catch {}
        }
      });
    });
  };

  function ModePage() {}
  ModePage.title = 'Mode';
  ModePage.render = () => {
    const s = getGeneralSettings();
    return `
      <div class="cp-square-grid" aria-label="Mode">
        <button class="cp-square-tile" type="button" data-cp-mode="story" aria-label="Story Mode">
          ${renderImgWithFallback('images/Mode/Practice/Map/Map001-Grassland.jpg', 'Story Mode', 'cp-square-img')}
          <div class="cp-square-label">Story Mode</div>
        </button>
        <button class="cp-square-tile" type="button" data-cp-mode="challenge" aria-label="Challenge Mode">
          ${renderImgWithFallback('images/Monsters/M010-Dawn_Seraph/M010-Dawn_Seraph.png', 'Challenge Mode', 'cp-square-img')}
          <div class="cp-square-label">Challenge Mode</div>
        </button>
        <button class="cp-square-tile" type="button" data-cp-mode="practice" aria-label="Practice Mode">
          ${renderImgWithFallback(String(s.practiceBg || 'images/Mode/Practice/Map/Map001-Grassland.jpg'), 'Practice Mode', 'cp-square-img')}
          <div class="cp-square-label">Practice Mode</div>
        </button>
      </div>
    `;
  };
  ModePage.init = () => {
    document.querySelectorAll('[data-cp-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = String(btn.getAttribute('data-cp-mode') || '').trim();
        if (key === 'practice') Router.goTo('/practice');
        else if (key === 'story') Router.goTo('/mode/story');
        else if (key === 'challenge') Router.goTo('/mode/challenge');
      }, { passive: true });
    });
  };

  function ModeStoryPage() {}
  ModeStoryPage.title = 'Story Mode';
  ModeStoryPage.render = () => {
    const admin = isAdminMode();
    const fallbackImg = 'images/Mode/Practice/Map/Map001-Grassland.jpg';
    const chapters = [
      { id: 1, title: 'Chapter 1 · Grassland Awakening', img: 'images/Mode/Story/Chapter001-Grassland_Awakening/Chapter001-Grassland_Awakening.jpg' },
      { id: 2, title: 'Chapter 2 · Riverbound Oath', img: 'images/Mode/Story/Chapter002-Riverbound_Oath/Chapter002-Riverbound_Oath.jpg' },
      { id: 3, title: 'Chapter 3 · Ember Trial', img: 'images/Mode/Story/Chapter003-Ember_Trial/Chapter003-Ember_Trial.jpg' },
      { id: 4, title: 'Chapter 4 · Cathedral of Thorns', img: 'images/Mode/Story/Chapter004-Cathedral_of_Thorns/Chapter004-Cathedral_of_Thorns.jpg' },
      { id: 5, title: 'Chapter 5 · Halo and Dusk', img: 'images/Mode/Story/Chapter005-Halo_and_Dusk/Chapter005-Halo_and_Dusk.jpg' },
      { id: 6, title: 'Chapter 6 · The First Bloom', img: 'images/Mode/Story/Chapter006-The_First_Bloom/Chapter006-The_First_Bloom.jpg' },
      { id: 7, title: 'Chapter 7 · Lost Bestiary', img: 'images/Mode/Story/Chapter007-Lost_Bestiary/Chapter007-Lost_Bestiary.jpg' },
      { id: 8, title: 'Chapter 8 · Castling Keep Siege', img: 'images/Mode/Story/Chapter008-Castling_Keep_Siege/Chapter008-Castling_Keep_Siege.jpg' },
      { id: 9, title: 'Chapter 9 · The Board Rewrites', img: 'images/Mode/Story/Chapter009-The_Board_Rewrites/Chapter009-The_Board_Rewrites.jpg' },
      { id: 10, title: 'Chapter 10 · Dawn Seraph Verdict', img: fallbackImg },
    ];
    return `
      <div class="cp-chapter-list" aria-label="Story chapters">
        ${chapters.map(c => `
          <div class="cp-chapter-tile" role="button" tabindex="0" data-cp-chapter="${esc(String(c.id))}" aria-label="${esc(c.title)}">
            <img class="cp-chapter-img" src="${esc(String(c.img || fallbackImg))}" alt="${esc(c.title)}" decoding="async" loading="lazy" onerror="this.onerror=null;this.src='${esc(fallbackImg)}';">
            <div class="cp-chapter-label">${esc(c.title)}</div>
            ${admin ? `<button class="cp-tool-btn cp-chapter-edit" type="button" data-cp-edit-stages="${esc(String(c.id))}">Edit stages</button>` : ``}
          </div>
        `).join('')}
      </div>
    `;
  };
  ModeStoryPage.init = () => {
    document.querySelectorAll('[data-cp-chapter]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ch = Math.max(1, Math.min(10, Math.floor(Number(btn.getAttribute('data-cp-chapter')) || 1)));
        if (ch === 1) {
          // Directly enter gameplay (no stage select screen)
          let cleared = 0;
          try { cleared = Math.max(0, Math.floor(Number(window.ChessPalStory?.getClearedStage?.(1)) || 0)); } catch {}
          const next = (cleared >= 5) ? 1 : Math.min(5, cleared + 1);
          Router.goTo(`/mode/story/ch1/s${next}`);
        }
        else setMsg('Coming soon.');
      }, { passive: true });
    });
    document.querySelectorAll('[data-cp-chapter]').forEach(tile => {
      tile.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          try { ev.preventDefault(); } catch {}
          try { tile.click(); } catch {}
        }
      });
    });
    if (isAdminMode()) {
      document.querySelectorAll('[data-cp-edit-stages]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          try { ev.preventDefault(); ev.stopPropagation(); } catch {}
          const chap = Number(btn.getAttribute('data-cp-edit-stages'));
          if (!Number.isFinite(chap)) return;
          try { showAdminEditStoryStagesModal(chap); } catch {}
        }, { passive: false });
      });
    }
  };

  function StoryCh1Page() {}
  StoryCh1Page.title = 'Chapter 1';
  StoryCh1Page.render = () => {
    const fallbackImg = 'images/Mode/Story/Chapter001-Grassland_Awakening/Chapter001-Grassland_Awakening.jpg';
    const cleared = (() => {
      try { return Math.max(0, Math.floor(Number(window.ChessPalStory?.getClearedStage?.(1)) || 0)); } catch { return 0; }
    })();
    const stages = [
      { id: 1, title: 'Stage 1', img: fallbackImg, desc: 'Only starting elements.' },
      { id: 2, title: 'Stage 2', img: fallbackImg, desc: 'All elements except Heart.' },
      { id: 3, title: 'Stage 3', img: fallbackImg, desc: 'All elements except Heart.' },
      { id: 4, title: 'Stage 4', img: fallbackImg, desc: 'Heart appears.' },
      { id: 5, title: 'Boss Stage', img: fallbackImg, desc: 'Boss Stage.' },
    ];
    return `
      <div class="cp-chapter-list" aria-label="Chapter 1 stages">
        ${stages.map(s => `
          <div class="cp-chapter-tile ${s.id > (cleared + 1) ? 'is-locked' : ''}" role="button" tabindex="0" data-cp-ch1-stage="${esc(String(s.id))}" data-cp-locked="${s.id > (cleared + 1) ? '1' : '0'}" aria-label="${esc(s.title)}">
            <img class="cp-chapter-img" src="${esc(String(s.img || fallbackImg))}" alt="${esc(s.title)}" decoding="async" loading="lazy" onerror="this.onerror=null;this.src='${esc(fallbackImg)}';">
            <div class="cp-chapter-label">${esc(s.title)}</div>
            <div class="cp-chapter-sub">${esc(s.id > (cleared + 1) ? 'Locked' : (s.desc || ''))}</div>
          </div>
        `).join('')}
        <button class="cp-tool-btn" type="button" data-cp-go="/mode/story">Back</button>
      </div>
    `;
  };
  StoryCh1Page.init = () => {
    document.querySelectorAll('[data-cp-go]').forEach(btn => btn.addEventListener('click', () => Router.goTo(String(btn.getAttribute('data-cp-go') || '/mode/story')), { passive: true }));
    document.querySelectorAll('[data-cp-ch1-stage]').forEach(tile => {
      tile.addEventListener('click', () => {
        const locked = String(tile.getAttribute('data-cp-locked') || '0') === '1';
        if (locked) { try { setMsg('Clear the previous stage first.'); } catch {} return; }
        const s = Math.max(1, Math.min(5, Math.floor(Number(tile.getAttribute('data-cp-ch1-stage')) || 1)));
        Router.goTo(`/mode/story/ch1/s${s}`);
      }, { passive: true });
      tile.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { try { ev.preventDefault(); } catch {} try { tile.click(); } catch {} }
      });
    });
  };

  function getDefaultStoryElementsForStage(stageIdx1, teamUnits) {
    const stage = Math.max(1, Math.min(5, Math.floor(Number(stageIdx1) || 1)));
    const core = ['light', 'dark', 'fire', 'water', 'wood'];
    if (stage === 4 || stage === 5) return [...core, 'heart'];
    // Stage 2: all attack elements
    if (stage === 2) return core;
    // Stage 3: Heart starts dropping
    if (stage === 3) return [...core, 'heart'];
    // stage 1: only starting elements (from current team)
    const elems = (Array.isArray(teamUnits) ? teamUnits : [])
      .map(u => String(u?.element || '').toLowerCase())
      .filter(e => core.includes(e));
    const uniq = Array.from(new Set(elems));
    return uniq.length ? uniq : core;
  }

  function getMonsterFromDbQuick(monsterId) {
    const id = String(monsterId || '').trim().padStart(3, '0');
    const arr = window.CP_DATA?.MONSTER_DB;
    if (Array.isArray(arr)) {
      const m = arr.find(x => String(x?.id || '').trim().padStart(3, '0') === id);
      if (m) return m;
    }
    return null;
  }

  function getStoryStageConfig(chapterId, stageIdx1) {
    const ch = Math.max(1, Math.min(10, Math.floor(Number(chapterId) || 1)));
    const st = Math.max(1, Math.min(5, Math.floor(Number(stageIdx1) || 1)));
    const stages = getStoryStagesForChapter(ch);
    const cfg = stages[st - 1] || { monsterId: '004', level: 1, hint: '', drops: [] };
    const monsters = normalizeStageMonsters(cfg);
    const first = monsters[0] || { monsterId: '004', level: 1 };
    return {
      chapter: ch,
      stage: st,
      monsters,
      // Back-compat: first monster is still exposed as monsterId/monsterLevel
      monsterId: String(first.monsterId || '004').trim().padStart(3, '0'),
      monsterLevel: Math.max(1, Math.floor(Number(first.level) || 1)),
      hint: String(cfg.hint || '').trim(),
      drops: Array.isArray(cfg.drops) ? cfg.drops : [],
    };
  }

  function StoryBattlePage(chapterId, stageIdx1) {
    this._ch = Math.max(1, Math.min(10, Math.floor(Number(chapterId) || 1)));
    this._st = Math.max(1, Math.min(5, Math.floor(Number(stageIdx1) || 1)));
  }
  StoryBattlePage.prototype.title = 'Story Battle';
  StoryBattlePage.prototype.render = function () {
    const cfg = getStoryStageConfig(this._ch, this._st);
    window.__cpStoryStage = cfg;
    // Entering Story battle route should start fresh.
    // (Stage-to-stage progression happens in-place without reloading the board.)
    try { window.__cpPracticeBattleState = {}; } catch {}
    try { window.__cpPracticeElementScores = {}; } catch {}
    // elements pool by stage
    try {
      const team = getTeam();
      const units = ['a', 'b', 'c', 'd'].map(k => getTeamUnit(team?.[k])).filter(Boolean);
      window.__cpBoardElements = getDefaultStoryElementsForStage(cfg.stage, units);
      const fixed = window.ChessPalStory?.getFixedElementPool?.(cfg.chapter, cfg.stage);
      if (Array.isArray(fixed) && fixed.length) window.__cpBoardElements = fixed.slice();
    } catch {
      window.__cpBoardElements = getDefaultStoryElementsForStage(cfg.stage, []);
      try {
        const fixed = window.ChessPalStory?.getFixedElementPool?.(cfg.chapter, cfg.stage);
        if (Array.isArray(fixed) && fixed.length) window.__cpBoardElements = fixed.slice();
      } catch {}
    }
    return PracticePage.render();
  };
  StoryBattlePage.prototype.init = function () {
    PracticePage.init();
    // Stage intro banner (Story only)
    try {
      const st = window.__cpStoryStage;
      if (st && Number(st.chapter) && Number(st.stage)) {
        const old = document.getElementById('cpStageIntro');
        if (old) old.remove();
        const wrap = document.createElement('div');
        wrap.id = 'cpStageIntro';
        wrap.className = 'cp-stage-intro';
        const t = document.createElement('div');
        t.className = 'cp-stage-intro-text';
        t.textContent = `Chapter ${Math.max(1, Math.floor(Number(st.chapter) || 1))}: Stage ${Math.max(1, Math.floor(Number(st.stage) || 1))}`;
        wrap.appendChild(t);
        document.body.appendChild(wrap);
        setTimeout(() => { try { wrap.remove(); } catch {} }, 3100);
      }
    } catch {}
  };
  StoryBattlePage.prototype.destroy = function () {
    try { delete window.__cpStoryStage; } catch {}
    try { delete window.__cpBoardElements; } catch {}
    try { PracticePage.destroy(); } catch {}
  };

  function ModeChallengePage() {}
  ModeChallengePage.title = 'Challenge Mode';
  ModeChallengePage.render = () => `
    <div class="cp-square-grid" aria-label="Challenge Mode">
      <button class="cp-square-tile" type="button" data-cp-modeback aria-label="Back">
        ${renderImgWithFallback('images/Monsters/M010-Dawn_Seraph/M010-Dawn_Seraph.png', 'Back', 'cp-square-img')}
        <div class="cp-square-label">Back</div>
      </button>
    </div>
  `;
  ModeChallengePage.init = ModeStoryPage.init;

  function PracticePage() {}
  PracticePage.title = 'Practice';
  PracticePage.render = () => {
    const s = getGeneralSettings();
    const story = window.__cpStoryStage;
    const storyBg = (() => {
      const ch = Math.max(1, Math.min(10, Math.floor(Number(story?.chapter) || 0)));
      if (!ch) return '';
      const fallbackImg = 'images/Mode/Practice/Map/Map001-Grassland.jpg';
      const map = {
        1: 'images/Mode/Story/Chapter001-Grassland_Awakening/Chapter001-Grassland_Awakening.jpg',
        2: 'images/Mode/Story/Chapter002-Riverbound_Oath/Chapter002-Riverbound_Oath.jpg',
        3: 'images/Mode/Story/Chapter003-Ember_Trial/Chapter003-Ember_Trial.jpg',
        4: 'images/Mode/Story/Chapter004-Cathedral_of_Thorns/Chapter004-Cathedral_of_Thorns.jpg',
        5: 'images/Mode/Story/Chapter005-Halo_and_Dusk/Chapter005-Halo_and_Dusk.jpg',
        6: 'images/Mode/Story/Chapter006-The_First_Bloom/Chapter006-The_First_Bloom.jpg',
        7: 'images/Mode/Story/Chapter007-Lost_Bestiary/Chapter007-Lost_Bestiary.jpg',
        8: 'images/Mode/Story/Chapter008-Castling_Keep_Siege/Chapter008-Castling_Keep_Siege.jpg',
        9: 'images/Mode/Story/Chapter009-The_Board_Rewrites/Chapter009-The_Board_Rewrites.jpg',
        10: fallbackImg,
      };
      return String(map[ch] || fallbackImg);
    })();
    const bgSrc = String(storyBg || s.practiceBg || '').trim();
    const stageMonsters = (() => {
      try {
        const ms = Array.isArray(story?.monsters) ? story.monsters : null;
        if (ms && ms.length) return ms;
      } catch {}
      const monsterId = story?.monsterId ? String(story.monsterId).trim().padStart(3, '0') : '004';
      const monsterLevel = Number.isFinite(Number(story?.monsterLevel)) ? Math.max(1, Math.floor(Number(story.monsterLevel))) : 1;
      return [{ monsterId, level: monsterLevel }];
    })();
    const monstersMeta = stageMonsters.map((mm) => {
      const id = String(mm?.monsterId || '004').trim().padStart(3, '0');
      const m = getMonsterFromDbQuick(id);
      return {
        monsterId: id,
        level: Math.max(1, Math.floor(Number(mm?.level) || 1)),
        name: String(m?.name || 'Monster'),
        img: String(m?.img || 'images/Monsters/M004-Verdant_Maw/M004-Verdant_Maw.png'),
        element: String(m?.element || '').trim().toLowerCase(),
      };
    });
    const firstMon = monstersMeta[0] || { name: 'Verdant Maw', img: 'images/Monsters/M004-Verdant_Maw/M004-Verdant_Maw.png', element: '' };
    const monsterName = String(firstMon.name || 'Verdant Maw');
    const monsterImg = String(firstMon.img || 'images/Monsters/M004-Verdant_Maw/M004-Verdant_Maw.png');
    const monsterEl = String(firstMon.element || '').trim().toLowerCase();
    const storyStage = story?.stage ? Math.max(1, Math.min(5, Math.floor(Number(story.stage) || 1))) : 0;
    return `
      <div class="cp-practice" ${storyStage ? `data-story-stage="${esc(String(storyStage))}"` : ``}>
        <div class="cp-practice-bg" aria-hidden="true">
          <img id="cpPracticeBgImg" class="cp-practice-bgimg" src="${esc(bgSrc)}" alt="" aria-hidden="true">
        </div>
        <div class="cp-practice-left">
          <div class="cp-practice-boss" aria-label="Boss preview" ${monsterEl ? `data-element="${esc(monsterEl)}"` : ``}>
            <img class="cp-practice-bossimg" id="cpPracticeBossImg" src="${esc(monsterImg)}" alt="${esc(monsterName)}" decoding="async" loading="lazy">
            <div class="cp-boss-hp" aria-label="Monster HP">
              <div class="cp-boss-hpbar">
                <div class="cp-boss-hpfill" id="cpBossHpFill"></div>
                <div class="cp-boss-hpoverlay" id="cpBossHpOverlay"></div>
              </div>
            </div>
          </div>
          <div class="cp-bosslist" id="cpBossList" aria-label="Monster targets" ${monstersMeta.length > 1 ? `` : `style="display:none;"`}>
            ${monstersMeta.length > 1 ? monstersMeta.map((mm, idx) => `
              <button class="cp-bosschip ${idx === 0 ? 'is-active' : ''}" type="button" data-boss-idx="${esc(String(idx))}" aria-pressed="${idx === 0 ? 'true' : 'false'}">
                <img class="cp-bosschip-img" src="${esc(mm.img)}" alt="${esc(mm.name)}" decoding="async" loading="lazy">
                <div class="cp-bosschip-bar" aria-hidden="true">
                  <div class="cp-bosschip-fill" data-boss-chipfill="${esc(String(idx))}"></div>
                </div>
              </button>
            `).join('') : ``}
          </div>
          <div class="cp-practice-team" aria-label="Team preview">
            <div class="cp-team-hpwrap" aria-label="Player HP">
              <div class="cp-team-hpbar">
                <div class="cp-team-hpfill" id="cpTeamHpFill"></div>
                <div class="cp-team-hpoverlay" id="cpTeamHpOverlay"></div>
                <div class="cp-team-hpoverlay cp-team-hpoverlay--heal" id="cpTeamRcvOverlay"></div>
              </div>
            </div>
            <div class="cp-practice-teamrow" id="cpPracticeTeamRow"></div>
          </div>
        </div>

        <div class="cp-practice-right">
          <div class="cp-practice-rightcol">
            <div id="chessPalGame" class="puzzle-monster-root"></div>
            <div class="cp-practice-hint cp-practice-hint--board" id="cpPracticeHint" aria-live="polite" style="display:none;"></div>
          </div>
        </div>
      </div>
    `;
  };
  PracticePage.init = () => {
    // Ensure any old timers are cleared first
    try { window.ChessPal?.destroy?.(); } catch {}
    try { window.initChessPal?.(); } catch {}

    const row = document.getElementById('cpPracticeTeamRow');
    const bgImg = document.getElementById('cpPracticeBgImg');
    const hpFill = document.getElementById('cpTeamHpFill');
    const hpOverlay = document.getElementById('cpTeamHpOverlay');
    const rcvOverlay = document.getElementById('cpTeamRcvOverlay');
    const bossHpFill = document.getElementById('cpBossHpFill');
    const bossHpOverlay = document.getElementById('cpBossHpOverlay');
    const hintEl = document.getElementById('cpPracticeHint');
    const bossList = document.getElementById('cpBossList');

    const setActiveMonsterUI = (idx, opts = {}) => {
      const b = getBattle();
      const monsters = Array.isArray(b.monsters) ? b.monsters : [];
      const i = Math.max(0, Math.min(monsters.length - 1, Math.floor(Number(idx) || 0)));
      const t = monsters[i];
      if (!t) return;
      b.targetMonsterIdx = i;
      // If user explicitly clicked a target, we keep it until they change it.
      if (typeof opts?.manual === 'boolean') b.userPickedTarget = !!opts.manual;
      // Keep back-compat single-monster fields in sync with current target
      b.monsterLevel = t.level;
      b.monsterMaxHp = t.maxHp;
      b.monsterAtk = t.atk;
      b.monsterHp = t.hp;

      // Update main boss image + element
      try {
        const bossImgEl = document.getElementById('cpPracticeBossImg');
        const bossBoxEl = document.querySelector('.cp-practice-boss');
        if (bossBoxEl) {
          if (t.element) bossBoxEl.setAttribute('data-element', String(t.element));
          else bossBoxEl.removeAttribute('data-element');
          bossBoxEl.classList.remove('cp-dead');
          bossBoxEl.style.display = '';
        }
        if (bossImgEl) {
          const nextSrc = String(t.img || '').trim();
          const curSrc = String(bossImgEl.getAttribute('src') || '');
          const reveal = () => { try { bossImgEl.classList.remove('is-img-hidden'); } catch {} };
          if (nextSrc && nextSrc !== curSrc) {
            try {
              bossImgEl.style.transition = 'none';
              bossImgEl.classList.add('is-img-hidden');
              void bossImgEl.offsetWidth;
              bossImgEl.style.transition = '';
            } catch {}
            try { bossImgEl.setAttribute('src', nextSrc); } catch {}
            try { bossImgEl.setAttribute('alt', String(t.name || 'Monster')); } catch {}
            try {
              if (bossImgEl.complete && bossImgEl.naturalWidth > 0) {
                requestAnimationFrame(() => requestAnimationFrame(reveal));
              } else {
                bossImgEl.addEventListener('load', reveal, { once: true });
                bossImgEl.addEventListener('error', reveal, { once: true });
              }
            } catch { reveal(); }
          } else {
            try { bossImgEl.setAttribute('alt', String(t.name || 'Monster')); } catch {}
            reveal();
          }
        }
      } catch {}
      updateHpUI();
    };

    bossList?.addEventListener('click', (ev) => {
      const btn = ev?.target?.closest?.('[data-boss-idx]');
      if (!btn) return;
      try { ev.preventDefault(); } catch {}
      const idx = Math.floor(Number(btn.getAttribute('data-boss-idx')) || 0);
      setActiveMonsterUI(idx, { manual: true });
    }, { passive: false });
    const bossImgEl = document.getElementById('cpPracticeBossImg');

    const fadeInImage = (imgEl) => {
      if (!imgEl) return;
      try { imgEl.classList.add('is-fadein'); } catch {}
      const done = () => { try { imgEl.classList.remove('is-fadein'); } catch {} };
      try {
        if (imgEl.complete && imgEl.naturalWidth > 0) {
          requestAnimationFrame(() => requestAnimationFrame(done));
          return;
        }
      } catch {}
      try { imgEl.addEventListener('load', done, { once: true }); } catch {}
      try { imgEl.addEventListener('error', done, { once: true }); } catch {}
    };
    fadeInImage(bossImgEl);

    const syncPracticeBg = () => {
      if (!bgImg) return;
      const st = window.__cpStoryStage;
      const storySrc = (() => {
        const ch = Math.max(1, Math.min(10, Math.floor(Number(st?.chapter) || 0)));
        if (!ch) return '';
        const fallbackImg = 'images/Mode/Practice/Map/Map001-Grassland.jpg';
        const map = {
          1: 'images/Mode/Story/Chapter001-Grassland_Awakening/Chapter001-Grassland_Awakening.jpg',
          2: 'images/Mode/Story/Chapter002-Riverbound_Oath/Chapter002-Riverbound_Oath.jpg',
          3: 'images/Mode/Story/Chapter003-Ember_Trial/Chapter003-Ember_Trial.jpg',
          4: 'images/Mode/Story/Chapter004-Cathedral_of_Thorns/Chapter004-Cathedral_of_Thorns.jpg',
          5: 'images/Mode/Story/Chapter005-Halo_and_Dusk/Chapter005-Halo_and_Dusk.jpg',
          6: 'images/Mode/Story/Chapter006-The_First_Bloom/Chapter006-The_First_Bloom.jpg',
          7: 'images/Mode/Story/Chapter007-Lost_Bestiary/Chapter007-Lost_Bestiary.jpg',
          8: 'images/Mode/Story/Chapter008-Castling_Keep_Siege/Chapter008-Castling_Keep_Siege.jpg',
          9: 'images/Mode/Story/Chapter009-The_Board_Rewrites/Chapter009-The_Board_Rewrites.jpg',
          10: fallbackImg,
        };
        return String(map[ch] || fallbackImg);
      })();
      const s = getGeneralSettings();
      const src = String(storySrc || s?.practiceBg || '').trim();
      if (!src) return;
      if (bgImg.getAttribute('src') !== src) bgImg.setAttribute('src', src);
      bgImg.onerror = function() {
        // If user saved without extension, try common ones.
        const cur = String(this.getAttribute('src') || '');
        if (!cur) return;
        if (cur.endsWith('.png')) return;
        if (cur.endsWith('.jpg') || cur.endsWith('.jpeg') || cur.endsWith('.webp')) return;
        // Try .png then .jpg then .webp
        try {
          if (!this.dataset.try1) { this.dataset.try1 = '1'; this.src = `${cur}.png`; return; }
          if (!this.dataset.try2) { this.dataset.try2 = '1'; this.src = `${cur}.jpg`; return; }
          if (!this.dataset.try3) { this.dataset.try3 = '1'; this.src = `${cur}.webp`; return; }
        } catch {}
      };
    };
    syncPracticeBg();
    try {
      if (window.__cpPracticeBgListener) window.removeEventListener('cpGeneralSettingsChanged', window.__cpPracticeBgListener);
    } catch {}
    window.__cpPracticeBgListener = () => { try { syncPracticeBg(); } catch {} };
    try { window.addEventListener('cpGeneralSettingsChanged', window.__cpPracticeBgListener); } catch {}

    const getBattle = () => {
      try {
        if (!window.__cpPracticeBattleState) window.__cpPracticeBattleState = {};
        return window.__cpPracticeBattleState;
      } catch {
        return {};
      }
    };
    const updateHpUI = () => {
      const b = getBattle();
      const pMax = Math.max(0, Number(b.playerMaxHp) || 0);
      const pHp = Math.max(0, Math.min(pMax, Number(b.playerHp) || 0));
      const bossBox = document.querySelector('.cp-practice-boss');
      const monsters = Array.isArray(b.monsters) ? b.monsters : null;
      const alive = (monsters || []).filter(x => (Number(x?.hp) || 0) > 0);
      let targetIdx = Number.isFinite(Number(b.targetMonsterIdx)) ? Math.floor(Number(b.targetMonsterIdx)) : 0;
      if (monsters && monsters.length) {
        if (!(targetIdx >= 0 && targetIdx < monsters.length && (Number(monsters[targetIdx]?.hp) || 0) > 0)) {
          const firstAliveIdx = monsters.findIndex(x => (Number(x?.hp) || 0) > 0);
          targetIdx = firstAliveIdx >= 0 ? firstAliveIdx : 0;
          b.targetMonsterIdx = targetIdx;
        }
      } else {
        targetIdx = 0;
      }
      const t = monsters && monsters.length ? (monsters[targetIdx] || null) : null;
      const mMax = t ? Math.max(0, Number(t.maxHp) || 0) : Math.max(0, Number(b.monsterMaxHp) || 0);
      const mHp = t ? Math.max(0, Math.min(mMax, Number(t.hp) || 0)) : Math.max(0, Math.min(mMax, Number(b.monsterHp) || 0));

      if (hpFill) hpFill.style.width = pMax > 0 ? `${Math.max(0, Math.min(1, pHp / pMax)) * 100}%` : '0%';
      if (hpOverlay) hpOverlay.textContent = pMax > 0 ? `${pHp}/${pMax}` : '0/0';
      if (bossHpFill) bossHpFill.style.width = mMax > 0 ? `${Math.max(0, Math.min(1, mHp / mMax)) * 100}%` : '0%';
      if (bossHpOverlay) bossHpOverlay.textContent = mMax > 0 ? `${mHp}/${mMax}` : '';

      // If monster is dead, allow it to stay hidden
      try {
        const dead = monsters && monsters.length ? alive.length === 0 : (Number(b.monsterHp) || 0) <= 0;
        if (bossBox && dead) {
          bossBox.classList.add('cp-dead');
        }
      } catch {}

      // Update chips (if any)
      try {
        if (monsters && monsters.length) {
          const list = document.getElementById('cpBossList');
          monsters.forEach((mm, idx) => {
            const mx = Math.max(0, Number(mm?.maxHp) || 0);
            const mh = Math.max(0, Math.min(mx, Number(mm?.hp) || 0));
            const fill = document.querySelector(`[data-boss-chipfill="${CSS.escape(String(idx))}"]`);
            if (fill) fill.style.width = mx > 0 ? `${Math.max(0, Math.min(1, mh / mx)) * 100}%` : '0%';
            const chip = list?.querySelector(`[data-boss-idx="${CSS.escape(String(idx))}"]`);
            if (chip) {
              chip.classList.toggle('is-active', idx === targetIdx);
              chip.setAttribute('aria-pressed', idx === targetIdx ? 'true' : 'false');
              chip.classList.toggle('is-dead', mh <= 0);
            }
          });
        }
      } catch {}
    };

    const getMonsterBase = (monsterId) => {
      const sid = String(monsterId || '').trim().padStart(3, '0') || '004';
      try { return getAllMonsters().find(m => String(m.id) === sid) || null; } catch { return null; }
    };
    const getMonsterEffective = (monsterId, level) => {
      const lv = Math.max(1, Math.floor(Number(level) || 1));
      const base = getMonsterBase(monsterId);
      const baseHp = Math.max(0, Math.floor(Number(base?.hp) || 0));
      const baseAtk = Math.max(0, Math.floor(Number(base?.atk) || 0));
      const baseRcv = Math.max(0, Math.floor(Number(base?.rcv) || 0));
      // Practice scaling: +10% stats per level above 1
      const mult = 1 + Math.max(0, lv - 1) * 0.10;
      return {
        level: lv,
        hpMax: Math.max(1, Math.floor(baseHp * mult)),
        atk: Math.max(0, Math.floor(baseAtk * mult)),
        rcv: Math.max(0, Math.floor(baseRcv * mult)),
      };
    };
    const getBossBase = () => {
      const sid = window.__cpStoryStage?.monsterId ? String(window.__cpStoryStage.monsterId).trim().padStart(3, '0') : '004';
      return getMonsterBase(sid);
    };
    const getBossEffective = (level) => {
      const sid = window.__cpStoryStage?.monsterId ? String(window.__cpStoryStage.monsterId).trim().padStart(3, '0') : '004';
      return getMonsterEffective(sid, level);
    };

    const showStoryHintIfAny = () => {
      try {
        const st = window.__cpStoryStage;
        if (hintEl && st && Number(st.stage) === 5) {
          const t = String(st.hint || '').trim() || 'Tip: Tap a hero to use a skill, then press Confirm.';
          hintEl.textContent = t;
          hintEl.style.display = '';
        } else if (hintEl) {
          hintEl.textContent = '';
          hintEl.style.display = 'none';
        }
      } catch {}
    };
    showStoryHintIfAny();

    const awardStoryDropIfAny = (cfg) => {
      try {
        // One item per clear.
        // Treat each chance as a percent. If total < 100, the remaining percent is "no drop".
        const drops = Array.isArray(cfg?.drops) ? cfg.drops : [];
        const pool = drops
          .map(d => ({
            itemId: String(d?.itemId || '').trim().toLowerCase(),
            chance: Math.max(0, Math.min(100, Math.floor(Number(d?.chance) || 0)))
          }))
          .filter(d => d.itemId && d.chance > 0 && !!getStorageItemDef(d.itemId));
        if (!pool.length) return null;

        const total = pool.reduce((s, d) => s + d.chance, 0);
        if (!(total > 0)) return null;

        const rollMax = total < 100 ? 100 : total;
        let r = Math.random() * rollMax;
        if (total < 100 && r >= total) return null; // no drop region

        let pick = null;
        for (const d of pool) {
          r -= d.chance;
          if (r <= 0) { pick = d; break; }
        }
        const itemId = pick?.itemId;
        if (!itemId) return null;

        let slots = loadStorage();
        const before = JSON.stringify(slots);
        slots = addItemToStorage(slots, itemId, 1);
        if (JSON.stringify(slots) === before) return null; // storage full or no change

        saveStorage(slots);
        const def = getStorageItemDef(itemId);
        if (hintEl) {
          hintEl.textContent = def ? `Drop: ${String(def.name || itemId)}` : `Drop: ${itemId}`;
          hintEl.style.display = '';
          setTimeout(() => { try { showStoryHintIfAny(); } catch {} }, 2200);
        }
        return itemId;
      } catch {
        return null;
      }
    };

    const showStageIntro = (chapter, stage) => {
      try {
        const old = document.getElementById('cpStageIntro');
        if (old) old.remove();
        const wrap = document.createElement('div');
        wrap.id = 'cpStageIntro';
        wrap.className = 'cp-stage-intro';
        const t = document.createElement('div');
        t.className = 'cp-stage-intro-text';
        const ch = Math.max(1, Math.floor(Number(chapter) || 1));
        const st = Math.max(1, Math.floor(Number(stage) || 1));
        t.textContent = `Chapter ${ch}: Stage ${st}`;
        wrap.appendChild(t);
        document.body.appendChild(wrap);
        setTimeout(() => { try { wrap.remove(); } catch {} }, 3100);
      } catch {}
    };
    try {
      const st = window.__cpStoryStage;
      if (st && Number(st.chapter) && Number(st.stage)) showStageIntro(st.chapter, st.stage);
    } catch {}

    const getCenter = (el) => {
      try {
        const r = el?.getBoundingClientRect?.();
        if (!r) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      } catch {
        return null;
      }
    };
    const playBeamBetween = async ({ fromEl, toEl, variant = 'player' } = {}) => {
      const a = getCenter(fromEl);
      const b = getCenter(toEl);
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.max(0, Math.hypot(dx, dy));
      if (len <= 1) return;
      const angle = Math.atan2(dy, dx);

      const outer = document.createElement('div');
      outer.className = `cp-beamline ${variant === 'monster' ? 'is-monster' : 'is-player'}`;
      outer.style.left = `${a.x}px`;
      outer.style.top = `${a.y}px`;
      outer.style.width = `${len}px`;
      outer.style.setProperty('--cp-angle', `${angle}rad`);

      const inner = document.createElement('div');
      inner.className = 'cp-beamline-inner';
      outer.appendChild(inner);

      document.body.appendChild(outer);
      await new Promise((resolve) => {
        inner.addEventListener('animationend', () => resolve(), { once: true });
      });
      try { outer.remove(); } catch {}
    };
    const shake = async (el) => {
      if (!el) return;
      el.classList.remove('cp-shake');
      // Force reflow
      void el.offsetWidth;
      el.classList.add('cp-shake');
      await new Promise((r) => setTimeout(r, 420));
      el.classList.remove('cp-shake');
    };

    const resolveCombatFinal = async (elementScores) => {
      if (!row) return;
      let b = null;
      try {
        if (window.__cpPracticeCombatInFlight) return;
        window.__cpPracticeCombatInFlight = true;
      } catch {}

      try {
        try { await loadHeroOverrides(); } catch {}
        try { await loadMonsterOverrides(); } catch {}
        const teamState = loadTeams();
        const team = (teamState && Array.isArray(teamState.teams) && Array.isArray(teamState.teams[teamState.active]))
          ? teamState.teams[teamState.active]
          : [null, null, null, null];

        const gs = getGeneralSettings();
        const atkMul = Number.isFinite(Number(gs?.atkScale)) ? Number(gs.atkScale) : 0.10;
        const rcvMul = Number.isFinite(Number(gs?.rcvScale)) ? Number(gs.rcvScale) : 0.50;

        b = getBattle();
        const bossBox = document.querySelector('.cp-practice-boss');
        const bossImg = document.querySelector('.cp-practice-bossimg');
        const hpBar = document.querySelector('.cp-team-hpbar');
        const showDamageFloat = (value, element, mult) => {
          if (!bossBox) return;
          const el = document.createElement('div');
          const m = Number(mult) || 1;
          const cls = m > 1 ? 'is-adv' : (m < 1 ? 'is-dis' : '');
          el.className = `cp-dmg-float cp-elem-${String(element || '').toLowerCase()} ${cls}`.trim();
          el.textContent = String(Math.max(0, Math.floor(Number(value) || 0)));
          // small random offset so multi-hits don't overlap perfectly
          try {
            const ox = (Math.random() * 16 - 8);
            const oy = (Math.random() * 16 - 8);
            el.style.left = `calc(50% + ${ox}px)`;
            el.style.top = `calc(52% + ${oy}px)`;
          } catch {}
          bossBox.appendChild(el);
          setTimeout(() => { try { el.remove(); } catch {} }, 1200);
        };
        const elemMult = (att, def) => {
          const a = String(att || '').toLowerCase();
          const d = String(def || '').toLowerCase();
          if (!a || !d) return 1;
          // Light/Dark vs Fire/Wood/Water special rule
          if ((a === 'light' || a === 'dark') && (d === 'fire' || d === 'wood' || d === 'water')) return 1.1;
          const adv = { fire: 'wood', wood: 'water', water: 'fire', light: 'dark', dark: 'light' };
          if (adv[a] === d) return 1.25;
          if (adv[d] === a) return 0.75;
          return 1;
        };
        const monsters = Array.isArray(b.monsters) ? b.monsters : null;
        const aliveMons = (monsters || []).filter(x => (Number(x?.hp) || 0) > 0);
        // Auto-target: if user didn't pick, attack the monster with highest expected total damage.
        try {
          if (monsters && monsters.length > 1 && !b.userPickedTarget) {
            const predictFor = (defEl) => {
              const dEl = String(defEl || '').toLowerCase();
              let sum = 0;
              for (let i = 0; i < 4; i += 1) {
                const id = team[i];
                const unit = id ? getTeamUnit(id) : null;
                if (!unit) continue;
                const el = String(unit.element || '');
                const elScore = Number(elementScores?.[el] || 0);
                const atk = Math.max(0, Number(unit.atk) || 0);
                const mult = elemMult(el, dEl);
                const teamAtkBonus = Number.isFinite(Number(b.teamAtkBonus)) ? Number(b.teamAtkBonus) : 0;
                const elemBonus = (b.teamElemBonus && typeof b.teamElemBonus === 'object') ? Number(b.teamElemBonus[el] || 0) : 0;
                const atkMultThisTurn = Number.isFinite(Number(b.teamAtkMultThisTurn)) ? Number(b.teamAtkMultThisTurn) : 1;
                const dmg = Math.max(0, Math.round(atk * elScore * atkMul * mult * (1 + teamAtkBonus) * (1 + elemBonus) * atkMultThisTurn));
                sum += dmg;
              }
              return sum;
            };
            let bestIdx = 0;
            let bestVal = -1;
            monsters.forEach((m, idx) => {
              if ((Number(m?.hp) || 0) <= 0) return;
              const val = predictFor(m?.element);
              if (val > bestVal) { bestVal = val; bestIdx = idx; }
            });
            setActiveMonsterUI(bestIdx, { manual: false });
          }
        } catch {}

        const bossEl = (() => {
          try {
            if (monsters && monsters.length) {
              const idx = Number.isFinite(Number(b.targetMonsterIdx)) ? Math.floor(Number(b.targetMonsterIdx)) : 0;
              const t = monsters[Math.max(0, Math.min(monsters.length - 1, idx))];
              const el = String(t?.element || '').toLowerCase();
              if (el) return el;
            }
          } catch {}
          return String(getBossBase()?.element || '').toLowerCase();
        })();

        // Reset per-round buffs
        try {
          b.playerDamageReduction = 0;
          b.teamAtkBonus = 0;
          b.teamElemBonus = {};
          b.playerRegenMaxHpPct = 0;
          b.teamAtkMultThisTurn = Number.isFinite(Number(b.teamAtkMultThisTurn)) ? Number(b.teamAtkMultThisTurn) : 1;
        } catch {}

        // Monster leader passive only works when leader slot
        try {
          const leader = team[0] ? getTeamUnit(team[0]) : null;
          if (leader && leader.kind === 'monster') {
            const p = leader.passiveSkill?.params || {};
            const dr = Number(p.damageReduction);
            if (Number.isFinite(dr)) b.playerDamageReduction = Math.max(0, Math.min(0.7, dr));
            const regen = Number(p.healMaxHpPctPerTurn);
            if (Number.isFinite(regen)) b.playerRegenMaxHpPct = Math.max(0, Math.min(0.2, regen));
            const atkB = Number(p.atkBonus);
            if (Number.isFinite(atkB)) b.teamAtkBonus = Math.max(-0.9, Math.min(2.0, atkB));
            const elemBonus = {};
            ['fire','water','wood','light','dark'].forEach((el) => {
              const k = `${el}DmgBonus`;
              const v = Number(p[k]);
              if (Number.isFinite(v)) elemBonus[el] = Math.max(-0.9, Math.min(2.0, v));
            });
            b.teamElemBonus = elemBonus;
          }
        } catch {}

        // Skill damage reduction (this round only)
        try {
          const sdr = Number(b.skillDamageReductionThisTurn);
          if (Number.isFinite(sdr) && sdr > 0) {
            b.playerDamageReduction = Math.max(Number(b.playerDamageReduction) || 0, Math.max(0, Math.min(0.9, sdr)));
          }
        } catch {}

        // Regen from leader passive (if any)
        try {
          const pct = Number(b.playerRegenMaxHpPct) || 0;
          if (pct > 0) {
            const pMax = Math.max(0, Number(b.playerMaxHp) || 0);
            const amt = Math.max(0, Math.floor(pMax * pct));
            if (amt > 0) {
              b.playerHp = Math.max(0, Math.min(pMax, (Number(b.playerHp) || 0) + amt));
              updateHpUI();
            }
          }
        } catch {}

        // Heal first (Heart score)
        const heartScore = Number(elementScores?.heart || 0);
        const totalRcv = Math.max(0, Number(window.__cpPlayerRcvTotal) || 0);
        const heal = Math.max(0, Math.round(totalRcv * heartScore * rcvMul));
        if (heal > 0) {
          const pMax = Math.max(0, Number(b.playerMaxHp) || 0);
          b.playerHp = Math.max(0, Math.min(pMax, (Number(b.playerHp) || 0) + heal));
          updateHpUI();
        }

        // Player attacks monster: beams from each unit mini center → monster center (sequential)
        for (let i = 0; i < 4; i += 1) {
          const id = team[i];
          const unit = id ? getTeamUnit(id) : null;
          if (!unit) continue;
          const el = String(unit.element || '');
          const elScore = Number(elementScores?.[el] || 0);
          const atk = Math.max(0, Number(unit.atk) || 0);
          const mult = elemMult(el, bossEl);
          const teamAtkBonus = Number.isFinite(Number(b.teamAtkBonus)) ? Number(b.teamAtkBonus) : 0;
          const elemBonus = (b.teamElemBonus && typeof b.teamElemBonus === 'object') ? Number(b.teamElemBonus[el] || 0) : 0;
          const atkMultThisTurn = Number.isFinite(Number(b.teamAtkMultThisTurn)) ? Number(b.teamAtkMultThisTurn) : 1;
          const dmg = Math.max(0, Math.round(atk * elScore * atkMul * mult * (1 + teamAtkBonus) * (1 + elemBonus) * atkMultThisTurn));
          if (dmg <= 0) continue;

          const slotEl = row?.children?.[i] || null;
          await playBeamBetween({ fromEl: slotEl, toEl: bossImg, variant: 'player' });
          await shake(bossImg);
          showDamageFloat(dmg, el, mult);
          const mMax = Math.max(0, Number(b.monsterMaxHp) || 0);
          b.monsterHp = Math.max(0, Math.min(mMax, (Number(b.monsterHp) || 0) - dmg));
          // Sync into multi-monster pool (if any)
          try {
            if (monsters && monsters.length) {
              const ti = Number.isFinite(Number(b.targetMonsterIdx)) ? Math.floor(Number(b.targetMonsterIdx)) : 0;
              const t = monsters[Math.max(0, Math.min(monsters.length - 1, ti))];
              if (t) t.hp = Number(b.monsterHp) || 0;
            }
          } catch {}
          updateHpUI();
          if ((Number(b.monsterHp) || 0) <= 0) {
            // If there are other alive monsters, switch target and continue the remaining attacks.
            try {
              if (monsters && monsters.length) {
                const alive = monsters.filter(x => (Number(x?.hp) || 0) > 0);
                if (alive.length > 0) {
                  const nextIdx = monsters.findIndex(x => (Number(x?.hp) || 0) > 0);
                  if (nextIdx >= 0) setActiveMonsterUI(nextIdx, { manual: false });
                  continue;
                }
              }
            } catch {}
            break;
          }
        }

        const allDead = (() => {
          try {
            if (monsters && monsters.length) return monsters.every(x => (Number(x?.hp) || 0) <= 0);
          } catch {}
          return (Number(b.monsterHp) || 0) <= 0;
        })();

        // Monster(s) death: if all dead, handle stage clear/respawn
        if (allDead) {
          try {
            // Story Mode: clear stage and auto-advance (no respawn/level-up loop)
            const st = window.__cpStoryStage;
            if (st && Number(st.chapter) && Number(st.stage)) {
              // Drops (award for the cleared stage config)
              try { awardStoryDropIfAny(getStoryStageConfig(Number(st.chapter) || 1, Number(st.stage) || 1)); } catch {}
              try { window.ChessPalStory?.markStageCleared?.(st.chapter, st.stage); } catch {}
              // Chapter first-clear reward: Gold Coin x1 (only once per chapter)
              try {
                const ch = Number(st.chapter) || 0;
                const isChapterClear = Math.floor(Number(st.stage) || 0) === 5;
                if (ch && window.ChessPalStory?.hasClaimedChapterReward && window.ChessPalStory?.markChapterRewardClaimed) {
                  const claimed = !!window.ChessPalStory.hasClaimedChapterReward(ch);
                  if (isChapterClear && !claimed) {
                    let slots = loadStorage();
                    slots = addItemToStorage(slots, 'gold_coin', 1);
                    saveStorage(slots);
                    window.ChessPalStory.markChapterRewardClaimed(ch);
                    if (hintEl) {
                      hintEl.textContent = 'Reward: Gold Coin × 1';
                      hintEl.style.display = '';
                      setTimeout(() => { try { showStoryHintIfAny(); } catch {} }, 2200);
                    }
                  }
                }
              } catch {}
              const nextStage = Math.max(1, Math.floor(Number(st.stage) || 1)) + 1;

              const advanceInPlace = () => {
                try {
                  if (nextStage > 5) {
                    Router.goTo('/mode/story');
                    return;
                  }

                  // Update story config (no route change, keep board contents)
                  const cfg = getStoryStageConfig(Number(st.chapter) || 1, nextStage);
                  window.__cpStoryStage = cfg;
                  const stageAttr = String(Math.max(1, Math.min(5, Math.floor(Number(cfg.stage) || 1))));
                  const practiceRoot = document.querySelector('.cp-practice');
                  if (practiceRoot) practiceRoot.setAttribute('data-story-stage', stageAttr);

                  // Update element pool: Stage 1-3 use scheme B (pool changes affect future spawns only)
                  // Ensure pool always updates (so Stage 2/3 spawn rules actually change).
                  let units = [];
                  try {
                    const team = getTeam();
                    units = ['a', 'b', 'c', 'd'].map(k => getTeamUnit(team?.[k])).filter(Boolean);
                  } catch {}
                  let pool = getDefaultStoryElementsForStage(cfg.stage, units);
                  try {
                    const fixed = window.ChessPalStory?.getFixedElementPool?.(cfg.chapter, cfg.stage);
                    if (Array.isArray(fixed) && fixed.length) pool = fixed.slice();
                  } catch {}
                  try { window.__cpBoardElements = pool; } catch {}

                  // Reset multi-monster pool + target chips for the new stage
                  try {
                    b.userPickedTarget = false;
                    b.targetMonsterIdx = 0;
                    const stageMons = Array.isArray(cfg?.monsters) && cfg.monsters.length ? cfg.monsters : [{ monsterId: cfg?.monsterId || '004', level: cfg?.monsterLevel || 1 }];
                    const nextMonsters = stageMons.map((mm, idx) => {
                      const mid = String(mm?.monsterId || '004').trim().padStart(3, '0');
                      const lv = Math.max(1, Math.floor(Number(mm?.level) || 1));
                      const eff = getMonsterEffective(mid, lv);
                      const m = getMonsterFromDbQuick(mid);
                      return {
                        idx,
                        monsterId: mid,
                        level: lv,
                        name: String(m?.name || 'Monster'),
                        element: String(m?.element || '').trim().toLowerCase(),
                        img: String(m?.img || ''),
                        maxHp: eff.hpMax,
                        atk: eff.atk,
                        hp: eff.hpMax,
                      };
                    });
                    b.monsters = nextMonsters;
                    // Re-render target chips
                    if (bossList) {
                      if (nextMonsters.length > 1) {
                        bossList.style.display = '';
                        bossList.innerHTML = nextMonsters.map((mm, idx) => `
                          <button class="cp-bosschip ${idx === 0 ? 'is-active' : ''}" type="button" data-boss-idx="${esc(String(idx))}" aria-pressed="${idx === 0 ? 'true' : 'false'}">
                            <img class="cp-bosschip-img" src="${esc(String(mm.img || ''))}" alt="${esc(String(mm.name || 'Monster'))}" decoding="async" loading="lazy">
                            <div class="cp-bosschip-bar" aria-hidden="true">
                              <div class="cp-bosschip-fill" data-boss-chipfill="${esc(String(idx))}"></div>
                            </div>
                          </button>
                        `).join('');
                      } else {
                        bossList.style.display = 'none';
                        bossList.innerHTML = '';
                      }
                    }
                    // Activate first monster (updates big image + bar)
                    setActiveMonsterUI(0);
                  } catch {}

                  // clear per-turn scores
                  try { window.__cpPracticeElementScores = {}; } catch {}
                  try { applyElementScoresToUI(); } catch {}

                  // Ensure visible + update hint + intro
                  try {
                    const bossBox2 = document.querySelector('.cp-practice-boss');
                    if (bossBox2) {
                      bossBox2.style.display = '';
                      bossBox2.classList.remove('cp-dead');
                    }
                  } catch {}
                  try { showStoryHintIfAny(); } catch {}
                  try { showStageIntro(cfg.chapter, cfg.stage); } catch {}
                  try { updateHpUI(); } catch {}
                } catch {}
              };

              setTimeout(advanceInPlace, 350);
              return;
            }

            // Respawn (Lv + 1)
            const nextLv = Math.max(1, Math.floor(Number(b.monsterLevel) || 1) + 1);
            b.monsterLevel = nextLv;
            const eff = getBossEffective(nextLv);
            b.monsterMaxHp = eff.hpMax;
            b.monsterHp = eff.hpMax;
            b.monsterAtk = eff.atk;

            if (bossBox) {
              bossBox.style.display = '';
              bossBox.classList.remove('cp-dead');
              bossBox.classList.add('cp-respawn');
              // clear respawn class after animation so future transitions work
              setTimeout(() => { try { bossBox.classList.remove('cp-respawn'); } catch {} }, 700);
            }
            updateHpUI();
          } catch {}
          return;
        }

        // Monster counter-attacks player: beam from monster center → HP bar, shake HP bar
        let monsterAtk = 0;
        try {
          if (Number.isFinite(Number(b.monsterAtk))) {
            monsterAtk = Math.max(0, Math.floor(Number(b.monsterAtk) || 0));
          } else {
            const lv = Math.max(1, Math.floor(Number(b.monsterLevel) || 1));
            monsterAtk = getBossEffective(lv).atk;
            b.monsterAtk = monsterAtk;
          }
        } catch {}
        if (monsterAtk > 0) {
          await playBeamBetween({ fromEl: bossImg, toEl: hpBar, variant: 'monster' });
          await shake(hpBar);
          const pMax = Math.max(0, Number(b.playerMaxHp) || 0);
          const dr = Number.isFinite(Number(b.playerDamageReduction)) ? Number(b.playerDamageReduction) : 0;
          const effDmg = Math.max(0, Math.floor(monsterAtk * (1 - Math.max(0, Math.min(0.9, dr)))));
          b.playerHp = Math.max(0, Math.min(pMax, (Number(b.playerHp) || 0) - effDmg));
          updateHpUI();
        }
      } finally {
        // Clear per-turn scores after combat so next turn starts clean
        try { window.__cpPracticeElementScores = {}; } catch {}
        try { applyElementScoresToUI(); } catch {}
        // Cooldowns tick down once per full round
        try {
          const cds = (b && b.skillCds && typeof b.skillCds === 'object') ? b.skillCds : null;
          if (cds) {
            Object.keys(cds).forEach((k) => {
              const n = Math.max(0, Math.floor(Number(cds[k]) || 0));
              cds[k] = Math.max(0, n - 1);
            });
            b.skillCds = cds;
          }
        } catch {}
        // Reset one-turn ATK mult buff after resolution
        try { b.teamAtkMultThisTurn = 1; } catch {}
        try { b.skillDamageReductionThisTurn = 0; } catch {}
        try { window.__cpPracticeCombatInFlight = false; } catch {}
      }
    };

    const applyElementScoresToUI = () => {
      if (!row) return;
      const scores = (window.__cpPracticeElementScores && typeof window.__cpPracticeElementScores === 'object')
        ? window.__cpPracticeElementScores
        : {};
      const gs = getGeneralSettings();
      const atkScale = Number(gs?.atkScale);
      const atkMul = Number.isFinite(atkScale) ? atkScale : 0.10;
      const rcvScale = Number(gs?.rcvScale);
      const rcvMul = Number.isFinite(rcvScale) ? rcvScale : 0.50;
      row.querySelectorAll('.cp-practice-slot[data-team-slotkey]').forEach((slot) => {
        const sk = String(slot.getAttribute('data-team-slotkey') || '');
        const unit = sk ? getTeamUnit(sk) : null;
        const atkEl = slot.querySelector('[data-practice-atk]');
        if (!atkEl || !unit) return;
        const el = String(unit.element || '');
        const elScore = Number(scores[el] || 0);
        const atk = Math.max(0, Number(unit.atk) || 0);
        const power = Math.round(atk * elScore * atkMul);
        atkEl.textContent = power > 0 ? String(power) : '';
      });

      // RCV shown on HP bar (use Heart score)
      try {
        const totalRcv = Math.max(0, Number(window.__cpPlayerRcvTotal) || 0);
        const heartScore = Number(scores.heart || 0);
        const heal = Math.round(totalRcv * heartScore * rcvMul);
        if (rcvOverlay) rcvOverlay.textContent = heal > 0 ? `+${heal}` : '';
      } catch {
        if (rcvOverlay) rcvOverlay.textContent = '';
      }
    };

    const renderTeam = async () => {
      if (!row) return;
      row.innerHTML = '';
      try { await loadHeroOverrides(); } catch {}
      try { await loadMonsterOverrides(); } catch {}
      const state = loadTeams();
      const team = (state && Array.isArray(state.teams) && Array.isArray(state.teams[state.active])) ? state.teams[state.active] : [null, null, null, null];

      // Player totals (HP + RCV)
      let totalHp = 0;
      let totalRcv = 0;
      for (let i = 0; i < 4; i += 1) {
        const id = team[i];
        const unit = id ? getTeamUnit(id) : null;
        if (unit) {
          totalHp += Math.max(0, Math.floor(Number(unit.hp) || 0));
          totalRcv += Math.max(0, Math.floor(Number(unit.rcv) || 0));
        }
      }
      if (hpFill) hpFill.style.width = '100%';
      if (hpOverlay) hpOverlay.textContent = totalHp > 0 ? `${totalHp}/${totalHp}` : '0/0';
      // Keep RCV total for future use (not displayed yet)
      try { window.__cpPlayerRcvTotal = totalRcv; } catch {}
      if (rcvOverlay) rcvOverlay.textContent = '';

      // Boss HP (Verdant Maw = monster id 004)
      try {
        const boss = getAllMonsters().find(m => String(m.id) === '004') || null;
        const bossHp = Math.max(0, Math.floor(Number(boss?.hp) || 0));
        if (bossHpFill) bossHpFill.style.width = bossHp > 0 ? '100%' : '0%';
        if (bossHpOverlay) bossHpOverlay.textContent = bossHp > 0 ? `${bossHp}/${bossHp}` : '';
      } catch {}

      for (let i = 0; i < 4; i += 1) {
        const id = team[i];
        const unit = id ? getTeamUnit(id) : null;
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.className = `cp-practice-slot ${i === 0 ? 'is-leader' : ''}`;
        if (unit) slot.setAttribute('data-team-slotkey', String(unit.key || id));
        if (unit && unit.element) slot.setAttribute('data-element', String(unit.element || '').toLowerCase());
        slot.setAttribute('data-team-slot', String(i));
        slot.innerHTML = unit
          ? `
            <img src="${esc(unit.mini || unit.img)}" alt="${esc(unit.name)}">
            <div class="cp-practice-atk cp-elem-${esc(String(unit.element || ''))}" data-practice-atk></div>
            ${jewelIconSrcForElement(unit.element) ? `<img class="cp-hero-jewel" src="${esc(jewelIconSrcForElement(unit.element))}" alt="" aria-hidden="true">` : ``}
          `
          : `<div class="cp-practice-slot-empty"></div>`;
        row.appendChild(slot);
      }

      // Skill popover (Confirm / Cancel) under clicked slot
      const closeSkillPanels = () => {
        try { row.querySelectorAll('.cp-practice-skillpanel').forEach(x => x.remove()); } catch {}
        try { row.querySelectorAll('.cp-practice-slot').forEach(x => x.classList.remove('is-skill-open')); } catch {}
      };
      const castSkill = (unit) => {
        const u = unit || null;
        if (!u || !u.activeSkill) return;
        const b = getBattle();
        if (!b.skillCds || typeof b.skillCds !== 'object') b.skillCds = {};
        const key = String(u.key || '');
        const cd = Math.max(0, Math.floor(Number(u.activeSkill?.cd) || 0));
        if (key) {
          const left = Math.max(0, Math.floor(Number(b.skillCds[key]) || 0));
          if (left > 0) return;
          b.skillCds[key] = cd;
        }

        const p = u.activeSkill?.params || {};
        // Heal immediately
        const healFlat = Number(p.healFlat);
        if (Number.isFinite(healFlat) && healFlat > 0) {
          const pMax = Math.max(0, Number(b.playerMaxHp) || 0);
          b.playerHp = Math.max(0, Math.min(pMax, (Number(b.playerHp) || 0) + Math.floor(healFlat)));
          updateHpUI();
        }
        // Damage reduction applies to the upcoming monster attack this round
        const dr = Number(p.damageReduction);
        if (Number.isFinite(dr) && dr > 0) {
          b.skillDamageReductionThisTurn = Math.max(0, Math.min(0.9, Math.max(Number(b.skillDamageReductionThisTurn) || 0, dr)));
        }
        // ATK multiplier applies to this round's damage
        const atkMultThisTurn = Number(p.atkMultThisTurn);
        if (Number.isFinite(atkMultThisTurn) && atkMultThisTurn > 0) {
          b.teamAtkMultThisTurn = Math.max(0.01, Math.min(5, Math.max(Number(b.teamAtkMultThisTurn) || 1, atkMultThisTurn)));
        }
        // Extra time during player turn
        const extraTimeSec = Number(p.extraTimeSec);
        if (Number.isFinite(extraTimeSec) && extraTimeSec !== 0) {
          try {
            window.dispatchEvent(new CustomEvent('cpPracticeCastSkill', { detail: { type: 'addTime', seconds: extraTimeSec, name: u.activeSkill?.name || '' } }));
          } catch {}
        }
        // Convert tiles
        const conv = p.convert;
        const convertList = [];
        if (Array.isArray(conv)) {
          conv.forEach(c => {
            const cnt = Math.max(0, Math.floor(Number(c?.count) || 0));
            const to = String(c?.to || '').toLowerCase();
            if (cnt > 0 && to) convertList.push({ count: cnt, to });
          });
        } else if (conv && typeof conv === 'object') {
          const cnt = Math.max(0, Math.floor(Number(conv?.count) || 0));
          const to = String(conv?.to || '').toLowerCase();
          if (cnt > 0 && to) convertList.push({ count: cnt, to });
        }
        if (convertList.length) {
          try {
            window.dispatchEvent(new CustomEvent('cpPracticeCastSkill', { detail: { type: 'convert', convert: convertList, name: u.activeSkill?.name || '' } }));
          } catch {}
        }
      };

      row.querySelectorAll('.cp-practice-slot[data-team-slotkey]').forEach((slotBtn) => {
        slotBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          const sk = String(slotBtn.getAttribute('data-team-slotkey') || '');
          const u = sk ? getTeamUnit(sk) : null;
          if (!u || !u.activeSkill) return;
          const b = getBattle();
          const key = String(u.key || '');
          const left = (b.skillCds && typeof b.skillCds === 'object') ? Math.max(0, Math.floor(Number(b.skillCds[key]) || 0)) : 0;

          closeSkillPanels();
          slotBtn.classList.add('is-skill-open');

          const panel = document.createElement('div');
          panel.className = 'cp-practice-skillpanel';
          panel.innerHTML = `
            <div class="cp-practice-skilltitle">${esc(u.activeSkill?.name || 'Skill')}</div>
            <div class="cp-practice-skilldesc">${esc(u.activeSkill?.text || '')}</div>
            <div class="cp-practice-skillmeta">CD ${esc(u.activeSkill?.cd ?? 0)}${left > 0 ? ` · Cooling down ${esc(left)}` : ''}</div>
            <div class="cp-practice-skillbtnrow">
              <button class="cp-tool-btn" type="button" data-skill-confirm ${left > 0 ? 'disabled' : ''}>Confirm</button>
              <button class="cp-tool-btn" type="button" data-skill-cancel>Cancel</button>
            </div>
          `;
          // Prevent nested button clicks from re-triggering the slot click handler
          panel.addEventListener('click', (e2) => { try { e2.stopPropagation(); } catch {} }, { passive: false });
          slotBtn.appendChild(panel);
          panel.querySelector('[data-skill-cancel]')?.addEventListener('click', (e2) => {
            e2.preventDefault();
            try { e2.stopPropagation(); } catch {}
            closeSkillPanels();
          }, { passive: false });
          panel.querySelector('[data-skill-confirm]')?.addEventListener('click', (e2) => {
            e2.preventDefault();
            try { e2.stopPropagation(); } catch {}
            castSkill(u);
            closeSkillPanels();
          }, { passive: false });
        }, { passive: false });
      });

      // Init / update battle state & HP UI
      try {
        // Story stage: mark monster as seen on entry
        try {
          const st = window.__cpStoryStage;
          const mons = Array.isArray(st?.monsters) ? st.monsters : null;
          if (mons && mons.length) mons.forEach(mm => { try { addSeenMonsterId(String(mm?.monsterId || '').trim().padStart(3, '0')); } catch {} });
          else {
            const sid = st?.monsterId ? String(st.monsterId).trim().padStart(3, '0') : '';
            if (sid) addSeenMonsterId(sid);
          }
        } catch {}
        const b = getBattle();
        const pMax = Math.max(0, totalHp);
        b.playerMaxHp = pMax;
        b.playerHp = Number.isFinite(Number(b.playerHp)) ? Math.max(0, Math.min(pMax, Number(b.playerHp))) : pMax;
        const st = window.__cpStoryStage;
        const stageMons = Array.isArray(st?.monsters) && st.monsters.length ? st.monsters : [{ monsterId: st?.monsterId || '004', level: st?.monsterLevel || 1 }];
        const nextMonsters = stageMons.map((mm, idx) => {
          const mid = String(mm?.monsterId || '004').trim().padStart(3, '0');
          const lv = Math.max(1, Math.floor(Number(mm?.level) || 1));
          const eff = getMonsterEffective(mid, lv);
          const m = getMonsterFromDbQuick(mid);
          return {
            idx,
            monsterId: mid,
            level: lv,
            name: String(m?.name || 'Monster'),
            element: String(m?.element || '').trim().toLowerCase(),
            img: String(m?.img || ''),
            maxHp: eff.hpMax,
            atk: eff.atk,
            hp: eff.hpMax,
          };
        });
        // If continuing in-place within the same stage, try to preserve HP/target by matching ids.
        const prev = Array.isArray(b.monsters) ? b.monsters : null;
        if (prev && prev.length) {
          nextMonsters.forEach((nm) => {
            const hit = prev.find(x => String(x?.monsterId || '') === nm.monsterId);
            if (hit) nm.hp = Number.isFinite(Number(hit.hp)) ? Math.max(0, Math.min(nm.maxHp, Number(hit.hp))) : nm.hp;
          });
        }
        b.monsters = nextMonsters;
        // Back-compat single-monster fields follow the current target (default to 0)
        b.targetMonsterIdx = Number.isFinite(Number(b.targetMonsterIdx)) ? Math.floor(Number(b.targetMonsterIdx)) : 0;
        const tIdx = Math.max(0, Math.min(nextMonsters.length - 1, Number(b.targetMonsterIdx) || 0));
        const t = nextMonsters[tIdx] || nextMonsters[0];
        if (t) {
          b.monsterLevel = t.level;
          b.monsterMaxHp = t.maxHp;
          b.monsterAtk = t.atk;
          b.monsterHp = t.hp;
        }
        // If previously hidden due to death, ensure it is visible on init
        const bossBox = document.querySelector('.cp-practice-boss');
        if (bossBox && bossBox.style.display === 'none') bossBox.style.display = '';
        try { bossBox?.classList.remove('cp-dead'); } catch {}
      } catch {}
      updateHpUI();

      applyElementScoresToUI();
    };
    renderTeam();
    try {
      if (window.__cpPracticeTeamListener) {
        window.removeEventListener('cpTeamsChanged', window.__cpPracticeTeamListener);
      }
    } catch {}
    window.__cpPracticeTeamListener = renderTeam;
    try { window.addEventListener('cpTeamsChanged', window.__cpPracticeTeamListener); } catch {}

    try {
      if (window.__cpPracticeScoreListener) {
        window.removeEventListener('cpElementScoresChanged', window.__cpPracticeScoreListener);
      }
    } catch {}
    window.__cpPracticeScoreListener = (ev) => {
      try {
        const total = ev?.detail?.scores?.total || ev?.detail?.scores || {};
        window.__cpPracticeElementScores = total;
      } catch {
        window.__cpPracticeElementScores = {};
      }
      applyElementScoresToUI();

      // On final score aggregation: heal + attack + monster counter-attack
      try {
        const phase = String(ev?.detail?.phase || '');
        if (phase === 'final') {
          resolveCombatFinal(window.__cpPracticeElementScores || {});
        }
      } catch {}
    };
    try { window.addEventListener('cpElementScoresChanged', window.__cpPracticeScoreListener); } catch {}
  };
  PracticePage.destroy = () => {
    try { window.ChessPal?.destroy?.(); } catch {}
    try {
      if (window.__cpPracticeTeamListener) {
        window.removeEventListener('cpTeamsChanged', window.__cpPracticeTeamListener);
      }
    } catch {}
    try {
      if (window.__cpPracticeScoreListener) {
        window.removeEventListener('cpElementScoresChanged', window.__cpPracticeScoreListener);
      }
    } catch {}
    try {
      if (window.__cpPracticeBgListener) {
        window.removeEventListener('cpGeneralSettingsChanged', window.__cpPracticeBgListener);
      }
    } catch {}
  };

  // Admin-only test page (same as Practice for now)
  function TestGamePage() {}
  TestGamePage.title = 'Test Game';
  TestGamePage.render = PracticePage.render;
  TestGamePage.init = PracticePage.init;
  TestGamePage.destroy = PracticePage.destroy;

  function PlaceholderPage(title, desc) {
    return {
      title,
      render: () => `
        <div class="cp-page-card">
          <div class="cp-h1">${esc(title)}</div>
          <div class="cp-muted">${esc(desc)}</div>
        </div>
      `,
      init: () => {}
    };
  }

  // ----------------------------
  // Hero database (001-005)
  // ----------------------------
  let heroOverrides = {};
  let heroOverridesLoaded = false;
  let heroOverridesLoading = null;

  function isAdminMode() {
    try {
      const role = new URLSearchParams(window.location.search || '').get('role');
      if (String(role) !== 'admin') return false;
      // Best-effort: require admin token when in admin mode
      if (window.authUtils && typeof window.authUtils.hasRole === 'function') {
        return !!window.authUtils.hasRole('admin');
      }
      return true;
    } catch {
      return false;
    }
  }

  async function loadHeroOverrides() {
    if (heroOverridesLoaded) return heroOverrides;
    if (heroOverridesLoading) return heroOverridesLoading;
    heroOverridesLoading = (async () => {
      try {
        const resp = await fetch('/api/chess-pal/heroes', { method: 'GET' });
        if (!resp.ok) throw new Error('Failed to load hero overrides');
        const data = await resp.json();
        const ov = data && data.overrides && typeof data.overrides === 'object' ? data.overrides : {};
        heroOverrides = ov;
      } catch {
        heroOverrides = heroOverrides || {};
      } finally {
        heroOverridesLoaded = true;
      }
      return heroOverrides;
    })();
    return heroOverridesLoading;
  }

  async function saveHeroOverridesToServer() {
    if (!isAdminMode()) throw new Error('Not in admin mode');
    if (!window.authUtils || typeof window.authUtils.authenticatedFetch !== 'function') {
      throw new Error('authUtils not available');
    }
    const resp = await window.authUtils.authenticatedFetch('/admin/chess-pal/heroes', {
      method: 'PUT',
      body: JSON.stringify({ overrides: heroOverrides })
    });
    if (!resp) throw new Error('Not authenticated');
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(t || 'Failed to save');
    }
    const data = await resp.json().catch(() => ({}));
    if (data && data.overrides && typeof data.overrides === 'object') {
      heroOverrides = data.overrides;
    }
    return heroOverrides;
  }

  const HERO_DB = (window.CP_DATA && Array.isArray(window.CP_DATA.HERO_DB)) ? window.CP_DATA.HERO_DB : [];

  function getHeroById(id) {
    const key = String(id || '').trim();
    return HERO_DB.find(h => String(h.id) === key) || null;
  }

  const HERO_RARITY_MAX_LEVEL = {
    1: 30,
    2: 35,
    3: 40,
    4: 50,
    5: 60,
    6: 70,
    7: 80,
    8: 90,
    9: 100,
    10: 110,
  };
  const HERO_RARITY_GROWTH_P = {
    1: 1.00,
    2: 1.05,
    3: 1.10,
    4: 1.16,
    5: 1.22,
    6: 1.28,
    7: 1.35,
    8: 1.42,
    9: 1.48,
    10: 1.55,
  };
  function heroMaxLevelForRarity(rarity) {
    const r = Math.max(1, Math.min(10, Math.floor(Number(rarity) || 1)));
    return HERO_RARITY_MAX_LEVEL[r] || HERO_MAX_LEVEL;
  }
  function heroGrowthPForRarity(rarity) {
    const r = Math.max(1, Math.min(10, Math.floor(Number(rarity) || 1)));
    return HERO_RARITY_GROWTH_P[r] || 1.22;
  }
  function scaleStat({ stat1, statMax, level, maxLevel, p }) {
    const lv = Math.max(1, Math.min(Math.max(1, Math.floor(Number(maxLevel) || 1)), Math.floor(Number(level) || 1)));
    const cap = Math.max(1, Math.floor(Number(maxLevel) || 1));
    const a = Math.max(0, Number(stat1) || 0);
    const b = Math.max(0, Number(statMax) || 0);
    if (cap <= 1) return Math.floor(b || a);
    const t = (lv - 1) / (cap - 1);
    const k = Math.pow(Math.max(0, Math.min(1, t)), Math.max(0.5, Number(p) || 1));
    return Math.floor(a + (b - a) * k);
  }
  function heroStatsAtLevel(hero, level, maxLevel) {
    const h = hero || {};
    const cap = Math.max(1, Math.floor(Number(maxLevel) || heroMaxLevelForRarity(h.rarity)));
    const p = heroGrowthPForRarity(h.rarity);

    // Back-compat: if hp1/hpMax not present, fall back to hp/atk/rcv as "flat"
    const hp1 = (h.hp1 != null) ? Number(h.hp1) : Number(h.hp);
    const atk1 = (h.atk1 != null) ? Number(h.atk1) : Number(h.atk);
    const rcv1 = (h.rcv1 != null) ? Number(h.rcv1) : Number(h.rcv);
    const hpMax = (h.hpMax != null) ? Number(h.hpMax) : Number(h.hp);
    const atkMax = (h.atkMax != null) ? Number(h.atkMax) : Number(h.atk);
    const rcvMax = (h.rcvMax != null) ? Number(h.rcvMax) : Number(h.rcv);

    return {
      hp: Math.max(1, scaleStat({ stat1: hp1, statMax: hpMax, level, maxLevel: cap, p })),
      atk: Math.max(1, scaleStat({ stat1: atk1, statMax: atkMax, level, maxLevel: cap, p })),
      rcv: Math.max(0, scaleStat({ stat1: rcv1, statMax: rcvMax, level, maxLevel: cap, p })),
      maxLevel: cap,
      growthP: p,
      hp1: Math.max(1, Math.floor(Number(hp1) || 1)),
      atk1: Math.max(1, Math.floor(Number(atk1) || 1)),
      rcv1: Math.max(0, Math.floor(Number(rcv1) || 0)),
      hpMax: Math.max(1, Math.floor(Number(hpMax) || 1)),
      atkMax: Math.max(1, Math.floor(Number(atkMax) || 1)),
      rcvMax: Math.max(0, Math.floor(Number(rcvMax) || 0)),
    };
  }

  function mergeHero(base) {
    const b = base || {};
    const o = (heroOverrides && b.id && heroOverrides[b.id]) ? heroOverrides[b.id] : {};
    const active = b.activeSkill && typeof b.activeSkill === 'object' ? b.activeSkill : { name: 'Skill', cd: 0, text: '', params: {} };
    const leader = b.leaderSkill && typeof b.leaderSkill === 'object' ? b.leaderSkill : { text: '', params: {} };
    const totalExp = b.id ? getHeroTotalExp(b.id) : 0;
    const cap = heroMaxLevelForRarity(b.rarity);
    const curve = heroExpCurveForRarity(b.rarity);
    const derivedLevel = Math.max(1, Math.min(cap, levelFromTotalExp(totalExp, curve, cap)));
    const scaled = heroStatsAtLevel(b, derivedLevel, cap);
    return {
      ...b,
      level: derivedLevel,
      maxLevel: cap,
      expCurve: curve,
      hp: (o.hp != null) ? Number(o.hp) : scaled.hp,
      atk: (o.atk != null) ? Number(o.atk) : scaled.atk,
      rcv: (o.rcv != null) ? Number(o.rcv) : scaled.rcv,
      // expose growth info (useful for UI / debugging)
      hp1: scaled.hp1,
      atk1: scaled.atk1,
      rcv1: scaled.rcv1,
      hpMax: scaled.hpMax,
      atkMax: scaled.atkMax,
      rcvMax: scaled.rcvMax,
      growthP: scaled.growthP,
      totalExp,
      activeSkill: {
        ...active,
        cd: (o.activeCd != null) ? Number(o.activeCd) : active.cd,
        params: (o.activeParams && typeof o.activeParams === 'object') ? o.activeParams : active.params
      },
      leaderSkill: {
        ...leader,
        params: (o.leaderParams && typeof o.leaderParams === 'object') ? o.leaderParams : leader.params
      }
    };
  }

  function getAllHeroes() {
    return HERO_DB.map(h => mergeHero(h));
  }

  function elementLabel(el) {
    const e = String(el || '').toLowerCase();
    if (e === 'light') return 'Light';
    if (e === 'dark') return 'Dark';
    if (e === 'fire') return 'Fire';
    if (e === 'water') return 'Water';
    if (e === 'wood') return 'Wood';
    if (e === 'heart') return 'Heart';
    return e || '-';
  }

  function jewelIconSrcForElement(el) {
    const e = String(el || '').toLowerCase();
    const map = {
      fire: 'Fire',
      water: 'Water',
      wood: 'Wood',
      light: 'Light',
      dark: 'Dark',
      heart: 'Heart',
    };
    const key = map[e];
    if (!key) return '';
    return `images/Jewel/Set_A/Set_A-${key}.png`;
  }

  function renderStars(n) {
    const k = Math.max(1, Math.min(8, Number(n) || 5));
    return '★'.repeat(k);
  }

  function showHeroModal(hero) {
    const h = hero || null;
    if (!h) return;
    const admin = isAdminMode();
    const canLevelUp = admin || getOwnedHeroSet().has(String(h.id || ''));
    const xp = expProgressMeta({ totalExp: h.totalExp || 0, level: h.level, curve: h.expCurve, maxLevel: h.maxLevel });

    // Remove existing
    const old = document.getElementById('cpHeroModalOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cpHeroModalOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Hero details">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-hero-modal-grid">
            <div class="cp-hero-modal-art">
              <img src="${esc(h.img)}" alt="${esc(h.name)}" />
            </div>
            <div class="cp-hero-modal-info">
              <div class="cp-hero-modal-title">
                <div class="cp-hero-id">#${esc(h.id)}</div>
                <div class="cp-hero-name">${esc(h.name)}</div>
              </div>
              <div class="cp-hero-meta">
                <span class="cp-chip">${esc(elementLabel(h.element))}</span>
                <span class="cp-chip">${esc(renderStars(h.rarity))}</span>
                <span class="cp-chip">Lv ${esc(h.level)} / ${esc(h.maxLevel)}</span>
                ${canLevelUp ? `<button class="cp-tool-btn" type="button" id="cpHeroLevelUpBtn">Level Up</button>` : ``}
              </div>
              <div class="cp-expwrap" aria-label="EXP progress">
                <div class="cp-expbar"><div class="cp-expfill" style="width:${esc(Math.round(xp.pct * 100))}%"></div></div>
                <div class="cp-exptext">${esc(xp.cur)} / ${esc(xp.need)} EXP</div>
              </div>
              <div class="cp-hero-stats">
                <div class="cp-stat"><b>HP</b> ${esc(h.hp)}</div>
                <div class="cp-stat"><b>ATK</b> ${esc(h.atk)}</div>
                <div class="cp-stat"><b>RCV</b> ${esc(h.rcv)}</div>
              </div>
              <div class="cp-hero-skill">
                <div class="cp-skill-head">
                  <div class="cp-skill-title">Leader Skill</div>
                </div>
                <div class="cp-skill-desc">${esc(h.leaderSkill?.text || '')}</div>
              </div>
              <div class="cp-hero-skill">
                <div class="cp-skill-head">
                  <div class="cp-skill-title">Active Skill · ${esc(h.activeSkill?.name || '')}</div>
                  <div class="cp-skill-cdchip">CD ${esc(h.activeSkill?.cd ?? 0)}</div>
                </div>
                <div class="cp-skill-desc">${esc(h.activeSkill?.text || '')}</div>
              </div>

              ${admin ? `
                <div class="cp-hero-skill cp-admin-box">
                  <div class="cp-skill-head">
                    <div class="cp-skill-title">Admin</div>
                    <button class="cp-tool-btn" type="button" id="cpOpenAdminEdit">Admin Edit</button>
                  </div>
                  <div class="cp-muted" style="margin-top:8px;">Edit HP/ATK/RCV, skill CD, and skill values.</div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => {
      try { overlay.remove(); } catch {}
      try { window.removeEventListener('keydown', onKey); } catch {}
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') close();
    };

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) close();
    });
    const closeBtn = overlay.querySelector('.cp-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', close, { passive: true });
    window.addEventListener('keydown', onKey);

    if (admin) {
      const openBtn = overlay.querySelector('#cpOpenAdminEdit');
      if (openBtn) {
        openBtn.addEventListener('click', () => {
          showHeroAdminEditModal(h.id);
        });
      }
    }
    const lvlBtn = overlay.querySelector('#cpHeroLevelUpBtn');
    if (lvlBtn) {
      lvlBtn.addEventListener('click', () => {
        showLevelUpModal({ kind: 'hero', id: String(h.id || ''), name: String(h.name || '') });
      }, { passive: true });
    }
  }

  function showHeroAdminEditModal(heroId) {
    const base = getHeroById(heroId);
    if (!base) return;
    const merged = mergeHero(base);

    const old = document.getElementById('cpAdminEditOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cpAdminEditOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Admin edit hero">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-h1" style="font-size:18px;">Admin Edit · #${esc(merged.id)} ${esc(merged.name)}</div>
          <div class="cp-muted" style="margin-top:6px;">Changes are saved to server and apply to all users.</div>

          <div class="cp-admin-grid" style="margin-top:12px;">
            <label class="cp-admin-field">
              <span>HP</span>
              <input type="number" id="cpAdminHp" value="${esc(merged.hp)}" min="1" step="1">
            </label>
            <label class="cp-admin-field">
              <span>ATK</span>
              <input type="number" id="cpAdminAtk" value="${esc(merged.atk)}" min="1" step="1">
            </label>
            <label class="cp-admin-field">
              <span>RCV</span>
              <input type="number" id="cpAdminRcv" value="${esc(merged.rcv)}" min="0" step="1">
            </label>
            <label class="cp-admin-field">
              <span>Active Skill CD</span>
              <input type="number" id="cpAdminActiveCd" value="${esc(merged.activeSkill?.cd ?? 0)}" min="0" step="1">
            </label>
          </div>

          <div class="cp-admin-json">
            <div class="cp-admin-json-title">Leader Skill Values (JSON)</div>
            <textarea id="cpAdminLeaderParams" rows="7">${esc(JSON.stringify(merged.leaderSkill?.params ?? {}, null, 2))}</textarea>
          </div>
          <div class="cp-admin-json">
            <div class="cp-admin-json-title">Active Skill Values (JSON)</div>
            <textarea id="cpAdminActiveParams" rows="7">${esc(JSON.stringify(merged.activeSkill?.params ?? {}, null, 2))}</textarea>
          </div>

          <div class="cp-admin-actions">
            <button class="cp-primary" type="button" id="cpAdminSaveHero">Save</button>
          </div>
          <div class="cp-muted" id="cpAdminMsg" style="margin-top:10px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      try { overlay.remove(); } catch {}
      try { window.removeEventListener('keydown', onKey); } catch {}
    };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
    overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
    window.addEventListener('keydown', onKey);

    const msg = overlay.querySelector('#cpAdminMsg');
    const setMsg = (t) => { if (msg) msg.textContent = String(t || ''); };

    overlay.querySelector('#cpAdminSaveHero')?.addEventListener('click', async () => {
      try {
        setMsg('');
        const hp = Number(overlay.querySelector('#cpAdminHp')?.value);
        const atk = Number(overlay.querySelector('#cpAdminAtk')?.value);
        const rcv = Number(overlay.querySelector('#cpAdminRcv')?.value);
        const cd = Number(overlay.querySelector('#cpAdminActiveCd')?.value);
        const leaderRaw = String(overlay.querySelector('#cpAdminLeaderParams')?.value || '{}');
        const activeRaw = String(overlay.querySelector('#cpAdminActiveParams')?.value || '{}');
        const leaderParams = JSON.parse(leaderRaw || '{}');
        const activeParams = JSON.parse(activeRaw || '{}');

        if (!heroOverridesLoaded) await loadHeroOverrides();
        if (!heroOverrides[merged.id]) heroOverrides[merged.id] = {};
        heroOverrides[merged.id].hp = Number.isFinite(hp) ? Math.max(1, Math.floor(hp)) : merged.hp;
        heroOverrides[merged.id].atk = Number.isFinite(atk) ? Math.max(1, Math.floor(atk)) : merged.atk;
        heroOverrides[merged.id].rcv = Number.isFinite(rcv) ? Math.max(0, Math.floor(rcv)) : merged.rcv;
        heroOverrides[merged.id].activeCd = Number.isFinite(cd) ? Math.max(0, Math.floor(cd)) : (merged.activeSkill?.cd ?? 0);
        heroOverrides[merged.id].leaderParams = leaderParams;
        heroOverrides[merged.id].activeParams = activeParams;

        await saveHeroOverridesToServer();
        setMsg('Saved.');

        // Refresh the hero detail modal (reopen with merged values)
        const refreshed = mergeHero(getHeroById(merged.id));
        close();
        showHeroModal(refreshed);
      } catch (e) {
        setMsg(String(e?.message || e || 'Save failed'));
      }
    });
  }

  function PalPage() {}
  PalPage.title = 'Pal';
  PalPage.render = () => {
    return `
      <div class="cp-square-grid" aria-label="Pal">
        <button class="cp-square-tile" type="button" data-cp-pal="hero" aria-label="Hero">
          <img class="cp-square-img" src="images/Heros/002-Nyxblade/002-Nyxblade-mini.png" alt="Hero">
          <div class="cp-square-label">Hero</div>
        </button>
        <button class="cp-square-tile" type="button" data-cp-pal="monster" aria-label="Monster">
          <img class="cp-square-img" src="images/Monsters/M001-Grimjaw/M001-Grimjaw-mini.png" alt="Monster">
          <div class="cp-square-label">Monster</div>
        </button>
      </div>
    `;
  };
  PalPage.init = () => {
    document.querySelectorAll('[data-cp-pal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = String(btn.getAttribute('data-cp-pal') || '');
        if (key === 'monster') Router.goTo('/monsters');
        else Router.goTo('/heroes');
      }, { passive: true });
    });
  };

  function HeroesPage() {}
  HeroesPage.title = 'Hero';
  HeroesPage.render = () => {
    return `
      <div class="cp-hero-page">
        <div class="cp-hero-grid cp-hero-grid--full" id="cpHeroesGrid"></div>
      </div>
    `;
  };
  HeroesPage.init = async () => {
    const host = document.getElementById('cpHeroesGrid');
    if (!host) return;
    host.innerHTML = `<div class="cp-muted">Loading heroes...</div>`;
    await loadHeroOverrides();
    const admin = isAdminMode();
    const owned = admin ? null : getOwnedHeroSet();
    const all = getAllHeroes();
    const list = admin ? all : all.filter(h => owned && owned.has(h.id));
    host.innerHTML = list.map(h => `
      <button class="cp-hero-card" type="button" data-hero-id="${esc(h.id)}" data-element="${esc(String(h.element || ''))}">
        <div class="cp-hero-mini">
          <img src="${esc(h.mini || h.img)}" alt="${esc(h.name)}" decoding="async" loading="lazy">
          <div class="cp-mini-lv">Lv ${esc(h.level)}</div>
          ${jewelIconSrcForElement(h.element) ? `<img class="cp-hero-jewel" src="${esc(jewelIconSrcForElement(h.element))}" alt="" aria-hidden="true">` : ``}
        </div>
        <div class="cp-hero-mini-meta">
          <div class="cp-hero-mini-name">${esc(h.name)}</div>
          <div class="cp-hero-mini-sub">#${esc(h.id)} · ${esc(elementLabel(h.element))}</div>
        </div>
      </button>
    `).join('');
    host.querySelectorAll('[data-hero-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = String(btn.getAttribute('data-hero-id') || '');
        if (!admin) {
          const owned2 = getOwnedHeroSet();
          if (!owned2.has(id)) return;
        }
        const hero = getAllHeroes().find(x => x.id === id);
        if (hero) showHeroModal(hero);
      });
    });
    try { preloadImages(list.map(x => x.mini || x.img).filter(Boolean), 36); } catch {}
  };

  // ----------------------------
  // Monster database (UI first)
  // ----------------------------
  let monsterOverrides = {};
  let monsterOverridesLoaded = false;
  let monsterOverridesLoading = null;

  async function loadMonsterOverrides() {
    if (monsterOverridesLoaded) return monsterOverrides;
    if (monsterOverridesLoading) return monsterOverridesLoading;
    monsterOverridesLoading = (async () => {
      try {
        const resp = await fetch('/api/chess-pal/monsters', { method: 'GET' });
        if (!resp.ok) throw new Error('Failed to load monster overrides');
        const data = await resp.json();
        const ov = data && data.overrides && typeof data.overrides === 'object' ? data.overrides : {};
        monsterOverrides = ov;
      } catch {
        monsterOverrides = monsterOverrides || {};
      } finally {
        monsterOverridesLoaded = true;
      }
      return monsterOverrides;
    })();
    return monsterOverridesLoading;
  }

  async function saveMonsterOverridesToServer() {
    if (!isAdminMode()) throw new Error('Not in admin mode');
    if (!window.authUtils || typeof window.authUtils.authenticatedFetch !== 'function') {
      throw new Error('authUtils not available');
    }
    const resp = await window.authUtils.authenticatedFetch('/admin/chess-pal/monsters', {
      method: 'PUT',
      body: JSON.stringify({ overrides: monsterOverrides })
    });
    if (!resp) throw new Error('Not authenticated');
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(t || 'Failed to save');
    }
    const data = await resp.json().catch(() => ({}));
    if (data && data.overrides && typeof data.overrides === 'object') {
      monsterOverrides = data.overrides;
    }
    return monsterOverrides;
  }

  const MONSTER_DB = (window.CP_DATA && Array.isArray(window.CP_DATA.MONSTER_DB)) ? window.CP_DATA.MONSTER_DB : [];

  function getMonsterById(id) {
    const key = String(id || '').trim();
    return MONSTER_DB.find(m => String(m.id) === key) || null;
  }

  function mergeMonster(base) {
    const b = base || {};
    const o = (monsterOverrides && b.id && monsterOverrides[b.id]) ? monsterOverrides[b.id] : {};
    const active = b.activeSkill && typeof b.activeSkill === 'object' ? b.activeSkill : { name: 'Skill', cd: 0, text: '', params: {} };
    const passive = b.passiveSkill && typeof b.passiveSkill === 'object' ? b.passiveSkill : { name: 'Passive', text: '', params: {} };
    const rarity = (o.rarity != null) ? Number(o.rarity) : b.rarity;
    const maxLevel = (o.maxLevel != null) ? Number(o.maxLevel) : b.maxLevel;
    const cap = Math.max(1, Math.floor(Number(maxLevel) || 99));
    const curve = monsterExpCurveForRarity(rarity);
    const totalExp = b.id ? getMonsterTotalExp(b.id) : 0;
    const derivedLevel = Math.max(1, Math.min(cap, levelFromTotalExp(totalExp, curve, cap)));

    // Base stats (optionally overridden by admin)
    const baseHp = (o.hp != null) ? Number(o.hp) : b.hp;
    const baseAtk = (o.atk != null) ? Number(o.atk) : b.atk;
    const baseRcv = (o.rcv != null) ? Number(o.rcv) : b.rcv;
    // Simple growth for monsters: +5% per level above 1
    const mult = 1 + Math.max(0, derivedLevel - 1) * 0.05;
    const scaledHp = Math.max(1, Math.floor((Number(baseHp) || 1) * mult));
    const scaledAtk = Math.max(0, Math.floor((Number(baseAtk) || 0) * mult));
    const scaledRcv = Math.max(0, Math.floor((Number(baseRcv) || 0) * mult));

    const admin = isAdminMode();
    const overrideLevel = (o.level != null) ? Number(o.level) : b.level;
    const level = (admin && o.level != null) ? Math.max(1, Math.min(cap, Math.floor(Number(overrideLevel) || 1))) : derivedLevel;

    return {
      ...b,
      rarity,
      level,
      maxLevel: cap,
      expCurve: curve,
      totalExp,
      hp: scaledHp,
      atk: scaledAtk,
      rcv: scaledRcv,
      activeSkill: {
        ...active,
        cd: (o.activeCd != null) ? Number(o.activeCd) : active.cd,
        params: (o.activeParams && typeof o.activeParams === 'object') ? o.activeParams : active.params
      },
      passiveSkill: {
        ...passive,
        params: (o.passiveParams && typeof o.passiveParams === 'object') ? o.passiveParams : passive.params
      }
    };
  }

  function getAllMonsters() {
    return MONSTER_DB.map(m => mergeMonster(m));
  }

  function showMonsterModal(monster) {
    const m = monster || null;
    if (!m) return;
    const admin = isAdminMode();
    const canLevelUp = admin || getOwnedMonsterSet().has(String(m.id || ''));
    const xp = expProgressMeta({ totalExp: m.totalExp || 0, level: m.level, curve: m.expCurve, maxLevel: m.maxLevel });
    const old = document.getElementById('cpMonsterModalOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cpMonsterModalOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Monster details">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-hero-modal-grid">
            <div class="cp-hero-modal-art">
              ${m.img ? `<img src="${esc(m.img)}" alt="${esc(m.name)}" />` : `<div class="cp-art-placeholder">${esc(m.name)}</div>`}
            </div>
            <div class="cp-hero-modal-info">
              <div class="cp-hero-modal-title">
                <div class="cp-hero-id">#${esc(m.id)}</div>
                <div class="cp-hero-name">${esc(m.name)}</div>
              </div>
              <div class="cp-hero-meta">
                <span class="cp-chip">${esc(elementLabel(m.element))}</span>
                <span class="cp-chip">${esc(renderStars(m.rarity))}</span>
                <span class="cp-chip">Lv ${esc(m.level)} / ${esc(m.maxLevel)}</span>
                ${canLevelUp ? `<button class="cp-tool-btn" type="button" id="cpMonsterLevelUpBtn">Level Up</button>` : ``}
              </div>
              <div class="cp-expwrap" aria-label="EXP progress">
                <div class="cp-expbar"><div class="cp-expfill" style="width:${esc(Math.round(xp.pct * 100))}%"></div></div>
                <div class="cp-exptext">${esc(xp.cur)} / ${esc(xp.need)} EXP</div>
              </div>
              <div class="cp-hero-stats">
                <div class="cp-stat"><b>HP</b> ${esc(m.hp)}</div>
                <div class="cp-stat"><b>ATK</b> ${esc(m.atk)}</div>
                <div class="cp-stat"><b>RCV</b> ${esc(m.rcv)}</div>
              </div>
              <div class="cp-hero-skill">
                <div class="cp-skill-head">
                  <div class="cp-skill-title">Passive Skill · ${esc(m.passiveSkill?.name || '')}</div>
                </div>
                <div class="cp-skill-desc">${esc(m.passiveSkill?.text || '')}</div>
              </div>
              <div class="cp-hero-skill">
                <div class="cp-skill-head">
                  <div class="cp-skill-title">Active Skill · ${esc(m.activeSkill?.name || '')}</div>
                  <div class="cp-skill-cdchip">CD ${esc(m.activeSkill?.cd ?? 0)}</div>
                </div>
                <div class="cp-skill-desc">${esc(m.activeSkill?.text || '')}</div>
              </div>

              ${admin ? `
                <div class="cp-hero-skill cp-admin-box">
                  <div class="cp-skill-head">
                    <div class="cp-skill-title">Admin</div>
                    <button class="cp-tool-btn" type="button" id="cpOpenMonsterAdminEdit">Admin Edit</button>
                  </div>
                  <div class="cp-muted" style="margin-top:8px;">Edit HP/ATK/RCV, skill CD, and skill values.</div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => { try { overlay.remove(); } catch {} try { window.removeEventListener('keydown', onKey); } catch {} };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
    overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
    window.addEventListener('keydown', onKey);

    if (admin) {
      const openBtn = overlay.querySelector('#cpOpenMonsterAdminEdit');
      if (openBtn) {
        openBtn.addEventListener('click', () => {
          showMonsterAdminEditModal(m.id);
        });
      }
    }
    const lvlBtn = overlay.querySelector('#cpMonsterLevelUpBtn');
    if (lvlBtn) {
      lvlBtn.addEventListener('click', () => {
        showLevelUpModal({ kind: 'monster', id: String(m.id || ''), name: String(m.name || '') });
      }, { passive: true });
    }
  }

  function showMonsterAdminEditModal(monsterId) {
    const base = getMonsterById(monsterId);
    if (!base) return;
    const merged = mergeMonster(base);

    const old = document.getElementById('cpMonsterAdminEditOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cpMonsterAdminEditOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Admin edit monster">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-h1" style="font-size:18px;">Admin Edit · #${esc(merged.id)} ${esc(merged.name)}</div>
          <div class="cp-muted" style="margin-top:6px;">Changes are saved to server and apply to all users.</div>

          <div class="cp-admin-grid" style="margin-top:12px;">
            <label class="cp-admin-field">
              <span>Rarity</span>
              <input type="number" id="cpAdminRarity" value="${esc(merged.rarity)}" min="1" step="1">
            </label>
            <label class="cp-admin-field">
              <span>Level</span>
              <input type="number" id="cpAdminLevel" value="${esc(merged.level)}" min="1" step="1">
            </label>
            <label class="cp-admin-field">
              <span>Max Level</span>
              <input type="number" id="cpAdminMaxLevel" value="${esc(merged.maxLevel)}" min="1" step="1">
            </label>
            <label class="cp-admin-field">
              <span>HP</span>
              <input type="number" id="cpAdminHp" value="${esc(merged.hp)}" min="1" step="1">
            </label>
            <label class="cp-admin-field">
              <span>ATK</span>
              <input type="number" id="cpAdminAtk" value="${esc(merged.atk)}" min="1" step="1">
            </label>
            <label class="cp-admin-field">
              <span>RCV</span>
              <input type="number" id="cpAdminRcv" value="${esc(merged.rcv)}" min="0" step="1">
            </label>
            <label class="cp-admin-field">
              <span>Active Skill CD</span>
              <input type="number" id="cpAdminActiveCd" value="${esc(merged.activeSkill?.cd ?? 0)}" min="0" step="1">
            </label>
          </div>

          <div class="cp-admin-json">
            <div class="cp-admin-json-title">Passive Skill Values (JSON)</div>
            <textarea id="cpAdminPassiveParams" rows="7">${esc(JSON.stringify(merged.passiveSkill?.params ?? {}, null, 2))}</textarea>
          </div>
          <div class="cp-admin-json">
            <div class="cp-admin-json-title">Active Skill Values (JSON)</div>
            <textarea id="cpAdminActiveParams" rows="7">${esc(JSON.stringify(merged.activeSkill?.params ?? {}, null, 2))}</textarea>
          </div>

          <div class="cp-admin-actions">
            <button class="cp-primary" type="button" id="cpAdminSaveMonster">Save</button>
          </div>
          <div class="cp-muted" id="cpAdminMsg" style="margin-top:10px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      try { overlay.remove(); } catch {}
      try { window.removeEventListener('keydown', onKey); } catch {}
    };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
    overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
    window.addEventListener('keydown', onKey);

    const msg = overlay.querySelector('#cpAdminMsg');
    const setMsg = (t) => { if (msg) msg.textContent = String(t || ''); };

    overlay.querySelector('#cpAdminSaveMonster')?.addEventListener('click', async () => {
      try {
        setMsg('');
        const rarity = Number(overlay.querySelector('#cpAdminRarity')?.value);
        const level = Number(overlay.querySelector('#cpAdminLevel')?.value);
        const maxLevel = Number(overlay.querySelector('#cpAdminMaxLevel')?.value);
        const hp = Number(overlay.querySelector('#cpAdminHp')?.value);
        const atk = Number(overlay.querySelector('#cpAdminAtk')?.value);
        const rcv = Number(overlay.querySelector('#cpAdminRcv')?.value);
        const cd = Number(overlay.querySelector('#cpAdminActiveCd')?.value);
        const passiveRaw = String(overlay.querySelector('#cpAdminPassiveParams')?.value || '{}');
        const activeRaw = String(overlay.querySelector('#cpAdminActiveParams')?.value || '{}');
        const passiveParams = JSON.parse(passiveRaw || '{}');
        const activeParams = JSON.parse(activeRaw || '{}');

        if (!monsterOverridesLoaded) await loadMonsterOverrides();
        if (!monsterOverrides[merged.id]) monsterOverrides[merged.id] = {};
        monsterOverrides[merged.id].rarity = Number.isFinite(rarity) ? Math.max(1, Math.floor(rarity)) : merged.rarity;
        monsterOverrides[merged.id].level = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : merged.level;
        monsterOverrides[merged.id].maxLevel = Number.isFinite(maxLevel) ? Math.max(1, Math.floor(maxLevel)) : merged.maxLevel;
        monsterOverrides[merged.id].hp = Number.isFinite(hp) ? Math.max(1, Math.floor(hp)) : merged.hp;
        monsterOverrides[merged.id].atk = Number.isFinite(atk) ? Math.max(1, Math.floor(atk)) : merged.atk;
        monsterOverrides[merged.id].rcv = Number.isFinite(rcv) ? Math.max(0, Math.floor(rcv)) : merged.rcv;
        monsterOverrides[merged.id].activeCd = Number.isFinite(cd) ? Math.max(0, Math.floor(cd)) : (merged.activeSkill?.cd ?? 0);
        monsterOverrides[merged.id].passiveParams = passiveParams;
        monsterOverrides[merged.id].activeParams = activeParams;

        await saveMonsterOverridesToServer();
        setMsg('Saved.');

        const refreshed = mergeMonster(getMonsterById(merged.id));
        close();
        showMonsterModal(refreshed);
      } catch (e) {
        setMsg(String(e?.message || e || 'Save failed'));
      }
    });
  }

  function MonstersPage() {}
  MonstersPage.title = 'Monster';
  MonstersPage.render = () => {
    return `
      <div class="cp-hero-page">
        <div class="cp-hero-grid cp-hero-grid--full" id="cpMonstersGrid"></div>
      </div>
    `;
  };
  MonstersPage.init = async () => {
    const host = document.getElementById('cpMonstersGrid');
    if (!host) return;
    host.innerHTML = `<div class="cp-muted">Loading monsters...</div>`;
    await loadMonsterOverrides();
    const admin = isAdminMode();
    const seen = admin ? null : getSeenMonsterSet();
    const owned = admin ? null : getOwnedMonsterSet();
    const all = getAllMonsters();
    const list = admin ? all : all.filter(m => (owned && owned.has(m.id)) || (seen && seen.has(m.id)));
    host.innerHTML = list.map(m => `
      <button class="cp-hero-card ${(!admin && owned && !owned.has(m.id)) ? 'is-locked' : ''}" type="button" data-monster-id="${esc(m.id)}" data-element="${esc(String(m.element || ''))}" ${(!admin && owned && !owned.has(m.id)) ? 'disabled' : ''}>
        <div class="cp-hero-mini">
          ${m.mini ? `<img src="${esc(m.mini)}" alt="${esc(m.name)}" decoding="async" loading="lazy">` : `<div class="cp-mini-placeholder">${esc(m.name)}</div>`}
          <div class="cp-mini-lv">Lv ${esc(m.level)}</div>
        </div>
        <div class="cp-hero-mini-meta">
          <div class="cp-hero-mini-name">${esc(m.name)}</div>
          <div class="cp-hero-mini-sub">#${esc(m.id)} · ${esc(elementLabel(m.element))}</div>
        </div>
      </button>
    `).join('');
    host.querySelectorAll('[data-monster-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = String(btn.getAttribute('data-monster-id') || '');
        if (!admin) {
          const owned2 = getOwnedMonsterSet();
          if (!owned2.has(id)) return;
        }
        const m = getAllMonsters().find(x => x.id === id);
        if (m) showMonsterModal(m);
      });
    });
    try { preloadImages(list.map(x => x.mini || x.img).filter(Boolean), 36); } catch {}
  };

  // ----------------------------
  // Team (up to 5 teams, 4 members)
  // ----------------------------
  const TEAM_KEY = 'chessPalTeams';

  function teamSlotKey(kind, id) {
    const k = String(kind || '').trim().toLowerCase();
    const n = String(id == null ? '' : id).trim();
    const pid = n ? n.padStart(3, '0') : '';
    if (!/^\d{3}$/.test(pid)) return null;
    if (k === 'monster') return `M${pid}`;
    return `H${pid}`;
  }

  function parseTeamSlot(raw) {
    if (raw == null) return null;
    const s0 = String(raw || '').trim();
    if (!s0) return null;
    const s = s0.toUpperCase();
    if (/^H\d{3}$/.test(s)) return { kind: 'hero', id: s.slice(1) };
    if (/^M\d{3}$/.test(s)) return { kind: 'monster', id: s.slice(1) };
    // Back-compat: old saves stored hero ids as "003"
    if (/^\d{3}$/.test(s)) return { kind: 'hero', id: s };
    // Back-compat: sometimes numbers can be stored without padding
    if (/^\d+$/.test(s)) return { kind: 'hero', id: s.padStart(3, '0') };
    return null;
  }

  function getTeamUnit(slotKey) {
    const parsed = parseTeamSlot(slotKey);
    if (!parsed) return null;
    if (parsed.kind === 'monster') {
      const m = getAllMonsters().find(x => String(x.id) === parsed.id) || null;
      if (!m) return null;
      return { kind: 'monster', key: teamSlotKey('monster', m.id), ...m };
    }
    const h = getAllHeroes().find(x => String(x.id) === parsed.id) || null;
    if (!h) return null;
    return { kind: 'hero', key: teamSlotKey('hero', h.id), ...h };
  }

  function defaultTeams() {
    const owned = Array.from(getOwnedHeroSet());
    const t0 = [
      owned.includes('002') ? teamSlotKey('hero', '002') : (owned[0] ? teamSlotKey('hero', owned[0]) : null),
      owned.includes('003') ? teamSlotKey('hero', '003') : (owned[1] ? teamSlotKey('hero', owned[1]) : null),
      owned.includes('004') ? teamSlotKey('hero', '004') : (owned[2] ? teamSlotKey('hero', owned[2]) : null),
      null
    ];
    return {
      active: 0,
      teams: [t0, [null, null, null, null], [null, null, null, null], [null, null, null, null], [null, null, null, null]]
    };
  }

  function normalizeTeamState(v) {
    const base = defaultTeams();
    const active = Math.max(0, Math.min(4, Math.floor(Number(v?.active) || 0)));
    const teamsIn = Array.isArray(v?.teams) ? v.teams : base.teams;
    const teams = [];
    for (let i = 0; i < 5; i += 1) {
      const row = Array.isArray(teamsIn[i]) ? teamsIn[i] : [null, null, null, null];
      const slots = [];
      for (let j = 0; j < 4; j += 1) {
        const parsed = parseTeamSlot(row[j]);
        if (!parsed) {
          slots.push(null);
        } else {
          slots.push(teamSlotKey(parsed.kind, parsed.id));
        }
      }
      teams.push(slots);
    }
    return { active, teams };
  }

  function loadTeams() {
    try {
      const raw = localStorage.getItem(TEAM_KEY);
      if (!raw) return defaultTeams();
      return normalizeTeamState(JSON.parse(raw));
    } catch {
      return defaultTeams();
    }
  }

  function saveTeams(s) {
    try { localStorage.setItem(TEAM_KEY, JSON.stringify(normalizeTeamState(s))); } catch {}
    try { window.dispatchEvent(new Event('cpTeamsChanged')); } catch {}
  }

  function showPickTeamUnitModal(opts) {
    const { title, allowHeroIds, allowMonsterIds, onPick, onClear } = opts || {};
    const old = document.getElementById('cpPickTeamUnitOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cpPickTeamUnitOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Pick team unit">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-h1" style="font-size:18px;">${esc(title || 'Pick Unit')}</div>
          <div class="cp-muted" style="margin-top:6px;">Pick a Hero or Monster.</div>

          <div class="cp-row" style="margin-top:12px; gap:6px; align-items:flex-end; flex-wrap:nowrap; max-width:100%;">
            <div style="min-width:140px; flex: 1 1 180px;">
              <div class="cp-setting-label" style="margin-bottom:6px;">Search</div>
              <input class="cp-input" id="cpPickUnitSearch" placeholder="Search name or id" />
            </div>
            <div style="min-width:100px; flex: 0 1 120px;">
              <div class="cp-setting-label" style="margin-bottom:6px;">Filter</div>
              <select class="cp-select" id="cpPickUnitFilterMode">
                <option value="none">None</option>
                <option value="type">Hero or Monster</option>
                <option value="level">Level</option>
                <option value="rarity">Stars</option>
                <option value="element">Element</option>
              </select>
            </div>
            <div style="min-width:100px; flex: 0 1 120px;" id="cpPickUnitFilterValueWrap"></div>
            <div style="min-width:90px; flex: 0 1 110px;">
              <div class="cp-setting-label" style="margin-bottom:6px;">Sort</div>
              <select class="cp-select" id="cpPickUnitSortKey">
                <option value="level">Level</option>
                <option value="rarity">Stars</option>
                <option value="name">Name</option>
              </select>
            </div>
            <div style="min-width:90px; flex: 0 1 110px;">
              <div class="cp-setting-label" style="margin-bottom:6px;">Order</div>
              <select class="cp-select" id="cpPickUnitSortDir">
                <option value="desc">High to Low</option>
                <option value="asc">Low to High</option>
              </select>
            </div>
          </div>

          <div class="cp-hero-grid" style="margin-top:12px;" id="cpPickUnitGrid"></div>
          <div class="cp-row" style="margin-top:12px;">
            <button class="cp-tool-btn" type="button" id="cpPickUnitClear">Clear Slot</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      try { overlay.remove(); } catch {}
      try { window.removeEventListener('keydown', onKey); } catch {}
    };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
    overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
    window.addEventListener('keydown', onKey);

    const searchEl = overlay.querySelector('#cpPickUnitSearch');
    const filterModeEl = overlay.querySelector('#cpPickUnitFilterMode');
    const filterWrap = overlay.querySelector('#cpPickUnitFilterValueWrap');
    const sortKeyEl = overlay.querySelector('#cpPickUnitSortKey');
    const sortDirEl = overlay.querySelector('#cpPickUnitSortDir');
    const grid = overlay.querySelector('#cpPickUnitGrid');

    const heroAllow = new Set(Array.isArray(allowHeroIds) ? allowHeroIds : []);
    const monsterAllow = new Set(Array.isArray(allowMonsterIds) ? allowMonsterIds : []);

    const baseList = [];
    try {
      getAllHeroes().forEach(h => {
        if (!heroAllow.has(h.id)) return;
        baseList.push({
          kind: 'hero',
          key: teamSlotKey('hero', h.id),
          id: String(h.id),
          name: String(h.name || ''),
          element: String(h.element || ''),
          rarity: Number(h.rarity) || 0,
          level: Number(h.level) || 0,
          mini: h.mini || '',
          locked: false
        });
      });
    } catch {}
    try {
      getAllMonsters().forEach(m => {
        if (!monsterAllow.has(m.id)) return;
        baseList.push({
          kind: 'monster',
          key: teamSlotKey('monster', m.id),
          id: String(m.id),
          name: String(m.name || ''),
          element: String(m.element || ''),
          rarity: Number(m.rarity) || 0,
          level: Number(m.level) || 0,
          mini: m.mini || '',
          locked: false
        });
      });
    } catch {}

    function renderFilterValue() {
      if (!filterWrap) return;
      const mode = String(filterModeEl?.value || 'none');
      if (mode === 'type') {
        filterWrap.innerHTML = `
          <div class="cp-setting-label" style="margin-bottom:6px;">Value</div>
          <select class="cp-select" id="cpPickUnitFilterValue">
            <option value="hero">Hero</option>
            <option value="monster">Monster</option>
          </select>
        `;
      } else if (mode === 'level') {
        filterWrap.innerHTML = `
          <div class="cp-setting-label" style="margin-bottom:6px;">Min level</div>
          <input class="cp-input" id="cpPickUnitFilterValue" type="number" min="1" step="1" value="1" />
        `;
      } else if (mode === 'rarity') {
        filterWrap.innerHTML = `
          <div class="cp-setting-label" style="margin-bottom:6px;">Stars</div>
          <select class="cp-select" id="cpPickUnitFilterValue">
            ${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}
          </select>
        `;
      } else if (mode === 'element') {
        filterWrap.innerHTML = `
          <div class="cp-setting-label" style="margin-bottom:6px;">Element</div>
          <select class="cp-select" id="cpPickUnitFilterValue">
            <option value="fire">Fire</option>
            <option value="water">Water</option>
            <option value="wood">Wood</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="heart">Heart</option>
          </select>
        `;
      } else {
        filterWrap.innerHTML = `<div class="cp-setting-label" style="margin-bottom:6px;">Value</div><div class="cp-muted">—</div>`;
      }
    }

    function matchesSearch(u, q) {
      const qq = String(q || '').trim().toLowerCase();
      if (!qq) return true;
      return String(u.name || '').toLowerCase().includes(qq) || String(u.id || '').toLowerCase().includes(qq);
    }

    function applyFilter(list) {
      const mode = String(filterModeEl?.value || 'none');
      const valEl = overlay.querySelector('#cpPickUnitFilterValue');
      const val = valEl ? String(valEl.value || '').trim().toLowerCase() : '';
      if (mode === 'type') return list.filter(u => String(u.kind) === val);
      if (mode === 'level') {
        const n = Math.max(1, Math.floor(Number(valEl?.value) || 1));
        return list.filter(u => (Number(u.level) || 0) >= n);
      }
      if (mode === 'rarity') {
        const n = Math.max(1, Math.floor(Number(val) || 1));
        return list.filter(u => (Number(u.rarity) || 0) === n);
      }
      if (mode === 'element') return list.filter(u => String(u.element || '').toLowerCase() === val);
      return list;
    }

    function sortList(list) {
      const key = String(sortKeyEl?.value || 'level');
      const dir = String(sortDirEl?.value || 'desc');
      const sign = dir === 'asc' ? 1 : -1;
      const by = (a, b) => {
        if (key === 'name') return String(a.name || '').localeCompare(String(b.name || '')) * sign;
        if (key === 'rarity') return ((Number(a.rarity) || 0) - (Number(b.rarity) || 0)) * sign || ((Number(a.level) || 0) - (Number(b.level) || 0)) * sign;
        return ((Number(a.level) || 0) - (Number(b.level) || 0)) * sign || ((Number(a.rarity) || 0) - (Number(b.rarity) || 0)) * sign;
      };
      return [...list].sort(by);
    }

    function renderGrid() {
      if (!grid) return;
      const q = String(searchEl?.value || '');
      let list = baseList.filter(u => matchesSearch(u, q));
      list = applyFilter(list);
      list = sortList(list);
      grid.innerHTML = list.map(u => `
        <button class="cp-hero-card" type="button" data-pick-unit="${esc(u.key)}" data-element="${esc(String(u.element || ''))}">
          <div class="cp-hero-mini">
            ${u.mini ? `<img src="${esc(u.mini)}" alt="${esc(u.name)}" decoding="async" loading="lazy">` : `<div class="cp-mini-placeholder">${esc(u.name)}</div>`}
            <div class="cp-mini-lv">Lv ${esc(String(u.level || 1))}</div>
            ${jewelIconSrcForElement(u.element) ? `<img class="cp-hero-jewel" src="${esc(jewelIconSrcForElement(u.element))}" alt="" aria-hidden="true">` : ``}
          </div>
          <div class="cp-hero-mini-meta">
            <div class="cp-hero-mini-name">${esc(u.name)}</div>
            <div class="cp-hero-mini-sub">${esc(u.kind === 'monster' ? 'Monster' : 'Hero')} · #${esc(u.id)} · ${esc(elementLabel(u.element))} · ${esc(renderStars(u.rarity))}</div>
          </div>
        </button>
      `).join('');
      grid.querySelectorAll('[data-pick-unit]').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = String(btn.getAttribute('data-pick-unit') || '');
          try { onPick && onPick(key); } catch {}
          close();
        }, { passive: true });
      });
    }

    renderFilterValue();
    // Default sort: level high to low
    try { if (sortKeyEl) sortKeyEl.value = 'level'; } catch {}
    try { if (sortDirEl) sortDirEl.value = 'desc'; } catch {}
    renderGrid();

    searchEl?.addEventListener('input', () => { try { renderGrid(); } catch {} });
    filterModeEl?.addEventListener('change', () => {
      try { renderFilterValue(); } catch {}
      try { renderGrid(); } catch {}
      overlay.querySelector('#cpPickUnitFilterValue')?.addEventListener('input', () => { try { renderGrid(); } catch {} });
      overlay.querySelector('#cpPickUnitFilterValue')?.addEventListener('change', () => { try { renderGrid(); } catch {} });
    });
    sortKeyEl?.addEventListener('change', () => { try { renderGrid(); } catch {} });
    sortDirEl?.addEventListener('change', () => { try { renderGrid(); } catch {} });
    overlay.querySelector('#cpPickUnitFilterValue')?.addEventListener('input', () => { try { renderGrid(); } catch {} });
    overlay.querySelector('#cpPickUnitFilterValue')?.addEventListener('change', () => { try { renderGrid(); } catch {} });

    overlay.querySelector('#cpPickUnitClear')?.addEventListener('click', () => {
      try { onClear && onClear(); } catch {}
      close();
    }, { passive: true });
  }

  function TeamPage() {}
  TeamPage.title = 'Team';
  TeamPage.render = () => {
    return `
      <div class="cp-page-card">
        <div class="cp-team-head">
          <button class="cp-team-arrow" type="button" id="cpTeamPrev" aria-label="Previous team">‹</button>
          <div class="cp-team-title" id="cpTeamTitle">Team</div>
          <button class="cp-team-arrow" type="button" id="cpTeamNext" aria-label="Next team">›</button>
        </div>

        <div class="cp-team-grid" id="cpTeamGrid" style="margin-top:12px;"></div>
        <div class="cp-team-skill" id="cpTeamSkill" style="margin-top:12px;"></div>
      </div>
    `;
  };
  TeamPage.init = async () => {
    await loadHeroOverrides();
    try { await loadMonsterOverrides(); } catch {}
    const host = document.getElementById('cpTeamGrid');
    const title = document.getElementById('cpTeamTitle');
    const skill = document.getElementById('cpTeamSkill');
    const prev = document.getElementById('cpTeamPrev');
    const next = document.getElementById('cpTeamNext');
    if (!host) return;

    let state = loadTeams();

    const ownedHeroSet = isAdminMode() ? new Set(getAllHeroes().map(h => h.id)) : getOwnedHeroSet();
    const ownedHeroIds = Array.from(ownedHeroSet);
    const allowedMonsterIds = isAdminMode() ? getAllMonsters().map(m => m.id) : Array.from(getSeenMonsterSet());

    const render = () => {
      const idx = Math.max(0, Math.min(4, Number(state.active) || 0));
      const team = state.teams[idx] || [null, null, null, null];
      if (title) title.textContent = `Team ${idx + 1} / 5`;

      host.innerHTML = team.map((hid, slotIdx) => {
        const unit = hid ? getTeamUnit(hid) : null;
        const isLeader = slotIdx === 0;
        return `
          <button class="cp-team-slot ${isLeader ? 'is-leader' : ''}" type="button" data-team-slot="${slotIdx}" aria-label="${isLeader ? 'Leader slot' : 'Member slot'}">
            ${unit ? `
              <img class="cp-team-img" src="${esc(unit.mini)}" alt="${esc(unit.name)}">
              <div class="cp-mini-lv">Lv ${esc(unit.level)}</div>
              ${jewelIconSrcForElement(unit.element) ? `<img class="cp-hero-jewel" src="${esc(jewelIconSrcForElement(unit.element))}" alt="" aria-hidden="true">` : ``}
            ` : `<div class="cp-team-empty"></div>`}
          </button>
        `;
      }).join('');

      const leaderId = team[0];
      const leader = leaderId ? getTeamUnit(leaderId) : null;
      const memberSkills = team
        .map(id => id ? getTeamUnit(id) : null)
        .filter(Boolean)
        .map(u => `${esc(u.kind === 'monster' ? 'Monster' : 'Hero')} ${esc(u.name)} · ${esc(u.activeSkill?.name || '')} (CD ${esc(u.activeSkill?.cd ?? 0)})`);
      if (skill) {
        skill.innerHTML = leader ? `
          <div class="cp-setting-item" style="background: rgba(255,255,255,0.03);">
            <div class="cp-setting-label">${leader.kind === 'monster' ? 'Leader Passive Skill' : 'Leader Skill'}</div>
            <div class="cp-setting-help">${esc(leader.kind === 'monster' ? (leader.passiveSkill?.text || '') : (leader.leaderSkill?.text || ''))}</div>
          </div>
          <div class="cp-setting-item" style="margin-top:10px; background: rgba(255,255,255,0.03);">
            <div class="cp-setting-label">Team Skills</div>
            <div class="cp-setting-help">${memberSkills.length ? memberSkills.join('<br>') : '—'}</div>
          </div>
        ` : `
          <div class="cp-muted">Pick a leader to see team skills.</div>
        `;
      }

      host.querySelectorAll('[data-team-slot]').forEach(btn => {
        btn.addEventListener('click', () => {
          const slotIdx = Number(btn.getAttribute('data-team-slot'));
          const idx2 = Math.max(0, Math.min(4, Number(state.active) || 0));
          const team2 = state.teams[idx2] || [null, null, null, null];

          showPickTeamUnitModal({
            title: slotIdx === 0 ? 'Pick Leader' : 'Pick Unit',
            allowHeroIds: ownedHeroIds,
            allowMonsterIds: allowedMonsterIds,
            onPick: (slotKey) => {
              const picked = teamSlotKey(String(slotKey || '')[0] === 'M' ? 'monster' : 'hero', String(slotKey || '').slice(1));
              const id = picked || null;
              if (!id) return;
              // Prevent duplicates in the same team
              if (team2.includes(id)) return;
              const nextState = loadTeams();
              nextState.active = idx2;
              nextState.teams[idx2][slotIdx] = id;
              state = nextState;
              saveTeams(state);
              render();
            },
            onClear: () => {
              const nextState = loadTeams();
              nextState.active = idx2;
              nextState.teams[idx2][slotIdx] = null;
              // If clearing leader, clear whole team
              if (slotIdx === 0) nextState.teams[idx2] = [null, null, null, null];
              state = nextState;
              saveTeams(state);
              render();
            }
          });
        }, { passive: true });
      });
    };

    const go = (delta) => {
      const idx = Math.max(0, Math.min(4, Number(state.active) || 0));
      const nextIdx = (idx + delta + 5) % 5;
      state.active = nextIdx;
      saveTeams(state);
      render();
    };

    if (prev) prev.addEventListener('click', () => go(-1), { passive: true });
    if (next) next.addEventListener('click', () => go(1), { passive: true });

    render();
  };

  // ----------------------------
  // Storage (inventory) - 20 slots, stack same items
  // ----------------------------
  const STORAGE_SLOT_COUNT = 20;
  const STORAGE_KEY = 'chessPalStorage';
  const FREE_SILVER_CLAIM_KEY = 'chessPalFreeSilverClaimDate';

  const STORAGE_ITEM_DEFS = {
    // Prefer numbered asset filenames; keep fallback variants for older filenames.
    silver_coin: { id: 'silver_coin', name: 'Silver Coin', img: 'images/Storage/S002-Silver-Coin.png' },
    // You mentioned Gold/Silver both have S001 prefix; we try multiple names via fallback.
    gold_coin: { id: 'gold_coin', name: 'Gold Coin', img: 'images/Storage/S001-Gold-Coin.png' },
    exp_pawn: { id: 'exp_pawn', name: 'EXP Pawn', img: 'images/Storage/S003-Exp-Pawn.png' },
    exp_knight: { id: 'exp_knight', name: 'EXP Knight', img: 'images/Storage/S004-Exp-Knight.png' },
    exp_bishop: { id: 'exp_bishop', name: 'EXP Bishop', img: 'images/Storage/S005-Exp-Bishop.png' },
  };

  function getStorageItemDef(itemId) {
    const key = String(itemId || '').trim().toLowerCase();
    return STORAGE_ITEM_DEFS[key] || null;
  }

  function getStorageImgFallbacks(primarySrc) {
    const src = String(primarySrc || '').trim();
    if (!src) return [];
    // Try common legacy variants
    const base = src.replace(/^images\/Storage\//, '');
    const legacy = [];
    if (base.includes('S002-Silver-Coin') || base.includes('S001-Silver-Coin')) legacy.push('images/Storage/Silver-Coin.png');
    if (base.includes('S001-Gold-Coin') || base.includes('S002-Gold-Coin')) legacy.push('images/Storage/Gold-Coin.png');
    if (base.includes('S003-Exp-Pawn') || base.includes('S002-Exp-Pawn') || base.includes('S001-Exp-Pawn')) {
      legacy.push('images/Storage/Exp-Pawn.png');
    }
    // Also try other numbered variants (in case you used different indices)
    if (base.includes('Gold-Coin')) {
      legacy.unshift('images/Storage/S002-Gold-Coin.png');
    }
    if (base.includes('Silver-Coin')) {
      legacy.unshift('images/Storage/S001-Silver-Coin.png');
      legacy.unshift('images/Storage/S002-Silver-Coin.png');
    }
    if (base.includes('Exp-Pawn')) {
      legacy.unshift('images/Storage/S003-Exp-Pawn.png');
      legacy.unshift('images/Storage/S002-Exp-Pawn.png');
      legacy.unshift('images/Storage/S001-Exp-Pawn.png');
    }
    if (base.includes('Exp-Knight')) {
      legacy.push('images/Storage/Exp-Knight.png');
      legacy.unshift('images/Storage/S005-Exp-Knight.png');
      legacy.unshift('images/Storage/S004-Exp-Knight.png');
    }
    if (base.includes('Exp-Bishop')) {
      legacy.push('images/Storage/Exp-Bishop.png');
      legacy.unshift('images/Storage/S006-Exp-Bishop.png');
      legacy.unshift('images/Storage/S005-Exp-Bishop.png');
    }
    // Legacy soldier naming (older builds)
    if (base.includes('Exp-Soldier')) {
      legacy.push('images/Storage/Exp-Soldier.png');
      legacy.unshift('images/Storage/S003-Exp-Soldier.png');
      legacy.unshift('images/Storage/S002-Exp-Soldier.png');
    }
    return legacy;
  }

  function renderImgWithFallback(src, alt, cls) {
    const s = String(src || '').trim();
    const a = String(alt || '').trim() || '';
    const c = String(cls || '').trim() || '';
    const fallbacks = getStorageImgFallbacks(s);
    // Inline fallback chain (safe, simple)
    // eslint-disable-next-line no-useless-escape
    let onerr = '';
    for (const fb of fallbacks) {
      onerr += `if(this.src.indexOf('${fb}')===-1){this.onerror=null;this.src='${fb}';return;}`;
    }
    return `<img class="${esc(c)}" src="${esc(s)}" alt="${esc(a)}" decoding="async" loading="lazy" ${onerr ? `onerror="${esc(onerr)}"` : ''}>`;
  }

  function normalizeStorageSlots(slots) {
    const out = Array.isArray(slots) ? slots.slice(0, STORAGE_SLOT_COUNT) : [];
    while (out.length < STORAGE_SLOT_COUNT) out.push(null);
    return out.map(s => {
      if (!s) return null;
      if (typeof s !== 'object') return null;
      const itemId = String(s.itemId || '').trim().toLowerCase();
      const name = String(s.name || '').trim();
      const qty = Math.max(1, Math.floor(Number(s.qty) || 1));
      if (!itemId) return null;
      if (itemId === 'potion') return null; // remove old test item
      // Legacy rename: exp_soldier -> exp_pawn
      if (itemId === 'exp_soldier') return { itemId: 'exp_pawn', name: name || 'EXP Pawn', qty };
      return { itemId, name: name || itemId, qty };
    });
  }

  function compactStorageSlots(slots) {
    const v = Array.isArray(slots) ? slots : [];
    const items = v.filter(s => s && typeof s === 'object');
    while (items.length < STORAGE_SLOT_COUNT) items.push(null);
    return items.slice(0, STORAGE_SLOT_COUNT);
  }

  function loadStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return normalizeStorageSlots([]);
      const v = JSON.parse(raw);
      return normalizeStorageSlots(v?.slots);
    } catch {
      return normalizeStorageSlots([]);
    }
  }

  function saveStorage(slots) {
    try {
      const normalized = normalizeStorageSlots(slots);
      const compacted = compactStorageSlots(normalized);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ slots: compacted }));
    } catch {}
    try {
      window.dispatchEvent(new Event('cpStorageChanged'));
    } catch {}
  }

  function addItemToStorage(slots, itemId, qty) {
    const id = String(itemId || '').trim().toLowerCase();
    if (!id) return slots;
    const count = Math.max(1, Math.floor(Number(qty) || 1));
    const def = getStorageItemDef(id);
    const name = def?.name || id;

    // Stack into existing slot first
    const idx = slots.findIndex(s => s && s.itemId === id);
    if (idx >= 0) {
      const next = slots.slice();
      next[idx] = { ...next[idx], name, qty: Math.max(1, (Number(next[idx].qty) || 1) + count) };
      return next;
    }
    // Otherwise put into first empty slot
    const empty = slots.findIndex(s => !s);
    if (empty >= 0) {
      const next = slots.slice();
      next[empty] = { itemId: id, name, qty: count };
      return next;
    }
    return slots; // full
  }

  function localDateKey(d) {
    const x = d instanceof Date ? d : new Date();
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function canClaimFreeSilverToday() {
    try {
      const last = String(localStorage.getItem(FREE_SILVER_CLAIM_KEY) || '').trim();
      const today = localDateKey(new Date());
      return last !== today;
    } catch {
      return true;
    }
  }

  function markClaimedFreeSilverToday() {
    try {
      localStorage.setItem(FREE_SILVER_CLAIM_KEY, localDateKey(new Date()));
    } catch {}
  }

  function swapOrStackSlots(slots, fromIdx, toIdx) {
    const a = slots[fromIdx] || null;
    const b = slots[toIdx] || null;
    if (!a && !b) return slots;
    const next = slots.slice();
    if (a && b && a.itemId === b.itemId) {
      next[toIdx] = { ...b, qty: (Number(b.qty) || 1) + (Number(a.qty) || 1) };
      next[fromIdx] = null;
      return next;
    }
    next[fromIdx] = b;
    next[toIdx] = a;
    return next;
  }

  function StoragePage() {}
  StoragePage.title = 'Storage';
  StoragePage.render = () => {
    return `
      <div class="cp-page-card">
        <div class="cp-h1">Storage</div>
        
        <div class="cp-storage-grid" id="cpStorageGrid" style="margin-top:12px;"></div>
      </div>
    `;
  };
  StoragePage.init = () => {
    const host = document.getElementById('cpStorageGrid');
    if (!host) return;

    let slots = loadStorage();
    // persist cleanup (e.g. remove potion) + update coins bar
    saveStorage(slots);
    let selectedIdx = -1;

    const render = () => {
      host.innerHTML = slots.map((s, i) => {
        const isSel = i === selectedIdx;
        const title = s ? `${s.name} ×${s.qty}` : `Empty (Slot ${i + 1})`;
        const def = s ? getStorageItemDef(s.itemId) : null;
        return `
          <button class="cp-storage-slot ${isSel ? 'is-selected' : ''} ${s ? 'has-item' : ''}" type="button" data-slot="${i}" aria-label="${esc(title)}">
            ${s ? `
              ${def?.img ? `<img class="cp-storage-slot-img" src="${esc(def.img)}" alt="${esc(def.name || s.name || s.itemId)}">` : ''}
              <div class="cp-storage-name">${esc(def?.name || s.name)}</div>
              <div class="cp-storage-qtybadge">×${esc(s.qty)}</div>
            ` : `
              <div class="cp-storage-empty"></div>
            `}
          </button>
        `;
      }).join('');
    };

    const persist = () => {
      // Keep UI compacted too (not just storage save)
      slots = compactStorageSlots(normalizeStorageSlots(slots));
      saveStorage(slots);
    };
    const refresh = () => { persist(); render(); };

    // Start in compacted order
    slots = compactStorageSlots(normalizeStorageSlots(slots));
    render();

    host.querySelectorAll('[data-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-slot'));
        if (!Number.isFinite(idx)) return;

        // If selecting a source slot for move/stack/swap
        if (selectedIdx >= 0 && selectedIdx !== idx) {
          slots = swapOrStackSlots(slots, selectedIdx, idx);
          selectedIdx = -1;
          refresh();
          return;
        }

        // Toggle selection if clicking same slot with item
        const slot = slots[idx] || null;
        if (slot) {
          // Use item (UI first): EXP Pawn (legacy: exp_soldier)
          const slotId = String(slot.itemId || '').toLowerCase();
          const expDefs = {
            exp_pawn: { label: 'EXP Pawn', exp: 500 },
            exp_soldier: { label: 'EXP Pawn', exp: 500 },
            exp_knight: { label: 'EXP Knight', exp: 1500 },
            exp_bishop: { label: 'EXP Bishop', exp: 2500 },
          };
          if (expDefs[slotId]) {
            const owned = isAdminMode() ? new Set(getAllHeroes().map(h => h.id)) : getOwnedHeroSet();
            const ids = Array.from(owned);
            showPickHeroModal({
              title: `Use ${expDefs[slotId].label}`,
              allowIds: ids,
              onPick: (heroId) => {
                // Consume 1 item
                const q = Math.max(1, Math.floor(Number(slot.qty) || 1));
                slots[idx] = (q <= 1) ? null : { ...slot, qty: q - 1 };
                saveStorage(slots);
                // Add small EXP
                addHeroExp(heroId, expDefs[slotId].exp);
                try { Router.renderCurrent(); } catch {}
                const hero = getAllHeroes().find(h => h.id === String(heroId || ''));
                if (hero) showHeroModal(hero);
              },
              onClear: () => {}
            });
            return;
          }

          if (selectedIdx === idx) {
            selectedIdx = -1;
            refresh();
            return;
          }
          selectedIdx = idx;
          refresh();
          return;
        }
      }, { passive: true });
    });
  };

  function ShopPage() {}
  ShopPage.title = 'Shop';
  ShopPage.render = () => {
    return `
      <div class="cp-square-grid" aria-label="Shop">
        <button class="cp-square-tile" type="button" data-cp-shop="get-coins" aria-label="Get Coins">
          ${renderImgWithFallback('images/Storage/S002-Silver-Coin.png', 'Get Coins', 'cp-square-img')}
          <div class="cp-square-label">Get Coins</div>
        </button>
        <button class="cp-square-tile" type="button" data-cp-shop="mall" aria-label="Mall">
          ${renderImgWithFallback('images/Storage/S001-Gold-Coin.png', 'Mall', 'cp-square-img')}
          <div class="cp-square-label">Mall</div>
        </button>
      </div>
    `;
  };
  ShopPage.init = () => {
    document.querySelectorAll('[data-cp-shop]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = String(btn.getAttribute('data-cp-shop') || '');
        if (key === 'mall') Router.goTo('/shop/mall');
        else Router.goTo('/shop/get-coins');
      }, { passive: true });
    });
  };

  function ShopGetCoinsPage() {}
  ShopGetCoinsPage.title = 'Get Coins';
  ShopGetCoinsPage.render = () => {
    const canClaim = canClaimFreeSilverToday();
    return `
      <div>
        <div class="cp-square-grid" aria-label="Get Coins rewards">
          <button class="cp-square-tile" type="button" id="cpClaimFreeSilver" ${canClaim ? '' : 'disabled'} aria-label="Free Coin Today">
            ${renderImgWithFallback('images/Storage/S002-Silver-Coin.png', 'Free Coin Today', 'cp-square-img')}
            <div class="cp-square-label">${canClaim ? 'Free Coin Today' : 'Claimed Today'}</div>
          </button>
          <button class="cp-square-tile" type="button" id="cpRewardChesscom" aria-label="Chess.com game play">
            ${renderImgWithFallback('images/Mode/Practice/Map/Map001-Grassland.jpg', 'Chess.com game play', 'cp-square-img')}
            <div class="cp-square-label">Chess.com game play</div>
          </button>
          <button class="cp-square-tile" type="button" id="cpRewardPuzzle" aria-label="Puzzle Reward">
            ${renderImgWithFallback('images/Storage/S003-Exp-Pawn.png', 'Puzzle Reward', 'cp-square-img')}
            <div class="cp-square-label">Puzzle Reward</div>
          </button>
          <button class="cp-square-tile" type="button" id="cpBackShop" aria-label="Back">
            ${renderImgWithFallback('images/Storage/S001-Gold-Coin.png', 'Back', 'cp-square-img')}
            <div class="cp-square-label">Back</div>
          </button>
        </div>
        <div class="cp-muted" id="cpClaimMsg" style="margin-top:12px;"></div>
      </div>
    `;
  };
  ShopGetCoinsPage.init = () => {
    const msg = document.getElementById('cpClaimMsg');
    const setMsg = (t) => { if (msg) msg.textContent = String(t || ''); };
    document.getElementById('cpBackShop')?.addEventListener('click', () => Router.goTo('/shop'), { passive: true });
    document.getElementById('cpClaimFreeSilver')?.addEventListener('click', () => {
      try {
        setMsg('');
        if (!canClaimFreeSilverToday()) {
          setMsg('Already claimed today.');
          return;
        }
        let slots = loadStorage();
        const before = JSON.stringify(slots);
        slots = addItemToStorage(slots, 'silver_coin', 10);
        if (JSON.stringify(slots) === before) {
          setMsg('Storage is full.');
          return;
        }
        saveStorage(slots);
        markClaimedFreeSilverToday();
        setMsg('Received 10 Silver Coins.');
        try { Router.renderCurrent(); } catch {}
      } catch (e) {
        setMsg(String(e?.message || e || 'Failed'));
      }
    }, { passive: true });

    document.getElementById('cpRewardChesscom')?.addEventListener('click', () => {
      setMsg('Reward #2 is coming soon.');
    }, { passive: true });
    document.getElementById('cpRewardPuzzle')?.addEventListener('click', () => {
      setMsg('Reward #3 is coming soon.');
    }, { passive: true });
  };

  function ShopMallPage() {}
  ShopMallPage.title = 'Mall';
  ShopMallPage.render = () => {
    return `
      <div class="cp-page-card">
        <div class="cp-h1">Mall</div>
        <div class="cp-mall-grid" style="margin-top:12px;">
          <div class="cp-mall-item">
            <div class="cp-mall-icon">
              ${renderImgWithFallback('images/Storage/S003-Exp-Pawn.png', 'EXP Pawn', '')}
            </div>
            <div class="cp-mall-meta">
              <div class="cp-setting-label">EXP Pawn</div>
              <div class="cp-setting-help">Gives a small amount of EXP to one hero.</div>
              <div class="cp-mall-price" aria-label="Price">
                ${renderImgWithFallback('images/Storage/S002-Silver-Coin.png', 'Silver coin', 'cp-mall-coin')}
                <span class="cp-mall-x">×5</span>
              </div>
            </div>
            <button class="cp-primary" type="button" id="cpBuyExpSoldier">Buy</button>
          </div>

          <div class="cp-mall-item">
            <div class="cp-mall-icon">
              ${renderImgWithFallback('images/Storage/S004-Exp-Knight.png', 'EXP Knight', '')}
            </div>
            <div class="cp-mall-meta">
              <div class="cp-setting-label">EXP Knight</div>
              <div class="cp-setting-help">Gives a medium amount of EXP to one hero.</div>
              <div class="cp-mall-price" aria-label="Price">
                ${renderImgWithFallback('images/Storage/S002-Silver-Coin.png', 'Silver coin', 'cp-mall-coin')}
                <span class="cp-mall-x">×15</span>
              </div>
            </div>
            <button class="cp-primary" type="button" id="cpBuyExpKnight">Buy</button>
          </div>

          <div class="cp-mall-item">
            <div class="cp-mall-icon">
              ${renderImgWithFallback('images/Storage/S005-Exp-Bishop.png', 'EXP Bishop', '')}
            </div>
            <div class="cp-mall-meta">
              <div class="cp-setting-label">EXP Bishop</div>
              <div class="cp-setting-help">Gives a large amount of EXP to one hero.</div>
              <div class="cp-mall-price" aria-label="Price">
                ${renderImgWithFallback('images/Storage/S002-Silver-Coin.png', 'Silver coin', 'cp-mall-coin')}
                <span class="cp-mall-x">×25</span>
              </div>
            </div>
            <button class="cp-primary" type="button" id="cpBuyExpBishop">Buy</button>
          </div>
        </div>
        <div class="cp-row" style="margin-top:12px;">
          <button class="cp-tool-btn" type="button" id="cpBackShop2">Back</button>
          <div class="cp-muted" id="cpMallMsg"></div>
        </div>
      </div>
    `;
  };
  ShopMallPage.init = () => {
    document.getElementById('cpBackShop2')?.addEventListener('click', () => Router.goTo('/shop'), { passive: true });
    const msg = document.getElementById('cpMallMsg');
    const setMsg = (t) => { if (msg) msg.textContent = String(t || ''); };
    const buy = (cost, itemId) => {
      try {
        setMsg('');
        let slots = loadStorage();
        const spent = spendFromStorage(slots, 'silver_coin', cost);
        if (!spent.ok) {
          setMsg('Not enough Silver Coins.');
          return;
        }
        slots = spent.slots;
        const before = JSON.stringify(slots);
        slots = addItemToStorage(slots, itemId, 1);
        if (JSON.stringify(slots) === before) {
          setMsg('Storage is full.');
          return;
        }
        saveStorage(slots);
        setMsg('Purchased.');
      } catch (e) {
        setMsg(String(e?.message || e || 'Purchase failed'));
      }
    };
    document.getElementById('cpBuyExpSoldier')?.addEventListener('click', () => buy(5, 'exp_pawn'), { passive: true });
    document.getElementById('cpBuyExpKnight')?.addEventListener('click', () => buy(15, 'exp_knight'), { passive: true });
    document.getElementById('cpBuyExpBishop')?.addEventListener('click', () => buy(25, 'exp_bishop'), { passive: true });
  };

  function spendFromStorage(slots, itemId, qty) {
    const id = String(itemId || '').trim().toLowerCase();
    const need = Math.max(1, Math.floor(Number(qty) || 1));
    const idx = slots.findIndex(s => s && String(s.itemId || '').toLowerCase() === id);
    if (idx < 0) return { ok: false, slots };
    const have = Math.max(0, Math.floor(Number(slots[idx].qty) || 0));
    if (have < need) return { ok: false, slots };
    const next = slots.slice();
    const left = have - need;
    next[idx] = left <= 0 ? null : { ...next[idx], qty: left };
    return { ok: true, slots: next };
  }

  function SummonPage() {}
  SummonPage.title = 'Summon';
  SummonPage.render = () => {
    const s = getGeneralSettings();
    return `
      <div class="cp-page-card cp-summon-page">
        <button class="cp-summon-main" type="button" id="cpSummonHero" aria-label="Summon Hero">
          <img class="cp-summon-mainimg" id="cpSummonBgImg" src="${esc(String(s.summonBg || ''))}" alt="Summon background" onerror="this.style.display='none';">
          <div class="cp-summon-overlay" aria-hidden="true">
            <div class="cp-summon-title">Summon Hero</div>
            <div class="cp-summon-cost" aria-label="Cost">
              <img class="cp-summon-coin" src="images/Storage/S001-Gold-Coin.png" alt="Gold coin" onerror="this.onerror=null;if(this.src.indexOf('S002-Gold-Coin.png')===-1){this.src='images/Storage/S002-Gold-Coin.png';return;}this.src='images/Storage/Gold-Coin.png';">
              <span class="cp-summon-x">× 1</span>
            </div>
          </div>
        </button>
        <div class="cp-muted" id="cpSummonMsg" style="margin-top:10px; text-align:center;"></div>
      </div>
    `;
  };
  SummonPage.init = () => {
    const msg = document.getElementById('cpSummonMsg');
    const bgImg = document.getElementById('cpSummonBgImg');
    const setMsg = (t) => { if (msg) msg.textContent = String(t || ''); };
    const syncSummonBg = () => {
      if (!bgImg) return;
      const s = getGeneralSettings();
      const src = String(s?.summonBg || '').trim();
      if (!src) return;
      if (bgImg.getAttribute('src') !== src) bgImg.setAttribute('src', src);
      bgImg.onerror = function() {
        const cur = String(this.getAttribute('src') || '');
        if (!cur) return;
        if (cur.endsWith('.png')) return;
        if (cur.endsWith('.jpg') || cur.endsWith('.jpeg') || cur.endsWith('.webp')) return;
        try {
          if (!this.dataset.try1) { this.dataset.try1 = '1'; this.src = `${cur}.png`; return; }
          if (!this.dataset.try2) { this.dataset.try2 = '1'; this.src = `${cur}.jpg`; return; }
          if (!this.dataset.try3) { this.dataset.try3 = '1'; this.src = `${cur}.webp`; return; }
        } catch {}
      };
    };
    syncSummonBg();
    try {
      if (window.__cpSummonBgListener) window.removeEventListener('cpGeneralSettingsChanged', window.__cpSummonBgListener);
    } catch {}
    window.__cpSummonBgListener = () => { try { syncSummonBg(); } catch {} };
    try { window.addEventListener('cpGeneralSettingsChanged', window.__cpSummonBgListener); } catch {}

    document.getElementById('cpSummonHero')?.addEventListener('click', async () => {
      try {
        setMsg('');
        let slots = loadStorage();
        const spent = spendFromStorage(slots, 'gold_coin', 1);
        if (!spent.ok) {
          setMsg('Not enough Gold Coins.');
          return;
        }
        slots = spent.slots;
        saveStorage(slots);

        await loadHeroOverrides();
        const all = getAllHeroes();
        // Summon from the full pool, weighted by rarity (higher ★ is rarer).
        // Weights are relative; within same rarity, heroes are equally likely.
        const rarityWeights = {
          1: 500,
          2: 260,
          3: 140,
          4: 80,
          5: 45,
          6: 22,
          7: 10,
          8: 4,
          9: 1,
          10: 0.2
        };
        const pool = all;
        const totalW = pool.reduce((sum, h) => sum + (Number(rarityWeights[Math.max(1, Math.min(10, Math.floor(Number(h?.rarity) || 1)))]) || 1), 0);
        let r = Math.random() * Math.max(0.0001, totalW);
        let pick = pool[0] || null;
        for (const h of pool) {
          const rr = Math.max(1, Math.min(10, Math.floor(Number(h?.rarity) || 1)));
          const w = Number(rarityWeights[rr]) || 1;
          r -= w;
          if (r <= 0) { pick = h; break; }
        }
        if (!pick) {
          setMsg('No heroes available.');
          return;
        }
        addOwnedHeroId(pick.id);
        setMsg(`Summoned: ${pick.name}`);
        showHeroModal(pick);
      } catch (e) {
        setMsg(String(e?.message || e || 'Summon failed'));
      }
    }, { passive: true });
  };

  function SettingsPage() {}
  SettingsPage.title = 'Setting';
  SettingsPage.render = () => {
    const s = getGeneralSettings();
    const admin = isAdminMode();
    return `
      <div class="cp-page-card">
        <div class="cp-h1">Setting</div>
        <div class="cp-muted">General Settings</div>

        <div class="cp-setting-grid" style="margin-top:12px;">
          <div class="cp-setting-item">
            <div class="cp-setting-label">Jewel Set</div>
            <div class="cp-setting-help">Choose a jewel art set (instant preview).</div>
            <select id="cpSettingJewelSet" class="cp-select">
              <option value="set_a" ${s.jewelSet === 'set_a' ? 'selected' : ''}>Set_A</option>
              <option value="none" ${s.jewelSet === 'none' ? 'selected' : ''}>No Style</option>
            </select>
            <div class="cp-setting-value"><span id="cpSettingJewelSetVal">${s.jewelSet === 'set_a' ? 'Set_A' : 'No Style'}</span></div>

            <div class="cp-jewel-preview" aria-label="Jewel preview">
              <div class="cp-jewel-preview-grid">
                <div class="pmf-cell pmf-fire" aria-label="Fire preview"></div>
                <div class="pmf-cell pmf-water" aria-label="Water preview"></div>
                <div class="pmf-cell pmf-wood" aria-label="Wood preview"></div>
                <div class="pmf-cell pmf-light" aria-label="Light preview"></div>
                <div class="pmf-cell pmf-dark" aria-label="Dark preview"></div>
                <div class="pmf-cell pmf-heart" aria-label="Heart preview"></div>
              </div>
            </div>
          </div>

          <div class="cp-setting-item">
            <div class="cp-setting-label">Piece</div>
            <div class="cp-setting-help">Choose the chess piece style (instant preview).</div>
            <select id="cpSettingPieceStyle" class="cp-select">
              <option value="none" ${s.pieceStyle === 'none' ? 'selected' : ''}>No Style</option>
              <option value="nyxblade" ${s.pieceStyle === 'nyxblade' ? 'selected' : ''}>Nyxblade</option>
              <option value="rivenhart" ${s.pieceStyle === 'rivenhart' ? 'selected' : ''}>Rivenhart</option>
              <option value="seraphix" ${s.pieceStyle === 'seraphix' ? 'selected' : ''}>Seraphix</option>
            </select>
            <div class="cp-setting-value"><span id="cpSettingPieceStyleVal">${s.pieceStyle === 'nyxblade' ? 'Nyxblade' : (s.pieceStyle === 'rivenhart' ? 'Rivenhart' : (s.pieceStyle === 'seraphix' ? 'Seraphix' : 'No Style'))}</span></div>

            <div class="cp-piece-preview" aria-label="Piece preview">
              <div class="cp-piece-preview-box">
                <img id="cpPiecePreviewImg" src="${s.pieceStyle === 'nyxblade' ? 'images/Piece/P001-nyxblade.png' : (s.pieceStyle === 'rivenhart' ? 'images/Piece/P002-Rivenhart.png' : (s.pieceStyle === 'seraphix' ? 'images/Piece/P003-Seraphix.png' : '/assets/pieces/white_Knight.png'))}" alt="Piece preview">
              </div>
            </div>
          </div>

          <div class="cp-setting-item">
            <div class="cp-setting-label">Jewel Glow</div>
            <div class="cp-setting-help">Adjust jewel base brightness (alpha).</div>
            <input id="cpSettingJewelAlpha" type="range" min="0.08" max="0.45" step="0.01" value="${String(s.jewelAlpha)}">
            <div class="cp-setting-value"><span id="cpSettingJewelAlphaVal">${Math.round(s.jewelAlpha * 100)}%</span></div>
          </div>

          <div class="cp-setting-item">
            <div class="cp-setting-label">App Background Color</div>
            <div class="cp-setting-help">The base background color for Chess Pal.</div>
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <input id="cpSettingAppBg" type="color" value="${String(s.appBg)}" style="width:60px; height:44px; padding:0; border:0; background:transparent;">
              <div class="cp-setting-value"><span id="cpSettingAppBgVal">${esc(s.appBg)}</span></div>
            </div>
          </div>

          ${admin ? `
            <div class="cp-setting-item">
              <div class="cp-setting-label">Admin · Practice Tuning</div>
              <div class="cp-setting-help">Tune streak multiplier and ATK/RCV scaling used for Practice combat.</div>

              <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top:10px;">
                <label class="cp-setting-help" style="display:block;">
                  Streak Multiplier (default 1.05)
                  <input class="cp-select" id="cpSettingStreakMult" type="number" step="0.01" min="1" max="1.3" value="${esc(String(s.streakMult ?? 1.05))}">
                </label>
                <label class="cp-setting-help" style="display:block;">
                  ATK Scale (default 0.10)
                  <input class="cp-select" id="cpSettingAtkScale" type="number" step="0.01" min="0" max="1" value="${esc(String(s.atkScale ?? 0.10))}">
                </label>
                <label class="cp-setting-help" style="display:block;">
                  RCV Scale (default 0.50)
                  <input class="cp-select" id="cpSettingRcvScale" type="number" step="0.05" min="0" max="2" value="${esc(String(s.rcvScale ?? 0.50))}">
                </label>
                <div class="cp-setting-help" style="opacity:0.8;">
                  ATK = hero.atk × elementScore × atkScale<br>
                  Heal = teamRCV × heartScore × rcvScale
                </div>
              </div>
            </div>

            <div class="cp-setting-item">
              <div class="cp-setting-label">Admin · Backgrounds</div>
              <div class="cp-setting-help">Change Practice and Summon background images (path relative to game/chess-pal/).</div>

              <div style="display:grid; grid-template-columns: 1fr; gap: 10px; margin-top:10px;">
                <label class="cp-setting-help" style="display:block;">
                  Practice Background
                  <input class="cp-select" id="cpSettingPracticeBg" type="text" value="${esc(String(s.practiceBg || ''))}">
                </label>
                <div class="cp-piece-preview" aria-label="Practice background preview">
                  <div class="cp-piece-preview-box" style="aspect-ratio: 16/9; width:100%;">
                    <img id="cpPracticeBgPreview" src="${esc(String(s.practiceBg || ''))}" alt="Practice background preview" style="object-fit:cover;">
                  </div>
                </div>

                <label class="cp-setting-help" style="display:block;">
                  Summon Background
                  <input class="cp-select" id="cpSettingSummonBg" type="text" value="${esc(String(s.summonBg || ''))}">
                </label>
                <div class="cp-piece-preview" aria-label="Summon background preview">
                  <div class="cp-piece-preview-box" style="aspect-ratio: 16/9; width:100%;">
                    <img id="cpSummonBgPreview" src="${esc(String(s.summonBg || ''))}" alt="Summon background preview" style="object-fit:cover;">
                  </div>
                </div>
              </div>
            </div>
          ` : ``}
        </div>
      </div>
    `;
  };
  SettingsPage.init = () => {
    const s0 = getGeneralSettings();
    const jewelSet = document.getElementById('cpSettingJewelSet');
    const jewelSetVal = document.getElementById('cpSettingJewelSetVal');
    const pieceStyle = document.getElementById('cpSettingPieceStyle');
    const pieceStyleVal = document.getElementById('cpSettingPieceStyleVal');
    const piecePreviewImg = document.getElementById('cpPiecePreviewImg');
    const alpha = document.getElementById('cpSettingJewelAlpha');
    const alphaVal = document.getElementById('cpSettingJewelAlphaVal');
    const bg = document.getElementById('cpSettingAppBg');
    const bgVal = document.getElementById('cpSettingAppBgVal');

    if (jewelSet) {
      jewelSet.value = String(s0.jewelSet || 'set_a');
      jewelSet.addEventListener('change', () => {
        const next = getGeneralSettings();
        const v = String(jewelSet.value || 'set_a').trim().toLowerCase();
        next.jewelSet = (v === 'none' || v === 'set_a') ? v : 'set_a';
        applyGeneralSettings(next);
        saveGeneralSettings(next);
        if (jewelSetVal) jewelSetVal.textContent = next.jewelSet === 'set_a' ? 'Set_A' : 'No Style';
      }, { passive: true });
    }

    if (alpha) {
      alpha.value = String(s0.jewelAlpha);
      alpha.addEventListener('input', () => {
        const next = getGeneralSettings();
        next.jewelAlpha = Math.max(0.08, Math.min(0.45, Number(alpha.value) || 0.22));
        applyGeneralSettings(next);
        saveGeneralSettings(next);
        if (alphaVal) alphaVal.textContent = `${Math.round(next.jewelAlpha * 100)}%`;
      }, { passive: true });
    }

    if (pieceStyle) {
      pieceStyle.value = String(s0.pieceStyle || 'none');
      const syncPreview = () => {
        if (!piecePreviewImg) return;
        const v = String(pieceStyle.value || 'none').trim().toLowerCase();
        piecePreviewImg.src = (v === 'nyxblade')
          ? 'images/Piece/P001-nyxblade.png'
          : (v === 'rivenhart')
            ? 'images/Piece/P002-Rivenhart.png'
            : (v === 'seraphix')
              ? 'images/Piece/P003-Seraphix.png'
              : '/assets/pieces/white_Knight.png';
      };
      syncPreview();
      pieceStyle.addEventListener('change', () => {
        const next = getGeneralSettings();
        const v = String(pieceStyle.value || 'none').trim().toLowerCase();
        next.pieceStyle = (v === 'nyxblade' || v === 'rivenhart' || v === 'seraphix' || v === 'none') ? v : 'none';
        applyGeneralSettings(next);
        saveGeneralSettings(next);
        if (pieceStyleVal) pieceStyleVal.textContent = next.pieceStyle === 'nyxblade'
          ? 'Nyxblade'
          : (next.pieceStyle === 'rivenhart'
            ? 'Rivenhart'
            : (next.pieceStyle === 'seraphix' ? 'Seraphix' : 'No Style'));
        syncPreview();
      }, { passive: true });
    }

    if (bg) {
      bg.value = String(s0.appBg);
      bg.addEventListener('input', () => {
        const next = getGeneralSettings();
        next.appBg = String(bg.value || '#060912');
        applyGeneralSettings(next);
        saveGeneralSettings(next);
        if (bgVal) bgVal.textContent = next.appBg;
      }, { passive: true });
    }

    // Admin tuning
    if (isAdminMode()) {
      const streakMult = document.getElementById('cpSettingStreakMult');
      const atkScale = document.getElementById('cpSettingAtkScale');
      const rcvScale = document.getElementById('cpSettingRcvScale');
      const practiceBg = document.getElementById('cpSettingPracticeBg');
      const summonBg = document.getElementById('cpSettingSummonBg');
      const practiceBgPrev = document.getElementById('cpPracticeBgPreview');
      const summonBgPrev = document.getElementById('cpSummonBgPreview');
      const applyNum = (key, raw, min, max) => {
        const next = getGeneralSettings();
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        next[key] = Math.max(min, Math.min(max, n));
        applyGeneralSettings(next);
        saveGeneralSettings(next);
      };
      streakMult?.addEventListener('change', () => applyNum('streakMult', streakMult.value, 1.0, 1.3), { passive: true });
      atkScale?.addEventListener('change', () => applyNum('atkScale', atkScale.value, 0, 1.0), { passive: true });
      rcvScale?.addEventListener('change', () => applyNum('rcvScale', rcvScale.value, 0, 2.0), { passive: true });

      const applyStr = (key, raw) => {
        const next = getGeneralSettings();
        next[key] = String(raw || '').trim();
        applyGeneralSettings(next);
        saveGeneralSettings(next);
      };
      practiceBg?.addEventListener('change', () => {
        applyStr('practiceBg', practiceBg.value);
        if (practiceBgPrev) practiceBgPrev.setAttribute('src', String(practiceBg.value || '').trim());
      }, { passive: true });
      summonBg?.addEventListener('change', () => {
        applyStr('summonBg', summonBg.value);
        if (summonBgPrev) summonBgPrev.setAttribute('src', String(summonBg.value || '').trim());
      }, { passive: true });
    }
  };

  return {
    routes: {
      '/home': HomePage,
      '/mode': ModePage,
      '/mode/story': ModeStoryPage,
      '/mode/story/ch1': StoryCh1Page,
      '/mode/story/ch1/s1': new StoryBattlePage(1, 1),
      '/mode/story/ch1/s2': new StoryBattlePage(1, 2),
      '/mode/story/ch1/s3': new StoryBattlePage(1, 3),
      '/mode/story/ch1/s4': new StoryBattlePage(1, 4),
      '/mode/story/ch1/s5': new StoryBattlePage(1, 5),
      '/mode/challenge': ModeChallengePage,
      '/practice': PracticePage,
      '/test-game': TestGamePage,
      '/team': TeamPage,
      '/pal': PalPage,
      '/heroes': HeroesPage,
      '/monsters': MonstersPage,
      '/storage': StoragePage,
      '/shop': ShopPage,
      '/shop/get-coins': ShopGetCoinsPage,
      '/shop/mall': ShopMallPage,
      '/summon': SummonPage,
      '/settings': SettingsPage,
    }
  };
})();

