function renderPlayerCardWithActions(player, isPlayerTurn) {
    console.log(`Rendering player card for ${player.studentName}, isPlayerTurn: ${isPlayerTurn}`);
    const charClass = playerClasses.find(c => c.id === player.characterClass);
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
    
    return `
        <div class="player-card-full ${!player.isAlive ? 'defeated' : ''}">
            <div class="player-card-header">
                <div class="card-header">
                    <span class="character-emoji">${charClass?.emoji || '❓'}</span>
                    <h4>${player.studentName}</h4>
                </div>
                <div class="player-stats-inline">
                    <span>ATK: ${player.attack || 0}</span>
                    ${player.maxHP > 0 ? `<span>HP: ${player.currentHP}/${player.maxHP}</span>` : ''}
                </div>
            </div>
            
            ${player.maxHP > 0 ? `
                <div class="hp-bar">
                    <div class="hp-fill" style="width: ${hpPercent}%"></div>
                    <span class="hp-text">${player.currentHP}/${player.maxHP} HP</span>
                </div>
            ` : ''}
            
            <div class="player-actions-integrated">
                ${isPlayerTurn && player.isAlive ? `
                    <div class="puzzle-input-section">
                        <label>Puzzle Points:</label>
                        <input type="text" 
                               inputmode="numeric"
                               pattern="[0-9]*"
                               id="puzzle_${player.studentId}" 
                               min="0" 
                               value="${player.puzzlePoints || 0}" 
                               class="puzzle-input-small"
                               placeholder="Enter points"
                               onchange="updatePuzzlePoints()"
                               onblur="setTimeout(() => updatePuzzlePoints(), 100)"
                               onkeypress="return (event.charCode >= 48 && event.charCode <= 57)"
                               onfocus="console.log('Input focused:', '${player.studentId}')"
                               onblur="console.log('Input blurred:', '${player.studentId}')"
                               onclick="console.log('Input clicked:', '${player.studentId}'); this.focus()"
                               onmousedown="event.stopPropagation()">
                    </div>
                ` : ''}
                
                ${isPlayerTurn && player.isAlive && !player.hasActed ? `
                    <div class="action-section">
                        <div class="action-row">
                            <label>Target:</label>
                            <select id="target_${player.studentId}" 
                                    class="target-select-small"
                                    onchange="console.log('Target selected:', '${player.studentId}', this.value)"
                                    onfocus="console.log('Select focused:', '${player.studentId}')"
                                    onblur="console.log('Select blurred:', '${player.studentId}')"
                                    onclick="console.log('Select clicked:', '${player.studentId}'); this.focus()"
                                    onmousedown="event.stopPropagation()">
                                ${targetOptionsHtml}
                            </select>
                        </div>
                        <div class="action-buttons-row">
                            <button class="btn btn-sm btn-primary" onclick="playerAttack('${player.studentId}')">⚔️ Attack</button>
                            ${player.skills && player.skills.filter(s => s.type === 'active').map(skill => {
                                const cooldown = player.skillCooldowns && player.skillCooldowns[skill.id] || 0;
                                const disabled = cooldown > 0 ? 'disabled' : '';
                                return `
                                    <button class="btn btn-sm btn-secondary skill-icon-button" 
                                            onclick="playerUseSkill('${player.studentId}', '${skill.id}')" 
                                            ${disabled}
                                            title="${skill.description}${cooldown > 0 ? ` (CD: ${cooldown})` : ''}">
                                        <span class="skill-icon">${skill.emoji || '⭐'}</span>
                                        <span class="skill-name">${skill.name}</span>
                                        ${cooldown > 0 ? `<span class="skill-cooldown">${cooldown}</span>` : ''}
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${!player.isAlive ? `
                    <div class="revive-section">
                        <button class="btn btn-sm btn-warning" onclick="showReviveModal('${player.studentId}')">💫 Revive</button>
                    </div>
                ` : ''}
                
                ${player.hasActed && player.isAlive ? `
                    <div class="action-status">
                        <span class="status-badge">✓ Action Taken</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Render monster card
function renderMonsterCard(monster) {
    const monsterType = monsterTypes.find(m => m.id === monster.type);
    const hpPercent = (monster.currentHP / monster.maxHP) * 100;
    
    return `
        <div class="monster-card ${!monster.isAlive ? 'defeated' : ''}">
            <div class="card-header">
                <span class="monster-emoji">${monster.emoji}</span>
                <h4>${monster.name}</h4>
            </div>
            <div class="hp-bar">
                <div class="hp-fill" style="width: ${hpPercent}%"></div>
                <span class="hp-text">${monster.currentHP}/${monster.maxHP} HP</span>
            </div>
            <div class="monster-stats">
                <div>ATK: ${monster.attack}</div>
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

// Player attack
async function playerAttack(studentId) {
    const targetSelect = document.getElementById(`target_${studentId}`);
    const parsedTarget = parseTargetValue(targetSelect?.value);
    
    if (!parsedTarget.id) {
        alert('Please select a target');
        return;
    }
    if (parsedTarget.type !== 'monster') {
        alert('Please select a monster target for a normal attack');
        return;
    }
    const targetId = parsedTarget.id;
    
    // Get current Puzzle Points from input field (most up-to-date value)
    const puzzleInput = document.getElementById(`puzzle_${studentId}`);
    const currentPuzzlePoints = puzzleInput ? (parseInt(puzzleInput.value) || 0) : 0;
    
    // Log before attack
    const player = gameState.players.find(p => p.studentId === studentId);
    const targetMonsterBefore = gameState.monsters?.find(m => m.id === targetId);
    console.log('=== PLAYER ATTACK ===');
    console.log(`Player: ${player?.studentName} (ID: ${studentId})`);
    console.log(`Target: ${targetMonsterBefore?.name} (ID: ${targetId})`);
    console.log(`Target HP BEFORE: ${targetMonsterBefore?.currentHP}/${targetMonsterBefore?.maxHP}`);
    console.log(`Player Attack: ${player?.attack}`);
    console.log(`Puzzle Points from input: ${currentPuzzlePoints} (gameState: ${player?.puzzlePoints})`);
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
        }
        
        renderGame();
    } catch (error) {
        console.error('Error processing attack:', error);
        alert('Failed to process attack');
    }
}

// Player use skill
