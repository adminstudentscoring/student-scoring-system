// API_BASE is defined in auth.js, use window.authUtils.authenticatedFetch instead
let students = [];
let ws = null;
let wsRetryCount = 0;
let wsRetryTimer = null;
let wsPollingTimer = null;
let wsDisabled = false;
let selectedClassStudentIds = new Set();
let currentUser = null;
let currentClassEntry = null;
let currentClassStudents = [];

// Helper function for authenticated API requests
async function apiFetch(url, options = {}) {
    if (typeof window.authUtils !== 'undefined' && window.authUtils.authenticatedFetch) {
        return await window.authUtils.authenticatedFetch(url, options);
    } else {
        return await fetch(`/api${url}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
    }
}

// Initialize WebSocket connection
function initWebSocket() {
    if (wsDisabled) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };

    ws.onopen = () => {
        // Connected: stop any fallback polling and reset retry state
        wsRetryCount = 0;
        if (wsRetryTimer) {
            clearTimeout(wsRetryTimer);
            wsRetryTimer = null;
        }
        if (wsPollingTimer) {
            clearInterval(wsPollingTimer);
            wsPollingTimer = null;
        }
    };

    ws.onerror = (error) => {
        // Avoid noisy console spam in production when websocket isn't available
        console.warn('WebSocket error:', error);
    };

    ws.onclose = () => {
        if (wsDisabled) return;

        // Retry with backoff; if still failing, fall back to polling to keep UI usable.
        wsRetryCount += 1;

        const MAX_RETRIES = 3;
        if (wsRetryCount > MAX_RETRIES) {
            wsDisabled = true;
            console.warn('WebSocket unavailable. Falling back to polling.');
            startWebSocketFallbackPolling();
            return;
        }

        const delayMs = Math.min(15000, 1500 * Math.pow(2, wsRetryCount - 1)); // 1.5s, 3s, 6s
        if (wsRetryTimer) clearTimeout(wsRetryTimer);
        wsRetryTimer = setTimeout(initWebSocket, delayMs);
    };
}

function startWebSocketFallbackPolling() {
    if (wsPollingTimer) return;
    // Poll for updates (keeps Start Class & lists usable even without WS)
    wsPollingTimer = setInterval(() => {
        loadStudents();
    }, 8000);
}

// Handle WebSocket messages
function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'studentAdded':
        case 'studentUpdated':
        case 'answerRecorded':
            loadStudents();
            break;
        case 'studentDeleted':
            loadStudents();
            break;
        case 'reset':
            loadStudents();
            showNotification('All scores have been reset', 'success');
            break;
    }
}

// Load all students
async function loadStudents() {
    try {
        const response = await apiFetch('/students');
        if (!response) return; // Auth failed, will redirect
        
        const data = await response.json();
        students = Array.isArray(data) ? data : (data.students || []);
        window.students = students; // Make available globally for timetable
        renderStudents();
        renderClassStudentsList();
        // Update game zone student list if modal is open
        if (document.getElementById('gameZoneModal')?.classList.contains('show')) {
            loadGameStudents();
        }
        
        // Load teacher's class view selection
        await loadClassViewSelection();
    } catch (error) {
        console.error('Error loading students:', error);
        showNotification('Failed to load students', 'error');
    }
}

// Load teacher's class view selection
async function loadClassViewSelection() {
    try {
        const response = await apiFetch('/teachers/class-view/students');
        if (response && response.ok) {
            const data = await response.json();
            selectedClassStudentIds = new Set(data.selectedStudentIds || []);
            updateSelectedCount();
            renderClassStudentsList();
        }
    } catch (error) {
        console.warn('Could not load class view selection:', error);
    }
}

// Get rank info (matching server logic)
function getRankInfo(score) {
    const RANKS = [
        { name: 'Wood', maxScore: 50 },
        { name: 'Bronze', maxScore: 50 * 2 },
        { name: 'Silver', maxScore: 50 * Math.pow(2, 2) },
        { name: 'Gold', maxScore: 50 * Math.pow(2, 3) },
        { name: 'Platinum', maxScore: 50 * Math.pow(2, 4) },
        { name: 'Diamond', maxScore: 50 * Math.pow(2, 5) },
        { name: 'Candidate Master', maxScore: 50 * Math.pow(2, 6) },
        { name: 'Master', maxScore: 50 * Math.pow(2, 7) },
        { name: 'International Master', maxScore: 50 * Math.pow(2, 8) },
        { name: 'Grand Master', maxScore: Infinity }
    ];

    for (let i = 0; i < RANKS.length; i++) {
        if (score <= RANKS[i].maxScore) {
            const currentRank = RANKS[i];
            const prevRank = i > 0 ? RANKS[i - 1] : { maxScore: 0 };
            const progress = i === 0 
                ? (score / currentRank.maxScore) * 100
                : ((score - prevRank.maxScore) / (currentRank.maxScore - prevRank.maxScore)) * 100;
            const nextRank = i < RANKS.length - 1 ? RANKS[i + 1] : null;
            
            return {
                rank: currentRank.name,
                rankIndex: i,
                currentScore: score,
                minScore: i === 0 ? 0 : prevRank.maxScore,
                maxScore: currentRank.maxScore,
                progress: Math.min(100, Math.max(0, progress)),
                nextRank: nextRank ? nextRank.name : null,
                scoreToNext: nextRank ? nextRank.maxScore - score : 0
            };
        }
    }
    return {
        rank: 'Grand Master',
        rankIndex: RANKS.length - 1,
        currentScore: score,
        minScore: RANKS[RANKS.length - 2].maxScore,
        maxScore: Infinity,
        progress: 100,
        nextRank: null,
        scoreToNext: 0
    };
}

// Render students list
function renderStudents() {
    const container = document.getElementById('studentsList');
    if (!container) return;
    
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    const filteredStudents = students.filter(student =>
        student.name.toLowerCase().includes(searchTerm) ||
        student.studentId.toLowerCase().includes(searchTerm)
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

        return `
        <div class="student-card" data-rank="${currentRankIndex}" data-student-id="${student.id}" onclick='openEditStudentProfile(${safeStudent})'>
            <h3>${escapeHtml(student.name)}</h3>
            <div class="student-id">ID: ${escapeHtml(student.studentId)}</div>
            <div class="rank-badge rank-${currentRankIndex}">${currentRank}</div>
            <div class="rank-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${rankInfo.progress}%"></div>
                </div>
                <div class="progress-text">${Math.round(rankInfo.progress)}% to ${rankInfo.nextRank || 'Max'}</div>
            </div>
            <div class="student-stats">
                <div class="stat-item">
                    <span class="stat-value">${student.answerCount || 0}</span>
                    <span class="stat-label">Answers</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${student.score || 0}</span>
                    <span class="stat-label">Score</span>
                </div>
            </div>
            <div class="student-actions" onclick="event.stopPropagation()">
                <input type="number" class="points-input" id="points-${student.id}" min="1" max="100" value="1" style="width: 60px; padding: 6px; text-align: center; border: 2px solid rgba(255,255,255,0.3); border-radius: 6px; background: rgba(255,255,255,0.2); color: white; font-weight: bold;">
                <button class="btn btn-success btn-small" onclick="recordPoints('${student.id}')">
                    Add Points
                </button>
                <button class="btn btn-primary btn-small" onclick="updateStudentScore('${student.id}')" title="Modify Score">
                    Edit Score
                </button>
                <button class="btn btn-info btn-small" onclick="openShareModal('${student.id}')" title="Share Access">
                    🔗 Share
                </button>
                <button class="btn btn-danger btn-small" onclick="deleteStudent('${student.id}')">
                    Delete
                </button>
            </div>
        </div>
    `;
    }).join('');
}

// Render class students list with checkboxes
function renderClassStudentsList() {
    const container = document.getElementById('classStudentsList');
    const searchTerm = document.getElementById('classSearchInput')?.value.toLowerCase() || '';
    
    const filteredStudents = students.filter(student =>
        student.name.toLowerCase().includes(searchTerm) ||
        student.studentId.toLowerCase().includes(searchTerm)
    );

    if (filteredStudents.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">No students found.</p>';
        updateSelectedCount();
        return;
    }

    container.innerHTML = filteredStudents.map(student => {
        const isChecked = selectedClassStudentIds.has(student.id);
        return `
            <label class="class-student-checkbox">
                <input type="checkbox" 
                       value="${student.id}" 
                       ${isChecked ? 'checked' : ''} 
                       onchange="toggleStudentSelection('${student.id}')">
                <span>${escapeHtml(student.name)} (${escapeHtml(student.studentId)})</span>
            </label>
        `;
    }).join('');
    
    updateSelectedCount();
}

// Toggle student selection (using selectedClassStudentIds Set)
function toggleStudentSelection(studentId) {
    if (selectedClassStudentIds.has(studentId)) {
        selectedClassStudentIds.delete(studentId);
    } else {
        selectedClassStudentIds.add(studentId);
    }
    
    updateSelectedCount();
    renderClassStudentsList();
}

// Clear all class selections
async function clearClassSelections() {
    const previous = localStorage.getItem('selectedStudentIds') || '[]';
    localStorage.setItem('selectedStudentIds', JSON.stringify([]));
    renderClassStudentsList();
    updateSelectedCount();
    
    // Update selected students on server
    try {
        await apiFetch('/challenge/selected-students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selectedStudentIds: [] })
        });
    } catch (error) {
        console.error('Error updating selected students on server:', error);
    }
    
    window.dispatchEvent(new StorageEvent('storage', {
        key: 'selectedStudentIds',
        oldValue: previous,
        newValue: JSON.stringify([])
    }));
    showNotification('Class selection cleared', 'info');
}

// Clear all class selections (using selectedClassStudentIds Set)
function clearClassSelection() {
    selectedClassStudentIds.clear();
    renderClassStudentsList();
    updateSelectedCount();
    showNotification('Class selection cleared', 'info');
}

// Save Class View selection
async function saveClassViewSelection() {
    try {
        const selectedIds = Array.from(selectedClassStudentIds);
        const response = await apiFetch('/teachers/class-view/students', {
            method: 'POST',
            body: JSON.stringify({ studentIds: selectedIds })
        });

        if (!response) return;

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save');
        }

        showNotification('Class View selection saved successfully!', 'success');
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

// Update selected count display
function updateSelectedCount() {
    const count = selectedClassStudentIds.size;
    const countElement = document.getElementById('selectedCount');
    if (countElement) {
        countElement.textContent = `${count} selected`;
    }
}

// Open class view window
function openClassView() {
    const selectedIds = Array.from(selectedClassStudentIds);
    
    if (selectedIds.length === 0) {
        showNotification('Please select at least one student first', 'error');
        return;
    }
    
    // Check if running in Electron
    if (window.navigator.userAgent.indexOf('Electron') !== -1) {
        // Use IPC to open window in Electron
        if (window.electronAPI && window.electronAPI.openClassView) {
            window.electronAPI.openClassView();
        } else {
            // Fallback to window.open if IPC not available
            window.open('class-view.html', 'classView', 'width=350,height=800,resizable=yes');
        }
    } else {
        // Browser environment - use window.open
        const classWindow = window.open(
            'class-view.html',
            'classView',
            'width=350,height=800,resizable=yes,scrollbars=yes,alwaysRaised=yes'
        );
        
        if (!classWindow) {
            showNotification('Please allow popups for this site to open the class view', 'error');
            return;
        }
        
        // Try to set window properties (browser-dependent)
        try {
            classWindow.resizeTo(350, 800);
        } catch (e) {
            // Ignore errors if we can't resize
        }
    }
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

// Class search functionality
document.getElementById('classSearchInput').addEventListener('input', renderClassStudentsList);

// Class search functionality
document.getElementById('classSearchInput')?.addEventListener('input', renderClassStudentsList);

// Clear class selection button
document.getElementById('clearClassSelectionBtn')?.addEventListener('click', clearClassSelection);

// Open class view button
document.getElementById('openClassViewBtn')?.addEventListener('click', openClassView);
document.getElementById('saveClassViewBtn')?.addEventListener('click', saveClassViewSelection);

// Student view button (if exists)
document.getElementById('viewStudentBtn')?.addEventListener('click', () => {
    window.open('student.html', '_blank');
});

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make functions available globally
window.toggleStudentSelection = toggleStudentSelection;
window.openClassView = openClassView;

// Save/Load Progress Functions
// Generate time options (08:00 - 22:00, 30-minute intervals)
function generateTimeOptions() {
    const timeSelect = document.getElementById('saveTime');
    if (!timeSelect) return;
    
    timeSelect.innerHTML = '<option value="">Select time...</option>';
    
    for (let hour = 8; hour <= 22; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
            if (hour === 22 && minute > 0) break; // Stop at 22:00
            
            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            const option = document.createElement('option');
            option.value = timeStr;
            option.textContent = timeStr;
            timeSelect.appendChild(option);
        }
    }
}

// Initialize time options when page loads
document.addEventListener('DOMContentLoaded', async () => {
    generateTimeOptions();
    
    // Load teacher name
    try {
        if (typeof window.authUtils !== 'undefined') {
            const response = await window.authUtils.authenticatedFetch('/auth/me');
            if (response && response.ok) {
                const user = await response.json();
                currentUser = user;
                const teacherNameEl = document.getElementById('teacherName');
                if (teacherNameEl) {
                    teacherNameEl.textContent = user.name || user.email || 'Teacher';
                }
            }
        }
    } catch (error) {
        console.error('Error loading teacher info:', error);
    }
    
    // Initialize WebSocket
    initWebSocket();
    
    // Load students
    await loadStudents();
    
    // Start checking for current class
    checkCurrentClass();
    setInterval(checkCurrentClass, 60000);
});

// Modal functions
function openSaveModal() {
    const modal = document.getElementById('saveModal');
    if (modal) {
        modal.classList.add('show');
        document.getElementById('saveDay').value = '';
        document.getElementById('saveTime').value = '';
    }
}

function closeSaveModal() {
    const modal = document.getElementById('saveModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function openLoadModal() {
    const modal = document.getElementById('loadModal');
    if (modal) {
        modal.classList.add('show');
        loadSavesList();
    }
}

function closeLoadModal() {
    const modal = document.getElementById('loadModal');
    if (modal) {
        modal.classList.remove('show');
        document.getElementById('saveSearchInput').value = '';
    }
}

// Save progress
async function saveProgress() {
    const day = document.getElementById('saveDay').value;
    const time = document.getElementById('saveTime').value;
    
    if (!day || !time) {
        showNotification('Please select both day and time', 'error');
        return;
    }
    
    try {
        const response = await apiFetch('/challenge/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ day, time })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to save progress');
        }
        
        const result = await response.json();
        showNotification(result.message || 'Progress saved successfully!', 'success');
        closeSaveModal();
    } catch (error) {
        showNotification('Failed to save progress: ' + error.message, 'error');
    }
}

// Load saves list
async function loadSavesList() {
    try {
        const response = await apiFetch('/challenge/saves');
        if (!response.ok) {
            throw new Error('Failed to load saves');
        }
        
        const saves = await response.json();
        renderSavesList(saves);
    } catch (error) {
        console.error('Error loading saves:', error);
        showNotification('Failed to load saves list', 'error');
    }
}

// Render saves list
function renderSavesList(saves) {
    const recentSavesList = document.getElementById('recentSavesList');
    const allSavesList = document.getElementById('allSavesList');
    
    if (!recentSavesList || !allSavesList) return;
    
    // Get recent saves (last 5)
    const recentSaves = saves.slice(0, 5);
    const allSaves = saves;
    
    // Render recent saves
    if (recentSaves.length === 0) {
        recentSavesList.innerHTML = '<div class="no-saves">No recent saves</div>';
    } else {
        recentSavesList.innerHTML = recentSaves.map(save => createSaveItemHTML(save)).join('');
    }
    
    // Render all saves
    if (allSaves.length === 0) {
        allSavesList.innerHTML = '<div class="no-saves">No saves found</div>';
    } else {
        allSavesList.innerHTML = allSaves.map(save => createSaveItemHTML(save)).join('');
    }
    
    // Add event listeners
    attachSaveItemListeners();
}

// Create save item HTML
function createSaveItemHTML(save) {
    const levelInfo = LEVELS.find(l => l.level === save.challenge.currentLevel) || LEVELS[0];
    const savedDate = new Date(save.savedAt);
    const dateStr = savedDate.toLocaleDateString() + ' ' + savedDate.toLocaleTimeString();
    
    return `
        <div class="save-item" data-filename="${escapeHtml(save.filename)}">
            <div class="save-item-info">
                <div class="save-item-header">
                    <span class="save-item-day">${escapeHtml(save.day)}</span>
                    <span class="save-item-time">${escapeHtml(save.time)}</span>
                    <span class="save-item-level">Level ${save.challenge.currentLevel}: ${levelInfo.name}</span>
                </div>
                <div class="save-item-details">
                    HP: ${save.challenge.currentHP} / ${levelInfo.maxHP} | Saved: ${dateStr}
                </div>
            </div>
            <div class="save-item-actions">
                <button class="save-item-btn load" onclick="loadProgress('${escapeHtml(save.filename)}')">Load</button>
                <button class="save-item-btn delete" onclick="deleteSave('${escapeHtml(save.filename)}')">Delete</button>
            </div>
        </div>
    `;
}

// Attach event listeners to save items
function attachSaveItemListeners() {
    // Search functionality
    const searchInput = document.getElementById('saveSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const items = document.querySelectorAll('.save-item');
            
            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                if (text.includes(searchTerm)) {
                    item.classList.remove('save-item-hidden');
                } else {
                    item.classList.add('save-item-hidden');
                }
            });
        });
    }
}

// Load progress
async function loadProgress(filename) {
    if (!confirm('Are you sure you want to load this save? Current challenge progress will be replaced.')) {
        return;
    }
    
    try {
        const response = await apiFetch('/challenge/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || 'Failed to load progress');
        }
        
        const result = await response.json();
        showNotification(`Progress loaded successfully! ${result.saveInfo.day} ${result.saveInfo.time}`, 'success');
        closeLoadModal();
        
        // Reload challenge data if in Class View
        if (window.loadChallenge) {
            window.loadChallenge();
        }
    } catch (error) {
        showNotification('Failed to load progress: ' + error.message, 'error');
    }
}

// Delete save
async function deleteSave(filename) {
    if (!confirm('Are you sure you want to delete this save?')) {
        return;
    }
    
    try {
        const response = await apiFetch(`/challenge/saves/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete save');
        }
        
        showNotification('Save deleted successfully', 'success');
        loadSavesList();
    } catch (error) {
        showNotification('Failed to delete save: ' + error.message, 'error');
    }
}

