            <div style="min-width:220px;">
              <div class="blunders-muted">Drop: <strong>${escapeHtml(Number(pz.dropPoints ?? (Number(pz.dropCp || 0) / 100)).toFixed(2))}</strong></div>
              <div class="blunders-muted" style="margin-top:6px;">Status: <strong>${escapeHtml(String(pz.status || 'pending'))}</strong></div>
              <div class="blunders-muted" style="margin-top:6px;">Time: <strong>${escapeHtml(fmtTs(pz.completedAt || pz.createdAt))}</strong></div>
              ${pz.gameUrl ? `<div class="blunders-muted" style="margin-top:6px;">Source: <a href="${escapeHtml(String(pz.gameUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(String(pz.gameUrl))}</a></div>` : ''}
              <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
                <button class="btn btn-primary" type="button" data-bl-practice="${escapeHtml(String(pz.id || ''))}">Practice</button>
              </div>
            </div>
          </div>
        `);
        return;
      }

      const practiceBtn = t?.closest?.('[data-bl-practice]');
      if (practiceBtn) {
        const id = String(practiceBtn.getAttribute('data-bl-practice') || '');
        const all = [
          ...(Array.isArray(STATE.pending) ? STATE.pending : []),
          ...(Array.isArray(STATE.completed) ? STATE.completed : [])
        ];
        const pz = all.find(x => String(x?.id || '') === id) || null;
        if (!pz) return;
        closeModal();
        STATE.practiceKey = bucketKeyOfPuzzle(pz) || 'random';
        setBlunderModePractice(pz);
        setPage('blunder');
        return;
      }

      if (t?.closest?.('[data-bl-random]')) {
        const all = [
          ...(Array.isArray(STATE.pending) ? STATE.pending : []),
          ...(Array.isArray(STATE.completed) ? STATE.completed : [])
        ];
        if (!all.length) return;
        STATE.practiceKey = 'random';
        const pick = all[Math.floor(Math.random() * all.length)];
        setBlunderModePractice(pick);
        setPage('blunder');
        return;
      }
    });

    // Use change events for <select> filters (prevents dropdown from flashing due to re-render on click)
    root.addEventListener('change', (ev) => {
      const t = ev.target;

      const rt = t?.closest?.('[data-bl-review-theme]');
      if (rt) {
        const v = String(rt.value || 'any').trim() || 'any';
        try { window.BlundersStudent?.reviewSetTheme?.(v); } catch {}
        return;
      }

      const rd = t?.closest?.('[data-bl-review-duration-select]');
      if (rd) {
        const v = String(rd.value || 'all').trim() || 'all';
        STATE.reviewDuration = v;
        STATE.ui.homePracticeDuration = v;
        try { window.BlundersStudent?.resetReviewUi?.(); } catch {}
        render();
        return;
      }

      // Teacher all-blunders theme search (datalist): if user selects an exact tag, apply it.
      const ts = t?.closest?.('[data-bl-teacher-all-tag-search]');
      if (ts) {
        const v = String(ts.value || '').trim();
        if (!STATE.teacher.allUi || typeof STATE.teacher.allUi !== 'object') STATE.teacher.allUi = {};
        STATE.teacher.allUi.tagSearch = v;
        // If it matches a known tag exactly, apply filter immediately.
        const tagCounts = (STATE.teacher.allUi.tagCounts && typeof STATE.teacher.allUi.tagCounts === 'object') ? STATE.teacher.allUi.tagCounts : null;
        if (tagCounts && v && Object.prototype.hasOwnProperty.call(tagCounts, v)) {
          STATE.teacher.allTag = v;
          render();
          teacherLoad('allBlunders').catch(() => {});
        } else {
          // Just refresh dropdown options
          applyTeacherAllTagSearchFilter();
        }
        return;
      }
    });

    root.addEventListener('input', (ev) => {
      const t = ev.target;
      if (!t) return;
      if (t.id === 'blBoardLightInput' || t.id === 'blBoardDarkInput') {
        const lightEl = document.getElementById('blBoardLightInput');
        const darkEl = document.getElementById('blBoardDarkInput');
        const light = String(lightEl?.value || '').trim() || VCP_DEFAULTS.boardLight;
        const dark = String(darkEl?.value || '').trim() || VCP_DEFAULTS.boardDark;
        setBoardColors({ light, dark });
        // Re-render to refresh preview + input values
        render();
      }
    });

    root.addEventListener('input', (ev) => {
      const el = ev.target;
      // Teacher inputs
      const sEl = el?.closest?.('[data-bl-teacher-search]');
      if (sEl) {
        STATE.teacher.search = String(sEl.value || '');
        render();
        return;
      }
      const sd = el?.closest?.('[data-bl-teacher-student-date]');
      if (sd) {
        const sid = String(sd.getAttribute('data-bl-teacher-student-date') || '');
        const v = String(sd.value || '').trim();
        if (sid) {
          if (!STATE.teacher.dateByStudent || typeof STATE.teacher.dateByStudent !== 'object') STATE.teacher.dateByStudent = {};
          STATE.teacher.dateByStudent[sid] = v;
        }
        return;
      }
      const md = el?.closest?.('[data-bl-teacher-master-date]');
      if (md) {
        const mid = String(md.getAttribute('data-bl-teacher-master-date') || '');
        const v = String(md.value || '').trim();
        if (mid) {
          if (!STATE.teacher.dateByMaster || typeof STATE.teacher.dateByMaster !== 'object') STATE.teacher.dateByMaster = {};
          STATE.teacher.dateByMaster[mid] = v;
        }
        return;
      }
      const mhn = el?.closest?.('[data-bl-teacher-master-history-n]');
      if (mhn) {
        const mid = String(mhn.getAttribute('data-bl-teacher-master-history-n') || '');
        const v = Math.max(1, Math.min(500, Number(mhn.value || 0) || 200));
        if (mid) {
          if (!STATE.teacher.historyScanNMaster || typeof STATE.teacher.historyScanNMaster !== 'object') STATE.teacher.historyScanNMaster = {};
          STATE.teacher.historyScanNMaster[mid] = v;
        }
        return;
      }
      const ar = el?.closest?.('[data-bl-teacher-all-rating]');
      if (ar) {
        STATE.teacher.allRating = String(ar.value || 'any');
        render();
        teacherLoad('allBlunders').catch(() => {});
        return;
      }
      const at = el?.closest?.('[data-bl-teacher-all-tag]');
      if (at) {
        STATE.teacher.allTag = String(at.value || 'any');
        render();
        teacherLoad('allBlunders').catch(() => {});
        return;
      }
      const td = el?.closest?.('[data-bl-teacher-tag-duration]');
      if (td) {
        STATE.teacher.tagDuration = String(td.value || 'month');
        render();
        return;
      }
      const ts = el?.closest?.('[data-bl-teacher-all-tag-search]');
      if (ts) {
        if (!STATE.teacher.allUi || typeof STATE.teacher.allUi !== 'object') STATE.teacher.allUi = {};
        STATE.teacher.allUi.tagSearch = String(ts.value || '');
        applyTeacherAllTagSearchFilter();
        return;
      }
      const rj = el?.closest?.('[data-bl-review-jump]');
      if (rj) {
        const key = String(rj.getAttribute('data-bl-review-jump') || '');
        try { window.BlundersStudent?.reviewSetJump?.(key, String(rj.value || '')); } catch {}
        return;
      }
      const aj = el?.closest?.('[data-bl-teacher-all-jump]');
      if (aj) {
        const key = String(aj.getAttribute('data-bl-teacher-all-jump') || '');
        try { window.BlundersTeacher?.teacherAllSetJump?.(key, String(aj.value || '')); } catch {}
        return;
      }
      const mj = el?.closest?.('[data-bl-master-bucket-jump]');
      if (mj) {
        const key = String(mj.getAttribute('data-bl-master-bucket-jump') || '');
        masterBucketSetJump(key, String(mj.value || ''));
        return;
      }
      const bm = el?.closest?.('[data-bl-teacher-bulk-max]');
      if (bm) {
        STATE.teacher.bulkMaxGames = Number(bm.value);
        return;
      }
      const bt = el?.closest?.('[data-bl-teacher-bulk-thr]');
      if (bt) {
        STATE.teacher.bulkThreshold = Number(bt.value);
        return;
      }
      const bh = el?.closest?.('[data-bl-teacher-bulk-history]');
      if (bh) {
        STATE.teacher.bulkHistoryGames = Math.max(1, Math.min(500, Number(bh.value || 0) || 200));
        return;
      }
      const maxEl = el?.closest?.('[data-bl-teacher-student-max]');
      if (maxEl) {
        const sid = String(maxEl.getAttribute('data-bl-teacher-student-max') || '');
        const v = Number(maxEl.value);
        if (!STATE.teacher.edits.student[sid]) STATE.teacher.edits.student[sid] = {};
        STATE.teacher.edits.student[sid].maxGamesPerDay = Number.isFinite(v) ? v : 10;
        return;
      }
      const thrEl = el?.closest?.('[data-bl-teacher-student-thr]');
      if (thrEl) {
        const sid = String(thrEl.getAttribute('data-bl-teacher-student-thr') || '');
        const v = Number(thrEl.value);
        if (!STATE.teacher.edits.student[sid]) STATE.teacher.edits.student[sid] = {};
        STATE.teacher.edits.student[sid].thresholdPoints = Number.isFinite(v) ? v : 1.0;
        return;
      }
      const hn = el?.closest?.('[data-bl-teacher-history-n]');
      if (hn) {
        const sid = String(hn.getAttribute('data-bl-teacher-history-n') || '');
        const v = Math.max(1, Math.min(500, Number(hn.value || 0) || 200));
        if (!STATE.teacher.historyScanN || typeof STATE.teacher.historyScanN !== 'object') STATE.teacher.historyScanN = {};
        STATE.teacher.historyScanN[sid] = v;
        return;
      }
      const mn = el?.closest?.('[data-bl-teacher-master-name]');
      if (mn) {
        const idx = Number(mn.getAttribute('data-bl-teacher-master-name'));
        const cur = Array.isArray(STATE.teacher.edits.masters) ? STATE.teacher.edits.masters : [];
        if (!Number.isNaN(idx) && cur[idx]) cur[idx].name = String(mn.value || '');
        return;
      }
      const mu = el?.closest?.('[data-bl-teacher-master-user]');
      if (mu) {
        const idx = Number(mu.getAttribute('data-bl-teacher-master-user'));
        const cur = Array.isArray(STATE.teacher.edits.masters) ? STATE.teacher.edits.masters : [];
        if (!Number.isNaN(idx) && cur[idx]) cur[idx].username = String(mu.value || '');
        return;
      }
      const mm = el?.closest?.('[data-bl-teacher-mastercfg-max]');
      if (mm) {
        const v = Number(mm.value);
        if (!STATE.teacher.edits.masterCfg) STATE.teacher.edits.masterCfg = {};
        STATE.teacher.edits.masterCfg.maxGamesPerDay = Number.isFinite(v) ? v : 10;
        return;
      }
      const mt = el?.closest?.('[data-bl-teacher-mastercfg-thr]');
      if (mt) {
        const v = Number(mt.value);
        if (!STATE.teacher.edits.masterCfg) STATE.teacher.edits.masterCfg = {};
        STATE.teacher.edits.masterCfg.thresholdPoints = Number.isFinite(v) ? v : 1.0;
        return;
      }

      // Student settings inputs
      if (el?.closest?.('#blBoardLightInput') || el?.closest?.('#blBoardDarkInput')) {
        const light = document.getElementById('blBoardLightInput')?.value;
        const dark = document.getElementById('blBoardDarkInput')?.value;
        setBoardColors({ light, dark });
        render();
      }
    });

  function applyTeacherAllTagSearchFilter() {
    try {
      const root = document.getElementById('blundersRoot');
      if (!root) return;
      const input = root.querySelector('[data-bl-teacher-all-tag-search]');
      const select = root.querySelector('[data-bl-teacher-all-tag]');
      const dl = root.querySelector('#blTeacherAllTagList');
      if (!input || !select) return;

      const ui = (STATE.teacher?.allUi && typeof STATE.teacher.allUi === 'object') ? STATE.teacher.allUi : {};
      const tagCounts = (ui.tagCounts && typeof ui.tagCounts === 'object') ? ui.tagCounts : null;
      const q = String(input.value || '').trim().toLowerCase();
      if (!tagCounts) return;

      const entries = Object.entries(tagCounts)
        .map(([k, v]) => ({ k: String(k), n: Number(v || 0) || 0 }))
        .filter(x => x.k && x.k !== 'any')
        .filter(x => !q || x.k.toLowerCase().includes(q))
        .sort((a, b) => (b.n - a.n) || a.k.localeCompare(b.k))
        .slice(0, 200);

      const selected = String(STATE.teacher?.allTag || 'any');
      const optsHtml = [
        `<option value="any"${selected === 'any' ? ' selected' : ''}>Any theme</option>`,
        ...entries.map(x => `<option value="${escapeHtml(x.k)}"${selected === x.k ? ' selected' : ''}>${escapeHtml(`${x.k} (${x.n})`)}</option>`)
      ].join('');
      select.innerHTML = optsHtml;

      if (dl) {
        dl.innerHTML = entries.map(x => `<option value="${escapeHtml(x.k)}"></option>`).join('');
      }
    } catch {}
  }
  }

  window.initBlunders = initBlunders;
})();



