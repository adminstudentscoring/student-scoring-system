/**
 * Admin Organization Tools
 * Handles tools functionality: statistics, audit logs, batch operations
 */

// Current organization being monitored
let currentOrgIdForTools = null;
let auditLogs = [];
let statisticsData = null;

/**
 * Load organization statistics
 */
async function loadOrgStatistics(orgId) {
    try {
        currentOrgIdForTools = orgId;
        
        const response = await window.authUtils.authenticatedFetch(`/admin/organizations/${orgId}/statistics`);
        if (!response) return;

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to load statistics');
        }

        statisticsData = await response.json();
        renderStatistics();
    } catch (error) {
        console.error('Error loading statistics:', error);
        document.getElementById('orgToolsContainer').innerHTML = '<p>Failed to load statistics: ' + error.message + '</p>';
    }
}

/**
 * Render statistics view
 */
function renderStatistics() {
    if (!statisticsData) {
        document.getElementById('orgToolsContainer').innerHTML = '<p>No statistics data available</p>';
        return;
    }

    const html = `
        <div class="tools-container">
            <h2>📊 Organization Statistics</h2>
            
            <div class="stats-overview" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
                <div class="stat-card" style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center;">
                    <h3 style="margin: 0 0 10px 0; color: #666; font-size: 14px;">Total Teachers</h3>
                    <div class="stat-number" style="font-size: 32px; font-weight: bold; color: #667eea;">${statisticsData.teacherCount || 0}</div>
                    <div class="stat-limit" style="color: #999; font-size: 12px; margin-top: 5px;">${statisticsData.maxTeachers === -1 ? 'Unlimited' : `/ ${statisticsData.maxTeachers}`}</div>
                </div>
                <div class="stat-card" style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center;">
                    <h3 style="margin: 0 0 10px 0; color: #666; font-size: 14px;">Total Students</h3>
                    <div class="stat-number" style="font-size: 32px; font-weight: bold; color: #667eea;">${statisticsData.studentCount || 0}</div>
                    <div class="stat-limit" style="color: #999; font-size: 12px; margin-top: 5px;">${statisticsData.maxStudents === -1 ? 'Unlimited' : `/ ${statisticsData.maxStudents}`}</div>
                </div>
                <div class="stat-card" style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center;">
                    <h3 style="margin: 0 0 10px 0; color: #666; font-size: 14px;">Storage Used</h3>
                    <div class="stat-number" style="font-size: 32px; font-weight: bold; color: #667eea;">${(statisticsData.storageUsedMB || 0).toFixed(2)} MB</div>
                    <div class="stat-limit" style="color: #999; font-size: 12px; margin-top: 5px;">${statisticsData.storageLimitMB === -1 ? 'Unlimited' : `/ ${statisticsData.storageLimitMB} MB`}</div>
                </div>
                <div class="stat-card" style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center;">
                    <h3 style="margin: 0 0 10px 0; color: #666; font-size: 14px;">API Calls (24h)</h3>
                    <div class="stat-number" style="font-size: 32px; font-weight: bold; color: #667eea;">${statisticsData.apiCalls24h || 0}</div>
                    <div class="stat-limit" style="color: #999; font-size: 12px; margin-top: 5px;">${statisticsData.apiRateLimitPerHour === -1 ? 'Unlimited' : `/ ${statisticsData.apiRateLimitPerHour * 24}`}</div>
                </div>
            </div>

            <div class="activity-stats" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                <div class="card" style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h3 style="margin-top: 0;">Active Users (Last 7 Days)</h3>
                    <div class="stat-number" style="font-size: 24px; font-weight: bold; color: #667eea; margin-bottom: 10px;">${statisticsData.activeUsers7d || 0}</div>
                    <p style="margin: 5px 0;">Teachers: ${statisticsData.activeTeachers7d || 0}</p>
                    <p style="margin: 5px 0;">Students: ${statisticsData.activeStudents7d || 0}</p>
                </div>
                <div class="card" style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <h3 style="margin-top: 0;">Activity Trends</h3>
                    <p style="margin: 5px 0;"><strong>Last Login:</strong> ${statisticsData.lastLogin ? new Date(statisticsData.lastLogin).toLocaleString() : 'Never'}</p>
                    <p style="margin: 5px 0;"><strong>Data Created:</strong> ${statisticsData.dataCreated ? new Date(statisticsData.dataCreated).toLocaleString() : 'N/A'}</p>
                    <p style="margin: 5px 0;"><strong>Last Activity:</strong> ${statisticsData.lastActivity ? new Date(statisticsData.lastActivity).toLocaleString() : 'N/A'}</p>
                </div>
            </div>

            <div class="usage-chart" style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h3>Usage Over Time</h3>
                <div class="help-text">Chart visualization will be implemented in future versions</div>
                <p>Student Growth: ${statisticsData.studentGrowth || 0}% (last 30 days)</p>
                <p>Teacher Growth: ${statisticsData.teacherGrowth || 0}% (last 30 days)</p>
            </div>
        </div>
    `;
    
    document.getElementById('orgToolsContainer').innerHTML = html;
}

/**
 * Load audit logs
 */
async function loadAuditLogs(orgId) {
    try {
        currentOrgIdForTools = orgId;
        
        const response = await window.authUtils.authenticatedFetch(`/admin/organizations/${orgId}/audit-logs`);
        if (!response) return;

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to load audit logs');
        }

        auditLogs = await response.json();
        renderAuditLogs();
    } catch (error) {
        console.error('Error loading audit logs:', error);
        document.getElementById('orgToolsContainer').innerHTML = '<p>Failed to load audit logs: ' + error.message + '</p>';
    }
}

/**
 * Render audit logs view
 */
function renderAuditLogs() {
    if (!auditLogs || auditLogs.length === 0) {
        document.getElementById('orgToolsContainer').innerHTML = '<p>No audit logs available</p>';
        return;
    }

    const html = `
        <div class="tools-container">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2>📋 Audit Logs</h2>
                <div style="display: flex; gap: 10px;">
                    <input type="date" id="auditLogStartDate" style="padding: 5px;">
                    <input type="date" id="auditLogEndDate" style="padding: 5px;">
                    <button class="btn btn-primary" onclick="filterAuditLogs()">Filter</button>
                    <button class="btn btn-secondary" onclick="exportAuditLogs()">Export</button>
                </div>
            </div>
            
            <div class="audit-logs-table" style="background: white; border-radius: 8px; overflow: hidden;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f5f5f5;">
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Timestamp</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Action</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">User</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Details</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">IP Address</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${auditLogs.map(log => `
                            <tr style="border-bottom: 1px solid #eee;">
                                <td style="padding: 12px;">${new Date(log.timestamp).toLocaleString()}</td>
                                <td style="padding: 12px;"><span style="padding: 4px 8px; background: ${getActionColor(log.action)}; border-radius: 4px; color: white; font-size: 0.85rem;">${log.action}</span></td>
                                <td style="padding: 12px;">${log.userName || log.userId || 'System'}</td>
                                <td style="padding: 12px;">${log.details || '-'}</td>
                                <td style="padding: 12px;">${log.ipAddress || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    document.getElementById('orgToolsContainer').innerHTML = html;
}

/**
 * Get color for action type
 */
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

