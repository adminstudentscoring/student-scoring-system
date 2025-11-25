/**
 * Admin Organization Settings Management
 * Handles all settings-related functionality for admin to manage organizations
 */

// Current organization being managed
let currentOrgId = null;
let currentOrgSettings = null;
let defaultOrgSettings = null;

/**
 * Get default organization settings for admin management
 */
function getDefaultOrgSettings() {
    return {
        accountLimits: {
            maxTeachers: -1, // -1 means unlimited
            maxStudents: -1,
            storageLimitMB: -1,
            apiRateLimitPerHour: -1
        },
        accountStatus: {
            status: 'active', // 'active', 'suspended', 'disabled', 'trial'
            expiryDate: null,
            isTrial: false,
            suspensionReason: ''
        },
        featurePermissions: {
            canUseClassView: true,
            canUseChallengeMode: true,
            canUseGameFeatures: true,
            canExportData: true,
            canUseCustomSettings: true,
            canUseBackup: true
        },
        dataManagement: {
            backupFrequencyLimit: 'daily', // 'hourly', 'daily', 'weekly', 'monthly', 'unlimited'
            dataRetentionDays: 365,
            maxBackupCount: 10
        },
        securityCompliance: {
            forcePasswordPolicy: false,
            loginAttemptLimit: 5,
            sessionTimeoutMs: 3600000,
            ipWhitelist: [] // Array of IP addresses
        },
        notifications: {
            sendSystemNotifications: true,
            sendWarningEmails: true,
            sendExpiryReminders: true,
            activityMonitoring: true
        },
        billing: {
            subscriptionPlan: 'free', // 'free', 'basic', 'professional', 'enterprise'
            billingCycle: 'monthly', // 'monthly', 'yearly'
            autoRenew: false,
            paymentStatus: 'unpaid', // 'paid', 'unpaid', 'overdue'
            nextBillingDate: null
        }
    };
}

/**
 * Load organization settings for admin management
 */
async function loadOrgSettings(orgId) {
    try {
        currentOrgId = orgId;
        
        // Get organization details
        const response = await window.authUtils.authenticatedFetch(`/admin/organizations/${orgId}`);
        if (!response) return;

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to load organization');
        }

        const org = await response.json();
        
        // Initialize settings from organization data or use defaults
        currentOrgSettings = org.adminSettings || getDefaultOrgSettings();
        defaultOrgSettings = JSON.parse(JSON.stringify(getDefaultOrgSettings()));
        
        renderOrgSettings();
    } catch (error) {
        console.error('Error loading organization settings:', error);
        document.getElementById('orgSettingsContainer').innerHTML = '<p>Failed to load settings: ' + error.message + '</p>';
    }
}

/**
 * Render organization settings page
 */
function renderOrgSettings() {
    if (!currentOrgSettings) {
        currentOrgSettings = getDefaultOrgSettings();
    }
    if (!defaultOrgSettings) {
        defaultOrgSettings = JSON.parse(JSON.stringify(getDefaultOrgSettings()));
    }

    const categories = [
        { id: 'accountLimits', name: '📊 Account Limits', icon: '📊' },
        { id: 'accountStatus', name: '🔐 Account Status', icon: '🔐' },
        { id: 'featurePermissions', name: '🎯 Feature Permissions', icon: '🎯' },
        { id: 'dataManagement', name: '💾 Data Management', icon: '💾' },
        { id: 'securityCompliance', name: '🛡️ Security & Compliance', icon: '🛡️' },
        { id: 'notifications', name: '🔔 Notifications', icon: '🔔' },
        { id: 'billing', name: '💳 Billing & Subscription', icon: '💳' }
    ];

    let html = `
        <div class="settings-container">
            <div class="settings-actions" style="justify-content: space-between; align-items: center;">
                <h2 style="margin: 0;">⚙️ Organization Settings</h2>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-secondary" onclick="resetOrgSettings()">🔄 Reset to Default</button>
                    <button class="btn btn-primary" onclick="saveOrgSettings()">💾 Save Settings</button>
                </div>
            </div>
            <div class="settings-tabs" id="orgSettingsTabs">
                ${categories.map((cat, index) => `
                    <button class="settings-tab ${index === 0 ? 'active' : ''}" onclick="switchOrgSettingsCategory('${cat.id}')">
                        ${cat.name}
                    </button>
                `).join('')}
            </div>
    `;

    // Render each category
    categories.forEach((cat, index) => {
        html += renderOrgSettingsCategory(cat.id, cat.name, index === 0);
    });

    html += '</div>';
    document.getElementById('orgSettingsContainer').innerHTML = html;
}

