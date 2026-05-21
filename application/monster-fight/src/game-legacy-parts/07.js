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
        maxReviveRate: 0.66,
        backgroundTheme: 'image',
        battleMap: 'Battle/Map.jpg'
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

            <div class="form-group">
                <label>Background Theme:</label>
                <select id="setting_backgroundTheme">
                    <option value="white" ${String(config.backgroundTheme || 'white') === 'white' ? 'selected' : ''}>White</option>
                    <option value="image" ${String(config.backgroundTheme || '') === 'image' ? 'selected' : ''}>Background (Background.jpg)</option>
                </select>
                <small>Preset: white or \`game/monster-fight/images/Background/Background.jpg\`</small>
            </div>

            <div class="form-group">
                <label>Battle Map:</label>
                <select id="setting_battleMap">
                    <option value="Battle/Map.jpg" ${String(config.battleMap || 'Battle/Map.jpg') === 'Battle/Map.jpg' ? 'selected' : ''}>Map.jpg</option>
                    <option value="Battle/Map-2.jpg" ${String(config.battleMap || '') === 'Battle/Map-2.jpg' ? 'selected' : ''}>Map-2.jpg</option>
                </select>
                <small>Maps in \`game/monster-fight/images/Battle/\`</small>
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
                        ${renderIconWrap({
                            imgSrc: imageSrcForFile(`${String(charClass.name || '').trim()}.png`),
                            fallbackEmoji: charClass.emoji || '❓',
                            alt: charClass.name || 'Class',
                            wrapClass: 'character-emoji'
                        })}
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
                                        <div class="mf-skill-row">
                                            <div class="mf-skill-main">
                                                <strong>${skill.name}</strong> (${skill.type})
                                            </div>
                                            <div class="mf-skill-cd-editor">
                                                <span class="mf-skill-cd-label">CD</span>
                                                <input type="number"
                                                       id="player_${index}_skill_${skillIndex}_cd"
                                                       min="0"
                                                       step="1"
                                                       value="${(skill.cooldown ?? '')}"
                                                       placeholder="-">
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <label>Effect (JSON):</label>
                                            <textarea id="player_${index}_skill_${skillIndex}_effect" rows="3"
                                                      placeholder='{"damageMultiplier":1.2}'>${escapeHtml(JSON.stringify(skill.effect ?? {}, null, 2))}</textarea>
                                            <small>Edit numeric values here (damageMultiplier/heal/etc). Leave as {} if none.</small>
                                        </div>
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
                        ${renderIconWrap({
                            imgSrc: imageSrcForFile(`${String(monster.name || '').trim()}.png`),
                            fallbackEmoji: monster.emoji || '👾',
                            alt: monster.name || 'Monster',
                            wrapClass: 'monster-emoji'
                        })}
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
                                        <div class="mf-skill-row">
                                            <div class="mf-skill-main">
                                                <strong>${skill.name}</strong> (${skill.type})
                                            </div>
                                            <div class="mf-skill-cd-editor">
                                                <span class="mf-skill-cd-label">CD</span>
                                                <input type="number"
                                                       id="monster_${index}_skill_${skillIndex}_cd"
                                                       min="0"
                                                       step="1"
                                                       value="${(skill.cooldown ?? '')}"
                                                       placeholder="-">
                                            </div>
                                        </div>
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
                    <button type="button" class="difficulty-button" data-difficulty="easy" onclick="applyDifficultyPreset('easy')">Easy</button>
                    <button type="button" class="difficulty-button" data-difficulty="medium" onclick="applyDifficultyPreset('medium')">Medium</button>
                    <button type="button" class="difficulty-button" data-difficulty="hard" onclick="applyDifficultyPreset('hard')">Hard</button>
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
        const mt = availableMonsterTypes.find(m => String(m.id) === String(monster.type));
        const iconSrc = imageSrcForFile(monsterImageFileByType(monster.type));
        const iconFb = mt?.emoji || '👾';
        const iconAlt = mt?.name || 'Monster';
        result.push(`
            <div class="level-monster-item">
                <div id="level_${levelIndex}_monster_${i}_icon" class="mf-level-monster-icon">
                    ${renderIconWrap({ imgSrc: iconSrc, fallbackEmoji: iconFb, alt: iconAlt, wrapClass: 'mf-level-monster-iconwrap' })}
                </div>
                <select id="level_${levelIndex}_monster_${i}_type" onchange="updateLevelMonsterPreview(${levelIndex}, ${i}, this.value)">
                    ${availableMonsterTypes.map(m => `
                        <option value="${m.id}" ${m.id === monster.type ? 'selected' : ''}>${m.name}</option>
                    `).join('')}
                </select>
                <input type="number" id="level_${levelIndex}_monster_${i}_count" min="1" max="10" value="${monster.count || 1}" placeholder="Count">
            </div>
        `);
    }
    
    return result.join('');
}

function updateLevelMonsterPreview(levelIndex, monsterIndex, typeId) {
    const availableMonsterTypes = gameSettings.monsterTypes || window.monsterTypes || [];
    const mt = availableMonsterTypes.find(m => String(m.id) === String(typeId));
    const iconSrc = imageSrcForFile(monsterImageFileByType(typeId));
    const iconFb = mt?.emoji || '👾';
    const iconAlt = mt?.name || 'Monster';
    const host = document.getElementById(`level_${levelIndex}_monster_${monsterIndex}_icon`);
    if (host) {
        host.innerHTML = renderIconWrap({ imgSrc: iconSrc, fallbackEmoji: iconFb, alt: iconAlt, wrapClass: 'mf-level-monster-iconwrap' });
    }
}

window.updateLevelMonsterPreview = updateLevelMonsterPreview;

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
    setDifficultyPresetActive(presetKey);

    const countInput = document.getElementById('level_count');
    if (countInput) {
        countInput.value = normalized.length;
    }

    const listContainer = document.getElementById('level-config-list');
    if (listContainer) {
        listContainer.innerHTML = renderLevelConfigList(normalized);
    }
}

function setDifficultyPresetActive(presetKey) {
    document.querySelectorAll('.difficulty-button').forEach(btn => {
        const key = btn.getAttribute('data-difficulty');
        btn.classList.toggle('active', key === presetKey);
    });
}

// Switch settings tab
function switchSettingsTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.settings-tab').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.settings-tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`settings-${tab}`).classList.add('active');

    // Default Level Config preset: Easy
    if (tab === 'levels') {
        if (!hasAppliedDefaultLevelPreset) {
            hasAppliedDefaultLevelPreset = true;
            applyDifficultyPreset('easy');
        } else {
            // Ensure one button shows as active (fallback to easy)
            const anyActive = document.querySelector('.difficulty-button.active');
            if (!anyActive) {
                setDifficultyPresetActive('easy');
            }
        }
    }
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
