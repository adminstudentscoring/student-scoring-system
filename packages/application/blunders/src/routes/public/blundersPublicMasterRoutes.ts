// Extracted from blundersPublicRoutes.ts — uses `with (deps)` for dependency injection.
// Do NOT add "use strict" to this file (it would break `with`).

function registerBlundersPublicMasterRoutes(app: any, deps: any): void {
  // eslint-disable-next-line no-with
  // @ts-expect-error - with statement used for dependency injection (intentional)
  with (deps) {
    app.get('/api/public/students/:id/blunders/master', async (req, res) => {
      try {
        const { id } = req.params;
        const { password, masterId } = req.query;
        const bucketKey = String(req.query.bucket || '').trim(); // '' | missMate | d1 | d2 | d3 | d4
        const pageSize = 50; // Fixed (UI requirement)
        const pageIn = Number(req.query.page || 1);
        const page = Number.isFinite(pageIn) ? Math.max(1, Math.floor(pageIn)) : 1;
        const wantsPaged = !!(bucketKey || req.query.paged || req.query.page);

        const data = await readData();
        const student = data.students.find(s => s.id === id);
        if (!student) return res.status(404).json({ error: 'Student not found' });

        if (student.accessPassword) {
          if (!password || password !== student.accessPassword) {
            return res.status(401).json({ error: 'Invalid password' });
          }
        }

        const orgId = String(student.organizationId || '');
        const org = await getOrgBlundersSettings(orgId);
        const masters = Array.isArray(org.masters) ? org.masters : defaultMastersPreset();

        const puzzles = await readBlundersPuzzles();
        const masterPuzzles = puzzles.filter(p => String(p.orgId || '') === orgId && String(p.scope || '') === 'master');
        const progressAll = await readBlundersMasterProgress();
        const progOrg = (progressAll?.[orgId] && typeof progressAll[orgId] === 'object') ? progressAll[orgId] : {};
        const progStu = (progOrg?.[String(student.id)] && typeof progOrg[String(student.id)] === 'object') ? progOrg[String(student.id)] : {};

        const list = masters.map((m) => {
          const mid = String(m.id || '');
          const mine = masterPuzzles.filter(p => String(p.masterId || '') === mid);
          let completed = 0;
          for (const pz of mine) {
            const pid = String(pz.id || '');
            if (pid && progStu[pid] && String(progStu[pid].status || '') === 'completed') completed++;
          }
          return {
            id: mid,
            name: String(m.name || ''),
            username: String(m.username || ''),
            counts: { total: mine.length, completed, pending: Math.max(0, mine.length - completed) }
          };
        });

        const selectedMasterId = String(masterId || '').trim();
        if (!selectedMasterId) {
          return res.json({ ok: true, masters: list });
        }

        const selected = masterPuzzles
          .filter(p => String(p.masterId || '') === selectedMasterId)
          .sort((a, b) => Number(b.endTime || 0) - Number(a.endTime || 0));

        const completedIds = new Set(Object.entries(progStu).filter(([, v]) => v && String(v.status || '') === 'completed').map(([k]) => k));

        // New: bucketed paging response (like Teacher All blunders / Student Review).
        if (wantsPaged) {
          const normalizeEntry = (p) => {
            const pid = String(p?.id || '');
            const pr = pid ? (progStu?.[pid] || null) : null;
            const status = (pr && String(pr.status || '').trim()) ? String(pr.status) : (completedIds.has(pid) ? 'completed' : 'pending');
            const completedAt = pr?.completedAt || null;
            const dropPoints = (typeof p.dropPoints === 'number')
              ? Number(p.dropPoints)
              : (Number(p.dropCp || 0) / 100);
            return {
              ...p,
              status,
              completedAt,
              dropPoints: Number.isFinite(dropPoints) ? dropPoints : 0
            };
          };

          const entriesAll = selected.map(normalizeEntry);
          const counts = { missMate: 0, d1: 0, d2: 0, d3: 0, d4: 0, total: entriesAll.length };
          for (const p of entriesAll) {
            const bk = blundersBucketKeyOfPuzzle(p);
            if (bk && Object.prototype.hasOwnProperty.call(counts, bk)) counts[bk]++;
          }

          if (!bucketKey) {
            return res.json({ ok: true, masters: list, masterId: selectedMasterId, pageSize, counts });
          }
          if (!['missMate', 'd1', 'd2', 'd3', 'd4'].includes(bucketKey)) {
            return res.status(400).json({ error: 'Invalid bucket (use: missMate, d1, d2, d3, d4)' });
          }

          const bucketEntries = entriesAll.filter((p) => blundersBucketKeyOfPuzzle(p) === bucketKey);
          const totalBucket = bucketEntries.length;
          const totalPages = Math.max(1, Math.ceil(totalBucket / pageSize));
          const safePage = Math.max(1, Math.min(totalPages, page));
          const start = (safePage - 1) * pageSize;
          const pageEntries = bucketEntries.slice(start, start + pageSize);

          return res.json({
            ok: true,
            masters: list,
            masterId: selectedMasterId,
            pageSize,
            counts,
            bucket: bucketKey,
            page: safePage,
            totalPages,
            totalBucket,
            entries: pageEntries
          });
        }

        const pending = selected.filter(p => !completedIds.has(String(p.id || '')));
        const completed = selected.filter(p => completedIds.has(String(p.id || '')));

        return res.json({
          ok: true,
          masters: list,
          masterId: selectedMasterId,
          pending,
          completed,
          counts: { pending: pending.length, completed: completed.length, total: selected.length }
        });
      } catch (e) {
        console.error('GET /api/public/students/:id/blunders/master error:', e);
        return res.status(500).json({ error: 'Failed to load master puzzles' });
      }
    });

    app.post('/api/public/students/:id/blunders/master/:puzzleId/attempt', async (req, res) => {
      try {
        const { id, puzzleId } = req.params;
        const { password } = req.query;
        const { moveUci, revealBest, practice } = req.body || {};

        const data = await readData();
        const student = data.students.find(s => s.id === id);
        if (!student) return res.status(404).json({ error: 'Student not found' });

        if (student.accessPassword) {
          if (!password || password !== student.accessPassword) {
            return res.status(401).json({ error: 'Invalid password' });
          }
        }

        const orgId = String(student.organizationId || '');
        const puzzles = await readBlundersPuzzles();
        const puzzle = puzzles.find(p => String(p.id || '') === String(puzzleId) && String(p.orgId || '') === orgId && String(p.scope || '') === 'master');
        if (!puzzle) return res.status(404).json({ error: 'Puzzle not found' });

        const progressAll = await readBlundersMasterProgress();
        if (!progressAll[orgId] || typeof progressAll[orgId] !== 'object') progressAll[orgId] = {};
        const orgProg = progressAll[orgId];
        const sid = String(student.id);
        if (!orgProg[sid] || typeof orgProg[sid] !== 'object') orgProg[sid] = {};
        const stuProg = orgProg[sid];
        if (!stuProg[String(puzzleId)] || typeof stuProg[String(puzzleId)] !== 'object') stuProg[String(puzzleId)] = { status: 'pending', attempts: [] };
        const pr = stuProg[String(puzzleId)];

        // Reveal-only (return best move + SAN + afterFEN so client can animate on board)
        if (revealBest && !moveUci) {
          const startFen = String(puzzle.startFEN || '');
          if (!startFen) return res.status(400).json({ error: 'Puzzle missing startFEN' });
          try {
            let bestMove = String(puzzle.bestMoveUci || '').trim();
            if (!bestMove) {
              const best = await sfEvalFen(startFen, 16);
              bestMove = String(best.bestMove || '').trim();
              // Normalize unexpected formats
              bestMove = bestMove.split(/\s+/)[0] || '';
              if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove)) {
                puzzle.bestMoveUci = bestMove;
                puzzle.bestCp = scoreToCp(best.score);
                await writeBlundersPuzzles(puzzles);
              } else {
                bestMove = '';
              }
            } else {
              bestMove = bestMove.split(/\s+/)[0] || '';
              if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove)) bestMove = '';
            }

            let afterFEN = '';
            let bestSan = '';
            try {
              if (bestMove) {
                const b = parseUciMove(bestMove);
                if (b) {
                  let ch = null;
                  try { ch = new Chess(startFen); } catch { ch = null; }
                  if (ch) {
                    const mv = ch.move({ from: b.from, to: b.to, promotion: b.promotion });
                    if (mv) {
                      afterFEN = ch.fen();
                      bestSan = String(mv.san || '');
                    }
                  }
                }
              }
            } catch {}
            return res.json({
              ok: true,
              bestMove: bestMove || undefined,
              bestSan: bestSan || undefined,
              afterFEN: afterFEN || undefined,
              playedUci: bestMove || undefined,
              playedSan: bestSan || undefined
            });
          } catch (e) {
            // Don't fail the whole UX on engine hiccups.
            return res.json({ ok: true, bestMove: undefined, afterFEN: undefined, playedUci: undefined, engineError: String(e?.message || e) });
          }
        }

        if ((String(pr.status || 'pending') === 'completed' || (Number.isFinite(Date.parse(String(pr.completedAt || ''))) && Date.parse(String(pr.completedAt || '')) > 0)) && !practice) {
          return res.json({ ok: true, alreadyCompleted: true, bestMove: revealBest ? (String(puzzle.bestMoveUci || '') || undefined) : undefined });
        }

        const parsed = parseUciMove(moveUci);
        if (!parsed) return res.status(400).json({ error: 'Invalid moveUci (use UCI like e2e4 or e7e8q)' });

        const startFen = String(puzzle.startFEN || '');
        if (!startFen) return res.status(400).json({ error: 'Puzzle missing startFEN' });

        let chess = null;
        try { chess = new Chess(startFen); } catch { chess = null; }
        if (!chess) return res.status(400).json({ error: 'Invalid startFEN' });

        const mv = chess.move({ from: parsed.from, to: parsed.to, promotion: parsed.promotion });
        if (!mv) return res.status(400).json({ error: 'Illegal move' });

        const afterFen = chess.fen();
        const playedSan = String(mv.san || '');
        const best = await sfEvalFen(startFen, 16);
        const bestMove = String(best.bestMove || '');
        const bestCp = scoreToCp(best.score);
        const after = await sfEvalFen(afterFen, 16);
        const userCp = -scoreToCp(after.score);
        const dropCp = bestCp - userCp;
        const dropPoints = dropCp / 100;
        const isBest = bestMove && parsed.uci === bestMove;

        const cfg = await getMasterBlundersConfig(orgId);
        const thresholdPoints = cfg.thresholdPoints;
        const v = blundersVerdictFromScores(bestCp, userCp, thresholdPoints);
        const verdict = isBest ? 'best' : v.verdict; // 'best' | 'good' | 'blunder'
        const ok = isBest ? true : !!v.ok;

        if (!practice) {
          const attempts = Array.isArray(pr.attempts) ? pr.attempts : [];
          attempts.push({ at: new Date().toISOString(), moveUci: parsed.uci, san: String(mv.san || ''), bestMove, bestCp, userCp: isBest ? bestCp : userCp, dropCp: isBest ? 0 : dropCp });
          pr.attempts = attempts;
          if (ok) {
            pr.status = 'completed';
            pr.completedAt = new Date().toISOString();
          }
          stuProg[String(puzzleId)] = pr;
          orgProg[sid] = stuProg;
          progressAll[orgId] = orgProg;
          await writeBlundersMasterProgress(progressAll);
        }

        const exposeBest = !!revealBest || (bestMove && parsed.uci === bestMove);
        const bestSan = exposeBest ? uciToSanAtFen(startFen, bestMove) : '';
        return res.json({
          ok,
          verdict,
          dropPoints: isBest ? 0 : dropPoints,
          afterFEN: afterFen,
          playedUci: parsed.uci,
          playedSan: playedSan || undefined,
          bestMove: exposeBest ? bestMove : undefined,
          bestSan: bestSan || undefined
        });
      } catch (e) {
        console.error('POST /api/public/students/:id/blunders/master/:puzzleId/attempt error:', e);
        return res.status(500).json({ error: 'Failed to evaluate move' });
      }
    });

  }
}

module.exports = { registerBlundersPublicMasterRoutes };
export {};
