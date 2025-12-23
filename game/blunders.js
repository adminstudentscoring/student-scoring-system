// Blunders (stub)
// This file is intentionally small. We'll expand it later.

(function () {
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getPlayers() {
    const fromWindow = Array.isArray(window.blundersPlayers) ? window.blundersPlayers : null;
    if (fromWindow && fromWindow.length) return fromWindow;
    try {
      const raw = localStorage.getItem('blundersPlayers');
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function getStudentPasswordQuery() {
    try {
      const pwd = String(localStorage.getItem('studentAccessPassword') || '');
      return pwd ? `?password=${encodeURIComponent(pwd)}` : '';
    } catch {
      return '';
    }
  }

  async function fetchMyBlunders(studentId) {
    const qs = getStudentPasswordQuery();
    const resp = await fetch(`/api/public/students/${encodeURIComponent(String(studentId))}/blunders${qs}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    return data;
  }

  async function submitAttempt(studentId, puzzleId, moveUci, revealBest) {
    const qs = getStudentPasswordQuery();
    const resp = await fetch(`/api/public/students/${encodeURIComponent(String(studentId))}/blunders/${encodeURIComponent(String(puzzleId))}/attempt${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moveUci, revealBest: !!revealBest })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    return data;
  }

  function fmtTs(iso) {
    try {
      const d = new Date(String(iso || ''));
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString();
    } catch {
      return '';
    }
  }

  function initBlunders() {
    const root = document.getElementById('blundersRoot');
    if (!root) return;

    const players = getPlayers();
    const me = players[0] || null;
    const title = me ? `Player: ${me.name || 'Student'} (${me.studentId || ''})` : 'No player selected';

    root.innerHTML = `
      <div class="blunders-card">
        <div class="blunders-title">💥 Blunders</div>
        <div class="blunders-muted">${escapeHtml(title)}</div>
        <div class="blunders-muted" style="margin-top:8px;">This is an early MVP: list puzzles + submit a UCI move (e2e4).</div>

        <div id="blundersStatus" class="blunders-muted" style="margin-top:10px;"></div>
        <div id="blundersList" style="margin-top:10px;"></div>
      </div>
    `;

    if (!me || !me.id) {
      const s = document.getElementById('blundersStatus');
      if (s) s.textContent = 'Missing student identity.';
      return;
    }

    const statusEl = document.getElementById('blundersStatus');
    const listEl = document.getElementById('blundersList');
    const setStatus = (txt) => { if (statusEl) statusEl.textContent = String(txt || ''); };

    const render = (data) => {
      const pending = Array.isArray(data?.pending) ? data.pending : [];
      const completed = Array.isArray(data?.completed) ? data.completed : [];
      setStatus(`Pending: ${pending.length} · Completed: ${completed.length}`);
      if (!listEl) return;

      const pendingHtml = pending.map((p) => {
        const pid = String(p.id || '');
        const fen = String(p.startFEN || '');
        const url = String(p.gameUrl || '');
        const drop = typeof p.dropPoints === 'number' ? p.dropPoints : (Number(p.dropCp || 0) / 100);
        return `
          <div style="border:1px solid #e5e7eb; border-radius:12px; padding:10px; margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
              <div style="font-weight:900; color:#111827;">Pending puzzle</div>
              <div class="blunders-muted">${escapeHtml(fmtTs(p.createdAt))}</div>
            </div>
            <div class="blunders-muted" style="margin-top:6px;">Blunder: <strong>${escapeHtml(String(p.blunderSan || p.blunderMoveUci || ''))}</strong> · Drop: <strong>${escapeHtml(drop.toFixed(2))}</strong></div>
            ${url ? `<div class="blunders-muted" style="margin-top:6px;">Source: <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></div>` : ''}
            <details style="margin-top:8px;">
              <summary class="blunders-muted" style="cursor:pointer;">Show FEN</summary>
              <div style="margin-top:6px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size:12px; color:#111827; word-break:break-all;">${escapeHtml(fen)}</div>
            </details>
            <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
              <input data-blunders-move="${escapeHtml(pid)}" type="text" placeholder="Your move (UCI, e.g. e2e4)" style="flex:1 1 220px; padding:10px; border:1px solid #e5e7eb; border-radius:10px;">
              <button class="btn btn-primary" type="button" data-blunders-submit="${escapeHtml(pid)}">Submit</button>
              <button class="btn btn-secondary" type="button" data-blunders-reveal="${escapeHtml(pid)}">Reveal best</button>
            </div>
            <div class="blunders-muted" data-blunders-msg="${escapeHtml(pid)}" style="margin-top:8px;"></div>
          </div>
        `;
      }).join('');

      const completedHtml = completed.slice(0, 20).map((p) => {
        return `
          <div style="border:1px solid #e5e7eb; border-radius:12px; padding:10px; margin-bottom:10px; background:#f9fafb;">
            <div style="font-weight:900; color:#111827;">Completed</div>
            <div class="blunders-muted" style="margin-top:6px;">${escapeHtml(String(p.blunderSan || p.blunderMoveUci || ''))}</div>
          </div>
        `;
      }).join('');

      listEl.innerHTML = `
        <div style="font-weight:900; color:#111827; margin:10px 0 8px;">Pending</div>
        ${pendingHtml || `<div class="blunders-muted">No pending puzzles yet. (Sync runs when you open this page.)</div>`}
        <div style="font-weight:900; color:#111827; margin:14px 0 8px;">Completed (latest 20)</div>
        ${completedHtml || `<div class="blunders-muted">No completed puzzles yet.</div>`}
      `;
    };

    const load = async () => {
      try {
        setStatus('Loading...');
        const data = await fetchMyBlunders(me.id);
        render(data);
      } catch (e) {
        setStatus(`Failed: ${e?.message || e}`);
      }
    };

    root.addEventListener('click', async (ev) => {
      const t = ev.target;
      const submitBtn = t?.closest?.('[data-blunders-submit]');
      const revealBtn = t?.closest?.('[data-blunders-reveal]');
      if (!submitBtn && !revealBtn) return;
      const pid = String((submitBtn || revealBtn).getAttribute(submitBtn ? 'data-blunders-submit' : 'data-blunders-reveal') || '');
      if (!pid) return;
      const msgEl = root.querySelector(`[data-blunders-msg="${CSS.escape(pid)}"]`);
      const setMsg = (txt) => { if (msgEl) msgEl.textContent = String(txt || ''); };

      try {
        if (submitBtn) {
          const input = root.querySelector(`[data-blunders-move="${CSS.escape(pid)}"]`);
          const mv = String(input?.value || '').trim();
          if (!mv) return setMsg('Please input a UCI move, e.g. e2e4');
          setMsg('Checking...');
          const out = await submitAttempt(me.id, pid, mv, false);
          if (out.alreadyCompleted) {
            setMsg('Already completed.');
          } else if (out.ok) {
            setMsg(out.verdict === 'best' ? 'Correct (best move).' : 'Correct (no blunder).');
          } else {
            setMsg(`Retry. Drop: ${Number(out.dropPoints || 0).toFixed(2)}`);
          }
          await load();
        }
        if (revealBtn) {
          setMsg('Revealing...');
          const out = await submitAttempt(me.id, pid, '', true);
          if (out?.bestMove) setMsg(`Best move: ${out.bestMove}`);
          else setMsg('Best move not available yet.');
        }
      } catch (e) {
        setMsg(`Error: ${e?.message || e}`);
      }
    });

    load();
  }

  window.initBlunders = initBlunders;
})();


