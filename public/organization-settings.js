/**
 * Organization Settings Management
 * Handles all settings-related functionality for organization management
 */

// Settings state
let currentSettings = null;
let defaultSettings = null;

/**
 * Get default settings configuration
 */
function getDefaultSettings() {
    return {
        teacherPermissions: {
            canCreateStudents: true,
            canDeleteStudents: true,
            canModifyScores: true,
            canUseClassView: true,
            canResetScores: true,
            canViewStatistics: true
        },
        studentPermissions: {
            canViewLeaderboard: true,
            canViewOtherScores: true,
            canViewOwnDetails: true
        },
        classViewMode: {
            enabled: true,
            defaultDifficulty: 1,
            rewardRule: 'fixed', // 'fixed', 'percentage', 'custom'
            hpCalculation: 'byScore', // 'byScore', 'fixed', 'multiplier'
            hpMultiplier: 1
        },
        studentLevelUp: {
            experiencePerLevel: 100,
            rankSystem: {
                enabled: true,
                baseScore: 50,
                multiplier: 2
            }
        },
        displaySettings: {
            leaderboardCount: 10,
            showScore: true,
            showLevel: true,
            showRank: true,
            themeColor: '#667eea',
            fontSize: 'medium' // 'small', 'medium', 'large'
        },
        scheduleSettings: {
            classTimes: [],
            autoSaveEnabled: true,
            autoSaveInterval: 30 // minutes
        },
        scoringRules: {
            correctAnswerPoints: 10,
            incorrectAnswerPoints: 2,
            customRules: []
        },
        challengeLevels: {
            levels: [
                { level: 1, name: 'Slime', maxHP: 50, reward: 10, emoji: '🟢' },
                { level: 2, name: 'Goblin', maxHP: 100, reward: 20, emoji: '👺' },
                { level: 3, name: 'Orc', maxHP: 150, reward: 30, emoji: '👹' },
                { level: 4, name: 'Dragon', maxHP: 250, reward: 40, emoji: '🐉' },
                { level: 5, name: 'Demon', maxHP: 400, reward: 50, emoji: '😈' }
            ]
        },
        backupSettings: {
            autoBackupEnabled: true,
            backupFrequency: 'daily', // 'hourly', 'daily', 'weekly'
            backupRetention: 7 // number of backups to keep
        },
        notificationSettings: {
            websocketUpdateFrequency: 1000, // ms
            soundEnabled: false,
            notificationMethod: 'websocket' // 'websocket', 'polling'
        },
        organizationInfo: {
            logo: '',
            primaryColor: '#667eea',
            secondaryColor: '#764ba2'
        },
        securitySettings: {
            passwordMinLength: 6,
            maxLoginAttempts: 5,
            sessionTimeout: 3600000 // ms (1 hour)
        }
    };
}

/**
 * Load settings from server
 */
async function loadSettings() {
    try {
        const response = await window.authUtils.authenticatedFetch('/organizations/settings');
        if (!response) return;

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to load settings');
        }

        currentSettings = await response.json();
        renderSettings();
    } catch (error) {
        console.error('Error loading settings:', error);
        document.getElementById('settingsContainer').innerHTML = '<p>Failed to load settings: ' + error.message + '</p>';
    }
}

/**
 * Render settings page
 */