// Make functions globally available
window.loadProgress = loadProgress;
window.deleteSave = deleteSave;

// LEVELS constant (for save item display)
const LEVELS = [
    { level: 1, name: 'Slime', maxHP: 200, reward: 10, emoji: '🟢' },
    { level: 2, name: 'Goblin', maxHP: 400, reward: 20, emoji: '👺' },
    { level: 3, name: 'Orc', maxHP: 600, reward: 30, emoji: '👹' },
    { level: 4, name: 'Dragon', maxHP: 800, reward: 40, emoji: '🐉' },
    { level: 5, name: 'Demon', maxHP: 1000, reward: 50, emoji: '😈' },
    { level: 6, name: 'Boss Lv1', maxHP: 1200, reward: 60, emoji: '👑' },
    { level: 7, name: 'Boss Lv2', maxHP: 1500, reward: 75, emoji: '👑' },
    { level: 8, name: 'Boss Lv3', maxHP: 2000, reward: 100, emoji: '👑' },
    { level: 9, name: 'Boss Lv4', maxHP: 2500, reward: 125, emoji: '👑' },
    { level: 10, name: 'Final Boss', maxHP: 3000, reward: 150, emoji: '👑' }
];

// Event listeners
document.getElementById('saveBtn')?.addEventListener('click', openSaveModal);
document.getElementById('loadBtn')?.addEventListener('click', openLoadModal);
document.getElementById('saveModalClose')?.addEventListener('click', closeSaveModal);
document.getElementById('loadModalClose')?.addEventListener('click', closeLoadModal);
document.getElementById('confirmSaveBtn')?.addEventListener('click', saveProgress);
document.getElementById('cancelSaveBtn')?.addEventListener('click', closeSaveModal);

