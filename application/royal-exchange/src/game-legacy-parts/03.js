      } else {
        state.statusEl.textContent = 'In progress';
      }
    }
  }

  function renderLog() {
    if (!state.logEl) return;
    state.logEl.innerHTML = state.logEntries.map(entry => `<div class="re-log-entry ${entry.type || 'info'}">${entry.message || entry}</div>`).join('');
    state.logEl.scrollTop = state.logEl.scrollHeight;
  }

  function appendLog(message, type = 'info') {
    state.logEntries.push({ message, type });
    renderLog();
  }

  function showToast(message, type) {
    appendLog(message, type);
  }

  function openLeaderboardModal() {
    state.activeLeaderboardTab = state.currentDifficulty;
    updateLeaderboardTabs();
    loadLeaderboard();
    if (state.leaderboardOverlayEl) {
      state.leaderboardOverlayEl.classList.remove('hidden');
      state.leaderboardOverlayEl.setAttribute('aria-hidden', 'false');
    }
  }

  function closeLeaderboardModal() {
    if (state.leaderboardOverlayEl) {
      state.leaderboardOverlayEl.classList.add('hidden');
      state.leaderboardOverlayEl.setAttribute('aria-hidden', 'true');
    }
  }

  function openRulesModal() {
    if (state.rulesOverlayEl) {
      state.rulesOverlayEl.classList.remove('hidden');
      state.rulesOverlayEl.setAttribute('aria-hidden', 'false');
    }
  }

  function closeRulesModal() {
    if (state.rulesOverlayEl) {
      state.rulesOverlayEl.classList.add('hidden');
      state.rulesOverlayEl.setAttribute('aria-hidden', 'true');
    }
  }

  function onGlobalKeydown(event) {
    if (event.key !== 'Escape') return;
    let handled = false;
    if (state.leaderboardOverlayEl && !state.leaderboardOverlayEl.classList.contains('hidden')) {
      closeLeaderboardModal();
      handled = true;
    }
    if (state.rulesOverlayEl && !state.rulesOverlayEl.classList.contains('hidden')) {
      closeRulesModal();
      handled = true;
    }
    if (state.defeatOverlayEl && !state.defeatOverlayEl.classList.contains('hidden')) {
      closeDefeatModal();
      handled = true;
    }
    if (handled) {
      event.preventDefault();
    }
  }

  function loadLeaderboard() {
    apiRequest('/royal-exchange/leaderboard')
      .then(response => {
        if (!response) throw new Error('No response');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        const entries = Array.isArray(data.entries) ? data.entries : [];
        renderLeaderboardLists(entries);
      })
      .catch(error => {
        console.error('Failed to load leaderboard:', error);
        renderLeaderboardLists([], true);
      });
  }

  function renderLeaderboardLists(entries, loadError = false) {
    if (!state.leaderboardLists) return;
    const grouped = entries.reduce((acc, entry) => {
      const key = entry.difficulty || 'normal';
      if (!acc[key]) acc[key] = [];
      acc[key].push(entry);
      return acc;
    }, {});
    Object.entries(state.leaderboardLists).forEach(([difficulty, container]) => {
      if (!container) return;
      const list = grouped[difficulty] || [];
      const sorted = list.slice().sort((a, b) => {
        const aSteps = Number(a?.steps) || 0;
        const bSteps = Number(b?.steps) || 0;
        if (aSteps !== bSteps) return aSteps - bSteps;
        const aDur = Number(a?.duration) || 0;
        const bDur = Number(b?.duration) || 0;
        return aDur - bDur;
      });
      if (loadError) {
        container.innerHTML = '<div class="re-leaderboard-empty">Unable to load leaderboard.</div>';
        return;
      }
      if (sorted.length === 0) {
        container.innerHTML = '<div class="re-leaderboard-empty">No records yet.</div>';
        return;
      }
      container.innerHTML = sorted.map((entry, index) => `
        <div class="re-leaderboard-item">
          <div class="re-leaderboard-rank">#${index + 1}</div>
          <div class="re-leaderboard-info">
            <div class="re-leaderboard-names">${(entry.players || []).map(p => p.name).join(', ')}</div>
            <div class="re-leaderboard-meta">
              <span>Moves: ${Number(entry.steps) || 0}</span>
              <span>Time: ${formatDuration(Number(entry.duration) || 0)}</span>
              <span>${entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}</span>
            </div>
          </div>
        </div>
      `).join('');
    });
    updateLeaderboardTabs();
  }

  function updateLeaderboardTabs() {
    if (state.leaderboardTabs) {
      state.leaderboardTabs.forEach(tab => {
        const key = tab.getAttribute('data-leaderboard-tab');
        tab.classList.toggle('active', key === state.activeLeaderboardTab);
      });
    }
    if (state.leaderboardLists) {
      Object.entries(state.leaderboardLists).forEach(([key, container]) => {
        if (container) {
          container.classList.toggle('hidden', key !== state.activeLeaderboardTab);
        }
      });
    }
  }

  function submitLeaderboardEntry(steps, duration) {
    return apiRequest('/royal-exchange/leaderboard', {
      method: 'POST',
      body: JSON.stringify({
        success: true,
        players: state.players,
        steps,
        duration,
        difficulty: state.currentDifficulty,
        createdAt: new Date().toISOString()
      })
    }).catch(error => {
      console.error('Unable to record leaderboard entry:', error);
    });
  }

  function updateDifficultyButtons() {
    document.querySelectorAll('.re-difficulty-button').forEach(button => {
      const key = button.getAttribute('data-difficulty');
      button.classList.toggle('active', key === state.currentDifficulty);
    });
  }

  function populatePlayersList() {
    const listEl = document.getElementById('rePlayersList');
    if (!listEl) return;
    if (!Array.isArray(state.players) || state.players.length === 0) {
      listEl.innerHTML = '<li class="re-player-item empty">No players selected.</li>';
      return;
    }
    listEl.innerHTML = state.players.map(player => `<li class="re-player-item">${player.name}</li>`).join('');
  }

  function generateColumnLabels() {
    return Array.from({ length: BOARD_SIZE }, (_, index) => {
      const letter = String.fromCharCode('A'.charCodeAt(0) + index);
      return `<span class="re-col-label">${letter}</span>`;
    }).join('');
  }

  function generateRowLabels() {
    return Array.from({ length: BOARD_SIZE }, (_, index) => {
      const number = BOARD_SIZE - index;
      return `<span class="re-row-label">${number}</span>`;
    }).join('');
  }

  function formatCoordinate(piece) {
    const columnLetter = String.fromCharCode('a'.charCodeAt(0) + piece.col);
    const rowNumber = BOARD_SIZE - piece.row;
    return `${columnLetter}${rowNumber}`;
  }

  function formatDuration(ms) {
    const safe = Number(ms) || 0;
    const totalSeconds = Math.max(0, Math.floor(safe / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes <= 0) return `${seconds}s`;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function getRulesHtml() {
    return `
      <section class="re-rules-section">
        <h3>Goal</h3>
        <ul>
          <li>Swap the white rook/knight/bishop with the black rook/knight/bishop so that each occupies the other side’s original square.</li>
        </ul>
      </section>
      <section class="re-rules-section">
        <h3>Turn Flow</h3>
        <ul>
          <li>Players alternate control of white and black each turn.</li>
          <li>Select a piece from the current side, then click a destination to move.</li>
          <li>Intermediate safe squares are permitted; no need to move directly to targets.</li>
        </ul>
      </section>
      <section class="re-rules-section">
        <h3>Safety</h3>
        <ul>
          <li>Moves must follow standard chess rules for the piece.</li>
          <li>Move paths may pass controlled squares, but the landing square must be empty.</li>
          <li>After each move no piece may attack, or be attackable by, an opposing piece. If this happens the puzzle fails.</li>
        </ul>
      </section>
      <section class="re-rules-section">
        <h3>Scoring</h3>
        <ul>
          <li>The total number of moves is recorded along with the clear time.</li>
          <li>Only successful swaps appear on the leaderboard.</li>
        </ul>
      </section>
    `;
  }

  window.initRoyalExchange = initRoyalExchange;
})();



