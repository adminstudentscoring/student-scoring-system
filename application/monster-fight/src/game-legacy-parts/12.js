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


