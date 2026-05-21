async function playerAttack(studentId, explicitTarget) {
    const parsedTarget = explicitTarget ? mfNormalizeTargetInput(explicitTarget) : (() => {
        const targetSelect = document.getElementById(`target_${studentId}`);
        return parseTargetValue(targetSelect?.value);
    })();
    
    if (!parsedTarget.id) {
        alert('Please select a target');
        return;
    }
    if (parsedTarget.type !== 'monster') {
        alert('Please select a monster target for a normal attack');
        return;
    }
    const targetId = parsedTarget.id;
    
    // Get current Puzzle Points (HUD draft > input > gameState)
    const currentPuzzlePoints = mfGetCurrentPuzzlePoints(studentId);
    
    // Log before attack
    const player = gameState.players.find(p => p.studentId === studentId);
    const attackerKey = `player:${studentId}`;
    const attackerClass = String(player?.characterClass || '').toLowerCase();
    const isRanged = (attackerClass === 'archer' || attackerClass === 'wizard');
    const targetMonsterBefore = gameState.monsters?.find(m => m.id === targetId);
    console.log('=== PLAYER ATTACK ===');
    console.log(`Player: ${player?.studentName} (ID: ${studentId})`);
    console.log(`Target: ${targetMonsterBefore?.name} (ID: ${targetId})`);
    console.log(`Target HP BEFORE: ${targetMonsterBefore?.currentHP}/${targetMonsterBefore?.maxHP}`);
    console.log(`Player Attack: ${player?.attack}`);
    console.log(`Puzzle Points from input: ${currentPuzzlePoints} (gameState: ${player?.puzzlePoints})`);
    const puzzleInput = document.getElementById(`puzzle_${studentId}`);
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
        const actionResult = data && typeof data === 'object' ? (data.actionResult || null) : null;
        
        // Preserve current monsters state - update only HP and alive status from server
        const currentMonsters = gameState.monsters ? [...gameState.monsters] : null;
        gameState = data.gameState;
        
        // Update monster HP from server response, but preserve the array structure
        if (currentMonsters && currentMonsters.length > 0 && gameState.monsters) {
            const hitEvents = []; // { id, damage }
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

            // --- Canvas FX: ranged beam / melee dash + damage float ---
            const best = hitEvents.length
                ? hitEvents.reduce((a, b) => (b.damage > a.damage ? b : a), hitEvents[0])
                : null;

            // Even if damage is 0 (dodge / fully reduced), still animate the attempt using actionResult.
            const arTargetName = String(actionResult?.targetName || '').trim();
            const arMonster = arTargetName ? (gameState.monsters || []).find(m => String(m?.name || '').trim() === arTargetName) : null;
            const actualTargetId = (best?.id || arMonster?.id || targetId);
            const actualKey = actualTargetId ? `monster:${actualTargetId}` : `monster:${targetId}`;
            const requestedKey = `monster:${targetId}`; // original selected target
            const aimKey = requestedKey; // keep aiming at original target, even if taunted

            const isDodged = !!actionResult?.dodged;
            const dmg = Number(best?.damage ?? actionResult?.damage ?? 0) || 0;

            const meleeImpactDelayMs = isRanged ? 0 : Math.round(mfAnimMs(340) / 2);

            // Taunt redirect: blocker moves in front of the original target before impact
            if (actualTargetId && actualTargetId !== targetId) {
                mfAnimBlock(actualKey, requestedKey, { dur: 180 });
            }

            // beam/dash always, even on dodge
            if (isRanged) mfAnimAddBeam(attackerKey, aimKey, 'rgba(255,60,60,0.95)', 6, 280);
            else mfAnimDash(attackerKey, aimKey, { dur: 340, gap: 12 });

            // hit + numbers should happen at impact moment for melee
            mfAnimHit(actualKey, { blinks: 2, dur: 260, amp: 4, delayMs: meleeImpactDelayMs });

            // Hold HP display until impact (melee only)
            if (!isRanged && best && typeof best.id !== 'undefined') {
                const holdUntil = mfNow() + meleeImpactDelayMs;
                // find pre-hit HP from currentMonsters snapshot
                const old = (currentMonsters || []).find(m => m && m.id === best.id)?.currentHP;
                if (typeof old === 'number') {
                    mfAnim.hpHold.set(actualKey, { cur: old, until: holdUntil });
                }
            }

            if (isDodged) {
                mfAnimAddFloatAtUnit(actualKey, 'DODGE', 'rgba(255,255,255,0.92)', 2000, { delayMs: meleeImpactDelayMs });
            } else if (dmg > 0) {
                mfAnimAddFloatAtUnit(actualKey, `-${dmg}`, 'rgba(255,60,60,0.95)', 4000, { delayMs: meleeImpactDelayMs });
            }

            try {
                const finalMonster = (gameState.monsters || []).find(m => m && m.id === actualTargetId) || arMonster || targetMonsterBefore;
                const nameA = String(player?.studentName || 'Player');
                const nameB = String(finalMonster?.name || 'Monster');
                const tauntTag = (actualTargetId && actualTargetId !== targetId) ? ' (TAUNT)' : '';
                if (isDodged) mfToast(`${nameA} attacks ${nameB} DODGE${tauntTag}`);
                else mfToast(`${nameA} attacks ${nameB} -${dmg}${tauntTag}`);
            } catch {}
        }
        
        renderGame();
    } catch (error) {
        console.error('Error processing attack:', error);
        alert(String(error?.message || 'Failed to process attack'));
    }
}

// Player use skill
