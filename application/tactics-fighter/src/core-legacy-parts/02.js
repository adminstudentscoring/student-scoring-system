      method: 'DELETE'
    });
    return await tfJson(resp);
  }

  async function builderCreateSubtopic(topicId, name) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/topics/${encodeURIComponent(topicId)}/subtopics`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    return await tfJson(resp);
  }

  async function builderRenameSubtopic(subtopicId, name) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name })
    });
    return await tfJson(resp);
  }

  async function builderUpdateSubtopicMessage(subtopicId, message) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ message: String(message ?? '') })
    });
    return await tfJson(resp);
  }

  async function builderDeleteSubtopic(subtopicId) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}`, {
      method: 'DELETE'
    });
    return await tfJson(resp);
  }

  async function builderFetchPuzzles(subtopicId) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}/puzzles`, {
      method: 'GET'
    });
    return await tfJson(resp);
  }

  function renderShell({ role, players, mode }) {
    const playerName = players?.[0]?.name || 'Student';
    const playerId = players?.[0]?.studentId || '';
    const isTeacher = String(role || '').toLowerCase() === 'teacher';

    return `
      <div class="tf-app">
        <div id="tfToast" class="tf-toast" role="status" aria-live="polite" style="display:none;"></div>
        <aside class="tf-sidebar" aria-label="Tactics Fighter sidebar">
          <div class="tf-side-title">⚔️ Tactics Fighter</div>
          <div class="tf-side-sub">${escapeHtml(playerName)}${playerId ? ` (${escapeHtml(playerId)})` : ''}</div>
          <div class="tf-side-sub" style="margin-top:-6px; opacity:0.9;">${escapeHtml(role || '')}</div>

          <div class="tf-nav" role="navigation" aria-label="Modes">
            ${!isTeacher ? `<button type="button" class="tf-nav-btn ${mode === 'home' ? 'is-active' : ''}" data-mode="home">Home</button>` : ''}
            <button type="button" class="tf-nav-btn ${mode === 'practice' ? 'is-active' : ''}" data-mode="practice">Practice</button>
            <button type="button" class="tf-nav-btn ${mode === 'challenge' ? 'is-active' : ''}" data-mode="challenge">Challenge</button>
            ${isTeacher ? `<button type="button" class="tf-nav-btn ${mode === 'builder' ? 'is-active' : ''}" data-mode="builder">Builder</button>` : ''}
            <button type="button" class="tf-nav-btn ${mode === 'settings' ? 'is-active' : ''}" data-mode="settings">Setting</button>
          </div>
        </aside>

        <main class="tf-main">
          <div class="tf-container">
            <div class="tf-card tf-root-card">
              <div class="tf-title">${mode === 'home' ? 'Home' : mode === 'practice' ? 'Practice Mode' : mode === 'challenge' ? 'Challenge Mode' : mode === 'builder' ? 'Builder' : 'Setting'}</div>
              <div class="tf-muted">Tactics Fighter</div>
              <div id="tfMain" style="margin-top:12px;"></div>
            </div>
          </div>
        </main>
      </div>
    `;
  }

  function renderHome(stats) {
    const done = Number(stats?.completedCount || 0);
    return `
      <div>
        <div class="tf-section-title">Home</div>
        <div class="tf-muted">Your progress</div>
        <div style="margin-top:12px; border:1px solid #e5e7eb; border-radius:14px; padding:14px; background:#f8fafc;">
          <div style="font-weight:950; color:#111827;">Completed puzzles</div>
          <div style="font-size:32px; font-weight:950; color:#16a34a; margin-top:6px;">${done}</div>
        </div>
      </div>
    `;
  }

  function renderPractice() {
    const levels = [
      { key: 'beginner', label: 'Beginner' },
      { key: '400up', label: '400 up' },
      { key: '700up', label: '700 up' },
      { key: '1000up', label: '1000 up' },
      { key: '1500up', label: '1500 up' },
      { key: '2000up', label: '2000 up' },
      { key: '2500up', label: '2500 up' },
      { key: '2800up', label: '2800 up' }
    ];

    return `
      <div>
        <div id="tfPracticeBuckets" class="tf-practice-grid">
          ${levels.map(l => `<button class="btn btn-primary tf-practice-btn" type="button" data-practice="${escapeHtml(l.key)}">${escapeHtml(l.label)}</button>`).join('')}
        </div>
        <div id="tfOutput" style="margin-top:12px; color:#111827;"></div>
      </div>
    `;
  }

  function renderChallenge() {
    return `
      <div>
        <div class="tf-section-title">Challenge Mode</div>
        <div class="tf-muted" style="margin-bottom:10px;">Choose a mode.</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <button type="button" class="tf-puzzle-card" data-chal-mode="ghost">
            <div class="tf-puzzle-title">Dancing with your Ghost</div>
            <div class="tf-puzzle-meta">Replay puzzles you have answered incorrectly before.</div>
          </button>
          <button type="button" class="tf-puzzle-card" data-chal-mode="random" disabled style="opacity:0.55; cursor:not-allowed;">
            <div class="tf-puzzle-title">Random</div>
            <div class="tf-puzzle-meta">Coming soon.</div>
          </button>
        </div>
        <div id="tfChallengePanel" style="margin-top:12px;"></div>
      </div>
    `;
  }

  function renderSettings() {
    return `
      <div>
        <div class="tf-section-title">Setting</div>
        <div class="tf-muted" style="margin-bottom:10px;">Engine settings (Stockfish)</div>
        <div style="border:1px solid #e5e7eb; border-radius:14px; padding:12px; background:#ffffff;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div>
              <div style="font-weight:950; color:#111827;">Stockfish Depth Cap</div>
              <div class="tf-muted" style="margin-top:4px;">Limits the maximum depth used by Practice and Builder.</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <input id="tfSettingDepthCap" class="tf-input" type="number" min="4" max="22" step="1" style="width:120px;" />
              <button id="tfSettingSaveBtn" class="btn btn-primary" type="button">Save</button>
            </div>
          </div>
          <div id="tfSettingHint" class="tf-muted" style="margin-top:10px;"></div>
        </div>
      </div>
    `;
  }

  function renderBuilder() {
    return `
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div class="tf-section-title">Builder</div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <label class="tf-muted" for="tfBuilderBucketSelect" style="font-weight:900;">Bucket</label>
            <select id="tfBuilderBucketSelect" class="tf-select" style="min-width:180px;">
              <option value="beginner">Beginner</option>
              <option value="400up">400 up</option>
              <option value="700up">700 up</option>
              <option value="1000up">1000 up</option>
              <option value="1500up">1500 up</option>
              <option value="2000up">2000 up</option>
              <option value="2500up">2500 up</option>
              <option value="2800up">2800 up</option>
            </select>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <button id="tfBuilderCreateCategoryBtn" class="btn btn-primary" type="button">Create</button>
            <button id="tfBuilderRefreshBtn" class="btn btn-secondary" type="button">Refresh</button>
          </div>
        </div>
        <div class="tf-muted" style="margin-bottom:10px;">Manage Category → Topic → Subtopic → Puzzles</div>
        <div id="tfBuilderMsg" class="tf-builder-msg" style="display:none;"></div>
        <div id="tfBuilderTree"></div>
      </div>
    `;
  }

  function renderMode(mode) {
    if (mode === 'home') return renderHome(null);
    if (mode === 'challenge') return renderChallenge();
    if (mode === 'builder') return renderBuilder();
    if (mode === 'settings') return renderSettings();
    return renderPractice();
  }

  // Export core helpers so other tactics-fighter files can stay small and maintainable.
  // NOTE: Each JS file must be independently parseable; we cannot split a single IIFE across files.
  window.__TacticsFighterCore = {
    // general
    escapeHtml,
    getUrlMode,
    setUrlMode,
    normalizeMode,
    fetchConfig,
    apiRequest,
    getPublicStudentPassword,
    getPublicStudentId,
    normalizeBucketKey,
    tfJson,

    // board utils
    rcToCoord,
    pieceImageSrc,
    parseFenToBoard,
    boardToFenPlacement,
    buildFenFromBoard,
    fenSideToMove,
    cloneBoard,
    coordToRc,
    displayToBoardRc,
    applyUciToBoard,
    undoOnePly,
    uciToPseudoSan,

    // student APIs
    studentFetchTree,
    studentFetchSubtopicPuzzles,
    studentFetchStats,
    studentFetchGhostPuzzles,
    studentPostAttempt,
    studentEngineAnalyze,
    studentApplyMove,
    teacherApplyMove,

    // builder APIs
    builderFetchPuzzles,
    builderCreatePuzzle,
    engineAnalyze,
    builderDeletePuzzle,
    builderUpdatePuzzle,
    builderFetchTree,
    builderCreateCategory,
    builderRenameCategory,
    builderMoveCategory,
    builderDeleteCategory,
    builderCreateTopic,
    builderRenameTopic,
    builderDeleteTopic,
    builderCreateSubtopic,
    builderRenameSubtopic,
    builderUpdateSubtopicMessage,
    builderDeleteSubtopic,

    // renderers
    renderShell,
    renderHome,
    renderPractice,
    renderChallenge,
    renderSettings,
    renderBuilder,
    renderMode
  };

})();
