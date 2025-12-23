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
        renderDashboard();
        
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
    document.getElementById('sId').textContent = `ID: ${s.studentId}`;
    document.getElementById('sAvatar').textContent = s.name.charAt(0).toUpperCase();
    
    document.getElementById('sScore').textContent = s.score || 0;
    document.getElementById('sLevel').textContent = s.level || 1;
    document.getElementById('sAnswers').textContent = s.answerCount || 0;
    
    // Balance might not be in public API unless I add it. 
    // I didn't add it explicitly in server.js publicData object.
    // Let's check if it defaults to 0 or undefined.
    if (s.balance !== undefined) {
        document.getElementById('sBalance').textContent = `$${parseFloat(s.balance).toFixed(2)}`;
    } else {
        // Hide balance card if not available
        document.getElementById('sBalance').parentElement.style.display = 'none';
    }
    
    // Rank Badge
    const rankColors = {
        'Wood': '#8B4513', 'Bronze': '#CD7F32', 'Silver': '#C0C0C0', 'Gold': '#FFD700',
        'Platinum': '#E5E4E2', 'Diamond': '#00CED1', 'Candidate Master': '#9370DB',
        'Master': '#FF1493', 'International Master': '#FF4500', 'Grand Master': '#FF0000'
    };
    
    const badge = document.createElement('div');
    badge.className = 'rank-badge';
    badge.style.backgroundColor = rankColors[s.rank] || '#666';
    badge.textContent = s.rank;
    document.getElementById('sRankBadge').innerHTML = '';
    document.getElementById('sRankBadge').appendChild(badge);

    // Progress
    document.getElementById('sRank').textContent = s.rank;
    document.getElementById('sNextRank').textContent = s.nextRank || 'Max';
    document.getElementById('sProgress').style.width = `${s.progress}%`;
    
    if (s.nextRank) {
        document.getElementById('sScoreToNext').textContent = s.scoreToNext || 0;
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

        if (openTab) {
            window.switchTab(openTab);
        }

        if (openGame) {
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

window.openStudentGame = function(gameKey, options = {}) {
    if (!studentData) return;
    const player = {
        id: studentData.id || studentData._id || studentId || studentData.studentId || '',
        name: studentData.name || 'Student',
        studentId: studentData.studentId || ''
    };

    const openMode = options && options.openMode ? options.openMode : 'popup';

    if (gameKey === 'chessCom') {
        openStudentChessComModal();
        return;
    }

    if (gameKey === 'runningQueen') {
        try {
            localStorage.setItem('runningQueenPlayers', JSON.stringify([player]));
        } catch (e) {
            console.warn('Unable to persist runningQueenPlayers', e);
        }
        if (openMode === 'sameTab') {
            window.location.href = '/game/game-window.html?game=runningQueen';
        } else {
            window.open('/game/game-window.html?game=runningQueen', '_blank');
        }
        return;
    }

    if (gameKey === 'royalExchange') {
        try {
            localStorage.setItem('royalExchangePlayers', JSON.stringify([player]));
        } catch (e) {
            console.warn('Unable to persist royalExchangePlayers', e);
        }
        if (openMode === 'sameTab') {
            window.location.href = '/game/game-window.html?game=royalExchange';
        } else {
            window.open('/game/game-window.html?game=royalExchange', '_blank');
        }
        return;
    }

    if (gameKey === 'hopeMate') {
        try {
            localStorage.setItem('hopeMatePlayers', JSON.stringify([player]));
        } catch (e) {
            console.warn('Unable to persist hopeMatePlayers', e);
        }
        if (openMode === 'sameTab') {
            window.location.href = '/game/game-window.html?game=hopeMate';
        } else {
            window.open('/game/game-window.html?game=hopeMate', '_blank');
        }
        return;
    }

    if (gameKey === 'blunders') {
        try {
            localStorage.setItem('blundersPlayers', JSON.stringify([player]));
        } catch (e) {
            console.warn('Unable to persist blundersPlayers', e);
        }
        if (openMode === 'sameTab') {
            window.location.href = '/game/game-window.html?game=blunders';
        } else {
            window.open('/game/game-window.html?game=blunders', '_blank');
        }
        return;
    }

    if (gameKey === 'vChessPlatform') {
        // iOS Safari popup-blocking note:
        // If we call window.open() AFTER an async await (e.g. fetching token),
        // the browser may treat it as not user-initiated and block it silently.
        // To avoid "no response" on iPad, open a blank tab synchronously first.
        let popupWin = null;
        if (openMode !== 'sameTab') {
            popupWin = window.open('about:blank', '_blank');
            if (popupWin) {
                try {
                    popupWin.document.title = 'Loading...';
                    popupWin.document.body.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
                    popupWin.document.body.innerHTML = '<div style="padding:24px; color:#111827; font-weight:800;">Loading V.Chess Platform...</div>';
                } catch (e) {
                    // Ignore DOM write failures (some browsers restrict it)
                }
            }
        }

        (async () => {
            try {
                localStorage.setItem('vChessPlatformRole', 'student');
                localStorage.setItem('vChessPlatformPlayer', JSON.stringify(player));
            } catch (e) {
                console.warn('Unable to persist vChessPlatform context', e);
            }

            // Fetch a dedicated student token for VCP (do NOT rely on authToken)
            try {
                const pwdQuery = studentAccessPassword ? `?password=${encodeURIComponent(studentAccessPassword)}` : '';
                const resp = await fetch(`/api/public/students/${encodeURIComponent(String(studentData.id || studentId))}/vcp-token${pwdQuery}`);
                const data = await resp.json().catch(() => ({}));
                if (!resp.ok || !data.token) {
                    console.warn('Failed to obtain VCP token:', data);
                } else {
                    try {
                        localStorage.setItem('vChessPlatformAuthToken', String(data.token));
                    } catch (e) {
                        console.warn('Unable to persist vChessPlatformAuthToken', e);
                    }
                }
            } catch (e) {
                console.warn('Failed to fetch VCP token', e);
            }

            const url = '/game/game-window.html?game=vChessPlatform&role=student';
            if (openMode === 'sameTab') {
                window.location.href = url;
            } else {
                if (popupWin && !popupWin.closed) {
                    try {
                        popupWin.location.replace(url);
                    } catch (e) {
                        try { popupWin.location.href = url; } catch {}
                    }
                } else {
                    // Popup was blocked; fallback to same-tab navigation.
                    window.location.href = url;
                }
            }
        })();
        return;
    }
};

// =========================
// Chess.com (Student modal)
// =========================
const STUDENT_CHESS_COM_LOGIN_URL = 'https://www.chess.com/login_and_go?returnUrl=https://www.chess.com/';
const TEACHER_CHESS_COM_SETTINGS_KEY = 'teacherChessComSettings_v1';

function getStudentInternalId() {
    return String(studentData?.id || studentData?._id || studentId || studentData?.studentId || '');
}

function getDefaultChessComUsername() {
    // Default to student's "Student ID" as requested
    return String(studentData?.studentId || studentId || '');
}

function loadTeacherChessComSettings() {
    try {
        const raw = localStorage.getItem(TEACHER_CHESS_COM_SETTINGS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
}

function showStudentToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#667eea; color:white; padding:10px 16px; border-radius:10px; z-index:9999; box-shadow:0 10px 24px rgba(0,0,0,0.18);';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            return true;
        } catch (err) {
            return false;
        }
    }
}

function openStudentChessComModal() {
    const modal = document.getElementById('studentChessComModal');
    if (!modal) return;

    const settings = loadTeacherChessComSettings();
    const internalId = getStudentInternalId();
    const entry = settings[internalId] || {};

    const username = String(entry.chessId || getDefaultChessComUsername());
    const password = String(entry.password || '');

    const uEl = document.getElementById('studentChessComUsername');
    const pEl = document.getElementById('studentChessComPassword');
    if (uEl) uEl.value = username;
    if (pEl) {
        pEl.value = password;
        pEl.type = 'password';
    }
    const toggleBtn = document.getElementById('studentChessComTogglePassword');
    if (toggleBtn) toggleBtn.textContent = '👁';

    modal.classList.add('show');
}

function closeStudentChessComModal() {
    const modal = document.getElementById('studentChessComModal');
    if (!modal) return;
    modal.classList.remove('show');
}

document.getElementById('studentChessComModalClose')?.addEventListener('click', closeStudentChessComModal);
document.getElementById('studentChessComClose')?.addEventListener('click', closeStudentChessComModal);
document.getElementById('studentChessComModal')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'studentChessComModal') closeStudentChessComModal();
});

