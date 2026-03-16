// Render students list
function renderStudents() {
    const container = document.getElementById('studentsList');
    if (!container) return;
    
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    const filteredStudents = students.filter(student =>
        String(student.name || '').toLowerCase().includes(searchTerm) ||
        String(student.chessComId || '').toLowerCase().includes(searchTerm)
    );

    if (filteredStudents.length === 0) {
        if (searchTerm) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 40px;">No students found matching your search.</p>';
        } else {
            container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 40px;">No students available. Please contact your organization administrator to add students.</p>';
        }
        return;
    }

    container.innerHTML = filteredStudents.map(student => {
        const rankInfo = getRankInfo(student.score || 0);
        // Always use calculated rank to ensure accuracy
        const currentRank = rankInfo.rank;
        const currentRankIndex = rankInfo.rankIndex;
        
        // Escape student data for safe usage in onclick
        const safeStudent = JSON.stringify(student).replace(/"/g, '&quot;');

        const badgeSrc = levelBadgeSrcByRankIndex(currentRankIndex);
        const scoreVal = (student.score || 0);

        return `
        <div class="student-card" data-rank="${currentRankIndex}" data-student-id="${student.id}" onclick='openEditStudentProfile(${safeStudent})'>
            <div class="student-score-pill" aria-label="Score">${escapeHtml(String(scoreVal))}</div>
            <h3>${escapeHtml(student.name)}</h3>
            <div class="student-id">chess.com ID: ${escapeHtml(student.chessComId || '')}</div>
            <div class="rank-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${rankInfo.progress}%"></div>
                </div>
                <div class="progress-text">${Math.round(rankInfo.progress)}% to ${rankInfo.nextRank || 'Max'}</div>
            </div>
            <div class="student-stats">
                <div class="stat-item">
                    ${badgeSrc ? `<img class="level-badge" src="${badgeSrc}" alt="${escapeHtml(currentRank)} badge" onerror="console.warn('[level-badge] failed', this.src); this.remove();">` : ''}
                </div>
            </div>
            <div class="student-actions" onclick="event.stopPropagation()">
                <input type="number" class="points-input" id="points-${student.id}" min="1" max="100" value="1" style="width: 60px; padding: 6px; text-align: center; border: 2px solid rgba(255,255,255,0.3); border-radius: 6px; background: rgba(255,255,255,0.2); color: white; font-weight: bold;">
                <button class="btn btn-success btn-small" onclick="recordPoints('${student.id}')">
                    Add
                </button>
                <button class="btn btn-primary btn-small" onclick="updateStudentScore('${student.id}')" title="Modify Score">
                    Edit
                </button>
                <button class="btn btn-info btn-small" onclick="openShareModal('${student.id}')" title="Share Access">
                    🔗
                </button>
            </div>
        </div>
    `;
    }).join('');
}

// Add new student (only if form exists - teachers cannot add students)
document.getElementById('addStudentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('studentName').value.trim();
    const studentId = document.getElementById('studentId').value.trim();

    if (!name || !studentId) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    try {
        const response = await apiFetch('/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, studentId })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add student');
        }

        const student = await response.json();
        document.getElementById('addStudentForm')?.reset();
        showNotification(`Student ${student.name} added successfully!`, 'success');
        loadStudents();
    } catch (error) {
        showNotification(error.message, 'error');
    }
});

