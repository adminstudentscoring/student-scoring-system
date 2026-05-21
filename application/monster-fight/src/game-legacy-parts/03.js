async function initMonsterFight() {
    try {
        console.log('Initializing Monster Fight game...');
        const container = document.getElementById('monsterFightGame');
        if (!container) {
            console.error('Game container not found');
            return;
        }
        
        container.innerHTML = '<p>Loading game configuration...</p>';
        
        await loadGameConfig();
        console.log('Game config loaded:', gameConfig);
        
        container.innerHTML = '<p>Loading game state...</p>';
        const state = await loadGameState();
        
        if (!state) {
            console.error('No game state found');
            container.innerHTML = `
                <div style="padding: 20px; text-align: center;">
                    <h3>No Active Game</h3>
                    <p>No active game found. Start a new game from Teacher → App (Monster Fight).</p>
                    <button class="btn btn-primary" onclick="window.location.reload()">Refresh</button>
                </div>
            `;
            return;
        }
        
        console.log('Game state loaded:', state);
        gameState = state;
        lastActionLogLength = Array.isArray(gameState.actionLog) ? gameState.actionLog.length : 0;
        ensureActionPopupContainer();
        initGameWebSocket();
        renderGame();
    } catch (error) {
        console.error('Error initializing game:', error);
        const container = document.getElementById('monsterFightGame');
        if (container) {
            container.innerHTML = `
                <div style="padding: 20px; text-align: center; color: red;">
                    <h3>Error Loading Game</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="window.location.reload()">Refresh</button>
                </div>
            `;
        }
    }
}

function bindMonstersScrollIndicator() {
    const host = document.querySelector('.monsters-section');
    if (!host) return;
    if (host.dataset.mfScrollBound === '1') return;
    host.dataset.mfScrollBound = '1';
    let t = null;
    host.addEventListener('scroll', () => {
        host.classList.add('is-scrolling');
        if (t) clearTimeout(t);
        t = setTimeout(() => host.classList.remove('is-scrolling'), 800);
    }, { passive: true });
}

// ----------------------------
// Canvas battle scene (map only for now)
// ----------------------------
let mfCanvasToken = 0;
let mfCanvasRaf = 0;
let mfCanvasResizeHandler = null;
const mfImgCache = new Map(); // src -> { img, ok }

// Scene info for hit-testing + HUD anchoring (updated every draw)
const mfScene = {
    stageW: 0,
    stageH: 0,
    units: [] // [{ key, kind, id, x,y,w,h,isAlive,name }]
};

// Death visual FX state (alive -> dead: flash then grey/transparent)
const mfLastAliveByKey = new Map(); // key -> boolean
const mfDeathFxByKey = new Map();   // key -> { t0 }

// Battle click UI state (canvas-driven)
const mfBattleUi = {
    selectedPlayerId: null,
    selectedMonsterId: null,
    targeting: null, // { actorId, action: 'attack'|'skill', skillId?, targetType: 'monster'|'ally_alive'|'ally_dead' }
    ptsDraft: {}, // studentId -> number
    hoveredKey: null,
    reviveDraft: {}, // studentId -> number
    _lastHealToastAt: 0
};

// ----------------------------
// Canvas battle animations (FX)
// ----------------------------
const mfAnim = {
    beams: [],   // { fromKey, toKey, color, width, t0, dur }
    floats: [],  // { x, y, text, color, t0, dur, rise }
    dashes: [],  // { attKey, fromKey, toKey, t0, dur, reach }
    blocks: [],  // { blockerKey, victimKey, t0, dur, reach }
    flashes: new Map(), // key -> { t0, dur, blinks }
    jitters: new Map(), // key -> { t0, dur, amp }
    flips: new Map(),   // key -> { t0, dur, flips }
    sways: new Map(),   // key -> { t0, dur, amp } (horizontal sway)
    healGlows: new Map(), // key -> { t0, dur } (green glow)
    hpHold: new Map(),  // key -> { cur, until }
    shake: null // { t0, dur, amp }
};

