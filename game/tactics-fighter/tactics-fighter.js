(function () {
  const TF = window.__TacticsFighterCore;
  if (!TF) {
    console.error('[tactics-fighter] Missing core.js (window.__TacticsFighterCore). Ensure /game/tactics-fighter/core.js is loaded before tactics-fighter.js');
    return;
  }

  // Pull core symbols into this file's scope to avoid rewriting the existing code.
  const {
    escapeHtml,
    getUrlMode,
    setUrlMode,
    normalizeMode,
    fetchConfig,
    apiRequest,
    getPublicStudentPassword,
    getPublicStudentId,
    normalizeBucketKey,
    tfJson,

    pieceImageSrc,
    rcToCoord,
    parseFenToBoard,
    buildFenFromBoard,
    fenSideToMove,
    cloneBoard,
    coordToRc,
    displayToBoardRc,
    applyUciToBoard,
    undoOnePly,
    uciToPseudoSan,

    studentFetchTree,
    studentFetchSubtopicPuzzles,
    studentFetchStats,
    studentFetchGhostPuzzles,
    studentPostAttempt,
    studentEngineAnalyze,
    studentApplyMove,
    teacherApplyMove,

    builderFetchPuzzles,
    builderCreatePuzzle,
    engineAnalyze,
    builderDeletePuzzle,
    builderUpdatePuzzle,
    builderFetchTree,
    builderCreateCategory,
    builderRenameCategory,
    builderDeleteCategory,
    builderCreateTopic,
    builderRenameTopic,
    builderDeleteTopic,
    builderCreateSubtopic,
    builderRenameSubtopic,
    builderUpdateSubtopicMessage,
    builderDeleteSubtopic,

    renderShell,
    renderHome,
    renderMode
  } = TF;

  window.initTacticsFighter = async function initTacticsFighter() {
    const root = document.getElementById('tacticsFighterRoot');
    if (!root) return;

    const players = Array.isArray(window.tacticsFighterPlayers) ? window.tacticsFighterPlayers : [];
    const role = new URLSearchParams(window.location.search).get('role') || '';
    const isTeacher = String(role || '').toLowerCase() === 'teacher';
    const mode = normalizeMode(getUrlMode() || (isTeacher ? 'practice' : 'home'));
    const publicStudentId = isTeacher ? '' : getPublicStudentId(players);
    const publicStudentPassword = isTeacher ? '' : getPublicStudentPassword();

    root.innerHTML = renderShell({ role, players, mode });

    const main = document.getElementById('tfMain');
    const setMain = (html) => { if (main) main.innerHTML = html; };
    const setOut = (html) => {
      const out = document.getElementById('tfOutput');
      if (out) out.innerHTML = html;
    };

    const loadConfigOnce = async () => {
      try {
        const cfg = await fetchConfig();
        return cfg;
      } catch {
        return null;
      }
    };
    const cfg = await loadConfigOnce();

    const ui = {
      tfSettings: {
        stockfishDepthCap: 14
      },
      builderTree: null,
      builderMsg: null,
      builderLoadedOnce: false,
      expanded: {
        cat: new Set(),
        topic: new Set(),
        subtopic: new Set(),
        puzzlesLoaded: new Set()
      },
      puzzlesBySubtopic: new Map()
      ,
      puzzlePageBySubtopic: new Map(),
      teacher: {
        bucket: (() => {
          try { return normalizeBucketKey(localStorage.getItem('tacticsFighterPracticeBucket') || 'beginner'); } catch { return 'beginner'; }
        })(),
        tree: null, // { categories: [] }
        view: 'bucket', // bucket | categories | topics | subtopics | puzzles
        categoryId: null,
        topicId: null,
        subtopicId: null,
        puzzlesAll: [],
        page: 1,
        pageSize: 10
      },
      student: {
        bucket: (() => {
          try { return normalizeBucketKey(localStorage.getItem('tacticsFighterPracticeBucket') || 'beginner'); } catch { return 'beginner'; }
        })(),
        stats: null,
        tree: null,
        view: 'bucket',
        categoryId: null,
        topicId: null,
        subtopicId: null,
        puzzles: [],
        page: 1,
        pageSize: 10,
        total: 0,
        puzzleSource: 'subtopic', // 'subtopic' | 'ghost'
        // Cache pages so the runner can navigate across all puzzles without forcing user to click Next in the subtopic list.
        puzzlePages: {}, // { [page:number]: { puzzles: [], total:number, pageSize:number } }
        // Local session verdicts (per puzzle id). Used for Start/Next skip logic.
        verdictByPuzzleId: {}, // { [puzzleId:string]: 'correct' | 'incorrect' }
        // Allow practicing again on already-completed puzzles (UI only; server completion remains true).
        tryAgainByPuzzleId: {}, // { [puzzleId:string]: true }
        challenge: { mode: null, ghostCount: 0, msg: '' },
        runner: null
      }
    };

    // Settings (org-level)
    async function loadTfSettings() {
      try {
        if (isTeacher) {
          const resp = await apiRequest('/api/teachers/tactics-fighter/settings', { method: 'GET' });
          const data = await tfJson(resp);
          ui.tfSettings.stockfishDepthCap = Number(data?.stockfishDepthCap || 14) || 14;
          return ui.tfSettings;
        }
        if (publicStudentId) {
          const qp = new URLSearchParams();
          if (publicStudentPassword) qp.set('password', String(publicStudentPassword));
          const resp = await apiRequest(`/api/public/students/${encodeURIComponent(publicStudentId)}/tactics-fighter/settings?${qp.toString()}`, { method: 'GET' });
          const data = await tfJson(resp);
          ui.tfSettings.stockfishDepthCap = Number(data?.stockfishDepthCap || 14) || 14;
          return ui.tfSettings;
        }
      } catch {}
      return ui.tfSettings;
    }

    async function saveTfSettings(nextCap) {
      const cap = Math.max(4, Math.min(22, Number(nextCap || 14) || 14));
      const resp = await apiRequest('/api/teachers/tactics-fighter/settings', {
        method: 'PUT',
        body: JSON.stringify({ stockfishDepthCap: cap })
      });
      const data = await tfJson(resp);
      ui.tfSettings.stockfishDepthCap = Number(data?.stockfishDepthCap || cap) || cap;
      return ui.tfSettings;
    }

    function getDepthCap() {
      const cap = Number(ui.tfSettings?.stockfishDepthCap || 14) || 14;
      return Math.max(4, Math.min(22, cap));
    }

    function getPracticeDepth() {
      // Keep existing default intent (12), but respect the cap.
      return Math.min(12, getDepthCap());
    }

    function getBuilderDepthDefault() {
      // Keep existing default intent (16), but respect the cap.
      return Math.min(16, getDepthCap());
    }

    function toastShow(type, text, opts = {}) {
      const el = document.getElementById('tfToast');
      if (!el) return;
      el.style.display = 'block';
      el.classList.remove('ok', 'err', 'is-loading');
      if (type === 'ok') el.classList.add('ok');
      if (type === 'err') el.classList.add('err');
      if (type === 'loading') el.classList.add('is-loading');
      el.textContent = String(text || '');
      const ms = Number(opts?.autoHideMs || 0);
      if (ms > 0) {
        const token = String(Date.now());
        el.setAttribute('data-toast-token', token);
        setTimeout(() => {
          try {
            const cur = el.getAttribute('data-toast-token');
            if (cur === token) toastHide();
          } catch {}
        }, ms);
      }
    }

    function toastHide() {
      const el = document.getElementById('tfToast');
      if (!el) return;
      el.style.display = 'none';
      el.textContent = '';
      el.classList.remove('ok', 'err', 'is-loading');
    }

    function pieceColorFromChar(p) {
      const s = String(p || '');
      if (!s) return null;
      // Uppercase = white, lowercase = black (FEN convention)
      return (s === s.toUpperCase()) ? 'w' : 'b';
    }

    function promotedPieceChar(pawnChar, promoLower) {
      const color = pieceColorFromChar(pawnChar);
      const l = String(promoLower || '').trim().toLowerCase();
      const map = { q: 'q', r: 'r', b: 'b', n: 'n' };
      const base = map[l] || 'q';
      return (color === 'w') ? base.toUpperCase() : base;
    }

    function needsPawnPromotion(board, fromCoord, toCoord) {
      const fr = coordToRc(String(fromCoord || '').trim());
      const tr = coordToRc(String(toCoord || '').trim());
      if (!fr || !tr) return false;
      const piece = board?.[fr.r]?.[fr.c] || '';
      if (piece !== 'P' && piece !== 'p') return false;
      // board row 0 is rank 8, row 7 is rank 1
      if (piece === 'P' && tr.r === 0) return true;
      if (piece === 'p' && tr.r === 7) return true;
      return false;
    }

    function isPseudoLegalMove(board, side, fromCoord, toCoord) {
      const fr = coordToRc(String(fromCoord || '').trim());
      const tr = coordToRc(String(toCoord || '').trim());
      if (!fr || !tr) return false;
      const b = board;
      const piece = b?.[fr.r]?.[fr.c] || '';
      if (!piece) return false;
      const isWhite = piece === piece.toUpperCase();
      const wantSide = (String(side || 'w') === 'b') ? 'b' : 'w';
      if ((wantSide === 'w' && !isWhite) || (wantSide === 'b' && isWhite)) return false;
      const dst = b?.[tr.r]?.[tr.c] || '';
      if (dst) {
        const dstIsWhite = dst === dst.toUpperCase();
        if (dstIsWhite === isWhite) return false; // can't capture own piece
      }

      const dr = tr.r - fr.r;
      const dc = tr.c - fr.c;
      const absDr = Math.abs(dr);
      const absDc = Math.abs(dc);
      const t = piece.toLowerCase();

      const clearPath = () => {
        const stepR = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
        const stepC = dc === 0 ? 0 : (dc > 0 ? 1 : -1);
        let r = fr.r + stepR;
        let c = fr.c + stepC;
        while (r !== tr.r || c !== tr.c) {
          if (b?.[r]?.[c]) return false;
          r += stepR;
          c += stepC;
        }
        return true;
      };

      if (t === 'n') return (absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2);
      if (t === 'b') return absDr === absDc && absDr > 0 && clearPath();
      if (t === 'r') return ((dr === 0 && dc !== 0) || (dc === 0 && dr !== 0)) && clearPath();
      if (t === 'q') {
        const diag = absDr === absDc && absDr > 0;
        const ortho = (dr === 0 && dc !== 0) || (dc === 0 && dr !== 0);
        return (diag || ortho) && clearPath();
      }
      if (t === 'k') {
        // Basic castling allowance (no check validation)
        const fromSq = String(fromCoord || '').trim().toLowerCase();
        const toSq = String(toCoord || '').trim().toLowerCase();
        if (wantSide === 'w' && fromSq === 'e1' && (toSq === 'g1' || toSq === 'c1')) {
          // squares between must be empty and rook must exist
          if (toSq === 'g1') {
            const f1 = coordToRc('f1'); const g1 = coordToRc('g1'); const h1 = coordToRc('h1');
            if (!f1 || !g1 || !h1) return false;
            return !b[f1.r][f1.c] && !b[g1.r][g1.c] && (b[h1.r][h1.c] === 'R');
          } else {
            const b1 = coordToRc('b1'); const c1 = coordToRc('c1'); const d1 = coordToRc('d1'); const a1 = coordToRc('a1');
            if (!b1 || !c1 || !d1 || !a1) return false;
            return !b[b1.r][b1.c] && !b[c1.r][c1.c] && !b[d1.r][d1.c] && (b[a1.r][a1.c] === 'R');
          }
        }
        if (wantSide === 'b' && fromSq === 'e8' && (toSq === 'g8' || toSq === 'c8')) {
          if (toSq === 'g8') {
            const f8 = coordToRc('f8'); const g8 = coordToRc('g8'); const h8 = coordToRc('h8');
            if (!f8 || !g8 || !h8) return false;
            return !b[f8.r][f8.c] && !b[g8.r][g8.c] && (b[h8.r][h8.c] === 'r');
          } else {
            const b8 = coordToRc('b8'); const c8 = coordToRc('c8'); const d8 = coordToRc('d8'); const a8 = coordToRc('a8');
            if (!b8 || !c8 || !d8 || !a8) return false;
            return !b[b8.r][b8.c] && !b[c8.r][c8.c] && !b[d8.r][d8.c] && (b[a8.r][a8.c] === 'r');
          }
        }
        return absDr <= 1 && absDc <= 1 && (absDr + absDc) > 0;
      }
      if (t === 'p') {
        const forward = isWhite ? -1 : 1;
        const startRow = isWhite ? 6 : 1;
        const oneStepOk = (dc === 0 && dr === forward && !dst);
        const twoStepOk = (dc === 0 && fr.r === startRow && dr === 2 * forward && !dst && !b?.[fr.r + forward]?.[fr.c]);
        const captureOk = (absDc === 1 && dr === forward && !!dst);
        return oneStepOk || twoStepOk || captureOk;
      }

      return false;
    }

    async function openPromotionPicker(pawnChar) {
      const color = pieceColorFromChar(pawnChar) || 'w';
      const host = document.createElement('div');
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="tfPromoBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Promotion" style="width: calc(100vw - 40px); max-width: 420px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Promote to</div>
              <button id="tfPromoClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div class="tf-muted">Choose a piece:</div>
              <div style="margin-top:12px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                <button type="button" class="btn btn-secondary" data-tf-promo="q" aria-label="Queen" style="min-width:72px;">
                  <img alt="" style="width:28px;height:28px;vertical-align:middle;" src="${escapeHtml(pieceImageSrc(color === 'w' ? 'Q' : 'q'))}">
                  <span style="margin-left:8px;">Q</span>
                </button>
                <button type="button" class="btn btn-secondary" data-tf-promo="r" aria-label="Rook" style="min-width:72px;">
                  <img alt="" style="width:28px;height:28px;vertical-align:middle;" src="${escapeHtml(pieceImageSrc(color === 'w' ? 'R' : 'r'))}">
                  <span style="margin-left:8px;">R</span>
                </button>
                <button type="button" class="btn btn-secondary" data-tf-promo="b" aria-label="Bishop" style="min-width:72px;">
                  <img alt="" style="width:28px;height:28px;vertical-align:middle;" src="${escapeHtml(pieceImageSrc(color === 'w' ? 'B' : 'b'))}">
                  <span style="margin-left:8px;">B</span>
                </button>
                <button type="button" class="btn btn-secondary" data-tf-promo="n" aria-label="Knight" style="min-width:72px;">
                  <img alt="" style="width:28px;height:28px;vertical-align:middle;" src="${escapeHtml(pieceImageSrc(color === 'w' ? 'N' : 'n'))}">
                  <span style="margin-left:8px;">N</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(host);

      return await new Promise((resolve) => {
        const close = (val) => { try { host.remove(); } catch {} resolve(val); };
        host.querySelector('#tfPromoClose')?.addEventListener('click', () => close(null));
        host.querySelector('#tfPromoBackdrop')?.addEventListener('click', (e) => {
          if (e.target && e.target.id === 'tfPromoBackdrop') close(null);
        });
        host.addEventListener('click', (e) => {
          const t = e.target;
          if (!(t instanceof Element)) return;
          const b = t.closest('[data-tf-promo]');
          if (!b) return;
          const v = String(b.getAttribute('data-tf-promo') || '').trim().toLowerCase();
          if (v === 'q' || v === 'r' || v === 'b' || v === 'n') return close(v);
          return close('q');
        });
      });
    }

    function showBuilderMsg(type, text) {
      const s = String(text || '');
      if (/^loading/i.test(s)) return toastShow('loading', s);
      if (type === 'err') return toastShow('err', s, { autoHideMs: 3500 });
      return toastShow('ok', s, { autoHideMs: 2500 });
    }

    function clearBuilderMsg() {
      toastHide();
      const el = document.getElementById('tfBuilderMsg');
      // Keep the inline element hidden (legacy).
      if (el) {
        el.style.display = 'none';
        el.textContent = '';
        el.classList.remove('ok', 'err');
      }
    }

    function renderMiniBoardHtml(fen) {
      const b = parseFenToBoard(fen);
      if (!b) return `<div class="tf-mini-board" aria-label="Mini board"></div>`;
      const sqs = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const isDark = (r + c) % 2 === 1;
          const p = b[r][c] || '';
          const src = p ? pieceImageSrc(p) : '';
          const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
          sqs.push(`<div class="tf-mini-sq ${isDark ? 'dark' : 'light'}">${img}</div>`);
        }
      }
      return `<div class="tf-mini-board" aria-label="Mini board">${sqs.join('')}</div>`;
    }

    function renderStudentCategories(categories) {
      const cats = Array.isArray(categories) ? categories : [];
      if (!cats.length) return `<div class="tf-muted">No categories for this bucket yet.</div>`;
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <div class="tf-section-title">Categories</div>
            <div class="tf-muted" style="margin-bottom:10px;">Pick a category to see topics.</div>
          </div>
          <button type="button" class="btn btn-secondary" data-stu-back="buckets">Change bucket</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${cats.map((c) => `
            <button type="button" class="btn btn-secondary" data-stu-cat="${escapeHtml(String(c.id))}" style="text-align:left;">
              <strong>${escapeHtml(String(c.name || ''))}</strong>
            </button>
          `).join('')}
        </div>
      `;
    }

    function renderStudentTopics(category) {
      const topics = Array.isArray(category?.topics) ? category.topics : [];
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <div class="tf-section-title">Topics</div>
            <div class="tf-muted">${escapeHtml(String(category?.name || ''))}</div>
          </div>
          <button type="button" class="btn btn-secondary" data-stu-back="categories">Back</button>
        </div>
        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${topics.length ? topics.map((t) => `
            <button type="button" class="btn btn-secondary" data-stu-topic="${escapeHtml(String(t.id))}" style="text-align:left;">
              <strong>${escapeHtml(String(t.name || ''))}</strong>
            </button>
          `).join('') : `<div class="tf-muted">No topics yet.</div>`}
        </div>
      `;
    }

    function renderStudentSubtopics(category, topic) {
      const subs = Array.isArray(topic?.subtopics) ? topic.subtopics : [];
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <div class="tf-section-title">Subtopics</div>
            <div class="tf-muted">${escapeHtml(String(category?.name || ''))} → ${escapeHtml(String(topic?.name || ''))}</div>
          </div>
          <button type="button" class="btn btn-secondary" data-stu-back="topics">Back</button>
        </div>
        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${subs.length ? subs.map((s) => `
            <button type="button" class="btn btn-secondary" data-stu-subtopic="${escapeHtml(String(s.id))}" style="text-align:left;">
              <strong>${escapeHtml(String(s.name || ''))}</strong>
              <span class="tf-muted" style="margin-left:8px;">(${Number(s.puzzleCount || 0)} puzzles)</span>
            </button>
          `).join('') : `<div class="tf-muted">No subtopics yet.</div>`}
        </div>
      `;
    }

    function renderStudentPuzzles(puzzles, page, pageSize, total) {
      const list = Array.isArray(puzzles) ? puzzles : [];
      const totalPages = Math.max(1, Math.ceil(Math.max(0, Number(total || 0)) / Math.max(1, Number(pageSize || 10))));
      const p = Math.max(1, Number(page || 1));
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <div class="tf-section-title">Puzzles</div>
            <div class="tf-muted">Click a puzzle or press Start.</div>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <button type="button" class="btn btn-primary" data-stu-start="1">Start</button>
            <button type="button" class="btn btn-secondary" data-stu-back="subtopics">Back</button>
          </div>
        </div>

        <div style="margin-top:12px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div class="tf-muted">Page ${p} / ${totalPages} · ${Number(total || 0)} puzzles</div>
          <div style="display:flex; gap:10px;">
            <button type="button" class="btn btn-secondary" data-stu-page="prev" ${p <= 1 ? 'disabled' : ''}>Prev</button>
            <button type="button" class="btn btn-secondary" data-stu-page="next" ${p >= totalPages ? 'disabled' : ''}>Next</button>
          </div>
        </div>

        <div class="tf-puzzles-grid" style="margin-top:12px;">
          ${list.length ? list.map((pz, idx) => `
            <button type="button" class="tf-puzzle-card" data-stu-open-puzzle="${escapeHtml(String(pz.id))}" data-stu-idx="${idx}" aria-label="Open puzzle">
              <div style="position:relative;">
                ${renderMiniBoardHtml(pz.fen)}
                ${pz.completed ? `<div style="position:absolute; right:8px; top:8px; font-size:20px; font-weight:900; color:#16a34a;">✓</div>` : ''}
              </div>
            </button>
          `).join('') : `<div class="tf-muted">No puzzle is found.</div>`}
        </div>
      `;
    }

    function absIndexToPage(absIndex) {
      const ps = Math.max(1, Number(ui.student.pageSize || 10));
      const ai = Math.max(0, Number(absIndex || 0));
      const page = Math.floor(ai / ps) + 1;
      const idx = ai % ps;
      return { page, idx };
    }

    function puzzleIsTarget(pz) {
      if (!pz || typeof pz !== 'object') return false;
      if (pz.completed) return false;
      // "Incorrect" vs "not done" is not persisted yet, but for selection rules both are valid targets.
      return true;
    }

    async function findFirstTargetAbsIndex() {
      const total = Math.max(0, Number(ui.student.total || 0));
      const ps = Math.max(1, Number(ui.student.pageSize || 10));
      const totalPages = Math.max(1, Math.ceil(total / ps));
      for (let p = 1; p <= totalPages; p++) {
        const pageData = await studentEnsurePuzzlePage(p);
        const list = Array.isArray(pageData?.puzzles) ? pageData.puzzles : [];
        for (let i = 0; i < list.length; i++) {
          if (puzzleIsTarget(list[i])) return (p - 1) * ps + i;
        }
      }
      return 0;
    }

    async function findNextTargetAbsIndex(fromAbsIndex) {
      const total = Math.max(0, Number(ui.student.total || 0));
      const ps = Math.max(1, Number(ui.student.pageSize || 10));
      const start = Math.max(0, Number(fromAbsIndex || 0) + 1);
      if (start >= total) return null;
      const { page: startPage, idx: startIdx } = absIndexToPage(start);
      const totalPages = Math.max(1, Math.ceil(total / ps));
      for (let p = startPage; p <= totalPages; p++) {
        const pageData = await studentEnsurePuzzlePage(p);
        const list = Array.isArray(pageData?.puzzles) ? pageData.puzzles : [];
        const i0 = (p === startPage) ? startIdx : 0;
        for (let i = i0; i < list.length; i++) {
          if (puzzleIsTarget(list[i])) return (p - 1) * ps + i;
        }
      }
      return null;
    }

    async function openStudentRunnerModal() {
      const ps = Math.max(1, Number(ui.student.pageSize || 10));
      // Ensure we know the total (load page 1 if needed).
      if (!ui.student.total) {
        await studentEnsurePuzzlePage(ui.student.page || 1);
      }
      const total = Math.max(0, Number(ui.student.total || 0));
      if (!total) return;

      let startAbs = Number(ui.student.runner?.absIndex);
      if (!Number.isFinite(startAbs)) startAbs = 0;
      startAbs = Math.max(0, Math.min(total - 1, Math.trunc(startAbs)));

      const { page: startPage, idx: startIdx } = absIndexToPage(startAbs);
      // Keep list page in sync with what the runner is showing.
      ui.student.page = startPage;
      const pageData = await studentEnsurePuzzlePage(startPage);
      ui.student.puzzles = Array.isArray(pageData?.puzzles) ? pageData.puzzles : [];

      const p0 = ui.student.puzzles[startIdx];
      if (!p0) return;
      const startFen = String(p0?.fen || '').trim();
      const startBoard = parseFenToBoard(startFen);
      const startSide = fenSideToMove(startFen);
      ui.student.runner = {
        absIndex: startAbs,
        movesUci: [],
        movesSan: [],
        selectedFrom: null,
        lastVerdict: null, // 'correct' | 'incorrect' | null (persistent until next submit)
        // board state (client-side, no legality validation)
        startFen,
        fen: startFen,
        board: startBoard || Array.from({ length: 8 }, () => Array(8).fill('')),
        side: startSide,
        history: [], // entries: { fen, board, side, movesUciLen, movesSanLen }
        // PV selection (chosen accepted line)
        lineIdx: null,
        lineUci: null,
        lineSan: null,
        busy: false
      };
      ui.student.runner.playerSide = startSide; // 'w' | 'b'
      ui.student.runner.orientation = (startSide === 'b') ? 'black' : 'white';

      const modal = document.createElement('div');
      modal.className = 'vcp-modal-backdrop';
      modal.innerHTML = `
        <div class="vcp-modal tf-practice-modal" role="dialog" aria-modal="true" aria-label="Practice" style="width: calc(100vw - 40px); max-width: 1100px; height: calc(100vh - 24px); max-height: 96vh;">
          <div class="vcp-modal-header">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%;">
              <div>
                <div style="font-weight:900;">Practice</div>
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                  <div class="tf-muted" id="tfStuRunnerMeta"></div>
                  <div id="tfStuRunnerMetaBadge" class="tf-stu-meta-badge" style="display:none;">Completed</div>
                </div>
              </div>
              <button type="button" class="btn btn-secondary" data-stu-runner-close="1">Close</button>
            </div>
          </div>
          <div class="vcp-modal-body">
            <div class="tf-practice-runner-grid">
              <div class="tf-practice-spacer">
                <div id="tfStuSpacerMsg" class="tf-practice-spacer-msg"></div>
              </div>
              <div class="tf-practice-board-wrap">
                <div id="tfStuRunnerFeedback" class="tf-stu-feedback" style="display:none;"></div>
                <div id="tfStuRunnerBoard" class="tf-board" style="width:100%; aspect-ratio:1/1;"></div>
              </div>
              <div class="tf-stu-right">
                <div class="tf-stu-toprow">
                  <div class="tf-section-title" id="tfStuRunnerTurnLabel" style="margin:0;"></div>
                </div>
                <div id="tfStuRunnerMoves" class="tf-stu-moves"></div>
                <div id="tfStuRunnerMsg" class="tf-builder-msg tf-stu-msg" style="display:none;"></div>
                <div class="tf-stu-actions">
                  <div class="tf-stu-actions-left">
                    <button type="button" class="btn btn-secondary" data-stu-undo="1" aria-label="Redo">↺</button>
                    <div class="tf-stu-nav" aria-label="Puzzle navigation">
                      <button type="button" class="btn btn-secondary" data-stu-prev="1" title="Previous puzzle">←</button>
                      <button type="button" class="btn btn-secondary" data-stu-next="1" title="Next puzzle">→</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const close = () => { try { document.body.removeChild(modal); } catch {} };
      const setMsg = (type, text) => {
        const el = modal.querySelector('#tfStuRunnerMsg');
        if (!el) return;
        el.style.display = 'block';
        el.classList.remove('ok', 'err');
        if (type === 'ok') el.classList.add('ok');
        if (type === 'err') el.classList.add('err');
        el.textContent = String(text || '');
      };
      const clearMsg = () => {
        const el = modal.querySelector('#tfStuRunnerMsg');
        if (!el) return;
        el.style.display = 'none';
        el.textContent = '';
        el.classList.remove('ok', 'err');
      };

      function renderBoardInteractive() {
        const host = modal.querySelector('#tfStuRunnerBoard');
        if (!host) return;
        const b = ui.student.runner.board;
        if (!b) { host.innerHTML = ''; return; }
        const sqs = [];
        for (let dr = 0; dr < 8; dr++) {
          for (let dc = 0; dc < 8; dc++) {
            const { r, c } = displayToBoardRc(dr, dc, ui.student.runner.orientation);
            const isDark = (dr + dc) % 2 === 1;
            const coord = rcToCoord(r, c);
            // During drag, hide the original piece on the source square (it is represented by the ghost).
            const piece = (drag?.active && drag?.from === coord) ? '' : (b[r][c] || '');
            const src = piece ? pieceImageSrc(piece) : '';
            const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
            const sel = ui.student.runner.selectedFrom === coord ? ' is-selected' : '';
            sqs.push(
              `<button type="button" class="tf-sq tf-sq-btn ${isDark ? 'dark' : 'light'}${sel}" data-stu-sq="${escapeHtml(coord)}">${img}</button>`
            );
          }
        }
        // Host is already a square 8x8 grid via .tf-board; render squares directly.
        host.innerHTML = sqs.join('');
      }

      function currentPuzzle() {
        const total = Math.max(0, Number(ui.student.total || 0));
        if (!total) return null;
        const abs = Math.max(0, Math.min(total - 1, Math.trunc(Number(ui.student.runner?.absIndex || 0))));
        const { page, idx } = absIndexToPage(abs);
        const pageData = ui.student.puzzlePages?.[String(page)];
        const list = Array.isArray(pageData?.puzzles) ? pageData.puzzles : Array.isArray(ui.student.puzzles) ? ui.student.puzzles : [];
        return list[idx] || null;
      }

      function resetRunnerToPuzzleIndex(nextIdx) {
        // Back-compat shim (should not be used anymore)
        ui.student.runner.absIndex = Math.max(0, Math.trunc(Number(nextIdx || 0)));
        return true;
      }

      async function resetRunnerToAbsIndex(nextAbs) {
        const total = Math.max(0, Number(ui.student.total || 0));
        if (!total) return false;
        const abs = Math.max(0, Math.min(total - 1, Math.trunc(Number(nextAbs || 0))));
        const { page, idx } = absIndexToPage(abs);
        ui.student.page = page;
        const pageData = await studentEnsurePuzzlePage(page);
        ui.student.puzzles = Array.isArray(pageData?.puzzles) ? pageData.puzzles : [];
        const pz = ui.student.puzzles[idx];
        if (!pz) return false;

        const startFen = String(pz?.fen || '').trim();
        const startBoard = parseFenToBoard(startFen);
        const startSide = fenSideToMove(startFen);
        ui.student.runner.absIndex = abs;
        ui.student.runner.movesUci = [];
        ui.student.runner.movesSan = [];
        ui.student.runner.selectedFrom = null;
        ui.student.runner.startFen = startFen;
        ui.student.runner.fen = startFen;
        ui.student.runner.board = startBoard || Array.from({ length: 8 }, () => Array(8).fill(''));
        ui.student.runner.side = startSide;
        ui.student.runner.history = [];
        ui.student.runner.lineIdx = null;
        ui.student.runner.lineUci = null;
        ui.student.runner.lineSan = null;
        ui.student.runner.lastVerdict = null;
        ui.student.runner.busy = false;
        ui.student.runner.playerSide = startSide;
        ui.student.runner.orientation = (startSide === 'b') ? 'black' : 'white';
        return true;
      }

      function renderRunner() {
        clearMsg();
        const pz = currentPuzzle();
        if (!pz) return close();
        const meta = modal.querySelector('#tfStuRunnerMeta');
        const total = Math.max(0, Number(ui.student.total || 0));
        const abs = Math.max(0, Math.min(Math.max(0, total - 1), Math.trunc(Number(ui.student.runner?.absIndex || 0))));
        if (meta) meta.textContent = `Puzzle ${abs + 1} / ${total || 0}`;
        const isTryAgain = !!ui.student.tryAgainByPuzzleId?.[String(pz.id)];
        const metaBadge = modal.querySelector('#tfStuRunnerMetaBadge');
        if (metaBadge) {
          metaBadge.classList.remove('is-ok', 'is-err');
          if (pz.completed && !isTryAgain) {
            metaBadge.textContent = 'Completed';
            metaBadge.style.display = 'inline-flex';
            // keep default green styling
          } else if (ui.student.runner.lastVerdict === 'incorrect') {
            metaBadge.textContent = 'Incorrect';
            metaBadge.style.display = 'inline-flex';
            metaBadge.classList.add('is-err');
          } else if (ui.student.runner.lastVerdict === 'correct') {
            metaBadge.textContent = 'Correct';
            metaBadge.style.display = 'inline-flex';
            metaBadge.classList.add('is-ok');
          } else {
            metaBadge.style.display = 'none';
          }
        }
        const turnEl = modal.querySelector('#tfStuRunnerTurnLabel');
        if (turnEl) {
          const side = ui.student.runner?.side;
          turnEl.textContent = (side === 'b') ? 'Black to move' : 'White to move';
        }

        // Spacer messages (top stack): subtopic message first, then puzzle message.
        const spacerMsgEl = modal.querySelector('#tfStuSpacerMsg');
        if (spacerMsgEl) {
          const subMsg = String(ui.student.subtopicMessage || '').trim();
          const pzMsg = String(pz?.message || '').trim();
          const html = [
            subMsg ? `<div class="tf-practice-spacer-msg-top">${escapeHtml(subMsg).replace(/\n/g, '<br>')}</div>` : '',
            pzMsg ? `<div class="tf-practice-spacer-msg-bottom">${escapeHtml(pzMsg).replace(/\n/g, '<br>')}</div>` : ''
          ].filter(Boolean).join('');
          spacerMsgEl.innerHTML = html;
          spacerMsgEl.style.display = html ? 'block' : 'none';
        }

        // Feedback overlay (on-board): show only when puzzle completed OR when the last verdict is incorrect.
        const fb = modal.querySelector('#tfStuRunnerFeedback');
        if (fb) {
          const verdict = ui.student.runner.lastVerdict;
          const showCompleted = !!pz.completed && !isTryAgain;
          const showIncorrect = verdict === 'incorrect';
          if (showCompleted || showIncorrect) {
            const isOk = showCompleted;
            const title = showCompleted ? 'Completed' : 'Incorrect';
            const hint = showCompleted ? 'Great job.' : 'Try again.';
            const btnHtml = showCompleted
              ? `<button type="button" class="btn btn-primary" data-stu-feedback-next="1">Next</button>
                 <button type="button" class="btn btn-secondary" data-stu-feedback-tryagain="1">Try again</button>`
              : `<button type="button" class="btn btn-secondary" data-stu-feedback-redo="1">Redo</button>`;
            fb.classList.toggle('is-ok', isOk);
            fb.classList.toggle('is-err', !isOk);
            fb.innerHTML = `
              <div class="tf-stu-feedback-box">
                <div class="tf-stu-feedback-title">${escapeHtml(title)}</div>
                <div class="tf-stu-feedback-sub">${escapeHtml(hint)}</div>
                <div class="tf-stu-feedback-actions">${btnHtml}</div>
              </div>
            `;
            fb.style.display = 'flex';
          } else {
            fb.style.display = 'none';
            fb.innerHTML = '';
            fb.classList.remove('is-ok', 'is-err');
          }
        }

        const movesEl = modal.querySelector('#tfStuRunnerMoves');
        if (movesEl) {
          const html = formatMovesWithMoveNumbersHighlightedHtml(
            ui.student.runner.startFen || pz.fen,
            ui.student.runner.movesSan,
            ui.student.runner.movesSan.length ? (ui.student.runner.movesSan.length - 1) : -1
          );
          movesEl.innerHTML = html || escapeHtml(ui.student.runner.movesUci.join(' '));
        }
        renderBoardInteractive();
      }

      function chooseAcceptedLineForFirstMove(pz, firstUci) {
        const sol = pz?.solutions && typeof pz.solutions === 'object' ? pz.solutions : {};
        const lines = Array.isArray(sol.acceptedLines) ? sol.acceptedLines : (Array.isArray(sol.lines) ? sol.lines : []);
        const uci = String(firstUci || '').trim().toLowerCase();
        for (let i = 0; i < lines.length; i++) {
          const pvUci = Array.isArray(lines[i]?.pvUci) ? lines[i].pvUci : null;
          if (!pvUci || !pvUci.length) continue;
          if (String(pvUci[0] || '').trim().toLowerCase() === uci) return { idx: i, line: lines[i] };
        }
        return null;
      }

      function uciAtPlyMatches(uciList, plyIndex, uci) {
        if (!Array.isArray(uciList)) return false;
        const want = String(uciList[plyIndex] || '').trim().toLowerCase();
        return want && want === String(uci || '').trim().toLowerCase();
      }

      async function submitMoveAndReply() {
        const pz = currentPuzzle();
        if (!pz) return;
        const isTryAgain = !!ui.student.tryAgainByPuzzleId?.[String(pz.id)];
        if (pz.completed && !isTryAgain) return;
        if (ui.student.runner.busy) return;
        const moves = ui.student.runner.movesUci.slice();
        if (!moves.length) return;

        const plyIndex = moves.length - 1;
        const studentUci = moves[plyIndex];
        const beforeBoard = ui.student.runner.history.length ? ui.student.runner.history[ui.student.runner.history.length - 1].board : null;

        // Determine correctness vs PV accepted line (choose on first move).
        if (ui.student.runner.lineIdx == null) {
          const chosen = chooseAcceptedLineForFirstMove(pz, studentUci);
          if (chosen) {
            ui.student.runner.lineIdx = chosen.idx;
            ui.student.runner.lineUci = Array.isArray(chosen.line?.pvUci) ? chosen.line.pvUci.map((x) => String(x || '').trim().toLowerCase()) : null;
            ui.student.runner.lineSan = Array.isArray(chosen.line?.pvSan) ? chosen.line.pvSan.map((x) => String(x || '').trim()) : null;
          }
        }

        const lineUci = ui.student.runner.lineUci;
        const lineSan = ui.student.runner.lineSan;
        const isCorrect = uciAtPlyMatches(lineUci, plyIndex, studentUci);

        // SAN is already appended during click-to-move via /apply-move.
        // Keep it aligned with accepted PV SAN if needed.
        if (Array.isArray(lineSan) && isCorrect) {
          ui.student.runner.movesSan = lineSan.slice(0, moves.length);
        }

        ui.student.runner.busy = true;
        try {
          clearMsg();

          if (isCorrect && Array.isArray(lineUci) && plyIndex + 1 < lineUci.length) {
            // PV reply move (computer)
            const replyUci = lineUci[plyIndex + 1];
            const r0 = await studentApplyMove(publicStudentId, ui.student.runner.fen, replyUci, publicStudentPassword);
            if (r0 && r0.ok && r0.fenAfter) {
              ui.student.runner.history.push({
                fen: ui.student.runner.fen,
                board: cloneBoard(ui.student.runner.board),
                side: ui.student.runner.side,
                movesUciLen: ui.student.runner.movesUci.length,
                movesSanLen: ui.student.runner.movesSan.length
              });
              ui.student.runner.fen = String(r0.fenAfter);
              ui.student.runner.board = parseFenToBoard(ui.student.runner.fen) || ui.student.runner.board;
              ui.student.runner.side = fenSideToMove(ui.student.runner.fen);
              ui.student.runner.movesUci.push(replyUci);
              if (Array.isArray(lineSan)) ui.student.runner.movesSan = lineSan.slice(0, ui.student.runner.movesUci.length);
              else ui.student.runner.movesSan.push(String(r0.san || replyUci));
            }
          } else if (!isCorrect) {
            // Engine reply on wrong move
            const fenNow = ui.student.runner.fen;
            const eng = await studentEngineAnalyze(publicStudentId, fenNow, { depth: getPracticeDepth(), pvPlies: 6 }, publicStudentPassword);
            const bestUci = String(eng?.bestMove || eng?.lines?.[0]?.bestMove || eng?.lines?.[0]?.pvUci?.[0] || '').trim().toLowerCase();
            if (bestUci) {
              const r1 = await studentApplyMove(publicStudentId, ui.student.runner.fen, bestUci, publicStudentPassword);
              if (r1 && r1.ok && r1.fenAfter) {
                ui.student.runner.history.push({
                  fen: ui.student.runner.fen,
                  board: cloneBoard(ui.student.runner.board),
                  side: ui.student.runner.side,
                  movesUciLen: ui.student.runner.movesUci.length,
                  movesSanLen: ui.student.runner.movesSan.length
                });
                ui.student.runner.fen = String(r1.fenAfter);
                ui.student.runner.board = parseFenToBoard(ui.student.runner.fen) || ui.student.runner.board;
                ui.student.runner.side = fenSideToMove(ui.student.runner.fen);
                ui.student.runner.movesUci.push(bestUci);
                const engSan0 = String(r1.san || (Array.isArray(eng?.lines?.[0]?.pvSan) ? (eng.lines[0].pvSan[0] || '') : '') || bestUci);
                ui.student.runner.movesSan = ui.student.runner.movesSan.concat([engSan0]);
              }
            }
          }

          // Log attempt once per student submission (send the full sequence including reply move, if any)
          const last = ui.student.runner.movesUci[ui.student.runner.movesUci.length - 1];
          const out = await studentPostAttempt(publicStudentId, pz.id, {
            bucket: ui.student.bucket,
            subtopicId: ui.student.subtopicId,
            mode: (String(ui.student.puzzleSource || '') === 'ghost') ? 'ghost' : 'practice',
            movesUci: ui.student.runner.movesUci.slice(),
            plyIndex: ui.student.runner.movesUci.length - 1,
            moveUci: last
          }, publicStudentPassword);

          if (out.completed) {
            pz.completed = true;
            ui.student.runner.lastVerdict = 'correct';
            try { ui.student.verdictByPuzzleId[String(pz.id)] = 'correct'; } catch {}
            try { delete ui.student.tryAgainByPuzzleId[String(pz.id)]; } catch {}
            setMsg('ok', 'Correct. Puzzle completed.');
          } else if (out.correctPrefix) {
            ui.student.runner.lastVerdict = 'correct';
            try { ui.student.verdictByPuzzleId[String(pz.id)] = 'correct'; } catch {}
            setMsg('ok', 'Correct. Computer replied.');
          } else {
            ui.student.runner.lastVerdict = 'incorrect';
            try { ui.student.verdictByPuzzleId[String(pz.id)] = 'incorrect'; } catch {}
            setMsg('err', 'Wrong. Engine replied.');
          }
          renderRunner();
        } catch (e) {
          setMsg('err', e?.message || String(e));
        } finally {
          ui.student.runner.busy = false;
        }
      }

      async function applyStudentMove(from, to) {
        const pz0 = currentPuzzle();
        const isTryAgain0 = pz0 ? !!ui.student.tryAgainByPuzzleId?.[String(pz0.id)] : false;
        if (pz0?.completed && !isTryAgain0) return;
        if (ui.student.runner.busy) return;
        const f = String(from || '').trim();
        const t = String(to || '').trim();
        if (!f || !t) return;
        if (f === t) return renderRunner();

        // Prevent "drop anywhere then rollback": do a pseudo-legal validation before optimistic placement.
        if (!isPseudoLegalMove(ui.student.runner.board, ui.student.runner.side, f, t)) {
          setMsg('err', 'Illegal move');
          return renderRunner();
        }

        let didApply = false;
        ui.student.runner.busy = true;
        try {
          clearMsg();

          const fr0 = coordToRc(f);
          const tr0 = coordToRc(t);
          const beforePiece = (fr0 && ui.student.runner.board?.[fr0.r]?.[fr0.c]) ? ui.student.runner.board[fr0.r][fr0.c] : '';
          let promo = '';
          if (needsPawnPromotion(ui.student.runner.board, f, t)) {
            const picked = await openPromotionPicker(beforePiece || 'P');
            if (!picked) return; // cancelled
            promo = picked;
          }
          const uci = `${f}${t}${promo}`;

          // Save state for redo/rollback BEFORE applying.
          ui.student.runner.history.push({
            fen: ui.student.runner.fen,
            board: cloneBoard(ui.student.runner.board),
            side: ui.student.runner.side,
            movesUciLen: ui.student.runner.movesUci.length,
            movesSanLen: ui.student.runner.movesSan.length
          });

          // Optimistic UI: immediately show the piece moved on the board to avoid a blank gap while waiting for backend validation.
          // We do NOT change fen/side here; backend response remains the source of truth.
          try {
            const fr = fr0 || coordToRc(f);
            const tr = tr0 || coordToRc(t);
            const b = ui.student.runner.board;
            if (fr && tr && b?.[fr.r]?.[fr.c]) {
              const piece = b[fr.r][fr.c];
              b[fr.r][fr.c] = '';
              b[tr.r][tr.c] = promo ? promotedPieceChar(piece, promo) : piece;
              renderRunner();
            }
          } catch {}

          const r = await studentApplyMove(publicStudentId, ui.student.runner.fen, uci, publicStudentPassword);
          if (!r || !r.ok || !r.fenAfter) throw new Error('Illegal move');

          ui.student.runner.fen = String(r.fenAfter);
          ui.student.runner.board = parseFenToBoard(ui.student.runner.fen) || ui.student.runner.board;
          ui.student.runner.side = fenSideToMove(ui.student.runner.fen);
          ui.student.runner.movesUci.push(String(r.uci || uci));
          ui.student.runner.movesSan.push(String(r.san || uci));
          didApply = true;
          renderRunner();
        } catch (err) {
          // rollback history entry
          const last = ui.student.runner.history.pop();
          if (last) {
            ui.student.runner.fen = String(last.fen || ui.student.runner.fen);
            ui.student.runner.board = cloneBoard(last.board) || ui.student.runner.board;
            ui.student.runner.side = last.side || ui.student.runner.side;
          }
          setMsg('err', err?.message || String(err));
          renderRunner();
        } finally {
          ui.student.runner.busy = false;
          // Auto-submit: once the user successfully makes a move, immediately treat it as "Submit".
          if (didApply) {
            try { await submitMoveAndReply(); } catch {}
          }
        }
      }

      // Drag & drop support (pointer events; iPad/iOS friendly)
      let ignoreClickUntil = 0;
      const drag = {
        active: false,
        pointerId: null,
        from: null,
        piece: '',
        startX: 0,
        startY: 0,
        hoverEl: null,
        ghostEl: null
      };

      const clearDragHover = () => {
        try { drag.hoverEl?.classList?.remove('is-drop-target'); } catch {}
        drag.hoverEl = null;
      };

      const removeGhost = () => {
        try { drag.ghostEl?.remove(); } catch {}
        drag.ghostEl = null;
      };

      const setGhostPos = (x, y) => {
        if (!drag.ghostEl) return;
        const size = 56;
        drag.ghostEl.style.transform = `translate(${Math.round(x - size / 2)}px, ${Math.round(y - size / 2)}px)`;
      };

      const coordFromPoint = (x, y) => {
        const el = document.elementFromPoint(x, y);
        const sq = el && el.closest ? el.closest('[data-stu-sq]') : null;
        const coord = sq ? String(sq.getAttribute('data-stu-sq') || '').trim() : '';
        return coord || null;
      };

      const squareElFromPoint = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el && el.closest ? el.closest('[data-stu-sq]') : null;
      };

      const startDrag = (from, piece, x, y, pointerId) => {
        drag.active = true;
        drag.pointerId = pointerId;
        drag.from = from;
        clearDragHover();
        removeGhost();

        const ghost = document.createElement('div');
        ghost.className = 'tf-drag-ghost';
        const src = piece ? pieceImageSrc(piece) : '';
        ghost.innerHTML = src ? `<img alt="" src="${escapeHtml(src)}">` : '';
        document.body.appendChild(ghost);
        drag.ghostEl = ghost;
        setGhostPos(x, y);

        const boardHost = modal.querySelector('#tfStuRunnerBoard');
        boardHost?.classList?.add('is-dragging');
      };

      const endDrag = () => {
        drag.active = false;
        drag.pointerId = null;
        drag.from = null;
        drag.piece = '';
        drag.startX = 0;
        drag.startY = 0;
        clearDragHover();
        removeGhost();
        const boardHost = modal.querySelector('#tfStuRunnerBoard');
        boardHost?.classList?.remove('is-dragging');
      };

      modal.addEventListener('pointerdown', (ev) => {
        if (!(ev.target instanceof Element)) return;
        const sq = ev.target.closest('[data-stu-sq]');
        if (!sq) return;
        if (ui.student.runner.busy) return;
        const from = String(sq.getAttribute('data-stu-sq') || '').trim();
        if (!from) return;
        const rc = coordToRc(from);
        const piece = rc ? (ui.student.runner.board?.[rc.r]?.[rc.c] || '') : '';
        if (!piece) return; // only drag if there's a piece

        // Don't immediately start drag. On iPad, immediate preventDefault/startDrag often breaks,
        // and it also blocks tap-to-move. Instead, start dragging only after a small movement threshold.
        drag.active = false;
        drag.pointerId = ev.pointerId;
        drag.from = from;
        drag.piece = piece;
        drag.startX = ev.clientX;
        drag.startY = ev.clientY;
        clearDragHover();
        removeGhost();
        try { sq.setPointerCapture?.(ev.pointerId); } catch {}
      });

      modal.addEventListener('pointermove', (ev) => {
        if (drag.pointerId !== ev.pointerId) return;
        if (!drag.from) return;

        // If not dragging yet, check threshold and start drag.
        if (!drag.active) {
          const dx = ev.clientX - drag.startX;
          const dy = ev.clientY - drag.startY;
          if ((dx * dx + dy * dy) < (9 * 9)) return; // ~9px threshold
          ignoreClickUntil = Date.now() + 400;
          startDrag(drag.from, drag.piece, ev.clientX, ev.clientY, ev.pointerId);
          ui.student.runner.selectedFrom = drag.from;
          renderRunner(); // hide source piece immediately
        }

        setGhostPos(ev.clientX, ev.clientY);

        const el = squareElFromPoint(ev.clientX, ev.clientY);
        if (el !== drag.hoverEl) {
          clearDragHover();
          if (el) {
            el.classList.add('is-drop-target');
            drag.hoverEl = el;
          }
        }
      });

      modal.addEventListener('pointerup', (ev) => {
        if (drag.pointerId !== ev.pointerId) return;
        // If we never crossed the threshold, this was a tap; let the normal click handler handle tap-to-move.
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
        ui.student.runner.selectedFrom = null;
        if (!from || !to || from === to) return renderRunner();
        applyStudentMove(from, to);
      });

      modal.addEventListener('pointercancel', (ev) => {
        if (drag.pointerId !== ev.pointerId) return;
        if (drag.active) {
          endDrag();
          ui.student.runner.selectedFrom = null;
          renderRunner();
          return;
        }
        // pending tap - just clear pending state
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
        if (t.closest('[data-stu-runner-close]')) return close();
        if (t.closest('[data-stu-feedback-next]')) {
          // same as right arrow (next puzzle)
          (async () => {
            const total = Math.max(0, Number(ui.student.total || 0));
            if (!total) return;
            const cur = Math.max(0, Math.min(total - 1, Math.trunc(Number(ui.student.runner?.absIndex || 0))));
            const nextAbs = await findNextTargetAbsIndex(cur);
            if (nextAbs == null) {
              setMsg('ok', 'No more incomplete puzzles.');
              return renderRunner();
            }
            const ok = await resetRunnerToAbsIndex(nextAbs);
            if (!ok) return;
            renderRunner();
          })();
          return;
        }
        if (t.closest('[data-stu-feedback-tryagain]')) {
          // Allow practicing again on a completed puzzle: hide completed overlay/badge and restart attempt.
          (async () => {
            try {
              if (ui.student.runner.busy) return;
              const pz = currentPuzzle();
              if (!pz) return;
              ui.student.tryAgainByPuzzleId[String(pz.id)] = true;
              const total = Math.max(0, Number(ui.student.total || 0));
              if (!total) return;
              const cur = Math.max(0, Math.min(total - 1, Math.trunc(Number(ui.student.runner?.absIndex || 0))));
              const ok = await resetRunnerToAbsIndex(cur);
              if (!ok) return;
              renderRunner();
            } catch (e) {
              setMsg('err', e?.message || String(e));
              renderRunner();
            }
          })();
          return;
        }
        if (t.closest('[data-stu-feedback-redo]')) {
          // same as Redo button (restart current puzzle)
          (async () => {
            try {
              if (ui.student.runner.busy) return;
              const total = Math.max(0, Number(ui.student.total || 0));
              if (!total) return;
              const cur = Math.max(0, Math.min(total - 1, Math.trunc(Number(ui.student.runner?.absIndex || 0))));
              const ok = await resetRunnerToAbsIndex(cur);
              if (!ok) return;
              renderRunner();
            } catch (e) {
              setMsg('err', e?.message || String(e));
              renderRunner();
            }
          })();
          return;
        }
        if (t.closest('[data-stu-prev]')) {
          (async () => {
            const total = Math.max(0, Number(ui.student.total || 0));
            if (!total) return;
            const cur = Math.max(0, Math.min(total - 1, Math.trunc(Number(ui.student.runner?.absIndex || 0))));
            const ok = await resetRunnerToAbsIndex(cur - 1);
            if (!ok) return;
            renderRunner();
          })();
          return;
        }
        if (t.closest('[data-stu-next]')) {
          // Next: jump to the next not-completed / incorrect puzzle (auto-loads next pages).
          (async () => {
            const total = Math.max(0, Number(ui.student.total || 0));
            if (!total) return;
            const cur = Math.max(0, Math.min(total - 1, Math.trunc(Number(ui.student.runner?.absIndex || 0))));
            const nextAbs = await findNextTargetAbsIndex(cur);
            if (nextAbs == null) {
              setMsg('ok', 'No more incomplete puzzles.');
              return renderRunner();
            }
            const ok = await resetRunnerToAbsIndex(nextAbs);
            if (!ok) return;
            renderRunner();
          })();
          return;
        }
        if (t.closest('[data-stu-undo]')) {
          // Redo: restart this puzzle attempt (reset to start FEN, clear moves/history/verdict)
          (async () => {
            try {
              if (ui.student.runner.busy) return;
              const total = Math.max(0, Number(ui.student.total || 0));
              if (!total) return;
              const cur = Math.max(0, Math.min(total - 1, Math.trunc(Number(ui.student.runner?.absIndex || 0))));
              const ok = await resetRunnerToAbsIndex(cur);
              if (!ok) return;
              renderRunner();
            } catch (e) {
              setMsg('err', e?.message || String(e));
              renderRunner();
            }
          })();
          return;
        }
        const sq = t.closest('[data-stu-sq]');
        if (sq) {
          const coord = String(sq.getAttribute('data-stu-sq') || '').trim();
          if (!coord) return;
          if (!ui.student.runner.selectedFrom) {
            ui.student.runner.selectedFrom = coord;
            return renderRunner();
          }
          const from = ui.student.runner.selectedFrom;
          const to = coord;
          ui.student.runner.selectedFrom = null;
          return applyStudentMove(from, to);
        }
      });

      renderRunner();
    }

    // Teacher Practice runner: solve puzzles locally (no completion tracking), powered by teacherApplyMove.
    async function openTeacherRunnerModal(startAbsIndex = 0) {
      const all = Array.isArray(ui.teacher.puzzlesAll) ? ui.teacher.puzzlesAll : [];
      const total = all.length;
      if (!total) return;

      const clampAbs = (n) => Math.max(0, Math.min(total - 1, Math.trunc(Number(n || 0))));
      const loadAbs = (abs) => {
        const pz = all[abs];
        if (!pz) return false;
        const startFen = String(pz?.fen || '').trim();
        const startBoard = parseFenToBoard(startFen);
        const startSide = fenSideToMove(startFen);
        ui.teacher.runner = {
          absIndex: abs,
          movesUci: [],
          movesSan: [],
          selectedFrom: null,
          lastVerdict: null, // 'correct' | 'incorrect' | null
          solved: false, // teacher-only (UI)
          startFen,
          fen: startFen,
          board: startBoard || Array.from({ length: 8 }, () => Array(8).fill('')),
          side: startSide,
          history: [],
          lineIdx: null,
          lineUci: null,
          lineSan: null,
          busy: false
        };
        ui.teacher.runner.playerSide = startSide;
        ui.teacher.runner.orientation = (startSide === 'b') ? 'black' : 'white';
        return true;
      };

      const abs0 = clampAbs(startAbsIndex);
      if (!loadAbs(abs0)) return;

      const modal = document.createElement('div');
      modal.className = 'vcp-modal-backdrop';
      modal.innerHTML = `
        <div class="vcp-modal tf-practice-modal" role="dialog" aria-modal="true" aria-label="Practice" style="width: calc(100vw - 40px); max-width: 1100px; height: calc(100vh - 24px); max-height: 96vh;">
          <div class="vcp-modal-header">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%;">
              <div>
                <div style="font-weight:900;">Practice</div>
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                  <div class="tf-muted" id="tfTeaRunnerMeta"></div>
                  <div id="tfTeaRunnerMetaBadge" class="tf-stu-meta-badge" style="display:none;"></div>
                </div>
              </div>
              <button type="button" class="btn btn-secondary" data-tea-runner-close="1">Close</button>
            </div>
          </div>
          <div class="vcp-modal-body">
            <div class="tf-practice-runner-grid">
              <div class="tf-practice-spacer">
                <div class="tf-practice-spacer-msg" style="display:none;"></div>
              </div>
              <div class="tf-practice-board-wrap">
                <div id="tfTeaRunnerFeedback" class="tf-stu-feedback" style="display:none;"></div>
                <div id="tfTeaRunnerBoard" class="tf-board" style="width:100%; aspect-ratio:1/1;"></div>
              </div>
              <div class="tf-stu-right">
                <div class="tf-stu-toprow">
                  <div class="tf-section-title" id="tfTeaRunnerTurnLabel" style="margin:0;"></div>
                </div>
                <div id="tfTeaRunnerMoves" class="tf-stu-moves"></div>
                <div id="tfTeaRunnerMsg" class="tf-builder-msg tf-stu-msg" style="display:none;"></div>
                <div class="tf-stu-actions">
                  <div class="tf-stu-actions-left">
                    <button type="button" class="btn btn-secondary" data-tea-undo="1" aria-label="Redo">↺</button>
                    <div class="tf-stu-nav" aria-label="Puzzle navigation">
                      <button type="button" class="btn btn-secondary" data-tea-prev="1" title="Previous puzzle">←</button>
                      <button type="button" class="btn btn-secondary" data-tea-next="1" title="Next puzzle">→</button>
                    </div>
                    <button type="button" class="btn btn-primary" data-tea-submit="1">Submit</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const close = () => { try { document.body.removeChild(modal); } catch {} };
      const setMsg = (type, text) => {
        const el = modal.querySelector('#tfTeaRunnerMsg');
        if (!el) return;
        el.style.display = 'block';
        el.classList.remove('ok', 'err');
        if (type === 'ok') el.classList.add('ok');
        if (type === 'err') el.classList.add('err');
        el.textContent = String(text || '');
      };
      const clearMsg = () => {
        const el = modal.querySelector('#tfTeaRunnerMsg');
        if (!el) return;
        el.style.display = 'none';
        el.textContent = '';
        el.classList.remove('ok', 'err');
      };

      function currentPuzzle() {
        const abs = clampAbs(ui.teacher.runner?.absIndex);
        return all[abs] || null;
      }

      function renderBoardInteractive() {
        const host = modal.querySelector('#tfTeaRunnerBoard');
        if (!host) return;
        const b = ui.teacher.runner.board;
        if (!b) { host.innerHTML = ''; return; }
        const sqs = [];
        for (let dr = 0; dr < 8; dr++) {
          for (let dc = 0; dc < 8; dc++) {
            const { r, c } = displayToBoardRc(dr, dc, ui.teacher.runner.orientation);
            const isDark = (dr + dc) % 2 === 1;
            const coord = rcToCoord(r, c);
            const piece = (drag?.active && drag?.from === coord) ? '' : (b[r][c] || '');
            const src = piece ? pieceImageSrc(piece) : '';
            const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
            const sel = ui.teacher.runner.selectedFrom === coord ? ' is-selected' : '';
            sqs.push(
              `<button type="button" class="tf-sq tf-sq-btn ${isDark ? 'dark' : 'light'}${sel}" data-tea-sq="${escapeHtml(coord)}">${img}</button>`
            );
          }
        }
        host.innerHTML = sqs.join('');
      }

      function chooseAcceptedLineForFirstMove(pz, firstUci) {
        const sol = pz?.solutions && typeof pz.solutions === 'object' ? pz.solutions : {};
        const lines = Array.isArray(sol.acceptedLines) ? sol.acceptedLines : (Array.isArray(sol.lines) ? sol.lines : []);
        const uci = String(firstUci || '').trim().toLowerCase();
        for (let i = 0; i < lines.length; i++) {
          const pvUci = Array.isArray(lines[i]?.pvUci) ? lines[i].pvUci : null;
          if (!pvUci || !pvUci.length) continue;
          if (String(pvUci[0] || '').trim().toLowerCase() === uci) return { idx: i, line: lines[i] };
        }
        return null;
      }

      function uciAtPlyMatches(uciList, plyIndex, uci) {
        if (!Array.isArray(uciList)) return false;
        const want = String(uciList[plyIndex] || '').trim().toLowerCase();
        return want && want === String(uci || '').trim().toLowerCase();
      }

      function isSolvedNow() {
        const pz = currentPuzzle();
        if (!pz) return false;
        const lineUci = ui.teacher.runner.lineUci;
        if (!Array.isArray(lineUci) || !lineUci.length) return false;
        return ui.teacher.runner.movesUci.length >= lineUci.length;
      }

      function renderRunner() {
        clearMsg();
        const pz = currentPuzzle();
        if (!pz) return close();

        const abs = clampAbs(ui.teacher.runner?.absIndex);
        const meta = modal.querySelector('#tfTeaRunnerMeta');
        if (meta) meta.textContent = `Puzzle ${abs + 1} / ${total}`;

        const metaBadge = modal.querySelector('#tfTeaRunnerMetaBadge');
        if (metaBadge) {
          metaBadge.classList.remove('is-ok', 'is-err');
          if (ui.teacher.runner.lastVerdict === 'incorrect') {
            metaBadge.textContent = 'Incorrect';
            metaBadge.style.display = 'inline-flex';
            metaBadge.classList.add('is-err');
          } else if (ui.teacher.runner.lastVerdict === 'correct') {
            metaBadge.textContent = 'Correct';
            metaBadge.style.display = 'inline-flex';
            metaBadge.classList.add('is-ok');
          } else {
            metaBadge.style.display = 'none';
          }
        }

        const turnEl = modal.querySelector('#tfTeaRunnerTurnLabel');
        if (turnEl) {
          const side = ui.teacher.runner?.side;
          turnEl.textContent = (side === 'b') ? 'Black to move' : 'White to move';
        }

        const fb = modal.querySelector('#tfTeaRunnerFeedback');
        if (fb) {
          const verdict = ui.teacher.runner.lastVerdict;
          const solved = !!ui.teacher.runner.solved;
          const showCorrectDone = solved;
          const showIncorrect = verdict === 'incorrect';
          if (showCorrectDone || showIncorrect) {
            const isOk = showCorrectDone;
            const title = showCorrectDone ? 'Correct' : 'Incorrect';
            const hint = showCorrectDone ? 'Great job.' : 'Try again.';
            const btnHtml = showCorrectDone
              ? `<button type="button" class="btn btn-primary" data-tea-feedback-next="1">Next</button>`
              : `<button type="button" class="btn btn-secondary" data-tea-feedback-redo="1">Redo</button>`;
            fb.classList.toggle('is-ok', isOk);
            fb.classList.toggle('is-err', !isOk);
            fb.innerHTML = `
              <div class="tf-stu-feedback-box">
                <div class="tf-stu-feedback-title">${escapeHtml(title)}</div>
                <div class="tf-stu-feedback-sub">${escapeHtml(hint)}</div>
                <div class="tf-stu-feedback-actions">${btnHtml}</div>
              </div>
            `;
            fb.style.display = 'flex';
          } else {
            fb.style.display = 'none';
            fb.innerHTML = '';
            fb.classList.remove('is-ok', 'is-err');
          }
        }

        const movesEl = modal.querySelector('#tfTeaRunnerMoves');
        if (movesEl) {
          const html = formatMovesWithMoveNumbersHighlightedHtml(
            ui.teacher.runner.startFen || pz.fen,
            ui.teacher.runner.movesSan,
            ui.teacher.runner.movesSan.length ? (ui.teacher.runner.movesSan.length - 1) : -1
          );
          movesEl.innerHTML = html || escapeHtml(ui.teacher.runner.movesUci.join(' '));
        }

        renderBoardInteractive();
      }

      async function resetRunnerToAbsIndex(nextAbs) {
        const abs = clampAbs(nextAbs);
        return loadAbs(abs);
      }

      async function applyTeacherMove(from, to) {
        if (ui.teacher.runner.busy) return;
        const f = String(from || '').trim();
        const t = String(to || '').trim();
        if (!f || !t) return;
        if (f === t) return renderRunner();

        if (!isPseudoLegalMove(ui.teacher.runner.board, ui.teacher.runner.side, f, t)) {
          setMsg('err', 'Illegal move');
          return renderRunner();
        }

        ui.teacher.runner.busy = true;
        try {
          clearMsg();

          const fr0 = coordToRc(f);
          const tr0 = coordToRc(t);
          const beforePiece = (fr0 && ui.teacher.runner.board?.[fr0.r]?.[fr0.c]) ? ui.teacher.runner.board[fr0.r][fr0.c] : '';
          let promo = '';
          if (needsPawnPromotion(ui.teacher.runner.board, f, t)) {
            const picked = await openPromotionPicker(beforePiece || 'P');
            if (!picked) return; // cancelled
            promo = picked;
          }
          const uci = `${f}${t}${promo}`;

          ui.teacher.runner.history.push({
            fen: ui.teacher.runner.fen,
            board: cloneBoard(ui.teacher.runner.board),
            side: ui.teacher.runner.side,
            movesUciLen: ui.teacher.runner.movesUci.length,
            movesSanLen: ui.teacher.runner.movesSan.length
          });

          // Optimistic UI: immediately show the piece moved while backend validates.
          try {
            const fr = fr0 || coordToRc(f);
            const tr = tr0 || coordToRc(t);
            const b = ui.teacher.runner.board;
            if (fr && tr && b?.[fr.r]?.[fr.c]) {
              const piece = b[fr.r][fr.c];
              b[fr.r][fr.c] = '';
              b[tr.r][tr.c] = promo ? promotedPieceChar(piece, promo) : piece;
              renderRunner();
            }
          } catch {}

          const r = await teacherApplyMove(ui.teacher.runner.fen, uci);
          if (!r || !r.ok || !r.fenAfter) throw new Error('Illegal move');

          ui.teacher.runner.fen = String(r.fenAfter);
          ui.teacher.runner.board = parseFenToBoard(ui.teacher.runner.fen) || ui.teacher.runner.board;
          ui.teacher.runner.side = fenSideToMove(ui.teacher.runner.fen);
          ui.teacher.runner.movesUci.push(String(r.uci || uci));
          ui.teacher.runner.movesSan.push(String(r.san || uci));
          renderRunner();
        } catch (err) {
          const last = ui.teacher.runner.history.pop();
          if (last) {
            ui.teacher.runner.fen = String(last.fen || ui.teacher.runner.fen);
            ui.teacher.runner.board = cloneBoard(last.board) || ui.teacher.runner.board;
            ui.teacher.runner.side = last.side || ui.teacher.runner.side;
          }
          setMsg('err', err?.message || String(err));
          renderRunner();
        } finally {
          ui.teacher.runner.busy = false;
        }
      }

      async function submitMoveAndReply() {
        const pz = currentPuzzle();
        if (!pz) return;
        if (ui.teacher.runner.busy) return;
        const moves = ui.teacher.runner.movesUci.slice();
        if (!moves.length) return;

        const plyIndex = moves.length - 1;
        const teacherUci = moves[plyIndex];

        // Determine correctness vs PV accepted line (choose on first move).
        if (ui.teacher.runner.lineIdx == null) {
          const chosen = chooseAcceptedLineForFirstMove(pz, teacherUci);
          if (chosen) {
            ui.teacher.runner.lineIdx = chosen.idx;
            ui.teacher.runner.lineUci = Array.isArray(chosen.line?.pvUci) ? chosen.line.pvUci.map((x) => String(x || '').trim().toLowerCase()) : null;
            ui.teacher.runner.lineSan = Array.isArray(chosen.line?.pvSan) ? chosen.line.pvSan.map((x) => String(x || '').trim()) : null;
          }
        }

        const lineUci = ui.teacher.runner.lineUci;
        const lineSan = ui.teacher.runner.lineSan;
        const isCorrect = uciAtPlyMatches(lineUci, plyIndex, teacherUci);

        if (Array.isArray(lineSan) && isCorrect) {
          ui.teacher.runner.movesSan = lineSan.slice(0, moves.length);
        }

        ui.teacher.runner.busy = true;
        try {
          clearMsg();

          if (isCorrect && Array.isArray(lineUci) && plyIndex + 1 < lineUci.length) {
            // PV reply move (computer)
            const replyUci = lineUci[plyIndex + 1];
            const r0 = await teacherApplyMove(ui.teacher.runner.fen, replyUci);
            if (r0 && r0.ok && r0.fenAfter) {
              ui.teacher.runner.history.push({
                fen: ui.teacher.runner.fen,
                board: cloneBoard(ui.teacher.runner.board),
                side: ui.teacher.runner.side,
                movesUciLen: ui.teacher.runner.movesUci.length,
                movesSanLen: ui.teacher.runner.movesSan.length
              });
              ui.teacher.runner.fen = String(r0.fenAfter);
              ui.teacher.runner.board = parseFenToBoard(ui.teacher.runner.fen) || ui.teacher.runner.board;
              ui.teacher.runner.side = fenSideToMove(ui.teacher.runner.fen);
              ui.teacher.runner.movesUci.push(replyUci);
              if (Array.isArray(lineSan)) ui.teacher.runner.movesSan = lineSan.slice(0, ui.teacher.runner.movesUci.length);
              else ui.teacher.runner.movesSan.push(String(r0.san || replyUci));
            }
          } else if (!isCorrect) {
            // Engine reply on wrong move
            const fenNow = ui.teacher.runner.fen;
            const eng = await engineAnalyze(fenNow, { depth: getPracticeDepth(), pvPlies: 6, multipv: 1 });
            const bestUci = String(eng?.bestMove || eng?.lines?.[0]?.bestMove || eng?.lines?.[0]?.pvUci?.[0] || '').trim().toLowerCase();
            if (bestUci) {
              const r1 = await teacherApplyMove(ui.teacher.runner.fen, bestUci);
              if (r1 && r1.ok && r1.fenAfter) {
                ui.teacher.runner.history.push({
                  fen: ui.teacher.runner.fen,
                  board: cloneBoard(ui.teacher.runner.board),
                  side: ui.teacher.runner.side,
                  movesUciLen: ui.teacher.runner.movesUci.length,
                  movesSanLen: ui.teacher.runner.movesSan.length
                });
                ui.teacher.runner.fen = String(r1.fenAfter);
                ui.teacher.runner.board = parseFenToBoard(ui.teacher.runner.fen) || ui.teacher.runner.board;
                ui.teacher.runner.side = fenSideToMove(ui.teacher.runner.fen);
                ui.teacher.runner.movesUci.push(bestUci);
                const engSan0 = String(r1.san || (Array.isArray(eng?.lines?.[0]?.pvSan) ? (eng.lines[0].pvSan[0] || '') : '') || bestUci);
                ui.teacher.runner.movesSan = ui.teacher.runner.movesSan.concat([engSan0]);
              }
            }
          }

          if (isCorrect) {
            ui.teacher.runner.lastVerdict = 'correct';
            ui.teacher.runner.solved = isSolvedNow();
            setMsg('ok', ui.teacher.runner.solved ? 'Correct.' : 'Correct. Computer replied.');
          } else {
            ui.teacher.runner.lastVerdict = 'incorrect';
            ui.teacher.runner.solved = false;
            setMsg('err', 'Wrong. Engine replied.');
          }

          renderRunner();
        } catch (e) {
          setMsg('err', e?.message || String(e));
        } finally {
          ui.teacher.runner.busy = false;
        }
      }

      // Drag & drop support (pointer events)
      let ignoreClickUntil = 0;
      const drag = { active: false, pointerId: null, from: null, piece: '', startX: 0, startY: 0, hoverEl: null, ghostEl: null };
      const clearDragHover = () => { try { drag.hoverEl?.classList?.remove('is-drop-target'); } catch {} drag.hoverEl = null; };
      const removeGhost = () => { try { drag.ghostEl?.remove(); } catch {} drag.ghostEl = null; };
      const setGhostPos = (x, y) => {
        if (!drag.ghostEl) return;
        const size = 56;
        drag.ghostEl.style.transform = `translate(${Math.round(x - size / 2)}px, ${Math.round(y - size / 2)}px)`;
      };
      const coordFromPoint = (x, y) => {
        const el = document.elementFromPoint(x, y);
        const sq = el && el.closest ? el.closest('[data-tea-sq]') : null;
        const coord = sq ? String(sq.getAttribute('data-tea-sq') || '').trim() : '';
        return coord || null;
      };
      const squareElFromPoint = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el && el.closest ? el.closest('[data-tea-sq]') : null;
      };
      const startDrag = (from, piece, x, y, pointerId) => {
        drag.active = true;
        drag.pointerId = pointerId;
        drag.from = from;
        clearDragHover();
        removeGhost();
        const ghost = document.createElement('div');
        ghost.className = 'tf-drag-ghost';
        const src = piece ? pieceImageSrc(piece) : '';
        ghost.innerHTML = src ? `<img alt="" src="${escapeHtml(src)}">` : '';
        document.body.appendChild(ghost);
        drag.ghostEl = ghost;
        setGhostPos(x, y);
        const boardHost = modal.querySelector('#tfTeaRunnerBoard');
        boardHost?.classList?.add('is-dragging');
      };
      const endDrag = () => {
        drag.active = false;
        drag.pointerId = null;
        drag.from = null;
        drag.piece = '';
        drag.startX = 0;
        drag.startY = 0;
        clearDragHover();
        removeGhost();
        const boardHost = modal.querySelector('#tfTeaRunnerBoard');
        boardHost?.classList?.remove('is-dragging');
      };

      modal.addEventListener('pointerdown', (ev) => {
        if (!(ev.target instanceof Element)) return;
        const sq = ev.target.closest('[data-tea-sq]');
        if (!sq) return;
        if (ui.teacher.runner.busy) return;
        const from = String(sq.getAttribute('data-tea-sq') || '').trim();
        if (!from) return;
        const rc = coordToRc(from);
        const piece = rc ? (ui.teacher.runner.board?.[rc.r]?.[rc.c] || '') : '';
        if (!piece) return;

        // Start dragging only after a small movement threshold (better on iPad; keeps tap-to-move working).
        drag.active = false;
        drag.pointerId = ev.pointerId;
        drag.from = from;
        drag.piece = piece;
        drag.startX = ev.clientX;
        drag.startY = ev.clientY;
        clearDragHover();
        removeGhost();
        try { sq.setPointerCapture?.(ev.pointerId); } catch {}
      });

      modal.addEventListener('pointermove', (ev) => {
        if (drag.pointerId !== ev.pointerId) return;
        if (!drag.from) return;

        if (!drag.active) {
          const dx = ev.clientX - drag.startX;
          const dy = ev.clientY - drag.startY;
          if ((dx * dx + dy * dy) < (9 * 9)) return;
          ignoreClickUntil = Date.now() + 400;
          startDrag(drag.from, drag.piece, ev.clientX, ev.clientY, ev.pointerId);
          ui.teacher.runner.selectedFrom = drag.from;
          renderRunner();
        }

        setGhostPos(ev.clientX, ev.clientY);
        const el = squareElFromPoint(ev.clientX, ev.clientY);
        if (el !== drag.hoverEl) {
          clearDragHover();
          if (el) {
            el.classList.add('is-drop-target');
            drag.hoverEl = el;
          }
        }
      });

      modal.addEventListener('pointerup', (ev) => {
        if (drag.pointerId !== ev.pointerId) return;
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
            const ok = await resetRunnerToAbsIndex(cur + 1);
            if (!ok) return;
            renderRunner();
          })();
          return;
        }
        if (t.closest('[data-tea-feedback-redo]')) {
          (async () => {
            try {
              if (ui.teacher.runner.busy) return;
              const cur = clampAbs(ui.teacher.runner?.absIndex);
              const ok = await resetRunnerToAbsIndex(cur);
              if (!ok) return;
              renderRunner();
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
            const ok = await resetRunnerToAbsIndex(cur - 1);
            if (!ok) return;
            renderRunner();
          })();
          return;
        }
        if (t.closest('[data-tea-next]')) {
          (async () => {
            const cur = clampAbs(ui.teacher.runner?.absIndex);
            const ok = await resetRunnerToAbsIndex(cur + 1);
            if (!ok) return;
            renderRunner();
          })();
          return;
        }
        if (t.closest('[data-tea-undo]')) {
          (async () => {
            try {
              if (ui.teacher.runner.busy) return;
              const cur = clampAbs(ui.teacher.runner?.absIndex);
              const ok = await resetRunnerToAbsIndex(cur);
              if (!ok) return;
              renderRunner();
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
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/tree?bucket=${encodeURIComponent(b)}`, { method: 'GET' });
      return await tfJson(resp);
    }

    async function teacherShowCategories(bucket) {
      toastShow('loading', 'Loading...');
      try {
        ui.teacher.bucket = normalizeBucketKey(bucket);
        try { localStorage.setItem('tacticsFighterPracticeBucket', ui.teacher.bucket); } catch {}
        const data = await teacherFetchTree(ui.teacher.bucket);
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
            const sid = String(openPuzzleBtn.getAttribute('data-tf-subtopic') || '');
            const pid = String(openPuzzleBtn.getAttribute('data-tf-open-puzzle') || '');
            const puzzles = ui.puzzlesBySubtopic.get(sid) || [];
            const p = puzzles.find((x) => String(x?.id || '') === pid);
            if (!p) return;
            openPuzzleDetailModal({ subtopicId: sid, puzzle: p }).catch((e) => showBuilderMsg('err', e?.message || String(e)));
            return;
          }

          const addPuzzleBtn = t?.closest?.('[data-tf-add-puzzle]');
          if (addPuzzleBtn) {
            const sid = String(addPuzzleBtn.getAttribute('data-tf-add-puzzle') || '');
            if (!sid) return;
            openAddPuzzleModal(sid).catch((e) => showBuilderMsg('err', e?.message || String(e)));
            return;
          }
        });

        if (!ui.builderLoadedOnce) {
          builderRefresh();
        }
      }

      // Settings wire-up
      if (nm === 'settings') {
        (async () => {
          const input = document.getElementById('tfSettingDepthCap');
          const saveBtn = document.getElementById('tfSettingSaveBtn');
          const hint = document.getElementById('tfSettingHint');

          // Load latest settings from server (org-level)
          toastShow('loading', 'Loading...');
          await loadTfSettings();
          toastHide();

          if (input) input.value = String(getDepthCap());

          if (!isTeacher) {
            if (saveBtn) saveBtn.style.display = 'none';
            if (hint) hint.textContent = `Depth cap is managed by teachers. Current cap: ${getDepthCap()}.`;
            return;
          }

          if (hint) hint.textContent = `Current cap: ${getDepthCap()} (applies to Practice + Builder).`;
          saveBtn?.addEventListener('click', async () => {
            try {
              const next = Number(input?.value || getDepthCap()) || getDepthCap();
              toastShow('loading', 'Saving...');
              await saveTfSettings(next);
              toastHide();
              if (input) input.value = String(getDepthCap());
              if (hint) hint.textContent = `Saved. Current cap: ${getDepthCap()} (applies to Practice + Builder).`;
              toastShow('ok', 'Saved.', { autoHideMs: 1600 });
            } catch (e) {
              toastShow('err', e?.message || String(e));
              if (hint) hint.textContent = e?.message || String(e);
            }
          });
        })();
      }
      if (nm === 'practice' && isTeacher && ui.teacher.tree && ui.teacher.view !== 'bucket') {
        if (ui.teacher.view === 'categories') {
          setOut(renderTeacherCategories(ui.teacher.tree.categories || []));
        } else if (ui.teacher.view === 'topics') {
          const cat = teacherFindCategoryById(ui.teacher.categoryId);
          setOut(cat ? renderTeacherTopics(cat) : renderTeacherCategories(ui.teacher.tree.categories || []));
        } else if (ui.teacher.view === 'subtopics') {
          const cat = teacherFindCategoryById(ui.teacher.categoryId);
          const topic = teacherFindTopicById(cat, ui.teacher.topicId);
          setOut((cat && topic) ? renderTeacherSubtopics(cat, topic) : renderTeacherCategories(ui.teacher.tree.categories || []));
        } else if (ui.teacher.view === 'puzzles') {
          const cat = teacherFindCategoryById(ui.teacher.categoryId);
          const topic = teacherFindTopicById(cat, ui.teacher.topicId);
          const sub = teacherFindSubtopicById(topic, ui.teacher.subtopicId);
          setOut(renderTeacherPuzzles(sub?.name || 'Subtopic', ui.teacher.puzzlesAll, ui.teacher.page, ui.teacher.pageSize));
        }
      }
    };

    async function openPuzzleDetailModal({ subtopicId, puzzle }) {
      const fen = String(puzzle?.fen || '').trim();
      const host = document.createElement('div');
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="tfPuzzleDetailBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Puzzle detail" style="width: calc(100vw - 40px); max-width: 1400px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Puzzle #${escapeHtml(String(puzzle?.id || ''))}</div>
              <button id="tfPuzzleDetailClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div class="tf-modal-grid">
                <div>
                  <div class="tf-board" id="tfPuzzleDetailBoard" aria-label="Puzzle board"></div>
                  <div class="tf-field">
                    <label>FEN</label>
                    <textarea class="tf-textarea" rows="3" readonly>${escapeHtml(fen)}</textarea>
                  </div>
                </div>
                <div>
                  <div class="tf-section-title">Answers</div>
                  <div id="tfPuzzleDetailAnswers" class="tf-lines"></div>
                  <div id="tfPuzzleEditPanel" style="display:none; margin-top:12px; border:1px solid #e5e7eb; border-radius:14px; padding:12px; background:#f8fafc;">
                    <div style="font-weight:950; color:#111827; margin-bottom:8px;">Edit puzzle</div>
                    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                      <label class="tf-muted" style="font-weight:900;">PV plies</label>
                      <input id="tfPuzzleEditPvPlies" class="tf-select" type="number" min="1" max="32" step="1" value="8" style="width:120px;">
                      <button id="tfPuzzleEditRun" class="btn btn-primary" type="button">Run Engine</button>
                      <button id="tfPuzzleEditSave" class="btn btn-success" type="button" disabled>Save</button>
                      <button id="tfPuzzleEditCancel" class="btn btn-secondary" type="button">Cancel</button>
                    </div>
                    <div class="tf-field" style="margin-top:10px;">
                      <label for="tfPuzzleEditMessage">Puzzle message</label>
                      <textarea id="tfPuzzleEditMessage" class="tf-textarea" rows="3" placeholder="Tell students what to do for this puzzle..."></textarea>
                    </div>
                    <div id="tfPuzzleEditMsg" class="tf-muted" style="margin-top:10px;"></div>
                  </div>
                  <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px; flex-wrap:wrap;">
                    <button id="tfPuzzleEditBtn" class="btn btn-secondary" type="button">Edit</button>
                    <button id="tfPuzzleDeleteBtn" class="btn btn-danger" type="button">Delete</button>
                    <button id="tfPuzzleCloseBtn" class="btn btn-secondary" type="button">Close</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);

      const close = () => { try { host.remove(); } catch {} };
      host.querySelector('#tfPuzzleDetailClose')?.addEventListener('click', close);
      host.querySelector('#tfPuzzleCloseBtn')?.addEventListener('click', close);
      host.querySelector('#tfPuzzleDetailBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'tfPuzzleDetailBackdrop') close();
      });

      // Render board
      try {
        const b = parseFenToBoard(fen);
        const boardEl = host.querySelector('#tfPuzzleDetailBoard');
        if (boardEl) {
          const sqs = [];
          for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              const isDark = (r + c) % 2 === 1;
              const p = b && b[r] ? (b[r][c] || '') : '';
              const src = p ? pieceImageSrc(p) : '';
              const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
              sqs.push(`<div class="tf-sq ${isDark ? 'dark' : 'light'}">${img}</div>`);
            }
          }
          boardEl.innerHTML = sqs.join('');
        }
      } catch {}

      function renderAnswers() {
        const answersEl = host.querySelector('#tfPuzzleDetailAnswers');
        const sol = puzzle?.solutions && typeof puzzle.solutions === 'object' ? puzzle.solutions : null;
        const accepted = Array.isArray(sol?.acceptedLines) ? sol.acceptedLines : null;
        const lines = accepted && accepted.length ? accepted : (Array.isArray(sol?.lines) ? sol.lines : []);
        const html = lines.length ? lines.map((ln) => {
          const mp = String(ln?.multiPv || 1);
          const scoreObj = ln?.score || {};
          const score = (scoreObj && Object.prototype.hasOwnProperty.call(scoreObj, 'mate'))
            ? `mate ${Number(scoreObj.mate) || 0}`
            : `cp ${Number(scoreObj.cp) || 0}`;
          const pv = formatPvWithMoveNumbersHtml(fen, ln?.pvSan);
          const fallback = Array.isArray(ln?.pvUci) ? escapeHtml(ln.pvUci.join(' ')) : '';
          return `<div class="tf-line"><div class="tf-line-title">#${escapeHtml(mp)} · ${escapeHtml(score)}</div><div class="tf-line-meta">${pv || fallback}</div></div>`;
        }).join('') : `<div class="tf-muted">No answers saved.</div>`;
        if (answersEl) answersEl.innerHTML = html;
      }
      renderAnswers();

      // Edit puzzle: re-run engine to change PV plies and save solutions.
      const editPanel = host.querySelector('#tfPuzzleEditPanel');
      const editBtn = host.querySelector('#tfPuzzleEditBtn');
      const pvPliesInput = host.querySelector('#tfPuzzleEditPvPlies');
      const editRunBtn = host.querySelector('#tfPuzzleEditRun');
      const editSaveBtn = host.querySelector('#tfPuzzleEditSave');
      const editCancelBtn = host.querySelector('#tfPuzzleEditCancel');
      const editMsg = host.querySelector('#tfPuzzleEditMsg');
      const editMessageInput = host.querySelector('#tfPuzzleEditMessage');
      let lastEditEngine = null;
      const originalMessage = String(puzzle?.message || '').trim();

      const setEditMsg = (s) => { if (editMsg) editMsg.textContent = String(s || ''); };
      const openEdit = () => {
        if (editPanel) editPanel.style.display = 'block';
        if (pvPliesInput) pvPliesInput.value = String(Number(puzzle?.pvPlies || puzzle?.pv_plies || 8) || 8);
        if (editMessageInput) editMessageInput.value = String(puzzle?.message || '');
        if (editSaveBtn) editSaveBtn.disabled = true;
        lastEditEngine = null;
        setEditMsg('');
      };
      const closeEdit = () => {
        if (editPanel) editPanel.style.display = 'none';
        if (editSaveBtn) editSaveBtn.disabled = true;
        lastEditEngine = null;
        setEditMsg('');
      };

      editBtn?.addEventListener('click', openEdit);
      editCancelBtn?.addEventListener('click', closeEdit);

      editRunBtn?.addEventListener('click', async () => {
        try {
          const pvPlies = Math.max(1, Math.min(32, Number(pvPliesInput?.value || 8) || 8));
          setEditMsg('Running engine…');
          toastShow('loading', 'Running engine…');
          const r = await engineAnalyze({ fen, depth: getBuilderDepthDefault(), multipv: 1, pvPlies });
          const line0 = Array.isArray(r?.lines) ? r.lines[0] : null;
          if (!line0) throw new Error('Engine returned empty line');
          const solutions = {
            bestMove: r?.bestMove || line0?.bestMove || null,
            lines: [line0],
            acceptedMultiPv: ['1'],
            acceptedLines: [line0]
          };
          lastEditEngine = { pvPlies, solutions };
          if (editSaveBtn) editSaveBtn.disabled = false;
          toastHide();
          setEditMsg('Ready to save.');
        } catch (e) {
          toastShow('err', e?.message || String(e));
          setEditMsg(e?.message || String(e));
        } finally {
          // toastHide handled on success; keep error visible
        }
      });

      // Manual Input in Edit puzzle: same manual move-by-move interface as Add puzzles.
      const editManualBtn = (() => {
        try {
          const row = editPanel?.querySelector?.('div[style*="display:flex"]');
          if (!row) return null;
          const btn = document.createElement('button');
          btn.id = 'tfPuzzleEditManual';
          btn.className = 'btn btn-secondary';
          btn.type = 'button';
          btn.textContent = 'Manual Input';
          // Insert next to Run Engine (after PV plies input)
          row.insertBefore(btn, editRunBtn || null);
          return btn;
        } catch {
          return null;
        }
      })();

      editManualBtn?.addEventListener('click', async () => {
        try {
          const out = await openManualAnswerModal(fen);
          const pvUci = Array.isArray(out?.pvUci) ? out.pvUci : [];
          const pvSan = Array.isArray(out?.pvSan) ? out.pvSan : [];
          if (!pvUci.length) throw new Error('No moves');
          const line0 = {
            multiPv: 1,
            score: { cp: 0 },
            bestMove: pvUci[0],
            pvUci,
            pvSan
          };
          const solutions = {
            bestMove: pvUci[0],
            lines: [line0],
            acceptedMultiPv: ['manual'],
            acceptedLines: [line0]
          };
          lastEditEngine = { pvPlies: pvUci.length, solutions };
          updateEditSaveEnabled();
          setEditMsg('Manual answer is ready to save.');
        } catch (e) {
          toastShow('err', e?.message || String(e));
          setEditMsg(e?.message || String(e));
        }
      });

      const updateEditSaveEnabled = () => {
        const msgNow = String(editMessageInput?.value || '').trim();
        const msgChanged = msgNow !== originalMessage;
        const canSave = msgChanged || !!lastEditEngine?.solutions;
        if (editSaveBtn) editSaveBtn.disabled = !canSave;
      };
      editMessageInput?.addEventListener('input', updateEditSaveEnabled);

      editSaveBtn?.addEventListener('click', async () => {
        try {
          toastShow('loading', 'Saving…');
          const msgNow = String(editMessageInput?.value || '').trim();
          const payload = {};
          if (msgNow !== originalMessage) payload.message = msgNow;
          if (lastEditEngine?.solutions) {
            const pvPlies = Number(lastEditEngine.pvPlies || 8) || 8;
            payload.engineDepth = getBuilderDepthDefault();
            payload.multipv = 1;
            payload.pvPlies = pvPlies;
            payload.solutions = lastEditEngine.solutions;
          }
          const out = await builderUpdatePuzzle(puzzle?.id, payload);
          // update local puzzle object + rerender answers
          if (out?.puzzle?.message != null) puzzle.message = String(out.puzzle.message || '');
          if (out?.puzzle?.solutions) {
            puzzle.solutions = out?.puzzle?.solutions || (lastEditEngine?.solutions || puzzle.solutions);
            puzzle.pvPlies = Number(out?.puzzle?.pvPlies || puzzle.pvPlies || 8) || 8;
          }
          renderAnswers();
          // refresh puzzles list cache
          const data = await builderFetchPuzzles(subtopicId);
          ui.puzzlesBySubtopic.set(subtopicId, Array.isArray(data.puzzles) ? data.puzzles : []);
          ui.expanded.puzzlesLoaded.add(subtopicId);
          ui.expanded.subtopic.add(subtopicId);
          await builderRefresh();
          toastHide();
          closeEdit();
        } catch (e) {
          toastShow('err', e?.message || String(e));
          setEditMsg(e?.message || String(e));
        }
      });

      host.querySelector('#tfPuzzleDeleteBtn')?.addEventListener('click', async () => {
        const ok = confirm('Delete this puzzle?');
        if (!ok) return;
        await builderDeletePuzzle(puzzle?.id);
        // refresh puzzles in this subtopic
        const data = await builderFetchPuzzles(subtopicId);
        ui.puzzlesBySubtopic.set(subtopicId, Array.isArray(data.puzzles) ? data.puzzles : []);
        ui.expanded.puzzlesLoaded.add(subtopicId);
        ui.expanded.subtopic.add(subtopicId);
        // clamp page
        const per = 10;
        const total = ui.puzzlesBySubtopic.get(subtopicId).length;
        const maxPage = Math.max(0, Math.ceil(total / per) - 1);
        const cur = Number(ui.puzzlePageBySubtopic.get(subtopicId) || 0) || 0;
        ui.puzzlePageBySubtopic.set(subtopicId, Math.min(cur, maxPage));
        await builderRefresh();
        close();
      });
    }

    async function openAddPuzzleModal(subtopicId) {
      const roleNow = String(new URLSearchParams(window.location.search).get('role') || '');
      if (String(roleNow).toLowerCase() !== 'teacher') {
        alert('Add puzzles is available for teacher only.');
        return;
      }

      const host = document.createElement('div');
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="tfAddPuzzleBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Add puzzles" style="width: calc(100vw - 40px); max-width: 1600px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Add puzzles</div>
              <button id="tfAddPuzzleClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div class="tf-modal-grid">
                <div>
                  <div id="tfEditorBoard" class="tf-board" aria-label="Board editor"></div>
                  <div class="tf-field">
                    <label for="tfFenInput">FEN</label>
                    <textarea id="tfFenInput" class="tf-textarea" rows="3" placeholder="Paste FEN here..."></textarea>
                  </div>
                </div>

                <div>
                  <div class="tf-field">
                    <label>Pieces</label>
                    <div id="tfPalette" class="tf-piece-palette"></div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
                      <button id="tfClearSelection" class="btn btn-secondary" type="button">Clear selection</button>
                      <button id="tfClearBoard" class="btn btn-secondary" type="button">Clear board</button>
                      <button id="tfStartPos" class="btn btn-secondary" type="button">Start position</button>
                    </div>
                  </div>

                  <div class="tf-field">
                    <label>Side to move</label>
                    <select id="tfSideSelect" class="tf-select">
                      <option value="w">White to move</option>
                      <option value="b">Black to move</option>
                    </select>
                  </div>

                  <div class="tf-field">
                    <label for="tfPuzzleMessageInput">Puzzle message</label>
                    <textarea id="tfPuzzleMessageInput" class="tf-textarea" rows="3" placeholder="Tell students what to do for this puzzle..."></textarea>
                  </div>

                  <div class="tf-field">
                    <label>Engine Load</label>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:8px;">
                      <div>
                        <div class="tf-muted" style="font-weight:900;">MultiPV (N-best)</div>
                        <div class="tf-stepper">
                          <input id="tfMultiPv" type="number" min="1" max="10" value="1">
                          <div class="tf-stepper-arrows">
                            <button id="tfMultiPvUp" class="tf-arrow-btn" type="button" aria-label="Increase MultiPV">▲</button>
                            <button id="tfMultiPvDown" class="tf-arrow-btn" type="button" aria-label="Decrease MultiPV">▼</button>
                          </div>
                        </div>
                      </div>
                      <div>
                        <div class="tf-muted" style="font-weight:900;">PV plies</div>
                        <div class="tf-stepper">
                          <input id="tfPvPlies" type="number" min="1" max="32" value="8">
                          <div class="tf-stepper-arrows">
                            <button id="tfPvPliesUp" class="tf-arrow-btn" type="button" aria-label="Increase PV plies">▲</button>
                            <button id="tfPvPliesDown" class="tf-arrow-btn" type="button" aria-label="Decrease PV plies">▼</button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
                      <button id="tfEngineLoadBtn" class="btn btn-primary" type="button">Engine Load</button>
                      <button id="tfManualInputBtn" class="btn btn-secondary" type="button">Manual Input</button>
                      <button id="tfEngineClearBtn" class="btn btn-secondary" type="button">Clear Engine Load</button>
                      <button id="tfSavePuzzleBtn" class="btn btn-success" type="button" disabled>Confirm & Save</button>
                    </div>
                  </div>

                  <div id="tfEngineOut" class="tf-lines"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);

      const close = () => { try { host.remove(); } catch {} };
      host.querySelector('#tfAddPuzzleClose')?.addEventListener('click', close);
      host.querySelector('#tfAddPuzzleBackdrop')?.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'tfAddPuzzleBackdrop') close();
      });

      let board = parseFenToBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1') || Array.from({ length: 8 }, () => Array(8).fill(''));
      let side = 'w';
      let selectedPiece = '';
      let lastEngine = null;
      let manualLine = null; // { pvUci:[], pvSan:[], bestMove }

      const fenInput = host.querySelector('#tfFenInput');
      const sideSel = host.querySelector('#tfSideSelect');
      const boardEl = host.querySelector('#tfEditorBoard');
      const paletteEl = host.querySelector('#tfPalette');
      const engineOutEl = host.querySelector('#tfEngineOut');
      const saveBtn = host.querySelector('#tfSavePuzzleBtn');
      const puzzleMsgInput = host.querySelector('#tfPuzzleMessageInput');
      const selectedAnswerMultiPv = new Set();

      function formatPvWithMoveNumbers(fen, pvSan) {
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

      function renderBoard() {
        if (!boardEl) return;
        const sqs = [];
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const isDark = (r + c) % 2 === 1;
            const p = board[r][c] || '';
            const src = p ? pieceImageSrc(p) : '';
            const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
            sqs.push(`<div class="tf-sq ${isDark ? 'dark' : 'light'}" data-r="${r}" data-c="${c}" title="${escapeHtml(rcToCoord(r, c))}">${img}</div>`);
          }
        }
        boardEl.innerHTML = sqs.join('');
      }

      function syncFenText() {
        const fen = buildFenFromBoard(board, side);
        if (fenInput) fenInput.value = fen;
      }

      function applyFenText() {
        const fen = String(fenInput?.value || '').trim();
        const b = parseFenToBoard(fen);
        const parts = fen.split(/\s+/);
        const stm = parts[1] === 'b' ? 'b' : 'w';
        if (b) {
          board = b;
          side = stm;
          if (sideSel) sideSel.value = side;
          renderBoard();
        }
      }

      function renderPalette() {
        if (!paletteEl) return;
        const pieces = ['K','Q','R','B','N','P','k','q','r','b','n','p'];
        paletteEl.innerHTML = pieces.map((p) => {
          const src = pieceImageSrc(p);
          const inner = src
            ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">`
            : escapeHtml(PIECE_UNICODE[p] || p);
          return `<button type="button" class="tf-piece-btn ${selectedPiece === p ? 'is-active' : ''}" data-piece="${escapeHtml(p)}" aria-label="Piece ${escapeHtml(p)}">${inner}</button>`;
        }).join('');
      }

      function setEngineOut(html) { if (engineOutEl) engineOutEl.innerHTML = html; }

      function updateSaveEnabled() {
        if (!saveBtn) return;
        const hasEngine = !!(lastEngine && Array.isArray(lastEngine.lines) && lastEngine.lines.length);
        const hasPick = selectedAnswerMultiPv.size > 0;
        const hasManual = !!(manualLine && Array.isArray(manualLine.pvUci) && manualLine.pvUci.length);
        saveBtn.disabled = !((hasEngine && hasPick) || hasManual);
      }

      function renderEngineOutCombined(fen) {
        const blocks = [];
        if (manualLine && Array.isArray(manualLine.pvUci) && manualLine.pvUci.length) {
          const pv = formatPvWithMoveNumbers(fen, manualLine.pvSan);
          const fallback = Array.isArray(manualLine.pvUci) ? escapeHtml(manualLine.pvUci.join(' ')) : '';
          blocks.push(`
            <div class="tf-line" style="border-color: rgba(20,184,166,0.35);">
              <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
                <div class="tf-line-title">Manual answer</div>
                <button id="tfManualClearBtn" class="btn btn-secondary btn-small" type="button">Clear</button>
              </div>
              <div class="tf-line-meta">${pv || fallback}</div>
            </div>
          `);
        }
        if (lastEngine && Array.isArray(lastEngine.lines) && lastEngine.lines.length) {
          const lines = lastEngine.lines;
          blocks.push(lines.map((ln) => {
            const score = ln?.score?.mate != null ? `mate ${ln.score.mate}` : `cp ${ln?.score?.cp ?? 0}`;
            const pv = formatPvWithMoveNumbers(fen, ln.pvSan);
            const fallback = Array.isArray(ln.pvUci) ? escapeHtml(ln.pvUci.join(' ')) : '';
            const mp = String(ln.multiPv || 1);
            return `
              <div class="tf-line">
                <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
                  <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
                    <input type="checkbox" data-tf-answer="${escapeHtml(mp)}" style="width:18px; height:18px;">
                    <div class="tf-line-title">#${escapeHtml(mp)} · ${escapeHtml(score)}</div>
                  </label>
                </div>
                <div class="tf-line-meta">${pv || fallback}</div>
              </div>
            `;
          }).join(''));
        }
        setEngineOut(blocks.length ? blocks.join('') : '');

        // Bind manual clear if present
        host.querySelector('#tfManualClearBtn')?.addEventListener('click', () => {
          manualLine = null;
          renderEngineOutCombined(String(fenInput?.value || '').trim());
          updateSaveEnabled();
        });
      }

      async function openManualAnswerModal(startFen) {
        const fen0 = String(startFen || '').trim();
        if (!fen0) throw new Error('Missing FEN');
        // Validate fen first (basic)
        const b0 = parseFenToBoard(fen0);
        if (!b0) throw new Error('Invalid FEN');

        const host2 = document.createElement('div');
        host2.innerHTML = `
          <div class="vcp-modal-backdrop" id="tfManualBackdrop" role="presentation">
            <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Manual Input" style="width: calc(100vw - 40px); max-width: 1200px;">
              <div class="vcp-modal-header">
                <div class="vcp-modal-title">Manual Input</div>
                <button id="tfManualClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
              </div>
              <div class="vcp-modal-body">
                <div style="display:grid; grid-template-columns: 520px 1fr; gap:14px; align-items:start;">
                  <div>
                    <div id="tfManualBoard" class="tf-board" aria-label="Manual board"></div>
                    <div class="tf-muted" style="margin-top:10px;">Click a piece, then click the destination square.</div>
                  </div>
                  <div>
                    <div class="tf-section-title">Moves</div>
                    <div id="tfManualMoves" class="tf-lines" style="margin-top:8px;"></div>
                    <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
                      <button id="tfManualUndo" class="btn btn-secondary" type="button">Undo</button>
                      <button id="tfManualConfirm" class="btn btn-primary" type="button" disabled>Confirm</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
        root.appendChild(host2);

        const close2 = () => { try { host2.remove(); } catch {} };
        host2.querySelector('#tfManualClose')?.addEventListener('click', close2);
        host2.querySelector('#tfManualBackdrop')?.addEventListener('click', (e) => {
          if (e.target && e.target.id === 'tfManualBackdrop') close2();
        });

        let curFen = fen0;
        let curBoard = parseFenToBoard(curFen);
        let selected = '';
        const hist = []; // { fenBefore, uci, san }

        const boardEl2 = host2.querySelector('#tfManualBoard');
        const movesEl2 = host2.querySelector('#tfManualMoves');
        const confirmBtn2 = host2.querySelector('#tfManualConfirm');

        const renderBoard2 = () => {
          if (!boardEl2) return;
          const b = curBoard || parseFenToBoard(curFen);
          if (!b) return;
          const sqs = [];
          for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              const isDark = (r + c) % 2 === 1;
              const coord = rcToCoord(r, c);
              const p = b[r][c] || '';
              const src = p ? pieceImageSrc(p) : '';
              const img = src ? `<img class="tf-piece-img" alt="" src="${escapeHtml(src)}">` : '';
              const sel = (selected === coord) ? ' is-selected' : '';
              sqs.push(`<button type="button" class="tf-sq tf-sq-btn ${isDark ? 'dark' : 'light'}${sel}" data-man-sq="${escapeHtml(coord)}">${img}</button>`);
            }
          }
          boardEl2.innerHTML = sqs.join('');
        };

        const renderMoves2 = () => {
          const pvSan = hist.map((h) => String(h.san || '')).filter(Boolean);
          const pv = formatPvWithMoveNumbers(fen0, pvSan);
          if (movesEl2) movesEl2.innerHTML = pv ? `<div class="tf-line-meta">${pv}</div>` : `<div class="tf-muted">No moves yet.</div>`;
          if (confirmBtn2) confirmBtn2.disabled = hist.length === 0;
        };

        const tryPromotion = async (board, from, to) => {
          if (!needsPawnPromotion(board, from, to)) return '';
          const fr = coordToRc(from);
          const pawn = fr ? (board?.[fr.r]?.[fr.c] || '') : '';
          const picked = await openPromotionPicker(pawn || 'P');
          return picked || '';
        };

        renderBoard2();
        renderMoves2();

        boardEl2?.addEventListener('click', async (ev) => {
          const btn = ev.target && ev.target.closest ? ev.target.closest('[data-man-sq]') : null;
          if (!btn) return;
          const sq = String(btn.getAttribute('data-man-sq') || '').trim();
          if (!sq) return;
          if (!selected) {
            selected = sq;
            renderBoard2();
            return;
          }
          const from = selected;
          const to = sq;
          selected = '';
          renderBoard2();

          const promo = await tryPromotion(curBoard, from, to);
          const uci = `${from.toLowerCase()}${to.toLowerCase()}${promo}`;
          try {
            const out = await teacherApplyMove(curFen, uci);
            hist.push({ fenBefore: curFen, uci, san: out?.san || '' });
            curFen = String(out?.fenAfter || out?.fen || curFen);
            curBoard = parseFenToBoard(curFen);
            renderBoard2();
            renderMoves2();
          } catch (e) {
            toastShow('err', e?.message || String(e));
          }
        });

        host2.querySelector('#tfManualUndo')?.addEventListener('click', () => {
          const last = hist.pop();
          if (!last) return;
          curFen = String(last.fenBefore || fen0);
          curBoard = parseFenToBoard(curFen);
          selected = '';
          renderBoard2();
          renderMoves2();
        });

        return await new Promise((resolve, reject) => {
          host2.querySelector('#tfManualConfirm')?.addEventListener('click', () => {
            try {
              const pvUci = hist.map((h) => String(h.uci || '').trim().toLowerCase()).filter(Boolean);
              const pvSan = hist.map((h) => String(h.san || '')).filter(Boolean);
              if (!pvUci.length) throw new Error('No moves');
              close2();
              resolve({ pvUci, pvSan });
            } catch (e) {
              reject(e);
            }
          });
        });
      }

      // init editor
      syncFenText();
      renderBoard();
      renderPalette();
      updateSaveEnabled();

      boardEl?.addEventListener('click', (e) => {
        const sq = e.target && e.target.closest ? e.target.closest('.tf-sq') : null;
        if (!sq) return;
        const r = Number(sq.getAttribute('data-r'));
        const c = Number(sq.getAttribute('data-c'));
        if (!Number.isFinite(r) || !Number.isFinite(c)) return;
        board[r][c] = selectedPiece ? selectedPiece : '';
        renderBoard();
        syncFenText();
      });

      paletteEl?.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('.tf-piece-btn') : null;
        if (!btn) return;
        selectedPiece = String(btn.getAttribute('data-piece') || '');
        renderPalette();
      });

      host.querySelector('#tfClearSelection')?.addEventListener('click', () => {
        selectedPiece = '';
        renderPalette();
      });
      host.querySelector('#tfClearBoard')?.addEventListener('click', () => {
        board = Array.from({ length: 8 }, () => Array(8).fill(''));
        renderBoard();
        syncFenText();
      });
      host.querySelector('#tfStartPos')?.addEventListener('click', () => {
        const b = parseFenToBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1');
        if (b) board = b;
        side = 'w';
        if (sideSel) sideSel.value = 'w';
        renderBoard();
        syncFenText();
      });

      sideSel?.addEventListener('change', () => {
        side = String(sideSel.value || 'w') === 'b' ? 'b' : 'w';
        syncFenText();
      });

      fenInput?.addEventListener('blur', applyFenText);

      const multiPvEl = host.querySelector('#tfMultiPv');
      const pvPliesEl = host.querySelector('#tfPvPlies');
      host.querySelector('#tfMultiPvUp')?.addEventListener('click', () => {
        if (!multiPvEl) return;
        const v = Number(multiPvEl.value || 1) || 1;
        multiPvEl.value = String(Math.max(1, Math.min(10, v + 1)));
      });
      host.querySelector('#tfMultiPvDown')?.addEventListener('click', () => {
        if (!multiPvEl) return;
        const v = Number(multiPvEl.value || 1) || 1;
        multiPvEl.value = String(Math.max(1, Math.min(10, v - 1)));
      });
      host.querySelector('#tfPvPliesUp')?.addEventListener('click', () => {
        if (!pvPliesEl) return;
        const v = Number(pvPliesEl.value || 8) || 8;
        pvPliesEl.value = String(Math.max(1, Math.min(32, v + 1)));
      });
      host.querySelector('#tfPvPliesDown')?.addEventListener('click', () => {
        if (!pvPliesEl) return;
        const v = Number(pvPliesEl.value || 8) || 8;
        pvPliesEl.value = String(Math.max(1, Math.min(32, v - 1)));
      });

      host.querySelector('#tfEngineLoadBtn')?.addEventListener('click', async () => {
        try {
          applyFenText();
          const fen = String(fenInput?.value || '').trim();
          const multipv = Math.max(1, Math.min(10, Number(multiPvEl?.value || 1) || 1));
          const pvPlies = Math.max(1, Math.min(32, Number(pvPliesEl?.value || 8) || 8));
          selectedAnswerMultiPv.clear();
          updateSaveEnabled();
          setEngineOut(`<div class="tf-muted">Loading engine...</div>`);
          const data = await engineAnalyze({ fen, multipv, pvPlies });
          lastEngine = data;
          renderEngineOutCombined(fen);
          updateSaveEnabled();
        } catch (e) {
          setEngineOut(`<div class="tf-builder-msg err" style="display:block;">${escapeHtml(e?.message || String(e))}</div>`);
          selectedAnswerMultiPv.clear();
          updateSaveEnabled();
        }
      });

      host.querySelector('#tfManualInputBtn')?.addEventListener('click', async () => {
        try {
          applyFenText();
          const fen = String(fenInput?.value || '').trim();
          const out = await openManualAnswerModal(fen);
          const pvUci = Array.isArray(out?.pvUci) ? out.pvUci : [];
          const pvSan = Array.isArray(out?.pvSan) ? out.pvSan : [];
          if (!pvUci.length) throw new Error('No moves');
          manualLine = {
            multiPv: 1,
            score: { cp: 0 },
            bestMove: pvUci[0],
            pvUci,
            pvSan
          };
          renderEngineOutCombined(fen);
          updateSaveEnabled();
        } catch (e) {
          toastShow('err', e?.message || String(e));
        }
      });

      host.querySelector('#tfEngineClearBtn')?.addEventListener('click', () => {
        lastEngine = null;
        selectedAnswerMultiPv.clear();
        renderEngineOutCombined(String(fenInput?.value || '').trim());
        updateSaveEnabled();
      });

      engineOutEl?.addEventListener('change', (e) => {
        const cb = e.target && e.target.closest ? e.target.closest('input[type="checkbox"][data-tf-answer]') : null;
        if (!cb) return;
        const mp = String(cb.getAttribute('data-tf-answer') || '').trim();
        if (!mp) return;
        if (cb.checked) selectedAnswerMultiPv.add(mp);
        else selectedAnswerMultiPv.delete(mp);
        updateSaveEnabled();
      });

      host.querySelector('#tfSavePuzzleBtn')?.addEventListener('click', async () => {
        try {
          applyFenText();
          const fen = String(fenInput?.value || '').trim();
          if (!fen) throw new Error('Missing FEN');
          const bucket = getBuilderBucket();
          const message = String(puzzleMsgInput?.value || '').trim();

          const acceptedLines = [];
          const acceptedMultiPv = [];
          if (manualLine && Array.isArray(manualLine.pvUci) && manualLine.pvUci.length) {
            acceptedLines.push(manualLine);
            acceptedMultiPv.push('manual');
          }

          if (lastEngine && Array.isArray(lastEngine.lines) && lastEngine.lines.length && selectedAnswerMultiPv.size) {
            const keep = new Set(Array.from(selectedAnswerMultiPv));
            const allLines = Array.isArray(lastEngine?.lines) ? lastEngine.lines : [];
            const selectedLines = allLines.filter((ln) => keep.has(String(ln?.multiPv || '1')));
            for (const ln of selectedLines) acceptedLines.push(ln);
            for (const k of keep) acceptedMultiPv.push(String(k));
          }

          if (!acceptedLines.length) throw new Error('Please add at least 1 manual answer or select at least 1 engine line');

          const solutions = {
            ...(lastEngine && typeof lastEngine === 'object' ? lastEngine : {}),
            acceptedMultiPv,
            acceptedLines,
            // Best move for quick display
            bestMove: (acceptedLines[0] && acceptedLines[0].bestMove) ? acceptedLines[0].bestMove : (lastEngine?.bestMove || null)
          };

          const payload = {
            fen,
            engineDepth: getBuilderDepthDefault(),
            multipv: Number(multiPvEl?.value || 1) || 1,
            pvPlies: Number(pvPliesEl?.value || 8) || 8,
            message,
            solutions,
            meta: { bucket }
          };
          await builderCreatePuzzle(subtopicId, payload);
          const data = await builderFetchPuzzles(subtopicId);
          ui.puzzlesBySubtopic.set(subtopicId, Array.isArray(data.puzzles) ? data.puzzles : []);
          ui.expanded.puzzlesLoaded.add(subtopicId);
          ui.expanded.subtopic.add(subtopicId);
          await builderRefresh();
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
        return void studentChangePuzzlePage(dir);
      }

      const startBtn = target.closest('[data-stu-start]');
      if (startBtn) {
        (async () => {
          // Start: skip completed, jump to the earliest not-completed (or previously incorrect) puzzle.
          const abs = await findFirstTargetAbsIndex();
          ui.student.runner = { absIndex: abs };
          await openStudentRunnerModal();
        })();
        return;
      }

      const openBtn = target.closest('[data-stu-open-puzzle]');
      if (openBtn) {
        const idx = Number(openBtn.getAttribute('data-stu-idx') || 0);
        const ps = Math.max(1, Number(ui.student.pageSize || 10));
        const abs = (Math.max(1, Number(ui.student.page || 1)) - 1) * ps + (Number.isFinite(idx) ? idx : 0);
        ui.student.runner = { absIndex: abs };
        (async () => { await openStudentRunnerModal(); })();
        return;
      }
    });

    // Initial render
    activateMode(mode);
  };

})();