/**
 * Render a specific settings category
 */
function renderOrgSettingsCategory(categoryId, categoryName, isActive) {
    const settings = currentOrgSettings[categoryId] || {};
    let html = `<div class="settings-category-content ${isActive ? 'active' : ''}" id="${categoryId}Content">`;

    switch(categoryId) {
        case 'accountLimits':
            html += renderAccountLimits(settings);
            break;
        case 'accountStatus':
            html += renderAccountStatus(settings);
            break;
        case 'featurePermissions':
            html += renderFeaturePermissions(settings);
            break;
        case 'dataManagement':
            html += renderDataManagement(settings);
            break;
        case 'securityCompliance':
            html += renderSecurityCompliance(settings);
            break;
        case 'notifications':
            html += renderNotifications(settings);
            break;
        case 'billing':
            html += renderBilling(settings);
            break;
    }

    html += `</div>`;
    return html;
}

/**
 * Render Account Limits settings
 */
function renderAccountLimits(settings) {
    return `
        <div class="settings-category">
            <h3>📊 Account Limits</h3>
            <div class="category-description">Set quota limits for this organization</div>
            <div class="settings-group">
                <label>Max Teachers</label>
                <input type="number" id="al_maxTeachers" value="${settings.maxTeachers === -1 ? '' : settings.maxTeachers}" placeholder="Unlimited" min="-1" onchange="updateOrgSetting('accountLimits', 'maxTeachers', this.value === '' ? -1 : parseInt(this.value))">
                <div class="help-text">Leave empty or set to -1 for unlimited</div>
            </div>
            <div class="settings-group">
                <label>Max Students</label>
                <input type="number" id="al_maxStudents" value="${settings.maxStudents === -1 ? '' : settings.maxStudents}" placeholder="Unlimited" min="-1" onchange="updateOrgSetting('accountLimits', 'maxStudents', this.value === '' ? -1 : parseInt(this.value))">
                <div class="help-text">Leave empty or set to -1 for unlimited</div>
            </div>
            <div class="settings-group">
                <label>Storage Limit (MB)</label>
                <input type="number" id="al_storageLimitMB" value="${settings.storageLimitMB === -1 ? '' : settings.storageLimitMB}" placeholder="Unlimited" min="-1" onchange="updateOrgSetting('accountLimits', 'storageLimitMB', this.value === '' ? -1 : parseInt(this.value))">
                <div class="help-text">Leave empty or set to -1 for unlimited</div>
            </div>
            <div class="settings-group">
                <label>API Rate Limit (per hour)</label>
                <input type="number" id="al_apiRateLimitPerHour" value="${settings.apiRateLimitPerHour === -1 ? '' : settings.apiRateLimitPerHour}" placeholder="Unlimited" min="-1" onchange="updateOrgSetting('accountLimits', 'apiRateLimitPerHour', this.value === '' ? -1 : parseInt(this.value))">
                <div class="help-text">Leave empty or set to -1 for unlimited</div>
            </div>
        </div>
    `;
}

/**
 * Render Account Status settings
 */
function renderAccountStatus(settings) {
    return `
        <div class="settings-category">
            <h3>🔐 Account Status</h3>
            <div class="category-description">Manage organization account status</div>
            <div class="settings-group">
                <label>Account Status</label>
                <select id="as_status" onchange="updateOrgSetting('accountStatus', 'status', this.value)">
                    <option value="active" ${settings.status === 'active' ? 'selected' : ''}>Active</option>
                    <option value="suspended" ${settings.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                    <option value="disabled" ${settings.status === 'disabled' ? 'selected' : ''}>Disabled</option>
                    <option value="trial" ${settings.status === 'trial' ? 'selected' : ''}>Trial</option>
                </select>
            </div>
            <div class="settings-group">
                <label>Expiry Date</label>
                <input type="date" id="as_expiryDate" value="${settings.expiryDate ? settings.expiryDate.split('T')[0] : ''}" onchange="updateOrgSetting('accountStatus', 'expiryDate', this.value ? new Date(this.value).toISOString() : null)">
                <div class="help-text">Leave empty for no expiry</div>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="as_isTrial" ${settings.isTrial ? 'checked' : ''} onchange="updateOrgSetting('accountStatus', 'isTrial', this.checked)">
                    <span>Is Trial Account</span>
                </label>
            </div>
            <div class="settings-group">
                <label>Suspension Reason</label>
                <textarea id="as_suspensionReason" rows="3" placeholder="Enter reason for suspension..." onchange="updateOrgSetting('accountStatus', 'suspensionReason', this.value)">${settings.suspensionReason || ''}</textarea>
                <div class="help-text">Only required if status is Suspended</div>
            </div>
        </div>
    `;
}

