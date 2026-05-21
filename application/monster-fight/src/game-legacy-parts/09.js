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