// Close modal when clicking outside
document.getElementById('saveModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'saveModal') {
        closeSaveModal();
    }
});

document.getElementById('loadModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'loadModal') {
        closeLoadModal();
    }
});

// Statistics Modal Functions
let currentPeriod = 'daily';

// Open Statistics Modal
function openStatisticsModal() {
    const modal = document.getElementById('statisticsModal');
    if (modal) {
        modal.classList.add('show');
        currentPeriod = 'daily';
        updatePeriodButtons();
        loadStatistics();
    }
}

// Close Statistics Modal
function closeStatisticsModal() {
    const modal = document.getElementById('statisticsModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Update period buttons
function updatePeriodButtons() {
    document.querySelectorAll('.period-btn').forEach(btn => {
        if (btn.dataset.period === currentPeriod) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Load statistics
async function loadStatistics() {
    try {
        // Ensure currentPeriod is clean (no trailing characters)
        let cleanPeriod = currentPeriod;
        if (typeof cleanPeriod === 'string') {
            cleanPeriod = cleanPeriod.split(':')[0].trim().toLowerCase();
        }
        
        // Validate period
        if (!['daily', 'weekly', 'monthly'].includes(cleanPeriod)) {
            console.warn(`Invalid period: ${cleanPeriod}, defaulting to daily`);
            cleanPeriod = 'daily';
            currentPeriod = 'daily';
        }
        
        console.log(`Loading statistics for period: ${cleanPeriod}`);
        
        // Load overview statistics
        const statsResponse = await apiFetch(`/statistics/${cleanPeriod}`);
        if (!statsResponse.ok) {
            const errorData = await statsResponse.json().catch(() => ({}));
            console.error('Stats response error:', errorData);
            throw new Error(errorData.error || `Failed to load statistics (${statsResponse.status})`);
        }
        const stats = await statsResponse.json();
        console.log('Stats loaded:', stats);
        
        // Update overview cards
        document.getElementById('totalAnswers').textContent = stats.totalAnswerCount || 0;
        document.getElementById('totalPoints').textContent = stats.totalPoints || 0;
        document.getElementById('avgAnswers').textContent = stats.averageAnswerCount || 0;
        document.getElementById('avgPoints').textContent = stats.averagePoints || 0;
        
        // Load active students
        const activeResponse = await apiFetch(`/statistics/active-students?period=${encodeURIComponent(cleanPeriod)}`);
        if (!activeResponse.ok) {
            const errorData = await activeResponse.json().catch(() => ({}));
            console.error('Active students response error:', errorData, 'Status:', activeResponse.status);
            throw new Error(errorData.error || `Failed to load active students (${activeResponse.status})`);
        }
        const activeData = await activeResponse.json();
        console.log('Active students loaded:', activeData);
        
        // Render active students leaderboard
        renderActiveStudents(activeData.students || []);
    } catch (error) {
        console.error('Error loading statistics:', error);
        showNotification(`Failed to load statistics: ${error.message}`, 'error');
        document.getElementById('activeStudentsList').innerHTML = `<div class="loading">Error loading data: ${error.message}</div>`;
    }
}

// Render active students leaderboard
function renderActiveStudents(students) {
    const container = document.getElementById('activeStudentsList');
    
    if (!students || students.length === 0) {
        container.innerHTML = '<div class="loading">No active students for this period</div>';
        return;
    }
    
    container.innerHTML = `
        <div class="leaderboard-header">
            <div>Rank</div>
            <div>Name</div>
            <div>Answers</div>
            <div>Points</div>
        </div>
        ${students.map(student => `
            <div class="leaderboard-row">
                <div class="leaderboard-rank">${student.rank}</div>
                <div class="leaderboard-name">${escapeHtml(student.name)}</div>
                <div class="leaderboard-answers">${student.answerCount}</div>
                <div class="leaderboard-points">${student.totalPoints}</div>
            </div>
        `).join('')}
    `;
}

// Event listeners for statistics
document.getElementById('statisticsBtn')?.addEventListener('click', openStatisticsModal);
document.getElementById('statisticsModalClose')?.addEventListener('click', closeStatisticsModal);
document.getElementById('closeStatisticsBtn')?.addEventListener('click', closeStatisticsModal);

// Period button event listeners
document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Get period value and clean it
        const periodValue = btn.getAttribute('data-period');
        currentPeriod = periodValue ? periodValue.trim() : 'daily';
        updatePeriodButtons();
        loadStatistics();
    });
});

// Close modal when clicking outside
document.getElementById('statisticsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'statisticsModal') {
        closeStatisticsModal();
    }
});

