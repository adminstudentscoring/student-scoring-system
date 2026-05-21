              <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; margin-top:10px;">
                <button id="tfSubMsgClear" class="btn btn-secondary" type="button">Clear</button>
                <button id="tfSubMsgCancel" class="btn btn-secondary" type="button">Cancel</button>
                <button id="tfSubMsgSave" class="btn btn-primary" type="button">Save</button>
              </div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);

      const close = () => { try { host.remove(); } catch {} };
      host.querySelector('#tfSubMsgClose')?.addEventListener('click', close);
      host.querySelector('#tfSubMsgCancel')?.addEventListener('click', close);
      host.querySelector('#tfSubMsgBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'tfSubMsgBackdrop') close();
      });
      host.querySelector('#tfSubMsgClear')?.addEventListener('click', () => {
        const ta = host.querySelector('#tfSubMsgInput');
        if (ta) ta.value = '';
      });
      host.querySelector('#tfSubMsgSave')?.addEventListener('click', async () => {
        try {
          const ta = host.querySelector('#tfSubMsgInput');
          const msg = String(ta?.value ?? '');
          await builderUpdateSubtopicMessage(sid, msg);
          await builderRefresh();
          close();
        } catch (e) {
          showBuilderMsg('err', e?.message || String(e));
        }
      });
    }

    function studentFindCategoryById(cid) {
      const cats = Array.isArray(ui.student.tree?.categories) ? ui.student.tree.categories : [];
      return cats.find((c) => String(c.id) === String(cid)) || null;
    }

    function studentFindTopicById(category, tid) {
      const topics = Array.isArray(category?.topics) ? category.topics : [];
      return topics.find((t) => String(t.id) === String(tid)) || null;
    }

    function teacherFindCategoryById(cid) {
      const cats = Array.isArray(ui.teacher.tree?.categories) ? ui.teacher.tree.categories : [];
      return cats.find((c) => String(c.id) === String(cid)) || null;
    }

    function teacherFindTopicById(category, tid) {
      const topics = Array.isArray(category?.topics) ? category.topics : [];
      return topics.find((t) => String(t.id) === String(tid)) || null;
    }

    function teacherFindSubtopicById(topic, sid) {
      const subs = Array.isArray(topic?.subtopics) ? topic.subtopics : [];
      return subs.find((s) => String(s.id) === String(sid)) || null;
    }

    function builderFindSubtopicById(sid) {
      const cats = Array.isArray(ui.builderTree) ? ui.builderTree : [];
      for (const c of cats) {
        const topics = Array.isArray(c?.topics) ? c.topics : [];
        for (const t of topics) {
          const subs = Array.isArray(t?.subtopics) ? t.subtopics : [];
          const found = subs.find((s) => String(s.id) === String(sid));
          if (found) return found;
        }
      }
      return null;
    }

    async function teacherFetchTree(bucket) {
      const b = normalizeBucketKey(bucket);
      tfDbgTeacherPractice('teacherFetchTree:request', { bucket: b });
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/tree?bucket=${encodeURIComponent(b)}`, { method: 'GET' });
      const data = await tfJson(resp);
      tfDbgTeacherPractice('teacherFetchTree:response', {
        bucket: b,
        categoryCount: Array.isArray(data?.categories) ? data.categories.length : 0,
        firstSubtopicSample: (() => {
          try {
            const c0 = data?.categories?.[0];
            const t0 = c0?.topics?.[0];
            const s0 = t0?.subtopics?.[0];
            return s0
              ? { id: s0.id, name: s0.name, puzzleCount: s0.puzzleCount, keys: Object.keys(s0) }
              : null;
          } catch {
            return null;
          }
        })()
      });
      return data;
    }

    async function teacherShowCategories(bucket) {
      toastShow('loading', 'Loading...');
      try {
        ui.teacher.bucket = normalizeBucketKey(bucket);
        try { localStorage.setItem('tacticsFighterPracticeBucket', ui.teacher.bucket); } catch {}
        const data = await teacherFetchTree(ui.teacher.bucket);
        tfDbgTeacherPractice('teacherShowCategories:afterFetch', {
          bucket: ui.teacher.bucket,
          rawFirstSubtopic: (() => {
            try {
              const c0 = data?.categories?.[0];
              const t0 = c0?.topics?.[0];
              return t0?.subtopics?.[0] ?? null;
            } catch {
              return null;
            }
          })()
        });
        ui.teacher.tree = { categories: Array.isArray(data?.categories) ? data.categories : [] };
        ui.teacher.view = 'categories';
        ui.teacher.categoryId = null;
        ui.teacher.topicId = null;
        ui.teacher.subtopicId = null;
        ui.teacher.puzzlesAll = [];
        ui.teacher.page = 1;
        // Hide bucket buttons once a bucket is chosen (match student UX)
        try {
          const bucketsEl = document.getElementById('tfPracticeBuckets');
          if (bucketsEl) bucketsEl.style.display = 'none';
        } catch {}
        toastHide();
        setOut(renderTeacherCategories(ui.teacher.tree.categories || []));
      } catch (e) {
        toastShow('err', e?.message || String(e));
        setOut(`<div class="tf-builder-msg err" style="display:block;">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    function renderTeacherCategories(categories) {
      const cats = Array.isArray(categories) ? categories : [];
      if (!cats.length) return `<div class="tf-muted">No categories for this bucket yet.</div>`;
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <div class="tf-section-title">Categories</div>
            <div class="tf-muted" style="margin-bottom:10px;">Pick a category to see topics.</div>
          </div>
          <button type="button" class="btn btn-secondary" data-tea-back="buckets">Change bucket</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${cats.map((c) => `
            <button type="button" class="btn btn-secondary" data-tea-cat="${escapeHtml(String(c.id))}" style="text-align:left;">
              <strong>${escapeHtml(String(c.name || ''))}</strong>
            </button>
          `).join('')}
        </div>
      `;
    }

    function renderTeacherTopics(category) {
      const topics = Array.isArray(category?.topics) ? category.topics : [];
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <div class="tf-section-title">Topics</div>
            <div class="tf-muted">${escapeHtml(String(category?.name || ''))}</div>
          </div>
          <button type="button" class="btn btn-secondary" data-tea-back="categories">Back</button>
        </div>
        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${topics.length ? topics.map((t) => `
            <button type="button" class="btn btn-secondary" data-tea-topic="${escapeHtml(String(t.id))}" style="text-align:left;">
              <strong>${escapeHtml(String(t.name || ''))}</strong>
            </button>
          `).join('') : `<div class="tf-muted">No topics yet.</div>`}
        </div>
      `;
    }

    function renderTeacherSubtopics(category, topic) {
      const subs = Array.isArray(topic?.subtopics) ? topic.subtopics : [];
      tfDbgTeacherPractice('renderTeacherSubtopics', {
        categoryId: category?.id,
        topicId: topic?.id,
        subCount: subs.length,
        rows: subs.map((s) => ({
          id: s?.id,
          name: s?.name,
          puzzleCount: s?.puzzleCount,
          renderedCount: Number(s?.puzzleCount || 0)
        }))
      });
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <div class="tf-section-title">Subtopics</div>
            <div class="tf-muted">${escapeHtml(String(category?.name || ''))} → ${escapeHtml(String(topic?.name || ''))}</div>
          </div>
          <button type="button" class="btn btn-secondary" data-tea-back="topics">Back</button>
        </div>
        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${subs.length ? subs.map((s) => `
            <button type="button" class="btn btn-secondary" data-tea-subtopic="${escapeHtml(String(s.id))}" style="text-align:left;">
              <strong>${escapeHtml(String(s.name || ''))}</strong>
              <span class="tf-muted" style="margin-left:8px;">(${Number(s.puzzleCount || 0)} puzzles)</span>
            </button>
          `).join('') : `<div class="tf-muted">No subtopics yet.</div>`}
        </div>
      `;
    }

    function renderTeacherPuzzles(subtopicName, puzzlesAll, page, pageSize) {
      const all = Array.isArray(puzzlesAll) ? puzzlesAll : [];
      const ps = Math.max(1, Number(pageSize || 10));
      const total = all.length;
      const totalPages = Math.max(1, Math.ceil(total / ps));
      const p = Math.max(1, Math.min(totalPages, Number(page || 1)));
      const start = (p - 1) * ps;
      const list = all.slice(start, start + ps);

      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <div class="tf-section-title">Puzzles</div>
            <div class="tf-muted">${escapeHtml(String(subtopicName || ''))}</div>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button type="button" class="btn btn-primary" data-tea-start="1">Start</button>
            <button type="button" class="btn btn-secondary" data-tea-choose-students="1">Choose Student to start</button>
            <button type="button" class="btn btn-secondary" data-tea-back="subtopics">Back</button>
          </div>
        </div>

        <div style="margin-top:12px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div class="tf-muted">Page ${p} / ${totalPages} · ${total} puzzles</div>
          <div style="display:flex; gap:10px;">
            <button type="button" class="btn btn-secondary" data-tea-page="prev" ${p <= 1 ? 'disabled' : ''}>Prev</button>
            <button type="button" class="btn btn-secondary" data-tea-page="next" ${p >= totalPages ? 'disabled' : ''}>Next</button>
          </div>
        </div>

        <div class="tf-puzzles-grid" style="margin-top:12px;">
          ${list.length ? list.map((pz) => `
            <button type="button" class="tf-puzzle-card" data-tea-open-puzzle="${escapeHtml(String(pz.id))}" aria-label="Open puzzle">
              <div style="position:relative;">
                ${renderMiniBoardHtml(pz.fen)}
              </div>
            </button>
          `).join('') : `<div class="tf-muted">No puzzle is found.</div>`}
        </div>
      `;
    }

    async function teacherOpenSubtopic(subtopicId) {
      ui.teacher.view = 'puzzles';
      ui.teacher.subtopicId = String(subtopicId);
      ui.teacher.page = 1;
      ui.teacher.puzzlesAll = [];
      toastShow('loading', 'Loading puzzles...');
      try {
        const data = await builderFetchPuzzles(ui.teacher.subtopicId);
        tfDbgTeacherPractice('teacherOpenSubtopic:builderFetchPuzzles', {
          subtopicId: ui.teacher.subtopicId,
          puzzleLen: Array.isArray(data?.puzzles) ? data.puzzles.length : 0
        });
        ui.teacher.puzzlesAll = Array.isArray(data?.puzzles) ? data.puzzles : [];
        toastHide();
        const cat = teacherFindCategoryById(ui.teacher.categoryId);
        const topic = teacherFindTopicById(cat, ui.teacher.topicId);
        const sub = teacherFindSubtopicById(topic, ui.teacher.subtopicId);
        setOut(renderTeacherPuzzles(sub?.name || 'Subtopic', ui.teacher.puzzlesAll, ui.teacher.page, ui.teacher.pageSize));
      } catch (e) {
        toastShow('err', e?.message || String(e));
        setOut(`<div class="tf-builder-msg err" style="display:block;">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    function teacherChangePuzzlePage(dir) {
      const total = Array.isArray(ui.teacher.puzzlesAll) ? ui.teacher.puzzlesAll.length : 0;
      const ps = Math.max(1, Number(ui.teacher.pageSize || 10));
      const totalPages = Math.max(1, Math.ceil(total / ps));
      const next = dir === 'next' ? Math.min(totalPages, ui.teacher.page + 1) : Math.max(1, ui.teacher.page - 1);
      if (next === ui.teacher.page) return;
      ui.teacher.page = next;
      const cat = teacherFindCategoryById(ui.teacher.categoryId);
      const topic = teacherFindTopicById(cat, ui.teacher.topicId);
      const sub = teacherFindSubtopicById(topic, ui.teacher.subtopicId);
      setOut(renderTeacherPuzzles(sub?.name || 'Subtopic', ui.teacher.puzzlesAll, ui.teacher.page, ui.teacher.pageSize));
    }

    async function openTeacherChooseStudentsModal() {
      const subtopicId = String(ui.teacher.subtopicId || '').trim();
      const bucket = String(ui.teacher.bucket || '').trim();
      if (!subtopicId || !bucket) {
        toastShow('err', 'Please select a subtopic first.');
        return;
      }
      toastShow('loading', 'Loading students...');
      try {
        const resp = await apiRequest('/api/teachers/class-view/students', { method: 'GET' });
        const data = await tfJson(resp);
        toastHide();

        const all = Array.isArray(data?.allStudents) ? data.allStudents : [];
        const classIds = new Set((Array.isArray(data?.selectedStudentIds) ? data.selectedStudentIds : []).map(String));
        const selected = new Set(); // start empty
        let q = '';

        const host = document.createElement('div');
        host.innerHTML = `
          <div class="vcp-modal-backdrop" id="tfChooseStuBackdrop" role="presentation">
            <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Choose students" style="width: calc(100vw - 40px); max-width: 980px;">
              <div class="vcp-modal-header">
                <div class="vcp-modal-title">Choose Student to start</div>
                <button id="tfChooseStuClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
              </div>
              <div class="vcp-modal-body">
                <div class="tf-muted">Select students, then confirm to generate links.</div>
                <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                  <input id="tfChooseStuSearch" class="tf-input" type="search" placeholder="Search name or ID" style="flex:1 1 240px; min-width:220px; max-width: 420px;">
                  <button id="tfChooseStuPickClass" class="btn btn-secondary" type="button">Select students in Class View now</button>
                  <button id="tfChooseStuSelectAll" class="btn btn-secondary" type="button">Select all</button>
                  <button id="tfChooseStuClear" class="btn btn-secondary" type="button">Clear</button>
                  <div class="tf-muted" id="tfChooseStuCount" style="margin-left:auto;">0 selected</div>
                </div>
                <div id="tfChooseStuList" style="margin-top:12px; display:flex; flex-direction:column; gap:8px; max-height: min(60vh, 520px); overflow:auto; padding-right:6px;"></div>
              </div>
              <div class="vcp-modal-actions" style="display:flex; justify-content:flex-end; gap:10px; padding: 0 16px 16px;">
                <button id="tfChooseStuCancel" class="btn btn-secondary" type="button">Cancel</button>
                <button id="tfChooseStuConfirm" class="btn btn-primary" type="button" disabled>Confirm</button>
              </div>
            </div>
          </div>
        `;
        root.appendChild(host);

        const close = () => { try { host.remove(); } catch {} };
        host.querySelector('#tfChooseStuClose')?.addEventListener('click', close);
        host.querySelector('#tfChooseStuCancel')?.addEventListener('click', close);
        host.querySelector('#tfChooseStuBackdrop')?.addEventListener('click', (e) => {
          if (e.target && e.target.id === 'tfChooseStuBackdrop') close();
        });

        const listEl = host.querySelector('#tfChooseStuList');
        const countEl = host.querySelector('#tfChooseStuCount');
        const confirmBtn = host.querySelector('#tfChooseStuConfirm');
        const searchEl = host.querySelector('#tfChooseStuSearch');

        const setCount = () => {
          const n = selected.size;
          if (countEl) countEl.textContent = `${n} selected`;
          if (confirmBtn) confirmBtn.disabled = n <= 0;
        };

        const filteredStudents = () => {
          const qq = String(q || '').trim().toLowerCase();
          if (!qq) return all;
          return all.filter((s) => {
            const sid = String(s?.id || '').trim().toLowerCase();
            const name = String(s?.name || '').trim().toLowerCase();
            return (sid && sid.includes(qq)) || (name && name.includes(qq));
          });
        };

        const renderList = () => {
          if (!listEl) return;
          listEl.innerHTML = '';
          const shown = filteredStudents();
          if (!all.length) {
            listEl.innerHTML = `<div class="tf-muted">No students found.</div>`;
            return;
          }
          if (!shown.length) {
            listEl.innerHTML = `<div class="tf-muted">No matching students.</div>`;
            return;
          }
          for (const s of shown) {
            const sid = String(s?.id || '').trim();
            const name = String(s?.name || '').trim() || sid;
            const inClass = classIds.has(sid);
            const checked = selected.has(sid);
            const row = document.createElement('label');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '10px';
            row.style.padding = '10px 12px';
            row.style.border = '1px solid #e5e7eb';
            row.style.borderRadius = '12px';
            row.style.background = '#ffffff';
            row.style.cursor = 'pointer';
            row.innerHTML = `
              <input type="checkbox" style="width:18px; height:18px;" ${checked ? 'checked' : ''} data-sid="${escapeHtml(sid)}">
              <div style="min-width:0;">
                <div style="font-weight:950; color:#111827;">${escapeHtml(name)}</div>
                <div class="tf-muted" style="margin-top:2px;">ID: ${escapeHtml(sid)}${inClass ? ' · In Class View' : ''}</div>
              </div>
            `;
            row.addEventListener('click', (ev) => {
              const cb = row.querySelector('input[type="checkbox"]');
              if (!cb) return;
              // Toggle when clicking the row (except when clicking checkbox directly, browser toggles already)
              if (!(ev.target && ev.target.tagName === 'INPUT')) cb.checked = !cb.checked;
              if (cb.checked) selected.add(sid);
              else selected.delete(sid);
              setCount();
            });
            listEl.appendChild(row);
          }
        };

        renderList();
        setCount();

        searchEl?.addEventListener('input', () => {
          q = String(searchEl.value || '');
          renderList();
        });

        host.querySelector('#tfChooseStuPickClass')?.addEventListener('click', () => {
          for (const sid of classIds) selected.add(String(sid));
          renderList();
          setCount();
        });
        host.querySelector('#tfChooseStuSelectAll')?.addEventListener('click', () => {
          const shown = filteredStudents();
          for (const s of shown) selected.add(String(s?.id || '').trim());
          renderList();
          setCount();
        });
        host.querySelector('#tfChooseStuClear')?.addEventListener('click', () => {
          selected.clear();
          renderList();
          setCount();
        });

        host.querySelector('#tfChooseStuConfirm')?.addEventListener('click', () => {
          const chosen = all.filter((s) => selected.has(String(s?.id || '').trim()));
          close();
          openTeacherLinksModal({ bucket, subtopicId, students: chosen });
        });
      } catch (e) {
        toastShow('err', e?.message || String(e));
      }
    }

    function openTeacherLinksModal({ bucket, subtopicId, students }) {
      const list = Array.isArray(students) ? students : [];
      const b = normalizeBucketKey(bucket);
      const sid = String(subtopicId || '').trim();
      const origin = window.location.origin;
      const lines = list.map((s) => {
        const id = String(s?.id || '').trim();
        const name = String(s?.name || '').trim() || id;
        const url = `${origin}/student.html?id=${encodeURIComponent(id)}&openTab=game&openGame=tacticsFighter&autoStart=1&tfBucket=${encodeURIComponent(b)}&tfSubtopicId=${encodeURIComponent(sid)}`;
