// Monster Fight Game Logic
// Use a unique constant name to avoid conflicts with other scripts
// Check if API_BASE exists in window scope, otherwise use default
// For standalone version, use API_CONFIG from config.js
const GAME_API_BASE = (typeof window !== 'undefined' && typeof window.API_BASE !== 'undefined') 
    ? window.API_BASE 
    : (typeof API_CONFIG !== 'undefined' ? API_CONFIG.baseURL : '/api');
let gameState = null;
let gameConfig = null;
let playerClasses = [];
let monsterTypes = [];

const CLASS_ICON_MAP = {};
let monsterIconMap = {};

function getImagesBase() {
    // Prefer absolute /game path (works in game-window and standalone served by server).
    // If opened as local file, fall back to relative.
    try {
        if (window.location && window.location.protocol === 'file:') return 'images/';
    } catch {}
    return '/game/monster-fight/images/';
}

function imageSrcForFile(file) {
    const f = String(file || '').trim();
    if (!f) return '';
    // Preserve nested folders while encoding each path segment (supports "Background/Background.jpg").
    const parts = f.split('/').filter(Boolean).map(encodeURIComponent);
    return `${getImagesBase()}${parts.join('/')}`;
}

function applyBackgroundTheme(theme) {
    const t = String(theme || '').trim() || 'white';
    const body = document.body;
    if (!body) return;

    if (t === 'image') {
        const url = imageSrcForFile('Background/Background.jpg') || 'images/Background/Background.jpg';
        body.style.setProperty('--mf-bg-url', `url("${url}")`);
        body.classList.add('mf-bg-image');
        // IMPORTANT: clear shorthand `background` so CSS background-image can take effect.
        body.style.background = '';
        body.style.backgroundColor = '';
        return;
    }

    body.classList.remove('mf-bg-image');
    body.style.removeProperty('--mf-bg-url');
    body.style.background = '#ffffff';
}

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

function renderIconWrap({ imgSrc, fallbackEmoji, alt, wrapClass }) {
    const src = String(imgSrc || '').trim();
    const fb = String(fallbackEmoji || '').trim() || '❓';
    const a = String(alt || '').trim() || '';
    const cls = String(wrapClass || '').trim();
    if (!src) {
        return `<span class="${cls}"><span class="mf-emoji-fallback">${escapeHtml(fb)}</span></span>`;
    }
    // Show emoji fallback only if image fails to load.
    return `
      <span class="${cls}">
        <img class="mf-icon-img" src="${escapeHtml(src)}" alt="${escapeHtml(a)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';">
        <span class="mf-emoji-fallback" style="display:none;">${escapeHtml(fb)}</span>
      </span>
    `;
}

function escapeHtml(text) {
    const s = String(text ?? '');
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
const POPUP_AUTO_CLOSE_MS = null;
let actionLogCollapsed = true; // default: hidden, open via topbar button
let monsterTurnReplay = { active: false, pendingWsState: null, onDone: null };

// Battle: disable popup UI, use timed replay steps instead.
const MF_DISABLE_ACTION_POPUPS = true;
const MF_REPLAY_STEP_MS = 900; // base step delay (scaled by animation slow factor)

// Canvas unit size scale (+10% from previous 1.2 => 1.32)
const MF_UNIT_SCALE = 1.32;

function mfGetBattleToastEl() {
    return document.getElementById('mfBattleToast');
}

let mfToastTimer = null;
function mfShowBattleToast(text, opts = {}) {
    const el = mfGetBattleToastEl();
    if (!el) return;
    const msg = String(text || '').trim();
    if (!msg) return;
    el.textContent = msg;
    el.classList.add('is-show');
    if (mfToastTimer) clearTimeout(mfToastTimer);
    const ms = Math.max(300, Number(opts.ms) || Math.round(900 * (MF_ANIM_SLOW_FACTOR || 1)));
    mfToastTimer = setTimeout(() => {
        el.classList.remove('is-show');
    }, ms);
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

        // Only animate damage/heal to players for this request.
        const dmgPlayers = deltas.filter(d => d.kind === 'player' && d.delta < 0);
        const healPlayers = deltas.filter(d => d.kind === 'player' && d.delta > 0);

        const { actor, target } = mfDeriveMonsterAttackActorTarget(rawMessage, prev, next);
        const actorKey = actor?.id ? `monster:${actor.id}` : null;
        const isRanged = !!(actor && MF_RANGED_MONSTER_TYPES.has(String(actor.type || '').trim()));

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
                    else mfAnimDash(actorKey, tk, { dur: 340 });
                }
                mfAnimHit(tk, { blinks: 2, dur: 260, amp: 4 });
                mfAnimAddFloatAtUnit(tk, `${ev.delta}`, 'rgba(255,60,60,0.95)', 4000);
            }
        }

        // Heals to players (green floats)
        healPlayers.forEach(ev => {
            const tk = `player:${ev.id}`;
            mfAnimAddFloatAtUnit(tk, `+${ev.delta}`, 'rgba(34,197,94,0.95)', 4000);
            mfAnimHit(tk, { blinks: 2, dur: 260, amp: 2 });
        });
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

function ensureActionPopupContainer() {
    if (!document.getElementById('actionPopupContainer')) {
        const container = document.createElement('div');
        container.id = 'actionPopupContainer';
        container.className = 'action-popup-container';
        document.body.appendChild(container);
    }
}

async function processActionQueue() {
    if (isShowingPopup) return;
    const item = actionQueue.shift();
    if (!item) {
        // If a monster-turn replay just finished, apply any pending WS sync now.
        if (monsterTurnReplay?.active && typeof monsterTurnReplay.onDone === 'function') {
            try { monsterTurnReplay.onDone(); } catch {}
            monsterTurnReplay.onDone = null;
        }
        return;
    }
    isShowingPopup = true;
    try {
        if (typeof item.beforeShow === 'function') {
            await Promise.resolve(item.beforeShow());
        }
    } catch (e) {
        console.warn('[actionQueue] beforeShow failed', e);
    }

    // No more popup UI in battle; just advance automatically.
    if (MF_DISABLE_ACTION_POPUPS) {
        try {
            const raw = item?.context?.rawMessage || item?.message || '';
            mfShowBattleToast(mfToastTextFromRaw(raw), { ms: Math.round(MF_REPLAY_STEP_MS * (MF_ANIM_SLOW_FACTOR || 1)) });
        } catch {}
        const delay = Math.max(0, Math.round(MF_REPLAY_STEP_MS * (MF_ANIM_SLOW_FACTOR || 1)));
        setTimeout(() => {
            isShowingPopup = false;
            void processActionQueue();
        }, delay);
        return;
    }

    showActionPopup(item.message, item.summary, item.context || {});
}

function queueActionPopup(message, summary, context = {}, opts = {}) {
    if (!message) return;
    actionQueue.push({ message, summary, context, beforeShow: opts?.beforeShow });
    void processActionQueue();
}

function parseTargetValue(rawValue) {
    if (!rawValue) {
        return { type: null, id: null };
    }
    if (rawValue.indexOf(':') === -1) {
        return { type: 'monster', id: rawValue };
    }
    const [type, ...rest] = rawValue.split(':');
    return { type, id: rest.join(':') };
}

function getSkillTargetType(player, skill) {
    if (!player || !skill) {
        return 'monster';
    }
    if (player.characterClass === 'priest') {
        if (skill.id === 'active_1') {
            return 'ally_alive';
        }
        if (skill.id === 'active_2') {
            return 'ally_dead';
        }
    }
    return 'monster';
}

function statusLabel(status) {
    const t = String(status?.type || '').trim().toLowerCase();
    if (!t) return '';
    if (t === 'poison') return 'Poison';
    if (t === 'bleed') return 'Bleed';
    if (t === 'bleeding_claw') return 'Bleed';
    if (t === 'silence') return 'Silence';
    if (t === 'stun') return 'Stun';
    if (t === 'freeze') return 'Freeze';
    if (t === 'attack') return 'ATK↓';
    if (t === 'regen') return 'Regen';
    return t;
}

function renderStatusText(entity) {
    const statuses = Array.isArray(entity?.statuses) ? entity.statuses : [];
    const labels = statuses
        .map(statusLabel)
        .filter(Boolean);
    if (!labels.length) return '';
    const txt = labels.slice(0, 3).join(', ') + (labels.length > 3 ? ` +${labels.length - 3}` : '');
    return `<span class="mf-status-text">${txt}</span>`;
}

function toggleActionLog() {
    actionLogCollapsed = !actionLogCollapsed;
    renderGame();
}

function applyMonsterTurnSnapshot(snapshot) {
    if (!snapshot || !gameState) return;
    try {
        if (snapshot.phase) gameState.phase = snapshot.phase;
        if (typeof snapshot.currentTurn === 'number') gameState.currentTurn = snapshot.currentTurn;
        if (Array.isArray(snapshot.players)) gameState.players = snapshot.players;
        if (Array.isArray(snapshot.monsters)) gameState.monsters = snapshot.monsters;
        if (Array.isArray(snapshot.actionLog)) gameState.actionLog = snapshot.actionLog;
    } catch (e) {
        console.warn('[monster-turn] failed to apply snapshot', e);
    }
}

function showActionPopup(message, summary, context) {
    ensureActionPopupContainer();
    const container = document.getElementById('actionPopupContainer');
    if (!container) {
        isShowingPopup = false;
        return;
    }

    const popup = document.createElement('div');
    popup.className = 'action-popup';
    popup.tabIndex = -1;
    
    const animationWrapper = document.createElement('div');
    animationWrapper.className = 'action-popup-animation';
    const kind = String(context?.actionKind || '').trim();
    animationWrapper.classList.add(kind === 'heal' ? 'is-heal' : 'is-attack');

    const actionTrail = document.createElement('div');
    actionTrail.className = 'action-popup-trail';
    animationWrapper.appendChild(actionTrail);

    const actionArrow = document.createElement('div');
    actionArrow.className = 'action-popup-arrow';
    animationWrapper.appendChild(actionArrow);

    const actorIcon = document.createElement('div');
    actorIcon.className = 'action-popup-actor';
    if (context.actorImgSrc) {
        const fb = String(context.actorEmoji || '🎭');
        actorIcon.innerHTML = `<img class="mf-popup-icon" alt="" src="${escapeHtml(String(context.actorImgSrc))}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';"><span class="mf-popup-emoji" style="display:none;">${escapeHtml(fb)}</span>`;
    } else {
        actorIcon.textContent = context.actorEmoji || '🎭';
    }

    const targetIcon = document.createElement('div');
    targetIcon.className = 'action-popup-target';
    if (context.targetImgSrc) {
        const fb = String(context.targetEmoji || '🎯');
        targetIcon.innerHTML = `<img class="mf-popup-icon" alt="" src="${escapeHtml(String(context.targetImgSrc))}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';"><span class="mf-popup-emoji" style="display:none;">${escapeHtml(fb)}</span>`;
    } else {
        targetIcon.textContent = context.targetEmoji || '🎯';
    }

    animationWrapper.appendChild(actorIcon);
    animationWrapper.appendChild(targetIcon);

    const text = document.createElement('div');
    text.className = 'action-popup-text';
    text.innerHTML = message.replace(/\n/g, '<br>');

    popup.appendChild(animationWrapper);
    popup.appendChild(text);

    if (summary && Array.isArray(summary) && summary.length > 0) {
        const summaryList = document.createElement('div');
        summaryList.className = 'action-popup-summary';
        summary.forEach(line => {
            const item = document.createElement('div');
            item.className = 'action-popup-summary-item';
            item.innerHTML = line.replace(/\n/g, '<br>');
            summaryList.appendChild(item);
        });
        popup.appendChild(summaryList);
    }

    const buttonRow = document.createElement('div');
    buttonRow.className = 'action-popup-buttons';
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'action-popup-confirm';
    confirmBtn.textContent = 'OK';
    buttonRow.appendChild(confirmBtn);
    popup.appendChild(buttonRow);

    container.appendChild(popup);
    popup.focus();

    const closePopup = () => {
        popup.classList.add('hide');
        setTimeout(() => {
            popup.remove();
            isShowingPopup = false;
            void processActionQueue();
        }, 300);
    };

    confirmBtn.addEventListener('click', closePopup);
    popup.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
            evt.preventDefault();
            closePopup();
        }
    });

    if (typeof POPUP_AUTO_CLOSE_MS === 'number' && POPUP_AUTO_CLOSE_MS > 0) {
        setTimeout(() => {
            if (document.body.contains(popup)) {
                closePopup();
            }
        }, POPUP_AUTO_CLOSE_MS);
    }
}

// Initialize WebSocket connection
function initGameWebSocket() {
    ensureActionPopupContainer();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    gameWs = new WebSocket(`${protocol}//${window.location.host}`);

    gameWs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'gameStateUpdated') {
            // During monster turn replay, ignore WS state changes (we apply snapshots step-by-step).
            if (monsterTurnReplay && monsterTurnReplay.active) {
                try { monsterTurnReplay.pendingWsState = data.gameState; } catch {}
                return;
            }
            // Check if user is currently interacting with input/select elements
            const activeElement = document.activeElement;
            const isUserInteracting = activeElement && (
                activeElement.tagName === 'INPUT' || 
                activeElement.tagName === 'SELECT' ||
                activeElement.id?.startsWith('puzzle_') ||
                activeElement.id?.startsWith('target_')
            );
            
            // Preserve current monsters state when updating from WebSocket
            const previousMonsters = gameState.monsters ? [...gameState.monsters] : null;
            
            // Save current input/select values before updating
            const inputValues = {};
            const selectValues = {};
            if (gameState.players) {
                gameState.players.forEach(player => {
                    const input = document.getElementById(`puzzle_${player.studentId}`);
                    if (input) {
                        inputValues[player.studentId] = input.value;
                    }
                    const select = document.getElementById(`target_${player.studentId}`);
                    if (select) {
                        selectValues[player.studentId] = select.value;
                    }
                });
            }
            
            gameState = data.gameState;
            
            // Update monster HP from server response, but preserve the array structure
            if (previousMonsters && previousMonsters.length > 0 && gameState.monsters) {
                const previousMap = new Map(previousMonsters.map(monster => [monster.id, monster]));
                const merged = gameState.monsters.map(serverMonster => {
                    const existing = previousMap.get(serverMonster.id);
                    if (existing) {
                        if (serverMonster.currentHP > existing.currentHP) {
                            console.log(`[WebSocket] Monster ${serverMonster.name} healed: ${existing.currentHP} -> ${serverMonster.currentHP}`);
                        }
                        return { ...existing, ...serverMonster };
                    }
                    console.log('[WebSocket] New monster detected:', serverMonster);
                    return serverMonster;
                });
                gameState.monsters = merged;
            }
            
            // Restore input/select values after updating gameState
            if (gameState.players) {
                gameState.players.forEach(player => {
                    if (inputValues[player.studentId] !== undefined) {
                        player.puzzlePoints = parseInt(inputValues[player.studentId]) || 0;
                    }
                });
            }
            
            const currentLogLength = Array.isArray(gameState.actionLog) ? gameState.actionLog.length : 0;
            if (currentLogLength > lastActionLogLength) {
                const newLogs = gameState.actionLog.slice(lastActionLogLength);
                newLogs.forEach(log => {
                    if (log && log.message) {
                        const summary = Array.isArray(log.summaryDetails) ? decorateSummaryLines(log.summaryDetails) : null;
                        const context = derivePopupContext(log.message);
                        const decoratedMessage = decorateMessageWithIcons(log.message);
                        queueActionPopup(decoratedMessage, summary, context);
                    }
                });
            }
            lastActionLogLength = currentLogLength;
            
            // If user is interacting, delay re-render or skip if it's just a state sync
            if (isUserInteracting) {
                console.log('User is interacting, delaying re-render to preserve focus');
                // Only update data, don't re-render immediately
                // Re-render will happen when user finishes interaction (onblur)
                return;
            }
            
            // Save focused element before render
            const focusedElementId = activeElement?.id;
            const focusedElementTag = activeElement?.tagName;
            
            renderGame();
            
            // Restore focus and values after render
            if (focusedElementId && (focusedElementTag === 'INPUT' || focusedElementTag === 'SELECT')) {
                setTimeout(() => {
                    const element = document.getElementById(focusedElementId);
                    if (element) {
                        element.focus();
                        if (focusedElementTag === 'INPUT') {
                            element.setSelectionRange(element.value.length, element.value.length);
                        }
                        if (focusedElementTag === 'SELECT' && selectValues[element.id.replace('target_', '')]) {
                            element.value = selectValues[element.id.replace('target_', '')];
                        }
                        console.log('Focus restored to:', focusedElementId);
                    }
                }, 0);
            }
        } else if (data.type === 'gameConfigUpdated') {
            gameConfig = data.config;
            // Safety check: ensure arrays are valid before assigning
            playerClasses = Array.isArray(data.playerClasses) ? data.playerClasses : (playerClasses || []);
            monsterTypes = Array.isArray(data.monsterTypes) ? data.monsterTypes : (monsterTypes || []);
            cacheIconMaps();
            // Make available globally
            window.playerClasses = playerClasses;
            window.monsterTypes = monsterTypes;
        }
    };

    gameWs.onerror = (error) => {
        console.error('Game WebSocket error:', error);
    };

    gameWs.onclose = () => {
        console.log('Game WebSocket closed, reconnecting...');
        setTimeout(initGameWebSocket, 3000);
    };
}

