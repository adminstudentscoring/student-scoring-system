async function playerUseSkill(studentId, skillId, explicitTarget) {
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

    const isAoe = mfIsAoeSkill(player, skill);
    const attackerKey = `player:${studentId}`;
    const attackerClass = String(player?.characterClass || '').toLowerCase();
    const isRanged = (attackerClass === 'archer' || attackerClass === 'wizard');

    // snapshots for delta-based FX
    const beforeMonsterHp = new Map((gameState.monsters || []).map(m => [m.id, Number(m.currentHP || 0)]));
    const beforePlayerHp = new Map((gameState.players || []).map(p => [p.studentId, Number(p.currentHP || 0)]));
    
    // Check cooldown
    if (player.skillCooldowns && player.skillCooldowns[skillId] > 0) {
        alert(`Skill is on cooldown (${player.skillCooldowns[skillId]} turns remaining)`);
        return;
    }
    
    const requiredTargetType = getSkillTargetType(player, skill);

    let targetId = null;
    let targetMonsterBefore = null;
    let targetPlayerBefore = null;
    if (requiredTargetType === 'monster' && isAoe) {
        // AOE skills don't require a target
        targetId = null;
    } else if (requiredTargetType === 'monster') {
        const parsedTarget = explicitTarget ? mfNormalizeTargetInput(explicitTarget) : (() => {
            const targetSelect = document.getElementById(`target_${studentId}`);
            return parseTargetValue(targetSelect?.value);
        })();
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
        const parsedTarget = explicitTarget ? mfNormalizeTargetInput(explicitTarget) : (() => {
            const targetSelect = document.getElementById(`target_${studentId}`);
            return parseTargetValue(targetSelect?.value);
        })();
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
        const parsedTarget = explicitTarget ? mfNormalizeTargetInput(explicitTarget) : (() => {
            const targetSelect = document.getElementById(`target_${studentId}`);
            return parseTargetValue(targetSelect?.value);
        })();
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
        const parsedTarget = explicitTarget ? mfNormalizeTargetInput(explicitTarget) : (() => {
            const targetSelect = document.getElementById(`target_${studentId}`);
            return parseTargetValue(targetSelect?.value);
        })();
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
    
    // Get current Puzzle Points (HUD draft > input > gameState)
    const currentPuzzlePoints = mfGetCurrentPuzzlePoints(studentId);
    
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
        const sendTargetId = isAoe ? null : targetId;
        const response = await fetch(`${GAME_API_BASE}/game/player-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                studentId, 
                action: 'skill', 
                skillId, 
                targetId: sendTargetId,
                puzzlePoints: currentPuzzlePoints  // Send current Puzzle Points from input
            })
        });
        
        if (!response.ok) {
            let msg = `Failed to use skill (HTTP ${response.status})`;
            try {
                const err = await response.json();
                if (err && typeof err === 'object' && err.error) msg = String(err.error);
            } catch {
                try {
                    const t = await response.text();
                    if (t) msg = t;
                } catch {}
            }
            throw new Error(msg);
        }
        
        const data = await response.json();
        console.log('Server response:', JSON.stringify(data, null, 2));
        
        // Preserve current monsters state - update only HP and alive status from server
        const currentMonsters = gameState.monsters ? [...gameState.monsters] : null;
        gameState = data.gameState;

        // Ensure cooldown is applied client-side if server didn't set it
        try {
            const sp = (gameState.players || []).find(p => p && p.studentId === studentId);
            const baseCd = Math.max(0, Number(skill.cooldown) || 0);
            if (sp && baseCd > 0) {
                if (!sp.skillCooldowns || typeof sp.skillCooldowns !== 'object') sp.skillCooldowns = {};
                const sv = Number(sp.skillCooldowns[skillId] || 0);
                // Server stores cooldown as base+1 (ticks down per full round)
                const want = baseCd + 1;
                if (!(sv > 0)) sp.skillCooldowns[skillId] = want;
                else sp.skillCooldowns[skillId] = Math.max(sv, want);
            }
        } catch {}
        
        // Update monster HP from server response, but preserve the array structure
        if (currentMonsters && currentMonsters.length > 0 && gameState.monsters) {
            const hitEvents = []; // { id, damage }
            console.log('=== UPDATING MONSTER HP (SKILL) ===');
            currentMonsters.forEach((currentMonster) => {
                const serverMonster = gameState.monsters.find(m => m.id === currentMonster.id);
                if (serverMonster) {
                    const oldHP = currentMonster.currentHP;
                    const newHP = serverMonster.currentHP;
                    const damage = oldHP - newHP;
                    if (damage > 0) hitEvents.push({ id: currentMonster.id, damage });
                    
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

            // --- Canvas FX for monster HP changes (skills) ---
            if (hitEvents.length) {
                if (isAoe) {
                    // Big beam + shake, all targets jitter
                    mfAnimShake(7, 260);
                    hitEvents.forEach(ev => {
                        const targetKey = `monster:${ev.id}`;
                        mfAnimAddBeam(attackerKey, targetKey, 'rgba(255,60,60,0.95)', 10, 320);
                        mfAnimHit(targetKey, { blinks: 2, dur: 320, amp: 5 });
                        mfAnimAddFloatAtUnit(targetKey, `-${ev.damage}`, 'rgba(255,60,60,0.95)', 4000);
                    });

                    try {
                        const total = hitEvents.reduce((s, ev) => s + (Number(ev.damage) || 0), 0);
                        const count = hitEvents.length;
                        mfToast(`${player?.studentName || 'Player'} ${skill?.name || 'Skill'} -${total} (${count} targets)`);
                    } catch {}
                } else {
                    const best = hitEvents.reduce((a, b) => (b.damage > a.damage ? b : a), hitEvents[0]);
                    const targetKey = `monster:${best.id}`;
                    if (isRanged) mfAnimAddBeam(attackerKey, targetKey, 'rgba(255,60,60,0.95)', 6, 280);
                    else mfAnimDash(attackerKey, targetKey, { dur: 340 });
                    mfAnimHit(targetKey, { blinks: 2, dur: 260, amp: 4 });
                    mfAnimAddFloatAtUnit(targetKey, `-${best.damage}`, 'rgba(255,60,60,0.95)', 4000);

                    try {
                        const m = (gameState.monsters || []).find(mm => mm && mm.id === best.id) || targetMonsterBefore;
                        mfToast(`${player?.studentName || 'Player'} ${skill?.name || 'Skill'} ${m?.name || 'Monster'} -${best.damage}`);
                    } catch {}
                }
            }
        }

        // --- Canvas FX for player HP changes (heal/self-cost/etc) ---
        try {
            (gameState.players || []).forEach(p => {
                const before = beforePlayerHp.get(p.studentId);
                if (before === undefined) return;
                const after = Number(p.currentHP || 0);
                const delta = after - before;
                if (!delta) return;
                const key = `player:${p.studentId}`;
                if (delta > 0) {
                    mfAnimAddFloatAtUnit(key, `+${delta}`, 'rgba(34,197,94,0.95)', 4000);
                    mfAnimHit(key, { blinks: 2, dur: 260, amp: 2 });

                    // toast for heals (show first heal only)
                    if (!mfBattleUi._lastHealToastAt || (Date.now() - mfBattleUi._lastHealToastAt) > 400) {
                        mfBattleUi._lastHealToastAt = Date.now();
                        mfToast(`${player?.studentName || 'Healer'} ${skill?.name || 'Heal'} ${p?.studentName || ''} +${delta}`.trim());
                    }
                } else {
                    mfAnimAddFloatAtUnit(key, `${delta}`, 'rgba(255,60,60,0.95)', 4000);
                    mfAnimHit(key, { blinks: 2, dur: 220, amp: 2 });
                }
            });
        } catch {}

        // Healer flip (visual cue)
        if (requiredTargetType === 'ally_alive') {
            mfAnimFlip(attackerKey, 3, 520);
        }
        
        renderGame();
    } catch (error) {
        console.error('Error using skill:', error);
        alert(String(error?.message || 'Failed to use skill'));
    }
}

// Process monster turn
async function processMonsterTurn() {
    console.log('=== PROCESS MONSTER TURN ===');
    if (monsterTurnReplay && monsterTurnReplay.active) {
        console.log('[monster-turn] replay in progress, ignoring.');
        // Provide a Next button to continue replay immediately.
        try {
            mfToast('Replay in progress — click Next to continue.', {
                next: true,
                onNext: () => {
                    isShowingPopup = false;
                    void processActionQueue();
                }
            });
        } catch {}
        return;
    }
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
        // IMPORTANT: enter replay mode BEFORE server broadcast arrives (via WebSocket)
        // to prevent "apply final state first, then revert to snapshots" flicker and double-processing.
        monsterTurnReplay.active = true;
        monsterTurnReplay.pendingWsState = null;
        monsterTurnReplay.onDone = null;

        // Clear any leftover player popups/toasts before starting monster replay.
        actionQueue = [];
        isShowingPopup = false;
        mfPendingToast = null;
        try { mfHideBattleToast(); } catch {}
        // Prevent previously-added actionLog entries from re-queueing as popups now.
        lastActionLogLength = Array.isArray(gameState.actionLog) ? gameState.actionLog.length : lastActionLogLength;

        const response = await fetch(`${GAME_API_BASE}/game/monster-turn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error('Failed to process monster turn');
        }
        
        const data = await response.json();
        console.log('Server response:', JSON.stringify(data, null, 2));

        const hasEvents = Array.isArray(data?.turnEvents) && data.turnEvents.length > 0 && data.gameState;
        if (hasEvents) {
            const finalState = data.gameState;
            monsterTurnReplay.onDone = () => {
                const synced = monsterTurnReplay.pendingWsState || finalState;
                monsterTurnReplay.active = false;
                if (synced) {
                    gameState = synced;
                    lastActionLogLength = Array.isArray(gameState.actionLog) ? gameState.actionLog.length : lastActionLogLength;
                }
                renderGame();
            };

            // Queue popups with snapshot application before each popup appears.
            data.turnEvents.forEach((evt, idx) => {
                const log = evt?.log || {};
                const snap = evt?.snapshot || null;
                const rawMessage = String(log.message || '');
                if (!rawMessage) return;
                const summary = Array.isArray(log.summaryDetails) ? decorateSummaryLines(log.summaryDetails) : null;
                const context = { ...(derivePopupContext(rawMessage) || {}), rawMessage, autoProceed: idx === 0 };
                const decoratedMessage = decorateMessageWithIcons(rawMessage);
                queueActionPopup(decoratedMessage, summary, context, {
                    beforeShow: () => {
                        const prevState = gameState ? {
                            phase: gameState.phase,
                            currentTurn: gameState.currentTurn,
                            players: gameState.players,
                            monsters: gameState.monsters,
                            actionLog: gameState.actionLog
                        } : null;

                        applyMonsterTurnSnapshot(snap);
                        // Replay FX based on snapshot diffs
                        try { mfReplayFxFromMonsterTurnStep(rawMessage, prevState, gameState); } catch {}
                        renderGame();
                    }
                });
            });
            return;
        }

        // Fallback (older server): apply full state immediately
        const currentMonsters = gameState.monsters ? [...gameState.monsters] : null;
        const currentPlayers = gameState.players ? [...gameState.players] : null;
        gameState = data.gameState || data;

        if (currentPlayers && currentPlayers.length > 0 && gameState.players) {
            currentPlayers.forEach((currentPlayer) => {
                const serverPlayer = gameState.players.find(p => p.studentId === currentPlayer.studentId);
                if (serverPlayer) {
                    currentPlayer.currentHP = serverPlayer.currentHP;
                    currentPlayer.isAlive = serverPlayer.isAlive;
                    if (serverPlayer.maxHP) currentPlayer.maxHP = serverPlayer.maxHP;
                }
            });
            gameState.players = currentPlayers;
        }
        if (currentMonsters && currentMonsters.length > 0 && gameState.monsters) {
            currentMonsters.forEach((currentMonster) => {
                const serverMonster = gameState.monsters.find(m => m.id === currentMonster.id);
                if (serverMonster) {
                    currentMonster.currentHP = serverMonster.currentHP;
                    currentMonster.isAlive = serverMonster.isAlive;
                    if (serverMonster.maxHP) currentMonster.maxHP = serverMonster.maxHP;
                }
            });
            gameState.monsters = currentMonsters;
        }
        renderGame();
        // end replay mode (no step events)
        monsterTurnReplay.active = false;
    } catch (error) {
        // ensure replay mode is cleared on failure
        try { monsterTurnReplay.active = false; } catch {}
        console.error('Error processing monster turn:', error);
        alert('Failed to process monster turn');
    }
}

// Show revive modal
