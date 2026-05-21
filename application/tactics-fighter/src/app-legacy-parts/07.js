        return { name, url };
      });

      const host = document.createElement('div');
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="tfLinksBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Student links" style="width: calc(100vw - 40px); max-width: 980px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Student links</div>
              <button id="tfLinksClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div class="tf-muted">Students will open directly into the selected subtopic (Tactics Fighter).</div>
              <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
                <button id="tfLinksCopyAll" class="btn btn-primary" type="button">Copy all</button>
              </div>
              <div id="tfLinksList" style="margin-top:12px; display:flex; flex-direction:column; gap:10px; max-height: min(60vh, 520px); overflow:auto; padding-right:6px;"></div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);

      const close = () => { try { host.remove(); } catch {} };
      host.querySelector('#tfLinksClose')?.addEventListener('click', close);
      host.querySelector('#tfLinksBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'tfLinksBackdrop') close();
      });

      const listEl = host.querySelector('#tfLinksList');
      if (listEl) {
        listEl.innerHTML = lines.length ? lines.map((x) => `
          <div style="border:1px solid #e5e7eb; border-radius:12px; padding:12px; background:#ffffff;">
            <div style="font-weight:950; color:#111827;">${escapeHtml(x.name)}</div>
            <div style="margin-top:6px; word-break:break-all; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 12px; color:#111827;">${escapeHtml(x.url)}</div>
          </div>
        `).join('') : `<div class="tf-muted">No students selected.</div>`;
      }

      host.querySelector('#tfLinksCopyAll')?.addEventListener('click', async () => {
        const text = lines.map((x) => `${x.name}\n${x.url}\n`).join('\n');
        try {
          await navigator.clipboard.writeText(text);
          toastShow('ok', 'Copied.', { autoHideMs: 2000 });
        } catch {
          try { window.prompt('Copy links:', text); } catch {}
        }
      });
    }

    async function studentLoadTree(bucket) {
      ui.student.bucket = normalizeBucketKey(bucket);
      try { localStorage.setItem('tacticsFighterPracticeBucket', ui.student.bucket); } catch {}
      if (!publicStudentId) throw new Error('Missing student id');
      const tree = await studentFetchTree(publicStudentId, ui.student.bucket, publicStudentPassword);
      ui.student.tree = tree;
      return tree;
    }

    async function studentShowCategories(bucket) {
      toastShow('loading', 'Loading...');
      try {
        const tree = await studentLoadTree(bucket);
        ui.student.view = 'categories';
        ui.student.categoryId = null;
        ui.student.topicId = null;
        ui.student.subtopicId = null;
        // Hide bucket buttons once a bucket is chosen (as requested).
        try {
          const bucketsEl = document.getElementById('tfPracticeBuckets');
          if (bucketsEl) bucketsEl.style.display = 'none';
        } catch {}
        toastHide();
        setOut(renderStudentCategories(tree.categories || []));
      } catch (e) {
        toastShow('err', e?.message || String(e));
        setOut(`<div class="tf-builder-msg err" style="display:block;">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function studentApplyDeepLinkIfAny() {
      if (isTeacher) return false;
      try {
        const params = new URLSearchParams(window.location.search);
        const qBucket = String(params.get('bucket') || '').trim();
        const qSub = String(params.get('subtopicId') || '').trim();
        let dl = null;
        try {
          const raw = localStorage.getItem('tacticsFighterDeepLink');
          if (raw) dl = JSON.parse(raw);
        } catch {}
        const bucket = normalizeBucketKey(qBucket || dl?.bucket || ui.student.bucket || 'beginner');
        const subtopicId = String(qSub || dl?.subtopicId || '').trim();
        if (!subtopicId) return false;
        // Clear stored deep link (one-shot)
        try { localStorage.removeItem('tacticsFighterDeepLink'); } catch {}
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('bucket');
          url.searchParams.delete('subtopicId');
          window.history.replaceState(null, '', url.toString());
        } catch {}

        // Ensure tree loaded for bucket, then jump directly to subtopic puzzles.
        toastShow('loading', 'Loading...');
        ui.student.view = 'puzzles';
        await studentLoadTree(bucket);
        // Hide bucket buttons once a bucket is chosen (as requested).
        try {
          const bucketsEl = document.getElementById('tfPracticeBuckets');
          if (bucketsEl) bucketsEl.style.display = 'none';
        } catch {}
        ui.student.subtopicId = String(subtopicId);
        await studentOpenSubtopic(subtopicId);
        // Auto-open the first puzzle in this subtopic.
        try {
          ui.student.runner = { absIndex: 0 };
          await openStudentRunnerModal();
        } catch {}
        toastHide();
        return true;
      } catch (e) {
        toastShow('err', e?.message || String(e));
        return false;
      }
    }

    async function studentOpenSubtopic(subtopicId) {
      ui.student.view = 'puzzles';
      ui.student.subtopicId = String(subtopicId);
      ui.student.page = 1;
      ui.student.total = 0;
      ui.student.puzzles = [];
      ui.student.puzzlePages = {};
      ui.student.verdictByPuzzleId = {};
      ui.student.subtopicMessage = '';
      ui.student.puzzleSource = 'subtopic';
      toastShow('loading', 'Loading puzzles...');
      try {
        const data = await studentFetchSubtopicPuzzles(publicStudentId, ui.student.subtopicId, ui.student.bucket, ui.student.page, ui.student.pageSize, publicStudentPassword);
        ui.student.puzzles = Array.isArray(data.puzzles) ? data.puzzles : [];
        ui.student.total = Number(data.total || 0);
        ui.student.subtopicMessage = String(data.subtopicMessage || '');
        ui.student.puzzlePages[String(ui.student.page)] = { puzzles: ui.student.puzzles, total: ui.student.total, pageSize: ui.student.pageSize, subtopicMessage: ui.student.subtopicMessage };
        toastHide();
        setOut(renderStudentPuzzles(ui.student.puzzles, ui.student.page, ui.student.pageSize, ui.student.total));
      } catch (e) {
        toastShow('err', e?.message || String(e));
        setOut(`<div class="tf-builder-msg err" style="display:block;">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function studentEnsurePuzzlePage(page) {
      const p = Math.max(1, Number(page || 1));
      const key = String(p);
      if (ui.student.puzzlePages && ui.student.puzzlePages[key]) return ui.student.puzzlePages[key];
      if (String(ui.student.puzzleSource || '') === 'ghost') {
        // Ghost mode uses preloaded in-memory pages only.
        return { puzzles: [], total: Number(ui.student.total || 0), pageSize: Number(ui.student.pageSize || 10) };
      }
      const data = await studentFetchSubtopicPuzzles(publicStudentId, ui.student.subtopicId, ui.student.bucket, p, ui.student.pageSize, publicStudentPassword);
      const puzzles = Array.isArray(data.puzzles) ? data.puzzles : [];
      const total = Number(data.total || 0);
      ui.student.total = total;
      ui.student.subtopicMessage = String(data.subtopicMessage || ui.student.subtopicMessage || '');
      if (!ui.student.puzzlePages) ui.student.puzzlePages = {};
      ui.student.puzzlePages[key] = { puzzles, total, pageSize: ui.student.pageSize, subtopicMessage: ui.student.subtopicMessage };
      return ui.student.puzzlePages[key];
    }

    async function studentChangePuzzlePage(dir) {
      const total = Number(ui.student.total || 0);
      const pageSize = Number(ui.student.pageSize || 10);
      const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
      const next = dir === 'next' ? Math.min(totalPages, ui.student.page + 1) : Math.max(1, ui.student.page - 1);
      if (next === ui.student.page) return;
      ui.student.page = next;
      toastShow('loading', 'Loading puzzles...');
      try {
        const cached = await studentEnsurePuzzlePage(ui.student.page);
        ui.student.puzzles = Array.isArray(cached?.puzzles) ? cached.puzzles : [];
        ui.student.total = Number(cached?.total || ui.student.total || 0);
        toastHide();
        setOut(renderStudentPuzzles(ui.student.puzzles, ui.student.page, ui.student.pageSize, ui.student.total));
      } catch (e) {
        toastShow('err', e?.message || String(e));
        setOut(`<div class="tf-builder-msg err" style="display:block;">${escapeHtml(e?.message || String(e))}</div>`);
      }
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
        if (titleEl) titleEl.textContent = (nm === 'home' ? 'Home' : nm === 'practice' ? 'Practice Mode' : nm === 'challenge' ? 'Challenge Mode' : nm === 'builder' ? 'Builder' : 'Setting');
      } catch {}
      // Home: load stats (student only)
      if (nm === 'home' && !isTeacher && publicStudentId) {
        (async () => {
          try {
            const main = document.getElementById('tfMain');
            toastShow('loading', 'Loading...');
            if (main) main.innerHTML = `<div class="tf-muted"></div>`;
            const stats = await studentFetchStats(publicStudentId, null, publicStudentPassword);
            ui.student.stats = stats;
            toastHide();
            if (main) main.innerHTML = renderHome(stats);
          } catch (e) {
            const main = document.getElementById('tfMain');
            toastShow('err', e?.message || String(e));
            if (main) main.innerHTML = `<div class="tf-builder-msg err" style="display:block;">${escapeHtml(e?.message || String(e))}</div>`;
          }
        })();
      }
      if (nm === 'practice' && !isTeacher && ui.student.tree && ui.student.view !== 'bucket') {
        if (ui.student.view === 'categories') {
          setOut(renderStudentCategories(ui.student.tree.categories || []));
        } else if (ui.student.view === 'topics') {
          const cat = studentFindCategoryById(ui.student.categoryId);
          setOut(cat ? renderStudentTopics(cat) : renderStudentCategories(ui.student.tree.categories || []));
        } else if (ui.student.view === 'subtopics') {
          const cat = studentFindCategoryById(ui.student.categoryId);
          const topic = studentFindTopicById(cat, ui.student.topicId);
          setOut((cat && topic) ? renderStudentSubtopics(cat, topic) : renderStudentCategories(ui.student.tree.categories || []));
        } else if (ui.student.view === 'puzzles') {
          setOut(renderStudentPuzzles(ui.student.puzzles, ui.student.page, ui.student.pageSize, ui.student.total));
        } else {
          setOut(renderStudentCategories(ui.student.tree.categories || []));
        }
      } else if (cfg) {
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
        // Bulk PV plies (shared) setting
        tree?.addEventListener('change', (ev) => {
          const t = ev.target;
          if (!(t instanceof Element)) return;
          const pv = t.closest?.('[data-tf-bulk-pv]');
          if (!pv) return;
          const v = Number(pv.value || 0);
          setBulkPvPlies(v);
        });
        tree?.addEventListener('click', async (ev) => {
          const t = ev.target;
          const toggleBtn = t?.closest?.('[data-tf-toggle]');
          if (toggleBtn) {
            const kind = String(toggleBtn.getAttribute('data-tf-toggle') || '');
            const id = String(toggleBtn.getAttribute('data-id') || '');
            if (!id) return;
            const set = kind === 'cat' ? ui.expanded.cat : kind === 'topic' ? ui.expanded.topic : ui.expanded.subtopic;
            const wasOpen = set.has(id);
            if (wasOpen) {
              set.delete(id);
              await builderRefresh();
              return;
            }
            set.add(id);
            // Auto-load puzzles on first open of a subtopic (no need to click Load).
            if (kind === 'subtopic' && !ui.expanded.puzzlesLoaded.has(id)) {
              try {
                const data = await builderFetchPuzzles(id);
                ui.puzzlesBySubtopic.set(id, Array.isArray(data.puzzles) ? data.puzzles : []);
                ui.expanded.puzzlesLoaded.add(id);
                ui.puzzlePageBySubtopic.set(id, 0);
              } catch (e) {
                showBuilderMsg('err', e?.message || String(e));
              }
            }
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

          const moveCatBtn = t?.closest?.('[data-tf-move-cat]');
          if (moveCatBtn) {
            const cid = String(moveCatBtn.getAttribute('data-tf-move-cat') || '');
            openMoveCategoryModal(cid).catch((e) => showBuilderMsg('err', e?.message || String(e)));
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

          const msgSubBtn = t?.closest?.('[data-tf-message-subtopic]');
          if (msgSubBtn) {
            const sid = String(msgSubBtn.getAttribute('data-tf-message-subtopic') || '');
            if (!sid) return;
            openSubtopicMessageModal(sid).catch((e) => showBuilderMsg('err', e?.message || String(e)));
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
              ui.puzzlePageBySubtopic.set(sid, 0);
              await builderRefresh();
            } catch (e) {
              showBuilderMsg('err', e?.message || String(e));
            }
            return;
          }

          const bulkBtn = t?.closest?.('[data-tf-bulk-import]');
          if (bulkBtn) {
            const sid = String(bulkBtn.getAttribute('data-tf-bulk-import') || '');
            if (!sid) return;
            try {
              await openBulkImportModal(sid);
            } catch (e) {
              showBuilderMsg('err', e?.message || String(e));
            }
            return;
          }

          const pagePrevBtn = t?.closest?.('[data-tf-page-prev]');
          if (pagePrevBtn) {
            const sid = String(pagePrevBtn.getAttribute('data-tf-page-prev') || '');
            const cur = Number(ui.puzzlePageBySubtopic.get(sid) || 0) || 0;
            ui.puzzlePageBySubtopic.set(sid, Math.max(0, cur - 1));
            await builderRefresh();
            return;
          }

          const pageNextBtn = t?.closest?.('[data-tf-page-next]');
          if (pageNextBtn) {
            const sid = String(pageNextBtn.getAttribute('data-tf-page-next') || '');
            const cur = Number(ui.puzzlePageBySubtopic.get(sid) || 0) || 0;
            ui.puzzlePageBySubtopic.set(sid, cur + 1);
            await builderRefresh();
            return;
          }

          const openPuzzleBtn = t?.closest?.('[data-tf-open-puzzle]');
          if (openPuzzleBtn) {
