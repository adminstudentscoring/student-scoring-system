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

function showApplicationCatalog() {
    document.getElementById('applicationCatalogSection').style.display = 'block';
    document.getElementById('applicationStudentPickSection').style.display = 'block';
    document.getElementById('applicationEmbedSection').style.display = 'none';
    
    // Load application catalog
    const catalogList = document.getElementById('applicationCatalogList');
    if (catalogList) {
        catalogList.innerHTML = `
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
            <div class="game-item" onclick="openChessAnalysisBoard()">
                <div class="game-icon">🔍</div>
                <div class="game-info">
                    <h4>Chess Analysis</h4>
                    <p>FEN / PGN board, setup position, and move navigation</p>
                </div>
            </div>
            <div class="game-item" onclick="startMonsterFight()">
                <div class="game-icon">
                    <img src="/application/monster-fight/images/Logo.png" alt="Monster Fight" style="width:44px; height:44px; border-radius:12px; object-fit:cover; background:#f3f4f6; border:1px solid #e5e7eb;">
                </div>
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

function openChessAnalysisBoard() {
    const url = '/chess-analysis/';
    const win = window.open(url, 'ChessAnalysis', 'width=1100,height=820,resizable=yes,scrollbars=yes');
    if (!win) {
        showNotification('Popup blocked. Opening Chess Analysis in this tab...', 'warning');
        window.location.href = url;
        return;
    }
    showNotification('Chess Analysis opened in a new tab', 'success');
}

window.openChessAnalysisBoard = openChessAnalysisBoard;

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
        const gameUrl = '/application/monster-fight/index.html';
        
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
    const playerDetails = buildPlayersForApplication();
    if (!playerDetails) return;

    window.runningQueenPlayers = playerDetails;
    window.currentGameKey = 'runningQueen';
    try {
        localStorage.setItem('runningQueenPlayers', JSON.stringify(playerDetails));
    } catch (error) {
        console.warn('Unable to persist running queen players to localStorage:', error);
    }

    showApplicationEmbed();

    const gameAreaContent = document.getElementById('applicationEmbedContent');
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
            script.src = '/application/running-queen/running-queen.js';
            script.onload = () => {
                window.runningQueenLoaded = true;
                ensureScriptLoaded();
            };
            script.onerror = (error) => {
                console.error('Error loading running-queen/running-queen.js:', error);
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
    const playerDetails = buildPlayersForApplication();
    if (!playerDetails) return;

    window.royalExchangePlayers = playerDetails;
    window.currentGameKey = 'royalExchange';
    try {
        localStorage.setItem('royalExchangePlayers', JSON.stringify(playerDetails));
    } catch (error) {
        console.warn('Unable to persist royal exchange players to localStorage:', error);
    }

    showApplicationEmbed();

    const gameAreaContent = document.getElementById('applicationEmbedContent');
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
            script.src = '/application/royal-exchange/royal-exchange.js';
            script.onload = () => {
                window.royalExchangeLoaded = true;
                ensureScriptLoaded();
            };
            script.onerror = (error) => {
                console.error('Error loading royal-exchange/royal-exchange.js:', error);
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
    const playerDetails = buildPlayersForApplication();
    if (!playerDetails) return;

    window.noBlunderPlayers = playerDetails;
    window.currentGameKey = 'noBlunder';
    try {
        localStorage.setItem('noBlunderPlayers', JSON.stringify(playerDetails));
    } catch (error) {
        console.warn('Unable to persist no blunder players to localStorage:', error);
    }

    showApplicationEmbed();

    const gameAreaContent = document.getElementById('applicationEmbedContent');
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
            link.href = '/application/no-blunder/no-blunder.css';
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
            script.src = '/application/no-blunder/no-blunder.js';
            script.onload = () => {
                window.noBlunderLoaded = true;
                ensureScriptLoaded();
            };
            script.onerror = (error) => {
                console.error('Error loading no-blunder/no-blunder.js:', error);
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
    const playerDetails = buildPlayersForApplication();
    if (!playerDetails) return;

    window.blundersPlayers = playerDetails;
    window.currentGameKey = 'blunders';
    try {
        localStorage.setItem('blundersPlayers', JSON.stringify(playerDetails));
    } catch (error) {
        console.warn('Unable to persist blunders players to localStorage:', error);
    }

    showApplicationEmbed();

    const gameAreaContent = document.getElementById('applicationEmbedContent');
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
            link.href = '/application/blunders/blunders.css';
            document.head.appendChild(link);
        }

        const ensureScriptLoaded = () => {
            if (window.initBlunders) {
                window.initBlunders();
            } else {
                console.error('initBlunders function not found');
            }
        };

        const hasBlundersModules = () => !!(window.BlundersCore && window.BlundersTeacher && window.BlundersChallenge && window.BlundersStudent && window.initBlunders);
        if (!window.blundersLoaded || !hasBlundersModules()) {
            if (window.blundersLoaded && !hasBlundersModules()) {
                console.warn('Blunders modules missing (possibly due to cached blundersLoaded). Reloading scripts...');
            }
            const loadJs = (src) => new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src;
                s.onload = () => resolve();
                s.onerror = (e) => reject(e);
                document.body.appendChild(s);
            });
            loadJs('/application/blunders/core.js')
                .then(() => loadJs('/application/blunders/teacher.js'))
                .then(() => loadJs('/application/blunders/challenge.js'))
                .then(() => loadJs('/application/blunders/student.js'))
                .then(() => loadJs('/application/blunders/blunders.js'))
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
    let playerDetails = buildPlayersForApplication();
    if (!playerDetails) return;
    if (playerDetails.length > 1) {
        playerDetails = [playerDetails[0]];
    }

    window.hopeMatePlayers = playerDetails;
    window.currentGameKey = 'hopeMate';
    try {
        localStorage.setItem('hopeMatePlayers', JSON.stringify(playerDetails));
    } catch (error) {
        console.warn('Unable to persist Hope Mate players to localStorage:', error);
    }

    showApplicationEmbed();

    const gameAreaContent = document.getElementById('applicationEmbedContent');
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
            link.href = '/application/hope-mate/hope-mate.css';
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
            script.src = '/application/hope-mate/hope-mate.js';
            script.onload = () => {
                window.hopeMateLoaded = true;
                ensureScriptLoaded();
            };
            script.onerror = (error) => {
                console.error('Error loading hope-mate/hope-mate.js:', error);
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

    showApplicationEmbed();
    const gameAreaContent = document.getElementById('applicationEmbedContent');
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
        link.href = '/application/vchess-platform/vchess-platform.css';
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
        loadScript('/application/vchess-platform/normal-chess.js')
            .then(() => loadScript('/application/vchess-platform/vchess-platform.js'))
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

function showApplicationEmbed() {
    document.getElementById('applicationCatalogSection').style.display = 'none';
    document.getElementById('applicationStudentPickSection').style.display = 'none';
    document.getElementById('applicationEmbedSection').style.display = 'block';
}

function loadGameStudents() {
    const container = document.getElementById('applicationStudentPickList');
    if (!container) return;
    
    const searchTerm = (document.getElementById('applicationStudentSearch')?.value || '').toLowerCase();
    const filteredStudents = students.filter(student => 
        String(student.name || '').toLowerCase().includes(searchTerm) ||
        String(student.chessComId || '').toLowerCase().includes(searchTerm)
    );
    
    container.innerHTML = filteredStudents.map(student => {
        const isSelected = selectedGameStudents.includes(student.id);
        return `
            <div class="student-selector-item ${isSelected ? 'selected' : ''}" data-student-id="${student.id}">
                <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleGameStudent('${student.id}')">
                <span>${escapeHtml(student.name)}</span>
                <span style="margin-left: auto; color: #999; font-size: 0.9rem;">${escapeHtml(student.chessComId || '')}</span>
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
        const gameWindow = window.open(`${window.location.origin}/application/application-window.html?${query}`, 'gameWindow');
        if (!gameWindow) {
            showNotification('Please allow popups to open game in new window', 'error');
        }
    } else {
        // In browser, create a new window with the game content
        const gameWindow = window.open(`/application/application-window.html?${query}`, 'gameWindow', 'width=1200,height=800,alwaysOnTop=yes');
        if (!gameWindow) {
            showNotification('Please allow popups to open game in new window', 'error');
        }
    }
}

