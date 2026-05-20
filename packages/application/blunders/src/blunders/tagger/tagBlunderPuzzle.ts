// Main blunder puzzle tagging logic.

function buildTagBlunderPuzzle(deps, helpers, constants) {
  const { Chess, parseUciMove, puzzleDropPoints, isMissMatePuzzle } = deps;
  const { BLUNDERS_TAGS } = constants;
  const {
    phaseTagsForFen,
    isForkByMovedPiece,
    isDoubleAttackByMovedPiece,
    hasRecapture,
    isDiscoveredAttackByMove,
    computeLooseUnprotectedTags,
    countCheckingMoves,
    pieceValue,
    forkTargetValue,
    squareToFileRank,
    fileRankToSquare
  } = helpers;

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

  
  return tagBlunderPuzzle;
}

module.exports = { buildTagBlunderPuzzle };

export {};
