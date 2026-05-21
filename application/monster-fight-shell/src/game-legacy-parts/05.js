async function playerUseSkill(studentId, skillId) {
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
    
    // Check cooldown
    if (player.skillCooldowns && player.skillCooldowns[skillId] > 0) {
        alert(`Skill is on cooldown (${player.skillCooldowns[skillId]} turns remaining)`);
        return;
    }
    
    const targetSelect = document.getElementById(`target_${studentId}`);
    const parsedTarget = parseTargetValue(targetSelect?.value);
    const requiredTargetType = getSkillTargetType(player, skill);

    let targetId = null;
    let targetMonsterBefore = null;
    let targetPlayerBefore = null;
    if (requiredTargetType === 'monster') {
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
    
    // Get current Puzzle Points from input field (most up-to-date value)
    const puzzleInput = document.getElementById(`puzzle_${studentId}`);
    const currentPuzzlePoints = puzzleInput ? (parseInt(puzzleInput.value) || 0) : 0;
    
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
        const response = await fetch(`${GAME_API_BASE}/game/player-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                studentId, 
                action: 'skill', 
                skillId, 
                targetId,
                puzzlePoints: currentPuzzlePoints  // Send current Puzzle Points from input
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to use skill');
        }
        
        const data = await response.json();
        console.log('Server response:', JSON.stringify(data, null, 2));
        
        // Preserve current monsters state - update only HP and alive status from server
        const currentMonsters = gameState.monsters ? [...gameState.monsters] : null;
        gameState = data.gameState;
        
        // Update monster HP from server response, but preserve the array structure
        if (currentMonsters && currentMonsters.length > 0 && gameState.monsters) {
            console.log('=== UPDATING MONSTER HP (SKILL) ===');
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
                }
            });
            gameState.monsters = currentMonsters;
        }
        
        renderGame();
    } catch (error) {
        console.error('Error using skill:', error);
        alert('Failed to use skill');
    }
}

// Process monster turn
async function processMonsterTurn() {
    console.log('=== PROCESS MONSTER TURN ===');
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
        const response = await fetch(`${GAME_API_BASE}/game/monster-turn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error('Failed to process monster turn');
        }
        
        const data = await response.json();
        console.log('Server response:', JSON.stringify(data, null, 2));
        
        // Preserve current monsters state - update only HP and alive status from server
        const currentMonsters = gameState.monsters ? [...gameState.monsters] : null;
        const currentPlayers = gameState.players ? [...gameState.players] : null;
        // Handle both { gameState } and direct gameState response
        gameState = data.gameState || data;
        
        // Update player HP from server response
        if (currentPlayers && currentPlayers.length > 0 && gameState.players) {
            console.log('=== UPDATING PLAYER HP ===');
            currentPlayers.forEach((currentPlayer) => {
                const serverPlayer = gameState.players.find(p => p.studentId === currentPlayer.studentId);
                if (serverPlayer) {
                    const oldHP = currentPlayer.currentHP;
                    const newHP = serverPlayer.currentHP;
                    const damage = oldHP - newHP;
                    
                    if (damage > 0) {
                        console.log(`Player ${currentPlayer.studentName} (${currentPlayer.studentId}):`);
                        console.log(`  HP: ${oldHP} -> ${newHP} (damage: ${damage})`);
                        console.log(`  Alive: ${currentPlayer.isAlive} -> ${serverPlayer.isAlive}`);
                    }
                    
                    currentPlayer.currentHP = serverPlayer.currentHP;
                    currentPlayer.isAlive = serverPlayer.isAlive;
                    if (serverPlayer.maxHP) {
                        currentPlayer.maxHP = serverPlayer.maxHP;
                    }
                }
            });
            gameState.players = currentPlayers;
        }
        
        // Update monster HP from server response, but preserve the array structure
        if (currentMonsters && currentMonsters.length > 0 && gameState.monsters) {
            console.log('=== UPDATING MONSTER HP (MONSTER TURN) ===');
            currentMonsters.forEach((currentMonster) => {
                const serverMonster = gameState.monsters.find(m => m.id === currentMonster.id);
                if (serverMonster) {
                    const oldHP = currentMonster.currentHP;
                    const newHP = serverMonster.currentHP;
                    const change = oldHP - newHP;
                    
                    if (change !== 0) {
                        console.log(`Monster ${currentMonster.name} (${currentMonster.id}):`);
                        console.log(`  HP: ${oldHP} -> ${newHP} (change: ${change > 0 ? '-' : '+'}${Math.abs(change)})`);
                        console.log(`  Alive: ${currentMonster.isAlive} -> ${serverMonster.isAlive}`);
                    }
                    
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
        }
        
        console.log('Players AFTER monster turn:', gameState.players.map(p => ({
            name: p.studentName,
            hp: `${p.currentHP}/${p.maxHP}`,
            alive: p.isAlive
        })));
        console.log('Monsters AFTER monster turn:', gameState.monsters?.map(m => ({
            name: m.name,
            hp: `${m.currentHP}/${m.maxHP}`,
            alive: m.isAlive
        })));
        
        renderGame();
    } catch (error) {
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
