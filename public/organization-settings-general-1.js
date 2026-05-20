// Organization Settings - General Settings, Billing, Permissions

/**
 * Render Teacher Permittion section (list + modal placeholder)
 */
function renderTeacherPermissionSection() {
    return `
        <div class="settings-section">
            <h3>Teacher Permission</h3>
            <div class="settings-group" style="display:flex; justify-content: space-between; align-items:center; gap:10px; margin-top:10px;">
                <input type="text" id="tsSearchInput" placeholder="Search teacher..." oninput="filterTeacherPermissionList()" style="flex:1; padding:10px; border:1px solid #ddd; border-radius:6px;">
                <div id="tsStatus" style="color:#666; font-size:0.9rem;">Loading...</div>
            </div>
            <div id="tsTeacherList" style="margin-top:12px; display:flex; flex-direction:column; gap:10px;"></div>
        </div>

        <div id="tsPermissionModal" class="modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.35); z-index:2000; align-items:center; justify-content:center;">
            <div class="modal-content" style="max-width:640px; width:90%; max-height:90vh; overflow:hidden; display:flex; flex-direction:column;">
                <div class="modal-header">
                    <h2 id="tsModalTitle">Teacher Permissions</h2>
                    <span class="modal-close" onclick="closeTeacherPermissionModal()">&times;</span>
                </div>
                <div class="modal-body" style="padding-top:0; display:flex; flex-direction:column; gap:12px; flex:1; overflow:hidden;">
                    <div class="payment-tabs" style="display:flex; gap:10px; margin-top:0; flex-wrap:wrap;">
                        <button class="btn btn-primary" id="tsTabEditStudent" onclick="switchTsPermissionTab('edit')" style="min-width:140px;">Edit Student</button>
                        <button class="btn btn-secondary" id="tsTabCourseMgmt" onclick="switchTsPermissionTab('course')" style="min-width:180px;">Course Management</button>
                    </div>
                    <div id="tsTabContent" style="flex:1; overflow:auto; border:1px solid #eee; border-radius:8px; padding:12px;">
                        <p style="color:#666;">(Placeholder) Select a tab to configure permissions.</p>
                    </div>
                </div>
                <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn btn-secondary" onclick="closeTeacherPermissionModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="confirmTeacherPermission()">Confirm</button>
                </div>
            </div>
        </div>
    `;
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
 * Teacher Permittion helpers
 */
async function initTeacherPermission() {
    const listEl = document.getElementById('tsTeacherList');
    const statusEl = document.getElementById('tsStatus');
    if (!listEl || !statusEl) return;

    statusEl.textContent = 'Loading...';
    listEl.innerHTML = '';
    teacherPermissionState.loading = true;
    teacherPermissionState.error = null;

    try {
        const resp = await window.authUtils.authenticatedFetch('/organizations/teachers');
        if (!resp || !resp.ok) {
            throw new Error('Failed to load teachers');
        }
        const data = await resp.json();
        const teachers = Array.isArray(data) ? data : (Array.isArray(data.teachers) ? data.teachers : []);
        teacherPermissionState.teachers = teachers;
        teacherPermissionState.filtered = teachers;
        statusEl.textContent = `${teachers.length} teacher(s)`;
        renderTeacherPermissionList();
    } catch (err) {
        console.error('load teachers failed', err);
        teacherPermissionState.error = err;
        statusEl.textContent = 'Error loading teachers';
        listEl.innerHTML = `<div class="empty-state" style="padding:12px; color:#c00;">${err.message || 'Error loading teachers'}</div>`;
    } finally {
        teacherPermissionState.loading = false;
    }
}

function renderTeacherPermissionList() {
    const listEl = document.getElementById('tsTeacherList');
    const statusEl = document.getElementById('tsStatus');
    if (!listEl) return;

    const items = teacherPermissionState.filtered || [];
    if (statusEl) statusEl.textContent = teacherPermissionState.loading ? 'Loading...' : `${items.length} teacher(s)`;

    if (items.length === 0) {
        listEl.innerHTML = `<div class="empty-state" style="padding:12px; color:#666;">No teachers found.</div>`;
        return;
    }

    listEl.innerHTML = items.map(t => {
        const name = t.name || 'Unknown';
        const email = t.email || t.username || '';
        const tid = t.teacherId || '';
        return `
            <div class="settings-group" style="display:flex; align-items:center; justify-content: space-between; gap:10px; border:1px solid #eee; border-radius:8px; padding:10px 12px; background:#fff;">
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:600;">${name}</span>
                    <span style="color:#666; font-size:0.9rem;">${email}</span>
                    ${tid ? `<span style="color:#999; font-size:0.8rem;">ID: ${tid}</span>` : ''}
                </div>
                <button class="btn btn-primary" onclick="openTeacherPermissionModal('${t.id || ''}', '${name.replace(/'/g, "\\'")}')">Manage</button>
            </div>
        `;
    }).join('');
}

function filterTeacherPermissionList() {
    const input = document.getElementById('tsSearchInput');
    if (!input) return;
    const keyword = input.value.trim().toLowerCase();
    if (!keyword) {
        teacherPermissionState.filtered = teacherPermissionState.teachers;
    } else {
        teacherPermissionState.filtered = teacherPermissionState.teachers.filter(t => {
            const name = (t.name || '').toLowerCase();
            const email = (t.email || t.username || '').toLowerCase();
            const tid = (t.teacherId || '').toLowerCase();
            return name.includes(keyword) || email.includes(keyword) || tid.includes(keyword);
        });
    }
    renderTeacherPermissionList();
}

let currentTeacherId = null;

function openTeacherPermissionModal(teacherId, teacherName = '') {
    const modal = document.getElementById('tsPermissionModal');
    const titleEl = document.getElementById('tsModalTitle');
    if (!modal) return;
    if (titleEl) titleEl.textContent = teacherName ? `Teacher Permissions - ${teacherName}` : 'Teacher Permissions';
    
    currentTeacherId = teacherId;
    switchTsPermissionTab('edit');
    modal.style.display = 'flex';
}

function closeTeacherPermissionModal() {
    const modal = document.getElementById('tsPermissionModal');
    if (modal) modal.style.display = 'none';
    currentTeacherId = null;
}

async function confirmTeacherPermission() {
    if (!currentTeacherId) return;
    
    // Gather permissions
    const permissions = {
        addStudent: document.getElementById('tsPerm_addStudent')?.checked || false,
        deleteStudent: document.getElementById('tsPerm_deleteStudent')?.checked || false,
        editScore: document.getElementById('tsPerm_editScore')?.checked || false,
        editStudentProfile: document.getElementById('tsPerm_editStudentProfile')?.checked || false,
        editSharePwd: document.getElementById('tsPerm_editSharePwd')?.checked || false
    };
    
    try {
        const response = await window.authUtils.authenticatedFetch(`/organizations/teachers/${currentTeacherId}/permissions`, {
            method: 'PUT',
            body: JSON.stringify(permissions)
        });
        
        if (!response.ok) {
            throw new Error('Failed to update permissions');
        }
        
        // Update local state if needed
        const teacher = teacherPermissionState.teachers.find(t => t.id === currentTeacherId);
        if (teacher) {
            teacher.teacherPermissions = permissions;
        }
        
        closeTeacherPermissionModal();
        alert('Permissions saved successfully.');
    } catch (error) {
        console.error('Save permissions failed', error);
        alert('Error saving permissions: ' + error.message);
    }
