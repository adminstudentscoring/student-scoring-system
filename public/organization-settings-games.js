// Organization Settings - Game Config Settings

/**
 * Render Class-View Mode settings
 */
function renderClassViewMode(settings) {
    const multiplierEnabled = settings.hpCalculation === 'multiplier';
    return `
        <div class="settings-category">
            <h3>📊 Class-View Mode</h3>
            <div class="category-description">Configure Class-View challenge mode parameters</div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="cvm_enabled" ${settings.enabled ? 'checked' : ''} onchange="updateSetting('classViewMode', 'enabled', this.checked)">
                    <span>Enable challenge mode</span>
                </label>
            </div>
            <div class="settings-group">
                <label>Reward Rule</label>
                <select id="cvm_rewardRule" onchange="updateSetting('classViewMode', 'rewardRule', this.value)">
                    <option value="fixed" ${settings.rewardRule === 'fixed' ? 'selected' : ''}>Fixed Reward</option>
                    <option value="percentage" ${settings.rewardRule === 'percentage' ? 'selected' : ''}>Percentage Reward</option>
                    <option value="custom" ${settings.rewardRule === 'custom' ? 'selected' : ''}>Custom</option>
                </select>
            </div>
            <div class="settings-group">
                <label>HP Calculation Method</label>
                <select id="cvm_hpCalculation" onchange="onClassViewModeHpCalculationChange(this.value)">
                    <option value="byScore" ${settings.hpCalculation === 'byScore' ? 'selected' : ''}>Deduct by Score</option>
                    <option value="fixed" ${settings.hpCalculation === 'fixed' ? 'selected' : ''}>Fixed Deduction</option>
                    <option value="multiplier" ${settings.hpCalculation === 'multiplier' ? 'selected' : ''}>Multiplier Deduction</option>
                </select>
            </div>
            <div class="settings-group">
                <label>HP Multiplier (when using multiplier deduction)</label>
                <input type="number" id="cvm_hpMultiplier" value="${settings.hpMultiplier || 1}" min="0.1" step="0.1" onchange="updateSetting('classViewMode', 'hpMultiplier', parseFloat(this.value))" ${multiplierEnabled ? '' : 'disabled'} style="${multiplierEnabled ? '' : 'opacity:0.6;'}">
                <div class="help-text">Only enabled when HP Calculation Method is set to Multiplier Deduction</div>
            </div>
            <div class="settings-actions" style="display:flex; gap:10px; align-items:center; justify-content:flex-end;">
                <button class="btn btn-secondary" onclick="resetCategorySettings('classViewMode')">Reset to Default</button>
                <button class="btn btn-primary" onclick="saveSettings()">Save</button>
            </div>
        </div>
    `;
}

/**
 * Render Challenge Mode Levels
 */
function renderChallengeLevels(settings) {
    const levels = settings.levels || [];
    const mode = settings.mode || 'classic';
    
    // Cleanup images to improve performance (User Request)
    levels.forEach(l => delete l.image);
    
    return `
        <div class="settings-category">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3>⚔️ Challenge Mode Levels</h3>
                <button class="btn btn-primary" onclick="saveSettings()">Save</button>
            </div>
            <div class="category-description">Configure parameters for each level in challenge mode</div>
            
            <div class="settings-group">
                <label>Game Mode</label>
                <select id="cm_mode" onchange="updateSetting('challengeLevels', 'mode', this.value)" style="padding: 8px; border-radius: 4px; border: 1px solid #444; background: #333; color: white;">
                    <option value="classic" ${mode === 'classic' ? 'selected' : ''}>Classic Mode (Monster Fight)</option>
                    <option value="add_point" ${mode === 'add_point' ? 'selected' : ''}>Add Point Mode (Coming Soon)</option>
                </select>
            </div>

            <div id="challengeLevelsList">
                ${levels.map((level, index) => `
                    <div class="settings-group" style="border: 1px solid rgba(255,255,255,0.2); padding: 10px; border-radius: 4px; margin-bottom: 10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <h4 style="margin: 0;">Level ${index + 1}: ${level.name}</h4>
                            <button class="btn btn-danger" style="padding:2px 8px; font-size:12px;" onclick="removeChallengeLevel(${index})">Remove</button>
                        </div>
                        <div class="form-row">
                            <div class="settings-group">
                                <label>Level Name</label>
                                <input type="text" value="${level.name}" onchange="updateChallengeLevel(${index}, 'name', this.value)">
                            </div>
                            <div class="settings-group">
                                <label>Emoji</label>
                                <input type="text" value="${level.emoji || ''}" placeholder="Emoji" onchange="updateChallengeLevel(${index}, 'emoji', this.value)">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="settings-group">
                                <label>Max HP</label>
                                <input type="number" value="${level.maxHP}" min="1" onchange="updateChallengeLevel(${index}, 'maxHP', parseInt(this.value))">
                            </div>
                            <div class="settings-group">
                                <label>Reward Points</label>
                                <input type="number" value="${level.reward}" min="0" onchange="updateChallengeLevel(${index}, 'reward', parseInt(this.value))">
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="settings-actions">
                <button class="btn btn-info" onclick="addChallengeLevel()">+ Add Level</button>
                <button class="btn btn-secondary" onclick="resetCategorySettings('challengeLevels')">Reset to Default</button>
            </div>
        </div>
    `;
}

window.addChallengeLevel = function() {
    if (!currentSettings.challengeLevels) currentSettings.challengeLevels = { levels: [], mode: 'classic' };
    if (!currentSettings.challengeLevels.levels) currentSettings.challengeLevels.levels = [];
    
    const nextLevel = currentSettings.challengeLevels.levels.length + 1;
    currentSettings.challengeLevels.levels.push({
        level: nextLevel,
        name: `Level ${nextLevel}`,
        maxHP: 100 * nextLevel,
        reward: 10 * nextLevel,
        emoji: '❓'
    });
    renderSettings();
};

window.removeChallengeLevel = function(index) {
    if (!confirm('Are you sure you want to remove this level?')) return;
    
    if (currentSettings.challengeLevels && currentSettings.challengeLevels.levels) {
        currentSettings.challengeLevels.levels.splice(index, 1);
        // Re-number levels
        currentSettings.challengeLevels.levels.forEach((l, i) => l.level = i + 1);
        renderSettings();
    }
};

window.handleLevelImageUpload = function(index, input) {
    const file = input.files[0];
    if (!file) return;
    
    // Validate size (e.g. 1MB)
    if (file.size > 1024 * 1024) {
        alert('Image too large (max 1MB)');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64 = e.target.result;
        if (!currentSettings.challengeLevels.levels[index]) return;
        currentSettings.challengeLevels.levels[index].image = base64;
        renderSettings();
    };
    reader.readAsDataURL(file);
};

