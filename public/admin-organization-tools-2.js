function getActionColor(action) {
    const colors = {
        'CREATE': '#10b981',
        'UPDATE': '#3b82f6',
        'DELETE': '#ef4444',
        'LOGIN': '#8b5cf6',
        'LOGOUT': '#6b7280',
        'EXPORT': '#f59e0b',
        'IMPORT': '#ec4899'
    };
    return colors[action] || '#6b7280';
}

/**
 * Filter audit logs by date range
 */
async function filterAuditLogs() {
    const startDate = document.getElementById('auditLogStartDate').value;
    const endDate = document.getElementById('auditLogEndDate').value;
    
    try {
        let url = `/admin/organizations/${currentOrgIdForTools}/audit-logs`;
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        if (params.toString()) url += '?' + params.toString();
        
        const response = await window.authUtils.authenticatedFetch(url);
        if (!response) return;

        if (!response.ok) {
            throw new Error('Failed to filter audit logs');
        }

        auditLogs = await response.json();
        renderAuditLogs();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

/**
 * Export audit logs
 */
function exportAuditLogs() {
    if (!auditLogs || auditLogs.length === 0) {
        alert('No audit logs to export');
        return;
    }
    
    const csv = [
        ['Timestamp', 'Action', 'User', 'Details', 'IP Address'],
        ...auditLogs.map(log => [
            new Date(log.timestamp).toLocaleString(),
            log.action,
            log.userName || log.userId || 'System',
            log.details || '',
            log.ipAddress || ''
        ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${currentOrgIdForTools}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

/**
 * Show batch operations interface
 */
function showBatchOperations() {
    const html = `
        <div class="tools-container">
            <h2>⚡ Batch Operations</h2>
            
            <div class="batch-section" style="margin-bottom: 30px;">
                <h3>Account Status Operations</h3>
                <div class="card" style="padding: 20px;">
                    <div class="settings-group" style="margin-bottom: 15px;">
                        <label>Select Organizations</label>
                        <div id="batchOrgSelector" style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 4px;">
                            <p>Loading organizations...</p>
                        </div>
                    </div>
                    <div class="settings-group" style="margin-bottom: 15px;">
                        <label>Action</label>
                        <select id="batchAction" style="width: 100%; padding: 8px;">
                            <option value="">Select action...</option>
                            <option value="activate">Activate Accounts</option>
                            <option value="suspend">Suspend Accounts</option>
                            <option value="disable">Disable Accounts</option>
                            <option value="sendNotification">Send Notification</option>
                            <option value="exportData">Export Data</option>
                        </select>
                    </div>
                    <div class="settings-group" style="margin-bottom: 15px;">
                        <label>Additional Options</label>
                        <textarea id="batchOptions" rows="3" placeholder="Enter additional options or message..." style="width: 100%; padding: 8px;"></textarea>
                    </div>
                    <button class="btn btn-primary" onclick="executeBatchOperation()">Execute Batch Operation</button>
                </div>
            </div>

            <div class="batch-section">
                <h3>Bulk Settings Update</h3>
                <div class="card" style="padding: 20px;">
                    <div class="settings-group" style="margin-bottom: 15px;">
                        <label>Select Organizations</label>
                        <div id="batchSettingsOrgSelector" style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 4px;">
                            <p>Loading organizations...</p>
                        </div>
                    </div>
                    <div class="settings-group" style="margin-bottom: 15px;">
                        <label>Setting to Update</label>
                        <select id="batchSettingKey" style="width: 100%; padding: 8px;">
                            <option value="">Select setting...</option>
                            <option value="maxTeachers">Max Teachers</option>
                            <option value="maxStudents">Max Students</option>
                            <option value="subscriptionPlan">Subscription Plan</option>
                            <option value="billingCycle">Billing Cycle</option>
                        </select>
                    </div>
                    <div class="settings-group" style="margin-bottom: 15px;">
                        <label>New Value</label>
                        <input type="text" id="batchSettingValue" placeholder="Enter new value..." style="width: 100%; padding: 8px;">
                    </div>
                    <button class="btn btn-primary" onclick="executeBatchSettingsUpdate()">Update Settings</button>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('orgToolsContainer').innerHTML = html;
    loadOrganizationsForBatch();
}

/**
 * Load organizations for batch operations
 */
async function loadOrganizationsForBatch() {
    try {
        const response = await window.authUtils.authenticatedFetch('/admin/organizations');
        if (!response) return;

        const organizations = await response.json();
        
        const html = organizations.map(org => `
            <label style="display: block; padding: 5px;">
                <input type="checkbox" value="${org.id}" class="batch-org-checkbox">
                ${org.name} (${org.email})
            </label>
        `).join('');
        
        document.getElementById('batchOrgSelector').innerHTML = html;
        document.getElementById('batchSettingsOrgSelector').innerHTML = html;
    } catch (error) {
        console.error('Error loading organizations:', error);
    }
}

/**
 * Execute batch operation
 */
async function executeBatchOperation() {
    const selectedOrgs = Array.from(document.querySelectorAll('.batch-org-checkbox:checked')).map(cb => cb.value);
    const action = document.getElementById('batchAction').value;
    const options = document.getElementById('batchOptions').value;
    
    if (selectedOrgs.length === 0) {
        alert('Please select at least one organization');
        return;
    }
    
    if (!action) {
        alert('Please select an action');
        return;
    }
    
    if (!confirm(`Are you sure you want to ${action} ${selectedOrgs.length} organization(s)?`)) {
        return;
    }
    
    try {
        const response = await window.authUtils.authenticatedFetch('/admin/organizations/batch', {
            method: 'POST',
            body: JSON.stringify({
                organizationIds: selectedOrgs,
                action: action,
                options: options
            })
        });

        if (!response) return;

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to execute batch operation');
        }

        alert(`Batch operation completed successfully! Affected: ${selectedOrgs.length} organization(s)`);
        showBatchOperations(); // Reload
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

/**
 * Execute batch settings update
 */
async function executeBatchSettingsUpdate() {
    const selectedOrgs = Array.from(document.querySelectorAll('#batchSettingsOrgSelector .batch-org-checkbox:checked')).map(cb => cb.value);
    const settingKey = document.getElementById('batchSettingKey').value;
    const settingValue = document.getElementById('batchSettingValue').value;
    
    if (selectedOrgs.length === 0) {
        alert('Please select at least one organization');
        return;
    }
    
    if (!settingKey || !settingValue) {
        alert('Please select a setting and enter a value');
        return;
    }
    
    if (!confirm(`Are you sure you want to update ${settingKey} to ${settingValue} for ${selectedOrgs.length} organization(s)?`)) {
        return;
    }
    
    try {
        const response = await window.authUtils.authenticatedFetch('/admin/organizations/batch-settings', {
            method: 'POST',
            body: JSON.stringify({
                organizationIds: selectedOrgs,
                settingKey: settingKey,
                settingValue: settingValue
            })
        });

        if (!response) return;

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update settings');
        }

        alert(`Settings updated successfully! Affected: ${selectedOrgs.length} organization(s)`);
        showBatchOperations(); // Reload
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

/**
 * Switch tools tab
 */
function switchToolsTab(tab) {
    if (tab === 'statistics') {
        if (currentOrgIdForTools) {
            loadOrgStatistics(currentOrgIdForTools);
        } else {
            document.getElementById('orgToolsContainer').innerHTML = '<p>Please select an organization first</p>';
        }
    } else if (tab === 'audit') {
        if (currentOrgIdForTools) {
            loadAuditLogs(currentOrgIdForTools);
        } else {
            document.getElementById('orgToolsContainer').innerHTML = '<p>Please select an organization first</p>';
        }
    } else if (tab === 'batch') {
        showBatchOperations();
    }
}

// Expose functions to global scope for onclick handlers
if (typeof window !== 'undefined') {
    window.loadOrgStatistics = loadOrgStatistics;
    window.loadAuditLogs = loadAuditLogs;
    window.filterAuditLogs = filterAuditLogs;
    window.exportAuditLogs = exportAuditLogs;
    window.showBatchOperations = showBatchOperations;
    window.executeBatchOperation = executeBatchOperation;
    window.executeBatchSettingsUpdate = executeBatchSettingsUpdate;
    window.switchToolsTab = switchToolsTab;
}