// Slow down all FX (except floating numbers) by this factor.
const MF_ANIM_SLOW_FACTOR = 3;

function mfNow() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function mfAnimMs(ms) {
    const n = Number(ms) || 0;
    return Math.max(0, Math.round(n * (MF_ANIM_SLOW_FACTOR || 1)));
}

function mfFindUnitByKey(key) {
    const k = String(key || '');
    return (mfScene.units || []).find(u => u && u.key === k) || null;
}

function mfUnitCenter(key) {
    const u = mfFindUnitByKey(key);
    if (!u) return null;
    return { x: u.x, y: u.y };
}

function mfAnimPurge(now) {
    mfAnim.beams = mfAnim.beams.filter(b => (now - b.t0) <= b.dur);
    mfAnim.floats = mfAnim.floats.filter(f => (now - f.t0) <= f.dur);
    mfAnim.dashes = mfAnim.dashes.filter(d => (now - d.t0) <= d.dur);
    mfAnim.blocks = mfAnim.blocks.filter(d => (now - d.t0) <= d.dur);
    for (const [k, v] of mfAnim.flashes.entries()) {
        if ((now - v.t0) > v.dur) mfAnim.flashes.delete(k);
    }
    for (const [k, v] of mfAnim.jitters.entries()) {
        if ((now - v.t0) > v.dur) mfAnim.jitters.delete(k);
    }
    for (const [k, v] of mfAnim.flips.entries()) {
        if ((now - v.t0) > v.dur) mfAnim.flips.delete(k);
    }
    for (const [k, v] of mfAnim.sways.entries()) {
        if ((now - v.t0) > v.dur) mfAnim.sways.delete(k);
    }
    for (const [k, v] of mfAnim.healGlows.entries()) {
        if ((now - v.t0) > v.dur) mfAnim.healGlows.delete(k);
    }
    for (const [k, v] of mfAnim.hpHold.entries()) {
        if (now > v.until) mfAnim.hpHold.delete(k);
    }
    if (mfAnim.shake && (now - mfAnim.shake.t0) > mfAnim.shake.dur) mfAnim.shake = null;
}

function mfAnimAddFloatAt(x, y, text, color = 'rgba(255,60,60,0.95)', dur = 4000, rise = 28) {
    mfAnim.floats.push({ x: Number(x) || 0, y: Number(y) || 0, text: String(text || ''), color, t0: mfNow(), dur, rise });
}

function mfAnimAddFloatAtUnit(key, text, color, dur = 4000, opts = {}) {
    const c = mfUnitCenter(key);
    if (!c) return;
    const delayMs = Math.max(0, Number(opts?.delayMs) || 0);
    mfAnim.floats.push({
        x: Number(c.x) || 0,
        y: Number(c.y - 18) || 0,
        text: String(text || ''),
        color: color || 'rgba(255,60,60,0.95)',
        t0: mfNow() + delayMs,
        dur,
        rise: 34
    });
}

function mfAnimAddBeam(fromKey, toKey, color = 'rgba(255,60,60,0.95)', width = 5, dur = 260) {
    const w = Math.max(1, Math.round((Number(width) || 5) * 3));
    mfAnim.beams.push({ fromKey: String(fromKey || ''), toKey: String(toKey || ''), color, width: w, t0: mfNow(), dur: mfAnimMs(dur) });
}

function mfAnimHit(targetKey, opts = {}) {
    const k = String(targetKey || '');
    const delayMs = Math.max(0, Number(opts?.delayMs) || 0);
    const t0 = mfNow() + delayMs;
    mfAnim.flashes.set(k, { t0, dur: mfAnimMs(opts.dur ?? 260), blinks: opts.blinks ?? 2 });
    mfAnim.jitters.set(k, { t0, dur: mfAnimMs(opts.jitterDur ?? 260), amp: opts.amp ?? 3 });
}

