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
            backgroundTheme: String(document.getElementById('setting_backgroundTheme')?.value || 'image'),
            battleMap: String(document.getElementById('setting_battleMap')?.value || 'Battle/Map.jpg')
        };
        
        // Collect player classes settings
        const playerClasses = [];
        const playerItems = document.querySelectorAll('#settings-players .settings-item');
        playerItems.forEach((item, index) => {
            const originalClass = gameSettings.playerClasses[index];
            if (originalClass) {
                const nextSkills = (originalClass.skills || []).map((s, skillIndex) => {
                    const input = document.getElementById(`player_${index}_skill_${skillIndex}_cd`);
                    const effInput = document.getElementById(`player_${index}_skill_${skillIndex}_effect`);
                    if (!input) return s;
                    const raw = String(input.value ?? '').trim();
                    let nextEffect = s?.effect;
                    if (effInput) {
                        const effRaw = String(effInput.value ?? '').trim();
                        try {
                            nextEffect = effRaw ? JSON.parse(effRaw) : (s?.effect ?? {});
                        } catch (e) {
                            throw new Error(`Invalid JSON in ${originalClass.name} → ${s?.name || s?.id || 'skill'} effect`);
                        }
                    }
                    if (raw === '') {
                        const { cooldown, ...rest } = s || {};
                        return { ...rest, effect: nextEffect };
                    }
                    const cd = parseInt(raw, 10);
                    if (Number.isFinite(cd) && cd >= 0) return { ...(s || {}), cooldown: cd, effect: nextEffect };
                    return { ...(s || {}), effect: nextEffect };
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
        // Refresh battle canvas map if in battle mode
        try { if (gameState && (gameState.phase === 'player_turn' || gameState.phase === 'monster_turn')) initBattleCanvas(); } catch {}
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
    const canProcessMonsterTurn = !!(!monsterTurnReplay?.active && (isMonsterTurn || (isPlayerTurn && allPlayersActed)));

    if (!container) return;

    // IMPORTANT: Avoid rebuilding the battle DOM every action (it causes a full-screen "flash").
    // Only build the shell once; subsequent calls update the topbar + HUD in-place.
    const existingBattle = container.querySelector('.game-screen.mf-battle');
    if (!existingBattle) {
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
                        <div id="mfBattleToast" class="mf-battle-toast" aria-live="polite">
                            <div class="mf-battle-toast-text"></div>
                            <button class="mf-battle-toast-next" type="button">Next</button>
                        </div>
                    </div>
                    <div id="mfBattleHud" class="mf-battle-hud"></div>
                </div>
            </div>
        `;

        // Re-apply last toast after DOM rebuild (toast is persisted via mfPendingToast).
        if (mfPendingToast && mfPendingToast.text) {
            try { mfShowBattleToast(mfPendingToast.text, mfPendingToast.opts || {}); } catch {}
        }

        // Draw map background on canvas (step 1 of canvas battle scene).
        setTimeout(initBattleCanvas, 0);
        setTimeout(mfBindBattleCanvasInput, 0);
        setTimeout(mfRenderBattleHud, 0);
        return;
    }

    // In-place updates (no DOM rebuild)
    try {
        const titleEl = existingBattle.querySelector('.mf-topbar-title');
        if (titleEl) titleEl.textContent = `Monster Fight - Level ${gameState.currentLevel}`;

        const badge = existingBattle.querySelector('.phase-badge');
        if (badge) {
            badge.textContent = isPlayerTurn ? 'Player Turn' : 'Monster Turn';
            badge.classList.toggle('player-turn', !!isPlayerTurn);
            badge.classList.toggle('monster-turn', !!isMonsterTurn);
        }

        const btn = existingBattle.querySelector('.mf-topbar-process');
        if (btn) {
            btn.classList.toggle('is-disabled', !canProcessMonsterTurn);
            if (canProcessMonsterTurn) btn.removeAttribute('disabled');
            else btn.setAttribute('disabled', 'disabled');
        }

        const topbar = existingBattle.querySelector('.mf-topbar');
        if (topbar) {
            let pop = existingBattle.querySelector('.mf-topbar-logpopover');
            if (actionLogCollapsed) {
                if (pop) pop.remove();
            } else {
                if (!pop) {
                    pop = document.createElement('div');
                    pop.className = 'mf-topbar-logpopover';
                    pop.setAttribute('role', 'dialog');
                    pop.setAttribute('aria-label', 'Action Log');
                    topbar.appendChild(pop);
                }
                pop.innerHTML = (gameState.actionLog && gameState.actionLog.length > 0)
                    ? gameState.actionLog.slice(-10).reverse().map(log => `
                        <div class="log-entry">[Turn ${log.turn}] ${log.message}</div>
                    `).join('')
                    : '<div class="log-entry">No actions yet.</div>';
            }
        }
    } catch {}

    // Ensure toast stays visible after any updates
    if (mfPendingToast && mfPendingToast.text) {
        try { mfShowBattleToast(mfPendingToast.text, mfPendingToast.opts || {}); } catch {}
    }

    // Update floating panels / targeting UI without recreating the battle scene
    setTimeout(mfRenderBattleHud, 0);
}

// Render player card with all actions integrated (puzzle input + actions in player_turn)
