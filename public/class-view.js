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
    if (n.includes('slime')) return 'assets/class-view-monster/Slime.png';
    if (n.includes('goblin')) return 'assets/class-view-monster/Goblin.png';
    if (n.includes('orc')) return 'assets/class-view-monster/Orc.png';
    if (n.includes('dragon')) return 'assets/class-view-monster/Dragon.png';
    if (n.includes('demon')) return 'assets/class-view-monster/Demon.png';
    return null;
}

function classViewDebug(...args) {
    // Keep logs low-noise but always available for troubleshooting.
    // eslint-disable-next-line no-console
    console.log('[class-view][monster]', ...args);
}

// Always log one line so we can confirm the latest script is loaded.
// eslint-disable-next-line no-console
console.log('[class-view] class-view.js loaded (monster-images v3)', { href: window.location.href });

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

// Handle WebSocket messages
function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'studentAdded':
        case 'studentUpdated':
        case 'answerRecorded':
            if (challengeEnabled && data.challenge) {
                challengeData = data.challenge;
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

// Render class view
function renderClassView() {
    const container = document.getElementById('studentsSection');
    if (!container) return;

    // Create grid container if not exists
    if (!document.getElementById('studentsGridContainer')) {
        container.innerHTML = '<div id="studentsGridContainer" class="students-grid-container"></div>';
    }
    const gridContainer = document.getElementById('studentsGridContainer');

    // Filter students
    const searchInput = document.getElementById('classViewSearch');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const filteredStudents = selectedStudents.filter(student =>
        !searchTerm || student.name.toLowerCase().includes(searchTerm)
    );

    // Empty state
    if (filteredStudents.length === 0) {
        if (selectedStudents.length === 0) {
            container.innerHTML = '<div class="no-students">No students selected. Please select students from the main dashboard.</div>';
        } else {
            gridContainer.innerHTML = '<div class="no-students" style="width:100%; text-align:center; padding:20px; color:#aaa;">No matching students found.</div>';
        }
        return;
    }

    // Render cards
    gridContainer.innerHTML = filteredStudents.map((student, index) => {
        const rankInfo = getRankInfo(student.score || 0);
        const currentRank = rankInfo.rank;
        const currentRankIndex = rankInfo.rankIndex;

        // Rank-specific background colors
        const rankColors = [
            'linear-gradient(135deg, #8B4513 0%, #A0522D 100%)', // Wood
            'linear-gradient(135deg, #CD7F32 0%, #B87333 100%)', // Bronze
            'linear-gradient(135deg, #C0C0C0 0%, #A8A8A8 100%)', // Silver
            'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', // Gold
            'linear-gradient(135deg, #E5E4E2 0%, #D3D3D3 100%)', // Platinum
            'linear-gradient(135deg, #B9F2FF 0%, #00CED1 100%)', // Diamond
            'linear-gradient(135deg, #9370DB 0%, #663399 100%)', // Candidate Master
            'linear-gradient(135deg, #FF1493 0%, #C71585 100%)', // Master
            'linear-gradient(135deg, #FF4500 0%, #FF6347 100%)', // International Master
            'linear-gradient(135deg, #FF0000 0%, #8B0000 100%)'  // Grand Master
        ];

        // Rank emoji icons
        const rankEmojis = [
            '🟫', // Wood
            '🥉', // Bronze
            '🥈', // Silver
            '🥇', // Gold
            '💎', // Platinum
            '💠', // Diamond
            '👑', // Candidate Master
            '⭐', // Master
            '🌟', // International Master
            '✨'  // Grand Master
        ];

        return `
            <div class="class-student-card" style="background: ${rankColors[currentRankIndex]}" data-student-id="${student.id}">
                <div class="class-student-row class-student-row-1">
                    <h3 class="class-student-name">${escapeHtml(student.name)}</h3>
                    <div class="class-student-rank">${rankEmojis[currentRankIndex]}</div>
                </div>
                <div class="class-student-row class-student-row-2">
                    <div class="class-student-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${rankInfo.progress}%"></div>
                        </div>
                    </div>
                </div>
                <div class="class-student-row class-student-row-3">
                    <div class="class-student-score">${student.score || 0}</div>
                    <div class="class-student-actions">
                        <input type="number" class="class-points-input" id="class-points-${student.id}" min="1" max="100" value="1">
                        <button class="class-add-btn" onclick="recordPoints('${student.id}')">Add Points</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Record points
async function recordPoints(studentId) {
    const input = document.getElementById(`class-points-${studentId}`);
    if (!input) {
        return;
    }

    const points = parseInt(input.value, 10) || 1;

    if (isNaN(points) || points < 1 || points > 100) {
        return;
    }

    // Find student card for animation
    const studentCard = document.querySelector(`.class-student-card[data-student-id="${studentId}"]`);
    const button = document.querySelector(`button[onclick*="${studentId}"]`);
    const buttonRect = button ? button.getBoundingClientRect() : null;

    try {
        const response = await fetch(`/api/students/${studentId}/answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: points })
        });

        if (!response.ok) {
            throw new Error('Failed to record points');
        }

        const result = await response.json();
        const student = result.student || result;

        // Show points popup animation
        if (buttonRect) {
            showPointsPopup(buttonRect, points);
        }

        // Flash student card
        if (studentCard) {
            studentCard.classList.add('card-flash');
            setTimeout(() => studentCard.classList.remove('card-flash'), 500);
        }

        // Show particle effect for high points
        if (points >= 10 && buttonRect) {
            createParticleEffect(buttonRect, points);
        }

        // Update challenge if present
        if (result.challenge) {
            challengeData = result.challenge;
            updateChallengeDisplay();
        }

        // Reset input to 1
        input.value = 1;
        loadStudents();
    } catch (error) {
        console.error('Error recording points:', error);
    }
}

