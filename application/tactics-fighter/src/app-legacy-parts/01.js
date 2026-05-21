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

    const {
      loadTfSettings,
      saveTfSettings,
      getDepthCap,
      getPracticeDepth,
      getBuilderDepthDefault
    } = createTfSettingsHandlers(
      { apiRequest, tfJson },
      { ui, isTeacher, publicStudentId, publicStudentPassword }
    );

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