// Load game configuration
async function loadGameConfig() {
    try {
        console.log('Fetching game config from:', `${GAME_API_BASE}/game/config`);
        const response = await fetch(`${GAME_API_BASE}/game/config`);
        if (!response.ok) {
            throw new Error(`Failed to load game config: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        gameConfig = data.config;
        // Safety check: ensure arrays are valid before assigning
        playerClasses = Array.isArray(data.playerClasses) ? data.playerClasses : [];
        monsterTypes = Array.isArray(data.monsterTypes) ? data.monsterTypes : [];
        cacheIconMaps();
        // Make available globally
        window.playerClasses = playerClasses;
        window.monsterTypes = monsterTypes;
        // Apply background theme from config (defaults to white)
        applyBackgroundTheme(gameConfig?.backgroundTheme || 'white');
        console.log('Game config loaded successfully');
        console.log(`Loaded ${playerClasses.length} player classes and ${monsterTypes.length} monster types`);
    } catch (error) {
        console.error('Error loading game config:', error);
        throw error;
    }
}

// Load game state
async function loadGameState() {
    try {
        console.log('Fetching game state from:', `${GAME_API_BASE}/game/state`);
        const response = await fetch(`${GAME_API_BASE}/game/state`);
        if (response.status === 404) {
            console.log('No game state found (404)');
            return null;
        }
        if (!response.ok) {
            throw new Error(`Failed to load game state: ${response.status} ${response.statusText}`);
        }
        const state = await response.json();
        console.log('Game state loaded successfully');
        return state;
    } catch (error) {
        console.error('Error loading game state:', error);
        return null;
    }
}

// Initialize Monster Fight game
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
                    <p>No active game found. Please start a new game from the Game Zone.</p>
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
    if (mfAnim.shake && (now - mfAnim.shake.t0) > mfAnim.shake.dur) mfAnim.shake = null;
}

function mfAnimAddFloatAt(x, y, text, color = 'rgba(255,60,60,0.95)', dur = 4000, rise = 28) {
    mfAnim.floats.push({ x: Number(x) || 0, y: Number(y) || 0, text: String(text || ''), color, t0: mfNow(), dur, rise });
}

function mfAnimAddFloatAtUnit(key, text, color, dur = 4000) {
    const c = mfUnitCenter(key);
    if (!c) return;
    mfAnimAddFloatAt(c.x, c.y - 18, text, color, dur, 34);
}

function mfAnimAddBeam(fromKey, toKey, color = 'rgba(255,60,60,0.95)', width = 5, dur = 260) {
    mfAnim.beams.push({ fromKey: String(fromKey || ''), toKey: String(toKey || ''), color, width, t0: mfNow(), dur: mfAnimMs(dur) });
}

function mfAnimHit(targetKey, opts = {}) {
    const k = String(targetKey || '');
    mfAnim.flashes.set(k, { t0: mfNow(), dur: mfAnimMs(opts.dur ?? 260), blinks: opts.blinks ?? 2 });
    mfAnim.jitters.set(k, { t0: mfNow(), dur: mfAnimMs(opts.jitterDur ?? 260), amp: opts.amp ?? 3 });
}

function mfAnimDash(attKey, toKey, opts = {}) {
    mfAnim.dashes.push({
        attKey: String(attKey || ''),
        fromKey: String(attKey || ''),
        toKey: String(toKey || ''),
        t0: mfNow(),
        dur: mfAnimMs(opts.dur ?? 320),
        reach: opts.reach ?? 0.55
    });
}

function mfAnimBlock(blockerKey, victimKey, opts = {}) {
    mfAnim.blocks.push({
        blockerKey: String(blockerKey || ''),
        victimKey: String(victimKey || ''),
        t0: mfNow(),
        dur: mfAnimMs(opts.dur ?? 240),
        reach: opts.reach ?? 0.85
    });
}

function mfAnimFlip(key, flips = 3, dur = 420) {
    mfAnim.flips.set(String(key || ''), { t0: mfNow(), dur: mfAnimMs(dur), flips });
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
        const from = mfUnitCenter(d.fromKey);
        const to = mfUnitCenter(d.toKey);
        if (!from || !to) continue;
        const t = (now - d.t0) / d.dur;
        if (t < 0 || t > 1) continue;
        const ease = (t < 0.5) ? (t / 0.5) : (1 - (t - 0.5) / 0.5);
        const vx = to.x - from.x;
        const vy = to.y - from.y;
        dx += vx * d.reach * ease;
        dy += vy * d.reach * ease;
    }

    // taunt block offsets (blocker slides toward victim quickly)
    for (const b of mfAnim.blocks) {
        if (b.blockerKey !== k) continue;
        const from = mfUnitCenter(b.blockerKey);
        const to = mfUnitCenter(b.victimKey);
        if (!from || !to) continue;
        const t = (now - b.t0) / b.dur;
        if (t < 0 || t > 1) continue;
        const ease = Math.min(1, Math.max(0, t));
        const vx = to.x - from.x;
        const vy = to.y - from.y;
        dx += vx * b.reach * ease;
        dy += vy * b.reach * ease;
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

function drawHpBar(ctx, x, y, w, h, pct, text) {
    const p = Math.max(0, Math.min(1, pct));
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = 'rgba(90, 200, 90, 0.95)';
    ctx.fillRect(x - w / 2, y - h / 2, w * p, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);

    if (text) {
        ctx.font = '900 9px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        const s = String(text);
        ctx.strokeText(s, x, y + 0.5);
        ctx.fillText(s, x, y + 0.5);
    }
    ctx.restore();
}

function drawUnit(ctx, unit, now) {
    const {
        key,
        x, y,
        imgSrc,
        name,
        currentHP,
        maxHP,
        isAlive = true,
        isMonster = false
    } = unit;

    const off = mfAnimOffsetForKey(key, now);
    const ux = x + off.dx;
    const uy = y + off.dy;

    // sprite scale
    const w = Math.round(76 * MF_UNIT_SCALE);
    const h = Math.round(76 * MF_UNIT_SCALE);
    const img = getImgSync(imgSrc);

    // Track alive/dead transition for flash effect
    if (key) {
        const prevAlive = mfLastAliveByKey.get(key);
        if (prevAlive === true && !isAlive) {
            mfDeathFxByKey.set(key, { t0: now });
        }
        mfLastAliveByKey.set(key, !!isAlive);
        if (isAlive) {
            mfDeathFxByKey.delete(key);
        }
    }

    ctx.save();

    if (!isAlive) {
        const fx = key ? mfDeathFxByKey.get(key) : null;
        const age = fx ? (now - fx.t0) : 999999;
        const flashMs = 520; // total flash window
        if (fx && age < flashMs) {
            // Flash a few times: alternate visibility
            const t = Math.floor(age / 80);
            ctx.globalAlpha = (t % 2 === 0) ? 1.0 : 0.15;
        } else {
            // Settled dead look
            ctx.globalAlpha = 0.35;
            // Canvas filter is supported in modern browsers; fallback is just alpha.
            try { ctx.filter = 'grayscale(1)'; } catch {}
        }
    }

    // sprite
    if (img) {
        // hit flash alpha (stacked on top of death alpha)
        ctx.globalAlpha *= mfAnimFlashAlpha(key, now);
        const flipped = mfAnimIsFlipped(key, now);
        if (flipped) {
            ctx.save();
            ctx.translate(ux, uy);
            ctx.scale(-1, 1);
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            ctx.restore();
        } else {
            ctx.drawImage(img, ux - w / 2, uy - h / 2, w, h);
        }
    } else {
        ctx.fillStyle = isMonster ? 'rgba(255,80,80,0.55)' : 'rgba(80,160,255,0.55)';
        ctx.beginPath();
        ctx.arc(ux, uy, 28, 0, Math.PI * 2);
        ctx.fill();
    }

    // hp
    const pct = (maxHP > 0) ? (Number(currentHP || 0) / Number(maxHP || 1)) : 0;
    // bring HP closer to sprite
    const hpW = Math.round(72 * MF_UNIT_SCALE);
    const hpH = 9;
    const hpX = ux;
    const hpY = uy + h / 2 + 6;
    const hpText = `${escapeHtml(String(currentHP || 0))}/${escapeHtml(String(maxHP || 0))}`;
    drawHpBar(ctx, hpX, hpY, hpW, hpH, pct, hpText);

    // action taken tick (players only)
    const acted = !!(!isMonster && (unit?.raw?.hasActed));
    if (acted) {
        ctx.save();
        ctx.font = '900 12px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.fillStyle = 'rgba(34, 197, 94, 0.95)';
        ctx.strokeText('✓', hpX - hpW / 2 - 10, hpY);
        ctx.fillText('✓', hpX - hpW / 2 - 10, hpY);
        ctx.restore();
    }

    // statuses to the right of HP bar
    const statuses = mfExtractStatusesWithPassives(unit.raw || unit);
    drawStatusIcons(ctx, hpX + hpW / 2 + 6, hpY, statuses);

    ctx.restore();
}

function drawBattleEntities(ctx, stageW, stageH) {
    if (!gameState) return;
    const playersAll = Array.isArray(gameState.players) ? gameState.players.filter(p => p) : [];
    const monstersAll = Array.isArray(gameState.monsters) ? gameState.monsters.filter(m => m) : [];

    // Arena region: avoid top/bottom edges
    const top = 90;
    const bottom = Math.max(top + 200, stageH - 90);
    const arenaH = Math.max(240, bottom - top);

    // Bring both sides closer together
    const monstersBaseX = stageW * 0.38;
    const playersBaseX = stageW * 0.62;

    const monsters = layoutSide(
        monstersAll.map(m => ({
            key: `monster:${m.id}`,
            isMonster: true,
            isAlive: m.isAlive,
            id: m.id,
            name: m.name,
            currentHP: m.currentHP,
            maxHP: m.maxHP,
            raw: m,
            imgSrc: imageSrcForFile(monsterImageFileByType(m.type))
        })),
        monstersBaseX,
        -1,
        top,
        arenaH
    );

    const players = layoutSide(
        playersAll.map(p => ({
            key: `player:${p.studentId}`,
            isMonster: false,
            isAlive: p.isAlive,
            id: p.studentId,
            name: p.studentName,
            currentHP: p.currentHP,
            maxHP: p.maxHP,
            raw: p,
            imgSrc: imageSrcForFile(classImageFileById(p.characterClass))
        })),
        playersBaseX,
        +1,
        top,
        arenaH,
        { colGap: 100 } // +10px between left/right player columns
    );

    // Save unit bounds for hit-testing/HUD anchoring (DOM coordinates)
    const spriteW = Math.round(76 * MF_UNIT_SCALE);
    const spriteH = Math.round(76 * MF_UNIT_SCALE);
    mfScene.stageW = stageW;
    mfScene.stageH = stageH;
    mfScene.units = [
        ...monsters.map(u => ({ ...u, kind: 'monster', w: spriteW, h: spriteH })),
        ...players.map(u => ({ ...u, kind: 'player', w: spriteW, h: spriteH }))
    ];

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    // Draw monsters then players (players on top)
    monsters.forEach(u => drawUnit(ctx, u, now));
    players.forEach(u => drawUnit(ctx, u, now));

    // Hover name label (semi-transparent, centered on sprite)
    const hoveredKey = mfBattleUi?.hoveredKey;
    if (hoveredKey) {
        const u = (mfScene.units || []).find(it => it && it.key === hoveredKey);
        if (u && u.name) {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '900 14px Segoe UI, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.78)';
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = 4;
            ctx.strokeText(String(u.name), u.x, u.y);
            ctx.fillText(String(u.name), u.x, u.y);
            ctx.restore();
        }
    }
}

function mfGetStageEl() {
    return document.querySelector('.mf-battle-stage');
}

function mfGetHudEl() {
    return document.getElementById('mfBattleHud');
}

function mfClamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
}

function mfHitTestUnit(stageX, stageY) {
    // Prefer topmost (players drawn last), so iterate backwards.
    const units = Array.isArray(mfScene.units) ? mfScene.units : [];
    for (let i = units.length - 1; i >= 0; i--) {
        const u = units[i];
        const w = Number(u.w) || 0;
        const h = Number(u.h) || 0;
        if (!w || !h) continue;
        if (stageX >= u.x - w / 2 && stageX <= u.x + w / 2 && stageY >= u.y - h / 2 && stageY <= u.y + h / 2) {
            return u;
        }
    }
    return null;
}

function mfSkillTargetType(skill) {
    const e = skill && typeof skill === 'object' ? (skill.effect || {}) : {};
    if (e && e.revive) return 'ally_dead';
    if (e && (e.heal || e.teamHeal || e.healPercent)) return 'ally_alive';
    return 'monster';
}

function mfIsAoeSkill(player, skill) {
    if (!skill || typeof skill !== 'object') return false;
    const e = (skill.effect && typeof skill.effect === 'object') ? skill.effect : {};
    // Prefer explicit effect flags if present
    if (e.aoe || e.allEnemies || e.area || e.teamDamage || e.damageAll || e.hitAll || e.areaDamage) return true;
    // Fallback: detect from name/description for Wizard Fireball
    const cls = String(player?.characterClass || '').toLowerCase();
    const nm = String(skill.name || skill.id || '').toLowerCase();
    const desc = String(skill.description || '').toLowerCase();
    if (cls === 'wizard' && (nm.includes('fireball') || desc.includes('fireball'))) return true;
    if (desc.includes('all enemies') || desc.includes('all enemy') || desc.includes('area damage')) return true;
    return false;
}

function mfStatusIcon(status) {
    const t = String(status?.type || '').trim().toLowerCase();
    if (!t) return null;
    if (t === 'taunt') return { key: 'taunt', ch: '🛡️' };
    if (t === 'poison') return { key: 'poison', ch: '☠️' };
    if (t === 'bleed' || t === 'bleeding_claw') return { key: 'bleed', ch: '🩸' };
    if (t === 'silence') return { key: 'silence', ch: '🤫' };
    if (t === 'stun') return { key: 'stun', ch: '💫' };
    if (t === 'freeze') return { key: 'freeze', ch: '❄️' };
    if (t === 'burn') return { key: 'burn', ch: '🔥' };
    if (t === 'regen') return { key: 'regen', ch: '💚' };
    if (t === 'attack') return { key: 'atkdown', ch: '⬇️' };
    return { key: t, ch: t.slice(0, 1).toUpperCase() };
}

function mfExtractStatuses(entity) {
    const arr = Array.isArray(entity?.statuses) ? entity.statuses : [];
    // Deduplicate by type
    const seen = new Set();
    const out = [];
    for (const s of arr) {
        const t = String(s?.type || '').trim().toLowerCase();
        if (!t || seen.has(t)) continue;
        seen.add(t);
        out.push(s);
        if (out.length >= 6) break;
    }
    return out;
}

function mfHasStatus(entity, type) {
    const want = String(type || '').trim().toLowerCase();
    if (!want) return false;
    const arr = Array.isArray(entity?.statuses) ? entity.statuses : [];
    return arr.some(s => String(s?.type || '').trim().toLowerCase() === want);
}

function mfHasPassiveFlag(entity, flag) {
    const want = String(flag || '').trim();
    if (!want) return false;
    const skills = Array.isArray(entity?.skills) ? entity.skills : [];
    return skills.some(s => s && s.type === 'passive' && s.effect && typeof s.effect === 'object' && !!s.effect[want]);
}

function mfExtractStatusesWithPassives(entity) {
    const out = mfExtractStatuses(entity);
    // Show always-on taunt passive as a visible icon
    if (mfHasPassiveFlag(entity, 'tauntMonsters') || mfHasPassiveFlag(entity, 'tauntPlayers')) {
        out.unshift({ type: 'taunt' });
    }
    return out.slice(0, 6);
}

function drawStatusIcons(ctx, xRight, yCenter, statuses) {
    const list = Array.isArray(statuses) ? statuses : [];
    if (!list.length) return;
    const size = 14;
    const gap = 4;
    let x = xRight;
    for (let i = 0; i < list.length; i++) {
        const icon = mfStatusIcon(list[i]);
        if (!icon) continue;
        ctx.save();
        ctx.font = '900 12px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // subtle background chip
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        const r = 6;
        const left = x + i * (size + gap);
        const top = yCenter - size / 2;
        // rounded rect
        ctx.moveTo(left + r, top);
        ctx.arcTo(left + size, top, left + size, top + size, r);
        ctx.arcTo(left + size, top + size, left, top + size, r);
        ctx.arcTo(left, top + size, left, top, r);
        ctx.arcTo(left, top, left + size, top, r);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(String(icon.ch || ''), left + size / 2, yCenter + 0.5);
        ctx.restore();
    }
}

function mfRenderStatusIconsInline(entity) {
    const statuses = mfExtractStatuses(entity);
    if (!statuses.length) return '';
    return `
        <div class="mf-inline-statuses" aria-label="Statuses">
            ${statuses.map(s => {
                const ico = mfStatusIcon(s);
                if (!ico) return '';
                return `<span class="mf-inline-status" title="${escapeHtml(statusLabel(s) || String(s?.type || ''))}">${escapeHtml(String(ico.ch || ''))}</span>`;
            }).join('')}
        </div>
    `;
}

function mfRenderBattleHud() {
    const hud = mfGetHudEl();
    const stage = mfGetStageEl();
    if (!hud || !stage || !gameState) return;

    const selectedPlayerId = mfBattleUi.selectedPlayerId;
    const selectedMonsterId = mfBattleUi.selectedMonsterId;
    const player = selectedPlayerId ? (gameState.players || []).find(p => p && p.studentId === selectedPlayerId) : null;
    const playerUnit = selectedPlayerId ? (mfScene.units || []).find(u => u && u.kind === 'player' && u.id === selectedPlayerId) : null;
    const monster = selectedMonsterId ? (gameState.monsters || []).find(m => m && m.id === selectedMonsterId) : null;
    const monsterUnit = selectedMonsterId ? (mfScene.units || []).find(u => u && u.kind === 'monster' && u.id === selectedMonsterId) : null;

    const stageW = stage.clientWidth || 1;
    const stageH = stage.clientHeight || 1;

    const parts = [];

    // Player panel (actions / revive)
    if (player && playerUnit) {
        const canAct = !!(gameState.phase === 'player_turn' && player.isAlive && !player.hasActed);
        const isSilenced = mfHasStatus(player, 'silence');
        const draftPts = mfBattleUi.ptsDraft[selectedPlayerId];
        const ptsValue = Number.isFinite(Number(draftPts)) ? Number(draftPts) : (Number(player.puzzlePoints) || 0);

        const activeSkills = Array.isArray(player.skills)
            ? player.skills.filter(s => s && s.type === 'active')
            : [];
        const skillA = activeSkills[0] || null;
        const skillB = activeSkills[1] || null;

        const cd = (sid) => {
            const v = player.skillCooldowns && sid ? player.skillCooldowns[sid] : 0;
            return Number(v) || 0;
        };

        const targeting = mfBattleUi.targeting && mfBattleUi.targeting.actorId === selectedPlayerId ? mfBattleUi.targeting : null;

        // Fixed panel position (same spot for all players): inside-map, far-right
        const panelW = 380;
        const panelH = 300;
        const margin = 10;
        const left = mfClamp(Math.round(stageW - panelW - margin), margin, Math.max(margin, stageW - panelW - margin));
        // Move panel down by +200px (keep inside map)
        const top = mfClamp(margin + 200, margin, Math.max(margin, stageH - panelH - margin));

        const aCd = skillA ? cd(skillA.id) : 0;
        const bCd = skillB ? cd(skillB.id) : 0;

        const renderSkillRow = ({ kind, emoji, title, descTop, descMid, descBot, disabled, act, skillId, cdValue }) => {
        const cdChip = cdValue > 0 ? `<span class="mf-action-cd">${escapeHtml(String(cdValue))}</span>` : '';
        return `
            <div class="mf-skill-row ${disabled ? 'is-disabled' : ''}">
                <button class="mf-action-btn ${disabled ? 'is-disabled' : ''}" type="button"
                        data-mf="act" data-act="${escapeHtml(act)}" ${skillId ? `data-skill="${escapeHtml(String(skillId))}"` : ''}>
                    ${escapeHtml(String(emoji || '✨'))}${cdChip}
                </button>
                <div class="mf-skill-desc">
                    <div class="mf-skill-desc-top">${escapeHtml(String(title || kind || ''))}</div>
                    <div class="mf-skill-desc-mid">${escapeHtml(String(descMid || descTop || ''))}</div>
                    <div class="mf-skill-desc-bot">${escapeHtml(String(descBot || ''))}</div>
                </div>
            </div>
        `;
        };

        const baseCd = (s) => Math.max(0, Number(s?.cooldown) || 0);
        const actions = [];
        actions.push({
            kind: 'attack',
            emoji: '⚔️',
            title: 'Attack',
            descMid: 'Basic',
            descBot: 'Attack a monster',
            disabled: !canAct,
            act: 'attack',
            cdValue: 0
        });
        if (skillA) {
            actions.push({
                kind: skillA.id,
                emoji: skillA.emoji || '✨',
                title: skillA.name || 'Skill',
                descMid: `${skillA.type || 'active'}${baseCd(skillA) ? `  |  CD ${baseCd(skillA)}` : ''}${aCd > 0 ? `  (now ${aCd})` : ''}`,
                descBot: skillA.description || '',
                disabled: !canAct || aCd > 0 || isSilenced,
                act: 'skill',
                skillId: skillA.id,
                cdValue: aCd
            });
        }
        if (skillB) {
            actions.push({
                kind: skillB.id,
                emoji: skillB.emoji || '✨',
                title: skillB.name || 'Skill',
                descMid: `${skillB.type || 'active'}${baseCd(skillB) ? `  |  CD ${baseCd(skillB)}` : ''}${bCd > 0 ? `  (now ${bCd})` : ''}`,
                descBot: skillB.description || '',
                disabled: !canAct || bCd > 0 || isSilenced,
                act: 'skill',
                skillId: skillB.id,
                cdValue: bCd
            });
        }

        parts.push(`
        <div class="mf-action-panel mf-player-panel" data-mf-panel="player" style="left:${escapeHtml(String(left))}px; top:${escapeHtml(String(top))}px;">
            <div class="mf-player-panel-top">
                <div class="mf-player-panel-top-row">
                    <div class="mf-action-panel-name">${escapeHtml(String(player.studentName || ''))}</div>
                    <button class="mf-action-panel-close" type="button" data-mf="close">×</button>
                </div>
                <div class="mf-player-panel-top-main">
                    <div class="mf-player-panel-avatar">
                        ${renderIconWrap({
                            imgSrc: imageSrcForFile(classImageFileById(player.characterClass)),
                            fallbackEmoji: getPlayerClasses().find(c => c.id === player.characterClass)?.emoji || '❓',
                            alt: 'Character',
                            wrapClass: 'mf-player-panel-avatarwrap'
                        })}
                    </div>
                    <div class="mf-player-panel-hp">
                        <div class="mf-player-panel-hpbar">
                            <div class="mf-player-panel-hpfill" style="width:${escapeHtml(String(player.maxHP > 0 ? Math.max(0, Math.min(100, (player.currentHP / player.maxHP) * 100)) : 0))}%"></div>
                        </div>
                        <div class="mf-player-panel-hptext">${escapeHtml(String(player.currentHP || 0))}/${escapeHtml(String(player.maxHP || 0))} HP</div>
                        <div class="mf-player-panel-statline">
                            <span><b>ATK</b> ${escapeHtml(String(player.attack || 0))}</span>
                            ${mfRenderStatusIconsInline(player)}
                        </div>
                    </div>
                </div>
            </div>
            ${player.isAlive ? `
                ${player.hasActed ? `<div class="mf-action-taken">✓ Action Taken</div>` : ''}
                <div class="mf-player-panel-mid">
                    <div class="mf-action-pts">
                        <div class="mf-action-pts-label">Puzzle Points</div>
                        <input type="number" min="0" max="999" value="${escapeHtml(String(ptsValue))}" data-mf="pts" ${canAct ? '' : 'disabled'} />
                    </div>
                </div>
                <div class="mf-player-panel-bot">
                    <div class="mf-action-grid3">
                        <div class="mf-action-icons">
                            ${actions.map(a => `
                                <button class="mf-action-btn ${a.disabled ? 'is-disabled' : ''}" type="button"
                                        data-mf="act" data-act="${escapeHtml(a.act)}" ${a.skillId ? `data-skill="${escapeHtml(String(a.skillId))}"` : ''}
                                        ${a.disabled ? 'disabled' : ''}>
                                    ${escapeHtml(String(a.emoji || '✨'))}
                                    ${a.cdValue > 0 ? `<span class="mf-action-cd">${escapeHtml(String(a.cdValue))}</span>` : ''}
                                </button>
                            `).join('')}
                        </div>
                        <div class="mf-action-desc">
                            ${actions.map(a => `
                                <div class="mf-skill-desc ${a.disabled ? 'is-disabled' : ''}">
                                    <div class="mf-skill-desc-top">${escapeHtml(String(a.title || a.kind || ''))}</div>
                                    <div class="mf-skill-desc-mid">${escapeHtml(String(a.descMid || ''))}</div>
                                    <div class="mf-skill-desc-bot">${escapeHtml(String(a.descBot || ''))}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            ` : `
                <div class="mf-revive-wrap">
                    <div class="mf-action-stats">
                        <div class="mf-action-stat">
                            <span>HP</span>
                            <b>0/${escapeHtml(String(player.maxHP || 0))}</b>
                        </div>
                        <div class="mf-action-stat">
                            <span>ATK</span>
                            <b>${escapeHtml(String(player.attack || 0))}</b>
                        </div>
                    </div>
                    <button class="btn btn-sm btn-warning" type="button" data-mf="reviveOpen">💫 Revive</button>
                    ${(() => {
                        const draft = mfBattleUi.reviveDraft[selectedPlayerId];
                        const v = Number.isFinite(Number(draft)) ? Number(draft) : 1;
                        const max = Math.max(1, Number(player.puzzlePoints || 0));
                        return `
                            <div class="mf-revive-inline ${mfBattleUi.reviveOpenFor === selectedPlayerId ? '' : 'is-hidden'}">
                                <div class="mf-revive-label">Puzzle Points</div>
                                <input type="number" min="1" max="${escapeHtml(String(max))}" value="${escapeHtml(String(v))}" data-mf="revivePts" />
                                <button class="btn btn-primary btn-sm" type="button" data-mf="reviveAttempt">Attempt</button>
                            </div>
                        `;
                    })()}
                </div>
            `}
        </div>
        `);

        // Toggle targeting cursor
        if (targeting) stage.classList.add('mf-targeting');
        else stage.classList.remove('mf-targeting');
    }

    // Monster panel (info) - fixed inside-map, far-left, same style as player panel
    if (monster) {
        const panelW = 380;
        const panelH = 360;
        const margin = 10;
        const left = margin;
        // Move panel down by +200px (keep inside map)
        const top = mfClamp(margin + 200, margin, Math.max(margin, stageH - panelH - margin));

        // skills from instance fallback to type template (include passive)
        const mt = (typeof getMonsterTypes === 'function') ? (getMonsterTypes().find(t => t && t.id === monster.type) || null) : null;
        const skills = Array.isArray(monster.skills) && monster.skills.length ? monster.skills : (Array.isArray(mt?.skills) ? mt.skills : []);
        const sortedSkills = Array.isArray(skills)
            ? [...skills].filter(Boolean).sort((a, b) => {
                const ta = String(a?.type || '');
                const tb = String(b?.type || '');
                if (ta === tb) return 0;
                if (ta === 'passive') return -1;
                if (tb === 'passive') return 1;
                return 0;
            })
            : [];

        const rows = sortedSkills.map(s => {
            const base = Math.max(0, Number(s?.cooldown) || 0);
            const typ = String(s.type || '');
            return `
                <div class="mf-monster-skill">
                    <div class="mf-monster-skill-icon">${escapeHtml(String(s.emoji || (typ === 'passive' ? '🛡️' : '✨')))}</div>
                    <div class="mf-monster-skill-body">
                        <div class="mf-monster-skill-name">${escapeHtml(String(s.name || (typ === 'passive' ? 'Passive' : 'Skill')))}</div>
                        <div class="mf-monster-skill-meta">${escapeHtml(`${typ}${base ? `  |  CD ${base}` : ''}`)}</div>
                        <div class="mf-monster-skill-desc">${escapeHtml(String(s.description || ''))}</div>
                    </div>
                </div>
            `;
        }).join('');

        const hpPct = monster.maxHP > 0 ? Math.max(0, Math.min(100, (monster.currentHP / monster.maxHP) * 100)) : 0;
        parts.push(`
            <div class="mf-action-panel mf-monster-panel" data-mf-panel="monster" style="left:${Math.round(left)}px; top:${Math.round(top)}px;">
                <div class="mf-player-panel-top">
                    <div class="mf-player-panel-top-row">
                        <div class="mf-action-panel-name">${escapeHtml(String(monster.name || 'Monster'))}</div>
                        <button class="mf-action-panel-close" type="button" data-mf="closeMonster">×</button>
                    </div>
                    <div class="mf-player-panel-top-main">
                        <div class="mf-player-panel-avatar">
                            ${renderIconWrap({
                                imgSrc: imageSrcForFile(monsterImageFileByType(monster.type)),
                                fallbackEmoji: (mt && mt.emoji) ? mt.emoji : '👾',
                                alt: 'Monster',
                                wrapClass: 'mf-player-panel-avatarwrap'
                            })}
                        </div>
                        <div class="mf-player-panel-hp">
                            <div class="mf-player-panel-hpbar">
                                <div class="mf-player-panel-hpfill" style="width:${escapeHtml(String(hpPct))}%"></div>
                            </div>
                            <div class="mf-player-panel-hptext">${escapeHtml(String(monster.currentHP || 0))}/${escapeHtml(String(monster.maxHP || 0))} HP</div>
                            <div class="mf-player-panel-statline">
                                <span><b>ATK</b> ${escapeHtml(String(monster.attack || 0))}</span>
                                ${mfRenderStatusIconsInline(monster)}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="mf-player-panel-bot">
                    <div class="mf-monster-skill-list">
                        ${rows || '<div class="mf-monster-skill-empty">No skills</div>'}
                    </div>
                </div>
            </div>
        `);
    }

    hud.innerHTML = parts.join('');
    if (!parts.length) {
        hud.innerHTML = '';
        stage.classList.remove('mf-targeting');
    }
}

function mfBindBattleCanvasInput() {
    const canvas = document.getElementById('mfBattleCanvas');
    const stage = mfGetStageEl();
    const hud = mfGetHudEl();
    if (!canvas || !stage || !hud) return;
    if (canvas.dataset.mfInputBound === '1') return;
    canvas.dataset.mfInputBound = '1';

    const onCanvasClick = (ev) => {
        const r = canvas.getBoundingClientRect();
        const stageX = ev.clientX - r.left;
        const stageY = ev.clientY - r.top;

        const hit = mfHitTestUnit(stageX, stageY);
        const targeting = mfBattleUi.targeting;

        if (!targeting) {
            if (hit && hit.kind === 'player') {
                mfBattleUi.selectedPlayerId = hit.id;
                mfRenderBattleHud();
            } else {
                if (hit && hit.kind === 'monster') {
                    mfBattleUi.selectedMonsterId = hit.id;
                    mfRenderBattleHud();
                } else {
                    // Click empty: close panels
                    mfBattleUi.selectedPlayerId = null;
                    mfBattleUi.selectedMonsterId = null;
                    mfBattleUi.targeting = null;
                    mfRenderBattleHud();
                }
            }
            return;
        }

        // Targeting mode: click a valid target, else cancel targeting
        if (!hit) {
            mfBattleUi.targeting = null;
            mfRenderBattleHud();
            return;
        }

        const want = targeting.targetType;
        if (want === 'monster') {
            if (hit.kind !== 'monster' || !hit.isAlive) return;
            if (targeting.action === 'skill') {
                playerUseSkill(targeting.actorId, targeting.skillId, { type: 'monster', id: hit.id });
            } else {
                playerAttack(targeting.actorId, { type: 'monster', id: hit.id });
            }
        } else if (want === 'ally_alive') {
            if (hit.kind !== 'player' || !hit.isAlive) return;
            playerUseSkill(targeting.actorId, targeting.skillId, { type: 'ally', id: hit.id });
        } else if (want === 'ally_dead') {
            if (hit.kind !== 'player' || hit.isAlive) return;
            playerUseSkill(targeting.actorId, targeting.skillId, { type: 'ally_dead', id: hit.id });
        }

        mfBattleUi.targeting = null;
        mfRenderBattleHud();
    };

    canvas.addEventListener('click', onCanvasClick);

    canvas.addEventListener('mousemove', (ev) => {
        const r = canvas.getBoundingClientRect();
        const stageX = ev.clientX - r.left;
        const stageY = ev.clientY - r.top;
        const hit = mfHitTestUnit(stageX, stageY);
        mfBattleUi.hoveredKey = hit ? hit.key : null;
    }, { passive: true });

    // HUD interactions
    hud.addEventListener('click', (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLElement)) return;

        const btn = t.closest('[data-mf]') instanceof HTMLElement ? t.closest('[data-mf]') : null;
        if (!btn) return;

        const kind = btn.getAttribute('data-mf');
        if (kind === 'close') {
            mfBattleUi.selectedPlayerId = null;
            mfBattleUi.targeting = null;
            mfBattleUi.reviveOpenFor = null;
            mfRenderBattleHud();
            return;
        }
        if (kind === 'closeMonster') {
            mfBattleUi.selectedMonsterId = null;
            mfRenderBattleHud();
            return;
        }
        if (kind === 'reviveOpen') {
            const actorId = mfBattleUi.selectedPlayerId;
            if (!actorId) return;
            mfBattleUi.reviveOpenFor = (mfBattleUi.reviveOpenFor === actorId) ? null : actorId;
            mfRenderBattleHud();
            return;
        }
        if (kind === 'reviveAttempt') {
            const actorId = mfBattleUi.selectedPlayerId;
            if (!actorId) return;
            const pts = Math.max(1, parseInt(String(mfBattleUi.reviveDraft[actorId] ?? '1'), 10) || 1);
            void mfAttemptReviveInline(actorId, pts);
            return;
        }

        if (kind === 'act') {
            const actorId = mfBattleUi.selectedPlayerId;
            if (!actorId) return;
            const player = (gameState.players || []).find(p => p && p.studentId === actorId);
            if (!player || !player.isAlive) return;
            if (!(gameState.phase === 'player_turn') || player.hasActed) return;

            const act = btn.getAttribute('data-act');
            if (act === 'attack') {
                mfBattleUi.targeting = { actorId, action: 'attack', targetType: 'monster' };
                mfRenderBattleHud();
                return;
            }
            if (act === 'skill') {
                const skillId = btn.getAttribute('data-skill') || '';
                if (!skillId) return;
                const skill = Array.isArray(player.skills) ? player.skills.find(s => s && s.id === skillId) : null;
                if (!skill) return;

                // Cooldown check (disable already, but guard)
                const cd = player.skillCooldowns && player.skillCooldowns[skillId] ? Number(player.skillCooldowns[skillId]) : 0;
                if (cd > 0) return;

                // AOE skills: cast immediately (no targeting)
                if (mfIsAoeSkill(player, skill)) {
                    void playerUseSkill(actorId, skillId, null);
                    mfBattleUi.targeting = null;
                    mfRenderBattleHud();
                    return;
                }

                mfBattleUi.targeting = { actorId, action: 'skill', skillId, targetType: mfSkillTargetType(skill) };
                mfRenderBattleHud();
            }
        }
    });

    hud.addEventListener('input', (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLInputElement)) return;
        if (t.getAttribute('data-mf') !== 'pts') return;
        const actorId = mfBattleUi.selectedPlayerId;
        if (!actorId) return;
        mfBattleUi.ptsDraft[actorId] = Math.max(0, parseInt(t.value || '0', 10) || 0);
    });

    hud.addEventListener('input', (ev) => {
        const t = ev.target;
        if (!(t instanceof HTMLInputElement)) return;
        if (t.getAttribute('data-mf') !== 'revivePts') return;
        const actorId = mfBattleUi.selectedPlayerId;
        if (!actorId) return;
        mfBattleUi.reviveDraft[actorId] = Math.max(1, parseInt(t.value || '1', 10) || 1);
    });

    window.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            mfBattleUi.targeting = null;
            mfRenderBattleHud();
        }
    }, { passive: true });
}