// Make window draggable (only for browser, Electron uses -webkit-app-region: drag)
function setupDragging() {
    // In Electron, dragging is handled by CSS -webkit-app-region: drag
    if (window.navigator.userAgent.indexOf('Electron') !== -1) {
        return; // Skip manual dragging in Electron
    }

    const titlebar = document.getElementById('titlebar');
    if (!titlebar) return;

    titlebar.addEventListener('mousedown', (e) => {
        if (e.target.closest('.titlebar-buttons')) {
            return; // Don't drag if clicking on buttons
        }
        isDragging = true;
        dragOffset.x = e.clientX;
        dragOffset.y = e.clientY;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const deltaX = e.clientX - dragOffset.x;
            const deltaY = e.clientY - dragOffset.y;
            
            // Move window (browser only)
            try {
                window.moveBy(deltaX, deltaY);
            } catch (e) {
                // moveBy may not be available in all browsers
                console.warn('Window moveBy not available');
            }
            
            dragOffset.x = e.clientX;
            dragOffset.y = e.clientY;
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
}

// Window controls
document.getElementById('closeBtn').addEventListener('click', () => {
    window.close();
});

document.getElementById('minimizeBtn').addEventListener('click', () => {
    // In Electron, minimize should work via window.blur() or window.focus()
    // For browser, minimize is not directly possible
    if (window.navigator.userAgent.indexOf('Electron') !== -1) {
        // In Electron, we can try to minimize using window methods
        // However, since we're using frameless window, we need IPC
        // For now, just close or do nothing
        // TODO: Add IPC support for minimize in Electron
    }
    // For browser, we can't truly minimize
    // Optionally, we could post a message to parent window
});

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Listen for updates from parent window
window.addEventListener('storage', async (e) => {
    if (e.key === 'selectedStudentIds') {
        const selectedIds = JSON.parse(e.newValue || '[]');
        // Update selected students on server when localStorage changes
        await updateSelectedStudentsOnServer(selectedIds);
        loadStudents();
    }
});

// Challenge Mode Functions
async function loadChallenge() {
    try {
        if (!challengeEnabled) return;
        let response;
        if (typeof window.authUtils !== 'undefined' && window.authUtils.authenticatedFetch) {
             response = await window.authUtils.authenticatedFetch('/challenge');
        } else {
             response = await fetch('/api/challenge');
        }
        
        if (response.ok) {
            challengeData = await response.json();
            updateChallengeDisplay();
        }
    } catch (error) {
        console.error('Failed to load challenge:', error);
    }
}

function updateChallengeDisplay() {
    if (!challengeData || !challengeData.levelInfo) return;
    
    const levelInfo = challengeData.levelInfo;
    const hpPercent = (challengeData.currentHP / levelInfo.maxHP) * 100;
    
    const levelEmoji = document.getElementById('levelEmoji');
    const levelName = document.getElementById('levelName');
    const levelReward = document.getElementById('levelReward');
    const monsterEmoji = document.getElementById('monsterEmoji');
    const monsterAvatar = document.getElementById('monsterAvatar');
    const monsterName = document.getElementById('monsterName');
    const currentHP = document.getElementById('currentHP');
    const maxHP = document.getElementById('maxHP');
    const hpFill = document.getElementById('hpFill');
    
    if (levelEmoji) levelEmoji.textContent = levelInfo.emoji;
    if (levelName) levelName.textContent = `Level ${challengeData.currentLevel}: ${levelInfo.name}`;
    if (levelReward) levelReward.textContent = levelInfo.reward;

    const monsterImgRel = classViewMonsterImageSrcByName(levelInfo.name);
    const monsterImgSrc = monsterImgRel ? classViewResolveAssetUrl(monsterImgRel) : null;
    classViewDebug('updateChallengeDisplay', {
        href: window.location.href,
        levelName: levelInfo.name,
        emoji: levelInfo.emoji,
        monsterImgRel,
        monsterImgSrc
    });
    if (monsterAvatar) {
        if (monsterImgSrc) {
            // Default to emoji until image confirms it loaded (prevents blank UI on 404).
            if (monsterEmoji) monsterEmoji.style.display = '';
            monsterAvatar.style.display = 'none';
            monsterAvatar.alt = levelInfo.name || 'Monster';
            monsterAvatar.onload = () => {
                monsterAvatar.style.display = '';
                if (monsterEmoji) monsterEmoji.style.display = 'none';
                classViewDebug('image onload', {
                    src: monsterAvatar.src,
                    naturalWidth: monsterAvatar.naturalWidth,
                    naturalHeight: monsterAvatar.naturalHeight,
                    clientWidth: monsterAvatar.clientWidth,
                    clientHeight: monsterAvatar.clientHeight
                });
            };
            monsterAvatar.onerror = () => {
                monsterAvatar.style.display = 'none';
                if (monsterEmoji) monsterEmoji.style.display = '';
                classViewDebug('image onerror', {
                    src: monsterAvatar.src,
                    levelName: levelInfo.name
                });
            };
            if (monsterAvatar.src !== monsterImgSrc) {
                classViewDebug('setting image src', monsterImgSrc);
                monsterAvatar.src = monsterImgSrc;
            }
        } else {
            monsterAvatar.removeAttribute('src');
            monsterAvatar.style.display = 'none';
            monsterAvatar.alt = 'Monster';
        }
    }
    if (monsterEmoji) {
        monsterEmoji.textContent = levelInfo.emoji;
        // If we have a candidate image, emoji will be hidden after image loads successfully.
        monsterEmoji.style.display = monsterImgSrc ? '' : '';
    }

    if (monsterName) monsterName.textContent = levelInfo.name;
    if (currentHP) currentHP.textContent = challengeData.currentHP;
    if (maxHP) maxHP.textContent = levelInfo.maxHP;
    if (hpFill) {
        hpFill.style.width = `${hpPercent}%`;
        
        // Update HP bar color based on percentage
        if (hpPercent > 50) {
            hpFill.style.background = 'linear-gradient(90deg, #10b981 0%, #059669 100%)';
        } else if (hpPercent > 25) {
            hpFill.style.background = 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)';
        } else {
            hpFill.style.background = 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)';
        }
    }
}

