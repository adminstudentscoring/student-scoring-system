async function resetOrgPassword() {
    if (!currentOrgId) {
        alert('No organization selected.');
        return;
    }

    const newPasswordInput = document.getElementById('sc_newPassword');
    const confirmPasswordInput = document.getElementById('sc_confirmPassword');
    
    if (!newPasswordInput || !confirmPasswordInput) {
        alert('Password inputs not found.');
        return;
    }

    const password = newPasswordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();

    if (!password) {
        alert('Please enter a new password.');
        return;
    }

    if (password.length < 6) {
        alert('Password must be at least 6 characters.');
        return;
    }

    if (password !== confirmPassword) {
        alert('Passwords do not match.');
        return;
    }

    if (!confirm('Are you sure you want to update this organization password?')) {
        return;
    }

    try {
        const response = await window.authUtils.authenticatedFetch(`/admin/organizations/${currentOrgId}/password`, {
            method: 'PATCH',
            body: JSON.stringify({ password })
        });
        if (!response) return;

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update password');
        }

        alert('Password updated successfully!');
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
    } catch (error) {
        alert('Error: ' + error.message);
    }
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