// Right Sidebar Functions
function initRightSidebar() {
    const sidebar = document.getElementById('rightSidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }
}

// Game Zone Modal Functions
let gameZoneModalSize = 'normal'; // 'normal', 'large', 'fullscreen'
let selectedGameStudents = [];
let applicationPickGameKey = null; // 'monsterFight'|'runningQueen'|'royalExchange'|'hopeMate'

function openGameZoneModal() {
    const modal = document.getElementById('gameZoneModal');
    if (modal) {
        modal.classList.add('show');
        loadGameStudents();
        showGameSelection();
    }
}

function openTeacherApplicationsTab() {
    try {
        const btn = document.getElementById('teacherApplicationsTabBtn');
        if (typeof window.switchTeacherTab === 'function') {
            window.switchTeacherTab('applications', btn || null);
            return true;
        }
    } catch {}
    return false;
}

function openVChessPlatformNewTab() {
    // Same behavior as Quick Action vChessPlatformBtn: always teacher role, open a new tab.
    try {
        localStorage.setItem('vChessPlatformRole', 'teacher');
        localStorage.setItem('vChessPlatformSelectedStudentIds', JSON.stringify([]));
        localStorage.removeItem('vChessPlatformAuthToken');
        localStorage.removeItem('vChessPlatformPlayer');
    } catch (e) {
        console.warn('Unable to persist vChessPlatform context to localStorage:', e);
    }

    const url = '/game/game-window.html?game=vChessPlatform&role=teacher';
    const win = window.open(url, '_blank');
    if (!win) {
        showNotification('Popup blocked. Opening V.Chess Platform in current tab...', 'warning');
        window.location.href = url;
        return;
    }
    showNotification('V.Chess Platform opened in a new tab', 'success');
}

window.openVChessPlatformNewTab = openVChessPlatformNewTab;

function openApplicationStudentPicker(gameKey) {
    applicationPickGameKey = String(gameKey || '');
    selectedGameStudents = [];
    const modal = document.getElementById('gameZoneModal');
    if (!modal) return;

    // Title
    const titleEl = document.getElementById('gameZoneModalTitle');
    const label =
        applicationPickGameKey === 'monsterFight' ? 'Monster Fight' :
        applicationPickGameKey === 'runningQueen' ? 'Running Queen' :
        applicationPickGameKey === 'royalExchange' ? 'Royal Exchange' :
        applicationPickGameKey === 'hopeMate' ? 'Hope Mate' : 'Application';
    if (titleEl) titleEl.textContent = `🎮 Application · ${label}`;

    // Hide game selection + game area; show student selection only
    const gs = document.getElementById('gameSelectionSection');
    const ss = document.getElementById('studentSelectionSection');
    const ga = document.getElementById('gameAreaSection');
    if (gs) gs.style.display = 'none';
    if (ga) ga.style.display = 'none';
    if (ss) ss.style.display = 'block';

    // Open modal and load students
    modal.classList.add('show');
    loadGameStudents();
}

window.openApplicationStudentPicker = openApplicationStudentPicker;

function openPuzzleMonsterFightAsMe() {
    if (!currentUser || !currentUser.id) {
        showNotification('Missing teacher identity. Please refresh and try again.', 'error');
        return;
    }
    const player = {
        id: String(currentUser.id),
        name: String(currentUser.name || currentUser.email || 'Teacher'),
        studentId: String(currentUser.teacherId || currentUser.id)
    };
    try {
        localStorage.setItem('puzzleMonsterFightPlayers', JSON.stringify([player]));
    } catch (error) {
        console.warn('Unable to persist puzzle monster fight players to localStorage:', error);
    }

    const gameUrl = '/game/puzzle-monster-fight/index.html';
    const gameWindow = window.open(gameUrl, 'PuzzleMonsterFight', 'width=1200,height=800,resizable=yes,scrollbars=yes');
    if (!gameWindow) {
        showNotification('Popup blocked. Opening in current window...', 'warning');
        window.location.href = gameUrl;
        return;
    }
    showNotification('Puzzle Monster Fight opened in new window', 'success');
}

window.openPuzzleMonsterFightAsMe = openPuzzleMonsterFightAsMe;

function openBlundersTeacherMode() {
    // Teacher mode Blunders: open in a new tab and render a dedicated teacher UI.
    const url = '/game/game-window.html?game=blunders&role=teacher';
    // Ensure Blunders teacher window can always access teacher auth, even if localStorage timing differs.
    try {
        const t = String(localStorage.getItem('authToken') || '').trim();
        if (t) localStorage.setItem('blundersTeacherAuthToken', t);
    } catch {}
    const win = window.open(url, '_blank');
    if (!win) {
        showNotification('Popup blocked. Opening Blunders in current tab...', 'warning');
        window.location.href = url;
        return;
    }
    showNotification('Blunders (teacher mode) opened in a new tab', 'success');
}

window.openBlundersTeacherMode = openBlundersTeacherMode;

async function confirmApplicationStudentPicker() {
    const key = String(applicationPickGameKey || '');
    if (!key) {
        showNotification('Missing game selection.', 'error');
        return;
    }
    if (key === 'hopeMate' && selectedGameStudents.length !== 1) {
        showNotification('Hope Mate supports exactly 1 student. Please select one student.', 'error');
        return;
    }
    if (key !== 'hopeMate' && selectedGameStudents.length === 0) {
        showNotification('Please select at least one student', 'error');
        return;
    }

    // Persist players for game-window based games
    const playerDetails = selectedGameStudents.map(id => {
        const student = students.find(s => s.id === id) || {};
        return { id, name: student.name || 'Unknown', studentId: student.studentId || '' };
    });

    try {
        if (key === 'runningQueen') localStorage.setItem('runningQueenPlayers', JSON.stringify(playerDetails));
        if (key === 'royalExchange') localStorage.setItem('royalExchangePlayers', JSON.stringify(playerDetails));
        if (key === 'hopeMate') localStorage.setItem('hopeMatePlayers', JSON.stringify(playerDetails));
    } catch (e) {
        console.warn('Unable to persist players to localStorage:', e);
    }

    // Launch
    if (key === 'monsterFight') {
        await startMonsterFight();
    } else if (key === 'runningQueen') {
        const url = '/game/game-window.html?game=runningQueen';
        const w = window.open(url, '_blank');
        if (!w) { showNotification('Popup blocked. Opening in current window...', 'warning'); window.location.href = url; }
        else showNotification('Running Queen opened in new tab', 'success');
    } else if (key === 'royalExchange') {
        const url = '/game/game-window.html?game=royalExchange';
        const w = window.open(url, '_blank');
        if (!w) { showNotification('Popup blocked. Opening in current window...', 'warning'); window.location.href = url; }
        else showNotification('Royal Exchange opened in new tab', 'success');
    } else if (key === 'hopeMate') {
        const url = '/game/game-window.html?game=hopeMate';
        const w = window.open(url, '_blank');
        if (!w) { showNotification('Popup blocked. Opening in current window...', 'warning'); window.location.href = url; }
        else showNotification('Hope Mate opened in new tab', 'success');
    }

    // Close modal
    closeGameZoneModal();
    applicationPickGameKey = null;
}

window.confirmApplicationStudentPicker = confirmApplicationStudentPicker;

function closeGameZoneModal() {
    const modal = document.getElementById('gameZoneModal');
    if (modal) {
        modal.classList.remove('show');
        // Restore default title & sections for legacy modal usage
        const titleEl = document.getElementById('gameZoneModalTitle');
        if (titleEl) titleEl.textContent = '🎮 Application';
        const gs = document.getElementById('gameSelectionSection');
        const ss = document.getElementById('studentSelectionSection');
        const ga = document.getElementById('gameAreaSection');
        if (gs) gs.style.display = 'block';
        if (ss) ss.style.display = 'block';
        if (ga) ga.style.display = 'none';
        applicationPickGameKey = null;
        showGameSelection();
    }
}

function toggleGameZoneSize() {
    const modalContent = document.getElementById('gameZoneModalContent');
    if (!modalContent) return;
    
    // Cycle through: normal -> large -> fullscreen -> normal
    if (gameZoneModalSize === 'normal') {
        gameZoneModalSize = 'large';
        modalContent.classList.remove('game-zone-fullscreen');
        modalContent.classList.add('game-zone-large');
    } else if (gameZoneModalSize === 'large') {
        gameZoneModalSize = 'fullscreen';
        modalContent.classList.remove('game-zone-large');
        modalContent.classList.add('game-zone-fullscreen');
    } else {
        gameZoneModalSize = 'normal';
        modalContent.classList.remove('game-zone-fullscreen', 'game-zone-large');
    }
}

function toggleGameZoneFullscreen() {
    const modalContent = document.getElementById('gameZoneModalContent');
    if (!modalContent) return;
    
    modalContent.classList.toggle('game-zone-fullscreen');
    if (modalContent.classList.contains('game-zone-fullscreen')) {
        gameZoneModalSize = 'fullscreen';
    } else {
        gameZoneModalSize = 'normal';
        modalContent.classList.remove('game-zone-large');
    }
}

function showGameSelection() {
    document.getElementById('gameSelectionSection').style.display = 'block';
    document.getElementById('studentSelectionSection').style.display = 'block';
    document.getElementById('gameAreaSection').style.display = 'none';
    
    // Load game list
    const gameList = document.getElementById('gameList');
    if (gameList) {
        gameList.innerHTML = `
            <div class="game-item" onclick="startVChessPlatform()">
                <div class="game-icon">🌐</div>
                <div class="game-info">
                    <h4>V.Chess Platform</h4>
                    <p>Teacher lobby for pairing students (coming soon)</p>
                </div>
            </div>
            <div class="game-item" onclick="openChessCom()">
                <div class="game-icon">♟️</div>
                <div class="game-info">
                    <h4>Chess.com</h4>
                    <p>Open chess.com (external link)</p>
                </div>
            </div>
            <div class="game-item" onclick="startMonsterFight()">
                <div class="game-icon">🐉</div>
                <div class="game-info">
                    <h4>Monster Fight</h4>
                    <p>Turn-based combat game with character selection</p>
                </div>
            </div>
            <div class="game-item" onclick="startRunningQueen()">
                <div class="game-icon">♕</div>
                <div class="game-info">
                    <h4>Running Queen</h4>
                    <p>Coordinate queens on a configurable chessboard</p>
                </div>
            </div>
            <div class="game-item" onclick="startRoyalExchange()">
                <div class="game-icon">♘</div>
                <div class="game-info">
                    <h4>Royal Exchange</h4>
                    <p>Swap chess pieces without breaking safety</p>
                </div>
            </div>
            <div class="game-item" onclick="startPuzzleMonsterFight()">
                <div class="game-icon">🧩</div>
                <div class="game-info">
                    <h4>Puzzle Monster Fight</h4>
                    <p>Knight-based jewel puzzle with elemental monsters</p>
                </div>
            </div>
            <div class="game-item" onclick="startNoBlunder()">
                <div class="game-icon">🛡️</div>
                <div class="game-info">
                    <h4>No Blunder</h4>
                    <p>New game (stub). Designed for rapid iteration.</p>
                </div>
            </div>
            <div class="game-item" onclick="startBlunders()">
                <div class="game-icon">💥</div>
                <div class="game-info">
                    <h4>Blunders</h4>
                    <p>New game (stub). Ready for development.</p>
                </div>
            </div>
            <div class="game-item" onclick="startHopeMate()">
                <div class="game-icon">✨</div>
                <div class="game-info">
                    <h4>Hope Mate</h4>
                    <p>New game (stub). Single-player training mode (coming soon).</p>
                </div>
            </div>
        `;
    }
}

function openChessCom() {
    const url = 'https://www.chess.com/';
    const win = window.open(url, 'ChessCom', 'noopener,noreferrer');
    if (!win) {
        showNotification('Popup blocked. Please allow popups to open Chess.com', 'error');
        return;
    }
    showNotification('Chess.com opened in new window', 'success');
}

window.openChessCom = openChessCom;

async function startMonsterFight() {
    if (selectedGameStudents.length === 0) {
        showNotification('Please select at least one student', 'error');
        return;
    }
    
    try {
        // Initialize game
        const response = await apiFetch('/game/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentIds: selectedGameStudents,
                levelConfig: [] // Will be configured in teacher settings
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to initialize game');
        }
        
        // 打開獨立專案的頁面
        // 使用伺服器提供的路徑訪問獨立專案
        const gameUrl = '/game/monster-fight/index.html';
        
        // 嘗試在新視窗中打開
        const gameWindow = window.open(
            gameUrl,
            'MonsterFight',
            'width=1400,height=900,resizable=yes,scrollbars=yes'
        );
        
        if (!gameWindow) {
            // 如果彈出視窗被阻止，顯示通知並嘗試在當前視窗打開
            showNotification('Popup blocked. Opening in current window...', 'warning');
            window.location.href = gameUrl;
        } else {
            showNotification('Monster Fight opened in new window', 'success');
        }
        
    } catch (error) {
        console.error('Error starting game:', error);
        showNotification('Failed to start game', 'error');
    }
}

window.startMonsterFight = startMonsterFight;

async function startRunningQueen() {
    if (selectedGameStudents.length === 0) {
        showNotification('Please select at least one student', 'error');
        return;
    }

    const playerDetails = selectedGameStudents.map(id => {
        const student = students.find(s => s.id === id) || {};
        return {
            id,
            name: student.name || 'Unknown',
            studentId: student.studentId || ''
        };
    });

    window.runningQueenPlayers = playerDetails;
    window.currentGameKey = 'runningQueen';
    try {
        localStorage.setItem('runningQueenPlayers', JSON.stringify(playerDetails));
    } catch (error) {
        console.warn('Unable to persist running queen players to localStorage:', error);
    }

    showGameArea();

    const gameAreaContent = document.getElementById('gameAreaContent');
    if (gameAreaContent) {
        gameAreaContent.innerHTML = `
            <div id="runningQueenGame" class="running-queen-root">
                <h2>♕ Running Queen</h2>
                <p>Loading game...</p>
            </div>
        `;

        const ensureScriptLoaded = () => {
            if (window.initRunningQueen) {
                window.initRunningQueen();
            } else {
                console.error('initRunningQueen function not found');
            }
        };

        if (!window.runningQueenLoaded) {
            const script = document.createElement('script');
            script.src = '/game/running-queen.js';
            script.onload = () => {
                window.runningQueenLoaded = true;
                ensureScriptLoaded();
            };
            script.onerror = (error) => {
                console.error('Error loading running-queen.js:', error);
                showNotification('Failed to load Running Queen scripts', 'error');
            };
            document.body.appendChild(script);
        } else {
            ensureScriptLoaded();
        }
    }
}

window.startRunningQueen = startRunningQueen;

async function startRoyalExchange() {
    if (selectedGameStudents.length === 0) {
        showNotification('Please select at least one student', 'error');
        return;
    }

    const playerDetails = selectedGameStudents.map(id => {
        const student = students.find(s => s.id === id) || {};
        return {
            id,
            name: student.name || 'Unknown',
            studentId: student.studentId || ''
        };
    });

    window.royalExchangePlayers = playerDetails;
    window.currentGameKey = 'royalExchange';
    try {
        localStorage.setItem('royalExchangePlayers', JSON.stringify(playerDetails));
    } catch (error) {
        console.warn('Unable to persist royal exchange players to localStorage:', error);
    }

    showGameArea();

    const gameAreaContent = document.getElementById('gameAreaContent');
    if (gameAreaContent) {
        gameAreaContent.innerHTML = `
            <div id="royalExchangeGame" class="royal-exchange-root">
                <h2>♘ Royal Exchange</h2>
                <p>Loading game...</p>
            </div>
        `;

        const ensureScriptLoaded = () => {
            if (window.initRoyalExchange) {
                window.initRoyalExchange();
            } else {
                console.error('initRoyalExchange function not found');
            }
        };

        if (!window.royalExchangeLoaded) {
            const script = document.createElement('script');
            script.src = '/game/royal-exchange.js';
            script.onload = () => {
                window.royalExchangeLoaded = true;
                ensureScriptLoaded();
            };
            script.onerror = (error) => {
                console.error('Error loading royal-exchange.js:', error);
                showNotification('Failed to load Royal Exchange scripts', 'error');
            };
            document.body.appendChild(script);
        } else {
            ensureScriptLoaded();
        }
    }
}

window.startRoyalExchange = startRoyalExchange;

async function startNoBlunder() {
    if (selectedGameStudents.length === 0) {
        showNotification('Please select at least one student', 'error');
        return;
    }

    const playerDetails = selectedGameStudents.map(id => {
        const student = students.find(s => s.id === id) || {};
        return {
            id,
            name: student.name || 'Unknown',
            studentId: student.studentId || ''
        };
    });

    window.noBlunderPlayers = playerDetails;
    window.currentGameKey = 'noBlunder';
    try {
        localStorage.setItem('noBlunderPlayers', JSON.stringify(playerDetails));
    } catch (error) {
        console.warn('Unable to persist no blunder players to localStorage:', error);
    }

    showGameArea();

    const gameAreaContent = document.getElementById('gameAreaContent');
    if (gameAreaContent) {
        gameAreaContent.innerHTML = `
            <div id="noBlunderRoot" class="no-blunder-root">
                <h2>🛡️ No Blunder</h2>
                <p>Loading game...</p>
            </div>
        `;

        // Ensure CSS is loaded (only once)
        if (!document.getElementById('noBlunderCss')) {
            const link = document.createElement('link');
            link.id = 'noBlunderCss';
            link.rel = 'stylesheet';
            link.href = '/game/no-blunder.css';
            document.head.appendChild(link);
        }

        const ensureScriptLoaded = () => {
            if (window.initNoBlunder) {
                window.initNoBlunder();
            } else {
                console.error('initNoBlunder function not found');
            }
        };

        if (!window.noBlunderLoaded) {
            const script = document.createElement('script');
            script.src = '/game/no-blunder.js';
            script.onload = () => {
                window.noBlunderLoaded = true;
                ensureScriptLoaded();
            };
            script.onerror = (error) => {
                console.error('Error loading no-blunder.js:', error);
                showNotification('Failed to load No Blunder scripts', 'error');
            };
            document.body.appendChild(script);
        } else {
            ensureScriptLoaded();
        }
    }
}

window.startNoBlunder = startNoBlunder;

async function startBlunders() {
    if (selectedGameStudents.length === 0) {
        showNotification('Please select at least one student', 'error');
        return;
    }

    const playerDetails = selectedGameStudents.map(id => {
        const student = students.find(s => s.id === id) || {};
        return {
            id,
            name: student.name || 'Unknown',
            studentId: student.studentId || ''
        };
    });

    window.blundersPlayers = playerDetails;
    window.currentGameKey = 'blunders';
    try {
        localStorage.setItem('blundersPlayers', JSON.stringify(playerDetails));
    } catch (error) {
        console.warn('Unable to persist blunders players to localStorage:', error);
    }

    showGameArea();

    const gameAreaContent = document.getElementById('gameAreaContent');
    if (gameAreaContent) {
        gameAreaContent.innerHTML = `
            <div id="blundersRoot" class="blunders-root">
                <h2>💥 Blunders</h2>
                <p>Loading game...</p>
            </div>
        `;

        // Ensure CSS is loaded (only once)
        if (!document.getElementById('blundersCss')) {
            const link = document.createElement('link');
            link.id = 'blundersCss';
            link.rel = 'stylesheet';
            link.href = '/game/blunders/blunders.css';
            document.head.appendChild(link);
        }

        const ensureScriptLoaded = () => {
            if (window.initBlunders) {
                window.initBlunders();
            } else {
                console.error('initBlunders function not found');
            }
        };

        if (!window.blundersLoaded) {
            const loadJs = (src) => new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src;
                s.onload = () => resolve();
                s.onerror = (e) => reject(e);
                document.body.appendChild(s);
            });
            loadJs('/game/blunders/core.js')
                .then(() => loadJs('/game/blunders/blunders.js'))
                .then(() => {
                    window.blundersLoaded = true;
                    ensureScriptLoaded();
                })
                .catch((error) => {
                    console.error('Error loading blunders scripts:', error);
                    showNotification('Failed to load Blunders scripts', 'error');
                });
        } else {
            ensureScriptLoaded();
        }
    }
}

