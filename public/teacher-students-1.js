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
