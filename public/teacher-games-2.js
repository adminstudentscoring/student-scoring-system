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