// Record points instead of correct/incorrect
async function recordPoints(studentId, points) {
    if (!points) {
        const input = document.getElementById(`points-${studentId}`);
        if (!input) {
            showNotification('Please enter points', 'error');
            return;
        }
        points = parseInt(input.value, 10) || 1;
    } else {
        // Ensure points is a number
        points = parseInt(points, 10);
    }

    if (isNaN(points) || points < 1 || points > 100) {
        showNotification('Points must be between 1 and 100', 'error');
        return;
    }

    // Find student card for animation
    const studentCard = document.querySelector(`.student-card[data-student-id="${studentId}"]`);
    const button = document.querySelector(`button[onclick*="${studentId}"]`);
    const buttonRect = button ? button.getBoundingClientRect() : null;

    // Debug logging
    console.log(`[DEBUG] Sending points: ${points} (type: ${typeof points}) to student ${studentId}`);

    try {
        const response = await apiFetch(`/students/${studentId}/answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: points }) // Explicitly send as number
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to record points');
        }

        const result = await response.json();
        const student = result.student || result;
        
        // Show points popup animation
        if (buttonRect) {
            showPointsPopup(buttonRect, points);
        }
        
        // Flash student card
        if (studentCard) {
            studentCard.classList.add('card-flash');
            setTimeout(() => studentCard.classList.remove('card-flash'), 500);
        }
        
        // Show particle effect for high points
        if (points >= 10 && buttonRect) {
            createParticleEffect(buttonRect, points);
        }
        
        console.log(`[DEBUG] Received updated student: ${student.name}, score: ${student.score}`);
        showNotification(`${student.name} earned +${points} points!`, 'success');
        loadStudents();
    } catch (error) {
        console.error('[DEBUG] Error recording points:', error);
        showNotification('Failed to record points: ' + error.message, 'error');
    }
}

// Delete student
async function deleteStudent(studentId) {
    if (!confirm('Are you sure you want to delete this student?')) {
        return;
    }

    try {
        const response = await apiFetch(`/students/${studentId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to delete student');
        }

        showNotification('Student deleted successfully', 'success');
        loadStudents();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Update student score directly
async function updateStudentScore(studentId) {
    if (currentUser && currentUser.role === 'teacher') {
        if (!currentUser.teacherPermissions || !currentUser.teacherPermissions.editScore) {
            showNotification('Insufficient permissions: You are not allowed to edit scores.', 'error');
            return;
        }
    }

    const student = students.find(s => s.id === studentId);
    if (!student) {
        showNotification('Student not found', 'error');
        return;
    }

    const newScore = prompt(`Enter new score for ${student.name}:`, student.score || 0);
    if (newScore === null) return; // User cancelled

    const score = parseInt(newScore, 10);
    if (isNaN(score) || score < 0) {
        showNotification('Please enter a valid score (0 or greater)', 'error');
        return;
    }

    try {
        const response = await apiFetch(`/students/${studentId}`, {
            method: 'PUT',
            body: JSON.stringify({ score })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to update score');
        }

        showNotification('Score updated successfully!', 'success');
        loadStudents();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Reset all scores
document.getElementById('resetBtn')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset ALL scores? This cannot be undone.')) {
        return;
    }

    try {
        const response = await apiFetch('/reset', {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('Failed to reset scores');
        }

        showNotification('All scores have been reset', 'success');
        loadStudents();
    } catch (error) {
        showNotification('Failed to reset scores', 'error');
    }
});

// Search functionality
document.getElementById('searchInput').addEventListener('input', renderStudents);

// =========================
// Chess.com Settings Modal
// =========================
const CHESS_COM_SETTINGS_KEY = 'teacherChessComSettings_v1';
let chessComSettingsSyncTimer = null;

async function fetchChessComSettingsFromServer() {
    try {
        const resp = await apiFetch('/teachers/chesscom/settings');
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data || data.ok !== true) return null;
        return data.settings && typeof data.settings === 'object' ? data.settings : {};
    } catch (e) {
        return null;
    }
}

async function pushChessComSettingsToServer(settingsObj) {
    try {
        const resp = await apiFetch('/teachers/chesscom/settings', {
            method: 'PUT',
            body: JSON.stringify({ settings: settingsObj })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            console.warn('Chess.com settings server save failed:', { status: resp.status, data });
            return { ok: false, status: resp.status, data };
        }
        return { ok: true, status: resp.status, data };
    } catch (e) {
        return { ok: false, status: 0, data: { error: String(e?.message || e) } };
    }
}

function scheduleChessComSettingsSync() {
    if (chessComSettingsSyncTimer) clearTimeout(chessComSettingsSyncTimer);
    chessComSettingsSyncTimer = setTimeout(async () => {
        chessComSettingsSyncTimer = null;
        const settings = loadChessComSettings();
        await pushChessComSettingsToServer(settings);
    }, 500);
}

function buildFullChessComSettingsSnapshot() {
    const local = loadChessComSettings();
    const all = Array.isArray(students) ? students : [];
    const out = {};
    for (const s of all) {
        const sid = s && (s.id != null) ? String(s.id) : '';
        if (!sid) continue;
        const entry = local[sid] || {};
        const chessId = (entry.chessId != null ? String(entry.chessId) : getDefaultChessComId(s)).trim();
        if (!chessId) continue;
        out[sid] = { chessId };
    }
    return out;
}

function loadChessComSettings() {
    try {
        const raw = localStorage.getItem(CHESS_COM_SETTINGS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
}

function saveChessComSettings(data) {
    try {
        localStorage.setItem(CHESS_COM_SETTINGS_KEY, JSON.stringify(data));
    } catch (e) {
        // ignore
    }
}

function getDefaultChessComId(student) {
    // Default: use the student's chess.com ID; fallback to internal system id for safety.
    return (student && (student.chessComId || student.id)) ? String(student.chessComId || student.id) : '';
}

async function openChessComSettingsModal() {
    const modal = document.getElementById('chessComSettingsModal');
    if (!modal) return;
    modal.classList.add('show');
    const search = document.getElementById('chessComSettingsSearch');
    if (search) search.value = '';

    // Hydrate local cache from server (server is the source of truth, especially across devices).
    try {
        const serverSettings = await fetchChessComSettingsFromServer();
        if (serverSettings && typeof serverSettings === 'object') {
            const local = loadChessComSettings();
            // Server wins to avoid stale localStorage overwriting newer server values.
            const merged = { ...(local || {}), ...(serverSettings || {}) };
            saveChessComSettings(merged);
        }
    } catch (e) {
        // ignore
    }

    renderChessComSettingsList();
    if (search) search.focus();
}

function closeChessComSettingsModal() {
    const modal = document.getElementById('chessComSettingsModal');
    if (!modal) return;
    modal.classList.remove('show');
}

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

window.copyShareLink = function() {
    const input = document.getElementById('shareLinkInput');
    input.select();
    document.execCommand('copy');
    showNotification('Link copied!', 'success');
};

window.copyShareInfo = function() {
    const link = document.getElementById('shareLinkInput').value;
    const enabled = document.getElementById('enablePasswordToggle').checked;
    const password = document.getElementById('accessPassword').value;
    
    let text = `Student Link: ${link}`;
    if (enabled && password) {
        text += `\nStudent Password: ${password}`;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Link & Password copied!', 'success');
    }).catch(err => {
        console.error('Copy failed', err);
        showNotification('Copy failed', 'error');
    });
};

document.getElementById('shareModalClose')?.addEventListener('click', closeShareModal);

// ==================== Create Student Modal Functions ====================

function openCreateStudentModal() {
    const modal = document.getElementById('teacherCreateStudentModal');
    if (modal) {
        modal.classList.add('show');
        document.getElementById('teacherCreateStudentForm')?.reset();
    }
}

function closeCreateStudentModal() {
    const modal = document.getElementById('teacherCreateStudentModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

async function submitCreateStudent(event) {
    event.preventDefault();
    
    const name = document.getElementById('teacherCreateStudentName').value.trim();
    const chessComId = document.getElementById('teacherCreateStudentId').value.trim();
    
    if (!name || !chessComId) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    try {
        const response = await apiFetch('/organizations/students', {
            method: 'POST',
            body: JSON.stringify({ name, chessComId })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to create student');
        }
        
        const newStudent = await response.json();
        
        showNotification('Student ' + newStudent.name + ' created and assigned!', 'success');
        closeCreateStudentModal();
        
        // Reload students to show the new one
        loadStudents();
    } catch (error) {
        console.error('Create student error:', error);
        showNotification(error.message, 'error');
    }
}

// Make globally available
window.openCreateStudentModal = openCreateStudentModal;
window.closeCreateStudentModal = closeCreateStudentModal;
window.submitCreateStudent = submitCreateStudent;

// Inline Create Student (below Students List)
function focusCreateStudentInline() {
    try {
        const card = document.getElementById('teacherCreateStudentInlineCard');
        const nameEl = document.getElementById('teacherCreateStudentNameInline');
        if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (nameEl && nameEl.focus) nameEl.focus({ preventScroll: true });
    } catch (e) {}
}

async function submitCreateStudentInline(event) {
    event.preventDefault();

    const name = document.getElementById('teacherCreateStudentNameInline')?.value?.trim?.() || '';
    const chessComId = document.getElementById('teacherCreateStudentIdInline')?.value?.trim?.() || '';
    const msgEl = document.getElementById('teacherCreateStudentInlineMsg');
    if (msgEl) msgEl.textContent = '';

    if (!name || !chessComId) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    try {
        const response = await apiFetch('/organizations/students', {
            method: 'POST',
            body: JSON.stringify({ name, chessComId })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to create student');
        }

        const newStudent = await response.json();
        showNotification('Student ' + newStudent.name + ' created and assigned!', 'success');
        if (msgEl) msgEl.textContent = 'Created.';

        document.getElementById('teacherCreateStudentInlineForm')?.reset();
        loadStudents();
    } catch (error) {
        console.error('Create student error:', error);
        showNotification(error.message, 'error');
        if (msgEl) msgEl.textContent = error.message || 'Error';
    }
}

window.focusCreateStudentInline = focusCreateStudentInline;
window.submitCreateStudentInline = submitCreateStudentInline;



// ==================== Edit Student Profile Functions ====================

async function openEditStudentProfile(student) {
    if (!currentUser) {
        try {
            const resp = await apiFetch('/auth/me');
            if (resp.ok) currentUser = await resp.json();
        } catch(e) {}
    }

    if (currentUser && currentUser.role === 'teacher') {
        if (!currentUser.teacherPermissions || !currentUser.teacherPermissions.editStudentProfile) {
            showNotification('Insufficient permissions: You are not allowed to edit student profiles.', 'error');
            return;
        }
    }

    const modal = document.getElementById('editStudentModal');
    if (!modal) return;

    document.getElementById('editStudentId_Hidden').value = student.id;
    const sysIdEl = document.getElementById('editStudentSystemId');
    if (sysIdEl) sysIdEl.value = String(student.id || '');
    document.getElementById('editStudentName').value = student.name || '';
    document.getElementById('editStudentStudentId').value = student.chessComId || '';
    const localNameEl = document.getElementById('editStudentLocalName');
    if (localNameEl) localNameEl.value = student.localName || '';
    document.getElementById('editStudentGender').value = student.gender || '';
    
    let dob = student.dateOfBirth || '';
    if (dob.includes('-')) {
        try {
            const d = new Date(dob);
            if (!isNaN(d.getTime())) {
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                dob = `${day}/${month}/${year}`;
            }
        } catch(e) {}
    }
    document.getElementById('editStudentDOB').value = dob;

    // Phone: store digits in contactPhone; countryCode in contactPhoneCountryCode
    const ccEl = document.getElementById('editStudentPhoneCountryCode');
    const phoneEl = document.getElementById('editStudentPhone');
    if (ccEl) ccEl.value = String(student.contactPhoneCountryCode || '+852');
    if (phoneEl) phoneEl.value = String(student.contactPhone || '');
    document.getElementById('editStudentEmail').value = student.contactEmail || '';
    document.getElementById('editStudentEmergName').value = student.emergencyContactName || '';
    document.getElementById('editStudentEmergRel').value = student.emergencyContactRelation || '';
    document.getElementById('editStudentEmergPhone').value = student.emergencyContactNumber || '';

    modal.classList.add('show');
}

function closeEditStudentProfile() {
    const modal = document.getElementById('editStudentModal');
    if (modal) modal.classList.remove('show');
}

async function saveStudentProfile(event) {
    event.preventDefault();
    
    const id = document.getElementById('editStudentId_Hidden').value;
    if (!id) return;

    const updateData = {
        name: document.getElementById('editStudentName').value.trim(),
        chessComId: document.getElementById('editStudentStudentId').value.trim(),
        localName: document.getElementById('editStudentLocalName')?.value?.trim?.() || '',
        gender: document.getElementById('editStudentGender').value,
        dateOfBirth: document.getElementById('editStudentDOB').value.trim(),
        contactPhone: String(document.getElementById('editStudentPhone')?.value || '').replace(/[^\d]/g, '').trim(),
        contactPhoneCountryCode: String(document.getElementById('editStudentPhoneCountryCode')?.value || '+852').trim(),
        contactPhoneCountry: String(document.getElementById('editStudentPhoneCountryCode')?.selectedOptions?.[0]?.dataset?.country || 'HK'),
        contactEmail: document.getElementById('editStudentEmail').value.trim(),
        emergencyContactName: document.getElementById('editStudentEmergName').value.trim(),
        emergencyContactRelation: document.getElementById('editStudentEmergRel').value,
        emergencyContactNumber: document.getElementById('editStudentEmergPhone').value.trim()
    };

    try {
        const response = await apiFetch(`/students/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to update student profile');
        }

        showNotification('Student profile updated successfully!', 'success');
        closeEditStudentProfile();
        loadStudents(); 
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

window.openEditStudentProfile = openEditStudentProfile;
window.closeEditStudentProfile = closeEditStudentProfile;
window.saveStudentProfile = saveStudentProfile;

// Delete from Edit Student Profile modal (bottom-left)
window.deleteStudentFromProfile = function() {
    const id = document.getElementById('editStudentId_Hidden')?.value;
    if (!id) return;
    // Reuse existing delete logic + confirmation prompt.
    return deleteStudent(String(id));
};
