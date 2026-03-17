// Stockfish runner extracted from server.js.
// Spawns the stockfish JS/WASM engine as a child process and speaks UCI over stdin/stdout.

function createStockfishRunner(deps: any): any {
  const fs = deps?.fs;
  const path = deps?.path;
  const spawn = deps?.spawn;
  const processExecPath = deps?.processExecPath || process.execPath;
  const baseDir = deps?.baseDir || process.cwd();

  if (!fs) throw new Error('createStockfishRunner: missing deps.fs');
  if (!path) throw new Error('createStockfishRunner: missing deps.path');
  if (!spawn) throw new Error('createStockfishRunner: missing deps.spawn');

  let sfEngineJsPath = null;
  let sfProc = null;
  let sfInitPromise = null;
  let sfQueue: Promise<any> = Promise.resolve();

  async function findStockfishEngineJs() {
    if (sfEngineJsPath) return sfEngineJsPath;
    const dir = path.join(baseDir, 'node_modules', 'stockfish', 'src');
    const list = await fs.readdir(dir).catch(() => []);
    // Prefer lite-single build (smaller, single wasm)
    const liteSingle = list.find((f) => /^stockfish-.*-lite-single-.*\.js$/i.test(f));
    const lite = list.find((f) => /^stockfish-.*-lite-.*\.js$/i.test(f));
    const any = list.find((f) => /^stockfish-.*\.js$/i.test(f));
    const chosen = liteSingle || lite || any;
    if (!chosen) throw new Error('Stockfish engine JS not found in node_modules/stockfish/src');
    sfEngineJsPath = path.join(dir, chosen);
    return sfEngineJsPath;
  }

  function sfSpawnIfNeeded() {
    if (sfProc && !sfProc.killed) return sfProc;
    sfProc = null;
    sfInitPromise = null;
    return null;
  }

  async function sfInit() {
    if (sfInitPromise) return sfInitPromise;
    sfInitPromise = (async () => {
      const engineJs = await findStockfishEngineJs();
      const p = spawn(processExecPath, [engineJs], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });
      sfProc = p;

      p.on('exit', () => {
        sfProc = null;
        sfInitPromise = null;
      });

      // Basic UCI init
      await new Promise<void>((resolve, reject) => {
        let buf = '';
        const onData = (chunk: any) => {
          buf += String(chunk || '');
          const lines = buf.split(/\r?\n/);
          buf = lines.pop() || '';
          for (const line of lines) {
            const s = line.trim();
            if (s === 'uciok') {
              cleanup();
              resolve();
              return;
            }
          }
        };
        const onErr = () => {};
        const onExit = () => {
          cleanup();
          reject(new Error('Stockfish process exited during init'));
        };
        const cleanup = () => {
          try { p.stdout.off('data', onData); } catch {}
          try { p.stderr.off('data', onErr); } catch {}
          try { p.off('exit', onExit); } catch {}
        };
        p.stdout.on('data', onData);
        p.stderr.on('data', onErr);
        p.on('exit', onExit);
        try {
          p.stdin.write('uci\n');
        } catch (e) {
          cleanup();
          reject(e);
        }
      });

      // Tune for analysis
      try {
        p.stdin.write('setoption name Threads value 1\n');
        p.stdin.write('setoption name Hash value 64\n');
        p.stdin.write('ucinewgame\n');
        p.stdin.write('isready\n');
      } catch {}

      // Wait for readyok
      await new Promise<void>((resolve) => {
        let buf = '';
        const onData = (chunk: any) => {
          buf += String(chunk || '');
          const lines = buf.split(/\r?\n/);
          buf = lines.pop() || '';
          for (const line of lines) {
            if (line.trim() === 'readyok') {
              cleanup();
              resolve();
              return;
            }
          }
        };
        const cleanup = () => {
          try { p.stdout.off('data', onData); } catch {}
        };
        p.stdout.on('data', onData);
      });

      return true;
    })();
    return sfInitPromise;
  }

  async function sfAnalyzeFen(fen: any, options: any = {}) {
    const depth = Number(options?.depth || 16) || 16;
    const multiPv = Math.max(1, Math.min(10, Number(options?.multiPv || 1) || 1));
    const pvPlies = Math.max(1, Math.min(32, Number(options?.pvPlies || 8) || 8));

    // serialize all engine work
    sfQueue = sfQueue.then(async () => {
      sfSpawnIfNeeded();
      await sfInit();
      const p = sfProc;
      if (!p) throw new Error('Stockfish process not available');

      return await new Promise<any>((resolve, reject) => {
        let buf = '';
        const linesByMulti = new Map(); // multipv -> { score, pv: [uci], bestMove }

        const onData = (chunk: any) => {
          buf += String(chunk || '');
          const lines = buf.split(/\r?\n/);
          buf = lines.pop() || '';
          for (const raw of lines) {
            const line = raw.trim();
            if (!line) continue;
            if (line.startsWith('info ')) {
              const mp = (() => {
                const m = line.match(/\bmultipv\s+(\d+)\b/i);
                const n = m ? Number(m[1]) : 1;
                return Number.isFinite(n) && n >= 1 ? n : 1;
              })();

              const mCp = line.match(/\bscore\s+cp\s+(-?\d+)\b/i);
              const mMate = line.match(/\bscore\s+mate\s+(-?\d+)\b/i);
              const score = mMate ? { mate: Number(mMate[1]) } : (mCp ? { cp: Number(mCp[1]) } : null);

              const pvMatch = line.match(/\bpv\s+(.+)$/i);
              const pvMoves = pvMatch
                ? String(pvMatch[1] || '')
                    .trim()
                    .split(/\s+/)
                    .filter((t) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t))
                    .slice(0, pvPlies)
                : [];

              const prev = linesByMulti.get(mp) || {};
              const next = {
                score: score || prev.score || { cp: 0 },
                pv: pvMoves.length ? pvMoves : (prev.pv || []),
                bestMove: (pvMoves[0] || prev.bestMove || null)
              };
              linesByMulti.set(mp, next);
            }
            if (line.startsWith('bestmove ')) {
              const bm = line.split(/\s+/)[1] || null;
              cleanup();
              const outLines = [];
              for (let i = 1; i <= multiPv; i++) {
                const ent = linesByMulti.get(i);
                if (!ent) continue;
                outLines.push({
                  multiPv: i,
                  bestMove: ent.bestMove || null,
                  score: ent.score || { cp: 0 },
                  pv: Array.isArray(ent.pv) ? ent.pv : []
                });
              }
              // If engine didn't emit multipv lines, ensure at least one.
              if (!outLines.length) {
                outLines.push({ multiPv: 1, bestMove: null, score: { cp: 0 }, pv: [] });
              }
              resolve({
                bestMove: (bm && bm !== '(none)') ? bm : (outLines[0]?.bestMove || null),
                lines: outLines
              });
              return;
            }
          }
        };
        const onErr = () => {
          // keep stderr for debugging but don't fail immediately
          try { /* noop */ } catch {}
        };
        const onExit = () => {
          cleanup();
          reject(new Error('Stockfish process exited during analysis'));
        };
        const cleanup = () => {
          try { p.stdout.off('data', onData); } catch {}
          try { p.stderr.off('data', onErr); } catch {}
          try { p.off('exit', onExit); } catch {}
        };

        p.stdout.on('data', onData);
        p.stderr.on('data', onErr);
        p.on('exit', onExit);

        (async () => {
          try {
            // Per-request MultiPV
            try { p.stdin.write(`setoption name MultiPV value ${multiPv}\n`); } catch {}
            // Best-effort wait for readyok so option applies.
            await new Promise<void>((resolveReady) => {
              let b = '';
              const onReady = (chunk: any) => {
                b += String(chunk || '');
                const ls = b.split(/\r?\n/);
                b = ls.pop() || '';
                for (const l of ls) {
                  if (String(l || '').trim() === 'readyok') {
                    cleanupReady();
                    resolveReady();
                    return;
                  }
                }
              };
              const cleanupReady = () => {
                try { p.stdout.off('data', onReady); } catch {}
              };
              p.stdout.on('data', onReady);
              try { p.stdin.write('isready\n'); } catch { cleanupReady(); resolveReady(); }
              // safety timeout
              try { setTimeout(() => { cleanupReady(); resolveReady(); }, 250).unref?.(); } catch {}
            });

            p.stdin.write(`position fen ${fen}\n`);
            p.stdin.write(`go depth ${depth}\n`);
          } catch (e) {
            cleanup();
            reject(e);
          }
        })();
      });
    });
    return sfQueue;
  }

  async function sfEvalFen(fen: any, depth = 16) {
    const r = await sfAnalyzeFen(fen, { depth, multiPv: 1, pvPlies: 8 });
    const first = (r && Array.isArray(r.lines) && r.lines[0]) ? r.lines[0] : null;
    return { bestMove: r?.bestMove || first?.bestMove || null, score: first?.score || { cp: 0 } };
  }

  return { sfEvalFen, sfAnalyzeFen };
}

module.exports = { createStockfishRunner };