// Make functions globally available
window.toggleGameStudent = toggleGameStudent;

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

    const url = '/application/application-window.html?game=vChessPlatform&role=teacher';
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
document.getElementById('applicationModalClose')?.addEventListener('click', closeApplicationModal);
document.getElementById('applicationModalSizeBtn')?.addEventListener('click', toggleApplicationModalSize);
document.getElementById('applicationModalFullscreenBtn')?.addEventListener('click', toggleApplicationModalFullscreen);
document.getElementById('backToApplicationCatalog')?.addEventListener('click', showApplicationCatalog);
document.getElementById('openGameInNewWindow')?.addEventListener('click', openGameInNewWindow);
document.getElementById('applicationStudentSearch')?.addEventListener('input', loadGameStudents);
document.getElementById('selectAllStudents')?.addEventListener('click', selectAllGameStudents);
document.getElementById('deselectAllStudents')?.addEventListener('click', deselectAllGameStudents);
document.getElementById('applicationStudentPickerCancelBtn')?.addEventListener('click', closeApplicationModal);
document.getElementById('applicationStudentPickerConfirmBtn')?.addEventListener('click', () => {
    confirmApplicationStudentPicker().catch((e) => {
        console.error('Application confirm error:', e);
        showNotification('Failed to start app', 'error');
    });
});

// Close modal when clicking outside
document.getElementById('applicationModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'applicationModal') {
        closeApplicationModal();
    }
});