async function mfAttemptReviveInline(studentId, puzzlePoints) {
    try {
        const response = await fetch(`${GAME_API_BASE}/game/revive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId, puzzlePoints })
        });
        if (!response.ok) throw new Error('Failed to attempt revive');
        const data = await response.json();
        if (data && data.gameState) gameState = data.gameState;
        mfBattleUi.reviveOpenFor = null;
        renderGame();
    } catch (e) {
        console.error('Revive failed:', e);
        alert('Failed to attempt revive');
    }
}

async function initBattleCanvas() {
    const canvas = document.getElementById('mfBattleCanvas');
    const stage = canvas?.closest('.mf-battle-stage');
    if (!canvas || !stage) return;

    const token = ++mfCanvasToken;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mapSrc = imageSrcForFile('Battle/Map.jpg') || 'images/Battle/Map.jpg';
    const mapImg = await loadImg(mapSrc);
    if (token !== mfCanvasToken) return; // cancelled by re-render

    const resize = () => {
        const r = stage.getBoundingClientRect();
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        canvas.width = Math.max(1, Math.floor(r.width * dpr));
        canvas.height = Math.max(1, Math.floor(r.height * dpr));
        canvas.style.width = `${Math.max(1, Math.floor(r.width))}px`;
        canvas.style.height = `${Math.max(1, Math.floor(r.height))}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    if (mfCanvasResizeHandler) {
        try { window.removeEventListener('resize', mfCanvasResizeHandler); } catch {}
    }
    mfCanvasResizeHandler = resize;
    window.addEventListener('resize', mfCanvasResizeHandler, { passive: true });

    const draw = () => {
        if (token !== mfCanvasToken) return;
        const w = stage.clientWidth;
        const h = stage.clientHeight;
        const now = mfNow();
        const shake = mfAnim.shake;
        let sx = 0, sy = 0;
        if (shake) {
            const t = Math.max(0, Math.min(1, (now - shake.t0) / shake.dur));
            const a = (1 - t) * (Number(shake.amp) || 6);
            sx = Math.sin(now / 16) * a;
            sy = Math.cos(now / 19) * a;
        }

        ctx.clearRect(0, 0, w, h);
        ctx.save();
        ctx.translate(sx, sy);

        if (mapImg) {
            // cover draw
            const iw = mapImg.width;
            const ih = mapImg.height;
            const s = Math.max(w / iw, h / ih);
            const dw = iw * s;
            const dh = ih * s;
            const dx = (w - dw) / 2;
            const dy = (h - dh) / 2;
            ctx.drawImage(mapImg, dx, dy, dw, dh);
        }

        // entities
        drawBattleEntities(ctx, w, h);
        // FX overlays
        mfDrawAnim(ctx, now);

        ctx.restore();
        mfCanvasRaf = requestAnimationFrame(draw);
    };

    if (mfCanvasRaf) cancelAnimationFrame(mfCanvasRaf);
    mfCanvasRaf = requestAnimationFrame(draw);
}

// Render game based on current phase
let lastRenderPhase = null;
let renderDebounceTimeout = null;

function mfSetBattleTightMode(on) {
    const b = document.body;
    if (!b) return;
    if (on) b.classList.add('mf-battle-tight');
    else b.classList.remove('mf-battle-tight');
}

function renderGame() {
    ensureActionPopupContainer();
    const currentPhase = gameState?.phase;
    console.log('=== renderGame called ===');
    console.log('Phase:', currentPhase);
    const focusedBefore = document.activeElement;
    console.log('Focused element before render:', focusedBefore?.id, focusedBefore?.tagName, focusedBefore?.value);
    
    // Check if user is currently interacting with input/select
    const isUserInteracting = focusedBefore && (
        focusedBefore.tagName === 'INPUT' || 
        focusedBefore.tagName === 'SELECT' ||
        focusedBefore.id?.startsWith('puzzle_') ||
        focusedBefore.id?.startsWith('target_')
    );
    
    if (isUserInteracting) {
        console.log('User is interacting, skipping re-render to preserve focus');
        // Don't re-render if user is typing or selecting
        // This prevents losing focus on input fields and select dropdowns
        return;
    }
    
    // Debounce rapid re-renders of the same phase (especially for character_selection)
    // Only debounce if it's the exact same phase and we just rendered it
    if (currentPhase === lastRenderPhase) {
        // For character_selection, debounce more aggressively
        if (currentPhase === 'character_selection') {
            if (renderDebounceTimeout) {
                clearTimeout(renderDebounceTimeout);
            }
            renderDebounceTimeout = setTimeout(() => {
                lastRenderPhase = null;
                renderDebounceTimeout = null;
            }, 200);
            console.log('Debouncing duplicate render for phase:', currentPhase);
            return;
        }
        // For other phases, only skip if it's within 50ms (very rapid)
        const now = Date.now();
        if (!window.lastRenderTime || (now - window.lastRenderTime) < 50) {
            console.log('Skipping rapid duplicate render for phase:', currentPhase);
            return;
        }
    }
    lastRenderPhase = currentPhase;
    window.lastRenderTime = Date.now();
    
    const container = document.getElementById('monsterFightGame');
    if (!container) {
        console.error('Game container not found');
        return;
    }
    
    if (!gameState) {
        console.error('Game state not available');
        container.innerHTML = '<p>No game state available</p>';
        return;
    }
    
    // Save input/select values before render
    const inputValues = {};
    const selectValues = {};
    if (gameState.players) {
        gameState.players.forEach(player => {
            const input = document.getElementById(`puzzle_${player.studentId}`);
            if (input) {
                inputValues[player.studentId] = input.value;
            }
            const select = document.getElementById(`target_${player.studentId}`);
            if (select) {
                selectValues[player.studentId] = select.value;
            }
        });
    }
    
    // Log current monster states before rendering
    if (gameState.monsters && gameState.monsters.length > 0) {
        console.log('=== RENDER: CURRENT MONSTER STATES ===');
        gameState.monsters.forEach(monster => {
            console.log(`Monster ${monster.name} (${monster.id}): HP=${monster.currentHP}/${monster.maxHP}, Alive=${monster.isAlive}`);
        });
    }
    
    switch (gameState.phase) {
        case 'character_selection':
            mfSetBattleTightMode(false);
            renderCharacterSelection();
            break;
        case 'level_complete':
            mfSetBattleTightMode(false);
            renderLevelComplete();
            break;
        case 'puzzle_input':
        case 'player_turn':
        case 'monster_turn':
            // If phase is puzzle_input, treat it as player_turn (puzzle input is now integrated)
            if (gameState.phase === 'puzzle_input') {
                gameState.phase = 'player_turn';
            }
            mfSetBattleTightMode(true);
            renderBattleMode();
            break;
        case 'game_over':
            mfSetBattleTightMode(false);
            renderGameOver();
            break;
        default:
            mfSetBattleTightMode(false);
            container.innerHTML = `<p>Unknown phase: ${gameState.phase}</p>`;
    }
    
    // Restore input/select values after render
    setTimeout(() => {
        if (gameState.players) {
            gameState.players.forEach(player => {
                const input = document.getElementById(`puzzle_${player.studentId}`);
                if (input && inputValues[player.studentId] !== undefined) {
                    input.value = inputValues[player.studentId];
                }
                const select = document.getElementById(`target_${player.studentId}`);
                if (select && selectValues[player.studentId] !== undefined) {
                    select.value = selectValues[player.studentId];
                }
            });
        }
    }, 0);
}

// Render character selection screen
function renderCharacterSelection() {
    const container = document.getElementById('monsterFightGame');
    // Sync carousel index to already chosen class (if any)
    try {
        (gameState?.players || []).forEach(p => charSelectSyncIndexToChosen(p));
    } catch {}

    const classes = getPlayerClasses();

    // Auto-pick a default character for anyone missing (so no Confirm button needed)
    if (!hasAutoPickedDefaultCharacter && classes.length) {
        const missing = (gameState?.players || []).filter(p => !String(p.characterClass || '').trim());
        if (missing.length) {
            hasAutoPickedDefaultCharacter = true;
            (async () => {
                for (const p of missing) {
                    const st = getCharSelectState(p.studentId);
                    st.idx = clampIndex(st.idx || 0, classes.length);
                    const clsId = classes[st.idx]?.id || classes[0]?.id;
                    if (clsId) {
                        await selectCharacter(p.studentId, clsId);
                    }
                }
            })();
        }
    }

    container.innerHTML = `
        <div class="game-screen mf-charselect">
            <div class="mf-topbar">
                <div class="mf-topbar-left">
                    <img class="mf-logo" src="${escapeHtml(imageSrcForFile('Logo.png') || 'images/Logo.png')}" alt="Monster Fight">
                    <div class="mf-topbar-title">Monster Fight</div>
                </div>
                <div class="mf-topbar-right">
                    <button class="btn btn-secondary" onclick="openGameSettings()">⚙️ Settings</button>
                </div>
            </div>
            <div class="character-selection-grid">
                ${gameState.players.map(player => `
                    <div class="character-selection-card">
                        <h3>${player.studentName}</h3>
                        ${(() => {
                            const st = getCharSelectState(player.studentId);
                            const idx = clampIndex(st.idx || 0, classes.length);
                            const cls = classes[idx] || {};
                            const src = imageSrcForFile(`${String(cls.name || '').trim()}.png`);
                            const fb = cls.emoji || '❓';
                            const alt = cls.name || 'Character';
                            const skills = Array.isArray(cls.skills) ? cls.skills : [];
                            return `
                                <div class="mf-char-carousel">
                                    <button class="mf-arrow" onclick="charSelectPrev('${player.studentId}')" aria-label="Previous">‹</button>
                                    <div class="mf-char-center">
                                        ${renderIconWrap({ imgSrc: src, fallbackEmoji: fb, alt, wrapClass: 'mf-char-big' })}
                                        <div class="mf-char-meta">
                                            <div class="mf-char-name">${escapeHtml(cls.name || '')}</div>
                                            <div class="mf-char-stats">ATK: ${cls.baseAttack || 0} &nbsp;|&nbsp; HP: ${cls.baseHP || 0}</div>
                                        </div>
                                        <div class="mf-skill-intro">
                                            <div class="mf-skill-grid">
                                                ${skills.length ? skills.map(s => `
                                                    <div class="mf-skill-item">
                                                        <div class="mf-skill-line1">
                                                            <span class="mf-skill-emoji">${escapeHtml(s.emoji || '⭐')}</span>
                                                            <span class="mf-skill-name">${escapeHtml(s.name || '')}</span>
                                                        </div>
                                                        <div class="mf-skill-line2">
                                                            <span class="mf-skill-type-pill">${escapeHtml(s.type || '')}</span>
                                                            ${s.cooldown ? `<span class="mf-skill-cd-pill">CD ${escapeHtml(s.cooldown)}</span>` : ''}
                                                        </div>
                                                        <div class="mf-skill-desc">${escapeHtml(s.description || '')}</div>
                                                    </div>
                                                `).join('') : `<div class="mf-skill-empty">No skills</div>`}
                                            </div>
                                        </div>
                                    </div>
                                    <button class="mf-arrow" onclick="charSelectNext('${player.studentId}')" aria-label="Next">›</button>
                                </div>
                            `;
                        })()}
                    </div>
                `).join('')}
            </div>
            ${gameState.players.every(p => p.characterClass) ? `
                <div class="mf-bottom-actions">
                    <button class="btn btn-primary" onclick="startBattleMode()">Start Battle</button>
                </div>
            ` : ''}
        </div>
    `;
}

// Select character for a player
async function selectCharacter(studentId, characterClassId) {
    try {
        const response = await fetch(`${GAME_API_BASE}/game/select-character`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId, characterClassId })
        });
        
        if (!response.ok) {
            throw new Error('Failed to select character');
        }
        
        gameState = await response.json();
        renderGame();
    } catch (error) {
        console.error('Error selecting character:', error);
        alert('Failed to select character');
    }
}