function renderSettings() {
    if (!currentSettings) {
        currentSettings = getDefaultSettings();
    }
    if (!defaultSettings) {
        defaultSettings = JSON.parse(JSON.stringify(getDefaultSettings()));
    }

    const categories = [
        { id: 'teacherPermissions', name: '👨‍🏫 Teacher Permissions', icon: '👨‍🏫' },
        { id: 'studentPermissions', name: '👥 Student Permissions', icon: '👥' },
        { id: 'classViewMode', name: '📊 Class-View Mode', icon: '📊' },
        { id: 'studentLevelUp', name: '📈 Student Level-up Settings', icon: '📈' },
        { id: 'displaySettings', name: '🎨 Display Settings', icon: '🎨' },
        { id: 'scheduleSettings', name: '📅 Schedule Settings', icon: '📅' },
        { id: 'scoringRules', name: '🎯 Scoring Rules', icon: '🎯' },
        { id: 'challengeLevels', name: '⚔️ Challenge Mode Levels', icon: '⚔️' },
        { id: 'backupSettings', name: '💾 Data Backup & Restore', icon: '💾' },
        { id: 'notificationSettings', name: '🔔 Notification Settings', icon: '🔔' },
        { id: 'organizationInfo', name: '🏢 Organization Info', icon: '🏢' },
        { id: 'securitySettings', name: '🔒 Security Settings', icon: '🔒' }
    ];

    let html = `
        <div class="settings-container">
            <div class="settings-actions" style="justify-content: space-between; align-items: center;">
                <h2 style="margin: 0;">⚙️ Settings</h2>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-secondary" onclick="previewSettings()">👁️ Preview</button>
                    <button class="btn btn-secondary" onclick="resetAllSettings()">🔄 Reset All to Default</button>
                    <button class="btn btn-primary" onclick="saveSettings()">💾 Save Settings</button>
                </div>
            </div>
            <div class="settings-tabs" id="settingsTabs">
                ${categories.map((cat, index) => `
                    <button class="settings-tab ${index === 0 ? 'active' : ''}" onclick="switchSettingsCategory('${cat.id}')">
                        ${cat.name}
                    </button>
                `).join('')}
            </div>
    `;

    // Render each category
    categories.forEach((cat, index) => {
        html += renderSettingsCategory(cat.id, cat.name, index === 0);
    });

    html += '</div>';
    document.getElementById('settingsContainer').innerHTML = html;
}

/**
 * Render a specific settings category
 */
function renderSettingsCategory(categoryId, categoryName, isActive) {
    const settings = currentSettings[categoryId] || {};
    let html = `<div class="settings-category-content ${isActive ? 'active' : ''}" id="${categoryId}Content">`;

    switch(categoryId) {
        case 'teacherPermissions':
            html += renderTeacherPermissions(settings);
            break;
        case 'studentPermissions':
            html += renderStudentPermissions(settings);
            break;
        case 'classViewMode':
            html += renderClassViewMode(settings);
            break;
        case 'studentLevelUp':
            html += renderStudentLevelUp(settings);
            break;
        case 'displaySettings':
            html += renderDisplaySettings(settings);
            break;
        case 'scheduleSettings':
            html += renderScheduleSettings(settings);
            break;
        case 'scoringRules':
            html += renderScoringRules(settings);
            break;
        case 'challengeLevels':
            // challengeLevels has a nested structure with levels array
            const challengeSettings = currentSettings.challengeLevels || { levels: [] };
            html += renderChallengeLevels(challengeSettings);
            break;
        case 'backupSettings':
            html += renderBackupSettings(settings);
            break;
        case 'notificationSettings':
            html += renderNotificationSettings(settings);
            break;
        case 'organizationInfo':
            html += renderOrganizationInfo(settings);
            break;
        case 'securitySettings':
            html += renderSecuritySettings(settings);
            break;
    }

    html += `</div>`;
    return html;
}

/**
 * Render Teacher Permissions settings
 */
