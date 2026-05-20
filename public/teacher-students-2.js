function renderChessComSettingsList() {
    const listEl = document.getElementById('chessComSettingsList');
    const countEl = document.getElementById('chessComSettingsCount');
    if (!listEl) return;

    const searchTerm = (document.getElementById('chessComSettingsSearch')?.value || '').toLowerCase().trim();
    const settings = loadChessComSettings();

    const filtered = (students || []).filter(s => {
        if (!searchTerm) return true;
        const name = String(s.name || '').toLowerCase();
        const sid = String(s.chessComId || '').toLowerCase();
        const existing = settings[s.id] || {};
        const chessId = String(existing.chessId || '').toLowerCase();
        return name.includes(searchTerm) || sid.includes(searchTerm) || chessId.includes(searchTerm);
    });

    if (countEl) countEl.textContent = String(filtered.length);

    if (!filtered.length) {
        listEl.innerHTML = '<div style="color:#6b7280; padding:10px; text-align:center;">No matching students.</div>';
        return;
    }

    listEl.innerHTML = filtered.map(s => {
        const entry = settings[s.id] || {};
        const chessId = entry.chessId != null ? String(entry.chessId) : getDefaultChessComId(s);
        const password = entry.password != null ? String(entry.password) : '';
        return `
            <div style="background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
                    <div>
                        <div style="font-weight:800; color:#111827;">${escapeHtml(s.name || 'Unknown')}</div>
                        <div style="color:#6b7280; font-size:0.9rem;">chess.com ID: ${escapeHtml(s.chessComId || '')}</div>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
                    <div>
                        <label style="display:block; font-size:0.85rem; color:#4b5563; margin-bottom:6px;">Chess.com ID</label>
                        <input
                            type="text"
                            class="chesscom-input"
                            data-student-id="${escapeHtml(s.id)}"
                            data-field="chessId"
                            value="${escapeHtml(chessId)}"
                            style="width:100%; padding:10px; border:1px solid #e5e7eb; border-radius:10px;"
                        />
                    </div>
                    <div>
                        <label style="display:block; font-size:0.85rem; color:#4b5563; margin-bottom:6px;">Chess.com Password</label>
                        <div style="position:relative;">
                            <input
                                type="password"
                                class="chesscom-input"
                                data-student-id="${escapeHtml(s.id)}"
                                data-field="password"
                                value="${escapeHtml(password)}"
                                placeholder="Teacher input"
                                style="width:100%; padding:10px 44px 10px 10px; border:1px solid #e5e7eb; border-radius:10px;"
                            />
                            <button
                                type="button"
                                class="chesscom-toggle-password"
                                data-student-id="${escapeHtml(s.id)}"
                                title="Show/Hide password"
                                aria-label="Toggle password visibility"
                                style="position:absolute; right:10px; top:50%; transform:translateY(-50%); border:1px solid #e5e7eb; background:#f8fafc; border-radius:10px; width:32px; height:32px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#475569;"
                            >👁</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Event wiring
document.getElementById('chessComSettingsModalClose')?.addEventListener('click', closeChessComSettingsModal);
document.getElementById('chessComSettingsCloseBtn')?.addEventListener('click', closeChessComSettingsModal);
document.getElementById('chessComSettingsSaveBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('chessComSettingsSaveBtn');
    if (btn) btn.disabled = true;
    try {
        // Save should persist ALL students (including defaults shown in UI),
        // not only the ones the teacher manually edited.
        const full = buildFullChessComSettingsSnapshot();

        // Keep local storage in sync (preserve passwords while ensuring chessId is present for all).
        try {
            const local = loadChessComSettings();
            const mergedLocal = { ...(local || {}) };
            for (const [sid, v] of Object.entries(full)) {
                if (!mergedLocal[sid]) mergedLocal[sid] = {};
                mergedLocal[sid].chessId = v.chessId;
            }
            saveChessComSettings(mergedLocal);
        } catch (e) {
            // ignore
        }

        const out = await pushChessComSettingsToServer(full);
        if (out.ok) {
            const c = Number(out?.data?.count || 0);
            const orgId = out?.data?.orgId ? String(out.data.orgId) : '';
            showNotification(`Chess.com settings saved to server. (${c} students)${orgId ? ` · org=${orgId}` : ''}`, 'success');
        } else {
            showNotification(`Failed to save Chess.com settings to server. (HTTP ${out.status || 0})`, 'error');
        }
    } catch (e) {
        console.error('Chess.com settings save failed:', e);
        showNotification('Failed to save Chess.com settings to server.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
});
document.getElementById('chessComSettingsSearch')?.addEventListener('input', renderChessComSettingsList);
document.getElementById('chessComSettingsModal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'chessComSettingsModal') {
        closeChessComSettingsModal();
    }
});

document.getElementById('chessComSettingsList')?.addEventListener('input', (e) => {
    const target = e.target;
    if (!target || !target.classList || !target.classList.contains('chesscom-input')) return;
    const studentId = target.getAttribute('data-student-id');
    const field = target.getAttribute('data-field');
    if (!studentId || !field) return;

    const settings = loadChessComSettings();
    if (!settings[studentId]) settings[studentId] = {};
    settings[studentId][field] = target.value;
    saveChessComSettings(settings);
    scheduleChessComSettingsSync();
});

document.getElementById('chessComSettingsList')?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('.chesscom-toggle-password');
    if (!btn) return;
    const studentId = btn.getAttribute('data-student-id');
    if (!studentId) return;
    const input = document.querySelector(`#chessComSettingsList input.chesscom-input[data-student-id="${CSS.escape(studentId)}"][data-field="password"]`);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁' : '🙈';
});


// Share Access Functions
let currentShareStudentId = null;
let currentShareDestination = 'dashboard';
let currentShareStudentPublicLinkBase = '';
let currentShareDestinationGroup = 'dashboard'; // 'dashboard' | 'application'

// Shareable Application destinations (single source of truth for both link builder + UI).
// Add a new entry here (and the student must support openStudentGame(openGame)).
const SHARE_APP_DEST_ORDER = [
    'game_vChessPlatform',
    'game_chessCom',
    'game_runningQueen',
    'game_royalExchange',
    'game_hopeMate',
    'game_tacticsFighter',
    'game_mazeRunner',
    'game_chessLight',
    'game_chessSolitaire',
    'game_blunders'
];

const SHARE_APP_DEST_MAP = {
    game_vChessPlatform: { label: 'V.Chess Platform', openGame: 'vChessPlatform' },
    game_chessCom: { label: 'Chess.com', openGame: 'chessCom' },
    game_runningQueen: { label: 'Running Queen', openGame: 'runningQueen' },
    game_royalExchange: { label: 'Royal Exchange', openGame: 'royalExchange' },
    game_hopeMate: { label: 'Hope Mate', openGame: 'hopeMate' },
    game_tacticsFighter: { label: 'Tactics Fighter', openGame: 'tacticsFighter' },
    game_mazeRunner: { label: 'Maze Runner', openGame: 'mazeRunner' },
    game_chessLight: { label: 'Chess Light', openGame: 'chessLight' },
    game_chessSolitaire: { label: 'Chess Solitaire', openGame: 'chessSolitaire' },
    game_blunders: { label: 'Blunders', openGame: 'blunders' }
};

function buildStudentPublicLink(baseLink, destination) {
    try {
        const url = new URL(baseLink, window.location.origin);
        if (destination === 'dashboard') {
            return url.toString();
        }
        const cfg = SHARE_APP_DEST_MAP[String(destination || '')];
        if (cfg && cfg.openGame) {
            url.searchParams.set('openTab', 'game');
            url.searchParams.set('openGame', String(cfg.openGame));
            url.searchParams.set('autoStart', '1');
            return url.toString();
        }
        return url.toString();
    } catch (e) {
        return baseLink;
    }
}

function updateShareLinkInput() {
    const input = document.getElementById('shareLinkInput');
    if (!input || !currentShareStudentPublicLinkBase) return;
    input.value = buildStudentPublicLink(currentShareStudentPublicLinkBase, currentShareDestination);
}

function initShareDestinationTabs() {
    const container = document.getElementById('shareDestinationTabs');
    if (!container) return;
    if (container.dataset.initialized === '1') return;
    container.dataset.initialized = '1';

    const appOptions = document.getElementById('shareApplicationOptions');
    const appSearchInput = document.getElementById('shareAppSearchInput');
    const appSelect = document.getElementById('shareAppSelect');

    const setPrimaryActive = (destKey) => {
        container.querySelectorAll('.share-dest-tab').forEach(b => b.classList.remove('btn-info'));
        container.querySelectorAll('.share-dest-tab').forEach(b => b.classList.add('btn-secondary'));
        const btn = container.querySelector(`[data-share-dest="${CSS.escape(String(destKey || 'dashboard'))}"]`);
        if (btn) {
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-info');
        }
    };

    const setAppActive = (destKey) => {
        if (!appSelect) return;
        const v = String(destKey || '');
        appSelect.value = v;
    };

    const showAppOptions = (show) => {
        if (!appOptions) return;
        appOptions.style.display = show ? 'block' : 'none';
    };

    const getShareAppEntries = () => {
        const keys = SHARE_APP_DEST_ORDER.filter(k => !!SHARE_APP_DEST_MAP[k]);
        return keys.map((k) => ({ key: k, label: String(SHARE_APP_DEST_MAP[k]?.label || k) }));
    };

    const rebuildSelect = (query) => {
        if (!appSelect) return;
        const q = String(query || '').trim().toLowerCase();
        const entries = getShareAppEntries().filter((e) => {
            if (!q) return true;
            return String(e.label || '').toLowerCase().includes(q) || String(e.key || '').toLowerCase().includes(q);
        });
        const keep = String(appSelect.value || '');
        appSelect.innerHTML = `<option value="">Select an application...</option>` + entries
            .map((e) => `<option value="${escapeHtml(e.key)}">${escapeHtml(e.label)}</option>`)
            .join('');
        if (keep) appSelect.value = keep;
    };

    container.querySelectorAll('.share-dest-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const dest = String(btn.getAttribute('data-share-dest') || 'dashboard');
            if (dest === 'dashboard') {
                currentShareDestinationGroup = 'dashboard';
                currentShareDestination = 'dashboard';
                showAppOptions(false);
                setPrimaryActive('dashboard');
                updateShareLinkInput();
                return;
            }
            if (dest === 'application') {
                currentShareDestinationGroup = 'application';
                showAppOptions(true);
                setPrimaryActive('application');
                // Do NOT change the link until a sub-option is picked.
                if (currentShareDestination !== 'dashboard') setAppActive(currentShareDestination);
                return;
            }
        });
    });

    // Build Application options into a searchable select.
    if (appSelect && appSelect.dataset.built !== '1') {
        appSelect.dataset.built = '1';
        rebuildSelect('');
        appSelect.addEventListener('change', () => {
            const dest = String(appSelect.value || '');
            if (!dest) return; // keep link unchanged until chosen
            currentShareDestinationGroup = 'application';
            currentShareDestination = dest;
            showAppOptions(true);
            setPrimaryActive('application');
            setAppActive(dest);
            updateShareLinkInput();
        });
    }
    if (appSearchInput && appSearchInput.dataset.bound !== '1') {
        appSearchInput.dataset.bound = '1';
        appSearchInput.addEventListener('input', () => rebuildSelect(appSearchInput.value));
    }
}

