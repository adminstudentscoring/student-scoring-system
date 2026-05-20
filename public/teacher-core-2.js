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