function mfAnimDash(attKey, toKey, opts = {}) {
    mfAnim.dashes.push({
        attKey: String(attKey || ''),
        fromKey: String(attKey || ''),
        toKey: String(toKey || ''),
        t0: mfNow(),
        dur: mfAnimMs(opts.dur ?? 320),
        reach: opts.reach ?? 1,
        gap: opts.gap ?? 10
    });
}

function mfAnimBlock(blockerKey, victimKey, opts = {}) {
    mfAnim.blocks.push({
        blockerKey: String(blockerKey || ''),
        victimKey: String(victimKey || ''),
        t0: mfNow(),
        dur: mfAnimMs(opts.dur ?? 240),
        reach: opts.reach ?? 1,
        gap: opts.gap ?? 6
    });
}

function mfAnimFlip(key, flips = 3, dur = 420) {
    mfAnim.flips.set(String(key || ''), { t0: mfNow(), dur: mfAnimMs(dur), flips });
}

function mfAnimSway(key, opts = {}) {
    const k = String(key || '');
    mfAnim.sways.set(k, {
        t0: mfNow(),
        dur: mfAnimMs(opts.dur ?? 520),
        amp: Number(opts.amp ?? 6) || 6
    });
}

function mfAnimHealGlow(key, opts = {}) {
    const k = String(key || '');
    mfAnim.healGlows.set(k, { t0: mfNow(), dur: mfAnimMs(opts.dur ?? 520) });
}

function mfAnimShake(amp = 6, dur = 240) {
    mfAnim.shake = { t0: mfNow(), dur: mfAnimMs(dur), amp };
}

function mfAnimOffsetForKey(key, now) {
    const k = String(key || '');
    let dx = 0, dy = 0;

    // dash offsets (melee)
    for (const d of mfAnim.dashes) {
        if (d.attKey !== k) continue;
        const fromU = mfFindUnitByKey(d.fromKey);
        const toU = mfFindUnitByKey(d.toKey);
        const from = fromU ? { x: fromU.x, y: fromU.y } : null;
        const to = toU ? { x: toU.x, y: toU.y } : null;
        if (!from || !to) continue;
        const t = (now - d.t0) / d.dur;
        if (t < 0 || t > 1) continue;
        const ease = (t < 0.5) ? (t / 0.5) : (1 - (t - 0.5) / 0.5);
        const vx = to.x - from.x;
        const vy = to.y - from.y;
        const len = Math.max(1, Math.hypot(vx, vy));
        const attW = Number(fromU?.w) || (76 * MF_UNIT_SCALE);
        const tgtW = Number(toU?.w) || (76 * MF_UNIT_SCALE);
        const gap = Number(d.gap) || 10;
        const stop = Math.max(0, len - (attW / 2 + tgtW / 2 + gap));
        const move = Math.min(len, stop) * (Number(d.reach) || 1) * ease;
        dx += (vx / len) * move;
        dy += (vy / len) * move;
    }

    // taunt block offsets (blocker slides toward victim quickly)
    for (const b of mfAnim.blocks) {
        if (b.blockerKey !== k) continue;
        const fromU = mfFindUnitByKey(b.blockerKey);
        const toU = mfFindUnitByKey(b.victimKey);
        const from = fromU ? { x: fromU.x, y: fromU.y } : null;
        const to = toU ? { x: toU.x, y: toU.y } : null;
        if (!from || !to) continue;
        const t = (now - b.t0) / b.dur;
        if (t < 0 || t > 1) continue;
        const ease = Math.min(1, Math.max(0, t));
        const vx = to.x - from.x;
        const vy = to.y - from.y;
        const len = Math.max(1, Math.hypot(vx, vy));
        const blkW = Number(fromU?.w) || (76 * MF_UNIT_SCALE);
        const vicW = Number(toU?.w) || (76 * MF_UNIT_SCALE);
        const gap = Number(b.gap) || 6;
        const stop = Math.max(0, len - (blkW / 2 + vicW / 2 + gap));
        const move = Math.min(len, stop) * (Number(b.reach) || 1) * ease;
        dx += (vx / len) * move;
        dy += (vy / len) * move;
    }

    // jitter
    const jit = mfAnim.jitters.get(k);
    if (jit) {
        const t = (now - jit.t0) / jit.dur;
        if (t >= 0 && t <= 1) {
            const a = (1 - t) * (Number(jit.amp) || 3);
            dx += Math.sin(now / 18) * a;
            dy += Math.cos(now / 22) * a;
        }
    }

    // sway (horizontal only) - for healer animation (e.g., Shaman)
    const sway = mfAnim.sways.get(k);
    if (sway) {
        const t = (now - sway.t0) / sway.dur;
        if (t >= 0 && t <= 1) {
            const a = (1 - t) * (Number(sway.amp) || 6);
            dx += Math.sin(now / 70) * a;
        }
    }

    return { dx, dy };
}

