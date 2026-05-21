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
    return `/application/chess-works/pieces/${c}_${nm}.png`;
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
    const pvPlies = Math.max(1, Number(it.pvPlies || 1) || 1);
    return {
      prompt: String(it.prompt || ""),
      boardEnabled,
      board: { rows, cols },
      pieces,
      turn,
      pvEnabled: !!it.pvEnabled,
      pvPlies,
      textEnabled: !!it.textEnabled,
      // teacher does not store correct text answer here
      text: ""
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
      pvPlies: 1,
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

  function applyPvMovesToPieces({ basePieces, moves, step }) {
    let pieces = JSON.parse(JSON.stringify(Array.isArray(basePieces) ? basePieces : []));
    const list = Array.isArray(moves) ? moves : [];
    const n = Math.max(0, Math.min(list.length, Number(step) || 0));
    for (let i = 0; i < n; i++) {
      const mv = list[i] || {};
      const [frs, fcs] = String(mv.from || "").split(":");
      const [trs, tcs] = String(mv.to || "").split(":");
      const fr = Number(frs), fc = Number(fcs), tr = Number(trs), tc = Number(tcs);
      if (!Number.isFinite(fr) || !Number.isFinite(fc) || !Number.isFinite(tr) || !Number.isFinite(tc)) continue;
      let moverIdx = pieces.findIndex((p) => Number(p.r) === fr && Number(p.c) === fc);
      if (moverIdx < 0) continue;
      // capture any piece on destination (if present)
      pieces = pieces.filter((p, pi) => pi === moverIdx || !(Number(p.r) === tr && Number(p.c) === tc));
      moverIdx = pieces.findIndex((p) => Number(p.r) === fr && Number(p.c) === fc);
      if (moverIdx < 0) continue;
      pieces[moverIdx].r = tr;
      pieces[moverIdx].c = tc;
    }
    return pieces;
  }

  function renderBoardHtml({ rows, cols, pieces, interactive = false, flip = false, selectedCell = "", lastMove = null, targetPx = 520 }) {
    const cellPx = computeCellPx({ rows, cols, targetPx: Number(targetPx) || 520, gapPx: 2, padPx: 2 });
    const colsCss = `repeat(${cols}, var(--cw-cell, ${cellPx}px))`;
    const m = piecesByCell(pieces);
    const cells = [];
    const sel = String(selectedCell || "");
    const lmFrom = String(lastMove?.from || "");
    const lmTo = String(lastMove?.to || "");
    const toModel = (vr, vc) => {
      if (!flip) return { r: vr, c: vc };
      return { r: (rows - 1 - vr), c: (cols - 1 - vc) };
    };
    for (let vr = 0; vr < rows; vr++) {
      for (let vc = 0; vc < cols; vc++) {
        const { r, c } = toModel(vr, vc);
        const dark = (vr + vc) % 2 === 1;
        const key = `${r}:${c}`;
        const p = m.get(key) || null;
        const inner = p
          ? `<img src="${escapeHtml(pieceImgSrc(p.color, p.type))}" alt="${escapeHtml(p.color)} ${escapeHtml(p.type)}">`
          : "";
        const isSel = !!sel && key === sel;
        const isLast = (!!lmFrom && key === lmFrom) || (!!lmTo && key === lmTo);
        const cls = ["cw-cell", dark ? "is-dark" : "", isLast ? "is-lastmove" : "", isSel ? "is-selected" : ""].filter(Boolean).join(" ");
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

  function turnLabel(turn) {
    if (turn === "w") return "White to move";
    if (turn === "b") return "Black to move";
    return "";
  }

  function moveLabel(n) {
    const k = Math.max(1, Number(n) || 1);
    return `${k} move${k === 1 ? "" : "s"}`;
  }

  function copyToClipboard(text) {
    const s = String(text ?? "");
    if (!s) return Promise.resolve(false);
    if (navigator?.clipboard?.writeText) {
      return navigator.clipboard.writeText(s).then(() => true).catch(() => false);
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return Promise.resolve(!!ok);
    } catch {
      return Promise.resolve(false);
    }
  }

  function openContextMenu({ root, x, y, items = [] }) {
    const host = document.createElement("div");
    host.className = "cw-contextmenu";
    host.style.left = `${Math.max(8, Number(x) || 8)}px`;
    host.style.top = `${Math.max(8, Number(y) || 8)}px`;
    host.innerHTML = `
      <div class="cw-contextmenu-inner">
        ${items.map((it, i) => `<button type="button" class="cw-contextmenu-item" data-cw-cm="${i}">${escapeHtml(it.label || "")}</button>`).join("")}
      </div>
    `;
    root.appendChild(host);
    const close = () => { try { host.remove(); } catch {} };
    const onDoc = (e) => {
      const t = e.target;
      if (t && host.contains(t)) return;
      close();
      document.removeEventListener("click", onDoc, true);
      document.removeEventListener("contextmenu", onDoc, true);
      document.removeEventListener("keydown", onKey, true);
    };
    const onKey = (e) => {
      if (e.key === "Escape") onDoc(e);
    };
    document.addEventListener("click", onDoc, true);
    document.addEventListener("contextmenu", onDoc, true);
    document.addEventListener("keydown", onKey, true);
    host.querySelectorAll("[data-cw-cm]")?.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const i = Number(btn.getAttribute("data-cw-cm"));
        const fn = items[i]?.onClick;
        close();
        if (typeof fn === "function") await fn();
      });
    });
    return host;
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
