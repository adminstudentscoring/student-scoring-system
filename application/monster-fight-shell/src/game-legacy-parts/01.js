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
                    <p>No active game found. Start a new game from Teacher → App (Monster Fight).</p>
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