function showAttackAnimation(data) {
    const animationArea = document.getElementById('attackAnimationArea');
    if (!animationArea) return;
    
    // Create attack effect
    const attackEffect = document.createElement('div');
    attackEffect.className = 'attack-effect';
    attackEffect.textContent = '⚔️';
    attackEffect.style.left = '50%';
    attackEffect.style.top = '50%';
    attackEffect.style.transform = 'translate(-50%, -50%)';
    animationArea.appendChild(attackEffect);
    
    // Create damage number
    const damageNumber = document.createElement('div');
    damageNumber.className = 'damage-number';
    damageNumber.textContent = `-${data.damage}`;
    damageNumber.style.left = '50%';
    damageNumber.style.top = '40%';
    damageNumber.style.transform = 'translate(-50%, -50%)';
    animationArea.appendChild(damageNumber);
    
    // Remove after animation
    setTimeout(() => {
        attackEffect.remove();
        damageNumber.remove();
    }, 1000);
    
    // Shake monster
    const monsterDisplay = document.getElementById('monsterDisplay');
    if (monsterDisplay) {
        monsterDisplay.style.animation = 'none';
        setTimeout(() => {
            monsterDisplay.style.animation = 'shake 0.5s';
        }, 10);
    }
}

function updateChallengeHP(currentHP, maxHP) {
    const hpPercent = (currentHP / maxHP) * 100;
    const currentHPElem = document.getElementById('currentHP');
    const hpFill = document.getElementById('hpFill');
    
    if (currentHPElem) currentHPElem.textContent = currentHP;
    if (hpFill) {
        hpFill.style.width = `${hpPercent}%`;
        
        // Update HP bar color
        if (hpPercent > 50) {
            hpFill.style.background = 'linear-gradient(90deg, #10b981 0%, #059669 100%)';
        } else if (hpPercent > 25) {
            hpFill.style.background = 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)';
        } else {
            hpFill.style.background = 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)';
        }
    }
}