function renderTeacherPermissions(settings) {
    return `
        <div class="settings-category">
            <h3>👨‍🏫 Teacher Permissions</h3>
            <div class="category-description">Set the operational permissions that teachers can perform in the system</div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="tp_canCreateStudents" ${settings.canCreateStudents ? 'checked' : ''} onchange="updateSetting('teacherPermissions', 'canCreateStudents', this.checked)">
                    <span>Can create students</span>
                </label>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="tp_canDeleteStudents" ${settings.canDeleteStudents ? 'checked' : ''} onchange="updateSetting('teacherPermissions', 'canDeleteStudents', this.checked)">
                    <span>Can delete students</span>
                </label>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="tp_canModifyScores" ${settings.canModifyScores ? 'checked' : ''} onchange="updateSetting('teacherPermissions', 'canModifyScores', this.checked)">
                    <span>Can modify scores</span>
                </label>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="tp_canUseClassView" ${settings.canUseClassView ? 'checked' : ''} onchange="updateSetting('teacherPermissions', 'canUseClassView', this.checked)">
                    <span>Can use Class-View mode</span>
                </label>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="tp_canResetScores" ${settings.canResetScores ? 'checked' : ''} onchange="updateSetting('teacherPermissions', 'canResetScores', this.checked)">
                    <span>Can reset scores</span>
                </label>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="tp_canViewStatistics" ${settings.canViewStatistics ? 'checked' : ''} onchange="updateSetting('teacherPermissions', 'canViewStatistics', this.checked)">
                    <span>Can view statistics</span>
                </label>
            </div>
            <div class="settings-actions">
                <button class="btn btn-secondary" onclick="resetCategorySettings('teacherPermissions')">Reset to Default</button>
            </div>
        </div>
    `;
}

/**
 * Render Student Permissions settings
 */
function renderStudentPermissions(settings) {
    return `
        <div class="settings-category">
            <h3>👥 Student Permissions</h3>
            <div class="category-description">Set what students can view in the system</div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="sp_canViewLeaderboard" ${settings.canViewLeaderboard ? 'checked' : ''} onchange="updateSetting('studentPermissions', 'canViewLeaderboard', this.checked)">
                    <span>Can view leaderboard</span>
                </label>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="sp_canViewOtherScores" ${settings.canViewOtherScores ? 'checked' : ''} onchange="updateSetting('studentPermissions', 'canViewOtherScores', this.checked)">
                    <span>Can view other students' scores</span>
                </label>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="sp_canViewOwnDetails" ${settings.canViewOwnDetails ? 'checked' : ''} onchange="updateSetting('studentPermissions', 'canViewOwnDetails', this.checked)">
                    <span>Can view own details</span>
                </label>
            </div>
            <div class="settings-actions">
                <button class="btn btn-secondary" onclick="resetCategorySettings('studentPermissions')">Reset to Default</button>
            </div>
        </div>
    `;
}

/**
 * Render Class-View Mode settings
 */
