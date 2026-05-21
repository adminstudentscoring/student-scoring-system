function ensureActionPopupContainer() {
    if (!document.getElementById('actionPopupContainer')) {
        const container = document.createElement('div');
        container.id = 'actionPopupContainer';
        container.className = 'action-popup-container';
        document.body.appendChild(container);
    }
}

async function processActionQueue() {
    if (isShowingPopup) return;
    const item = actionQueue.shift();
    if (!item) {
        // No more events: hide toast bar.
        try { mfHideBattleToast(); } catch {}
        // If a monster-turn replay just finished, apply any pending WS sync now.
        if (monsterTurnReplay?.active && typeof monsterTurnReplay.onDone === 'function') {
            try { monsterTurnReplay.onDone(); } catch {}
            monsterTurnReplay.onDone = null;
        }
        return;
    }
    isShowingPopup = true;
    try {
        if (typeof item.beforeShow === 'function') {
            await Promise.resolve(item.beforeShow());
        }
    } catch (e) {
        console.warn('[actionQueue] beforeShow failed', e);
    }

    // No more popup UI in battle; just advance automatically.
    if (MF_DISABLE_ACTION_POPUPS) {
        const raw = item?.context?.rawMessage || item?.message || '';
        const txt = mfToastTextFromRaw(raw);
        const autoProceed = !!item?.context?.autoProceed;

        if (autoProceed) {
            // Auto-play first step, then require Next for the rest.
            try { mfToast(txt, { ms: Math.round(MF_REPLAY_STEP_MS * (MF_ANIM_SLOW_FACTOR || 1)) }); } catch {}
            const delay = Math.max(250, Math.round(MF_REPLAY_STEP_MS * (MF_ANIM_SLOW_FACTOR || 1)));
            setTimeout(() => {
                isShowingPopup = false;
                void processActionQueue();
            }, delay);
            return;
        }

        try {
            mfToast(txt, {
                next: true,
                onNext: () => {
                    isShowingPopup = false;
                    void processActionQueue();
                }
            });
        } catch {}
        // Wait for user to click Next for subsequent steps.
        return;
    }

    showActionPopup(item.message, item.summary, item.context || {});
}

function queueActionPopup(message, summary, context = {}, opts = {}) {
    if (!message) return;
    actionQueue.push({ message, summary, context, beforeShow: opts?.beforeShow });
    void processActionQueue();
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

function statusLabel(status) {
    const t = String(status?.type || '').trim().toLowerCase();
    if (!t) return '';
    if (t === 'poison') return 'Poison';
    if (t === 'bleed') return 'Bleed';
    if (t === 'bleeding_claw') return 'Bleed';
    if (t === 'silence') return 'Silence';
    if (t === 'stun') return 'Stun';
    if (t === 'freeze') return 'Freeze';
    if (t === 'attack') return 'ATK↓';
    if (t === 'regen') return 'Regen';
    return t;
}

function renderStatusText(entity) {
    const statuses = Array.isArray(entity?.statuses) ? entity.statuses : [];
    const labels = statuses
        .map(statusLabel)
        .filter(Boolean);
    if (!labels.length) return '';
    const txt = labels.slice(0, 3).join(', ') + (labels.length > 3 ? ` +${labels.length - 3}` : '');
    return `<span class="mf-status-text">${txt}</span>`;
}

function toggleActionLog() {
    actionLogCollapsed = !actionLogCollapsed;
    renderGame();
}

function applyMonsterTurnSnapshot(snapshot) {
    if (!snapshot || !gameState) return;
    try {
        if (snapshot.phase) gameState.phase = snapshot.phase;
        if (typeof snapshot.currentTurn === 'number') gameState.currentTurn = snapshot.currentTurn;
        if (Array.isArray(snapshot.players)) gameState.players = snapshot.players;
        if (Array.isArray(snapshot.monsters)) gameState.monsters = snapshot.monsters;
        if (Array.isArray(snapshot.actionLog)) gameState.actionLog = snapshot.actionLog;
    } catch (e) {
        console.warn('[monster-turn] failed to apply snapshot', e);
    }
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
    const kind = String(context?.actionKind || '').trim();
    animationWrapper.classList.add(kind === 'heal' ? 'is-heal' : 'is-attack');

    const actionTrail = document.createElement('div');
    actionTrail.className = 'action-popup-trail';
    animationWrapper.appendChild(actionTrail);

    const actionArrow = document.createElement('div');
    actionArrow.className = 'action-popup-arrow';
    animationWrapper.appendChild(actionArrow);

    const actorIcon = document.createElement('div');
    actorIcon.className = 'action-popup-actor';
    if (context.actorImgSrc) {
        const fb = String(context.actorEmoji || '🎭');
        actorIcon.innerHTML = `<img class="mf-popup-icon" alt="" src="${escapeHtml(String(context.actorImgSrc))}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';"><span class="mf-popup-emoji" style="display:none;">${escapeHtml(fb)}</span>`;
    } else {
        actorIcon.textContent = context.actorEmoji || '🎭';
    }

    const targetIcon = document.createElement('div');
    targetIcon.className = 'action-popup-target';
    if (context.targetImgSrc) {
        const fb = String(context.targetEmoji || '🎯');
        targetIcon.innerHTML = `<img class="mf-popup-icon" alt="" src="${escapeHtml(String(context.targetImgSrc))}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';"><span class="mf-popup-emoji" style="display:none;">${escapeHtml(fb)}</span>`;
    } else {
        targetIcon.textContent = context.targetEmoji || '🎯';
    }

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
            void processActionQueue();
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
            // During monster turn replay, ignore WS state changes (we apply snapshots step-by-step).
            if (monsterTurnReplay && monsterTurnReplay.active) {
                try { monsterTurnReplay.pendingWsState = data.gameState; } catch {}
                return;
            }
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
                        // In toast mode, we do NOT enqueue WS logs as replay/popups.
                        // This prevents "player actions" showing up before monster-turn replay steps.
                        if (!MF_DISABLE_ACTION_POPUPS) {
                            queueActionPopup(decoratedMessage, summary, context);
                        }
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
            // Safety check: ensure arrays are valid before assigning
            playerClasses = Array.isArray(data.playerClasses) ? data.playerClasses : (playerClasses || []);
            monsterTypes = Array.isArray(data.monsterTypes) ? data.monsterTypes : (monsterTypes || []);
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
        // Safety check: ensure arrays are valid before assigning
        playerClasses = Array.isArray(data.playerClasses) ? data.playerClasses : [];
        monsterTypes = Array.isArray(data.monsterTypes) ? data.monsterTypes : [];
        cacheIconMaps();
        // Make available globally
        window.playerClasses = playerClasses;
        window.monsterTypes = monsterTypes;
        // Apply background theme from config (defaults to white)
        applyBackgroundTheme(gameConfig?.backgroundTheme || 'image');
        console.log('Game config loaded successfully');
        console.log(`Loaded ${playerClasses.length} player classes and ${monsterTypes.length} monster types`);
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
