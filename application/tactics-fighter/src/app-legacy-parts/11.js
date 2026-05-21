
      // Auto-commit (Mode B): absorb on paste, or after short idle if it looks like a full FEN.
      let absorbTimer = null;
      const scheduleAbsorb = (reason) => {
        try { if (absorbTimer) clearTimeout(absorbTimer); } catch {}
        absorbTimer = setTimeout(() => {
          const raw = String(input?.value || '').trim();
          if (!raw) return;
          // If user pasted multiple lines, absorb immediately.
          if (raw.includes('\n')) return void absorbFromTextarea(reason || 'idle');
          // Single line: absorb if it already looks like a full FEN.
          if (looksLikeFenLine(raw)) return void absorbFromTextarea(reason || 'idle');
        }, 280);
      };

      input?.addEventListener('input', () => scheduleAbsorb('typing'));
      input?.addEventListener('blur', () => absorbFromTextarea('blur'));
      input?.addEventListener('paste', () => {
        // Let the paste land first
        setTimeout(() => absorbFromTextarea('paste'), 0);
      });

      listEl?.addEventListener('click', (ev) => {
        const t = ev.target;
        const btn = t && t.closest ? t.closest('[data-tf-bulk-idx]') : null;
        if (!btn) return;
        const idx = Number(btn.getAttribute('data-tf-bulk-idx') || 0);
        if (!Number.isFinite(idx)) return;
        selectedIdx = Math.max(0, Math.min(entries.length - 1, idx));
        renderList();
        showSelected();
      });

      stopBtn?.addEventListener('click', () => {
        cancelled = true;
        if (stopBtn) stopBtn.disabled = true;
        if (runBtn) runBtn.disabled = false;
        showMsg('err', 'Stopped.');
      });

      runBtn?.addEventListener('click', async () => {
        clearMsg();
        // Ensure any remaining input is absorbed before running.
        absorbFromTextarea('run');
        cancelled = false;
        if (runBtn) runBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;

        const depth = getBuilderDepthDefault();
        const pvPliesNow = getBulkPvPlies();
        if (pvPliesEl) pvPliesEl.textContent = String(pvPliesNow);

        for (let i = 0; i < entries.length; i++) {
          if (cancelled) break;
          const ent = entries[i];
          if (!ent || ent.status === 'done') continue;
          ent.status = 'running';
          ent.error = '';
          selectedIdx = i;
          renderList();
          updateCounts();
          showSelected();

          try {
            const r = await engineAnalyze({ fen: ent.fen, depth, multipv: 1, pvPlies: pvPliesNow });
            const line0 = Array.isArray(r?.lines) ? r.lines[0] : null;
            const bestMove = String(r?.bestMove || line0?.bestMove || '').trim();
            const pvUci = Array.isArray(line0?.pvUci) ? line0.pvUci : [];
            const pvSan = Array.isArray(line0?.pvSan) ? line0.pvSan : [];
            const score = line0?.score || { cp: 0 };
            if (!bestMove) throw new Error('Engine returned empty bestMove');

            ent.result = { bestMove, pvUci, pvSan, score, depth, pvPlies: pvPliesNow };
            ent.status = 'done';
          } catch (e) {
            ent.status = 'error';
            ent.error = e?.message || String(e);
          }
          renderList();
          updateCounts();
          showSelected();
        }

        if (stopBtn) stopBtn.disabled = true;
        if (runBtn) runBtn.disabled = false;
        if (!cancelled) showMsg('ok', 'Engine finished.');
      });

      saveBtn?.addEventListener('click', async () => {
        clearMsg();
        absorbFromTextarea('save');
        const bucket = getBuilderBucket();
        const pvPliesNow = getBulkPvPlies();
        const depth = getBuilderDepthDefault();
        let saved = 0;
        for (let i = 0; i < entries.length; i++) {
          const ent = entries[i];
          if (!ent || ent.status !== 'done' || !ent.result) continue;
          try {
            const line = {
              multiPv: 1,
              score: ent.result.score || { cp: 0 },
              bestMove: ent.result.bestMove,
              pvUci: Array.isArray(ent.result.pvUci) ? ent.result.pvUci : [],
              pvSan: Array.isArray(ent.result.pvSan) ? ent.result.pvSan : []
            };
            const solutions = {
              bestMove: ent.result.bestMove,
              lines: [line],
              acceptedMultiPv: ['1'],
              acceptedLines: [line]
            };
            const payload = {
              fen: ent.fen,
              engineDepth: depth,
              multipv: 1,
              pvPlies: pvPliesNow,
              solutions,
              meta: { bucket, bulk: true }
            };
            await builderCreatePuzzle(subtopicId, payload);
            ent.status = 'saved';
            saved++;
          } catch (e) {
            ent.status = 'error';
            ent.error = e?.message || String(e);
          }
          renderList();
          updateCounts();
          showSelected();
        }

        try {
          const data = await builderFetchPuzzles(subtopicId);
          ui.puzzlesBySubtopic.set(String(subtopicId), Array.isArray(data.puzzles) ? data.puzzles : []);
          ui.expanded.puzzlesLoaded.add(String(subtopicId));
          ui.expanded.subtopic.add(String(subtopicId));
          await builderRefresh();
        } catch {}

        showMsg('ok', `Saved: ${saved}. (Modal stays open)`);
      });

      // Small UX: Ctrl/Cmd+Z in the textarea undoes last absorb (when textarea is empty)
      input?.addEventListener('keydown', (ev) => {
        if (!ev) return;
        const key = String(ev.key || '').toLowerCase();
        const isUndo = (key === 'z') && (ev.ctrlKey || ev.metaKey);
        const raw = String(input?.value || '').trim();
        if (isUndo && !raw) {
          ev.preventDefault();
          undoLastAbsorb();
        }
      });
    }

    // Sidebar mode switching
    root.querySelectorAll('.tf-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = btn.getAttribute('data-mode');
        activateMode(m);
      });
    });

    // Student deep link: if opened from a shared link, jump directly into a subtopic.
    // Do this after handlers are attached so rendering remains consistent.
    studentApplyDeepLinkIfAny().catch(() => null);

    // Practice navigation (event delegation)
    root.addEventListener('click', (e) => {
      const target = e.target && e.target.closest ? e.target.closest(
        '[data-chal-mode],[data-chal-ghost-start],[data-practice],[data-stu-cat],[data-stu-topic],[data-stu-subtopic],[data-stu-back],[data-stu-page],[data-stu-start],[data-stu-open-puzzle],[data-tea-back],[data-tea-cat],[data-tea-topic],[data-tea-subtopic],[data-tea-page],[data-tea-start],[data-tea-choose-students],[data-tea-open-puzzle]'
      ) : null;
      if (!target) return;

      // Challenge (student only)
      if (!isTeacher) {
        const chalModeBtn = target.closest('[data-chal-mode]');
        if (chalModeBtn) {
          const m = String(chalModeBtn.getAttribute('data-chal-mode') || '').trim();
          if (m === 'random') return;
          ui.student.challenge.mode = m;
          ui.student.challenge.msg = '';
          const panel = document.getElementById('tfChallengePanel');
          if (panel && m === 'ghost') {
            panel.innerHTML = `
              <div style="border:1px solid #e5e7eb; border-radius:14px; padding:12px; background:#f8fafc;">
                <div style="font-weight:950; color:#111827;">Dancing with your Ghost</div>
                <div class="tf-muted" style="margin-top:6px;">Only puzzles you have answered incorrectly before will appear.</div>
                <div style="margin-top:10px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                  <button type="button" class="btn btn-primary" data-chal-ghost-start="1">Start</button>
                  <span id="tfChalGhostMsg" class="tf-muted"></span>
                </div>
              </div>
            `;
          }
          return;
        }

        const ghostStartBtn = target.closest('[data-chal-ghost-start]');
        if (ghostStartBtn) {
          (async () => {
            try {
              const msgEl = document.getElementById('tfChalGhostMsg');
              if (msgEl) msgEl.textContent = 'Loading...';
              const out = await studentFetchGhostPuzzles(publicStudentId, ui.student.bucket, 120, publicStudentPassword);
              const puzzles = Array.isArray(out?.puzzles) ? out.puzzles : [];
              if (!puzzles.length) {
                if (msgEl) msgEl.textContent = 'No incorrect puzzles.';
                return;
              }

              ui.student.puzzleSource = 'ghost';
              ui.student.subtopicId = null;
              ui.student.page = 1;
              ui.student.pageSize = Math.max(1, puzzles.length);
              ui.student.total = puzzles.length;
              ui.student.puzzles = puzzles.map((p) => ({ ...p, completed: false })); // per-session completion
              ui.student.puzzlePages = { '1': { puzzles: ui.student.puzzles, total: ui.student.total, pageSize: ui.student.pageSize } };

              ui.student.runner = { absIndex: 0 };
              await openStudentRunnerModal();
              if (msgEl) msgEl.textContent = '';
            } catch (err) {
              const msgEl = document.getElementById('tfChalGhostMsg');
              if (msgEl) msgEl.textContent = err?.message || String(err);
            }
          })();
          return;
        }
      }

      // Bucket selection (Beginner/400up/...)
      const bucketBtn = target.closest('[data-practice]');
      if (bucketBtn) {
        const bucket = String(bucketBtn.getAttribute('data-practice') || '').trim();
        if (!bucket) return;
        if (isTeacher) {
          return void teacherShowCategories(bucket);
        }
        return void studentShowCategories(bucket);
      }

      if (isTeacher) {
        const backBtn = target.closest('[data-tea-back]');
        if (backBtn) {
          const dest = String(backBtn.getAttribute('data-tea-back') || '').trim();
          if (dest === 'buckets') {
            ui.teacher.view = 'bucket';
            ui.teacher.tree = null;
            ui.teacher.categoryId = null;
            ui.teacher.topicId = null;
            ui.teacher.subtopicId = null;
            ui.teacher.puzzlesAll = [];
            ui.teacher.page = 1;
            try {
              const bucketsEl = document.getElementById('tfPracticeBuckets');
              if (bucketsEl) bucketsEl.style.display = '';
            } catch {}
            setOut('');
            return;
          }
          if (dest === 'categories') {
            ui.teacher.view = 'categories';
            ui.teacher.categoryId = null;
            ui.teacher.topicId = null;
            ui.teacher.subtopicId = null;
            return setOut(renderTeacherCategories(ui.teacher.tree?.categories || []));
          }
          if (dest === 'topics') {
            const cat = teacherFindCategoryById(ui.teacher.categoryId);
            if (!cat) return;
            ui.teacher.view = 'topics';
            ui.teacher.topicId = null;
            ui.teacher.subtopicId = null;
            return setOut(renderTeacherTopics(cat));
          }
          if (dest === 'subtopics') {
            const cat = teacherFindCategoryById(ui.teacher.categoryId);
            const topic = teacherFindTopicById(cat, ui.teacher.topicId);
            if (!cat || !topic) return;
            ui.teacher.view = 'subtopics';
            ui.teacher.subtopicId = null;
            return setOut(renderTeacherSubtopics(cat, topic));
          }
          return;
        }

        const catBtn = target.closest('[data-tea-cat]');
        if (catBtn) {
          const cid = String(catBtn.getAttribute('data-tea-cat') || '').trim();
          const cat = teacherFindCategoryById(cid);
          if (!cat) return;
          ui.teacher.view = 'topics';
          ui.teacher.categoryId = cid;
          ui.teacher.topicId = null;
          ui.teacher.subtopicId = null;
          return setOut(renderTeacherTopics(cat));
        }

        const topicBtn = target.closest('[data-tea-topic]');
        if (topicBtn) {
          const tid = String(topicBtn.getAttribute('data-tea-topic') || '').trim();
          const cat = teacherFindCategoryById(ui.teacher.categoryId);
          const topic = teacherFindTopicById(cat, tid);
          if (!cat || !topic) return;
          ui.teacher.view = 'subtopics';
          ui.teacher.topicId = tid;
          ui.teacher.subtopicId = null;
          return setOut(renderTeacherSubtopics(cat, topic));
        }

        const subBtn = target.closest('[data-tea-subtopic]');
        if (subBtn) {
          const sid = String(subBtn.getAttribute('data-tea-subtopic') || '').trim();
          const cat = teacherFindCategoryById(ui.teacher.categoryId);
          const topic = teacherFindTopicById(cat, ui.teacher.topicId);
          const sub = teacherFindSubtopicById(topic, sid);
          if (!cat || !topic || !sub) return;
          ui.teacher.view = 'puzzles';
          ui.teacher.subtopicId = sid;
          return void teacherOpenSubtopic(sid);
        }

        const pageBtn = target.closest('[data-tea-page]');
        if (pageBtn) {
          const dir = String(pageBtn.getAttribute('data-tea-page') || '').trim();
          if (dir === 'prev' || dir === 'next') return void teacherChangePuzzlePage(dir);
          return;
        }

        const startBtn = target.closest('[data-tea-start]');
        if (startBtn) {
          // Teacher can also solve puzzles directly (no completion tracking).
          (async () => {
            try {
              if (!Array.isArray(ui.teacher.puzzlesAll) || !ui.teacher.puzzlesAll.length) {
                toastShow('err', 'No puzzles found in this subtopic.');
                return;
              }
              await openTeacherRunnerModal(0);
            } catch (e) {
              toastShow('err', e?.message || String(e));
            }
          })();
          return;
        }

        const chooseBtn = target.closest('[data-tea-choose-students]');
        if (chooseBtn) {
          openTeacherChooseStudentsModal().catch((err) => toastShow('err', err?.message || String(err)));
          return;
        }

        const openPzBtn = target.closest('[data-tea-open-puzzle]');
        if (openPzBtn) {
          (async () => {
            try {
              const pid = String(openPzBtn.getAttribute('data-tea-open-puzzle') || '').trim();
              if (!pid) return;
              const all = Array.isArray(ui.teacher.puzzlesAll) ? ui.teacher.puzzlesAll : [];
              const idx = all.findIndex((p) => String(p?.id) === pid);
              if (idx < 0) return;
              await openTeacherRunnerModal(idx);
            } catch (e) {
              toastShow('err', e?.message || String(e));
            }
          })();
          return;
        }

        return;
      }

      const backBtn = target.closest('[data-stu-back]');
      if (backBtn) {
        const dest = String(backBtn.getAttribute('data-stu-back') || '').trim();
        if (dest === 'buckets') {
          ui.student.view = 'bucket';
          ui.student.tree = null;
          ui.student.categoryId = null;
          ui.student.topicId = null;
          ui.student.subtopicId = null;
          try {
            const bucketsEl = document.getElementById('tfPracticeBuckets');
            if (bucketsEl) bucketsEl.style.display = '';
          } catch {}
          setOut('');
          return;
        }
        if (dest === 'categories') {
          ui.student.view = 'categories';
          ui.student.categoryId = null;
          ui.student.topicId = null;
          ui.student.subtopicId = null;
          return setOut(renderStudentCategories(ui.student.tree?.categories || []));
        }
        if (dest === 'topics') {
          const cat = studentFindCategoryById(ui.student.categoryId);
          if (!cat) return;
          ui.student.view = 'topics';
          ui.student.topicId = null;
          ui.student.subtopicId = null;
          return setOut(renderStudentTopics(cat));
        }
        if (dest === 'subtopics') {
          const cat = studentFindCategoryById(ui.student.categoryId);
          const topic = studentFindTopicById(cat, ui.student.topicId);
          if (!cat || !topic) return;
          ui.student.view = 'subtopics';
          ui.student.subtopicId = null;
          return setOut(renderStudentSubtopics(cat, topic));
        }
        return;
      }

      const catBtn = target.closest('[data-stu-cat]');
      if (catBtn) {
        const cid = String(catBtn.getAttribute('data-stu-cat') || '').trim();
        const cat = studentFindCategoryById(cid);
        if (!cat) return;
        ui.student.view = 'topics';
        ui.student.categoryId = cid;
        ui.student.topicId = null;
        ui.student.subtopicId = null;
        return setOut(renderStudentTopics(cat));
      }

      const topicBtn = target.closest('[data-stu-topic]');
      if (topicBtn) {
        const tid = String(topicBtn.getAttribute('data-stu-topic') || '').trim();
        const cat = studentFindCategoryById(ui.student.categoryId);
        const topic = studentFindTopicById(cat, tid);
        if (!cat || !topic) return;
        ui.student.view = 'subtopics';
        ui.student.topicId = tid;
        ui.student.subtopicId = null;
        return setOut(renderStudentSubtopics(cat, topic));
      }

      const subBtn = target.closest('[data-stu-subtopic]');
      if (subBtn) {
        const sid = String(subBtn.getAttribute('data-stu-subtopic') || '').trim();
        if (!sid) return;
        return void studentOpenSubtopic(sid);
      }

      const pageBtn = target.closest('[data-stu-page]');
      if (pageBtn) {
        const dir = String(pageBtn.getAttribute('data-stu-page') || '').trim();
