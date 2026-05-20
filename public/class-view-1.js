// API_BASE is defined in auth.js, use window.authUtils.authenticatedFetch instead
let selectedStudents = [];
let allStudents = [];
let ws = null;
let challengeData = null;
let challengeEnabled = true;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let isResizing = false;
let resizeStart = { x: 0, y: 0 };
let windowStartSize = { width: 0, height: 0 };
const _recordingInProgress = new Set();

/** Bump with class-view.html ?v= when shipping UI fixes (smoke logs reference this). */
const CLASS_VIEW_ASSETS_BUILD = 'cv20260405';

/**
 * UI smoke test: stylesheets, footer buttons, HP label, search, collapsible panel, student bar labels.
 * Call from console: runClassViewUiSmokeTest('manual')
 */
function runClassViewUiSmokeTest(phase) {
    const tag = `[ClassView UI Smoke / ${phase}]`;
    const log = (msg, obj) => {
        if (obj !== undefined) {
            console.info(tag, msg, obj);
        } else {
            console.info(tag, msg);
        }
    };

    log('build', CLASS_VIEW_ASSETS_BUILD);
    log('href', window.location.href);
    log('titlebar removed', { titlebarPresent: !!document.getElementById('titlebar') });

    const sheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => ({
        href: l.href,
        hasCssSheet: !!l.sheet
    }));
    log('stylesheet link count', sheets.length);
    sheets.forEach((s, i) => log(`  sheet[${i}]`, s));

    const saveBtn = document.getElementById('saveProgressBtn');
    if (saveBtn) {
        const cs = window.getComputedStyle(saveBtn);
        log('Save button', {
            className: saveBtn.className,
            backgroundColor: cs.backgroundColor,
            color: cs.color,
            borderRadius: cs.borderRadius,
            border: cs.border,
            fontSize: cs.fontSize
        });
    } else {
        console.warn(tag, 'saveProgressBtn MISSING');
    }

    const toolsBtn = document.getElementById('cvFooterToggle');
    const footer = document.getElementById('classViewFooter');
    const panel = document.getElementById('cvFooterPanel');
    if (footer && panel && toolsBtn) {
        const pcs = window.getComputedStyle(panel);
        log('Footer toolbar', {
            footerClasses: footer.className,
            collapsed: footer.classList.contains('cv-footer-collapsed'),
            panelDisplay: pcs.display,
            toolsAriaExpanded: toolsBtn.getAttribute('aria-expanded')
        });
    } else {
        console.warn(tag, 'footer DOM incomplete', { footer: !!footer, panel: !!panel, toolsBtn: !!toolsBtn });
    }

    const hpEl = document.getElementById('hpBarText');
    if (hpEl) {
        const r = hpEl.getBoundingClientRect();
        const cs = window.getComputedStyle(hpEl);
        log('HP bar text', {
            textContent: hpEl.textContent,
            rect: { w: r.width, h: r.height },
            display: cs.display,
            visibility: cs.visibility,
            opacity: cs.opacity,
            color: cs.color,
            zIndex: cs.zIndex
        });
    } else {
        console.warn(tag, 'hpBarText MISSING — old HTML?');
    }

    const search = document.getElementById('classViewSearch');
    if (search) {
        const cs = window.getComputedStyle(search);
        log('Search field', {
            className: search.className,
            borderRadius: cs.borderRadius,
            backgroundColor: cs.backgroundColor
        });
    }

    const labels = document.querySelectorAll('.progress-bar-label');
    log('Student progress-bar-label count', labels.length);
    if (labels.length) {
        log('First progress label sample', { text: labels[0].textContent });
    }

    const levelName = document.getElementById('levelName');
    if (levelName) {
        log('Level title text', levelName.textContent);
    }

    const rewardEl = document.querySelector('.level-reward');
    if (rewardEl) {
        const pr = rewardEl.getBoundingClientRect();
        const hdr = document.querySelector('.challenge-header-inner');
        const hr = hdr ? hdr.getBoundingClientRect() : null;
        log('Reward position (expect right side of header)', {
            rewardRight: pr.right,
            headerRight: hr ? hr.right : null,
            roughlyAlignedRight: hr ? Math.abs(pr.right - hr.right) < 24 : null
        });
    }

    const overlay = document.querySelector('.monster-hp-overlay');
    const slot = document.querySelector('.monster-image-slot');
    log('Monster HP overlay', {
        overlayExists: !!overlay,
        slotExists: !!slot,
        hpInsideSlot: overlay && slot ? slot.contains(overlay) : false
    });

    log('Legacy monster name node (should be gone)', {
        monsterNameRemoved: !document.getElementById('monsterName')
    });

    const card = document.querySelector('.class-student-card');
    if (card) {
        const hasBgClass = card.classList.contains('class-student-card-badge-bg');
        const hasVar = (card.getAttribute('style') || '').includes('--student-badge');
        const hasImgBadge = !!card.querySelector('img.level-badge');
        log('Student card badge treatment', {
            hasBgClass,
            hasCssVar: hasVar,
            cornerImgBadgeGone: !hasImgBadge
        });
    }

    const pb = document.querySelector('.class-student-progress .progress-bar');
    const pl = document.querySelector('.progress-bar-label');
    if (pb && pl) {
        const csp = window.getComputedStyle(pl);
        log('Progress label centering', { position: csp.position });
    }

    const bodyBg = document.body ? window.getComputedStyle(document.body).backgroundColor : '';
    log('Theme (dark gray)', { bodyBackground: bodyBg });
}

