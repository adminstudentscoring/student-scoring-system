/**
 * Organization Settings Management
 * Handles all settings-related functionality for organization management
 */

// Settings state
let currentSettings = null;
let defaultSettings = null;
let teacherPermissionState = {
    teachers: [],
    filtered: [],
    loading: false,
    error: null
};

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
            autoSaveInterval: 30, // minutes
            holidays: [] // ['YYYY-MM-DD']
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
        },
        salesSettings: {
            receipt: {
                logo: '',
                remark: 'Make-up Lesson Arrangements:\n- All make-up class quotas must be used within two months.\n- Sessions cannot be postponed under any circumstances.\n- Classes canceled by Typhoon/Rainstorm will be arranged via Zoom or face-to-face.\n- Must apply for leave at least 2 hours before class.'
            },
            paymentReminder: {
                logo: '',
                remark: 'Make-up Lesson Arrangements:\n- All make-up class quotas must be used within two months.\n- Sessions cannot be postponed under any circumstances.\n- Classes canceled by Typhoon/Rainstorm will be arranged via Zoom or face-to-face.\n- Must apply for leave at least 2 hours before class.',
                paymentMethod: '',
                qrCode: ''
            },
            whatsapp: {
                enabled: false,
                provider: 'meta_cloud', // future-proof
                accessToken: '',
                phoneNumberId: '',
                wabaId: '',
                // For future: template name for payment reminder / renewal
                templateName: ''
            }
        }
    };
}

function applyClassViewModeUiState() {
    const hpCalculation = currentSettings?.classViewMode?.hpCalculation || 'byScore';
    const hpMultiplierInput = document.getElementById('cvm_hpMultiplier');
    if (!hpMultiplierInput) return;
    const enabled = hpCalculation === 'multiplier';
    hpMultiplierInput.disabled = !enabled;
    hpMultiplierInput.style.opacity = enabled ? '1' : '0.6';
}

function onClassViewModeHpCalculationChange(value) {
    updateSetting('classViewMode', 'hpCalculation', value);
    applyClassViewModeUiState();
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
        { 
            id: 'teacher-setting', 
            name: 'Teacher Setting', 
            icon: '👨‍🏫',
            children: [
                { id: 'ts-permission', name: 'Teacher Permission' }
            ]
        },
        { id: 'student-setting', name: 'Student Setting', icon: '👥' },
        { 
            id: 'course-management', 
            name: 'Course Management', 
            icon: '📚',
            children: [
                { id: 'cm-timetable', name: 'Timetable' },
                { id: 'cm-courses', name: 'Courses' },
                { id: 'cm-package', name: 'Course Package' },
                { id: 'cm-accounting', name: 'Accounting' },
                { id: 'cm-sales', name: 'Sales' }
            ]
        },
        { id: 'statistic-management', name: 'Statistic Management', icon: '📊' },
        { id: 'class-view-management', name: 'Class View Management', icon: '🎮' },
        { id: 'general', name: 'General', icon: '⚙️' }
    ];

    let html = `
        <div class="course-management">
            <!-- Left Sidebar -->
            <div class="course-sub-tabs">
                ${categories.map((cat, index) => {
                    if (cat.children) {
                        return `
                            <div class="course-sub-tab-group" style="margin-bottom: 5px;">
                                <div class="course-sub-tab-header" style="padding: 10px 15px; font-weight: bold; color: #555; cursor: default;">
                                    ${cat.icon} ${cat.name}
                                </div>
                                ${cat.children.map(child => `
                                    <button class="course-sub-tab settings-nav-tab" data-cat-id="${child.id}" onclick="switchSettingsCategory('${child.id}')" style="padding-left: 35px; font-size: 0.9rem;">
                                        ${child.name}
                                    </button>
                                `).join('')}
                            </div>
                        `;
                    }
                    return `
                        <button class="course-sub-tab settings-nav-tab ${cat.id === 'class-view-management' ? 'active' : ''}" data-cat-id="${cat.id}" onclick="switchSettingsCategory('${cat.id}')">
                            ${cat.icon} ${cat.name}
                        </button>
                    `;
                }).join('')}
            </div>
            
            <!-- Content Area -->
            <div class="course-management-content" id="settingsContent">
                <!-- Default to Class View Management -->
                ${renderSettingsCategory('class-view-management')}
            </div>
        </div>
        
        <div class="settings-actions-footer" style="padding: 20px; text-align: right; border-top: 1px solid #eee; background: #fff; margin-top: 20px;">
             <button class="btn btn-secondary" onclick="resetAllSettings()">🔄 Reset All</button>
             <button class="btn btn-primary" onclick="saveSettings()">💾 Save All Settings</button>
        </div>
    `;
    
    document.getElementById('settingsContainer').innerHTML = html;
    applyClassViewModeUiState();
}

function renderSettingsCategory(categoryId) {
    let html = '';
    
    switch(categoryId) {
        case 'class-view-management':
            // Merge Class View Mode + Challenge Levels
            const cvSettings = currentSettings.classViewMode || {};
            const clSettings = currentSettings.challengeLevels || { levels: [], mode: 'classic' };
            // Ensure clean images
            if (clSettings.levels) clSettings.levels.forEach(l => delete l.image);
            
            html += `<div class="settings-section">
                ${renderClassViewMode(cvSettings)}
                <hr style="margin: 30px 0; border: 0; border-top: 1px dashed #ccc;">
                ${renderChallengeLevels(clSettings)}
            </div>`;
            break;
            
        case 'cm-timetable':
            html += renderTimetableSettings(currentSettings.scheduleSettings || {});
            break;
            
        case 'cm-sales':
            html += renderSalesSettings(currentSettings.salesSettings || {});
            break;

        case 'cm-sales':
            html += renderSalesSettings(currentSettings.salesSettings || {});
            break;

        case 'cm-courses':
        case 'cm-package':
        case 'cm-accounting':
            html += renderSalesSettings(currentSettings.salesSettings || {});
            break;

        case 'ts-permission':
            html += renderTeacherPermissionSection();
            break;
            
        case 'teacher-setting':
        case 'student-setting':
        case 'course-management':
        case 'statistic-management':
        case 'general':
        default:
            html += `
                <div class="empty-state" style="padding: 60px; text-align: center; color: #999;">
                    <div style="font-size: 48px; margin-bottom: 20px;">🚧</div>
                    <h3>${categoryId.replace(/-/g, ' ').toUpperCase()}</h3>
                    <p>This feature is coming soon.</p>
                </div>
            `;
            break;
    }
    
    return html;
}

/**
 * Switch settings category tab
 */
function switchSettingsCategory(categoryId) {
    document.querySelectorAll('.settings-nav-tab').forEach(btn => {
        if (btn.dataset.catId === categoryId) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    
    document.getElementById('settingsContent').innerHTML = renderSettingsCategory(categoryId);

    if (categoryId === 'ts-permission') {
        initTeacherPermission();
    }
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

// Initialize default settings when script loads
defaultSettings = getDefaultSettings();

