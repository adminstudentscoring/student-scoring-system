}

function switchTsPermissionTab(tab) {
    const tabEdit = document.getElementById('tsTabEditStudent');
    const tabCourse = document.getElementById('tsTabCourseMgmt');
    const content = document.getElementById('tsTabContent');
    if (!content) return;

    if (tab === 'edit') {
        if (tabEdit) tabEdit.className = 'btn btn-primary';
        if (tabCourse) tabCourse.className = 'btn btn-secondary';
        
        // Find teacher to get current permissions
        const teacher = teacherPermissionState.teachers.find(t => t.id === currentTeacherId);
        const perms = teacher?.teacherPermissions || {};

        content.innerHTML = `
            <div style="color:#333; display:flex; flex-direction:column; gap:10px;">
                <div style="font-weight:600; margin-bottom:4px;">Edit Student Permissions</div>
                <label class="checkbox-label" style="display:flex; gap:8px; align-items:center;">
                    <input type="checkbox" id="tsPerm_addStudent" ${perms.addStudent ? 'checked' : ''}>
                    <span>Add Student</span>
                </label>
                <label class="checkbox-label" style="display:flex; gap:8px; align-items:center;">
                    <input type="checkbox" id="tsPerm_deleteStudent" ${perms.deleteStudent ? 'checked' : ''}>
                    <span>Delete Student</span>
                </label>
                <label class="checkbox-label" style="display:flex; gap:8px; align-items:center;">
                    <input type="checkbox" id="tsPerm_editScore" ${perms.editScore ? 'checked' : ''}>
                    <span>Edit Score</span>
                </label>
                <label class="checkbox-label" style="display:flex; gap:8px; align-items:center;">
                    <input type="checkbox" id="tsPerm_editStudentProfile" ${perms.editStudentProfile ? 'checked' : ''}>
                    <span>Edit Student Profile (Name, ID, etc.)</span>
                </label>
                <label class="checkbox-label" style="display:flex; gap:8px; align-items:center;">
                    <input type="checkbox" id="tsPerm_editSharePwd" ${perms.editSharePwd ? 'checked' : ''}>
                    <span>Edit Student Share Link password</span>
                </label>
            </div>
        `;
    } else {
        if (tabEdit) tabEdit.className = 'btn btn-secondary';
        if (tabCourse) tabCourse.className = 'btn btn-primary';
        content.innerHTML = `
            <div style="color:#666;">
                <p>(Placeholder) Course Management permissions will be configured here.</p>
            </div>
        `;
    }
}


function renderTimetableSettings(settings) {
    const holidays = Array.isArray(settings.holidays) ? settings.holidays : [];
    return `
        <div class="settings-category">
            <h3>📅 Timetable View Settings</h3>
            <div class="category-description">Configure the visible time range and slot interval for the timetable view</div>
            
            <div class="settings-group">
                <label>View Start Time</label>
                <select onchange="updateSetting('scheduleSettings', 'viewStartTime', this.value)" style="padding:8px;">
                    ${generateSettingsTimeOptions(0, 23, settings.viewStartTime || '08:00')}
                </select>
            </div>
            <div class="settings-group">
                <label>View End Time</label>
                <select onchange="updateSetting('scheduleSettings', 'viewEndTime', this.value)" style="padding:8px;">
                    ${generateSettingsTimeOptions(0, 23, settings.viewEndTime || '22:00')}
                </select>
            </div>
            <div class="settings-group">
                <label>Time Slot Interval (Minutes)</label>
                <select onchange="updateSetting('scheduleSettings', 'slotInterval', parseInt(this.value))" style="padding:8px;">
                    <option value="15" ${settings.slotInterval === 15 ? 'selected' : ''}>15 Minutes</option>
                    <option value="30" ${settings.slotInterval === 30 ? 'selected' : ''}>30 Minutes</option>
                    <option value="60" ${settings.slotInterval === 60 ? 'selected' : ''}>1 Hour</option>
                </select>
            </div>

            <div class="settings-group">
                <label>Holidays / Closed Days (YYYY-MM-DD, one per line)</label>
                <textarea
                  style="width:100%; height:140px; padding:8px; border:2px solid #e0e0e0; border-radius:8px; background:#fff; color:#333;"
                  placeholder="2026-02-10&#10;2026-02-11"
                  onchange="updateSetting('scheduleSettings', 'holidays', this.value.split(/\n+/).map(s=>s.trim()).filter(Boolean))"
                >${(holidays || []).join('\n')}</textarea>
                <div class="help-text">These dates will be skipped by timetable scheduling and auto-renew calculations.</div>
            </div>
        </div>
    `;
}

