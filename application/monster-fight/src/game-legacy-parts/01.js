function classImageFileById(classId) {
    const cls = getPlayerClasses().find(c => c.id === classId);
    const name = String(cls?.name || '').trim();
    if (!name) return '';
    return `${name}.png`;
}

function monsterImageFileByType(typeId) {
    const mt = getMonsterTypes().find(m => m.id === typeId);
    const name = String(mt?.name || '').trim();
    if (!name) return '';
    return `${name}.png`;
}

// Helper function to safely get playerClasses array
function getPlayerClasses() {
    if (!Array.isArray(playerClasses)) {
        playerClasses = window.playerClasses || [];
    }
    return playerClasses;
}

// Helper function to safely get monsterTypes array
function getMonsterTypes() {
    if (!Array.isArray(monsterTypes)) {
        monsterTypes = window.monsterTypes || [];
    }
    return monsterTypes;
}

function cacheIconMaps() {
    // Use helper functions to ensure arrays are valid
    const classes = getPlayerClasses();
    const types = getMonsterTypes();
    
    classes.forEach(cls => {
        CLASS_ICON_MAP[cls.id] = cls.emoji || '🎯';
    });
    monsterIconMap = {};
    types.forEach(type => {
        monsterIconMap[type.id] = type.emoji || '🧟';
    });
}

// Use a unique variable name to avoid conflicts with other scripts
let gameWs = null;
let lastActionLogLength = 0;
let actionQueue = [];
let isShowingPopup = false;
let actionLogCollapsed = true; // default: hidden, open via topbar button
let monsterTurnReplay = { active: false, pendingWsState: null, onDone: null };

// Ensure toast always appears even if DOM re-renders mid-action.
let mfPendingToast = null; // { text, opts }
function mfToast(text, opts = {}) {
    const msg = String(text || '').trim();
    if (!msg) return;
    const el = document.getElementById('mfBattleToast');
    if (!el) {
        mfPendingToast = { text: msg, opts };
        return;
    }
    mfShowBattleToast(msg, opts);
}

function mfGetBattleToastEl() {
    const el = document.getElementById('mfBattleToast');
    if (!el) return null;
    // Ensure structure exists even if DOM wasn't refreshed.
    if (!el.querySelector('.mf-battle-toast-text')) {
        const t = document.createElement('div');
        t.className = 'mf-battle-toast-text';
        // preserve any existing text
        const existing = el.textContent;
        if (existing) t.textContent = existing;
        el.textContent = '';
        el.appendChild(t);
    }
    if (!el.querySelector('.mf-battle-toast-next')) {
        const b = document.createElement('button');
        b.className = 'mf-battle-toast-next';
        b.type = 'button';
        b.textContent = 'Next';
        el.appendChild(b);
    }
    return el;
}

let mfToastTimer = null;
let mfToastNextHandler = null;
function mfHideBattleToast() {
    const el = document.getElementById('mfBattleToast');
    if (!el) return;
    el.classList.remove('is-show');
    const nextBtn = el.querySelector('.mf-battle-toast-next');
    if (nextBtn) {
        nextBtn.style.display = 'none';
        nextBtn.disabled = true;
        if (mfToastNextHandler) {
            try { nextBtn.removeEventListener('click', mfToastNextHandler); } catch {}
        }
    }
    mfToastNextHandler = null;
    if (mfToastTimer) clearTimeout(mfToastTimer);
    mfToastTimer = null;
    mfPendingToast = null;
}
function mfShowBattleToast(text, opts = {}) {
    const el = mfGetBattleToastEl();
    if (!el) return;
    const msg = String(text || '').trim();
    if (!msg) return;
    // Persist so battle re-render can re-apply the toast.
    mfPendingToast = { text: msg, opts };
    const textEl = el.querySelector('.mf-battle-toast-text') || el;
    const nextBtn = el.querySelector('.mf-battle-toast-next');
    if (textEl) textEl.textContent = msg;
    el.classList.add('is-show');
    const wantNext = !!opts.next;
    if (nextBtn) {
        nextBtn.style.display = wantNext ? 'inline-flex' : 'none';
        nextBtn.disabled = !wantNext;
        if (mfToastNextHandler) {
            try { nextBtn.removeEventListener('click', mfToastNextHandler); } catch {}
        }
        mfToastNextHandler = typeof opts.onNext === 'function' ? opts.onNext : null;
        if (mfToastNextHandler) nextBtn.addEventListener('click', mfToastNextHandler);
    }

    if (mfToastTimer) clearTimeout(mfToastTimer);
    if (!wantNext) {
        const ms = Math.max(300, Number(opts.ms) || Math.round(900 * (MF_ANIM_SLOW_FACTOR || 1)));
        mfToastTimer = setTimeout(() => {
            el.classList.remove('is-show');
            mfPendingToast = null;
        }, ms);
    }
}

