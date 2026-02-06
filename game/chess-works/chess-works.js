// Chess Works main (teacher + student)
(function () {
  "use strict";
  const CW = window.__ChessWorksCore;
  if (!CW) {
    console.error("[chess-works] Missing core.js (window.__ChessWorksCore).");
    return;
  }

  const {
    escapeHtml,
    getUrlMode,
    setUrlMode,
    normalizeMode,
    getPublicStudentPassword,
    apiRequest,
    cwJson,
    renderShell
  } = CW;

  const PIECE_TYPES = ["K", "Q", "R", "B", "N", "P"];
  const PIECE_NAME = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn" };

  function isPieceType(t) {
    return PIECE_TYPES.includes(String(t || "").toUpperCase());
  }

  function pieceImgSrc(color, type) {
    const c = String(color || "").toLowerCase() === "b" ? "black" : "white";
    const t = String(type || "").toUpperCase();
    const nm = PIECE_NAME[t] || "";
    if (!nm) return "";
    return `/game/chess-works/pieces/${c}_${nm}.png`;
  }

  function setUrlParam(key, value) {
    try {
      const url = new URL(window.location.href);
      if (value == null || String(value).trim() === "") url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
      window.history.replaceState({}, "", url.toString());
    } catch {}
  }

  function getUrlParam(key) {
    try {
      const url = new URL(window.location.href);
      return String(url.searchParams.get(key) || "");
    } catch {}
    return "";
  }

  function inBounds(r, c, rows, cols) {
    return r >= 0 && c >= 0 && r < rows && c < cols;
  }

  function keyOf(rc) {
    return `${Number(rc.r)}:${Number(rc.c)}`;
  }

  function computeCellPx({ rows, cols, targetPx = 520, gapPx = 2, padPx = 2 }) {
    const r = Math.max(1, Number(rows) || 1);
    const c = Math.max(1, Number(cols) || 1);
    const availW = targetPx - (padPx * 2) - (gapPx * Math.max(0, c - 1));
    const availH = targetPx - (padPx * 2) - (gapPx * Math.max(0, r - 1));
    const cellW = Math.floor(availW / c);
    const cellH = Math.floor(availH / r);
    return Math.max(12, Math.min(cellW, cellH));
  }

  function normalizeItem(raw) {
    const it = raw && typeof raw === "object" ? raw : {};
    const boardEnabled = it.boardEnabled !== false;
    const rows = Math.max(1, Number(it?.board?.rows || 8) || 8);
    const cols = Math.max(1, Number(it?.board?.cols || 8) || 8);
    const pieces = Array.isArray(it.pieces)
      ? it.pieces
          .map((p) => ({
            color: String(p?.color || "w").toLowerCase() === "b" ? "b" : "w",
            type: String(p?.type || "").toUpperCase(),
            r: Number(p?.r),
            c: Number(p?.c)
          }))
          .filter((p) => isPieceType(p.type) && Number.isFinite(p.r) && Number.isFinite(p.c) && inBounds(p.r, p.c, rows, cols))
      : [];
    const turnRaw = String(it.turn || "").toLowerCase();
    const turn = turnRaw === "w" || turnRaw === "b" ? turnRaw : ""; // "" => N/A
    return {
      prompt: String(it.prompt || ""),
      boardEnabled,
      board: { rows, cols },
      pieces,
      turn,
      pvEnabled: !!it.pvEnabled,
      pv: String(it.pv || ""),
      textEnabled: !!it.textEnabled,
      text: String(it.text || "")
    };
  }

  function defaultItem() {
    return normalizeItem({
      prompt: "",
      boardEnabled: true,
      board: { rows: 8, cols: 8 },
      pieces: [],
      turn: "",
      pvEnabled: false,
      pv: "",
      textEnabled: false,
      text: ""
    });
  }

  function normalizeWork(raw) {
    const w = raw && typeof raw === "object" ? raw : {};
    const items = Array.isArray(w.items) ? w.items.map(normalizeItem) : [];
    return {
      id: String(w.id || ""),
      folderId: String(w.folderId || ""),
      title: String(w.title || ""),
      items: items.length ? items : [defaultItem()]
    };
  }

  function piecesByCell(pieces) {
    const m = new Map();
    for (const p of (Array.isArray(pieces) ? pieces : [])) m.set(`${Number(p.r)}:${Number(p.c)}`, p);
    return m;
  }

  function renderBoardHtml({ rows, cols, pieces, interactive = false }) {
    const cellPx = computeCellPx({ rows, cols, targetPx: 520, gapPx: 2, padPx: 2 });
    const colsCss = `repeat(${cols}, var(--cw-cell, ${cellPx}px))`;
    const m = piecesByCell(pieces);
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dark = (r + c) % 2 === 1;
        const key = `${r}:${c}`;
        const p = m.get(key) || null;
        const inner = p
          ? `<img src="${escapeHtml(pieceImgSrc(p.color, p.type))}" alt="${escapeHtml(p.color)} ${escapeHtml(p.type)}">`
          : "";
        const cls = ["cw-cell", dark ? "is-dark" : ""].filter(Boolean).join(" ");
        if (interactive) {
          cells.push(`<button type="button" class="${cls}" data-cw-cell="${r}:${c}" aria-label="Cell ${r + 1},${c + 1}">${inner}</button>`);
        } else {
          cells.push(`<div class="${cls}" aria-label="Cell ${r + 1},${c + 1}" style="cursor:default;">${inner}</div>`);
        }
      }
    }
    return `
      <div class="cw-board-wrap-520">
        <div class="cw-board" style="--cw-cell:${cellPx}px; --cw-gap:2px; --cw-pad:2px; grid-template-columns:${colsCss};">
          ${cells.join("")}
        </div>
      </div>
    `;
  }

  // ===== FEN helpers =====
  function fenChar(p) {
    const t = String(p?.type || "").toUpperCase();
    const c = String(p?.color || "w").toLowerCase() === "b" ? "b" : "w";
    const ch = t === "N" ? "N" : t;
    return c === "b" ? ch.toLowerCase() : ch;
  }

  function buildFen8({ pieces, turn }) {
    const rows = 8, cols = 8;
    const m = piecesByCell(pieces);
    const parts = [];
    for (let r = 0; r < rows; r++) {
      let empty = 0;
      let s = "";
      for (let c = 0; c < cols; c++) {
        const p = m.get(`${r}:${c}`);
        if (!p) {
          empty += 1;
        } else {
          if (empty) { s += String(empty); empty = 0; }
          s += fenChar(p);
        }
      }
      if (empty) s += String(empty);
      parts.push(s || "8");
    }
    const placement = parts.join("/");
    const t = (turn === "w" || turn === "b") ? turn : "-";
    return `${placement} ${t} - - 0 1`;
  }

  function parseFen8(fen) {
    const txt = String(fen || "").trim();
    const [placement, turn] = txt.split(/\s+/);
    if (!placement) return null;
    const rows = placement.split("/");
    if (rows.length !== 8) return null;
    const pieces = [];
    for (let r = 0; r < 8; r++) {
      const row = rows[r];
      let c = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) {
          c += Number(ch);
          continue;
        }
        const isBlack = ch === ch.toLowerCase();
        const up = ch.toUpperCase();
        const type = up === "N" ? "N" : up;
        if (!isPieceType(type)) return null;
        if (c >= 8) return null;
        pieces.push({ color: isBlack ? "b" : "w", type, r, c });
        c += 1;
      }
      if (c !== 8) return null;
    }
    const t = String(turn || "").toLowerCase();
    return { rows: 8, cols: 8, turn: (t === "w" || t === "b") ? t : "", pieces };
  }

  function buildCwFen({ rows, cols, pieces, turn }) {
    const t = (turn === "w" || turn === "b") ? turn : "-";
    const enc = (Array.isArray(pieces) ? pieces : [])
      .map((p) => `${String(p.color || "w").toLowerCase() === "b" ? "b" : "w"}${String(p.type || "").toUpperCase()}@${Number(p.r) + 1},${Number(p.c) + 1}`)
      .join(";");
    return `CW:${rows}x${cols}:${t}:${enc}`;
  }

  function parseCwFen(txt) {
    const s = String(txt || "").trim();
    if (!s.startsWith("CW:")) return null;
    // CW:RxC:turn:piece;piece...
    const rest = s.slice(3);
    const parts = rest.split(":");
    if (parts.length < 3) return null;
    const size = parts[0] || "";
    const turnRaw = String(parts[1] || "").trim().toLowerCase();
    const piecesRaw = parts.slice(2).join(":");
    const [rs, cs] = size.split("x");
    const rows = Math.max(1, Number(rs) || 1);
    const cols = Math.max(1, Number(cs) || 1);
    const turn = (turnRaw === "w" || turnRaw === "b") ? turnRaw : "";
    const pieces = [];
    const items = piecesRaw ? piecesRaw.split(";").map((x) => x.trim()).filter(Boolean) : [];
    for (const it of items) {
      // wQ@1,1
      const [pc, pos] = it.split("@");
      if (!pc || !pos) continue;
      const color = String(pc[0] || "w").toLowerCase() === "b" ? "b" : "w";
      const type = String(pc.slice(1) || "").toUpperCase();
      if (!isPieceType(type)) continue;
      const [r1, c1] = pos.split(",").map((x) => Number(x));
      const r = Number(r1) - 1;
      const c = Number(c1) - 1;
      if (!Number.isFinite(r) || !Number.isFinite(c)) continue;
      if (!inBounds(r, c, rows, cols)) continue;
      pieces.push({ color, type, r, c });
    }
    return { rows, cols, turn, pieces };
  }

  function fenForItem(item) {
    const it = normalizeItem(item);
    if (!it.boardEnabled) return "";
    const rows = Number(it.board.rows), cols = Number(it.board.cols);
    if (rows === 8 && cols === 8) return buildFen8({ pieces: it.pieces, turn: it.turn });
    return buildCwFen({ rows, cols, pieces: it.pieces, turn: it.turn });
  }

  // ===== API wrappers =====
  async function tGet(path) {
    const resp = await apiRequest(path, { method: "GET" });
    return await cwJson(resp);
  }
  async function tPost(path, body) {
    const resp = await apiRequest(path, { method: "POST", body: JSON.stringify(body || {}) });
    return await cwJson(resp);
  }
  async function tPatch(path, body) {
    const resp = await apiRequest(path, { method: "PATCH", body: JSON.stringify(body || {}) });
    return await cwJson(resp);
  }
  async function tDelete(path) {
    const resp = await apiRequest(path, { method: "DELETE" });
    return await cwJson(resp);
  }

  function getPublicStudentIdFromPlayers() {
    try {
      const players = Array.isArray(window.chessWorksPlayers) ? window.chessWorksPlayers : [];
      return String(players?.[0]?.id || "").trim();
    } catch {}
    return "";
  }

  async function sGet(path) {
    const sid = getPublicStudentIdFromPlayers();
    const pwd = getPublicStudentPassword();
    const qp = new URLSearchParams();
    if (pwd) qp.set("password", pwd);
    const url = `${path}${path.includes("?") ? "&" : "?"}${qp.toString()}`;
    const resp = await apiRequest(url, { method: "GET" });
    return await cwJson(resp);
  }
  async function sPatch(path, body) {
    const sid = getPublicStudentIdFromPlayers();
    const pwd = getPublicStudentPassword();
    const qp = new URLSearchParams();
    if (pwd) qp.set("password", pwd);
    const url = `${path}${path.includes("?") ? "&" : "?"}${qp.toString()}`;
    const resp = await apiRequest(url, { method: "PATCH", body: JSON.stringify(body || {}) });
    return await cwJson(resp);
  }

  // ===== UI =====
  window.initChessWorks = async function initChessWorks() {
    const root = document.getElementById("chessWorksRoot");
    if (!root) return;

    const params = new URLSearchParams(window.location.search);
    const role = String(params.get("role") || "");
    const isTeacher = role.toLowerCase() === "teacher";
    const isStudent = !isTeacher;

    const ui = {
      mode: normalizeMode(getUrlMode() || "home", isTeacher),
      builder: {
        folderId: getUrlParam("folderId") || "all",
        folders: [],
        works: []
      },
      teacherWorks: {
        view: "list", // list | detail | do | students | review
        works: [],
        work: null,
        studentId: "",
        studentStatus: [],
        submission: null,
        review: null
      },
      studentWorks: {
        view: "list", // list | do
        works: [],
        work: null,
        submission: null,
        answers: { items: [] },
        idx: 0
      },
      history: {
        items: []
      },
      settings: {
        groups: [],
        students: []
      }
    };

    root.innerHTML = renderShell({ role, mode: ui.mode });

    let mainRenderToken = 0;
    const setMain = (html) => {
      const el = document.getElementById("cwMain");
      if (!el) return Promise.resolve();
      const token = ++mainRenderToken;
      el.classList.add("cw-fade", "is-out");
      return new Promise((resolve) => {
        setTimeout(() => {
          if (token !== mainRenderToken) return resolve();
          try { el.innerHTML = html; } catch {}
          requestAnimationFrame(() => {
            if (token !== mainRenderToken) return resolve();
            try { el.classList.remove("is-out"); } catch {}
            setTimeout(resolve, 260);
          });
        }, 120);
      });
    };

    const rerenderShell = () => {
      root.innerHTML = renderShell({ role, mode: ui.mode });
      bindNav();
    };

    // ===== Renderers =====
    function renderHome() {
      return `
        <div style="font-weight:1000; color:var(--cw-ink);">Chess Works</div>
        <div class="cw-muted" style="margin-top:8px; line-height:1.7;">
          Teacher creates works (board puzzles or text questions) and assigns them to specific students or groups.
        </div>
        <div style="display:flex; justify-content:flex-end; margin-top:14px;">
          <button type="button" class="cw-btn primary" data-cw-go-works="1">Start</button>
        </div>
      `;
    }

    function renderStudentWorksList() {
      return `
        <div class="cw-toolbar">
          <div class="cw-badge">Works</div>
          <button type="button" class="cw-btn" data-cw-refresh="1">Refresh</button>
        </div>
        <div class="cw-grid">
          ${(ui.studentWorks.works || []).map((w) => `
            <div class="cw-work-card" data-cw-open-work="${escapeHtml(String(w.id))}">
              <div class="cw-work-title">${escapeHtml(w.title || "(Untitled)")}</div>
              <div class="cw-work-sub">Click to start</div>
            </div>
          `).join("")}
        </div>
      `;
    }

    function renderStudentDoWork() {
      const w = ui.studentWorks.work;
      if (!w) return `<div class="cw-muted">Work not found.</div>`;
      const work = normalizeWork(w);
      const idx = Math.max(0, Math.min(work.items.length - 1, Number(ui.studentWorks.idx) || 0));
      const it = work.items[idx];
      const fen = fenForItem(it);
      const ans = (ui.studentWorks.answers?.items?.[idx]) || {};
      const pv = String(ans.pv || "");
      const text = String(ans.text || "");
      return `
        <div class="cw-toolbar">
          <button type="button" class="cw-btn" data-cw-back="1">Back</button>
          <div class="cw-badge">${escapeHtml(work.title || "(Untitled)")} · ${escapeHtml(String(idx + 1))}/${escapeHtml(String(work.items.length))}</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="button" class="cw-btn" data-cw-cancel="1">Cancel</button>
            <button type="button" class="cw-btn primary" data-cw-save="1">Save</button>
          </div>
        </div>

        <div class="cw-card" style="margin-top:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <div style="font-weight:1000; color:var(--cw-ink);">Question</div>
            <div style="display:flex; gap:10px;">
              <button type="button" class="cw-btn" data-cw-prev="1">←</button>
              <button type="button" class="cw-btn" data-cw-next="1">→</button>
            </div>
          </div>
          <textarea id="cwStudentPrompt" readonly style="width:100%; min-height:90px; margin-top:10px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; background:#f9fafb; font-weight:900; color:var(--cw-ink);">${escapeHtml(it.prompt || "")}</textarea>
        </div>

        ${it.boardEnabled ? `
          <div class="cw-card" style="margin-top:12px;">
            <div style="font-weight:1000; color:var(--cw-ink);">Board ${it.turn ? `· ${(it.turn === "w" ? "White" : "Black")} to move` : ""}</div>
            <div style="margin-top:10px;">${renderBoardHtml({ rows: it.board.rows, cols: it.board.cols, pieces: it.pieces, interactive: false })}</div>
            <div class="cw-muted" style="margin-top:10px;">FEN</div>
            <input type="text" readonly value="${escapeHtml(fen)}" style="width:100%; padding:10px; border:1px solid var(--cw-border); border-radius:12px; background:#f9fafb; font-weight:900; color:var(--cw-ink);">
          </div>
        ` : ``}

        <div class="cw-card" style="margin-top:12px;">
          <div style="font-weight:1000; color:var(--cw-ink);">Answer</div>
          ${it.pvEnabled ? `
            <div class="cw-muted" style="margin-top:8px;">PV</div>
            <textarea id="cwAnsPv" style="width:100%; min-height:70px; margin-top:8px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900; color:var(--cw-ink);">${escapeHtml(pv)}</textarea>
          ` : ``}
          ${it.textEnabled ? `
            <div class="cw-muted" style="margin-top:10px;">Text</div>
            <textarea id="cwAnsText" style="width:100%; min-height:90px; margin-top:8px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900; color:var(--cw-ink);">${escapeHtml(text)}</textarea>
          ` : ``}
          ${(!it.pvEnabled && !it.textEnabled) ? `<div class="cw-muted" style="margin-top:8px;">No answer fields enabled for this question.</div>` : ``}
          <div id="cwSaveHint" class="cw-muted" style="margin-top:10px;"></div>
        </div>
      `;
    }

    function renderStudentHistory() {
      return `
        <div class="cw-toolbar">
          <div class="cw-badge">History</div>
          <button type="button" class="cw-btn" data-cw-refresh-history="1">Refresh</button>
        </div>
        <div class="cw-grid">
          ${(ui.history.items || []).map((x) => `
            <div class="cw-work-card" data-cw-history-detail="${escapeHtml(String(x.workId))}">
              <div class="cw-work-title">${escapeHtml(x.title || "(Untitled)")}</div>
              <div class="cw-work-sub">Reviewed</div>
            </div>
          `).join("")}
        </div>
      `;
    }

    function renderTeacherWorksList() {
      return `
        <div class="cw-toolbar">
          <div class="cw-badge">My Works</div>
          <button type="button" class="cw-btn" data-cw-refresh-teacher-works="1">Refresh</button>
        </div>
        <div class="cw-grid">
          ${(ui.teacherWorks.works || []).map((w) => `
            <div class="cw-work-card" data-cw-teacher-open="${escapeHtml(String(w.id))}">
              <div class="cw-work-title">${escapeHtml(w.title || "(Untitled)")}</div>
              <div class="cw-work-sub">Click to manage</div>
            </div>
          `).join("")}
        </div>
      `;
    }

    function renderTeacherWorkDetail() {
      const w = ui.teacherWorks.work;
      if (!w) return `<div class="cw-muted">Work not found.</div>`;
      return `
        <div class="cw-toolbar">
          <button type="button" class="cw-btn" data-cw-teacher-back="1">Back</button>
          <div class="cw-badge">${escapeHtml(w.title || "(Untitled)")}</div>
          <div></div>
        </div>
        <div class="cw-card" style="margin-top:12px;">
          <div class="cw-grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));">
            <div class="cw-work-card" data-cw-teacher-view-works="1">
              <div class="cw-work-title">View Works</div>
              <div class="cw-work-sub">Try the works as a student</div>
            </div>
            <div class="cw-work-card" data-cw-teacher-view-students="1">
              <div class="cw-work-title">View Students</div>
              <div class="cw-work-sub">Review student submissions</div>
            </div>
          </div>
        </div>
      `;
    }

    function renderTeacherStudentsForWork() {
      const w = ui.teacherWorks.work;
      if (!w) return `<div class="cw-muted">Work not found.</div>`;
      return `
        <div class="cw-toolbar">
          <button type="button" class="cw-btn" data-cw-teacher-back-detail="1">Back</button>
          <div class="cw-badge">Students · ${escapeHtml(w.title || "(Untitled)")}</div>
          <button type="button" class="cw-btn" data-cw-teacher-refresh-students="1">Refresh</button>
        </div>
        <div style="display:grid; gap:10px;">
          ${(ui.teacherWorks.studentStatus || []).map((s) => {
            const needs = !!s.hasSubmission && !s.review?.finished;
            return `
              <div class="cw-review-row ${needs ? "is-needs-review" : ""}" data-cw-review-student="${escapeHtml(String(s.id))}">
                <div>
                  <div style="font-weight:1000; color:var(--cw-ink);">${escapeHtml(s.name || s.id)}</div>
                  <div class="cw-muted" style="margin-top:2px;">
                    ${s.hasSubmission ? `Submitted (saved)` : `No submission yet`} · ${s.review?.finished ? "Reviewed" : "Not reviewed"}
                  </div>
                </div>
                <button type="button" class="cw-btn primary">Open</button>
              </div>
            `;
          }).join("")}
          ${(!ui.teacherWorks.studentStatus || !ui.teacherWorks.studentStatus.length) ? `<div class="cw-muted">No assigned students yet.</div>` : ``}
        </div>
      `;
    }

    function renderTeacherReviewStudent() {
      const w = ui.teacherWorks.work;
      const sid = String(ui.teacherWorks.studentId || "");
      if (!w || !sid) return `<div class="cw-muted">Missing context.</div>`;
      const work = normalizeWork(w);
      const submission = ui.teacherWorks.submission?.answers || {};
      const answers = Array.isArray(submission?.items) ? submission.items : [];
      const marks = Array.isArray(ui.teacherWorks.review?.marks) ? ui.teacherWorks.review.marks : [];
      const finished = !!ui.teacherWorks.review?.finished;
      return `
        <div class="cw-toolbar">
          <button type="button" class="cw-btn" data-cw-review-back="1">Back</button>
          <div class="cw-badge">Review · ${escapeHtml(String(sid))}</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="button" class="cw-btn" data-cw-review-save="1">Save</button>
            <button type="button" class="cw-btn primary" data-cw-review-finish="1">Finish review</button>
          </div>
        </div>

        ${(work.items || []).map((it, idx) => {
          const a = answers[idx] || {};
          const mk = String(marks[idx] || "");
          const pill = (k, label) => `<button type="button" class="cw-pill ${mk === k ? "is-active" : ""}" data-cw-mark="${escapeHtml(String(idx))}:${escapeHtml(k)}">${escapeHtml(label)}</button>`;
          return `
            <div class="cw-card" style="margin-top:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                <div style="font-weight:1000; color:var(--cw-ink);">Q${idx + 1}</div>
                <div class="cw-pill-row" style="margin:0;">
                  ${pill("correct", "Correct")}
                  ${pill("half", "Half")}
                  ${pill("incorrect", "Incorrect")}
                </div>
              </div>
              <div class="cw-muted" style="margin-top:8px; white-space:pre-wrap;">${escapeHtml(it.prompt || "")}</div>
              ${it.pvEnabled ? `<div class="cw-muted" style="margin-top:10px;">PV</div><div style="margin-top:6px; font-weight:900; white-space:pre-wrap;">${escapeHtml(String(a.pv || ""))}</div>` : ``}
              ${it.textEnabled ? `<div class="cw-muted" style="margin-top:10px;">Text</div><div style="margin-top:6px; font-weight:900; white-space:pre-wrap;">${escapeHtml(String(a.text || ""))}</div>` : ``}
              ${(!it.pvEnabled && !it.textEnabled) ? `<div class="cw-muted" style="margin-top:10px;">No answer fields enabled.</div>` : ``}
            </div>
          `;
        }).join("")}

        <div class="cw-muted" style="margin-top:10px;">Status: ${finished ? "Finished" : "Not finished"}</div>
      `;
    }

    function renderBuilder() {
      const folders = ui.builder.folders || [];
      const works = ui.builder.works || [];
      const active = String(ui.builder.folderId || "all");
      const folderBtn = (id, label) => `<button type="button" class="cw-folder-btn ${active === id ? "is-active" : ""}" data-cw-folder="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
      return `
        <div class="cw-toolbar">
          <div class="cw-badge">Builder</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="button" class="cw-btn" data-cw-refresh-builder="1">Refresh</button>
            <button type="button" class="cw-btn primary" data-cw-create="1">Create</button>
          </div>
        </div>

        <div class="cw-layout-2">
          <div class="cw-card" style="margin-top:0;">
            <div style="font-weight:1000; color:var(--cw-ink);">Folders</div>
            <div class="cw-folder-list" style="margin-top:10px;">
              ${folderBtn("all", "All")}
              ${folderBtn("unfiled", "Unfiled")}
              ${folders.map((f) => folderBtn(String(f.id), String(f.name || "(Folder)"))).join("")}
            </div>
          </div>

          <div>
            <div class="cw-grid">
              ${works.map((w) => `
                <div class="cw-work-card" draggable="true" data-cw-work-card="${escapeHtml(String(w.id))}">
                  <div class="cw-work-title">${escapeHtml(w.title || "(Untitled)")}</div>
                  <div class="cw-work-actions">
                    <button type="button" class="cw-btn" data-cw-edit="${escapeHtml(String(w.id))}">Edit</button>
                    <button type="button" class="cw-btn" data-cw-assign="${escapeHtml(String(w.id))}">Assign</button>
                  </div>
                </div>
              `).join("")}
              ${(!works.length) ? `<div class="cw-muted">No works yet. Click Create → Create Works.</div>` : ``}
            </div>
          </div>
        </div>
      `;
    }

    // ===== Modals =====
    function openCreatePickerModal() {
      const host = document.createElement("div");
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="cwCreatePickBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Create" style="width: calc(100vw - 40px); max-width: 720px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Create</div>
              <button id="cwCreatePickClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div class="cw-grid" style="grid-template-columns: 1fr 1fr;">
                <div class="cw-work-card" data-cw-create-folder="1">
                  <div class="cw-work-title">Create Folder</div>
                  <div class="cw-work-sub">Organize works</div>
                </div>
                <div class="cw-work-card" data-cw-create-work="1">
                  <div class="cw-work-title">Create Works</div>
                  <div class="cw-work-sub">Create questions</div>
                </div>
              </div>
              <div style="display:flex; justify-content:flex-end; margin-top:14px;">
                <button id="cwCreatePickCancel" type="button" class="cw-btn">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);
      const close = () => { try { host.remove(); } catch {} };
      host.querySelector("#cwCreatePickClose")?.addEventListener("click", close);
      host.querySelector("#cwCreatePickCancel")?.addEventListener("click", close);
      host.querySelector("#cwCreatePickBackdrop")?.addEventListener("click", (e) => {
        if (e.target && e.target.id === "cwCreatePickBackdrop") close();
      });
      host.querySelector("[data-cw-create-folder]")?.addEventListener("click", () => {
        close();
        openCreateFolderModal();
      });
      host.querySelector("[data-cw-create-work]")?.addEventListener("click", () => {
        close();
        openCreateWorkModal();
      });
    }

    function openCreateFolderModal() {
      const host = document.createElement("div");
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="cwCreateFolderBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Create folder" style="width: calc(100vw - 40px); max-width: 720px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Create Folder</div>
              <button id="cwCreateFolderClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div style="font-weight:1000; color:var(--cw-ink);">Folder name</div>
              <input id="cwFolderName" type="text" placeholder="e.g. Week 1" style="width:100%; margin-top:10px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
              <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
                <button id="cwCreateFolderCancel" type="button" class="cw-btn">Cancel</button>
                <button id="cwCreateFolderOk" type="button" class="cw-btn primary">Create</button>
              </div>
              <div id="cwCreateFolderHint" class="cw-muted" style="margin-top:10px;"></div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);
      const close = () => { try { host.remove(); } catch {} };
      host.querySelector("#cwCreateFolderClose")?.addEventListener("click", close);
      host.querySelector("#cwCreateFolderCancel")?.addEventListener("click", close);
      host.querySelector("#cwCreateFolderBackdrop")?.addEventListener("click", (e) => {
        if (e.target && e.target.id === "cwCreateFolderBackdrop") close();
      });
      host.querySelector("#cwCreateFolderOk")?.addEventListener("click", async () => {
        const name = String(host.querySelector("#cwFolderName")?.value || "").trim();
        const hint = host.querySelector("#cwCreateFolderHint");
        if (!name) { if (hint) hint.textContent = "Please enter a name."; return; }
        try {
          await tPost("/api/teachers/chess-works/folders", { name });
          close();
          await loadBuilder();
        } catch (e) {
          if (hint) hint.textContent = String(e?.message || e);
        }
      });
    }

    async function openCreateWorkModal() {
      try {
        const created = await tPost("/api/teachers/chess-works/works", { title: "New Works", items: [defaultItem()] });
        const work = normalizeWork(created?.work || {});
        await loadBuilder();
        openWorkEditorModal(work.id);
      } catch (e) {
        alert(String(e?.message || e));
      }
    }

    async function openAssignModal(workId) {
      const wid = String(workId || "").trim();
      if (!wid) return;
      let students = [];
      let groups = [];
      try {
        const s = await tGet("/api/teachers/chess-works/students");
        students = Array.isArray(s?.students) ? s.students : [];
      } catch {}
      try {
        const g = await tGet("/api/teachers/chess-works/groups");
        groups = Array.isArray(g?.groups) ? g.groups : [];
      } catch {}

      const host = document.createElement("div");
      host.innerHTML = `
        <div class="vcp-modal-backdrop" id="cwAssignBackdrop" role="presentation">
          <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Assign" style="width: calc(100vw - 40px); max-width: 980px;">
            <div class="vcp-modal-header">
              <div class="vcp-modal-title">Assign</div>
              <button id="cwAssignClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
            </div>
            <div class="vcp-modal-body">
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; align-items:start;">
                <div class="cw-card" style="margin-top:0;">
                  <div style="font-weight:1000; color:var(--cw-ink);">Students</div>
                  <input id="cwAssignSearch" type="text" placeholder="Search..." style="width:100%; margin-top:10px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
                  <div id="cwAssignStudents" style="display:grid; gap:8px; margin-top:10px; max-height:360px; overflow:auto;"></div>
                </div>
                <div class="cw-card" style="margin-top:0;">
                  <div style="font-weight:1000; color:var(--cw-ink);">Groups</div>
                  <div id="cwAssignGroups" style="display:grid; gap:8px; margin-top:10px; max-height:360px; overflow:auto;"></div>
                </div>
              </div>
              <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
                <button id="cwAssignCancel" type="button" class="cw-btn">Cancel</button>
                <button id="cwAssignOk" type="button" class="cw-btn primary">Assign</button>
              </div>
              <div id="cwAssignHint" class="cw-muted" style="margin-top:10px;"></div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(host);
      const close = () => { try { host.remove(); } catch {} };
      host.querySelector("#cwAssignClose")?.addEventListener("click", close);
      host.querySelector("#cwAssignCancel")?.addEventListener("click", close);
      host.querySelector("#cwAssignBackdrop")?.addEventListener("click", (e) => {
        if (e.target && e.target.id === "cwAssignBackdrop") close();
      });

      const selStudents = new Set();
      const selGroups = new Set();
      const studentsEl = host.querySelector("#cwAssignStudents");
      const groupsEl = host.querySelector("#cwAssignGroups");
      const renderLists = (q) => {
        const query = String(q || "").trim().toLowerCase();
        const shown = students.filter((s) => {
          if (!query) return true;
          return String(s.name || "").toLowerCase().includes(query) || String(s.id || "").toLowerCase().includes(query);
        });
        if (studentsEl) {
          studentsEl.innerHTML = shown.map((s) => `
            <label style="display:flex; gap:10px; align-items:center; padding:8px 10px; border:1px solid var(--cw-border); border-radius:12px; background:#fff; cursor:pointer;">
              <input type="checkbox" data-cw-student="${escapeHtml(String(s.id))}">
              <span style="font-weight:900; color:var(--cw-ink);">${escapeHtml(s.name || s.id)}</span>
            </label>
          `).join("");
          studentsEl.querySelectorAll("input[data-cw-student]").forEach((cb) => {
            const id = String(cb.getAttribute("data-cw-student") || "");
            cb.checked = selStudents.has(id);
            cb.addEventListener("change", () => {
              if (cb.checked) selStudents.add(id); else selStudents.delete(id);
            });
          });
        }
        if (groupsEl) {
          groupsEl.innerHTML = (groups || []).map((g) => `
            <label style="display:flex; gap:10px; align-items:center; padding:8px 10px; border:1px solid var(--cw-border); border-radius:12px; background:#fff; cursor:pointer;">
              <input type="checkbox" data-cw-group="${escapeHtml(String(g.id))}">
              <span style="font-weight:900; color:var(--cw-ink);">${escapeHtml(g.name || g.id)}</span>
            </label>
          `).join("");
          groupsEl.querySelectorAll("input[data-cw-group]").forEach((cb) => {
            const id = String(cb.getAttribute("data-cw-group") || "");
            cb.checked = selGroups.has(id);
            cb.addEventListener("change", () => {
              if (cb.checked) selGroups.add(id); else selGroups.delete(id);
            });
          });
        }
      };
      renderLists("");
      host.querySelector("#cwAssignSearch")?.addEventListener("input", (e) => renderLists(e.target.value));

      host.querySelector("#cwAssignOk")?.addEventListener("click", async () => {
        const hint = host.querySelector("#cwAssignHint");
        try {
          await tPost(`/api/teachers/chess-works/works/${encodeURIComponent(wid)}/assign`, {
            studentIds: Array.from(selStudents),
            groupIds: Array.from(selGroups)
          });
          if (hint) hint.textContent = "Assigned.";
          setTimeout(close, 300);
        } catch (e) {
          if (hint) hint.textContent = String(e?.message || e);
        }
      });
    }

    async function openWorkEditorModal(workId) {
      const wid = String(workId || "").trim();
      if (!wid) return;
      let data = null;
      try {
        data = await tGet(`/api/teachers/chess-works/works/${encodeURIComponent(wid)}`);
      } catch (e) {
        alert(String(e?.message || e));
        return;
      }
      let work = normalizeWork(data?.work || {});
      let idx = 0;
      let tool = { kind: "piece", color: "w", type: "Q" }; // or {kind:'erase'}

      const host = document.createElement("div");
      root.appendChild(host);

      const close = () => { try { host.remove(); } catch {} };

      const clamp = () => {
        work = normalizeWork(work);
        idx = Math.max(0, Math.min(work.items.length - 1, idx));
      };

      const render = () => {
        clamp();
        const it = work.items[idx];
        const fen = fenForItem(it);
        const pieceBtn = (color, t) => {
          const active = tool.kind === "piece" && tool.color === color && tool.type === t;
          return `<button type="button" class="cw-piece-btn ${active ? "is-active" : ""}" data-cw-pick="${escapeHtml(color)}:${escapeHtml(t)}" aria-label="${escapeHtml(color)} ${escapeHtml(t)}">
            <img src="${escapeHtml(pieceImgSrc(color, t))}" alt="${escapeHtml(color)} ${escapeHtml(t)}">
          </button>`;
        };
        return `
          <div class="vcp-modal-backdrop" id="cwEditBackdrop" role="presentation">
            <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Edit works" style="width: calc(100vw - 40px); max-width: 1300px;">
              <div class="vcp-modal-header">
                <div class="vcp-modal-title">Edit Works</div>
                <button id="cwEditClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
              </div>
              <div class="vcp-modal-body">
                <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:12px; flex-wrap:wrap;">
                  <div style="flex:1 1 360px;">
                    <div style="font-weight:1000; color:var(--cw-ink);">Title</div>
                    <input id="cwWorkTitle" type="text" value="${escapeHtml(work.title)}" style="width:100%; margin-top:10px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
                  </div>
                  <div style="display:flex; gap:10px; align-items:center;">
                    <button type="button" class="cw-btn" data-cw-item-prev="1">←</button>
                    <div class="cw-badge">Item ${escapeHtml(String(idx + 1))} / ${escapeHtml(String(work.items.length))}</div>
                    <button type="button" class="cw-btn" data-cw-item-next="1">→</button>
                  </div>
                </div>

                <div style="display:grid; grid-template-columns: 420px 1fr; gap:14px; margin-top:14px; align-items:start;">
                  <div>
                    <div class="cw-card" style="margin-top:0;">
                      <div style="font-weight:1000; color:var(--cw-ink);">Question</div>
                      <textarea id="cwPrompt" placeholder="Type the question..." style="width:100%; min-height:110px; margin-top:10px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900; color:var(--cw-ink);">${escapeHtml(it.prompt || "")}</textarea>
                    </div>

                    <div class="cw-card">
                      <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap;">
                        <div style="font-weight:1000; color:var(--cw-ink);">Board</div>
                        <label style="display:flex; gap:8px; align-items:center; font-weight:900; color:var(--cw-muted); cursor:pointer;">
                          <input id="cwBoardEnabled" type="checkbox" ${it.boardEnabled ? "checked" : ""}>
                          Enabled
                        </label>
                      </div>

                      ${it.boardEnabled ? `
                        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:10px;">
                          <label class="cw-muted" style="font-weight:900;">Rows</label>
                          <input id="cwRows" type="number" min="1" value="${escapeHtml(String(it.board.rows))}" style="width:120px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
                          <label class="cw-muted" style="font-weight:900;">Cols</label>
                          <input id="cwCols" type="number" min="1" value="${escapeHtml(String(it.board.cols))}" style="width:120px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
                        </div>

                        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:10px;">
                          <div class="cw-muted" style="font-weight:900;">Turn</div>
                          <select id="cwTurn" style="padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
                            <option value="" ${it.turn ? "" : "selected"}>N/A</option>
                            <option value="w" ${it.turn === "w" ? "selected" : ""}>White to move</option>
                            <option value="b" ${it.turn === "b" ? "selected" : ""}>Black to move</option>
                          </select>
                        </div>

                        <div class="cw-muted" style="margin-top:12px; font-weight:900;">Pieces</div>
                        <div class="cw-piece-row" style="margin-top:10px;">
                          ${PIECE_TYPES.map((t) => pieceBtn("w", t)).join("")}
                        </div>
                        <div class="cw-piece-row" style="margin-top:10px;">
                          ${PIECE_TYPES.map((t) => pieceBtn("b", t)).join("")}
                        </div>
                        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:10px;">
                          <button type="button" class="cw-btn ${tool.kind === "erase" ? "primary" : ""}" data-cw-erase="1">Eraser</button>
                        </div>

                        <div class="cw-muted" style="margin-top:12px; font-weight:900;">FEN (paste to load)</div>
                        <input id="cwFen" type="text" value="${escapeHtml(fen)}" style="width:100%; margin-top:10px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
                      ` : `
                        <div class="cw-muted" style="margin-top:10px;">Board disabled for this item.</div>
                      `}
                    </div>

                    <div class="cw-card">
                      <div style="font-weight:1000; color:var(--cw-ink);">Answer settings</div>
                      <label style="display:flex; gap:8px; align-items:center; margin-top:10px; font-weight:900; color:var(--cw-muted); cursor:pointer;">
                        <input id="cwPvEnabled" type="checkbox" ${it.pvEnabled ? "checked" : ""}>
                        PV enabled
                      </label>
                      ${it.pvEnabled ? `<textarea id="cwPv" placeholder="PV answer..." style="width:100%; min-height:70px; margin-top:10px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900; color:var(--cw-ink);">${escapeHtml(it.pv || "")}</textarea>` : ``}

                      <label style="display:flex; gap:8px; align-items:center; margin-top:10px; font-weight:900; color:var(--cw-muted); cursor:pointer;">
                        <input id="cwTextEnabled" type="checkbox" ${it.textEnabled ? "checked" : ""}>
                        Text answer enabled
                      </label>
                      ${it.textEnabled ? `<textarea id="cwText" placeholder="Text answer..." style="width:100%; min-height:90px; margin-top:10px; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900; color:var(--cw-ink);">${escapeHtml(it.text || "")}</textarea>` : ``}
                    </div>
                  </div>

                  <div>
                    <div style="font-weight:1000; color:var(--cw-ink);">Preview</div>
                    <div class="cw-card" style="margin-top:10px;">
                      ${it.boardEnabled ? renderBoardHtml({ rows: it.board.rows, cols: it.board.cols, pieces: it.pieces, interactive: true }) : `<div class="cw-muted">No board for this item.</div>`}
                    </div>
                  </div>
                </div>

                <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-top:14px;">
                  <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button type="button" class="cw-btn" data-cw-add-item="1">Next item</button>
                  </div>
                  <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button type="button" class="cw-btn" data-cw-cancel="1">Cancel</button>
                    <button type="button" class="cw-btn primary" data-cw-save="1">Save</button>
                  </div>
                </div>
                <div id="cwEditHint" class="cw-muted" style="margin-top:10px;"></div>
              </div>
            </div>
          </div>
        `;
      };

      const rerender = () => { host.innerHTML = render(); bind(); };

      const readFromDom = () => {
        const titleEl = host.querySelector("#cwWorkTitle");
        if (titleEl) work.title = String(titleEl.value || "");
        const it = work.items[idx];
        const promptEl = host.querySelector("#cwPrompt");
        if (promptEl) it.prompt = String(promptEl.value || "");
        const be = host.querySelector("#cwBoardEnabled");
        if (be) it.boardEnabled = !!be.checked;
        if (it.boardEnabled) {
          const rEl = host.querySelector("#cwRows");
          const cEl = host.querySelector("#cwCols");
          it.board.rows = Math.max(1, Number(rEl?.value || it.board.rows) || it.board.rows);
          it.board.cols = Math.max(1, Number(cEl?.value || it.board.cols) || it.board.cols);
          // clamp pieces
          it.pieces = (it.pieces || []).filter((p) => inBounds(p.r, p.c, it.board.rows, it.board.cols));
          const turnEl = host.querySelector("#cwTurn");
          const tv = String(turnEl?.value || "");
          it.turn = (tv === "w" || tv === "b") ? tv : "";
        } else {
          it.turn = "";
        }
        const pvEn = host.querySelector("#cwPvEnabled");
        it.pvEnabled = !!pvEn?.checked;
        const pvEl = host.querySelector("#cwPv");
        it.pv = it.pvEnabled ? String(pvEl?.value || "") : "";
        const txEn = host.querySelector("#cwTextEnabled");
        it.textEnabled = !!txEn?.checked;
        const txEl = host.querySelector("#cwText");
        it.text = it.textEnabled ? String(txEl?.value || "") : "";
      };

      const bind = () => {
        host.querySelector("#cwEditClose")?.addEventListener("click", close);
        host.querySelector("#cwEditBackdrop")?.addEventListener("click", (e) => {
          if (e.target && e.target.id === "cwEditBackdrop") close();
        });
        host.querySelector("[data-cw-cancel]")?.addEventListener("click", close);

        host.querySelector("[data-cw-item-prev]")?.addEventListener("click", () => { readFromDom(); idx = Math.max(0, idx - 1); rerender(); });
        host.querySelector("[data-cw-item-next]")?.addEventListener("click", () => { readFromDom(); idx = Math.min(work.items.length - 1, idx + 1); rerender(); });
        host.querySelector("[data-cw-add-item]")?.addEventListener("click", () => { readFromDom(); work.items.push(defaultItem()); idx = work.items.length - 1; rerender(); });

        host.querySelector("#cwWorkTitle")?.addEventListener("input", () => readFromDom());
        host.querySelector("#cwPrompt")?.addEventListener("input", () => readFromDom());
        host.querySelector("#cwBoardEnabled")?.addEventListener("change", () => { readFromDom(); rerender(); });
        host.querySelector("#cwRows")?.addEventListener("input", () => { readFromDom(); rerender(); });
        host.querySelector("#cwCols")?.addEventListener("input", () => { readFromDom(); rerender(); });
        host.querySelector("#cwTurn")?.addEventListener("change", () => { readFromDom(); rerender(); });
        host.querySelector("#cwPvEnabled")?.addEventListener("change", () => { readFromDom(); rerender(); });
        host.querySelector("#cwTextEnabled")?.addEventListener("change", () => { readFromDom(); rerender(); });

        host.querySelectorAll("[data-cw-pick]")?.forEach((btn) => {
          btn.addEventListener("click", () => {
            const [c, t] = String(btn.getAttribute("data-cw-pick") || "").split(":");
            if (!c || !t) return;
            tool = { kind: "piece", color: c === "b" ? "b" : "w", type: String(t).toUpperCase() };
            rerender();
          });
        });
        host.querySelector("[data-cw-erase]")?.addEventListener("click", () => {
          tool = { kind: "erase" };
          rerender();
        });

        // interactive board placement
        host.querySelectorAll("[data-cw-cell]")?.forEach((cell) => {
          cell.addEventListener("click", () => {
            readFromDom();
            const it = work.items[idx];
            if (!it.boardEnabled) return;
            const v = String(cell.getAttribute("data-cw-cell") || "");
            const [rs, cs] = v.split(":");
            const r = Number(rs), c = Number(cs);
            if (!inBounds(r, c, it.board.rows, it.board.cols)) return;
            const existingIdx = (it.pieces || []).findIndex((p) => p.r === r && p.c === c);
            if (tool.kind === "erase") {
              if (existingIdx >= 0) it.pieces.splice(existingIdx, 1);
              rerender();
              return;
            }
            if (tool.kind === "piece") {
              const np = { color: tool.color, type: tool.type, r, c };
              if (existingIdx >= 0) {
                const ex = it.pieces[existingIdx];
                const same = ex && ex.color === np.color && ex.type === np.type;
                if (same) it.pieces.splice(existingIdx, 1);
                else it.pieces[existingIdx] = np;
              } else {
                it.pieces.push(np);
              }
              rerender();
            }
          });
        });

        host.querySelector("#cwFen")?.addEventListener("change", () => {
          readFromDom();
          const it = work.items[idx];
          if (!it.boardEnabled) return;
          const txt = String(host.querySelector("#cwFen")?.value || "").trim();
          const parsed = parseCwFen(txt) || parseFen8(txt);
          if (!parsed) return;
          it.board.rows = parsed.rows;
          it.board.cols = parsed.cols;
          it.turn = parsed.turn || "";
          it.pieces = parsed.pieces || [];
          rerender();
        });

        host.querySelector("[data-cw-save]")?.addEventListener("click", async () => {
          readFromDom();
          const hint = host.querySelector("#cwEditHint");
          try {
            await tPatch(`/api/teachers/chess-works/works/${encodeURIComponent(wid)}`, {
              title: work.title,
              items: work.items
            });
            if (hint) hint.textContent = "Saved.";
            await loadBuilder();
            setTimeout(close, 250);
          } catch (e) {
            if (hint) hint.textContent = String(e?.message || e);
          }
        });
      };

      rerender();
    }

    // ===== Loaders =====
    async function loadBuilder() {
      ui.builder.folders = [];
      ui.builder.works = [];
      await setMain(`<div class="cw-muted">Loading...</div>`);
      try {
        const f = await tGet("/api/teachers/chess-works/folders");
        ui.builder.folders = Array.isArray(f?.folders) ? f.folders : [];
      } catch {}
      try {
        const folderId = String(ui.builder.folderId || "all");
        let q = "";
        if (folderId !== "all") {
          if (folderId === "unfiled") q = "?folderId=";
          else q = `?folderId=${encodeURIComponent(folderId)}`;
        }
        const w = await tGet(`/api/teachers/chess-works/works${q}`);
        ui.builder.works = Array.isArray(w?.works) ? w.works : [];
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
        return;
      }
      await setMain(renderBuilder());
      bindBuilderHandlers();
    }

    async function loadTeacherWorksList() {
      await setMain(`<div class="cw-muted">Loading...</div>`);
      try {
        const w = await tGet("/api/teachers/chess-works/works");
        ui.teacherWorks.works = Array.isArray(w?.works) ? w.works : [];
        ui.teacherWorks.view = "list";
        ui.teacherWorks.work = null;
        await setMain(renderTeacherWorksList());
        bindTeacherWorksHandlers();
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function openTeacherWork(workId) {
      const id = String(workId || "").trim();
      if (!id) return;
      await setMain(`<div class="cw-muted">Loading...</div>`);
      try {
        const w = await tGet(`/api/teachers/chess-works/works/${encodeURIComponent(id)}`);
        ui.teacherWorks.work = normalizeWork(w?.work || {});
        ui.teacherWorks.view = "detail";
        await setMain(renderTeacherWorkDetail());
        bindTeacherWorksHandlers();
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function loadTeacherStudentsForWork() {
      const w = ui.teacherWorks.work;
      if (!w?.id) return;
      await setMain(`<div class="cw-muted">Loading...</div>`);
      try {
        const data = await tGet(`/api/teachers/chess-works/works/${encodeURIComponent(w.id)}/students`);
        ui.teacherWorks.studentStatus = Array.isArray(data?.students) ? data.students : [];
        ui.teacherWorks.view = "students";
        await setMain(renderTeacherStudentsForWork());
        bindTeacherWorksHandlers();
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function openTeacherReviewStudent(studentId) {
      const w = ui.teacherWorks.work;
      const sid = String(studentId || "").trim();
      if (!w?.id || !sid) return;
      await setMain(`<div class="cw-muted">Loading...</div>`);
      try {
        const data = await tGet(`/api/teachers/chess-works/works/${encodeURIComponent(w.id)}/submissions/${encodeURIComponent(sid)}`);
        ui.teacherWorks.studentId = sid;
        ui.teacherWorks.submission = data?.submission || null;
        ui.teacherWorks.review = data?.review || null;
        ui.teacherWorks.view = "review";
        await setMain(renderTeacherReviewStudent());
        bindTeacherWorksHandlers();
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function loadStudentWorksList() {
      await setMain(`<div class="cw-muted">Loading...</div>`);
      const sid = getPublicStudentIdFromPlayers();
      if (!sid) {
        await setMain(`<div class="cw-muted">Missing student identity.</div>`);
        return;
      }
      try {
        const data = await sGet(`/api/public/students/${encodeURIComponent(sid)}/chess-works/works`);
        ui.studentWorks.works = Array.isArray(data?.works) ? data.works : [];
        ui.studentWorks.view = "list";
        await setMain(renderStudentWorksList());
        bindStudentWorksHandlers();
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function openStudentWork(workId) {
      const sid = getPublicStudentIdFromPlayers();
      const wid = String(workId || "").trim();
      if (!sid || !wid) return;
      await setMain(`<div class="cw-muted">Loading...</div>`);
      try {
        const data = await sGet(`/api/public/students/${encodeURIComponent(sid)}/chess-works/works/${encodeURIComponent(wid)}`);
        ui.studentWorks.work = normalizeWork(data?.work || {});
        ui.studentWorks.idx = 0;
        const sub = await sGet(`/api/public/students/${encodeURIComponent(sid)}/chess-works/works/${encodeURIComponent(wid)}/submission`);
        ui.studentWorks.submission = sub?.submission || null;
        ui.studentWorks.answers = (sub?.submission?.answers && typeof sub.submission.answers === "object") ? sub.submission.answers : { items: [] };
        if (!Array.isArray(ui.studentWorks.answers.items)) ui.studentWorks.answers.items = [];
        ui.studentWorks.view = "do";
        await setMain(renderStudentDoWork());
        bindStudentWorksHandlers();
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function loadStudentHistory() {
      await setMain(`<div class="cw-muted">Loading...</div>`);
      const sid = getPublicStudentIdFromPlayers();
      if (!sid) { await setMain(`<div class="cw-muted">Missing student identity.</div>`); return; }
      try {
        const data = await sGet(`/api/public/students/${encodeURIComponent(sid)}/chess-works/history`);
        ui.history.items = Array.isArray(data?.items) ? data.items : [];
        await setMain(renderStudentHistory());
        bindStudentWorksHandlers();
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
      }
    }

    async function loadSettings() {
      if (!isTeacher) {
        await setMain(`<div class="cw-muted">No settings available.</div>`);
        return;
      }
      await setMain(`<div class="cw-muted">Loading...</div>`);
      try {
        const s = await tGet("/api/teachers/chess-works/students");
        ui.settings.students = Array.isArray(s?.students) ? s.students : [];
      } catch {}
      try {
        const g = await tGet("/api/teachers/chess-works/groups");
        ui.settings.groups = Array.isArray(g?.groups) ? g.groups : [];
      } catch (e) {
        await setMain(`<div class="cw-muted">${escapeHtml(e?.message || String(e))}</div>`);
        return;
      }
      await setMain(renderSettings());
      bindSettingsHandlers();
    }

    function renderSettings() {
      const groups = ui.settings.groups || [];
      return `
        <div class="cw-toolbar">
          <div class="cw-badge">Setting · Groups</div>
          <button type="button" class="cw-btn primary" data-cw-create-group="1">Create Group</button>
        </div>
        <div style="display:grid; gap:10px;">
          ${groups.map((g) => `
            <div class="cw-review-row">
              <div>
                <div style="font-weight:1000; color:var(--cw-ink);">${escapeHtml(g.name || "")}</div>
                <div class="cw-muted" style="margin-top:2px;">Members: ${(Array.isArray(g.members) ? g.members.length : 0)}</div>
              </div>
              <button type="button" class="cw-btn" data-cw-manage-group="${escapeHtml(String(g.id))}">Manage</button>
            </div>
          `).join("")}
          ${(!groups.length) ? `<div class="cw-muted">No groups yet.</div>` : ``}
        </div>
      `;
    }

    function openGroupManageModal(groupId) {
      const gid = String(groupId || "").trim();
      const g = (ui.settings.groups || []).find((x) => String(x.id) === gid) || null;
      if (!g) return;
      const host = document.createElement("div");
      root.appendChild(host);
      const close = () => { try { host.remove(); } catch {} };
      const render = (q) => {
        const query = String(q || "").trim().toLowerCase();
        const members = new Set(Array.isArray(g.members) ? g.members.map(String) : []);
        const shown = (ui.settings.students || []).filter((s) => {
          if (!query) return true;
          return String(s.name || "").toLowerCase().includes(query) || String(s.id || "").toLowerCase().includes(query);
        });
        return `
          <div class="vcp-modal-backdrop" id="cwGroupBackdrop" role="presentation">
            <div class="vcp-modal" role="dialog" aria-modal="true" aria-label="Group" style="width: calc(100vw - 40px); max-width: 980px;">
              <div class="vcp-modal-header">
                <div class="vcp-modal-title">Group: ${escapeHtml(g.name || "")}</div>
                <button id="cwGroupClose" class="vcp-modal-close" type="button" aria-label="Close">×</button>
              </div>
              <div class="vcp-modal-body">
                <input id="cwGroupSearch" type="text" placeholder="Search students..." value="${escapeHtml(String(q || ""))}" style="width:100%; padding:10px; border:1px solid var(--cw-border); border-radius:12px; font-weight:900;">
                <div style="display:grid; gap:8px; margin-top:10px; max-height:420px; overflow:auto;">
                  ${shown.map((s) => {
                    const inG = members.has(String(s.id));
                    return `
                      <div class="cw-review-row">
                        <div style="font-weight:900; color:var(--cw-ink);">${escapeHtml(s.name || s.id)}</div>
                        <button type="button" class="cw-btn ${inG ? "" : "primary"}" data-cw-toggle-member="${escapeHtml(String(s.id))}">
                          ${inG ? "Remove" : "Add"}
                        </button>
                      </div>
                    `;
                  }).join("")}
                </div>
                <div id="cwGroupHint" class="cw-muted" style="margin-top:10px;"></div>
              </div>
            </div>
          </div>
        `;
      };
      let query = "";
      const rerender = () => { host.innerHTML = render(query); bind(); };
      const bind = () => {
        host.querySelector("#cwGroupClose")?.addEventListener("click", close);
        host.querySelector("#cwGroupBackdrop")?.addEventListener("click", (e) => {
          if (e.target && e.target.id === "cwGroupBackdrop") close();
        });
        host.querySelector("#cwGroupSearch")?.addEventListener("input", (e) => { query = e.target.value; rerender(); });
        host.querySelectorAll("[data-cw-toggle-member]")?.forEach((btn) => {
          btn.addEventListener("click", async () => {
            const sid = String(btn.getAttribute("data-cw-toggle-member") || "");
            const hint = host.querySelector("#cwGroupHint");
            try {
              if ((g.members || []).map(String).includes(String(sid))) {
                await tDelete(`/api/teachers/chess-works/groups/${encodeURIComponent(gid)}/members/${encodeURIComponent(sid)}`);
              } else {
                await tPost(`/api/teachers/chess-works/groups/${encodeURIComponent(gid)}/members`, { studentIds: [sid] });
              }
              const data = await tGet("/api/teachers/chess-works/groups");
              ui.settings.groups = Array.isArray(data?.groups) ? data.groups : [];
              const fresh = ui.settings.groups.find((x) => String(x.id) === gid);
              if (fresh) Object.assign(g, fresh);
              if (hint) hint.textContent = "Updated.";
              rerender();
            } catch (e) {
              if (hint) hint.textContent = String(e?.message || e);
            }
          });
        });
      };
      rerender();
    }

    // ===== Handlers =====
    function bindNav() {
      root.querySelectorAll(".cw-nav-btn[data-cw-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = String(btn.getAttribute("data-cw-mode") || "").trim().toLowerCase();
          const normalized = normalizeMode(next, isTeacher);
          if (normalized === ui.mode) return;
          ui.mode = normalized;
          setUrlMode(ui.mode);
          rerenderShell();
          void rerenderMain();
        });
      });
    }

    function bindHomeHandlers() {
      root.querySelector("[data-cw-go-works]")?.addEventListener("click", () => {
        ui.mode = "works";
        setUrlMode(ui.mode);
        rerenderShell();
        void rerenderMain();
      }, { once: true });
    }

    function bindBuilderHandlers() {
      const main = root.querySelector("#cwMain");
      if (!main) return;
      main.querySelector("[data-cw-create]")?.addEventListener("click", openCreatePickerModal);
      main.querySelector("[data-cw-refresh-builder]")?.addEventListener("click", () => loadBuilder());
      main.querySelectorAll("[data-cw-folder]")?.forEach((btn) => {
        btn.addEventListener("click", () => {
          ui.builder.folderId = String(btn.getAttribute("data-cw-folder") || "all");
          setUrlParam("folderId", ui.builder.folderId);
          loadBuilder();
        });

        // drag-drop target for work cards
        btn.addEventListener("dragover", (e) => { e.preventDefault(); btn.classList.add("is-drop"); });
        btn.addEventListener("dragleave", () => btn.classList.remove("is-drop"));
        btn.addEventListener("drop", async (e) => {
          e.preventDefault();
          btn.classList.remove("is-drop");
          const workId = String(e.dataTransfer?.getData("text/cw-work-id") || "").trim();
          if (!workId) return;
          const fid = String(btn.getAttribute("data-cw-folder") || "all");
          if (fid === "all") return;
          const folderId = fid === "unfiled" ? "" : fid;
          try {
            await tPatch(`/api/teachers/chess-works/works/${encodeURIComponent(workId)}`, { folderId });
            await loadBuilder();
          } catch (err) {
            alert(String(err?.message || err));
          }
        });
      });
      main.querySelectorAll("[data-cw-work-card]")?.forEach((card) => {
        card.addEventListener("dragstart", (e) => {
          const id = String(card.getAttribute("data-cw-work-card") || "");
          try {
            e.dataTransfer.setData("text/cw-work-id", id);
          } catch {}
        });
      });
      main.querySelectorAll("[data-cw-edit]")?.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          openWorkEditorModal(String(btn.getAttribute("data-cw-edit") || ""));
        });
      });
      main.querySelectorAll("[data-cw-assign]")?.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          openAssignModal(String(btn.getAttribute("data-cw-assign") || ""));
        });
      });
    }

    function bindStudentWorksHandlers() {
      const main = root.querySelector("#cwMain");
      if (!main) return;

      main.querySelector("[data-cw-refresh]")?.addEventListener("click", () => loadStudentWorksList());
      main.querySelectorAll("[data-cw-open-work]")?.forEach((card) => {
        card.addEventListener("click", () => openStudentWork(String(card.getAttribute("data-cw-open-work") || "")));
      });
      main.querySelector("[data-cw-refresh-history]")?.addEventListener("click", () => loadStudentHistory());
      main.querySelectorAll("[data-cw-history-detail]")?.forEach((card) => {
        card.addEventListener("click", () => {
          const workId = String(card.getAttribute("data-cw-history-detail") || "");
          const item = (ui.history.items || []).find((x) => String(x.workId) === workId);
          if (!item) return;
          alert(`Marks:\n${JSON.stringify(item.marks || [], null, 2)}`);
        });
      });

      // do-work handlers
      main.querySelector("[data-cw-back]")?.addEventListener("click", () => loadStudentWorksList());
      main.querySelector("[data-cw-cancel]")?.addEventListener("click", () => loadStudentWorksList());
      main.querySelector("[data-cw-prev]")?.addEventListener("click", () => {
        ui.studentWorks.idx = Math.max(0, Number(ui.studentWorks.idx || 0) - 1);
        setMain(renderStudentDoWork()).then(bindStudentWorksHandlers);
      });
      main.querySelector("[data-cw-next]")?.addEventListener("click", () => {
        const work = normalizeWork(ui.studentWorks.work || {});
        ui.studentWorks.idx = Math.min(work.items.length - 1, Number(ui.studentWorks.idx || 0) + 1);
        setMain(renderStudentDoWork()).then(bindStudentWorksHandlers);
      });
      main.querySelector("[data-cw-save]")?.addEventListener("click", async () => {
        const work = normalizeWork(ui.studentWorks.work || {});
        const wid = String(work.id || "");
        const sid = getPublicStudentIdFromPlayers();
        if (!wid || !sid) return;
        const idx = Math.max(0, Math.min(work.items.length - 1, Number(ui.studentWorks.idx) || 0));
        const it = work.items[idx];
        const pvEl = main.querySelector("#cwAnsPv");
        const txEl = main.querySelector("#cwAnsText");
        const a = (ui.studentWorks.answers.items[idx] && typeof ui.studentWorks.answers.items[idx] === "object") ? ui.studentWorks.answers.items[idx] : {};
        if (it.pvEnabled) a.pv = String(pvEl?.value || "");
        if (it.textEnabled) a.text = String(txEl?.value || "");
        ui.studentWorks.answers.items[idx] = a;
        try {
          await sPatch(`/api/public/students/${encodeURIComponent(sid)}/chess-works/works/${encodeURIComponent(wid)}/submission`, {
            answers: ui.studentWorks.answers
          });
          const hint = main.querySelector("#cwSaveHint");
          if (hint) hint.textContent = "Saved.";
        } catch (e) {
          const hint = main.querySelector("#cwSaveHint");
          if (hint) hint.textContent = String(e?.message || e);
        }
      });
    }

    function bindTeacherWorksHandlers() {
      const main = root.querySelector("#cwMain");
      if (!main) return;
      main.querySelector("[data-cw-refresh-teacher-works]")?.addEventListener("click", () => loadTeacherWorksList());
      main.querySelectorAll("[data-cw-teacher-open]")?.forEach((card) => {
        card.addEventListener("click", () => openTeacherWork(String(card.getAttribute("data-cw-teacher-open") || "")));
      });
      main.querySelector("[data-cw-teacher-back]")?.addEventListener("click", () => loadTeacherWorksList());
      main.querySelector("[data-cw-teacher-view-students]")?.addEventListener("click", () => loadTeacherStudentsForWork());
      main.querySelector("[data-cw-teacher-view-works]")?.addEventListener("click", async () => {
        // teacher "try works" uses student renderer locally (no saving)
        ui.studentWorks.work = ui.teacherWorks.work;
        ui.studentWorks.answers = { items: [] };
        ui.studentWorks.idx = 0;
        ui.studentWorks.view = "do";
        await setMain(renderStudentDoWork());
        bindStudentWorksHandlers();
      });
      main.querySelector("[data-cw-teacher-back-detail]")?.addEventListener("click", () => {
        ui.teacherWorks.view = "detail";
        setMain(renderTeacherWorkDetail()).then(bindTeacherWorksHandlers);
      });
      main.querySelector("[data-cw-teacher-refresh-students]")?.addEventListener("click", () => loadTeacherStudentsForWork());
      main.querySelectorAll("[data-cw-review-student]")?.forEach((row) => {
        row.addEventListener("click", () => openTeacherReviewStudent(String(row.getAttribute("data-cw-review-student") || "")));
      });
      main.querySelector("[data-cw-review-back]")?.addEventListener("click", () => loadTeacherStudentsForWork());

      // marks click
      main.querySelectorAll("[data-cw-mark]")?.forEach((btn) => {
        btn.addEventListener("click", () => {
          const v = String(btn.getAttribute("data-cw-mark") || "");
          const [is, mk] = v.split(":");
          const i = Number(is);
          if (!Number.isFinite(i)) return;
          const marks = Array.isArray(ui.teacherWorks.review?.marks) ? ui.teacherWorks.review.marks : [];
          marks[i] = mk;
          ui.teacherWorks.review = Object.assign({}, ui.teacherWorks.review || {}, { marks, finished: false });
          setMain(renderTeacherReviewStudent()).then(bindTeacherWorksHandlers);
        });
      });

      async function saveReview(finished) {
        const w = ui.teacherWorks.work;
        const sid = String(ui.teacherWorks.studentId || "");
        if (!w?.id || !sid) return;
        const marks = Array.isArray(ui.teacherWorks.review?.marks) ? ui.teacherWorks.review.marks : [];
        try {
          await tPatch(`/api/teachers/chess-works/works/${encodeURIComponent(w.id)}/reviews/${encodeURIComponent(sid)}`, {
            marks,
            finished: !!finished
          });
          await loadTeacherStudentsForWork();
        } catch (e) {
          alert(String(e?.message || e));
        }
      }
      main.querySelector("[data-cw-review-save]")?.addEventListener("click", () => saveReview(false));
      main.querySelector("[data-cw-review-finish]")?.addEventListener("click", () => saveReview(true));
    }

    function bindSettingsHandlers() {
      const main = root.querySelector("#cwMain");
      if (!main) return;
      main.querySelector("[data-cw-create-group]")?.addEventListener("click", async () => {
        const name = prompt("Group name?");
        if (!name) return;
        try {
          await tPost("/api/teachers/chess-works/groups", { name: String(name).trim() });
          await loadSettings();
        } catch (e) {
          alert(String(e?.message || e));
        }
      });
      main.querySelectorAll("[data-cw-manage-group]")?.forEach((btn) => {
        btn.addEventListener("click", () => openGroupManageModal(String(btn.getAttribute("data-cw-manage-group") || "")));
      });
    }

    // ===== Main router =====
    async function rerenderMain() {
      if (ui.mode === "home") {
        await setMain(renderHome());
        bindHomeHandlers();
        return;
      }
      if (ui.mode === "builder") {
        if (!isTeacher) {
          await setMain(`<div class="cw-muted">Builder is for teachers only.</div>`);
          return;
        }
        await loadBuilder();
        return;
      }
      if (ui.mode === "works") {
        if (isTeacher) return await loadTeacherWorksList();
        return await loadStudentWorksList();
      }
      if (ui.mode === "history") {
        if (isStudent) return await loadStudentHistory();
        await setMain(`<div class="cw-muted">History is student-only for now.</div>`);
        return;
      }
      if (ui.mode === "settings") {
        await loadSettings();
        return;
      }
      await setMain(`<div class="cw-muted">Unknown mode.</div>`);
    }

    bindNav();
    await rerenderMain();
  };
})();

