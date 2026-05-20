// Application modal (embedded apps + Monster Fight student picker)
let applicationModalSize = 'normal'; // 'normal', 'large', 'fullscreen'
let selectedGameStudents = [];
let applicationPickGameKey = null; // only 'monsterFight' uses the student picker modal

function getTeacherAsPlayerDetails() {
    if (!currentUser || !currentUser.id) {
        showNotification('Missing teacher identity. Please refresh and try again.', 'error');
        return null;
    }
    return [{
        id: String(currentUser.id),
        name: String(currentUser.name || currentUser.email || 'Teacher'),
        studentId: String(currentUser.teacherId || currentUser.id)
    }];
}

/** If the teacher picked students in the modal list, use them; otherwise use the teacher as the only player. */
function buildPlayersForApplication() {
    if (selectedGameStudents.length > 0) {
        return selectedGameStudents.map(id => {
            const student = students.find(s => s.id === id) || {};
            return {
                id,
                name: student.name || 'Unknown',
                studentId: student.chessComId || ''
            };
        });
    }
    return getTeacherAsPlayerDetails();
}

function openApplicationModal() {
    const modal = document.getElementById('applicationModal');
    if (modal) {
        modal.classList.add('show');
        loadGameStudents();
        showApplicationCatalog();
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

    const url = '/application/application-window.html?game=vChessPlatform&role=teacher';
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
    const key = String(gameKey || '');
    if (key !== 'monsterFight') {
        console.warn('openApplicationStudentPicker: only Monster Fight uses the student picker');
        return;
    }
    applicationPickGameKey = key;
    selectedGameStudents = [];
    const modal = document.getElementById('applicationModal');
    if (!modal) return;

    const titleEl = document.getElementById('applicationModalTitle');
    if (titleEl) titleEl.textContent = '🎮 Application · Monster Fight';

    // Hide game selection + game area; show student selection only
    const gs = document.getElementById('applicationCatalogSection');
    const ss = document.getElementById('applicationStudentPickSection');
    const ga = document.getElementById('applicationEmbedSection');
    if (gs) gs.style.display = 'none';
    if (ga) ga.style.display = 'none';
    if (ss) ss.style.display = 'block';

    // Open modal and load students
    modal.classList.add('show');
    loadGameStudents();
}

window.openApplicationStudentPicker = openApplicationStudentPicker;


function openTacticsFighterAsMe() {
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
        localStorage.setItem('tacticsFighterPlayers', JSON.stringify([player]));
    } catch (error) {
        console.warn('Unable to persist tacticsFighterPlayers to localStorage:', error);
    }

    const url = '/application/application-window.html?game=tacticsFighter&role=teacher';
    const win = window.open(url, '_blank');
    if (!win) {
        showNotification('Popup blocked. Opening in current window...', 'warning');
        window.location.href = url;
        return;
    }
    showNotification('Tactics Fighter opened in a new tab', 'success');
}

window.openTacticsFighterAsMe = openTacticsFighterAsMe;

function openMazeRunnerAsMe() {
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
        localStorage.setItem('mazeRunnerPlayers', JSON.stringify([player]));
    } catch (error) {
        console.warn('Unable to persist mazeRunnerPlayers to localStorage:', error);
    }

    const url = '/application/application-window.html?game=mazeRunner&role=teacher';
    const win = window.open(url, '_blank');
    if (!win) {
        showNotification('Popup blocked. Opening in current window...', 'warning');
        window.location.href = url;
        return;
    }
    showNotification('Maze Runner opened in a new tab', 'success');
}

window.openMazeRunnerAsMe = openMazeRunnerAsMe;

function openChessLightAsMe() {
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
        localStorage.setItem('chessLightPlayers', JSON.stringify([player]));
    } catch (error) {
        console.warn('Unable to persist chessLightPlayers to localStorage:', error);
    }

    const url = '/application/application-window.html?game=chessLight&role=teacher';
    const win = window.open(url, '_blank');
    if (!win) {
        showNotification('Popup blocked. Opening in current window...', 'warning');
        window.location.href = url;
        return;
    }
    showNotification('Chess Light opened in a new tab', 'success');
}

window.openChessLightAsMe = openChessLightAsMe;

function openChessSolitaireAsMe() {
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
        localStorage.setItem('chessSolitairePlayers', JSON.stringify([player]));
    } catch (error) {
        console.warn('Unable to persist chessSolitairePlayers to localStorage:', error);
    }

    const url = '/application/application-window.html?game=chessSolitaire&role=teacher';
    const win = window.open(url, '_blank');
    if (!win) {
        showNotification('Popup blocked. Opening in current window...', 'warning');
        window.location.href = url;
        return;
    }
    showNotification('Chess Solitaire opened in a new tab', 'success');
}

window.openChessSolitaireAsMe = openChessSolitaireAsMe;

function openChessWorksAsMe() {
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
        localStorage.setItem('chessWorksPlayers', JSON.stringify([player]));
    } catch (error) {
        console.warn('Unable to persist chessWorksPlayers to localStorage:', error);
    }

    const url = '/application/application-window.html?game=chessWorks&role=teacher';
    const win = window.open(url, '_blank');
    if (!win) {
        showNotification('Popup blocked. Opening in current window...', 'warning');
        window.location.href = url;
        return;
    }
    showNotification('Chess Works opened in a new tab', 'success');
}

window.openChessWorksAsMe = openChessWorksAsMe;

