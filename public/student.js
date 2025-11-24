const API_BASE = '/api';
let students = [];
let ws = null;
let refreshInterval = null;

// Initialize WebSocket connection
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket closed, reconnecting...');
        setTimeout(initWebSocket, 3000);
    };

    ws.onopen = () => {
        loadStudents();
    };
}

// Handle WebSocket messages
function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'studentAdded':
        case 'studentUpdated':
        case 'answerRecorded':
        case 'studentDeleted':
        case 'reset':
            loadStudents();
            break;
    }
}

// Load all students
async function loadStudents() {
    try {
        const response = await fetch(`${API_BASE}/students`);
        students = await response.json();
        renderLeaderboard();
        renderAllStudents();
    } catch (error) {
        console.error('Error loading students:', error);
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

// Render top leaderboard
function renderLeaderboard() {
    const container = document.getElementById('leaderboard');
    
    if (students.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 40px;">No students yet.</p>';
        return;
    }

    // Sort by score (descending)
    const sortedStudents = [...students].sort((a, b) => (b.score || 0) - (a.score || 0));
    const topStudents = sortedStudents.slice(0, 10); // Top 10

    container.innerHTML = topStudents.map((student, index) => {
        const rank = index + 1;
        const rankClass = rank === 1 ? 'top-1' : rank === 2 ? 'top-2' : rank === 3 ? 'top-3' : '';
        const rankInfo = getRankInfo(student.score || 0);
        // Always use calculated rank to ensure accuracy
        const currentRank = rankInfo.rank;
        const currentRankIndex = rankInfo.rankIndex;
        
        return `
            <div class="leaderboard-item ${rankClass}">
                <div class="rank">${rank}</div>
                <div class="leaderboard-info">
                    <h3>${escapeHtml(student.name)}</h3>
                    <div class="rank-badge rank-${currentRankIndex}" style="margin: 5px 0;">${currentRank}</div>
                    <div class="rank-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${rankInfo.progress}%"></div>
                        </div>
                        <div class="progress-text">${Math.round(rankInfo.progress)}% to ${rankInfo.nextRank || 'Max'}</div>
                    </div>
                    <div class="leaderboard-stats">
                        <span>${student.answerCount || 0} answers</span>
                    </div>
                </div>
                <div class="score-badge">${student.score || 0} pts</div>
            </div>
        `;
    }).join('');
}

// Render all students list
function renderAllStudents() {
    const container = document.getElementById('allStudentsList');
    
    if (students.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 40px;">No students yet.</p>';
        return;
    }

    // Sort by score (descending)
    const sortedStudents = [...students].sort((a, b) => (b.score || 0) - (a.score || 0));

    container.innerHTML = sortedStudents.map(student => {
        const rankInfo = getRankInfo(student.score || 0);
        // Always use calculated rank to ensure accuracy
        const currentRank = rankInfo.rank;
        const currentRankIndex = rankInfo.rankIndex;
        
        return `
        <div class="student-list-item" data-rank="${currentRankIndex}">
            <div class="student-list-info">
                <h3>${escapeHtml(student.name)}</h3>
                <div class="student-id">ID: ${escapeHtml(student.studentId)}</div>
                <div class="rank-badge rank-${currentRankIndex}" style="margin-top: 5px; display: inline-block;">${currentRank}</div>
            </div>
            <div class="student-list-stats">
                <div>
                    <span><strong>${student.score || 0}</strong> pts</span>
                    <div class="rank-progress" style="margin-top: 5px; width: 200px;">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${rankInfo.progress}%"></div>
                        </div>
                    </div>
                </div>
                <span>Answers: ${student.answerCount || 0}</span>
            </div>
        </div>
    `;
    }).join('');
}

// Auto-refresh fallback (every 5 seconds if WebSocket fails)
function startAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    refreshInterval = setInterval(() => {
        loadStudents();
    }, 5000);
}

// Stop auto-refresh
function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
initWebSocket();
startAutoRefresh(); // Fallback polling in case WebSocket has issues
