(() => {
  // application/blunders/src/teacher-legacy.js
  (function() {
    const C = window.BlundersCore;
    if (!C) {
      console.error("BlundersCore missing. Load /application/blunders/core.js first.");
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
      if (!e) throw new Error("BlundersEntryApi missing. Load /application/blunders/blunders.js after this file.");
      return e;
    }
    let jobPollTimer = null;
    function stopTeacherJobPolling() {
      if (jobPollTimer) {
        try {
          clearInterval(jobPollTimer);
        } catch {
        }
        jobPollTimer = null;
      }
      if (STATE.teacher && STATE.teacher.jobUi) {
        STATE.teacher.jobUi.polling = false;
      }
    }
    async function teacherGetJob(jobId) {
      const id = String(jobId || "").trim();
      if (!id) throw new Error("Missing jobId");
      return await teacherApi(`/teachers/blunders/jobs/${encodeURIComponent(id)}`);
    }
    async function teacherCancelJob(jobId) {
      const id = String(jobId || "").trim();
      if (!id) throw new Error("Missing jobId");
      return await teacherApi(`/teachers/blunders/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
    }
    function renderTeacherJobModal() {
      const ui = STATE.teacher.jobUi || {};
      const job = ui.job || null;
      const err = String(ui.error || "");
      const jobId = String(ui.jobId || "");
      const status = String(job?.status || "\u2014");
      const p = job?.progress || {};
      const total = Number(p.total || 0) || 0;
      const done = Number(p.done || 0) || 0;
      const msg = String(p.message || "");
      const cur = p.currentStudentName ? `${p.currentStudentName}${p.currentStudentId ? ` (${p.currentStudentId})` : ""}` : p.currentStudentId ? String(p.currentStudentId) : "";
      const pct = total > 0 ? Math.round(done / total * 100) : 0;
      const canCancel = jobId && (status === "queued" || status === "running");
      const finished = status === "done" || status === "error" || status === "cancelled";
      return `
      <div class="bl-card" style="box-shadow:none;">
        <div class="blunders-muted">Job: <strong>${escapeHtml(jobId || "\u2014")}</strong></div>
        <div class="blunders-muted" style="margin-top:6px;">Status: <strong>${escapeHtml(status)}</strong>${finished ? "" : " \xB7 polling..."}</div>
        ${total ? `<div class="blunders-muted" style="margin-top:6px;">Progress: <strong>${escapeHtml(String(done))}</strong> / <strong>${escapeHtml(String(total))}</strong> (${escapeHtml(String(pct))}%)</div>` : ""}
        ${cur ? `<div class="blunders-muted" style="margin-top:6px;">Current: <strong>${escapeHtml(cur)}</strong></div>` : ""}
        ${msg ? `<div class="blunders-muted" style="margin-top:10px;">${escapeHtml(msg)}</div>` : ""}
        ${err ? `<div class="blunders-muted" style="margin-top:10px; color:#b91c1c;">${escapeHtml(err)}</div>` : ""}
        ${job?.error ? `<div class="blunders-muted" style="margin-top:10px; color:#b91c1c;">${escapeHtml(String(job.error))}</div>` : ""}

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
          <button class="btn btn-secondary" type="button" data-bl-teacher-job-refresh ${!jobId ? "disabled" : ""}>Refresh</button>
          <button class="btn btn-secondary" type="button" data-bl-teacher-job-cancel ${!canCancel ? "disabled" : ""}>Cancel</button>
          <button class="btn btn-primary" type="button" data-bl-teacher-job-close>Close</button>
        </div>
      </div>
    `;
    }
    async function openTeacherJobModal(jobId) {
      const id = String(jobId || "").trim();
      if (!id) return;
      if (!STATE.teacher.jobUi || typeof STATE.teacher.jobUi !== "object") STATE.teacher.jobUi = {};
      STATE.teacher.jobUi.jobId = id;
      STATE.teacher.jobUi.error = "";
      STATE.teacher.jobUi.job = null;
      STATE.teacher.jobUi.polling = true;
      entry().openModal("History progress", renderTeacherJobModal());
      const tick = async () => {
        if (!STATE.teacher?.jobUi?.jobId) return;
        try {
          const out = await teacherGetJob(STATE.teacher.jobUi.jobId);
          STATE.teacher.jobUi.job = out?.job || null;
          STATE.teacher.jobUi.error = "";
          entry().openModal("History progress", renderTeacherJobModal());
          const st = String(out?.job?.status || "");
          if (st === "done" || st === "error" || st === "cancelled") {
            stopTeacherJobPolling();
          }
        } catch (e) {
          STATE.teacher.jobUi.error = String(e?.message || e);
          entry().openModal("History progress", renderTeacherJobModal());
        }
      };
      stopTeacherJobPolling();
      await tick();
      jobPollTimer = setInterval(() => {
        tick().catch(() => {
        });
      }, 1e3);
    }
    async function teacherJobRefresh() {
      const id = String(STATE.teacher?.jobUi?.jobId || "");
      if (!id) return;
      return await openTeacherJobModal(id);
    }
    async function teacherJobCancel() {
      const id = String(STATE.teacher?.jobUi?.jobId || "");
      if (!id) return;
      try {
        await teacherCancelJob(id);
        await teacherJobRefresh();
      } catch (e) {
        if (!STATE.teacher.jobUi) STATE.teacher.jobUi = {};
        STATE.teacher.jobUi.error = String(e?.message || e);
        entry().openModal("History progress", renderTeacherJobModal());
      }
    }
    function teacherJobClose() {
      stopTeacherJobPolling();
      if (STATE.teacher?.jobUi) {
        STATE.teacher.jobUi.jobId = "";
        STATE.teacher.jobUi.job = null;
      }
      entry().closeModal();
    }
    function renderTeacherSidebar() {
      const tab = String(STATE.teacherTab || "students");
      return `
      <aside class="bl-sidebar" aria-label="Blunders teacher sidebar">
        <div class="bl-side-title">\u{1F4A5} Blunders</div>
        <div class="bl-side-sub">Teacher mode</div>
        <div class="bl-nav">
          <button class="bl-nav-btn ${tab === "students" ? "active" : ""}" type="button" data-bl-teacher-tab="students">
            <span class="bl-nav-left"><span class="bl-nav-icon">\u{1F465}</span>Students</span>
          </button>
          <button class="bl-nav-btn ${tab === "allBlunders" ? "active" : ""}" type="button" data-bl-teacher-tab="allBlunders">
            <span class="bl-nav-left"><span class="bl-nav-icon">\u{1F4DA}</span>All blunders</span>
          </button>
          <button class="bl-nav-btn ${tab === "masterGame" ? "active" : ""}" type="button" data-bl-teacher-tab="masterGame">
            <span class="bl-nav-left"><span class="bl-nav-icon">\u265F\uFE0F</span>Master Game</span>
          </button>
          <button class="bl-nav-btn ${tab === "settings" ? "active" : ""}" type="button" data-bl-teacher-tab="settings">
            <span class="bl-nav-left"><span class="bl-nav-icon">\u2699\uFE0F</span>Settings</span>
          </button>
        </div>
      </aside>
    `;
    }
    function renderTeacherStudentsPage() {
      const loading = !!STATE.teacher.loading;
      const err = String(STATE.teacher.error || "");
      const allRows = Array.isArray(STATE.teacher.students) ? STATE.teacher.students : [];
      const today = todayYmdLocal();
      const q = String(STATE.teacher.search || "").trim().toLowerCase();
      const rows = !q ? allRows : allRows.filter((s) => {
        const name = String(s?.name || "").toLowerCase();
        const sid = String(s?.studentId || "").toLowerCase();
        const chessId = String(s?.chessComUsername || "").toLowerCase();
        return name.includes(q) || sid.includes(q) || chessId.includes(q);
      });
      const selectedSet = new Set(Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : []);
      const allFilteredSelected = rows.length > 0 && rows.every((s) => selectedSet.has(String(s?.id || "")));
      const totalPending = allRows.reduce((a, s) => a + Number(s?.counts?.pending || 0), 0);
      const totalCompleted = allRows.reduce((a, s) => a + Number(s?.counts?.completed || 0), 0);
      const schedule = STATE.teacher.ratingsSchedule;
      const bls = STATE.teacher.blundersSchedule;
      const scheduleLine = schedule ? `Automatic Chess.com rating refresh: <strong>daily at ${escapeHtml(String(schedule.time || ""))}</strong>.` : `Automatic Chess.com rating refresh: <strong>daily</strong>.`;
      const lastRun = schedule?.lastRunAt ? fmtIsoUtc(schedule.lastRunAt) : "\u2014";
      const nextRun = schedule?.nextRunAt ? fmtIsoUtc(schedule.nextRunAt) : "\u2014";
      const blLine = bls ? `Automatic Blunders sync: <strong>daily at ${escapeHtml(String(bls.time || ""))}</strong>.` : `Automatic Blunders sync: <strong>daily</strong>.`;
      const blLast = bls?.lastRunAt ? fmtIsoUtc(bls.lastRunAt) : "\u2014";
      const blNext = bls?.nextRunAt ? fmtIsoUtc(bls.nextRunAt) : "\u2014";
      const selectedCount = Array.from(selectedSet).filter((id) => allRows.some((r) => String(r.id || "") === id)).length;
      const bulkHistoryGames = Math.max(1, Math.min(500, Number(STATE.teacher.bulkHistoryGames || 200) || 200));
      const tagDuration = String(STATE.teacher.tagDuration || "month");
      const tagStats = STATE.teacher.tagStats && typeof STATE.teacher.tagStats === "object" ? STATE.teacher.tagStats : null;
      const topOverall = Array.isArray(tagStats?.topOverall) ? tagStats.topOverall : [];
      const taggerVersion = String(tagStats?.taggerVersion || "");
      const tagNote = tagStats ? `Tagger: <strong>${escapeHtml(taggerVersion || "\u2014")}</strong> \xB7 Puzzles: <strong>${escapeHtml(String(tagStats?.puzzlesConsidered || 0))}</strong>` : "";
      const durationOpts = [
        { k: "week", label: "Last week" },
        { k: "month", label: "Last month" },
        { k: "halfYear", label: "Last 6 months" },
        { k: "year", label: "Last year" },
        { k: "all", label: "All time" }
      ];
      return `
      <div class="bl-card">
        <div class="bl-title">Teacher \xB7 Students</div>
        <div class="blunders-muted">Per-student fetch limit + blunder threshold + date-based sync (date format: <strong>YYYY-MM-DD</strong>).</div>

        <div class="bl-card" style="box-shadow:none; margin-top:10px;">
          <div class="blunders-muted">${scheduleLine}</div>
          <div class="blunders-muted" style="margin-top:6px;">Last run: <strong>${escapeHtml(lastRun)}</strong> \xB7 Next run: <strong>${escapeHtml(nextRun)}</strong></div>
          <div class="blunders-muted" style="margin-top:10px;">${blLine}</div>
          <div class="blunders-muted" style="margin-top:6px;">Last run: <strong>${escapeHtml(blLast)}</strong> \xB7 Next run: <strong>${escapeHtml(blNext)}</strong></div>
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
            <button class="btn btn-secondary" type="button" data-bl-teacher-refresh-students ${loading ? "disabled" : ""}>Refresh</button>
            <button class="btn btn-primary" type="button" data-bl-teacher-save-students ${loading ? "disabled" : ""}>Save settings</button>
            <button class="btn btn-secondary" type="button" data-bl-teacher-sync-selected ${!selectedCount || loading ? "disabled" : ""}>Sync selected (${escapeHtml(String(selectedCount))})</button>
            <button class="btn btn-secondary" type="button" data-bl-teacher-force-selected ${!selectedCount || loading ? "disabled" : ""}>Force selected</button>
            <button class="btn btn-secondary" type="button" data-bl-teacher-complete-selected ${!selectedCount || loading ? "disabled" : ""}>Complete selected</button>
          </div>
          <div class="bl-teacher-actions" style="grid-template-columns: 140px 1fr 1fr;">
            <select class="btn btn-secondary" name="bl_teacher_bulk_history" data-bl-teacher-bulk-history style="min-width:140px;" ${loading ? "disabled" : ""}>
              ${[100, 200, 300, 500].map((n) => `<option value="${n}" ${Number(bulkHistoryGames) === n ? "selected" : ""}>History N: ${n}</option>`).join("")}
            </select>
            <button class="btn btn-secondary" type="button" data-bl-teacher-history-selected ${!selectedCount || loading ? "disabled" : ""}>History selected</button>
            <button class="btn btn-secondary" type="button" data-bl-teacher-history-force-selected ${!selectedCount || loading ? "disabled" : ""}>History Force selected</button>
          </div>
        </div>

        <div class="bl-card" style="box-shadow:none; margin-top:12px;">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <div style="font-weight:900; color:#111827;">Blunder themes (A)</div>
            <div style="flex:1;"></div>
            <select class="btn btn-secondary btn-small" name="bl_teacher_tag_duration" data-bl-teacher-tag-duration style="min-width:160px;" ${loading ? "disabled" : ""}>
              ${durationOpts.map((o) => `<option value="${escapeHtml(o.k)}" ${tagDuration === o.k ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
            </select>
            <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-tag-stats-refresh ${loading ? "disabled" : ""}>Refresh stats</button>
            <button class="btn btn-primary btn-small" type="button" data-bl-teacher-tag-puzzles ${loading ? "disabled" : ""}>Tag puzzles</button>
          </div>
          <div class="blunders-muted" style="margin-top:8px;">${tagStats ? tagNote : "No tag stats loaded yet. Click \u201CRefresh stats\u201D."}</div>
          ${tagStats ? `
            <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
              ${topOverall.slice(0, 20).map((x) => `<span class="bl-badge" style="background:#eef2ff; color:#3730a3;">${escapeHtml(String(x.tag || ""))}: <strong>${escapeHtml(String(x.count || 0))}</strong></span>`).join("") || `<div class="blunders-muted">No tags found yet (run \u201CTag puzzles\u201D).</div>`}
            </div>
          ` : ``}
        </div>

        ${loading ? `<div class="blunders-muted" style="margin-top:10px;">Loading...</div>` : ``}
        ${err ? `<div class="blunders-muted" style="margin-top:10px; color:#b91c1c;">${escapeHtml(err)}</div>` : ``}

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
          <div style="flex:1 1 260px;">
            <div class="blunders-muted">Search</div>
            <input type="text" name="bl_teacher_search" value="${escapeHtml(String(STATE.teacher.search || ""))}" placeholder="Search name / student id / chess.com id" data-bl-teacher-search style="width:100%; padding:8px 10px; border:1px solid #e5e7eb; border-radius:12px;">
          </div>
          <div>
            <div class="blunders-muted">Set selected Max games/day</div>
            <div style="display:flex; gap:8px; align-items:center;">
              <input type="number" name="bl_teacher_bulk_max_games" min="1" max="50" step="1" value="${escapeHtml(String(Number(STATE.teacher.bulkMaxGames || 10) || 10))}" data-bl-teacher-bulk-max style="width:120px; padding:8px 10px; border:1px solid #e5e7eb; border-radius:12px;">
              <button class="btn btn-secondary" type="button" data-bl-teacher-apply-max-selected ${loading ? "disabled" : ""}>Apply</button>
            </div>
          </div>
          <div>
            <div class="blunders-muted">Set selected Threshold</div>
            <div style="display:flex; gap:8px; align-items:center;">
              <input type="number" name="bl_teacher_bulk_threshold" min="0.1" max="10" step="0.1" value="${escapeHtml(String(Number(STATE.teacher.bulkThreshold || 1) || 1))}" data-bl-teacher-bulk-thr style="width:120px; padding:8px 10px; border:1px solid #e5e7eb; border-radius:12px;">
              <button class="btn btn-secondary" type="button" data-bl-teacher-apply-thr-selected ${loading ? "disabled" : ""}>Apply</button>
            </div>
          </div>
        </div>

        <div style="margin-top:12px; overflow:auto;">
          <table style="width:100%; border-collapse:separate; border-spacing:0 8px;">
            <thead>
              <tr class="blunders-muted" style="text-align:left;">
                <th style="padding:6px 8px; width:42px;">
                  <input type="checkbox" name="bl_teacher_select_all" data-bl-teacher-select-all ${allFilteredSelected ? "checked" : ""} aria-label="Select all">
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
        const sid = String(s.id || "");
        const nm = String(s.name || "");
        const sid2 = String(s.studentId || "");
        const cfg = s.config || {};
        const maxGames = Number(STATE.teacher.edits.student?.[sid]?.maxGamesPerDay ?? cfg.maxGamesPerDay ?? 10) || 10;
        const thr = Number(STATE.teacher.edits.student?.[sid]?.thresholdPoints ?? cfg.thresholdPoints ?? 1) || 1;
        const chessId = String(s.chessComUsername || "");
        const r = s.chessComRating === null || s.chessComRating === void 0 ? "" : String(s.chessComRating);
        const rs = String(s.chessComRatingSource || "");
        const ratingLabel = r ? `${r}${rs ? ` (${rs})` : ""}` : "\u2014";
        const isChecked = selectedSet.has(sid);
        const historyVal = Number(STATE.teacher?.historyScanN?.[sid] || 200) || 200;
        const dateVal = String(STATE.teacher?.dateByStudent?.[sid] || "") || today;
        return `
                  <tr style="background:#fff; border:1px solid #e5e7eb;">
                    <td style="padding:10px 8px; border-radius:12px 0 0 12px;">
                      <input type="checkbox" name="bl_teacher_select_${escapeHtml(sid)}" data-bl-teacher-select="${escapeHtml(sid)}" ${isChecked ? "checked" : ""} aria-label="Select student">
                    </td>
                    <td style="padding:10px 8px;">
                      <div style="font-weight:900; color:#111827;">${escapeHtml(nm)}</div>
                      <div class="blunders-muted">${escapeHtml(sid2)}${chessId ? ` \xB7 ${escapeHtml(chessId)}` : ""}</div>
                    </td>
                    <td style="padding:10px 8px;">${escapeHtml(ratingLabel)}</td>
                    <td style="padding:10px 8px;">${escapeHtml(String(s?.counts?.pending || 0))}</td>
                    <td style="padding:10px 8px;">${escapeHtml(String(s?.counts?.completed || 0))}</td>
                    <td style="padding:10px 8px;">${escapeHtml(String(s?.analyzedGamesTotal || 0))}</td>
                    <td style="padding:10px 8px;">
                      <input type="number" name="bl_teacher_student_max_${escapeHtml(sid)}" min="1" max="50" step="1" value="${escapeHtml(String(maxGames))}" data-bl-teacher-student-max="${escapeHtml(sid)}" style="width:90px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                    </td>
                    <td style="padding:10px 8px;">
                      <input type="number" name="bl_teacher_student_thr_${escapeHtml(sid)}" min="0.1" max="10" step="0.1" value="${escapeHtml(String(thr))}" data-bl-teacher-student-thr="${escapeHtml(sid)}" style="width:90px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                    </td>
                    <td style="padding:10px 8px;">
                      <input type="text" name="bl_teacher_student_date_${escapeHtml(sid)}" value="${escapeHtml(dateVal)}" inputmode="numeric" placeholder="YYYY-MM-DD" data-bl-teacher-student-date="${escapeHtml(sid)}" style="width:110px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                    </td>
                    <td style="padding:10px 8px; border-radius:0 12px 12px 0; white-space:nowrap;">
                      <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-sync-student="${escapeHtml(sid)}">Sync</button>
                      <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-sync-student-force="${escapeHtml(sid)}">Force</button>
                      <span style="display:inline-flex; gap:6px; align-items:center; margin-left:8px;">
                        <select name="bl_teacher_history_n_${escapeHtml(sid)}" data-bl-teacher-history-n="${escapeHtml(sid)}" style="padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px; font-size:12px;">
                          ${[100, 200, 300, 500].map((n) => `<option value="${n}" ${Number(historyVal) === n ? "selected" : ""}>${n}</option>`).join("")}
                        </select>
                        <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-history-scan="${escapeHtml(sid)}">History</button>
                        <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-history-scan-force="${escapeHtml(sid)}">History Force</button>
                      </span>
                    </td>
                  </tr>
                `;
      }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
    }
    function renderTeacherAllBlundersPage() {
      const loading = !!STATE.teacher.loading;
      const err = String(STATE.teacher.error || "");
      const duration = String(STATE.teacher.allDuration || "all");
      const rating = String(STATE.teacher.allRating || "any");
      const ui = STATE.teacher.allUi && typeof STATE.teacher.allUi === "object" ? STATE.teacher.allUi : {};
      const counts = ui.counts && typeof ui.counts === "object" ? ui.counts : null;
      const buckets = ui.buckets && typeof ui.buckets === "object" ? ui.buckets : {};
      const stats = ui.storageStats && typeof ui.storageStats === "object" ? ui.storageStats : null;
      const tagCounts = ui.tagCounts && typeof ui.tagCounts === "object" ? ui.tagCounts : null;
      const selectedTag = String(STATE.teacher.allTag || "any");
      const tagSearch = String(ui.tagSearch || "");
      const tagOpts = (() => {
        const base = [{ k: "any", label: "Any theme" }];
        if (!tagCounts) return base;
        const entries = Object.entries(tagCounts).map(([k, v]) => ({ k: String(k), n: Number(v || 0) || 0 })).filter((x) => x.k && x.k !== "any").sort((a, b) => b.n - a.n || a.k.localeCompare(b.k)).slice(0, 200);
        for (const x of entries) base.push({ k: x.k, label: `${x.k} (${x.n})` });
        return base;
      })();
      const durationBtns = [
        { k: "week", label: "Last week" },
        { k: "month", label: "Last month" },
        { k: "halfYear", label: "Last 6 months" },
        { k: "year", label: "Last year" },
        { k: "all", label: "All time" }
      ];
      const ratingOpts = [
        { k: "any", label: "Any rating" },
        { k: "100-400", label: "100\u2013400" },
        { k: "401-700", label: "401\u2013700" },
        { k: "701-1000", label: "701\u20131000" },
        { k: "1001-1500", label: "1001\u20131500" },
        { k: "1501-2000", label: "1501\u20132000" },
        { k: "2001-2300", label: "2001\u20132300" },
        { k: "2201-2500", label: "2201\u20132500" },
        { k: "2501-2800", label: "2501\u20132800" },
        { k: "2801-3000", label: "2801\u20133000" },
        { k: "3001up", label: "3001+" }
      ];
      const renderRows = (arr) => {
        if (!arr.length) return `<div class="blunders-muted" style="margin-top:10px;">No records.</div>`;
        const mini = entry().renderMiniBoardFromFen;
        return `
        <div class="bl-grid" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
          ${arr.map((p) => {
          const sid = escapeHtml(String(p.studentStudentId || ""));
          const sname = escapeHtml(String(p.studentName || "Student"));
          const r = p.chessComRating === null || p.chessComRating === void 0 ? "" : `${escapeHtml(String(p.chessComRating))}${p.chessComRatingSource ? ` (${escapeHtml(String(p.chessComRatingSource))})` : ""}`;
          const when = escapeHtml(String(p.completedAt || ""));
          const drop = (Number(p?.dropPoints ?? Number(p?.dropCp || 0) / 100) || 0).toFixed(2);
          const title = `${escapeHtml(String(p.blunderSan || p.blunderMoveUci || ""))} \xB7 Drop ${drop}`;
          const tags = (() => {
            if (Array.isArray(p?.tags)) return p.tags.map(String).filter(Boolean);
            if (typeof p?.tags === "string") {
              try {
                const parsed = JSON.parse(p.tags);
                return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
              } catch {
                return [];
              }
            }
            return [];
          })();
          const tagLine = tags.length ? `<div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">${tags.slice(0, 8).map((t) => `<span class="bl-badge" style="background:#f3f4f6; color:#111827;">${escapeHtml(t)}</span>`).join("")}</div>` : ``;
          const pid = escapeHtml(String(p.id || p.key || ""));
          return `
              <div class="bl-card" style="display:flex; gap:12px; align-items:center;">
                <button type="button" data-bl-teacher-all-open="${pid}" style="all:unset; cursor:pointer; display:inline-flex; align-items:center;">
                  ${mini(String(p.startFEN || ""))}
                </button>
                <div style="min-width:0;">
                  <div style="font-weight:950; color:#111827; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${sname}${sid ? ` <span style="opacity:.7;">(${sid})</span>` : ""}</div>
                  <div class="blunders-muted" style="margin-top:4px;">Rating: <strong>${r || "\u2014"}</strong></div>
                  <div class="blunders-muted" style="margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${title}</div>
                  ${p.gameUrl ? `<div class="blunders-muted" style="margin-top:4px;">Source: <a href="${escapeHtml(String(p.gameUrl))}" target="_blank" rel="noopener noreferrer">Chess.com</a></div>` : ``}
                  ${when ? `<div class="blunders-muted" style="margin-top:4px;">${when}</div>` : ``}
                  ${tagLine}
                </div>
              </div>
            `;
        }).join("")}
        </div>
      `;
      };
      const bucketDefs = [
        { key: "missMate", label: "Miss the mate" },
        { key: "d1", label: "Drop 1.00\u20131.50" },
        { key: "d2", label: "Drop 1.51\u20132.00" },
        { key: "d3", label: "Drop 2.01\u20133.00" },
        { key: "d4", label: "Drop 3.01+" }
      ];
      const renderBucket = (key, label) => {
        const b = buckets && buckets[key] && typeof buckets[key] === "object" ? buckets[key] : {};
        const open = !!b.open;
        const bLoading = !!b.loading;
        const bErr = String(b.error || "");
        const bEntries = Array.isArray(b.entries) ? b.entries : [];
        const total = Number(b.total || 0) || 0;
        const page = Math.max(1, Number(b.page || 1) || 1);
        const totalPages = Math.max(1, Number(b.totalPages || 1) || 1);
        const count = counts ? Number(counts[key] || 0) || 0 : 0;
        const canPrev = open && !bLoading && page > 1;
        const canNext = open && !bLoading && page < totalPages;
        const jumpVal = String(b.jump || "");
        return `
        <div class="bl-card" style="margin-top:10px;">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-all-toggle="${escapeHtml(key)}">${open ? "Hide" : "Show"}</button>
            <div style="font-weight:900; color:#111827;">${escapeHtml(label)} <span class="blunders-muted">(${escapeHtml(String(count))})</span></div>
            <div style="flex:1;"></div>
            ${open ? `
              <div class="blunders-muted">Page <strong>${escapeHtml(String(page))}</strong> / <strong>${escapeHtml(String(totalPages))}</strong></div>
              <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-all-prev="${escapeHtml(key)}" ${canPrev ? "" : "disabled"}>Prev</button>
              <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-all-next="${escapeHtml(key)}" ${canNext ? "" : "disabled"}>Next</button>
              <div style="display:flex; gap:6px; align-items:center;">
                <input type="number" name="bl_teacher_all_jump_${escapeHtml(key)}" min="1" max="${escapeHtml(String(totalPages))}" value="${escapeHtml(jumpVal)}" placeholder="Page #" data-bl-teacher-all-jump="${escapeHtml(key)}" style="width:90px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-all-go="${escapeHtml(key)}" ${bLoading ? "disabled" : ""}>Go</button>
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
          ${durationBtns.map((b) => `<button class="btn ${duration === b.k ? "btn-info" : "btn-secondary"} btn-small" type="button" data-bl-teacher-all-duration="${escapeHtml(b.k)}">${escapeHtml(b.label)}</button>`).join("")}
          <div style="flex:1;"></div>
          <input class="btn btn-secondary btn-small" id="blTeacherAllTagSearch" name="bl_teacher_all_tag_search" data-bl-teacher-all-tag-search list="blTeacherAllTagList" value="${escapeHtml(tagSearch)}" placeholder="Search theme..." autocomplete="off" style="min-width:220px; text-align:left;">
          <datalist id="blTeacherAllTagList">
            ${tagOpts.filter((o) => o.k !== "any").slice(0, 200).map((o) => `<option value="${escapeHtml(o.k)}"></option>`).join("")}
          </datalist>
          <select class="btn btn-secondary btn-small" name="bl_teacher_all_tag" data-bl-teacher-all-tag style="min-width:200px;">
            ${tagOpts.map((o) => `<option value="${escapeHtml(o.k)}" ${selectedTag === o.k ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
          </select>
          <select class="btn btn-secondary btn-small" name="bl_teacher_all_rating" data-bl-teacher-all-rating style="min-width:180px;">
            ${ratingOpts.map((o) => `<option value="${escapeHtml(o.k)}" ${rating === o.k ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
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
            <div style="margin-top:6px;">Org puzzles: <strong>${escapeHtml(String(stats?.counts?.total || 0))}</strong> \xB7 MissMate: <strong>${escapeHtml(String(stats?.counts?.missMate || 0))}</strong> \xB7 d1: <strong>${escapeHtml(String(stats?.counts?.d1 || 0))}</strong> \xB7 d2: <strong>${escapeHtml(String(stats?.counts?.d2 || 0))}</strong> \xB7 d3: <strong>${escapeHtml(String(stats?.counts?.d3 || 0))}</strong> \xB7 d4: <strong>${escapeHtml(String(stats?.counts?.d4 || 0))}</strong></div>
            <div style="margin-top:6px;">Analyzed game keys (org): <strong>${escapeHtml(String(stats?.analyzedKeys || 0))}</strong></div>
            <div style="margin-top:6px;">Updated: ${escapeHtml(String(stats?.now || ""))}</div>
          </div>
        ` : ``}

        ${!loading ? `
          <div style="margin-top:12px;">
            ${bucketDefs.map((b) => renderBucket(b.key, b.label)).join("")}
          </div>
        ` : ``}
      </div>
    `;
    }
    function renderTeacherMasterGamePage() {
      const loading = !!STATE.teacher.loading;
      const err = String(STATE.teacher.error || "");
      const masters = Array.isArray(STATE.teacher.masters) ? STATE.teacher.masters : [];
      const cfg = STATE.teacher.masterConfig || { maxGamesPerDay: 10, thresholdPoints: 1 };
      const maxGames = Number(STATE.teacher.edits.masterCfg?.maxGamesPerDay ?? cfg.maxGamesPerDay ?? 10) || 10;
      const thr = Number(STATE.teacher.edits.masterCfg?.thresholdPoints ?? cfg.thresholdPoints ?? 1) || 1;
      const today = todayYmdLocal();
      const editMasters = Array.isArray(STATE.teacher.edits.masters) ? STATE.teacher.edits.masters : null;
      const rows = editMasters || masters;
      return `
      <div class="bl-card">
        <div class="bl-title">Teacher \xB7 Master Game</div>
        <div class="blunders-muted">Configure masters + run the same Blunder analysis on their games.</div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
          <button class="btn btn-secondary" type="button" data-bl-teacher-refresh-masters ${loading ? "disabled" : ""}>Refresh</button>
          <button class="btn btn-secondary" type="button" data-bl-teacher-masters-presets ${loading ? "disabled" : ""}>Presets</button>
          <button class="btn btn-secondary" type="button" data-bl-teacher-masters-add ${loading ? "disabled" : ""}>Add master</button>
          <button class="btn btn-primary" type="button" data-bl-teacher-save-masters ${loading ? "disabled" : ""}>Save</button>
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
        const mid = String(m.id || "");
        const name = String(m.name || "");
        const user = String(m.username || "");
        const total = Number(m?.counts?.total || 0);
        const mr = m?.rating === null || m?.rating === void 0 ? null : Number(m.rating);
        const ms = m?.ratingSource ? String(m.ratingSource) : "";
        const ratingLabel = Number.isFinite(mr) && mr > 0 ? `${mr}${ms ? ` (${ms})` : ""}` : "\u2014";
        const dateVal = String(STATE.teacher?.dateByMaster?.[mid] || "") || today;
        const historyVal = Number(STATE.teacher?.historyScanNMaster?.[mid] || 200) || 200;
        return `
                  <tr style="background:#fff; border:1px solid #e5e7eb;">
                    <td style="padding:10px 8px; border-radius:12px 0 0 12px;">
                      <input type="text" name="bl_teacher_master_name_${escapeHtml(String(i))}" value="${escapeHtml(name)}" data-bl-teacher-master-name="${escapeHtml(String(i))}" style="width:180px; padding:6px 8px; border:1px solid #e5e7eb; border-radius:10px;">
                      <div class="blunders-muted" style="margin-top:4px;">id: ${escapeHtml(mid || "(auto)")}</div>
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
                          ${[100, 200, 300, 500].map((n) => `<option value="${n}" ${Number(historyVal) === n ? "selected" : ""}>${n}</option>`).join("")}
                        </select>
                        <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-history-scan-master="${escapeHtml(mid)}">History</button>
                        <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-history-scan-master-force="${escapeHtml(mid)}">History Force</button>
                      </span>
                      <button class="btn btn-secondary btn-small" type="button" data-bl-teacher-master-del="${escapeHtml(String(i))}">Remove</button>
                    </td>
                  </tr>
                `;
      }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
    }
    async function teacherLoad(tab) {
      STATE.teacher.loading = true;
      STATE.teacher.error = "";
      entry().render();
      try {
        if (tab === "masterGame") {
          const data = await teacherApi("/teachers/blunders/masters-summary");
          STATE.teacher.masters = Array.isArray(data?.masters) ? data.masters : [];
          STATE.teacher.masterConfig = data?.masterConfig || { maxGamesPerDay: 10, thresholdPoints: 1 };
          if (!Array.isArray(STATE.teacher.edits.masters)) STATE.teacher.edits.masters = STATE.teacher.masters.map((m) => ({ ...m }));
        } else if (tab === "allBlunders") {
          const dur = String(STATE.teacher.allDuration || "all");
          const rt = String(STATE.teacher.allRating || "any");
          const tg = String(STATE.teacher.allTag || "any");
          const qs = `?duration=${encodeURIComponent(dur)}&rating=${encodeURIComponent(rt)}&tag=${encodeURIComponent(tg)}`;
          const data = await teacherApi(`/teachers/blunders/all-blunders${qs}`);
          if (!STATE.teacher.allUi || typeof STATE.teacher.allUi !== "object") STATE.teacher.allUi = { pageSize: 50, counts: null, buckets: {} };
          STATE.teacher.allUi.pageSize = 50;
          STATE.teacher.allUi.counts = data?.counts && typeof data.counts === "object" ? data.counts : null;
          STATE.teacher.allUi.tagCounts = data?.tagCounts && typeof data.tagCounts === "object" ? data.tagCounts : null;
          if (!STATE.teacher.allUi.buckets || typeof STATE.teacher.allUi.buckets !== "object") STATE.teacher.allUi.buckets = {};
          const keys = ["missMate", "d1", "d2", "d3", "d4"];
          for (const k of keys) {
            STATE.teacher.allUi.buckets[k] = { open: false, page: 1, totalPages: 1, total: 0, entries: [], jump: "", loading: false, error: "" };
          }
        } else if (tab === "settings") {
        } else {
          const data = await teacherApi("/teachers/blunders/students-summary");
          STATE.teacher.students = Array.isArray(data?.students) ? data.students : [];
          STATE.teacher.ratingsSchedule = data?.ratingsSchedule || null;
          STATE.teacher.blundersSchedule = data?.blundersSchedule || null;
          try {
            await teacherLoadTagStats();
          } catch {
          }
        }
        STATE.teacher.loading = false;
        STATE.teacher.lastLoadedAt = (/* @__PURE__ */ new Date()).toISOString();
        entry().render();
      } catch (e) {
        STATE.teacher.loading = false;
        STATE.teacher.error = String(e?.message || e);
        entry().render();
      }
    }
    function ensureAllUi() {
      if (!STATE.teacher.allUi || typeof STATE.teacher.allUi !== "object") {
        STATE.teacher.allUi = { pageSize: 50, counts: null, buckets: {} };
      }
      if (!STATE.teacher.allUi.buckets || typeof STATE.teacher.allUi.buckets !== "object") {
        STATE.teacher.allUi.buckets = {};
      }
      const keys = ["missMate", "d1", "d2", "d3", "d4"];
      for (const k of keys) {
        if (!STATE.teacher.allUi.buckets[k] || typeof STATE.teacher.allUi.buckets[k] !== "object") {
          STATE.teacher.allUi.buckets[k] = { open: false, page: 1, totalPages: 1, total: 0, entries: [], jump: "", loading: false, error: "" };
        }
      }
      return STATE.teacher.allUi;
    }
    async function teacherLoadAllBlundersBucket(bucketKey, page) {
      const key = String(bucketKey || "").trim();
      if (!["missMate", "d1", "d2", "d3", "d4"].includes(key)) return;
      const ui = ensureAllUi();
      const b = ui.buckets[key];
      b.loading = true;
      b.error = "";
      b.open = true;
      entry().render();
      try {
        const dur = String(STATE.teacher.allDuration || "all");
        const rt = String(STATE.teacher.allRating || "any");
        const tg = String(STATE.teacher.allTag || "any");
        const p = Math.max(1, Number(page || 1) || 1);
        const qs = `?duration=${encodeURIComponent(dur)}&rating=${encodeURIComponent(rt)}&tag=${encodeURIComponent(tg)}&bucket=${encodeURIComponent(key)}&page=${encodeURIComponent(String(p))}`;
        const data = await teacherApi(`/teachers/blunders/all-blunders${qs}`);
        ui.counts = data?.counts && typeof data.counts === "object" ? data.counts : ui.counts;
        ui.tagCounts = data?.tagCounts && typeof data.tagCounts === "object" ? data.tagCounts : ui.tagCounts;
        b.entries = Array.isArray(data?.entries) ? data.entries : [];
        b.page = Number(data?.page || p) || p;
        b.totalPages = Number(data?.totalPages || 1) || 1;
        b.total = Number(data?.totalBucket || 0) || 0;
        b.loading = false;
        b.error = "";
        b.jump = "";
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
        const data = await teacherApi("/teachers/blunders/storage-stats");
        ui.storageStats = data && typeof data === "object" ? data : null;
        entry().render();
      } catch (e) {
        STATE.teacher.error = String(e?.message || e);
        entry().render();
      }
    }
    function teacherAllToggleBucket(bucketKey) {
      const key = String(bucketKey || "").trim();
      const ui = ensureAllUi();
      if (!ui.buckets[key]) return;
      ui.buckets[key].open = !ui.buckets[key].open;
      entry().render();
      if (ui.buckets[key].open && (!Array.isArray(ui.buckets[key].entries) || ui.buckets[key].entries.length === 0)) {
        teacherLoadAllBlundersBucket(key, 1).catch(() => {
        });
      }
    }
    function teacherAllSetJump(bucketKey, value) {
      const key = String(bucketKey || "").trim();
      const ui = ensureAllUi();
      if (!ui.buckets[key]) return;
      ui.buckets[key].jump = String(value || "").trim();
    }
    function teacherAllPrev(bucketKey) {
      const key = String(bucketKey || "").trim();
      const ui = ensureAllUi();
      const b = ui.buckets[key];
      if (!b || b.loading) return;
      const nextPage = Math.max(1, (Number(b.page || 1) || 1) - 1);
      teacherLoadAllBlundersBucket(key, nextPage).catch(() => {
      });
    }
    function teacherAllNext(bucketKey) {
      const key = String(bucketKey || "").trim();
      const ui = ensureAllUi();
      const b = ui.buckets[key];
      if (!b || b.loading) return;
      const cur = Math.max(1, Number(b.page || 1) || 1);
      const max = Math.max(1, Number(b.totalPages || 1) || 1);
      const nextPage = Math.min(max, cur + 1);
      teacherLoadAllBlundersBucket(key, nextPage).catch(() => {
      });
    }
    function teacherAllGo(bucketKey) {
      const key = String(bucketKey || "").trim();
      const ui = ensureAllUi();
      const b = ui.buckets[key];
      if (!b || b.loading) return;
      const raw = String(b.jump || "").trim();
      const n = Math.floor(Number(raw || 0));
      const max = Math.max(1, Number(b.totalPages || 1) || 1);
      if (!Number.isFinite(n) || n < 1) return;
      teacherLoadAllBlundersBucket(key, Math.min(max, n)).catch(() => {
      });
    }
    async function teacherSaveStudentSettings() {
      const map = STATE.teacher.edits.student && typeof STATE.teacher.edits.student === "object" ? STATE.teacher.edits.student : {};
      await teacherApi("/teachers/blunders/settings", { method: "PUT", body: { student: map } });
    }
    async function teacherSaveMasters() {
      const masters = Array.isArray(STATE.teacher.edits.masters) ? STATE.teacher.edits.masters : [];
      await teacherApi("/teachers/blunders/settings", { method: "PUT", body: { masters } });
    }
    async function teacherSaveMasterConfig() {
      const cfg = STATE.teacher.edits.masterCfg && typeof STATE.teacher.edits.masterCfg === "object" ? STATE.teacher.edits.masterCfg : null;
      if (!cfg) return;
      await teacherApi("/teachers/blunders/settings", { method: "PUT", body: { master: cfg } });
    }
    async function teacherSyncStudent(studentId, hkDayKey, force) {
      const sid = String(studentId || "").trim();
      if (!sid) return;
      const edit = STATE.teacher.edits.student?.[sid] || {};
      const maxGamesPerDay = edit.maxGamesPerDay;
      const thresholdPoints = edit.thresholdPoints;
      await teacherApi("/teachers/blunders/sync-student", {
        method: "POST",
        body: { studentId: sid, hkDayKey, force: !!force, maxGamesPerDay, thresholdPoints }
      });
    }
    async function teacherHistoryScanStudent(studentId, historyGames, force) {
      const sid = String(studentId || "").trim();
      if (!sid) return;
      const n = Math.max(1, Math.min(500, Number(historyGames || 0) || 0));
      if (!n) return;
      const out = await teacherApi("/teachers/blunders/jobs/history-scan", {
        method: "POST",
        body: { studentIds: [sid], historyGames: n, force: !!force }
      });
      const jobId = out?.jobId ? String(out.jobId) : "";
      if (jobId) {
        STATE.teacher.error = `History queued (job: ${jobId}). Refresh later to see updated counts.`;
        entry().render();
        openTeacherJobModal(jobId).catch(() => {
        });
      }
      return out;
    }
    async function teacherSyncMaster(masterId, hkDayKey, force) {
      const mid = String(masterId || "").trim();
      if (!mid) return;
      await teacherApi("/teachers/blunders/sync-master", { method: "POST", body: { masterId: mid, hkDayKey, force: !!force } });
    }
    async function teacherHistoryScanMaster(masterId, historyGames, force) {
      const mid = String(masterId || "").trim();
      if (!mid) return;
      const n = Math.max(1, Math.min(500, Number(historyGames || 0) || 0));
      if (!n) return;
      const out = await teacherApi("/teachers/blunders/jobs/master-history-scan", {
        method: "POST",
        body: { masterIds: [mid], historyGames: n, force: !!force }
      });
      const jobId = out?.jobId ? String(out.jobId) : "";
      if (jobId) {
        STATE.teacher.error = `Master history queued (job: ${jobId}). Refresh later to see updated counts.`;
        entry().render();
        openTeacherJobModal(jobId).catch(() => {
        });
      }
      return out;
    }
    async function teacherTagPuzzles(scope, recompute) {
      const sc = String(scope || "student");
      const out = await teacherApi("/teachers/blunders/jobs/tag-puzzles", {
        method: "POST",
        body: { scope: sc, recompute: !!recompute, syncDb: true }
      });
      const jobId = out?.jobId ? String(out.jobId) : "";
      if (jobId) {
        STATE.teacher.error = `Tagging queued (job: ${jobId}).`;
        entry().render();
        openTeacherJobModal(jobId).catch(() => {
        });
      }
      return out;
    }
    async function teacherLoadTagStats() {
      const dur = String(STATE.teacher.tagDuration || "month");
      const qs = `?duration=${encodeURIComponent(dur)}`;
      const data = await teacherApi(`/teachers/blunders/tag-stats${qs}`);
      STATE.teacher.tagStats = data && typeof data === "object" ? data : null;
      entry().render();
      return data;
    }
    async function teacherBulkSyncSelected(force) {
      const selected = Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : [];
      const ids = selected.filter(Boolean);
      if (!ids.length) return;
      const allRows = Array.isArray(STATE.teacher.students) ? STATE.teacher.students : [];
      const idSet = new Set(allRows.map((s) => String(s.id || "")));
      const valid = ids.filter((id) => idSet.has(id));
      if (!valid.length) return;
      STATE.teacher.loading = true;
      STATE.teacher.error = "";
      entry().render();
      try {
        for (let i = 0; i < valid.length; i++) {
          const sid = valid[i];
          const hkDayKey = String(STATE.teacher?.dateByStudent?.[sid] || "") || todayYmdLocal();
          STATE.teacher.error = `Syncing ${i + 1}/${valid.length}...`;
          entry().render();
          await teacherSyncStudent(sid, hkDayKey, !!force);
        }
        STATE.teacher.error = "";
      } catch (e) {
        STATE.teacher.error = String(e?.message || e);
      } finally {
        STATE.teacher.loading = false;
        await teacherLoad("students").catch(() => {
        });
      }
    }
    async function teacherBulkCompleteSelected() {
      const selected = Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : [];
      const ids = selected.filter(Boolean);
      if (!ids.length) return;
      const allRows = Array.isArray(STATE.teacher.students) ? STATE.teacher.students : [];
      const idSet = new Set(allRows.map((s) => String(s.id || "")));
      const valid = ids.filter((id) => idSet.has(id));
      if (!valid.length) return;
      STATE.teacher.loading = true;
      STATE.teacher.error = "";
      entry().render();
      try {
        STATE.teacher.error = `Completing pending puzzles for ${valid.length} student(s)...`;
        entry().render();
        await teacherApi("/teachers/blunders/complete-pending", { method: "POST", body: { studentIds: valid } });
        STATE.teacher.error = "";
      } catch (e) {
        STATE.teacher.error = String(e?.message || e);
      } finally {
        STATE.teacher.loading = false;
        await teacherLoad("students").catch(() => {
        });
      }
    }
    async function teacherBulkHistoryScanSelected(force) {
      const selected = Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : [];
      const ids = selected.filter(Boolean);
      if (!ids.length) return;
      const allRows = Array.isArray(STATE.teacher.students) ? STATE.teacher.students : [];
      const idSet = new Set(allRows.map((s) => String(s.id || "")));
      const valid = ids.filter((id) => idSet.has(id));
      if (!valid.length) return;
      const n = Math.max(1, Math.min(500, Number(STATE.teacher.bulkHistoryGames || 200) || 200));
      STATE.teacher.loading = true;
      STATE.teacher.error = "";
      entry().render();
      try {
        const out = await teacherApi("/teachers/blunders/jobs/history-scan", {
          method: "POST",
          body: { studentIds: valid, historyGames: n, force: !!force }
        });
        const jobId = out?.jobId ? String(out.jobId) : "";
        STATE.teacher.error = jobId ? `History queued for ${valid.length} student(s) (job: ${jobId}). Refresh later to see updates.` : `History queued for ${valid.length} student(s). Refresh later to see updates.`;
        entry().render();
        if (jobId) openTeacherJobModal(jobId).catch(() => {
        });
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
      teacherHistoryScanMaster,
      teacherTagPuzzles,
      teacherLoadTagStats,
      teacherBulkSyncSelected,
      teacherBulkCompleteSelected,
      teacherBulkHistoryScanSelected,
      // Job progress modal
      openTeacherJobModal,
      teacherJobRefresh,
      teacherJobCancel,
      teacherJobClose,
      stopTeacherJobPolling,
      // Teacher All blunders (paged buckets)
      teacherAllToggleBucket,
      teacherAllPrev,
      teacherAllNext,
      teacherAllGo,
      teacherAllSetJump,
      teacherLoadAllBlundersStorageStats
    };
  })();
})();
