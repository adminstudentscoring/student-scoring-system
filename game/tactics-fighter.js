// Tactics Fighter (Running Queen-like fixed sidebar scaffold)
// UI text is English by design.

(function () {
  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function getUrlMode() {
    try {
      const params = new URLSearchParams(window.location.search);
      const m = String(params.get('mode') || '').trim();
      if (m) return m;
    } catch {}
    // fallback: hash
    const h = String(window.location.hash || '').replace('#', '').trim();
    return h || 'practice';
  }

  function setUrlMode(mode) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('mode', String(mode));
      window.history.replaceState(null, '', url.toString());
      return;
    } catch {}
    try {
      window.location.hash = String(mode);
    } catch {}
  }

  function normalizeMode(mode) {
    const m = String(mode || '').toLowerCase().trim();
    if (m === 'practice') return 'practice';
    if (m === 'challenge') return 'challenge';
    if (m === 'builder') return 'builder';
    if (m === 'setting' || m === 'settings') return 'settings';
    return 'practice';
  }

  async function fetchConfig() {
    const resp = await fetch('/api/tactics-fighter/config', { method: 'GET' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Failed to load config');
    return data;
  }

  function apiRequest(path, options = {}) {
    // Teacher endpoints require Bearer auth; student endpoints generally don't.
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const token = localStorage.getItem('authToken');
    if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
    return fetch(path, { ...options, headers });
  }

  async function tfJson(resp) {
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const base = String(data?.error || `Request failed (${resp.status})`);
      const details = data && Object.prototype.hasOwnProperty.call(data, 'details') ? String(data.details || '').trim() : '';
      const suffix = details ? ` · ${details}` : '';
      throw new Error(`${base} [${resp.status}]${suffix}`);
    }
    return data;
  }

  const PIECE_UNICODE = {
    P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔',
    p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚'
  };

  const FILES = 'abcdefgh';
  function rcToCoord(r, c) { return `${FILES[c]}${8 - r}`; }

  function pieceImageSrc(p) {
    const s = String(p || '');
    if (!s) return '';
    const isWhite = s === s.toUpperCase();
    const t = s.toLowerCase();
    const name =
      t === 'p' ? 'Pawn' :
      t === 'n' ? 'Knight' :
      t === 'b' ? 'Bishop' :
      t === 'r' ? 'Rook' :
      t === 'q' ? 'Queen' :
      t === 'k' ? 'King' : '';
    if (!name) return '';
    const color = isWhite ? 'white' : 'black';
    return `/game/pieces/${color}_${name}.png`;
  }

  function parseFenToBoard(fen) {
    const parts = String(fen || '').trim().split(/\s+/);
    const placement = String(parts[0] || '').trim();
    const ranks = placement.split('/');
    if (ranks.length !== 8) return null;
    const board = Array.from({ length: 8 }, () => Array(8).fill(''));
    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const ch of ranks[r]) {
        if (c > 7) return null;
        if (/\d/.test(ch)) c += Number(ch);
        else if (/[prnbqkPRNBQK]/.test(ch)) { board[r][c] = ch; c++; }
        else return null;
      }
      if (c !== 8) return null;
    }
    return board;
  }

  function boardToFenPlacement(board) {
    const ranks = [];
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      let out = '';
      for (let c = 0; c < 8; c++) {
        const p = board[r][c] || '';
        if (!p) empty++;
        else {
          if (empty) { out += String(empty); empty = 0; }
          out += p;
        }
      }
      if (empty) out += String(empty);
      ranks.push(out || '8');
    }
    return ranks.join('/');
  }

  function buildFenFromBoard(board, side) {
    const placement = boardToFenPlacement(board);
    const stm = (String(side) === 'b') ? 'b' : 'w';
    return `${placement} ${stm} - - 0 1`;
  }

  async function builderFetchPuzzles(subtopicId) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}/puzzles`, {
      method: 'GET'
    });
    return await tfJson(resp);
  }

  async function builderCreatePuzzle(subtopicId, payload) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}/puzzles`, {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });
    return await tfJson(resp);
  }

  async function engineAnalyze(payload) {
    const resp = await apiRequest('/api/teachers/tactics-fighter/engine/analyze', {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });
    return await tfJson(resp);
  }

  async function builderFetchTree() {
    const resp = await apiRequest('/api/teachers/tactics-fighter/builder/tree', { method: 'GET' });
    return await tfJson(resp);
  }

  async function builderCreateCategory(name) {
    const resp = await apiRequest('/api/teachers/tactics-fighter/builder/categories', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    return await tfJson(resp);
  }

  async function builderRenameCategory(categoryId, name) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/categories/${encodeURIComponent(categoryId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name })
    });
    return await tfJson(resp);
  }

  async function builderDeleteCategory(categoryId) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/categories/${encodeURIComponent(categoryId)}`, {
      method: 'DELETE'
    });
    return await tfJson(resp);
  }

  async function builderCreateTopic(categoryId, name) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/categories/${encodeURIComponent(categoryId)}/topics`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    return await tfJson(resp);
  }

  async function builderRenameTopic(topicId, name) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/topics/${encodeURIComponent(topicId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name })
    });
    return await tfJson(resp);
  }

  async function builderDeleteTopic(topicId) {
    const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/topics/${encodeURIComponent(topicId)}`, {
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
        <aside class="tf-sidebar" aria-label="Tactics Fighter sidebar">
          <div class="tf-side-title">⚔️ Tactics Fighter</div>
          <div class="tf-side-sub">${escapeHtml(playerName)}${playerId ? ` (${escapeHtml(playerId)})` : ''}</div>
          <div class="tf-side-sub" style="margin-top:-6px; opacity:0.9;">${escapeHtml(role || '')}</div>

          <div class="tf-nav" role="navigation" aria-label="Modes">
            <button type="button" class="tf-nav-btn ${mode === 'practice' ? 'is-active' : ''}" data-mode="practice">Practice</button>
            <button type="button" class="tf-nav-btn ${mode === 'challenge' ? 'is-active' : ''}" data-mode="challenge">Challenge</button>
            ${isTeacher ? `<button type="button" class="tf-nav-btn ${mode === 'builder' ? 'is-active' : ''}" data-mode="builder">Builder</button>` : ''}
            <button type="button" class="tf-nav-btn ${mode === 'settings' ? 'is-active' : ''}" data-mode="settings">Setting</button>
          </div>
        </aside>

        <main class="tf-main">
          <div class="tf-container">
            <div class="tf-card tf-root-card">
              <div class="tf-title">${mode === 'practice' ? 'Practice Mode' : mode === 'challenge' ? 'Challenge Mode' : mode === 'builder' ? 'Builder' : 'Setting'}</div>
              <div class="tf-muted">Tactics Fighter</div>
              <div id="tfMain" style="margin-top:12px;"></div>
            </div>
          </div>
        </main>
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
        <div class="tf-practice-grid">
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
        <div style="color:#6b7280;">Coming soon.</div>
      </div>
    `;
  }

  function renderSettings() {
    return `
      <div>
        <div class="tf-section-title">Setting</div>
        <div style="color:#6b7280;">Coming soon.</div>
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
    if (mode === 'challenge') return renderChallenge();
    if (mode === 'builder') return renderBuilder();
    if (mode === 'settings') return renderSettings();
    return renderPractice();
  }

  window.initTacticsFighter = async function initTacticsFighter() {
    const root = document.getElementById('tacticsFighterRoot');
    if (!root) return;

    const players = Array.isArray(window.tacticsFighterPlayers) ? window.tacticsFighterPlayers : [];
    const role = new URLSearchParams(window.location.search).get('role') || '';
    const mode = normalizeMode(getUrlMode());

    root.innerHTML = renderShell({ role, players, mode });

    const main = document.getElementById('tfMain');
    const setMain = (html) => { if (main) main.innerHTML = html; };
    const setOut = (html) => {
      const out = document.getElementById('tfOutput');
      if (out) out.innerHTML = html;
    };

    const loadConfigOnce = async () => {
      try {
        const cfg = await fetchConfig();
        return cfg;
      } catch {
        return null;
      }
    };
    const cfg = await loadConfigOnce();

    const ui = {
      builderTree: null,
      builderMsg: null,
      builderLoadedOnce: false,
      expanded: {
        cat: new Set(),
        topic: new Set(),
        subtopic: new Set(),
        puzzlesLoaded: new Set()
      },
      puzzlesBySubtopic: new Map()
    };

    function showBuilderMsg(type, text) {
      const el = document.getElementById('tfBuilderMsg');
      if (!el) return;
      el.style.display = 'block';
      el.classList.remove('ok', 'err');
      if (type === 'ok') el.classList.add('ok');
      if (type === 'err') el.classList.add('err');
      el.textContent = String(text || '');
    }

    function clearBuilderMsg() {
      const el = document.getElementById('tfBuilderMsg');
      if (!el) return;
      el.style.display = 'none';
      el.textContent = '';
      el.classList.remove('ok', 'err');
    }

    function renderMiniBoardHtml(fen) {
      const b = parseFenToBoard(fen);
      if (!b) return `<div class="tf-mini-board" aria-label="Mini board"></div>`;
      const sqs = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const isDark = (r + c) % 2 === 1;
          const p = b[r][c] || '';
          const src = p ? pieceImageSrc(p) : '';
          const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
          sqs.push(`<div class="tf-mini-sq ${isDark ? 'dark' : 'light'}">${img}</div>`);
        }
      }
      return `<div class="tf-mini-board" aria-label="Mini board">${sqs.join('')}</div>`;
    }

    function renderBuilderTree(categories) {
      const host = document.getElementById('tfBuilderTree');
      if (!host) return;

      const cats = Array.isArray(categories) ? categories : [];
      if (!cats.length) {
        host.innerHTML = `<div class="tf-muted">No categories yet. Click <strong>Create</strong> to add one.</div>`;
        return;
      }

      host.innerHTML = cats.map((c) => {
        const catId = String(c.id);
        const catOpen = ui.expanded.cat.has(catId);
        const topics = Array.isArray(c.topics) ? c.topics : [];
        return `
          <div class="tf-tree-card">
            <div class="tf-tree-row">
              <button type="button" class="tf-plus ${catOpen ? 'is-open' : ''}" data-tf-toggle="cat" data-id="${escapeHtml(catId)}" aria-label="Toggle category">${catOpen ? '−' : '+'}</button>
              <div class="tf-tree-title">${escapeHtml(String(c.name || ''))}</div>
              <div class="tf-tree-actions">
                <button type="button" class="btn btn-secondary btn-small" data-tf-add-topic="${escapeHtml(catId)}">+ Topic</button>
                <button type="button" class="btn btn-secondary btn-small" data-tf-rename-cat="${escapeHtml(catId)}">Rename</button>
                <button type="button" class="btn btn-danger btn-small" data-tf-del-cat="${escapeHtml(catId)}">Delete</button>
              </div>
            </div>
            ${catOpen ? `
              <div class="tf-tree-children">
                ${topics.length ? topics.map((t) => {
                  const tid = String(t.id);
                  const tOpen = ui.expanded.topic.has(tid);
                  const subs = Array.isArray(t.subtopics) ? t.subtopics : [];
                  return `
                    <div class="tf-tree-card tf-tree-card--nested">
                      <div class="tf-tree-row">
                        <button type="button" class="tf-plus ${tOpen ? 'is-open' : ''}" data-tf-toggle="topic" data-id="${escapeHtml(tid)}" aria-label="Toggle topic">${tOpen ? '−' : '+'}</button>
                        <div class="tf-tree-title">${escapeHtml(String(t.name || ''))}</div>
                        <div class="tf-tree-actions">
                          <button type="button" class="btn btn-secondary btn-small" data-tf-add-subtopic="${escapeHtml(tid)}">+ Subtopic</button>
                          <button type="button" class="btn btn-secondary btn-small" data-tf-rename-topic="${escapeHtml(tid)}">Rename</button>
                          <button type="button" class="btn btn-danger btn-small" data-tf-del-topic="${escapeHtml(tid)}">Delete</button>
                        </div>
                      </div>
                      ${tOpen ? `
                        <div class="tf-tree-children">
                          ${subs.length ? subs.map((s) => {
                            const sid = String(s.id);
                            const sOpen = ui.expanded.subtopic.has(sid);
                            const puzzlesLoaded = ui.expanded.puzzlesLoaded.has(sid);
                            const puzzles = ui.puzzlesBySubtopic.get(sid) || [];
                            return `
                              <div class="tf-tree-card tf-tree-card--nested2">
                                <div class="tf-tree-row">
                                  <button type="button" class="tf-plus ${sOpen ? 'is-open' : ''}" data-tf-toggle="subtopic" data-id="${escapeHtml(sid)}" aria-label="Toggle subtopic">${sOpen ? '−' : '+'}</button>
                                  <div class="tf-tree-title">${escapeHtml(String(s.name || ''))}</div>
                                  <div class="tf-tree-actions">
                                    <button type="button" class="btn btn-primary btn-small" data-tf-add-puzzle="${escapeHtml(sid)}">Add puzzles</button>
                                    <button type="button" class="btn btn-secondary btn-small" data-tf-load-puzzles="${escapeHtml(sid)}">${puzzlesLoaded ? 'Reload' : 'Load'} puzzles</button>
                                    <button type="button" class="btn btn-secondary btn-small" data-tf-rename-subtopic="${escapeHtml(sid)}">Rename</button>
                                    <button type="button" class="btn btn-danger btn-small" data-tf-del-subtopic="${escapeHtml(sid)}">Delete</button>
                                  </div>
                                </div>
                                ${sOpen ? `
                                  <div class="tf-tree-children">
                                    <div class="tf-muted">Puzzles: ${escapeHtml(String(puzzles.length))}</div>
                                    <div class="tf-puzzle-list">
                                      ${puzzles.length ? puzzles.map(p => `
                                        <div class="tf-tree-card tf-tree-card--nested2" style="display:flex; gap:12px; align-items:center; padding:10px;">
                                          ${renderMiniBoardHtml(String(p.fen || ''))}
                                          <div style="min-width:0;">
                                            <div class="tf-tree-title" style="font-size:13px;">Puzzle #${escapeHtml(String(p.id || ''))}</div>
                                            <div class="tf-puzzle-item" style="margin-top:6px;">${escapeHtml(String(p.fen || ''))}</div>
                                          </div>
                                        </div>
                                      `).join('') : `<div class="tf-muted">No puzzles loaded.</div>`}
                                    </div>
                                  </div>
                                ` : ''}
                              </div>
                            `;
                          }).join('') : `<div class="tf-muted">No subtopics.</div>`}
                        </div>
                      ` : ''}
                    </div>
                  `;
                }).join('') : `<div class="tf-muted">No topics.</div>`}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }

    function getBuilderBucket() {
      try {
        const v = String(localStorage.getItem('tacticsFighterBuilderBucket') || '').trim();
        return v || 'beginner';
      } catch {}
      return 'beginner';
    }

    function setBuilderBucket(bucket) {
      try { localStorage.setItem('tacticsFighterBuilderBucket', String(bucket || 'beginner')); } catch {}
    }

    async function builderRefresh() {
      clearBuilderMsg();
      showBuilderMsg('ok', 'Loading...');
      try {
        const bucket = getBuilderBucket();
        const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/tree?bucket=${encodeURIComponent(bucket)}`, { method: 'GET' });
        const data = await tfJson(resp);
        renderBuilderTree(data.categories || []);
        clearBuilderMsg();
        ui.builderLoadedOnce = true;
      } catch (e) {
        showBuilderMsg('err', e?.message || String(e));
      }
    }

    async function promptText(title, placeholder) {
      const v = prompt(String(title || ''), String(placeholder || ''));
      if (v == null) return null;
      return String(v).trim();
    }

    const activateMode = (m) => {
      const nm = normalizeMode(m);
      setUrlMode(nm);
      root.querySelectorAll('.tf-nav-btn').forEach((b) => {
        const bm = String(b.getAttribute('data-mode') || '');
        b.classList.toggle('is-active', bm === nm);
      });
      setMain(renderMode(nm));
      // Keep the card title in sync when switching modes (avoid showing "Practice Mode" while on Builder).
      try {
        const titleEl = root.querySelector('.tf-title');
        if (titleEl) titleEl.textContent = (nm === 'practice' ? 'Practice Mode' : nm === 'challenge' ? 'Challenge Mode' : nm === 'builder' ? 'Builder' : 'Setting');
      } catch {}
      if (cfg) {
        setOut(`<div style="color:#16a34a; font-weight:800;">API OK</div><div style="color:#6b7280; margin-top:4px;">${escapeHtml(cfg.version || '')}</div>`);
      } else {
        setOut(`<div style="color:#6b7280;">API not ready (ok for now).</div>`);
      }

      // Builder wire-up (teacher only)
      if (nm === 'builder') {
        const createBtn = document.getElementById('tfBuilderCreateCategoryBtn');
        const refreshBtn = document.getElementById('tfBuilderRefreshBtn');
        const bucketSel = document.getElementById('tfBuilderBucketSelect');
        if (bucketSel) {
          bucketSel.value = getBuilderBucket();
          bucketSel.addEventListener('change', () => {
            setBuilderBucket(bucketSel.value);
            builderRefresh();
          });
        }
        createBtn?.addEventListener('click', async () => {
          const name = await promptText('Create category (unique)', 'Category name');
          if (!name) return;
          clearBuilderMsg();
          try {
            const bucket = getBuilderBucket();
            const resp = await apiRequest('/api/teachers/tactics-fighter/builder/categories', {
              method: 'POST',
              body: JSON.stringify({ name, bucket })
            });
            await tfJson(resp);
            showBuilderMsg('ok', 'Created.');
            await builderRefresh();
          } catch (e) {
            showBuilderMsg('err', e?.message || String(e));
          }
        });
        refreshBtn?.addEventListener('click', () => builderRefresh());

        // Delegated actions
        const tree = document.getElementById('tfBuilderTree');
        tree?.addEventListener('click', async (ev) => {
          const t = ev.target;
          const toggleBtn = t?.closest?.('[data-tf-toggle]');
          if (toggleBtn) {
            const kind = String(toggleBtn.getAttribute('data-tf-toggle') || '');
            const id = String(toggleBtn.getAttribute('data-id') || '');
            if (!id) return;
            const set = kind === 'cat' ? ui.expanded.cat : kind === 'topic' ? ui.expanded.topic : ui.expanded.subtopic;
            if (set.has(id)) set.delete(id); else set.add(id);
            await builderRefresh();
            return;
          }

          const addTopicBtn = t?.closest?.('[data-tf-add-topic]');
          if (addTopicBtn) {
            const cid = String(addTopicBtn.getAttribute('data-tf-add-topic') || '');
            const name = await promptText('Create topic (unique in category)', 'Topic name');
            if (!name) return;
            try { await builderCreateTopic(cid, name); await builderRefresh(); } catch (e) { showBuilderMsg('err', e?.message || String(e)); }
            return;
          }

          const addSubBtn = t?.closest?.('[data-tf-add-subtopic]');
          if (addSubBtn) {
            const tid = String(addSubBtn.getAttribute('data-tf-add-subtopic') || '');
            const name = await promptText('Create subtopic (unique in topic)', 'Subtopic name');
            if (!name) return;
            try { await builderCreateSubtopic(tid, name); await builderRefresh(); } catch (e) { showBuilderMsg('err', e?.message || String(e)); }
            return;
          }

          const renCatBtn = t?.closest?.('[data-tf-rename-cat]');
          if (renCatBtn) {
            const cid = String(renCatBtn.getAttribute('data-tf-rename-cat') || '');
            const name = await promptText('Rename category', 'New name');
            if (!name) return;
            try { await builderRenameCategory(cid, name); await builderRefresh(); } catch (e) { showBuilderMsg('err', e?.message || String(e)); }
            return;
          }

          const delCatBtn = t?.closest?.('[data-tf-del-cat]');
          if (delCatBtn) {
            const cid = String(delCatBtn.getAttribute('data-tf-del-cat') || '');
            const ok = confirm('Delete this category? (Topics/Subtopics/Puzzles will be deleted too)');
            if (!ok) return;
            try { await builderDeleteCategory(cid); await builderRefresh(); } catch (e) { showBuilderMsg('err', e?.message || String(e)); }
            return;
          }

          const renTopicBtn = t?.closest?.('[data-tf-rename-topic]');
          if (renTopicBtn) {
            const tid = String(renTopicBtn.getAttribute('data-tf-rename-topic') || '');
            const name = await promptText('Rename topic', 'New name');
            if (!name) return;
            try { await builderRenameTopic(tid, name); await builderRefresh(); } catch (e) { showBuilderMsg('err', e?.message || String(e)); }
            return;
          }

          const delTopicBtn = t?.closest?.('[data-tf-del-topic]');
          if (delTopicBtn) {
            const tid = String(delTopicBtn.getAttribute('data-tf-del-topic') || '');
            const ok = confirm('Delete this topic? (Subtopics/Puzzles will be deleted too)');
            if (!ok) return;
            try { await builderDeleteTopic(tid); await builderRefresh(); } catch (e) { showBuilderMsg('err', e?.message || String(e)); }
            return;
          }

          const renSubBtn = t?.closest?.('[data-tf-rename-subtopic]');
          if (renSubBtn) {
            const sid = String(renSubBtn.getAttribute('data-tf-rename-subtopic') || '');
            const name = await promptText('Rename subtopic', 'New name');
            if (!name) return;
            try { await builderRenameSubtopic(sid, name); await builderRefresh(); } catch (e) { showBuilderMsg('err', e?.message || String(e)); }
            return;
          }

          const delSubBtn = t?.closest?.('[data-tf-del-subtopic]');
          if (delSubBtn) {
            const sid = String(delSubBtn.getAttribute('data-tf-del-subtopic') || '');
            const ok = confirm('Delete this subtopic? (Puzzles will be deleted too)');
            if (!ok) return;
            try { await builderDeleteSubtopic(sid); await builderRefresh(); } catch (e) { showBuilderMsg('err', e?.message || String(e)); }
            return;
          }

          const loadPuzzlesBtn = t?.closest?.('[data-tf-load-puzzles]');
          if (loadPuzzlesBtn) {
            const sid = String(loadPuzzlesBtn.getAttribute('data-tf-load-puzzles') || '');
            if (!sid) return;
            try {
              const data = await builderFetchPuzzles(sid);
              ui.puzzlesBySubtopic.set(sid, Array.isArray(data.puzzles) ? data.puzzles : []);
              ui.expanded.puzzlesLoaded.add(sid);
              ui.expanded.subtopic.add(sid);
              await builderRefresh();
            } catch (e) {
              showBuilderMsg('err', e?.message || String(e));
            }
            return;
          }

          const addPuzzleBtn = t?.closest?.('[data-tf-add-puzzle]');
          if (addPuzzleBtn) {
            const sid = String(addPuzzleBtn.getAttribute('data-tf-add-puzzle') || '');
            if (!sid) return;
            openAddPuzzleModal(sid).catch((e) => showBuilderMsg('err', e?.message || String(e)));
            return;
          }
        });

        if (!ui.builderLoadedOnce) {
          builderRefresh();
        }
      }
    };

    async function openAddPuzzleModal(subtopicId) {
      const roleNow = String(new URLSearchParams(window.location.search).get('role') || '');
      if (String(roleNow).toLowerCase() !== 'teacher') {
        alert('Add puzzles is available for teacher only.');
        return;
      }

      const host = document.createElement('div');
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="tfAddPuzzleBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Add puzzles" style="width: calc(100vw - 40px); max-width: 1600px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Add puzzles</div>
              <button id="tfAddPuzzleClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div class="tf-modal-grid">
                <div>
                  <div id="tfEditorBoard" class="tf-board" aria-label="Board editor"></div>
                  <div class="tf-field">
                    <label for="tfFenInput">FEN</label>
                    <textarea id="tfFenInput" class="tf-textarea" rows="3" placeholder="Paste FEN here..."></textarea>
                  </div>
                </div>

                <div>
                  <div class="tf-field">
                    <label>Side to move</label>
                    <select id="tfSideSelect" class="tf-select">
                      <option value="w">White to move</option>
                      <option value="b">Black to move</option>
                    </select>
                  </div>

                  <div class="tf-field">
                    <label>Pieces</label>
                    <div id="tfPalette" class="tf-piece-palette"></div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
                      <button id="tfClearSelection" class="btn btn-secondary" type="button">Clear selection</button>
                      <button id="tfClearBoard" class="btn btn-secondary" type="button">Clear board</button>
                      <button id="tfStartPos" class="btn btn-secondary" type="button">Start position</button>
                    </div>
                  </div>

                  <div class="tf-field">
                    <label>Engine Load</label>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:8px;">
                      <div>
                        <div class="tf-muted" style="font-weight:900;">MultiPV (N-best)</div>
                        <div class="tf-stepper">
                          <input id="tfMultiPv" type="number" min="1" max="10" value="1">
                          <div class="tf-stepper-arrows">
                            <button id="tfMultiPvUp" class="tf-arrow-btn" type="button" aria-label="Increase MultiPV">▲</button>
                            <button id="tfMultiPvDown" class="tf-arrow-btn" type="button" aria-label="Decrease MultiPV">▼</button>
                          </div>
                        </div>
                      </div>
                      <div>
                        <div class="tf-muted" style="font-weight:900;">PV plies</div>
                        <div class="tf-stepper">
                          <input id="tfPvPlies" type="number" min="1" max="32" value="8">
                          <div class="tf-stepper-arrows">
                            <button id="tfPvPliesUp" class="tf-arrow-btn" type="button" aria-label="Increase PV plies">▲</button>
                            <button id="tfPvPliesDown" class="tf-arrow-btn" type="button" aria-label="Decrease PV plies">▼</button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
                      <button id="tfEngineLoadBtn" class="btn btn-primary" type="button">Engine Load</button>
                      <button id="tfSavePuzzleBtn" class="btn btn-success" type="button" disabled>Confirm & Save</button>
                    </div>
                  </div>

                  <div id="tfEngineOut" class="tf-lines"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);

      const close = () => { try { host.remove(); } catch {} };
      host.querySelector('#tfAddPuzzleClose')?.addEventListener('click', close);
      host.querySelector('#tfAddPuzzleBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'tfAddPuzzleBackdrop') close();
      });

      let board = parseFenToBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1') || Array.from({ length: 8 }, () => Array(8).fill(''));
      let side = 'w';
      let selectedPiece = '';
      let lastEngine = null;

      const fenInput = host.querySelector('#tfFenInput');
      const sideSel = host.querySelector('#tfSideSelect');
      const boardEl = host.querySelector('#tfEditorBoard');
      const paletteEl = host.querySelector('#tfPalette');
      const engineOutEl = host.querySelector('#tfEngineOut');
      const saveBtn = host.querySelector('#tfSavePuzzleBtn');

      function formatPvWithMoveNumbers(fen, pvSan) {
        const parts = String(fen || '').trim().split(/\s+/);
        const side = (parts[1] === 'b') ? 'b' : 'w';
        const fullmove = Math.max(1, Number(parts[5] || 1) || 1);
        const moves = Array.isArray(pvSan) ? pvSan.map(String).filter(Boolean) : [];
        if (!moves.length) return '';

        const lines = [];
        let idx = 0;
        let m = fullmove;

        if (side === 'b') {
          const b = moves[idx++];
          if (b) lines.push(`${m}. ... ${b}`);
          m += 1;
        }

        while (idx < moves.length) {
          const w = moves[idx++] || '';
          const b = moves[idx++] || '';
          if (w && b) lines.push(`${m}. ${w} ${b}`);
          else if (w) lines.push(`${m}. ${w}`);
          m += 1;
        }

        return lines.map(escapeHtml).join('<br>');
      }

      function renderBoard() {
        if (!boardEl) return;
        const sqs = [];
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const isDark = (r + c) % 2 === 1;
            const p = board[r][c] || '';
            const src = p ? pieceImageSrc(p) : '';
            const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
            sqs.push(`<div class="tf-sq ${isDark ? 'dark' : 'light'}" data-r="${r}" data-c="${c}" title="${escapeHtml(rcToCoord(r, c))}">${img}</div>`);
          }
        }
        boardEl.innerHTML = sqs.join('');
      }

      function syncFenText() {
        const fen = buildFenFromBoard(board, side);
        if (fenInput) fenInput.value = fen;
      }

      function applyFenText() {
        const fen = String(fenInput?.value || '').trim();
        const b = parseFenToBoard(fen);
        const parts = fen.split(/\s+/);
        const stm = parts[1] === 'b' ? 'b' : 'w';
        if (b) {
          board = b;
          side = stm;
          if (sideSel) sideSel.value = side;
          renderBoard();
        }
      }

      function renderPalette() {
        if (!paletteEl) return;
        const pieces = ['K','Q','R','B','N','P','k','q','r','b','n','p'];
        paletteEl.innerHTML = pieces.map((p) => {
          const src = pieceImageSrc(p);
          const inner = src
            ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">`
            : escapeHtml(PIECE_UNICODE[p] || p);
          return `<button type="button" class="tf-piece-btn ${selectedPiece === p ? 'is-active' : ''}" data-piece="${escapeHtml(p)}" aria-label="Piece ${escapeHtml(p)}">${inner}</button>`;
        }).join('');
      }

      function setEngineOut(html) { if (engineOutEl) engineOutEl.innerHTML = html; }

      // init editor
      syncFenText();
      renderBoard();
      renderPalette();

      boardEl?.addEventListener('click', (e) => {
        const sq = e.target && e.target.closest ? e.target.closest('.tf-sq') : null;
        if (!sq) return;
        const r = Number(sq.getAttribute('data-r'));
        const c = Number(sq.getAttribute('data-c'));
        if (!Number.isFinite(r) || !Number.isFinite(c)) return;
        board[r][c] = selectedPiece ? selectedPiece : '';
        renderBoard();
        syncFenText();
      });

      paletteEl?.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('.tf-piece-btn') : null;
        if (!btn) return;
        selectedPiece = String(btn.getAttribute('data-piece') || '');
        renderPalette();
      });

      host.querySelector('#tfClearSelection')?.addEventListener('click', () => {
        selectedPiece = '';
        renderPalette();
      });
      host.querySelector('#tfClearBoard')?.addEventListener('click', () => {
        board = Array.from({ length: 8 }, () => Array(8).fill(''));
        renderBoard();
        syncFenText();
      });
      host.querySelector('#tfStartPos')?.addEventListener('click', () => {
        const b = parseFenToBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1');
        if (b) board = b;
        side = 'w';
        if (sideSel) sideSel.value = 'w';
        renderBoard();
        syncFenText();
      });

      sideSel?.addEventListener('change', () => {
        side = String(sideSel.value || 'w') === 'b' ? 'b' : 'w';
        syncFenText();
      });

      fenInput?.addEventListener('blur', applyFenText);

      const multiPvEl = host.querySelector('#tfMultiPv');
      const pvPliesEl = host.querySelector('#tfPvPlies');
      host.querySelector('#tfMultiPvUp')?.addEventListener('click', () => {
        if (!multiPvEl) return;
        const v = Number(multiPvEl.value || 1) || 1;
        multiPvEl.value = String(Math.max(1, Math.min(10, v + 1)));
      });
      host.querySelector('#tfMultiPvDown')?.addEventListener('click', () => {
        if (!multiPvEl) return;
        const v = Number(multiPvEl.value || 1) || 1;
        multiPvEl.value = String(Math.max(1, Math.min(10, v - 1)));
      });
      host.querySelector('#tfPvPliesUp')?.addEventListener('click', () => {
        if (!pvPliesEl) return;
        const v = Number(pvPliesEl.value || 8) || 8;
        pvPliesEl.value = String(Math.max(1, Math.min(32, v + 1)));
      });
      host.querySelector('#tfPvPliesDown')?.addEventListener('click', () => {
        if (!pvPliesEl) return;
        const v = Number(pvPliesEl.value || 8) || 8;
        pvPliesEl.value = String(Math.max(1, Math.min(32, v - 1)));
      });

      host.querySelector('#tfEngineLoadBtn')?.addEventListener('click', async () => {
        try {
          applyFenText();
          const fen = String(fenInput?.value || '').trim();
          const multipv = Math.max(1, Math.min(10, Number(multiPvEl?.value || 1) || 1));
          const pvPlies = Math.max(1, Math.min(32, Number(pvPliesEl?.value || 8) || 8));
          setEngineOut(`<div class="tf-muted">Loading engine...</div>`);
          const data = await engineAnalyze({ fen, multipv, pvPlies });
          lastEngine = data;
          const lines = Array.isArray(data.lines) ? data.lines : [];
          setEngineOut(lines.length ? lines.map((ln) => {
            const score = ln?.score?.mate != null ? `mate ${ln.score.mate}` : `cp ${ln?.score?.cp ?? 0}`;
            const pv = formatPvWithMoveNumbers(fen, ln.pvSan);
            const fallback = Array.isArray(ln.pvUci) ? escapeHtml(ln.pvUci.join(' ')) : '';
            return `<div class="tf-line"><div class="tf-line-title">#${escapeHtml(String(ln.multiPv || 1))} · ${escapeHtml(score)}</div><div class="tf-line-meta">${pv || fallback}</div></div>`;
          }).join('') : `<div class="tf-muted">No lines.</div>`);
          if (saveBtn) saveBtn.disabled = false;
        } catch (e) {
          setEngineOut(`<div class="tf-builder-msg err" style="display:block;">${escapeHtml(e?.message || String(e))}</div>`);
          if (saveBtn) saveBtn.disabled = true;
        }
      });

      host.querySelector('#tfSavePuzzleBtn')?.addEventListener('click', async () => {
        try {
          applyFenText();
          const fen = String(fenInput?.value || '').trim();
          if (!fen) throw new Error('Missing FEN');
          const bucket = getBuilderBucket();
          const payload = {
            fen,
            engineDepth: 16,
            multipv: Number(multiPvEl?.value || 1) || 1,
            pvPlies: Number(pvPliesEl?.value || 8) || 8,
            solutions: lastEngine || null,
            meta: { bucket }
          };
          await builderCreatePuzzle(subtopicId, payload);
          const data = await builderFetchPuzzles(subtopicId);
          ui.puzzlesBySubtopic.set(subtopicId, Array.isArray(data.puzzles) ? data.puzzles : []);
          ui.expanded.puzzlesLoaded.add(subtopicId);
          ui.expanded.subtopic.add(subtopicId);
          await builderRefresh();
          close();
        } catch (e) {
          setEngineOut(`<div class="tf-builder-msg err" style="display:block;">${escapeHtml(e?.message || String(e))}</div>`);
        }
      });
    }

    // Sidebar mode switching
    root.querySelectorAll('.tf-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = btn.getAttribute('data-mode');
        activateMode(m);
      });
    });

    // Practice button click (event delegation)
    root.addEventListener('click', (e) => {
      const t = e.target && e.target.closest ? e.target.closest('[data-practice]') : null;
      if (!t) return;
      const bucket = String(t.getAttribute('data-practice') || '');
      if (!bucket) return;
      try { localStorage.setItem('tacticsFighterPracticeBucket', bucket); } catch {}
      setOut(`<div style="font-weight:900;">Selected:</div><div>${escapeHtml(bucket)}</div>`);
    });

    // Initial render
    activateMode(mode);
  };
})();