document.getElementById('studentChessComTogglePassword')?.addEventListener('click', () => {
    const input = document.getElementById('studentChessComPassword');
    const btn = document.getElementById('studentChessComTogglePassword');
    if (!input || !btn) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁' : '🙈';
});

document.getElementById('studentChessComCopyUsername')?.addEventListener('click', async () => {
    const username = document.getElementById('studentChessComUsername')?.value || '';
    const ok = await copyToClipboard(username);
    showStudentToast(ok ? 'Username copied' : 'Copy failed');
});

document.getElementById('studentChessComCopyPassword')?.addEventListener('click', async () => {
    const password = document.getElementById('studentChessComPassword')?.value || '';
    const ok = await copyToClipboard(password);
    showStudentToast(ok ? 'Password copied' : 'Copy failed');
});

document.getElementById('studentChessComCopyBoth')?.addEventListener('click', async () => {
    const username = document.getElementById('studentChessComUsername')?.value || '';
    const password = document.getElementById('studentChessComPassword')?.value || '';
    const ok = await copyToClipboard(`username: ${username}\npassword: ${password}`);
    showStudentToast(ok ? 'Credentials copied' : 'Copy failed');
});

document.getElementById('studentChessComGo')?.addEventListener('click', async () => {
    // Note: We cannot auto-fill chess.com inputs from here due to browser cross-origin security.
    // Best-effort UX: open login page + offer copy.
    const win = window.open(STUDENT_CHESS_COM_LOGIN_URL, '_blank', 'noopener,noreferrer');
    if (!win) {
        alert('Popup blocked. Please allow popups to open Chess.com');
        return;
    }
    showStudentToast('Chess.com login opened. Use Copy buttons to paste credentials.');
});

// Allow Enter key for password
document.getElementById('accessPasswordInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') checkPassword();
});
