    
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64 = e.target.result;
        updateSetting('salesSettings', `${category}.${field}`, base64);
        renderSettings(); // Re-render to show preview
        // Re-open the section
        setTimeout(() => {
            const sectionId = category === 'receipt' ? 'receiptSettingsContent' : 'reminderSettingsContent';
            const el = document.getElementById(sectionId);
            if (el) el.style.display = 'block';
        }, 50);
    };
    reader.readAsDataURL(file);
};

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
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64 = e.target.result;
        updateSetting('salesSettings', `${category}.${field}`, base64);
        renderSettings(); // Re-render to show preview
        // Re-open the section
        setTimeout(() => {
            const sectionId = category === 'receipt' ? 'receiptSettingsContent' : 'reminderSettingsContent';
            const el = document.getElementById(sectionId);
            if (el) el.style.display = 'block';
        }, 50);
    };
    reader.readAsDataURL(file);
};