/**
 * Render Feature Permissions settings
 */
function renderFeaturePermissions(settings) {
    return `
        <div class="settings-category">
            <h3>🎯 Feature Permissions</h3>
            <div class="category-description">Control which features this organization can use</div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="fp_canUseClassView" ${settings.canUseClassView ? 'checked' : ''} onchange="updateOrgSetting('featurePermissions', 'canUseClassView', this.checked)">
                    <span>Can use Class-View mode</span>
                </label>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="fp_canUseChallengeMode" ${settings.canUseChallengeMode ? 'checked' : ''} onchange="updateOrgSetting('featurePermissions', 'canUseChallengeMode', this.checked)">
                    <span>Can use Challenge mode</span>
                </label>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="fp_canUseGameFeatures" ${settings.canUseGameFeatures ? 'checked' : ''} onchange="updateOrgSetting('featurePermissions', 'canUseGameFeatures', this.checked)">
                    <span>Can use Game features</span>
                </label>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="fp_canExportData" ${settings.canExportData ? 'checked' : ''} onchange="updateOrgSetting('featurePermissions', 'canExportData', this.checked)">
                    <span>Can export data</span>
                </label>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="fp_canUseCustomSettings" ${settings.canUseCustomSettings ? 'checked' : ''} onchange="updateOrgSetting('featurePermissions', 'canUseCustomSettings', this.checked)">
                    <span>Can use custom settings</span>
                </label>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="fp_canUseBackup" ${settings.canUseBackup ? 'checked' : ''} onchange="updateOrgSetting('featurePermissions', 'canUseBackup', this.checked)">
                    <span>Can use backup features</span>
                </label>
            </div>
        </div>
    `;
}

/**
 * Render Data Management settings
 */
function renderDataManagement(settings) {
    return `
        <div class="settings-category">
            <h3>💾 Data Management</h3>
            <div class="category-description">Configure data management limits</div>
            <div class="settings-group">
                <label>Backup Frequency Limit</label>
                <select id="dm_backupFrequencyLimit" onchange="updateOrgSetting('dataManagement', 'backupFrequencyLimit', this.value)">
                    <option value="hourly" ${settings.backupFrequencyLimit === 'hourly' ? 'selected' : ''}>Hourly</option>
                    <option value="daily" ${settings.backupFrequencyLimit === 'daily' ? 'selected' : ''}>Daily</option>
                    <option value="weekly" ${settings.backupFrequencyLimit === 'weekly' ? 'selected' : ''}>Weekly</option>
                    <option value="monthly" ${settings.backupFrequencyLimit === 'monthly' ? 'selected' : ''}>Monthly</option>
                    <option value="unlimited" ${settings.backupFrequencyLimit === 'unlimited' ? 'selected' : ''}>Unlimited</option>
                </select>
            </div>
            <div class="settings-group">
                <label>Data Retention Period (days)</label>
                <input type="number" id="dm_dataRetentionDays" value="${settings.dataRetentionDays || 365}" min="1" onchange="updateOrgSetting('dataManagement', 'dataRetentionDays', parseInt(this.value))">
                <div class="help-text">Automatically delete data older than this period</div>
            </div>
            <div class="settings-group">
                <label>Max Backup Count</label>
                <input type="number" id="dm_maxBackupCount" value="${settings.maxBackupCount || 10}" min="1" onchange="updateOrgSetting('dataManagement', 'maxBackupCount', parseInt(this.value))">
                <div class="help-text">Maximum number of backup files to keep</div>
            </div>
        </div>
    `;
}

/**
 * Render Security & Compliance settings
 */