window.startBlunders = startBlunders;

async function startHopeMate() {
    if (selectedGameStudents.length !== 1) {
        showNotification('Hope Mate currently supports exactly 1 student. Please select one student to start.', 'error');
        return;
    }

    const playerDetails = selectedGameStudents.map(id => {
        const student = students.find(s => s.id === id) || {};
        return {
            id,
            name: student.name || 'Unknown',
            studentId: student.studentId || ''
        };
    });

    window.hopeMatePlayers = playerDetails;
    window.currentGameKey = 'hopeMate';
    try {
        localStorage.setItem('hopeMatePlayers', JSON.stringify(playerDetails));
    } catch (error) {
        console.warn('Unable to persist Hope Mate players to localStorage:', error);
    }

    showGameArea();

    const gameAreaContent = document.getElementById('gameAreaContent');
    if (gameAreaContent) {
        gameAreaContent.innerHTML = `
            <div id="hopeMateRoot" class="hope-mate-root">
                <h2>✨ Hope Mate</h2>
                <p>Loading game...</p>
            </div>
        `;

        // Ensure CSS is loaded (only once)
        if (!document.getElementById('hopeMateCss')) {
            const link = document.createElement('link');
            link.id = 'hopeMateCss';
            link.rel = 'stylesheet';
            link.href = '/game/hope-mate.css';
            document.head.appendChild(link);
        }

        const ensureScriptLoaded = () => {
            if (window.initHopeMate) {
                window.initHopeMate();
            } else {
                console.error('initHopeMate function not found');
            }
        };

        if (!window.hopeMateLoaded) {
            const script = document.createElement('script');
            script.src = '/game/hope-mate.js';
            script.onload = () => {
                window.hopeMateLoaded = true;
                ensureScriptLoaded();
            };
            script.onerror = (error) => {
                console.error('Error loading hope-mate.js:', error);
                showNotification('Failed to load Hope Mate scripts', 'error');
            };
            document.body.appendChild(script);
        } else {
            ensureScriptLoaded();
        }
    }
}

window.startHopeMate = startHopeMate;

async function startVChessPlatform() {
    // Teacher entry: no student selection required (invites will be handled inside the platform later).
    try {
        localStorage.setItem('vChessPlatformRole', 'teacher');
        localStorage.setItem('vChessPlatformSelectedStudentIds', JSON.stringify(Array.isArray(selectedGameStudents) ? selectedGameStudents : []));
    } catch (e) {
        console.warn('Unable to persist vChessPlatform context to localStorage:', e);
    }

    showGameArea();
    const gameAreaContent = document.getElementById('gameAreaContent');
    if (!gameAreaContent) return;

    gameAreaContent.innerHTML = `
        <div id="vChessPlatformRoot" class="vchess-platform-root">
            <h2>🌐 V.Chess Platform</h2>
            <p>Loading platform...</p>
        </div>
    `;

    // Ensure CSS is loaded (only once)
    if (!document.getElementById('vChessPlatformCss')) {
        const link = document.createElement('link');
        link.id = 'vChessPlatformCss';
        link.rel = 'stylesheet';
        link.href = '/game/vchess-platform/vchess-platform.css';
        document.head.appendChild(link);
    }

    const ensureScriptLoaded = () => {
        if (window.initVChessPlatform) {
            window.initVChessPlatform();
        } else {
            console.error('initVChessPlatform function not found');
        }
    };

    if (!window.vChessPlatformLoaded) {
        const loadScript = (src) => new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => resolve();
            s.onerror = (e) => reject(e);
            document.body.appendChild(s);
        });
        loadScript('/game/vchess-platform/normal-chess.js')
            .then(() => loadScript('/game/vchess-platform/vchess-platform.js'))
            .then(() => {
                window.vChessPlatformLoaded = true;
                ensureScriptLoaded();
            })
            .catch((error) => {
                console.error('Error loading V.Chess Platform scripts:', error);
                showNotification('Failed to load V.Chess Platform scripts', 'error');
            });
    } else {
        ensureScriptLoaded();
    }
}

window.startVChessPlatform = startVChessPlatform;

async function startPuzzleMonsterFight() {
    if (selectedGameStudents.length === 0) {
        showNotification('Please select at least one student', 'error');
        return;
    }

    const playerDetails = selectedGameStudents.map(id => {
        const student = students.find(s => s.id === id) || {};
        return {
            id,
            name: student.name || 'Unknown',
            studentId: student.studentId || ''
        };
    });

    // 儲存玩家資料到 localStorage（供獨立遊戲使用）
    try {
        localStorage.setItem('puzzleMonsterFightPlayers', JSON.stringify(playerDetails));
    } catch (error) {
        console.warn('Unable to persist puzzle monster fight players to localStorage:', error);
    }

    // 打開獨立專案的頁面
    // 使用伺服器提供的路徑訪問獨立專案
    const gameUrl = '/game/puzzle-monster-fight/index.html';
    
    // 嘗試在新視窗中打開
    const gameWindow = window.open(
        gameUrl,
        'PuzzleMonsterFight',
        'width=1200,height=800,resizable=yes,scrollbars=yes'
    );
    
    if (!gameWindow) {
        // 如果彈出視窗被阻止，顯示通知並嘗試在當前視窗打開
        showNotification('Popup blocked. Opening in current window...', 'warning');
        window.location.href = gameUrl;
    } else {
        showNotification('Puzzle Monster Fight opened in new window', 'success');
    }
}