window.openShareModal = function(studentId) {
    currentShareStudentId = studentId;
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    
    const modal = document.getElementById('shareAccessModal');
    if (modal) {
        modal.classList.add('show');

        // Initialize destination tabs + default selection
        initShareDestinationTabs();
        currentShareDestination = 'dashboard';
        currentShareDestinationGroup = 'dashboard';
        const tabs = document.getElementById('shareDestinationTabs');
        if (tabs) {
            tabs.querySelectorAll('.share-dest-tab').forEach(b => b.classList.remove('btn-info'));
            tabs.querySelectorAll('.share-dest-tab').forEach(b => b.classList.add('btn-secondary'));
            const defaultBtn = tabs.querySelector('[data-share-dest="dashboard"]');
            if (defaultBtn) {
                defaultBtn.classList.remove('btn-secondary');
                defaultBtn.classList.add('btn-info');
            }
        }
        const appOptions = document.getElementById('shareApplicationOptions');
        const appSearchInput = document.getElementById('shareAppSearchInput');
        const appSelect = document.getElementById('shareAppSelect');
        if (appOptions) {
            appOptions.style.display = 'none';
            if (appSearchInput) appSearchInput.value = '';
            if (appSelect) appSelect.value = '';
        }
        
        // Set Link
        const link = `${window.location.origin}/student.html?id=${student.id}`;
        currentShareStudentPublicLinkBase = link;
        updateShareLinkInput();
        
        // Set Password State
        const hasPassword = !!student.accessPassword;
        const toggle = document.getElementById('enablePasswordToggle');
        const pwdInput = document.getElementById('accessPassword');
        const saveBtn = document.querySelector('#passwordGroup button');

        toggle.checked = hasPassword;
        pwdInput.value = student.accessPassword || '';
        togglePasswordInput();

        // Check Permissions
        let canEditPwd = true;
        if (currentUser && currentUser.role === 'teacher') {
            if (!currentUser.teacherPermissions || !currentUser.teacherPermissions.editSharePwd) {
                canEditPwd = false;
            }
        }

        if (!canEditPwd) {
            toggle.disabled = true;
            pwdInput.disabled = true;
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.style.opacity = '0.5';
                saveBtn.style.cursor = 'not-allowed';
                saveBtn.title = 'Insufficient permissions';
            }
            // Add visual cue
            toggle.parentElement.title = 'Insufficient permissions to change password settings';
        } else {
            toggle.disabled = false;
            pwdInput.disabled = false;
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.style.opacity = '1';
                saveBtn.style.cursor = 'pointer';
                saveBtn.title = '';
            }
            toggle.parentElement.title = '';
        }
    }
};