function renderSecurityCompliance(settings) {
    const ipWhitelist = settings.ipWhitelist || [];
    return `
        <div class="settings-category">
            <h3>🛡️ Security & Compliance</h3>
            <div class="category-description">Configure security and compliance settings</div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="sc_forcePasswordPolicy" ${settings.forcePasswordPolicy ? 'checked' : ''} onchange="updateOrgSetting('securityCompliance', 'forcePasswordPolicy', this.checked)">
                    <span>Force password policy</span>
                </label>
            </div>
            <div class="settings-group">
                <label>Login Attempt Limit</label>
                <input type="number" id="sc_loginAttemptLimit" value="${settings.loginAttemptLimit || 5}" min="1" max="10" onchange="updateOrgSetting('securityCompliance', 'loginAttemptLimit', parseInt(this.value))">
                <div class="help-text">Maximum failed login attempts before account lockout</div>
            </div>
            <div class="settings-group">
                <label>Session Timeout (ms)</label>
                <input type="number" id="sc_sessionTimeoutMs" value="${settings.sessionTimeoutMs || 3600000}" min="60000" step="60000" onchange="updateOrgSetting('securityCompliance', 'sessionTimeoutMs', parseInt(this.value))">
                <div class="help-text">Default: 3600000 (1 hour)</div>
            </div>
            <div class="settings-group">
                <label>IP Whitelist</label>
                <div id="ipWhitelistContainer">
                    ${ipWhitelist.map((ip, index) => `
                        <div style="display: flex; gap: 10px; margin-bottom: 5px;">
                            <input type="text" value="${ip}" onchange="updateIpWhitelist(${index}, this.value)" style="flex: 1;">
                            <button class="btn btn-danger" onclick="removeIpWhitelist(${index})" style="padding: 5px 10px;">Remove</button>
                        </div>
                    `).join('')}
                </div>
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <input type="text" id="newIpAddress" placeholder="Enter IP address" style="flex: 1;">
                    <button class="btn btn-primary" onclick="addIpWhitelist()" style="padding: 5px 10px;">Add IP</button>
                </div>
                <div class="help-text">Leave empty to allow all IPs. Add IP addresses to restrict access.</div>
            </div>
        </div>
    `;
}

/**
 * Render Notifications settings
 */
function renderNotifications(settings) {
    return `
        <div class="settings-category">
            <h3>🔔 Notifications</h3>
            <div class="category-description">Configure notification settings</div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="not_sendSystemNotifications" ${settings.sendSystemNotifications ? 'checked' : ''} onchange="updateOrgSetting('notifications', 'sendSystemNotifications', this.checked)">
                    <span>Send system notifications</span>
                </label>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="not_sendWarningEmails" ${settings.sendWarningEmails ? 'checked' : ''} onchange="updateOrgSetting('notifications', 'sendWarningEmails', this.checked)">
                    <span>Send warning emails</span>
                </label>
                <div class="help-text">Send emails when quota is about to be exceeded</div>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="not_sendExpiryReminders" ${settings.sendExpiryReminders ? 'checked' : ''} onchange="updateOrgSetting('notifications', 'sendExpiryReminders', this.checked)">
                    <span>Send expiry reminders</span>
                </label>
                <div class="help-text">Send reminders before account expiry</div>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="not_activityMonitoring" ${settings.activityMonitoring ? 'checked' : ''} onchange="updateOrgSetting('notifications', 'activityMonitoring', this.checked)">
                    <span>Enable activity monitoring</span>
                </label>
                <div class="help-text">Monitor and log important activities</div>
            </div>
        </div>
    `;
}

/**
 * Render Billing & Subscription settings
 */