window.runClassViewUiSmokeTest = runClassViewUiSmokeTest;

function classViewResolveAssetUrl(relativePath) {
    try {
        return new URL(relativePath, window.location.href).toString();
    } catch {
        return relativePath;
    }
}

function classViewMonsterImageSrcByName(name) {
    const n = String(name || '').toLowerCase();
    if (!n) return null;
    // NOTE: Use relative paths so it works in both http(s) and Electron file:// loads.
    // Fallback when org custom levels omit imageUrl (legacy).
    if (n.includes('slime')) return 'assets/class-view-monster/Slime.png';
    if (n.includes('goblin')) return 'assets/class-view-monster/Goblin.png';
    if (n.includes('orc')) return 'assets/class-view-monster/Orc.png';
    if (n.includes('dragon')) return 'assets/class-view-monster/Dragon.png';
    if (n.includes('demon')) return 'assets/class-view-monster/Demon.png';
    return null;
}

/** Prefer levelInfo.imageUrl (relative or absolute); else legacy name→asset mapping. */
function classViewResolveMonsterImageSrc(levelInfo) {
    if (!levelInfo) return null;
    const raw = typeof levelInfo.imageUrl === 'string' ? levelInfo.imageUrl.trim() : '';
    if (raw) {
        if (/^https?:\/\//i.test(raw)) return raw;
        const path = raw.replace(/^\//, '');
        return classViewResolveAssetUrl(path);
    }
    const byName = classViewMonsterImageSrcByName(levelInfo.name);
    return byName ? classViewResolveAssetUrl(byName) : null;
}

async function loadClassViewSettings() {
    try {
        let response;
        if (typeof window.authUtils !== 'undefined' && window.authUtils.authenticatedFetch) {
            response = await window.authUtils.authenticatedFetch('/class-view/settings');
        } else {
            response = await fetch('/api/class-view/settings');
        }
        if (!response || !response.ok) return null;
        return await response.json();
    } catch (error) {
        console.warn('Unable to load class view settings, using defaults:', error);
        return null;
    }
}

function applyChallengeModeEnabled(enabled) {
    challengeEnabled = enabled !== false; // default true
    const challengeSection = document.getElementById('challengeSection');
    if (challengeSection) {
        challengeSection.style.display = challengeEnabled ? '' : 'none';
    }
}

// Load auth.js utilities
if (typeof window.authUtils === 'undefined') {
    console.warn('auth.js not loaded, authentication features may not work');
}

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

// Merge incoming challenge data while preserving levelInfo/allLevels already
// obtained from loadChallenge(). The POST /answer response and the WebSocket
// 'answerRecorded' payload do NOT include levelInfo, so a naive overwrite
// causes updateChallengeDisplay() to silently bail out, leaving the HP bar
// and monster display stale.
function mergeChallengeData(incoming) {
    if (!incoming) return;
    if (!challengeData) {
        challengeData = incoming;
        return;
    }
    const prevLevelInfo = challengeData.levelInfo;
    const prevAllLevels = challengeData.allLevels;
    Object.assign(challengeData, incoming);
    if (!challengeData.levelInfo && prevLevelInfo) challengeData.levelInfo = prevLevelInfo;
    if (!challengeData.allLevels && prevAllLevels) challengeData.allLevels = prevAllLevels;
}

// Handle WebSocket messages
function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'studentAdded':
        case 'studentUpdated':
        case 'answerRecorded':
            if (challengeEnabled && data.challenge) {
                mergeChallengeData(data.challenge);
                updateChallengeDisplay();
            }
            loadStudents();
            break;
        case 'studentDeleted':
        case 'reset':
            loadStudents();
            if (challengeEnabled) loadChallenge();
            break;
        case 'damageDealt':
            if (!challengeEnabled) break;
            showAttackAnimation(data);
            updateChallengeHP(data.currentHP, data.maxHP);
            break;
        case 'levelCompleted':
            if (!challengeEnabled) break;
            showLevelCompleteAnimation(data.level, data.reward);
            loadChallenge();
            loadStudents();
            break;
        case 'challengeReset':
        case 'challengeLoaded':
            if (!challengeEnabled) break;
            challengeData = data.challenge;
            updateChallengeDisplay();
            break;
    }
}

