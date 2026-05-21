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
                    <button type="button" class="difficulty-button" onclick="applyDifficultyPreset('easy')">Easy</button>
                    <button type="button" class="difficulty-button" onclick="applyDifficultyPreset('medium')">Medium</button>
                    <button type="button" class="difficulty-button" onclick="applyDifficultyPreset('hard')">Hard</button>
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
        result.push(`
            <div class="level-monster-item">
                <select id="level_${levelIndex}_monster_${i}_type">
                    ${availableMonsterTypes.map(m => `
                        <option value="${m.id}" ${m.id === monster.type ? 'selected' : ''}>${m.emoji} ${m.name}</option>
                    `).join('')}
                </select>
                <input type="number" id="level_${levelIndex}_monster_${i}_count" min="1" max="10" value="${monster.count || 1}" placeholder="Count">
            </div>
        `);
    }
    
    return result.join('');
}

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

    const countInput = document.getElementById('level_count');
    if (countInput) {
        countInput.value = normalized.length;
    }

    const listContainer = document.getElementById('level-config-list');
    if (listContainer) {
        listContainer.innerHTML = renderLevelConfigList(normalized);
    }
}

// Switch settings tab
function switchSettingsTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.settings-tab').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.settings-tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`settings-${tab}`).classList.add('active');
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
            maxReviveRate: (parseFloat(document.getElementById('setting_maxReviveRate').value) || 66) / 100
        };
        
        // Collect player classes settings
        const playerClasses = [];
        const playerItems = document.querySelectorAll('#settings-players .settings-item');
        playerItems.forEach((item, index) => {
            const originalClass = gameSettings.playerClasses[index];
            if (originalClass) {
                playerClasses.push({
                    ...originalClass,
                    baseAttack: parseInt(document.getElementById(`player_${index}_attack`).value) || originalClass.baseAttack,
                    baseHP: parseInt(document.getElementById(`player_${index}_hp`).value) || originalClass.baseHP
                });
            }
        });
        
        // Collect monster types settings
        const monsterTypes = [];
        const monsterItems = document.querySelectorAll('#settings-monsters .settings-item');
        monsterItems.forEach((item, index) => {
            const originalMonster = gameSettings.monsterTypes[index];
            if (originalMonster) {
                monsterTypes.push({
                    ...originalMonster,
                    baseAttack: parseInt(document.getElementById(`monster_${index}_attack`).value) || originalMonster.baseAttack,
                    baseHP: parseInt(document.getElementById(`monster_${index}_hp`).value) || originalMonster.baseHP
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
            <h2>🐉 Monster Fight - Puzzle Points Input</h2>
            <p>Enter puzzle points for each student (8-40 points)</p>
            <div class="puzzle-input-grid">
                ${gameState.players.map(player => `
                    <div class="puzzle-input-card">
                        <h3>${player.studentName}</h3>
                        <div class="character-info">
                            <span class="character-emoji">${playerClasses.find(c => c.id === player.characterClass)?.emoji || '❓'}</span>
                            <span>${playerClasses.find(c => c.id === player.characterClass)?.name || 'Unknown'}</span>
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
    
    container.innerHTML = `
        <div class="game-screen">
            <div class="battle-header">
                <h2>🐉 Monster Fight - Level ${gameState.currentLevel}</h2>
                <div class="battle-header-actions">
                    <div class="turn-info">
                        <span>Turn: ${gameState.currentTurn}</span>
                        <span class="phase-badge ${isPlayerTurn ? 'player-turn' : 'monster-turn'}">
                            ${isPlayerTurn ? 'Player Turn' : 'Monster Turn'}
                        </span>
                    </div>
                    <button class="btn btn-danger" onclick="terminateGame()">⛔ Terminate Game</button>
                </div>
            </div>
            
            <div class="battle-layout-horizontal">
                <div class="monsters-section">
                    <h3>Monsters</h3>
                    <div class="monsters-grid">
                        ${gameState.monsters && gameState.monsters.length > 0 
                            ? gameState.monsters.map(monster => renderMonsterCard(monster)).join('')
                            : '<p>No monsters yet. Initialize battle to start.</p>'
                        }
                    </div>
                </div>
                
                <div class="players-section-vertical">
                    <h3>Players</h3>
                    <div class="players-list-vertical">
                        ${gameState.players.map(player => renderPlayerCardWithActions(player, isPlayerTurn)).join('')}
                    </div>
                </div>
            </div>
            
            ${isPlayerTurn ? `
                ${(() => {
                    const alivePlayers = gameState.players.filter(p => p.isAlive);
                    const allPlayersActed = alivePlayers.length > 0 && alivePlayers.every(p => p.hasActed);
                    if (allPlayersActed) {
                        return `
                            <div class="battle-actions">
                                <button class="btn btn-primary" onclick="processMonsterTurn()">⚔️ Process Monster Turn</button>
                            </div>
                        `;
                    }
                    return '';
                })()}
            ` : ''}
            
            ${isMonsterTurn ? `
                <div class="battle-actions">
                    <button class="btn btn-primary" onclick="processMonsterTurn()">⚔️ Process Monster Turn</button>
                </div>
            ` : ''}
            
            <div class="action-log">
                <h3>Action Log</h3>
                <div class="log-content">
                    ${gameState.actionLog && gameState.actionLog.length > 0 
                        ? gameState.actionLog.slice(-10).reverse().map(log => `
                            <div class="log-entry">[Turn ${log.turn}] ${log.message}</div>
                        `).join('')
                        : '<p>No actions yet.</p>'
                    }
                </div>
            </div>
        </div>
    `;
}

// Render player card with all actions integrated (puzzle input + actions in player_turn)
