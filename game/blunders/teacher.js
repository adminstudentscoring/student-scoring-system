// Blunders Teacher module (render + actions). Depends on window.BlundersCore + window.BlundersEntryApi.
(function () {
  const C = window.BlundersCore;
  if (!C) {
    console.error('BlundersCore missing. Load /game/blunders/core.js first.');
    return;
  }

  const {
    escapeHtml,
    STATE,
    todayYmdLocal,
    fmtIsoUtc,
    teacherApi
  } = C;

  function entry() {
    const e = window.BlundersEntryApi;
    if (!e) throw new Error('BlundersEntryApi missing. Load /game/blunders/blunders.js after this file.');
    return e;
  }

  function renderTeacherSidebar() {
    const tab = String(STATE.teacherTab || 'students');
    return `
      <aside class="bl-sidebar" aria-label="Blunders teacher sidebar">
        <div class="bl-side-title">💥 Blunders</div>
        <div class="bl-side-sub">Teacher mode</div>
        <div class="bl-nav">
          <button class="bl-nav-btn ${tab === 'students' ? 'active' : ''}" type="button" data-bl-teacher-tab="students">
            <span class="bl-nav-left"><span class="bl-nav-icon">👥</span>Students</span>
          </button>
          <button class="bl-nav-btn ${tab === 'allBlunders' ? 'active' : ''}" type="button" data-bl-teacher-tab="allBlunders">
            <span class="bl-nav-left"><span class="bl-nav-icon">📚</span>All blunders</span>
          </button>
          <button class="bl-nav-btn ${tab === 'masterGame' ? 'active' : ''}" type="button" data-bl-teacher-tab="masterGame">
            <span class="bl-nav-left"><span class="bl-nav-icon">♟️</span>Master Game</span>
          </button>
          <button class="bl-nav-btn ${tab === 'settings' ? 'active' : ''}" type="button" data-bl-teacher-tab="settings">
            <span class="bl-nav-left"><span class="bl-nav-icon">⚙️</span>Settings</span>
          </button>
        </div>
      </aside>
    `;
  }

  function renderTeacherStudentsPage() {
    const loading = !!STATE.teacher.loading;
    const err = String(STATE.teacher.error || '');
    const allRows = Array.isArray(STATE.teacher.students) ? STATE.teacher.students : [];
    const today = todayYmdLocal();
    const q = String(STATE.teacher.search || '').trim().toLowerCase();
    const rows = !q ? allRows : allRows.filter((s) => {
      const name = String(s?.name || '').toLowerCase();
      const sid = String(s?.studentId || '').toLowerCase();
      const chessId = String(s?.chessComUsername || '').toLowerCase();
      return name.includes(q) || sid.includes(q) || chessId.includes(q);
    });

    const selectedSet = new Set(Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : []);
    const allFilteredSelected = rows.length > 0 && rows.every(s => selectedSet.has(String(s?.id || '')));

    const totalPending = allRows.reduce((a, s) => a + Number(s?.counts?.pending || 0), 0);
    const totalCompleted = allRows.reduce((a, s) => a + Number(s?.counts?.completed || 0), 0);
    const schedule = STATE.teacher.ratingsSchedule;
    const bls = STATE.teacher.blundersSchedule;
    const scheduleLine = schedule
      ? `Automatic Chess.com rating refresh: <strong>daily at ${escapeHtml(String(schedule.time || ''))}</strong>.`
      : `Automatic Chess.com rating refresh: <strong>daily</strong>.`;
    const lastRun = schedule?.lastRunAt ? fmtIsoUtc(schedule.lastRunAt) : '—';
    const nextRun = schedule?.nextRunAt ? fmtIsoUtc(schedule.nextRunAt) : '—';
    const blLine = bls
      ? `Automatic Blunders sync: <strong>daily at ${escapeHtml(String(bls.time || ''))}</strong>.`
      : `Automatic Blunders sync: <strong>daily</strong>.`;
    const blLast = bls?.lastRunAt ? fmtIsoUtc(bls.lastRunAt) : '—';
    const blNext = bls?.nextRunAt ? fmtIsoUtc(bls.nextRunAt) : '—';
    const selectedCount = Array.from(selectedSet).filter((id) => allRows.some(r => String(r.id || '') === id)).length;
    const bulkHistoryGames = Math.max(1, Math.min(500, Number(STATE.teacher.bulkHistoryGames || 200) || 200));

    return `
      <div class="bl-card">
        <div class="bl-title">Teacher · Students</div>
        <div class="blunders-muted">Per-student fetch limit + blunder threshold + date-based sync (date format: <strong>YYYY-MM-DD</strong>).</div>

        <div class="bl-card" style="box-shadow:none; margin-top:10px;">
          <div class="blunders-muted">${scheduleLine}</div>
          <div class="blunders-muted" style="margin-top:6px;">Last run: <strong>${escapeHtml(lastRun)}</strong> · Next run: <strong>${escapeHtml(nextRun)}</strong></div>
          <div class="blunders-muted" style="margin-top:10px;">${blLine}</div>
          <div class="blunders-muted" style="margin-top:6px;">Last run: <strong>${escapeHtml(blLast)}</strong> · Next run: <strong>${escapeHtml(blNext)}</strong></div>
        </div>

        <div class="bl-stats" style="margin-top:12px;">
          <div class="bl-stat">
            <div class="bl-stat-label">Students</div>
            <div class="bl-stat-value">${escapeHtml(String(allRows.length))}</div>
          </div>
          <div class="bl-stat">
            <div class="bl-stat-label">Pending</div>
            <div class="bl-stat-value">${escapeHtml(String(totalPending))}</div>
          </div>
          <div class="bl-stat">
            <div class="bl-stat-label">Completed</div>
            <div class="bl-stat-value">${escapeHtml(String(totalCompleted))}</div>
          </div>
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <div class="bl-teacher-actions">
            <button class="btn btn-secondary" type="button" data-bl-teacher-refresh-students ${loading ? 'disabled' : ''}>Refresh</button>
            <button class="btn btn-primary" type="button" data-bl-teacher-save-students ${loading ? 'disabled' : ''}>Save settings</button>
            <button class="btn btn-secondary" type="button" data-bl-teacher-sync-selected ${(!selectedCount || loading) ? 'disabled' : ''}>Sync selected (${escapeHtml(String(selectedCount))})</button>
            <button class="btn btn-secondary" type="button" data-bl-teacher-force-selected ${(!selectedCount || loading) ? 'disabled' : ''}>Force selected</button>
            <button class="btn btn-secondary" type="button" data-bl-teacher-complete-selected ${(!selectedCount || loading) ? 'disabled' : ''}>Complete selected</button>
          </div>
          <div class="bl-teacher-actions" style="grid-template-columns: 140px 1fr 1fr;">
            <select class="btn btn-secondary" data-bl-teacher-bulk-history style="min-width:140px;" ${loading ? 'disabled' : ''}>
              ${[100, 200, 300, 500].map((n) => `<option value="${n}" ${Number(bulkHistoryGames) === n ? 'selected' : ''}>History N: ${n}</option>`).join('')}
            </select>
            <button class="btn btn-secondary" type="button" data-bl-teacher-history-selected ${(!selectedCount || loading) ? 'disabled' : ''}>History selected</button>
            <button class="btn btn-secondary" type="button" data-bl-teacher-history-force-selected ${(!selectedCount || loading) ? 'disabled' : ''}>History Force selected</button>
          </div>
        </div>
        ${loading ? `<div class="blunders-muted" style="margin-top:10px;">Loading...</div>` : ``}
        ${err ? `<div class="blunders-muted" style="margin-top:10px; color:#b91c1c;">${escapeHtml(err)}</div>` : ``}

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
          <div style="flex:1 1 260px;">
            <div class="blunders-muted">Search</div>
            <input type="text" value="${escapeHtml(String(STATE.teacher.search || ''))}" placeholder="Search name / student id / chess.com id" data-bl-teacher-search style="width:100%; padding:8px 10px; border:1px solid #e5e7eb; border-radius:12px;">
          </div>
          <div>
            <div class="blunders-muted">Set selected Max games/day</div>
            <div style="display:flex; gap:8px; align-items:center;">
              <input type="number" min="1" max="50" step="1" value="${escapeHtml(String(Number(STATE.teacher.bulkMaxGames || 10) || 10))}" data-bl-teacher-bulk-max style="width:120px; padding:8px 10px; border:1px solid #e5e7eb; border-radius:12px;">
              <button class="btn btn-secondary" type="button" data-bl-teacher-apply-max-selected ${loading ? 'disabled' : ''}>Apply</button>
            </div>
          </div>
          <div>
            <div class="blunders-muted">Set selected Threshold</div>
            <div style="display:flex; gap:8px; align-items:center;">
              <input type="number" min="0.1" max="10" step="0.1" value="${escapeHtml(String(Number(STATE.teacher.bulkThreshold || 1) || 1))}" data-bl-teacher-bulk-thr style="width:120px; padding:8px 10px; border:1px solid #e5e7eb; border-radius:12px;">
              <button class="btn btn-secondary" type="button" data-bl-teacher-apply-thr-selected ${loading ? 'disabled' : ''}>Apply</button>
            </div>
          </div>
        </div>

        <div style="margin-top:12px; overflow:auto;">
          <table style="width:100%; border-collapse:separate; border-spacing:0 8px;">
            <thead>
              <tr class="blunders-muted" style="text-align:left;">
                <th style="padding:6px 8px; width:42px;">
                  <input type="checkbox" data-bl-teacher-select-all ${allFilteredSelected ? 'checked' : ''} aria-label="Select all">
                </th>
                <th style="padding:6px 8px;">Student</th>
                <th style="padding:6px 8px;">Chess.com rating</th>
                <th style="padding:6px 8px;">Pending</th>
                <th style="padding:6px 8px;">Completed</th>
                <th style="padding:6px 8px;">Analyzed games</th>
                <th style="padding:6px 8px;">Max games/day</th>
                <th style="padding:6px 8px;">Threshold</th>
                <th style="padding:6px 8px;">Date</th>
                <th style="padding:6px 8px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((s) => {
                const sid = String(s.id || '');
                const nm = String(s.name || '');
                const sid2 = String(s.studentId || '');
                const cfg = s.config || {};
                const maxGames = Number((STATE.teacher.edits.student?.[sid]?.maxGamesPerDay) ?? cfg.maxGamesPerDay ?? 10) || 10;
                const thr = Number((STATE.teacher.edits.student?.[sid]?.thresholdPoints) ?? cfg.thresholdPoints ?? 1.0) || 1.0;
                const chessId = String(s.chessComUsername || '');
                const r = (s.chessComRating === null || s.chessComRating === undefined) ? '' : String(s.chessComRating);
                const rs = String(s.chessComRatingSource || '');
                const ratingLabel = r ? `${r}${rs ? ` (${rs})` : ''}` : '—';
                const isChecked = selectedSet.has(sid);
                const historyVal = Number(STATE.teacher?.historyScanN?.[sid] || 200) || 200;
                const dateVal = String(STATE.teacher?.dateByStudent?.[sid] || '') || today;
                return `
                  <tr style="background:#fff; border:1px solid #e5e7eb;">
                    <td style="padding:10px 8px; border-radius:12px 0 0 12px;">
                      <input type="checkbox" data-bl-teacher-select="${escapeHtml(sid)}" ${isChecked ? 'checked' : ''} aria-label="Select student">
                    </td>
                    <td style="padding:10px 8px;">
                      <div style="font-weight:900; color:#111827;">${escapeHtml(nm)}</div>
                      <div class="blunders-muted">${escapeHtml(sid2)}${chessId ? ` · ${escapeHtml(chessId)}` : ''}</div>
                    </td>
                    <td style="padding:10px 8px;">${escapeHtml(ratingLabel)}</td>
                    <td style="padding:10px 8px;">${escapeHtml(String(s?.counts?.pending || 0))}</td>
                    <td style="padding:10px 8px;">${escapeHtml(String(s?.counts?.completed || 0))}</td>
                    <td style="padding:10px 8px;">${escapeHtml(String(s?.analyzedGamesTotal || 0))}</td>
                    <td style="padding:10px 8px;">
                      <input type="number" min="1" max="50" step="1" value="${escapeHtml(String(maxGames))}" data-bl-teacher-student-max="${escapeHtml(sid)}" style="width:90px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                    </td>
                    <td style="padding:10px 8px;">
                      <input type="number" min="0.1" max="10" step="0.1" value="${escapeHtml(String(thr))}" data-bl-teacher-student-thr="${escapeHtml(sid)}" style="width:90px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                    </td>
                    <td style="padding:10px 8px;">
                      <input type="text" value="${escapeHtml(dateVal)}" inputmode="numeric" placeholder="YYYY-MM-DD" data-bl-teacher-student-date="${escapeHtml(sid)}" style="width:110px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                    </td>
                    <td style="padding:10px 8px; border-radius:0 12px 12px 0; white-space:nowrap;">
                      <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-sync-student="${escapeHtml(sid)}">Sync</button>
                      <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-sync-student-force="${escapeHtml(sid)}">Force</button>
                      <span style="display:inline-flex; gap:6px; align-items:center; margin-left:8px;">
                        <select data-bl-teacher-history-n="${escapeHtml(sid)}" style="padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px; font-size:12px;">
                          ${[100,200,300,500].map((n) => `<option value="${n}" ${Number(historyVal) === n ? 'selected' : ''}>${n}</option>`).join('')}
                        </select>
                        <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-history-scan="${escapeHtml(sid)}">History</button>
                        <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-history-scan-force="${escapeHtml(sid)}">History Force</button>
                      </span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderTeacherAllBlundersPage() {
    const loading = !!STATE.teacher.loading;
    const err = String(STATE.teacher.error || '');
    const duration = String(STATE.teacher.allDuration || 'all');
    const rating = String(STATE.teacher.allRating || 'any');
    const entries = Array.isArray(STATE.teacher.allBlunders) ? STATE.teacher.allBlunders : [];

    const durationBtns = [
      { k: 'week', label: 'Last week' },
      { k: 'month', label: 'Last month' },
      { k: 'halfYear', label: 'Last 6 months' },
      { k: 'year', label: 'Last year' },
      { k: 'all', label: 'All time' }
    ];
    const ratingOpts = [
      { k: 'any', label: 'Any rating' },
      { k: '100-400', label: '100–400' },
      { k: '401-700', label: '401–700' },
      { k: '701-1000', label: '701–1000' },
      { k: '1001-1500', label: '1001–1500' },
      { k: '1501-2000', label: '1501–2000' },
      { k: '2000up', label: '2000+' }
    ];

    const dropOf = (p) => Number(p?.dropPoints ?? (Number(p?.dropCp || 0) / 100)) || 0;
    const isMissMate = (p) => {
      const bestCp = Number(p?.bestCp ?? 0);
      return Number.isFinite(bestCp) && Math.abs(bestCp) >= 99999;
    };
    const groups = { missMate: [], d1: [], d2: [], d3: [], d4: [] };
    for (const p of entries) {
      if (isMissMate(p)) { groups.missMate.push(p); continue; }
      const d = dropOf(p);
      if (d >= 1.0 && d <= 1.5) groups.d1.push(p);
      else if (d > 1.5 && d <= 2.0) groups.d2.push(p);
      else if (d > 2.0 && d <= 3.0) groups.d3.push(p);
      else if (d > 3.0) groups.d4.push(p);
      else groups.d1.push(p);
    }

    const renderRows = (arr) => {
      if (!arr.length) return `<div class="blunders-muted" style="margin-top:10px;">No records.</div>`;
      const mini = entry().renderMiniBoardFromFen;
      return `
        <div class="bl-grid" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
          ${arr.slice(0, 200).map((p) => {
            const sid = escapeHtml(String(p.studentStudentId || ''));
            const sname = escapeHtml(String(p.studentName || 'Student'));
            const r = (p.chessComRating === null || p.chessComRating === undefined) ? '' : `${escapeHtml(String(p.chessComRating))}${p.chessComRatingSource ? ` (${escapeHtml(String(p.chessComRatingSource))})` : ''}`;
            const when = escapeHtml(String(p.completedAt || ''));
            const drop = dropOf(p).toFixed(2);
            const title = `${escapeHtml(String(p.blunderSan || p.blunderMoveUci || ''))} · Drop ${drop}`;
            return `
              <div class="bl-card" style="display:flex; gap:12px; align-items:center;">
                ${mini(String(p.startFEN || ''))}
                <div style="min-width:0;">
                  <div style="font-weight:950; color:#111827; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${sname}${sid ? ` <span style="opacity:.7;">(${sid})</span>` : ''}</div>
                  <div class="blunders-muted" style="margin-top:4px;">Rating: <strong>${r || '—'}</strong></div>
                  <div class="blunders-muted" style="margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${title}</div>
                  ${p.gameUrl ? `<div class="blunders-muted" style="margin-top:4px;">Source: <a href="${escapeHtml(String(p.gameUrl))}" target="_blank" rel="noopener noreferrer">Chess.com</a></div>` : ``}
                  ${when ? `<div class="blunders-muted" style="margin-top:4px;">${when}</div>` : ``}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        ${entries.length > 200 ? `<div class="blunders-muted" style="margin-top:10px;">Showing 200 of ${entries.length}.</div>` : ``}
      `;
    };

    const renderGroup = (label, arr, open) => `
      <details ${open ? 'open' : ''} style="margin-top:10px;">
        <summary class="blunders-muted" style="cursor:pointer;"><strong>${escapeHtml(label)}</strong> (${arr.length})</summary>
        <div style="margin-top:10px;">${renderRows(arr)}</div>
      </details>
    `;

    return `
      <div class="bl-card">
        <div class="bl-title">All blunders</div>
        <div class="blunders-muted">Same as Review, but across all students in your organization.</div>

        <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          ${durationBtns.map(b => `<button class="btn ${duration === b.k ? 'btn-info' : 'btn-secondary'} btn-small" type="button" data-bl-teacher-all-duration="${escapeHtml(b.k)}">${escapeHtml(b.label)}</button>`).join('')}
          <div style="flex:1;"></div>
          <select class="btn btn-secondary btn-small" data-bl-teacher-all-rating style="min-width:180px;">
            ${ratingOpts.map(o => `<option value="${escapeHtml(o.k)}" ${rating === o.k ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
          </select>
          <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-refresh-all>Refresh</button>
        </div>

        ${loading ? `<div class="blunders-muted" style="margin-top:12px;">Loading...</div>` : ``}
        ${err ? `<div class="blunders-muted" style="margin-top:12px; color:#b91c1c;">${escapeHtml(err)}</div>` : ``}

        ${!loading ? `
          <div style="margin-top:12px;">
            ${renderGroup('Miss the mate', groups.missMate, true)}
            ${renderGroup('Drop 1.00–1.50', groups.d1, true)}
            ${renderGroup('Drop 1.51–2.00', groups.d2, false)}
            ${renderGroup('Drop 2.01–3.00', groups.d3, false)}
            ${renderGroup('Drop 3.01+', groups.d4, false)}
          </div>
        ` : ``}
      </div>
    `;
  }

  function renderTeacherMasterGamePage() {
    const loading = !!STATE.teacher.loading;
    const err = String(STATE.teacher.error || '');
    const masters = Array.isArray(STATE.teacher.masters) ? STATE.teacher.masters : [];
    const cfg = STATE.teacher.masterConfig || { maxGamesPerDay: 10, thresholdPoints: 1.0 };
    const maxGames = Number((STATE.teacher.edits.masterCfg?.maxGamesPerDay) ?? cfg.maxGamesPerDay ?? 10) || 10;
    const thr = Number((STATE.teacher.edits.masterCfg?.thresholdPoints) ?? cfg.thresholdPoints ?? 1.0) || 1.0;
    const today = todayYmdLocal();
    const editMasters = Array.isArray(STATE.teacher.edits.masters) ? STATE.teacher.edits.masters : null;
    const rows = editMasters || masters;

    return `
      <div class="bl-card">
        <div class="bl-title">Teacher · Master Game</div>
        <div class="blunders-muted">Configure masters + run the same Blunder analysis on their games.</div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
          <button class="btn btn-secondary" type="button" data-bl-teacher-refresh-masters ${loading ? 'disabled' : ''}>Refresh</button>
          <button class="btn btn-secondary" type="button" data-bl-teacher-masters-presets ${loading ? 'disabled' : ''}>Presets</button>
          <button class="btn btn-secondary" type="button" data-bl-teacher-masters-add ${loading ? 'disabled' : ''}>Add master</button>
          <button class="btn btn-primary" type="button" data-bl-teacher-save-masters ${loading ? 'disabled' : ''}>Save</button>
        </div>

        <div style="margin-top:12px; display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
          <div>
            <div class="blunders-muted">Master max games/day</div>
            <input type="number" min="1" max="50" step="1" value="${escapeHtml(String(maxGames))}" data-bl-teacher-mastercfg-max style="width:130px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
          </div>
          <div>
            <div class="blunders-muted">Master threshold</div>
            <input type="number" min="0.1" max="10" step="0.1" value="${escapeHtml(String(thr))}" data-bl-teacher-mastercfg-thr style="width:130px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
          </div>
          <button class="btn btn-secondary" type="button" data-bl-teacher-save-mastercfg>Save config</button>
        </div>

        ${loading ? `<div class="blunders-muted" style="margin-top:10px;">Loading...</div>` : ``}
        ${err ? `<div class="blunders-muted" style="margin-top:10px; color:#b91c1c;">${escapeHtml(err)}</div>` : ``}

        <div style="margin-top:12px; overflow:auto;">
          <table style="width:100%; border-collapse:separate; border-spacing:0 8px;">
            <thead>
              <tr class="blunders-muted" style="text-align:left;">
                <th style="padding:6px 8px;">Name</th>
                <th style="padding:6px 8px;">Chess.com username</th>
                <th style="padding:6px 8px;">Total puzzles</th>
                <th style="padding:6px 8px;">Sync date</th>
                <th style="padding:6px 8px;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((m, i) => {
                const mid = String(m.id || '');
                const name = String(m.name || '');
                const user = String(m.username || '');
                const total = Number(m?.counts?.total || 0);
                const dateVal = String(STATE.teacher?.dateByMaster?.[mid] || '') || today;
                return `
                  <tr style="background:#fff; border:1px solid #e5e7eb;">
                    <td style="padding:10px 8px; border-radius:12px 0 0 12px;">
                      <input type="text" value="${escapeHtml(name)}" data-bl-teacher-master-name="${escapeHtml(String(i))}" style="width:180px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                      <div class="blunders-muted" style="margin-top:4px;">id: ${escapeHtml(mid || '(auto)')}</div>
                    </td>
                    <td style="padding:10px 8px;">
                      <input type="text" value="${escapeHtml(user)}" data-bl-teacher-master-user="${escapeHtml(String(i))}" style="width:220px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                    </td>
                    <td style="padding:10px 8px;">${escapeHtml(String(total))}</td>
                    <td style="padding:10px 8px;">
                      <input type="date" value="${escapeHtml(dateVal)}" data-bl-teacher-master-date="${escapeHtml(mid)}" style="padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                    </td>
                    <td style="padding:10px 8px; border-radius:0 12px 12px 0;">
                      <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-sync-master="${escapeHtml(mid)}">Sync</button>
                      <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-sync-master-force="${escapeHtml(mid)}">Force</button>
                      <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-master-del="${escapeHtml(String(i))}">Remove</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function teacherLoad(tab) {
    STATE.teacher.loading = true;
    STATE.teacher.error = '';
    entry().render();
    try {
      if (tab === 'masterGame') {
        const data = await teacherApi('/teachers/blunders/masters-summary');
        STATE.teacher.masters = Array.isArray(data?.masters) ? data.masters : [];
        STATE.teacher.masterConfig = data?.masterConfig || { maxGamesPerDay: 10, thresholdPoints: 1.0 };
        if (!Array.isArray(STATE.teacher.edits.masters)) STATE.teacher.edits.masters = STATE.teacher.masters.map((m) => ({ ...m }));
      } else if (tab === 'allBlunders') {
        const dur = String(STATE.teacher.allDuration || 'all');
        const rt = String(STATE.teacher.allRating || 'any');
        const qs = `?duration=${encodeURIComponent(dur)}&rating=${encodeURIComponent(rt)}`;
        const data = await teacherApi(`/teachers/blunders/all-blunders${qs}`);
        STATE.teacher.allBlunders = Array.isArray(data?.entries) ? data.entries : [];
      } else if (tab === 'settings') {
        // Reuse Settings UI (board colors), no server call needed.
      } else {
        const data = await teacherApi('/teachers/blunders/students-summary');
        STATE.teacher.students = Array.isArray(data?.students) ? data.students : [];
        STATE.teacher.ratingsSchedule = data?.ratingsSchedule || null;
        STATE.teacher.blundersSchedule = data?.blundersSchedule || null;
      }
      STATE.teacher.loading = false;
      STATE.teacher.lastLoadedAt = new Date().toISOString();
      entry().render();
    } catch (e) {
      STATE.teacher.loading = false;
      STATE.teacher.error = String(e?.message || e);
      entry().render();
    }
  }

  async function teacherSaveStudentSettings() {
    const map = STATE.teacher.edits.student && typeof STATE.teacher.edits.student === 'object' ? STATE.teacher.edits.student : {};
    await teacherApi('/teachers/blunders/settings', { method: 'PUT', body: { student: map } });
  }

  async function teacherSaveMasters() {
    const masters = Array.isArray(STATE.teacher.edits.masters) ? STATE.teacher.edits.masters : [];
    await teacherApi('/teachers/blunders/settings', { method: 'PUT', body: { masters } });
  }

  async function teacherSaveMasterConfig() {
    const cfg = STATE.teacher.edits.masterCfg && typeof STATE.teacher.edits.masterCfg === 'object' ? STATE.teacher.edits.masterCfg : null;
    if (!cfg) return;
    await teacherApi('/teachers/blunders/settings', { method: 'PUT', body: { master: cfg } });
  }

  async function teacherSyncStudent(studentId, hkDayKey, force) {
    const sid = String(studentId || '').trim();
    if (!sid) return;
    const edit = STATE.teacher.edits.student?.[sid] || {};
    const maxGamesPerDay = edit.maxGamesPerDay;
    const thresholdPoints = edit.thresholdPoints;
    await teacherApi('/teachers/blunders/sync-student', {
      method: 'POST',
      body: { studentId: sid, hkDayKey, force: !!force, maxGamesPerDay, thresholdPoints }
    });
  }

  async function teacherHistoryScanStudent(studentId, historyGames, force) {
    const sid = String(studentId || '').trim();
    if (!sid) return;
    const n = Math.max(1, Math.min(500, Number(historyGames || 0) || 0));
    if (!n) return;
    // Use background job API to avoid long-running requests/timeouts.
    const out = await teacherApi('/teachers/blunders/jobs/history-scan', {
      method: 'POST',
      body: { studentIds: [sid], historyGames: n, force: !!force }
    });
    const jobId = out?.jobId ? String(out.jobId) : '';
    if (jobId) {
      STATE.teacher.error = `History queued (job: ${jobId}). Refresh later to see updated counts.`;
      entry().render();
    }
    return out;
  }

  async function teacherSyncMaster(masterId, hkDayKey, force) {
    const mid = String(masterId || '').trim();
    if (!mid) return;
    await teacherApi('/teachers/blunders/sync-master', { method: 'POST', body: { masterId: mid, hkDayKey, force: !!force } });
  }

  async function teacherBulkSyncSelected(force) {
    const selected = Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : [];
    const ids = selected.filter(Boolean);
    if (!ids.length) return;
    const allRows = Array.isArray(STATE.teacher.students) ? STATE.teacher.students : [];
    const idSet = new Set(allRows.map(s => String(s.id || '')));
    const valid = ids.filter(id => idSet.has(id));
    if (!valid.length) return;

    STATE.teacher.loading = true;
    STATE.teacher.error = '';
    entry().render();
    try {
      for (let i = 0; i < valid.length; i++) {
        const sid = valid[i];
        const hkDayKey = String(STATE.teacher?.dateByStudent?.[sid] || '') || todayYmdLocal();
        STATE.teacher.error = `Syncing ${i + 1}/${valid.length}...`;
        entry().render();
        await teacherSyncStudent(sid, hkDayKey, !!force);
      }
      STATE.teacher.error = '';
    } catch (e) {
      STATE.teacher.error = String(e?.message || e);
    } finally {
      STATE.teacher.loading = false;
      await teacherLoad('students').catch(() => {});
    }
  }

  async function teacherBulkCompleteSelected() {
    const selected = Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : [];
    const ids = selected.filter(Boolean);
    if (!ids.length) return;
    const allRows = Array.isArray(STATE.teacher.students) ? STATE.teacher.students : [];
    const idSet = new Set(allRows.map(s => String(s.id || '')));
    const valid = ids.filter(id => idSet.has(id));
    if (!valid.length) return;

    STATE.teacher.loading = true;
    STATE.teacher.error = '';
    entry().render();
    try {
      STATE.teacher.error = `Completing pending puzzles for ${valid.length} student(s)...`;
      entry().render();
      await teacherApi('/teachers/blunders/complete-pending', { method: 'POST', body: { studentIds: valid } });
      STATE.teacher.error = '';
    } catch (e) {
      STATE.teacher.error = String(e?.message || e);
    } finally {
      STATE.teacher.loading = false;
      await teacherLoad('students').catch(() => {});
    }
  }

  async function teacherBulkHistoryScanSelected(force) {
    const selected = Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : [];
    const ids = selected.filter(Boolean);
    if (!ids.length) return;
    const allRows = Array.isArray(STATE.teacher.students) ? STATE.teacher.students : [];
    const idSet = new Set(allRows.map(s => String(s.id || '')));
    const valid = ids.filter(id => idSet.has(id));
    if (!valid.length) return;

    const n = Math.max(1, Math.min(500, Number(STATE.teacher.bulkHistoryGames || 200) || 200));

    STATE.teacher.loading = true;
    STATE.teacher.error = '';
    entry().render();
    try {
      const out = await teacherApi('/teachers/blunders/jobs/history-scan', {
        method: 'POST',
        body: { studentIds: valid, historyGames: n, force: !!force }
      });
      const jobId = out?.jobId ? String(out.jobId) : '';
      STATE.teacher.error = jobId
        ? `History queued for ${valid.length} student(s) (job: ${jobId}). Refresh later to see updates.`
        : `History queued for ${valid.length} student(s). Refresh later to see updates.`;
    } catch (e) {
      STATE.teacher.error = String(e?.message || e);
    } finally {
      STATE.teacher.loading = false;
      entry().render();
    }
  }

  window.BlundersTeacher = {
    renderTeacherSidebar,
    renderTeacherStudentsPage,
    renderTeacherAllBlundersPage,
    renderTeacherMasterGamePage,
    teacherLoad,
    teacherSaveStudentSettings,
    teacherSaveMasters,
    teacherSaveMasterConfig,
    teacherSyncStudent,
    teacherHistoryScanStudent,
    teacherSyncMaster,
    teacherBulkSyncSelected,
    teacherBulkCompleteSelected,
    teacherBulkHistoryScanSelected
  };
})();


