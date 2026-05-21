                  <div class="blunders-muted" style="margin-top:4px;">Rating: <strong>${r || '—'}</strong></div>
                  <div class="blunders-muted" style="margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${title}</div>
                  ${p.gameUrl ? `<div class="blunders-muted" style="margin-top:4px;">Source: <a href="${escapeHtml(String(p.gameUrl))}" target="_blank" rel="noopener noreferrer">Chess.com</a></div>` : ``}
                  ${when ? `<div class="blunders-muted" style="margin-top:4px;">${when}</div>` : ``}
                  ${tagLine}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    };

    const bucketDefs = [
      { key: 'missMate', label: 'Miss the mate' },
      { key: 'd1', label: 'Drop 1.00–1.50' },
      { key: 'd2', label: 'Drop 1.51–2.00' },
      { key: 'd3', label: 'Drop 2.01–3.00' },
      { key: 'd4', label: 'Drop 3.01+' }
    ];

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
            <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-all-toggle="${escapeHtml(key)}">${open ? 'Hide' : 'Show'}</button>
            <div style="font-weight:900; color:#111827;">${escapeHtml(label)} <span class="blunders-muted">(${escapeHtml(String(count))})</span></div>
            <div style="flex:1;"></div>
            ${open ? `
              <div class="blunders-muted">Page <strong>${escapeHtml(String(page))}</strong> / <strong>${escapeHtml(String(totalPages))}</strong></div>
              <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-all-prev="${escapeHtml(key)}" ${canPrev ? '' : 'disabled'}>Prev</button>
              <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-all-next="${escapeHtml(key)}" ${canNext ? '' : 'disabled'}>Next</button>
              <div style="display:flex; gap:6px; align-items:center;">
                <input type="number" name="bl_teacher_all_jump_${escapeHtml(key)}" min="1" max="${escapeHtml(String(totalPages))}" value="${escapeHtml(jumpVal)}" placeholder="Page #" data-bl-teacher-all-jump="${escapeHtml(key)}" style="width:90px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-all-go="${escapeHtml(key)}" ${bLoading ? 'disabled' : ''}>Go</button>
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
        <div class="bl-title">All blunders</div>
        <div class="blunders-muted">Same as Review, but across all students (and masters) in your organization.</div>

        <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          ${durationBtns.map(b => `<button class="btn ${duration === b.k ? 'btn-info' : 'btn-secondary'} btn-small" type="button" data-bl-teacher-all-duration="${escapeHtml(b.k)}">${escapeHtml(b.label)}</button>`).join('')}
          <div style="flex:1;"></div>
          <input class="btn btn-secondary btn-small" id="blTeacherAllTagSearch" name="bl_teacher_all_tag_search" data-bl-teacher-all-tag-search list="blTeacherAllTagList" value="${escapeHtml(tagSearch)}" placeholder="Search theme..." autocomplete="off" style="min-width:220px; text-align:left;">
          <datalist id="blTeacherAllTagList">
            ${tagOpts.filter(o => o.k !== 'any').slice(0, 200).map(o => `<option value="${escapeHtml(o.k)}"></option>`).join('')}
          </datalist>
          <select class="btn btn-secondary btn-small" name="bl_teacher_all_tag" data-bl-teacher-all-tag style="min-width:200px;">
            ${tagOpts.map(o => `<option value="${escapeHtml(o.k)}" ${selectedTag === o.k ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
          </select>
          <select class="btn btn-secondary btn-small" name="bl_teacher_all_rating" data-bl-teacher-all-rating style="min-width:180px;">
            ${ratingOpts.map(o => `<option value="${escapeHtml(o.k)}" ${rating === o.k ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
          </select>
          <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-refresh-all>Refresh</button>
          <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-all-stats>Storage stats</button>
        </div>

        ${loading ? `<div class="blunders-muted" style="margin-top:12px;">Loading...</div>` : ``}
        ${err ? `<div class="blunders-muted" style="margin-top:12px; color:#b91c1c;">${escapeHtml(err)}</div>` : ``}
        ${stats ? `
          <div class="blunders-muted" style="margin-top:12px;">
            <div style="font-weight:900; color:#111827;">Storage stats</div>
            <div style="margin-top:6px;">Puzzles file: <strong>${escapeHtml(String(stats?.files?.puzzles?.sizeBytes || 0))}</strong> bytes</div>
            <div style="margin-top:6px;">Org puzzles: <strong>${escapeHtml(String(stats?.counts?.total || 0))}</strong> · MissMate: <strong>${escapeHtml(String(stats?.counts?.missMate || 0))}</strong> · d1: <strong>${escapeHtml(String(stats?.counts?.d1 || 0))}</strong> · d2: <strong>${escapeHtml(String(stats?.counts?.d2 || 0))}</strong> · d3: <strong>${escapeHtml(String(stats?.counts?.d3 || 0))}</strong> · d4: <strong>${escapeHtml(String(stats?.counts?.d4 || 0))}</strong></div>
            <div style="margin-top:6px;">Analyzed game keys (org): <strong>${escapeHtml(String(stats?.analyzedKeys || 0))}</strong></div>
            <div style="margin-top:6px;">Updated: ${escapeHtml(String(stats?.now || ''))}</div>
          </div>
        ` : ``}

        ${!loading ? `
          <div style="margin-top:12px;">
            ${bucketDefs.map(b => renderBucket(b.key, b.label)).join('')}
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
            <input type="number" name="bl_teacher_mastercfg_max" min="1" max="50" step="1" value="${escapeHtml(String(maxGames))}" data-bl-teacher-mastercfg-max style="width:130px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
          </div>
          <div>
            <div class="blunders-muted">Master threshold</div>
            <input type="number" name="bl_teacher_mastercfg_thr" min="0.1" max="10" step="0.1" value="${escapeHtml(String(thr))}" data-bl-teacher-mastercfg-thr style="width:130px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
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
                <th style="padding:6px 8px;">Chess.com rating</th>
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
                const mr = (m?.rating === null || m?.rating === undefined) ? null : Number(m.rating);
                const ms = m?.ratingSource ? String(m.ratingSource) : '';
                const ratingLabel = (Number.isFinite(mr) && mr > 0) ? `${mr}${ms ? ` (${ms})` : ''}` : '—';
                const dateVal = String(STATE.teacher?.dateByMaster?.[mid] || '') || today;
                const historyVal = Number(STATE.teacher?.historyScanNMaster?.[mid] || 200) || 200;
                return `
                  <tr style="background:#fff; border:1px solid #e5e7eb;">
                    <td style="padding:10px 8px; border-radius:12px 0 0 12px;">
                      <input type="text" name="bl_teacher_master_name_${escapeHtml(String(i))}" value="${escapeHtml(name)}" data-bl-teacher-master-name="${escapeHtml(String(i))}" style="width:180px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                      <div class="blunders-muted" style="margin-top:4px;">id: ${escapeHtml(mid || '(auto)')}</div>
                    </td>
                    <td style="padding:10px 8px;">
                      <input type="text" name="bl_teacher_master_user_${escapeHtml(String(i))}" value="${escapeHtml(user)}" data-bl-teacher-master-user="${escapeHtml(String(i))}" style="width:220px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                    </td>
                    <td style="padding:10px 8px;">${escapeHtml(ratingLabel)}</td>
                    <td style="padding:10px 8px;">${escapeHtml(String(total))}</td>
                    <td style="padding:10px 8px;">
                      <input type="date" name="bl_teacher_master_date_${escapeHtml(mid)}" value="${escapeHtml(dateVal)}" data-bl-teacher-master-date="${escapeHtml(mid)}" style="padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                    </td>
                    <td style="padding:10px 8px; border-radius:0 12px 12px 0;">
                      <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-sync-master="${escapeHtml(mid)}">Sync</button>
                      <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-sync-master-force="${escapeHtml(mid)}">Force</button>
                      <span style="display:inline-flex; gap:6px; align-items:center; margin-left:8px;">
                        <select name="bl_teacher_master_history_n_${escapeHtml(mid)}" data-bl-teacher-master-history-n="${escapeHtml(mid)}" style="padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px; font-size:12px;">
                          ${[100,200,300,500].map((n) => `<option value="${n}" ${Number(historyVal) === n ? 'selected' : ''}>${n}</option>`).join('')}
                        </select>
                        <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-history-scan-master="${escapeHtml(mid)}">History</button>
                        <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-history-scan-master-force="${escapeHtml(mid)}">History Force</button>
                      </span>
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
        const tg = String(STATE.teacher.allTag || 'any');
        const qs = `?duration=${encodeURIComponent(dur)}&rating=${encodeURIComponent(rt)}&tag=${encodeURIComponent(tg)}`;
        const data = await teacherApi(`/teachers/blunders/all-blunders${qs}`);
        if (!STATE.teacher.allUi || typeof STATE.teacher.allUi !== 'object') STATE.teacher.allUi = { pageSize: 50, counts: null, buckets: {} };
        STATE.teacher.allUi.pageSize = 50;
        STATE.teacher.allUi.counts = (data?.counts && typeof data.counts === 'object') ? data.counts : null;
        STATE.teacher.allUi.tagCounts = (data?.tagCounts && typeof data.tagCounts === 'object') ? data.tagCounts : null;
        if (!STATE.teacher.allUi.buckets || typeof STATE.teacher.allUi.buckets !== 'object') STATE.teacher.allUi.buckets = {};
        // Reset buckets (default collapsed)
        const keys = ['missMate', 'd1', 'd2', 'd3', 'd4'];
        for (const k of keys) {
          STATE.teacher.allUi.buckets[k] = { open: false, page: 1, totalPages: 1, total: 0, entries: [], jump: '', loading: false, error: '' };
        }
      } else if (tab === 'settings') {
        // Reuse Settings UI (board colors), no server call needed.
      } else {
        const data = await teacherApi('/teachers/blunders/students-summary');
        STATE.teacher.students = Array.isArray(data?.students) ? data.students : [];
        STATE.teacher.ratingsSchedule = data?.ratingsSchedule || null;
        STATE.teacher.blundersSchedule = data?.blundersSchedule || null;
        // Best-effort: refresh tag stats in background (won't fail students load).
        try { await teacherLoadTagStats(); } catch {}
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

  function ensureAllUi() {
    if (!STATE.teacher.allUi || typeof STATE.teacher.allUi !== 'object') {
      STATE.teacher.allUi = { pageSize: 50, counts: null, buckets: {} };
    }
    if (!STATE.teacher.allUi.buckets || typeof STATE.teacher.allUi.buckets !== 'object') {
      STATE.teacher.allUi.buckets = {};
    }
    const keys = ['missMate', 'd1', 'd2', 'd3', 'd4'];
    for (const k of keys) {
      if (!STATE.teacher.allUi.buckets[k] || typeof STATE.teacher.allUi.buckets[k] !== 'object') {
        STATE.teacher.allUi.buckets[k] = { open: false, page: 1, totalPages: 1, total: 0, entries: [], jump: '', loading: false, error: '' };
      }
    }
    return STATE.teacher.allUi;
  }

  async function teacherLoadAllBlundersBucket(bucketKey, page) {
    const key = String(bucketKey || '').trim();
    if (!['missMate', 'd1', 'd2', 'd3', 'd4'].includes(key)) return;
    const ui = ensureAllUi();
    const b = ui.buckets[key];
    b.loading = true;
    b.error = '';
    b.open = true;
    entry().render();
    try {
      const dur = String(STATE.teacher.allDuration || 'all');
      const rt = String(STATE.teacher.allRating || 'any');
      const tg = String(STATE.teacher.allTag || 'any');
      const p = Math.max(1, Number(page || 1) || 1);
      const qs = `?duration=${encodeURIComponent(dur)}&rating=${encodeURIComponent(rt)}&tag=${encodeURIComponent(tg)}&bucket=${encodeURIComponent(key)}&page=${encodeURIComponent(String(p))}`;
      const data = await teacherApi(`/teachers/blunders/all-blunders${qs}`);
      ui.counts = (data?.counts && typeof data.counts === 'object') ? data.counts : ui.counts;
      ui.tagCounts = (data?.tagCounts && typeof data.tagCounts === 'object') ? data.tagCounts : ui.tagCounts;
      b.entries = Array.isArray(data?.entries) ? data.entries : [];
      b.page = Number(data?.page || p) || p;
      b.totalPages = Number(data?.totalPages || 1) || 1;
      b.total = Number(data?.totalBucket || 0) || 0;
      b.loading = false;
      b.error = '';
      // Clear jump input after successful navigation
      b.jump = '';
      entry().render();
    } catch (e) {
      b.loading = false;
      b.error = String(e?.message || e);
      entry().render();
    }
  }

  async function teacherLoadAllBlundersStorageStats() {
    const ui = ensureAllUi();
    ui.storageStats = null;
    entry().render();
    try {
      const data = await teacherApi('/teachers/blunders/storage-stats');
      ui.storageStats = (data && typeof data === 'object') ? data : null;
      entry().render();
    } catch (e) {
      // Keep errors on the main teacher error line
      STATE.teacher.error = String(e?.message || e);
      entry().render();
    }
  }

  function teacherAllToggleBucket(bucketKey) {
    const key = String(bucketKey || '').trim();
    const ui = ensureAllUi();
    if (!ui.buckets[key]) return;
    ui.buckets[key].open = !ui.buckets[key].open;
    entry().render();
    if (ui.buckets[key].open && (!Array.isArray(ui.buckets[key].entries) || ui.buckets[key].entries.length === 0)) {
      teacherLoadAllBlundersBucket(key, 1).catch(() => {});
    }
  }

  function teacherAllSetJump(bucketKey, value) {
    const key = String(bucketKey || '').trim();
    const ui = ensureAllUi();
    if (!ui.buckets[key]) return;
    ui.buckets[key].jump = String(value || '').trim();
  }

  function teacherAllPrev(bucketKey) {
    const key = String(bucketKey || '').trim();
    const ui = ensureAllUi();
    const b = ui.buckets[key];
    if (!b || b.loading) return;
    const nextPage = Math.max(1, (Number(b.page || 1) || 1) - 1);
    teacherLoadAllBlundersBucket(key, nextPage).catch(() => {});
  }

  function teacherAllNext(bucketKey) {
    const key = String(bucketKey || '').trim();
    const ui = ensureAllUi();
    const b = ui.buckets[key];
    if (!b || b.loading) return;
    const cur = Math.max(1, Number(b.page || 1) || 1);
    const max = Math.max(1, Number(b.totalPages || 1) || 1);
    const nextPage = Math.min(max, cur + 1);
    teacherLoadAllBlundersBucket(key, nextPage).catch(() => {});
  }

  function teacherAllGo(bucketKey) {
    const key = String(bucketKey || '').trim();
    const ui = ensureAllUi();
    const b = ui.buckets[key];
    if (!b || b.loading) return;
    const raw = String(b.jump || '').trim();
    const n = Math.floor(Number(raw || 0));
    const max = Math.max(1, Number(b.totalPages || 1) || 1);
    if (!Number.isFinite(n) || n < 1) return;
    teacherLoadAllBlundersBucket(key, Math.min(max, n)).catch(() => {});
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
      openTeacherJobModal(jobId).catch(() => {});
    }
    return out;
  }

  async function teacherSyncMaster(masterId, hkDayKey, force) {
    const mid = String(masterId || '').trim();
    if (!mid) return;
    await teacherApi('/teachers/blunders/sync-master', { method: 'POST', body: { masterId: mid, hkDayKey, force: !!force } });
  }

  async function teacherHistoryScanMaster(masterId, historyGames, force) {
    const mid = String(masterId || '').trim();
    if (!mid) return;
    const n = Math.max(1, Math.min(500, Number(historyGames || 0) || 0));
    if (!n) return;
    // Use background job API to avoid long-running requests/timeouts.
    const out = await teacherApi('/teachers/blunders/jobs/master-history-scan', {
      method: 'POST',
      body: { masterIds: [mid], historyGames: n, force: !!force }
    });
    const jobId = out?.jobId ? String(out.jobId) : '';
    if (jobId) {
      STATE.teacher.error = `Master history queued (job: ${jobId}). Refresh later to see updated counts.`;
      entry().render();
      openTeacherJobModal(jobId).catch(() => {});
    }
    return out;
  }

  async function teacherTagPuzzles(scope, recompute) {
    const sc = String(scope || 'student');
    const out = await teacherApi('/teachers/blunders/jobs/tag-puzzles', {
      method: 'POST',
      body: { scope: sc, recompute: !!recompute, syncDb: true }
    });
    const jobId = out?.jobId ? String(out.jobId) : '';
    if (jobId) {
      STATE.teacher.error = `Tagging queued (job: ${jobId}).`;
      entry().render();
      openTeacherJobModal(jobId).catch(() => {});
    }
    return out;