window.startPuzzleMonsterFight = startPuzzleMonsterFight;

function showGameArea() {
    document.getElementById('gameSelectionSection').style.display = 'none';
    document.getElementById('studentSelectionSection').style.display = 'none';
    document.getElementById('gameAreaSection').style.display = 'block';
}

function loadGameStudents() {
    const container = document.getElementById('gameStudentList');
    if (!container) return;
    
    const searchTerm = (document.getElementById('gameStudentSearch')?.value || '').toLowerCase();
    const filteredStudents = students.filter(student => 
        student.name.toLowerCase().includes(searchTerm) ||
        student.studentId.toLowerCase().includes(searchTerm)
    );
    
    container.innerHTML = filteredStudents.map(student => {
        const isSelected = selectedGameStudents.includes(student.id);
        return `
            <div class="student-selector-item ${isSelected ? 'selected' : ''}" data-student-id="${student.id}">
                <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleGameStudent('${student.id}')">
                <span>${escapeHtml(student.name)}</span>
                <span style="margin-left: auto; color: #999; font-size: 0.9rem;">${escapeHtml(student.studentId)}</span>
            </div>
        `;
    }).join('');
}

function toggleGameStudent(studentId) {
    const index = selectedGameStudents.indexOf(studentId);
    if (index > -1) {
        selectedGameStudents.splice(index, 1);
    } else {
        selectedGameStudents.push(studentId);
    }
    loadGameStudents(); // Refresh to update UI
}

function selectAllGameStudents() {
    selectedGameStudents = students.map(s => s.id);
    loadGameStudents();
}

function deselectAllGameStudents() {
    selectedGameStudents = [];
    loadGameStudents();
}

function openGameInNewWindow() {
    // Check if running in Electron
    const isElectron = window.navigator.userAgent.indexOf('Electron') !== -1;
    const gameKey = window.currentGameKey || 'monsterFight';
    const query = `game=${encodeURIComponent(gameKey)}`;
    
    if (isElectron) {
        // In Electron, use a special URL that will be handled by main.js
        const gameWindow = window.open(`http://localhost:3000/game/game-window.html?${query}`, 'gameWindow');
        if (!gameWindow) {
            showNotification('Please allow popups to open game in new window', 'error');
        }
    } else {
        // In browser, create a new window with the game content
        const gameWindow = window.open(`/game/game-window.html?${query}`, 'gameWindow', 'width=1200,height=800,alwaysOnTop=yes');
        if (!gameWindow) {
            showNotification('Please allow popups to open game in new window', 'error');
        }
    }
}

// Make functions globally available
window.toggleGameStudent = toggleGameStudent;

// Event listeners for Game Zone
document.getElementById('gameZoneBtn')?.addEventListener('click', () => {
    // "Application" in Quick Actions now jumps to the main Applications tab.
    const ok = openTeacherApplicationsTab();
    if (!ok) {
        // Fallback: open old modal if tab switch isn't available.
        openGameZoneModal();
    }
});
document.getElementById('vChessPlatformBtn')?.addEventListener('click', () => {
    // Quick Action entry: open V.Chess Platform directly in a new tab (no modal).
    try {
        localStorage.setItem('vChessPlatformRole', 'teacher');
        localStorage.setItem('vChessPlatformSelectedStudentIds', JSON.stringify([]));
        // Ensure teacher entry never reuses any leftover student VCP token/profile from other tabs.
        localStorage.removeItem('vChessPlatformAuthToken');
        localStorage.removeItem('vChessPlatformPlayer');
    } catch (e) {
        console.warn('Unable to persist vChessPlatform context to localStorage:', e);
    }

    const url = '/game/game-window.html?game=vChessPlatform&role=teacher';
    const win = window.open(url, '_blank');
    if (!win) {
        // Popup blocked: fall back to same tab.
        showNotification('Popup blocked. Opening V.Chess Platform in current tab...', 'warning');
        window.location.href = url;
        return;
    }
    showNotification('V.Chess Platform opened in a new tab', 'success');
});
document.getElementById('chessComSettingsBtn')?.addEventListener('click', openChessComSettingsModal);
document.getElementById('gameZoneModalClose')?.addEventListener('click', closeGameZoneModal);
document.getElementById('gameZoneSizeBtn')?.addEventListener('click', toggleGameZoneSize);
document.getElementById('gameZoneFullscreenBtn')?.addEventListener('click', toggleGameZoneFullscreen);
document.getElementById('backToGameSelection')?.addEventListener('click', showGameSelection);
document.getElementById('openGameInNewWindow')?.addEventListener('click', openGameInNewWindow);
document.getElementById('gameStudentSearch')?.addEventListener('input', loadGameStudents);
document.getElementById('selectAllStudents')?.addEventListener('click', selectAllGameStudents);
document.getElementById('deselectAllStudents')?.addEventListener('click', deselectAllGameStudents);
document.getElementById('applicationStudentPickerCancelBtn')?.addEventListener('click', closeGameZoneModal);
document.getElementById('applicationStudentPickerConfirmBtn')?.addEventListener('click', () => {
    confirmApplicationStudentPicker().catch((e) => {
        console.error('Application confirm error:', e);
        showNotification('Failed to start app', 'error');
    });
});

// Close modal when clicking outside
document.getElementById('gameZoneModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'gameZoneModal') {
        closeGameZoneModal();
    }
});

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
    // "學生的ID"：優先 student.studentId（顯示用 ID），否則 fallback to internal id
    return (student && (student.studentId || student.id)) ? String(student.studentId || student.id) : '';
}