window.closeShareModal = function() {
    const modal = document.getElementById('shareAccessModal');
    if (modal) modal.classList.remove('show');
    currentShareStudentId = null;
};

window.togglePasswordInput = function() {
    const enabled = document.getElementById('enablePasswordToggle').checked;
    document.getElementById('passwordGroup').style.display = enabled ? 'block' : 'none';

    // If password protection is turned off, auto-clear (and persist) the password
    // so the teacher doesn't need to click "Save Password".
    if (!enabled) {
        const pwdInput = document.getElementById('accessPassword');
        const hadPassword = !!(pwdInput && pwdInput.value && pwdInput.value.trim());
        if (pwdInput) pwdInput.value = '';
        // Only call API when we are actually turning off an existing password
        if (hadPassword && typeof window.saveAccessPassword === 'function') {
            window.saveAccessPassword();
        }
    }
};

window.saveAccessPassword = async function() {
    if (!currentShareStudentId) return;

    // Double check permission before saving
    if (currentUser && currentUser.role === 'teacher') {
        if (!currentUser.teacherPermissions || !currentUser.teacherPermissions.editSharePwd) {
            showNotification('Insufficient permissions: You are not allowed to edit share password.', 'error');
            return;
        }
    }

    const enabled = document.getElementById('enablePasswordToggle').checked;
    const password = document.getElementById('accessPassword').value.trim();
    
    // If enabled but no password, error
    if (enabled && !password) {
        showNotification('Please enter a password', 'error');
        return;
    }
    
    try {
        const updateData = {
            accessPassword: enabled ? password : '' // Send empty string to clear
        };
        
        const response = await apiFetch(`/students/${currentShareStudentId}`, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });
        
        if (response.ok) {
            showNotification('Access settings saved!', 'success');
            // Update local student data
            const student = students.find(s => s.id === currentShareStudentId);
            if (student) student.accessPassword = updateData.accessPassword;
        } else {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to save');
        }
    } catch (error) {
        showNotification(error.message || 'Error saving password', 'error');
    }
};
