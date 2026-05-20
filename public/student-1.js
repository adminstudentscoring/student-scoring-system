const urlParams = new URLSearchParams(window.location.search);
const studentId = urlParams.get('id');
let studentData = null;
let studentAccessPassword = '';

// Initialize
if (studentId) {
    loadData();
} else {
    document.body.innerHTML = '<h2 style="text-align:center; margin-top:50px; color:white;">Invalid Link</h2>';
}

// Load Data
async function loadData(password = '') {
    try {
        studentAccessPassword = String(password || '');
        const url = `/api/public/students/${studentId}${password ? '?password=' + encodeURIComponent(password) : ''}`;
        const response = await fetch(url);
        
        if (response.status === 404) {
            document.body.innerHTML = '<h2 style="text-align:center; margin-top:50px; color:white;">Student Not Found</h2>';
            return;
        }
        
        const data = await response.json();
        
        if (data.protected) {
            document.getElementById('passwordGate').style.display = 'block';
            document.getElementById('studentDashboard').style.display = 'none';
            // Don't show name if protected? Or show "Protected Profile"?
            // API returns basic name if protected.
            return;
        }
        
        if (data.error) {
            document.getElementById('authError').textContent = data.error;
            document.getElementById('authError').style.display = 'block';
            return;
        }
        
        studentData = data;
        // Persist public access password for games opened in a new window (e.g., Blunders).
        try {
            if (studentAccessPassword) localStorage.setItem('studentAccessPassword', String(studentAccessPassword));
            else localStorage.removeItem('studentAccessPassword');
        } catch (e) {
            // ignore
        }
        renderDashboard();

        // If we arrived via a deep link, clear it after the auto-open kicks in (avoid re-trigger on refresh).
        // We clear after render to ensure applyDeepLinkFromUrl has already had a chance to read it.
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('openGame') || params.get('openTab')) {
                // Keep student id in URL; just remove deep-link extras.
                params.delete('openTab');
                params.delete('openGame');
                params.delete('autoStart');
                params.delete('tfBucket');
                params.delete('tfSubtopicId');
                const base = `${window.location.pathname}?${params.toString()}`;
                window.history.replaceState({}, '', base);
            }
        } catch (e) {
            // ignore
        }
        
    } catch (e) {
        console.error(e);
        document.body.innerHTML = '<h2 style="text-align:center; margin-top:50px; color:white;">Error loading profile</h2>';
    }
}

function checkPassword() {
    const pwd = document.getElementById('accessPasswordInput').value;
    loadData(pwd);
}

