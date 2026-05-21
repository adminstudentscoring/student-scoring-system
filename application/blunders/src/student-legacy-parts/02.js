          ${rg.error ? `<div class="blunders-muted" style="margin-top:8px; color:#b91c1c;">${escapeHtml(String(rg.error))}</div>` : ``}
          ${rg.loading ? `<div class="blunders-muted" style="margin-top:8px;">Loading games...</div>` : ``}
          ${!rg.loading ? `
            ${games.length ? `
              <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
                ${games.map((g, i) => {
                  const active = i === gIdx;
                  const label = g?.endTime ? fmtTs(Number(g.endTime || 0) * 1000) : `Game ${i + 1}`;
                  const tc = g?.timeClass ? ` · ${String(g.timeClass)}` : '';
                  return `<button class="btn ${active ? 'btn-info' : 'btn-secondary'} btn-small" type="button" data-bl-home-game="${escapeHtml(String(i))}">${escapeHtml(label)}${escapeHtml(tc)}</button>`;
                }).join('')}
              </div>
              <div class="bl-board-wrap" style="margin-top:12px;">
                <div>
                  ${fen ? entry().renderMiniBoardFromFen(fen) : `<div class="bl-card" style="box-shadow:none;"><div class="blunders-muted">PGN not available.</div></div>`}
                  <div class="blunders-muted" style="margin-top:8px;">${escapeHtml(moveLabel)}</div>
                  <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
                    <button class="btn btn-secondary btn-small" type="button" data-bl-home-pgn-prev ${canPrev ? '' : 'disabled'}>◀</button>
                    <div class="blunders-muted" style="align-self:center;">${escapeHtml(String(ply))} / ${escapeHtml(String(plyMax))}</div>
                    <button class="btn btn-secondary btn-small" type="button" data-bl-home-pgn-next ${canNext ? '' : 'disabled'}>▶</button>
                    ${game?.url ? `<a class="btn btn-secondary btn-small" href="${escapeHtml(String(game.url))}" target="_blank" rel="noopener noreferrer">Chess.com</a>` : ``}
                  </div>
                </div>
                <div>
                  <div class="bl-card" style="box-shadow:none;">
                    <div style="font-weight:950; color:#111827;">Blunders in this game</div>
                    ${bls.length ? `
                      <div style="margin-top:10px; display:flex; flex-direction:column; gap:8px;">
                        ${bls.slice(0, 20).map((p) => {
                          const drop = (Number(p?.dropPoints ?? 0) || 0).toFixed(2);
                          const tags = Array.isArray(p?.tags) ? p.tags.map(String).filter(Boolean) : [];
                          return `
                            <button class="bl-card" type="button" data-bl-open="${escapeHtml(String(p.id || ''))}" style="text-align:left;">
                              <div style="font-weight:950; color:#111827;">${escapeHtml(String(p.blunderSan || ''))}</div>
                              <div class="blunders-muted" style="margin-top:6px;">Drop <strong>${escapeHtml(drop)}</strong></div>
                              ${tags.length ? `<div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">${tags.slice(0, 6).map(t => `<span class="bl-badge" style="background:#f3f4f6; color:#111827;">${escapeHtml(t)}</span>`).join('')}</div>` : ``}
                            </button>
                          `;
                        }).join('')}
                      </div>
                    ` : `<div class="blunders-muted" style="margin-top:10px;">No blunders recorded for this game (or not analyzed yet).</div>`}
                  </div>
                </div>
              </div>
            ` : `<div class="blunders-muted" style="margin-top:10px;">No recent games found.</div>`}
          ` : ``}
        </div>
        ${renderDebugBlock()}
      </div>
    `;
  }

  function renderBlunderPage() {
    const puzzle = currentPuzzle();
    const pendingCount = Array.isArray(STATE.pending) ? STATE.pending.length : 0;
    const flip = puzzle ? String(puzzle.studentColor || '') === 'b' : false;
    const modeLabel = STATE.mode === 'practice' ? 'Practice (Random)' : 'Pending';
    const dropVal = puzzle ? Number(puzzle.dropPoints ?? (Number(puzzle.dropCp || 0) / 100)) : 0;
    const infoLine = (() => {
      if (!puzzle) return '';
      const mv = String(puzzle.blunderSan || puzzle.blunderMoveUci || '');
      if (isMissMatePuzzle(puzzle)) return `${mv} · Miss the mate`;
      return `${mv} · Drop ${dropVal.toFixed(2)}`;
    })();
    const fenOverride = String(STATE.uiBoard.blunderFen || puzzle?.startFEN || '');
    const myMoveUci = String(STATE.uiBoard.blunderMoveUci || '');
    return `
      <div class="bl-card">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
          <div>
            <div class="bl-title">Blunder</div>
            <div class="blunders-muted">Mode: <strong>${escapeHtml(modeLabel)}</strong>${STATE.mode === 'pending' ? ` · Remaining: <strong>${escapeHtml(String(pendingCount))}</strong>` : ''}</div>
          </div>
          <div style="text-align:right;">
            <button class="btn btn-secondary btn-small" type="button" data-bl-page-reload title="Reload page">Refresh page</button>
            <div class="blunders-muted" style="margin-top:6px;">If anything looks wrong, click Refresh page.</div>
          </div>
        </div>

        ${puzzle ? `
          <div class="bl-board-wrap">
            <div>
              ${entry().renderBoardForPuzzle(puzzle, flip, STATE.selectedFrom, { fenOverride, myMoveUci })}
            </div>
            <div>
              <div class="bl-card" style="box-shadow:none;">
                <div style="font-weight:950; color:#111827;">Puzzle</div>
                <div class="blunders-muted" style="margin-top:6px;">${escapeHtml(infoLine)}</div>
                ${puzzle.gameUrl ? `<div class="blunders-muted" style="margin-top:6px;">Source: <a href="${escapeHtml(String(puzzle.gameUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(String(puzzle.gameUrl))}</a></div>` : ''}
                ${STATE.mode === 'pending' ? `
                  <div class="bl-btn-row cols-3">
                    <button class="btn btn-secondary" type="button" data-bl-prev ${STATE.currentIndex <= 0 ? 'disabled' : ''}>Prev</button>
                    <button class="btn btn-secondary" type="button" data-bl-next ${STATE.currentIndex >= pendingCount - 1 ? 'disabled' : ''}>Next</button>
                  </div>
                ` : `
                  <div class="bl-btn-row cols-2">
                    <button class="btn btn-secondary" type="button" data-bl-back-review>Back to Review</button>
                  </div>
                `}
                <div class="blunders-muted" id="blBlunderMsg" style="margin-top:10px;"></div>
                <button class="btn btn-secondary btn-small" type="button" data-bl-copy-fen="blunder" style="margin-top:12px;">
                  <span style="display:inline-flex; align-items:center; gap:8px;">
                    <span aria-hidden="true">📋</span>
                    <span>Copy FEN</span>
                  </span>
                </button>
              </div>
              ${entry().renderInlineResultPanel('blunder')}
            </div>
          </div>
        ` : `
          <div class="blunders-muted" style="margin-top:10px;">No pending puzzles yet.</div>
          <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
            <button class="btn btn-secondary" type="button" data-bl-refresh>Refresh</button>
            <button class="btn btn-secondary" type="button" data-bl-force>Force refresh</button>
            <button class="btn btn-primary" type="button" data-bl-go-review>Go to Review</button>
          </div>
          ${renderDebugBlock()}
        `}
      </div>
    `;
  }

  function renderReviewPage() {
    const ui = ensureReviewUi();
    const cache = buildReviewCacheIfNeeded();
    const pageSize = Math.max(1, Number(ui.pageSize || 50) || 50);
    const theme = String(ui.theme || 'any');
    const tagCounts = (cache && cache.tagCounts && typeof cache.tagCounts === 'object') ? cache.tagCounts : {};
    const themeOpts = (() => {
      const base = [{ k: 'any', label: 'Any theme' }];
      const entries = Object.entries(tagCounts)
        .map(([k, v]) => ({ k: String(k), n: Number(v || 0) || 0 }))
        .filter(x => x.k && x.k !== 'any')
        .sort((a, b) => (b.n - a.n) || a.k.localeCompare(b.k))
        .slice(0, 50);
      for (const x of entries) base.push({ k: x.k, label: `${x.k} (${x.n})` });
      return base;
    })();

    const renderRows = (arr, bucketKey) => {
      const list = Array.isArray(arr) ? arr : [];
      const b = ui.buckets[bucketKey] || { page: 1, totalPages: 1 };
      const page = Math.max(1, Number(b.page || 1) || 1);
      const start = (page - 1) * pageSize;
      const pageItems = list.slice(start, start + pageSize);
      if (!pageItems.length) return `<div class="blunders-muted" style="margin-top:10px;">No records.</div>`;
      return `
        <div class="bl-grid" style="margin-top:10px;">
          ${pageItems.map((p) => {
            const drop = dropOfPuzzle(p);
            const label = isMissMatePuzzle(p) ? 'Miss the mate' : `Drop ${drop.toFixed(2)}`;
            const status = String(p?.status || 'pending') === 'completed' ? 'Completed' : 'Pending';
            const tags = Array.isArray(p?.tags) ? p.tags.map(String).filter(Boolean) : [];
            const tagLine = tags.length
              ? `<div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">${tags.slice(0, 8).map(t => `<span class="bl-badge" style="background:#f3f4f6; color:#111827;">${escapeHtml(t)}</span>`).join('')}</div>`
              : ``;
            return `
              <button class="bl-card" type="button" data-bl-open="${escapeHtml(String(p.id || ''))}" style="text-align:left; cursor:pointer;">
                <div style="display:flex; gap:10px; align-items:center;">
                  <div style="flex:0 0 auto;">${entry().renderMiniBoardFromFen(String(p.startFEN || ''))}</div>
                  <div style="flex:1 1 auto; min-width:0;">
                    <div style="font-weight:950; color:#111827; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(String(p.blunderSan || p.blunderMoveUci || ''))}</div>
                    <div class="blunders-muted" style="margin-top:6px;">${escapeHtml(label)} · <strong>${escapeHtml(status)}</strong></div>
                    <div class="blunders-muted" style="margin-top:6px;">${escapeHtml(fmtTs(p.completedAt || p.createdAt))}</div>
                    ${tagLine}
                  </div>
                </div>
              </button>
            `;
          }).join('')}
        </div>
      `;
    };

    const renderBucket = (key, label) => {
      const b = ui.buckets[key] || { open: false, page: 1, totalPages: 1, jump: '' };
      const open = !!b.open;
      const count = Number(cache?.counts?.[key] || 0) || 0;
      const totalPages = Math.max(1, Number(b.totalPages || 1) || 1);
      const page = Math.max(1, Number(b.page || 1) || 1);
      const canPrev = open && page > 1;
      const canNext = open && page < totalPages;
      const jumpVal = String(b.jump || '');
      return `
        <div class="bl-card" style="margin-top:12px;">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button class="btn btn-secondary btn-small" type="button" data-bl-review-toggle="${escapeHtml(key)}">${open ? 'Hide' : 'Show'}</button>
            <div style="font-weight:950; color:#111827;">${escapeHtml(label)} <span class="bl-badge" style="margin-left:8px;">${escapeHtml(String(count))}</span></div>
            <div style="flex:1;"></div>
            ${open ? `
              <div class="blunders-muted">Page <strong>${escapeHtml(String(page))}</strong> / <strong>${escapeHtml(String(totalPages))}</strong></div>
              <button class="btn btn-secondary btn-small" type="button" data-bl-review-prev="${escapeHtml(key)}" ${canPrev ? '' : 'disabled'}>Prev</button>
              <button class="btn btn-secondary btn-small" type="button" data-bl-review-next="${escapeHtml(key)}" ${canNext ? '' : 'disabled'}>Next</button>
              <div style="display:flex; gap:6px; align-items:center;">
                <input type="number" name="bl_review_jump_${escapeHtml(key)}" min="1" max="${escapeHtml(String(totalPages))}" value="${escapeHtml(jumpVal)}" placeholder="Page #" data-bl-review-jump="${escapeHtml(key)}" style="width:90px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                <button class="btn btn-secondary btn-small" type="button" data-bl-review-go="${escapeHtml(key)}">Go</button>
              </div>
            ` : ``}
          </div>
          ${open ? renderRows(cache?.buckets?.[key] || [], key) : ``}
        </div>
      `;
    };

    const dur = String(STATE.reviewDuration || 'all');
    const durBtns = [
      { k: 'week', label: 'Last 7 days' },
      { k: 'month', label: 'Last 30 days' },
      { k: 'halfYear', label: 'Last 6 months' },
      { k: 'year', label: 'Last 12 months' },
      { k: 'all', label: 'All time' }
    ];

    return `
      <div class="bl-card">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
          <div>
            <div class="bl-title">Review</div>
            <div class="blunders-muted">All puzzles are shown here (pending + completed).</div>
          </div>
          <div style="text-align:right;">
            <button class="btn btn-secondary btn-small" type="button" data-bl-page-reload title="Reload page">Refresh page</button>
            <div class="blunders-muted" style="margin-top:6px;">If anything looks wrong, click Refresh page.</div>
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          <button class="btn btn-secondary" type="button" data-bl-refresh>Refresh</button>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <span class="blunders-muted" style="margin-right:2px;">Practice:</span>
            <button class="btn btn-primary" type="button" data-bl-review-practice="random" ${cache.totalFiltered ? '' : 'disabled'}>Random</button>
            <button class="btn btn-secondary" type="button" data-bl-review-practice="d1" ${cache.counts?.d1 ? '' : 'disabled'}>1–1.5</button>
            <button class="btn btn-secondary" type="button" data-bl-review-practice="d2" ${cache.counts?.d2 ? '' : 'disabled'}>1.51–2</button>
            <button class="btn btn-secondary" type="button" data-bl-review-practice="d3" ${cache.counts?.d3 ? '' : 'disabled'}>2.01–3</button>
            <button class="btn btn-secondary" type="button" data-bl-review-practice="d4" ${cache.counts?.d4 ? '' : 'disabled'}>3.01+</button>
          </div>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:10px;">
          <span class="blunders-muted" style="margin-right:2px;">Theme:</span>
          <select class="btn btn-secondary btn-small" name="bl_review_theme" data-bl-review-theme style="min-width:220px;">
            ${themeOpts.map(o => `<option value="${escapeHtml(o.k)}" ${theme === o.k ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
          </select>
          <span class="blunders-muted" style="margin-left:6px;">Showing <strong>${escapeHtml(String(cache.totalFiltered))}</strong> of <strong>${escapeHtml(String(cache.totalDurationFiltered || cache.totalAll))}</strong></span>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:10px;">
          <span class="blunders-muted" style="margin-right:2px;">Duration:</span>
          <select class="btn btn-secondary btn-small" name="bl_review_duration" data-bl-review-duration-select style="min-width:220px;">
            ${durBtns.map(o => `<option value="${escapeHtml(o.k)}" ${dur === o.k ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
          </select>
        </div>
        ${cache.totalFiltered ? `
          ${renderBucket('missMate', 'Miss the mate')}
          ${renderBucket('d1', 'Drop 1.00–1.50')}
          ${renderBucket('d2', 'Drop 1.51–2.00')}
          ${renderBucket('d3', 'Drop 2.01–3.00')}
          ${renderBucket('d4', 'Drop 3.01+')}
        ` : `<div class="blunders-muted" style="margin-top:12px;">No puzzles yet.</div>`}
      </div>
    `;
  }

  function renderBoardPreview(light, dark) {
    const squares = displaySquares(false);
    return `
      <div class="bl-board-preview" style="--vcp-board-light:${escapeHtml(light)}; --vcp-board-dark:${escapeHtml(dark)};">
        ${squares.map((sq) => {
          const isLight = !isDarkSquare(sq);
          return `<div class="sq ${isLight ? 'light' : 'dark'}"></div>`;
        }).join('')}
      </div>
    `;
  }

  function renderStudentMasterGamePage() {
    const masters = Array.isArray(STATE.master.masters) ? STATE.master.masters : [];
    const selectedId = String(STATE.master.selectedMasterId || '');
    const selected = masters.find(m => String(m.id || '') === selectedId) || null;
    const puzzle = (() => {
      const pid = String(STATE.master?.selectedPuzzleId || '').trim();
      if (pid) {
        const map = (STATE.master?.byId && typeof STATE.master.byId === 'object') ? STATE.master.byId : {};
        return map[pid] || null;
      }
      // Backward compatibility: old pending list
      return (Array.isArray(STATE.master.pending) && STATE.master.pending.length)
        ? STATE.master.pending[Math.max(0, Math.min(STATE.master.pending.length - 1, Number(STATE.master.currentIndex) || 0))]
        : null;
    })();
    const flip = puzzle ? String(puzzle.playerColor || puzzle.studentColor || '') === 'b' : false;
    const dropVal = puzzle ? Number(puzzle.dropPoints ?? (Number(puzzle.dropCp || 0) / 100)) : 0;
    const infoLine = puzzle ? `${String(puzzle.blunderSan || puzzle.blunderMoveUci || '')} · Drop ${dropVal.toFixed(2)}` : '';
    const ui = (STATE.master?.ui && typeof STATE.master.ui === 'object') ? STATE.master.ui : { pageSize: 50, counts: null, buckets: {} };
    const counts = (ui.counts && typeof ui.counts === 'object') ? ui.counts : null;
    const buckets = (ui.buckets && typeof ui.buckets === 'object') ? ui.buckets : {};

    const renderRows = (arr) => {
      if (!arr.length) return `<div class="blunders-muted" style="margin-top:10px;">No records.</div>`;
      const mini = entry().renderMiniBoardFromFen;
      const curId = String(STATE.master?.selectedPuzzleId || '');
      return `
        <div class="bl-grid" style="grid-template-columns: repeat(1, minmax(0, 1fr));">
          ${arr.map((p) => {
            const pid = String(p.id || '');
            const drop = (Number(p?.dropPoints ?? (Number(p?.dropCp || 0) / 100)) || 0).toFixed(2);
            const title = `${escapeHtml(String(p.blunderSan || p.blunderMoveUci || ''))} · Drop ${escapeHtml(drop)}`;
            const when = escapeHtml(String(p.completedAt || p.createdAt || ''));
            const st = String(p.status || 'pending');
            const badge = st === 'completed'
              ? `<span class="bl-badge" style="background:#e5e7eb; color:#111827;">Completed</span>`
              : `<span class="bl-badge" style="background:#dbeafe; color:#1e40af;">Pending</span>`;
            const isActive = curId && pid === curId;
            return `
              <button class="bl-card" type="button" data-bl-master-pick="${escapeHtml(pid)}" style="text-align:left; display:flex; gap:12px; align-items:center; ${isActive ? 'outline:2px solid #60a5fa;' : ''}">
                ${mini(String(p.startFEN || ''))}
                <div style="min-width:0;">
                  <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <div style="font-weight:950; color:#111827; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${title}</div>
                    ${badge}
                  </div>
                  ${p.gameUrl ? `<div class="blunders-muted" style="margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Source: ${escapeHtml(String(p.gameUrl))}</div>` : ``}
                  ${when ? `<div class="blunders-muted" style="margin-top:4px;">${when}</div>` : ``}
                </div>
              </button>
            `;
          }).join('')}
        </div>
      `;
    };

    const renderBucket = (key, label) => {
      const b = (buckets && buckets[key] && typeof buckets[key] === 'object') ? buckets[key] : {};
      const open = !!b.open;
      const bLoading = !!b.loading;
      const bErr = String(b.error || '');
      const bEntries = Array.isArray(b.entries) ? b.entries : [];
      const total = Number(b.total || 0) || 0;
      const page = Math.max(1, Number(b.page || 1) || 1);
      const totalPages = Math.max(1, Number(b.totalPages || 1) || 1);
      const count = counts ? (Number(counts[key] || 0) || 0) : 0;
      const canPrev = open && !bLoading && page > 1;
      const canNext = open && !bLoading && page < totalPages;
      const jumpVal = String(b.jump || '');
      return `
        <div class="bl-card" style="margin-top:10px;">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button class="btn btn-secondary btn-small" type="button" data-bl-master-bucket-toggle="${escapeHtml(key)}">${open ? 'Hide' : 'Show'}</button>
            <div style="font-weight:900; color:#111827;">${escapeHtml(label)} <span class="blunders-muted">(${escapeHtml(String(count))})</span></div>
            <div style="flex:1;"></div>
            ${open ? `
              <div class="blunders-muted">Page <strong>${escapeHtml(String(page))}</strong> / <strong>${escapeHtml(String(totalPages))}</strong></div>
              <button class="btn btn-secondary btn-small" type="button" data-bl-master-bucket-prev="${escapeHtml(key)}" ${canPrev ? '' : 'disabled'}>Prev</button>
              <button class="btn btn-secondary btn-small" type="button" data-bl-master-bucket-next="${escapeHtml(key)}" ${canNext ? '' : 'disabled'}>Next</button>
              <div style="display:flex; gap:6px; align-items:center;">
                <input type="number" name="bl_master_bucket_jump_${escapeHtml(key)}" min="1" max="${escapeHtml(String(totalPages))}" value="${escapeHtml(jumpVal)}" placeholder="Page #" data-bl-master-bucket-jump="${escapeHtml(key)}" style="width:90px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                <button class="btn btn-secondary btn-small" type="button" data-bl-master-bucket-go="${escapeHtml(key)}" ${bLoading ? 'disabled' : ''}>Go</button>
              </div>
            ` : ``}
          </div>
          ${open ? `
            ${bLoading ? `<div class="blunders-muted" style="margin-top:10px;">Loading...</div>` : ``}
            ${bErr ? `<div class="blunders-muted" style="margin-top:10px; color:#b91c1c;">${escapeHtml(bErr)}</div>` : ``}
            ${!bLoading ? `
              <div class="blunders-muted" style="margin-top:10px;">Total: <strong>${escapeHtml(String(total))}</strong></div>
              <div style="margin-top:10px;">${renderRows(bEntries)}</div>
            ` : ``}
          ` : ``}
        </div>
      `;
    };

    return `
      <div class="bl-card">
        <div class="bl-title">Master Game</div>
        <div class="blunders-muted">Solve blunders from master games (teacher-curated via Master settings).</div>

        <div style="margin-top:12px;">
          <div class="blunders-muted" style="margin-bottom:8px;">Masters</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${masters.map((m) => {
              const mid = String(m.id || '');
              const active = mid === selectedId;
              const pending = Number(m?.counts?.pending || 0);
              return `
                <button class="btn ${active ? 'btn-info' : 'btn-secondary'} btn-small" type="button" data-bl-master="${escapeHtml(mid)}">
                  ${escapeHtml(String(m.name || 'Master'))}${pending ? ` <span style="opacity:.9;">(${pending})</span>` : ''}
                </button>
              `;
            }).join('') || `<div class="blunders-muted">No masters configured yet.</div>`}
          </div>
        </div>

        ${STATE.master.loading ? `<div class="blunders-muted" style="margin-top:12px;">Loading...</div>` : ``}
        ${STATE.master.error ? `<div class="blunders-muted" style="margin-top:12px; color:#b91c1c;">${escapeHtml(STATE.master.error)}</div>` : ``}

        ${selected ? `
          <div class="bl-board-wrap" style="margin-top:12px;">
            <div>
              ${puzzle ? entry().renderBoardForPuzzle(puzzle, flip, STATE.selectedFrom, { fenOverride: (STATE.uiBoard.masterFen || puzzle.startFEN), myMoveUci: (STATE.uiBoard.masterMoveUci || '') }) : `<div class="bl-card" style="box-shadow:none;"><div class="blunders-muted">Pick a puzzle from a bucket below.</div></div>`}
            </div>
            <div>
              <div class="bl-card" style="box-shadow:none;">
                <div style="font-weight:950; color:#111827;">${escapeHtml(String(selected.name || 'Master'))}</div>
                <div class="blunders-muted" style="margin-top:6px;">${escapeHtml(String(selected.username || ''))}</div>
                ${puzzle ? `
                  <div class="blunders-muted" style="margin-top:10px;">${escapeHtml(infoLine)}</div>
                  ${puzzle.gameUrl ? `<div class="blunders-muted" style="margin-top:6px;">Source: <a href="${escapeHtml(String(puzzle.gameUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(String(puzzle.gameUrl))}</a></div>` : ''}
                  <div class="blunders-muted" id="blMasterMsg" style="margin-top:10px;"></div>
                  <button class="btn btn-secondary btn-small" type="button" data-bl-copy-fen="master" style="margin-top:12px;">
                    <span style="display:inline-flex; align-items:center; gap:8px;">
                      <span aria-hidden="true">📋</span>
                      <span>Copy FEN</span>
                    </span>
                  </button>
                ` : ``}
              </div>
              ${entry().renderInlineResultPanel('master')}
            </div>
          </div>
          <div style="margin-top:12px;">
            ${renderBucket('missMate', 'Miss the mate')}
            ${renderBucket('d1', 'Drop 1.00–1.50')}
            ${renderBucket('d2', 'Drop 1.51–2.00')}
            ${renderBucket('d3', 'Drop 2.01–3.00')}
            ${renderBucket('d4', 'Drop 3.01+')}
          </div>
        ` : ``}
      </div>
    `;
  }

  function renderSettingsPage() {
    const tab = String(STATE.settingsTab || 'board');
    const { light, dark } = readBoardColors();
    return `
      <div class="bl-card">
        <div class="bl-title">Settings</div>
        <div class="blunders-muted">Chess Board Setting: adjust board colors. General: coming soon.</div>

        <div class="bl-settings-tabs" role="tablist" aria-label="Settings tabs">
          <button class="bl-settings-tab-btn ${tab === 'board' ? 'active' : ''}" type="button" data-bl-settings-tab="board" role="tab" aria-selected="${tab === 'board' ? 'true' : 'false'}">Chess Board Setting</button>
          <button class="bl-settings-tab-btn ${tab === 'general' ? 'active' : ''}" type="button" data-bl-settings-tab="general" role="tab" aria-selected="${tab === 'general' ? 'true' : 'false'}">General</button>
        </div>

        ${tab === 'board' ? `
          <div class="bl-settings-panel" role="tabpanel" aria-label="Chess Board Setting">
            <div class="bl-settings-grid">
              <div class="bl-settings-row">
                <label for="blBoardLightInput">Light squares</label>