function showLevelCompleteAnimation(level, reward) {
    const monsterDisplay = document.getElementById('monsterDisplay');
    if (monsterDisplay) {
        monsterDisplay.classList.add('monster-defeated');
    }
    
    // Show level complete notification (you can create a notification system if needed)
    console.log(`🎉 Level ${level} Completed! All students received +${reward} points!`);
    
    // Reset monster display after animation
    setTimeout(() => {
        if (monsterDisplay) {
            monsterDisplay.classList.remove('monster-defeated');
        }
    }, 1000);
}

// Points popup animation
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

// Save/Load Progress Buttons
document.getElementById('saveProgressBtn')?.addEventListener('click', openSaveModal);
document.getElementById('loadProgressBtn')?.addEventListener('click', openLoadModal);

// Reset challenge button (No confirmation)
document.getElementById('resetChallengeBtn')?.addEventListener('click', async () => {
    try {
        if (!challengeEnabled) return;
        const response = await fetch('/api/challenge/reset', {
            method: 'POST'
        });
        if (response.ok) {
            await loadChallenge();
            // showNotification('Challenge reset', 'success'); // Need to implement showNotification first
        }
    } catch (error) {
        console.error('Failed to reset challenge:', error);
    }
});

// Make recordPoints and loadChallenge available globally
window.recordPoints = recordPoints;
window.loadChallenge = loadChallenge;

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Save/Load Logic
function generateTimeOptions() {
    const timeSelect = document.getElementById('saveTime');
    if (!timeSelect) return;
    timeSelect.innerHTML = '<option value="">Select time...</option>';
    for (let hour = 8; hour <= 22; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
            if (hour === 22 && minute > 0) break;
            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            const option = document.createElement('option');
            option.value = timeStr;
            option.textContent = timeStr;
            timeSelect.appendChild(option);
        }
    }
}