// Start battle mode (initialize monsters for first level and go directly to player_turn)
async function startBattleMode() {
    try {
        // Initialize monsters by setting puzzle points to 0 (this will initialize monsters)
        const puzzlePoints = {};
        gameState.players.forEach(player => {
            puzzlePoints[player.studentId] = 0;
        });
        
        const response = await fetch(`${GAME_API_BASE}/game/input-puzzle-points`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ puzzlePoints })
        });
        
        if (!response.ok) {
            throw new Error('Failed to initialize battle mode');
        }
        
        gameState = await response.json();
        // Ensure phase is player_turn
        gameState.phase = 'player_turn';
        renderGame();
    } catch (error) {
        console.error('Error starting battle mode:', error);
        alert('Failed to start battle mode');
    }
}

// Game settings state
let gameSettings = {
    config: null,
    playerClasses: [],
    monsterTypes: [],
    levelConfig: []
};

let hasAppliedDefaultLevelPreset = false;

// Open game settings modal
async function openGameSettings() {
    try {
        // Load current settings
        const response = await fetch(`${GAME_API_BASE}/game/settings`);
        if (!response.ok) {
            throw new Error('Failed to load settings');
        }
        
        gameSettings = await response.json();
        
        // Create and show settings modal
        renderSettingsModal();
    } catch (error) {
        console.error('Error opening settings:', error);
        alert('Failed to load settings');
    }
}

// Render settings modal
function renderSettingsModal() {
    const container = document.getElementById('monsterFightGame');
    if (!container) return;
    
    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'gameSettingsModal';
    modal.className = 'settings-modal-overlay';
    modal.innerHTML = `
        <div class="settings-modal-content">
            <div class="settings-modal-header">
                <h2>⚙️ Game Settings</h2>
                <button class="btn-close" onclick="closeSettingsModal()">&times;</button>
            </div>
            <div class="settings-modal-body">
                <div class="settings-tabs">
                    <button class="settings-tab active" onclick="switchSettingsTab('global')">Global Settings</button>
                    <button class="settings-tab" onclick="switchSettingsTab('players')">Player Classes</button>
                    <button class="settings-tab" onclick="switchSettingsTab('monsters')">Monster Types</button>
                    <button class="settings-tab" onclick="switchSettingsTab('levels')">Level Config</button>
                </div>
                
                <div class="settings-content">
                    <div id="settings-global" class="settings-tab-content active">
                        ${renderGlobalSettings()}
                    </div>
                    <div id="settings-players" class="settings-tab-content">
                        ${renderPlayerClassesSettings()}
                    </div>
                    <div id="settings-monsters" class="settings-tab-content">
                        ${renderMonsterTypesSettings()}
                    </div>
                    <div id="settings-levels" class="settings-tab-content">
                        ${renderLevelConfigSettings()}
                    </div>
                </div>
            </div>
            <div class="settings-modal-footer">
                <button class="btn btn-secondary" onclick="closeSettingsModal()">Cancel</button>
                <button class="btn btn-primary" onclick="saveGameSettings()">Save Settings</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Render global settings
function renderGlobalSettings() {
    const config = gameSettings.config || {
        damageMultiplier: 0.2,
        critRate: 0.10,
        critDamage: 2.0,
        baseReviveRate: 0.01,
        reviveRateDecay: 0.95,
        maxReviveRate: 0.66,
        backgroundTheme: 'white'
    };
    
    return `
        <h3>Global Game Settings</h3>
        <div class="settings-form">
            <div class="form-group">
                <label>Damage Multiplier:</label>
                <input type="number" id="setting_damageMultiplier" step="0.1" min="0.1" max="2" value="${config.damageMultiplier || 0.2}">
                <small>Default: 0.2 (Attack × Puzzle Points × Multiplier)</small>
            </div>
            
            <div class="form-group">
                <label>Critical Hit Rate (%):</label>
                <input type="number" id="setting_critRate" step="0.01" min="0" max="100" value="${(config.critRate || 0.10) * 100}">
                <small>Default: 10%</small>
            </div>
            
            <div class="form-group">
                <label>Critical Hit Damage Multiplier:</label>
                <input type="number" id="setting_critDamage" step="0.1" min="1" max="5" value="${config.critDamage || 2.0}">
                <small>Default: 2.0x</small>
            </div>
            
            <div class="form-group">
                <label>Base Revive Rate (%):</label>
                <input type="number" id="setting_baseReviveRate" step="0.01" min="0" max="100" value="${(config.baseReviveRate || 0.01) * 100}">
                <small>Default: 1%</small>
            </div>
            
            <div class="form-group">
                <label>Revive Rate Decay:</label>
                <input type="number" id="setting_reviveRateDecay" step="0.01" min="0" max="1" value="${config.reviveRateDecay || 0.95}">
                <small>Default: 0.95 (per puzzle point)</small>
            </div>
            
            <div class="form-group">
                <label>Max Revive Rate (%):</label>
                <input type="number" id="setting_maxReviveRate" step="0.01" min="0" max="100" value="${(config.maxReviveRate || 0.66) * 100}">
                <small>Default: 66%</small>
            </div>

            <div class="form-group">
                <label>Background Theme:</label>
                <select id="setting_backgroundTheme">
                    <option value="white" ${String(config.backgroundTheme || 'white') === 'white' ? 'selected' : ''}>White</option>
                    <option value="image" ${String(config.backgroundTheme || '') === 'image' ? 'selected' : ''}>Background (Background.jpg)</option>
                </select>
                <small>Preset: white or \`game/monster-fight/images/Background/Background.jpg\`</small>
            </div>
        </div>
    `;
}