function mfAnimFlashAlpha(key, now) {
    const fx = mfAnim.flashes.get(String(key || ''));
    if (!fx) return 1;
    const t = (now - fx.t0) / fx.dur;
    if (t < 0 || t > 1) return 1;
    const blinks = Math.max(1, Number(fx.blinks) || 2);
    const phase = Math.floor(t * blinks * 2);
    return (phase % 2 === 0) ? 1.0 : 0.35;
}

function mfAnimIsFlipped(key, now) {
    const fx = mfAnim.flips.get(String(key || ''));
    if (!fx) return false;
    const t = (now - fx.t0) / fx.dur;
    if (t < 0 || t > 1) return false;
    const flips = Math.max(1, Number(fx.flips) || 3);
    const phase = Math.floor(t * flips * 2);
    return (phase % 2 === 1);
}

function mfDrawAnim(ctx, now) {
    mfAnimPurge(now);

    // beams
    for (const b of mfAnim.beams) {
        const from = mfUnitCenter(b.fromKey);
        const to = mfUnitCenter(b.toKey);
        if (!from || !to) continue;
        const age = now - b.t0;
        const t = Math.max(0, Math.min(1, age / b.dur));
        const a = (1 - t) * 0.95;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        // inner bright core
        ctx.globalAlpha = a * 0.75;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = Math.max(1, b.width - 2);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
    }

    // float numbers
    for (const f of mfAnim.floats) {
        const age = now - f.t0;
        const t = Math.max(0, Math.min(1, age / f.dur));
        const a = (1 - t);
        const y = f.y - (Number(f.rise) || 28) * t;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.font = '900 14px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.fillStyle = f.color;
        ctx.strokeText(String(f.text), f.x, y);
        ctx.fillText(String(f.text), f.x, y);
        ctx.restore();
    }
}

function loadImg(src) {
    const s = String(src || '').trim();
    if (!s) return Promise.resolve(null);
    const cached = mfImgCache.get(s);
    if (cached && cached.ok && cached.img?.complete) return Promise.resolve(cached.img);
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            mfImgCache.set(s, { img, ok: true });
            resolve(img);
        };
        img.onerror = () => {
            mfImgCache.set(s, { img, ok: false });
            resolve(null);
        };
        img.src = s;
    });
}

function getImgSync(src) {
    const s = String(src || '').trim();
    if (!s) return null;
    const cached = mfImgCache.get(s);
    if (cached && cached.ok && cached.img?.complete) return cached.img;
    if (!cached) {
        // Kick off async load (fire and forget)
        void loadImg(s);
    }
    return null;
}

function layoutSide(list, baseX, sideSign, top, height, opts = {}) {
    const n = list.length;
    if (n === 0) return [];
    // Allow up to 5 units per side in one column. Split into 2 columns from 6+.
    const columns = n > 5 ? 2 : 1;
    const rows = Math.ceil(n / columns);
    const yStep = height / (rows + 1);
    const colGap = Number(opts?.colGap) || 90;
    const out = [];
    for (let i = 0; i < n; i++) {
        const col = i % columns;
        const row = Math.floor(i / columns);
        const x = baseX + sideSign * col * colGap;
        const y = top + (row + 1) * yStep;
        out.push({ ...list[i], x, y });
    }
    return out;
}

