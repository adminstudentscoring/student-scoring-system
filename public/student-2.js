window.openStudentGame = function(gameKey, options = {}) {
    if (!studentData) return;
    const player = {
        id: studentData.id || studentData._id || studentId || '',
        name: studentData.name || 'Student',
        // Keep property name `studentId` for backward compatibility with game windows,
        // but its value is the chess.com ID.
        studentId: studentData.chessComId || studentData.studentId || '',
        chessComId: studentData.chessComId || studentData.studentId || ''
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
            window.location.href = '/application/application-window.html?game=runningQueen';
        } else {
            window.open('/application/application-window.html?game=runningQueen', '_blank');
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
            window.location.href = '/application/application-window.html?game=royalExchange';
        } else {
            window.open('/application/application-window.html?game=royalExchange', '_blank');
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
            window.location.href = '/application/application-window.html?game=hopeMate';
        } else {
            window.open('/application/application-window.html?game=hopeMate', '_blank');
        }
        return;
    }

    if (gameKey === 'tacticsFighter') {
        try {
            localStorage.setItem('tacticsFighterPlayers', JSON.stringify([player]));
        } catch (e) {
            console.warn('Unable to persist tacticsFighterPlayers', e);
        }
        // Deep link support (optional): bucket + subtopicId
        let extra = '';
        try {
            const raw = localStorage.getItem('tacticsFighterDeepLink');
            if (raw) {
                const dl = JSON.parse(raw);
                const bucket = String(dl?.bucket || '').trim();
                const subtopicId = String(dl?.subtopicId || '').trim();
                if (bucket) extra += `&bucket=${encodeURIComponent(bucket)}`;
                if (subtopicId) extra += `&subtopicId=${encodeURIComponent(subtopicId)}`;
                // Force practice mode when deep linking into a subtopic.
                if (bucket || subtopicId) extra += `&mode=practice`;
            }
        } catch (e) {
            // ignore
        }
        const url = `/application/application-window.html?game=tacticsFighter&role=student${extra}`;
        if (openMode === 'sameTab') {
            window.location.href = url;
        } else {
            window.open(url, '_blank');
        }
        return;
    }

    if (gameKey === 'mazeRunner') {
        try {
            localStorage.setItem('mazeRunnerPlayers', JSON.stringify([player]));
        } catch (e) {
            console.warn('Unable to persist mazeRunnerPlayers', e);
        }
        const url = `/application/application-window.html?game=mazeRunner&role=student`;
        if (openMode === 'sameTab') {
            window.location.href = url;
        } else {
            window.open(url, '_blank');
        }
        return;
    }

    if (gameKey === 'chessLight') {
        try {
            localStorage.setItem('chessLightPlayers', JSON.stringify([player]));
        } catch (e) {
            console.warn('Unable to persist chessLightPlayers', e);
        }
        const url = `/application/application-window.html?game=chessLight&role=student`;
        if (openMode === 'sameTab') {
            window.location.href = url;
        } else {
            window.open(url, '_blank');
        }
        return;
    }

    if (gameKey === 'chessSolitaire') {
        try {
            localStorage.setItem('chessSolitairePlayers', JSON.stringify([player]));
        } catch (e) {
            console.warn('Unable to persist chessSolitairePlayers', e);
        }
        const url = `/application/application-window.html?game=chessSolitaire&role=student`;
        if (openMode === 'sameTab') {
            window.location.href = url;
        } else {
            window.open(url, '_blank');
        }
        return;
    }

    if (gameKey === 'chessWorks') {
        try {
            localStorage.setItem('chessWorksPlayers', JSON.stringify([player]));
        } catch (e) {
            console.warn('Unable to persist chessWorksPlayers', e);
        }
        const url = `/application/application-window.html?game=chessWorks&role=student`;
        if (openMode === 'sameTab') {
            window.location.href = url;
        } else {
            window.open(url, '_blank');
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
            window.location.href = '/application/application-window.html?game=blunders';
        } else {
            window.open('/application/application-window.html?game=blunders', '_blank');
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

            const url = '/application/application-window.html?game=vChessPlatform&role=student';
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

function getStudentInternalId() {
    // Internal system id
    return String(studentData?.id || studentData?._id || studentId || '');
}

function getDefaultChessComUsername() {
    // Default to student's chess.com ID (new field name)
    return String(studentData?.chessComId || studentData?.studentId || '');
}

function getChessComUsernameFromServerData() {
    const u = String(studentData?.chessComUsername || '').trim();
    return u || '';
}

function getChessComPasswordFromServerData() {
    const p = String(studentData?.chessComPassword || '').trim();
    return p || '';
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

    const username = String(getChessComUsernameFromServerData() || getDefaultChessComUsername());
    const password = String(getChessComPasswordFromServerData() || '');

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