function generateSettingsTimeOptions(startHour, endHour, selectedValue) {
    let options = '';
    for (let i = startHour; i <= endHour; i++) {
        const hour = String(i).padStart(2, '0');
        const time = `${hour}:00`;
        options += `<option value="${time}" ${time === selectedValue ? 'selected' : ''}>${time}</option>`;
    }
    return options;
}

function renderSalesSettings(settings) {
    // Ensure defaults
    const receipt = settings.receipt || { logo: '', remark: '' };
    const reminder = settings.paymentReminder || { logo: '', remark: '', paymentMethod: '', qrCode: '' };
    
    return `
        <div class="settings-category">
            <h3>📊 Sales Settings</h3>
            <div class="category-description">Configure receipt and payment reminder templates</div>
            
            <!-- Receipt Settings -->
            <div class="settings-group" style="border:1px solid #eee; padding:15px; border-radius:8px; margin-bottom:20px;">
                <h4 style="margin-top:0;">🧾 Receipt Settings</h4>
                
                <div class="settings-group">
                    <label>Receipt Logo</label>
                    <div style="display:flex; align-items:center; gap:10px;">
                        ${receipt.logo ? `<img src="${receipt.logo}" style="height:50px; border:1px solid #ddd; padding:2px;">` : '<div style="height:50px; width:50px; background:#eee; display:flex; align-items:center; justify-content:center; font-size:10px; color:#999;">No Logo</div>'}
                        <input type="file" accept="image/*" onchange="handleSalesLogoUpload('receipt', this)">
                        ${receipt.logo ? `<button class="btn btn-danger btn-sm" onclick="updateSetting('salesSettings', 'receipt.logo', '')">Remove</button>` : ''}
                    </div>
                </div>
                
                <div class="settings-group">
                    <label>Remark (Footer Text)</label>
                    <textarea style="width:100%; height:100px; padding:8px; border:1px solid #ddd; border-radius:4px;" onchange="updateSetting('salesSettings', 'receipt.remark', this.value)">${receipt.remark || ''}</textarea>
                </div>
            </div>
            
            <!-- Payment Reminder Settings -->
            <div class="settings-group" style="border:1px solid #eee; padding:15px; border-radius:8px;">
                <h4 style="margin-top:0;">🔔 Payment Reminder Settings</h4>
                
                <div class="settings-group">
                    <label>Reminder Logo</label>
                    <div style="display:flex; align-items:center; gap:10px;">
                        ${reminder.logo ? `<img src="${reminder.logo}" style="height:50px; border:1px solid #ddd; padding:2px;">` : '<div style="height:50px; width:50px; background:#eee; display:flex; align-items:center; justify-content:center; font-size:10px; color:#999;">No Logo</div>'}
                        <input type="file" accept="image/*" onchange="handleSalesLogoUpload('paymentReminder', this)">
                        ${reminder.logo ? `<button class="btn btn-danger btn-sm" onclick="updateSetting('salesSettings', 'paymentReminder.logo', '')">Remove</button>` : ''}
                    </div>
                </div>
                
                <div class="settings-group">
                    <label>Remark (Footer Text)</label>
                    <textarea style="width:100%; height:100px; padding:8px; border:1px solid #ddd; border-radius:4px;" onchange="updateSetting('salesSettings', 'paymentReminder.remark', this.value)">${reminder.remark || ''}</textarea>
                </div>
                
                <div class="settings-group">
                    <label>Payment Method Info</label>
                    <textarea style="width:100%; height:80px; padding:8px; border:1px solid #ddd; border-radius:4px;" placeholder="Bank Info, FPS ID, etc." onchange="updateSetting('salesSettings', 'paymentReminder.paymentMethod', this.value)">${reminder.paymentMethod || ''}</textarea>
                </div>
                
                <div class="settings-group">
                    <label>Payment QR Code</label>
                    <div style="display:flex; align-items:center; gap:10px;">
                        ${reminder.qrCode ? `<img src="${reminder.qrCode}" style="height:100px; border:1px solid #ddd; padding:2px;">` : '<div style="height:100px; width:100px; background:#eee; display:flex; align-items:center; justify-content:center; font-size:10px; color:#999;">No QR</div>'}
                        <input type="file" accept="image/*" onchange="handleSalesQRCodeUpload(this)">
                        ${reminder.qrCode ? `<button class="btn btn-danger btn-sm" onclick="updateSetting('salesSettings', 'paymentReminder.qrCode', '')">Remove</button>` : ''}
                    </div>
                </div>
            </div>
            
            <div class="settings-actions">
                <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>
            </div>
        </div>
    `;
}

