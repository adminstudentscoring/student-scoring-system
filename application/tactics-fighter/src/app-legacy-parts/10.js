          close();
        } catch (e) {
          setEngineOut(`<div class="tf-builder-msg err" style="display:block;">${escapeHtml(e?.message || String(e))}</div>`);
        }
      });
    }

    async function openBulkImportModal(subtopicId) {
      const roleNow = String(new URLSearchParams(window.location.search).get('role') || '');
      if (String(roleNow).toLowerCase() !== 'teacher') {
        alert('Bulk Import is available for teacher only.');
        return;
      }

      const host = document.createElement('div');
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="tfBulkBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Bulk Import" style="width: calc(100vw - 40px); max-width: 1400px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Bulk Import</div>
              <button id="tfBulkClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div class="tf-bulk-grid">
                <div>
                  <div class="tf-field">
                    <label for="tfBulkFenInput">FEN (one per line)</label>
                    <textarea id="tfBulkFenInput" class="tf-textarea" rows="12" placeholder="Paste FEN lines here..."></textarea>
                  </div>
                  <div class="tf-bulk-meta">
                    <div id="tfBulkCounts" class="tf-muted"></div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
                      <button id="tfBulkValidate" class="btn btn-secondary" type="button">Validate</button>
                      <button id="tfBulkClear" class="btn btn-secondary" type="button">Clear</button>
                      <button id="tfBulkClipStart" class="btn btn-secondary" type="button" title="Auto-read clipboard and absorb FEN lines">Start Auto Paste</button>
                      <button id="tfBulkClipStop" class="btn btn-secondary" type="button" disabled>Stop Auto Paste</button>
                      <button id="tfBulkPhotoBtn" class="btn btn-primary" type="button">Photo Recognize</button>
                      <input id="tfBulkPhotoInput" name="tfBulkPhotoInput" type="file" accept="image/*,application/pdf" multiple style="display:none;">
                    </div>
                  </div>
                  <div id="tfBulkList" class="tf-bulk-list"></div>
                </div>

                <div>
                  <div class="tf-field">
                    <label>Engine (1-best)</label>
                    <div class="tf-bulk-engine">
                      <div class="tf-bulk-engine-row"><div class="tf-muted">PV plies</div><div id="tfBulkPvPlies" style="font-weight:950;"></div></div>
                      <div class="tf-bulk-engine-row"><div class="tf-muted">Status</div><div id="tfBulkStatus" style="font-weight:950;"></div></div>
                      <div class="tf-bulk-engine-row"><div class="tf-muted">Best move</div><div id="tfBulkBestMove" style="font-family:ui-monospace,monospace;"></div></div>
                      <div class="tf-bulk-engine-row"><div class="tf-muted">PV</div><div id="tfBulkPv" class="tf-bulk-pvbox"></div></div>
                    </div>
                  </div>
                  <div class="tf-bulk-actions">
                    <button id="tfBulkRun" class="btn btn-primary" type="button">Run Engine</button>
                    <button id="tfBulkStop" class="btn btn-secondary" type="button" disabled>Stop</button>
                    <button id="tfBulkSave" class="btn btn-primary" type="button" disabled>Confirm & Save</button>
                  </div>
                  <div id="tfBulkMsg" class="tf-builder-msg" style="display:none;"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(host);

      const close = () => {
        try { if (typeof host.__tfBulkCleanup === 'function') host.__tfBulkCleanup(); } catch {}
        try { host.remove(); } catch {}
      };
      host.querySelector('#tfBulkClose')?.addEventListener('click', close);
      host.querySelector('#tfBulkBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'tfBulkBackdrop') close();
      });

      const input = host.querySelector('#tfBulkFenInput');
      const countsEl = host.querySelector('#tfBulkCounts');
      const listEl = host.querySelector('#tfBulkList');
      const pvPliesEl = host.querySelector('#tfBulkPvPlies');
      const statusEl = host.querySelector('#tfBulkStatus');
      const bestEl = host.querySelector('#tfBulkBestMove');
      const pvEl = host.querySelector('#tfBulkPv');
      const runBtn = host.querySelector('#tfBulkRun');
      const stopBtn = host.querySelector('#tfBulkStop');
      const saveBtn = host.querySelector('#tfBulkSave');
      const msgEl = host.querySelector('#tfBulkMsg');
      const photoBtn = host.querySelector('#tfBulkPhotoBtn');
      const photoInput = host.querySelector('#tfBulkPhotoInput');
      const clipStartBtn = host.querySelector('#tfBulkClipStart');
      const clipStopBtn = host.querySelector('#tfBulkClipStop');

      const pvPlies = getBulkPvPlies();
      if (pvPliesEl) pvPliesEl.textContent = String(pvPlies);

      let cancelled = false;
      let selectedIdx = 0;
      let entries = []; // { fen, status, error, result }
      const absorbedStack = []; // array of counts appended (for undo)

      // Clipboard watcher (Scheme A): click Start to poll clipboard and auto-absorb.
      let clipRunning = false;
      let clipTimer = null;
      let clipFailCount = 0;
      let lastClipboardText = '';

      const showMsg = (type, text) => {
        if (!msgEl) return;
        msgEl.style.display = 'block';
        msgEl.classList.remove('ok', 'err');
        if (type === 'ok') msgEl.classList.add('ok');
        if (type === 'err') msgEl.classList.add('err');
        msgEl.textContent = String(text || '');
      };
      const clearMsg = () => {
        if (!msgEl) return;
        msgEl.style.display = 'none';
        msgEl.textContent = '';
        msgEl.classList.remove('ok', 'err');
      };

      const parseLines = () => {
        const raw = String(input?.value || '');
        const lines = raw.split(/\r?\n/).map((l) => String(l || '').trim()).filter(Boolean);
        return lines;
      };

      const updateCounts = () => {
        const total = entries.length;
        const done = entries.filter((e) => e.status === 'done').length;
        const saved = entries.filter((e) => e.status === 'saved').length;
        const err = entries.filter((e) => e.status === 'error').length;
        const pending = entries.filter((e) => e.status === 'pending').length;
        if (countsEl) countsEl.textContent = `Total: ${total} · Saved: ${saved} · Done: ${done} · Pending: ${pending} · Error: ${err}`;
        const savable = done > 0;
        if (saveBtn) saveBtn.disabled = !savable;
      };

      const renderList = () => {
        if (!listEl) return;
        if (!entries.length) {
          listEl.innerHTML = `<div class="tf-muted">No FEN lines.</div>`;
          return;
        }
        listEl.innerHTML = entries.map((e, i) => {
          const isSel = i === selectedIdx;
          const badge =
            e.status === 'saved' ? 'Saved' :
            e.status === 'done' ? 'Done' :
            e.status === 'running' ? 'Running' :
            e.status === 'error' ? 'Error' : 'Pending';
          return `
            <button type="button" class="tf-bulk-item ${isSel ? 'is-selected' : ''}" data-tf-bulk-idx="${i}">
              <div class="tf-bulk-item-row">
                <div class="tf-bulk-badge tf-bulk-badge--${escapeHtml(e.status)}">${escapeHtml(badge)}</div>
                <div class="tf-bulk-fen">${escapeHtml(e.fen)}</div>
              </div>
            </button>
          `;
        }).join('');
      };

      const showSelected = () => {
        const e = entries[selectedIdx];
        if (!e) {
          if (statusEl) statusEl.textContent = '';
          if (bestEl) bestEl.textContent = '';
          if (pvEl) pvEl.innerHTML = '';
          return;
        }
        if (statusEl) statusEl.textContent = e.status;
        if (bestEl) bestEl.textContent = e.result?.bestMove ? String(e.result.bestMove) : '';
        if (pvEl) {
          const fen = e.fen;
          const pvSan = e.result?.pvSan || [];
          pvEl.innerHTML = pvSan.length ? formatPvWithMoveNumbersHtml(fen, pvSan) : (e.error ? `<span style="color:#dc2626; font-weight:900;">${escapeHtml(e.error)}</span>` : '');
        }
      };

      function looksLikeFenLine(line) {
        const s = String(line || '').trim();
        if (!s) return false;
        const parts = s.split(/\s+/);
        if (parts.length < 6) return false;
        const placement = parts[0] || '';
        if (!placement.includes('/')) return false;
        const slashCount = (placement.match(/\//g) || []).length;
        if (slashCount !== 7) return false;
        if (!/^[prnbqkPRNBQK1-8\/]+$/.test(placement)) return false;
        const stm = parts[1];
        if (stm !== 'w' && stm !== 'b') return false;
        // castling / ep / counters: don't validate strictly here
        return true;
      }

      function absorbFromTextarea(reason) {
        const raw = String(input?.value || '').trim();
        if (!raw) return { absorbed: 0 };
        const lines = parseLines();
        if (!lines.length) return { absorbed: 0 };

        const valid = [];
        const invalid = [];
        for (const l of lines) {
          if (looksLikeFenLine(l)) valid.push(l);
          else invalid.push(l);
        }

        if (!valid.length) {
          // don't clear; user may still be typing
          return { absorbed: 0, invalidCount: invalid.length };
        }

        // Append valid to entries (mode B)
        for (const fen of valid) {
          entries.push({ fen, status: 'pending', error: '', result: null });
        }
        absorbedStack.push(valid.length);
        selectedIdx = Math.max(0, entries.length - valid.length);

        // Clear absorbed part; keep invalid lines for user to fix (if any)
        if (input) {
          input.value = invalid.join('\n');
        }

        renderList();
        updateCounts();
        showSelected();

        if (reason) {
          if (invalid.length) showMsg('err', `Absorbed ${valid.length}. ${invalid.length} invalid line(s) kept in input.`);
          else showMsg('ok', `Absorbed ${valid.length}.`);
        }
        return { absorbed: valid.length, invalidCount: invalid.length };
      }

      function undoLastAbsorb() {
        const n = absorbedStack.pop();
        if (!n) return;
        entries.splice(Math.max(0, entries.length - n), n);
        selectedIdx = Math.max(0, Math.min(entries.length - 1, selectedIdx));
        renderList();
        updateCounts();
        showSelected();
        showMsg('ok', `Undid last absorb (${n}).`);
      }

      // initial
      renderList();
      updateCounts();
      showSelected();

      const stopClipboard = () => {
        clipRunning = false;
        clipFailCount = 0;
        try { if (clipTimer) clearTimeout(clipTimer); } catch {}
        clipTimer = null;
        lastClipboardText = '';
        try { if (clipStartBtn) clipStartBtn.disabled = false; } catch {}
        try { if (clipStopBtn) clipStopBtn.disabled = true; } catch {}
      };
      host.__tfBulkCleanup = stopClipboard;

      async function clipboardPollOnce() {
        if (!clipRunning) return;
        // Browser security: clipboard reads are often blocked when the tab/window is not focused.
        // Instead of spamming errors, pause politely until focus returns.
        try {
          if (typeof document !== 'undefined') {
            const unfocused = (document.hidden === true) || (typeof document.hasFocus === 'function' && !document.hasFocus());
            if (unfocused) {
              showMsg('ok', 'Auto paste paused (window not focused). Return to this window to resume.');
              clipTimer = setTimeout(clipboardPollOnce, 900);
              return;
            }
          }
        } catch {}
        const hasClipboard = (typeof navigator !== 'undefined') && navigator.clipboard && typeof navigator.clipboard.readText === 'function';
        if (!hasClipboard) {
          showMsg('err', 'Clipboard API not available in this browser/context.');
          return stopClipboard();
        }
        try {
          const text = String(await navigator.clipboard.readText()).trim();
          if (text && text !== lastClipboardText) {
            lastClipboardText = text;
            // Append to textarea so existing invalid lines remain; then absorb using existing Mode B.
            if (input) {
              const prev = String(input.value || '').trim();
              input.value = prev ? `${prev}\n${text}` : text;
            }
            const r = absorbFromTextarea('clipboard');
            if (r && r.absorbed) showMsg('ok', `Clipboard absorbed ${Number(r.absorbed || 0)}.`);
          }
          clipFailCount = 0;
        } catch (e) {
          clipFailCount++;
          // Most common causes:
          // - permission not granted
          // - not focused / user gesture requirements
          // - blocked by browser policy
          showMsg('err', 'Clipboard read blocked. Keep this window focused, and allow clipboard permission (Site settings).');
        } finally {
          if (!clipRunning) return;
          // Fast but stable: ~0.8s, with backoff up to ~1.5s on repeated failures.
          const delay = clipFailCount ? Math.min(1500, 800 + clipFailCount * 200) : 800;
          clipTimer = setTimeout(clipboardPollOnce, delay);
        }
      }

      clipStartBtn?.addEventListener('click', () => {
        clearMsg();
        clipRunning = true;
        clipFailCount = 0;
        lastClipboardText = '';
        try { if (clipStartBtn) clipStartBtn.disabled = true; } catch {}
        try { if (clipStopBtn) clipStopBtn.disabled = false; } catch {}
        showMsg('ok', 'Auto paste started. Copy FEN lines and they will be absorbed.');
        // This click is a user gesture; attempt immediately.
        clipboardPollOnce();
      });
      clipStopBtn?.addEventListener('click', () => {
        stopClipboard();
        showMsg('ok', 'Auto paste stopped.');
      });

      async function teacherPhotoRecognizeUpload(files) {
        if (!files || !files.length) return null;
        // Quick deploy check: if this endpoint is missing in production, we'll get 404.
        try {
          const ping = await apiRequest('/api/teachers/tactics-fighter/debug/routes', { method: 'GET' });
          const pingJson = await ping.json().catch(() => null);
          console.log('[tf][photo] debug/routes:', ping.status, pingJson);
        } catch (e) {
          console.log('[tf][photo] debug/routes failed:', e);
        }
        const fd = new FormData();
        for (const f of files) fd.append('files', f);
        const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(String(subtopicId))}/photo-recognize/upload`, {
          method: 'POST',
          body: fd
        });
        return await tfJson(resp);
      }

      async function teacherPhotoRecognizeJob(jobId) {
        const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/photo-recognize/jobs/${encodeURIComponent(String(jobId))}`, { method: 'GET' });
        return await tfJson(resp);
      }

      async function teacherPhotoRecognizeFens(jobId) {
        const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/photo-recognize/jobs/${encodeURIComponent(String(jobId))}/fens?limit=2000`, { method: 'GET' });
        return await tfJson(resp);
      }

      function appendFensToEntries(fens) {
        const list = Array.isArray(fens) ? fens : [];
        let added = 0;
        for (const fen of list) {
          const s = String(fen || '').trim();
          if (!s) continue;
          entries.push({ fen: s, status: 'pending', error: '', result: null });
          added++;
        }
        if (added) {
          absorbedStack.push(added);
          selectedIdx = Math.max(0, entries.length - added);
        }
        renderList();
        updateCounts();
        showSelected();
        return added;
      }

      photoBtn?.addEventListener('click', () => {
        try { photoInput?.click(); } catch {}
      });

      photoInput?.addEventListener('change', async () => {
        clearMsg();
        try {
          const files = Array.from(photoInput?.files || []);
          if (!files.length) return;
          showMsg('ok', 'Uploading…');
          photoBtn.disabled = true;
          let up = null;
          try {
            up = await teacherPhotoRecognizeUpload(files);
          } catch (e) {
            // Make 404 extremely obvious in UI.
            const msg = String(e?.message || e);
            if (/\[404\]/.test(msg) || /404/.test(msg)) {
              throw new Error('Photo Recognize endpoint not found (404). This usually means Railway is still running an older build, or /api is being routed elsewhere.');
            }
            throw e;
          }
          const jobId = String(up?.jobId || '');
          if (!jobId) throw new Error('No jobId returned');
          showMsg('ok', 'Processing…');

          // Poll status
          const started = Date.now();
          while (true) {
            await new Promise((r) => setTimeout(r, 1200));
            const st = await teacherPhotoRecognizeJob(jobId);
            const job = st?.job || {};
            const status = String(job.status || '');
            if (status === 'done') {
              showMsg('ok', `Done. Extracted ${Number(job.total_fens || 0)} FENs.`);
              const out = await teacherPhotoRecognizeFens(jobId);
              const added = appendFensToEntries(out?.fens || []);
              showMsg('ok', `Done. Absorbed ${added} FENs.`);
              break;
            }
            if (status === 'error') {
              throw new Error(String(job.message || 'Photo recognize failed'));
            }
            // timeout ~ 5 minutes
            if (Date.now() - started > 5 * 60 * 1000) {
              throw new Error('Timed out while processing');
            }
            showMsg('ok', `Processing… (${Number(job.total_fens || 0)} extracted)`);
          }
        } catch (e) {
          showMsg('err', e?.message || String(e));
        } finally {
          try { photoBtn.disabled = false; } catch {}
          try { photoInput.value = ''; } catch {}
        }
      });

      host.querySelector('#tfBulkValidate')?.addEventListener('click', () => {
        clearMsg();
        const r = absorbFromTextarea('validate');
        if (!r.absorbed) {
          showMsg('err', 'No valid FEN lines to absorb.');
          return;
        }
        showMsg('ok', 'Ready. Click Run Engine to generate answers (1-best).');
      });
      host.querySelector('#tfBulkClear')?.addEventListener('click', () => {
        if (input) input.value = '';
        clearMsg();
        entries = [];
        absorbedStack.length = 0;
        selectedIdx = 0;
        renderList();
        updateCounts();
        showSelected();
      });