function openSaveModal() {
    generateTimeOptions();
    const modal = document.getElementById('saveModal');
    if (modal) {
        modal.classList.add('show');
        document.getElementById('saveDay').value = '';
        document.getElementById('saveTime').value = '';
    }
}

function closeSaveModal() {
    const modal = document.getElementById('saveModal');
    if (modal) modal.classList.remove('show');
}

function openLoadModal() {
    const modal = document.getElementById('loadModal');
    if (modal) {
        modal.classList.add('show');
        loadSavesList();
    }
}

function closeLoadModal() {
    const modal = document.getElementById('loadModal');
    if (modal) {
        modal.classList.remove('show');
        document.getElementById('saveSearchInput').value = '';
    }
}

async function saveProgress() {
    const day = document.getElementById('saveDay').value;
    const time = document.getElementById('saveTime').value;
    
    if (!day || !time) {
        showNotification('Please select both day and time', 'error');
        return;
    }
    
    try {
        let response;
        const body = JSON.stringify({ day, time });
        if (typeof window.authUtils !== 'undefined' && window.authUtils.authenticatedFetch) {
             response = await window.authUtils.authenticatedFetch('/challenge/save', { method: 'POST', body });
        } else {
             response = await fetch('/api/challenge/save', { method: 'POST', headers: {'Content-Type': 'application/json'}, body });
        }
        
        if (!response.ok) throw new Error('Failed to save');
        
        showNotification('Progress saved successfully!', 'success');
        closeSaveModal();
    } catch (error) {
        showNotification('Failed to save progress', 'error');
    }
}

async function loadSavesList() {
    try {
        let response;
        if (typeof window.authUtils !== 'undefined' && window.authUtils.authenticatedFetch) {
             response = await window.authUtils.authenticatedFetch('/challenge/saves');
        } else {
             response = await fetch('/api/challenge/saves');
        }
        
        if (!response.ok) throw new Error('Failed to load saves');
        const saves = await response.json();
        renderSavesList(saves);
    } catch (error) {
        showNotification('Failed to load saves list', 'error');
    }
}

function renderSavesList(saves) {
    const recentSavesList = document.getElementById('recentSavesList');
    const allSavesList = document.getElementById('allSavesList');
    if (!recentSavesList || !allSavesList) return;
    
    const recentSaves = saves.slice(0, 5);
    
    recentSavesList.innerHTML = recentSaves.length ? recentSaves.map(s => createSaveItemHTML(s)).join('') : '<div class="no-saves">No recent saves</div>';
    allSavesList.innerHTML = saves.length ? saves.map(s => createSaveItemHTML(s)).join('') : '<div class="no-saves">No saves found</div>';
}

function createSaveItemHTML(save) {
    const savedDate = new Date(save.savedAt);
    const dateStr = savedDate.toLocaleDateString() + ' ' + savedDate.toLocaleTimeString();
    const levelName = `Level ${save.challenge.currentLevel}`; 
    return `
        <div class="save-item">
            <div class="save-item-info">
                <div class="save-item-header">
                    <span class="save-item-day">${escapeHtml(save.day)}</span>
                    <span class="save-item-time">${escapeHtml(save.time)}</span>
                    <span class="save-item-level">${levelName}</span>
                </div>
                <div class="save-item-details">HP: ${save.challenge.currentHP} | Saved: ${dateStr}</div>
            </div>
            <div class="save-item-actions">
                <button class="save-item-btn load" onclick="loadProgress('${escapeHtml(save.filename)}')">Load</button>
                <button class="save-item-btn delete" onclick="deleteSave('${escapeHtml(save.filename)}')">Delete</button>
            </div>
        </div>
    `;
}