window.handleSalesLogoUpload = function(type, input) {
    const file = input.files[0];
    if (!file) return;
    
    if (file.size > 1024 * 1024) {
        alert('Image too large (max 1MB)');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64 = e.target.result;
        updateSetting('salesSettings', `${type}.logo`, base64);
        renderSettings(); // Re-render to show image
    };
    reader.readAsDataURL(file);
};

window.handleSalesQRCodeUpload = function(input) {
    const file = input.files[0];
    if (!file) return;
    
    if (file.size > 1024 * 1024) {
        alert('Image too large (max 1MB)');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64 = e.target.result;
        updateSetting('salesSettings', 'paymentReminder.qrCode', base64);
        renderSettings(); // Re-render to show image
    };
    reader.readAsDataURL(file);
};

// Sales Settings Implementation

function renderSalesSettings(settings) {
    // Ensure defaults
    if (!settings.receipt) settings.receipt = { 
        logo: '', 
        remark: 'Make-up Lesson Arrangements:\n- All make-up class quotas must be used within two months.\n- Sessions cannot be postponed under any circumstances.\n- Classes canceled by Typhoon/Rainstorm will be arranged via Zoom or face-to-face.\n- Must apply for leave at least 2 hours before class.' 
    };
    if (!settings.paymentReminder) settings.paymentReminder = { 
        logo: '', 
        remark: 'Make-up Lesson Arrangements:\n- All make-up class quotas must be used within two months.\n- Sessions cannot be postponed under any circumstances.\n- Classes canceled by Typhoon/Rainstorm will be arranged via Zoom or face-to-face.\n- Must apply for leave at least 2 hours before class.', 
        paymentMethod: '', 
        qrCode: '' 
    };
    if (!settings.whatsapp) settings.whatsapp = {
        enabled: false,
        provider: 'meta_cloud',
        accessToken: '',
        phoneNumberId: '',
        wabaId: '',
        templateName: ''
    };
    
    const receipt = settings.receipt;
    const reminder = settings.paymentReminder;
    const wa = settings.whatsapp;
    
    return `
        <div class="settings-category">
            <h3>📊 Sales Settings</h3>
            <div class="category-description">Configure receipt and payment reminder templates</div>
            
            <!-- Receipt Settings (Collapsible) -->
            <div class="settings-group" style="border:1px solid #e0e0e0; border-radius:8px; overflow:hidden; margin-bottom:20px;">
                <div onclick="toggleSettingsSection('receiptSettingsContent')" style="padding:15px; background:#f8f9fa; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-weight:bold;">
                    <span>🧾 Receipt Settings</span>
                    <span>▼</span>
                </div>
                <div id="receiptSettingsContent" style="padding:15px; display:none;">
                    <div class="settings-group">
                        <label>Receipt Logo</label>
                        <div style="display:flex; align-items:center; gap:15px; flex-wrap:wrap;">
                            <div style="width:100px; height:100px; border:1px dashed #ccc; display:flex; align-items:center; justify-content:center; background:#f9f9f9; overflow:hidden;">
                                ${receipt.logo ? `<img src="${receipt.logo}" style="max-width:100%; max-height:100%;">` : '<span style="color:#999; font-size:12px;">No Logo</span>'}
                            </div>
                            <div style="flex:1;">
                                <input type="file" accept="image/*" onchange="handleSalesImageUpload('receipt', 'logo', this)" style="margin-bottom:5px;">
                                <div class="help-text">Recommended size: 200x200px (PNG/JPG)</div>
                                ${receipt.logo ? `<button class="btn btn-danger btn-sm" onclick="updateSetting('salesSettings', 'receipt.logo', '')" style="margin-top:5px;">Remove Logo</button>` : ''}
                            </div>
                        </div>
                    </div>
                    
                    <div class="settings-group">
                        <label>Remark (Footer Text)</label>
                        <textarea style="width:100%; height:120px; padding:10px; border:1px solid #ddd; border-radius:4px; font-family:inherit;" onchange="updateSetting('salesSettings', 'receipt.remark', this.value)">${receipt.remark || ''}</textarea>
                    </div>
                </div>
            </div>
            
            <!-- Payment Reminder Settings (Collapsible) -->
            <div class="settings-group" style="border:1px solid #e0e0e0; border-radius:8px; overflow:hidden;">
                <div onclick="toggleSettingsSection('reminderSettingsContent')" style="padding:15px; background:#f8f9fa; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-weight:bold;">
                    <span>🔔 Payment Reminder Settings</span>
                    <span>▼</span>
                </div>
                <div id="reminderSettingsContent" style="padding:15px; display:none;">
                    <div class="settings-group">
                        <label>Reminder Logo</label>
                        <div style="display:flex; align-items:center; gap:15px; flex-wrap:wrap;">
                            <div style="width:100px; height:100px; border:1px dashed #ccc; display:flex; align-items:center; justify-content:center; background:#f9f9f9; overflow:hidden;">
                                ${reminder.logo ? `<img src="${reminder.logo}" style="max-width:100%; max-height:100%;">` : '<span style="color:#999; font-size:12px;">No Logo</span>'}
                            </div>
                            <div style="flex:1;">
                                <input type="file" accept="image/*" onchange="handleSalesImageUpload('paymentReminder', 'logo', this)" style="margin-bottom:5px;">
                                <div class="help-text">Recommended size: 200x200px (PNG/JPG)</div>
                                ${reminder.logo ? `<button class="btn btn-danger btn-sm" onclick="updateSetting('salesSettings', 'paymentReminder.logo', '')" style="margin-top:5px;">Remove Logo</button>` : ''}
                            </div>
                        </div>
                    </div>
                    
                    <div class="settings-group">
                        <label>Payment Method Information</label>
                        <textarea style="width:100%; height:100px; padding:10px; border:1px solid #ddd; border-radius:4px; font-family:inherit;" placeholder="Bank Account, FPS ID, PayMe Link, etc." onchange="updateSetting('salesSettings', 'paymentReminder.paymentMethod', this.value)">${reminder.paymentMethod || ''}</textarea>
                    </div>

                    <div class="settings-group">
                        <label>Payment QR Code</label>
                        <div style="display:flex; align-items:center; gap:15px; flex-wrap:wrap;">
                            <div style="width:120px; height:120px; border:1px dashed #ccc; display:flex; align-items:center; justify-content:center; background:#f9f9f9; overflow:hidden;">
                                ${reminder.qrCode ? `<img src="${reminder.qrCode}" style="max-width:100%; max-height:100%;">` : '<span style="color:#999; font-size:12px;">No QR Code</span>'}
                            </div>
                            <div style="flex:1;">
                                <input type="file" accept="image/*" onchange="handleSalesImageUpload('paymentReminder', 'qrCode', this)" style="margin-bottom:5px;">
                                <div class="help-text">Upload Payment QR Code (FPS/PayMe)</div>
                                ${reminder.qrCode ? `<button class="btn btn-danger btn-sm" onclick="updateSetting('salesSettings', 'paymentReminder.qrCode', '')" style="margin-top:5px;">Remove QR Code</button>` : ''}
                            </div>
                        </div>
                    </div>

                    <div class="settings-group">
                        <label>Remark (Footer Text)</label>
                        <textarea style="width:100%; height:120px; padding:10px; border:1px solid #ddd; border-radius:4px; font-family:inherit;" onchange="updateSetting('salesSettings', 'paymentReminder.remark', this.value)">${reminder.remark || ''}</textarea>
                    </div>
                </div>
            </div>

            <!-- WhatsApp Business API (Collapsible) -->
            <div class="settings-group" style="border:1px solid #e0e0e0; border-radius:8px; overflow:hidden; margin-top:20px;">
                <div onclick="toggleSettingsSection('whatsappSettingsContent')" style="padding:15px; background:#f8f9fa; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-weight:bold;">
                    <span>💬 WhatsApp Business API</span>
                    <span>▼</span>
                </div>
                <div id="whatsappSettingsContent" style="padding:15px; display:none;">
                    <div class="settings-group">
                        <label style="display:flex; align-items:center; gap:10px;">
                            <input type="checkbox" ${wa.enabled ? 'checked' : ''} onchange="updateSetting('salesSettings', 'whatsapp.enabled', this.checked)">
                            Enable WhatsApp notifications
                        </label>
                        <div class="help-text">This is used for automation (payment reminders / renewals). Requires Meta WhatsApp Business Cloud API setup.</div>
                    </div>

                    <div class="settings-group">
                        <label>Access Token</label>
                        <input type="password" value="${escapeHtml(wa.accessToken || '')}" placeholder="EAAG... (Meta token)" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px;" onchange="updateSetting('salesSettings', 'whatsapp.accessToken', this.value)">
                        <div class="help-text">Store securely. Anyone with this token can send messages from your WhatsApp Business number.</div>
                    </div>

                    <div class="form-row" style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div class="settings-group">
                            <label>Phone Number ID</label>
                            <input type="text" value="${escapeHtml(wa.phoneNumberId || '')}" placeholder="e.g. 123456789012345" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px;" onchange="updateSetting('salesSettings', 'whatsapp.phoneNumberId', this.value)">
                        </div>
                        <div class="settings-group">
                            <label>WABA ID</label>
                            <input type="text" value="${escapeHtml(wa.wabaId || '')}" placeholder="WhatsApp Business Account ID" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px;" onchange="updateSetting('salesSettings', 'whatsapp.wabaId', this.value)">
                        </div>
                    </div>

                    <div class="settings-group">
                        <label>Template Name (optional)</label>
                        <input type="text" value="${escapeHtml(wa.templateName || '')}" placeholder="e.g. payment_reminder_v1" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px;" onchange="updateSetting('salesSettings', 'whatsapp.templateName', this.value)">
                        <div class="help-text">Cloud API production sending usually requires approved message templates.</div>
                    </div>
                </div>
            </div>

            <div class="settings-actions" style="margin-top:20px;">
                <button class="btn btn-primary" onclick="saveSettings()">Save All Settings</button>
            </div>
        </div>
    `;
}

window.toggleSettingsSection = function(id) {
    const el = document.getElementById(id);
    if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
};

window.handleSalesImageUpload = function(category, field, input) {
    const file = input.files[0];
    if (!file) return;
    
    // Validate size (max 500KB for logos/QR)
    if (file.size > 500 * 1024) {
        alert('Image too large (max 500KB)');
        input.value = ''; // clear input
        return;
    }