function renderDashboard() {
    document.getElementById('passwordGate').style.display = 'none';
    document.getElementById('studentDashboard').style.display = 'flex';
    
    const s = studentData;
    document.getElementById('sName').textContent = s.name;
    document.getElementById('sId').textContent = `chess.com ID: ${s.chessComId || s.studentId || ''}`;
    document.getElementById('sAvatar').textContent = s.name.charAt(0).toUpperCase();
    
    document.getElementById('sScore').textContent = s.score || 0;
    const answersEl = document.getElementById('sAnswers');
    if (answersEl) answersEl.textContent = s.answerCount || 0;
    
    // Balance might not be in public API unless I add it. 
    // I didn't add it explicitly in server.js publicData object.
    // Let's check if it defaults to 0 or undefined.
    if (s.balance !== undefined) {
        document.getElementById('sBalance').textContent = `$${parseFloat(s.balance).toFixed(2)}`;
    } else {
        // Hide balance card if not available
        document.getElementById('sBalance').parentElement.style.display = 'none';
    }
    
    // Level badge (image)
    const badgeFiles = {
        'Wood': 'Wood.png',
        'Bronze': 'Bronze.png',
        'Silver': 'Silver.png',
        'Gold': 'Gold.png',
        'Platinum': 'Platinum.png',
        'Diamond': 'Diamond.png',
        'Candidate Master': 'Candidate_Master.png',
        // The UI may say "Master"; assets use Fide_Master.png.
        'Master': 'Fide_Master.png',
        'Fide Master': 'Fide_Master.png',
        'International Master': 'International_Master.png',
        'Grand Master': 'Grand_Master.png'
    };

    const badge = document.createElement('img');
    badge.className = 'level-badge';
    const file = badgeFiles[String(s.rank || '')] || '';
    if (file) {
        const base = (window.location && window.location.protocol === 'file:') ? 'assets/level-badge/' : '/assets/level-badge/';
        badge.src = `${base}${file}`;
    }
    badge.onerror = () => {
        console.warn('[level-badge] failed', badge.src);
        try { badge.remove(); } catch {}
    };
    badge.alt = `${String(s.rank || 'Level')} badge`;
    document.getElementById('sRankBadge').innerHTML = '';
    document.getElementById('sRankBadge').appendChild(badge);

    // Overview "Level" card shows badge instead of text label
    const levelEl = document.getElementById('sLevel');
    if (levelEl) {
        levelEl.innerHTML = '';
        if (badge.src) {
            const b2 = badge.cloneNode(true);
            levelEl.appendChild(b2);
        } else {
            levelEl.textContent = String(s.level || 1);
        }
    }

    // Progress
    document.getElementById('sRank').textContent = s.rank;
    document.getElementById('sNextRank').textContent = s.nextRank || 'Max';
    document.getElementById('sProgress').style.width = `${s.progress}%`;
    
    if (s.nextRank) {
        const n = Number(s.scoreToNext);
        document.getElementById('sScoreToNext').textContent = Number.isFinite(n) ? String(Math.max(0, Math.ceil(n))) : '0';
    } else {
        document.getElementById('sScoreToNext').parentElement.style.display = 'none';
    }

    renderRanking();

    // Deep link support: allow staff to share links that open a specific tab/game.
    applyDeepLinkFromUrl();
}

function applyDeepLinkFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        const openTab = params.get('openTab');
        const openGame = params.get('openGame');
        const autoStart = params.get('autoStart') === '1';
        const tfBucket = params.get('tfBucket');
        const tfSubtopicId = params.get('tfSubtopicId');

        if (openTab) {
            window.switchTab(openTab);
        }

        if (openGame) {
            // Tactics Fighter deep link: store target so the game window can jump directly.
            if (openGame === 'tacticsFighter' && (tfBucket || tfSubtopicId)) {
                try {
                    localStorage.setItem('tacticsFighterDeepLink', JSON.stringify({
                        bucket: String(tfBucket || '').trim(),
                        subtopicId: String(tfSubtopicId || '').trim()
                    }));
                } catch (e) {
                    // ignore
                }
            }
            // Ensure we are on the Game tab before starting.
            window.switchTab('game');
            // Auto-start should avoid popup blockers on mobile by opening in the same tab.
            window.openStudentGame(openGame, { openMode: autoStart ? 'sameTab' : 'popup' });
        }
    } catch (e) {
        // No-op
    }
}

function renderRanking() {
    const container = document.getElementById('rankingList');
    if (!container) return;

    const rank = Number(studentData?.rankInTeacher);

    if (Number.isFinite(rank) && rank > 0) {
        container.innerHTML = `
            <div class="stat-card" style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px;">
                <div>
                    <div style="font-weight:700; font-size:1rem; color:#333;">Your ranking</div>
                    <div style="color:#666;">Among students taught by your teachers</div>
                </div>
                <div style="font-size:1.3rem; font-weight:700; color:#4f46e5;">#${rank}</div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="empty-state" style="padding: 20px; text-align: center; background: #f9fafb; border-radius: 8px; color: #666;">
            Ranking data is not available.
        </div>
    `;
}

window.switchTab = function(tab) {
    document.querySelectorAll('.tab').forEach(t => {
        const key = t.getAttribute('data-tab');
        t.classList.toggle('active', key === tab);
    });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    const target = document.getElementById(`${tab}Tab`);
    if (target) {
        target.classList.add('active');
    }
};