// Load all students and filter selected ones
async function loadStudents() {
    try {
        // Use authenticated fetch if available, otherwise fallback to regular fetch
        let response;
        if (typeof window.authUtils !== 'undefined' && window.authUtils.authenticatedFetch) {
            response = await window.authUtils.authenticatedFetch('/students');
            if (!response) return; // Auth failed, will redirect
        } else {
            response = await fetch('/api/students');
        }
        
        const data = await response.json();
        allStudents = Array.isArray(data) ? data : (data.students || []);
        
        // Get selected student IDs from server (teacher's class view selection)
        let selectedIds = [];
        if (typeof window.authUtils !== 'undefined' && window.authUtils.hasRole('teacher')) {
            try {
                const classViewResponse = await window.authUtils.authenticatedFetch('/teachers/class-view/students');
                if (classViewResponse && classViewResponse.ok) {
                    const classViewData = await classViewResponse.json();
                    selectedIds = classViewData.selectedStudentIds || [];
                }
            } catch (error) {
                console.warn('Could not load class view selection, using localStorage fallback:', error);
                // Fallback to localStorage
                selectedIds = JSON.parse(localStorage.getItem('selectedStudentIds') || '[]');
            }
        } else {
            // Fallback to localStorage for backward compatibility
            selectedIds = JSON.parse(localStorage.getItem('selectedStudentIds') || '[]');
        }
        
        // Filter and maintain selection order
        selectedStudents = selectedIds
            .map(id => allStudents.find(s => s.id === id))
            .filter(s => s !== undefined); // Remove any students that no longer exist
        
        // Send selected student IDs to server (for challenge mode)
        await updateSelectedStudentsOnServer(selectedIds);
        
        renderClassView();
    } catch (error) {
        console.error('Error loading students:', error);
    }
}

// Update selected students on server
async function updateSelectedStudentsOnServer(selectedIds) {
    try {
        if (!challengeEnabled) return;
        if (typeof window.authUtils !== 'undefined' && window.authUtils.authenticatedFetch) {
            await window.authUtils.authenticatedFetch('/challenge/selected-students', {
                method: 'POST',
                body: JSON.stringify({ selectedStudentIds: selectedIds })
            });
        } else {
            await fetch('/api/challenge/selected-students', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selectedStudentIds: selectedIds })
            });
        }
    } catch (error) {
        console.error('Error updating selected students on server:', error);
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

/** Score / current-rank ceiling for progress bar label (e.g. 369/500). */