function mfStripHtml(s) {
    return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function mfToastTextFromRaw(raw) {
    const msg = mfStripHtml(raw);
    if (!msg) return '';
    // A attacks B for N damage
    let m = msg.match(/^(.+?)\s+attacks\s+(.+?)\s+for\s+(\d+)\s+damage/i);
    if (m) {
        const a = m[1].trim();
        const b = m[2].trim();
        const n = Number(m[3]) || 0;
        return `${a} attacks ${b} -${n}`;
    }
    // A casts/uses Skill on B for N damage
    m = msg.match(/^(.+?)\s+(?:casts|uses|unleashes|strikes|smashes|charges)\s+(.+?)\s+(?:on\s+)?(.+?)\s+for\s+(\d+)\s+damage/i);
    if (m) {
        const a = m[1].trim();
        const skill = m[2].trim();
        const b = m[3].trim();
        const n = Number(m[4]) || 0;
        return `${a} ${skill} ${b} -${n}`;
    }
    // heal
    m = msg.match(/^(.+?)\s+.*heal(?:s|ing)?\s+(.+?)\s+for\s+(\d+)\s+HP/i);
    if (m) {
        const a = m[1].trim();
        const b = m[2].trim();
        const n = Number(m[3]) || 0;
        return `${a} heals ${b} +${n}`;
    }
    return msg;
}

const MF_RANGED_MONSTER_TYPES = new Set(['shaman', 'dark_mage', 'evil_dragon']);

function mfSnapshotHpMaps(state) {
    const players = Array.isArray(state?.players) ? state.players : [];
    const monsters = Array.isArray(state?.monsters) ? state.monsters : [];
    const pHp = new Map(players.map(p => [String(p?.studentId || ''), Number(p?.currentHP || 0)]));
    const mHp = new Map(monsters.map(m => [String(m?.id || ''), Number(m?.currentHP || 0)]));
    return { pHp, mHp, players, monsters };
}

function mfFindMonsterByName(monsters, name) {
    const n = String(name || '').trim();
    if (!n) return null;
    return (monsters || []).find(m => String(m?.name || '').trim() === n) || null;
}

function mfFindPlayerByName(players, name) {
    const n = String(name || '').trim();
    if (!n) return null;
    return (players || []).find(p => String(p?.studentName || '').trim() === n) || null;
}

function mfDeriveMonsterAttackActorTarget(rawMessage, prevState, nextState) {
    const msg = String(rawMessage || '');
    // Example: "Brute 2 attacks Wong Sir for 14 damage ..."
    const m = msg.match(/^(.+?)\s+attacks\s+(.+?)\s+for\s+(\d+)\s+damage/i);
    if (m) {
        const actorName = m[1];
        const targetName = m[2];
        const actor = mfFindMonsterByName(nextState?.monsters, actorName) || mfFindMonsterByName(prevState?.monsters, actorName);
        const target = mfFindPlayerByName(nextState?.players, targetName) || mfFindPlayerByName(prevState?.players, targetName);
        return { actor, target };
    }
    // Fallback: unknown; will use hp diffs only.
    return { actor: null, target: null };
}

function mfReplayFxFromMonsterTurnStep(rawMessage, prevState, nextState) {
    try {
        const prev = mfSnapshotHpMaps(prevState);
        const next = mfSnapshotHpMaps(nextState);

        const deltas = [];
        next.players.forEach(p => {
            const id = String(p?.studentId || '');
            if (!id) return;
            const before = prev.pHp.get(id);
            if (before === undefined) return;
            const after = Number(p?.currentHP || 0);
            const d = after - before;
            if (d !== 0) deltas.push({ kind: 'player', id, name: p.studentName, delta: d });
        });

        // Also track heals to monsters (e.g., Shaman healing allies).
        const monsterDeltas = [];
        next.monsters.forEach(m => {
            const id = String(m?.id || '');
            if (!id) return;
            const before = prev.mHp.get(id);
            if (before === undefined) return;
            const after = Number(m?.currentHP || 0);
            const d = after - before;
            if (d !== 0) monsterDeltas.push({ kind: 'monster', id, name: m.name, delta: d, type: m.type });
        });

        // Animate damage/heal to players.
        const dmgPlayers = deltas.filter(d => d.kind === 'player' && d.delta < 0);
        const healPlayers = deltas.filter(d => d.kind === 'player' && d.delta > 0);
        const healMonsters = monsterDeltas.filter(d => d.kind === 'monster' && d.delta > 0);

        const { actor, target } = mfDeriveMonsterAttackActorTarget(rawMessage, prev, next);
        const actorKey = actor?.id ? `monster:${actor.id}` : null;
        const isRanged = !!(actor && MF_RANGED_MONSTER_TYPES.has(String(actor.type || '').trim()));
        const msg = String(rawMessage || '');
        const isDodged = /dodges/i.test(msg) || /dodge/i.test(msg);

        // Taunt block: if target is shield warrior and taunt appears in message, slide toward protected ally.
        const tauntInMsg = /\(TAUNT\)|\(taunted\)|taunt/i.test(String(rawMessage || ''));
        if (tauntInMsg && target && String(target.characterClass || '') === 'shield_warrior') {
            const shieldKey = `player:${target.studentId}`;
            const protectedAlly = (prev.players || [])
                .filter(p => p && p.isAlive && p.studentId !== target.studentId)
                .reduce((best, p) => {
                    if (!best) return p;
                    return (Number(p.currentHP || 0) < Number(best.currentHP || 0)) ? p : best;
                }, null);
            if (protectedAlly) {
                mfAnimBlock(shieldKey, `player:${protectedAlly.studentId}`, { dur: 240 });
            }
        }

        if (dmgPlayers.length) {
            // Multi-target damage (AOE): big beam + shake, all targets jitter
            if (dmgPlayers.length > 1) {
                mfAnimShake(7, 260);
                dmgPlayers.forEach(ev => {
                    const tk = `player:${ev.id}`;
                    if (actorKey) {
                        mfAnimAddBeam(actorKey, tk, 'rgba(255,60,60,0.95)', isRanged ? 10 : 8, 320);
                    }
                    mfAnimHit(tk, { blinks: 2, dur: 320, amp: 5 });
                    mfAnimAddFloatAtUnit(tk, `${ev.delta}`, 'rgba(255,60,60,0.95)', 4000);
                });
            } else {
                const ev = dmgPlayers[0];
                const tk = `player:${ev.id}`;
                if (actorKey) {
                    if (isRanged) mfAnimAddBeam(actorKey, tk, 'rgba(255,60,60,0.95)', 6, 280);
                    else mfAnimDash(actorKey, tk, { dur: 340, gap: 12 });
                }
                mfAnimHit(tk, { blinks: 2, dur: 260, amp: 4 });
                mfAnimAddFloatAtUnit(tk, `${ev.delta}`, 'rgba(255,60,60,0.95)', 4000);
            }
        } else if (actorKey && target && target.studentId) {
            // No HP delta (e.g. dodge/0 dmg) but still show attack animation
            const tk = `player:${target.studentId}`;
            if (isRanged) mfAnimAddBeam(actorKey, tk, 'rgba(255,60,60,0.95)', 6, 280);
            else mfAnimDash(actorKey, tk, { dur: 340, gap: 12 });
            mfAnimHit(tk, { blinks: 2, dur: 260, amp: 4 });
            if (isDodged) mfAnimAddFloatAtUnit(tk, 'DODGE', 'rgba(255,255,255,0.92)', 2000);
        }

        // Heals to players (green floats)
        healPlayers.forEach(ev => {
            const tk = `player:${ev.id}`;
            mfAnimAddFloatAtUnit(tk, `+${ev.delta}`, 'rgba(34,197,94,0.95)', 4000);
            mfAnimHit(tk, { blinks: 2, dur: 260, amp: 2 });
            mfAnimHealGlow(tk, { dur: 520 });
        });

        // Heals to monsters (e.g., Shaman) - add healer sway + target glow.
        if (healMonsters.length) {
            // Determine if this heal is from Shaman (best-effort from log text).
            let healerKey = null;
            const msg = String(rawMessage || '');
            const isShamanHeal = /shaman/i.test(msg);
            if (isShamanHeal) {
                const monsters = Array.isArray(nextState?.monsters) ? nextState.monsters : [];
                const sh = monsters.find(m => m && (String(m.type || '').toLowerCase() === 'shaman' || /shaman/i.test(String(m.name || ''))) && m.isAlive);
                if (sh?.id) healerKey = `monster:${sh.id}`;
            }
            if (healerKey) {
                mfAnimSway(healerKey, { dur: 620, amp: 7 });
            }
            healMonsters.forEach(ev => {
                const tk = `monster:${ev.id}`;
                if (healerKey) mfAnimAddBeam(healerKey, tk, 'rgba(34,197,94,0.92)', 7, 360);
                mfAnimAddFloatAtUnit(tk, `+${ev.delta}`, 'rgba(34,197,94,0.95)', 4000);
                mfAnimHealGlow(tk, { dur: 620 });
            });
        }
    } catch (e) {
        console.warn('[mfReplayFx] failed', e);
    }
}

// Character selection UI state (client-only)
const charSelectUi = {};
let hasAutoPickedDefaultCharacter = false;

function getCharSelectState(studentId) {
    const id = String(studentId || '');
    if (!charSelectUi[id]) {
        charSelectUi[id] = { idx: 0 };
    }
    return charSelectUi[id];
}

function clampIndex(idx, len) {
    const n = Number(idx) || 0;
    const L = Number(len) || 0;
    if (L <= 0) return 0;
    return ((n % L) + L) % L;
}

async function charSelectPrev(studentId) {
    const st = getCharSelectState(studentId);
    const classes = getPlayerClasses();
    st.idx = clampIndex((st.idx || 0) - 1, classes.length);
    const clsId = classes[st.idx]?.id;
    if (clsId) {
        await selectCharacter(studentId, clsId);
        return;
    }
    renderCharacterSelection();
}

async function charSelectNext(studentId) {
    const st = getCharSelectState(studentId);
    const classes = getPlayerClasses();
    st.idx = clampIndex((st.idx || 0) + 1, classes.length);
    const clsId = classes[st.idx]?.id;
    if (clsId) {
        await selectCharacter(studentId, clsId);
        return;
    }
    renderCharacterSelection();
}

function charSelectSyncIndexToChosen(player) {
    const classes = getPlayerClasses();
    const st = getCharSelectState(player?.studentId);
    if (!classes.length) return;
    const chosenId = String(player?.characterClass || '');
    if (!chosenId) return;
    const idx = classes.findIndex(c => String(c.id) === chosenId);
    if (idx >= 0) st.idx = idx;
}

window.charSelectPrev = charSelectPrev;
window.charSelectNext = charSelectNext;

const LEVEL_DIFFICULTY_PRESETS = {
    easy: [
        { monsters: [
            { type: 'goblin', count: 1 },
            { type: 'slime', count: 1 },
            { type: 'brute', count: 1 },
            { type: 'shaman', count: 1 }
        ]},
        { monsters: [
            { type: 'goblin', count: 2 },
            { type: 'dark_mage', count: 1 },
            { type: 'brute', count: 2 },
            { type: 'shaman', count: 2 }
        ]},
        { monsters: [
            { type: 'goblin', count: 4 },
            { type: 'dark_mage', count: 2 },
            { type: 'brute', count: 2 },
            { type: 'shaman', count: 2 },
            { type: 'tiger', count: 1 }
        ]}
    ],
    medium: [
        { monsters: [
            { type: 'goblin', count: 2 },
            { type: 'slime', count: 2 },
            { type: 'brute', count: 2 },
            { type: 'shaman', count: 2 }
        ]},
        { monsters: [
            { type: 'goblin', count: 4 },
            { type: 'dark_mage', count: 2 },
            { type: 'brute', count: 4 },
            { type: 'shaman', count: 2 }
        ]},
        { monsters: [
            { type: 'goblin', count: 6 },
            { type: 'dark_mage', count: 3 },
            { type: 'brute', count: 4 },
            { type: 'shaman', count: 2 },
            { type: 'dragon', count: 1 }
        ]}
    ],
    hard: [
        { monsters: [
            { type: 'tiger', count: 1 },
            { type: 'brute', count: 2 },
            { type: 'shaman', count: 2 },
            { type: 'dark_mage', count: 1 }
        ]},
        { monsters: [
            { type: 'goblin', count: 4 },
            { type: 'dragon', count: 1 },
            { type: 'brute', count: 2 },
            { type: 'dark_mage', count: 1 }
        ]},
        { monsters: [
            { type: 'tiger', count: 1 },
            { type: 'dragon', count: 2 },
            { type: 'three_headed_wolf', count: 1 }
        ]}
    ]
};

