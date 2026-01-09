// Admin - Game Setting (placeholder)
// All UI text is in English by design.

(function () {
  const hmState = { inited: false };

  function getEl(id) {
    return document.getElementById(id);
  }

  function showHmMsg(type, text) {
    const el = getEl('adminHopeMateMsg');
    if (!el) return;
    el.style.display = 'block';
    el.classList.remove('success', 'error');
    if (type) el.classList.add(type);
    el.textContent = String(text || '');
  }

  function clearHmMsg() {
    const el = getEl('adminHopeMateMsg');
    if (!el) return;
    el.style.display = 'none';
    el.classList.remove('success', 'error');
    el.textContent = '';
  }

  function stageLabel(stageKey) {
    const map = {
      rook: 'Stage 1: Rook',
      queen: 'Stage 2: Queen',
      minor: 'Stage 3: Minor pieces',
      pawns: 'Stage 4: Pawns',
      twoRooks: 'Stage 5: Two Rooks',
      rookKnight: 'Stage 6: Rook + Knight',
      queenBishop: 'Stage 7: Queen + Bishop',
      queenKnight: 'Stage 8: Queen + Knight',
      queenRook: 'Stage 9: Queen + Rook',
      threePieces: 'Stage 10: Three pieces'
    };
    return map[String(stageKey)] || String(stageKey || '');
  }

  async function hmFetch(url, options = {}) {
    if (!window.authUtils || !window.authUtils.authenticatedFetch) {
      throw new Error('authUtils not available');
    }
    const resp = await window.authUtils.authenticatedFetch(url, options);
    if (!resp) throw new Error('Not authenticated');
    return resp;
  }

  function renderHmPuzzles(puzzles) {
    const list = getEl('adminHopeMatePuzzleList');
    if (!list) return;
    list.innerHTML = '';

    const items = Array.isArray(puzzles) ? puzzles : [];
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.style.color = '#6b7280';
      empty.textContent = 'No puzzles yet.';
      list.appendChild(empty);
      return;
    }

    for (const p of items) {
      const row = document.createElement('div');
      row.className = 'admin-game-setting-item';

      const left = document.createElement('div');

      const title = document.createElement('div');
      title.className = 'admin-game-setting-item-title';
      title.textContent = stageLabel(p.stageKey);

      const meta = document.createElement('div');
      meta.className = 'admin-game-setting-item-meta';
      meta.textContent = `ID: ${p.id || '-'} · ${p.createdAt ? new Date(p.createdAt).toLocaleString() : ''}`;

      const fen = document.createElement('div');
      fen.className = 'admin-game-setting-item-fen';
      fen.textContent = String(p.fen || '');

      left.appendChild(title);
      left.appendChild(meta);
      left.appendChild(fen);

      const right = document.createElement('div');
      const del = document.createElement('button');
      del.className = 'btn btn-danger';
      del.type = 'button';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        const ok = confirm('Delete this puzzle?');
        if (!ok) return;
        clearHmMsg();
        try {
          const resp = await hmFetch(`/admin/games/hope-mate/stage-puzzles/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(data.error || 'Delete failed');
          showHmMsg('success', 'Deleted.');
          await refreshHmList();
        } catch (e) {
          showHmMsg('error', e.message || 'Delete failed');
        }
      });
      right.appendChild(del);

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    }
  }

  async function refreshHmList() {
    const stage = getEl('adminHopeMateStageSelect')?.value || 'rook';
    const resp = await hmFetch(`/admin/games/hope-mate/stage-puzzles?stageKey=${encodeURIComponent(stage)}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Failed to load puzzles');
    renderHmPuzzles(data.puzzles || []);
  }

  async function addHmPuzzle() {
    const stage = getEl('adminHopeMateStageSelect')?.value || 'rook';
    const fen = getEl('adminHopeMateFenInput')?.value || '';
    clearHmMsg();
    try {
      const resp = await hmFetch('/admin/games/hope-mate/stage-puzzles', {
        method: 'POST',
        body: JSON.stringify({ stageKey: stage, fen })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Add failed');
      showHmMsg('success', 'Saved.');
      const input = getEl('adminHopeMateFenInput');
      if (input) input.value = '';
      await refreshHmList();
    } catch (e) {
      showHmMsg('error', e.message || 'Add failed');
    }
  }

  function initHopeMatePanel() {
    if (hmState.inited) return;
    hmState.inited = true;

    const addBtn = getEl('adminHopeMateAddBtn');
    const refreshBtn = getEl('adminHopeMateRefreshBtn');
    const stageSel = getEl('adminHopeMateStageSelect');

    if (addBtn) addBtn.addEventListener('click', addHmPuzzle);
    if (refreshBtn) refreshBtn.addEventListener('click', async () => {
      clearHmMsg();
      try {
        await refreshHmList();
        showHmMsg('success', 'Loaded.');
      } catch (e) {
        showHmMsg('error', e.message || 'Load failed');
      }
    });
    if (stageSel) stageSel.addEventListener('change', async () => {
      clearHmMsg();
      try {
        await refreshHmList();
      } catch (e) {
        showHmMsg('error', e.message || 'Load failed');
      }
    });

    // Initial load
    refreshHmList().catch((e) => {
      showHmMsg('error', e.message || 'Load failed');
    });
  }

  function hideAllPanels(panelMap) {
    Object.values(panelMap).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }

  // Expose for inline onclick in admin.html (keeps HTML changes minimal)
  window.switchAdminGameSettingSideTab = function switchAdminGameSettingSideTab(tab, element) {
    document.querySelectorAll('.admin-game-setting-side-tab').forEach((t) => t.classList.remove('active'));
    if (element) element.classList.add('active');

    const panelMap = {
      runningQueen: 'adminGameSettingRunningQueenPanel',
      royalExchange: 'adminGameSettingRoyalExchangePanel',
      monsterFight: 'adminGameSettingMonsterFightPanel',
      puzzleMonsterFight: 'adminGameSettingPuzzleMonsterFightPanel',
      tacticsFighter: 'adminGameSettingTacticsFighterPanel',
      chessCom: 'adminGameSettingChessComPanel',
      noBlunder: 'adminGameSettingNoBlunderPanel',
      hopeMate: 'adminGameSettingHopeMatePanel'
    };

    hideAllPanels(panelMap);

    const targetId = panelMap[String(tab)] || null;
    if (targetId) {
      const el = document.getElementById(targetId);
      if (el) el.classList.remove('hidden');
    }

    if (String(tab) === 'hopeMate') {
      initHopeMatePanel();
    }
  };
})();