async function openChessComSettingsModal() {
    const modal = document.getElementById('chessComSettingsModal');
    if (!modal) return;
    modal.classList.add('show');
    const search = document.getElementById('chessComSettingsSearch');
    if (search) search.value = '';

    // Best-effort: hydrate local settings from server so daily jobs can rely on server copy too.
    try {
        const serverSettings = await fetchChessComSettingsFromServer();
        if (serverSettings && typeof serverSettings === 'object') {
            const local = loadChessComSettings();
            const merged = { ...(serverSettings || {}), ...(local || {}) };
            saveChessComSettings(merged);
            // Also push immediately so server definitely has a copy even if user doesn't edit fields.
            await pushChessComSettingsToServer(merged);
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
        const sid = String(s.studentId || '').toLowerCase();
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
                        <div style="color:#6b7280; font-size:0.9rem;">Student ID: ${escapeHtml(s.studentId || '')}</div>
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


// Show points popup animation (global function)
function showPointsPopup(buttonRect, points) {
    const popup = document.createElement('div');
    popup.className = 'points-popup';
    
    // Determine size class
    if (points >= 10) {
        popup.className += ' large';
    } else if (points >= 5) {
        popup.className += ' medium';
    } else {
        popup.className += ' small';
    }
    
    popup.textContent = `+${points}`;
    popup.style.left = `${buttonRect.left + buttonRect.width / 2}px`;
    popup.style.top = `${buttonRect.top}px`;
    popup.style.transform = 'translate(-50%, -50%)';
    
    document.body.appendChild(popup);
    
    setTimeout(() => {
        popup.remove();
    }, 800);
}

// Particle effect for high points (global function)
function createParticleEffect(buttonRect, points) {
    const particleCount = Math.min(points, 20);
    const centerX = buttonRect.left + buttonRect.width / 2;
    const centerY = buttonRect.top + buttonRect.height / 2;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        const angle = (Math.PI * 2 * i) / particleCount;
        const distance = 40 + Math.random() * 40;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;
        
        particle.style.left = `${centerX}px`;
        particle.style.top = `${centerY}px`;
        particle.style.setProperty('--tx', `${tx}px`);
        particle.style.setProperty('--ty', `${ty}px`);
        
        document.body.appendChild(particle);
        
        setTimeout(() => {
            particle.remove();
        }, 1000);
    }
}

// Make functions globally available
window.showPointsPopup = showPointsPopup;
window.createParticleEffect = createParticleEffect;

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
    'game_blunders'
];

const SHARE_APP_DEST_MAP = {
    game_vChessPlatform: { label: 'V.Chess Platform', openGame: 'vChessPlatform' },
    game_chessCom: { label: 'Chess.com', openGame: 'chessCom' },
    game_runningQueen: { label: 'Running Queen', openGame: 'runningQueen' },
    game_royalExchange: { label: 'Royal Exchange', openGame: 'royalExchange' },
    game_hopeMate: { label: 'Hope Mate', openGame: 'hopeMate' },
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
    const appButtons = document.getElementById('shareApplicationOptionsButtons');

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
        if (!appOptions) return;
        appOptions.querySelectorAll('.share-app-dest').forEach(b => b.classList.remove('btn-info'));
        appOptions.querySelectorAll('.share-app-dest').forEach(b => b.classList.add('btn-secondary'));
        const btn = appOptions.querySelector(`[data-share-dest="${CSS.escape(String(destKey || ''))}"]`);
        if (btn) {
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-info');
        }
    };

    const showAppOptions = (show) => {
        if (!appOptions) return;
        appOptions.style.display = show ? 'block' : 'none';
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

    // Build Application options dynamically (so new apps appear automatically when added to mapping).
    if (appButtons && appButtons.dataset.built !== '1') {
        appButtons.dataset.built = '1';
        const keys = SHARE_APP_DEST_ORDER.filter(k => !!SHARE_APP_DEST_MAP[k]);
        appButtons.innerHTML = keys.map((k) => {
            const cfg = SHARE_APP_DEST_MAP[k];
            return `<button type="button" class="btn btn-secondary btn-small share-app-dest" data-share-dest="${escapeHtml(k)}">${escapeHtml(cfg.label)}</button>`;
        }).join('');
    }
    if (appOptions && appOptions.dataset.initialized !== '1') {
        appOptions.dataset.initialized = '1';
        appOptions.addEventListener('click', (ev) => {
            const t = ev.target;
            const btn = t && t.closest ? t.closest('.share-app-dest') : null;
            if (!btn) return;
            const dest = String(btn.getAttribute('data-share-dest') || '');
            if (!dest) return;
            currentShareDestinationGroup = 'application';
            currentShareDestination = dest;
            showAppOptions(true);
            setPrimaryActive('application');
            setAppActive(dest);
            updateShareLinkInput();
        });
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
        const appButtons = document.getElementById('shareApplicationOptionsButtons');
        if (appOptions) {
            appOptions.style.display = 'none';
            // Ensure buttons exist (built in initShareDestinationTabs), and reset their visual state.
            if (appButtons && appButtons.dataset.built !== '1') {
                // If modal opened before init ran for some reason, ensure build now.
                appButtons.dataset.built = '1';
                const keys = SHARE_APP_DEST_ORDER.filter(k => !!SHARE_APP_DEST_MAP[k]);
                appButtons.innerHTML = keys.map((k) => {
                    const cfg = SHARE_APP_DEST_MAP[k];
                    return `<button type="button" class="btn btn-secondary btn-small share-app-dest" data-share-dest="${escapeHtml(k)}">${escapeHtml(cfg.label)}</button>`;
                }).join('');
            }
            appOptions.querySelectorAll('.share-app-dest').forEach(b => b.classList.remove('btn-info'));
            appOptions.querySelectorAll('.share-app-dest').forEach(b => b.classList.add('btn-secondary'));
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

// Initialize
initWebSocket();
loadStudents();
initRightSidebar();

// Check for current class
async function checkCurrentClass() {
    const section = document.getElementById('currentClassSection');
    if (!section || !currentUser) return;
    
    // Ensure timetable data is loaded
    if ((!window.timetableEntries || window.timetableEntries.length === 0) && window.loadTimetableData) {
        await window.loadTimetableData();
    }
    
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[now.getDay()];
    const currentDateStr = now.toISOString().split('T')[0];
    
    // Find Active Entry
    const activeEntry = (window.timetableEntries || []).find(entry => {
        if (!entry.teacherIds || !entry.teacherIds.includes(currentUser.id)) return false;
        
        if (entry.isRecurring) {
            if (!entry.dayOfWeek.includes(currentDay)) return false;
            if (entry.startDate && entry.startDate > currentDateStr) return false;
            if (entry.endDate && entry.endDate < currentDateStr) return false;
        } else {
            if (entry.date !== currentDateStr) return false;
        }
        
        const [sh, sm] = entry.startTime.split(':').map(Number);
        const [eh, em] = entry.endTime.split(':').map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;
        const nowMins = now.getHours() * 60 + now.getMinutes();
        
        return nowMins >= (startMins - 15) && nowMins < endMins;
    });
    
    // Update Current Class Widget UI
    const title = document.getElementById('currentClassTitle');
    const info = document.getElementById('currentClassInfo');
    const time = document.getElementById('currentClassTime');
    const count = document.getElementById('currentClassStudentCount');
    const btn = document.getElementById('startCurrentClassBtn');
    const list = document.getElementById('currentClassStudents');
    
    if (activeEntry) {
        // Active State
        section.style.borderLeft = '5px solid #10b981';
        section.style.background = '#f0fdf4';
        
        title.textContent = '🟢 Current Class';
        title.style.color = '#059669';
        
        info.textContent = activeEntry.className;
        info.style.color = '#065f46';
        
        time.textContent = `${activeEntry.startTime} - ${activeEntry.endTime}`;
        time.style.color = '#047857';
        
        const students = getStudentsForEntry(activeEntry, currentDateStr);
        
        count.style.display = 'block';
        count.textContent = `${students.length} Students`;
        count.style.color = '#065f46';
        
        btn.style.display = 'inline-block';
        btn.onclick = () => startClassFromEntry(activeEntry);
        
        // Add Attendance Button dynamically
        let attBtn = document.getElementById('attCurrentClassBtn');
        if (!attBtn) {
            attBtn = document.createElement('button');
            attBtn.id = 'attCurrentClassBtn';
            attBtn.className = 'btn btn-info';
            attBtn.textContent = '📝 Attendance';
            attBtn.style.marginTop = '5px';
            attBtn.style.marginLeft = '5px';
            attBtn.style.border = 'none';
            if (btn.parentNode) btn.parentNode.appendChild(attBtn);
        }
        attBtn.style.display = 'inline-block';
        attBtn.onclick = () => openAttendanceModal(activeEntry);
        
        list.style.display = 'block';
        list.textContent = students.map(s => s.name).join(', ') || 'No students enrolled';
        list.style.color = '#065f46';
        
        currentClassEntry = activeEntry;
        section.setAttribute('onmouseenter', `showClassTooltip(event, '${activeEntry.id}')`);
        section.setAttribute('onmouseleave', 'hideClassTooltip()');
    } else {
        // No Active Class State
        section.style.borderLeft = '5px solid #ccc';
        section.style.background = '#f9fafb';
        
        title.textContent = '⚪ Current Class';
        title.style.color = '#666';
        
        info.textContent = 'No active class';
        info.style.color = '#333';
        
        time.textContent = '';
        
        count.style.display = 'none';
        btn.style.display = 'none';
        list.style.display = 'none';
        
        currentClassEntry = null;
        section.removeAttribute('onmouseenter');
        section.removeAttribute('onmouseleave');
    }
    
    // Render All Classes Today
    renderTodaysClasses(currentDateStr, currentDay);
}

function getStudentsForEntry(entry, dateStr) {
    const seriesIds = entry.studentIds || [];
    const enrollments = (window.timetableEnrollments || []).filter(e => 
        e.timetableEntryId === entry.id && 
        e.date === dateStr
    );
    const singleIds = enrollments.map(e => e.studentId);
    const allIds = [...new Set([...seriesIds, ...singleIds])];
    return students.filter(s => allIds.includes(s.id));
}

function startClassFromEntry(entry) {
    if (!entry) return;
    
    const now = new Date();
    const currentDateStr = now.toISOString().split('T')[0];
    const classStudents = getStudentsForEntry(entry, currentDateStr);
    
    // 1. Deselect All
    selectedClassStudentIds.clear();
    
    // 2. Select Class Students
    classStudents.forEach(s => selectedClassStudentIds.add(s.id));
    
    // 3. Save Selection
    saveClassViewSelection();
    
    // 4. Open Class View
    openClassView();
    
    updateSelectedCount();
    renderClassStudentsList();
}

function renderTodaysClasses(dateStr, dayName) {
    const container = document.getElementById('todaysClassesList');
    if (!container || !currentUser) return;
    
    // Filter entries for today
    const todaysEntries = (window.timetableEntries || []).filter(entry => {
        if (!entry.teacherIds || !entry.teacherIds.includes(currentUser.id)) return false;
        
        if (entry.isRecurring) {
            if (!entry.dayOfWeek.includes(dayName)) return false;
            if (entry.startDate && entry.startDate > dateStr) return false;
            if (entry.endDate && entry.endDate < dateStr) return false;
        } else {
            if (entry.date !== dateStr) return false;
        }
        return true;
    });
    
    // Sort by Start Time
    todaysEntries.sort((a, b) => a.startTime.localeCompare(b.startTime));
    
    if (todaysEntries.length === 0) {
        container.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">No classes today.</p>';
        return;
    }
    
    // Find next/active class index
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    
    // Find the first class that ends AFTER now (so active or future)
    let nextClassIndex = todaysEntries.findIndex(e => e.endTime > nowTime);
    // If all ended, stay at last? Or -1
    if (nextClassIndex === -1 && todaysEntries.length > 0 && todaysEntries[todaysEntries.length-1].endTime < nowTime) {
        // All finished
        nextClassIndex = todaysEntries.length - 1; 
    }
    if (nextClassIndex === -1) nextClassIndex = 0;
    
    container.innerHTML = todaysEntries.map((entry, index) => {
        const isNext = index === nextClassIndex;
        const students = getStudentsForEntry(entry, dateStr);
        
        return `
            <div class="todays-class-item ${isNext ? 'next-class' : ''}" id="class-item-${index}" style="padding: 15px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; background: ${isNext ? '#f0fdf4' : 'white'}; border-left: ${isNext ? '4px solid #10b981' : 'none'};" onmouseenter="showClassTooltip(event, '${entry.id}')" onmouseleave="hideClassTooltip()">
                <div>
                    <div style="font-weight: bold; font-size: 1.05rem; color: ${isNext ? '#059669' : '#333'};">
                        ${escapeHtml(entry.className)}  
                        ${isNext ? '<span style="font-size: 0.8rem; background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; margin-left: 5px;">Target</span>' : ''}
                    </div>
                    <div style="color: #666; font-size: 0.9rem;">${entry.startTime} - ${entry.endTime}</div>
                    <div style="color: #888; font-size: 0.85rem;">${students.length} Students</div>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button class="btn btn-sm btn-info" onclick="openAttendanceModalWithId('${entry.id}')">Attendance</button>
                    <button class="btn btn-sm btn-primary" onclick="startClassFromEntryWithId('${entry.id}')">Start Class</button>
                </div>
            </div>
        `;
    }).join('');
    
    // Scroll to next class if container is scrollable
    // Using setTimeout to ensure render
    if (window.hasScrolledToClass !== dateStr) { // Simple debounce
        setTimeout(() => {
            const nextEl = document.getElementById(`class-item-${nextClassIndex}`);
            if (nextEl) {
                nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 500);
        window.hasScrolledToClass = dateStr;
    }
}

// Attendance Logic
function openAttendanceModal(entry) {
    if (!entry) return;
    
    const modal = document.getElementById('attendanceModal');
    if (modal) {
        modal.classList.add('show');
        document.getElementById('attClassName').textContent = entry.className;
        document.getElementById('attClassTime').textContent = `${entry.startTime} - ${entry.endTime}`;
        
        // Load students
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const students = getStudentsForEntry(entry, dateStr);
        
        // Load existing attendance
        loadTeacherAttendanceData(entry.id, dateStr, students);
    }
}

function closeAttendanceModal() {
    const modal = document.getElementById('attendanceModal');
    if (modal) modal.classList.remove('show');
}

async function loadTeacherAttendanceData(entryId, dateStr, students) {
    const container = document.getElementById('attStudentList');
    container.innerHTML = '<p style="padding:10px;">Loading...</p>';
    
    let currentAttendance = [];
    try {
        const response = await apiFetch(`/attendance?timetableEntryId=${entryId}&date=${dateStr}`);
        if (response.ok) {
            currentAttendance = await response.json();
        }
    } catch(e) { console.error(e); }
    
    if (students.length === 0) {
        container.innerHTML = '<p style="padding:10px;">No students enrolled.</p>';
        return;
    }
    
    container.innerHTML = students.map(s => {
        const att = currentAttendance.find(r => r.studentId === s.id);
        const status = att ? att.status : 'unmarked';
        
        return `
        <div style="padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>${escapeHtml(s.name)}</strong> <span style="color:#666; font-size:0.9rem;">(${s.studentId})</span>
            </div>
            <div class="attendance-options">
                <select name="t_att_${s.id}" style="padding:5px; border-radius:4px; border:1px solid #ccc;">
                    <option value="unmarked" ${!status || status==='unmarked'?'selected':''}>Select Status</option>
                    <option value="present" ${status==='present'?'selected':''}>Present</option>
                    <option value="absent" ${status==='absent'?'selected':''}>Absent</option>
                    <option value="late" ${status==='late'?'selected':''}>Late</option>
                </select>
            </div>
        </div>
        `;
    }).join('');
    
    // Store context for save
    window.currentAttContext = { entryId, dateStr };
}

async function saveTeacherAttendance() {
    if (!window.currentAttContext) return;
    const { entryId, dateStr } = window.currentAttContext;
    
    const attendanceRecords = [];
    const selects = document.querySelectorAll('#attStudentList select[name^="t_att_"]');
    selects.forEach(s => {
        const studentId = s.name.replace('t_att_', '');
        if (s.value !== 'unmarked') {
            attendanceRecords.push({ studentId, status: s.value });
        }
    });
    
    try {
        const response = await apiFetch('/attendance', {
            method: 'POST',
            body: JSON.stringify({
                timetableEntryId: entryId,
                date: dateStr,
                records: attendanceRecords
            })
        });
        
        if (response.ok) {
            showNotification('Attendance saved!', 'success');
            closeAttendanceModal();
        } else {
            throw new Error('Failed to save');
        }
    } catch (e) {
        showNotification('Error saving attendance', 'error');
    }
}

// Make global
window.closeAttendanceModal = closeAttendanceModal;
window.saveTeacherAttendance = saveTeacherAttendance;
window.openAttendanceModalWithId = function(entryId) {
    const entry = (window.timetableEntries || []).find(e => e.id === entryId);
    if (entry) openAttendanceModal(entry);
};

window.startClassFromEntryWithId = function(entryId) {
    const entry = (window.timetableEntries || []).find(e => e.id === entryId);
    if (entry) startClassFromEntry(entry);
};

// Tooltip Logic
let tooltipEl = null;

function createTooltip() {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    document.body.appendChild(tooltipEl);
    
    const style = document.createElement('style');
    style.textContent = `
        .tooltip {
            position: fixed;
            background: white;
            border: 1px solid #ccc;
            border-radius: 6px;
            padding: 10px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
            z-index: 1000;
            display: none;
            pointer-events: none;
            min-width: 200px;
            font-size: 0.9rem;
        }
        .tooltip-header { font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 5px; }
        .tooltip-row { display: flex; justify-content: space-between; padding: 2px 0; }
        .status-present { color: green; }
        .status-absent { color: red; }
        .status-late { color: orange; }
    `;
    document.head.appendChild(style);
}

window.showClassTooltip = async function(event, entryId) {
    if (!tooltipEl) createTooltip();
    
    const entry = (window.timetableEntries || []).find(e => e.id === entryId);
    if (!entry) return;
    
    tooltipEl.style.left = `${event.clientX + 15}px`;
    tooltipEl.style.top = `${event.clientY + 15}px`;
    tooltipEl.style.display = 'block';
    tooltipEl.innerHTML = 'Loading...';
    
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const students = getStudentsForEntry(entry, dateStr);
    
    let currentAttendance = [];
    try {
        const response = await apiFetch(`/attendance?timetableEntryId=${entryId}&date=${dateStr}`);
        if (response.ok) currentAttendance = await response.json();
    } catch(e) {}
    
    let html = `<div class="tooltip-header">${escapeHtml(entry.className)} (${students.length})</div>`;
    if (students.length === 0) {
        html += '<div>No students</div>';
    } else {
        html += students.map(s => {
            const att = currentAttendance.find(r => r.studentId === s.id);
            const status = att ? att.status : '-';
            const statusClass = status !== '-' ? `status-${status}` : '';
            return `<div class="tooltip-row"><span>${escapeHtml(s.name)}</span><span class="${statusClass}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></div>`;
        }).join('');
    }
    tooltipEl.innerHTML = html;
};

window.hideClassTooltip = function() {
    if (tooltipEl) tooltipEl.style.display = 'none';
};



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
    const studentId = document.getElementById('teacherCreateStudentId').value.trim();
    
    if (!name || !studentId) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    try {
        const response = await apiFetch('/organizations/students', {
            method: 'POST',
            body: JSON.stringify({ name, studentId })
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
    document.getElementById('editStudentName').value = student.name || '';
    document.getElementById('editStudentStudentId').value = student.studentId || '';
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

    document.getElementById('editStudentPhone').value = student.contactPhone || '';
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
        studentId: document.getElementById('editStudentStudentId').value.trim(),
        gender: document.getElementById('editStudentGender').value,
        dateOfBirth: document.getElementById('editStudentDOB').value.trim(),
        contactPhone: document.getElementById('editStudentPhone').value.trim(),
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


// ==================== Quick Class View Functions ====================

let tempClassViewSelection = new Set();

function openQuickClassViewModal() {
    const modal = document.getElementById('quickClassViewModal');
    if (!modal) return;
    
    // Initialize temp set with current selection
    tempClassViewSelection = new Set(selectedClassStudentIds);
    
    renderQuickClassViewList();
    updateQuickClassViewCount();
    modal.classList.add('show');
    
    // Focus search
    setTimeout(() => {
        document.getElementById('quickClassViewSearch')?.focus();
    }, 100);
}

function closeQuickClassViewModal() {
    const modal = document.getElementById('quickClassViewModal');
    if (modal) modal.classList.remove('show');
}

function renderQuickClassViewList() {
    const container = document.getElementById('quickClassViewList');
    if (!container) return;
    
    const searchTerm = document.getElementById('quickClassViewSearch')?.value.toLowerCase() || '';
    
    const filteredStudents = students.filter(student =>
        student.name.toLowerCase().includes(searchTerm) ||
        student.studentId.toLowerCase().includes(searchTerm)
    );
    
    if (filteredStudents.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">No students found</div>';
        return;
    }
    
    container.innerHTML = filteredStudents.map(student => {
        const isChecked = tempClassViewSelection.has(student.id);
        // Escape function needs to be safe for inline HTML
        const safeName = escapeHtml(student.name);
        const safeId = escapeHtml(student.studentId);
        
        return `
            <label style="display:flex; align-items:center; padding:8px; border-bottom:1px solid #eee; cursor:pointer;">
                <input type="checkbox" 
                       value="${student.id}" 
                       ${isChecked ? 'checked' : ''} 
                       onchange="toggleQuickClassViewSelection('${student.id}')"
                       style="margin-right:10px; width:18px; height:18px;">
                <span>${safeName} <span style="color:#888; font-size:0.9rem;">(${safeId})</span></span>
            </label>
        `;
    }).join('');
}

function toggleQuickClassViewSelection(studentId) {
    if (tempClassViewSelection.has(studentId)) {
        tempClassViewSelection.delete(studentId);
    } else {
        tempClassViewSelection.add(studentId);
    }
    updateQuickClassViewCount();
}

function quickClassViewSelectAll() {
    const searchTerm = document.getElementById('quickClassViewSearch')?.value.toLowerCase() || '';
    const filteredStudents = students.filter(student =>
        student.name.toLowerCase().includes(searchTerm) ||
        student.studentId.toLowerCase().includes(searchTerm)
    );
    
    filteredStudents.forEach(s => tempClassViewSelection.add(s.id));
    renderQuickClassViewList();
    updateQuickClassViewCount();
}

function quickClassViewDeselectAll() {
    const searchTerm = document.getElementById('quickClassViewSearch')?.value.toLowerCase() || '';
    
    // If search is active, only deselect visible ones
    if (searchTerm) {
        const filteredStudents = students.filter(student =>
            student.name.toLowerCase().includes(searchTerm) ||
            student.studentId.toLowerCase().includes(searchTerm)
        );
        filteredStudents.forEach(s => tempClassViewSelection.delete(s.id));
    } else {
        tempClassViewSelection.clear();
    }
    
    renderQuickClassViewList();
    updateQuickClassViewCount();
}

function updateQuickClassViewCount() {
    const el = document.getElementById('quickClassViewCount');
    if (el) el.textContent = tempClassViewSelection.size;
}

async function confirmQuickClassView() {
    // Update main selection
    selectedClassStudentIds = new Set(tempClassViewSelection);
    
    // Save to server
    await saveClassViewSelection(); // Reuse existing save function
    
    // Update main UI
    renderClassStudentsList();
    updateSelectedCount();
    
    closeQuickClassViewModal();
    
    // Optional: Ask to open Class View immediately
    if (confirm('Selection updated! Open Class View now?')) {
        openClassView();
    }
}

// Event Listeners for Quick Class View
document.getElementById('quickClassViewSearch')?.addEventListener('input', renderQuickClassViewList);

// Make global
window.openQuickClassViewModal = openQuickClassViewModal;
window.closeQuickClassViewModal = closeQuickClassViewModal;
window.toggleQuickClassViewSelection = toggleQuickClassViewSelection;
window.quickClassViewSelectAll = quickClassViewSelectAll;
window.quickClassViewDeselectAll = quickClassViewDeselectAll;
window.confirmQuickClassView = confirmQuickClassView;
