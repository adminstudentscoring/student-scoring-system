// Page components for Chess Pal (iPad-first)

const ChessPalPages = (() => {
  const CHESS_PAL_CLOUD_KEYS = [
    'chessPalPreset',
    'chessPalChessComReward',
    'chessPalOwnedHeroes',
    'chessPalOwnedMonsters',
    'chessPalSeenMonsters',
    'chessPalStoryProgress',
    'chessPalPlayerProgress',
    'chessPalHeroProgress',
    'chessPalMonsterProgress',
    'chessPalTeams',
    'chessPalStorage',
    'chessPalFreeSilverClaimDate',
    'chessPalOnboarding',
  ];
  let cpCloudSyncReady = false;
  let cpCloudHydrating = false;
  let cpCloudSaveTimer = 0;
  let cpCloudLastSig = '';
  let cpCloudPendingDirty = false;
  const CHESS_PAL_CLOUD_LOCAL_TS_KEY = 'chessPalCloudLocalUpdatedAt';

  function exportChessPalCloudState() {
    const out = {};
    for (const k of CHESS_PAL_CLOUD_KEYS) {
      try {
        const v = localStorage.getItem(k);
        if (v != null) out[k] = String(v);
      } catch {}
    }
    return out;
  }

  function importChessPalCloudState(stateObj) {
    const src = (stateObj && typeof stateObj === 'object' && !Array.isArray(stateObj)) ? stateObj : {};
    for (const k of CHESS_PAL_CLOUD_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      const v = src[k];
      if (typeof v !== 'string') continue;
      try { localStorage.setItem(k, v); } catch {}
    }
  }

  async function saveChessPalCloudStateNow() {
    if (!cpCloudSyncReady || cpCloudHydrating) {
      cpCloudPendingDirty = true;
      return;
    }
    try {
      if (!window.authUtils || typeof window.authUtils.authenticatedFetch !== 'function') {
        cpCloudPendingDirty = true;
        return;
      }
      const state = exportChessPalCloudState();
      const sig = JSON.stringify(state);
      if (sig === cpCloudLastSig) {
        cpCloudPendingDirty = false;
        return;
      }
      const resp = await window.authUtils.authenticatedFetch('/chess-pal/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state })
      });
      if (resp && resp.ok) {
        cpCloudLastSig = sig;
        cpCloudPendingDirty = false;
        try { localStorage.setItem(CHESS_PAL_CLOUD_LOCAL_TS_KEY, String(Date.now())); } catch {}
      } else {
        cpCloudPendingDirty = true;
        setTimeout(() => { try { queueChessPalCloudSave(); } catch {} }, 1200);
      }
    } catch {
      cpCloudPendingDirty = true;
      setTimeout(() => { try { queueChessPalCloudSave(); } catch {} }, 1200);
    }
  }

  function queueChessPalCloudSave() {
    cpCloudPendingDirty = true;
    if (!cpCloudSyncReady || cpCloudHydrating) return;
    try { clearTimeout(cpCloudSaveTimer); } catch {}
    cpCloudSaveTimer = setTimeout(() => { saveChessPalCloudStateNow(); }, 520);
  }

  async function initChessPalCloudStateSync() {
    try {
      if (!window.authUtils || typeof window.authUtils.authenticatedFetch !== 'function') return;
      cpCloudHydrating = true;
      const localStateBefore = exportChessPalCloudState();
      const localHasData = Object.keys(localStateBefore).length > 0;
      let localTs = 0;
      try { localTs = Math.max(0, Number(localStorage.getItem(CHESS_PAL_CLOUD_LOCAL_TS_KEY)) || 0); } catch {}

      const resp = await window.authUtils.authenticatedFetch('/chess-pal/state', { method: 'GET' });
      if (resp && resp.ok) {
        const data = await resp.json();
        const cloudState = (data && typeof data.state === 'object' && !Array.isArray(data.state)) ? data.state : {};
        const cloudHasData = Object.keys(cloudState).length > 0;
        const cloudTs = Math.max(0, Number(data?.updatedAt) || 0);
        // Keep newer progress when cloud/local differ:
        // - if cloud has newer/equal timestamp, use cloud
        // - if local has data and is newer (or cloud empty), push local to cloud
        if (cloudHasData && (!localHasData || cloudTs >= localTs)) {
          importChessPalCloudState(cloudState);
        } else if (localHasData) {
          await window.authUtils.authenticatedFetch('/chess-pal/state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: localStateBefore })
          });
          try { localStorage.setItem(CHESS_PAL_CLOUD_LOCAL_TS_KEY, String(Date.now())); } catch {}
        }
      }
      try { applyGeneralSettings(getGeneralSettings()); } catch {}
      try { await syncChessPalGlobalConfigFromServer(); } catch {}
      try { await syncStoryStagesFromServer(); } catch {}
      cpCloudLastSig = JSON.stringify(exportChessPalCloudState());
      cpCloudSyncReady = true;
      cpCloudHydrating = false;
      if (cpCloudPendingDirty) queueChessPalCloudSave();
      setTimeout(() => {
        try {
          if (window.Router && typeof window.Router.renderCurrent === 'function') window.Router.renderCurrent();
        } catch {}
      }, 0);
    } catch {
      cpCloudHydrating = false;
    }
  }

  function patchLocalStorageForCloudSync() {
    try {
      if (window.__cpCloudStoragePatched) return;
      const originalSetItem = localStorage.setItem.bind(localStorage);
      const originalRemoveItem = localStorage.removeItem.bind(localStorage);
      localStorage.setItem = function patchedSetItem(key, value) {
        const ret = originalSetItem(key, value);
        try {
          const k = String(key || '').trim();
          if (CHESS_PAL_CLOUD_KEYS.includes(k)) {
            cpCloudPendingDirty = true;
            queueChessPalCloudSave();
          }
        } catch {}
        return ret;
      };
      localStorage.removeItem = function patchedRemoveItem(key) {
        const ret = originalRemoveItem(key);
        try {
          const k = String(key || '').trim();
          if (CHESS_PAL_CLOUD_KEYS.includes(k)) {
            cpCloudPendingDirty = true;
            queueChessPalCloudSave();
          }
        } catch {}
        return ret;
      };
      window.__cpCloudStoragePatched = true;
    } catch {}
  }

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
    try { window.dispatchEvent(new Event('cpPresetChanged')); } catch {}
  }

  function getGeneralSettings() {
    const base = {
      jewelAlpha: 0.22,
      appBg: '#060912',
      jewelSet: 'set_a',
      pieceStyle: 'none',
      // Backgrounds
      practiceBg: 'images/Mode/Practice/Map/Map001-Grassland.jpg',
      summonBg: 'images/Summon/Su001-Summon-Hero.jpg',
      // Admit tuning (global combat math)
      streakMult: 1.05,
      atkScale: 0.10,
      rcvScale: 0.50,
      cascadeScale: 1.0,
      heartOrbHealBonusPct: 0.01
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
      const cascadeScaleRaw = Number(v?.cascadeScale);
      const heartOrbHealBonusPctRaw = Number(v?.heartOrbHealBonusPct);
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
        rcvScale: Number.isFinite(rcvScaleRaw) ? Math.max(0, Math.min(2.0, rcvScaleRaw)) : base.rcvScale,
        cascadeScale: Number.isFinite(cascadeScaleRaw) ? Math.max(0.2, Math.min(3.0, cascadeScaleRaw)) : base.cascadeScale,
        heartOrbHealBonusPct: Number.isFinite(heartOrbHealBonusPctRaw) ? Math.max(0, Math.min(0.1, heartOrbHealBonusPctRaw)) : base.heartOrbHealBonusPct
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
    try { window.dispatchEvent(new Event('cpGeneralSettingsSaved')); } catch {}
    if (isAdminMode()) {
      saveChessPalGlobalConfigToServer({ generalSettings: s }).catch(() => {});
    }
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

  // Cloud sync listeners (DB-backed, per logged-in user)
  [
    'cpPresetChanged',
    'cpGeneralSettingsSaved',
    'cpOwnedHeroesChanged',
    'cpOwnedMonstersChanged',
    'cpSeenMonstersChanged',
    'cpStoryProgressChanged',
    'cpPlayerProgressChanged',
    'cpHeroProgressChanged',
    'cpMonsterProgressChanged',
    'cpTeamsChanged',
    'cpStorageChanged',
    'cpMallConfigChanged',
    'cpSummonConfigChanged',
  ].forEach((evName) => {
    try { window.addEventListener(evName, queueChessPalCloudSave); } catch {}
  });
  try { patchLocalStorageForCloudSync(); } catch {}
  try { initChessPalCloudStateSync(); } catch {}

  async function syncChessPalGlobalConfigFromServer() {
    try {
      if (!window.authUtils || typeof window.authUtils.authenticatedFetch !== 'function') return;
      const resp = await window.authUtils.authenticatedFetch('/chess-pal/global-config', { method: 'GET' });
      if (!resp || !resp.ok) return;
      const data = await resp.json();
      const generalSettings = (data && data.generalSettings && typeof data.generalSettings === 'object' && !Array.isArray(data.generalSettings)) ? data.generalSettings : null;
      const summonConfig = (data && data.summonConfig && typeof data.summonConfig === 'object' && !Array.isArray(data.summonConfig)) ? data.summonConfig : null;
      const mallConfig = (data && data.mallConfig && typeof data.mallConfig === 'object' && !Array.isArray(data.mallConfig)) ? data.mallConfig : null;
      const eventGoldStages = (data && data.eventGoldStages && typeof data.eventGoldStages === 'object' && !Array.isArray(data.eventGoldStages)) ? data.eventGoldStages : null;
      if (generalSettings) {
        try { localStorage.setItem('chessPalGeneralSettings', JSON.stringify(generalSettings)); } catch {}
      }
      if (summonConfig) {
        try { localStorage.setItem('chessPalSummonConfig', JSON.stringify(summonConfig)); } catch {}
      }
      if (mallConfig) {
        try { localStorage.setItem('chessPalMallConfig', JSON.stringify(mallConfig)); } catch {}
      }
      if (eventGoldStages) {
        try { localStorage.setItem('chessPalEventGoldStages', JSON.stringify(eventGoldStages)); } catch {}
      }
      try { applyGeneralSettings(getGeneralSettings()); } catch {}
      try { window.dispatchEvent(new Event('cpSummonConfigChanged')); } catch {}
      try { window.dispatchEvent(new Event('cpMallConfigChanged')); } catch {}
      try { window.dispatchEvent(new Event('cpEventGoldStagesChanged')); } catch {}
    } catch {}
  }

  async function saveChessPalGlobalConfigToServer(patchLike) {
    if (!isAdminMode()) return;
    if (!window.authUtils || typeof window.authUtils.authenticatedFetch !== 'function') return;
    const patch = (patchLike && typeof patchLike === 'object' && !Array.isArray(patchLike)) ? patchLike : {};
    const resp = await window.authUtils.authenticatedFetch('/admin/chess-pal/global-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!resp || !resp.ok) {
      let msg = 'Failed to save global config.';
      try {
        const err = await resp?.json?.();
        if (err && typeof err.error === 'string' && err.error.trim()) msg = err.error.trim();
      } catch {}
      throw new Error(msg);
    }
    return resp.json().catch(() => ({}));
  }

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
    if (!key) return { added: false, duplicate: false, expGained: 0 };
    const set = getOwnedHeroSet();
    const existed = set.has(key);
    set.add(key);
    setOwnedHeroSet(set);
    if (existed) {
      const hero = getAllHeroes().find(h => String(h?.id || '').trim() === key) || null;
      const rarity = Math.max(1, Math.min(10, Math.floor(Number(hero?.rarity) || 1)));
      const exp = Math.max(10, Math.floor(120 + rarity * 60));
      try { addHeroExp(key, exp); } catch {}
      return { added: false, duplicate: true, expGained: exp };
    }
    return { added: true, duplicate: false, expGained: 0 };
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
    if (!key) return { added: false, duplicate: false, expGained: 0 };
    const set = getOwnedMonsterSet();
    const existed = set.has(key);
    set.add(key);
    setOwnedMonsterSet(set);
    if (existed) {
      const mon = getAllMonsters().find(m => String(m?.id || '').trim() === key) || null;
      const rarity = Math.max(1, Math.min(10, Math.floor(Number(mon?.rarity) || 1)));
      const exp = Math.max(10, Math.floor(110 + rarity * 55));
      try { addMonsterExp(key, exp); } catch {}
      return { added: false, duplicate: true, expGained: exp };
    }
    return { added: true, duplicate: false, expGained: 0 };
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

  function markStoryMonstersSeen(stageCfgLike) {
    try {
      const st = stageCfgLike && typeof stageCfgLike === 'object' ? stageCfgLike : {};
      const mons = normalizeStageMonsters(st);
      if (mons.length) {
        mons.forEach((mm) => {
          try {
            const rawId = String(mm?.monsterId || mm?.id || '').trim();
            const sid = rawId ? rawId.padStart(3, '0') : '';
            if (sid) addSeenMonsterId(sid);
          } catch {}
        });
      } else {
        const sid = st?.monsterId ? String(st.monsterId).trim().padStart(3, '0') : '';
        if (sid) addSeenMonsterId(sid);
      }
    } catch {}
  }

  // For future battle integration
  try { window.cpMarkMonsterSeen = addSeenMonsterId; } catch {}
  try { window.cpAddOwnedMonster = addOwnedMonsterId; } catch {}

  // ----------------------------
  // Story Mode stages (Admin can edit; UI-only for now)
  // Stored as: { "1": [{ monsters: [{monsterId, level, monsterDropChance, drops:[{itemId,chance,qty}]}...], hint, drops } x5], "2": ... }
  // Back-compat: older saves may store {monsterId, level, hint, drops} per stage.
  // ----------------------------
  const STORY_STAGES_KEY = 'chessPalStoryStages';
  const STORY_STAGES_UPDATED_AT_KEY = 'chessPalStoryStagesUpdatedAt';

  function normalizeStageMonsters(stageLike) {
    const raw = stageLike && typeof stageLike === 'object' ? stageLike : {};
    const normalizeDrops = (dropsLike) => {
      const arr = Array.isArray(dropsLike) ? dropsLike : [];
      return arr
        .map((d) => {
          const itemId = String(d?.itemId || '').trim().toLowerCase();
          const chance = Math.max(0, Math.min(100, Math.floor(Number(d?.chance) || 0)));
          const qtyRaw = Number(d?.qty);
          const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.min(999, Math.floor(qtyRaw))) : 1;
          return { itemId, chance, qty };
        })
        .filter((d) => d.itemId && d.chance > 0 && !!getStorageItemDef(d.itemId))
        .slice(0, 3);
    };
    const arr = Array.isArray(raw.monsters) ? raw.monsters : null;
    const list = (arr && arr.length)
      ? arr
      : [{ monsterId: raw.monsterId || '004', level: raw.level || 1 }];
    const out = list
      .map(x => ({
        monsterId: String(x?.monsterId || '004').trim().padStart(3, '0'),
        level: Math.max(1, Math.floor(Number(x?.level) || 1)),
        monsterDropChance: Math.max(0, Math.min(100, Math.floor(Number(x?.monsterDropChance ?? x?.captureChance) || 0))),
        skillFirstCd: Number.isFinite(Number(x?.skillFirstCd)) ? Math.max(0, Math.min(20, Math.floor(Number(x.skillFirstCd) || 0))) : null,
        skillCycleCd: Number.isFinite(Number(x?.skillCycleCd)) ? Math.max(0, Math.min(20, Math.floor(Number(x.skillCycleCd) || 0))) : null,
        drops: normalizeDrops(x?.drops),
      }))
      .filter(x => /^\d{3}$/.test(x.monsterId));
    return out.length ? out : [{ monsterId: '004', level: 1, monsterDropChance: 0, drops: [] }];
  }

  function defaultStoryStagesForChapter(chapterId) {
    const ch = Math.max(1, Math.min(10, Math.floor(Number(chapterId) || 1)));
    const stageDropChance = (stageIdx1) => (Math.max(1, Math.min(5, Math.floor(Number(stageIdx1) || 1))) >= 5 ? 50 : 10);
    // Sensible defaults (admin can overwrite any time)
    if (ch === 1) {
      return [
        { monsters: [{ monsterId: '017', level: 1, monsterDropChance: stageDropChance(1) }], hint: 'Match Dark, Wood, and Water to build control first.', drops: [] },
        { monsters: [{ monsterId: '018', level: 1, monsterDropChance: stageDropChance(2) }], hint: 'Attack colors are expanded. Build longer paths for bigger damage.', drops: [] },
        { monsters: [{ monsterId: '021', level: 2, monsterDropChance: stageDropChance(3) }], hint: 'Heart jewels are now available. Balance damage and recovery.', drops: [] },
        { monsters: [{ monsterId: '027', level: 2, monsterDropChance: stageDropChance(4) }], hint: 'Plan one turn ahead to prepare cascades before the boss.', drops: [] },
        { monsters: [{ monsterId: '004', level: 1, monsterDropChance: stageDropChance(5) }], hint: 'Boss Stage: Save skills and burst when your strongest color is ready.', drops: [] },
      ];
    }
    return [
      { monsters: [{ monsterId: '011', level: 1, monsterDropChance: stageDropChance(1) }], drops: [] },
      { monsters: [{ monsterId: '014', level: 1, monsterDropChance: stageDropChance(2) }], drops: [] },
      { monsters: [{ monsterId: '017', level: 1, monsterDropChance: stageDropChance(3) }], drops: [] },
      { monsters: [{ monsterId: '020', level: 1, monsterDropChance: stageDropChance(4) }], drops: [] },
      { monsters: [{ monsterId: '004', level: 1, monsterDropChance: stageDropChance(5) }], drops: [] },
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

  function getStoryStagesUpdatedAtLocal() {
    try { return Math.max(0, Number(localStorage.getItem(STORY_STAGES_UPDATED_AT_KEY)) || 0); } catch {}
    return 0;
  }

  function setStoryStagesUpdatedAtLocal(ts) {
    try { localStorage.setItem(STORY_STAGES_UPDATED_AT_KEY, String(Math.max(0, Math.floor(Number(ts) || 0)))); } catch {}
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

  const EVENT_GOLD_STAGES_KEY = 'chessPalEventGoldStages';
  const EVENT_GOLD_PROGRESS_KEY = 'chessPalEventGoldProgress';

  function defaultEventGoldStagesForChapter(chapterId) {
    const ch = Math.max(1, Math.min(3, Math.floor(Number(chapterId) || 1)));
    const idsByChapter = {
      1: ['017', '018', '021', '025', '029'],
      2: ['033', '037', '041', '045', '049'],
      3: ['050', '051', '052', '053', '054'],
    };
    const ids = idsByChapter[ch] || idsByChapter[1];
    return ids.map((id, idx) => ({
      monsters: [{ monsterId: id, level: Math.max(1, idx + 1), monsterDropChance: (idx === 4 ? 50 : 10), drops: [] }],
      hint: 'Fire / Water / Wood / Heart only.',
      drops: [],
    }));
  }

  function normalizeEventGoldStagesForChapter(stagesLike, chapterId) {
    const base = defaultEventGoldStagesForChapter(chapterId);
    const src = Array.isArray(stagesLike) ? stagesLike : [];
    return Array.from({ length: 5 }, (_, i) => {
      const st = src[i] || base[i] || base[0];
      const monsters = normalizeStageMonsters(st);
      const first = monsters[0] || { monsterId: '017', level: 1, monsterDropChance: 0, drops: [] };
      return {
        monsters,
        monsterId: first.monsterId,
        level: first.level,
        hint: String(st?.hint || 'Fire / Water / Wood / Heart only.'),
        drops: Array.isArray(st?.drops) ? st.drops : [],
      };
    });
  }

  function loadEventGoldStagesAll() {
    const out = {
      1: defaultEventGoldStagesForChapter(1),
      2: defaultEventGoldStagesForChapter(2),
      3: defaultEventGoldStagesForChapter(3),
    };
    let raw = null;
    try {
      const v = JSON.parse(localStorage.getItem(EVENT_GOLD_STAGES_KEY) || 'null');
      raw = (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
    } catch {}
    if (!raw) return out;
    const chaptersRaw = (raw.chapters && typeof raw.chapters === 'object' && !Array.isArray(raw.chapters)) ? raw.chapters : null;
    if (chaptersRaw) {
      out[1] = normalizeEventGoldStagesForChapter(chaptersRaw['1'], 1);
      out[2] = normalizeEventGoldStagesForChapter(chaptersRaw['2'], 2);
      out[3] = normalizeEventGoldStagesForChapter(chaptersRaw['3'], 3);
      return out;
    }
    // Migration from old 10-stage single-chapter format.
    const oldStages = Array.isArray(raw.stages) ? raw.stages : null;
    if (oldStages && oldStages.length) {
      out[1] = normalizeEventGoldStagesForChapter(oldStages.slice(0, 5), 1);
      out[2] = normalizeEventGoldStagesForChapter(oldStages.slice(5, 10), 2);
      out[3] = normalizeEventGoldStagesForChapter([], 3);
      return out;
    }
    return out;
  }

  function getEventGoldStagesForChapter(chapterId) {
    const ch = Math.max(1, Math.min(3, Math.floor(Number(chapterId) || 1)));
    const all = loadEventGoldStagesAll();
    return normalizeEventGoldStagesForChapter(all?.[ch], ch);
  }

  function saveEventGoldStagesForChapter(chapterId, stagesLike) {
    const ch = Math.max(1, Math.min(3, Math.floor(Number(chapterId) || 1)));
    const all = loadEventGoldStagesAll();
    all[ch] = normalizeEventGoldStagesForChapter(stagesLike, ch);
    const payload = { chapters: { '1': all[1], '2': all[2], '3': all[3] } };
    try { localStorage.setItem(EVENT_GOLD_STAGES_KEY, JSON.stringify(payload)); } catch {}
    try { window.dispatchEvent(new Event('cpEventGoldStagesChanged')); } catch {}
    if (isAdminMode()) saveChessPalGlobalConfigToServer({ eventGoldStages: payload }).catch(() => {});
  }

  function loadEventGoldProgressMap() {
    try {
      const raw = localStorage.getItem(EVENT_GOLD_PROGRESS_KEY);
      if (!raw) return { '1': 0, '2': 0, '3': 0 };
      const v = JSON.parse(raw);
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return {
          '1': Math.max(0, Math.min(5, Math.floor(Number(v?.['1']) || 0))),
          '2': Math.max(0, Math.min(5, Math.floor(Number(v?.['2']) || 0))),
          '3': Math.max(0, Math.min(5, Math.floor(Number(v?.['3']) || 0))),
        };
      }
      // Migration from old numeric progress (1..10)
      const n = Math.max(0, Math.min(15, Math.floor(Number(v) || 0)));
      return {
        '1': Math.max(0, Math.min(5, n)),
        '2': Math.max(0, Math.min(5, n - 5)),
        '3': Math.max(0, Math.min(5, n - 10)),
      };
    } catch {
      return { '1': 0, '2': 0, '3': 0 };
    }
  }

  function saveEventGoldProgressMap(mapLike) {
    const m = {
      '1': Math.max(0, Math.min(5, Math.floor(Number(mapLike?.['1']) || 0))),
      '2': Math.max(0, Math.min(5, Math.floor(Number(mapLike?.['2']) || 0))),
      '3': Math.max(0, Math.min(5, Math.floor(Number(mapLike?.['3']) || 0))),
    };
    try { localStorage.setItem(EVENT_GOLD_PROGRESS_KEY, JSON.stringify(m)); } catch {}
  }

  function getEventGoldClearedStage(chapterId) {
    const ch = String(Math.max(1, Math.min(3, Math.floor(Number(chapterId) || 1))));
    const m = loadEventGoldProgressMap();
    return Math.max(0, Math.min(5, Math.floor(Number(m?.[ch]) || 0)));
  }

  function isEventGoldChapterUnlocked(chapterId) {
    const ch = Math.max(1, Math.min(3, Math.floor(Number(chapterId) || 1)));
    if (ch <= 1) return true;
    return getEventGoldClearedStage(ch - 1) >= 5;
  }

  function markEventGoldStageCleared(chapterId, stageIdx1) {
    const ch = String(Math.max(1, Math.min(3, Math.floor(Number(chapterId) || 1))));
    const st = Math.max(1, Math.min(5, Math.floor(Number(stageIdx1) || 1)));
    const m = loadEventGoldProgressMap();
    const cur = Math.max(0, Math.min(5, Math.floor(Number(m?.[ch]) || 0)));
    if (st <= cur) return;
    m[ch] = st;
    saveEventGoldProgressMap(m);
  }

  function getEventGoldStageConfig(chapterId, stageIdx1) {
    const ch = Math.max(1, Math.min(3, Math.floor(Number(chapterId) || 1)));
    const st = Math.max(1, Math.min(5, Math.floor(Number(stageIdx1) || 1)));
    const stages = getEventGoldStagesForChapter(ch);
    const cfg = stages[st - 1] || { monsterId: '017', level: 1, hint: '', drops: [] };
    const monsters = normalizeStageMonsters(cfg);
    const first = monsters[0] || { monsterId: '017', level: 1, monsterDropChance: 0, drops: [] };
    return {
      mode: 'event_gold',
      chapter: ch,
      stage: st,
      monsters,
      monsterId: String(first.monsterId || '017').trim().padStart(3, '0'),
      monsterLevel: Math.max(1, Math.floor(Number(first.level) || 1)),
      hint: String(cfg.hint || '').trim(),
      drops: Array.isArray(cfg.drops) ? cfg.drops : [],
    };
  }

  async function syncStoryStagesFromServer() {
    try {
      if (!window.authUtils || typeof window.authUtils.authenticatedFetch !== 'function') return;
      const resp = await window.authUtils.authenticatedFetch('/chess-pal/story-stages', { method: 'GET' });
      if (!resp || !resp.ok) return;
      const data = await resp.json();
      const stages = (data && typeof data.stages === 'object' && !Array.isArray(data.stages)) ? data.stages : null;
      if (!stages) return;
      const serverTs = Math.max(0, Number(data?.updatedAt) || 0);
      const localTs = getStoryStagesUpdatedAtLocal();
      if (localTs > serverTs && localTs > 0) return;
      saveStoryStages(stages);
      setStoryStagesUpdatedAtLocal(serverTs || Date.now());
      try {
        if (window.Router && typeof window.Router.renderCurrent === 'function') window.Router.renderCurrent();
      } catch {}
    } catch {}
  }

  async function saveStoryStagesToServer(allStages) {
    if (!window.authUtils || typeof window.authUtils.authenticatedFetch !== 'function') {
      throw new Error('Authentication is not ready');
    }
    const payload = (allStages && typeof allStages === 'object' && !Array.isArray(allStages)) ? allStages : {};
    const resp = await window.authUtils.authenticatedFetch('/admin/chess-pal/story-stages', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stages: payload }),
    });
    if (!resp || !resp.ok) {
      let msg = 'Failed to save story stages on server';
      try {
        const err = await resp.json();
        if (err && typeof err.error === 'string' && err.error.trim()) msg = err.error.trim();
      } catch {}
      throw new Error(msg);
    }
    const data = await resp.json().catch(() => ({}));
    const stages = (data && typeof data.stages === 'object' && !Array.isArray(data.stages)) ? data.stages : payload;
    const updatedAt = Math.max(0, Number(data?.updatedAt) || Date.now());
    return { stages, updatedAt };
  }

  function showAdminEditStoryStagesModal(chapterId, opts = null) {
    if (!isAdminMode()) return;
    const ch = Math.max(1, Math.min(10, Math.floor(Number(chapterId) || 1)));
    const custom = (opts && typeof opts === 'object' && !Array.isArray(opts)) ? opts : {};
    const stageCount = Math.max(1, Math.min(20, Math.floor(Number(custom.stageCount) || 5)));
    const currentRaw = (typeof custom.getStages === 'function') ? custom.getStages() : getStoryStagesForChapter(ch);
    const current = Array.isArray(currentRaw) ? currentRaw : getStoryStagesForChapter(ch);
    const modalTitle = String(custom.modalTitle || `Edit stages · Chapter ${ch}`);
    const modalDesc = String(custom.modalDesc || 'Pick Monster and Level for each stage. Stage 5 is always labeled Boss Stage.');
    const stageLabel = (typeof custom.stageLabel === 'function')
      ? custom.stageLabel
      : ((i) => (i === 4 ? `Stage ${i + 1} · Boss Stage` : `Stage ${i + 1}`));
    const onSaveStages = (typeof custom.onSaveStages === 'function')
      ? custom.onSaveStages
      : null;
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
    const getMonsterByStageId = (idLike) => {
      const sid = String(idLike || '').trim().padStart(3, '0');
      return allMonsters.find(x => String(x?.id || '').trim().padStart(3, '0') === sid) || null;
    };
    const getMonsterDefaultCycleCd = (idLike) => {
      const mon = getMonsterByStageId(idLike);
      return Math.max(1, Math.floor(Number(mon?.activeSkill?.cd) || 1));
    };
    const dropQtyPresetForItem = (itemIdLike) => (String(itemIdLike || '').trim().toLowerCase() === 'silver_coin' ? 5 : 1);
    const getMonsterSkillDescHtml = (idLike) => {
      const mon = getMonsterByStageId(idLike);
      if (!mon) return `<div class="cp-setting-help" style="margin-top:8px;">Skill: N/A</div>`;
      const activeName = String(mon?.activeSkill?.name || 'Active Skill');
      const activeText = String(mon?.activeSkill?.text || '').trim() || 'No active skill description.';
      const passiveName = String(mon?.passiveSkill?.name || 'Passive Skill');
      const passiveText = String(mon?.passiveSkill?.text || '').trim() || 'No passive skill description.';
      const activeCd = Math.max(0, Math.floor(Number(mon?.activeSkill?.cd) || 0));
      return `
        <div class="cp-setting-help" data-stage-mon-skilldesc style="margin-top:8px;">
          Active · ${esc(activeName)} (Base CD ${esc(String(activeCd))}): ${esc(activeText)}
          <br>Passive · ${esc(passiveName)}: ${esc(passiveText)}
        </div>
      `;
    };

    const old = document.getElementById('cpEditStagesOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cpEditStagesOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal cp-editstages-modal" role="dialog" aria-modal="true" aria-label="Edit stages">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-h1" style="font-size:18px;">${esc(modalTitle)}</div>
          <div class="cp-muted" style="margin-top:6px;">${esc(modalDesc)}</div>

          <div class="cp-editstages-list" style="margin-top:12px;">
            ${Array.from({ length: stageCount }, (_, i) => {
              const s = current[i] || { monsterId: '004', level: 1, monsters: null, drops: [] };
              const label = String(stageLabel(i, stageCount) || `Stage ${i + 1}`);
              const mons0 = normalizeStageMonsters(s);
              return `
                <div class="cp-setting-item cp-editstages-stage">
                  <div class="cp-row" style="margin-top:0; justify-content:space-between; align-items:center;">
                    <div class="cp-setting-label">${esc(label)}</div>
                    <button class="cp-tool-btn" type="button" data-stage-toggle="${esc(String(i))}" aria-expanded="${i === 0 ? 'true' : 'false'}">${i === 0 ? 'Collapse' : 'Expand'}</button>
                  </div>
                  <div data-stage-body="${esc(String(i))}" style="${i === 0 ? '' : 'display:none;'}">
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
                      const monDrops = Array.isArray(mm?.drops) ? mm.drops : [];
                      const joinChance = Math.max(0, Math.min(100, Math.floor(Number(mm?.monsterDropChance) || 0)));
                      const firstCdPreset = Number.isFinite(Number(mm?.skillFirstCd)) ? Math.max(0, Math.floor(Number(mm.skillFirstCd) || 0)) : 0;
                      const cycleCdPreset = Number.isFinite(Number(mm?.skillCycleCd)) && Number(mm.skillCycleCd) > 0
                        ? Math.max(1, Math.floor(Number(mm.skillCycleCd) || 1))
                        : getMonsterDefaultCycleCd(mid);
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
                            <div class="cp-row" style="margin-top:8px; justify-content:space-between; align-items:center;">
                              <div class="cp-setting-help" style="margin:0;">Monster rewards</div>
                              <button class="cp-tool-btn" type="button" data-stage-mon-drops-toggle="${esc(String(i))}-${esc(String(k))}" aria-expanded="false">Expand rewards</button>
                            </div>
                            <div data-stage-mon-dropspanel="${esc(String(i))}-${esc(String(k))}" style="display:none; margin-top:8px; border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:10px; background:rgba(0,0,0,0.14);">
                              <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">Monster join chance %</div>
                              <input class="cp-input" type="number" min="0" max="100" step="1" value="${esc(String(joinChance))}" data-stage-mon-joinchance="${esc(String(i))}-${esc(String(k))}">
                              <div class="cp-setting-help" style="margin-top:10px;">Item drops (roll one item for this monster)</div>
                              <div style="display:grid; grid-template-columns: 1fr; gap:8px; margin-top:6px;">
                                ${Array.from({ length: 3 }, (_, j) => {
                                  const dj = monDrops[j] || {};
                                  const itemId = String(dj.itemId || '').trim().toLowerCase();
                                  const chance = Math.max(0, Math.floor(Number(dj.chance) || 0));
                                  const qty = Math.max(1, Math.floor(Number(dj.qty) || dropQtyPresetForItem(itemId)));
                                  return `
                                    <div class="cp-row" style="margin-top:0; gap:10px; align-items:center;">
                                      <div style="flex:1 1 auto; min-width: 210px;">
                                        <select class="cp-select" data-stage-mon-drop-item="${esc(String(i))}-${esc(String(k))}-${esc(String(j))}">
                                          ${itemOptions}
                                        </select>
                                      </div>
                                      <div style="width: 120px;">
                                        <input class="cp-input" type="number" min="0" max="100" step="1" value="${esc(String(chance))}" placeholder="Chance %" data-stage-mon-drop-chance="${esc(String(i))}-${esc(String(k))}-${esc(String(j))}">
                                      </div>
                                      <div style="width: 110px;">
                                        <input class="cp-input" type="number" min="1" max="999" step="1" value="${esc(String(qty))}" placeholder="Qty" data-stage-mon-drop-qty="${esc(String(i))}-${esc(String(k))}-${esc(String(j))}">
                                      </div>
                                    </div>
                                  `;
                                }).join('')}
                              </div>
                            </div>
                            <div class="cp-row" style="margin-top:8px; justify-content:space-between; align-items:center;">
                              <div class="cp-setting-help" style="margin:0;">Monster skills</div>
                              <button class="cp-tool-btn" type="button" data-stage-mon-skills-toggle="${esc(String(i))}-${esc(String(k))}" aria-expanded="false">Expand skills</button>
                            </div>
                            <div data-stage-mon-skillspanel="${esc(String(i))}-${esc(String(k))}" style="display:none; margin-top:8px; border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:10px; background:rgba(0,0,0,0.14);">
                              <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">First skill CD (0-20)</div>
                              <input class="cp-input" type="number" min="0" max="20" step="1" value="${esc(String(firstCdPreset))}" data-stage-mon-skill-firstcd="${esc(String(i))}-${esc(String(k))}" placeholder="Use default if empty">
                              <div class="cp-setting-help" style="margin-top:10px; margin-bottom:6px;">Next skill CD (1-20)</div>
                              <input class="cp-input" type="number" min="1" max="20" step="1" value="${esc(String(cycleCdPreset))}" data-stage-mon-skill-cyclecd="${esc(String(i))}-${esc(String(k))}" placeholder="Use default if empty">
                              ${getMonsterSkillDescHtml(mid)}
                            </div>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                  <div class="cp-setting-help" style="margin-top:10px;">Stage hint</div>
                  <input class="cp-input" type="text" value="${esc(String(s.hint || ''))}" data-stage-hint="${esc(String(i))}" placeholder="Leave empty to hide">
                  </div>
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
    for (let i = 0; i < stageCount; i += 1) {
      const s = current[i] || { monsterId: '004', level: 1, monsters: null, drops: [] };
      const mons0 = normalizeStageMonsters(s);
      for (let k = 0; k < mons0.length; k += 1) {
        const mm = mons0[k] || {};
        const sel = overlay.querySelector(`[data-stage-monster="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`);
        if (sel) sel.value = String(mm.monsterId || '004').trim().padStart(3, '0');
        const join = overlay.querySelector(`[data-stage-mon-joinchance="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`);
        if (join) join.value = String(Math.max(0, Math.min(100, Math.floor(Number(mm?.monsterDropChance) || 0))));
        const mdrops = Array.isArray(mm?.drops) ? mm.drops : [];
        for (let j = 0; j < 3; j += 1) {
          const d = mdrops[j] || {};
          const itemSel = overlay.querySelector(`[data-stage-mon-drop-item="${CSS.escape(String(i))}-${CSS.escape(String(k))}-${CSS.escape(String(j))}"]`);
          if (itemSel) itemSel.value = String(d.itemId || '').trim().toLowerCase();
        }
      }
    }

    // live previews
    for (let i = 0; i < stageCount; i += 1) {
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
            const firstCdEl = overlay.querySelector(`[data-stage-mon-skill-firstcd="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`);
            const cycleCdEl = overlay.querySelector(`[data-stage-mon-skill-cyclecd="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`);
            if (firstCdEl) firstCdEl.value = '0';
            if (cycleCdEl) cycleCdEl.value = String(getMonsterDefaultCycleCd(id));
            const panel = overlay.querySelector(`[data-stage-mon-skillspanel="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`);
            const descHost = panel?.querySelector('[data-stage-mon-skilldesc]');
            if (panel && descHost) descHost.outerHTML = getMonsterSkillDescHtml(id);
          } catch {}
        }, { passive: true });
      }

      const tbtn = overlay.querySelector(`[data-stage-toggle="${CSS.escape(String(i))}"]`);
      const tbody = overlay.querySelector(`[data-stage-body="${CSS.escape(String(i))}"]`);
      tbtn?.addEventListener('click', () => {
        const isOpen = tbody?.style.display !== 'none';
        if (tbody) tbody.style.display = isOpen ? 'none' : '';
        if (tbtn) {
          tbtn.textContent = isOpen ? 'Expand' : 'Collapse';
          tbtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
        }
      }, { passive: true });
    }

    // Add/remove monster rows
    const makeMonsterRowHtml = (i, k, monsterId, level, monsterDropChance = 0, dropsLike = [], skillFirstCdLike = null, skillCycleCdLike = null) => {
      const mid = String(monsterId || '004').trim().padStart(3, '0');
      const mon = allMonsters.find(x => String(x?.id || '').trim().padStart(3, '0') === mid) || null;
      const src = String(mon?.img || '').trim();
      const monDrops = Array.isArray(dropsLike) ? dropsLike : [];
      const firstCdPreset = Number.isFinite(Number(skillFirstCdLike)) ? Math.max(0, Math.floor(Number(skillFirstCdLike) || 0)) : 0;
      const cycleCdPreset = Number.isFinite(Number(skillCycleCdLike)) && Number(skillCycleCdLike) > 0
        ? Math.max(1, Math.floor(Number(skillCycleCdLike) || 1))
        : getMonsterDefaultCycleCd(mid);
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
            <div class="cp-row" style="margin-top:8px; justify-content:space-between; align-items:center;">
              <div class="cp-setting-help" style="margin:0;">Monster rewards</div>
              <button class="cp-tool-btn" type="button" data-stage-mon-drops-toggle="${esc(String(i))}-${esc(String(k))}" aria-expanded="false">Expand rewards</button>
            </div>
            <div data-stage-mon-dropspanel="${esc(String(i))}-${esc(String(k))}" style="display:none; margin-top:8px; border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:10px; background:rgba(0,0,0,0.14);">
              <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">Monster join chance %</div>
              <input class="cp-input" type="number" min="0" max="100" step="1" value="${esc(String(Math.max(0, Math.min(100, Math.floor(Number(monsterDropChance) || 0)))))}" data-stage-mon-joinchance="${esc(String(i))}-${esc(String(k))}">
              <div class="cp-setting-help" style="margin-top:10px;">Item drops (roll one item for this monster)</div>
              <div style="display:grid; grid-template-columns: 1fr; gap:8px; margin-top:6px;">
                ${Array.from({ length: 3 }, (_, j) => {
                  const dj = monDrops[j] || {};
                  const itemId = String(dj.itemId || '').trim().toLowerCase();
                  const chance = Math.max(0, Math.floor(Number(dj.chance) || 0));
                  const qty = Math.max(1, Math.floor(Number(dj.qty) || dropQtyPresetForItem(itemId)));
                  return `
                    <div class="cp-row" style="margin-top:0; gap:10px; align-items:center;">
                      <div style="flex:1 1 auto; min-width: 210px;">
                        <select class="cp-select" data-stage-mon-drop-item="${esc(String(i))}-${esc(String(k))}-${esc(String(j))}">
                          ${itemOptions}
                        </select>
                      </div>
                      <div style="width: 120px;">
                        <input class="cp-input" type="number" min="0" max="100" step="1" value="${esc(String(chance))}" placeholder="Chance %" data-stage-mon-drop-chance="${esc(String(i))}-${esc(String(k))}-${esc(String(j))}">
                      </div>
                      <div style="width: 110px;">
                        <input class="cp-input" type="number" min="1" max="999" step="1" value="${esc(String(qty))}" placeholder="Qty" data-stage-mon-drop-qty="${esc(String(i))}-${esc(String(k))}-${esc(String(j))}">
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
            <div class="cp-row" style="margin-top:8px; justify-content:space-between; align-items:center;">
              <div class="cp-setting-help" style="margin:0;">Monster skills</div>
              <button class="cp-tool-btn" type="button" data-stage-mon-skills-toggle="${esc(String(i))}-${esc(String(k))}" aria-expanded="false">Expand skills</button>
            </div>
            <div data-stage-mon-skillspanel="${esc(String(i))}-${esc(String(k))}" style="display:none; margin-top:8px; border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:10px; background:rgba(0,0,0,0.14);">
              <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">First skill CD (0-20)</div>
              <input class="cp-input" type="number" min="0" max="20" step="1" value="${esc(String(firstCdPreset))}" data-stage-mon-skill-firstcd="${esc(String(i))}-${esc(String(k))}" placeholder="Use default if empty">
              <div class="cp-setting-help" style="margin-top:10px; margin-bottom:6px;">Next skill CD (1-20)</div>
              <input class="cp-input" type="number" min="1" max="20" step="1" value="${esc(String(cycleCdPreset))}" data-stage-mon-skill-cyclecd="${esc(String(i))}-${esc(String(k))}" placeholder="Use default if empty">
              ${getMonsterSkillDescHtml(mid)}
            </div>
          </div>
        </div>
      `;
    };
    for (let i = 0; i < stageCount; i += 1) {
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
        const dropsBtn = overlay.querySelector(`[data-stage-mon-drops-toggle="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`);
        const dropsPanel = overlay.querySelector(`[data-stage-mon-dropspanel="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`);
        dropsBtn?.addEventListener('click', () => {
          const open = dropsPanel?.style.display !== 'none';
          if (dropsPanel) dropsPanel.style.display = open ? 'none' : '';
          if (dropsBtn) {
            dropsBtn.textContent = open ? 'Expand rewards' : 'Collapse rewards';
            dropsBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
          }
        }, { passive: true });
        const skillsBtn = overlay.querySelector(`[data-stage-mon-skills-toggle="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`);
        const skillsPanel = overlay.querySelector(`[data-stage-mon-skillspanel="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`);
        skillsBtn?.addEventListener('click', () => {
          const open = skillsPanel?.style.display !== 'none';
          if (skillsPanel) skillsPanel.style.display = open ? 'none' : '';
          if (skillsBtn) {
            skillsBtn.textContent = open ? 'Expand skills' : 'Collapse skills';
            skillsBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
          }
        }, { passive: true });
        for (let j = 0; j < 3; j += 1) {
          const itemSel = overlay.querySelector(`[data-stage-mon-drop-item="${CSS.escape(String(i))}-${CSS.escape(String(k))}-${CSS.escape(String(j))}"]`);
          const qtyEl = overlay.querySelector(`[data-stage-mon-drop-qty="${CSS.escape(String(i))}-${CSS.escape(String(k))}-${CSS.escape(String(j))}"]`);
          itemSel?.addEventListener('change', () => {
            try {
              if (!qtyEl) return;
              const itemId = String(itemSel.value || '').trim().toLowerCase();
              qtyEl.value = String(dropQtyPresetForItem(itemId));
            } catch {}
          }, { passive: true });
        }
      };
      addBtn?.addEventListener('click', () => {
        try {
          if (!box) return;
          const rows = Array.from(box.querySelectorAll('[data-stage-monster-row]'));
          if (rows.length >= 4) return;
          const k = rows.length;
          box.insertAdjacentHTML('beforeend', makeMonsterRowHtml(i, k, '004', 1, 0, []));
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
      try { window.ChessPalTutorialFlow?.onHeroModalClosed?.(); } catch {}
    };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    // Keep Edit Stages modal open when clicking outside.
    // Close is only via X, Cancel, or Save flow.
    overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
    overlay.querySelector('#cpEditStagesCancel')?.addEventListener('click', close, { passive: true });
    window.addEventListener('keydown', onKey);

    const msg = overlay.querySelector('#cpEditStagesMsg');
    const setMsg = (t) => { if (msg) msg.textContent = String(t || ''); };

    overlay.querySelector('#cpEditStagesSave')?.addEventListener('click', async () => {
      try {
        setMsg('');
        const stages = [];
        for (let i = 0; i < stageCount; i += 1) {
          const box = overlay.querySelector(`[data-stage-monsters-box="${CSS.escape(String(i))}"]`);
          const rows = Array.from(box?.querySelectorAll('[data-stage-monster-row]') || []);
          const monsters = rows
            .map((_, k) => {
              const monsterId = String(overlay.querySelector(`[data-stage-monster="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`)?.value || '').trim().padStart(3, '0');
              const level = Math.max(1, Math.floor(Number(overlay.querySelector(`[data-stage-level="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`)?.value) || 1));
              const monsterDropChance = Math.max(0, Math.min(100, Math.floor(Number(overlay.querySelector(`[data-stage-mon-joinchance="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`)?.value) || 0)));
              const firstCdRaw = String(overlay.querySelector(`[data-stage-mon-skill-firstcd="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`)?.value ?? '').trim();
              const cycleCdRaw = String(overlay.querySelector(`[data-stage-mon-skill-cyclecd="${CSS.escape(String(i))}-${CSS.escape(String(k))}"]`)?.value ?? '').trim();
              const skillFirstCd = firstCdRaw === '' ? null : Math.max(0, Math.min(20, Math.floor(Number(firstCdRaw) || 0)));
              const baseCycleCd = getMonsterDefaultCycleCd(monsterId);
              const parsedCycleCd = Math.floor(Number(cycleCdRaw) || 0);
              const skillCycleCd = cycleCdRaw === ''
                ? null
                : (parsedCycleCd <= 0 ? baseCycleCd : Math.max(1, Math.min(20, parsedCycleCd)));
              const monDrops = [];
              for (let j = 0; j < 3; j += 1) {
                const itemId = String(overlay.querySelector(`[data-stage-mon-drop-item="${CSS.escape(String(i))}-${CSS.escape(String(k))}-${CSS.escape(String(j))}"]`)?.value || '').trim().toLowerCase();
                const chance = Math.max(0, Math.floor(Number(overlay.querySelector(`[data-stage-mon-drop-chance="${CSS.escape(String(i))}-${CSS.escape(String(k))}-${CSS.escape(String(j))}"]`)?.value) || 0));
                const qtyRaw = Number(overlay.querySelector(`[data-stage-mon-drop-qty="${CSS.escape(String(i))}-${CSS.escape(String(k))}-${CSS.escape(String(j))}"]`)?.value);
                const qtyPreset = dropQtyPresetForItem(itemId);
                const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.min(999, Math.floor(qtyRaw))) : qtyPreset;
                if (!itemId) continue;
                if (!getStorageItemDef(itemId)) continue;
                if (chance <= 0) continue;
                monDrops.push({ itemId, chance, qty });
              }
              return { monsterId, level, monsterDropChance, skillFirstCd, skillCycleCd, drops: monDrops };
            })
            .filter(x => /^\d{3}$/.test(x.monsterId));
          if (!monsters.length) throw new Error('Stage must have at least 1 monster');
          const hint = String(overlay.querySelector(`[data-stage-hint="${CSS.escape(String(i))}"]`)?.value || '').trim();
          const drops = []; // deprecated stage-level drops (kept for back-compat payload shape)
          // Back-compat: keep monsterId/level in sync with the first monster
          stages.push({ monsters, monsterId: monsters[0].monsterId, level: monsters[0].level, hint, drops });
        }
        if (onSaveStages) {
          await Promise.resolve(onSaveStages(stages, { chapter: ch }));
          setMsg('Saved globally.');
        } else {
          const nextAll = loadStoryStages();
          nextAll[String(ch)] = stages;
          const saved = await saveStoryStagesToServer(nextAll);
          saveStoryStages(saved?.stages || nextAll);
          setStoryStagesUpdatedAtLocal(Number(saved?.updatedAt) || Date.now());
          setMsg('Saved globally.');
        }
        setTimeout(() => close(), 250);
      } catch (e) {
        setMsg(String(e?.message || e || 'Save failed'));
      }
    }, { passive: true });
  }

  // ----------------------------
  // Player progression (per-user): PAD-like EXP curve
  // totalExp(level) = floor((level-1)^2.5 * curve)
  // ----------------------------
  const PLAYER_PROGRESS_KEY = 'chessPalPlayerProgress';
  const PLAYER_MAX_LEVEL = 999;
  const PLAYER_EXP_CURVE = 38;

  function totalPlayerExpForLevel(level, curve = PLAYER_EXP_CURVE, maxLevel = PLAYER_MAX_LEVEL) {
    const cap = Math.max(1, Math.floor(Number(maxLevel) || PLAYER_MAX_LEVEL));
    const lv = Math.max(1, Math.min(cap, Math.floor(Number(level) || 1)));
    const c = Math.max(1, Number(curve) || PLAYER_EXP_CURVE);
    if (lv <= 1) return 0;
    return Math.floor(Math.pow(lv - 1, 2.5) * c);
  }

  function playerLevelFromTotalExp(totalExp, curve = PLAYER_EXP_CURVE, maxLevel = PLAYER_MAX_LEVEL) {
    const t = Math.max(0, Math.floor(Number(totalExp) || 0));
    let lo = 1;
    let hi = Math.max(1, Math.floor(Number(maxLevel) || PLAYER_MAX_LEVEL));
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (totalPlayerExpForLevel(mid, curve, hi) <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  function loadPlayerProgress() {
    try {
      const raw = localStorage.getItem(PLAYER_PROGRESS_KEY);
      if (!raw) return { totalExp: 0 };
      const v = JSON.parse(raw);
      return {
        totalExp: Math.max(0, Math.floor(Number(v?.totalExp) || 0)),
      };
    } catch {
      return { totalExp: 0 };
    }
  }

  function savePlayerProgress(p) {
    try { localStorage.setItem(PLAYER_PROGRESS_KEY, JSON.stringify({ totalExp: Math.max(0, Math.floor(Number(p?.totalExp) || 0)) })); } catch {}
    try { window.dispatchEvent(new Event('cpPlayerProgressChanged')); } catch {}
  }

  function getPlayerProgressMeta() {
    const p = loadPlayerProgress();
    const totalExp = Math.max(0, Math.floor(Number(p?.totalExp) || 0));
    const level = playerLevelFromTotalExp(totalExp, PLAYER_EXP_CURVE, PLAYER_MAX_LEVEL);
    const curLevelExp = totalPlayerExpForLevel(level, PLAYER_EXP_CURVE, PLAYER_MAX_LEVEL);
    const nextLevelExp = totalPlayerExpForLevel(Math.min(PLAYER_MAX_LEVEL, level + 1), PLAYER_EXP_CURVE, PLAYER_MAX_LEVEL);
    const need = Math.max(0, nextLevelExp - totalExp);
    const span = Math.max(1, nextLevelExp - curLevelExp);
    const progress = Math.max(0, Math.min(1, (totalExp - curLevelExp) / span));
    return { level, totalExp, curLevelExp, nextLevelExp, need, progress };
  }

  function addPlayerExp(deltaExp) {
    const d = Math.max(0, Math.floor(Number(deltaExp) || 0));
    if (d <= 0) return getPlayerProgressMeta();
    const p = loadPlayerProgress();
    const before = getPlayerProgressMeta();
    p.totalExp = Math.max(0, Math.floor(Number(p.totalExp) || 0) + d);
    savePlayerProgress(p);
    const after = getPlayerProgressMeta();
    return { before, after, gained: d, levelUp: after.level > before.level };
  }

  try {
    window.ChessPalPlayerProgress = {
      getPlayerProgressMeta,
      addPlayerExp,
    };
  } catch {}

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
    // Prevent stale local level tuning from locking level display/progression.
    try { setNumberInMap(HERO_LEVEL_OVERRIDE_KEY, id, null); } catch {}
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
    // Prevent stale local level tuning from locking level display/progression.
    try { setNumberInMap(MONSTER_LEVEL_OVERRIDE_KEY, id, null); } catch {}
  }

  const HERO_LEVEL_OVERRIDE_KEY = 'chessPalHeroLevelOverride';
  const HERO_CD_OVERRIDE_KEY = 'chessPalHeroCdOverride';
  const MONSTER_LEVEL_OVERRIDE_KEY = 'chessPalMonsterLevelOverride';
  const MONSTER_CD_OVERRIDE_KEY = 'chessPalMonsterCdOverride';
  function loadNumberMap(key) {
    try {
      const raw = localStorage.getItem(String(key || ''));
      if (!raw) return {};
      const v = JSON.parse(raw);
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch {
      return {};
    }
  }
  function saveNumberMap(key, obj) {
    try { localStorage.setItem(String(key || ''), JSON.stringify(obj || {})); } catch {}
    try { window.dispatchEvent(new Event('cpPalTuningChanged')); } catch {}
  }
  function getNumberFromMap(key, id) {
    const k = String(id || '').trim().padStart(3, '0');
    if (!k) return null;
    const m = loadNumberMap(key);
    const n = Number(m?.[k]);
    if (!Number.isFinite(n)) return null;
    // For level overrides, non-positive values are invalid and should not lock level at 1.
    if ((String(key) === HERO_LEVEL_OVERRIDE_KEY || String(key) === MONSTER_LEVEL_OVERRIDE_KEY) && n < 1) return null;
    return n;
  }
  function setNumberInMap(key, id, n) {
    const k = String(id || '').trim().padStart(3, '0');
    if (!k) return;
    const m = loadNumberMap(key);
    const raw = (n == null) ? '' : String(n).trim();
    if (!raw) {
      delete m[k];
      saveNumberMap(key, m);
      return;
    }
    const x = Number(raw);
    if (!Number.isFinite(x)) delete m[k];
    else m[k] = x;
    saveNumberMap(key, m);
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
    const animateUnitExpInModal = ({ unitKind, beforeMeta, afterUnit }) => {
      try {
        if (!beforeMeta || !afterUnit) return;
        const overlayId = String(unitKind || '').toLowerCase() === 'monster' ? 'cpMonsterModalOverlay' : 'cpHeroModalOverlay';
        const overlayEl = document.getElementById(overlayId);
        if (!overlayEl) return;
        const fill = overlayEl.querySelector('.cp-expfill');
        const text = overlayEl.querySelector('.cp-exptext');
        if (!fill || !text) return;
        const afterMeta = expProgressMeta({
          totalExp: Number(afterUnit?.totalExp || 0),
          level: Number(afterUnit?.level || 1),
          curve: Number(afterUnit?.expCurve || 50),
          maxLevel: Number(afterUnit?.maxLevel || 99),
        });
        const beforePct = Math.max(0, Math.min(100, Math.round((Number(beforeMeta?.pct) || 0) * 100)));
        const afterPct = Math.max(0, Math.min(100, Math.round((Number(afterMeta?.pct) || 0) * 100)));
        fill.style.transition = 'none';
        fill.style.width = `${beforePct}%`;
        text.textContent = `${Math.max(0, Math.floor(Number(beforeMeta?.cur) || 0))} / ${Math.max(0, Math.floor(Number(beforeMeta?.need) || 1))} EXP`;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            fill.style.transition = 'width 950ms ease';
            fill.style.width = `${afterPct}%`;
            setTimeout(() => {
              try {
                text.textContent = `${Math.max(0, Math.floor(Number(afterMeta?.cur) || 0))} / ${Math.max(0, Math.floor(Number(afterMeta?.need) || 1))} EXP`;
              } catch {}
            }, 960);
          });
        });
      } catch {}
    };

    const expDefs = [
      { itemId: 'exp_pawn', label: 'EXP Pawn', exp: 500, desc: 'Small EXP.' },
      { itemId: 'exp_knight', label: 'EXP Knight', exp: 1500, desc: 'Medium EXP.' },
      { itemId: 'exp_bishop', label: 'EXP Bishop', exp: 2500, desc: 'Large EXP.' },
      { itemId: 'exp_rook', label: 'EXP Rook', exp: 4000, desc: 'Very large EXP.' },
      { itemId: 'exp_queen', label: 'EXP Queen', exp: 7000, desc: 'Massive EXP.' },
      { itemId: 'exp_king', label: 'EXP King', exp: 12000, desc: 'Legendary EXP.' },
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
        try {
          if (window.ChessPalTutorialFlow?.isActive?.()) {
            const allow = !!window.ChessPalTutorialFlow?.allowLevelUpItem?.(itemId);
            if (!allow) {
              setMsg('Please use EXP Pawn for this tutorial step.');
              return;
            }
          }
        } catch {}
        const def = expDefs.find(x => x.itemId === itemId);
        if (!def) return;
        // consume one from storage
        const idx = slots.findIndex(x => x && String(x.itemId || '').toLowerCase() === itemId);
        if (idx < 0) return;
        const curQty = Math.max(0, Math.floor(Number(slots[idx]?.qty) || 0));
        if (curQty <= 0) return;
        slots[idx] = (curQty <= 1) ? null : { ...slots[idx], qty: curQty - 1 };
        saveStorage(slots);

        // Snapshot EXP before consume for progress animation.
        const beforeUnit = (() => {
          try {
            return (k === 'monster')
              ? mergeMonster(getMonsterById(unitId))
              : mergeHero(getHeroById(unitId));
          } catch {
            return null;
          }
        })();
        const beforeMeta = beforeUnit ? expProgressMeta({
          totalExp: Number(beforeUnit?.totalExp || 0),
          level: Number(beforeUnit?.level || 1),
          curve: Number(beforeUnit?.expCurve || 50),
          maxLevel: Number(beforeUnit?.maxLevel || 99),
        }) : null;

        // add exp
        if (k === 'monster') {
          addMonsterExp(unitId, def.exp);
          // If local Admin level override exists, it can lock displayed level at Lv1.
          // Clear it after real EXP level-up so the new level is reflected immediately.
          try { setNumberInMap(MONSTER_LEVEL_OVERRIDE_KEY, unitId, null); } catch {}
        } else {
          addHeroExp(unitId, def.exp);
          try { setNumberInMap(HERO_LEVEL_OVERRIDE_KEY, unitId, null); } catch {}
        }
        try {
          if (itemId === 'exp_pawn') window.ChessPalTutorialFlow?.onExpPawnUsed?.();
        } catch {}

        setMsg(`Used ${def.label}.`);
        close();

        // reopen unit modal with refreshed stats/level
        try {
          if (k === 'monster') {
            const refreshed = mergeMonster(getMonsterById(unitId));
            if (refreshed) {
              showMonsterModal(refreshed);
              setTimeout(() => { try { animateUnitExpInModal({ unitKind: 'monster', beforeMeta, afterUnit: refreshed }); } catch {} }, 40);
            }
          } else {
            const refreshed = mergeHero(getHeroById(unitId));
            if (refreshed) {
              showHeroModal(refreshed);
              setTimeout(() => { try { animateUnitExpInModal({ unitKind: 'hero', beforeMeta, afterUnit: refreshed }); } catch {} }, 40);
            }
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
          <img class="cp-chapter-img" src="images/Summon/Su001-Summon-Hero.jpg" alt="Shop" decoding="async" loading="lazy" onerror="this.onerror=null;this.src='${esc(fallbackImg)}';">
          <div class="cp-chapter-label">Shop</div>
        </div>

        <div class="cp-chapter-tile" role="button" tabindex="0" data-cp-home="summon" aria-label="Summon">
          <img class="cp-chapter-img" src="images/Summon/Su002-Summon-Monster.jpg" alt="Summon" decoding="async" loading="lazy" onerror="this.onerror=null;this.src='${esc(fallbackImg)}';">
          <div class="cp-chapter-label">Summon</div>
        </div>

        <div class="cp-chapter-tile" role="button" tabindex="0" data-cp-home="pal" aria-label="Pal">
          <img class="cp-chapter-img" src="images/Heros/003-Rivenhart/003-Rivenhart.png" alt="Pal" decoding="async" loading="lazy" onerror="this.onerror=null;this.src='${esc(fallbackImg)}';">
          <div class="cp-chapter-label">Pal</div>
        </div>
        <div class="cp-chapter-tile" role="button" tabindex="0" data-cp-home="achievement" aria-label="Achievement">
          <img class="cp-chapter-img" src="images/Storage/S001-Gold-Coin.png" alt="Achievement" decoding="async" loading="lazy" onerror="this.onerror=null;this.src='${esc(fallbackImg)}';">
          <div class="cp-chapter-label">Achievement</div>
        </div>
      </div>
    `;
  };
  HomePage.init = () => {
    const go = (key) => {
      try {
        if (window.ChessPalTutorialFlow?.isActive?.()) {
          const ok = !!window.ChessPalTutorialFlow?.guardHomeTile?.(key);
          if (!ok) { try { setMsg('Please follow the tutorial step.'); } catch {} return; }
          if (key === 'story') window.ChessPalTutorialFlow?.onHomeStorySelected?.();
          if (key === 'pal') window.ChessPalTutorialFlow?.onHomePalSelected?.();
        }
      } catch {}
      if (key === 'shop') Router.goTo('/shop');
      else if (key === 'summon') Router.goTo('/summon');
      else if (key === 'pal') Router.goTo('/pal');
      else if (key === 'achievement') Router.goTo('/achievement');
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
    try { window.ChessPalTutorialFlow?.applyRouteFocus?.('/home'); } catch {}
  };

  function ModePage() {}
  ModePage.title = 'Mode';
  ModePage.render = () => {
    const s = getGeneralSettings();
    const admin = isAdminMode();
    const storyChapterBgs = {
      1: 'images/Mode/Story/Chapter001-Grassland_Awakening/Chapter001-Grassland_Awakening.jpg',
      2: 'images/Mode/Story/Chapter002-Riverbound_Oath/Chapter002-Riverbound_Oath.jpg',
      3: 'images/Mode/Story/Chapter003-Ember_Trial/Chapter003-Ember_Trial.jpg',
      4: 'images/Mode/Story/Chapter004-Cathedral_of_Thorns/Chapter004-Cathedral_of_Thorns.jpg',
      5: 'images/Mode/Story/Chapter005-Halo_and_Dusk/Chapter005-Halo_and_Dusk.jpg',
      6: 'images/Mode/Story/Chapter006-The_First_Bloom/Chapter006-The_First_Bloom.jpg',
      7: 'images/Mode/Story/Chapter007-Lost_Bestiary/Chapter007-Lost_Bestiary.jpg',
      8: 'images/Mode/Story/Chapter008-Castling_Keep_Siege/Chapter008-Castling_Keep_Siege.jpg',
      9: 'images/Mode/Story/Chapter009-The_Board_Rewrites/Chapter009-The_Board_Rewrites.jpg',
      10: 'images/Mode/Story/Chapter009-The_Board_Rewrites/Chapter009-The_Board_Rewrites.jpg',
    };
    const storyPreviewChapter = (() => {
      try {
        for (let ch = 1; ch <= 10; ch += 1) {
          const cleared = Math.max(0, Math.floor(Number(window.ChessPalStory?.getClearedStage?.(ch)) || 0));
          if (cleared < 5) return ch;
        }
      } catch {}
      return 10;
    })();
    const storyPreviewBg = String(storyChapterBgs[storyPreviewChapter] || storyChapterBgs[10]);
    const challengeUnlocked = (() => {
      if (admin) return true;
      try { return Math.max(0, Math.floor(Number(window.ChessPalStory?.getClearedStage?.(3)) || 0)) >= 5; } catch { return false; }
    })();
    return `
      <div class="cp-square-grid" aria-label="Mode">
        <button class="cp-square-tile" type="button" data-cp-mode="story" aria-label="Story Mode">
          ${renderImgWithFallback(storyPreviewBg, 'Story Mode', 'cp-square-img')}
          <div class="cp-square-label">Story Mode</div>
        </button>
        <button class="cp-square-tile" type="button" data-cp-mode="challenge" data-cp-locked="${challengeUnlocked ? '0' : '1'}" aria-label="Challenge Mode" ${challengeUnlocked ? '' : 'disabled'}>
          ${renderImgWithFallback('images/Monsters/M010-Dawn_Seraph/M010-Dawn_Seraph.png', 'Challenge Mode', 'cp-square-img')}
          <div class="cp-square-label">Challenge Mode</div>
        </button>
        <button class="cp-square-tile" type="button" data-cp-mode="practice" aria-label="Practice Mode">
          ${renderImgWithFallback(String(s.practiceBg || 'images/Mode/Practice/Map/Map001-Grassland.jpg'), 'Practice Mode', 'cp-square-img')}
          <div class="cp-square-label">Practice Mode</div>
        </button>
        ${admin ? `
          <button class="cp-square-tile" type="button" data-cp-mode="test" aria-label="Test Game">
            ${renderImgWithFallback('images/Monsters/M010-Dawn_Seraph/M010-Dawn_Seraph.png', 'Test Game', 'cp-square-img')}
            <div class="cp-square-label">Test Game</div>
          </button>
        ` : ``}
      </div>
    `;
  };
  ModePage.init = () => {
    document.querySelectorAll('[data-cp-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = String(btn.getAttribute('data-cp-mode') || '').trim();
        try {
          if (window.ChessPalTutorialFlow?.isActive?.()) {
            const ok = !!window.ChessPalTutorialFlow?.guardModeTile?.(key);
            if (!ok) { try { setMsg('Please follow the tutorial step.'); } catch {} return; }
            if (key === 'story') window.ChessPalTutorialFlow?.onModeStorySelected?.();
          }
        } catch {}
        const locked = String(btn.getAttribute('data-cp-locked') || '0') === '1';
        if (locked) { try { setMsg('Complete Story Mode Chapter 3 first.'); } catch {} return; }
        if (key === 'practice') Router.goTo('/practice');
        else if (key === 'story') Router.goTo('/mode/story');
        else if (key === 'challenge') Router.goTo('/mode/challenge');
        else if (key === 'test') Router.goTo('/test-game');
      }, { passive: true });
    });
    try { window.ChessPalTutorialFlow?.applyRouteFocus?.('/mode'); } catch {}
  };

  function showTeamSelectBeforeStoryChapter({ chapterId, nextStage, forced = false, onConfirm } = {}) {
    const ch = Math.max(1, Math.min(10, Math.floor(Number(chapterId) || 1)));
    const st = Math.max(1, Math.min(5, Math.floor(Number(nextStage) || 1)));
    const old = document.getElementById('cpTeamPickOverlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'cpTeamPickOverlay';
    overlay.className = 'cp-modal-overlay';
    const state = loadTeams();
    const activeIdx = Math.max(0, Math.min(4, Math.floor(Number(state?.active) || 0)));
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Select team">
        ${forced ? '' : `<button class="cp-modal-close" type="button" aria-label="Close">×</button>`}
        <div class="cp-modal-body">
          <div class="cp-h1" style="font-size:20px;">Select Team</div>
          <div class="cp-muted" style="margin-top:8px;">Choose Team 1-5 before entering Chapter ${esc(String(ch))}.</div>
          <div id="cpTeamPickGrid" class="cp-setting-grid" style="margin-top:12px; grid-template-columns:1fr;">
            ${Array.from({ length: 5 }).map((_, i) => {
              const idx = i;
              const row = (Array.isArray(state?.teams?.[idx]) ? state.teams[idx] : [null, null, null, null]);
              const names = row.map((slot) => {
                const unit = slot ? getTeamUnit(slot) : null;
                return unit ? String(unit.name || '') : 'Empty';
              }).join(' / ');
              return `
                <label class="cp-setting-item" style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                  <input type="radio" name="cpTeamPick" value="${esc(String(idx))}" ${idx === activeIdx ? 'checked' : ''}>
                  <div style="display:flex; flex-direction:column; gap:4px;">
                    <div style="font-weight:900;">Team ${idx + 1}</div>
                    <div class="cp-setting-help" style="margin-top:0;">${esc(names)}</div>
                  </div>
                </label>
              `;
            }).join('')}
          </div>
          <div class="cp-row" style="justify-content:center; margin-top:14px; gap:10px;">
            ${forced ? '' : `<button class="cp-tool-btn" type="button" id="cpTeamPickCancel">Cancel</button>`}
            <button class="cp-primary" type="button" id="cpTeamPickConfirm">Confirm</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      try { overlay.remove(); } catch {}
      try { window.removeEventListener('keydown', onKey); } catch {}
      try { window.ChessPalTutorialFlow?.clearSpotlight?.(); } catch {}
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape' && !forced) close();
    };
    if (!forced) {
      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
      overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
      overlay.querySelector('#cpTeamPickCancel')?.addEventListener('click', close, { passive: true });
    }
    window.addEventListener('keydown', onKey);
    setTimeout(() => {
      try {
        if (forced) window.ChessPalTutorialFlow?.spotlight?.('#cpTeamPickConfirm');
      } catch {}
    }, 30);

    overlay.querySelector('#cpTeamPickConfirm')?.addEventListener('click', () => {
      const picked = overlay.querySelector('input[name="cpTeamPick"]:checked');
      const idx = Math.max(0, Math.min(4, Math.floor(Number(picked?.value) || 0)));
      const nextState = loadTeams();
      nextState.active = idx;
      saveTeams(nextState);
      try { window.ChessPalTutorialFlow?.onTeamConfirmed?.(ch); } catch {}
      try { if (typeof onConfirm === 'function') onConfirm({ chapterId: ch, stage: st, teamIndex: idx }); } catch {}
      close();
      Router.goTo(`/mode/story/ch${ch}/s${st}`);
    }, { passive: true });
  }

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
          <div class="cp-chapter-tile ${(!admin && c.id > 1 && !window.ChessPalStory?.isChapterUnlocked?.(c.id)) ? 'is-locked' : ''}" role="button" tabindex="0" data-cp-chapter="${esc(String(c.id))}" data-cp-locked="${(!admin && c.id > 1 && !window.ChessPalStory?.isChapterUnlocked?.(c.id)) ? '1' : '0'}" aria-label="${esc(c.title)}">
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
        const locked = String(btn.getAttribute('data-cp-locked') || '0') === '1';
        if (locked) { try { setMsg('Clear previous chapter first.'); } catch {} return; }
        const ch = Math.max(1, Math.min(10, Math.floor(Number(btn.getAttribute('data-cp-chapter')) || 1)));
        try {
          if (window.ChessPalTutorialFlow?.isActive?.()) {
            const ok = !!window.ChessPalTutorialFlow?.guardChapterSelection?.(ch);
            if (!ok) { try { setMsg('Please follow the tutorial step.'); } catch {} return; }
            window.ChessPalTutorialFlow?.onChapterSelected?.(ch);
          }
        } catch {}
        // Directly enter gameplay (no stage select screen)
        let cleared = 0;
        try { cleared = Math.max(0, Math.floor(Number(window.ChessPalStory?.getClearedStage?.(ch)) || 0)); } catch {}
        const next = (cleared >= 5) ? 1 : Math.min(5, cleared + 1);
        const forced = !!window.ChessPalTutorialFlow?.isActive?.()
          && (String(window.ChessPalTutorialFlow?.getState?.()?.step || '') === 'story_ch1_team_confirm'
            || String(window.ChessPalTutorialFlow?.getState?.()?.step || '') === 'story_ch2_team_confirm');
        showTeamSelectBeforeStoryChapter({ chapterId: ch, nextStage: next, forced });
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
    try { window.ChessPalTutorialFlow?.applyRouteFocus?.('/mode/story'); } catch {}
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

  function getDefaultStoryElementsForStage(chapterId, stageIdx1, teamUnits) {
    const chapter = Math.max(1, Math.min(10, Math.floor(Number(chapterId) || 1)));
    const stage = Math.max(1, Math.min(5, Math.floor(Number(stageIdx1) || 1)));
    const core = ['light', 'dark', 'fire', 'water', 'wood'];
    // Keep Chapter 1 tutorial pool logic only.
    // All later chapters use the original full pool (including Heart) from Stage 1.
    if (chapter !== 1) return [...core, 'heart'];
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

  function showAdminEditEventGoldStagesModal(chapterId) {
    const ch = Math.max(1, Math.min(3, Math.floor(Number(chapterId) || 1)));
    showAdminEditStoryStagesModal(1, {
      stageCount: 5,
      modalTitle: `Edit stages · Gold Farming Chapter ${ch}`,
      modalDesc: 'Pick Monster and Level for each stage. Element pool is fixed to Fire / Water / Wood / Heart.',
      stageLabel: (i) => (i === 4 ? `Stage ${i + 1} · Boss Stage` : `Stage ${i + 1}`),
      getStages: () => getEventGoldStagesForChapter(ch),
      onSaveStages: (stages) => saveEventGoldStagesForChapter(ch, stages),
    });
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
    const first = monsters[0] || { monsterId: '004', level: 1, monsterDropChance: 0, drops: [] };
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
    const chapterLocked = (() => {
      try {
        if (this._ch <= 1) return false;
        return !window.ChessPalStory?.isChapterUnlocked?.(this._ch);
      } catch {
        return false;
      }
    })();
    if (chapterLocked) {
      setTimeout(() => {
        try { setMsg('Clear previous chapter first.'); } catch {}
        try { Router.goTo('/mode/story'); } catch {}
      }, 0);
      return `<div class="cp-page-card"><div class="cp-muted">Chapter is locked.</div></div>`;
    }
    const cfg = getStoryStageConfig(this._ch, this._st);
    window.__cpStoryStage = cfg;
    // Entering Story battle route should start fresh.
    // (Stage-to-stage progression happens in-place without reloading the board.)
    try { window.__cpPracticeBattleState = {}; } catch {}
    try { window.__cpPracticeElementScores = {}; } catch {}
    try { window.__cpPracticePathMultipliers = []; } catch {}
    // elements pool by stage
    try {
      const team = getTeam();
      const units = ['a', 'b', 'c', 'd'].map(k => getTeamUnit(team?.[k])).filter(Boolean);
      window.__cpBoardElements = getDefaultStoryElementsForStage(cfg.chapter, cfg.stage, units);
      const fixed = window.ChessPalStory?.getFixedElementPool?.(cfg.chapter, cfg.stage);
      if (Array.isArray(fixed) && fixed.length) window.__cpBoardElements = fixed.slice();
    } catch {
      window.__cpBoardElements = getDefaultStoryElementsForStage(cfg.chapter, cfg.stage, []);
      try {
        const fixed = window.ChessPalStory?.getFixedElementPool?.(cfg.chapter, cfg.stage);
        if (Array.isArray(fixed) && fixed.length) window.__cpBoardElements = fixed.slice();
      } catch {}
    }
    return PracticePage.render();
  };
  StoryBattlePage.prototype.init = function () {
    PracticePage.init();
    try {
      const ch = Math.max(1, Math.min(10, Math.floor(Number(this._ch) || 1)));
      const st = Math.max(1, Math.min(5, Math.floor(Number(this._st) || 1)));
      if (window.ChessPalTutorialFlow?.isActive?.()) {
        window.__cpActionLocked = true;
        const opened = !!window.ChessPalTutorialFlow?.maybeShowStageTutorial?.(ch, st, () => {
          try { window.__cpActionLocked = false; } catch {}
        });
        if (!opened) window.__cpActionLocked = false;
      }
    } catch {}
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
    <button class="cp-square-tile" type="button" data-cp-challenge="event" aria-label="Event Mode">
      ${renderImgWithFallback('images/Mode/Practice/Map/Map001-Grassland.jpg', 'Event Mode', 'cp-square-img')}
      <div class="cp-square-label">Event Mode</div>
    </button>
      <button class="cp-square-tile" type="button" data-cp-modeback aria-label="Back">
        ${renderImgWithFallback('images/Monsters/M010-Dawn_Seraph/M010-Dawn_Seraph.png', 'Back', 'cp-square-img')}
        <div class="cp-square-label">Back</div>
      </button>
    </div>
  `;
ModeChallengePage.init = () => {
  document.querySelectorAll('[data-cp-modeback]').forEach((btn) => {
    btn.addEventListener('click', () => Router.goTo('/mode'), { passive: true });
  });
  document.querySelectorAll('[data-cp-challenge]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = String(btn.getAttribute('data-cp-challenge') || '').trim();
      if (key === 'event') Router.goTo('/mode/challenge/event');
    }, { passive: true });
  });
};

function ModeChallengeTimedPage() {}
ModeChallengeTimedPage.title = 'Event Mode';
ModeChallengeTimedPage.render = () => `
  <div class="cp-square-grid" aria-label="Event Mode">
    <button class="cp-square-tile" type="button" data-cp-go="/mode/challenge/event/gold" aria-label="Gold Farming Mode">
      ${renderImgWithFallback('images/Storage/S001-Gold-Coin.png', 'Gold Farming Mode', 'cp-square-img')}
      <div class="cp-square-label">Gold Farming Mode</div>
    </button>
    <button class="cp-square-tile" type="button" data-cp-go="/mode/challenge" aria-label="Back">
      ${renderImgWithFallback('images/Monsters/M010-Dawn_Seraph/M010-Dawn_Seraph.png', 'Back', 'cp-square-img')}
      <div class="cp-square-label">Back</div>
    </button>
  </div>
`;
ModeChallengeTimedPage.init = () => {
  document.querySelectorAll('[data-cp-go]').forEach((btn) => {
    btn.addEventListener('click', () => Router.goTo(String(btn.getAttribute('data-cp-go') || '/mode/challenge')), { passive: true });
  });
};

function EventGoldModePage() {}
EventGoldModePage.title = 'Gold Farming Mode';
EventGoldModePage.render = () => {
  const admin = isAdminMode();
  const chapterDefs = [
    { id: 1, title: 'Gold Farming Chapter 1', img: 'images/Mode/Event/Gold-Farming/Chapter001-Gold-Farming.png' },
    { id: 2, title: 'Gold Farming Chapter 2', img: 'images/Mode/Event/Gold-Farming/Chapter002-Gold-Farming.png' },
    { id: 3, title: 'Gold Farming Chapter 3', img: 'images/Mode/Event/Gold-Farming/Chapter003-Gold-Farming.png' },
  ];
  return `
    <div class="cp-chapter-list" aria-label="Gold Farming chapters">
      ${chapterDefs.map((c) => {
        const locked = (!admin && !isEventGoldChapterUnlocked(c.id));
        const cleared = getEventGoldClearedStage(c.id);
        const next = (cleared >= 5) ? 1 : Math.min(5, cleared + 1);
        return `
          <div class="cp-chapter-tile ${locked ? 'is-locked' : ''}" role="button" tabindex="0" data-cp-event-gold-chapter="${esc(String(c.id))}" data-cp-locked="${locked ? '1' : '0'}" aria-label="${esc(c.title)}">
            <img class="cp-chapter-img" src="${esc(String(c.img))}" alt="${esc(c.title)}" decoding="async" loading="lazy">
            <div class="cp-chapter-label">${esc(c.title)}</div>
            <div class="cp-chapter-sub">${locked ? 'Locked' : `5 stages · Fire / Water / Wood / Heart · Next Stage ${esc(String(next))}`}</div>
            ${admin ? `<button class="cp-tool-btn cp-chapter-edit" type="button" data-cp-edit-event-gold="${esc(String(c.id))}">Edit stages</button>` : ``}
          </div>
        `;
      }).join('')}
      <button class="cp-tool-btn" type="button" data-cp-go="/mode/challenge/event">Back</button>
    </div>
  `;
};
EventGoldModePage.init = () => {
  document.querySelectorAll('[data-cp-go]').forEach((btn) => btn.addEventListener('click', () => Router.goTo(String(btn.getAttribute('data-cp-go') || '/mode/challenge/event')), { passive: true }));
  document.querySelectorAll('[data-cp-event-gold-chapter]').forEach((tile) => {
    tile.addEventListener('click', () => {
      const locked = String(tile.getAttribute('data-cp-locked') || '0') === '1';
      if (locked) { try { setMsg('Clear previous chapter first.'); } catch {} return; }
      const ch = Math.max(1, Math.min(3, Math.floor(Number(tile.getAttribute('data-cp-event-gold-chapter')) || 1)));
      const cleared = getEventGoldClearedStage(ch);
      const s = (cleared >= 5) ? 1 : Math.min(5, cleared + 1);
      Router.goTo(`/mode/challenge/event/gold/ch${ch}/s${s}`);
    }, { passive: true });
    tile.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { try { ev.preventDefault(); } catch {} try { tile.click(); } catch {} }
    });
  });
  if (isAdminMode()) {
    document.querySelectorAll('[data-cp-edit-event-gold]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        try { ev.preventDefault(); ev.stopPropagation(); } catch {}
        const ch = Math.max(1, Math.min(3, Math.floor(Number(btn.getAttribute('data-cp-edit-event-gold')) || 1)));
        try { showAdminEditEventGoldStagesModal(ch); } catch {}
      }, { passive: false });
    });
  }
};

function EventGoldBattlePage(chapterId, stageIdx1) {
  this._ch = Math.max(1, Math.min(3, Math.floor(Number(chapterId) || 1)));
  this._st = Math.max(1, Math.min(5, Math.floor(Number(stageIdx1) || 1)));
}
EventGoldBattlePage.prototype.title = 'Gold Farming Battle';
EventGoldBattlePage.prototype.render = function () {
  window.__cpStoryStage = getEventGoldStageConfig(this._ch, this._st);
  try {
    const ex = window.__cpEventGoldRunSession;
    if (!(ex && ex.active && Number(ex.chapter) === this._ch)) {
      window.__cpEventGoldRunSession = {
        active: true,
        chapter: this._ch,
        startedAt: Date.now(),
        itemDrops: [],
        monsterDrops: [],
        expGain: 0,
        completed: false,
        resignHandled: false,
      };
    }
  } catch {}
  try { window.__cpBoardElements = ['fire', 'water', 'wood', 'heart']; } catch {}
  return PracticePage.render();
};
EventGoldBattlePage.prototype.init = function () {
  PracticePage.init();
  try {
    const old = document.getElementById('cpStageIntro');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'cpStageIntro';
    wrap.className = 'cp-stage-intro';
    const t = document.createElement('div');
    t.className = 'cp-stage-intro-text';
    t.textContent = `Gold Farming Chapter ${this._ch} · Stage ${this._st}`;
    wrap.appendChild(t);
    document.body.appendChild(wrap);
    setTimeout(() => { try { wrap.remove(); } catch {} }, 2600);
  } catch {}
};
EventGoldBattlePage.prototype.destroy = function () {
  try { delete window.__cpStoryStage; } catch {}
  try { delete window.__cpBoardElements; } catch {}
  try { PracticePage.destroy(); } catch {}
};

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
    const renderBossCards = (list) => {
      const mons = Array.isArray(list) && list.length
        ? list
        : [{ name: 'Verdant Maw', img: 'images/Monsters/M004-Verdant_Maw/M004-Verdant_Maw.png', element: '', level: 1 }];
      return mons.map((mm, idx) => `
        <div class="cp-practice-boss" data-boss-idx="${esc(String(idx))}" data-boss-card="${esc(String(idx))}" aria-label="${esc(String(mm.name || 'Monster'))}" ${mm.element ? `data-element="${esc(String(mm.element))}"` : ``}>
          <img class="cp-practice-bossimg" data-boss-img="${esc(String(idx))}" src="${esc(String(mm.img || 'images/Monsters/M004-Verdant_Maw/M004-Verdant_Maw.png'))}" alt="${esc(String(mm.name || 'Monster'))}" decoding="async" loading="lazy">
          <div class="cp-boss-hp" aria-label="Monster HP">
            <div class="cp-boss-hpbar">
              <div class="cp-boss-hpfill" data-boss-hpfill="${esc(String(idx))}"></div>
              <div class="cp-boss-hpoverlay" data-boss-hpoverlay="${esc(String(idx))}"></div>
            </div>
          </div>
        </div>
      `).join('');
    };
    const storyStage = (story?.mode === 'event_gold')
      ? 0
      : (story?.stage ? Math.max(1, Math.min(5, Math.floor(Number(story.stage) || 1))) : 0);
    return `
      <div class="cp-practice" ${storyStage ? `data-story-stage="${esc(String(storyStage))}"` : ``}>
        <div class="cp-practice-bg" aria-hidden="true">
          <img id="cpPracticeBgImg" class="cp-practice-bgimg" src="${esc(bgSrc)}" alt="" aria-hidden="true">
        </div>
        <div class="cp-practice-left">
          <div class="cp-boss-arena" id="cpBossArena" aria-label="Monster arena">
            ${renderBossCards(monstersMeta)}
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
    try { window.__cpActionLocked = false; } catch {}
    try { window.__cpPracticeCombatInFlight = false; } catch {}

    const row = document.getElementById('cpPracticeTeamRow');
    const bgImg = document.getElementById('cpPracticeBgImg');
    const hpFill = document.getElementById('cpTeamHpFill');
    const hpOverlay = document.getElementById('cpTeamHpOverlay');
    const rcvOverlay = document.getElementById('cpTeamRcvOverlay');
    const hintEl = document.getElementById('cpPracticeHint');
    const bossArena = document.getElementById('cpBossArena');

    const renderBossArena = (monstersLike) => {
      if (!bossArena) return;
      const mons = (Array.isArray(monstersLike) ? monstersLike : [])
        .filter(Boolean)
        .slice(0, 4);
      bossArena.innerHTML = mons.map((mm, idx) => `
        <div class="cp-practice-boss" data-boss-idx="${esc(String(idx))}" data-boss-card="${esc(String(idx))}" aria-label="${esc(String(mm.name || 'Monster'))}" ${mm.element ? `data-element="${esc(String(mm.element))}"` : ``}>
          <img class="cp-practice-bossimg" data-boss-img="${esc(String(idx))}" src="${esc(String(mm.img || 'images/Monsters/M004-Verdant_Maw/M004-Verdant_Maw.png'))}" alt="${esc(String(mm.name || 'Monster'))}" decoding="async" loading="lazy">
          <div class="cp-boss-hp" aria-label="Monster HP">
            <div class="cp-boss-hpbar">
              <div class="cp-boss-hpfill" data-boss-hpfill="${esc(String(idx))}"></div>
              <div class="cp-boss-hpoverlay" data-boss-hpoverlay="${esc(String(idx))}"></div>
            </div>
          </div>
        </div>
      `).join('');
    };

    const setActiveMonsterUI = (idx, opts = {}) => {
      const b = getBattle();
      const monsters = Array.isArray(b.monsters) ? b.monsters : [];
      const i = Math.max(0, Math.min(monsters.length - 1, Math.floor(Number(idx) || 0)));
      const t = monsters[i];
      if (!t) return;
      if (opts?.manual === true && (Number(t?.hp) || 0) <= 0) return;
      b.targetMonsterIdx = i;
      // If user explicitly clicked a target, we keep it until they change it.
      if (opts?.manual === true) {
        b.userPickedTarget = true;
        b.manualTargetIdx = i;
      } else if (opts?.manual === false && !b.userPickedTarget) {
        b.manualTargetIdx = -1;
      }
      // Keep back-compat single-monster fields in sync with current target
      b.monsterLevel = t.level;
      b.monsterMaxHp = t.maxHp;
      b.monsterAtk = t.atk;
      b.monsterHp = t.hp;
      // Seen-state is based on encounter. Ensure selected/visible monster is recorded.
      try { addSeenMonsterId(String(t.monsterId || '').trim().padStart(3, '0')); } catch {}
      updateHpUI();
    };

    bossArena?.addEventListener('click', (ev) => {
      const card = ev?.target?.closest?.('[data-boss-idx]');
      if (!card) return;
      try { ev.preventDefault(); } catch {}
      try { ev.stopPropagation(); } catch {}
      const idx = Math.max(0, Math.floor(Number(card.getAttribute('data-boss-idx')) || 0));
      setActiveMonsterUI(idx, { manual: true });
    }, { passive: false });
    const practiceRootForCancel = document.querySelector('.cp-practice');
    practiceRootForCancel?.addEventListener('click', (ev) => {
      const target = ev?.target;
      if (!target || typeof target.closest !== 'function') return;
      if (target.closest('[data-boss-idx]')) return;
      if (target.closest('button, a, input, select, textarea, [role="button"], #chessPalGame, .cp-practice-team, .cp-top-tools, .cp-popover')) return;
      const b = getBattle();
      if (!b.userPickedTarget) return;
      b.userPickedTarget = false;
      b.manualTargetIdx = -1;
      updateHpUI();
    }, { passive: true });

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
    document.querySelectorAll('[data-boss-img]').forEach((img) => fadeInImage(img));

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

      // Visual target lock indicator on the main monster area
      try {
        if (monsters && monsters.length) {
          const manualIdx = (b.userPickedTarget && Number.isFinite(Number(b.manualTargetIdx)))
            ? Math.max(0, Math.min(monsters.length - 1, Math.floor(Number(b.manualTargetIdx))))
            : -1;
          monsters.forEach((mm, idx) => {
            const mx = Math.max(0, Number(mm?.maxHp) || 0);
            const mh = Math.max(0, Math.min(mx, Number(mm?.hp) || 0));
            const fill = document.querySelector(`[data-boss-hpfill="${CSS.escape(String(idx))}"]`);
            const overlay = document.querySelector(`[data-boss-hpoverlay="${CSS.escape(String(idx))}"]`);
            const card = document.querySelector(`[data-boss-card="${CSS.escape(String(idx))}"]`);
            if (fill) fill.style.width = mx > 0 ? `${Math.max(0, Math.min(1, mh / mx)) * 100}%` : '0%';
            if (overlay) overlay.textContent = mx > 0 ? `${mh}/${mx}` : '';
            if (card) {
              card.classList.toggle('is-selected', idx === manualIdx);
              card.classList.toggle('cp-dead', mh <= 0);
            }
          });
        } else {
          const card0 = document.querySelector('[data-boss-card="0"]');
          const fill0 = document.querySelector('[data-boss-hpfill="0"]');
          const overlay0 = document.querySelector('[data-boss-hpoverlay="0"]');
          if (fill0) fill0.style.width = mMax > 0 ? `${Math.max(0, Math.min(1, mHp / mMax)) * 100}%` : '0%';
          if (overlay0) overlay0.textContent = mMax > 0 ? `${mHp}/${mMax}` : '';
          if (card0) card0.classList.toggle('cp-dead', (Number(b.monsterHp) || 0) <= 0);
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
    const getMonsterNpcSkillCd = (monsterDefLike) => {
      const m = (monsterDefLike && typeof monsterDefLike === 'object') ? monsterDefLike : {};
      const a = (m.activeSkill && typeof m.activeSkill === 'object') ? m.activeSkill : { params: {}, cd: 0 };
      const p = (a.params && typeof a.params === 'object') ? a.params : {};
      const explicit = Number(p.npcCd);
      if (Number.isFinite(explicit)) return Math.max(0, Math.min(8, Math.floor(explicit)));
      const dmg = Math.max(0, Number(p.dmg) || 0);
      const healFlat = Math.max(0, Number(p.healFlat) || 0);
      const healPct = Math.max(0, Number(p.healMaxHpPctPerTurn) || 0);
      const guard = Math.max(0, Number(p.damageReduction) || 0);
      const atkMult = Math.max(1, Number(p.atkMultThisTurn) || 1);
      const convertList = Array.isArray(p.convert) ? p.convert : (p.convert ? [p.convert] : []);
      const convertCount = convertList.reduce((s, it) => s + Math.max(0, Math.floor(Number(it?.count) || 0)), 0);
      let score = 0;
      if (dmg >= 220) score += 2; else if (dmg >= 90) score += 1;
      if (healFlat >= 420 || healPct >= 0.08) score += 2; else if (healFlat >= 140 || healPct >= 0.03) score += 1;
      if (guard >= 0.20) score += 2; else if (guard >= 0.10) score += 1;
      if (atkMult >= 1.15) score += 1;
      if (convertCount >= 3) score += 1;
      if (score <= 1) return 0;
      if (score <= 3) return 3;
      return 4;
    };

    const showStoryHintIfAny = () => {
      try {
        const st = window.__cpStoryStage;
        if (hintEl && st) {
          const t = String(st.hint || '').trim();
          if (!t) {
            hintEl.textContent = '';
            hintEl.style.display = 'none';
            return;
          }
          hintEl.textContent = t;
          hintEl.style.display = '';
        } else if (hintEl) {
          hintEl.textContent = '';
          hintEl.style.display = 'none';
        }
      } catch {}
    };
    const showMonsterSkillNotice = (text, ms = 1800) => {
      try {
        const msg = String(text || '').trim();
        if (!msg) return;
        let el = document.getElementById('cpMonsterSkillToast');
        if (!el) {
          el = document.createElement('div');
          el.id = 'cpMonsterSkillToast';
          el.className = 'cp-monster-skill-toast';
          document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add('is-show');
        const portrait = !!(window.matchMedia && window.matchMedia('(max-width: 820px) and (orientation: portrait)').matches);
        if (portrait) {
          el.style.left = '50%';
          el.style.top = '10px';
          el.style.transform = 'translateX(-50%)';
        } else {
          const leftPane = document.querySelector('.cp-practice-left');
          const rect = leftPane?.getBoundingClientRect?.();
          const left = rect ? (rect.left + 8) : 12;
          const top = rect ? (rect.top + 8) : 12;
          el.style.left = `${Math.max(8, Math.floor(left))}px`;
          el.style.top = `${Math.max(8, Math.floor(top))}px`;
          el.style.transform = 'none';
        }
        try { clearTimeout(window.__cpMonsterSkillToastTimer); } catch {}
        window.__cpMonsterSkillToastTimer = setTimeout(() => {
          try { el.classList.remove('is-show'); } catch {}
        }, Math.max(800, Math.floor(Number(ms) || 1800)));
      } catch {}
    };
    showStoryHintIfAny();

    const awardStoryDropIfAny = (cfg, opts = {}) => {
      try {
        const applyNow = opts?.apply !== false;
        const mons = normalizeStageMonsters(cfg || {});
        const allItemDrops = [];
        const allMonsterDrops = [];
        let duplicateMonsterExp = 0;

        const rollOneItem = (dropsLike) => {
          const pool = (Array.isArray(dropsLike) ? dropsLike : [])
            .map((d) => ({
              itemId: String(d?.itemId || '').trim().toLowerCase(),
              chance: Math.max(0, Math.min(100, Math.floor(Number(d?.chance) || 0))),
              qty: Math.max(1, Math.min(999, Math.floor(Number(d?.qty) || 1))),
            }))
            .filter((d) => d.itemId && d.chance > 0 && !!getStorageItemDef(d.itemId));
          if (!pool.length) return null;
          const total = pool.reduce((s, d) => s + d.chance, 0);
          if (!(total > 0)) return null;
          const rollMax = total < 100 ? 100 : total;
          let r = Math.random() * rollMax;
          if (total < 100 && r >= total) return null;
          for (const d of pool) {
            r -= d.chance;
            if (r <= 0) return d;
          }
          return null;
        };

        let slots = applyNow ? loadStorage() : null;
        for (const mm of mons) {
          const itemRoll = rollOneItem(mm?.drops);
          if (itemRoll && itemRoll.itemId) {
            const itemId = String(itemRoll.itemId || '').trim().toLowerCase();
            const qty = Math.max(1, Math.min(999, Math.floor(Number(itemRoll.qty) || 1)));
            if (applyNow) {
              const before = JSON.stringify(slots);
              slots = addItemToStorage(slots, itemId, qty);
              if (JSON.stringify(slots) !== before) {
                for (let q = 0; q < qty; q += 1) allItemDrops.push(itemId);
              }
            } else {
              for (let q = 0; q < qty; q += 1) allItemDrops.push(itemId);
            }
          }

          const joinChance = Math.max(0, Math.min(100, Math.floor(Number(mm?.monsterDropChance) || 0)));
          if (joinChance > 0 && Math.random() * 100 < joinChance) {
            const mid = String(mm?.monsterId || '').trim().padStart(3, '0');
            if (/^\d{3}$/.test(mid)) {
              if (applyNow) {
                const r = addOwnedMonsterId(mid) || {};
                if (r.duplicate && Number(r.expGained) > 0) duplicateMonsterExp += Math.floor(Number(r.expGained) || 0);
                if (r.added || r.duplicate) allMonsterDrops.push(mid);
              } else {
                allMonsterDrops.push(mid);
              }
            }
          }
        }

        // Back-compat: if stage-level drops exist, roll one extra item.
        const extraStageItem = rollOneItem(cfg?.drops);
        if (extraStageItem && extraStageItem.itemId) {
          const itemId = String(extraStageItem.itemId || '').trim().toLowerCase();
          const qty = Math.max(1, Math.min(999, Math.floor(Number(extraStageItem.qty) || 1)));
          if (applyNow) {
            const before = JSON.stringify(slots);
            slots = addItemToStorage(slots, itemId, qty);
            if (JSON.stringify(slots) !== before) {
              for (let q = 0; q < qty; q += 1) allItemDrops.push(itemId);
            }
          } else {
            for (let q = 0; q < qty; q += 1) allItemDrops.push(itemId);
          }
        }

        if (applyNow) saveStorage(slots);
        if (applyNow && hintEl) {
          const itemNames = allItemDrops
            .map((id) => getStorageItemDef(id)?.name || id)
            .filter(Boolean);
          const monNames = allMonsterDrops
            .map((id) => getMonsterFromDbQuick(id)?.name || `#${id}`)
            .filter(Boolean);
          const parts = [];
          if (itemNames.length) parts.push(`Items: ${itemNames.join(', ')}`);
          if (monNames.length) parts.push(`Monsters: ${monNames.join(', ')}`);
          if (parts.length) {
            if (duplicateMonsterExp > 0) parts.push(`Duplicate Monster EXP +${duplicateMonsterExp}`);
            hintEl.textContent = `Drop: ${parts.join(' | ')}`;
            hintEl.style.display = '';
            setTimeout(() => { try { showStoryHintIfAny(); } catch {} }, 2600);
          }
        }
        return { items: allItemDrops, monsters: allMonsterDrops, duplicateMonsterExp };
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

    const isStoryBattleActive = () => {
      try {
        const st = window.__cpStoryStage;
        return !!(st && Number(st.chapter) && Number(st.stage));
      } catch {
        return false;
      }
    };
    const isEventGoldBattleActive = () => {
      try {
        const st = window.__cpStoryStage;
        return !!(st && String(st.mode || '') === 'event_gold' && Number(st.stage));
      } catch {
        return false;
      }
    };

    const ensureStoryRunSession = () => {
      try {
        const st = window.__cpStoryStage;
        if (!st || !Number(st.chapter)) return null;
        const ch = Math.max(1, Math.min(10, Math.floor(Number(st.chapter) || 1)));
        const existing = window.__cpStoryRunSession;
        if (existing && existing.active && Number(existing.chapter) === ch) return existing;
        const sess = {
          active: true,
          chapter: ch,
          startedAt: Date.now(),
          itemDrops: [],
          monsterDrops: [],
          expGain: 0,
          defeatedMonsters: [],
          completed: false,
          resignHandled: false,
        };
        window.__cpStoryRunSession = sess;
        try { window.__cpStageItemDrops = []; } catch {}
        return sess;
      } catch {
        return null;
      }
    };

    const clearStoryRunSession = () => {
      try { window.__cpStoryRunSession = null; } catch {}
      try { window.__cpStageItemDrops = []; } catch {}
    };
    const ensureEventGoldRunSession = () => {
      try {
        const st = window.__cpStoryStage;
        if (!st || String(st.mode || '') !== 'event_gold' || !Number(st.chapter)) return null;
        const ch = Math.max(1, Math.min(3, Math.floor(Number(st.chapter) || 1)));
        const existing = window.__cpEventGoldRunSession;
        if (existing && existing.active && Number(existing.chapter) === ch) return existing;
        const sess = {
          active: true,
          chapter: ch,
          startedAt: Date.now(),
          itemDrops: [],
          monsterDrops: [],
          expGain: 0,
          completed: false,
          resignHandled: false,
        };
        window.__cpEventGoldRunSession = sess;
        try { window.__cpStageItemDrops = []; } catch {}
        return sess;
      } catch {
        return null;
      }
    };
    const clearEventGoldRunSession = () => {
      try { window.__cpEventGoldRunSession = null; } catch {}
      try { window.__cpStageItemDrops = []; } catch {}
    };

    const pushUnique = (arr, value) => {
      const a = Array.isArray(arr) ? arr : [];
      if (!a.includes(value)) a.push(value);
      return a;
    };

    const calcStagePlayerExp = (cfg) => {
      try {
        const mons = normalizeStageMonsters(cfg || {});
        let sum = 0;
        for (const mm of mons) {
          const id = String(mm?.monsterId || '').trim().padStart(3, '0');
          const lv = Math.max(1, Math.floor(Number(mm?.level) || 1));
          const mon = getMonsterFromDbQuick(id);
          const rarity = Math.max(1, Math.min(10, Math.floor(Number(mon?.rarity) || 1)));
          // PAD-like non-linear stage reward component by level/rarity.
          sum += Math.floor(28 + (rarity * 14) + (Math.pow(lv, 1.15) * 6));
        }
        return Math.max(0, sum);
      } catch {
        return 0;
      }
    };

    const showFailResignModal = () => {
      const old = document.getElementById('cpResultOverlay');
      if (old) old.remove();
      const overlay = document.createElement('div');
      overlay.id = 'cpResultOverlay';
      overlay.className = 'cp-modal-overlay';
      overlay.innerHTML = `
        <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Battle failed">
          <div class="cp-modal-body" style="text-align:center; padding:24px;">
            <div class="cp-h1" style="font-size:28px;">Fail</div>
            <div class="cp-muted" style="margin-top:10px;">You resigned. Rewards from this chapter run were discarded.</div>
            <div class="cp-row" style="justify-content:center; margin-top:16px;">
              <button class="cp-primary" type="button" id="cpResultBackHome">Back to Home</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector('#cpResultBackHome')?.addEventListener('click', () => {
        try { overlay.remove(); } catch {}
        try { Router.goTo('/home'); } catch {}
      }, { passive: true });
    };

    const showStoryDefeatSettleModal = ({ onRevive, onGiveUp }) => {
      const old = document.getElementById('cpResultOverlay');
      if (old) old.remove();
      const overlay = document.createElement('div');
      overlay.id = 'cpResultOverlay';
      overlay.className = 'cp-modal-overlay';
      overlay.innerHTML = `
        <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Battle defeated">
          <div class="cp-modal-body" style="text-align:center; padding:24px;">
            <div class="cp-h1" style="font-size:28px;">Defeated</div>
            <div class="cp-muted" style="margin-top:10px;">No rewards are granted for this run.</div>
            <div class="cp-row" style="justify-content:center; gap:10px; margin-top:16px; flex-wrap:wrap;">
              <button class="cp-primary" type="button" id="cpResultRevive">Revive (Gold Coin x1)</button>
              <button class="cp-tool-btn" type="button" id="cpResultGiveUp">Give up</button>
            </div>
            <div class="cp-muted" id="cpResultDefeatMsg" style="margin-top:10px;"></div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const setMsg = (t) => {
        const msg = overlay.querySelector('#cpResultDefeatMsg');
        if (msg) msg.textContent = String(t || '');
      };
      overlay.querySelector('#cpResultRevive')?.addEventListener('click', async () => {
        try {
          const ok = await Promise.resolve(typeof onRevive === 'function' ? onRevive() : false);
          if (ok) {
            try { overlay.remove(); } catch {}
            return;
          }
        } catch {}
        setMsg('Not enough Gold Coin.');
      });
      overlay.querySelector('#cpResultGiveUp')?.addEventListener('click', () => {
        try { overlay.remove(); } catch {}
        try { if (typeof onGiveUp === 'function') onGiveUp(); } catch {}
      }, { passive: true });
    };

    const showChapterClearModal = ({ chapter, itemIds, monsterIds, expGain, levelInfo, backRoute = '/home', backLabel = 'Back to Home' }) => {
      const old = document.getElementById('cpResultOverlay');
      if (old) old.remove();
      let resolvedBackRoute = String(backRoute || '/home');
      let resolvedBackLabel = String(backLabel || 'Back to Home');
      try {
        if (window.ChessPalTutorialFlow?.isActive?.() && Math.floor(Number(chapter) || 0) === 1) {
          resolvedBackRoute = '/home';
          resolvedBackLabel = 'Back to Home';
          window.ChessPalTutorialFlow?.onChapterClearShown?.(1);
        }
      } catch {}
      const toCountEntries = (idsLike) => {
        const m = new Map();
        (Array.isArray(idsLike) ? idsLike : []).forEach((idLike) => {
          const id = String(idLike || '').trim().toLowerCase();
          if (!id) return;
          m.set(id, (m.get(id) || 0) + 1);
        });
        return Array.from(m.entries());
      };
      const itemRows = toCountEntries(itemIds)
        .map(([id, qty]) => {
          const def = getStorageItemDef(id);
          return `
            <li style="display:flex; align-items:center; gap:8px; margin-top:6px;">
              ${def?.img ? `<img src="${esc(String(def.img))}" alt="${esc(String(def?.name || id))}" style="width:32px;height:32px;object-fit:contain;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.2);">` : ``}
              <span>${esc(String(def?.name || id))}</span>
              <span style="opacity:0.9;">×${esc(String(qty))}</span>
            </li>
          `;
        }).join('');
      const monRows = toCountEntries(monsterIds)
        .map(([id, qty]) => {
          const mon = getMonsterFromDbQuick(id);
          const mimg = String(mon?.mini || mon?.img || '').trim();
          return `
            <li style="display:flex; align-items:center; gap:8px; margin-top:6px;">
              ${mimg ? `<img src="${esc(mimg)}" alt="${esc(String(mon?.name || `#${id}`))}" style="width:32px;height:32px;object-fit:contain;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.2);">` : ``}
              <span>${esc(String(mon?.name || `#${id}`))}</span>
              <span style="opacity:0.9;">×${esc(String(qty))}</span>
            </li>
          `;
        }).join('');
      const beforeLevel = Math.max(1, Math.floor(Number(levelInfo?.before?.level) || Number(levelInfo?.after?.level) || Number(levelInfo?.level) || 1));
      const afterLevel = Math.max(1, Math.floor(Number(levelInfo?.after?.level) || Number(levelInfo?.level) || beforeLevel));
      const beforePct = Math.max(0, Math.min(100, Math.round((Number(levelInfo?.before?.progress) || 0) * 100)));
      const afterPct = Math.max(0, Math.min(100, Math.round((Number(levelInfo?.after?.progress) || Number(levelInfo?.progress) || 0) * 100)));
      const overlay = document.createElement('div');
      overlay.id = 'cpResultOverlay';
      overlay.className = 'cp-modal-overlay';
      overlay.innerHTML = `
        <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Chapter clear">
          <div class="cp-modal-body" style="padding:22px;">
            <div class="cp-h1" style="font-size:24px; text-align:center;">Chapter ${esc(String(chapter))} Clear</div>
            <div class="cp-setting-help" style="margin-top:12px;">Player EXP</div>
            <div class="cp-row" style="justify-content:space-between;">
              <div>+${esc(String(expGain || 0))} EXP</div>
              <div id="cpResultLvText">Lv ${esc(String(beforeLevel))}${afterLevel !== beforeLevel ? ` -> Lv ${esc(String(afterLevel))}` : ''}</div>
            </div>
            <div style="margin-top:8px;">
              <div style="height:10px; border-radius:999px; overflow:hidden; border:1px solid rgba(255,255,255,0.16); background:rgba(255,255,255,0.08);">
                <div id="cpResultExpFill" style="height:100%; width:${esc(String(beforePct))}%; background:linear-gradient(90deg, rgba(59,130,246,0.95), rgba(125,211,252,0.95));"></div>
              </div>
            </div>
            <div class="cp-setting-help" id="cpResultExpText" style="margin-top:6px;">EXP Progress ${esc(String(beforePct))}%</div>
            <div class="cp-setting-help" style="margin-top:12px;">Items</div>
            <ul style="margin:6px 0 0 18px;">${itemRows || '<li>(None)</li>'}</ul>
            <div class="cp-setting-help" style="margin-top:12px;">Monsters</div>
            <ul style="margin:6px 0 0 18px;">${monRows || '<li>(None)</li>'}</ul>
            <div class="cp-row" style="justify-content:center; margin-top:16px;">
              <button class="cp-primary" type="button" id="cpResultBackStory">${esc(String(resolvedBackLabel || 'Back to Home'))}</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      setTimeout(() => {
        const fill = overlay.querySelector('#cpResultExpFill');
        const expText = overlay.querySelector('#cpResultExpText');
        if (fill) {
          fill.style.transition = 'none';
          fill.style.width = `${beforePct}%`;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              fill.style.transition = 'width 1100ms ease';
              fill.style.width = `${afterPct}%`;
            });
          });
        }
        if (expText) {
          const start = beforePct;
          const end = afterPct;
          const started = Date.now();
          const duration = 1100;
          const tick = () => {
            const t = Math.min(1, (Date.now() - started) / duration);
            const now = Math.round(start + (end - start) * t);
            expText.textContent = `EXP Progress ${now}%`;
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      }, 80);
      overlay.querySelector('#cpResultBackStory')?.addEventListener('click', () => {
        try { overlay.remove(); } catch {}
        try { window.ChessPalTutorialFlow?.onChapterClearBack?.(Math.floor(Number(chapter) || 0)); } catch {}
        try { Router.goTo(String(resolvedBackRoute || '/home')); } catch {}
      }, { passive: true });
    };

    const resignStoryRunIfAny = () => {
      try {
        if (!isStoryBattleActive()) return false;
        if (isEventGoldBattleActive()) {
          const esess = window.__cpEventGoldRunSession;
          if (!esess || !esess.active || esess.completed) return false;
          if (esess.resignHandled) return true;
          esess.resignHandled = true;
          clearEventGoldRunSession();
          showFailResignModal();
          return true;
        }
        const sess = window.__cpStoryRunSession;
        if (!sess || !sess.active || sess.completed) return false;
        if (sess.resignHandled) return true;
        sess.resignHandled = true;
        clearStoryRunSession();
        showFailResignModal();
        return true;
      } catch {
        return false;
      }
    };

    try {
      window.__cpResignStoryRun = resignStoryRunIfAny;
      window.__cpCanLeaveBattle = (fromPath, toPath) => {
        try {
          const from = String(fromPath || '');
          const to = String(toPath || '');
          const inStory = from.startsWith('/mode/story/ch');
          const stayStory = to.startsWith('/mode/story/ch');
          const inEvent = from.startsWith('/mode/challenge/event/gold/ch');
          const stayEvent = to.startsWith('/mode/challenge/event/gold/ch');
          if (!inStory && !inEvent) return true;
          if ((inStory && stayStory) || (inEvent && stayEvent)) return true;
          if (resignStoryRunIfAny()) return false;
          return true;
        } catch {
          return true;
        }
      };
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
        window.__cpActionLocked = true;
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
        const heartOrbHealBonusPct = Number.isFinite(Number(gs?.heartOrbHealBonusPct)) ? Number(gs.heartOrbHealBonusPct) : 0.01;

        b = getBattle();
        const hpBar = document.querySelector('.cp-team-hpbar');
        const getBossVisualByIdx = (idxLike) => {
          const idx = Math.max(0, Math.floor(Number(idxLike) || 0));
          const box = document.querySelector(`[data-boss-card="${CSS.escape(String(idx))}"]`);
          const img = document.querySelector(`[data-boss-img="${CSS.escape(String(idx))}"]`);
          return { box, img };
        };
        const getTargetBossVisual = () => {
          const idx = Number.isFinite(Number(b?.targetMonsterIdx)) ? Math.floor(Number(b.targetMonsterIdx)) : 0;
          return getBossVisualByIdx(idx);
        };
        const makePointAnchor = (x, y) => {
          const ax = Number(x) || 0;
          const ay = Number(y) || 0;
          if (!(ax > 0 && ay > 0)) return null;
          const el = document.createElement('div');
          el.style.position = 'fixed';
          el.style.left = `${ax}px`;
          el.style.top = `${ay}px`;
          el.style.width = '1px';
          el.style.height = '1px';
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          el.style.zIndex = '1';
          document.body.appendChild(el);
          return el;
        };
        const multiplierEvents = Array.isArray(window.__cpPracticePathMultipliers) ? window.__cpPracticePathMultipliers : [];
        const showDamageFloat = (value, element, mult, hostEl) => {
          const host = hostEl || getTargetBossVisual().box || getTargetBossVisual().img;
          if (!host) return;
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
          host.appendChild(el);
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
        const clampNum = (v, lo, hi, fallback = 0) => {
          const n = Number(v);
          if (!Number.isFinite(n)) return fallback;
          return Math.max(lo, Math.min(hi, n));
        };
        const getMonsterSkillSpec = (monsterLike) => {
          const mid = String(monsterLike?.monsterId || '').trim().padStart(3, '0');
          const mdef = getMonsterBase(mid) || getMonsterFromDbQuick(mid) || {};
          const passive = (mdef?.passiveSkill && typeof mdef.passiveSkill === 'object') ? mdef.passiveSkill : { params: {} };
          const active = (mdef?.activeSkill && typeof mdef.activeSkill === 'object') ? mdef.activeSkill : { params: {}, cd: 0 };
          const passiveParams = (passive?.params && typeof passive.params === 'object') ? passive.params : {};
          const activeParams = (active?.params && typeof active.params === 'object') ? active.params : {};
          const rawActiveCd = Number(active?.cd);
          const activeCd = (Number.isFinite(rawActiveCd) && rawActiveCd >= 0 && rawActiveCd <= 4)
            ? Math.floor(rawActiveCd)
            : getMonsterNpcSkillCd(mdef);
          return { mid, mdef, passiveParams, activeParams, activeCd, activeName: String(active?.name || 'Skill') };
        };
        const getMonsterPassiveCombatFx = (monsterLike) => {
          const spec = getMonsterSkillSpec(monsterLike);
          const p = spec.passiveParams || {};
          const hp = Math.max(0, Number(monsterLike?.hp) || 0);
          const hpMax = Math.max(1, Number(monsterLike?.maxHp) || 1);
          const lowHp = (hp / hpMax) <= 0.5;
          const element = String(monsterLike?.element || '').toLowerCase();
          const atkBonus = clampNum(p.atkBonus, -0.5, 2.0, 0);
          const lowHpAtkBonus = lowHp ? clampNum(p.lowHpAtkBonus, 0, 1.5, 0) : 0;
          const elemBonusKey = `${element}DmgBonus`;
          const elemAtkBonus = clampNum(p?.[elemBonusKey], -0.5, 1.5, 0);
          // Some early placeholders used slow/miss/evasion wording. Normalize them as dodge chance.
          const dodgeChance = clampNum((Number(p.evasion) || 0) + (Number(p.enemyMissChance) || 0) + (Number(p.slowChance) || 0) * 0.5, 0, 0.45, 0);
          const incomingReduction = clampNum(p.damageReduction, 0, 0.75, 0);
          const regenPct = clampNum(p.healMaxHpPctPerTurn, 0, 0.2, 0);
          const aftershockAtkBonus = clampNum(p.aftershockAtkBonus, 0, 1.0, 0);
          return {
            incomingReduction,
            dodgeChance,
            regenPct,
            aftershockAtkBonus,
            atkMult: Math.max(0.1, 1 + atkBonus + lowHpAtkBonus + elemAtkBonus),
          };
        };
        const getMonsterActiveCombatFx = (monsterLike) => {
          const spec = getMonsterSkillSpec(monsterLike);
          const a = spec.activeParams || {};
          const convertList = Array.isArray(a.convert) ? a.convert : (a.convert ? [a.convert] : []);
          const convertCount = convertList.reduce((s, it) => s + Math.max(0, Math.floor(Number(it?.count) || 0)), 0);
          // Board-convert/time effects are normalized into combat buffs for NPC usage.
          const bonusFromConvert = clampNum(convertCount * 0.03, 0, 0.25, 0);
          const bonusFromTime = clampNum(Number(a.extraTimeSec) * 0.05, 0, 0.2, 0);
          const atkMultThisTurn = Math.max(0.1, 1 + clampNum(a.atkMultThisTurn, -0.7, 2.0, 0) + bonusFromConvert + bonusFromTime);
          const dmgFlat = Math.max(0, Math.floor(Number(a.dmg) || 0));
          const healFlat = Math.max(0, Math.floor(Number(a.healFlat) || 0));
          const healPct = clampNum(a.healMaxHpPctPerTurn, 0, 0.2, 0);
          const guard = clampNum(a.damageReduction, 0, 0.65, 0);
          const reflectPct = clampNum(a.reflectPct, 0, 0.9, 0);
          const elementLockRounds = Math.max(0, Math.floor(Number(a.elementLockRounds) || 0));
          const purgePlayerBuffs = !!a.purgePlayerBuffs;
          const selfHpCostPct = clampNum(a.selfHpCostPct, 0, 0.9, 0);
          const executeThresholdPct = clampNum(a.executeThresholdPct, 0, 1, 0);
          const executeFlatBonus = Math.max(0, Math.floor(Number(a.executeFlatBonus) || 0));
          const hasEffect = atkMultThisTurn !== 1 || dmgFlat > 0 || healFlat > 0 || healPct > 0 || guard > 0 || reflectPct > 0 || elementLockRounds > 0 || purgePlayerBuffs || selfHpCostPct > 0 || executeFlatBonus > 0;
          const firstCd = Number.isFinite(Number(monsterLike?.skillFirstCd))
            ? Math.max(0, Math.floor(Number(monsterLike.skillFirstCd) || 0))
            : spec.activeCd;
          const cycleCd = Number.isFinite(Number(monsterLike?.skillCycleCd))
            ? Math.max(0, Math.floor(Number(monsterLike.skillCycleCd) || 0))
            : spec.activeCd;
          return {
            cd: firstCd,
            cycleCd,
            name: spec.activeName,
            hasEffect,
            atkMultThisTurn,
            dmgFlat,
            healFlat,
            healPct,
            guard,
            reflectPct,
            elementLockRounds,
            purgePlayerBuffs,
            selfHpCostPct,
            executeThresholdPct,
            executeFlatBonus,
          };
        };
        const describeMonsterActiveFx = (fx) => {
          const parts = [];
          if (Number(fx?.atkMultThisTurn) > 1.01) parts.push(`ATK x${Number(fx.atkMultThisTurn).toFixed(2)}`);
          if (Number(fx?.dmgFlat) > 0) parts.push(`extra ${Math.floor(Number(fx.dmgFlat) || 0)} damage`);
          if (Number(fx?.healFlat) > 0 || Number(fx?.healPct) > 0) parts.push('self-heal');
          if (Number(fx?.guard) > 0) parts.push(`guard ${Math.round(Number(fx.guard) * 100)}%`);
          if (Number(fx?.reflectPct) > 0) parts.push(`reflect ${Math.round(Number(fx.reflectPct) * 100)}%`);
          if (Number(fx?.elementLockRounds) > 0) parts.push(`element lock ${Math.floor(Number(fx.elementLockRounds) || 0)} turn`);
          if (fx?.purgePlayerBuffs) parts.push('purge player buffs');
          if (Number(fx?.executeFlatBonus) > 0 && Number(fx?.executeThresholdPct) > 0) parts.push(`execute <${Math.round(Number(fx.executeThresholdPct) * 100)}% HP`);
          return parts.join(', ') || 'special attack';
        };
        const syncTargetBackCompat = () => {
          try {
            const mons = Array.isArray(b?.monsters) ? b.monsters : null;
            if (!mons || !mons.length) return;
            const ti = Number.isFinite(Number(b?.targetMonsterIdx)) ? Math.floor(Number(b.targetMonsterIdx)) : 0;
            const t = mons[Math.max(0, Math.min(mons.length - 1, ti))];
            if (!t) return;
            b.monsterHp = Math.max(0, Number(t.hp) || 0);
            b.monsterMaxHp = Math.max(1, Number(t.maxHp) || 1);
            b.monsterAtk = Math.max(0, Number(t.atk) || 0);
          } catch {}
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
        const counts = (window.__cpPracticeElementCounts && typeof window.__cpPracticeElementCounts === 'object') ? window.__cpPracticeElementCounts : {};
        const consumedOrbs = Object.values(counts).reduce((sum, n) => sum + Math.max(0, Math.floor(Number(n) || 0)), 0);
        const healFactor = 1 + consumedOrbs * Math.max(0, Math.min(0.1, heartOrbHealBonusPct));
        const heal = Math.max(0, Math.round(totalRcv * heartScore * rcvMul * healFactor));
        if (heal > 0) {
          const pMax = Math.max(0, Number(b.playerMaxHp) || 0);
          b.playerHp = Math.max(0, Math.min(pMax, (Number(b.playerHp) || 0) + heal));
          updateHpUI();
        }

        if (!b.teamExecuteMarks || typeof b.teamExecuteMarks !== 'object') b.teamExecuteMarks = {};
        const lockedRounds = Math.max(0, Math.floor(Number(b.playerElementLockRounds) || 0));
        let lockedElement = lockedRounds > 0 ? String(b.playerElementLockElement || '').toLowerCase() : '';

        // Player attacks monster: beams from each unit mini center → monster center (sequential)
        for (let i = 0; i < 4; i += 1) {
          const id = team[i];
          const unit = id ? getTeamUnit(id) : null;
          if (!unit) continue;
          const currentTarget = (() => {
            try {
              if (monsters && monsters.length) {
                const idx = Number.isFinite(Number(b.targetMonsterIdx)) ? Math.floor(Number(b.targetMonsterIdx)) : 0;
                return monsters[Math.max(0, Math.min(monsters.length - 1, idx))] || null;
              }
            } catch {}
            return null;
          })();
          const bossEl = String(currentTarget?.element || getBossBase()?.element || '').toLowerCase();
          const el = String(unit.element || '');
          const elScore = Number(elementScores?.[el] || 0);
          if (lockedRounds > 0 && elScore > 0) {
            const curEl = String(el || '').toLowerCase();
            if (lockedElement && curEl && curEl !== lockedElement) continue;
            if (!lockedElement && curEl) {
              lockedElement = curEl;
              b.playerElementLockElement = curEl;
            }
          }
          const atk = Math.max(0, Number(unit.atk) || 0);
          const mult = elemMult(el, bossEl);
          const teamAtkBonus = Number.isFinite(Number(b.teamAtkBonus)) ? Number(b.teamAtkBonus) : 0;
          const elemBonus = (b.teamElemBonus && typeof b.teamElemBonus === 'object') ? Number(b.teamElemBonus[el] || 0) : 0;
          const atkMultThisTurn = Number.isFinite(Number(b.teamAtkMultThisTurn)) ? Number(b.teamAtkMultThisTurn) : 1;
          const dmg = Math.max(0, Math.round(atk * elScore * atkMul * mult * (1 + teamAtkBonus) * (1 + elemBonus) * atkMultThisTurn));
          if (dmg <= 0) continue;

          const targetVisual = getTargetBossVisual();
          const targetEl = targetVisual.img || targetVisual.box;
          const slotEl = row?.children?.[i] || null;
          // If path multipliers were earned, route them to the matching hero first,
          // then the hero fires at the target.
          const pathForHero = multiplierEvents
            .filter((pm) => String(pm?.element || '').toLowerCase() === String(el || '').toLowerCase() && Number(pm?.multiplier) >= 3)
            .sort((a, b2) => (Number(b2?.multiplier) || 0) - (Number(a?.multiplier) || 0))
            .slice(0, 2);
          for (const pm of pathForHero) {
            const anchor = makePointAnchor(pm?.x, pm?.y);
            if (!anchor || !slotEl) continue;
            await playBeamBetween({ fromEl: anchor, toEl: slotEl, variant: 'player' });
            try { anchor.remove(); } catch {}
            try { window.ChessPal?.removePathMultiplierFxById?.(pm?.fxId); } catch {}
          }
          await playBeamBetween({ fromEl: slotEl, toEl: targetEl, variant: 'player' });
          await shake(targetEl);
          const targetPassive = getMonsterPassiveCombatFx(currentTarget);
          const targetGuard = clampNum(currentTarget?.tempDamageReduction, 0, 0.75, 0);
          const dodge = clampNum(targetPassive?.dodgeChance, 0, 0.45, 0);
          if (dodge > 0 && Math.random() < dodge) {
            showDamageFloat(0, el, mult, targetVisual.box || targetVisual.img);
            continue;
          }
          const incomingReduction = clampNum((targetPassive?.incomingReduction || 0) + targetGuard, 0, 0.85, 0);
          let finalDmg = Math.max(0, Math.floor(dmg * (1 - incomingReduction)));
          const exec = b.teamExecuteMarks?.[String(unit?.key || '')];
          if (exec && Number.isFinite(Number(exec.thresholdPct)) && Number.isFinite(Number(exec.flatBonus))) {
            const curHp = Math.max(0, Number(currentTarget?.hp) || 0);
            const curMaxHp = Math.max(1, Number(currentTarget?.maxHp) || 1);
            if ((curHp / curMaxHp) < Math.max(0, Math.min(1, Number(exec.thresholdPct)))) {
              finalDmg += Math.max(0, Math.floor(Number(exec.flatBonus) || 0));
            }
          }
          showDamageFloat(finalDmg, el, mult, targetVisual.box || targetVisual.img);
          const mMax = Math.max(0, Number(b.monsterMaxHp) || 0);
          b.monsterHp = Math.max(0, Math.min(mMax, (Number(b.monsterHp) || 0) - finalDmg));
          // Sync into multi-monster pool (if any)
          try {
            if (monsters && monsters.length) {
              const ti = Number.isFinite(Number(b.targetMonsterIdx)) ? Math.floor(Number(b.targetMonsterIdx)) : 0;
              const t = monsters[Math.max(0, Math.min(monsters.length - 1, ti))];
              if (t) t.hp = Number(b.monsterHp) || 0;
              if (t && finalDmg > 0 && Number(elScore) >= 4) {
                const bonus = clampNum(targetPassive?.aftershockAtkBonus, 0, 1.0, 0);
                if (bonus > 0) t.aftershockPendingBonus = Math.max(0, Math.min(1.5, Number(t.aftershockPendingBonus) || 0) + bonus);
              }
              const reflectPct = clampNum(t?.reflectDamagePct, 0, 0.9, 0);
              if (t && reflectPct > 0 && finalDmg > 0) {
                const ref = Math.max(0, Math.floor(finalDmg * reflectPct));
                if (ref > 0) {
                  const pMax = Math.max(0, Number(b.playerMaxHp) || 0);
                  b.playerHp = Math.max(0, Math.min(pMax, (Number(b.playerHp) || 0) - ref));
                  updateHpUI();
                }
              }
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
            if (isEventGoldBattleActive()) {
              const chapterNum = Math.max(1, Math.min(3, Math.floor(Number(window.__cpStoryStage?.chapter) || 1)));
              const stageNum = Math.max(1, Math.min(5, Math.floor(Number(window.__cpStoryStage?.stage) || 1)));
              const sess = ensureEventGoldRunSession();
              const cfgNow = getEventGoldStageConfig(chapterNum, stageNum);
              try {
                const dropRes = awardStoryDropIfAny(cfgNow, { apply: false }) || { items: [], monsters: [] };
                try { window.__cpStageItemDrops = Array.isArray(dropRes.items) ? dropRes.items.slice() : []; } catch {}
                if (sess) {
                  sess.itemDrops = (Array.isArray(sess.itemDrops) ? sess.itemDrops : []).concat(Array.isArray(dropRes.items) ? dropRes.items : []);
                  sess.monsterDrops = (Array.isArray(sess.monsterDrops) ? sess.monsterDrops : []).concat(Array.isArray(dropRes.monsters) ? dropRes.monsters : []);
                  sess.expGain = Math.max(0, Number(sess.expGain) || 0) + calcStagePlayerExp(cfgNow);
                }
              } catch {}
              markEventGoldStageCleared(chapterNum, stageNum);
              if (stageNum < 5) {
                setTimeout(() => {
                  Router.goTo(`/mode/challenge/event/gold/ch${chapterNum}/s${stageNum + 1}`);
                }, 120);
                return;
              }
              try {
                let slots = loadStorage();
                const itemIds = (sess && Array.isArray(sess.itemDrops)) ? sess.itemDrops : [];
                itemIds.forEach((itemId) => { slots = addItemToStorage(slots, itemId, 1); });
                // Chapter reward: one gold coin per chapter clear.
                slots = addItemToStorage(slots, 'gold_coin', 1);
                itemIds.push('gold_coin');
                saveStorage(slots);
                const monIds = (sess && Array.isArray(sess.monsterDrops)) ? sess.monsterDrops : [];
                monIds.forEach((mid) => addOwnedMonsterId(String(mid || '').trim().padStart(3, '0')));
                const expGain = Math.max(0, Math.floor(Number(sess?.expGain) || 0));
                const expResult = addPlayerExp(expGain);
                if (sess) {
                  sess.completed = true;
                  sess.active = false;
                }
                showChapterClearModal({
                  chapter: chapterNum,
                  itemIds,
                  monsterIds: monIds,
                  expGain,
                  levelInfo: expResult,
                  backRoute: '/mode/challenge/event/gold',
                  backLabel: 'Back to Gold Farming',
                });
                clearEventGoldRunSession();
              } catch {}
              return;
            }
            // Story Mode: clear stage and auto-advance (no respawn/level-up loop)
            const st = window.__cpStoryStage;
            if (st && Number(st.chapter) && Number(st.stage)) {
              const ch = Number(st.chapter) || 0;
              const stageNum = Math.floor(Number(st.stage) || 0);
              const isChapterClear = stageNum === 5;
              const sess = ensureStoryRunSession();
              const cfgNow = getStoryStageConfig(ch || 1, stageNum || 1);
              try {
                const dropRes = awardStoryDropIfAny(cfgNow, { apply: false }) || { items: [], monsters: [] };
                try { window.__cpStageItemDrops = Array.isArray(dropRes.items) ? dropRes.items.slice() : []; } catch {}
                if (sess) {
                  sess.itemDrops = (Array.isArray(sess.itemDrops) ? sess.itemDrops : []).concat(Array.isArray(dropRes.items) ? dropRes.items : []);
                  sess.monsterDrops = (Array.isArray(sess.monsterDrops) ? sess.monsterDrops : []).concat(Array.isArray(dropRes.monsters) ? dropRes.monsters : []);
                  sess.expGain = Math.max(0, Number(sess.expGain) || 0) + calcStagePlayerExp(cfgNow);
                  const monsForStage = normalizeStageMonsters(cfgNow);
                  sess.defeatedMonsters = Array.isArray(sess.defeatedMonsters) ? sess.defeatedMonsters : [];
                  monsForStage.forEach((mm) => {
                    const mid = String(mm?.monsterId || '').trim().padStart(3, '0');
                    if (/^\d{3}$/.test(mid)) sess.defeatedMonsters = pushUnique(sess.defeatedMonsters, mid);
                  });
                }
              } catch {}

              if (isChapterClear) {
                try {
                  let slots = loadStorage();
                  const itemIds = (sess && Array.isArray(sess.itemDrops)) ? sess.itemDrops : [];
                  itemIds.forEach((itemId) => { slots = addItemToStorage(slots, itemId, 1); });

                  if (ch && window.ChessPalStory?.hasClaimedChapterReward && window.ChessPalStory?.markChapterRewardClaimed) {
                    const claimed = !!window.ChessPalStory.hasClaimedChapterReward(ch);
                    if (!claimed) {
                      slots = addItemToStorage(slots, 'gold_coin', 1);
                      itemIds.push('gold_coin');
                      window.ChessPalStory.markChapterRewardClaimed(ch);
                    }
                  }

                  saveStorage(slots);
                  const monIds = (sess && Array.isArray(sess.monsterDrops)) ? sess.monsterDrops : [];
                  monIds.forEach((mid) => addOwnedMonsterId(String(mid || '').trim().padStart(3, '0')));
                  const expGain = Math.max(0, Math.floor(Number(sess?.expGain) || 0));
                  const expResult = addPlayerExp(expGain);
                  try { window.ChessPalStory?.markStageCleared?.(ch, 5); } catch {}
                  if (sess) {
                    sess.completed = true;
                    sess.active = false;
                  }
                  showChapterClearModal({
                    chapter: ch,
                    itemIds,
                    monsterIds: monIds,
                    expGain,
                    levelInfo: expResult,
                  });
                  clearStoryRunSession();
                } catch {}
                return;
              }

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
                  // Auto-advance keeps same page, so mark seen for the new stage here.
                  try { markStoryMonstersSeen(cfg); } catch {}
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
                  let pool = getDefaultStoryElementsForStage(cfg.chapter, cfg.stage, units);
                  try {
                    const fixed = window.ChessPalStory?.getFixedElementPool?.(cfg.chapter, cfg.stage);
                    if (Array.isArray(fixed) && fixed.length) pool = fixed.slice();
                  } catch {}
                  try { window.__cpBoardElements = pool; } catch {}

                  // Reset multi-monster pool + target chips for the new stage
                  try {
                    b.userPickedTarget = false;
                    b.manualTargetIdx = -1;
                    b.targetMonsterIdx = 0;
                    const stageMons = Array.isArray(cfg?.monsters) && cfg.monsters.length ? cfg.monsters : [{ monsterId: cfg?.monsterId || '004', level: cfg?.monsterLevel || 1 }];
                    const nextMonsters = stageMons.map((mm, idx) => {
                      const mid = String(mm?.monsterId || '004').trim().padStart(3, '0');
                      const lv = Math.max(1, Math.floor(Number(mm?.level) || 1));
                      const eff = getMonsterEffective(mid, lv);
                      const m = getMonsterBase(mid) || getMonsterFromDbQuick(mid);
                      const activeCd = getMonsterNpcSkillCd(m);
                      return {
                        idx,
                        monsterId: mid,
                        level: lv,
                        name: String(m?.name || 'Monster'),
                        element: String(m?.element || '').trim().toLowerCase(),
                        img: String(m?.img || ''),
                        skillFirstCd: Number.isFinite(Number(mm?.skillFirstCd)) ? Math.max(0, Math.floor(Number(mm.skillFirstCd) || 0)) : null,
                        skillCycleCd: Number.isFinite(Number(mm?.skillCycleCd)) ? Math.max(0, Math.floor(Number(mm.skillCycleCd) || 0)) : null,
                        maxHp: eff.hpMax,
                        atk: eff.atk,
                        hp: eff.hpMax,
                        activeCd,
                        skillCdLeft: activeCd,
                        tempDamageReduction: 0,
                        tempDamageReductionRounds: 0,
                        reflectDamagePct: 0,
                        reflectRounds: 0,
                        aftershockReadyBonus: 0,
                        aftershockPendingBonus: 0,
                      };
                    });
                    b.monsters = nextMonsters;
                    // Robust seen-marking for all monsters in next stage.
                    try {
                      nextMonsters.forEach((m) => addSeenMonsterId(String(m?.monsterId || '').trim().padStart(3, '0')));
                    } catch {}
                    renderBossArena(nextMonsters);
                    // Activate first monster (updates battle target + bars)
                    setActiveMonsterUI(0);
                  } catch {}

                  // clear per-turn scores
                  try { window.__cpPracticeElementScores = {}; } catch {}
                  try { window.__cpPracticePathMultipliers = []; } catch {}
                  try { window.__cpStageItemDrops = []; } catch {}
                  try { applyElementScoresToUI(); } catch {}

                  // Ensure visible + update hint + intro
                  try {
                    document.querySelectorAll('[data-boss-card]').forEach((box) => {
                      box.style.display = '';
                      box.classList.remove('cp-dead');
                    });
                  } catch {}
                  try { showStoryHintIfAny(); } catch {}
                  try { showStageIntro(cfg.chapter, cfg.stage); } catch {}
                  try { updateHpUI(); } catch {}
                  try {
                    if (window.ChessPalTutorialFlow?.isActive?.()) {
                      window.__cpActionLocked = true;
                      const opened = !!window.ChessPalTutorialFlow?.maybeShowStageTutorial?.(cfg.chapter, cfg.stage, () => {
                        try { window.__cpActionLocked = false; } catch {}
                      });
                      if (!opened) window.__cpActionLocked = false;
                    }
                  } catch {}
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

            const bossBox = document.querySelector('[data-boss-card="0"]');
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

        // End-of-player-phase statuses.
        try {
          if (monsters && monsters.length) {
            monsters.forEach((t) => {
              if (!t) return;
              if (Number(t.tempDamageReductionRounds) > 0) {
                t.tempDamageReductionRounds = Math.max(0, Math.floor(Number(t.tempDamageReductionRounds) - 1));
                if ((Number(t.tempDamageReductionRounds) || 0) <= 0) t.tempDamageReduction = 0;
              }
              if (Number(t.reflectRounds) > 0) {
                t.reflectRounds = Math.max(0, Math.floor(Number(t.reflectRounds) - 1));
                if ((Number(t.reflectRounds) || 0) <= 0) t.reflectDamagePct = 0;
              }
            });
          }
          b.teamExecuteMarks = {};
          if (lockedRounds > 0) {
            b.playerElementLockRounds = Math.max(0, lockedRounds - 1);
            if ((Number(b.playerElementLockRounds) || 0) <= 0) b.playerElementLockElement = '';
          }
        } catch {}

        // Monster counter-attacks player: beam from monster center → HP bar, shake HP bar
        const counterAttackers = (() => {
          try {
            if (Array.isArray(monsters) && monsters.length) {
              return monsters
                .map((m, idx) => ({ m, idx }))
                .filter(({ m }) => (Number(m?.hp) || 0) > 0);
            }
          } catch {}
          return [];
        })();
        if (counterAttackers.length > 0) {
          for (const { m, idx } of counterAttackers) {
            const pfx = getMonsterPassiveCombatFx(m);
            const afx = getMonsterActiveCombatFx(m);
            const aftershockReadyBonus = clampNum(m?.aftershockReadyBonus, 0, 1.5, 0);
            // Passive regen before monster action.
            try {
              const maxHp = Math.max(1, Math.floor(Number(m?.maxHp) || 1));
              const regen = Math.max(0, Math.floor(maxHp * Math.max(0, Number(pfx?.regenPct) || 0)));
              if (regen > 0) {
                m.hp = Math.max(0, Math.min(maxHp, (Number(m?.hp) || 0) + regen));
                syncTargetBackCompat();
                updateHpUI();
              }
            } catch {}
            if (!Number.isFinite(Number(m.skillCdLeft))) m.skillCdLeft = Math.max(0, Math.floor(Number(afx.cd) || 0));
            let activeUsed = false;
            let atkMultByActive = 1;
            let atkFlatByActive = 0;
            if (afx.hasEffect && ((Number(afx.cd) <= 0) || (Number(m.skillCdLeft) <= 0))) {
              activeUsed = true;
              showMonsterSkillNotice(`${String(m?.name || 'Monster')} uses ${String(afx.name || 'Skill')}: ${describeMonsterActiveFx(afx)}.`);
              atkMultByActive = Math.max(0.1, Number(afx.atkMultThisTurn) || 1);
              atkFlatByActive = Math.max(0, Math.floor(Number(afx.dmgFlat) || 0));
              try {
                const maxHp = Math.max(1, Math.floor(Number(m?.maxHp) || 1));
                const selfCostPct = clampNum(afx.selfHpCostPct, 0, 0.9, 0);
                if (selfCostPct > 0) {
                  const hpCost = Math.max(0, Math.floor(maxHp * selfCostPct));
                  m.hp = Math.max(1, Math.min(maxHp, (Number(m?.hp) || 0) - hpCost));
                }
                const healAmt = Math.max(0, Math.floor(Number(afx.healFlat) || 0) + Math.floor(maxHp * Math.max(0, Number(afx.healPct) || 0)));
                if (healAmt > 0) m.hp = Math.max(0, Math.min(maxHp, (Number(m?.hp) || 0) + healAmt));
                const guard = Math.max(0, Number(afx.guard) || 0);
                if (guard > 0) {
                  m.tempDamageReduction = Math.max(0, Math.min(0.75, guard));
                  m.tempDamageReductionRounds = 1;
                }
                const reflectPct = clampNum(afx.reflectPct, 0, 0.9, 0);
                if (reflectPct > 0) {
                  m.reflectDamagePct = reflectPct;
                  m.reflectRounds = 1;
                }
                if (afx.purgePlayerBuffs) {
                  b.playerDamageReduction = 0;
                  b.skillDamageReductionThisTurn = 0;
                  b.teamAtkBonus = 0;
                  b.teamElemBonus = {};
                  b.teamAtkMultThisTurn = 1;
                }
                if (Number(afx.elementLockRounds) > 0) {
                  b.playerElementLockRounds = Math.max(Number(b.playerElementLockRounds) || 0, Math.floor(Number(afx.elementLockRounds) || 0));
                  b.playerElementLockElement = '';
                }
                syncTargetBackCompat();
                updateHpUI();
              } catch {}
              try { setMsg(`${String(m?.name || 'Monster')} used ${String(afx.name || 'Skill')}.`); } catch {}
            }
            if (Number(afx.cycleCd) > 0 || Number(afx.cd) > 0) {
              m.skillCdLeft = activeUsed
                ? Math.max(0, Math.floor(Number(afx.cycleCd) || 0))
                : Math.max(0, Math.floor(Number(m.skillCdLeft) || 0) - 1);
            }
            const baseAtk = Math.max(0, Math.floor(Number(m?.atk) || 0));
            const rawAtk = Math.max(0, Math.floor(baseAtk * Math.max(0.1, (Number(pfx?.atkMult) || 1) * (1 + aftershockReadyBonus)) * atkMultByActive + atkFlatByActive));
            if (rawAtk <= 0) continue;
            const visual = getBossVisualByIdx(idx);
            const fromEl = visual.img || visual.box;
            if (fromEl && hpBar) {
              await playBeamBetween({ fromEl, toEl: hpBar, variant: 'monster' });
            }
            await shake(hpBar);
            const pMax = Math.max(0, Number(b.playerMaxHp) || 0);
            const dr = Number.isFinite(Number(b.playerDamageReduction)) ? Number(b.playerDamageReduction) : 0;
            let effDmg = Math.max(0, Math.floor(rawAtk * (1 - Math.max(0, Math.min(0.9, dr)))));
            const pHp = Math.max(0, Number(b.playerHp) || 0);
            if (Number(afx.executeFlatBonus) > 0 && Number(afx.executeThresholdPct) > 0 && pMax > 0) {
              const threshold = Math.max(0, Math.min(1, Number(afx.executeThresholdPct) || 0));
              if ((pHp / pMax) < threshold) effDmg += Math.max(0, Math.floor(Number(afx.executeFlatBonus) || 0));
            }
            b.playerHp = Math.max(0, Math.min(pMax, (Number(b.playerHp) || 0) - effDmg));
            updateHpUI();
            m.aftershockReadyBonus = Math.max(0, clampNum(m?.aftershockPendingBonus, 0, 1.5, 0));
            m.aftershockPendingBonus = 0;
            if ((Number(b.playerHp) || 0) <= 0) break;
          }
        } else {
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
            const targetVisual = getTargetBossVisual();
            const fromEl = targetVisual.img || targetVisual.box;
            await playBeamBetween({ fromEl, toEl: hpBar, variant: 'monster' });
            await shake(hpBar);
            const pMax = Math.max(0, Number(b.playerMaxHp) || 0);
            const dr = Number.isFinite(Number(b.playerDamageReduction)) ? Number(b.playerDamageReduction) : 0;
            const effDmg = Math.max(0, Math.floor(monsterAtk * (1 - Math.max(0, Math.min(0.9, dr)))));
            b.playerHp = Math.max(0, Math.min(pMax, (Number(b.playerHp) || 0) - effDmg));
            updateHpUI();
          }
        }
        if ((Number(b.playerHp) || 0) <= 0 && isStoryBattleActive()) {
          showStoryDefeatSettleModal({
            onRevive: () => {
              try {
                let slots = loadStorage();
                const idx = slots.findIndex((x) => x && String(x.itemId || '').toLowerCase() === 'gold_coin');
                if (idx < 0) return false;
                const curQty = Math.max(0, Math.floor(Number(slots[idx]?.qty) || 0));
                if (curQty <= 0) return false;
                slots[idx] = (curQty <= 1) ? null : { ...slots[idx], qty: curQty - 1 };
                saveStorage(slots);
                const pMax = Math.max(0, Number(b.playerMaxHp) || 0);
                b.playerHp = pMax;
                updateHpUI();
                return true;
              } catch {
                return false;
              }
            },
            onGiveUp: () => {
              try {
                const sess = window.__cpStoryRunSession;
                if (sess && typeof sess === 'object') sess.resignHandled = true;
              } catch {}
              clearStoryRunSession();
              showFailResignModal();
            },
          });
          return;
        }
      } finally {
        // Clear per-turn scores after combat so next turn starts clean
        try { window.__cpPracticeElementScores = {}; } catch {}
        try { window.__cpPracticePathMultipliers = []; } catch {}
        // Safety cleanup: remove any multiplier labels not consumed by beams.
        try { window.ChessPal?.clearAllPathMultiplierFx?.(); } catch {}
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
        try { window.__cpActionLocked = false; } catch {}
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
      // Skill-ready glow: slot lights up when cooldown reaches 0.
      try {
        const b = getBattle();
        if (!b.skillCds || typeof b.skillCds !== 'object') b.skillCds = {};
        row.querySelectorAll('.cp-practice-slot[data-team-slotkey]').forEach((slot) => {
          const sk = String(slot.getAttribute('data-team-slotkey') || '');
          const unit = sk ? getTeamUnit(sk) : null;
          const key = String(unit?.key || '');
          const cd = Math.max(0, Math.floor(Number(unit?.activeSkill?.cd) || 0));
          if (!unit || !unit.activeSkill || !key || cd <= 0) {
            slot.classList.remove('is-skill-ready');
            return;
          }
          if (!Object.prototype.hasOwnProperty.call(b.skillCds, key)) {
            b.skillCds[key] = cd;
          }
          const left = Math.max(0, Math.floor(Number(b.skillCds[key]) || 0));
          slot.classList.toggle('is-skill-ready', left <= 0);
        });
      } catch {}

      // RCV shown on HP bar (use Heart score)
      try {
        const totalRcv = Math.max(0, Number(window.__cpPlayerRcvTotal) || 0);
        const heartScore = Number(scores.heart || 0);
        const gsNow = getGeneralSettings();
        const orbBonusPct = Number.isFinite(Number(gsNow?.heartOrbHealBonusPct)) ? Number(gsNow.heartOrbHealBonusPct) : 0.01;
        const counts = (window.__cpPracticeElementCounts && typeof window.__cpPracticeElementCounts === 'object') ? window.__cpPracticeElementCounts : {};
        const consumedOrbs = Object.values(counts).reduce((sum, n) => sum + Math.max(0, Math.floor(Number(n) || 0)), 0);
        const healFactor = 1 + consumedOrbs * Math.max(0, Math.min(0.1, orbBonusPct));
        const heal = Math.round(totalRcv * heartScore * rcvMul * healFactor);
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

      // Initialize cooldowns at battle start:
      // active skills are NOT ready immediately; they become usable when CD reaches 0.
      try {
        const b = getBattle();
        if (!b.skillCds || typeof b.skillCds !== 'object') b.skillCds = {};
        for (let i = 0; i < 4; i += 1) {
          const id = team[i];
          const unit = id ? getTeamUnit(id) : null;
          const key = String(unit?.key || '');
          const cd = Math.max(0, Math.floor(Number(unit?.activeSkill?.cd) || 0));
          if (!key || !unit?.activeSkill || cd <= 0) continue;
          if (!Object.prototype.hasOwnProperty.call(b.skillCds, key)) {
            b.skillCds[key] = cd;
          }
        }
      } catch {}

      // Skill popover (Confirm / Cancel) under clicked slot
      const closeSkillPanels = () => {
        try { row.querySelectorAll('.cp-practice-skillpanel').forEach(x => x.remove()); } catch {}
        try { row.querySelectorAll('.cp-practice-slot').forEach(x => x.classList.remove('is-skill-open')); } catch {}
      };
      const castSkill = (unit) => {
        const u = unit || null;
        if (!u || !u.activeSkill) return;
        try {
          if (window.__cpPracticeCombatInFlight || window.__cpActionLocked) {
            setMsg('Action is locked during combat resolution.');
            return;
          }
        } catch {}
        const b = getBattle();
        if (!b.skillCds || typeof b.skillCds !== 'object') b.skillCds = {};
        if (!b.teamExecuteMarks || typeof b.teamExecuteMarks !== 'object') b.teamExecuteMarks = {};
        const key = String(u.key || '');
        const cd = Math.max(0, Math.floor(Number(u.activeSkill?.cd) || 0));
        if (key) {
          const left = Math.max(0, Math.floor(Number(b.skillCds[key]) || 0));
          if (left > 0) return;
          b.skillCds[key] = cd;
        }

        const p = u.activeSkill?.params || {};
        // Element lock: while active, player can only use one element this turn.
        try {
          const lockRounds = Math.max(0, Math.floor(Number(b.playerElementLockRounds) || 0));
          if (lockRounds > 0) {
            const myEl = String(u.element || '').toLowerCase();
            const locked = String(b.playerElementLockElement || '').toLowerCase();
            if (locked && myEl && myEl !== locked) {
              try { setMsg(`Element Lock: only ${locked.toUpperCase()} can cast this turn.`); } catch {}
              return;
            }
            if (!locked && myEl) b.playerElementLockElement = myEl;
          }
        } catch {}
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
        // Blood Pact-style self HP cost
        const selfHpCostPct = Number(p.selfHpCostPct);
        if (Number.isFinite(selfHpCostPct) && selfHpCostPct > 0) {
          const pMax = Math.max(1, Number(b.playerMaxHp) || 1);
          const cur = Math.max(0, Number(b.playerHp) || 0);
          const cost = Math.max(0, Math.floor(pMax * Math.max(0, Math.min(0.9, selfHpCostPct))));
          b.playerHp = Math.max(1, cur - cost);
          updateHpUI();
        }
        // Execution mark: enable fixed bonus when target HP is below threshold.
        const executeThresholdPct = Number(p.executeThresholdPct);
        const executeFlatBonus = Number(p.executeFlatBonus);
        if (key && Number.isFinite(executeThresholdPct) && executeThresholdPct > 0 && Number.isFinite(executeFlatBonus) && executeFlatBonus > 0) {
          b.teamExecuteMarks[key] = {
            thresholdPct: Math.max(0, Math.min(1, executeThresholdPct)),
            flatBonus: Math.max(0, Math.floor(executeFlatBonus)),
          };
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
          try {
            if (window.__cpPracticeCombatInFlight || window.__cpActionLocked) {
              setMsg('Action is locked during combat resolution.');
              return;
            }
          } catch {}
          const sk = String(slotBtn.getAttribute('data-team-slotkey') || '');
          const u = sk ? getTeamUnit(sk) : null;
          if (!u) return;
          const b = getBattle();
          const key = String(u.key || '');
          const hasActiveSkill = !!u.activeSkill;
          const baseCd = Math.max(0, Math.floor(Number(u.activeSkill?.cd) || 0));
          if (!b.skillCds || typeof b.skillCds !== 'object') b.skillCds = {};
          if (hasActiveSkill && key && baseCd > 0 && !Object.prototype.hasOwnProperty.call(b.skillCds, key)) {
            b.skillCds[key] = baseCd;
          }
          const left = hasActiveSkill
            ? ((b.skillCds && typeof b.skillCds === 'object') ? Math.max(0, Math.floor(Number(b.skillCds[key]) || 0)) : baseCd)
            : 0;

          closeSkillPanels();
          slotBtn.classList.add('is-skill-open');

          const panel = document.createElement('div');
          panel.className = 'cp-practice-skillpanel';
          panel.innerHTML = `
            <div class="cp-practice-skilltitle">${esc(u.activeSkill?.name || 'No Active Skill')}</div>
            <div class="cp-practice-skilldesc">${esc(u.activeSkill?.text || 'This unit cannot cast an active skill.')}</div>
            <div class="cp-practice-skillmeta">${hasActiveSkill ? `CD ${esc(u.activeSkill?.cd ?? 0)}${left > 0 ? ` · Cooling down ${esc(left)}` : ' · Ready'}` : 'No skill available'}</div>
            <div class="cp-practice-skillbtnrow">
              <button class="cp-tool-btn" type="button" data-skill-confirm ${(!hasActiveSkill || left > 0) ? 'disabled' : ''}>Confirm</button>
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
        try { ensureStoryRunSession(); } catch {}
        // Story stage: mark current stage monsters as seen
        try { markStoryMonstersSeen(window.__cpStoryStage); } catch {}
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
          const m = getMonsterBase(mid) || getMonsterFromDbQuick(mid);
          const activeCd = getMonsterNpcSkillCd(m);
          return {
            idx,
            monsterId: mid,
            level: lv,
            name: String(m?.name || 'Monster'),
            element: String(m?.element || '').trim().toLowerCase(),
            img: String(m?.img || ''),
            skillFirstCd: Number.isFinite(Number(mm?.skillFirstCd)) ? Math.max(0, Math.floor(Number(mm.skillFirstCd) || 0)) : null,
            skillCycleCd: Number.isFinite(Number(mm?.skillCycleCd)) ? Math.max(0, Math.floor(Number(mm.skillCycleCd) || 0)) : null,
            maxHp: eff.hpMax,
            atk: eff.atk,
            hp: eff.hpMax,
            activeCd,
            skillCdLeft: activeCd,
            tempDamageReduction: 0,
            tempDamageReductionRounds: 0,
            reflectDamagePct: 0,
            reflectRounds: 0,
            aftershockReadyBonus: 0,
            aftershockPendingBonus: 0,
          };
        });
        // If continuing in-place within the same stage, try to preserve HP/target by matching ids.
        const prev = Array.isArray(b.monsters) ? b.monsters : null;
        if (prev && prev.length) {
          nextMonsters.forEach((nm) => {
            const hit = prev.find(x => String(x?.monsterId || '') === nm.monsterId && Number(x?.idx) === Number(nm.idx))
              || prev.find(x => String(x?.monsterId || '') === nm.monsterId);
            if (hit) {
              nm.hp = Number.isFinite(Number(hit.hp)) ? Math.max(0, Math.min(nm.maxHp, Number(hit.hp))) : nm.hp;
              nm.skillCdLeft = Number.isFinite(Number(hit.skillCdLeft)) ? Math.max(0, Math.floor(Number(hit.skillCdLeft) || 0)) : nm.skillCdLeft;
              nm.tempDamageReduction = Number.isFinite(Number(hit.tempDamageReduction)) ? Math.max(0, Math.min(0.75, Number(hit.tempDamageReduction) || 0)) : 0;
              nm.tempDamageReductionRounds = Number.isFinite(Number(hit.tempDamageReductionRounds)) ? Math.max(0, Math.floor(Number(hit.tempDamageReductionRounds) || 0)) : 0;
              nm.reflectDamagePct = Number.isFinite(Number(hit.reflectDamagePct)) ? Math.max(0, Math.min(0.9, Number(hit.reflectDamagePct) || 0)) : 0;
              nm.reflectRounds = Number.isFinite(Number(hit.reflectRounds)) ? Math.max(0, Math.floor(Number(hit.reflectRounds) || 0)) : 0;
              nm.aftershockReadyBonus = Number.isFinite(Number(hit.aftershockReadyBonus)) ? Math.max(0, Math.min(1.5, Number(hit.aftershockReadyBonus) || 0)) : 0;
              nm.aftershockPendingBonus = Number.isFinite(Number(hit.aftershockPendingBonus)) ? Math.max(0, Math.min(1.5, Number(hit.aftershockPendingBonus) || 0)) : 0;
            }
          });
        }
        b.monsters = nextMonsters;
        renderBossArena(nextMonsters);
        b.userPickedTarget = !!b.userPickedTarget;
        b.manualTargetIdx = (b.userPickedTarget && Number.isFinite(Number(b.manualTargetIdx)))
          ? Math.max(0, Math.min(nextMonsters.length - 1, Math.floor(Number(b.manualTargetIdx))))
          : -1;
        // Robust seen-marking for all monsters in current stage.
        try {
          nextMonsters.forEach((m) => addSeenMonsterId(String(m?.monsterId || '').trim().padStart(3, '0')));
        } catch {}
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
        // Ensure boss cards are visible on init.
        document.querySelectorAll('[data-boss-card]').forEach((box) => {
          if (box.style.display === 'none') box.style.display = '';
          try { box.classList.remove('cp-dead'); } catch {}
        });
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
        const multipliers = Array.isArray(ev?.detail?.pathMultipliers) ? ev.detail.pathMultipliers : [];
        window.__cpPracticePathMultipliers = multipliers;
        window.__cpPracticeElementCounts = (ev?.detail?.counts && typeof ev.detail.counts === 'object') ? ev.detail.counts : {};
        window.__cpPracticeMaxCombo = Math.max(0, Math.floor(Number(ev?.detail?.maxCombo) || 0));
      } catch {
        window.__cpPracticeElementScores = {};
        window.__cpPracticePathMultipliers = [];
        window.__cpPracticeElementCounts = {};
        window.__cpPracticeMaxCombo = 0;
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

  function stripSkillPlaceholderText(textLike) {
    const raw = String(textLike == null ? '' : textLike).trim();
    if (!raw) return '';
    return raw
      .replace(/\s*\(\s*place\s*holder\s*\)\s*/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
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
    const lvLocalRaw = getNumberFromMap(HERO_LEVEL_OVERRIDE_KEY, b.id);
    const level = Number.isFinite(lvLocalRaw)
      ? Math.max(1, Math.min(cap, Math.floor(lvLocalRaw || 1)))
      : derivedLevel;
    const scaled = heroStatsAtLevel(b, level, cap);
    const cdLocalRaw = getNumberFromMap(HERO_CD_OVERRIDE_KEY, b.id);
    const baseCd = Math.max(1, Math.floor(Number(active?.cd) || 1));
    const cdFromLocal = Number(cdLocalRaw);
    const cdFromServer = Number(o?.activeCd);
    // Use override only when it is valid (>=1). Otherwise keep original hero CD.
    const resolvedCd = Number.isFinite(cdFromLocal) && cdFromLocal >= 1
      ? Math.floor(cdFromLocal)
      : (Number.isFinite(cdFromServer) && cdFromServer >= 1 ? Math.floor(cdFromServer) : baseCd);
    return {
      ...b,
      level,
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
        text: stripSkillPlaceholderText(active?.text),
        cd: resolvedCd,
        params: (o.activeParams && typeof o.activeParams === 'object') ? o.activeParams : active.params
      },
      leaderSkill: {
        ...leader,
        text: stripSkillPlaceholderText(leader?.text),
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
    const k = Math.max(1, Math.min(10, Number(n) || 5));
    return '★'.repeat(k);
  }

  function formatNpcSkillParams(paramsLike) {
    const p = (paramsLike && typeof paramsLike === 'object') ? paramsLike : {};
    const entries = Object.entries(p).slice(0, 8);
    if (!entries.length) return 'N/A';
    return entries.map(([k, v]) => `${String(k)}: ${String(v)}`).join(', ');
  }

  function showHeroModal(hero) {
    const h = hero || null;
    if (!h) return;
    const admin = isAdminMode();
    const canLevelUp = admin || getOwnedHeroSet().has(String(h.id || ''));
    const xp = expProgressMeta({ totalExp: h.totalExp || 0, level: h.level, curve: h.expCurve, maxLevel: h.maxLevel });
    const npcSkillName = String(h?.npcSkill?.name || `${h?.activeSkill?.name || 'Active Skill'} (NPC)`);
    const npcSkillText = String(h?.npcSkill?.text || h?.activeSkill?.text || 'No NPC skill description.');
    const npcSkillValues = formatNpcSkillParams(h?.npcSkill?.params || h?.activeSkill?.params);

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
                ${canLevelUp ? `<button class="cp-tool-btn cp-levelup-btn" type="button" id="cpHeroLevelUpBtn">Level Up</button>` : ``}
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
                  </div>
                  <div class="cp-muted" style="margin-top:8px;">NPC Skill · ${esc(npcSkillName)}</div>
                  <div class="cp-skill-desc" style="margin-top:6px;">${esc(npcSkillText)}</div>
                  <div class="cp-muted" style="margin-top:8px;">Values: ${esc(npcSkillValues)}</div>
                </div>
              ` : ''}
            </div>
          </div>
          ${admin ? `
            <div class="cp-row" style="justify-content:center; margin-top:12px;">
              <button class="cp-tool-btn" type="button" id="cpOpenAdminEdit">Admin Edit</button>
            </div>
          ` : ''}
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
      try {
        const step = String(window.ChessPalTutorialFlow?.getState?.()?.step || '');
        if (window.ChessPalTutorialFlow?.isActive?.() && step === 'hero_levelup_click') {
          setTimeout(() => {
            try { window.ChessPalTutorialFlow?.spotlight?.('#cpHeroLevelUpBtn'); } catch {}
          }, 40);
        }
      } catch {}
      lvlBtn.addEventListener('click', () => {
        try {
          if (window.ChessPalTutorialFlow?.isActive?.()) {
            const hid = String(h?.id || '').trim().padStart(3, '0');
            const ok = !!window.ChessPalTutorialFlow?.guardHeroSelection?.(hid);
            if (!ok) {
              try { setMsg('Please level up #002 Nyxblade first.'); } catch {}
              return;
            }
          }
        } catch {}
        try { window.ChessPalTutorialFlow?.onHeroLevelUpClicked?.(); } catch {}
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
              <input type="number" id="cpAdminActiveCd" value="${esc(Math.max(1, Math.floor(Number(merged.activeSkill?.cd) || 1)))}" min="1" step="1">
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
        heroOverrides[merged.id].activeCd = Number.isFinite(cd)
          ? Math.max(1, Math.floor(cd))
          : Math.max(1, Math.floor(Number(merged.activeSkill?.cd) || 1));
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
    const admin = isAdminMode();
    return `
      <div class="cp-row" style="margin-top:0; justify-content:flex-end;">
        ${admin ? `<button class="cp-tool-btn" type="button" id="cpPalSettingBtn">Setting</button>` : ``}
      </div>
      <div class="cp-square-grid" aria-label="Pal" style="margin-top:12px;">
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
    const showPalAdminSettingModal = () => {
      if (!isAdminMode()) return;
      const old = document.getElementById('cpPalAdminOverlay');
      if (old) old.remove();
      const heroes = getAllHeroes();
      const monsters = getAllMonsters();
      const overlay = document.createElement('div');
      overlay.id = 'cpPalAdminOverlay';
      overlay.className = 'cp-modal-overlay';
      overlay.innerHTML = `
        <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Pal setting">
          <button class="cp-modal-close" type="button" aria-label="Close">×</button>
          <div class="cp-modal-body">
            <div class="cp-h1" style="font-size:18px;">Pal Setting</div>
            <div class="cp-setting-item" style="margin-top:12px;">
              <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">Type</div>
              <select class="cp-select" id="cpPalTuneType">
                <option value="hero">Hero</option>
                <option value="monster">Monster</option>
              </select>
              <div class="cp-setting-help" style="margin-top:10px; margin-bottom:6px;">Unit</div>
              <select class="cp-select" id="cpPalTuneUnit"></select>
              <div class="cp-setting-help" style="margin-top:10px; margin-bottom:6px;">Level</div>
              <input class="cp-input" id="cpPalTuneLevel" type="number" min="1" step="1" value="1">
              <div class="cp-setting-help" style="margin-top:10px; margin-bottom:6px;">CD</div>
              <input class="cp-input" id="cpPalTuneCd" type="number" min="0" step="1" value="0">
            </div>
            <div class="cp-row" style="margin-top:12px; justify-content:flex-end; gap:8px;">
              <button class="cp-tool-btn" type="button" id="cpPalTuneClear">Clear</button>
              <button class="cp-primary" type="button" id="cpPalTuneApply">Apply</button>
            </div>
            <div class="cp-muted" id="cpPalTuneMsg" style="margin-top:10px;"></div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const setMsg = (t) => {
        const el = overlay.querySelector('#cpPalTuneMsg');
        if (el) el.textContent = String(t || '');
      };
      const typeEl = overlay.querySelector('#cpPalTuneType');
      const unitEl = overlay.querySelector('#cpPalTuneUnit');
      const levelEl = overlay.querySelector('#cpPalTuneLevel');
      const cdEl = overlay.querySelector('#cpPalTuneCd');
      const renderUnits = () => {
        const t = String(typeEl?.value || 'hero');
        const prevSelectedId = String(unitEl?.value || '').trim().padStart(3, '0');
        const list = (t === 'monster' ? monsters : heroes)
          .slice()
          .sort((a, b) => Number(String(a?.id || '').trim()) - Number(String(b?.id || '').trim()));
        if (unitEl) {
          unitEl.innerHTML = list.map((u) => `<option value="${esc(String(u.id))}">#${esc(String(u.id))} ${esc(String(u.name || u.id))}</option>`).join('');
          if (prevSelectedId && list.some((u) => String(u?.id || '').trim().padStart(3, '0') === prevSelectedId)) {
            unitEl.value = prevSelectedId;
          }
        }
        const id = String(unitEl?.value || list[0]?.id || '').trim().padStart(3, '0');
        const picked = list.find((u) => String(u?.id || '').trim().padStart(3, '0') === id) || list[0];
        const lv = t === 'monster' ? getNumberFromMap(MONSTER_LEVEL_OVERRIDE_KEY, id) : getNumberFromMap(HERO_LEVEL_OVERRIDE_KEY, id);
        const cd = t === 'monster' ? getNumberFromMap(MONSTER_CD_OVERRIDE_KEY, id) : getNumberFromMap(HERO_CD_OVERRIDE_KEY, id);
        if (levelEl) levelEl.value = String(Math.max(1, Math.floor(Number(lv) || Number(picked?.level) || 1)));
        if (cdEl) cdEl.value = String(Math.max(1, Math.floor(Number(cd) || Number(picked?.activeSkill?.cd) || 1)));
      };
      renderUnits();
      typeEl?.addEventListener('change', renderUnits);
      unitEl?.addEventListener('change', renderUnits);
      overlay.querySelector('#cpPalTuneApply')?.addEventListener('click', () => {
        try {
          const t = String(typeEl?.value || 'hero');
          const id = String(unitEl?.value || '').trim().padStart(3, '0');
          const lv = Math.max(1, Math.floor(Number(levelEl?.value) || 1));
          const fallbackCd = (() => {
            const list = t === 'monster' ? monsters : heroes;
            const picked = list.find((u) => String(u?.id || '').trim().padStart(3, '0') === id);
            return Math.max(1, Math.floor(Number(picked?.activeSkill?.cd) || 1));
          })();
          const cdRaw = String(cdEl?.value ?? '').trim();
          const cd = cdRaw === '' ? fallbackCd : Math.max(1, Math.floor(Number(cdRaw) || fallbackCd));
          if (!/^\d{3}$/.test(id)) throw new Error('Invalid unit.');
          if (t === 'monster') {
            setNumberInMap(MONSTER_LEVEL_OVERRIDE_KEY, id, lv);
            setNumberInMap(MONSTER_CD_OVERRIDE_KEY, id, cd);
          } else {
            setNumberInMap(HERO_LEVEL_OVERRIDE_KEY, id, lv);
            setNumberInMap(HERO_CD_OVERRIDE_KEY, id, cd);
          }
          setMsg(`Applied to ${t} #${id}: Lv ${lv}, CD ${cd}.`);
        } catch (e) {
          setMsg(String(e?.message || e || 'Apply failed'));
        }
      }, { passive: true });
      overlay.querySelector('#cpPalTuneClear')?.addEventListener('click', () => {
        try {
          const t = String(typeEl?.value || 'hero');
          const id = String(unitEl?.value || '').trim().padStart(3, '0');
          if (!/^\d{3}$/.test(id)) throw new Error('Invalid unit.');
          if (t === 'monster') {
            setNumberInMap(MONSTER_LEVEL_OVERRIDE_KEY, id, null);
            setNumberInMap(MONSTER_CD_OVERRIDE_KEY, id, null);
          } else {
            setNumberInMap(HERO_LEVEL_OVERRIDE_KEY, id, null);
            setNumberInMap(HERO_CD_OVERRIDE_KEY, id, null);
          }
          renderUnits();
          setMsg(`Cleared overrides for ${t} #${id}.`);
        } catch (e) {
          setMsg(String(e?.message || e || 'Clear failed'));
        }
      }, { passive: true });
      const close = () => {
        try { overlay.remove(); } catch {}
        try { window.removeEventListener('keydown', onKey); } catch {}
        try { Router.renderCurrent(); } catch {}
      };
      const onKey = (ev) => { if (ev.key === 'Escape') close(); };
      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
      overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
      window.addEventListener('keydown', onKey);
    };
    document.querySelectorAll('[data-cp-pal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = String(btn.getAttribute('data-cp-pal') || '');
        try {
          if (window.ChessPalTutorialFlow?.isActive?.()) {
            const ok = !!window.ChessPalTutorialFlow?.guardPalTile?.(key);
            if (!ok) { try { setMsg('Please follow the tutorial step.'); } catch {} return; }
            if (key === 'hero') window.ChessPalTutorialFlow?.onPalHeroSelected?.();
          }
        } catch {}
        if (key === 'monster') Router.goTo('/monsters');
        else Router.goTo('/heroes');
      }, { passive: true });
    });
    document.getElementById('cpPalSettingBtn')?.addEventListener('click', () => {
      showPalAdminSettingModal();
    }, { passive: true });
    try { window.ChessPalTutorialFlow?.applyRouteFocus?.('/pal'); } catch {}
  };

  function HeroesPage() {}
  HeroesPage.title = 'Hero';
  HeroesPage.render = () => {
    return `
      <div class="cp-hero-page">
        <div class="cp-row" style="margin-top:0; gap:8px; flex-wrap:wrap;">
          <input class="cp-input cp-search-input cp-search-input--short" id="cpHeroesSearch" type="text" placeholder="Search Hero by ID or name">
          <select class="cp-select" id="cpHeroesElementFilter" style="width:170px;">
            <option value="">All Elements</option>
            <option value="fire">Fire</option>
            <option value="water">Water</option>
            <option value="wood">Wood</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="heart">Heart</option>
          </select>
          <select class="cp-select" id="cpHeroesRarityFilter" style="width:150px;">
            <option value="">All Stars</option>
            <option value="1">★1</option>
            <option value="2">★2</option>
            <option value="3">★3</option>
            <option value="4">★4</option>
            <option value="5">★5</option>
            <option value="6">★6</option>
            <option value="7">★7</option>
            <option value="8">★8</option>
            <option value="9">★9</option>
            <option value="10">★10</option>
          </select>
        </div>
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
    const baseList = admin ? all : all.filter(h => owned && owned.has(h.id));
    const teamHeroSet = (() => {
      const set = new Set();
      try {
        const team = getTeam();
        ['a', 'b', 'c', 'd'].forEach((k) => {
          const u = getTeamUnit(team?.[k]);
          if (u && String(u.kind || '') === 'hero') set.add(String(u.id || '').trim().padStart(3, '0'));
        });
      } catch {}
      return set;
    })();
    const searchEl = document.getElementById('cpHeroesSearch');
    const elemEl = document.getElementById('cpHeroesElementFilter');
    const rarityEl = document.getElementById('cpHeroesRarityFilter');
    const renderList = () => {
      const q = String(searchEl?.value || '').trim().toLowerCase();
      const ef = String(elemEl?.value || '').trim().toLowerCase();
      const rf = String(rarityEl?.value || '').trim();
      const list = baseList.filter((h) => {
        if (q) {
          const s = `${String(h.id || '').toLowerCase()} ${String(h.name || '').toLowerCase()}`;
          if (!s.includes(q)) return false;
        }
        if (ef && String(h.element || '').toLowerCase() !== ef) return false;
        if (rf && String(Math.max(1, Math.min(10, Math.floor(Number(h.rarity) || 1)))) !== rf) return false;
        return true;
      }).sort((a, b) => {
        const aIn = teamHeroSet.has(String(a?.id || '').trim().padStart(3, '0')) ? 1 : 0;
        const bIn = teamHeroSet.has(String(b?.id || '').trim().padStart(3, '0')) ? 1 : 0;
        if (bIn !== aIn) return bIn - aIn;
        return Number(String(a?.id || 0)) - Number(String(b?.id || 0));
      });
      host.innerHTML = list.map(h => `
      <button class="cp-hero-card ${teamHeroSet.has(String(h.id || '').trim().padStart(3, '0')) ? 'is-inteam' : ''}" type="button" data-hero-id="${esc(h.id)}" data-element="${esc(String(h.element || ''))}">
        <div class="cp-hero-mini">
          <img src="${esc(h.mini || h.img)}" alt="${esc(h.name)}" decoding="async" loading="lazy">
          <div class="cp-mini-lv">Lv ${esc(h.level)}</div>
          ${teamHeroSet.has(String(h.id || '').trim().padStart(3, '0')) ? `<div class="cp-mini-lv" style="left:8px; right:auto;">In Team</div>` : ``}
          ${jewelIconSrcForElement(h.element) ? `<img class="cp-hero-jewel" src="${esc(jewelIconSrcForElement(h.element))}" alt="" aria-hidden="true">` : ``}
        </div>
        <div class="cp-hero-mini-meta">
          <div class="cp-hero-mini-name">${esc(h.name)}</div>
          <div class="cp-hero-mini-sub">#${esc(h.id)} · ${esc(elementLabel(h.element))}</div>
        </div>
      </button>
    `).join('') || `<div class="cp-muted">No heroes found.</div>`;
      host.querySelectorAll('[data-hero-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = String(btn.getAttribute('data-hero-id') || '');
          if (!admin) {
            const owned2 = getOwnedHeroSet();
            if (!owned2.has(id)) return;
          }
          try {
            if (window.ChessPalTutorialFlow?.isActive?.()) {
              const ok = !!window.ChessPalTutorialFlow?.guardHeroSelection?.(id);
              if (!ok) {
                const req = String(window.ChessPalTutorialFlow?.requiredHeroIdForLevelUpStep?.() || '002');
                try { setMsg(`Please select #${req} Nyxblade for this tutorial step.`); } catch {}
                return;
              }
            }
          } catch {}
          const hero = getAllHeroes().find(x => x.id === id);
          if (hero) showHeroModal(hero);
        });
      });
    };
    searchEl?.addEventListener('input', renderList);
    elemEl?.addEventListener('change', renderList);
    rarityEl?.addEventListener('change', renderList);
    renderList();
    try { preloadImages(baseList.map(x => x.mini || x.img).filter(Boolean), 36); } catch {}
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
    const lvLocalRaw = getNumberFromMap(MONSTER_LEVEL_OVERRIDE_KEY, b.id);

    // Base stats (optionally overridden by admin)
    const baseHp = (o.hp != null) ? Number(o.hp) : b.hp;
    const baseAtk = (o.atk != null) ? Number(o.atk) : b.atk;
    const baseRcv = (o.rcv != null) ? Number(o.rcv) : b.rcv;
    // Simple growth for monsters: +5% per level above 1
    const admin = isAdminMode();
    const overrideLevel = (o.level != null) ? Number(o.level) : b.level;
    const level = Number.isFinite(lvLocalRaw)
      ? Math.max(1, Math.min(cap, Math.floor(lvLocalRaw || 1)))
      : ((admin && o.level != null) ? Math.max(1, Math.min(cap, Math.floor(Number(overrideLevel) || 1))) : derivedLevel);
    const mult = 1 + Math.max(0, level - 1) * 0.05;
    const scaledHp = Math.max(1, Math.floor((Number(baseHp) || 1) * mult));
    const scaledAtk = Math.max(0, Math.floor((Number(baseAtk) || 0) * mult));
    const scaledRcv = Math.max(0, Math.floor((Number(baseRcv) || 0) * mult));
    const cdLocalRaw = getNumberFromMap(MONSTER_CD_OVERRIDE_KEY, b.id);
    const baseCd = Math.max(1, Math.floor(Number(active?.cd) || 1));
    const cdFromLocal = Number(cdLocalRaw);
    const cdFromServer = Number(o?.activeCd);
    const resolvedCd = Number.isFinite(cdFromLocal) && cdFromLocal >= 1
      ? Math.floor(cdFromLocal)
      : (Number.isFinite(cdFromServer) && cdFromServer >= 1 ? Math.floor(cdFromServer) : baseCd);

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
        text: stripSkillPlaceholderText(active?.text),
        cd: resolvedCd,
        params: (o.activeParams && typeof o.activeParams === 'object') ? o.activeParams : active.params
      },
      passiveSkill: {
        ...passive,
        text: stripSkillPlaceholderText(passive?.text),
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
    const npcSkillName = String(m?.npcSkill?.name || `${m?.activeSkill?.name || 'Active Skill'} (NPC)`);
    const npcSkillText = String(m?.npcSkill?.text || m?.activeSkill?.text || 'No NPC skill description.');
    const npcSkillValues = formatNpcSkillParams(m?.npcSkill?.params || m?.activeSkill?.params);
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
                ${canLevelUp ? `<button class="cp-tool-btn cp-levelup-btn" type="button" id="cpMonsterLevelUpBtn">Level Up</button>` : ``}
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
                  </div>
                  <div class="cp-muted" style="margin-top:8px;">NPC Skill · ${esc(npcSkillName)}</div>
                  <div class="cp-skill-desc" style="margin-top:6px;">${esc(npcSkillText)}</div>
                  <div class="cp-muted" style="margin-top:8px;">Values: ${esc(npcSkillValues)}</div>
                </div>
              ` : ''}
            </div>
          </div>
          ${admin ? `
            <div class="cp-row" style="justify-content:center; margin-top:12px;">
              <button class="cp-tool-btn" type="button" id="cpOpenMonsterAdminEdit">Admin Edit</button>
            </div>
          ` : ''}
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
              <input type="number" id="cpAdminActiveCd" value="${esc(Math.max(1, Math.floor(Number(merged.activeSkill?.cd) || 1)))}" min="1" step="1">
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
        monsterOverrides[merged.id].activeCd = Number.isFinite(cd)
          ? Math.max(1, Math.floor(cd))
          : Math.max(1, Math.floor(Number(merged.activeSkill?.cd) || 1));
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
        <div class="cp-row" style="margin-top:0; gap:8px; flex-wrap:wrap;">
          <input class="cp-input cp-search-input cp-search-input--short" id="cpMonstersSearch" type="text" placeholder="Search Monster by ID or name">
          <select class="cp-select" id="cpMonstersElementFilter" style="width:170px;">
            <option value="">All Elements</option>
            <option value="fire">Fire</option>
            <option value="water">Water</option>
            <option value="wood">Wood</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="heart">Heart</option>
          </select>
          <select class="cp-select" id="cpMonstersRarityFilter" style="width:150px;">
            <option value="">All Stars</option>
            <option value="1">★1</option>
            <option value="2">★2</option>
            <option value="3">★3</option>
            <option value="4">★4</option>
            <option value="5">★5</option>
            <option value="6">★6</option>
            <option value="7">★7</option>
            <option value="8">★8</option>
            <option value="9">★9</option>
            <option value="10">★10</option>
          </select>
        </div>
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
    const baseList = admin ? all : all.filter(m => (owned && owned.has(m.id)) || (seen && seen.has(m.id)));
    const teamMonsterSet = (() => {
      const set = new Set();
      try {
        const team = getTeam();
        ['a', 'b', 'c', 'd'].forEach((k) => {
          const u = getTeamUnit(team?.[k]);
          if (u && String(u.kind || '') === 'monster') set.add(String(u.id || '').trim().padStart(3, '0'));
        });
      } catch {}
      return set;
    })();
    const searchEl = document.getElementById('cpMonstersSearch');
    const elemEl = document.getElementById('cpMonstersElementFilter');
    const rarityEl = document.getElementById('cpMonstersRarityFilter');
    const renderList = () => {
      const q = String(searchEl?.value || '').trim().toLowerCase();
      const ef = String(elemEl?.value || '').trim().toLowerCase();
      const rf = String(rarityEl?.value || '').trim();
      const list = baseList.filter((m) => {
        if (q) {
          const s = `${String(m.id || '').toLowerCase()} ${String(m.name || '').toLowerCase()}`;
          if (!s.includes(q)) return false;
        }
        if (ef && String(m.element || '').toLowerCase() !== ef) return false;
        if (rf && String(Math.max(1, Math.min(10, Math.floor(Number(m.rarity) || 1)))) !== rf) return false;
        return true;
      }).sort((a, b) => {
        const aIn = teamMonsterSet.has(String(a?.id || '').trim().padStart(3, '0')) ? 1 : 0;
        const bIn = teamMonsterSet.has(String(b?.id || '').trim().padStart(3, '0')) ? 1 : 0;
        if (bIn !== aIn) return bIn - aIn;
        return Number(String(a?.id || 0)) - Number(String(b?.id || 0));
      });
      host.innerHTML = list.map(m => `
      <button class="cp-hero-card ${(!admin && owned && !owned.has(m.id)) ? 'is-locked' : ''} ${teamMonsterSet.has(String(m.id || '').trim().padStart(3, '0')) ? 'is-inteam' : ''}" type="button" data-monster-id="${esc(m.id)}" data-element="${esc(String(m.element || ''))}" ${(!admin && owned && !owned.has(m.id)) ? 'disabled' : ''}>
        <div class="cp-hero-mini">
          ${m.mini ? `<img src="${esc(m.mini)}" alt="${esc(m.name)}" decoding="async" loading="lazy">` : `<div class="cp-mini-placeholder">${esc(m.name)}</div>`}
          <div class="cp-mini-lv">Lv ${esc(m.level)}</div>
          ${teamMonsterSet.has(String(m.id || '').trim().padStart(3, '0')) ? `<div class="cp-mini-lv" style="left:8px; right:auto;">In Team</div>` : ``}
        </div>
        <div class="cp-hero-mini-meta">
          <div class="cp-hero-mini-name">${esc(m.name)}</div>
          <div class="cp-hero-mini-sub">#${esc(m.id)} · ${esc(elementLabel(m.element))}</div>
        </div>
      </button>
    `).join('') || `<div class="cp-muted">No monsters found.</div>`;
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
    };
    searchEl?.addEventListener('input', renderList);
    elemEl?.addEventListener('change', renderList);
    rarityEl?.addEventListener('change', renderList);
    renderList();
    try { preloadImages(baseList.map(x => x.mini || x.img).filter(Boolean), 36); } catch {}
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
    const allowedMonsterSet = getOwnedMonsterSet();
    const allowedMonsterIds = Array.from(allowedMonsterSet);

    // Enforce rule: only owned monsters can stay in team slots.
    let mutated = false;
    const nextState = normalizeTeamState(state);
    for (let ti = 0; ti < 5; ti += 1) {
      for (let si = 0; si < 4; si += 1) {
        const parsed = parseTeamSlot(nextState.teams?.[ti]?.[si]);
        if (parsed?.kind === 'monster' && !allowedMonsterSet.has(String(parsed.id || ''))) {
          nextState.teams[ti][si] = null;
          mutated = true;
        }
      }
    }
    if (mutated) {
      state = nextState;
      saveTeams(state);
    }

    const render = () => {
      const idx = Math.max(0, Math.min(4, Number(state.active) || 0));
      const team = state.teams[idx] || [null, null, null, null];
      if (title) title.textContent = `Team ${idx + 1} / 5`;
      const units = team.map(id => id ? getTeamUnit(id) : null).filter(Boolean);
      const teamTotalHp = units.reduce((sum, u) => sum + Math.max(0, Math.floor(Number(u?.hp) || 0)), 0);
      const teamTotalRcv = units.reduce((sum, u) => sum + Math.max(0, Math.floor(Number(u?.rcv) || 0)), 0);

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
      const memberSkillRows = team
        .map(id => id ? getTeamUnit(id) : null)
        .filter(Boolean)
        .map((u, idx2) => {
          const role = idx2 === 0 ? 'Leader' : `Member ${idx2}`;
          const unitType = u.kind === 'monster' ? 'Monster' : 'Hero';
          const activeName = String(u?.activeSkill?.name || '').trim() || 'No Active Skill';
          const activeCd = Math.max(0, Math.floor(Number(u?.activeSkill?.cd) || 0));
          const activeText = String(u?.activeSkill?.text || '').trim() || 'This unit has no active skill effect.';
          return `
            <div class="cp-setting-item" style="margin-top:8px; background: rgba(255,255,255,0.02); border-style:dashed;">
              <div class="cp-setting-label">${esc(role)} · ${esc(unitType)} ${esc(u.name || '')}</div>
              <div class="cp-setting-help" style="margin-top:6px;"><strong>Active:</strong> ${esc(activeName)} (CD ${esc(String(activeCd))})</div>
              <div class="cp-setting-help" style="margin-top:4px;">${esc(activeText)}</div>
            </div>
          `;
        });
      if (skill) {
        skill.innerHTML = `
          <div class="cp-setting-item" style="background: rgba(255,255,255,0.03);">
            <div class="cp-setting-label">Team Total</div>
            <div class="cp-setting-help" style="margin-top:6px;">HP: ${esc(String(teamTotalHp))} · RCV: ${esc(String(teamTotalRcv))}</div>
          </div>
        ` + (leader ? `
          <div class="cp-setting-item" style="background: rgba(255,255,255,0.03);">
            <div class="cp-setting-label">${leader.kind === 'monster' ? 'Leader Passive Skill' : 'Leader Skill'}</div>
            <div class="cp-setting-help">${esc(leader.kind === 'monster' ? (leader.passiveSkill?.text || '') : (leader.leaderSkill?.text || ''))}</div>
          </div>
          <div class="cp-setting-item" style="margin-top:10px; background: rgba(255,255,255,0.03);">
            <div class="cp-setting-label">Team Skills</div>
            <div class="cp-setting-help" style="margin-top:6px;">Each unit active skill details:</div>
            ${memberSkillRows.length ? memberSkillRows.join('') : '<div class="cp-setting-help">—</div>'}
          </div>
        ` : `
          <div class="cp-muted">Pick a leader to see team skills.</div>
        `);
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
              if (!isAdminMode()) {
                const parsed = parseTeamSlot(id);
                if (parsed?.kind === 'monster') {
                  const ownedNow = getOwnedMonsterSet();
                  if (!ownedNow.has(String(parsed.id || ''))) return;
                }
              }
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

  async function applyRewindRookToUnit(slotKey) {
    const parsed = parseTeamSlot(slotKey);
    if (!parsed) return { ok: false, message: 'Pick a valid Hero/Monster first.' };
    const unit = getTeamUnit(slotKey);
    if (!unit) return { ok: false, message: 'Unit not found.' };
    const currentCd = Math.max(0, Math.floor(Number(unit?.activeSkill?.cd) || 0));
    if (currentCd <= 1) return { ok: false, message: 'CD is already 1. Cannot reduce further.' };
    if (parsed.kind === 'hero') {
      await loadHeroOverrides();
      if (!heroOverrides[parsed.id]) heroOverrides[parsed.id] = {};
      const used = Math.max(0, Math.floor(Number(heroOverrides[parsed.id]?.cdReduceUsed) || 0));
      if (used >= 5) return { ok: false, message: 'This unit already used Rewind Rook 5 times.' };
      heroOverrides[parsed.id] = {
        ...heroOverrides[parsed.id],
        activeCd: Math.max(1, currentCd - 1),
        cdReduceUsed: used + 1,
      };
      await saveHeroOverridesToServer();
      return { ok: true, beforeCd: currentCd, afterCd: Math.max(1, currentCd - 1), usedAfter: used + 1 };
    }
    await loadMonsterOverrides();
    if (!monsterOverrides[parsed.id]) monsterOverrides[parsed.id] = {};
    const used = Math.max(0, Math.floor(Number(monsterOverrides[parsed.id]?.cdReduceUsed) || 0));
    if (used >= 5) return { ok: false, message: 'This unit already used Rewind Rook 5 times.' };
    monsterOverrides[parsed.id] = {
      ...monsterOverrides[parsed.id],
      activeCd: Math.max(1, currentCd - 1),
      cdReduceUsed: used + 1,
    };
    await saveMonsterOverridesToServer();
    return { ok: true, beforeCd: currentCd, afterCd: Math.max(1, currentCd - 1), usedAfter: used + 1 };
  }

  function EnhancePage() {}
  EnhancePage.title = 'Enhance';
  EnhancePage.render = () => {
    return `
      <div>
        <div class="cp-enhance-grid" style="margin-top:12px;">
          <button class="cp-enhance-slot" type="button" id="cpEnhanceTargetSlot">
            <div class="cp-enhance-slot-title">Target Hero / Monster</div>
            <div class="cp-enhance-slot-body" id="cpEnhanceTargetBody">Tap to select</div>
          </button>
          <div class="cp-enhance-plus" aria-hidden="true">+</div>
          <button class="cp-enhance-slot" type="button" id="cpEnhanceMatSlot">
            <div class="cp-enhance-slot-title">Material</div>
            <div class="cp-enhance-slot-body" id="cpEnhanceMatBody">Tap to select</div>
          </button>
        </div>
        <div class="cp-row" style="margin-top:12px; justify-content:center;">
          <button class="cp-primary" type="button" id="cpEnhanceConfirm" disabled>Enhance</button>
        </div>
        <div class="cp-muted" id="cpEnhanceMsg" style="margin-top:10px;"></div>
        <div id="cpEnhanceResult" style="margin-top:10px;"></div>
      </div>
    `;
  };
  EnhancePage.init = async () => {
    try { await loadHeroOverrides(); } catch {}
    try { await loadMonsterOverrides(); } catch {}
    const targetSlot = document.getElementById('cpEnhanceTargetSlot');
    const matSlot = document.getElementById('cpEnhanceMatSlot');
    const targetBody = document.getElementById('cpEnhanceTargetBody');
    const matBody = document.getElementById('cpEnhanceMatBody');
    const confirmBtn = document.getElementById('cpEnhanceConfirm');
    const resultHost = document.getElementById('cpEnhanceResult');
    const msg = document.getElementById('cpEnhanceMsg');
    const setMsg = (t) => { if (msg) msg.textContent = String(t || ''); };
    const showEnhanceResultModal = ({ unit, beforeCd, afterCd }) => {
      const old = document.getElementById('cpEnhanceResultOverlay');
      if (old) old.remove();
      const overlay = document.createElement('div');
      overlay.id = 'cpEnhanceResultOverlay';
      overlay.className = 'cp-modal-overlay';
      const unitImg = String(unit?.img || unit?.mini || '').trim();
      const unitName = String(unit?.name || 'Unit');
      const unitType = String(unit?.kind || '').toLowerCase() === 'monster' ? 'Monster' : 'Hero';
      overlay.innerHTML = `
        <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Enhance result">
          <button class="cp-modal-close" type="button" aria-label="Close">×</button>
          <div class="cp-modal-body">
            <div class="cp-h1" style="font-size:20px;">Enhance Result</div>
            <div class="cp-setting-item" style="margin-top:12px; background:rgba(255,255,255,0.03);">
              <div class="cp-row" style="margin-top:0; align-items:center; gap:10px;">
                <div style="width:112px;height:112px;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.18);">
                  ${unitImg ? `<img src="${esc(unitImg)}" alt="${esc(unitName)}" style="width:100%;height:100%;object-fit:contain;" decoding="async" loading="lazy">` : ''}
                </div>
                <div>
                  <div class="cp-setting-label">${esc(unitType)} · ${esc(unitName)}</div>
                  <div class="cp-cd-flash">CD ${esc(String(beforeCd))} -> ${esc(String(afterCd))}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const close = () => { try { overlay.remove(); } catch {} };
      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
      overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
    };

    let targetKey = '';
    let materialId = '';

    const showPickStorageMaterialModal = ({ allowItemIds = [], onPick }) => {
      const old = document.getElementById('cpPickMatOverlay');
      if (old) old.remove();
      const allow = new Set((Array.isArray(allowItemIds) ? allowItemIds : []).map(x => String(x || '').trim().toLowerCase()).filter(Boolean));
      const slots = loadStorage();
      const rows = slots
        .filter(s => s && typeof s === 'object')
        .map(s => ({ itemId: String(s.itemId || '').trim().toLowerCase(), qty: Math.max(1, Math.floor(Number(s.qty) || 1)) }))
        .filter(s => (allow.size ? allow.has(s.itemId) : true));
      const merged = {};
      rows.forEach((r) => { merged[r.itemId] = (merged[r.itemId] || 0) + r.qty; });
      const list = Object.entries(merged).map(([itemId, qty]) => ({ itemId, qty }));

      const overlay = document.createElement('div');
      overlay.id = 'cpPickMatOverlay';
      overlay.className = 'cp-modal-overlay';
      overlay.innerHTML = `
        <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Pick material">
          <button class="cp-modal-close" type="button" aria-label="Close">×</button>
          <div class="cp-modal-body">
            <div class="cp-h1" style="font-size:18px;">Pick Material</div>
            <div class="cp-hero-grid" style="margin-top:12px;" id="cpPickMatGrid">
              ${list.map((r) => {
                const def = getStorageItemDef(r.itemId);
                return `
                  <button class="cp-hero-card" type="button" data-pick-mat="${esc(r.itemId)}">
                    <div class="cp-hero-mini">
                      ${def?.img ? renderImgWithFallback(def.img, def?.name || r.itemId, '') : `<div class="cp-mini-placeholder">${esc(r.itemId)}</div>`}
                      <div class="cp-mini-lv">Qty ${esc(String(r.qty))}</div>
                    </div>
                    <div class="cp-hero-mini-meta">
                      <div class="cp-hero-mini-name">${esc(String(def?.name || r.itemId))}</div>
                      <div class="cp-hero-mini-sub">#${esc(String(r.itemId))}</div>
                    </div>
                  </button>
                `;
              }).join('') || `<div class="cp-muted">No valid material in Storage.</div>`}
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const close = () => { try { overlay.remove(); } catch {} };
      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
      overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
      overlay.querySelectorAll('[data-pick-mat]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const itemId = String(btn.getAttribute('data-pick-mat') || '').trim().toLowerCase();
          try { onPick && onPick(itemId); } catch {}
          close();
        }, { passive: true });
      });
    };

    const updateUi = () => {
      const u = targetKey ? getTeamUnit(targetKey) : null;
      if (targetBody) {
        const src = String(u?.img || u?.mini || '').trim();
        targetSlot?.classList.toggle('has-media', !!(u && src));
        targetBody.innerHTML = (u && src)
          ? `<div class="cp-enhance-media"><img src="${esc(src)}" alt="${esc(String(u?.name || 'Unit'))}" decoding="async" loading="lazy"></div>`
          : 'Tap to select';
      }
      if (matBody) {
        const def = materialId ? getStorageItemDef(materialId) : null;
        const src = String(def?.img || '').trim();
        matSlot?.classList.toggle('has-media', !!(def && src));
        matBody.innerHTML = (def && src)
          ? `<div class="cp-enhance-media"><img src="${esc(src)}" alt="${esc(String(def?.name || materialId))}" decoding="async" loading="lazy"></div>`
          : 'Tap to select';
      }
      if (confirmBtn) confirmBtn.disabled = !(targetKey && materialId);
    };

    targetSlot?.addEventListener('click', () => {
      const ownedHeroIds = isAdminMode() ? getAllHeroes().map(h => h.id) : Array.from(getOwnedHeroSet());
      const ownedMonsterIds = isAdminMode() ? getAllMonsters().map(m => m.id) : Array.from(getOwnedMonsterSet());
      showPickTeamUnitModal({
        title: 'Pick target unit',
        allowHeroIds: ownedHeroIds,
        allowMonsterIds: ownedMonsterIds,
        onPick: (slot) => {
          targetKey = String(slot || '').trim();
          updateUi();
        },
        onClear: () => {
          targetKey = '';
          updateUi();
        }
      });
    }, { passive: true });

    matSlot?.addEventListener('click', () => {
      showPickStorageMaterialModal({
        allowItemIds: ['rewind_rook'],
        onPick: (itemId) => {
          materialId = String(itemId || '').trim().toLowerCase();
          updateUi();
        }
      });
    }, { passive: true });

    confirmBtn?.addEventListener('click', async () => {
      try {
        setMsg('');
        if (!targetKey) throw new Error('Please pick a target.');
        if (materialId !== 'rewind_rook') throw new Error('Please pick Rewind Rook.');
        const slots = loadStorage();
        const spent = spendFromStorage(slots, materialId, 1);
        if (!spent.ok) throw new Error('Not enough Rewind Rook.');
        const res = await applyRewindRookToUnit(targetKey);
        if (!res.ok) throw new Error(res.message || 'Enhance failed.');
        saveStorage(spent.slots);

        targetSlot?.classList.add('is-consuming');
        matSlot?.classList.add('is-consuming');
        await new Promise((resolve) => setTimeout(resolve, 520));
        targetSlot?.classList.remove('is-consuming');
        matSlot?.classList.remove('is-consuming');
        materialId = '';
        updateUi();

        const nextUnit = getTeamUnit(targetKey);
        if (resultHost && nextUnit) {
          resultHost.innerHTML = `
            <div class="cp-setting-item" style="background:rgba(255,255,255,0.03);">
              <div class="cp-row" style="margin-top:0; align-items:center; gap:10px;">
                ${nextUnit.mini ? `<img src="${esc(nextUnit.mini)}" alt="${esc(nextUnit.name)}" style="width:56px;height:56px;border-radius:12px;object-fit:cover;">` : ''}
                <div>
                  <div class="cp-setting-label">${esc(nextUnit.kind === 'monster' ? 'Monster' : 'Hero')} · ${esc(nextUnit.name || '')}</div>
                  <div class="cp-setting-help">Skill CD updated.</div>
                  <div class="cp-cd-flash">CD ${esc(String(res.beforeCd))} → ${esc(String(res.afterCd))} · Rewind used ${esc(String(res.usedAfter))}/5</div>
                </div>
              </div>
            </div>
          `;
        }
        try { showEnhanceResultModal({ unit: nextUnit, beforeCd: res.beforeCd, afterCd: res.afterCd }); } catch {}
        setMsg('Skill enhanced successfully.');
      } catch (e) {
        setMsg(String(e?.message || e || 'Enhance failed'));
      }
    }, { passive: true });

    updateUi();
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
    rewind_rook: { id: 'rewind_rook', name: 'Rewind Rook', img: 'images/Storage/S009-Rewind-Rook.png' },
    exp_pawn: { id: 'exp_pawn', name: 'EXP Pawn', img: 'images/Storage/S003-Exp-Pawn.png' },
    exp_knight: { id: 'exp_knight', name: 'EXP Knight', img: 'images/Storage/S004-Exp-Knight.png' },
    exp_bishop: { id: 'exp_bishop', name: 'EXP Bishop', img: 'images/Storage/S005-Exp-Bishop.png' },
    exp_rook: { id: 'exp_rook', name: 'EXP Rook', img: 'images/Storage/S006-Exp-Rook.png' },
    exp_queen: { id: 'exp_queen', name: 'EXP Queen', img: 'images/Storage/S008-Exp-Queen.png' },
    exp_king: { id: 'exp_king', name: 'EXP King', img: 'images/Storage/S009-Exp-King.png' },
  };

  function getStorageItemDef(itemId) {
    const key = String(itemId || '').trim().toLowerCase();
    return STORAGE_ITEM_DEFS[key] || null;
  }
  try {
    window.ChessPalStorage = {
      getStorageItemDef,
    };
  } catch {}

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
    if (base.includes('Exp-Rook')) {
      legacy.push('images/Storage/Exp-Rook.png');
      legacy.unshift('images/Storage/S007-Exp-Rook.png');
      legacy.unshift('images/Storage/S006-Exp-Rook.png');
    }
    if (base.includes('Exp-Queen')) {
      legacy.push('images/Storage/Exp-Queen.png');
      legacy.unshift('images/Storage/S007-Exp-Queen.png');
      legacy.unshift('images/Storage/S008-Exp-Queen.png');
    }
    if (base.includes('Exp-King')) {
      legacy.push('images/Storage/Exp-King.png');
      legacy.unshift('images/Storage/S009-Exp-King.png');
      legacy.unshift('images/Storage/S008-Exp-King.png');
    }
    // Legacy soldier naming (older builds)
    if (base.includes('Exp-Soldier')) {
      legacy.push('images/Storage/Exp-Soldier.png');
      legacy.unshift('images/Storage/S003-Exp-Soldier.png');
      legacy.unshift('images/Storage/S002-Exp-Soldier.png');
    }
    if (base.includes('Rewind-Rook')) {
      legacy.push('images/Storage/Rewind-Rook.png');
      legacy.unshift('images/Storage/S009-Rewind-Rook.png');
      legacy.unshift('images/Storage/S010-Rewind-Rook.png');
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

  const CHESSCOM_REWARD_KEY = 'chessPalChessComReward';

  function loadChessComRewardState() {
    try {
      const raw = localStorage.getItem(CHESSCOM_REWARD_KEY);
      if (!raw) return { chessComId: '', claimDate: '', todayWins: 0, claimedWins: 0, rapid: null };
      const v = JSON.parse(raw);
      return {
        chessComId: String(v?.chessComId || '').trim().toLowerCase(),
        claimDate: String(v?.claimDate || '').trim(),
        todayWins: Math.max(0, Math.floor(Number(v?.todayWins) || 0)),
        claimedWins: Math.max(0, Math.floor(Number(v?.claimedWins) || 0)),
        lastCheckedAt: Math.max(0, Math.floor(Number(v?.lastCheckedAt) || 0)),
        rapid: v?.rapid && typeof v.rapid === 'object' ? {
          win: Math.max(0, Math.floor(Number(v.rapid.win) || 0)),
          loss: Math.max(0, Math.floor(Number(v.rapid.loss) || 0)),
          draw: Math.max(0, Math.floor(Number(v.rapid.draw) || 0)),
        } : null,
      };
    } catch {
      return { chessComId: '', claimDate: '', todayWins: 0, claimedWins: 0, rapid: null };
    }
  }

  function saveChessComRewardState(s) {
    try { localStorage.setItem(CHESSCOM_REWARD_KEY, JSON.stringify(s || {})); } catch {}
    try { window.dispatchEvent(new Event('cpChessComRewardChanged')); } catch {}
  }

  function isChessComClaimedToday(stateLike) {
    const s = stateLike || loadChessComRewardState();
    return String(s?.claimDate || '') === localDateKey(new Date());
  }

  async function fetchChessComRapidAndTodayWins(chessComId) {
    const id = String(chessComId || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,30}$/.test(id)) throw new Error('Invalid chess.com ID format.');
    const statsResp = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(id)}/stats`, { method: 'GET' });
    if (!statsResp.ok) throw new Error('Failed to load chess.com stats.');
    const stats = await statsResp.json().catch(() => ({}));
    const rapid = stats?.chess_rapid?.record || {};
    const rapidRecord = {
      win: Math.max(0, Math.floor(Number(rapid?.win) || 0)),
      loss: Math.max(0, Math.floor(Number(rapid?.loss) || 0)),
      draw: Math.max(0, Math.floor(Number(rapid?.draw) || 0)),
    };

    const archivesResp = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(id)}/games/archives`, { method: 'GET' });
    if (!archivesResp.ok) throw new Error('Failed to load chess.com archives.');
    const archivesData = await archivesResp.json().catch(() => ({}));
    const archives = Array.isArray(archivesData?.archives) ? archivesData.archives : [];
    const todayKey = localDateKey(new Date());
    let winsToday = 0;
    if (archives.length) {
      const latest = String(archives[archives.length - 1] || '').trim();
      if (latest) {
        const gamesResp = await fetch(latest, { method: 'GET' });
        if (gamesResp.ok) {
          const gamesData = await gamesResp.json().catch(() => ({}));
          const games = Array.isArray(gamesData?.games) ? gamesData.games : [];
          winsToday = games.filter((g) => {
            const endTs = Math.floor(Number(g?.end_time) || 0);
            if (!(endTs > 0)) return false;
            const day = localDateKey(new Date(endTs * 1000));
            if (day !== todayKey) return false;
            const w = String(g?.white?.username || '').trim().toLowerCase();
            const b = String(g?.black?.username || '').trim().toLowerCase();
            const winner = String(g?.winner || '').trim().toLowerCase();
            if (winner === 'white' && w === id) return true;
            if (winner === 'black' && b === id) return true;
            return false;
          }).length;
        }
      }
    }
    return { rapid: rapidRecord, todayWins: Math.max(0, winsToday) };
  }

  function showChessComRewardModal(onUpdated) {
    const old = document.getElementById('cpChessComOverlay');
    if (old) old.remove();
    const st = loadChessComRewardState();
    const overlay = document.createElement('div');
    overlay.id = 'cpChessComOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Chess.com reward">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-h1" style="font-size:18px;">Chess.com game play</div>
          <div class="cp-muted" style="margin-top:6px;">Set your Chess.com ID, view Rapid record, and claim Gold once per day based on today's wins.</div>
          <div class="cp-setting-item" id="cpChessComStudentRow" style="margin-top:12px; display:none;">
            <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">Student (Admin only)</div>
            <div class="cp-row" style="margin-top:0; gap:8px; align-items:center;">
              <select class="cp-select" id="cpChessComStudentSelect" style="flex:1 1 auto;"></select>
              <button class="cp-tool-btn" type="button" id="cpChessComBindSaveBtn">Save ID</button>
            </div>
          </div>
          <div class="cp-setting-item" style="margin-top:12px;">
            <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">Chess.com ID</div>
            <div class="cp-row" style="margin-top:0; gap:8px; align-items:center;">
              <div id="cpChessComIdInputWrap" style="flex:1 1 auto;">
                <input class="cp-input" id="cpChessComIdInput" type="text" placeholder="username" value="${esc(String(st.chessComId || ''))}" style="width:100%;">
              </div>
              <div id="cpChessComIdTextWrap" style="flex:1 1 auto; display:none;">
                <div class="cp-setting-help" id="cpChessComIdText" style="margin:0; padding:10px 12px; border:1px solid rgba(255,255,255,0.12); border-radius:10px; background:rgba(255,255,255,0.04);">-</div>
              </div>
              <button class="cp-tool-btn" type="button" id="cpChessComRefresh">Refresh</button>
            </div>
          </div>
          <div class="cp-setting-item" style="margin-top:10px;">
            <div class="cp-setting-help" id="cpChessComRapidText">Rapid Record: ${esc(st.rapid ? `${st.rapid.win}-${st.rapid.loss}-${st.rapid.draw}` : 'N/A')}</div>
            <div class="cp-setting-help" id="cpChessComTodayWins">Today Wins: ${esc(String(Math.max(0, Number(st.todayWins) || 0)))}</div>
            <div class="cp-setting-help" id="cpChessComClaimInfo">Claim status: ${isChessComClaimedToday(st) ? 'Claimed today' : 'Not claimed today'}</div>
          </div>
          <div class="cp-row" style="margin-top:12px; justify-content:flex-end; gap:8px;">
            <button class="cp-tool-btn" type="button" id="cpChessComClaimBtn" ${isChessComClaimedToday(st) ? 'disabled' : ''}>Claim Gold</button>
            <button class="cp-tool-btn" type="button" id="cpChessComCloseBtn">Close</button>
          </div>
          <div class="cp-muted" id="cpChessComMsg" style="margin-top:10px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const msg = overlay.querySelector('#cpChessComMsg');
    const rapidText = overlay.querySelector('#cpChessComRapidText');
    const winsText = overlay.querySelector('#cpChessComTodayWins');
    const claimText = overlay.querySelector('#cpChessComClaimInfo');
    const claimBtn = overlay.querySelector('#cpChessComClaimBtn');
    const idInput = overlay.querySelector('#cpChessComIdInput');
    const idInputWrap = overlay.querySelector('#cpChessComIdInputWrap');
    const idTextWrap = overlay.querySelector('#cpChessComIdTextWrap');
    const idText = overlay.querySelector('#cpChessComIdText');
    const studentRow = overlay.querySelector('#cpChessComStudentRow');
    const studentSel = overlay.querySelector('#cpChessComStudentSelect');
    const bindSaveBtn = overlay.querySelector('#cpChessComBindSaveBtn');
    let isAdmin = false;
    let boundStudentId = '';
    const getCurrentChessComId = () => {
      if (isAdmin) return String(idInput?.value || '').trim().toLowerCase();
      return String(idText?.textContent || '').trim().toLowerCase();
    };
    const setMsg = (t) => { if (msg) msg.textContent = String(t || ''); };
    const setUiByState = (s) => {
      const r = s?.rapid || null;
      if (rapidText) rapidText.textContent = `Rapid Record: ${r ? `${r.win}-${r.loss}-${r.draw}` : 'N/A'}`;
      if (winsText) winsText.textContent = `Today Wins: ${Math.max(0, Math.floor(Number(s?.todayWins) || 0))}`;
      const claimed = isChessComClaimedToday(s);
      if (claimText) claimText.textContent = `Claim status: ${claimed ? 'Claimed today' : 'Not claimed today'}`;
      if (claimBtn) claimBtn.disabled = claimed;
    };
    setUiByState(st);

    const close = () => {
      try { overlay.remove(); } catch {}
      try { window.removeEventListener('keydown', onKey); } catch {}
    };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
    overlay.querySelector('#cpChessComCloseBtn')?.addEventListener('click', close, { passive: true });
    window.addEventListener('keydown', onKey);

    const loadBinding = async (studentIdForAdmin = '') => {
      if (!window.authUtils || typeof window.authUtils.authenticatedFetch !== 'function') throw new Error('Authentication is not ready');
      const q = studentIdForAdmin ? `?studentId=${encodeURIComponent(studentIdForAdmin)}` : '';
      const resp = await window.authUtils.authenticatedFetch(`/chess-pal/chesscom-id${q}`, { method: 'GET' });
      if (!resp || !resp.ok) {
        const err = await resp?.json?.().catch(() => ({}));
        throw new Error(String(err?.error || 'Failed to load student chess.com ID binding'));
      }
      return resp.json();
    };

    const loadAdminStudents = async () => {
      if (!window.authUtils || typeof window.authUtils.authenticatedFetch !== 'function') return [];
      const resp = await window.authUtils.authenticatedFetch('/students', { method: 'GET' });
      if (!resp || !resp.ok) return [];
      const arr = await resp.json().catch(() => []);
      return Array.isArray(arr) ? arr : [];
    };

    const refreshByCurrentId = async () => {
      const id = getCurrentChessComId();
      if (!id) throw new Error('Chess.com ID is empty.');
      const data = await fetchChessComRapidAndTodayWins(id);
      const cur = loadChessComRewardState();
      const next = { ...cur, chessComId: id, rapid: data.rapid, todayWins: data.todayWins, lastCheckedAt: Date.now() };
      saveChessComRewardState(next);
      setUiByState(next);
      return next;
    };

    const bootstrap = async () => {
      try {
        setMsg('');
        const me = await loadBinding();
        isAdmin = String(me?.role || '').toLowerCase() === 'admin';
        if (isAdmin) {
          if (studentRow) studentRow.style.display = '';
          const list = await loadAdminStudents();
          const options = list
            .map((s) => ({
              id: String(s?.id || '').trim(),
              name: String(s?.name || 'Student').trim() || 'Student',
              chessComId: String(s?.chessComId || '').trim().toLowerCase(),
            }))
            .filter((x) => x.id)
            .sort((a, b) => a.name.localeCompare(b.name));
          if (studentSel) {
            studentSel.innerHTML = options.map((o) => `<option value="${esc(o.id)}">#${esc(o.id)} ${esc(o.name)}${o.chessComId ? ` · ${esc(o.chessComId)}` : ''}</option>`).join('');
          }
          const firstId = options[0]?.id || '';
          if (studentSel && firstId) studentSel.value = firstId;
          if (firstId) {
            const b = await loadBinding(firstId);
            boundStudentId = String(b?.student?.id || '').trim();
            if (idInput) idInput.value = String(b?.student?.chessComId || '').trim();
            if (idText) idText.textContent = String(b?.student?.chessComId || '').trim();
          }
          if (idInputWrap) idInputWrap.style.display = '';
          if (idTextWrap) idTextWrap.style.display = 'none';
          if (idInput) idInput.disabled = false;
          if (bindSaveBtn) bindSaveBtn.disabled = false;
        } else {
          const s = me?.student || null;
          if (!s) throw new Error('No linked student profile. Please contact Admin.');
          boundStudentId = String(s?.id || '').trim();
          if (idInput) {
            idInput.value = String(s?.chessComId || '').trim();
            idInput.disabled = true;
          }
          if (idText) idText.textContent = String(s?.chessComId || '').trim();
          if (idInputWrap) idInputWrap.style.display = 'none';
          if (idTextWrap) idTextWrap.style.display = '';
          if (bindSaveBtn) bindSaveBtn.disabled = true;
          if (studentRow) studentRow.style.display = 'none';
        }
        const cur = loadChessComRewardState();
        const next = { ...cur, chessComId: getCurrentChessComId() };
        saveChessComRewardState(next);
        setUiByState(next);
      } catch (e) {
        setMsg(String(e?.message || e || 'Load failed'));
      }
    };

    studentSel?.addEventListener('change', async () => {
      try {
        setMsg('');
        const sid = String(studentSel.value || '').trim();
        if (!sid) return;
        const b = await loadBinding(sid);
        boundStudentId = String(b?.student?.id || '').trim();
        if (idInput) idInput.value = String(b?.student?.chessComId || '').trim();
        if (idText) idText.textContent = String(b?.student?.chessComId || '').trim();
      } catch (e) {
        setMsg(String(e?.message || e || 'Load failed'));
      }
    });

    bindSaveBtn?.addEventListener('click', async () => {
      try {
        setMsg('');
        if (!isAdmin) throw new Error('Only Admin can update chess.com ID.');
        const sid = String(studentSel?.value || boundStudentId || '').trim();
        const cid = String(idInput?.value || '').trim().toLowerCase();
        if (!sid) throw new Error('Please select a student.');
        if (cid && !/^[a-z0-9_-]{2,30}$/.test(cid)) throw new Error('Invalid chess.com ID format.');
        const resp = await window.authUtils.authenticatedFetch('/admin/chess-pal/chesscom-id', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: sid, chessComId: cid }),
        });
        if (!resp || !resp.ok) {
          const err = await resp?.json?.().catch(() => ({}));
          throw new Error(String(err?.error || 'Save failed'));
        }
        boundStudentId = sid;
        setMsg('Saved student chess.com ID.');
      } catch (e) {
        setMsg(String(e?.message || e || 'Save failed'));
      }
    }, { passive: true });

    overlay.querySelector('#cpChessComRefresh')?.addEventListener('click', async () => {
      try {
        setMsg('');
        await refreshByCurrentId();
        setMsg('Chess.com data updated.');
      } catch (e) {
        setMsg(String(e?.message || e || 'Refresh failed'));
      }
    }, { passive: true });

    overlay.querySelector('#cpChessComClaimBtn')?.addEventListener('click', () => {
      try {
        setMsg('');
        const cur = loadChessComRewardState();
        if (isChessComClaimedToday(cur)) throw new Error('Already claimed today.');
        const wins = Math.max(0, Math.floor(Number(cur?.todayWins) || 0));
        if (wins <= 0) throw new Error('No win today, no reward.');
        let slots = loadStorage();
        const before = JSON.stringify(slots);
        slots = addItemToStorage(slots, 'gold_coin', wins);
        if (JSON.stringify(slots) === before) throw new Error('Storage is full.');
        saveStorage(slots);
        const next = { ...cur, claimDate: localDateKey(new Date()), claimedWins: wins };
        saveChessComRewardState(next);
        setUiByState(next);
        setMsg(`Claimed ${wins} Gold Coin.`);
        showStorageGainModal({ title: 'Get Coins Result', rewards: [{ itemId: 'gold_coin', qty: wins }] });
        try { onUpdated && onUpdated(); } catch {}
      } catch (e) {
        setMsg(String(e?.message || e || 'Claim failed'));
      }
    }, { passive: true });

    bootstrap();
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
    const admin = isAdminMode();
    return `
      <div>
        <div class="cp-row" style="margin-top:0; justify-content:space-between; align-items:center; gap:8px;">
          <input class="cp-input cp-search-input cp-search-input--storage" id="cpStorageSearch" type="text" placeholder="Filter by item name or ID">
          ${admin ? `<button class="cp-tool-btn" type="button" id="cpStorageSettingBtn">Setting</button>` : ``}
        </div>
        <div class="cp-storage-grid" id="cpStorageGrid" style="margin-top:12px;"></div>
      </div>
    `;
  };
  StoragePage.init = () => {
    const host = document.getElementById('cpStorageGrid');
    if (!host) return;
    const searchEl = document.getElementById('cpStorageSearch');

    let slots = loadStorage();
    // persist cleanup (e.g. remove potion) + update coins bar
    saveStorage(slots);
    let selectedIdx = -1;

    const render = () => {
      const q = String(searchEl?.value || '').trim().toLowerCase();
      const rows = slots.map((s, i) => ({ s, i })).filter(({ s }) => {
        if (!q) return true;
        if (!s || typeof s !== 'object') return false;
        const def = getStorageItemDef(s.itemId);
        const name = String(def?.name || s.name || '').toLowerCase();
        const id = String(s.itemId || '').toLowerCase();
        return name.includes(q) || id.includes(q);
      });
      host.innerHTML = rows.map(({ s, i }) => {
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
      }).join('') || `<div class="cp-muted">No matching item.</div>`;
    };

    const persist = () => {
      // Keep UI compacted too (not just storage save)
      slots = compactStorageSlots(normalizeStorageSlots(slots));
      saveStorage(slots);
    };
    const refresh = () => { persist(); render(); };

    const showStorageAdminSettingModal = () => {
      if (!isAdminMode()) return;
      const old = document.getElementById('cpStorageAdminOverlay');
      if (old) old.remove();
      const defs = Object.values(STORAGE_ITEM_DEFS || {}).filter(Boolean)
        .slice()
        .sort((a, b) => String(a?.name || a?.id || '').localeCompare(String(b?.name || b?.id || '')));
      const overlay = document.createElement('div');
      overlay.id = 'cpStorageAdminOverlay';
      overlay.className = 'cp-modal-overlay';
      overlay.innerHTML = `
        <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Storage setting">
          <button class="cp-modal-close" type="button" aria-label="Close">×</button>
          <div class="cp-modal-body">
            <div class="cp-h1" style="font-size:18px;">Storage Setting</div>
            <div class="cp-setting-item" style="margin-top:12px;">
              <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">Target user search</div>
              <input class="cp-input" id="cpStorageAdminUserSearch" type="text" placeholder="Search by name or ID">
              <div class="cp-setting-help" style="margin-top:10px; margin-bottom:6px;">Target user</div>
              <select class="cp-select" id="cpStorageAdminUser"></select>
              <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">Item</div>
              <select class="cp-select" id="cpStorageAdminItem">
                ${defs.map((d) => `<option value="${esc(String(d.id))}">${esc(String(d.name || d.id))}</option>`).join('')}
              </select>
              <div class="cp-setting-help" style="margin-top:10px; margin-bottom:6px;">Quantity</div>
              <input class="cp-input" id="cpStorageAdminQty" type="number" min="1" step="1" value="1">
            </div>
            <div class="cp-row" style="margin-top:12px; justify-content:flex-end; gap:8px;">
              <button class="cp-tool-btn" type="button" id="cpStorageAdminCancel">Cancel</button>
              <button class="cp-primary" type="button" id="cpStorageAdminAdd">Add</button>
            </div>
            <div class="cp-muted" id="cpStorageAdminMsg" style="margin-top:10px;"></div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const setMsg = (t) => {
        const m = overlay.querySelector('#cpStorageAdminMsg');
        if (m) m.textContent = String(t || '');
      };
      let currentUserId = '';
      let users = [];
      const userSel = overlay.querySelector('#cpStorageAdminUser');
      const userSearch = overlay.querySelector('#cpStorageAdminUserSearch');
      const renderUsers = () => {
        if (!userSel) return;
        const q = String(userSearch?.value || '').trim().toLowerCase();
        const list = users.filter((u) => {
          if (!q) return true;
          return String(u.id || '').toLowerCase().includes(q) || String(u.name || '').toLowerCase().includes(q);
        });
        userSel.innerHTML = list.map((u) => {
          const role = String(u?.role || '').toLowerCase();
          const roleTag = role === 'teacher' ? ' [Teacher]' : (role === 'student' ? ' [Student]' : '');
          return `<option value="${esc(String(u.id))}">#${esc(String(u.id))} ${esc(String(u.name || 'User'))}${esc(roleTag)}</option>`;
        }).join('');
      };
      const close = () => {
        try { overlay.remove(); } catch {}
        try { window.removeEventListener('keydown', onKey); } catch {}
      };
      const onKey = (ev) => { if (ev.key === 'Escape') close(); };
      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
      overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
      overlay.querySelector('#cpStorageAdminCancel')?.addEventListener('click', close, { passive: true });
      window.addEventListener('keydown', onKey);
      userSearch?.addEventListener('input', () => { try { renderUsers(); } catch {} });
      (async () => {
        try {
          if (!window.authUtils || typeof window.authUtils.authenticatedFetch !== 'function') throw new Error('Authentication not ready.');
          const meResp = await window.authUtils.authenticatedFetch('/auth/me', { method: 'GET' });
          if (meResp && meResp.ok) {
            const me = await meResp.json().catch(() => ({}));
            currentUserId = String(me?.id || '').trim();
            const meName = String(me?.name || 'Myself').trim() || 'Myself';
            if (currentUserId) {
              users.push({ id: currentUserId, name: meName });
            }
          }
          let rows = [];
          const allUsersResp = await window.authUtils.authenticatedFetch('/admin/chess-pal/users', { method: 'GET' });
          if (allUsersResp && allUsersResp.ok) {
            rows = await allUsersResp.json().catch(() => []);
          } else {
            // Backward compatibility fallback: old servers only exposed students.
            const studentResp = await window.authUtils.authenticatedFetch('/students', { method: 'GET' });
            if (!studentResp || !studentResp.ok) throw new Error('Failed to load users.');
            rows = await studentResp.json().catch(() => []);
          }
          users = (Array.isArray(rows) ? rows : [])
            .map((u) => ({
              id: String(u?.id || '').trim(),
              name: String(u?.name || 'User').trim() || 'User',
              role: String(u?.role || '').trim().toLowerCase(),
            }))
            .filter((u) => u.id)
            .concat(users)
            .filter((u, idx, all) => all.findIndex((x) => String(x.id) === String(u.id)) === idx)
            .sort((a, b) => a.name.localeCompare(b.name));
          renderUsers();
          if (userSel && currentUserId) userSel.value = currentUserId;
        } catch (e) {
          setMsg(String(e?.message || e || 'Failed to load users'));
        }
      })();
      overlay.querySelector('#cpStorageAdminAdd')?.addEventListener('click', () => {
        try {
          const targetUserId = String(userSel?.value || '').trim();
          const itemId = String(overlay.querySelector('#cpStorageAdminItem')?.value || '').trim().toLowerCase();
          const qty = Math.max(1, Math.floor(Number(overlay.querySelector('#cpStorageAdminQty')?.value) || 1));
          if (!targetUserId) throw new Error('Please select a target user.');
          if (!getStorageItemDef(itemId)) throw new Error('Invalid item.');
          if (!window.authUtils || typeof window.authUtils.authenticatedFetch !== 'function') throw new Error('Authentication not ready.');
          window.authUtils.authenticatedFetch('/admin/chess-pal/storage-grant', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: targetUserId, itemId, qty }),
          }).then(async (resp) => {
            if (!resp || !resp.ok) {
              const err = await resp?.json?.().catch(() => ({}));
              throw new Error(String(err?.error || 'Add failed'));
            }
            if (currentUserId && targetUserId === currentUserId) {
              const before = JSON.stringify(slots);
              slots = addItemToStorage(slots, itemId, qty);
              if (JSON.stringify(slots) !== before) refresh();
            }
            setMsg(`Added ${qty} × ${String(getStorageItemDef(itemId)?.name || itemId)} to user #${targetUserId}.`);
          }).catch((e) => {
            setMsg(String(e?.message || e || 'Add failed'));
          });
        } catch (e) {
          setMsg(String(e?.message || e || 'Add failed'));
        }
      }, { passive: true });
    };

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

    searchEl?.addEventListener('input', () => {
      try { render(); } catch {}
    });

    document.getElementById('cpStorageSettingBtn')?.addEventListener('click', () => {
      showStorageAdminSettingModal();
    }, { passive: true });
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
        <button class="cp-square-tile" type="button" data-cp-shop="summon" aria-label="Summon">
          ${renderImgWithFallback('images/Summon/Su001-Summon-Hero.jpg', 'Summon', 'cp-square-img')}
          <div class="cp-square-label">Summon</div>
        </button>
      </div>
    `;
  };
  ShopPage.init = () => {
    document.querySelectorAll('[data-cp-shop]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = String(btn.getAttribute('data-cp-shop') || '');
        if (key === 'mall') Router.goTo('/shop/mall');
        else if (key === 'summon') Router.goTo('/summon');
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
        showStorageGainModal({ title: 'Get Coins Result', rewards: [{ itemId: 'silver_coin', qty: 10 }] });
        try { Router.renderCurrent(); } catch {}
      } catch (e) {
        setMsg(String(e?.message || e || 'Failed'));
      }
    }, { passive: true });

    document.getElementById('cpRewardChesscom')?.addEventListener('click', () => {
      showChessComRewardModal(() => {
        try { Router.renderCurrent(); } catch {}
      });
    }, { passive: true });
    document.getElementById('cpRewardPuzzle')?.addEventListener('click', () => {
      setMsg('Reward #3 is coming soon.');
    }, { passive: true });
  };

  const MALL_CONFIG_KEY = 'chessPalMallConfig';

  function defaultMallConfig() {
    const now = Date.now();
    return {
      updatedAt: now,
      offers: [
        { id: 'offer_exp_pawn', itemId: 'exp_pawn', currencyId: 'gold_coin', price: 1, limitHours: 0, enabled: true },
        { id: 'offer_exp_knight', itemId: 'exp_knight', currencyId: 'gold_coin', price: 3, limitHours: 0, enabled: true },
        { id: 'offer_exp_bishop', itemId: 'exp_bishop', currencyId: 'gold_coin', price: 5, limitHours: 0, enabled: true },
        { id: 'offer_exp_rook', itemId: 'exp_rook', currencyId: 'gold_coin', price: 8, limitHours: 0, enabled: true },
        { id: 'offer_exp_queen', itemId: 'exp_queen', currencyId: 'gold_coin', price: 12, limitHours: 0, enabled: true },
        { id: 'offer_exp_king', itemId: 'exp_king', currencyId: 'gold_coin', price: 18, limitHours: 0, enabled: true },
      ],
    };
  }

  const SUMMON_CONFIG_KEY = 'chessPalSummonConfig';

  function summonBaseRarityWeights() {
    return {
      1: 500,
      2: 260,
      3: 140,
      4: 80,
      5: 45,
      6: 22,
      7: 10,
      8: 4,
      9: 1,
      10: 0.2,
    };
  }

  const SUMMON_ELEMENT_KEYS = ['fire', 'water', 'wood', 'light', 'dark'];

  function defaultStarWeightMap(maxStar = 10) {
    const out = {};
    for (let i = 1; i <= Math.max(1, Math.floor(Number(maxStar) || 10)); i += 1) out[String(i)] = 1;
    return out;
  }

  function defaultElementWeightMap() {
    return { fire: 1, water: 1, wood: 1, light: 1, dark: 1 };
  }

  function normalizeStarWeightMap(raw, maxStar = 10) {
    const base = defaultStarWeightMap(maxStar);
    const out = {};
    Object.keys(base).forEach((k) => {
      const v = Number(raw?.[k]);
      out[k] = Math.max(0, Number.isFinite(v) ? v : base[k]);
    });
    return out;
  }

  function normalizeElementWeightMap(raw) {
    const base = defaultElementWeightMap();
    const out = {};
    SUMMON_ELEMENT_KEYS.forEach((k) => {
      const v = Number(raw?.[k]);
      out[k] = Math.max(0, Number.isFinite(v) ? v : base[k]);
    });
    return out;
  }

  function defaultRateMapForUnits(units) {
    const rarityWeights = summonBaseRarityWeights();
    const out = {};
    (Array.isArray(units) ? units : []).forEach((u) => {
      const id = String(u?.id || '').trim();
      if (!id) return;
      const rr = Math.max(1, Math.min(10, Math.floor(Number(u?.rarity) || 1)));
      out[id] = Math.max(0, Number(rarityWeights[rr]) || 1);
    });
    return out;
  }

  function getSummonableItems() {
    return ['rewind_rook', 'exp_pawn', 'exp_knight', 'exp_bishop', 'exp_rook', 'exp_queen', 'exp_king']
      .map((id) => getStorageItemDef(id))
      .filter(Boolean);
  }

  function defaultSummonConfig() {
    const heroes = getAllHeroes();
    const monsters = getAllMonsters();
    const summonItems = getSummonableItems();
    const heroAmateur = heroes.filter((h) => Math.max(1, Math.floor(Number(h?.rarity) || 1)) <= 6);
    const monsterAmateur = monsters.filter((m) => Math.max(1, Math.floor(Number(m?.rarity) || 1)) <= 6);
    return {
      updatedAt: Date.now(),
      limitHours: 0,
      enabled: true,
      heroEnabled: true,
      monsterEnabled: true,
      amateurHeroEnabled: true,
      amateurMonsterEnabled: true,
      itemEnabled: true,
      heroCurrencyId: 'gold_coin',
      heroCost: 1,
      monsterCurrencyId: 'gold_coin',
      monsterCost: 1,
      amateurHeroCurrencyId: 'silver_coin',
      amateurHeroCost: 100,
      amateurMonsterCurrencyId: 'silver_coin',
      amateurMonsterCost: 100,
      itemCurrencyId: 'gold_coin',
      itemCost: 1,
      heroLabel: 'Summon Hero',
      monsterLabel: 'Summon Monster',
      amateurHeroLabel: 'Amateur Summon Hero',
      amateurMonsterLabel: 'Amateur Summon Monster',
      itemLabel: 'Summon Item',
      heroStarWeights: defaultStarWeightMap(10),
      heroElementWeights: defaultElementWeightMap(),
      monsterStarWeights: defaultStarWeightMap(10),
      monsterElementWeights: defaultElementWeightMap(),
      amateurHeroStarWeights: defaultStarWeightMap(6),
      amateurHeroElementWeights: defaultElementWeightMap(),
      amateurMonsterStarWeights: defaultStarWeightMap(6),
      amateurMonsterElementWeights: defaultElementWeightMap(),
      heroRates: defaultRateMapForUnits(heroes),
      monsterRates: defaultRateMapForUnits(monsters),
      amateurHeroRates: defaultRateMapForUnits(heroAmateur),
      amateurMonsterRates: defaultRateMapForUnits(monsterAmateur),
      itemRates: defaultRateMapForUnits(summonItems),
    };
  }

  function normalizeRateMap(inputMap, units) {
    const defaults = defaultRateMapForUnits(units);
    const out = {};
    (Array.isArray(units) ? units : []).forEach((u) => {
      const id = String(u?.id || '').trim();
      if (!id) return;
      const raw = Number(inputMap?.[id]);
      const fallback = Number(defaults[id]) || 1;
      const v = Number.isFinite(raw) ? raw : fallback;
      out[id] = Math.max(0, v);
    });
    return out;
  }

  function normalizeSummonConfig(raw) {
    const base = defaultSummonConfig();
    const defs = STORAGE_ITEM_DEFS || {};
    const limitHours = Math.max(0, Math.floor(Number(raw?.limitHours) || 0));
    const enabled = raw?.enabled !== false;
    const heroEnabled = raw?.heroEnabled !== false;
    const monsterEnabled = raw?.monsterEnabled !== false;
    const amateurHeroEnabled = raw?.amateurHeroEnabled !== false;
    const amateurMonsterEnabled = raw?.amateurMonsterEnabled !== false;
    const itemEnabled = raw?.itemEnabled !== false;
    const pickCurrency = (v, fallbackId) => {
      const key = String(v || fallbackId || 'gold_coin').trim().toLowerCase();
      return defs[key] ? key : String(fallbackId || 'gold_coin');
    };
    const heroCurrencyId = pickCurrency(raw?.heroCurrencyId ?? raw?.currencyId, base.heroCurrencyId);
    const heroCost = Math.max(1, Math.floor(Number(raw?.heroCost ?? raw?.cost) || base.heroCost));
    const monsterCurrencyId = pickCurrency(raw?.monsterCurrencyId ?? raw?.currencyId, base.monsterCurrencyId);
    const monsterCost = Math.max(1, Math.floor(Number(raw?.monsterCost ?? raw?.cost) || base.monsterCost));
    const amateurHeroCurrencyId = pickCurrency(raw?.amateurHeroCurrencyId, base.amateurHeroCurrencyId);
    const amateurHeroCost = Math.max(1, Math.floor(Number(raw?.amateurHeroCost) || base.amateurHeroCost));
    const amateurMonsterCurrencyId = pickCurrency(raw?.amateurMonsterCurrencyId, base.amateurMonsterCurrencyId);
    const amateurMonsterCost = Math.max(1, Math.floor(Number(raw?.amateurMonsterCost) || base.amateurMonsterCost));
    const itemCurrencyId = pickCurrency(raw?.itemCurrencyId, base.itemCurrencyId);
    const itemCost = Math.max(1, Math.floor(Number(raw?.itemCost) || base.itemCost));
    const heroes = getAllHeroes();
    const monsters = getAllMonsters();
    const heroAmateur = heroes.filter((h) => Math.max(1, Math.floor(Number(h?.rarity) || 1)) <= 6);
    const monsterAmateur = monsters.filter((m) => Math.max(1, Math.floor(Number(m?.rarity) || 1)) <= 6);
    const summonItems = getSummonableItems();
    const heroLabel = String(raw?.heroLabel || base.heroLabel || 'Summon Hero').trim() || 'Summon Hero';
    const monsterLabel = String(raw?.monsterLabel || base.monsterLabel || 'Summon Monster').trim() || 'Summon Monster';
    const amateurHeroLabel = String(raw?.amateurHeroLabel || base.amateurHeroLabel || 'Amateur Summon Hero').trim() || 'Amateur Summon Hero';
    const amateurMonsterLabel = String(raw?.amateurMonsterLabel || base.amateurMonsterLabel || 'Amateur Summon Monster').trim() || 'Amateur Summon Monster';
    const itemLabel = String(raw?.itemLabel || base.itemLabel || 'Summon Item').trim() || 'Summon Item';
    const heroStarWeights = normalizeStarWeightMap(raw?.heroStarWeights, 10);
    const heroElementWeights = normalizeElementWeightMap(raw?.heroElementWeights);
    const monsterStarWeights = normalizeStarWeightMap(raw?.monsterStarWeights, 10);
    const monsterElementWeights = normalizeElementWeightMap(raw?.monsterElementWeights);
    const amateurHeroStarWeights = normalizeStarWeightMap(raw?.amateurHeroStarWeights, 6);
    const amateurHeroElementWeights = normalizeElementWeightMap(raw?.amateurHeroElementWeights);
    const amateurMonsterStarWeights = normalizeStarWeightMap(raw?.amateurMonsterStarWeights, 6);
    const amateurMonsterElementWeights = normalizeElementWeightMap(raw?.amateurMonsterElementWeights);
    const heroRates = normalizeRateMap(raw?.heroRates, heroes);
    const monsterRates = normalizeRateMap(raw?.monsterRates, monsters);
    const amateurHeroRates = normalizeRateMap(raw?.amateurHeroRates, heroAmateur);
    const amateurMonsterRates = normalizeRateMap(raw?.amateurMonsterRates, monsterAmateur);
    const itemRates = normalizeRateMap(raw?.itemRates, summonItems);
    const updatedAt = Number.isFinite(Number(raw?.updatedAt)) ? Math.floor(Number(raw.updatedAt)) : base.updatedAt;
    return {
      updatedAt, limitHours, enabled,
      heroEnabled, monsterEnabled, amateurHeroEnabled, amateurMonsterEnabled, itemEnabled,
      heroCurrencyId, heroCost, monsterCurrencyId, monsterCost,
      amateurHeroCurrencyId, amateurHeroCost, amateurMonsterCurrencyId, amateurMonsterCost,
      itemCurrencyId, itemCost,
      heroLabel, monsterLabel, amateurHeroLabel, amateurMonsterLabel, itemLabel,
      heroStarWeights, heroElementWeights, monsterStarWeights, monsterElementWeights,
      amateurHeroStarWeights, amateurHeroElementWeights, amateurMonsterStarWeights, amateurMonsterElementWeights,
      heroRates, monsterRates, amateurHeroRates, amateurMonsterRates, itemRates,
    };
  }

  function loadSummonConfig() {
    try {
      const raw = localStorage.getItem(SUMMON_CONFIG_KEY);
      if (!raw) return normalizeSummonConfig(defaultSummonConfig());
      return normalizeSummonConfig(JSON.parse(raw));
    } catch {
      return normalizeSummonConfig(defaultSummonConfig());
    }
  }

  async function saveSummonConfig(cfg) {
    let saved = null;
    try {
      const next = normalizeSummonConfig(cfg);
      next.updatedAt = Date.now();
      localStorage.setItem(SUMMON_CONFIG_KEY, JSON.stringify(next));
      saved = next;
    } catch {
      throw new Error('Failed to save summon config locally.');
    }
    try { window.dispatchEvent(new Event('cpSummonConfigChanged')); } catch {}
    if (saved && isAdminMode()) {
      const serverData = await saveChessPalGlobalConfigToServer({ summonConfig: saved });
      const serverSummon = (serverData && typeof serverData.summonConfig === 'object' && !Array.isArray(serverData.summonConfig))
        ? serverData.summonConfig
        : null;
      if (serverSummon) {
        const merged = normalizeSummonConfig(serverSummon);
        try { localStorage.setItem(SUMMON_CONFIG_KEY, JSON.stringify(merged)); } catch {}
        try { window.dispatchEvent(new Event('cpSummonConfigChanged')); } catch {}
      }
    }
    return saved;
  }

  function getSummonConfigForNow() {
    const cfg = loadSummonConfig();
    const startAt = Math.max(0, Number(cfg.updatedAt) || 0);
    const limitHours = Math.max(0, Math.floor(Number(cfg.limitHours) || 0));
    const expiresAt = limitHours > 0 ? (startAt + limitHours * 3600000) : 0;
    const expired = expiresAt > 0 ? Date.now() >= expiresAt : false;
    const enabledNow = cfg.enabled && !expired;
    return {
      ...cfg,
      expiresAt,
      expired,
      enabledNow,
      heroEnabledNow: enabledNow && (cfg.heroEnabled !== false),
      monsterEnabledNow: enabledNow && (cfg.monsterEnabled !== false),
      amateurHeroEnabledNow: enabledNow && (cfg.amateurHeroEnabled !== false),
      amateurMonsterEnabledNow: enabledNow && (cfg.amateurMonsterEnabled !== false),
      itemEnabledNow: enabledNow && (cfg.itemEnabled !== false),
    };
  }

  function showSummonAdminSettingsModal(onSaved) {
    if (!isAdminMode()) return;
    const old = document.getElementById('cpSummonAdminOverlay');
    if (old) old.remove();

    const cfg = getSummonConfigForNow();
    const defs = Object.values(STORAGE_ITEM_DEFS || {}).filter(Boolean);
    const itemOptions = defs
      .slice()
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))
      .map(d => `<option value="${esc(String(d.id))}">${esc(String(d.name || d.id))}</option>`)
      .join('');

    const overlay = document.createElement('div');
    overlay.id = 'cpSummonAdminOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Summon setting" style="width:min(1280px, 96vw);">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-h1" style="font-size:18px;">Global Summon Setting</div>
          <div class="cp-muted" style="margin-top:6px;">Set all summon types, each with independent cost item and cost value.</div>
          <div class="cp-setting-item" style="margin-top:12px;">
            <div class="cp-row" style="margin-top:0; align-items:flex-end; gap:8px; flex-wrap:wrap;">
              <div style="width: 160px;">
                <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">Limit (hours)</div>
                <input class="cp-input" id="cpSummonCfgLimit" type="number" min="0" step="1" value="${esc(String(cfg.limitHours || 0))}">
              </div>
              <label class="cp-setting-help" style="display:flex; align-items:center; gap:6px; margin:0 0 10px;">
                <input type="checkbox" id="cpSummonCfgEnabled" ${cfg.enabled ? 'checked' : ''}>
                Global enabled
              </label>
              <label class="cp-setting-help" style="display:flex; align-items:center; gap:6px; margin:0 0 10px;">
                <input type="checkbox" id="cpSummonCfgHeroEnabled" ${cfg.heroEnabled !== false ? 'checked' : ''}>
                Hero summon enabled
              </label>
              <label class="cp-setting-help" style="display:flex; align-items:center; gap:6px; margin:0 0 10px;">
                <input type="checkbox" id="cpSummonCfgMonsterEnabled" ${cfg.monsterEnabled !== false ? 'checked' : ''}>
                Monster summon enabled
              </label>
              <label class="cp-setting-help" style="display:flex; align-items:center; gap:6px; margin:0 0 10px;">
                <input type="checkbox" id="cpSummonCfgAmateurHeroEnabled" ${cfg.amateurHeroEnabled !== false ? 'checked' : ''}>
                Amateur Hero summon enabled
              </label>
              <label class="cp-setting-help" style="display:flex; align-items:center; gap:6px; margin:0 0 10px;">
                <input type="checkbox" id="cpSummonCfgAmateurMonsterEnabled" ${cfg.amateurMonsterEnabled !== false ? 'checked' : ''}>
                Amateur Monster summon enabled
              </label>
              <label class="cp-setting-help" style="display:flex; align-items:center; gap:6px; margin:0 0 10px;">
                <input type="checkbox" id="cpSummonCfgItemEnabled" ${cfg.itemEnabled !== false ? 'checked' : ''}>
                Summon Item enabled
              </label>
            </div>
          </div>
          <div class="cp-setting-item" style="margin-top:10px;">
            <div class="cp-setting-help" style="margin:0 0 8px 0;">Per summon cost</div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:8px;">
              <label class="cp-setting-help" style="margin:0;">Summon Hero
                <div class="cp-row" style="margin-top:6px; gap:6px;">
                  <input class="cp-input" id="cpSummonCfgHeroLabel" type="text" value="${esc(String(cfg.heroLabel || 'Summon Hero'))}" style="flex:1 1 150px;" placeholder="Display name">
                  <select class="cp-select" id="cpSummonCfgHeroCurrency">${itemOptions}</select>
                  <input class="cp-input" id="cpSummonCfgHeroCost" type="number" min="1" step="1" value="${esc(String(cfg.heroCost || 1))}" style="width:100px;">
                </div>
              </label>
              <label class="cp-setting-help" style="margin:0;">Summon Monster
                <div class="cp-row" style="margin-top:6px; gap:6px;">
                  <input class="cp-input" id="cpSummonCfgMonsterLabel" type="text" value="${esc(String(cfg.monsterLabel || 'Summon Monster'))}" style="flex:1 1 150px;" placeholder="Display name">
                  <select class="cp-select" id="cpSummonCfgMonsterCurrency">${itemOptions}</select>
                  <input class="cp-input" id="cpSummonCfgMonsterCost" type="number" min="1" step="1" value="${esc(String(cfg.monsterCost || 1))}" style="width:100px;">
                </div>
              </label>
              <label class="cp-setting-help" style="margin:0;">Amateur Summon Hero
                <div class="cp-row" style="margin-top:6px; gap:6px;">
                  <input class="cp-input" id="cpSummonCfgAmateurHeroLabel" type="text" value="${esc(String(cfg.amateurHeroLabel || 'Amateur Summon Hero'))}" style="flex:1 1 150px;" placeholder="Display name">
                  <select class="cp-select" id="cpSummonCfgAmateurHeroCurrency">${itemOptions}</select>
                  <input class="cp-input" id="cpSummonCfgAmateurHeroCost" type="number" min="1" step="1" value="${esc(String(cfg.amateurHeroCost || 100))}" style="width:100px;">
                </div>
              </label>
              <label class="cp-setting-help" style="margin:0;">Amateur Summon Monster
                <div class="cp-row" style="margin-top:6px; gap:6px;">
                  <input class="cp-input" id="cpSummonCfgAmateurMonsterLabel" type="text" value="${esc(String(cfg.amateurMonsterLabel || 'Amateur Summon Monster'))}" style="flex:1 1 150px;" placeholder="Display name">
                  <select class="cp-select" id="cpSummonCfgAmateurMonsterCurrency">${itemOptions}</select>
                  <input class="cp-input" id="cpSummonCfgAmateurMonsterCost" type="number" min="1" step="1" value="${esc(String(cfg.amateurMonsterCost || 100))}" style="width:100px;">
                </div>
              </label>
              <label class="cp-setting-help" style="margin:0;">Summon Item
                <div class="cp-row" style="margin-top:6px; gap:6px;">
                  <input class="cp-input" id="cpSummonCfgItemLabel" type="text" value="${esc(String(cfg.itemLabel || 'Summon Item'))}" style="flex:1 1 150px;" placeholder="Display name">
                  <select class="cp-select" id="cpSummonCfgItemCurrency">${itemOptions}</select>
                  <input class="cp-input" id="cpSummonCfgItemCost" type="number" min="1" step="1" value="${esc(String(cfg.itemCost || 1))}" style="width:100px;">
                </div>
              </label>
            </div>
          </div>
          <div class="cp-setting-item" style="margin-top:10px;">
            <div class="cp-setting-help" style="margin:0 0 8px 0;">Star / Element weights (same-star units share that star weight equally)</div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:8px;">
              <div>
                <div class="cp-setting-label" style="font-size:13px;">Hero</div>
                <div id="cpSummonHeroStarWeights" style="display:grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap:6px; margin-top:6px;"></div>
                <div id="cpSummonHeroElementWeights" style="display:grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap:6px; margin-top:6px;"></div>
              </div>
              <div>
                <div class="cp-setting-label" style="font-size:13px;">Monster</div>
                <div id="cpSummonMonsterStarWeights" style="display:grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap:6px; margin-top:6px;"></div>
                <div id="cpSummonMonsterElementWeights" style="display:grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap:6px; margin-top:6px;"></div>
              </div>
              <div>
                <div class="cp-setting-label" style="font-size:13px;">Amateur Hero</div>
                <div id="cpSummonAmHeroStarWeights" style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:6px; margin-top:6px;"></div>
                <div id="cpSummonAmHeroElementWeights" style="display:grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap:6px; margin-top:6px;"></div>
              </div>
              <div>
                <div class="cp-setting-label" style="font-size:13px;">Amateur Monster</div>
                <div id="cpSummonAmMonsterStarWeights" style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:6px; margin-top:6px;"></div>
                <div id="cpSummonAmMonsterElementWeights" style="display:grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap:6px; margin-top:6px;"></div>
              </div>
            </div>
          </div>
          <div class="cp-setting-item" style="margin-top:12px;">
            <div class="cp-row" style="margin-top:0; justify-content:space-between; align-items:center;">
              <div class="cp-setting-help" style="margin:0;">Hero summon rates (relative weight + percentage; 0 means disabled)</div>
              <div class="cp-row" style="margin-top:0; gap:6px;">
                <select class="cp-select" id="cpSummonHeroSort" style="min-width:120px;">
                  <option value="no">No.</option>
                  <option value="star">Star</option>
                  <option value="element">Element</option>
                </select>
                <button class="cp-tool-btn" type="button" id="cpSummonHeroRatesToggle" aria-expanded="false">Expand</button>
              </div>
            </div>
            <div id="cpSummonHeroRateRows" style="display:none; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:8px; max-height:220px; overflow:auto; padding-right:4px; margin-top:8px;"></div>
          </div>
          <div class="cp-setting-item" style="margin-top:10px;">
            <div class="cp-row" style="margin-top:0; justify-content:space-between; align-items:center;">
              <div class="cp-setting-help" style="margin:0;">Monster summon rates (relative weight + percentage; 0 means disabled)</div>
              <div class="cp-row" style="margin-top:0; gap:6px;">
                <select class="cp-select" id="cpSummonMonsterSort" style="min-width:120px;">
                  <option value="no">No.</option>
                  <option value="star">Star</option>
                  <option value="element">Element</option>
                </select>
                <button class="cp-tool-btn" type="button" id="cpSummonMonsterRatesToggle" aria-expanded="false">Expand</button>
              </div>
            </div>
            <div id="cpSummonMonsterRateRows" style="display:none; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:8px; max-height:220px; overflow:auto; padding-right:4px; margin-top:8px;"></div>
          </div>
          <div class="cp-setting-item" style="margin-top:10px;">
            <div class="cp-row" style="margin-top:0; justify-content:space-between; align-items:center;">
              <div class="cp-setting-help" style="margin:0;">Amateur Hero summon rates (relative weight + percentage)</div>
              <div class="cp-row" style="margin-top:0; gap:6px;">
                <select class="cp-select" id="cpSummonAmHeroSort" style="min-width:120px;">
                  <option value="no">No.</option>
                  <option value="star">Star</option>
                  <option value="element">Element</option>
                </select>
                <button class="cp-tool-btn" type="button" id="cpSummonAmHeroRatesToggle" aria-expanded="false">Expand</button>
              </div>
            </div>
            <div id="cpSummonAmHeroRateRows" style="display:none; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:8px; max-height:220px; overflow:auto; padding-right:4px; margin-top:8px;"></div>
          </div>
          <div class="cp-setting-item" style="margin-top:10px;">
            <div class="cp-row" style="margin-top:0; justify-content:space-between; align-items:center;">
              <div class="cp-setting-help" style="margin:0;">Amateur Monster summon rates (relative weight + percentage)</div>
              <div class="cp-row" style="margin-top:0; gap:6px;">
                <select class="cp-select" id="cpSummonAmMonsterSort" style="min-width:120px;">
                  <option value="no">No.</option>
                  <option value="star">Star</option>
                  <option value="element">Element</option>
                </select>
                <button class="cp-tool-btn" type="button" id="cpSummonAmMonsterRatesToggle" aria-expanded="false">Expand</button>
              </div>
            </div>
            <div id="cpSummonAmMonsterRateRows" style="display:none; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:8px; max-height:220px; overflow:auto; padding-right:4px; margin-top:8px;"></div>
          </div>
          <div class="cp-setting-item" style="margin-top:10px;">
            <div class="cp-row" style="margin-top:0; justify-content:space-between; align-items:center;">
              <div class="cp-setting-help" style="margin:0;">Summon item rates (relative weight + percentage; 0 means disabled)</div>
              <button class="cp-tool-btn" type="button" id="cpSummonItemRatesToggle" aria-expanded="false">Expand</button>
            </div>
            <div id="cpSummonItemRateRows" style="display:none; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:8px; max-height:220px; overflow:auto; padding-right:4px; margin-top:8px;"></div>
          </div>
          <div class="cp-row" style="margin-top:12px; justify-content:flex-end; gap:8px;">
            <button class="cp-tool-btn" type="button" id="cpSummonCfgCancel">Cancel</button>
            <button class="cp-primary" type="button" id="cpSummonCfgSave">Save</button>
          </div>
          <div class="cp-muted" id="cpSummonCfgMsg" style="margin-top:10px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const setMsg = (t) => {
      const m = overlay.querySelector('#cpSummonCfgMsg');
      if (m) m.textContent = String(t || '');
    };
    const heroRowsHost = overlay.querySelector('#cpSummonHeroRateRows');
    const monsterRowsHost = overlay.querySelector('#cpSummonMonsterRateRows');
    const amHeroRowsHost = overlay.querySelector('#cpSummonAmHeroRateRows');
    const amMonsterRowsHost = overlay.querySelector('#cpSummonAmMonsterRateRows');
    const itemRowsHost = overlay.querySelector('#cpSummonItemRateRows');
    const heroes = getAllHeroes();
    const monsters = getAllMonsters();
    const amateurHeroes = heroes.filter((h) => Math.max(1, Math.min(10, Math.floor(Number(h?.rarity) || 1))) <= 6);
    const amateurMonsters = monsters.filter((m) => Math.max(1, Math.min(10, Math.floor(Number(m?.rarity) || 1))) <= 6);
    const summonItems = getSummonableItems();
    const setSelectValue = (id, value) => {
      const el = overlay.querySelector(`#${id}`);
      if (el) el.value = String(value || '');
    };
    setSelectValue('cpSummonCfgHeroCurrency', cfg.heroCurrencyId || 'gold_coin');
    setSelectValue('cpSummonCfgMonsterCurrency', cfg.monsterCurrencyId || 'gold_coin');
    setSelectValue('cpSummonCfgAmateurHeroCurrency', cfg.amateurHeroCurrencyId || 'silver_coin');
    setSelectValue('cpSummonCfgAmateurMonsterCurrency', cfg.amateurMonsterCurrencyId || 'silver_coin');
    setSelectValue('cpSummonCfgItemCurrency', cfg.itemCurrencyId || 'gold_coin');
    const renderStarWeightInputs = (hostId, weights, maxStar) => {
      const host = overlay.querySelector(`#${hostId}`);
      if (!host) return;
      host.innerHTML = Array.from({ length: maxStar }, (_, i) => i + 1).map((star) => `
        <label class="cp-setting-help" style="margin:0; display:flex; flex-direction:column; gap:2px;">
          <span>★${esc(String(star))}</span>
          <input class="cp-input" data-summon-star-weight="${esc(String(hostId))}:${esc(String(star))}" type="number" min="0" step="0.1" value="${esc(String(Number(weights?.[star]) || 1))}">
        </label>
      `).join('');
    };
    const renderElementWeightInputs = (hostId, weights) => {
      const host = overlay.querySelector(`#${hostId}`);
      if (!host) return;
      host.innerHTML = SUMMON_ELEMENT_KEYS.map((el) => `
        <label class="cp-setting-help" style="margin:0; display:flex; flex-direction:column; gap:2px;">
          <span>${esc(el.charAt(0).toUpperCase() + el.slice(1))}</span>
          <input class="cp-input" data-summon-element-weight="${esc(String(hostId))}:${esc(el)}" type="number" min="0" step="0.1" value="${esc(String(Number(weights?.[el]) || 1))}">
        </label>
      `).join('');
    };
    renderStarWeightInputs('cpSummonHeroStarWeights', cfg.heroStarWeights, 10);
    renderElementWeightInputs('cpSummonHeroElementWeights', cfg.heroElementWeights);
    renderStarWeightInputs('cpSummonMonsterStarWeights', cfg.monsterStarWeights, 10);
    renderElementWeightInputs('cpSummonMonsterElementWeights', cfg.monsterElementWeights);
    renderStarWeightInputs('cpSummonAmHeroStarWeights', cfg.amateurHeroStarWeights, 6);
    renderElementWeightInputs('cpSummonAmHeroElementWeights', cfg.amateurHeroElementWeights);
    renderStarWeightInputs('cpSummonAmMonsterStarWeights', cfg.amateurMonsterStarWeights, 6);
    renderElementWeightInputs('cpSummonAmMonsterElementWeights', cfg.amateurMonsterElementWeights);
    const rowTemplate = ({ id, name, stars, element, weight, attr, group }) => `
      <label class="cp-setting-help" data-sort-id="${esc(String(id))}" data-sort-stars="${esc(String(Math.max(0, Math.floor(Number(stars) || 0))))}" data-sort-element="${esc(String(element || '').toLowerCase())}" style="display:flex; align-items:center; gap:8px; margin:0;">
        <span style="flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">#${esc(id)}${stars ? ` · ★${esc(String(stars))}` : ''} · ${esc(name)}</span>
        <span data-summon-pct="${esc(group)}:${esc(id)}" style="min-width:56px; text-align:right; font-weight:900; color:rgba(255,255,255,0.78);">0%</span>
        <input class="cp-input" ${attr}="${esc(id)}" type="number" min="0" step="0.1" value="${esc(String(Number.isFinite(weight) ? weight : 1))}" style="width:92px;">
      </label>
    `;
    if (heroRowsHost) {
      heroRowsHost.innerHTML = heroes.map((h) => {
        const id = String(h?.id || '').trim();
        const w = Number(cfg?.heroRates?.[id]);
        const stars = Math.max(1, Math.min(10, Math.floor(Number(h?.rarity) || 1)));
        return rowTemplate({ id, name: String(h?.name || id), stars, element: String(h?.element || ''), weight: w, attr: 'data-summon-hero-rate', group: 'hero' });
      }).join('');
    }
    if (monsterRowsHost) {
      monsterRowsHost.innerHTML = monsters.map((m) => {
        const id = String(m?.id || '').trim();
        const w = Number(cfg?.monsterRates?.[id]);
        const stars = Math.max(1, Math.min(10, Math.floor(Number(m?.rarity) || 1)));
        return rowTemplate({ id, name: String(m?.name || id), stars, element: String(m?.element || ''), weight: w, attr: 'data-summon-mon-rate', group: 'monster' });
      }).join('');
    }
    if (amHeroRowsHost) {
      amHeroRowsHost.innerHTML = amateurHeroes.map((h) => {
        const id = String(h?.id || '').trim();
        const w = Number(cfg?.amateurHeroRates?.[id]);
        const stars = Math.max(1, Math.min(10, Math.floor(Number(h?.rarity) || 1)));
        return rowTemplate({ id, name: String(h?.name || id), stars, element: String(h?.element || ''), weight: w, attr: 'data-summon-amhero-rate', group: 'amhero' });
      }).join('');
    }
    if (amMonsterRowsHost) {
      amMonsterRowsHost.innerHTML = amateurMonsters.map((m) => {
        const id = String(m?.id || '').trim();
        const w = Number(cfg?.amateurMonsterRates?.[id]);
        const stars = Math.max(1, Math.min(10, Math.floor(Number(m?.rarity) || 1)));
        return rowTemplate({ id, name: String(m?.name || id), stars, element: String(m?.element || ''), weight: w, attr: 'data-summon-ammonster-rate', group: 'ammonster' });
      }).join('');
    }
    if (itemRowsHost) {
      itemRowsHost.innerHTML = summonItems.map((it) => {
        const id = String(it?.id || '').trim();
        const w = Number(cfg?.itemRates?.[id]);
        return rowTemplate({ id, name: String(it?.name || id), stars: null, element: '', weight: w, attr: 'data-summon-item-rate', group: 'item' });
      }).join('');
    }
    const parseSortId = (v) => Math.max(0, Math.floor(Number(String(v || '').replace(/[^\d]/g, '')) || 0));
    const sortRows = (host, mode) => {
      if (!host) return;
      const rows = Array.from(host.children || []);
      const mm = String(mode || 'no').toLowerCase();
      rows.sort((a, b) => {
        const idA = parseSortId(a.getAttribute('data-sort-id'));
        const idB = parseSortId(b.getAttribute('data-sort-id'));
        const starA = Math.max(0, Math.floor(Number(a.getAttribute('data-sort-stars')) || 0));
        const starB = Math.max(0, Math.floor(Number(b.getAttribute('data-sort-stars')) || 0));
        const elA = String(a.getAttribute('data-sort-element') || '');
        const elB = String(b.getAttribute('data-sort-element') || '');
        if (mm === 'star') {
          if (starB !== starA) return starB - starA;
          if (elA !== elB) return elA.localeCompare(elB);
          return idA - idB;
        }
        if (mm === 'element') {
          if (elA !== elB) return elA.localeCompare(elB);
          if (starB !== starA) return starB - starA;
          return idA - idB;
        }
        return idA - idB;
      });
      rows.forEach((r) => host.appendChild(r));
    };
    const bindSort = (selectId, host) => {
      const sel = overlay.querySelector(`#${selectId}`);
      if (!sel) return;
      const apply = () => sortRows(host, sel.value);
      sel.addEventListener('change', apply, { passive: true });
      apply();
    };
    bindSort('cpSummonHeroSort', heroRowsHost);
    bindSort('cpSummonMonsterSort', monsterRowsHost);
    bindSort('cpSummonAmHeroSort', amHeroRowsHost);
    bindSort('cpSummonAmMonsterSort', amMonsterRowsHost);
    const heroById = Object.fromEntries(heroes.map((h) => [String(h?.id || '').trim(), h]));
    const monsterById = Object.fromEntries(monsters.map((m) => [String(m?.id || '').trim(), m]));
    const amHeroById = Object.fromEntries(amateurHeroes.map((h) => [String(h?.id || '').trim(), h]));
    const amMonsterById = Object.fromEntries(amateurMonsters.map((m) => [String(m?.id || '').trim(), m]));
    const countByStar = (arr) => {
      const out = {};
      (Array.isArray(arr) ? arr : []).forEach((u) => {
        const s = Math.max(1, Math.min(10, Math.floor(Number(u?.rarity) || 1)));
        out[s] = Math.max(0, Number(out[s]) || 0) + 1;
      });
      return out;
    };
    const heroCnt = countByStar(heroes);
    const monCnt = countByStar(monsters);
    const amHeroCnt = countByStar(amateurHeroes);
    const amMonCnt = countByStar(amateurMonsters);
    const getGroupWeightFactor = (group, id) => {
      const g = String(group || '');
      const uid = String(id || '').trim();
      const pick = (() => {
        if (g === 'hero') return { unit: heroById[uid], starMapId: 'cpSummonHeroStarWeights', elMapId: 'cpSummonHeroElementWeights', cnt: heroCnt };
        if (g === 'monster') return { unit: monsterById[uid], starMapId: 'cpSummonMonsterStarWeights', elMapId: 'cpSummonMonsterElementWeights', cnt: monCnt };
        if (g === 'amhero') return { unit: amHeroById[uid], starMapId: 'cpSummonAmHeroStarWeights', elMapId: 'cpSummonAmHeroElementWeights', cnt: amHeroCnt };
        if (g === 'ammonster') return { unit: amMonsterById[uid], starMapId: 'cpSummonAmMonsterStarWeights', elMapId: 'cpSummonAmMonsterElementWeights', cnt: amMonCnt };
        return null;
      })();
      if (!pick?.unit) return 1;
      const star = Math.max(1, Math.min(10, Math.floor(Number(pick.unit?.rarity) || 1)));
      const el = String(pick.unit?.element || '').trim().toLowerCase();
      const starEl = overlay.querySelector(`[data-summon-star-weight="${CSS.escape(String(pick.starMapId))}:${CSS.escape(String(star))}"]`);
      const elemEl = overlay.querySelector(`[data-summon-element-weight="${CSS.escape(String(pick.elMapId))}:${CSS.escape(String(el))}"]`);
      const starW = Math.max(0, Number(starEl?.value) || 0);
      const elemW = Math.max(0, Number(elemEl?.value) || 0);
      const split = Math.max(1, Number(pick.cnt?.[star]) || 1);
      return (starW * elemW) / split;
    };
    const updatePercentages = (group, selector) => {
      const entries = Array.from(overlay.querySelectorAll(selector));
      const values = entries.map((el) => {
        const id = String(el.getAttribute(selector.slice(1, -1)) || '').trim();
        const raw = Math.max(0, Number(el?.value) || 0);
        return { el, id, val: raw * getGroupWeightFactor(group, id) };
      });
      const total = values.reduce((sum, row) => sum + row.val, 0);
      entries.forEach((el) => {
        const id = String(el.getAttribute(selector.slice(1, -1)) || '').trim();
        const val = values.find((x) => x.el === el)?.val || 0;
        const pct = total > 0 ? (val / total) * 100 : 0;
        const pctEl = overlay.querySelector(`[data-summon-pct="${CSS.escape(group)}:${CSS.escape(id)}"]`);
        if (pctEl) pctEl.textContent = `${pct.toFixed(2)}%`;
      });
    };
    const bindRatePct = (group, selector) => {
      overlay.querySelectorAll(selector).forEach((el) => {
        el.addEventListener('input', () => updatePercentages(group, selector));
      });
      updatePercentages(group, selector);
    };
    bindRatePct('hero', '[data-summon-hero-rate]');
    bindRatePct('monster', '[data-summon-mon-rate]');
    bindRatePct('amhero', '[data-summon-amhero-rate]');
    bindRatePct('ammonster', '[data-summon-ammonster-rate]');
    bindRatePct('item', '[data-summon-item-rate]');
    overlay.querySelectorAll('[data-summon-star-weight], [data-summon-element-weight]').forEach((el) => {
      el.addEventListener('input', () => {
        updatePercentages('hero', '[data-summon-hero-rate]');
        updatePercentages('monster', '[data-summon-mon-rate]');
        updatePercentages('amhero', '[data-summon-amhero-rate]');
        updatePercentages('ammonster', '[data-summon-ammonster-rate]');
      });
    });
    const heroToggle = overlay.querySelector('#cpSummonHeroRatesToggle');
    const monToggle = overlay.querySelector('#cpSummonMonsterRatesToggle');
    const amHeroToggle = overlay.querySelector('#cpSummonAmHeroRatesToggle');
    const amMonsterToggle = overlay.querySelector('#cpSummonAmMonsterRatesToggle');
    const itemToggle = overlay.querySelector('#cpSummonItemRatesToggle');
    heroToggle?.addEventListener('click', () => {
      const open = heroRowsHost?.style.display !== 'none';
      if (heroRowsHost) heroRowsHost.style.display = open ? 'none' : 'grid';
      if (heroToggle) {
        heroToggle.textContent = open ? 'Expand' : 'Collapse';
        heroToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      }
    }, { passive: true });
    monToggle?.addEventListener('click', () => {
      const open = monsterRowsHost?.style.display !== 'none';
      if (monsterRowsHost) monsterRowsHost.style.display = open ? 'none' : 'grid';
      if (monToggle) {
        monToggle.textContent = open ? 'Expand' : 'Collapse';
        monToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      }
    }, { passive: true });
    amHeroToggle?.addEventListener('click', () => {
      const open = amHeroRowsHost?.style.display !== 'none';
      if (amHeroRowsHost) amHeroRowsHost.style.display = open ? 'none' : 'grid';
      if (amHeroToggle) {
        amHeroToggle.textContent = open ? 'Expand' : 'Collapse';
        amHeroToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      }
    }, { passive: true });
    amMonsterToggle?.addEventListener('click', () => {
      const open = amMonsterRowsHost?.style.display !== 'none';
      if (amMonsterRowsHost) amMonsterRowsHost.style.display = open ? 'none' : 'grid';
      if (amMonsterToggle) {
        amMonsterToggle.textContent = open ? 'Expand' : 'Collapse';
        amMonsterToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      }
    }, { passive: true });
    itemToggle?.addEventListener('click', () => {
      const open = itemRowsHost?.style.display !== 'none';
      if (itemRowsHost) itemRowsHost.style.display = open ? 'none' : 'grid';
      if (itemToggle) {
        itemToggle.textContent = open ? 'Expand' : 'Collapse';
        itemToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      }
    }, { passive: true });

    const collectStarWeights = (hostId, maxStar) => {
      const out = {};
      for (let i = 1; i <= maxStar; i += 1) {
        const el = overlay.querySelector(`[data-summon-star-weight="${CSS.escape(String(hostId))}:${CSS.escape(String(i))}"]`);
        out[String(i)] = Math.max(0, Number(el?.value) || 0);
      }
      return out;
    };
    const collectElementWeights = (hostId) => {
      const out = {};
      SUMMON_ELEMENT_KEYS.forEach((k) => {
        const el = overlay.querySelector(`[data-summon-element-weight="${CSS.escape(String(hostId))}:${CSS.escape(k)}"]`);
        out[k] = Math.max(0, Number(el?.value) || 0);
      });
      return out;
    };

    const close = () => {
      try { overlay.remove(); } catch {}
      try { window.removeEventListener('keydown', onKey); } catch {}
    };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
    overlay.querySelector('#cpSummonCfgCancel')?.addEventListener('click', close, { passive: true });
    window.addEventListener('keydown', onKey);

    overlay.querySelector('#cpSummonCfgSave')?.addEventListener('click', async () => {
      try {
        const limitHours = Math.max(0, Math.floor(Number(overlay.querySelector('#cpSummonCfgLimit')?.value) || 0));
        const enabled = !!overlay.querySelector('#cpSummonCfgEnabled')?.checked;
        const heroEnabled = !!overlay.querySelector('#cpSummonCfgHeroEnabled')?.checked;
        const monsterEnabled = !!overlay.querySelector('#cpSummonCfgMonsterEnabled')?.checked;
        const amateurHeroEnabled = !!overlay.querySelector('#cpSummonCfgAmateurHeroEnabled')?.checked;
        const amateurMonsterEnabled = !!overlay.querySelector('#cpSummonCfgAmateurMonsterEnabled')?.checked;
        const itemEnabled = !!overlay.querySelector('#cpSummonCfgItemEnabled')?.checked;
        const heroCurrencyId = String(overlay.querySelector('#cpSummonCfgHeroCurrency')?.value || '').trim().toLowerCase();
        const heroCost = Math.max(1, Math.floor(Number(overlay.querySelector('#cpSummonCfgHeroCost')?.value) || 1));
        const monsterCurrencyId = String(overlay.querySelector('#cpSummonCfgMonsterCurrency')?.value || '').trim().toLowerCase();
        const monsterCost = Math.max(1, Math.floor(Number(overlay.querySelector('#cpSummonCfgMonsterCost')?.value) || 1));
        const amateurHeroCurrencyId = String(overlay.querySelector('#cpSummonCfgAmateurHeroCurrency')?.value || '').trim().toLowerCase();
        const amateurHeroCost = Math.max(1, Math.floor(Number(overlay.querySelector('#cpSummonCfgAmateurHeroCost')?.value) || 1));
        const amateurMonsterCurrencyId = String(overlay.querySelector('#cpSummonCfgAmateurMonsterCurrency')?.value || '').trim().toLowerCase();
        const amateurMonsterCost = Math.max(1, Math.floor(Number(overlay.querySelector('#cpSummonCfgAmateurMonsterCost')?.value) || 1));
        const itemCurrencyId = String(overlay.querySelector('#cpSummonCfgItemCurrency')?.value || '').trim().toLowerCase();
        const itemCost = Math.max(1, Math.floor(Number(overlay.querySelector('#cpSummonCfgItemCost')?.value) || 1));
        const heroLabel = String(overlay.querySelector('#cpSummonCfgHeroLabel')?.value || '').trim() || 'Summon Hero';
        const monsterLabel = String(overlay.querySelector('#cpSummonCfgMonsterLabel')?.value || '').trim() || 'Summon Monster';
        const amateurHeroLabel = String(overlay.querySelector('#cpSummonCfgAmateurHeroLabel')?.value || '').trim() || 'Amateur Summon Hero';
        const amateurMonsterLabel = String(overlay.querySelector('#cpSummonCfgAmateurMonsterLabel')?.value || '').trim() || 'Amateur Summon Monster';
        const itemLabel = String(overlay.querySelector('#cpSummonCfgItemLabel')?.value || '').trim() || 'Summon Item';
        const heroStarWeights = collectStarWeights('cpSummonHeroStarWeights', 10);
        const heroElementWeights = collectElementWeights('cpSummonHeroElementWeights');
        const monsterStarWeights = collectStarWeights('cpSummonMonsterStarWeights', 10);
        const monsterElementWeights = collectElementWeights('cpSummonMonsterElementWeights');
        const amateurHeroStarWeights = collectStarWeights('cpSummonAmHeroStarWeights', 6);
        const amateurHeroElementWeights = collectElementWeights('cpSummonAmHeroElementWeights');
        const amateurMonsterStarWeights = collectStarWeights('cpSummonAmMonsterStarWeights', 6);
        const amateurMonsterElementWeights = collectElementWeights('cpSummonAmMonsterElementWeights');
        const heroRates = {};
        overlay.querySelectorAll('[data-summon-hero-rate]').forEach((el) => {
          const id = String(el.getAttribute('data-summon-hero-rate') || '').trim();
          if (!id) return;
          heroRates[id] = Math.max(0, Number(el.value) || 0);
        });
        const monsterRates = {};
        overlay.querySelectorAll('[data-summon-mon-rate]').forEach((el) => {
          const id = String(el.getAttribute('data-summon-mon-rate') || '').trim();
          if (!id) return;
          monsterRates[id] = Math.max(0, Number(el.value) || 0);
        });
        const amateurHeroRates = {};
        overlay.querySelectorAll('[data-summon-amhero-rate]').forEach((el) => {
          const id = String(el.getAttribute('data-summon-amhero-rate') || '').trim();
          if (!id) return;
          amateurHeroRates[id] = Math.max(0, Number(el.value) || 0);
        });
        const amateurMonsterRates = {};
        overlay.querySelectorAll('[data-summon-ammonster-rate]').forEach((el) => {
          const id = String(el.getAttribute('data-summon-ammonster-rate') || '').trim();
          if (!id) return;
          amateurMonsterRates[id] = Math.max(0, Number(el.value) || 0);
        });
        const itemRates = {};
        overlay.querySelectorAll('[data-summon-item-rate]').forEach((el) => {
          const id = String(el.getAttribute('data-summon-item-rate') || '').trim();
          if (!id) return;
          itemRates[id] = Math.max(0, Number(el.value) || 0);
        });
        [heroCurrencyId, monsterCurrencyId, amateurHeroCurrencyId, amateurMonsterCurrencyId, itemCurrencyId].forEach((id) => {
          if (!getStorageItemDef(id)) throw new Error('Invalid cost item.');
        });
        await saveSummonConfig({
          limitHours, enabled,
          heroEnabled, monsterEnabled, amateurHeroEnabled, amateurMonsterEnabled, itemEnabled,
          heroCurrencyId, heroCost, monsterCurrencyId, monsterCost,
          amateurHeroCurrencyId, amateurHeroCost, amateurMonsterCurrencyId, amateurMonsterCost,
          itemCurrencyId, itemCost,
          heroLabel, monsterLabel, amateurHeroLabel, amateurMonsterLabel, itemLabel,
          heroStarWeights, heroElementWeights, monsterStarWeights, monsterElementWeights,
          amateurHeroStarWeights, amateurHeroElementWeights, amateurMonsterStarWeights, amateurMonsterElementWeights,
          heroRates, monsterRates, amateurHeroRates, amateurMonsterRates, itemRates,
        });
        setMsg('Saved.');
        try { onSaved && onSaved(); } catch {}
        setTimeout(() => close(), 220);
      } catch (e) {
        setMsg(String(e?.message || e || 'Save failed'));
      }
    }, { passive: true });
  }

  function normalizeMallConfig(raw) {
    const base = defaultMallConfig();
    const defs = STORAGE_ITEM_DEFS || {};
    const offersIn = Array.isArray(raw?.offers) ? raw.offers : base.offers;
    const offers = offersIn
      .map((o, idx) => {
        const itemId = String(o?.itemId || '').trim().toLowerCase();
        if (!itemId || !defs[itemId]) return null;
        const currencyIdRaw = String(o?.currencyId || '').trim().toLowerCase();
        const currencyId = (currencyIdRaw && defs[currencyIdRaw]) ? currencyIdRaw : 'gold_coin';
        const price = Math.max(1, Math.floor(Number(o?.price) || 1));
        const limitHours = Math.max(0, Math.floor(Number(o?.limitHours) || 0));
        const enabled = o?.enabled !== false;
        const id = String(o?.id || `offer_${idx + 1}`).trim() || `offer_${idx + 1}`;
        return { id, itemId, currencyId, price, limitHours, enabled };
      })
      .filter(Boolean);
    return {
      updatedAt: Number.isFinite(Number(raw?.updatedAt)) ? Math.floor(Number(raw.updatedAt)) : base.updatedAt,
      offers: offers.length ? offers : base.offers,
    };
  }

  function loadMallConfig() {
    try {
      const raw = localStorage.getItem(MALL_CONFIG_KEY);
      if (!raw) return normalizeMallConfig(defaultMallConfig());
      return normalizeMallConfig(JSON.parse(raw));
    } catch {
      return normalizeMallConfig(defaultMallConfig());
    }
  }

  function saveMallConfig(cfg) {
    let saved = null;
    try {
      const next = normalizeMallConfig(cfg);
      next.updatedAt = Date.now();
      localStorage.setItem(MALL_CONFIG_KEY, JSON.stringify(next));
      saved = next;
    } catch {}
    try { window.dispatchEvent(new Event('cpMallConfigChanged')); } catch {}
    if (saved && isAdminMode()) {
      saveChessPalGlobalConfigToServer({ mallConfig: saved }).catch(() => {});
    }
  }

  function getMallOffersForNow() {
    const cfg = loadMallConfig();
    const now = Date.now();
    const startAt = Math.max(0, Number(cfg.updatedAt) || 0);
    return (Array.isArray(cfg.offers) ? cfg.offers : [])
      .filter(o => o && o.enabled !== false)
      .map((o) => {
        const limitHours = Math.max(0, Math.floor(Number(o.limitHours) || 0));
        const expiresAt = limitHours > 0 ? (startAt + limitHours * 3600000) : 0;
        return { ...o, expiresAt, expired: expiresAt > 0 ? now >= expiresAt : false };
      })
      .filter(o => !o.expired);
  }

  function mallTimeText(expiresAt) {
    const t = Math.floor(Number(expiresAt) || 0);
    if (!(t > 0)) return '';
    const ms = t - Date.now();
    if (ms <= 0) return 'Expired';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}h ${m}m left`;
    return `${m}m left`;
  }

  function showMallAdminSettingsModal(onSaved) {
    if (!isAdminMode()) return;
    const old = document.getElementById('cpMallAdminOverlay');
    if (old) old.remove();

    const cfg = loadMallConfig();
    const defs = Object.values(STORAGE_ITEM_DEFS || {}).filter(Boolean);
    const itemOptions = defs
      .slice()
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))
      .map(d => `<option value="${esc(String(d.id))}">${esc(String(d.name || d.id))}</option>`)
      .join('');

    const overlay = document.createElement('div');
    overlay.id = 'cpMallAdminOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Mall setting">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-h1" style="font-size:18px;">Mall Setting</div>
          <div class="cp-muted" style="margin-top:6px;">Set sale item, price item, price amount, and time limit.</div>
          <div id="cpMallAdminRows" style="display:grid; gap:10px; margin-top:12px;"></div>
          <div class="cp-row" style="margin-top:12px; justify-content:space-between;">
            <button class="cp-tool-btn" type="button" id="cpMallAdminAdd">Add item</button>
            <div style="display:flex; gap:8px;">
              <button class="cp-tool-btn" type="button" id="cpMallAdminCancel">Cancel</button>
              <button class="cp-primary" type="button" id="cpMallAdminSave">Save</button>
            </div>
          </div>
          <div class="cp-muted" id="cpMallAdminMsg" style="margin-top:10px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const rowsHost = overlay.querySelector('#cpMallAdminRows');
    const msg = overlay.querySelector('#cpMallAdminMsg');
    const setMsg = (t) => { if (msg) msg.textContent = String(t || ''); };

    const makeRow = (o, idx) => {
      const key = String(o?.id || `offer_${idx + 1}`).trim() || `offer_${idx + 1}`;
      const itemId = String(o?.itemId || 'exp_pawn').trim().toLowerCase();
      const currencyId = String(o?.currencyId || 'gold_coin').trim().toLowerCase();
      const price = Math.max(1, Math.floor(Number(o?.price) || 1));
      const limitHours = Math.max(0, Math.floor(Number(o?.limitHours) || 0));
      const enabled = o?.enabled !== false;
      return `
        <div class="cp-setting-item" data-mall-row="${esc(key)}">
          <div class="cp-row" style="margin-top:0; align-items:flex-end; gap:8px; flex-wrap:wrap;">
            <div style="flex:1 1 220px; min-width: 180px;">
              <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">Sell item</div>
              <select class="cp-select" data-mall-item>${itemOptions}</select>
            </div>
            <div style="flex:1 1 220px; min-width: 180px;">
              <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">Price item</div>
              <select class="cp-select" data-mall-currency>${itemOptions}</select>
            </div>
            <div style="width: 120px;">
              <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">Price</div>
              <input class="cp-input" type="number" min="1" step="1" value="${esc(String(price))}" data-mall-price>
            </div>
            <div style="width: 140px;">
              <div class="cp-setting-help" style="margin-top:0; margin-bottom:6px;">Limit (hours)</div>
              <input class="cp-input" type="number" min="0" step="1" value="${esc(String(limitHours))}" data-mall-limit>
            </div>
            <label class="cp-setting-help" style="display:flex; align-items:center; gap:6px; margin:0 0 10px;">
              <input type="checkbox" ${enabled ? 'checked' : ''} data-mall-enabled>
              Enabled
            </label>
            <button class="cp-tool-btn" type="button" data-mall-remove style="margin-bottom:6px;">Remove</button>
          </div>
        </div>
      `;
    };

    const renderRows = (offers) => {
      rowsHost.innerHTML = offers.map((o, idx) => makeRow(o, idx)).join('');
      rowsHost.querySelectorAll('[data-mall-row]').forEach((rowEl, idx) => {
        const rowData = offers[idx] || {};
        const sellSel = rowEl.querySelector('[data-mall-item]');
        const curSel = rowEl.querySelector('[data-mall-currency]');
        if (sellSel) sellSel.value = String(rowData.itemId || 'exp_pawn');
        if (curSel) curSel.value = String(rowData.currencyId || 'gold_coin');
        rowEl.querySelector('[data-mall-remove]')?.addEventListener('click', () => {
          const id = String(rowEl.getAttribute('data-mall-row') || '');
          const next = offers.filter(x => String(x?.id || '') !== id);
          renderRows(next);
        }, { passive: true });
      });
    };

    const initial = Array.isArray(cfg.offers) && cfg.offers.length ? cfg.offers : defaultMallConfig().offers;
    renderRows(initial);

    const close = () => {
      try { overlay.remove(); } catch {}
      try { window.removeEventListener('keydown', onKey); } catch {}
    };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
    overlay.querySelector('#cpMallAdminCancel')?.addEventListener('click', close, { passive: true });
    window.addEventListener('keydown', onKey);

    overlay.querySelector('#cpMallAdminAdd')?.addEventListener('click', () => {
      const nowOffers = Array.from(rowsHost.querySelectorAll('[data-mall-row]')).map((el, idx) => {
        const id = String(el.getAttribute('data-mall-row') || `offer_${idx + 1}`);
        return {
          id,
          itemId: String(el.querySelector('[data-mall-item]')?.value || 'exp_pawn').trim().toLowerCase(),
          currencyId: String(el.querySelector('[data-mall-currency]')?.value || 'gold_coin').trim().toLowerCase(),
          price: Math.max(1, Math.floor(Number(el.querySelector('[data-mall-price]')?.value) || 1)),
          limitHours: Math.max(0, Math.floor(Number(el.querySelector('[data-mall-limit]')?.value) || 0)),
          enabled: !!el.querySelector('[data-mall-enabled]')?.checked,
        };
      });
      nowOffers.push({
        id: `offer_${Date.now()}`,
        itemId: 'exp_pawn',
        currencyId: 'gold_coin',
        price: 1,
        limitHours: 0,
        enabled: true,
      });
      renderRows(nowOffers);
    }, { passive: true });

    overlay.querySelector('#cpMallAdminSave')?.addEventListener('click', () => {
      try {
        const rows = Array.from(rowsHost.querySelectorAll('[data-mall-row]'));
        const offers = rows.map((el, idx) => {
          const id = String(el.getAttribute('data-mall-row') || `offer_${idx + 1}`).trim() || `offer_${idx + 1}`;
          const itemId = String(el.querySelector('[data-mall-item]')?.value || '').trim().toLowerCase();
          const currencyId = String(el.querySelector('[data-mall-currency]')?.value || '').trim().toLowerCase() || 'gold_coin';
          const price = Math.max(1, Math.floor(Number(el.querySelector('[data-mall-price]')?.value) || 1));
          const limitHours = Math.max(0, Math.floor(Number(el.querySelector('[data-mall-limit]')?.value) || 0));
          const enabled = !!el.querySelector('[data-mall-enabled]')?.checked;
          return { id, itemId, currencyId, price, limitHours, enabled };
        }).filter(o => !!getStorageItemDef(o.itemId));
        if (!offers.length) throw new Error('Need at least one valid mall item.');
        saveMallConfig({ updatedAt: Date.now(), offers });
        setMsg('Saved.');
        try { onSaved && onSaved(); } catch {}
        setTimeout(() => close(), 220);
      } catch (e) {
        setMsg(String(e?.message || e || 'Save failed'));
      }
    }, { passive: true });
  }

  function ShopMallPage() {}
  ShopMallPage.title = 'Mall';
  ShopMallPage.render = () => {
    const offers = getMallOffersForNow();
    const admin = isAdminMode();
    return `
      <div class="cp-page-card">
        <div class="cp-row" style="margin-top:0; justify-content:space-between; align-items:center;">
          <div class="cp-h1">Mall</div>
          ${admin ? `<button class="cp-tool-btn" type="button" id="cpMallSettingBtn">Setting</button>` : ``}
        </div>
        <div class="cp-mall-grid" style="margin-top:12px;">
          ${offers.map((o, idx) => {
            const item = getStorageItemDef(o.itemId);
            const cur = getStorageItemDef(o.currencyId || 'gold_coin');
            const itemName = String(item?.name || o.itemId || 'Item');
            const curName = String(cur?.name || o.currencyId || 'Coin');
            const limitText = mallTimeText(o.expiresAt);
            return `
              <div class="cp-mall-item">
                <div class="cp-mall-icon">
                  ${item?.img ? renderImgWithFallback(item.img, itemName, '') : ``}
                </div>
                <div class="cp-mall-meta">
                  <div class="cp-setting-label">${esc(itemName)}</div>
                  <div class="cp-setting-help">Buy 1 × ${esc(itemName)}</div>
                  <div class="cp-mall-price" aria-label="Price">
                    ${cur?.img ? renderImgWithFallback(cur.img, curName, 'cp-mall-coin') : ``}
                    <span class="cp-mall-x">×${esc(String(Math.max(1, Math.floor(Number(o.price) || 1))))}</span>
                  </div>
                  ${limitText ? `<div class="cp-setting-help" style="margin-top:6px;">${esc(limitText)}</div>` : ``}
                </div>
                <button class="cp-primary" type="button" data-cp-mall-buy="${esc(String(idx))}">Buy</button>
              </div>
            `;
          }).join('')}
          ${offers.length ? `` : `<div class="cp-muted">No items available right now.</div>`}
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
    document.getElementById('cpMallSettingBtn')?.addEventListener('click', () => {
      showMallAdminSettingsModal(() => {
        try { Router.renderCurrent(); } catch {}
      });
    }, { passive: true });
    const buy = (offerIdx) => {
      try {
        setMsg('');
        const offers = getMallOffersForNow();
        const offer = offers[Math.max(0, Math.floor(Number(offerIdx) || 0))];
        if (!offer) {
          setMsg('Offer is unavailable.');
          return;
        }
        const cost = Math.max(1, Math.floor(Number(offer.price) || 1));
        const itemId = String(offer.itemId || '').trim().toLowerCase();
        const currencyId = String(offer.currencyId || 'gold_coin').trim().toLowerCase();
        const currencyDef = getStorageItemDef(currencyId);
        let slots = loadStorage();
        const spent = spendFromStorage(slots, currencyId, cost);
        if (!spent.ok) {
          setMsg(`Not enough ${String(currencyDef?.name || 'coins')}.`);
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
        showStorageGainModal({ title: 'Purchase Result', rewards: [{ itemId, qty: 1 }] });
      } catch (e) {
        setMsg(String(e?.message || e || 'Purchase failed'));
      }
    };
    document.querySelectorAll('[data-cp-mall-buy]').forEach((btn) => {
      btn.addEventListener('click', () => buy(btn.getAttribute('data-cp-mall-buy')), { passive: true });
    });
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

  function weightedPickByRates(units, ratesLike, opts = {}) {
    const list = Array.isArray(units) ? units : [];
    if (!list.length) return null;
    const rates = ratesLike || {};
    const starWeights = (opts && typeof opts.starWeights === 'object' && !Array.isArray(opts.starWeights)) ? opts.starWeights : null;
    const elementWeights = (opts && typeof opts.elementWeights === 'object' && !Array.isArray(opts.elementWeights)) ? opts.elementWeights : null;
    const equalByStar = opts?.equalByStar !== false;
    const starCountMap = {};
    if (equalByStar) {
      list.forEach((u) => {
        const star = Math.max(1, Math.min(10, Math.floor(Number(u?.rarity) || 1)));
        starCountMap[star] = Math.max(0, Number(starCountMap[star]) || 0) + 1;
      });
    }
    let total = 0;
    const rows = list.map((u) => {
      const id = String(u?.id || '').trim();
      const baseW = Math.max(0, Number(rates?.[id]) || 0);
      const star = Math.max(1, Math.min(10, Math.floor(Number(u?.rarity) || 1)));
      const element = String(u?.element || '').trim().toLowerCase();
      const starW = starWeights ? Math.max(0, Number(starWeights?.[star]) || 0) : 1;
      const elemW = elementWeights
        ? Math.max(0, Number(elementWeights?.[element]) || (SUMMON_ELEMENT_KEYS.includes(element) ? 1 : 1))
        : 1;
      const split = equalByStar ? Math.max(1, Number(starCountMap?.[star]) || 1) : 1;
      const w = Math.max(0, (baseW * starW * elemW) / split);
      total += w;
      return { unit: u, w };
    });
    if (!(total > 0)) return null;
    let r = Math.random() * total;
    for (const row of rows) {
      r -= row.w;
      if (r <= 0) return row.unit;
    }
    return rows[rows.length - 1]?.unit || null;
  }

  function showSummonItemModal(itemDef) {
    const it = itemDef || null;
    if (!it) return;
    const old = document.getElementById('cpSummonItemOverlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'cpSummonItemOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Summon item result">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-h1" style="font-size:20px;">Summon Result</div>
          <div class="cp-setting-item" style="margin-top:12px; background:rgba(255,255,255,0.03);">
            <div class="cp-row" style="margin-top:0; align-items:center; gap:10px;">
              <div style="width:120px; height:120px; border-radius:14px; overflow:hidden; border:1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.18); flex:0 0 auto;">
                ${it?.img ? `<img src="${esc(String(it.img))}" alt="${esc(String(it.name || it.id || 'Item'))}" style="width:100%;height:100%;object-fit:contain;" decoding="async" loading="lazy">` : ''}
              </div>
              <div>
                <div class="cp-setting-label">${esc(String(it?.name || it?.id || 'Item'))}</div>
                <div class="cp-setting-help">Obtained ×1</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => { try { overlay.remove(); } catch {} };
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
    overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
  }

  function showStorageGainModal({ title = 'Obtained', rewards = [] } = {}) {
    const rows = (Array.isArray(rewards) ? rewards : [])
      .map((r) => ({
        itemId: String(r?.itemId || '').trim().toLowerCase(),
        qty: Math.max(1, Math.floor(Number(r?.qty) || 1)),
      }))
      .filter((r) => r.itemId && r.qty > 0);
    if (!rows.length) return;
    const old = document.getElementById('cpStorageGainOverlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'cpStorageGainOverlay';
    overlay.className = 'cp-modal-overlay';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Reward result">
        <button class="cp-modal-close" type="button" aria-label="Close">×</button>
        <div class="cp-modal-body">
          <div class="cp-h1" style="font-size:20px;">${esc(String(title || 'Obtained'))}</div>
          <div style="display:grid; gap:8px; margin-top:12px;">
            ${rows.map((r) => {
              const def = getStorageItemDef(r.itemId);
              const name = String(def?.name || r.itemId);
              const img = String(def?.img || '').trim();
              return `
                <div class="cp-setting-item" style="margin-top:0; background:rgba(255,255,255,0.03);">
                  <div class="cp-row" style="margin-top:0; align-items:center; justify-content:space-between; gap:8px;">
                    <div class="cp-row" style="margin-top:0; align-items:center; gap:10px;">
                      ${img ? `<img src="${esc(img)}" alt="${esc(name)}" style="width:36px;height:36px;object-fit:contain;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.16);" decoding="async" loading="lazy">` : ''}
                      <div class="cp-setting-label">${esc(name)}</div>
                    </div>
                    <div class="cp-setting-help">×${esc(String(r.qty))}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => { try { overlay.remove(); } catch {} };
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
    overlay.querySelector('.cp-modal-close')?.addEventListener('click', close, { passive: true });
  }

  const SUMMON_MEDIA = {
    hero: {
      poster: [
        'images/Summon/Su001-Summon-Hero.jpg',
      ],
    },
    monster: {
      poster: [
        'images/Summon/Su002-Summon-Monster.jpg',
      ],
    },
    hero_amateur: {
      poster: [
        'images/Summon/Su003-Amatuer-Summon-Hero.png',
        'images/Summon/Su003-Amateur-Summon-Hero.png',
      ],
    },
    monster_amateur: {
      poster: ['images/Summon/Su004-Amatuer-Summon-Monster.png', 'images/Summon/Su004-Amateur-Summon-Monster.png'],
    },
    item: {
      poster: ['images/Summon/Su005-Summon-Item.png'],
    },
  };

  function getSummonPoster(kind) {
    const list = SUMMON_MEDIA?.[String(kind || '').trim()]?.poster;
    return String((Array.isArray(list) && list[0]) || 'images/Summon/Su001-Summon-Hero.jpg');
  }

  function SummonPage() {}
  SummonPage.title = 'Summon';
  SummonPage.render = () => {
    const admin = isAdminMode();
    const cfg = getSummonConfigForNow();
    const disabledText = !cfg.enabledNow ? (cfg.expired ? 'Summon is expired.' : 'Summon is disabled by Admin.') : '';
    const heroDisabled = !cfg.heroEnabledNow;
    const monsterDisabled = !cfg.monsterEnabledNow;
    const amateurHeroDisabled = !cfg.amateurHeroEnabledNow;
    const amateurMonsterDisabled = !cfg.amateurMonsterEnabledNow;
    const itemDisabled = !cfg.itemEnabledNow;
    const heroCur = getStorageItemDef(cfg.heroCurrencyId || 'gold_coin') || getStorageItemDef('gold_coin');
    const monCur = getStorageItemDef(cfg.monsterCurrencyId || 'gold_coin') || getStorageItemDef('gold_coin');
    const amHeroCur = getStorageItemDef(cfg.amateurHeroCurrencyId || 'silver_coin') || getStorageItemDef('silver_coin');
    const amMonCur = getStorageItemDef(cfg.amateurMonsterCurrencyId || 'silver_coin') || getStorageItemDef('silver_coin');
    const itemCur = getStorageItemDef(cfg.itemCurrencyId || 'gold_coin') || getStorageItemDef('gold_coin');
    const heroLabel = String(cfg.heroLabel || 'Summon Hero');
    const monsterLabel = String(cfg.monsterLabel || 'Summon Monster');
    const amateurHeroLabel = String(cfg.amateurHeroLabel || 'Amateur Summon Hero');
    const amateurMonsterLabel = String(cfg.amateurMonsterLabel || 'Amateur Summon Monster');
    const itemLabel = String(cfg.itemLabel || 'Summon Item');
    return `
      <div class="cp-page-card cp-summon-page">
        <div class="cp-row" style="margin-top:0; justify-content:flex-end;">
          ${admin ? `<button class="cp-tool-btn" type="button" id="cpSummonSettingBtn">Setting</button>` : ``}
        </div>
        <div style="display:grid; gap:12px; width:min(860px, 100%);">
          <button class="cp-summon-main" type="button" id="cpSummonHero" aria-label="${esc(heroLabel)}" ${cfg.enabledNow && !heroDisabled ? '' : 'disabled'}>
            <img class="cp-summon-mainimg" id="cpSummonBgHero" src="${esc(getSummonPoster('hero'))}" alt="Summon background">
            <div class="cp-summon-overlay" aria-hidden="true">
              <div class="cp-summon-title">${esc(heroLabel)}</div>
              <div class="cp-summon-cost" aria-label="Cost">
                ${renderImgWithFallback(String(heroCur?.img || ''), String(heroCur?.name || 'Coin'), 'cp-summon-coin')}
                <span class="cp-summon-x">× ${esc(String(cfg.heroCost || 1))}</span>
              </div>
            </div>
          </button>
          <button class="cp-summon-main" type="button" id="cpSummonMonster" aria-label="${esc(monsterLabel)}" ${cfg.enabledNow && !monsterDisabled ? '' : 'disabled'}>
            <img class="cp-summon-mainimg" id="cpSummonBgMonster" src="${esc(getSummonPoster('monster'))}" alt="Summon background">
            <div class="cp-summon-overlay" aria-hidden="true">
              <div class="cp-summon-title">${esc(monsterLabel)}</div>
              <div class="cp-summon-cost" aria-label="Cost">
                ${renderImgWithFallback(String(monCur?.img || ''), String(monCur?.name || 'Coin'), 'cp-summon-coin')}
                <span class="cp-summon-x">× ${esc(String(cfg.monsterCost || 1))}</span>
              </div>
            </div>
          </button>
          <button class="cp-summon-main" type="button" id="cpSummonHeroAmateur" aria-label="${esc(amateurHeroLabel)}" ${cfg.enabledNow && !amateurHeroDisabled ? '' : 'disabled'}>
            <img class="cp-summon-mainimg" id="cpSummonBgHeroAmateur" src="${esc(getSummonPoster('hero_amateur'))}" alt="Summon background">
            <div class="cp-summon-overlay" aria-hidden="true">
              <div class="cp-summon-title">${esc(amateurHeroLabel)}</div>
              <div class="cp-summon-cost" aria-label="Cost">
                ${renderImgWithFallback(String(amHeroCur?.img || ''), String(amHeroCur?.name || 'Coin'), 'cp-summon-coin')}
                <span class="cp-summon-x">× ${esc(String(cfg.amateurHeroCost || 100))}</span>
              </div>
            </div>
          </button>
          <button class="cp-summon-main" type="button" id="cpSummonMonsterAmateur" aria-label="${esc(amateurMonsterLabel)}" ${cfg.enabledNow && !amateurMonsterDisabled ? '' : 'disabled'}>
            <img class="cp-summon-mainimg" id="cpSummonBgMonsterAmateur" src="${esc(getSummonPoster('monster_amateur'))}" alt="Summon background">
            <div class="cp-summon-overlay" aria-hidden="true">
              <div class="cp-summon-title">${esc(amateurMonsterLabel)}</div>
              <div class="cp-summon-cost" aria-label="Cost">
                ${renderImgWithFallback(String(amMonCur?.img || ''), String(amMonCur?.name || 'Coin'), 'cp-summon-coin')}
                <span class="cp-summon-x">× ${esc(String(cfg.amateurMonsterCost || 100))}</span>
              </div>
            </div>
          </button>
          <button class="cp-summon-main" type="button" id="cpSummonItem" aria-label="${esc(itemLabel)}" ${cfg.enabledNow && !itemDisabled ? '' : 'disabled'}>
            <img class="cp-summon-mainimg" id="cpSummonBgItem" src="${esc(getSummonPoster('item'))}" alt="Summon background">
            <div class="cp-summon-overlay" aria-hidden="true">
              <div class="cp-summon-title">${esc(itemLabel)}</div>
              <div class="cp-summon-cost" aria-label="Cost">
                ${renderImgWithFallback(String(itemCur?.img || ''), String(itemCur?.name || 'Coin'), 'cp-summon-coin')}
                <span class="cp-summon-x">× ${esc(String(cfg.itemCost || 1))}</span>
              </div>
            </div>
          </button>
        </div>
        ${disabledText ? `<div class="cp-muted" style="margin-top:8px; text-align:center;">${esc(disabledText)}</div>` : ``}
        ${(cfg.enabledNow && heroDisabled) ? `<div class="cp-muted" style="margin-top:6px; text-align:center;">${esc(heroLabel)} is disabled by Admin.</div>` : ``}
        ${(cfg.enabledNow && monsterDisabled) ? `<div class="cp-muted" style="margin-top:6px; text-align:center;">${esc(monsterLabel)} is disabled by Admin.</div>` : ``}
        ${(cfg.enabledNow && amateurHeroDisabled) ? `<div class="cp-muted" style="margin-top:6px; text-align:center;">${esc(amateurHeroLabel)} is disabled by Admin.</div>` : ``}
        ${(cfg.enabledNow && amateurMonsterDisabled) ? `<div class="cp-muted" style="margin-top:6px; text-align:center;">${esc(amateurMonsterLabel)} is disabled by Admin.</div>` : ``}
        ${(cfg.enabledNow && itemDisabled) ? `<div class="cp-muted" style="margin-top:6px; text-align:center;">${esc(itemLabel)} is disabled by Admin.</div>` : ``}
        <div class="cp-muted" id="cpSummonMsg" style="margin-top:10px; text-align:center;"></div>
      </div>
    `;
  };
  SummonPage.init = () => {
    const msg = document.getElementById('cpSummonMsg');
    const setMsg = (t) => { if (msg) msg.textContent = String(t || ''); };
    const bindBgFallback = (imgEl, fallbacks) => {
      if (!imgEl) return;
      imgEl.onerror = function() {
        const idx = Math.max(0, Math.floor(Number(this.dataset.fallbackIdx) || 0));
        if (!Array.isArray(fallbacks) || idx >= fallbacks.length) { this.onerror = null; return; }
        this.dataset.fallbackIdx = String(idx + 1);
        this.src = String(fallbacks[idx]);
      };
    };
    bindBgFallback(document.getElementById('cpSummonBgHero'), (SUMMON_MEDIA.hero.poster || []).slice(1));
    bindBgFallback(document.getElementById('cpSummonBgMonster'), (SUMMON_MEDIA.monster.poster || []).slice(1));
    bindBgFallback(document.getElementById('cpSummonBgHeroAmateur'), (SUMMON_MEDIA.hero_amateur.poster || []).slice(1));
    bindBgFallback(document.getElementById('cpSummonBgMonsterAmateur'), (SUMMON_MEDIA.monster_amateur.poster || []).slice(1));
    bindBgFallback(document.getElementById('cpSummonBgItem'), (SUMMON_MEDIA.item.poster || []).slice(1));
    document.getElementById('cpSummonSettingBtn')?.addEventListener('click', () => {
      showSummonAdminSettingsModal(() => {
        try { Router.renderCurrent(); } catch {}
      });
    }, { passive: true });

    const runSummon = async (kind) => {
      try {
        setMsg('');
        const summonCfg = getSummonConfigForNow();
        if (!summonCfg.enabledNow) {
          setMsg(summonCfg.expired ? 'Summon is expired.' : 'Summon is disabled by Admin.');
          return;
        }
        if (kind === 'hero' && !summonCfg.heroEnabledNow) {
          setMsg('Hero summon is disabled by Admin.');
          return;
        }
        if (kind === 'monster' && !summonCfg.monsterEnabledNow) {
          setMsg('Monster summon is disabled by Admin.');
          return;
        }
        if (kind === 'hero_amateur' && !summonCfg.amateurHeroEnabledNow) {
          setMsg('Amateur Hero summon is disabled by Admin.');
          return;
        }
        if (kind === 'monster_amateur' && !summonCfg.amateurMonsterEnabledNow) {
          setMsg('Amateur Monster summon is disabled by Admin.');
          return;
        }
        if (kind === 'item' && !summonCfg.itemEnabledNow) {
          setMsg('Summon Item is disabled by Admin.');
          return;
        }
        if (kind === 'hero_amateur') {
          await loadHeroOverrides();
          const pool = getAllHeroes().filter((u) => Math.max(1, Math.min(10, Math.floor(Number(u?.rarity) || 1))) <= 6);
          if (!pool.length) {
            setMsg('No 6★ or lower heroes available.');
            return;
          }
          let slotsSilver = loadStorage();
          const spendSilver = spendFromStorage(slotsSilver, summonCfg.amateurHeroCurrencyId, summonCfg.amateurHeroCost);
          if (!spendSilver.ok) {
            const d = getStorageItemDef(summonCfg.amateurHeroCurrencyId);
            setMsg(`Not enough ${String(d?.name || 'coins')}.`);
            return;
          }
          slotsSilver = spendSilver.slots;
          saveStorage(slotsSilver);
          const pick = weightedPickByRates(pool, summonCfg.amateurHeroRates, {
            starWeights: summonCfg.amateurHeroStarWeights,
            elementWeights: summonCfg.amateurHeroElementWeights,
            equalByStar: true,
          });
          if (!pick) {
            setMsg('No heroes available.');
            return;
          }
          const r = addOwnedHeroId(pick.id) || {};
          setMsg(r.duplicate ? `Summoned duplicate hero: ${pick.name} (EXP +${r.expGained || 0})` : `Summoned hero: ${pick.name}`);
          showHeroModal(pick);
          return;
        }
        if (kind === 'hero') {
          const costDef = getStorageItemDef(summonCfg.heroCurrencyId || 'gold_coin') || getStorageItemDef('gold_coin');
          let slots = loadStorage();
          const spent = spendFromStorage(slots, summonCfg.heroCurrencyId, summonCfg.heroCost);
          if (!spent.ok) {
            setMsg(`Not enough ${String(costDef?.name || 'coins')}.`);
            return;
          }
          slots = spent.slots;
          saveStorage(slots);
          await loadHeroOverrides();
          const pool = getAllHeroes();
          const pick = weightedPickByRates(pool, summonCfg.heroRates, {
            starWeights: summonCfg.heroStarWeights,
            elementWeights: summonCfg.heroElementWeights,
            equalByStar: true,
          });
          if (!pick) {
            setMsg('No heroes available.');
            return;
          }
          const r = addOwnedHeroId(pick.id) || {};
          setMsg(r.duplicate ? `Summoned duplicate hero: ${pick.name} (EXP +${r.expGained || 0})` : `Summoned hero: ${pick.name}`);
          showHeroModal(pick);
          return;
        }
        if (kind === 'monster') {
          const costDef = getStorageItemDef(summonCfg.monsterCurrencyId || 'gold_coin') || getStorageItemDef('gold_coin');
          let slots = loadStorage();
          const spent = spendFromStorage(slots, summonCfg.monsterCurrencyId, summonCfg.monsterCost);
          if (!spent.ok) {
            setMsg(`Not enough ${String(costDef?.name || 'coins')}.`);
            return;
          }
          slots = spent.slots;
          saveStorage(slots);
          await loadMonsterOverrides();
          const pool = getAllMonsters();
          const pick = weightedPickByRates(pool, summonCfg.monsterRates, {
            starWeights: summonCfg.monsterStarWeights,
            elementWeights: summonCfg.monsterElementWeights,
            equalByStar: true,
          });
          if (!pick) {
            setMsg('No monsters available.');
            return;
          }
          const r = addOwnedMonsterId(pick.id) || {};
          setMsg(r.duplicate ? `Summoned duplicate monster: ${pick.name} (EXP +${r.expGained || 0})` : `Summoned monster: ${pick.name}`);
          showMonsterModal(pick);
          return;
        }
        if (kind === 'monster_amateur') {
          const costDef = getStorageItemDef(summonCfg.amateurMonsterCurrencyId || 'silver_coin') || getStorageItemDef('silver_coin');
          let slots = loadStorage();
          const spent = spendFromStorage(slots, summonCfg.amateurMonsterCurrencyId, summonCfg.amateurMonsterCost);
          if (!spent.ok) {
            setMsg(`Not enough ${String(costDef?.name || 'coins')}.`);
            return;
          }
          slots = spent.slots;
          saveStorage(slots);
          await loadMonsterOverrides();
          const pool = getAllMonsters().filter((u) => Math.max(1, Math.min(10, Math.floor(Number(u?.rarity) || 1))) <= 6);
          const pick = weightedPickByRates(pool, summonCfg.amateurMonsterRates, {
            starWeights: summonCfg.amateurMonsterStarWeights,
            elementWeights: summonCfg.amateurMonsterElementWeights,
            equalByStar: true,
          });
          if (!pick) {
            setMsg('No 6★ or lower monsters available.');
            return;
          }
          const r = addOwnedMonsterId(pick.id) || {};
          setMsg(r.duplicate ? `Summoned duplicate monster: ${pick.name} (EXP +${r.expGained || 0})` : `Summoned monster: ${pick.name}`);
          showMonsterModal(pick);
          return;
        }
        if (kind === 'item') {
          const costDef = getStorageItemDef(summonCfg.itemCurrencyId || 'gold_coin') || getStorageItemDef('gold_coin');
          let slots = loadStorage();
          const spent = spendFromStorage(slots, summonCfg.itemCurrencyId, summonCfg.itemCost);
          if (!spent.ok) {
            setMsg(`Not enough ${String(costDef?.name || 'coins')}.`);
            return;
          }
          slots = spent.slots;
          const pool = getSummonableItems();
          const pick = weightedPickByRates(pool, summonCfg.itemRates);
          if (!pick) {
            setMsg('No summon items available.');
            return;
          }
          const before = JSON.stringify(slots);
          slots = addItemToStorage(slots, pick.id, 1);
          if (JSON.stringify(slots) === before) {
            setMsg('Storage is full.');
            return;
          }
          saveStorage(slots);
          setMsg(`Summoned item: ${pick.name}`);
          showSummonItemModal(pick);
          return;
        }
      } catch (e) {
        setMsg(String(e?.message || e || 'Summon failed'));
      }
    };
    document.getElementById('cpSummonHero')?.addEventListener('click', () => { runSummon('hero'); }, { passive: true });
    document.getElementById('cpSummonMonster')?.addEventListener('click', () => { runSummon('monster'); }, { passive: true });
    document.getElementById('cpSummonHeroAmateur')?.addEventListener('click', () => { runSummon('hero_amateur'); }, { passive: true });
    document.getElementById('cpSummonMonsterAmateur')?.addEventListener('click', () => { runSummon('monster_amateur'); }, { passive: true });
    document.getElementById('cpSummonItem')?.addEventListener('click', () => { runSummon('item'); }, { passive: true });
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
              <div class="cp-setting-label">Admit Tuning</div>
              <div class="cp-setting-help">Global combat tuning for all modes.</div>

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
                <label class="cp-setting-help" style="display:block;">
                  Cascade Scale (default 1.00)
                  <input class="cp-select" id="cpSettingCascadeScale" type="number" step="0.05" min="0.2" max="3" value="${esc(String(s.cascadeScale ?? 1.0))}">
                </label>
                <label class="cp-setting-help" style="display:block;">
                  Orb Heal Bonus per consumed orb (default 1% = 0.01)
                  <input class="cp-select" id="cpSettingHeartOrbHealBonusPct" type="number" step="0.005" min="0" max="0.1" value="${esc(String(s.heartOrbHealBonusPct ?? 0.01))}">
                </label>
                <div class="cp-setting-help" style="opacity:0.8;">
                  ATK = hero.atk × elementScore × atkScale<br>
                  Heal = teamRCV × heartScore × rcvScale × (1 + consumedOrbs × heartOrbHealBonusPct)
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
      const cascadeScale = document.getElementById('cpSettingCascadeScale');
      const heartOrbHealBonusPct = document.getElementById('cpSettingHeartOrbHealBonusPct');
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
      cascadeScale?.addEventListener('change', () => applyNum('cascadeScale', cascadeScale.value, 0.2, 3.0), { passive: true });
      heartOrbHealBonusPct?.addEventListener('change', () => applyNum('heartOrbHealBonusPct', heartOrbHealBonusPct.value, 0, 0.1), { passive: true });

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
      '/mode/story/ch2/s1': new StoryBattlePage(2, 1),
      '/mode/story/ch2/s2': new StoryBattlePage(2, 2),
      '/mode/story/ch2/s3': new StoryBattlePage(2, 3),
      '/mode/story/ch2/s4': new StoryBattlePage(2, 4),
      '/mode/story/ch2/s5': new StoryBattlePage(2, 5),
      '/mode/story/ch3/s1': new StoryBattlePage(3, 1),
      '/mode/story/ch3/s2': new StoryBattlePage(3, 2),
      '/mode/story/ch3/s3': new StoryBattlePage(3, 3),
      '/mode/story/ch3/s4': new StoryBattlePage(3, 4),
      '/mode/story/ch3/s5': new StoryBattlePage(3, 5),
      '/mode/story/ch4/s1': new StoryBattlePage(4, 1),
      '/mode/story/ch4/s2': new StoryBattlePage(4, 2),
      '/mode/story/ch4/s3': new StoryBattlePage(4, 3),
      '/mode/story/ch4/s4': new StoryBattlePage(4, 4),
      '/mode/story/ch4/s5': new StoryBattlePage(4, 5),
      '/mode/story/ch5/s1': new StoryBattlePage(5, 1),
      '/mode/story/ch5/s2': new StoryBattlePage(5, 2),
      '/mode/story/ch5/s3': new StoryBattlePage(5, 3),
      '/mode/story/ch5/s4': new StoryBattlePage(5, 4),
      '/mode/story/ch5/s5': new StoryBattlePage(5, 5),
      '/mode/story/ch6/s1': new StoryBattlePage(6, 1),
      '/mode/story/ch6/s2': new StoryBattlePage(6, 2),
      '/mode/story/ch6/s3': new StoryBattlePage(6, 3),
      '/mode/story/ch6/s4': new StoryBattlePage(6, 4),
      '/mode/story/ch6/s5': new StoryBattlePage(6, 5),
      '/mode/story/ch7/s1': new StoryBattlePage(7, 1),
      '/mode/story/ch7/s2': new StoryBattlePage(7, 2),
      '/mode/story/ch7/s3': new StoryBattlePage(7, 3),
      '/mode/story/ch7/s4': new StoryBattlePage(7, 4),
      '/mode/story/ch7/s5': new StoryBattlePage(7, 5),
      '/mode/story/ch8/s1': new StoryBattlePage(8, 1),
      '/mode/story/ch8/s2': new StoryBattlePage(8, 2),
      '/mode/story/ch8/s3': new StoryBattlePage(8, 3),
      '/mode/story/ch8/s4': new StoryBattlePage(8, 4),
      '/mode/story/ch8/s5': new StoryBattlePage(8, 5),
      '/mode/story/ch9/s1': new StoryBattlePage(9, 1),
      '/mode/story/ch9/s2': new StoryBattlePage(9, 2),
      '/mode/story/ch9/s3': new StoryBattlePage(9, 3),
      '/mode/story/ch9/s4': new StoryBattlePage(9, 4),
      '/mode/story/ch9/s5': new StoryBattlePage(9, 5),
      '/mode/story/ch10/s1': new StoryBattlePage(10, 1),
      '/mode/story/ch10/s2': new StoryBattlePage(10, 2),
      '/mode/story/ch10/s3': new StoryBattlePage(10, 3),
      '/mode/story/ch10/s4': new StoryBattlePage(10, 4),
      '/mode/story/ch10/s5': new StoryBattlePage(10, 5),
      '/mode/challenge': ModeChallengePage,
      '/mode/challenge/event': ModeChallengeTimedPage,
      '/mode/challenge/timed': ModeChallengeTimedPage,
      '/mode/challenge/event/gold': EventGoldModePage,
      '/mode/challenge/event/gold/ch1/s1': new EventGoldBattlePage(1, 1),
      '/mode/challenge/event/gold/ch1/s2': new EventGoldBattlePage(1, 2),
      '/mode/challenge/event/gold/ch1/s3': new EventGoldBattlePage(1, 3),
      '/mode/challenge/event/gold/ch1/s4': new EventGoldBattlePage(1, 4),
      '/mode/challenge/event/gold/ch1/s5': new EventGoldBattlePage(1, 5),
      '/mode/challenge/event/gold/ch2/s1': new EventGoldBattlePage(2, 1),
      '/mode/challenge/event/gold/ch2/s2': new EventGoldBattlePage(2, 2),
      '/mode/challenge/event/gold/ch2/s3': new EventGoldBattlePage(2, 3),
      '/mode/challenge/event/gold/ch2/s4': new EventGoldBattlePage(2, 4),
      '/mode/challenge/event/gold/ch2/s5': new EventGoldBattlePage(2, 5),
      '/mode/challenge/event/gold/ch3/s1': new EventGoldBattlePage(3, 1),
      '/mode/challenge/event/gold/ch3/s2': new EventGoldBattlePage(3, 2),
      '/mode/challenge/event/gold/ch3/s3': new EventGoldBattlePage(3, 3),
      '/mode/challenge/event/gold/ch3/s4': new EventGoldBattlePage(3, 4),
      '/mode/challenge/event/gold/ch3/s5': new EventGoldBattlePage(3, 5),
      '/mode/challenge/event/gold/s1': new EventGoldBattlePage(1, 1),
      '/mode/challenge/event/gold/s2': new EventGoldBattlePage(1, 2),
      '/mode/challenge/event/gold/s3': new EventGoldBattlePage(1, 3),
      '/mode/challenge/event/gold/s4': new EventGoldBattlePage(1, 4),
      '/mode/challenge/event/gold/s5': new EventGoldBattlePage(1, 5),
      '/achievement': (window.ChessPalAchievement && window.ChessPalAchievement.AchievementPage) ? window.ChessPalAchievement.AchievementPage : PlaceholderPage('Achievement', 'Coming soon.'),
      '/practice': PracticePage,
      '/test-game': TestGamePage,
      '/team': TeamPage,
      '/pal': PalPage,
      '/heroes': HeroesPage,
      '/monsters': MonstersPage,
      '/enhance': EnhancePage,
      '/storage': StoragePage,
      '/shop': ShopPage,
      '/shop/get-coins': ShopGetCoinsPage,
      '/shop/mall': ShopMallPage,
      '/summon': SummonPage,
      '/settings': SettingsPage,
    }
  };
})();

