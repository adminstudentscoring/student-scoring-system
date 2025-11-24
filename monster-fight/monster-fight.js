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

function cacheIconMaps() {
    playerClasses.forEach(cls => {
        CLASS_ICON_MAP[cls.id] = cls.emoji || '🎯';
    });
    monsterIconMap = {};
    monsterTypes.forEach(type => {
        monsterIconMap[type.id] = type.emoji || '🧟';
    });
}

// Use a unique variable name to avoid conflicts with other scripts
let gameWs = null;
let lastActionLogLength = 0;
let actionQueue = [];
let isShowingPopup = false;
const POPUP_AUTO_CLOSE_MS = null;

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

function processActionQueue() {
    if (isShowingPopup) return;
    const item = actionQueue.shift();
    if (!item) return;
    isShowingPopup = true;
    showActionPopup(item.message, item.summary, item.context || {});
}

function queueActionPopup(message, summary, context = {}) {
    if (!message) return;
    actionQueue.push({ message, summary, context });
    processActionQueue();
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

    const actionTrail = document.createElement('div');
    actionTrail.className = 'action-popup-trail';
    animationWrapper.appendChild(actionTrail);

    const actionIcon = document.createElement('div');
    actionIcon.className = 'action-popup-action';
    actionIcon.textContent = context.actionEmoji || '⚔️';
    animationWrapper.appendChild(actionIcon);

    const actorIcon = document.createElement('div');
    actorIcon.className = 'action-popup-actor';
    actorIcon.textContent = context.actorEmoji || '🎭';

    const targetIcon = document.createElement('div');
    targetIcon.className = 'action-popup-target';
    targetIcon.textContent = context.targetEmoji || '🎯';

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
            processActionQueue();
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
            playerClasses = data.playerClasses;
            monsterTypes = data.monsterTypes;
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
        playerClasses = data.playerClasses;
        monsterTypes = data.monsterTypes;
        cacheIconMaps();
        // Make available globally
        window.playerClasses = playerClasses;
        window.monsterTypes = monsterTypes;
        console.log('Game config loaded successfully');
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

// Render game based on current phase
let lastRenderPhase = null;
let renderDebounceTimeout = null;
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
        const cls = playerClasses.find(c => c.id === id);
        const icon = (cls && cls.emoji) || CLASS_ICON_MAP[id] || '🧑';
        return `${icon} ${name}`;
    }
    if (type === 'monster') {
        const icon = monsterIconMap[id] || '👾';
        return `${icon} ${name}`;
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
            emoji: monsterIconMap[monster.type] || monster.emoji || '👾'
        })),
        ...gameState.players.map(player => ({
            type: 'player',
            id: player.characterClass,
            name: player.studentName,
            emoji: CLASS_ICON_MAP[player.characterClass] || '🧑'
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
    }
    if (target) {
        context.targetEmoji = target.emoji;
    }

    const lower = message.toLowerCase();
    if (lower.includes('heal') || lower.includes('restores') || lower.includes('regenerate')) {
        context.actionEmoji = '✨';
    } else if (lower.includes('burn') || lower.includes('fire') || lower.includes('flame')) {
        context.actionEmoji = '🔥';
    } else if (lower.includes('bleed') || lower.includes('poison')) {
        context.actionEmoji = '🩸';
    } else if (lower.includes('stun') || lower.includes('freeze') || lower.includes('silence')) {
        context.actionEmoji = '💫';
    } else if (lower.includes('defeat') || lower.includes('kill')) {
        context.actionEmoji = '☠️';
    } else if (lower.includes('shield') || lower.includes('protect')) {
        context.actionEmoji = '🛡️';
    } else if (lower.includes('revive')) {
        context.actionEmoji = '🕊️';
    } else if (lower.includes('attack') || lower.includes('strike') || lower.includes('slash') || lower.includes('smashes')) {
        context.actionEmoji = '⚔️';
    } else {
        context.actionEmoji = '⚡';
    }

    return context;
}