// Render player classes settings
function renderPlayerClassesSettings() {
    const classes = gameSettings.playerClasses || window.playerClasses || playerClasses || [];
    
    return `
        <h3>Player Classes</h3>
        <div class="settings-list">
            ${classes.map((charClass, index) => `
                <div class="settings-item">
                    <div class="settings-item-header" onclick="toggleSettingsItem('player_${index}')">
                        ${renderIconWrap({
                            imgSrc: imageSrcForFile(`${String(charClass.name || '').trim()}.png`),
                            fallbackEmoji: charClass.emoji || '❓',
                            alt: charClass.name || 'Class',
                            wrapClass: 'character-emoji'
                        })}
                        <h4>${charClass.name}</h4>
                        <span class="toggle-icon">▼</span>
                    </div>
                    <div class="settings-item-content" id="player_${index}">
                        <div class="form-group">
                            <label>Base Attack:</label>
                            <input type="number" id="player_${index}_attack" min="1" value="${charClass.baseAttack}">
                        </div>
                        <div class="form-group">
                            <label>Base HP:</label>
                            <input type="number" id="player_${index}_hp" min="1" value="${charClass.baseHP}">
                        </div>
                        <div class="form-group">
                            <label>Skills:</label>
                            <div class="skills-list">
                                ${charClass.skills.map((skill, skillIndex) => `
                                    <div class="skill-item">
                                        <div class="mf-skill-row">
                                            <div class="mf-skill-main">
                                                <strong>${skill.name}</strong> (${skill.type})
                                            </div>
                                            <div class="mf-skill-cd-editor">
                                                <span class="mf-skill-cd-label">CD</span>
                                                <input type="number"
                                                       id="player_${index}_skill_${skillIndex}_cd"
                                                       min="0"
                                                       step="1"
                                                       value="${(skill.cooldown ?? '')}"
                                                       placeholder="-">
                                            </div>
                                        </div>
                                        <p>${skill.description}</p>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Render monster types settings
function renderMonsterTypesSettings() {
    const types = gameSettings.monsterTypes || window.monsterTypes || monsterTypes || [];
    
    return `
        <h3>Monster Types</h3>
        <div class="settings-list">
            ${types.map((monster, index) => `
                <div class="settings-item">
                    <div class="settings-item-header" onclick="toggleSettingsItem('monster_${index}')">
                        ${renderIconWrap({
                            imgSrc: imageSrcForFile(`${String(monster.name || '').trim()}.png`),
                            fallbackEmoji: monster.emoji || '👾',
                            alt: monster.name || 'Monster',
                            wrapClass: 'monster-emoji'
                        })}
                        <h4>${monster.name} ${monster.isBoss ? '(Boss)' : ''}</h4>
                        <span class="toggle-icon">▼</span>
                    </div>
                    <div class="settings-item-content" id="monster_${index}">
                        <div class="form-group">
                            <label>Base Attack:</label>
                            <input type="number" id="monster_${index}_attack" min="1" value="${monster.baseAttack}">
                        </div>
                        <div class="form-group">
                            <label>Base HP:</label>
                            <input type="number" id="monster_${index}_hp" min="1" value="${monster.baseHP}">
                        </div>
                        <div class="form-group">
                            <label>Skills:</label>
                            <div class="skills-list">
                                ${monster.skills.map((skill, skillIndex) => `
                                    <div class="skill-item">
                                        <div class="mf-skill-row">
                                            <div class="mf-skill-main">
                                                <strong>${skill.name}</strong> (${skill.type})
                                            </div>
                                            <div class="mf-skill-cd-editor">
                                                <span class="mf-skill-cd-label">CD</span>
                                                <input type="number"
                                                       id="monster_${index}_skill_${skillIndex}_cd"
                                                       min="0"
                                                       step="1"
                                                       value="${(skill.cooldown ?? '')}"
                                                       placeholder="-">
                                            </div>
                                        </div>
                                        <p>${skill.description}</p>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Render level config settings
function renderLevelConfigSettings() {
    const levels = gameSettings.levelConfig || [];
    
    return `
        <h3>Level Configuration</h3>
        <div class="level-config-section">
            <div class="level-config-controls">
                <div class="form-group">
                    <label>Number of Levels:</label>
                    <input type="number" id="level_count" min="1" max="20" value="${levels.length || 3}" onchange="updateLevelConfig()">
                </div>
                <div class="difficulty-presets">
                    <span>Quick Difficulty:</span>
                    <button type="button" class="difficulty-button" data-difficulty="easy" onclick="applyDifficultyPreset('easy')">Easy</button>
                    <button type="button" class="difficulty-button" data-difficulty="medium" onclick="applyDifficultyPreset('medium')">Medium</button>
                    <button type="button" class="difficulty-button" data-difficulty="hard" onclick="applyDifficultyPreset('hard')">Hard</button>
                </div>
            </div>
            <div id="level-config-list">
                ${renderLevelConfigList(levels)}
            </div>
        </div>
    `;
}

// Render level config list
function renderLevelConfigList(levels) {
    const count = levels.length || 3;
    const result = [];
    
    for (let i = 0; i < count; i++) {
        const level = levels[i] || { level: i + 1, monsters: [] };
        result.push(`
            <div class="level-config-item">
                <h4>Level ${i + 1}</h4>
                <div class="form-group">
                    <label>Number of Monster Types:</label>
                    <input type="number" id="level_${i}_monster_count" min="1" max="10" value="${level.monsters.length || 1}" onchange="updateLevelMonsters(${i})">
                </div>
                <div id="level_${i}_monsters" class="level-monsters-list">
                    ${renderLevelMonsters(i, level.monsters)}
                </div>
            </div>
        `);
    }
    
    return result.join('');
}

// Render level monsters
function renderLevelMonsters(levelIndex, monsters) {
    const count = monsters.length || 1;
    const availableMonsterTypes = gameSettings.monsterTypes || window.monsterTypes || [];
    
    const result = [];
    for (let i = 0; i < count; i++) {
        const monster = monsters[i] || { type: availableMonsterTypes[0]?.id || 'slime', count: 1 };
        const mt = availableMonsterTypes.find(m => String(m.id) === String(monster.type));
        const iconSrc = imageSrcForFile(monsterImageFileByType(monster.type));
        const iconFb = mt?.emoji || '👾';
        const iconAlt = mt?.name || 'Monster';
        result.push(`
            <div class="level-monster-item">
                <div id="level_${levelIndex}_monster_${i}_icon" class="mf-level-monster-icon">
                    ${renderIconWrap({ imgSrc: iconSrc, fallbackEmoji: iconFb, alt: iconAlt, wrapClass: 'mf-level-monster-iconwrap' })}
                </div>
                <select id="level_${levelIndex}_monster_${i}_type" onchange="updateLevelMonsterPreview(${levelIndex}, ${i}, this.value)">
                    ${availableMonsterTypes.map(m => `
                        <option value="${m.id}" ${m.id === monster.type ? 'selected' : ''}>${m.name}</option>
                    `).join('')}
                </select>
                <input type="number" id="level_${levelIndex}_monster_${i}_count" min="1" max="10" value="${monster.count || 1}" placeholder="Count">
            </div>
        `);
    }
    
    return result.join('');
}

function updateLevelMonsterPreview(levelIndex, monsterIndex, typeId) {
    const availableMonsterTypes = gameSettings.monsterTypes || window.monsterTypes || [];
    const mt = availableMonsterTypes.find(m => String(m.id) === String(typeId));
    const iconSrc = imageSrcForFile(monsterImageFileByType(typeId));
    const iconFb = mt?.emoji || '👾';
    const iconAlt = mt?.name || 'Monster';
    const host = document.getElementById(`level_${levelIndex}_monster_${monsterIndex}_icon`);
    if (host) {
        host.innerHTML = renderIconWrap({ imgSrc: iconSrc, fallbackEmoji: iconFb, alt: iconAlt, wrapClass: 'mf-level-monster-iconwrap' });
    }
}

window.updateLevelMonsterPreview = updateLevelMonsterPreview;

function applyDifficultyPreset(presetKey) {
    const preset = LEVEL_DIFFICULTY_PRESETS[presetKey];
    if (!preset) {
        console.warn('Unknown difficulty preset:', presetKey);
        return;
    }

    const normalized = preset.map((level, index) => ({
        level: index + 1,
        monsters: (level.monsters || []).map(monster => ({
            type: monster.type,
            count: monster.count
        }))
    }));

    gameSettings.levelConfig = normalized;
    setDifficultyPresetActive(presetKey);

    const countInput = document.getElementById('level_count');
    if (countInput) {
        countInput.value = normalized.length;
    }

    const listContainer = document.getElementById('level-config-list');
    if (listContainer) {
        listContainer.innerHTML = renderLevelConfigList(normalized);
    }
}

function setDifficultyPresetActive(presetKey) {
    document.querySelectorAll('.difficulty-button').forEach(btn => {
        const key = btn.getAttribute('data-difficulty');
        btn.classList.toggle('active', key === presetKey);
    });
}

// Switch settings tab
function switchSettingsTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.settings-tab').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.settings-tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`settings-${tab}`).classList.add('active');

    // Default Level Config preset: Easy
    if (tab === 'levels') {
        if (!hasAppliedDefaultLevelPreset) {
            hasAppliedDefaultLevelPreset = true;
            applyDifficultyPreset('easy');
        } else {
            // Ensure one button shows as active (fallback to easy)
            const anyActive = document.querySelector('.difficulty-button.active');
            if (!anyActive) {
                setDifficultyPresetActive('easy');
            }
        }
    }
}

// Toggle settings item
function toggleSettingsItem(id) {
    const content = document.getElementById(id);
    const header = content.previousElementSibling;
    const icon = header.querySelector('.toggle-icon');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▼';
    } else {
        content.style.display = 'none';
        icon.textContent = '▶';
    }
}

// Update level config
function updateLevelConfig() {
    const count = parseInt(document.getElementById('level_count').value) || 3;
    const currentLevels = gameSettings.levelConfig || [];
    
    // Resize level config
    const newLevels = [];
    for (let i = 0; i < count; i++) {
        newLevels.push(currentLevels[i] || { level: i + 1, monsters: [{ type: 'slime', count: 1 }] });
    }
    
    gameSettings.levelConfig = newLevels;
    
    // Re-render level config list
    document.getElementById('level-config-list').innerHTML = renderLevelConfigList(newLevels);
}

// Update level monsters
function updateLevelMonsters(levelIndex) {
    const countInput = document.getElementById(`level_${levelIndex}_monster_count`);
    if (!countInput) return;
    
    const count = parseInt(countInput.value) || 1;
    
    // Ensure levelConfig array exists and has enough elements
    if (!gameSettings.levelConfig) {
        gameSettings.levelConfig = [];
    }
    if (!gameSettings.levelConfig[levelIndex]) {
        gameSettings.levelConfig[levelIndex] = { level: levelIndex + 1, monsters: [] };
    }
    
    const level = gameSettings.levelConfig[levelIndex];
    
    // Resize monsters
    const newMonsters = [];
    for (let i = 0; i < count; i++) {
        newMonsters.push(level.monsters[i] || { type: 'slime', count: 1 });
    }
    
    gameSettings.levelConfig[levelIndex].monsters = newMonsters;
    
    // Re-render monsters list
    const monstersContainer = document.getElementById(`level_${levelIndex}_monsters`);
    if (monstersContainer) {
        monstersContainer.innerHTML = renderLevelMonsters(levelIndex, newMonsters);
    }
}

// Save game settings
async function saveGameSettings() {
    try {
        // Collect global settings
        const config = {
            damageMultiplier: parseFloat(document.getElementById('setting_damageMultiplier').value) || 0.2,
            critRate: (parseFloat(document.getElementById('setting_critRate').value) || 10) / 100,
            critDamage: parseFloat(document.getElementById('setting_critDamage').value) || 2.0,
            baseReviveRate: (parseFloat(document.getElementById('setting_baseReviveRate').value) || 1) / 100,
            reviveRateDecay: parseFloat(document.getElementById('setting_reviveRateDecay').value) || 0.95,
            maxReviveRate: (parseFloat(document.getElementById('setting_maxReviveRate').value) || 66) / 100,
            backgroundTheme: String(document.getElementById('setting_backgroundTheme')?.value || 'white')
        };
        
        // Collect player classes settings
        const playerClasses = [];
        const playerItems = document.querySelectorAll('#settings-players .settings-item');
        playerItems.forEach((item, index) => {
            const originalClass = gameSettings.playerClasses[index];
            if (originalClass) {
                const nextSkills = (originalClass.skills || []).map((s, skillIndex) => {
                    const input = document.getElementById(`player_${index}_skill_${skillIndex}_cd`);
                    if (!input) return s;
                    const raw = String(input.value ?? '').trim();
                    if (raw === '') {
                        const { cooldown, ...rest } = s || {};
                        return { ...rest };
                    }
                    const cd = parseInt(raw, 10);
                    if (Number.isFinite(cd) && cd >= 0) return { ...(s || {}), cooldown: cd };
                    return s;
                });
                playerClasses.push({
                    ...originalClass,
                    baseAttack: parseInt(document.getElementById(`player_${index}_attack`).value) || originalClass.baseAttack,
                    baseHP: parseInt(document.getElementById(`player_${index}_hp`).value) || originalClass.baseHP,
                    skills: nextSkills
                });
            }
        });
        
        // Collect monster types settings
        const monsterTypes = [];
        const monsterItems = document.querySelectorAll('#settings-monsters .settings-item');
        monsterItems.forEach((item, index) => {
            const originalMonster = gameSettings.monsterTypes[index];
            if (originalMonster) {
                const nextSkills = (originalMonster.skills || []).map((s, skillIndex) => {
                    const input = document.getElementById(`monster_${index}_skill_${skillIndex}_cd`);
                    if (!input) return s;
                    const raw = String(input.value ?? '').trim();
                    if (raw === '') {
                        const { cooldown, ...rest } = s || {};
                        return { ...rest };
                    }
                    const cd = parseInt(raw, 10);
                    if (Number.isFinite(cd) && cd >= 0) return { ...(s || {}), cooldown: cd };
                    return s;
                });
                monsterTypes.push({
                    ...originalMonster,
                    baseAttack: parseInt(document.getElementById(`monster_${index}_attack`).value) || originalMonster.baseAttack,
                    baseHP: parseInt(document.getElementById(`monster_${index}_hp`).value) || originalMonster.baseHP,
                    skills: nextSkills
                });
            }
        });
        
        // Collect level config
        const levelConfig = [];
        const levelCountInput = document.getElementById('level_count');
        if (levelCountInput) {
            const levelCount = parseInt(levelCountInput.value) || 3;
            for (let i = 0; i < levelCount; i++) {
                const monsterCountInput = document.getElementById(`level_${i}_monster_count`);
                if (!monsterCountInput) continue;
                
                const monsterCount = parseInt(monsterCountInput.value) || 1;
                const monsters = [];
                for (let j = 0; j < monsterCount; j++) {
                    const typeInput = document.getElementById(`level_${i}_monster_${j}_type`);
                    const countInput = document.getElementById(`level_${i}_monster_${j}_count`);
                    if (!typeInput || !countInput) continue;
                    
                    const type = typeInput.value;
                    const count = parseInt(countInput.value) || 1;
                    monsters.push({ type, count });
                }
                levelConfig.push({ level: i + 1, monsters });
            }
        }
        
        // Save settings
        const response = await fetch(`${GAME_API_BASE}/game/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                config,
                playerClasses: playerClasses.length > 0 ? playerClasses : undefined,
                monsterTypes: monsterTypes.length > 0 ? monsterTypes : undefined,
                levelConfig
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save settings');
        }
        
        // Update local settings
        gameSettings.config = config;
        if (playerClasses.length > 0) gameSettings.playerClasses = playerClasses;
        if (monsterTypes.length > 0) gameSettings.monsterTypes = monsterTypes;
        gameSettings.levelConfig = levelConfig;
        
        // Update game config if game is active
        if (gameConfig) {
            Object.assign(gameConfig, config);
        }
        applyBackgroundTheme(config.backgroundTheme || 'white');
        if (playerClasses.length > 0) window.playerClasses = playerClasses;
        if (monsterTypes.length > 0) window.monsterTypes = monsterTypes;
        
        alert('Settings saved successfully!');
        closeSettingsModal();
        
        // Reload game if active
        if (gameState) {
            renderGame();
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('Failed to save settings');
    }
}

// Close settings modal
function closeSettingsModal() {
    const modal = document.getElementById('gameSettingsModal');
    if (modal) {
        modal.remove();
    }
}

// Render puzzle input screen
function renderPuzzleInput() {
    const container = document.getElementById('monsterFightGame');
    container.innerHTML = `
        <div class="game-screen">
            <div class="mf-topbar">
                <div class="mf-topbar-left">
                    <img class="mf-logo" src="${escapeHtml(imageSrcForFile('Logo.png') || 'images/Logo.png')}" alt="Monster Fight">
                    <div class="mf-topbar-title">Monster Fight</div>
                </div>
                <div class="mf-topbar-right">
                    <button class="btn btn-secondary" onclick="openGameSettings()">⚙️ Settings</button>
                </div>
            </div>
            <p>Enter puzzle points for each student (8-40 points)</p>
            <div class="puzzle-input-grid">
                ${gameState.players.map(player => `
                    <div class="puzzle-input-card">
                        <h3>${player.studentName}</h3>
                        <div class="character-info">
                            ${(() => {
                                const cls = getPlayerClasses().find(c => c.id === player.characterClass);
                                const src = imageSrcForFile(classImageFileById(player.characterClass));
                                return renderIconWrap({
                                    imgSrc: src,
                                    fallbackEmoji: cls?.emoji || '❓',
                                    alt: cls?.name || 'Character',
                                    wrapClass: 'character-emoji'
                                });
                            })()}
                            <span>${getPlayerClasses().find(c => c.id === player.characterClass)?.name || 'Unknown'}</span>
                        </div>
                        <input type="number" 
                               id="puzzle_${player.studentId}" 
                               min="8" 
                               max="40" 
                               value="${player.puzzlePoints || 0}" 
                               class="puzzle-input"
                               placeholder="8-40">
                    </div>
                `).join('')}
            </div>
            <button class="btn btn-primary" onclick="submitPuzzlePoints()">Start Battle</button>
        </div>
    `;
}

// Submit puzzle points
async function submitPuzzlePoints() {
    const puzzlePoints = {};
    gameState.players.forEach(player => {
        const input = document.getElementById(`puzzle_${player.studentId}`);
        if (input) {
            puzzlePoints[player.studentId] = parseInt(input.value) || 0;
        }
    });
    
    try {
        const response = await fetch(`${GAME_API_BASE}/game/input-puzzle-points`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ puzzlePoints })
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit puzzle points');
        }
        
        gameState = await response.json();
        renderGame();
    } catch (error) {
        console.error('Error submitting puzzle points:', error);
        alert('Failed to submit puzzle points');
    }
}

// Render battle mode screen (puzzle input and actions integrated in player cards)
function renderBattleMode() {
    const container = document.getElementById('monsterFightGame');
    const isPlayerTurn = gameState.phase === 'player_turn';
    const isMonsterTurn = gameState.phase === 'monster_turn';

    const alivePlayers = Array.isArray(gameState.players) ? gameState.players.filter(p => p && p.isAlive) : [];
    const allPlayersActed = alivePlayers.length > 0 && alivePlayers.every(p => p.hasActed);
    const canProcessMonsterTurn = !!(isMonsterTurn || (isPlayerTurn && allPlayersActed));
    
    container.innerHTML = `
        <div class="game-screen mf-battle">
            <div class="mf-topbar">
                <div class="mf-topbar-row mf-topbar-row1">
                    <div class="mf-topbar-left">
                        <img class="mf-logo" src="${escapeHtml(imageSrcForFile('Logo.png') || 'images/Logo.png')}" alt="Monster Fight">
                        <div class="mf-topbar-title">Monster Fight - Level ${gameState.currentLevel}</div>
                    </div>
                    <div class="mf-topbar-center">
                        <button class="mf-topbar-pill mf-topbar-process ${canProcessMonsterTurn ? '' : 'is-disabled'}"
                                type="button"
                                onclick="processMonsterTurn()"
                                ${canProcessMonsterTurn ? '' : 'disabled'}>
                            ⚔️ Process Monster Turn
                        </button>
                    </div>
                    <div class="mf-topbar-right">
                        <button class="mf-topbar-pill" type="button" onclick="toggleActionLog()">Action Log</button>
                        <span class="phase-badge ${isPlayerTurn ? 'player-turn' : 'monster-turn'}">
                            ${isPlayerTurn ? 'Player Turn' : 'Monster Turn'}
                        </span>
                        <button class="btn btn-danger btn-sm" onclick="terminateGame()">⛔ Terminate Game</button>
                        <button class="btn btn-secondary" onclick="openGameSettings()">⚙️ Settings</button>
                    </div>
                </div>

                ${!actionLogCollapsed ? `
                    <div class="mf-topbar-logpopover" role="dialog" aria-label="Action Log">
                        ${(gameState.actionLog && gameState.actionLog.length > 0)
                            ? gameState.actionLog.slice(-10).reverse().map(log => `
                                <div class="log-entry">[Turn ${log.turn}] ${log.message}</div>
                            `).join('')
                            : '<div class="log-entry">No actions yet.</div>'
                        }
                    </div>
                ` : ''}
            </div>
            
            <div class="mf-battle-wrap">
                <div class="mf-battle-stage">
                    <canvas id="mfBattleCanvas" class="mf-battle-canvas"></canvas>
                    <div id="mfBattleToast" class="mf-battle-toast" aria-live="polite"></div>
                </div>
                <div id="mfBattleHud" class="mf-battle-hud"></div>
            </div>
        </div>
    `;

    // Draw map background on canvas (step 1 of canvas battle scene).
    setTimeout(initBattleCanvas, 0);
    setTimeout(mfBindBattleCanvasInput, 0);
    setTimeout(mfRenderBattleHud, 0);
}

// Render player card with all actions integrated (puzzle input + actions in player_turn)
function renderPlayerCardWithActions(player, isPlayerTurn) {
    console.log(`Rendering player card for ${player.studentName}, isPlayerTurn: ${isPlayerTurn}`);
    const charClass = getPlayerClasses().find(c => c.id === player.characterClass);
    const hpPercent = player.maxHP > 0 ? (player.currentHP / player.maxHP) * 100 : 0;
    const aliveMonsters = gameState.monsters ? gameState.monsters.filter(m => m.isAlive) : [];
    const alivePlayers = gameState.players ? gameState.players.filter(p => p.isAlive) : [];
    const defeatedPlayers = gameState.players ? gameState.players.filter(p => !p.isAlive) : [];

    const targetOptions = ['<option value="">Select Target</option>'];
    if (aliveMonsters.length > 0) {
        targetOptions.push('<optgroup label="Monsters">');
        targetOptions.push(aliveMonsters.map(m => {
            const hpInfo = `${m.currentHP}/${m.maxHP} HP`;
            return `<option value="monster:${m.id}">${m.name} (${hpInfo})</option>`;
        }).join(''));
        targetOptions.push('</optgroup>');
    }
    if (alivePlayers.length > 0) {
        targetOptions.push('<optgroup label="Allies">');
        targetOptions.push(alivePlayers.map(ally => {
            const isSelf = ally.studentId === player.studentId;
            const hpInfo = ally.maxHP ? `${ally.currentHP}/${ally.maxHP} HP` : 'HP N/A';
            const label = `${ally.studentName}${isSelf ? ' (You)' : ''}`;
            return `<option value="ally:${ally.studentId}">${label} (${hpInfo})</option>`;
        }).join(''));
        targetOptions.push('</optgroup>');
    }
    if (defeatedPlayers.length > 0) {
        targetOptions.push('<optgroup label="Fallen Allies">');
        targetOptions.push(defeatedPlayers.map(fallen => {
            const hpInfo = fallen.maxHP ? `0/${fallen.maxHP} HP` : 'Downed';
            return `<option value="ally_dead:${fallen.studentId}">${fallen.studentName} (${hpInfo})</option>`;
        }).join(''));
        targetOptions.push('</optgroup>');
    }
    const targetOptionsHtml = targetOptions.join('');
    
    const activeSkills = (player.skills || []).filter(s => s.type === 'active').slice(0, 2);
    const canAct = !!(isPlayerTurn && player.isAlive && !player.hasActed);
    const atkBtn = {
        kind: 'attack',
        emoji: '⚔️',
        title: 'Attack',
        name: 'Attack',
        disabled: !canAct,
        onClick: `playerAttack('${player.studentId}')`
    };
    const skillBtns = activeSkills.map((skill) => {
        const cooldown = (player.skillCooldowns && player.skillCooldowns[skill.id]) || 0;
        const baseCd = (typeof skill.cooldown === 'number') ? skill.cooldown : 0;
        const tipLines = [
            `${skill.emoji || '⭐'} ${skill.name || 'Skill'}`,
            `${skill.type || ''}${baseCd ? `  |  CD ${baseCd}` : ''}${cooldown > 0 ? `  (now CD ${cooldown})` : ''}`,
            `${skill.description || ''}`
        ].filter(Boolean);
        const tip = escapeHtml(tipLines.join('\n'));
        return {
            kind: skill.id,
            emoji: skill.emoji || '⭐',
            title: `${skill.name}${cooldown > 0 ? ` (CD:${cooldown})` : ''}`,
            name: skill.name || 'Skill',
            cooldown,
            tip,
            disabled: !canAct || cooldown > 0,
            onClick: `playerUseSkill('${player.studentId}', '${skill.id}')`
        };
    });
    while (skillBtns.length < 2) skillBtns.push({ kind: `empty_${skillBtns.length}`, emoji: ' ', title: '', name: '', cooldown: 0, tip: '', disabled: true, onClick: '' });

    const atkTip = escapeHtml(['⚔️ Attack', 'Basic attack', ''].filter(Boolean).join('\n'));
    const allBtns = [{ ...atkBtn, tip: atkTip }, ...skillBtns];

    return `
        <div class="player-card-full mf-player-card ${!player.isAlive ? 'defeated' : ''}">
            <div class="mf-card-body">
                <div class="mf-name">${escapeHtml(player.studentName)} ${renderStatusText(player)}</div>

                <div class="mf-avatar-row">
                    ${renderIconWrap({
                        imgSrc: imageSrcForFile(classImageFileById(player.characterClass)),
                        fallbackEmoji: charClass?.emoji || '❓',
                        alt: charClass?.name || 'Character',
                        wrapClass: 'mf-avatar-lg'
                    })}
                </div>

                ${player.maxHP > 0 ? `
                    <div class="mf-hp-wrap">
                        <div class="hp-bar">
                            <div class="hp-fill" style="width: ${hpPercent}%"></div>
                            <span class="hp-text">${player.currentHP}/${player.maxHP} HP</span>
                        </div>
                    </div>
                ` : ''}

                <div class="mf-subline">
                    <span>ATK: ${player.attack || 0}</span>
                    ${player.maxHP > 0 ? `<span>HP: ${player.currentHP}/${player.maxHP}</span>` : ''}
                </div>

                <div class="player-actions-integrated" style="border-top:none; padding-top:0; margin-top:10px;">
                    ${isPlayerTurn && player.isAlive ? `
                        <div class="mf-pt-target-row">
                            <div class="mf-pt">
                                <label>Pts</label>
                                <input type="text"
                                       inputmode="numeric"
                                       pattern="[0-9]*"
                                       id="puzzle_${player.studentId}"
                                       min="0"
                                       value="${player.puzzlePoints || 0}"
                                       class="puzzle-input-small"
                                       placeholder="0"
                                       onchange="updatePuzzlePoints()"
                                       onblur="setTimeout(() => updatePuzzlePoints(), 100)"
                                       onkeypress="return (event.charCode >= 48 && event.charCode <= 57)"
                                       onmousedown="event.stopPropagation()">
                            </div>
                            <div class="mf-target">
                                <label>Target</label>
                                <select id="target_${player.studentId}"
                                        class="target-select-small"
                                        onmousedown="event.stopPropagation()">
                                    ${targetOptionsHtml}
                                </select>
                            </div>
                        </div>
                    ` : ''}

                    ${!player.isAlive ? `
                        <div class="revive-section" style="margin-top:10px;">
                            <button class="btn btn-sm btn-warning" onclick="showReviveModal('${player.studentId}')">💫 Revive</button>
                        </div>
                    ` : ''}

                    ${player.hasActed && player.isAlive ? `
                        <div class="action-status" style="margin-top:10px;">
                            <span class="status-badge">✓ Action Taken</span>
                        </div>
                    ` : ''}
                </div>
            </div>

            <div class="mf-skill-rail-right" aria-label="Skills">
                ${allBtns.map((b) => `
                    <button class="mf-skill-tile mf-skill-side ${b.disabled ? 'is-disabled' : ''}"
                            ${b.disabled ? 'disabled' : ''}
                            ${b.onClick ? `onclick="${b.onClick}"` : ''}
                            title="${escapeHtml(b.title)}">
                        <span class="mf-skill-tile-icon">${escapeHtml(b.emoji || '')}</span>
                        <span class="mf-skill-tile-name">${escapeHtml(b.name || '')}</span>
                        ${b.cooldown > 0 ? `<span class="mf-skill-tile-cd">${escapeHtml(b.cooldown)}</span>` : ''}
                        ${b.tip ? `<div class="mf-skill-tooltip">${b.tip.replace(/\n/g, '<br>')}</div>` : ''}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
}

// Render monster card
function renderMonsterCard(monster) {
    const types = getMonsterTypes();
    const monsterType = types.find(m => m.id === monster.type);
    const hpPercent = (monster.currentHP / monster.maxHP) * 100;
    
    return `
        <div class="monster-card mf-monster-card ${!monster.isAlive ? 'defeated' : ''}">
            <div class="mf-card-body">
                <div class="mf-name">${escapeHtml(monster.name)} ${renderStatusText(monster)}</div>
                <div class="mf-avatar-row">
                    ${renderIconWrap({
                        imgSrc: imageSrcForFile(monsterImageFileByType(monster.type)),
                        fallbackEmoji: monsterType?.emoji || monster.emoji || '👾',
                        alt: monsterType?.name || monster.name || 'Monster',
                        wrapClass: 'mf-avatar-lg'
                    })}
                </div>
                <div class="mf-hp-wrap">
                    <div class="hp-bar">
                        <div class="hp-fill" style="width: ${hpPercent}%"></div>
                        <span class="hp-text">${monster.currentHP}/${monster.maxHP} HP</span>
                    </div>
                </div>
                <div class="mf-subline"><span>ATK: ${monster.attack}</span></div>
            </div>
        </div>
    `;
}

// Update puzzle points for all players (only on blur/change, not on every input)
let updatePuzzlePointsTimeout = null;
async function updatePuzzlePoints() {
    console.log('updatePuzzlePoints called');
    const focusedElement = document.activeElement;
    console.log('Current focused element:', focusedElement?.id, focusedElement?.tagName);
    
    // Debounce: wait a short time to see if user is switching between inputs
    if (updatePuzzlePointsTimeout) {
        clearTimeout(updatePuzzlePointsTimeout);
    }
    
    updatePuzzlePointsTimeout = setTimeout(async () => {
        // Don't update if user is still interacting with input/select
        const currentFocused = document.activeElement;
        const isStillInteracting = currentFocused && (
            currentFocused.tagName === 'INPUT' || 
            currentFocused.tagName === 'SELECT' ||
            currentFocused.id?.startsWith('puzzle_') ||
            currentFocused.id?.startsWith('target_')
        );
        
        if (isStillInteracting) {
            console.log('User still interacting, skipping update');
            return;
        }
        
        const puzzlePoints = {};
        gameState.players.forEach(player => {
            const input = document.getElementById(`puzzle_${player.studentId}`);
            if (input) {
                // Parse value, allowing empty string to be 0
                const value = input.value.trim();
                puzzlePoints[player.studentId] = value === '' ? 0 : parseInt(value) || 0;
                console.log(`Puzzle points for ${player.studentId}:`, puzzlePoints[player.studentId]);
            }
        });
        
        try {
            const response = await fetch(`${GAME_API_BASE}/game/input-puzzle-points`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ puzzlePoints })
            });
            
            if (!response.ok) {
                throw new Error('Failed to update puzzle points');
            }
            
            const newState = await response.json();
            console.log('Puzzle points updated, monsters exist:', !!(gameState.monsters && gameState.monsters.length > 0));
            
            // IMPORTANT: Only update puzzle points in gameState, DO NOT call renderGame()
            // This prevents losing focus on input fields
            newState.players.forEach(newPlayer => {
                const existingPlayer = gameState.players.find(p => p.studentId === newPlayer.studentId);
                if (existingPlayer) {
                    existingPlayer.puzzlePoints = newPlayer.puzzlePoints;
                }
            });
            
            // NEVER re-render during battle - it causes input fields to lose focus
            // Only update the data, don't touch the DOM
            console.log('Puzzle points updated in gameState, no re-render to preserve focus');
        } catch (error) {
            console.error('Error updating puzzle points:', error);
            // Don't show alert on every keystroke, just log
        }
    }, 300); // 300ms debounce to allow user to switch between inputs
}

// Start battle after puzzle points are set
async function startBattleAfterPuzzleInput() {
    // Ensure all players have puzzle points
    const puzzlePoints = {};
    gameState.players.forEach(player => {
        const input = document.getElementById(`puzzle_${player.studentId}`);
        if (input) {
            puzzlePoints[player.studentId] = parseInt(input.value) || 0;
        } else {
            puzzlePoints[player.studentId] = player.puzzlePoints || 0;
        }
    });
    
    // No validation needed - puzzle points can be 0 or any positive number
    
    try {
        const response = await fetch(`${GAME_API_BASE}/game/input-puzzle-points`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ puzzlePoints })
        });
        
        if (!response.ok) {
            throw new Error('Failed to start battle');
        }
        
        gameState = await response.json();
        // Switch to player turn
        if (gameState.monsters && gameState.monsters.length > 0) {
            gameState.phase = 'player_turn';
        }
        renderGame();
    } catch (error) {
        console.error('Error starting battle:', error);
        alert('Failed to start battle');
    }
}

// Terminate game
async function terminateGame() {
    if (!confirm('Are you sure you want to terminate the game? All progress will be lost.')) {
        return;
    }
    
    try {
        // Reset game state by reinitializing
        const response = await fetch(`${GAME_API_BASE}/game/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentIds: gameState.players.map(p => p.studentId),
                levelConfig: gameState.levelConfig || []
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to reset game');
        }
        
        gameState = await response.json();
        renderGame();
    } catch (error) {
        console.error('Error terminating game:', error);
        alert('Failed to terminate game');
    }
}

function mfNormalizeTargetInput(v) {
    if (!v) return { type: null, id: null };
    if (typeof v === 'string') return parseTargetValue(v);
    if (typeof v === 'object' && v.id) return { type: v.type || null, id: v.id };
    return { type: null, id: null };
}

function mfGetCurrentPuzzlePoints(studentId) {
    const draft = mfBattleUi && mfBattleUi.ptsDraft ? mfBattleUi.ptsDraft[studentId] : undefined;
    if (draft !== undefined && draft !== null && Number.isFinite(Number(draft))) return Number(draft) || 0;
    const puzzleInput = document.getElementById(`puzzle_${studentId}`);
    if (puzzleInput) return parseInt(puzzleInput.value) || 0;
    const player = gameState?.players?.find(p => p && p.studentId === studentId);
    return Number(player?.puzzlePoints) || 0;
}

// Player attack
async function playerAttack(studentId, explicitTarget) {
    const parsedTarget = explicitTarget ? mfNormalizeTargetInput(explicitTarget) : (() => {
        const targetSelect = document.getElementById(`target_${studentId}`);
        return parseTargetValue(targetSelect?.value);
    })();
    
    if (!parsedTarget.id) {
        alert('Please select a target');
        return;
    }
    if (parsedTarget.type !== 'monster') {
        alert('Please select a monster target for a normal attack');
        return;
    }
    const targetId = parsedTarget.id;
    
    // Get current Puzzle Points (HUD draft > input > gameState)
    const currentPuzzlePoints = mfGetCurrentPuzzlePoints(studentId);
    
    // Log before attack
    const player = gameState.players.find(p => p.studentId === studentId);
    const attackerKey = `player:${studentId}`;
    const attackerClass = String(player?.characterClass || '').toLowerCase();
    const isRanged = (attackerClass === 'archer' || attackerClass === 'wizard');
    const targetMonsterBefore = gameState.monsters?.find(m => m.id === targetId);
    console.log('=== PLAYER ATTACK ===');
    console.log(`Player: ${player?.studentName} (ID: ${studentId})`);
    console.log(`Target: ${targetMonsterBefore?.name} (ID: ${targetId})`);
    console.log(`Target HP BEFORE: ${targetMonsterBefore?.currentHP}/${targetMonsterBefore?.maxHP}`);
    console.log(`Player Attack: ${player?.attack}`);
    console.log(`Puzzle Points from input: ${currentPuzzlePoints} (gameState: ${player?.puzzlePoints})`);
    const puzzleInput = document.getElementById(`puzzle_${studentId}`);
    console.log(`Puzzle Input Element:`, puzzleInput ? `Found (value: ${puzzleInput.value})` : 'NOT FOUND');
    
    // Validate puzzle points
    if (currentPuzzlePoints === 0 && puzzleInput && puzzleInput.value && parseInt(puzzleInput.value) > 0) {
        console.warn('⚠️ WARNING: Puzzle Points read as 0, but input field has value:', puzzleInput.value);
    }
    
    try {
        const response = await fetch(`${GAME_API_BASE}/game/player-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                studentId, 
                action: 'attack', 
                targetId,
                puzzlePoints: currentPuzzlePoints  // Send current Puzzle Points from input
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to process attack');
        }
        
        const data = await response.json();
        console.log('Server response:', JSON.stringify(data, null, 2));
        
        // Preserve current monsters state - update only HP and alive status from server
        const currentMonsters = gameState.monsters ? [...gameState.monsters] : null;
        gameState = data.gameState;
        
        // Update monster HP from server response, but preserve the array structure
        if (currentMonsters && currentMonsters.length > 0 && gameState.monsters) {
            const hitEvents = []; // { id, damage }
            console.log('=== UPDATING MONSTER HP ===');
            console.log('Current monsters (before update):', currentMonsters.map(m => ({
                id: m.id,
                name: m.name,
                hp: `${m.currentHP}/${m.maxHP}`,
                alive: m.isAlive
            })));
            console.log('Server monsters:', gameState.monsters.map(m => ({
                id: m.id,
                name: m.name,
                hp: `${m.currentHP}/${m.maxHP}`,
                alive: m.isAlive
            })));
            
            currentMonsters.forEach((currentMonster) => {
                const serverMonster = gameState.monsters.find(m => m.id === currentMonster.id);
                if (serverMonster) {
                    const oldHP = currentMonster.currentHP;
                    const newHP = serverMonster.currentHP;
                    const damage = oldHP - newHP;
                    if (damage > 0) hitEvents.push({ id: currentMonster.id, damage });
                    
                    console.log(`Monster ${currentMonster.name} (${currentMonster.id}):`);
                    console.log(`  HP: ${oldHP} -> ${newHP} (damage: ${damage})`);
                    console.log(`  Alive: ${currentMonster.isAlive} -> ${serverMonster.isAlive}`);
                    
                    // Update HP and alive status from server
                    currentMonster.currentHP = serverMonster.currentHP;
                    currentMonster.isAlive = serverMonster.isAlive;
                    // Also update maxHP in case it changed
                    if (serverMonster.maxHP) {
                        currentMonster.maxHP = serverMonster.maxHP;
                    }
                } else {
                    console.warn(`Monster ${currentMonster.id} not found in server response`);
                }
            });
            gameState.monsters = currentMonsters;
            
            console.log('Monsters AFTER update:', gameState.monsters.map(m => ({
                id: m.id,
                name: m.name,
                hp: `${m.currentHP}/${m.maxHP}`,
                alive: m.isAlive
            })));

            // --- Canvas FX: ranged beam / melee dash + damage float ---
            if (hitEvents.length) {
                const best = hitEvents.reduce((a, b) => (b.damage > a.damage ? b : a), hitEvents[0]);
                const actualTargetId = best?.id || targetId;
                const targetKey = `monster:${actualTargetId}`;
                const requestedKey = `monster:${targetId}`;
                if (actualTargetId && actualTargetId !== targetId) {
                    // taunt redirect: blocker slides to victim position before impact
                    mfAnimBlock(targetKey, requestedKey);
                }
                if (isRanged) mfAnimAddBeam(attackerKey, targetKey, 'rgba(255,60,60,0.95)', 6, 280);
                else mfAnimDash(attackerKey, targetKey, { dur: 340 });
                mfAnimHit(targetKey, { blinks: 2, dur: 260, amp: 4 });
                mfAnimAddFloatAtUnit(targetKey, `-${best.damage}`, 'rgba(255,60,60,0.95)', 4000);

                try {
                    const finalMonster = (gameState.monsters || []).find(m => m && m.id === actualTargetId) || targetMonsterBefore;
                    const nameA = String(player?.studentName || 'Player');
                    const nameB = String(finalMonster?.name || 'Monster');
                    const tauntTag = (actualTargetId && actualTargetId !== targetId) ? ' (TAUNT)' : '';
                    mfShowBattleToast(`${nameA} attacks ${nameB} -${best.damage}${tauntTag}`);
                } catch {}
            }
        }
        
        renderGame();
    } catch (error) {
        console.error('Error processing attack:', error);
        alert(String(error?.message || 'Failed to process attack'));
    }
}

// Player use skill
async function playerUseSkill(studentId, skillId, explicitTarget) {
    const player = gameState.players.find(p => p.studentId === studentId);
    if (!player || !player.isAlive) {
        alert('Player not found or not alive');
        return;
    }
    
    const skill = player.skills.find(s => s.id === skillId);
    if (!skill || skill.type !== 'active') {
        alert('Invalid skill');
        return;
    }

    const isAoe = mfIsAoeSkill(player, skill);
    const attackerKey = `player:${studentId}`;
    const attackerClass = String(player?.characterClass || '').toLowerCase();
    const isRanged = (attackerClass === 'archer' || attackerClass === 'wizard');

    // snapshots for delta-based FX
    const beforeMonsterHp = new Map((gameState.monsters || []).map(m => [m.id, Number(m.currentHP || 0)]));
    const beforePlayerHp = new Map((gameState.players || []).map(p => [p.studentId, Number(p.currentHP || 0)]));
    
    // Check cooldown
    if (player.skillCooldowns && player.skillCooldowns[skillId] > 0) {
        alert(`Skill is on cooldown (${player.skillCooldowns[skillId]} turns remaining)`);
        return;
    }
    
    const requiredTargetType = getSkillTargetType(player, skill);

    let targetId = null;
    let targetMonsterBefore = null;
    let targetPlayerBefore = null;
    if (requiredTargetType === 'monster' && isAoe) {
        // AOE skills don't require a target
        targetId = null;
    } else if (requiredTargetType === 'monster') {
        const parsedTarget = explicitTarget ? mfNormalizeTargetInput(explicitTarget) : (() => {
            const targetSelect = document.getElementById(`target_${studentId}`);
            return parseTargetValue(targetSelect?.value);
        })();
        if (!parsedTarget.id) {
            alert('Please select a monster target');
            return;
        }
        if (parsedTarget.type !== 'monster') {
            alert('This skill must target a monster');
            return;
        }
        targetId = parsedTarget.id;
        targetMonsterBefore = gameState.monsters?.find(m => m.id === targetId);
        if (!targetMonsterBefore) {
            alert('Selected monster not found');
            return;
        }
    } else if (requiredTargetType === 'ally_alive') {
        const parsedTarget = explicitTarget ? mfNormalizeTargetInput(explicitTarget) : (() => {
            const targetSelect = document.getElementById(`target_${studentId}`);
            return parseTargetValue(targetSelect?.value);
        })();
        if (!parsedTarget.id) {
            alert('Please select an ally to target');
            return;
        }
        if (parsedTarget.type !== 'ally') {
            alert('Please select a living ally for this skill');
            return;
        }
        targetId = parsedTarget.id;
        targetPlayerBefore = gameState.players.find(p => p.studentId === targetId);
        if (!targetPlayerBefore || !targetPlayerBefore.isAlive) {
            alert('Selected ally is not available for healing');
            return;
        }
    } else if (requiredTargetType === 'ally_dead') {
        const parsedTarget = explicitTarget ? mfNormalizeTargetInput(explicitTarget) : (() => {
            const targetSelect = document.getElementById(`target_${studentId}`);
            return parseTargetValue(targetSelect?.value);
        })();
        if (!parsedTarget.id) {
            alert('Please select a fallen ally');
            return;
        }
        if (parsedTarget.type !== 'ally_dead') {
            alert('Please choose a fallen ally for this skill');
            return;
        }
        targetId = parsedTarget.id;
        targetPlayerBefore = gameState.players.find(p => p.studentId === targetId);
        if (!targetPlayerBefore || targetPlayerBefore.isAlive) {
            alert('Selected ally is not fallen');
            return;
        }
    } else {
        const parsedTarget = explicitTarget ? mfNormalizeTargetInput(explicitTarget) : (() => {
            const targetSelect = document.getElementById(`target_${studentId}`);
            return parseTargetValue(targetSelect?.value);
        })();
        // Default behaviour: require some target id
        if (!parsedTarget.id) {
            alert('Please select a target');
            return;
        }
        targetId = parsedTarget.id;
        if (parsedTarget.type === 'monster') {
            targetMonsterBefore = gameState.monsters?.find(m => m.id === targetId);
        } else {
            targetPlayerBefore = gameState.players.find(p => p.studentId === targetId);
        }
    }
    
    // Get current Puzzle Points (HUD draft > input > gameState)
    const currentPuzzlePoints = mfGetCurrentPuzzlePoints(studentId);
    
    // Log before skill
    console.log('=== PLAYER USE SKILL ===');
    console.log(`Player: ${player?.studentName} (ID: ${studentId})`);
    console.log(`Skill: ${skill.name} (ID: ${skillId})`);
    if (targetMonsterBefore) {
        console.log(`Target Monster: ${targetMonsterBefore?.name} (ID: ${targetId})`);
        console.log(`Target HP BEFORE: ${targetMonsterBefore?.currentHP}/${targetMonsterBefore?.maxHP}`);
    }
    if (targetPlayerBefore) {
        console.log(`Target Player: ${targetPlayerBefore?.studentName} (ID: ${targetId}) | Alive: ${targetPlayerBefore?.isAlive}`);
        if (targetPlayerBefore?.maxHP) {
            console.log(`Target HP BEFORE: ${targetPlayerBefore?.currentHP}/${targetPlayerBefore?.maxHP}`);
        }
    }
    console.log(`Puzzle Points from input: ${currentPuzzlePoints} (gameState: ${player?.puzzlePoints})`);
    
    try {
        const sendTargetId = isAoe ? null : targetId;
        const response = await fetch(`${GAME_API_BASE}/game/player-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                studentId, 
                action: 'skill', 
                skillId, 
                targetId: sendTargetId,
                puzzlePoints: currentPuzzlePoints  // Send current Puzzle Points from input
            })
        });
        
        if (!response.ok) {
            let msg = `Failed to use skill (HTTP ${response.status})`;
            try {
                const err = await response.json();
                if (err && typeof err === 'object' && err.error) msg = String(err.error);
            } catch {
                try {
                    const t = await response.text();
                    if (t) msg = t;
                } catch {}
            }
            throw new Error(msg);
        }
        
        const data = await response.json();
        console.log('Server response:', JSON.stringify(data, null, 2));
        
        // Preserve current monsters state - update only HP and alive status from server
        const currentMonsters = gameState.monsters ? [...gameState.monsters] : null;
        gameState = data.gameState;

        // Ensure cooldown is applied client-side if server didn't set it
        try {
            const sp = (gameState.players || []).find(p => p && p.studentId === studentId);
            const baseCd = Math.max(0, Number(skill.cooldown) || 0);
            if (sp && baseCd > 0) {
                if (!sp.skillCooldowns || typeof sp.skillCooldowns !== 'object') sp.skillCooldowns = {};
                const sv = Number(sp.skillCooldowns[skillId] || 0);
                // Server stores cooldown as base+1 (ticks down per full round)
                const want = baseCd + 1;
                if (!(sv > 0)) sp.skillCooldowns[skillId] = want;
                else sp.skillCooldowns[skillId] = Math.max(sv, want);
            }
        } catch {}
        
        // Update monster HP from server response, but preserve the array structure
        if (currentMonsters && currentMonsters.length > 0 && gameState.monsters) {
            const hitEvents = []; // { id, damage }
            console.log('=== UPDATING MONSTER HP (SKILL) ===');
            currentMonsters.forEach((currentMonster) => {
                const serverMonster = gameState.monsters.find(m => m.id === currentMonster.id);
                if (serverMonster) {
                    const oldHP = currentMonster.currentHP;
                    const newHP = serverMonster.currentHP;
                    const damage = oldHP - newHP;
                    if (damage > 0) hitEvents.push({ id: currentMonster.id, damage });
                    
                    console.log(`Monster ${currentMonster.name} (${currentMonster.id}):`);
                    console.log(`  HP: ${oldHP} -> ${newHP} (damage: ${damage})`);
                    console.log(`  Alive: ${currentMonster.isAlive} -> ${serverMonster.isAlive}`);
                    
                    // Update HP and alive status from server
                    currentMonster.currentHP = serverMonster.currentHP;
                    currentMonster.isAlive = serverMonster.isAlive;
                    // Also update maxHP in case it changed
                    if (serverMonster.maxHP) {
                        currentMonster.maxHP = serverMonster.maxHP;
                    }
                }
            });
            gameState.monsters = currentMonsters;

            // --- Canvas FX for monster HP changes (skills) ---
            if (hitEvents.length) {
                if (isAoe) {
                    // Big beam + shake, all targets jitter
                    mfAnimShake(7, 260);
                    hitEvents.forEach(ev => {
                        const targetKey = `monster:${ev.id}`;
                        mfAnimAddBeam(attackerKey, targetKey, 'rgba(255,60,60,0.95)', 10, 320);
                        mfAnimHit(targetKey, { blinks: 2, dur: 320, amp: 5 });
                        mfAnimAddFloatAtUnit(targetKey, `-${ev.damage}`, 'rgba(255,60,60,0.95)', 4000);
                    });

                    try {
                        const total = hitEvents.reduce((s, ev) => s + (Number(ev.damage) || 0), 0);
                        const count = hitEvents.length;
                        mfShowBattleToast(`${player?.studentName || 'Player'} ${skill?.name || 'Skill'} -${total} (${count} targets)`);
                    } catch {}
                } else {
                    const best = hitEvents.reduce((a, b) => (b.damage > a.damage ? b : a), hitEvents[0]);
                    const targetKey = `monster:${best.id}`;
                    if (isRanged) mfAnimAddBeam(attackerKey, targetKey, 'rgba(255,60,60,0.95)', 6, 280);
                    else mfAnimDash(attackerKey, targetKey, { dur: 340 });
                    mfAnimHit(targetKey, { blinks: 2, dur: 260, amp: 4 });
                    mfAnimAddFloatAtUnit(targetKey, `-${best.damage}`, 'rgba(255,60,60,0.95)', 4000);

                    try {
                        const m = (gameState.monsters || []).find(mm => mm && mm.id === best.id) || targetMonsterBefore;
                        mfShowBattleToast(`${player?.studentName || 'Player'} ${skill?.name || 'Skill'} ${m?.name || 'Monster'} -${best.damage}`);
                    } catch {}
                }
            }
        }

        // --- Canvas FX for player HP changes (heal/self-cost/etc) ---
        try {
            (gameState.players || []).forEach(p => {
                const before = beforePlayerHp.get(p.studentId);
                if (before === undefined) return;
                const after = Number(p.currentHP || 0);
                const delta = after - before;
                if (!delta) return;
                const key = `player:${p.studentId}`;
                if (delta > 0) {
                    mfAnimAddFloatAtUnit(key, `+${delta}`, 'rgba(34,197,94,0.95)', 4000);
                    mfAnimHit(key, { blinks: 2, dur: 260, amp: 2 });

                    // toast for heals (show first heal only)
                    if (!mfBattleUi._lastHealToastAt || (Date.now() - mfBattleUi._lastHealToastAt) > 400) {
                        mfBattleUi._lastHealToastAt = Date.now();
                        mfShowBattleToast(`${player?.studentName || 'Healer'} ${skill?.name || 'Heal'} ${p?.studentName || ''} +${delta}`.trim());
                    }
                } else {
                    mfAnimAddFloatAtUnit(key, `${delta}`, 'rgba(255,60,60,0.95)', 4000);
                    mfAnimHit(key, { blinks: 2, dur: 220, amp: 2 });
                }
            });
        } catch {}

        // Healer flip (visual cue)
        if (requiredTargetType === 'ally_alive') {
            mfAnimFlip(attackerKey, 3, 520);
        }
        
        renderGame();
    } catch (error) {
        console.error('Error using skill:', error);
        alert(String(error?.message || 'Failed to use skill'));
    }
}

// Process monster turn
async function processMonsterTurn() {
    console.log('=== PROCESS MONSTER TURN ===');
    if (monsterTurnReplay && monsterTurnReplay.active) {
        console.log('[monster-turn] replay in progress, ignoring.');
        return;
    }
    console.log('Players BEFORE monster turn:', gameState.players.map(p => ({
        name: p.studentName,
        hp: `${p.currentHP}/${p.maxHP}`,
        alive: p.isAlive
    })));
    console.log('Monsters BEFORE monster turn:', gameState.monsters?.map(m => ({
        name: m.name,
        hp: `${m.currentHP}/${m.maxHP}`,
        alive: m.isAlive
    })));
    
    try {
        // IMPORTANT: enter replay mode BEFORE server broadcast arrives (via WebSocket)
        // to prevent "apply final state first, then revert to snapshots" flicker and double-processing.
        monsterTurnReplay.active = true;
        monsterTurnReplay.pendingWsState = null;
        monsterTurnReplay.onDone = null;

        const response = await fetch(`${GAME_API_BASE}/game/monster-turn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error('Failed to process monster turn');
        }
        
        const data = await response.json();
        console.log('Server response:', JSON.stringify(data, null, 2));

        const hasEvents = Array.isArray(data?.turnEvents) && data.turnEvents.length > 0 && data.gameState;
        if (hasEvents) {
            const finalState = data.gameState;
            monsterTurnReplay.onDone = () => {
                const synced = monsterTurnReplay.pendingWsState || finalState;
                monsterTurnReplay.active = false;
                if (synced) {
                    gameState = synced;
                    lastActionLogLength = Array.isArray(gameState.actionLog) ? gameState.actionLog.length : lastActionLogLength;
                }
                renderGame();
            };

            // Queue popups with snapshot application before each popup appears.
            data.turnEvents.forEach((evt) => {
                const log = evt?.log || {};
                const snap = evt?.snapshot || null;
                const rawMessage = String(log.message || '');
                if (!rawMessage) return;
                const summary = Array.isArray(log.summaryDetails) ? decorateSummaryLines(log.summaryDetails) : null;
                const context = { ...(derivePopupContext(rawMessage) || {}), rawMessage };
                const decoratedMessage = decorateMessageWithIcons(rawMessage);
                queueActionPopup(decoratedMessage, summary, context, {
                    beforeShow: () => {
                        const prevState = gameState ? {
                            phase: gameState.phase,
                            currentTurn: gameState.currentTurn,
                            players: gameState.players,
                            monsters: gameState.monsters,
                            actionLog: gameState.actionLog
                        } : null;

                        applyMonsterTurnSnapshot(snap);
                        // Replay FX based on snapshot diffs
                        try { mfReplayFxFromMonsterTurnStep(rawMessage, prevState, gameState); } catch {}
                        renderGame();
                    }
                });
            });
            return;
        }

        // Fallback (older server): apply full state immediately
        const currentMonsters = gameState.monsters ? [...gameState.monsters] : null;
        const currentPlayers = gameState.players ? [...gameState.players] : null;
        gameState = data.gameState || data;

        if (currentPlayers && currentPlayers.length > 0 && gameState.players) {
            currentPlayers.forEach((currentPlayer) => {
                const serverPlayer = gameState.players.find(p => p.studentId === currentPlayer.studentId);
                if (serverPlayer) {
                    currentPlayer.currentHP = serverPlayer.currentHP;
                    currentPlayer.isAlive = serverPlayer.isAlive;
                    if (serverPlayer.maxHP) currentPlayer.maxHP = serverPlayer.maxHP;
                }
            });
            gameState.players = currentPlayers;
        }
        if (currentMonsters && currentMonsters.length > 0 && gameState.monsters) {
            currentMonsters.forEach((currentMonster) => {
                const serverMonster = gameState.monsters.find(m => m.id === currentMonster.id);
                if (serverMonster) {
                    currentMonster.currentHP = serverMonster.currentHP;
                    currentMonster.isAlive = serverMonster.isAlive;
                    if (serverMonster.maxHP) currentMonster.maxHP = serverMonster.maxHP;
                }
            });
            gameState.monsters = currentMonsters;
        }
        renderGame();
        // end replay mode (no step events)
        monsterTurnReplay.active = false;
    } catch (error) {
        // ensure replay mode is cleared on failure
        try { monsterTurnReplay.active = false; } catch {}
        console.error('Error processing monster turn:', error);
        alert('Failed to process monster turn');
    }
}

// Show revive modal
function showReviveModal(studentId) {
    const player = gameState.players.find(p => p.studentId === studentId);
    if (!player) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Revive ${player.studentName}</h3>
                <span class="modal-close" onclick="this.closest('.modal').remove()">&times;</span>
            </div>
            <div class="modal-body">
                <p>Enter puzzle points to attempt revival</p>
                <input type="number" id="revive_points" min="1" max="${player.puzzlePoints}" value="1" class="puzzle-input">
                <p id="revive_probability"></p>
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="attemptRevive('${studentId}')">Attempt Revive</button>
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    // Update probability display
    const pointsInput = document.getElementById('revive_points');
    const probDisplay = document.getElementById('revive_probability');
    
    pointsInput.addEventListener('input', () => {
        const points = parseInt(pointsInput.value) || 0;
        // Calculate probability (simplified - actual calculation on server)
        const baseRate = gameConfig.baseReviveRate;
        const decay = gameConfig.reviveRateDecay;
        const maxRate = gameConfig.maxReviveRate;
        const accumulated = player.accumulatedReviveRate || 0;
        
        let totalRate = accumulated;
        if (points > 0) {
            const geometricSum = baseRate * (1 - Math.pow(decay, points)) / (1 - decay);
            totalRate += geometricSum;
        }
        totalRate = Math.min(totalRate, maxRate);
        
        probDisplay.textContent = `Revive Probability: ${(totalRate * 100).toFixed(1)}%`;
    });
    
    pointsInput.dispatchEvent(new Event('input'));
}

// Attempt revive
async function attemptRevive(studentId) {
    const pointsInput = document.getElementById('revive_points');
    const puzzlePoints = parseInt(pointsInput.value) || 0;
    
    if (puzzlePoints <= 0) {
        alert('Please enter a valid number of puzzle points');
        return;
    }
    
    try {
        const response = await fetch(`${GAME_API_BASE}/game/revive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId, puzzlePoints })
        });
        
        if (!response.ok) {
            throw new Error('Failed to attempt revive');
        }
        
        const data = await response.json();
        gameState = data.gameState;
        
        // Close modal
        document.querySelector('.modal.show')?.remove();
        
        if (data.success) {
            alert(`${gameState.players.find(p => p.studentId === studentId)?.studentName} successfully revived!`);
        } else {
            alert(`Revive failed. Probability was ${(data.reviveRate * 100).toFixed(1)}%`);
        }
        
        renderGame();
    } catch (error) {
        console.error('Error attempting revive:', error);
        alert('Failed to attempt revive');
    }
}

