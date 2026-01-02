// Stockfish runner extracted from server.js.
// Spawns the stockfish JS/WASM engine as a child process and speaks UCI over stdin/stdout.

function createStockfishRunner(deps) {
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
  let sfQueue = Promise.resolve();

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
      await new Promise((resolve, reject) => {
        let buf = '';
        const onData = (chunk) => {
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
        p.stdin.write('setoption name MultiPV value 1\n');
        p.stdin.write('ucinewgame\n');
        p.stdin.write('isready\n');
      } catch {}

      // Wait for readyok
      await new Promise((resolve) => {
        let buf = '';
        const onData = (chunk) => {
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

  async function sfEvalFen(fen, depth = 16) {
    // serialize all engine work
    sfQueue = sfQueue.then(async () => {
      sfSpawnIfNeeded();
      await sfInit();
      const p = sfProc;
      if (!p) throw new Error('Stockfish process not available');

      return await new Promise((resolve, reject) => {
        let buf = '';
        let lastScore = { cp: 0 };
        let lastPvMove = null;

        const onData = (chunk) => {
          buf += String(chunk || '');
          const lines = buf.split(/\r?\n/);
          buf = lines.pop() || '';
          for (const raw of lines) {
            const line = raw.trim();
            if (!line) continue;
            if (line.startsWith('info ')) {
              // score cp X / score mate X ; pv <move> ...
              const mCp = line.match(/\bscore\s+cp\s+(-?\d+)\b/);
              const mMate = line.match(/\bscore\s+mate\s+(-?\d+)\b/);
              if (mMate) lastScore = { mate: Number(mMate[1]) };
              else if (mCp) lastScore = { cp: Number(mCp[1]) };
              const pv = line.match(/\bpv\s+([a-h][1-8][a-h][1-8][qrbn]?)\b/);
              if (pv) lastPvMove = pv[1];
            }
            if (line.startsWith('bestmove ')) {
              const bm = line.split(/\s+/)[1] || null;
              cleanup();
              resolve({ bestMove: (bm && bm !== '(none)') ? bm : (lastPvMove || null), score: lastScore });
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

        try {
          p.stdin.write(`position fen ${fen}\n`);
          p.stdin.write(`go depth ${Number(depth) || 16}\n`);
        } catch (e) {
          cleanup();
          reject(e);
        }
      });
    });
    return sfQueue;
  }

  return { sfEvalFen };
}

module.exports = { createStockfishRunner };


