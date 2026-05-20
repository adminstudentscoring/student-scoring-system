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