async function loadProgress(filename) {
    if (!confirm('Load this save? Current progress will be lost.')) return;
    try {
        let response;
        const body = JSON.stringify({ filename });
        if (typeof window.authUtils !== 'undefined' && window.authUtils.authenticatedFetch) {
             response = await window.authUtils.authenticatedFetch('/challenge/load', { method: 'POST', body });
        } else {
             response = await fetch('/api/challenge/load', { method: 'POST', headers: {'Content-Type': 'application/json'}, body });
        }
        if (!response.ok) throw new Error('Failed to load');
        
        showNotification('Progress loaded!', 'success');
        closeLoadModal();
        if (challengeEnabled) loadChallenge();
    } catch (error) {
        showNotification('Failed to load progress', 'error');
    }
}

async function deleteSave(filename) {
    if (!confirm('Delete this save?')) return;
    try {
        let response;
        const url = `/challenge/saves/${encodeURIComponent(filename)}`;
        if (typeof window.authUtils !== 'undefined' && window.authUtils.authenticatedFetch) {
             response = await window.authUtils.authenticatedFetch(url, { method: 'DELETE' });
        } else {
             response = await fetch('/api' + url, { method: 'DELETE' });
        }
        if (!response.ok) throw new Error('Failed to delete');
        
        showNotification('Save deleted', 'success');
        loadSavesList();
    } catch (error) {
        showNotification('Failed to delete save', 'error');
    }
}

// Make functions global
window.loadProgress = loadProgress;
window.deleteSave = deleteSave;

// Listeners
document.getElementById('saveModalClose')?.addEventListener('click', closeSaveModal);
document.getElementById('loadModalClose')?.addEventListener('click', closeLoadModal);
document.getElementById('confirmSaveBtn')?.addEventListener('click', saveProgress);
document.getElementById('cancelSaveBtn')?.addEventListener('click', closeSaveModal);

// Initialize (load settings first)
(async () => {
    const settings = await loadClassViewSettings();
    applyChallengeModeEnabled(settings?.classViewMode?.enabled);
initWebSocket();
setupDragging();
loadStudents();
    if (challengeEnabled) loadChallenge();
})();

// Set initial window size (narrow and tall)
if (window.navigator.userAgent.indexOf('Electron') === -1) {
    window.resizeTo(350, 800);
}


// Filter logic
document.getElementById('classViewSearch')?.addEventListener('input', renderClassView);

// Batch Add Points logic
document.getElementById('batchAddPointsBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('batchPointsInput');
    if (!input) return;
    
    const points = parseInt(input.value, 10);
    if (isNaN(points) || points < 1) {
        alert('Please enter a valid positive number');
        return;
    }
    
    if (!confirm('Add ' + points + ' points to ALL visible students?')) return;
    
    // Get currently filtered/visible students
    const searchInput = document.getElementById('classViewSearch');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    const targets = selectedStudents.filter(student =>
        !searchTerm || student.name.toLowerCase().includes(searchTerm)
    );
    
    if (targets.length === 0) return;
    
    let successCount = 0;
    
    // Process in parallel chunks to avoid overwhelming server if many students
    const chunks = [];
    const chunkSize = 5;
    for (let i = 0; i < targets.length; i += chunkSize) {
        chunks.push(targets.slice(i, i + chunkSize));
    }
    
    for (const chunk of chunks) {
        await Promise.all(chunk.map(async (student) => {
            try {
                const response = await fetch('/api/students/' + student.id + '/answer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ points: points })
                });
                if (response.ok) successCount++;
            } catch(e) { console.error(e); }
        }));
    }
    
    // Refresh (WebSocket will trigger reload anyway, but just in case)
    if (challengeEnabled) loadChallenge();
    
    // Show quick toast/alert
    // Since we don't have showNotification here easily accessible without more code copying, native alert or just relying on UI update is fine.
    // Or we can create a simple temp toast.
    const toast = document.createElement('div');
    toast.textContent = 'Added ' + points + ' points to ' + successCount + ' students!';
    toast.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:#10b981; color:white; padding:10px 20px; border-radius:4px; z-index:9999;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
});

