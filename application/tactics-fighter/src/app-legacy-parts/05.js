        if (!drag.active) {
          drag.pointerId = null;
          drag.from = null;
          drag.piece = '';
          drag.startX = 0;
          drag.startY = 0;
          return;
        }
        const from = drag.from;
        const to = coordFromPoint(ev.clientX, ev.clientY);
        endDrag();
        ui.teacher.runner.selectedFrom = null;
        if (!from || !to || from === to) return renderRunner();
        applyTeacherMove(from, to);
      });

      modal.addEventListener('pointercancel', (ev) => {
        if (drag.pointerId !== ev.pointerId) return;
        if (drag.active) {
          endDrag();
          ui.teacher.runner.selectedFrom = null;
          renderRunner();
          return;
        }
        drag.pointerId = null;
        drag.from = null;
        drag.piece = '';
        drag.startX = 0;
        drag.startY = 0;
      });

      modal.addEventListener('click', (ev) => {
        if (Date.now() < ignoreClickUntil) return;
        const t = ev.target;
        if (!(t instanceof Element)) return;
        if (t.closest('[data-tea-runner-close]')) return close();
        if (t.closest('[data-tea-feedback-next]')) {
          (async () => {
            const cur = clampAbs(ui.teacher.runner?.absIndex);
            await transitionToAbsIndex(cur + 1);
          })();
          return;
        }
        if (t.closest('[data-tea-feedback-redo]')) {
          (async () => {
            try {
              if (ui.teacher.runner.busy) return;
              const cur = clampAbs(ui.teacher.runner?.absIndex);
              await transitionToAbsIndex(cur);
            } catch (e) {
              setMsg('err', e?.message || String(e));
              renderRunner();
            }
          })();
          return;
        }
        if (t.closest('[data-tea-prev]')) {
          (async () => {
            const cur = clampAbs(ui.teacher.runner?.absIndex);
            await transitionToAbsIndex(cur - 1);
          })();
          return;
        }
        if (t.closest('[data-tea-next]')) {
          (async () => {
            const cur = clampAbs(ui.teacher.runner?.absIndex);
            await transitionToAbsIndex(cur + 1);
          })();
          return;
        }
        if (t.closest('[data-tea-undo]')) {
          (async () => {
            try {
              if (ui.teacher.runner.busy) return;
              const cur = clampAbs(ui.teacher.runner?.absIndex);
              await transitionToAbsIndex(cur);
            } catch (e) {
              setMsg('err', e?.message || String(e));
              renderRunner();
            }
          })();
          return;
        }
        if (t.closest('[data-tea-submit]')) {
          return submitMoveAndReply();
        }
        const sq = t.closest('[data-tea-sq]');
        if (sq) {
          const coord = String(sq.getAttribute('data-tea-sq') || '').trim();
          if (!coord) return;
          if (!ui.teacher.runner.selectedFrom) {
            ui.teacher.runner.selectedFrom = coord;
            return renderRunner();
          }
          const from = ui.teacher.runner.selectedFrom;
          const to = coord;
          ui.teacher.runner.selectedFrom = null;
          return applyTeacherMove(from, to);
        }
      });

      renderRunner();
    }

    function renderBuilderTree(categories) {
      const host = document.getElementById('tfBuilderTree');
      if (!host) return;

      const cats = Array.isArray(categories) ? categories : [];
      if (!cats.length) {
        host.innerHTML = `<div class="tf-muted">No categories yet. Click <strong>Create</strong> to add one.</div>`;
        return;
      }

      host.innerHTML = cats.map((c) => {
        const catId = String(c.id);
        const catOpen = ui.expanded.cat.has(catId);
        const topics = Array.isArray(c.topics) ? c.topics : [];
        return `
          <div class="tf-tree-card">
            <div class="tf-tree-row">
              <button type="button" class="tf-plus ${catOpen ? 'is-open' : ''}" data-tf-toggle="cat" data-id="${escapeHtml(catId)}" aria-label="Toggle category">${catOpen ? '−' : '+'}</button>
              <div class="tf-tree-title">${escapeHtml(String(c.name || ''))}</div>
              <div class="tf-tree-actions">
                <button type="button" class="btn btn-secondary btn-small" data-tf-add-topic="${escapeHtml(catId)}">+ Topic</button>
                <button type="button" class="btn btn-secondary btn-small" data-tf-move-cat="${escapeHtml(catId)}">Move</button>
                <button type="button" class="btn btn-secondary btn-small" data-tf-rename-cat="${escapeHtml(catId)}">Rename</button>
                <button type="button" class="btn btn-danger btn-small" data-tf-del-cat="${escapeHtml(catId)}">Delete</button>
              </div>
            </div>
            ${catOpen ? `
              <div class="tf-tree-children">
                ${topics.length ? topics.map((t) => {
                  const tid = String(t.id);
                  const tOpen = ui.expanded.topic.has(tid);
                  const subs = Array.isArray(t.subtopics) ? t.subtopics : [];
                  return `
                    <div class="tf-tree-card tf-tree-card--nested">
                      <div class="tf-tree-row">
                        <button type="button" class="tf-plus ${tOpen ? 'is-open' : ''}" data-tf-toggle="topic" data-id="${escapeHtml(tid)}" aria-label="Toggle topic">${tOpen ? '−' : '+'}</button>
                        <div class="tf-tree-title">${escapeHtml(String(t.name || ''))}</div>
                        <div class="tf-tree-actions">
                          <button type="button" class="btn btn-secondary btn-small" data-tf-add-subtopic="${escapeHtml(tid)}">+ Subtopic</button>
                          <button type="button" class="btn btn-secondary btn-small" data-tf-rename-topic="${escapeHtml(tid)}">Rename</button>
                          <button type="button" class="btn btn-danger btn-small" data-tf-del-topic="${escapeHtml(tid)}">Delete</button>
                        </div>
                      </div>
                      ${tOpen ? `
                        <div class="tf-tree-children">
                          ${subs.length ? subs.map((s) => {
                            const sid = String(s.id);
                            const sOpen = ui.expanded.subtopic.has(sid);
                            const puzzlesLoaded = ui.expanded.puzzlesLoaded.has(sid);
                            const puzzles = ui.puzzlesBySubtopic.get(sid) || [];
                            const perPage = 10;
                            const page = Math.max(0, Number(ui.puzzlePageBySubtopic.get(sid) || 0) || 0);
                            const maxPage = Math.max(0, Math.ceil(puzzles.length / perPage) - 1);
                            const safePage = Math.min(page, maxPage);
                            if (safePage !== page) ui.puzzlePageBySubtopic.set(sid, safePage);
                            const start = safePage * perPage;
                            const pageItems = puzzles.slice(start, start + perPage);
                            return `
                              <div class="tf-tree-card tf-tree-card--nested2">
                                <div class="tf-tree-row">
                                  <button type="button" class="tf-plus ${sOpen ? 'is-open' : ''}" data-tf-toggle="subtopic" data-id="${escapeHtml(sid)}" aria-label="Toggle subtopic">${sOpen ? '−' : '+'}</button>
                                  <div class="tf-tree-title">${escapeHtml(String(s.name || ''))}</div>
                                  <div class="tf-tree-actions">
                                    <button type="button" class="btn btn-primary btn-small" data-tf-add-puzzle="${escapeHtml(sid)}">Add puzzles</button>
                                    <button type="button" class="btn btn-secondary btn-small" data-tf-bulk-import="${escapeHtml(sid)}">Bulk Import</button>
                                    <div class="tf-bulk-pv">
                                      <span class="tf-bulk-pv-label">PV</span>
                                      <input class="tf-bulk-pv-input" type="number" min="1" max="32" step="1" value="${escapeHtml(String(getBulkPvPlies()))}" data-tf-bulk-pv="1" aria-label="PV plies">
                                    </div>
                                    <button type="button" class="btn btn-secondary btn-small" data-tf-load-puzzles="${escapeHtml(sid)}">${puzzlesLoaded ? 'Reload' : 'Load'} puzzles</button>
                                    <button type="button" class="btn btn-secondary btn-small" data-tf-message-subtopic="${escapeHtml(sid)}">Message</button>
                                    <button type="button" class="btn btn-secondary btn-small" data-tf-rename-subtopic="${escapeHtml(sid)}">Rename</button>
                                    <button type="button" class="btn btn-danger btn-small" data-tf-del-subtopic="${escapeHtml(sid)}">Delete</button>
                                  </div>
                                </div>
                                ${sOpen ? `
                                  <div class="tf-tree-children">
                                    <div class="tf-muted">Puzzles: ${escapeHtml(String(puzzles.length))}</div>
                                    <div class="tf-puzzle-grid">
                                      ${puzzles.length ? pageItems.map(p => `
                                        <button type="button" class="tf-puzzle-mini" data-tf-open-puzzle="${escapeHtml(String(p.id || ''))}" data-tf-subtopic="${escapeHtml(sid)}" aria-label="Open puzzle">
                                          ${renderMiniBoardHtml(String(p.fen || ''))}
                                          <div class="tf-mini-label">Puzzle #${escapeHtml(String(p.id || ''))}</div>
                                        </button>
                                      `).join('') : `<div class="tf-muted">No puzzles loaded.</div>`}
                                    </div>
                                    ${puzzles.length > perPage ? `
                                      <div class="tf-pagination">
                                        <div class="tf-page-label">Page ${escapeHtml(String(safePage + 1))} / ${escapeHtml(String(maxPage + 1))}</div>
                                        <button type="button" class="btn btn-secondary btn-small" data-tf-page-prev="${escapeHtml(sid)}" ${safePage <= 0 ? 'disabled' : ''}>Prev</button>
                                        <button type="button" class="btn btn-secondary btn-small" data-tf-page-next="${escapeHtml(sid)}" ${safePage >= maxPage ? 'disabled' : ''}>Next</button>
                                      </div>
                                    ` : ''}
                                  </div>
                                ` : ''}
                              </div>
                            `;
                          }).join('') : `<div class="tf-muted">No subtopics.</div>`}
                        </div>
                      ` : ''}
                    </div>
                  `;
                }).join('') : `<div class="tf-muted">No topics.</div>`}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }

    function formatPvWithMoveNumbersHtml(fen, pvSan) {
      const parts = String(fen || '').trim().split(/\s+/);
      const side = (parts[1] === 'b') ? 'b' : 'w';
      const fullmove = Math.max(1, Number(parts[5] || 1) || 1);
      const moves = Array.isArray(pvSan) ? pvSan.map(String).filter(Boolean) : [];
      if (!moves.length) return '';

      const lines = [];
      let idx = 0;
      let m = fullmove;

      if (side === 'b') {
        const b = moves[idx++];
        if (b) lines.push(`${m}. ... ${b}`);
        m += 1;
      }

      while (idx < moves.length) {
        const w = moves[idx++] || '';
        const b = moves[idx++] || '';
        if (w && b) lines.push(`${m}. ${w} ${b}`);
        else if (w) lines.push(`${m}. ${w}`);
        m += 1;
      }

      return lines.map(escapeHtml).join('<br>');
    }

    function formatMovesWithMoveNumbersHighlightedHtml(fen, movesSan, lastMoveIdx) {
      const parts = String(fen || '').trim().split(/\s+/);
      const side = (parts[1] === 'b') ? 'b' : 'w';
      const fullmove = Math.max(1, Number(parts[5] || 1) || 1);
      const moves = Array.isArray(movesSan) ? movesSan.map(String).filter(Boolean) : [];
      if (!moves.length) return '';

      const lines = [];
      let idx = 0;
      let m = fullmove;

      const wrap = (txt, i) => {
        const safe = escapeHtml(txt);
        if (i === lastMoveIdx) return `<span class="tf-move tf-move-last">${safe}</span>`;
        return `<span class="tf-move">${safe}</span>`;
      };

      if (side === 'b') {
        const b = moves[idx];
        if (b) lines.push(`${escapeHtml(String(m))}. ... ${wrap(b, idx)}`);
        idx += 1;
        m += 1;
      }

      while (idx < moves.length) {
        const w = moves[idx] || '';
        const wIdx = idx;
        idx += 1;
        const b = (idx < moves.length) ? (moves[idx] || '') : '';
        const bIdx = idx;
        idx += 1;

        const mm = escapeHtml(String(m));
        if (w && b) lines.push(`${mm}. ${wrap(w, wIdx)} ${wrap(b, bIdx)}`);
        else if (w) lines.push(`${mm}. ${wrap(w, wIdx)}`);
        m += 1;
      }

      return lines.join('<br>');
    }

    function getBuilderBucket() {
      try {
        const v = String(localStorage.getItem('tacticsFighterBuilderBucket') || '').trim();
        return v || 'beginner';
      } catch {}
      return 'beginner';
    }

    function setBuilderBucket(bucket) {
      try { localStorage.setItem('tacticsFighterBuilderBucket', String(bucket || 'beginner')); } catch {}
    }

    function getBulkPvPlies() {
      try {
        const v = Number(localStorage.getItem('tacticsFighterBulkPvPlies') || 0);
        if (Number.isFinite(v) && v >= 1 && v <= 32) return Math.trunc(v);
      } catch {}
      return 8;
    }

    function setBulkPvPlies(v) {
      const n = Number(v);
      const out = Number.isFinite(n) ? Math.max(1, Math.min(32, Math.trunc(n))) : 8;
      try { localStorage.setItem('tacticsFighterBulkPvPlies', String(out)); } catch {}
      return out;
    }

    async function builderRefresh() {
      clearBuilderMsg();
      showBuilderMsg('ok', 'Loading...');
      try {
        const bucket = getBuilderBucket();
        const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/tree?bucket=${encodeURIComponent(bucket)}`, { method: 'GET' });
        const data = await tfJson(resp);
        ui.builderTree = Array.isArray(data.categories) ? data.categories : [];
        renderBuilderTree(ui.builderTree);
        clearBuilderMsg();
        ui.builderLoadedOnce = true;
      } catch (e) {
        showBuilderMsg('err', e?.message || String(e));
      }
    }

    async function promptText(title, placeholder) {
      const v = prompt(String(title || ''), String(placeholder || ''));
      if (v == null) return null;
      return String(v).trim();
    }

    function builderFindCategoryById(cid) {
      const cats = Array.isArray(ui.builderTree) ? ui.builderTree : [];
      return cats.find((c) => String(c?.id) === String(cid)) || null;
    }

    function bucketLabelOf(key) {
      const k = normalizeBucketKey(key);
      const map = {
        beginner: 'Beginner',
        '400up': '400 up',
        '700up': '700 up',
        '1000up': '1000 up',
        '1500up': '1500 up',
        '2000up': '2000 up',
        '2500up': '2500 up',
        '2800up': '2800 up'
      };
      return map[k] || k;
    }

    function allBucketOptions() {
      return [
        { key: 'beginner', label: 'Beginner' },
        { key: '400up', label: '400 up' },
        { key: '700up', label: '700 up' },
        { key: '1000up', label: '1000 up' },
        { key: '1500up', label: '1500 up' },
        { key: '2000up', label: '2000 up' },
        { key: '2500up', label: '2500 up' },
        { key: '2800up', label: '2800 up' }
      ];
    }

    async function openMoveCategoryModal(categoryId) {
      const cid = String(categoryId || '').trim();
      if (!cid) return;
      const cat = builderFindCategoryById(cid);
      const curBucket = normalizeBucketKey(cat?.bucket || getBuilderBucket() || 'beginner');
      const curName = String(cat?.name || '').trim() || 'Category';

      const host = document.createElement('div');
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="tfMoveCatBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Move category" style="width: calc(100vw - 40px); max-width: 720px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Move</div>
              <button id="tfMoveCatClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div class="tf-muted" style="margin-top:-4px;">Move <strong>${escapeHtml(curName)}</strong> to another bucket.</div>
              <div class="tf-field">
                <label for="tfMoveCatBucket">Destination bucket</label>
                <select id="tfMoveCatBucket" class="tf-select">
                  ${allBucketOptions().map(o => `<option value="${escapeHtml(o.key)}">${escapeHtml(o.label)}</option>`).join('')}
                </select>
                <div class="tf-muted" style="margin-top:6px;">Current: <strong>${escapeHtml(bucketLabelOf(curBucket))}</strong></div>
              </div>
              <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; margin-top:10px;">
                <button id="tfMoveCatCancel" class="btn btn-secondary" type="button">Cancel</button>
                <button id="tfMoveCatSave" class="btn btn-primary" type="button">Move</button>
              </div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);

      const sel = host.querySelector('#tfMoveCatBucket');
      if (sel) sel.value = curBucket;

      const close = () => { try { host.remove(); } catch {} };
      host.querySelector('#tfMoveCatClose')?.addEventListener('click', close);
      host.querySelector('#tfMoveCatCancel')?.addEventListener('click', close);
      host.querySelector('#tfMoveCatBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'tfMoveCatBackdrop') close();
      });

      host.querySelector('#tfMoveCatSave')?.addEventListener('click', async () => {
        try {
          const nextBucket = normalizeBucketKey(String(sel?.value || '').trim() || '');
          if (!nextBucket) return;
          if (nextBucket === curBucket) return close();

          await builderMoveCategory(cid, nextBucket);
          // Switch builder bucket so user can see the moved category immediately.
          setBuilderBucket(nextBucket);
          try {
            const bucketSel = document.getElementById('tfBuilderBucketSelect');
            if (bucketSel) bucketSel.value = nextBucket;
          } catch {}
          showBuilderMsg('ok', `Moved to ${bucketLabelOf(nextBucket)}.`);
          await builderRefresh();
          close();
        } catch (e) {
          showBuilderMsg('err', e?.message || String(e));
        }
      });
    }

    async function openSubtopicMessageModal(subtopicId) {
      const sid = String(subtopicId || '').trim();
      if (!sid) return;
      const cur = builderFindSubtopicById(sid);
      const initial = cur?.message == null ? '' : String(cur.message);

      const host = document.createElement('div');
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="tfSubMsgBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Subtopic message" style="width: calc(100vw - 40px); max-width: 900px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Message</div>
              <button id="tfSubMsgClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div class="tf-field" style="margin-top:0;">
                <label for="tfSubMsgInput">Message (shown in Practice spacer)</label>
                <textarea id="tfSubMsgInput" class="tf-textarea" rows="6" placeholder="Type your message...">${escapeHtml(initial)}</textarea>
              </div>
