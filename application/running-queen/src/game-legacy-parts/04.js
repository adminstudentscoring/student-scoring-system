    if (state.mode !== 'timed' || !state.gameActive) {
      return;
    }
    finalizeGame(false, { message });
  }

  function handleInfiniteFailure(message) {
    if (state.mode !== 'infinite' || !state.gameActive) {
      return;
    }
    finalizeGame(false, { message });
    showInfiniteFailOverlay(message);
  }

  function formatTimer(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }

  async function loadLeaderboard() {
    try {
      const response = await fetch('/api/running-queen/leaderboard');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      state.leaderboard = Array.isArray(data.entries) ? data.entries : [];
      renderLeaderboard();
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
      renderLeaderboard(true);
    }
  }

  function renderLeaderboard(loadError = false) {
    const entries = Array.isArray(state.leaderboard)
      ? state.leaderboard.map(entry => ({
          ...entry,
          mode: entry.mode || 'timed',
          queenCount: Number(entry.queenCount) || null,
          timerDurationMs: Number(entry.timerDurationMs || entry.timerDuration) || 0
        }))
      : [];
    const timedEntries = entries.filter(entry => entry.mode === 'timed');
    const infiniteEntries = entries.filter(entry => entry.mode === 'infinite');
    renderTimedLeaderboard(state.leaderboardLists.timed, timedEntries, loadError);
    renderInfiniteLeaderboard(state.leaderboardLists.infinite, infiniteEntries, loadError);
    updateLeaderboardTabs();
  }

  const LEADERBOARD_QUEEN_GROUPS = [4, 5];
  const TIMED_DURATION_BUCKETS = [
    { value: 60000, label: '1 minute' },
    { value: 120000, label: '2 minute' },
    { value: 180000, label: '3 minute' }
  ];

  function sortLeaderboardEntries(list) {
    return [...list].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.mode === 'timed' && b.mode === 'timed') {
        return (a.duration || 0) - (b.duration || 0);
      }
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
  }

  function renderLeaderboardItems(entries, metaFormatter) {
    return entries.map((entry, index) => `
      <div class="rq-leaderboard-item">
        <div class="rq-leaderboard-rank">#${index + 1}</div>
        <div class="rq-leaderboard-info">
          <div class="rq-leaderboard-names">${entry.players?.map(p => p.name).join(', ') || 'Unknown Team'}</div>
          <div class="rq-leaderboard-meta">
            <span>${entry.score} steps</span>
            <span>${metaFormatter(entry)}</span>
            <span>${entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  function renderTimedLeaderboard(container, entries, loadError) {
    if (!container) return;
    if (loadError) {
      container.innerHTML = '<div class="rq-leaderboard-empty">Unable to load leaderboard.</div>';
      return;
    }
    const normalized = Array.isArray(entries) ? entries : [];
    let hasAny = false;

    const groupsHtml = LEADERBOARD_QUEEN_GROUPS.map(qc => {
      const bucketHtml = TIMED_DURATION_BUCKETS.map(bucket => {
        const bucketEntries = sortLeaderboardEntries(
          normalized.filter(entry =>
            (entry.queenCount === qc) &&
            (entry.timerDurationMs === bucket.value))
        );
        if (bucketEntries.length > 0) hasAny = true;
        return `
          <div class="rq-leaderboard-subgroup">
            <div class="rq-leaderboard-subtitle">Timed • ${bucket.label}</div>
            ${bucketEntries.length
              ? renderLeaderboardItems(bucketEntries, entry => formatDuration(entry.duration || 0))
              : '<div class="rq-leaderboard-empty">No entries yet.</div>'}
          </div>
        `;
      }).join('');

      // Handle entries without matching duration buckets
      const otherEntries = sortLeaderboardEntries(
        normalized.filter(entry =>
          entry.queenCount === qc &&
          !TIMED_DURATION_BUCKETS.some(bucket => entry.timerDurationMs === bucket.value)
        )
      );
      const otherHtml = otherEntries.length ? `
        <div class="rq-leaderboard-subgroup">
          <div class="rq-leaderboard-subtitle">Timed • Other</div>
          ${renderLeaderboardItems(otherEntries, entry => formatDuration(entry.duration || 0))}
        </div>
      ` : '';
      if (otherEntries.length > 0) hasAny = true;

      const hasGroupEntries = bucketHtml || otherHtml;
      return `
        <div class="rq-leaderboard-group">
          <div class="rq-leaderboard-group-title">${qc} Queens</div>
          ${bucketHtml}${otherHtml}
        </div>
      `;
    }).join('');

    // Group for unspecified queen count
    const unspecified = sortLeaderboardEntries(
      normalized.filter(entry => !LEADERBOARD_QUEEN_GROUPS.includes(entry.queenCount))
    );
    const unspecifiedHtml = unspecified.length ? `
      <div class="rq-leaderboard-group">
        <div class="rq-leaderboard-group-title">Other / Unspecified</div>
        ${renderLeaderboardItems(unspecified, entry => formatDuration(entry.duration || 0))}
      </div>
    ` : '';
    if (unspecified.length) hasAny = true;

    if (!hasAny) {
      container.innerHTML = '<div class="rq-leaderboard-empty">No entries yet.</div>';
      return;
    }

    container.innerHTML = `${groupsHtml}${unspecifiedHtml}`;
  }

  function renderInfiniteLeaderboard(container, entries, loadError) {
    if (!container) return;
    if (loadError) {
      container.innerHTML = '<div class="rq-leaderboard-empty">Unable to load leaderboard.</div>';
      return;
    }
    const normalized = Array.isArray(entries) ? entries : [];
    let hasAny = false;

    const groupsHtml = LEADERBOARD_QUEEN_GROUPS.map(qc => {
      const list = sortLeaderboardEntries(normalized.filter(entry => entry.queenCount === qc));
      if (list.length > 0) hasAny = true;
      return `
        <div class="rq-leaderboard-group">
          <div class="rq-leaderboard-group-title">${qc} Queens • Infinite</div>
          ${list.length
            ? renderLeaderboardItems(list, () => '—')
            : '<div class="rq-leaderboard-empty">No entries yet.</div>'}
        </div>
      `;
    }).join('');

    const unspecified = sortLeaderboardEntries(
      normalized.filter(entry => !LEADERBOARD_QUEEN_GROUPS.includes(entry.queenCount))
    );
    const unspecifiedHtml = unspecified.length ? `
      <div class="rq-leaderboard-group">
        <div class="rq-leaderboard-group-title">Other / Unspecified</div>
        ${renderLeaderboardItems(unspecified, () => '—')}
      </div>
    ` : '';
    if (unspecified.length) hasAny = true;

    if (!hasAny) {
      container.innerHTML = '<div class="rq-leaderboard-empty">No entries yet.</div>';
      return;
    }

    container.innerHTML = `${groupsHtml}${unspecifiedHtml}`;
  }

  function updateLeaderboardTabs() {
    const active = state.activeLeaderboardTab;
    if (state.leaderboardTabs) {
      state.leaderboardTabs.forEach(tab => {
        const key = tab.getAttribute('data-leaderboard-tab');
        tab.classList.toggle('active', key === active);
      });
    }
    if (state.leaderboardLists.timed) {
      state.leaderboardLists.timed.classList.toggle('hidden', active !== 'timed');
    }
    if (state.leaderboardLists.infinite) {
      state.leaderboardLists.infinite.classList.toggle('hidden', active !== 'infinite');
    }
  }

  function openLeaderboardModal(defaultTab = 'timed') {
    state.activeLeaderboardTab = defaultTab;
    updateLeaderboardTabs();
    renderLeaderboard();
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
    if (state.rulesModalBodyEl) {
      state.rulesModalBodyEl.innerHTML = getRulesHtml();
      state.rulesModalBodyEl.scrollTop = 0;
    }
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
    if (handled) {
      event.preventDefault();
    }
  }

  function getRulesHtml() {
    return `
      <section class="rq-rules-section">
        <h3>Turn Flow</h3>
        <ul>
          <li>Each turn, a player may move exactly one queen.</li>
          <li>The same queen cannot be moved by consecutive players.</li>
          <li>Queens must move in a straight or diagonal line for at least two squares with an unobstructed path.</li>
        </ul>
      </section>
      <section class="rq-rules-section">
        <h3>Safety Check</h3>
        <ul>
          <li>If, after the move, all queens remain non-attacking, the move counts as a successful step.</li>
          <li>If the board becomes unsafe, the queen snaps back and the current mode’s failure flow is triggered.</li>
        </ul>
      </section>
      <section class="rq-rules-section">
        <h3>Timed Mode</h3>
        <ul>
          <li>A countdown appears in the status bar. Reaching zero or making an illegal move ends the run immediately.</li>
          <li>Results are recorded in the Timed leaderboard.</li>
        </ul>
      </section>
      <section class="rq-rules-section">
        <h3>Infinite Mode</h3>
        <ul>
          <li>No timer is present. Any illegal or unsafe move ends the run instantly.</li>
          <li>Results are recorded in the Infinite leaderboard.</li>
        </ul>
      </section>
    `;
  }

  async function recordLeaderboardEntry({ mode, score, duration, status }) {
    try {
      const payload = {
        players: state.players,
        mode,
        score,
        duration,
        status,
        queenCount: mode === 'timed' ? state.timedQueenCount : state.infiniteQueenCount,
        timerDurationMs: mode === 'timed' ? state.timerDuration : 0,
        createdAt: new Date().toISOString()
      };
      await fetch('/api/running-queen/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      loadLeaderboard();
    } catch (error) {
      console.error('Unable to record leaderboard entry:', error);
    }
  }

  window.initRunningQueen = initRunningQueen;
})();


