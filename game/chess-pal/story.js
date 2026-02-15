// Story Mode helpers (progression, unlock rules, per-stage overrides)
// Kept in a separate file so Story Mode can grow without bloating pages.js.

(function () {
  const STORY_PROGRESS_KEY = 'chessPalStoryProgress';

  function clampInt(n, min, max) {
    const x = Math.floor(Number(n) || 0);
    return Math.max(min, Math.min(max, x));
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORY_PROGRESS_KEY);
      if (!raw) return {};
      const v = JSON.parse(raw);
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch {
      return {};
    }
  }

  function saveProgress(p) {
    try { localStorage.setItem(STORY_PROGRESS_KEY, JSON.stringify(p || {})); } catch {}
    try { window.dispatchEvent(new Event('cpStoryProgressChanged')); } catch {}
  }

  function getClearedStage(chapterId) {
    const ch = String(clampInt(chapterId, 1, 10));
    const p = loadProgress();
    const cleared = clampInt(p?.[ch]?.clearedStage, 0, 5);
    return cleared;
  }

  function markStageCleared(chapterId, stageIdx1) {
    const ch = String(clampInt(chapterId, 1, 10));
    const st = clampInt(stageIdx1, 1, 5);
    const p = loadProgress();
    const cur = clampInt(p?.[ch]?.clearedStage, 0, 5);
    const next = Math.max(cur, st);
    p[ch] = { ...(p[ch] && typeof p[ch] === 'object' ? p[ch] : {}), clearedStage: next };
    saveProgress(p);
    return next;
  }

  function isStageUnlocked(chapterId, stageIdx1) {
    const cleared = getClearedStage(chapterId);
    const st = clampInt(stageIdx1, 1, 5);
    return st <= (cleared + 1);
  }

  // Per-stage board element overrides (when you want fixed pools)
  function getFixedElementPool(chapterId, stageIdx1) {
    const ch = clampInt(chapterId, 1, 10);
    const st = clampInt(stageIdx1, 1, 5);
    // Chapter 1 Stage 1: only Dark, Wood, Water
    if (ch === 1 && st === 1) return ['dark', 'wood', 'water'];
    return null;
  }

  window.ChessPalStory = {
    getClearedStage,
    markStageCleared,
    isStageUnlocked,
    getFixedElementPool,
  };
})();

