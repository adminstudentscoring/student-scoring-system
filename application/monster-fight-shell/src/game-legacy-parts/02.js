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
            renderCharacterSelection();
            break;
        case 'level_complete':
            renderLevelComplete();
            break;
        case 'puzzle_input':
        case 'player_turn':
        case 'monster_turn':
            // If phase is puzzle_input, treat it as player_turn (puzzle input is now integrated)
            if (gameState.phase === 'puzzle_input') {
                gameState.phase = 'player_turn';
            }
            renderBattleMode();
            break;
        case 'game_over':
            renderGameOver();
            break;
        default:
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
    container.innerHTML = `
        <div class="game-screen">
            <div class="character-selection-header">
                <h2>🐉 Monster Fight - Character Selection</h2>
                <button class="btn btn-secondary" onclick="openGameSettings()">⚙️ Settings</button>
            </div>
            <div class="character-selection-grid">
                ${gameState.players.map(player => `
                    <div class="character-selection-card">
                        <h3>${player.studentName}</h3>
                        ${player.characterClass ? `
                            <div class="selected-character">
                                <span class="character-emoji">${playerClasses.find(c => c.id === player.characterClass)?.emoji || '❓'}</span>
                                <p>${playerClasses.find(c => c.id === player.characterClass)?.name || 'Unknown'}</p>
                            </div>
                        ` : `
                            <div class="character-options">
                                ${playerClasses.map(charClass => `
                                    <div class="character-option" onclick="selectCharacter('${player.studentId}', '${charClass.id}')">
                                        <span class="character-emoji">${charClass.emoji}</span>
                                        <p>${charClass.name}</p>
                                        <small>ATK: ${charClass.baseAttack} | HP: ${charClass.baseHP}</small>
                                    </div>
                                `).join('')}
                            </div>
                        `}
                    </div>
                `).join('')}
            </div>
            ${gameState.players.every(p => p.characterClass) ? `
                <button class="btn btn-primary" onclick="startBattleMode()">Start Battle</button>
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
        maxReviveRate: 0.66
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
                        <span class="character-emoji">${charClass.emoji}</span>
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
                                        <strong>${skill.name}</strong> (${skill.type})
                                        ${skill.cooldown ? `<span>CD: ${skill.cooldown}</span>` : ''}
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
                        <span class="monster-emoji">${monster.emoji}</span>
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
                                        <strong>${skill.name}</strong> (${skill.type})
                                        ${skill.cooldown ? `<span>CD: ${skill.cooldown}</span>` : ''}
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
