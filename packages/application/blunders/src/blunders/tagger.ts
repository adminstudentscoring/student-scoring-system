// Blunders tagger extracted from server.js.
// Keep this module dependency-injected to avoid circular imports and to preserve behavior.

function createBlundersTagger(deps: any): any {
  const Chess = deps?.Chess;
  const parseUciMove = deps?.parseUciMove;
  const puzzleDropPoints = deps?.puzzleDropPoints;
  const isMissMatePuzzle = deps?.isMissMatePuzzle;

  if (!Chess) throw new Error('createBlundersTagger: missing deps.Chess');
  if (typeof parseUciMove !== 'function') throw new Error('createBlundersTagger: missing deps.parseUciMove');
  if (typeof puzzleDropPoints !== 'function') throw new Error('createBlundersTagger: missing deps.puzzleDropPoints');
  if (typeof isMissMatePuzzle !== 'function') throw new Error('createBlundersTagger: missing deps.isMissMatePuzzle');

  const BLUNDERS_TAGGER_VERSION = 'v2';
  const BLUNDERS_TAGS = {
    MISSED_MATE: 'missed_mate',
    ALLOWED_MATE: 'allowed_mate',
    MISSED_WIN: 'missed_win',
    ALLOWED_WIN: 'allowed_win',
    HANGING_PIECE: 'hanging_piece',
    MISSED_HUNG_PIECE: 'missed_hung_piece',
    ALLOWED_HUNG_PIECE: 'allowed_hung_piece',
    FORK: 'fork',
    MISSED_FORK: 'missed_fork',
    ALLOWED_FORK: 'allowed_fork',
    DOUBLE_ATTACK: 'double_attack',
    MISSED_DOUBLE_ATTACK: 'missed_double_attack',
    ALLOWED_DOUBLE_ATTACK: 'allowed_double_attack',
    DISCOVERED_ATTACK: 'discovered_attack',
    MISSED_DISCOVERED_ATTACK: 'missed_discovered_attack',
    ALLOWED_DISCOVERED_ATTACK: 'allowed_discovered_attack',
    PIN: 'pin',
    MISSED_PIN: 'missed_pin',
    ALLOWED_PIN: 'allowed_pin',
    SKEWER: 'skewer',
    MISSED_SKEWER: 'missed_skewer',
    ALLOWED_SKEWER: 'allowed_skewer',
    UNPROTECTED_PIECE: 'unprotected_piece',
    MISSED_UNPROTECTED_PIECE: 'missed_unprotected_piece',
    ALLOWED_UNPROTECTED_PIECE: 'allowed_unprotected_piece',
    LOOSE_PIECE: 'loose_piece',
    MISSED_LOOSE_PIECE: 'missed_loose_piece',
    ALLOWED_LOOSE_PIECE: 'allowed_loose_piece',
    KING_SAFETY_BLUNDER: 'king_safety_blunder',
    MISSED_KING_SAFETY_BLUNDER: 'missed_king_safety_blunder',
    ALLOWED_KING_SAFETY_BLUNDER: 'allowed_king_safety_blunder',
    TACTICAL_OVERSIGHT: 'tactical_oversight',
    MISSED_TACTICAL_OVERSIGHT: 'missed_tactical_oversight',
    ALLOWED_TACTICAL_OVERSIGHT: 'allowed_tactical_oversight',
    PHASE_OPENING: 'phase_opening',
    PHASE_MIDDLEGAME: 'phase_middlegame',
    PHASE_ENDGAME: 'phase_endgame'
  };

  const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  function pieceValue(piece) {
    if (!piece) return 0;
    return PIECE_VALUE[String(piece.type || '').toLowerCase()] || 0;
  }

  function forkTargetValue(piece) {
    // For forks, king counts as a high-value target (king+piece forks matter).
    if (!piece) return 0;
    const t = String(piece.type || '').toLowerCase();
    if (t === 'k') return 100;
    return pieceValue(piece);
  }

  function isForkByMovedPiece(chessAfterMove, movedSq, movedPiece, victimColor) {
    try {
      const atk = attacksFrom(chessAfterMove, movedSq, movedPiece);
      let targets = 0;
      for (const sq of atk) {
        const pc = chessAfterMove.get(sq);
        if (!pc || String(pc.color) !== String(victimColor || '')) continue;
        const v = forkTargetValue(pc);
        if (v >= 3) targets++;
      }
      return targets >= 2;
    } catch {
      return false;
    }
  }

  function parseFenFullmove(fen) {
    try {
      const parts = String(fen || '').trim().split(/\s+/);
      const n = Number(parts?.[5] || 0);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  function countPieces(chess) {
    let total = 0;
    let queens = 0;
    const b = chess?.board?.();
    if (!Array.isArray(b)) return { total: 0, queens: 0 };
    for (const row of b) {
      for (const cell of row || []) {
        if (!cell) continue;
        total++;
        if (String(cell.type) === 'q') queens++;
      }
    }
    return { total, queens };
  }

  function phaseTagsForFen(startFen) {
    let chess;
    try {
      chess = new Chess(String(startFen || ''));
    } catch {
      return [];
    }
    if (!chess) return [];
    const fm = parseFenFullmove(startFen);
    const { total, queens } = countPieces(chess);
    // Simple heuristics, deterministic:
    if (fm && fm <= 10) return [BLUNDERS_TAGS.PHASE_OPENING];
    if (total <= 12 || (queens === 0 && total <= 16)) return [BLUNDERS_TAGS.PHASE_ENDGAME];
    return [BLUNDERS_TAGS.PHASE_MIDDLEGAME];
  }

  function isSquare(s) { return /^[a-h][1-8]$/.test(String(s || '')); }
  function squareToFileRank(sq) {
    const s = String(sq || '');
    if (!isSquare(s)) return null;
    const file = s.charCodeAt(0) - 97;
    const rank = Number(s[1]) - 1;
    return { file, rank };
  }
  function fileRankToSquare(file, rank) {
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return '';
    return `${String.fromCharCode(97 + file)}${String(rank + 1)}`;
  }

  function attacksFrom(chess, fromSq, piece) {
    const out = [];
    if (!piece || !isSquare(fromSq)) return out;
    const c = String(piece.color || '').toLowerCase();
    const t = String(piece.type || '').toLowerCase();
    const fr = squareToFileRank(fromSq);
    if (!fr) return out;

    const push = (f, r) => {
      const sq = fileRankToSquare(f, r);
      if (sq) out.push(sq);
    };

    if (t === 'p') {
      const dir = c === 'w' ? 1 : -1;
      push(fr.file - 1, fr.rank + dir);
      push(fr.file + 1, fr.rank + dir);
      return out;
    }

    if (t === 'n') {
      const ds = [
        [1, 2], [2, 1], [2, -1], [1, -2],
        [-1, -2], [-2, -1], [-2, 1], [-1, 2]
      ];
      for (const [df, dr] of ds) push(fr.file + df, fr.rank + dr);
      return out;
    }

    if (t === 'k') {
      for (let df = -1; df <= 1; df++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (!df && !dr) continue;
          push(fr.file + df, fr.rank + dr);
        }
      }
      return out;
    }

    const dirs = [];
    if (t === 'b' || t === 'q') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    if (t === 'r' || t === 'q') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    for (const [df, dr] of dirs) {
      let f = fr.file + df;
      let r = fr.rank + dr;
      while (true) {
        const sq = fileRankToSquare(f, r);
        if (!sq) break;
        out.push(sq);
        const at = chess.get(sq);
        if (at) break; // blocked
        f += df;
        r += dr;
      }
    }
    return out;
  }

  function hasRecapture(chessAfterCapture, targetSquare, colorToMove) {
    try {
      const moves = chessAfterCapture.moves({ verbose: true }) || [];
      for (const m of moves) {
        if (String(m?.to || '') !== String(targetSquare || '')) continue;
        const flags = String(m?.flags || '');
        if (flags.includes('c') || flags.includes('e')) return true;
      }
    } catch {}
    return false;
  }

  function isDoubleAttackByMovedPiece(chessAfterMove, movedSq, movedPiece, victimColor) {
    try {
      const t = String(movedPiece?.type || '').toLowerCase();
      // Treat knight/pawn forks as "fork" not "double attack" to keep them separated.
      if (t === 'n' || t === 'p') return false;
      return isForkByMovedPiece(chessAfterMove, movedSq, movedPiece, victimColor);
    } catch {
      return false;
    }
  }

  function isMateIn1ByUci(startFen, uci) {
    try {
      const p = parseUciMove(String(uci || ''));
      if (!p) return false;
      const ch = new Chess(String(startFen || ''));
      const mv = ch.move({ from: p.from, to: p.to, promotion: p.promotion });
      if (!mv) return false;
      return typeof ch.isCheckmate === 'function' ? ch.isCheckmate() : false;
    } catch {
      return false;
    }
  }

  function countCheckingMoves(chessPosition) {
    // chessPosition.turn() is the side to move
    try {
      const moves = chessPosition.moves({ verbose: true }) || [];
      let n = 0;
      for (const m of moves) {
        let ch2 = null;
        try { ch2 = new Chess(chessPosition.fen()); } catch { ch2 = null; }
        if (!ch2) continue;
        const mv = ch2.move({ from: String(m.from).toLowerCase(), to: String(m.to).toLowerCase(), promotion: m.promotion ? String(m.promotion).toLowerCase() : undefined });
        if (!mv) continue;
        if (typeof ch2.isCheck === 'function' && ch2.isCheck()) n++;
      }
      return n;
    } catch {
      return 0;
    }
  }

  function computeAttackCounts(chess, color) {
    const map = new Map(); // sq -> count
    try {
      const b = chess.board();
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const cell = b?.[r]?.[f];
          if (!cell) continue;
          if (String(cell.color) !== String(color || '')) continue;
          const from = fileRankToSquare(f, r);
          const atk = attacksFrom(chess, from, cell);
          for (const sq of atk) map.set(sq, (map.get(sq) || 0) + 1);
        }
      }
    } catch {}
    return map;
  }

  function computeLooseUnprotectedTags(chessAfterBlunder, victimColor, opponentColor) {
    const tags = new Set();
    try {
      const defenders = computeAttackCounts(chessAfterBlunder, victimColor);
      const attackers = computeAttackCounts(chessAfterBlunder, opponentColor);
      const b = chessAfterBlunder.board();
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const pc = b?.[r]?.[f];
          if (!pc) continue;
          if (String(pc.color) !== String(victimColor || '')) continue;
          const v = pieceValue(pc);
          if (v < 3 || String(pc.type) === 'k') continue;
          const sq = fileRankToSquare(f, r);
          const atkN = attackers.get(sq) || 0;
          if (atkN <= 0) continue;
          const defN = defenders.get(sq) || 0;
          if (defN <= 0) tags.add(BLUNDERS_TAGS.UNPROTECTED_PIECE);
          else if (atkN >= defN) tags.add(BLUNDERS_TAGS.LOOSE_PIECE);
        }
      }
    } catch {}
    return Array.from(tags);
  }

  function isDiscoveredAttackByMove(chessBefore, fromSq, toSq, moverColor) {
    // Deterministic: moved piece was the sole blocker between a friendly slider and an enemy valuable piece/king.
    try {
      const ch = chessBefore;
      const movedFrom = String(fromSq || '').toLowerCase();
      const movedTo = String(toSq || '').toLowerCase();
      const movedPiece = ch.get(movedFrom);
      if (!movedPiece || String(movedPiece.color) !== String(moverColor || '')) return false;
      const victimColor = String(moverColor || '') === 'w' ? 'b' : 'w';

      const b = ch.board();
      const sliders = [];
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const pc = b?.[r]?.[f];
          if (!pc) continue;
          if (String(pc.color) !== String(moverColor || '')) continue;
          const t = String(pc.type || '').toLowerCase();
          if (!(t === 'b' || t === 'r' || t === 'q')) continue;
          const sq = fileRankToSquare(f, r);
          if (sq === movedFrom) continue;
          sliders.push({ sq, pc });
        }
      }

      const isBetween = (a, b, x) => {
        const ar = squareToFileRank(a);
        const br = squareToFileRank(b);
        const xr = squareToFileRank(x);
        if (!ar || !br || !xr) return false;
        const df = br.file - ar.file;
        const dr = br.rank - ar.rank;
        const stepF = df === 0 ? 0 : (df > 0 ? 1 : -1);
        const stepR = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
        // must be collinear
        if (!(df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr))) return false;
        let f = ar.file + stepF;
        let r = ar.rank + stepR;
        while (true) {
          const sq = fileRankToSquare(f, r);
          if (!sq) break;
          if (sq === b) break;
          if (sq === x) return true;
          f += stepF; r += stepR;
        }
        return false;
      };

      for (const s of sliders) {
        const t = String(s.pc.type || '').toLowerCase();
        const dirs = [];
        if (t === 'b' || t === 'q') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
        if (t === 'r' || t === 'q') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
        const fr = squareToFileRank(s.sq);
        if (!fr) continue;
        for (const [df, dr] of dirs) {
          let f = fr.file + df;
          let r = fr.rank + dr;
          let first = null;
          let second = null;
          while (true) {
            const sq = fileRankToSquare(f, r);
            if (!sq) break;
            const pc = ch.get(sq);
            if (pc) {
              if (!first) first = { sq, pc };
              else { second = { sq, pc }; break; }
            }
            f += df; r += dr;
          }
          if (!first || !second) continue;
          if (String(first.sq) !== movedFrom) continue;
          if (String(second.pc.color) !== victimColor) continue;
          const v = forkTargetValue(second.pc);
          if (v < 3) continue;
          // If the moved piece lands still between slider and victim, it's not discovered.
          if (isBetween(s.sq, second.sq, movedTo)) continue;
          return true;
        }
      }
    } catch {}
    return false;
  }

  function tagBlunderPuzzle(p) {
    const tags = new Set();
    const startFen = String(p?.startFEN || p?.startFen || '').trim();
    const mvUci = String(p?.blunderMoveUci || '').trim().toLowerCase();
    if (!startFen || !mvUci) return [];

    // Phase tags are cheap and always available.
    for (const t of phaseTagsForFen(startFen)) tags.add(t);

    // Missed mate / win: leverage engine bestCp signals already stored.
    if (isMissMatePuzzle(p)) tags.add(BLUNDERS_TAGS.MISSED_MATE);
    else {
      const bestCp = Number(p?.bestCp ?? 0);
      const dp = puzzleDropPoints(p);
      if (Number.isFinite(bestCp) && Math.abs(bestCp) >= 300 && dp >= 1.0) tags.add(BLUNDERS_TAGS.MISSED_WIN);
    }

    // Missed motifs: evaluate engine best move when available.
    try {
      const bestUci = String(p?.bestMoveUci || '').trim().toLowerCase();
      if (bestUci && bestUci !== mvUci) {
        const bp = parseUciMove(bestUci);
        if (bp) {
          const ch0 = new Chess(startFen);
          const actorColor = ch0.turn();
          const victimColor = actorColor === 'w' ? 'b' : 'w';
          const movedFrom = String(bp.from || '').toLowerCase();
          const movedTo = String(bp.to || '').toLowerCase();
          const beforePiece = ch0.get(movedFrom);
          const ok = ch0.move({ from: bp.from, to: bp.to, promotion: bp.promotion });
          if (ok && beforePiece) {
            const movedSq = String(bp.to || '').toLowerCase();
            const movedPiece = ch0.get(movedSq);
            if (movedPiece && String(movedPiece.color) === actorColor) {
              // Mate-in-1 from best move (in addition to bestCp mate signal)
              if (typeof ch0.isCheckmate === 'function' && ch0.isCheckmate()) tags.add(BLUNDERS_TAGS.MISSED_MATE);

              if (isForkByMovedPiece(ch0, movedSq, movedPiece, victimColor)) {
                tags.add(BLUNDERS_TAGS.MISSED_FORK);
              }
              if (isDoubleAttackByMovedPiece(ch0, movedSq, movedPiece, victimColor)) {
                tags.add(BLUNDERS_TAGS.MISSED_DOUBLE_ATTACK);
              }
              // Discovered attack: blocker moved to reveal slider attack
              try {
                const chBefore = new Chess(startFen);
                if (isDiscoveredAttackByMove(chBefore, movedFrom, movedTo, actorColor)) {
                  tags.add(BLUNDERS_TAGS.MISSED_DISCOVERED_ATTACK);
                }
              } catch {}
            }

            // Missed hung piece: best move captures valuable piece and cannot be recaptured.
            try {
              if (String(ok?.flags || '').includes('c') || String(ok?.flags || '').includes('e')) {
                const capVal = pieceValue({ type: String(ok?.captured || '').toLowerCase() });
                if (capVal >= 3) {
                  const canRecap = hasRecapture(ch0, movedTo, victimColor);
                  if (!canRecap) {
                    tags.add(BLUNDERS_TAGS.MISSED_HUNG_PIECE);
                    tags.add(BLUNDERS_TAGS.MISSED_UNPROTECTED_PIECE);
                    tags.add(BLUNDERS_TAGS.MISSED_LOOSE_PIECE);
                  }
                }
              }
            } catch {}
          }
        }
      }
    } catch {}

    // Tactical tags: analyze the position AFTER the blunder move.
    const parsed = parseUciMove(mvUci);
    if (!parsed) return Array.from(tags);

    let chess;
    try {
      chess = new Chess(startFen);
    } catch {
      return Array.from(tags);
    }
    if (!chess) return Array.from(tags);

    const moverColor = chess.turn(); // color who blundered
    const applied = chess.move({ from: parsed.from, to: parsed.to, promotion: parsed.promotion });
    if (!applied) return Array.from(tags);

    const opponentColor = chess.turn();
    const victimColor = moverColor;

    let foundHang = false;
    let foundFork = false;
    let foundDouble = false;
    let foundDisc = false;
    let foundMate = false;
    let foundPin = false;
    let foundSkewer = false;

    // Allowed loose/unprotected piece: evaluate immediately after the blunder.
    try {
      for (const t of computeLooseUnprotectedTags(chess, victimColor, opponentColor)) tags.add(t);
      if (tags.has(BLUNDERS_TAGS.UNPROTECTED_PIECE)) tags.add(BLUNDERS_TAGS.ALLOWED_UNPROTECTED_PIECE);
      if (tags.has(BLUNDERS_TAGS.LOOSE_PIECE)) tags.add(BLUNDERS_TAGS.ALLOWED_LOOSE_PIECE);
    } catch {}

    const oppMoves = chess.moves({ verbose: true }) || [];
    for (const m of oppMoves) {
      if (foundHang && foundFork && foundDouble && foundDisc && foundMate && foundPin && foundSkewer) break;

      const isCapture = String(m?.flags || '').includes('c') || String(m?.flags || '').includes('e');
      const capturedType = m?.captured ? String(m.captured).toLowerCase() : '';

      // Hanging piece: opponent can capture a valuable piece and it cannot be recaptured.
      if (!foundHang && isCapture) {
        const capVal = pieceValue({ type: capturedType });
        if (capVal >= 3) {
          let ch2;
          try {
            ch2 = new Chess(chess.fen());
          } catch {
            ch2 = undefined;
          }
          if (ch2) {
            const cap = ch2.move({ from: String(m.from).toLowerCase(), to: String(m.to).toLowerCase(), promotion: m.promotion ? String(m.promotion).toLowerCase() : undefined });
            if (cap) {
              const canRecap = hasRecapture(ch2, String(m.to || ''), victimColor);
              if (!canRecap) {
                tags.add(BLUNDERS_TAGS.HANGING_PIECE);
                tags.add(BLUNDERS_TAGS.ALLOWED_HUNG_PIECE);
                foundHang = true;
              }
            }
          }
        }
      }

      // Fork / pin / skewer patterns: look at the moved piece after playing m.
      if ((!foundFork || !foundDouble || !foundPin || !foundSkewer || !foundDisc || !foundMate)) {
        let ch3;
        try {
          ch3 = new Chess(chess.fen());
        } catch {
          continue;
        }
        if (!ch3) continue;
        const played = ch3.move({ from: String(m.from).toLowerCase(), to: String(m.to).toLowerCase(), promotion: m.promotion ? String(m.promotion).toLowerCase() : undefined });
        if (!played) continue;
        const movedSq = String(m.to || '').toLowerCase();
        const movedPiece = ch3.get(movedSq);
        if (!movedPiece || String(movedPiece.color) !== opponentColor) continue;

        // Mate in 1: opponent move checkmates immediately.
        if (!foundMate && typeof ch3.isCheckmate === 'function' && ch3.isCheckmate()) {
          tags.add(BLUNDERS_TAGS.ALLOWED_MATE);
          foundMate = true;
        }

        // Discovered attack: opponent move reveals slider attack.
        if (!foundDisc) {
          try {
            const chBefore = new Chess(chess.fen());
            const fromSq = String(m.from || '').toLowerCase();
            const toSq = String(m.to || '').toLowerCase();
            if (isDiscoveredAttackByMove(chBefore, fromSq, toSq, opponentColor)) {
              tags.add(BLUNDERS_TAGS.DISCOVERED_ATTACK);
              tags.add(BLUNDERS_TAGS.ALLOWED_DISCOVERED_ATTACK);
              foundDisc = true;
            }
          } catch {}
        }

        // Fork: moved piece attacks >=2 valuable victim pieces.
        if (!foundFork) {
          if (isForkByMovedPiece(ch3, movedSq, movedPiece, victimColor)) {
            tags.add(BLUNDERS_TAGS.FORK);
            tags.add(BLUNDERS_TAGS.ALLOWED_FORK);
            foundFork = true;
          }
        }
        // Double attack (non knight/pawn)
        if (!foundDouble) {
          if (isDoubleAttackByMovedPiece(ch3, movedSq, movedPiece, victimColor)) {
            tags.add(BLUNDERS_TAGS.DOUBLE_ATTACK);
            tags.add(BLUNDERS_TAGS.ALLOWED_DOUBLE_ATTACK);
            foundDouble = true;
          }
        }

        // Pin / skewer: only meaningful for sliders.
        const t = String(movedPiece.type || '');
        if ((t === 'b' || t === 'r' || t === 'q') && (!foundPin || !foundSkewer)) {
          const dirs = [];
          if (t === 'b' || t === 'q') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
          if (t === 'r' || t === 'q') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
          const fr = squareToFileRank(movedSq);
          if (fr) {
            for (const [df, dr] of dirs) {
              let f = fr.file + df;
              let r = fr.rank + dr;
              let first = null;
              let second = null;
              while (true) {
                const sq = fileRankToSquare(f, r);
                if (!sq) break;
                const pc = ch3.get(sq);
                if (pc) {
                  if (!first) first = { sq, pc };
                  else { second = { sq, pc }; break; }
                }
                f += df; r += dr;
              }
              if (!first || !second) continue;
              if (String(first.pc.color) !== victimColor) continue;
              if (String(second.pc.color) !== victimColor) continue;
              const firstType = String(first.pc.type || '');
              const secondType = String(second.pc.type || '');

              if (!foundPin) {
                // Pin: victim piece in front, behind it victim king or queen.
                if (firstType !== 'k' && (secondType === 'k' || secondType === 'q')) {
                  tags.add(BLUNDERS_TAGS.PIN);
                  tags.add(BLUNDERS_TAGS.ALLOWED_PIN);
                  foundPin = true;
                }
              }
              if (!foundSkewer) {
                // Skewer: king/queen in front, valuable piece behind.
                if ((firstType === 'k' || firstType === 'q') && pieceValue(second.pc) >= 3) {
                  tags.add(BLUNDERS_TAGS.SKEWER);
                  tags.add(BLUNDERS_TAGS.ALLOWED_SKEWER);
                  foundSkewer = true;
                }
              }
            }
          }
        }
      }
    }

    // Missed king safety: compare opponent checking moves after blunder vs after best move.
    try {
      const checksAfterBlunder = countCheckingMoves(chess);
      if (checksAfterBlunder >= 2) {
        tags.add(BLUNDERS_TAGS.KING_SAFETY_BLUNDER);
        tags.add(BLUNDERS_TAGS.ALLOWED_KING_SAFETY_BLUNDER);
      }
      const bestUci = String(p?.bestMoveUci || '').trim().toLowerCase();
      if (bestUci && bestUci !== mvUci) {
        const bp = parseUciMove(bestUci);
        if (bp) {
          const chB = new Chess(startFen);
          const ok = chB.move({ from: bp.from, to: bp.to, promotion: bp.promotion });
          if (ok) {
            const checksAfterBest = countCheckingMoves(chB);
            if (checksAfterBlunder >= 1 && checksAfterBlunder > checksAfterBest) {
              tags.add(BLUNDERS_TAGS.KING_SAFETY_BLUNDER);
              tags.add(BLUNDERS_TAGS.MISSED_KING_SAFETY_BLUNDER);
            }
          }
        }
      }
    } catch {}

    // Missed/Allowed skewer and pin (when best move itself is a skewer/pin) - conservative: reuse existing tag if present from allowed; missed computed by best move as discovered/pin/skewer not fully implemented.

    // Tactical oversight fallback (when drop is large but no specific missed/allowed tag fired).
    try {
      const dp = puzzleDropPoints(p);
      if (dp >= 2.0) {
        const hasAllowed =
          tags.has(BLUNDERS_TAGS.ALLOWED_MATE) ||
          tags.has(BLUNDERS_TAGS.ALLOWED_HUNG_PIECE) ||
          tags.has(BLUNDERS_TAGS.ALLOWED_FORK) ||
          tags.has(BLUNDERS_TAGS.ALLOWED_DOUBLE_ATTACK) ||
          tags.has(BLUNDERS_TAGS.ALLOWED_DISCOVERED_ATTACK) ||
          tags.has(BLUNDERS_TAGS.ALLOWED_PIN) ||
          tags.has(BLUNDERS_TAGS.ALLOWED_SKEWER) ||
          tags.has(BLUNDERS_TAGS.ALLOWED_UNPROTECTED_PIECE) ||
          tags.has(BLUNDERS_TAGS.ALLOWED_LOOSE_PIECE) ||
          tags.has(BLUNDERS_TAGS.ALLOWED_KING_SAFETY_BLUNDER);
        const hasMissed =
          tags.has(BLUNDERS_TAGS.MISSED_MATE) ||
          tags.has(BLUNDERS_TAGS.MISSED_WIN) ||
          tags.has(BLUNDERS_TAGS.MISSED_HUNG_PIECE) ||
          tags.has(BLUNDERS_TAGS.MISSED_FORK) ||
          tags.has(BLUNDERS_TAGS.MISSED_DOUBLE_ATTACK) ||
          tags.has(BLUNDERS_TAGS.MISSED_DISCOVERED_ATTACK) ||
          tags.has(BLUNDERS_TAGS.MISSED_PIN) ||
          tags.has(BLUNDERS_TAGS.MISSED_SKEWER) ||
          tags.has(BLUNDERS_TAGS.MISSED_UNPROTECTED_PIECE) ||
          tags.has(BLUNDERS_TAGS.MISSED_LOOSE_PIECE) ||
          tags.has(BLUNDERS_TAGS.MISSED_KING_SAFETY_BLUNDER);
        if (!hasAllowed) {
          tags.add(BLUNDERS_TAGS.TACTICAL_OVERSIGHT);
          tags.add(BLUNDERS_TAGS.ALLOWED_TACTICAL_OVERSIGHT);
        }
        if (!hasMissed && String(p?.bestMoveUci || '').trim()) {
          tags.add(BLUNDERS_TAGS.TACTICAL_OVERSIGHT);
          tags.add(BLUNDERS_TAGS.MISSED_TACTICAL_OVERSIGHT);
        }
      }
    } catch {}

    return Array.from(tags);
  }

  return { BLUNDERS_TAGGER_VERSION, BLUNDERS_TAGS, tagBlunderPuzzle };
}

module.exports = { createBlundersTagger };