function renderBilling(settings) {
    return `
        <div class="settings-category">
            <h3>💳 Billing & Subscription</h3>
            <div class="category-description">Manage billing and subscription settings</div>
            <div class="settings-group">
                <label>Subscription Plan</label>
                <select id="bill_subscriptionPlan" onchange="updateOrgSetting('billing', 'subscriptionPlan', this.value)">
                    <option value="free" ${settings.subscriptionPlan === 'free' ? 'selected' : ''}>Free</option>
                    <option value="basic" ${settings.subscriptionPlan === 'basic' ? 'selected' : ''}>Basic</option>
                    <option value="professional" ${settings.subscriptionPlan === 'professional' ? 'selected' : ''}>Professional</option>
                    <option value="enterprise" ${settings.subscriptionPlan === 'enterprise' ? 'selected' : ''}>Enterprise</option>
                </select>
            </div>
            <div class="settings-group">
                <label>Billing Cycle</label>
                <select id="bill_billingCycle" onchange="updateOrgSetting('billing', 'billingCycle', this.value)">
                    <option value="monthly" ${settings.billingCycle === 'monthly' ? 'selected' : ''}>Monthly</option>
                    <option value="yearly" ${settings.billingCycle === 'yearly' ? 'selected' : ''}>Yearly</option>
                </select>
            </div>
            <div class="settings-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="bill_autoRenew" ${settings.autoRenew ? 'checked' : ''} onchange="updateOrgSetting('billing', 'autoRenew', this.checked)">
                    <span>Auto-renew subscription</span>
                </label>
            </div>
            <div class="settings-group">
                <label>Payment Status</label>
                <select id="bill_paymentStatus" onchange="updateOrgSetting('billing', 'paymentStatus', this.value)">
                    <option value="paid" ${settings.paymentStatus === 'paid' ? 'selected' : ''}>Paid</option>
                    <option value="unpaid" ${settings.paymentStatus === 'unpaid' ? 'selected' : ''}>Unpaid</option>
                    <option value="overdue" ${settings.paymentStatus === 'overdue' ? 'selected' : ''}>Overdue</option>
                </select>
            </div>
            <div class="settings-group">
                <label>Next Billing Date</label>
                <input type="date" id="bill_nextBillingDate" value="${settings.nextBillingDate ? settings.nextBillingDate.split('T')[0] : ''}" onchange="updateOrgSetting('billing', 'nextBillingDate', this.value ? new Date(this.value).toISOString() : null)">
            </div>
        </div>
    `;
}

/**
 * Switch settings category tab
 */
function switchOrgSettingsCategory(categoryId) {
    document.querySelectorAll('.settings-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.settings-category-content').forEach(content => content.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(`${categoryId}Content`).classList.add('active');
}

/**
 * Update organization setting value
 */
function updateOrgSetting(category, key, value) {
    if (!currentOrgSettings[category]) {
        currentOrgSettings[category] = {};
    }
    currentOrgSettings[category][key] = value;
}

/**
 * Update IP whitelist
 */
function updateIpWhitelist(index, value) {
    if (!currentOrgSettings.securityCompliance.ipWhitelist) {
        currentOrgSettings.securityCompliance.ipWhitelist = [];
    }
    currentOrgSettings.securityCompliance.ipWhitelist[index] = value;
}

/**
 * Add IP to whitelist
 */
function addIpWhitelist() {
    const input = document.getElementById('newIpAddress');
    const ip = input.value.trim();
    if (!ip) return;
    
    if (!currentOrgSettings.securityCompliance.ipWhitelist) {
        currentOrgSettings.securityCompliance.ipWhitelist = [];
    }
    
    // Validate IP format (simple validation)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) {
        alert('Invalid IP address format');
        return;
    }
    
    currentOrgSettings.securityCompliance.ipWhitelist.push(ip);
    input.value = '';
    renderOrgSettings();
}

/**
 * Remove IP from whitelist
 */
function removeIpWhitelist(index) {
    if (!currentOrgSettings.securityCompliance.ipWhitelist) {
        return;
    }
    currentOrgSettings.securityCompliance.ipWhitelist.splice(index, 1);
    renderOrgSettings();
}

/**
 * Reset organization settings to default
 */
function resetOrgSettings() {
    if (!confirm('Are you sure you want to reset all settings to default values? This action cannot be undone!')) {
        return;
    }
    currentOrgSettings = JSON.parse(JSON.stringify(defaultOrgSettings));
    renderOrgSettings();
}

/**
 * Save organization settings
 */
async function saveOrgSettings() {
    if (!currentOrgId) {
        alert('No organization selected');
        return;
    }
    
    try {
        const response = await window.authUtils.authenticatedFetch(`/admin/organizations/${currentOrgId}/settings`, {
            method: 'PUT',
            body: JSON.stringify({ adminSettings: currentOrgSettings })
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

// Expose functions to global scope for onclick handlers
if (typeof window !== 'undefined') {
    window.loadOrgSettings = loadOrgSettings;
    window.switchOrgSettingsCategory = switchOrgSettingsCategory;
    window.updateOrgSetting = updateOrgSetting;
    window.updateIpWhitelist = updateIpWhitelist;
    window.addIpWhitelist = addIpWhitelist;
    window.removeIpWhitelist = removeIpWhitelist;
    window.resetOrgSettings = resetOrgSettings;
    window.saveOrgSettings = saveOrgSettings;
}