// Render level complete screen
function renderLevelComplete() {
    const container = document.getElementById('monsterFightGame');
    const nextLevel = gameState.currentLevel;
    const isLastLevel = nextLevel > gameState.levelConfig.length;
    
    container.innerHTML = `
        <div class="game-screen">
            <div class="level-complete-screen" style="text-align: center; padding: 40px;">
                <h2>🎉 Level ${nextLevel - 1} Complete!</h2>
                ${!isLastLevel ? `
                    <p style="font-size: 1.2em; margin: 20px 0;">Ready to start Level ${nextLevel}?</p>
                    <div class="level-complete-actions" style="margin-top: 30px;">
                        <button class="btn btn-primary" onclick="startNextLevel()" style="font-size: 1.2em; padding: 15px 30px;">➡️ Start Level ${nextLevel}</button>
                    </div>
                ` : `
                    <p style="font-size: 1.2em; margin: 20px 0;">All levels completed! Congratulations!</p>
                    <div class="level-complete-actions" style="margin-top: 30px;">
                        <button class="btn btn-primary" onclick="completeGame()" style="font-size: 1.2em; padding: 15px 30px;">🏆 Complete Game</button>
                    </div>
                `}
            </div>
        </div>
    `;
}

// Start next level
async function startNextLevel() {
    try {
        // Clear existing monsters first to force re-initialization
        gameState.monsters = [];
        
        // Initialize monsters for next level by setting puzzle points (keep current values)
        const puzzlePoints = {};
        gameState.players.forEach(player => {
            puzzlePoints[player.studentId] = player.puzzlePoints || 0; // Keep current puzzle points
        });
        
        const response = await fetch(`${GAME_API_BASE}/game/input-puzzle-points`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ puzzlePoints })
        });
        
        if (!response.ok) {
            throw new Error('Failed to start next level');
        }
        
        const newState = await response.json();
        // Update game state completely for new level
        gameState = newState;
        // Ensure phase is player_turn
        gameState.phase = 'player_turn';
        // Reset player action flags
        gameState.players.forEach(p => p.hasActed = false);
        renderGame();
    } catch (error) {
        console.error('Error starting next level:', error);
        alert('Failed to start next level');
    }
}

