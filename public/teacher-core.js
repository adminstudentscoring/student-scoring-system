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

// Level badge image mapping (rankIndex -> asset filename)
function levelBadgeSrcByRankIndex(rankIndex) {
    const idx = Number(rankIndex);
    const files = [
        'Wood.png',
        'Bronze.png',
        'Silver.png',
        'Gold.png',
        'Platinum.png',
        'Diamond.png',
        'Candidate_Master.png',
        // The UI calls this "Master"; assets provide Fide_Master.png.
        'Fide_Master.png',
        'International_Master.png',
        'Grand_Master.png'
    ];
    const name = files[idx];
    if (!name) return '';
    // Support both Electron file:// (relative path) and web /application/... routes (need absolute-from-root).
    const base = (window.location && window.location.protocol === 'file:') ? 'assets/level-badge/' : '/assets/level-badge/';
    return `${base}${name}`;
}

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
