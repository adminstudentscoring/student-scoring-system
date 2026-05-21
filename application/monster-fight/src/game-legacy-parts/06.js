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

    const mapFile =
        String(gameState?.gameConfig?.battleMap || gameConfig?.battleMap || 'Battle/Map.jpg').trim() ||
        'Battle/Map.jpg';
    const mapSrc = imageSrcForFile(mapFile) || 'images/Battle/Map.jpg';
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
