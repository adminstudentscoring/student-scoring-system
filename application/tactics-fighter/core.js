(() => {
  // application/tactics-fighter/src/core-legacy.js
  (function() {
    function escapeHtml(s) {
      return String(s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }
    function getUrlMode() {
      try {
        const params = new URLSearchParams(window.location.search);
        const m = String(params.get("mode") || "").trim();
        if (m) return m;
      } catch {
      }
      const h = String(window.location.hash || "").replace("#", "").trim();
      return h || "";
    }
    function setUrlMode(mode) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("mode", String(mode));
        window.history.replaceState(null, "", url.toString());
        return;
      } catch {
      }
      try {
        window.location.hash = String(mode);
      } catch {
      }
    }
    function normalizeMode(mode) {
      const m = String(mode || "").toLowerCase().trim();
      if (m === "home") return "home";
      if (m === "practice") return "practice";
      if (m === "challenge") return "challenge";
      if (m === "builder") return "builder";
      if (m === "setting" || m === "settings") return "settings";
      return "practice";
    }
    async function fetchConfig() {
      const resp = await fetch("/api/tactics-fighter/config", { method: "GET" });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Failed to load config");
      return data;
    }
    function apiRequest(path, options = {}) {
      const headers = { ...options.headers || {} };
      const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
      if (options.body && !headers["Content-Type"] && !isFormData) headers["Content-Type"] = "application/json";
      const token = localStorage.getItem("authToken");
      if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
      return fetch(path, { ...options, headers });
    }
    function getPublicStudentPassword() {
      try {
        return String(localStorage.getItem("studentAccessPassword") || "").trim();
      } catch {
        return "";
      }
    }
    function getPublicStudentId(players) {
      const p0 = Array.isArray(players) ? players[0] : null;
      return String(p0?.id || "").trim();
    }
    function normalizeBucketKey(k) {
      const s = String(k || "").trim().toLowerCase();
      return s || "beginner";
    }
    async function tfJson(resp) {
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const base = String(data?.error || `Request failed (${resp.status})`);
        const details = data && Object.prototype.hasOwnProperty.call(data, "details") ? String(data.details || "").trim() : "";
        const suffix = details ? ` \xB7 ${details}` : "";
        throw new Error(`${base} [${resp.status}]${suffix}`);
      }
      return data;
    }
    const PIECE_UNICODE = {
      P: "\u2659",
      N: "\u2658",
      B: "\u2657",
      R: "\u2656",
      Q: "\u2655",
      K: "\u2654",
      p: "\u265F",
      n: "\u265E",
      b: "\u265D",
      r: "\u265C",
      q: "\u265B",
      k: "\u265A"
    };
    const FILES = "abcdefgh";
    function rcToCoord(r, c) {
      return `${FILES[c]}${8 - r}`;
    }
    function pieceImageSrc(p) {
      const s = String(p || "");
      if (!s) return "";
      const isWhite = s === s.toUpperCase();
      const t = s.toLowerCase();
      const name = t === "p" ? "Pawn" : t === "n" ? "Knight" : t === "b" ? "Bishop" : t === "r" ? "Rook" : t === "q" ? "Queen" : t === "k" ? "King" : "";
      if (!name) return "";
      const color = isWhite ? "white" : "black";
      return `/application/pieces/${color}_${name}.png`;
    }
    function parseFenToBoard(fen) {
      const parts = String(fen || "").trim().split(/\s+/);
      const placement = String(parts[0] || "").trim();
      const ranks = placement.split("/");
      if (ranks.length !== 8) return null;
      const board = Array.from({ length: 8 }, () => Array(8).fill(""));
      for (let r = 0; r < 8; r++) {
        let c = 0;
        for (const ch of ranks[r]) {
          if (c > 7) return null;
          if (/\d/.test(ch)) c += Number(ch);
          else if (/[prnbqkPRNBQK]/.test(ch)) {
            board[r][c] = ch;
            c++;
          } else return null;
        }
        if (c !== 8) return null;
      }
      return board;
    }
    function boardToFenPlacement(board) {
      const ranks = [];
      for (let r = 0; r < 8; r++) {
        let empty = 0;
        let out = "";
        for (let c = 0; c < 8; c++) {
          const p = board[r][c] || "";
          if (!p) empty++;
          else {
            if (empty) {
              out += String(empty);
              empty = 0;
            }
            out += p;
          }
        }
        if (empty) out += String(empty);
        ranks.push(out || "8");
      }
      return ranks.join("/");
    }
    function buildFenFromBoard(board, side) {
      const placement = boardToFenPlacement(board);
      const stm = String(side) === "b" ? "b" : "w";
      return `${placement} ${stm} - - 0 1`;
    }
    function fenSideToMove(fen) {
      const parts = String(fen || "").trim().split(/\s+/);
      const s = String(parts[1] || "").trim();
      return s === "b" ? "b" : "w";
    }
    function cloneBoard(board) {
      return Array.isArray(board) ? board.map((row) => Array.isArray(row) ? row.slice() : []) : null;
    }
    function coordToRc(coord) {
      const s = String(coord || "").trim().toLowerCase();
      if (!/^[a-h][1-8]$/.test(s)) return null;
      const c = FILES.indexOf(s[0]);
      const r = 8 - Number(s[1]);
      if (r < 0 || r > 7 || c < 0 || c > 7) return null;
      return { r, c };
    }
    function displayToBoardRc(displayR, displayC, orientation) {
      const o = String(orientation || "white").toLowerCase();
      if (o === "black") return { r: 7 - displayR, c: 7 - displayC };
      return { r: displayR, c: displayC };
    }
    function applyUciToBoard(state, uci) {
      const s = String(uci || "").trim().toLowerCase();
      const m = s.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
      if (!m) return { ok: false, error: "Invalid move format" };
      const from = coordToRc(m[1]);
      const to = coordToRc(m[2]);
      const promo = m[3] || "";
      if (!from || !to) return { ok: false, error: "Invalid squares" };
      const board = state?.board;
      if (!Array.isArray(board) || !Array.isArray(board[from.r])) return { ok: false, error: "Board not ready" };
      const piece = board[from.r][from.c] || "";
      if (!piece) return { ok: false, error: "No piece on from-square" };
      state.history.push({ board: cloneBoard(board), side: state.side, uci: s });
      board[from.r][from.c] = "";
      board[to.r][to.c] = piece;
      const isWhiteKing = piece === "K";
      const isBlackKing = piece === "k";
      const fromCoord = m[1];
      const toCoord = m[2];
      if (isWhiteKing && fromCoord === "e1" && toCoord === "g1") {
        const rookFrom = coordToRc("h1");
        const rookTo = coordToRc("f1");
        if (rookFrom && rookTo) {
          board[rookTo.r][rookTo.c] = board[rookFrom.r][rookFrom.c] || "R";
          board[rookFrom.r][rookFrom.c] = "";
        }
      } else if (isWhiteKing && fromCoord === "e1" && toCoord === "c1") {
        const rookFrom = coordToRc("a1");
        const rookTo = coordToRc("d1");
        if (rookFrom && rookTo) {
          board[rookTo.r][rookTo.c] = board[rookFrom.r][rookFrom.c] || "R";
          board[rookFrom.r][rookFrom.c] = "";
        }
      } else if (isBlackKing && fromCoord === "e8" && toCoord === "g8") {
        const rookFrom = coordToRc("h8");
        const rookTo = coordToRc("f8");
        if (rookFrom && rookTo) {
          board[rookTo.r][rookTo.c] = board[rookFrom.r][rookFrom.c] || "r";
          board[rookFrom.r][rookFrom.c] = "";
        }
      } else if (isBlackKing && fromCoord === "e8" && toCoord === "c8") {
        const rookFrom = coordToRc("a8");
        const rookTo = coordToRc("d8");
        if (rookFrom && rookTo) {
          board[rookTo.r][rookTo.c] = board[rookFrom.r][rookFrom.c] || "r";
          board[rookFrom.r][rookFrom.c] = "";
        }
      }
      const isPawn = piece === "P" || piece === "p";
      if (isPawn) {
        const toRank = Number(m[2][1]);
        if (piece === "P" && toRank === 8 || piece === "p" && toRank === 1) {
          const want = promo || "q";
          const up = piece === "P";
          const promPiece = want === "q" ? up ? "Q" : "q" : want === "r" ? up ? "R" : "r" : want === "b" ? up ? "B" : "b" : want === "n" ? up ? "N" : "n" : up ? "Q" : "q";
          board[to.r][to.c] = promPiece;
        }
      }
      state.side = state.side === "b" ? "w" : "b";
      return { ok: true };
    }
    function undoOnePly(state) {
      const last = state.history.pop();
      if (!last) return false;
      state.board = cloneBoard(last.board);
      state.side = last.side;
      return true;
    }
    function uciToPseudoSan(beforeBoard, uci) {
      const s = String(uci || "").trim().toLowerCase();
      const m = s.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
      if (!m) return s;
      const from = coordToRc(m[1]);
      const to = coordToRc(m[2]);
      if (!from || !to) return s;
      const piece = beforeBoard?.[from.r]?.[from.c] || "";
      const target = beforeBoard?.[to.r]?.[to.c] || "";
      const promo = m[3] || "";
      const pieceLetter = (() => {
        const p = String(piece || "");
        const t = p.toLowerCase();
        if (t === "p") return "";
        if (t === "n") return "N";
        if (t === "b") return "B";
        if (t === "r") return "R";
        if (t === "q") return "Q";
        if (t === "k") return "K";
        return "";
      })();
      const isCapture = !!target;
      const toSq = m[2];
      if (!pieceLetter) {
        const file = m[1][0];
        const cap = isCapture ? `${file}x` : "";
        const prom = promo ? `=${promo.toUpperCase()}` : "";
        return `${cap}${toSq}${prom}`;
      }
      return `${pieceLetter}${isCapture ? "x" : ""}${toSq}`;
    }
    async function studentFetchTree(studentId, bucket, password) {
      const qp = new URLSearchParams();
      qp.set("bucket", normalizeBucketKey(bucket));
      if (password) qp.set("password", String(password));
      const resp = await apiRequest(`/api/public/students/${encodeURIComponent(studentId)}/tactics-fighter/tree?${qp.toString()}`, { method: "GET" });
      return await tfJson(resp);
    }
    async function studentFetchSubtopicPuzzles(studentId, subtopicId, bucket, page, pageSize, password) {
      const qp = new URLSearchParams();
      qp.set("bucket", normalizeBucketKey(bucket));
      qp.set("page", String(page || 1));
      qp.set("pageSize", String(pageSize || 10));
      if (password) qp.set("password", String(password));
      const resp = await apiRequest(`/api/public/students/${encodeURIComponent(studentId)}/tactics-fighter/subtopics/${encodeURIComponent(String(subtopicId))}/puzzles?${qp.toString()}`, { method: "GET" });
      return await tfJson(resp);
    }
    async function studentFetchStats(studentId, bucket, password) {
      const qp = new URLSearchParams();
      if (bucket) qp.set("bucket", normalizeBucketKey(bucket));
      if (password) qp.set("password", String(password));
      const resp = await apiRequest(`/api/public/students/${encodeURIComponent(studentId)}/tactics-fighter/stats?${qp.toString()}`, { method: "GET" });
      return await tfJson(resp);
    }
    async function studentFetchGhostPuzzles(studentId, bucket, limit, password) {
      const qp = new URLSearchParams();
      if (bucket) qp.set("bucket", normalizeBucketKey(bucket));
      if (limit) qp.set("limit", String(limit));
      if (password) qp.set("password", String(password));
      const resp = await apiRequest(`/api/public/students/${encodeURIComponent(studentId)}/tactics-fighter/challenge/ghost?${qp.toString()}`, { method: "GET" });
      return await tfJson(resp);
    }
    async function studentPostAttempt(studentId, puzzleId, payload, password) {
      const body = { ...payload || {} };
      if (password) body.password = String(password);
      const resp = await apiRequest(`/api/public/students/${encodeURIComponent(studentId)}/tactics-fighter/puzzles/${encodeURIComponent(String(puzzleId))}/attempt`, {
        method: "POST",
        body: JSON.stringify(body)
      });
      return await tfJson(resp);
    }
    async function studentEngineAnalyze(studentId, fen, options, password) {
      const body = { fen: String(fen || ""), ...options || {} };
      if (password) body.password = String(password);
      const resp = await apiRequest(`/api/public/students/${encodeURIComponent(studentId)}/tactics-fighter/engine/analyze`, {
        method: "POST",
        body: JSON.stringify(body)
      });
      return await tfJson(resp);
    }
    async function studentApplyMove(studentId, fen, uci, password) {
      const body = { fen: String(fen || ""), uci: String(uci || "") };
      if (password) body.password = String(password);
      const resp = await apiRequest(`/api/public/students/${encodeURIComponent(studentId)}/tactics-fighter/apply-move`, {
        method: "POST",
        body: JSON.stringify(body)
      });
      return await tfJson(resp);
    }
    async function teacherApplyMove(fen, uci) {
      const body = { fen: String(fen || ""), uci: String(uci || "") };
      const resp = await apiRequest("/api/teachers/tactics-fighter/apply-move", {
        method: "POST",
        body: JSON.stringify(body)
      });
      return await tfJson(resp);
    }
    async function builderFetchPuzzles(subtopicId) {
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}/puzzles`, {
        method: "GET"
      });
      return await tfJson(resp);
    }
    async function builderCreatePuzzle(subtopicId, payload) {
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}/puzzles`, {
        method: "POST",
        body: JSON.stringify(payload || {})
      });
      return await tfJson(resp);
    }
    async function engineAnalyze(payload) {
      const resp = await apiRequest("/api/teachers/tactics-fighter/engine/analyze", {
        method: "POST",
        body: JSON.stringify(payload || {})
      });
      return await tfJson(resp);
    }
    async function builderDeletePuzzle(puzzleId) {
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/puzzles/${encodeURIComponent(String(puzzleId || ""))}`, {
        method: "DELETE"
      });
      return await tfJson(resp);
    }
    async function builderUpdatePuzzle(puzzleId, payload) {
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/puzzles/${encodeURIComponent(String(puzzleId || ""))}`, {
        method: "PATCH",
        body: JSON.stringify(payload || {})
      });
      return await tfJson(resp);
    }
    async function builderFetchTree() {
      const resp = await apiRequest("/api/teachers/tactics-fighter/builder/tree", { method: "GET" });
      return await tfJson(resp);
    }
    async function builderCreateCategory(name) {
      const resp = await apiRequest("/api/teachers/tactics-fighter/builder/categories", {
        method: "POST",
        body: JSON.stringify({ name })
      });
      return await tfJson(resp);
    }
    async function builderRenameCategory(categoryId, name) {
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/categories/${encodeURIComponent(categoryId)}`, {
        method: "PATCH",
        body: JSON.stringify({ name })
      });
      return await tfJson(resp);
    }
    async function builderMoveCategory(categoryId, bucket) {
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/categories/${encodeURIComponent(categoryId)}`, {
        method: "PATCH",
        body: JSON.stringify({ bucket })
      });
      return await tfJson(resp);
    }
    async function builderDeleteCategory(categoryId) {
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/categories/${encodeURIComponent(categoryId)}`, {
        method: "DELETE"
      });
      return await tfJson(resp);
    }
    async function builderCreateTopic(categoryId, name) {
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/categories/${encodeURIComponent(categoryId)}/topics`, {
        method: "POST",
        body: JSON.stringify({ name })
      });
      return await tfJson(resp);
    }
    async function builderRenameTopic(topicId, name) {
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/topics/${encodeURIComponent(topicId)}`, {
        method: "PATCH",
        body: JSON.stringify({ name })
      });
      return await tfJson(resp);
    }
    async function builderDeleteTopic(topicId) {
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/topics/${encodeURIComponent(topicId)}`, {
        method: "DELETE"
      });
      return await tfJson(resp);
    }
    async function builderCreateSubtopic(topicId, name) {
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/topics/${encodeURIComponent(topicId)}/subtopics`, {
        method: "POST",
        body: JSON.stringify({ name })
      });
      return await tfJson(resp);
    }
    async function builderRenameSubtopic(subtopicId, name) {
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}`, {
        method: "PATCH",
        body: JSON.stringify({ name })
      });
      return await tfJson(resp);
    }
    async function builderUpdateSubtopicMessage(subtopicId, message) {
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}`, {
        method: "PATCH",
        body: JSON.stringify({ message: String(message ?? "") })
      });
      return await tfJson(resp);
    }
    async function builderDeleteSubtopic(subtopicId) {
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}`, {
        method: "DELETE"
      });
      return await tfJson(resp);
    }
    async function builderFetchPuzzles(subtopicId) {
      const resp = await apiRequest(`/api/teachers/tactics-fighter/builder/subtopics/${encodeURIComponent(subtopicId)}/puzzles`, {
        method: "GET"
      });
      return await tfJson(resp);
    }
    function renderShell({ role, players, mode }) {
      const playerName = players?.[0]?.name || "Student";
      const playerId = players?.[0]?.studentId || "";
      const isTeacher = String(role || "").toLowerCase() === "teacher";
      return `
      <div class="tf-app">
        <div id="tfToast" class="tf-toast" role="status" aria-live="polite" style="display:none;"></div>
        <aside class="tf-sidebar" aria-label="Tactics Fighter sidebar">
          <div class="tf-side-title">\u2694\uFE0F Tactics Fighter</div>
          <div class="tf-side-sub">${escapeHtml(playerName)}${playerId ? ` (${escapeHtml(playerId)})` : ""}</div>
          <div class="tf-side-sub" style="margin-top:-6px; opacity:0.9;">${escapeHtml(role || "")}</div>

          <div class="tf-nav" role="navigation" aria-label="Modes">
            ${!isTeacher ? `<button type="button" class="tf-nav-btn ${mode === "home" ? "is-active" : ""}" data-mode="home">Home</button>` : ""}
            <button type="button" class="tf-nav-btn ${mode === "practice" ? "is-active" : ""}" data-mode="practice">Practice</button>
            <button type="button" class="tf-nav-btn ${mode === "challenge" ? "is-active" : ""}" data-mode="challenge">Challenge</button>
            ${isTeacher ? `<button type="button" class="tf-nav-btn ${mode === "builder" ? "is-active" : ""}" data-mode="builder">Builder</button>` : ""}
            <button type="button" class="tf-nav-btn ${mode === "settings" ? "is-active" : ""}" data-mode="settings">Setting</button>
          </div>
        </aside>

        <main class="tf-main">
          <div class="tf-container">
            <div class="tf-card tf-root-card">
              <div class="tf-title">${mode === "home" ? "Home" : mode === "practice" ? "Practice Mode" : mode === "challenge" ? "Challenge Mode" : mode === "builder" ? "Builder" : "Setting"}</div>
              <div class="tf-muted">Tactics Fighter</div>
              <div id="tfMain" style="margin-top:12px;"></div>
            </div>
          </div>
        </main>
      </div>
    `;
    }
    function renderHome(stats) {
      const done = Number(stats?.completedCount || 0);
      return `
      <div>
        <div class="tf-section-title">Home</div>
        <div class="tf-muted">Your progress</div>
        <div style="margin-top:12px; border:1px solid #e5e7eb; border-radius:14px; padding:14px; background:#f8fafc;">
          <div style="font-weight:950; color:#111827;">Completed puzzles</div>
          <div style="font-size:32px; font-weight:950; color:#16a34a; margin-top:6px;">${done}</div>
        </div>
      </div>
    `;
    }
    function renderPractice() {
      const levels = [
        { key: "beginner", label: "Beginner" },
        { key: "400up", label: "400 up" },
        { key: "700up", label: "700 up" },
        { key: "1000up", label: "1000 up" },
        { key: "1500up", label: "1500 up" },
        { key: "2000up", label: "2000 up" },
        { key: "2500up", label: "2500 up" },
        { key: "2800up", label: "2800 up" }
      ];
      return `
      <div>
        <div id="tfPracticeBuckets" class="tf-practice-grid">
          ${levels.map((l) => `<button class="btn btn-primary tf-practice-btn" type="button" data-practice="${escapeHtml(l.key)}">${escapeHtml(l.label)}</button>`).join("")}
        </div>
        <div id="tfOutput" style="margin-top:12px; color:#111827;"></div>
      </div>
    `;
    }
    function renderChallenge() {
      return `
      <div>
        <div class="tf-section-title">Challenge Mode</div>
        <div class="tf-muted" style="margin-bottom:10px;">Choose a mode.</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <button type="button" class="tf-puzzle-card" data-chal-mode="ghost">
            <div class="tf-puzzle-title">Dancing with your Ghost</div>
            <div class="tf-puzzle-meta">Replay puzzles you have answered incorrectly before.</div>
          </button>
          <button type="button" class="tf-puzzle-card" data-chal-mode="random" disabled style="opacity:0.55; cursor:not-allowed;">
            <div class="tf-puzzle-title">Random</div>
            <div class="tf-puzzle-meta">Coming soon.</div>
          </button>
        </div>
        <div id="tfChallengePanel" style="margin-top:12px;"></div>
      </div>
    `;
    }
    function renderSettings() {
      return `
      <div>
        <div class="tf-section-title">Setting</div>
        <div class="tf-muted" style="margin-bottom:10px;">Engine settings (Stockfish)</div>
        <div style="border:1px solid #e5e7eb; border-radius:14px; padding:12px; background:#ffffff;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div>
              <div style="font-weight:950; color:#111827;">Stockfish Depth Cap</div>
              <div class="tf-muted" style="margin-top:4px;">Limits the maximum depth used by Practice and Builder.</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <input id="tfSettingDepthCap" class="tf-input" type="number" min="4" max="22" step="1" style="width:120px;" />
              <button id="tfSettingSaveBtn" class="btn btn-primary" type="button">Save</button>
            </div>
          </div>
          <div id="tfSettingHint" class="tf-muted" style="margin-top:10px;"></div>
        </div>
      </div>
    `;
    }
    function renderBuilder() {
      return `
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div class="tf-section-title">Builder</div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <label class="tf-muted" for="tfBuilderBucketSelect" style="font-weight:900;">Bucket</label>
            <select id="tfBuilderBucketSelect" class="tf-select" style="min-width:180px;">
              <option value="beginner">Beginner</option>
              <option value="400up">400 up</option>
              <option value="700up">700 up</option>
              <option value="1000up">1000 up</option>
              <option value="1500up">1500 up</option>
              <option value="2000up">2000 up</option>
              <option value="2500up">2500 up</option>
              <option value="2800up">2800 up</option>
            </select>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <button id="tfBuilderCreateCategoryBtn" class="btn btn-primary" type="button">Create</button>
            <button id="tfBuilderRefreshBtn" class="btn btn-secondary" type="button">Refresh</button>
          </div>
        </div>
        <div class="tf-muted" style="margin-bottom:10px;">Manage Category \u2192 Topic \u2192 Subtopic \u2192 Puzzles</div>
        <div id="tfBuilderMsg" class="tf-builder-msg" style="display:none;"></div>
        <div id="tfBuilderTree"></div>
      </div>
    `;
    }
    function renderMode(mode) {
      if (mode === "home") return renderHome(null);
      if (mode === "challenge") return renderChallenge();
      if (mode === "builder") return renderBuilder();
      if (mode === "settings") return renderSettings();
      return renderPractice();
    }
    window.__TacticsFighterCore = {
      // general
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
      // board utils
      rcToCoord,
      pieceImageSrc,
      parseFenToBoard,
      boardToFenPlacement,
      buildFenFromBoard,
      fenSideToMove,
      cloneBoard,
      coordToRc,
      displayToBoardRc,
      applyUciToBoard,
      undoOnePly,
      uciToPseudoSan,
      // student APIs
      studentFetchTree,
      studentFetchSubtopicPuzzles,
      studentFetchStats,
      studentFetchGhostPuzzles,
      studentPostAttempt,
      studentEngineAnalyze,
      studentApplyMove,
      teacherApplyMove,
      // builder APIs
      builderFetchPuzzles,
      builderCreatePuzzle,
      engineAnalyze,
      builderDeletePuzzle,
      builderUpdatePuzzle,
      builderFetchTree,
      builderCreateCategory,
      builderRenameCategory,
      builderMoveCategory,
      builderDeleteCategory,
      builderCreateTopic,
      builderRenameTopic,
      builderDeleteTopic,
      builderCreateSubtopic,
      builderRenameSubtopic,
      builderUpdateSubtopicMessage,
      builderDeleteSubtopic,
      // renderers
      renderShell,
      renderHome,
      renderPractice,
      renderChallenge,
      renderSettings,
      renderBuilder,
      renderMode
    };
  })();
})();
