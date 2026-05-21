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
console.log('game.js loaded successfully');

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