function openBlundersTeacherMode() {
    // Teacher mode Blunders: open in a new tab and render a dedicated teacher UI.
    const url = '/application/application-window.html?game=blunders&role=teacher';
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

function openRunningQueenAsMe() {
    const playerDetails = getTeacherAsPlayerDetails();
    if (!playerDetails) return;
    try {
        localStorage.setItem('runningQueenPlayers', JSON.stringify(playerDetails));
    } catch (e) {
        console.warn('Unable to persist runningQueenPlayers to localStorage:', e);
    }
    const url = '/application/application-window.html?game=runningQueen&role=teacher';
    const win = window.open(url, '_blank');
    if (!win) {
        showNotification('Popup blocked. Opening in current window...', 'warning');
        window.location.href = url;
        return;
    }
    showNotification('Running Queen opened in a new tab', 'success');
}

window.openRunningQueenAsMe = openRunningQueenAsMe;

function openRoyalExchangeAsMe() {
    const playerDetails = getTeacherAsPlayerDetails();
    if (!playerDetails) return;
    try {
        localStorage.setItem('royalExchangePlayers', JSON.stringify(playerDetails));
    } catch (e) {
        console.warn('Unable to persist royalExchangePlayers to localStorage:', e);
    }
    const url = '/application/application-window.html?game=royalExchange&role=teacher';
    const win = window.open(url, '_blank');
    if (!win) {
        showNotification('Popup blocked. Opening in current window...', 'warning');
        window.location.href = url;
        return;
    }
    showNotification('Royal Exchange opened in a new tab', 'success');
}

window.openRoyalExchangeAsMe = openRoyalExchangeAsMe;

function openHopeMateAsMe() {
    const playerDetails = getTeacherAsPlayerDetails();
    if (!playerDetails) return;
    try {
        localStorage.setItem('hopeMatePlayers', JSON.stringify(playerDetails));
    } catch (e) {
        console.warn('Unable to persist hopeMatePlayers to localStorage:', e);
    }
    const url = '/application/application-window.html?game=hopeMate&role=teacher';
    const win = window.open(url, '_blank');
    if (!win) {
        showNotification('Popup blocked. Opening in current window...', 'warning');
        window.location.href = url;
        return;
    }
    showNotification('Hope Mate opened in a new tab', 'success');
}

window.openHopeMateAsMe = openHopeMateAsMe;

function openNoBlunderAsMe() {
    const playerDetails = getTeacherAsPlayerDetails();
    if (!playerDetails) return;
    try {
        localStorage.setItem('noBlunderPlayers', JSON.stringify(playerDetails));
    } catch (e) {
        console.warn('Unable to persist noBlunderPlayers to localStorage:', e);
    }
    const url = '/application/application-window.html?game=noBlunder&role=teacher';
    const win = window.open(url, '_blank');
    if (!win) {
        showNotification('Popup blocked. Opening in current window...', 'warning');
        window.location.href = url;
        return;
    }
    showNotification('No Blunder opened in a new tab', 'success');
}

window.openNoBlunderAsMe = openNoBlunderAsMe;

function openTruceboardNewTab() {
    const url = '/truceboard/index.html';
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
        showNotification('Popup blocked. Opening Truceboard in current tab...', 'warning');
        window.location.href = url;
        return;
    }
    showNotification('Truceboard opened in a new tab', 'success');
}

window.openTruceboardNewTab = openTruceboardNewTab;

async function confirmApplicationStudentPicker() {
    const key = String(applicationPickGameKey || '');
    if (key !== 'monsterFight') {
        showNotification('Please choose Monster Fight from the App tab.', 'error');
        return;
    }
    if (selectedGameStudents.length === 0) {
        showNotification('Please select at least one student', 'error');
        return;
    }

    await startMonsterFight();

    closeApplicationModal();
    applicationPickGameKey = null;
}

window.confirmApplicationStudentPicker = confirmApplicationStudentPicker;

function closeApplicationModal() {
    const modal = document.getElementById('applicationModal');
    if (modal) {
        modal.classList.remove('show');
        // Restore default title & sections for legacy modal usage
        const titleEl = document.getElementById('applicationModalTitle');
        if (titleEl) titleEl.textContent = '🎮 Application';
        const gs = document.getElementById('applicationCatalogSection');
        const ss = document.getElementById('applicationStudentPickSection');
        const ga = document.getElementById('applicationEmbedSection');
        if (gs) gs.style.display = 'block';
        if (ss) ss.style.display = 'block';
        if (ga) ga.style.display = 'none';
        applicationPickGameKey = null;
        showApplicationCatalog();
    }
}

function toggleApplicationModalSize() {
    const modalContent = document.getElementById('applicationModalContent');
    if (!modalContent) return;
    
    // Cycle through: normal -> large -> fullscreen -> normal
    if (applicationModalSize === 'normal') {
        applicationModalSize = 'large';
        modalContent.classList.remove('application-modal-fullscreen');
        modalContent.classList.add('application-modal-large');
    } else if (applicationModalSize === 'large') {
        applicationModalSize = 'fullscreen';
        modalContent.classList.remove('application-modal-large');
        modalContent.classList.add('application-modal-fullscreen');
    } else {
        applicationModalSize = 'normal';
        modalContent.classList.remove('application-modal-fullscreen', 'application-modal-large');
    }
}

function toggleApplicationModalFullscreen() {
    const modalContent = document.getElementById('applicationModalContent');
    if (!modalContent) return;
    
    modalContent.classList.toggle('application-modal-fullscreen');
    if (modalContent.classList.contains('application-modal-fullscreen')) {
        applicationModalSize = 'fullscreen';
    } else {
        applicationModalSize = 'normal';
        modalContent.classList.remove('application-modal-large');
    }
}
