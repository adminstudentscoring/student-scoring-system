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

    ws.onerror = () => {
        // Browser already logs connection failures; avoid duplicate noise here.
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
        // Refresh application modal student list when it is open
        if (document.getElementById('applicationModal')?.classList.contains('show')) {
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