// Complete game
async function completeGame() {
    try {
        // Trigger game over by reloading game state
        const response = await fetch(`${GAME_API_BASE}/game/state`);
        if (!response.ok) {
            throw new Error('Failed to load game state');
        }
        gameState = await response.json();
        renderGame();
    } catch (error) {
        console.error('Error completing game:', error);
        alert('Failed to complete game');
    }
}

// Render game over screen
function renderGameOver() {
    const container = document.getElementById('monsterFightGame');
    const rewardsSummary = gameState.rewardsSummary || {};
    const rewardLookup = {};
    if (Array.isArray(rewardsSummary.rewards)) {
        rewardsSummary.rewards.forEach(entry => {
            rewardLookup[entry.studentId] = entry;
        });
    }
    const baseReward = rewardsSummary.baseReward ?? 20;
    const mvpBonus = rewardsSummary.mvpBonus ?? 5;
    const mvpId = rewardsSummary.mvp?.studentId;

    container.innerHTML = `
        <div class="game-screen">
            <h2>🎉 Game Over!</h2>
            <div class="reward-summary">
                <p>Each player receives <strong>${baseReward}</strong> rank points${rewardsSummary.mvp ? `, and MVP <strong>${rewardsSummary.mvp.name}</strong> earns an additional <strong>${mvpBonus}</strong> points!` : ''}</p>
            </div>
            <div class="game-results">
                <h3>Results</h3>
                ${gameState.players.map(player => {
                    const rewardInfo = rewardLookup[player.studentId];
                    const reward = rewardInfo?.reward ?? player.rewardPoints ?? baseReward;
                    const isMVP = rewardInfo?.isMVP || player.studentId === mvpId;
                    const stats = player.stats || {};
                    return `
                        <div class="result-card ${isMVP ? 'mvp-card' : ''}">
                            <h4>${player.studentName}${isMVP ? ' ⭐️ MVP' : ''}</h4>
                            <p>Reward: ${reward}</p>
                            <p>Damage: ${stats.totalDamage || 0}</p>
                            <p>Kills: ${stats.kills || 0}</p>
                            <p>Healing: ${stats.healing || 0}</p>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Make functions globally available
window.initMonsterFight = initMonsterFight;
window.selectCharacter = selectCharacter;
window.startBattleMode = startBattleMode;
window.openGameSettings = openGameSettings;
window.closeSettingsModal = closeSettingsModal;
window.switchSettingsTab = switchSettingsTab;
window.toggleSettingsItem = toggleSettingsItem;
window.updateLevelConfig = updateLevelConfig;
window.updateLevelMonsters = updateLevelMonsters;
window.saveGameSettings = saveGameSettings;
window.renderLevelConfigList = renderLevelConfigList;
window.renderLevelMonsters = renderLevelMonsters;
window.updatePuzzlePoints = updatePuzzlePoints;
window.applyDifficultyPreset = applyDifficultyPreset;
window.startBattleAfterPuzzleInput = startBattleAfterPuzzleInput;
window.startNextLevel = startNextLevel;
window.completeGame = completeGame;
window.terminateGame = terminateGame;
window.playerAttack = playerAttack;
window.playerUseSkill = playerUseSkill;
window.processMonsterTurn = processMonsterTurn;
window.showReviveModal = showReviveModal;
window.attemptRevive = attemptRevive;

// Log that game.js has loaded
console.log('monster-fight.js loaded successfully');

function addIconToName(name, type, id) {
    if (!name) return '';
    if (type === 'player') {
        const cls = getPlayerClasses().find(c => c.id === id);
        const src = imageSrcForFile(classImageFileById(id));
        const fb = (cls && cls.emoji) || CLASS_ICON_MAP[id] || '🧑';
        const iconHtml = src
            ? `<img class="mf-inline-icon" alt="" src="${escapeHtml(src)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';"><span class="mf-inline-emoji" style="display:none;">${escapeHtml(fb)}</span>`
            : `<span class="mf-inline-emoji">${escapeHtml(fb)}</span>`;
        return `${iconHtml} ${escapeHtml(name)}`;
    }
    if (type === 'monster') {
        const src = imageSrcForFile(monsterImageFileByType(id));
        const fb = monsterIconMap[id] || '👾';
        const iconHtml = src
            ? `<img class="mf-inline-icon" alt="" src="${escapeHtml(src)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';"><span class="mf-inline-emoji" style="display:none;">${escapeHtml(fb)}</span>`
            : `<span class="mf-inline-emoji">${escapeHtml(fb)}</span>`;
        return `${iconHtml} ${escapeHtml(name)}`;
    }
    return name;
}

function decorateMessageWithIcons(message) {
    if (!message) return message;
    if (!gameState || !Array.isArray(gameState.players) || !Array.isArray(gameState.monsters)) {
        return message;
    }
    let decorated = message;
    gameState.players.forEach(player => {
        if (player.studentName && decorated.includes(player.studentName)) {
            const iconName = addIconToName(player.studentName, 'player', player.characterClass);
            const highlighted = `<span class="action-popup-entity player-entity">${iconName}</span>`;
            decorated = decorated.replace(new RegExp(player.studentName, 'g'), highlighted);
        }
    });
    gameState.monsters.forEach(monster => {
        if (monster.name && decorated.includes(monster.name)) {
            const iconName = addIconToName(monster.name, 'monster', monster.type);
            const highlighted = `<span class="action-popup-entity monster-entity">${iconName}</span>`;
            decorated = decorated.replace(new RegExp(monster.name, 'g'), highlighted);
        }
    });
    return decorated;
}

function decorateSummaryLines(lines) {
    if (!Array.isArray(lines)) return [];
    return lines.map(line => decorateMessageWithIcons(line));
}

function derivePopupContext(message) {
    const context = {};
    if (!message || !gameState) {
        return context;
    }

    const entities = [];
    const participants = [
        ...gameState.monsters.map(monster => ({
            type: 'monster',
            id: monster.type,
            name: monster.name,
            emoji: monsterIconMap[monster.type] || monster.emoji || '👾',
            imgSrc: imageSrcForFile(monsterImageFileByType(monster.type))
        })),
        ...gameState.players.map(player => ({
            type: 'player',
            id: player.characterClass,
            name: player.studentName,
            emoji: CLASS_ICON_MAP[player.characterClass] || '🧑',
            imgSrc: imageSrcForFile(classImageFileById(player.characterClass))
        }))
    ];

    participants.forEach(entity => {
        if (!entity.name) return;
        const index = message.indexOf(entity.name);
        if (index !== -1) {
            entities.push({ ...entity, index });
        }
    });

    if (entities.length === 0) {
        return context;
    }

    entities.sort((a, b) => a.index - b.index);

    const actor = entities[0];
    let target = null;
    for (let i = 1; i < entities.length; i += 1) {
        if (entities[i].type !== actor.type || entities[i].name !== actor.name) {
            target = entities[i];
            break;
        }
    }

    if (actor) {
        context.actorEmoji = actor.emoji;
        if (actor.imgSrc) context.actorImgSrc = actor.imgSrc;
    }
    if (target) {
        context.targetEmoji = target.emoji;
        if (target.imgSrc) context.targetImgSrc = target.imgSrc;
    }

    const lower = message.toLowerCase();
    if (lower.includes('heal') || lower.includes('restores') || lower.includes('regenerate')) {
        context.actionEmoji = '✨';
        context.actionKind = 'heal';
    } else if (lower.includes('burn') || lower.includes('fire') || lower.includes('flame')) {
        context.actionEmoji = '🔥';
        context.actionKind = 'attack';
    } else if (lower.includes('bleed') || lower.includes('poison')) {
        context.actionEmoji = '🩸';
        context.actionKind = 'attack';
    } else if (lower.includes('stun') || lower.includes('freeze') || lower.includes('silence')) {
        context.actionEmoji = '💫';
        context.actionKind = 'attack';
    } else if (lower.includes('defeat') || lower.includes('kill')) {
        context.actionEmoji = '☠️';
        context.actionKind = 'attack';
    } else if (lower.includes('shield') || lower.includes('protect')) {
        context.actionEmoji = '🛡️';
        context.actionKind = 'attack';
    } else if (lower.includes('revive')) {
        context.actionEmoji = '🕊️';
        context.actionKind = 'heal';
    } else if (lower.includes('attack') || lower.includes('strike') || lower.includes('slash') || lower.includes('smashes')) {
        context.actionEmoji = '⚔️';
        context.actionKind = 'attack';
    } else {
        context.actionEmoji = '⚡';
        context.actionKind = 'attack';
    }

    return context;
}