function renderClassViewMode(settings) {
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
                <label>Default Level Difficulty</label>
                <input type="number" id="cvm_defaultDifficulty" value="${settings.defaultDifficulty || 1}" min="1" max="10" onchange="updateSetting('classViewMode', 'defaultDifficulty', parseInt(this.value))">
                <div class="help-text">Set the default level when Class-View opens (1-10)</div>
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
                <select id="cvm_hpCalculation" onchange="updateSetting('classViewMode', 'hpCalculation', this.value)">
                    <option value="byScore" ${settings.hpCalculation === 'byScore' ? 'selected' : ''}>Deduct by Score</option>
                    <option value="fixed" ${settings.hpCalculation === 'fixed' ? 'selected' : ''}>Fixed Deduction</option>
                    <option value="multiplier" ${settings.hpCalculation === 'multiplier' ? 'selected' : ''}>Multiplier Deduction</option>
                </select>
            </div>
            <div class="settings-group">
                <label>HP Multiplier (when using multiplier deduction)</label>
                <input type="number" id="cvm_hpMultiplier" value="${settings.hpMultiplier || 1}" min="0.1" step="0.1" onchange="updateSetting('classViewMode', 'hpMultiplier', parseFloat(this.value))">
            </div>
            <div class="settings-actions">
                <button class="btn btn-secondary" onclick="resetCategorySettings('classViewMode')">Reset to Default</button>
            </div>
        </div>
    `;
}

/**
 * Render Student Level-up Settings
 */
function renderStudentLevelUp(settings) {
    return `
        <div class="settings-category">
            <h3>📈 Student Level-up Settings</h3>
            <div class="category-description">Configure student level and ranking system calculation rules</div>
            <div class="settings-group">
                <label>Experience Points Required Per Level</label>
                <input type="number" id="slu_experiencePerLevel" value="${settings.experiencePerLevel || 100}" min="1" onchange="updateSetting('studentLevelUp', 'experiencePerLevel', parseInt(this.value))">
                <div class="help-text">Set the amount of experience points required to level up</div>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="slu_rankSystemEnabled" ${settings.rankSystem?.enabled ? 'checked' : ''} onchange="updateSetting('studentLevelUp', 'rankSystem.enabled', this.checked)">
                    <span>Enable ranking system</span>
                </label>
            </div>
            <div class="settings-group">
                <label>Base Score for Ranking</label>
                <input type="number" id="slu_baseScore" value="${settings.rankSystem?.baseScore || 50}" min="1" onchange="updateSetting('studentLevelUp', 'rankSystem.baseScore', parseInt(this.value))">
            </div>
            <div class="settings-group">
                <label>Ranking Multiplier</label>
                <input type="number" id="slu_multiplier" value="${settings.rankSystem?.multiplier || 2}" min="1" step="0.1" onchange="updateSetting('studentLevelUp', 'rankSystem.multiplier', parseFloat(this.value))">
            </div>
            <div class="settings-actions">
                <button class="btn btn-secondary" onclick="resetCategorySettings('studentLevelUp')">Reset to Default</button>
            </div>
        </div>
    `;
}

/**
 * Render Display Settings
 */
function renderDisplaySettings(settings) {
    return `
        <div class="settings-category">
            <h3>🎨 Display Settings</h3>
            <div class="category-description">Configure system display parameters</div>
            <div class="settings-group">
                <label>Leaderboard Display Count</label>
                <input type="number" id="ds_leaderboardCount" value="${settings.leaderboardCount || 10}" min="1" max="100" onchange="updateSetting('displaySettings', 'leaderboardCount', parseInt(this.value))">
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="ds_showScore" ${settings.showScore ? 'checked' : ''} onchange="updateSetting('displaySettings', 'showScore', this.checked)">
                    <span>Show score</span>
                </label>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="ds_showLevel" ${settings.showLevel ? 'checked' : ''} onchange="updateSetting('displaySettings', 'showLevel', this.checked)">
                    <span>Show level</span>
                </label>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="ds_showRank" ${settings.showRank ? 'checked' : ''} onchange="updateSetting('displaySettings', 'showRank', this.checked)">
                    <span>Show rank</span>
                </label>
            </div>
            <div class="settings-group">
                <label>Theme Color</label>
                <input type="color" id="ds_themeColor" value="${settings.themeColor || '#667eea'}" onchange="updateSetting('displaySettings', 'themeColor', this.value)">
            </div>
            <div class="settings-group">
                <label>Font Size</label>
                <select id="ds_fontSize" onchange="updateSetting('displaySettings', 'fontSize', this.value)">
                    <option value="small" ${settings.fontSize === 'small' ? 'selected' : ''}>Small</option>
                    <option value="medium" ${settings.fontSize === 'medium' ? 'selected' : ''}>Medium</option>
                    <option value="large" ${settings.fontSize === 'large' ? 'selected' : ''}>Large</option>
                </select>
            </div>
            <div class="settings-actions">
                <button class="btn btn-secondary" onclick="resetCategorySettings('displaySettings')">Reset to Default</button>
            </div>
        </div>
    `;
}

/**
 * Render Schedule Settings
 */
function renderScheduleSettings(settings) {
    return `
        <div class="settings-category">
            <h3>📅 Schedule Settings</h3>
            <div class="category-description">Configure class times and auto-save parameters</div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="ss_autoSaveEnabled" ${settings.autoSaveEnabled ? 'checked' : ''} onchange="updateSetting('scheduleSettings', 'autoSaveEnabled', this.checked)">
                    <span>Enable auto-save</span>
                </label>
            </div>
            <div class="settings-group">
                <label>Auto-save Interval (minutes)</label>
                <input type="number" id="ss_autoSaveInterval" value="${settings.autoSaveInterval || 30}" min="1" onchange="updateSetting('scheduleSettings', 'autoSaveInterval', parseInt(this.value))">
            </div>
            <div class="settings-group">
                <label>Class Schedule</label>
                <div class="help-text">Schedule configuration feature will be implemented in future versions</div>
            </div>
            <div class="settings-actions">
                <button class="btn btn-secondary" onclick="resetCategorySettings('scheduleSettings')">Reset to Default</button>
            </div>
        </div>
    `;
}

/**
 * Render Scoring Rules
 */
function renderScoringRules(settings) {
    return `
        <div class="settings-category">
            <h3>🎯 Scoring Rules</h3>
            <div class="category-description">Configure scoring rules for correct and incorrect answers</div>
            <div class="settings-group">
                <label>Points for Correct Answer</label>
                <input type="number" id="sr_correctAnswerPoints" value="${settings.correctAnswerPoints || 10}" min="0" onchange="updateSetting('scoringRules', 'correctAnswerPoints', parseInt(this.value))">
            </div>
            <div class="settings-group">
                <label>Points for Incorrect Answer</label>
                <input type="number" id="sr_incorrectAnswerPoints" value="${settings.incorrectAnswerPoints || 2}" min="0" onchange="updateSetting('scoringRules', 'incorrectAnswerPoints', parseInt(this.value))">
            </div>
            <div class="settings-group">
                <label>Custom Rules</label>
                <div class="help-text">Custom rules feature will be implemented in future versions</div>
            </div>
            <div class="settings-actions">
                <button class="btn btn-secondary" onclick="resetCategorySettings('scoringRules')">Reset to Default</button>
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
                                <label>Image / Icon</label>
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <input type="file" accept="image/*" onchange="handleLevelImageUpload(${index}, this)" style="width:auto;">
                                    ${level.image ? `<img src="${level.image}" style="height:30px; width:30px; object-fit:contain; border:1px solid #666;">` : ''}
                                    <input type="text" value="${level.emoji || ''}" placeholder="Emoji" onchange="updateChallengeLevel(${index}, 'emoji', this.value)" style="width:60px; text-align:center;">
                                </div>
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

/**
 * Render Backup Settings
 */
function renderBackupSettings(settings) {
    return `
        <div class="settings-category">
            <h3>💾 Data Backup & Restore</h3>
            <div class="category-description">Configure auto-backup parameters</div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="bs_autoBackupEnabled" ${settings.autoBackupEnabled ? 'checked' : ''} onchange="updateSetting('backupSettings', 'autoBackupEnabled', this.checked)">
                    <span>Enable auto-backup</span>
                </label>
            </div>
            <div class="settings-group">
                <label>Backup Frequency</label>
                <select id="bs_backupFrequency" onchange="updateSetting('backupSettings', 'backupFrequency', this.value)">
                    <option value="hourly" ${settings.backupFrequency === 'hourly' ? 'selected' : ''}>Hourly</option>
                    <option value="daily" ${settings.backupFrequency === 'daily' ? 'selected' : ''}>Daily</option>
                    <option value="weekly" ${settings.backupFrequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                </select>
            </div>
            <div class="settings-group">
                <label>Backup Retention Count</label>
                <input type="number" id="bs_backupRetention" value="${settings.backupRetention || 7}" min="1" max="100" onchange="updateSetting('backupSettings', 'backupRetention', parseInt(this.value))">
                <div class="help-text">Set how many backup files to keep</div>
            </div>
            <div class="settings-actions">
                <button class="btn btn-secondary" onclick="resetCategorySettings('backupSettings')">Reset to Default</button>
            </div>
        </div>
    `;
}

/**
 * Render Notification Settings
 */
function renderNotificationSettings(settings) {
    return `
        <div class="settings-category">
            <h3>🔔 Notification Settings</h3>
            <div class="category-description">Configure system notification parameters</div>
            <div class="settings-group">
                <label>WebSocket Update Frequency (ms)</label>
                <input type="number" id="ns_websocketUpdateFrequency" value="${settings.websocketUpdateFrequency || 1000}" min="100" step="100" onchange="updateSetting('notificationSettings', 'websocketUpdateFrequency', parseInt(this.value))">
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="ns_soundEnabled" ${settings.soundEnabled ? 'checked' : ''} onchange="updateSetting('notificationSettings', 'soundEnabled', this.checked)">
                    <span>Enable sound notifications</span>
                </label>
            </div>
            <div class="settings-group">
                <label>Notification Method</label>
                <select id="ns_notificationMethod" onchange="updateSetting('notificationSettings', 'notificationMethod', this.value)">
                    <option value="websocket" ${settings.notificationMethod === 'websocket' ? 'selected' : ''}>WebSocket</option>
                    <option value="polling" ${settings.notificationMethod === 'polling' ? 'selected' : ''}>Polling</option>
                </select>
            </div>
            <div class="settings-actions">
                <button class="btn btn-secondary" onclick="resetCategorySettings('notificationSettings')">Reset to Default</button>
            </div>
        </div>
    `;
}

/**
 * Render Organization Info
 */
function renderOrganizationInfo(settings) {
    return `
        <div class="settings-category">
            <h3>🏢 Organization Info</h3>
            <div class="category-description">Configure organization visual identity and basic information</div>
            <div class="settings-group">
                <label>Organization Logo URL</label>
                <input type="text" id="oi_logo" value="${settings.logo || ''}" placeholder="https://example.com/logo.png" onchange="updateSetting('organizationInfo', 'logo', this.value)">
            </div>
            <div class="settings-group">
                <label>Primary Color</label>
                <input type="color" id="oi_primaryColor" value="${settings.primaryColor || '#667eea'}" onchange="updateSetting('organizationInfo', 'primaryColor', this.value)">
            </div>
            <div class="settings-group">
                <label>Secondary Color</label>
                <input type="color" id="oi_secondaryColor" value="${settings.secondaryColor || '#764ba2'}" onchange="updateSetting('organizationInfo', 'secondaryColor', this.value)">
            </div>
            <div class="settings-actions">
                <button class="btn btn-secondary" onclick="resetCategorySettings('organizationInfo')">Reset to Default</button>
            </div>
        </div>
    `;
}

/**
 * Render Security Settings
 */
function renderSecuritySettings(settings) {
    return `
        <div class="settings-category">
            <h3>🔒 Security Settings</h3>
            <div class="category-description">Configure system security parameters</div>
            <div class="settings-group">
                <label>Minimum Password Length</label>
                <input type="number" id="sec_passwordMinLength" value="${settings.passwordMinLength || 6}" min="4" max="20" onchange="updateSetting('securitySettings', 'passwordMinLength', parseInt(this.value))">
            </div>
            <div class="settings-group">
                <label>Maximum Login Attempts</label>
                <input type="number" id="sec_maxLoginAttempts" value="${settings.maxLoginAttempts || 5}" min="1" max="10" onchange="updateSetting('securitySettings', 'maxLoginAttempts', parseInt(this.value))">
            </div>
            <div class="settings-group">
                <label>Session Timeout (ms)</label>
                <input type="number" id="sec_sessionTimeout" value="${settings.sessionTimeout || 3600000}" min="60000" step="60000" onchange="updateSetting('securitySettings', 'sessionTimeout', parseInt(this.value))">
                <div class="help-text">Default: 3600000 (1 hour)</div>
            </div>
            <div class="settings-actions">
                <button class="btn btn-secondary" onclick="resetCategorySettings('securitySettings')">Reset to Default</button>
            </div>
        </div>
    `;
}

/**
 * Switch settings category tab
 */
function switchSettingsCategory(categoryId) {
    document.querySelectorAll('.settings-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.settings-category-content').forEach(content => content.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(`${categoryId}Content`).classList.add('active');
}

/**
 * Update a setting value
 */
function updateSetting(category, key, value) {
    if (!currentSettings[category]) {
        currentSettings[category] = {};
    }
    
    if (key.includes('.')) {
        const keys = key.split('.');
        let obj = currentSettings[category];
        for (let i = 0; i < keys.length - 1; i++) {
            if (!obj[keys[i]]) {
                obj[keys[i]] = {};
            }
            obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
    } else {
        currentSettings[category][key] = value;
    }
}

/**
 * Update challenge level setting
 */
function updateChallengeLevel(index, key, value) {
    if (!currentSettings.challengeLevels) {
        currentSettings.challengeLevels = { levels: [] };
    }
    if (!currentSettings.challengeLevels.levels) {
        currentSettings.challengeLevels.levels = [];
    }
    if (!currentSettings.challengeLevels.levels[index]) {
        return;
    }
    // Handle different value types
    if (key === 'maxHP' || key === 'reward' || key === 'level') {
        currentSettings.challengeLevels.levels[index][key] = parseInt(value) || 0;
    } else {
        currentSettings.challengeLevels.levels[index][key] = value;
    }
}

/**
 * Reset category settings to default
 */
function resetCategorySettings(categoryId) {
    if (!confirm(`Are you sure you want to reset ${categoryId} to default values?`)) {
        return;
    }
    currentSettings[categoryId] = JSON.parse(JSON.stringify(defaultSettings[categoryId]));
    renderSettings();
}

/**
 * Reset all settings to default
 */
function resetAllSettings() {
    if (!confirm('Are you sure you want to reset all settings to default values? This action cannot be undone!')) {
        return;
    }
    currentSettings = JSON.parse(JSON.stringify(defaultSettings));
    renderSettings();
}

/**
 * Save settings to server
 */
async function saveSettings() {
    try {
        const response = await window.authUtils.authenticatedFetch('/organizations/settings', {
            method: 'PUT',
            body: JSON.stringify(currentSettings)
        });

        if (!response) return;

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save settings');
        }

        alert('Settings saved successfully!');
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

/**
 * Preview settings
 */
function previewSettings() {
    const previewWindow = window.open('', 'preview', 'width=800,height=600');
    previewWindow.document.write(`
        <html>
            <head>
                <title>Settings Preview</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 20px;
                        background: ${currentSettings.organizationInfo?.primaryColor || '#667eea'};
                        color: white;
                    }
                    .preview-section {
                        background: rgba(255,255,255,0.1);
                        padding: 15px;
                        margin: 10px 0;
                        border-radius: 8px;
                    }
                    h1 { color: ${currentSettings.organizationInfo?.secondaryColor || '#764ba2'}; }
                </style>
            </head>
            <body>
                <h1>Settings Preview</h1>
                <div class="preview-section">
                    <h3>Display Settings</h3>
                    <p>Leaderboard Display Count: ${currentSettings.displaySettings?.leaderboardCount || 10}</p>
                    <p>Show Score: ${currentSettings.displaySettings?.showScore ? 'Yes' : 'No'}</p>
                    <p>Show Level: ${currentSettings.displaySettings?.showLevel ? 'Yes' : 'No'}</p>
                    <p>Show Rank: ${currentSettings.displaySettings?.showRank ? 'Yes' : 'No'}</p>
                    <p>Font Size: ${currentSettings.displaySettings?.fontSize || 'medium'}</p>
                </div>
                <div class="preview-section">
                    <h3>Scoring Rules</h3>
                    <p>Points for Correct Answer: ${currentSettings.scoringRules?.correctAnswerPoints || 10}</p>
                    <p>Points for Incorrect Answer: ${currentSettings.scoringRules?.incorrectAnswerPoints || 2}</p>
                </div>
                <div class="preview-section">
                    <h3>Student Level-up Settings</h3>
                    <p>Experience Points Required Per Level: ${currentSettings.studentLevelUp?.experiencePerLevel || 100}</p>
                    <p>Ranking System: ${currentSettings.studentLevelUp?.rankSystem?.enabled ? 'Enabled' : 'Disabled'}</p>
                </div>
                <button onclick="window.close()" style="padding: 10px 20px; background: white; color: ${currentSettings.organizationInfo?.primaryColor || '#667eea'}; border: none; border-radius: 4px; cursor: pointer;">Close</button>
            </body>
        </html>
    `);
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

// Initialize default settings when script loads
defaultSettings = getDefaultSettings();

