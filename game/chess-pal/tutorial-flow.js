(function () {
  'use strict';

  const KEY = 'chessPalOnboarding';
  const VERSION = 'v1';

  function isAdminMode() {
    try {
      const role = new URLSearchParams(window.location.search || '').get('role');
      if (String(role || '').toLowerCase() === 'admin') return true;
    } catch {}
    try {
      return !!window.authUtils?.hasRole?.('admin');
    } catch {}
    return false;
  }

  function defaultState() {
    return {
      version: VERSION,
      step: 'home_story_click',
      completed: false,
      teamSelected: 0,
      seenStageTutorials: {},
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const v = JSON.parse(raw);
      return {
        ...defaultState(),
        ...(v && typeof v === 'object' ? v : {}),
        seenStageTutorials: (v && typeof v?.seenStageTutorials === 'object') ? v.seenStageTutorials : {},
      };
    } catch {
      return defaultState();
    }
  }

  function saveState(next) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  }

  function getState() {
    return loadState();
  }

  function setStep(step) {
    const s = loadState();
    s.step = String(step || s.step || 'home_story_click');
    s.version = VERSION;
    saveState(s);
    return s;
  }

  function complete() {
    const s = loadState();
    s.completed = true;
    s.step = 'completed';
    s.version = VERSION;
    saveState(s);
    clearSpotlight();
    return s;
  }

  function isActive() {
    const s = loadState();
    return !isAdminMode() && !s.completed;
  }

  function markSeenStageTutorial(key) {
    const s = loadState();
    if (!s.seenStageTutorials || typeof s.seenStageTutorials !== 'object') s.seenStageTutorials = {};
    s.seenStageTutorials[String(key || '').trim()] = true;
    saveState(s);
  }

  function hasSeenStageTutorial(key) {
    const s = loadState();
    return !!(s?.seenStageTutorials && s.seenStageTutorials[String(key || '').trim()]);
  }

  function clearSpotlight() {
    try { document.body.classList.remove('cp-tutorial-dim-active'); } catch {}
    try { document.querySelectorAll('.cp-tutorial-focus').forEach((el) => el.classList.remove('cp-tutorial-focus')); } catch {}
  }

  function spotlight(selector) {
    clearSpotlight();
    if (!isActive()) return;
    const el = document.querySelector(selector);
    if (!el) return;
    try { document.body.classList.add('cp-tutorial-dim-active'); } catch {}
    try { el.classList.add('cp-tutorial-focus'); } catch {}
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch {}
  }

  function applyRouteFocus(pathLike) {
    if (!isActive()) {
      clearSpotlight();
      return;
    }
    const path = String(pathLike || '').trim();
    const step = String(getState().step || '');
    if (path === '/home' && step === 'home_story_click') return spotlight('[data-cp-home="story"]');
    if (path === '/mode/story' && step === 'story_ch1_click') return spotlight('[data-cp-chapter="1"]');
    if (path === '/home' && step === 'home_pal_click') return spotlight('[data-cp-home="pal"]');
    if (path === '/pal' && step === 'pal_hero_click') return spotlight('[data-cp-pal="hero"]');
    if (path === '/heroes' && step === 'hero_levelup_click') return spotlight('[data-hero-id]');
    if (path === '/home' && step === 'home_mode_click') return spotlight('.cp-nav-btn[data-route="/mode"]');
    if (path === '/mode' && step === 'mode_story_click') return spotlight('[data-cp-mode="story"]');
    if (path === '/mode/story' && step === 'story_ch2_click') return spotlight('[data-cp-chapter="2"]');
    clearSpotlight();
  }

  function guardHomeTile(key) {
    if (!isActive()) return true;
    const k = String(key || '').trim().toLowerCase();
    const step = String(getState().step || '');
    if (step === 'home_story_click') return k === 'story';
    if (step === 'home_pal_click') return k === 'pal';
    return true;
  }

  function guardModeTile(key) {
    if (!isActive()) return true;
    const k = String(key || '').trim().toLowerCase();
    const step = String(getState().step || '');
    if (step === 'mode_story_click') return k === 'story';
    return true;
  }

  function guardPalTile(key) {
    if (!isActive()) return true;
    const k = String(key || '').trim().toLowerCase();
    const step = String(getState().step || '');
    if (step === 'pal_hero_click') return k === 'hero';
    return true;
  }

  function guardChapterSelection(chapterId) {
    if (!isActive()) return true;
    const ch = Math.max(1, Math.min(10, Math.floor(Number(chapterId) || 1)));
    const step = String(getState().step || '');
    if (step === 'story_ch1_click') return ch === 1;
    if (step === 'story_ch2_click') return ch === 2;
    return true;
  }

  function guardNavRoute(route) {
    if (!isActive()) return true;
    const r = String(route || '').trim();
    const step = String(getState().step || '');
    if (step === 'home_story_click') return r === '/home';
    if (step === 'story_ch1_click' || step === 'story_ch1_team_confirm') return r === '/mode/story';
    if (step === 'ch1_complete_back_home' || step === 'home_pal_click') return r === '/home';
    if (step === 'pal_hero_click') return r === '/pal';
    if (step === 'hero_levelup_click' || step === 'hero_use_exp_pawn' || step === 'hero_modal_close') return r === '/heroes';
    if (step === 'home_mode_click') return r === '/mode';
    if (step === 'mode_story_click') return r === '/mode';
    if (step === 'story_ch2_click' || step === 'story_ch2_team_confirm' || step === 'ch2s1_end_tutorial_modal') return r === '/mode/story';
    return true;
  }

  function onHomeStorySelected() {
    if (!isActive()) return;
    if (String(getState().step || '') === 'home_story_click') setStep('story_ch1_click');
  }

  function onHomePalSelected() {
    if (!isActive()) return;
    if (String(getState().step || '') === 'home_pal_click') setStep('pal_hero_click');
  }

  function onPalHeroSelected() {
    if (!isActive()) return;
    if (String(getState().step || '') === 'pal_hero_click') setStep('hero_levelup_click');
  }

  function onHeroLevelUpClicked() {
    if (!isActive()) return;
    if (String(getState().step || '') === 'hero_levelup_click') setStep('hero_use_exp_pawn');
  }

  function allowLevelUpItem(itemId) {
    if (!isActive()) return true;
    const step = String(getState().step || '');
    if (step !== 'hero_use_exp_pawn') return true;
    return String(itemId || '').trim().toLowerCase() === 'exp_pawn';
  }

  function onExpPawnUsed() {
    if (!isActive()) return;
    if (String(getState().step || '') === 'hero_use_exp_pawn') setStep('hero_modal_close');
  }

  function onHeroModalClosed() {
    if (!isActive()) return;
    if (String(getState().step || '') === 'hero_modal_close') {
      setStep('home_mode_click');
      try { window.Router?.goTo?.('/home'); } catch {}
    }
  }

  function onModeSelected() {
    if (!isActive()) return;
    if (String(getState().step || '') === 'home_mode_click') setStep('mode_story_click');
  }

  function onModeStorySelected() {
    if (!isActive()) return;
    if (String(getState().step || '') === 'mode_story_click') setStep('story_ch2_click');
  }

  function onChapterSelected(chapterId) {
    if (!isActive()) return;
    const ch = Math.max(1, Math.min(10, Math.floor(Number(chapterId) || 1)));
    const step = String(getState().step || '');
    if (step === 'story_ch1_click' && ch === 1) setStep('story_ch1_team_confirm');
    if (step === 'story_ch2_click' && ch === 2) setStep('story_ch2_team_confirm');
  }

  function onTeamConfirmed(chapterId) {
    if (!isActive()) return;
    const ch = Math.max(1, Math.min(10, Math.floor(Number(chapterId) || 1)));
    const step = String(getState().step || '');
    if (step === 'story_ch1_team_confirm' && ch === 1) setStep('ch1s1_tutorial_modal');
    if (step === 'story_ch2_team_confirm' && ch === 2) setStep('ch2s1_end_tutorial_modal');
  }

  function onChapterClearShown(chapterId) {
    if (!isActive()) return;
    const ch = Math.max(1, Math.min(10, Math.floor(Number(chapterId) || 1)));
    if (ch !== 1) return;
    const step = String(getState().step || '');
    if (step === 'ch1s5_tutorial_modal') setStep('ch1_complete_back_home');
  }

  function onChapterClearBack(chapterId) {
    if (!isActive()) return;
    const ch = Math.max(1, Math.min(10, Math.floor(Number(chapterId) || 1)));
    if (ch !== 1) return;
    const step = String(getState().step || '');
    if (step === 'ch1_complete_back_home' || step === 'ch1s5_tutorial_modal') setStep('home_pal_click');
  }

  function getStageTutorialKey(chapterId, stageId) {
    const ch = Math.max(1, Math.min(10, Math.floor(Number(chapterId) || 1)));
    const st = Math.max(1, Math.min(5, Math.floor(Number(stageId) || 1)));
    if (ch === 1) return `ch1s${st}`;
    if (ch === 2 && st === 1) return 'ch2s1_end';
    return '';
  }

  function expectedStepForStageKey(stageKey) {
    if (stageKey === 'ch1s1') return 'ch1s1_tutorial_modal';
    if (stageKey === 'ch1s2') return 'ch1s2_tutorial_modal';
    if (stageKey === 'ch1s3') return 'ch1s3_tutorial_modal';
    if (stageKey === 'ch1s4') return 'ch1s4_tutorial_modal';
    if (stageKey === 'ch1s5') return 'ch1s5_tutorial_modal';
    if (stageKey === 'ch2s1_end') return 'ch2s1_end_tutorial_modal';
    return '';
  }

  function nextStepAfterStageKey(stageKey) {
    if (stageKey === 'ch1s1') return 'ch1s2_tutorial_modal';
    if (stageKey === 'ch1s2') return 'ch1s3_tutorial_modal';
    if (stageKey === 'ch1s3') return 'ch1s4_tutorial_modal';
    if (stageKey === 'ch1s4') return 'ch1s5_tutorial_modal';
    if (stageKey === 'ch2s1_end') return 'completed';
    return '';
  }

  function showPagedTutorialModal(stageKey, onDone) {
    const contentMap = (window.ChessPalTutorialContent && typeof window.ChessPalTutorialContent === 'object') ? window.ChessPalTutorialContent : {};
    const pages = Array.isArray(contentMap[stageKey]) ? contentMap[stageKey] : [];
    if (!pages.length) {
      if (typeof onDone === 'function') onDone();
      return;
    }

    const old = document.getElementById('cpForcedTutorialOverlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'cpForcedTutorialOverlay';
    overlay.className = 'cp-modal-overlay cp-tutorial-modal';
    overlay.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Tutorial">
        <div class="cp-modal-body">
          <div class="cp-h1" id="cpTutorialTitle" style="font-size:20px; text-align:center;"></div>
          <div class="cp-setting-help" id="cpTutorialStep" style="text-align:center; margin-top:8px;"></div>
          <div class="cp-tutorial-figure" style="margin-top:12px;">
            <img id="cpTutorialImage" alt="Tutorial slide" style="width:100%; max-height:260px; object-fit:contain; border-radius:12px; border:1px solid rgba(255,255,255,0.12); background:rgba(0,0,0,0.22);">
          </div>
          <div class="cp-setting-help" id="cpTutorialText" style="margin-top:10px; text-align:center;"></div>
          <div class="cp-row" style="justify-content:center; gap:10px; margin-top:14px;">
            <button class="cp-tool-btn" type="button" id="cpTutorialPrev">Back</button>
            <button class="cp-primary" type="button" id="cpTutorialNext">Next</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    let idx = 0;
    const titleEl = overlay.querySelector('#cpTutorialTitle');
    const stepEl = overlay.querySelector('#cpTutorialStep');
    const imgEl = overlay.querySelector('#cpTutorialImage');
    const txtEl = overlay.querySelector('#cpTutorialText');
    const prevBtn = overlay.querySelector('#cpTutorialPrev');
    const nextBtn = overlay.querySelector('#cpTutorialNext');

    const render = () => {
      const item = pages[Math.max(0, Math.min(pages.length - 1, idx))] || {};
      if (titleEl) titleEl.textContent = String(item.title || 'Tutorial');
      if (stepEl) stepEl.textContent = `Page ${idx + 1} / ${pages.length}`;
      if (imgEl) {
        const src = String(item.image || '').trim();
        if (src) imgEl.src = src;
        else imgEl.removeAttribute('src');
      }
      if (txtEl) txtEl.textContent = String(item.text || '');
      if (prevBtn) prevBtn.disabled = idx <= 0;
      if (nextBtn) nextBtn.textContent = idx >= pages.length - 1 ? 'Start' : 'Next';
    };
    prevBtn?.addEventListener('click', () => {
      idx = Math.max(0, idx - 1);
      render();
    }, { passive: true });
    nextBtn?.addEventListener('click', () => {
      if (idx < pages.length - 1) {
        idx += 1;
        render();
        return;
      }
      try { overlay.remove(); } catch {}
      if (typeof onDone === 'function') onDone();
    }, { passive: true });
    render();
  }

  function maybeShowStageTutorial(chapterId, stageId, onDone) {
    if (!isActive()) return false;
    const key = getStageTutorialKey(chapterId, stageId);
    if (!key) return false;
    if (hasSeenStageTutorial(key)) return false;
    const expected = expectedStepForStageKey(key);
    const step = String(getState().step || '');
    if (expected && step && step !== expected) return false;
    showPagedTutorialModal(key, () => {
      markSeenStageTutorial(key);
      const next = nextStepAfterStageKey(key);
      if (next === 'completed') complete();
      else if (next) setStep(next);
      if (typeof onDone === 'function') onDone();
    });
    return true;
  }

  window.ChessPalTutorialFlow = {
    KEY,
    VERSION,
    getState,
    setStep,
    isActive,
    complete,
    applyRouteFocus,
    clearSpotlight,
    spotlight,
    guardHomeTile,
    guardModeTile,
    guardPalTile,
    guardChapterSelection,
    guardNavRoute,
    onHomeStorySelected,
    onHomePalSelected,
    onPalHeroSelected,
    onHeroLevelUpClicked,
    allowLevelUpItem,
    onExpPawnUsed,
    onHeroModalClosed,
    onModeSelected,
    onModeStorySelected,
    onChapterSelected,
    onTeamConfirmed,
    onChapterClearShown,
    onChapterClearBack,
    maybeShowStageTutorial,
  };
})();
