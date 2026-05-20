function formatRankProgressCaption(rankInfo, score) {
    const s = Number(score) || 0;
    const cap = rankInfo.maxScore;
    if (cap === Infinity) {
        return `${s}/∞`;
    }
    return `${s}/${cap}`;
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
            gridContainer.innerHTML = '<div class="no-students" style="width:100%; text-align:center; padding:16px; color:#98989d;">No matching students found.</div>';
        }
        return;
    }

    // Render cards
    gridContainer.innerHTML = filteredStudents.map((student, index) => {
        const rankInfo = getRankInfo(student.score || 0);
        const currentRankIndex = rankInfo.rankIndex;

        const badgeSrc = levelBadgeSrcByRankIndex(currentRankIndex);
        const cardClass =
            badgeSrc != null && badgeSrc !== ''
                ? 'class-student-card class-student-card-badge-bg'
                : 'class-student-card';
        const cardStyle =
            badgeSrc != null && badgeSrc !== ''
                ? ` style="--student-badge: url(&quot;${String(badgeSrc).replace(/&/g, '&amp;')}&quot;)"`
                : '';

        return `
            <div class="${cardClass}"${cardStyle} data-student-id="${student.id}">
                <div class="class-student-row class-student-row-1">
                    <h3 class="class-student-name">${escapeHtml(student.name)}</h3>
                </div>
                <div class="class-student-row class-student-row-2">
                    <div class="class-student-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${rankInfo.progress}%"></div>
                            <span class="progress-bar-label">${formatRankProgressCaption(rankInfo, student.score)}</span>
                        </div>
                    </div>
                </div>
                <div class="class-student-row class-student-row-3">
                    <div class="class-student-actions">
                        <input type="number" class="class-points-input" id="class-points-${student.id}" min="1" max="100" value="1">
                        <button class="class-add-btn" onclick="recordPoints('${student.id}')">Add</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (filteredStudents.length > 0 && !window.__classViewSmokeLoggedStudentCards) {
        window.__classViewSmokeLoggedStudentCards = true;
        runClassViewUiSmokeTest('after-first-student-render');
    }
}

// Record points (with per-student lock to prevent rapid duplicate requests)
async function recordPoints(studentId) {
    if (_recordingInProgress.has(studentId)) return;

    const input = document.getElementById(`class-points-${studentId}`);
    if (!input) {
        return;
    }

    const points = parseInt(input.value, 10) || 1;

    if (isNaN(points) || points < 1 || points > 100) {
        return;
    }

    _recordingInProgress.add(studentId);

    // Find student card for animation
    const studentCard = document.querySelector(`.class-student-card[data-student-id="${studentId}"]`);
    const button = document.querySelector(`button[onclick*="${studentId}"]`);
    if (button) button.disabled = true;
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

        // Merge challenge data while preserving levelInfo from loadChallenge()
        if (result.challenge) {
            mergeChallengeData(result.challenge);
            updateChallengeDisplay();
        }

        // Reset input to 1
        input.value = 1;
        loadStudents();
    } catch (error) {
        console.error('Error recording points:', error);
    } finally {
        _recordingInProgress.delete(studentId);
        if (button) button.disabled = false;
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

// Title bar removed — close/minimize hooks only if present (e.g. legacy embeds)
document.getElementById('closeBtn')?.addEventListener('click', () => {
    window.close();
});

document.getElementById('minimizeBtn')?.addEventListener('click', () => {
    if (window.navigator.userAgent.indexOf('Electron') !== -1) {
        // Frameless Electron may need IPC to minimize
    }
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
    
    const levelName = document.getElementById('levelName');
    const levelReward = document.getElementById('levelReward');
    const monsterAvatar = document.getElementById('monsterAvatar');
    const monsterUnavailable = document.getElementById('monsterImageUnavailable');
    const hpBarText = document.getElementById('hpBarText');
    const hpBarTrack = document.getElementById('hpBarTrack');
    const hpFill = document.getElementById('hpFill');
    
    if (levelName) levelName.textContent = `Level ${challengeData.currentLevel}`;
    if (levelReward) levelReward.textContent = levelInfo.reward;

    const monsterImgSrc = classViewResolveMonsterImageSrc(levelInfo);

    if (monsterUnavailable) {
        monsterUnavailable.classList.remove('is-visible');
        monsterUnavailable.textContent = '';
    }
    if (monsterAvatar) {
        monsterAvatar.onload = null;
        monsterAvatar.onerror = null;
        if (monsterImgSrc) {
            monsterAvatar.alt = levelInfo.name || 'Monster';
            monsterAvatar.onload = () => {
                monsterAvatar.style.display = 'inline-block';
                if (monsterUnavailable) {
                    monsterUnavailable.classList.remove('is-visible');
                    monsterUnavailable.textContent = '';
                }
            };
            monsterAvatar.onerror = () => {
                monsterAvatar.style.display = 'none';
                monsterAvatar.removeAttribute('src');
                if (monsterUnavailable) {
                    monsterUnavailable.textContent = 'Image unavailable';
                    monsterUnavailable.classList.add('is-visible');
                }
            };
            if (monsterAvatar.src !== monsterImgSrc) {
                monsterAvatar.style.display = 'none';
                monsterAvatar.src = monsterImgSrc;
            } else if (monsterAvatar.complete && monsterAvatar.naturalWidth > 0) {
                monsterAvatar.style.display = 'inline-block';
                if (monsterUnavailable) {
                    monsterUnavailable.classList.remove('is-visible');
                    monsterUnavailable.textContent = '';
                }
            }
        } else {
            monsterAvatar.removeAttribute('src');
            monsterAvatar.style.display = 'none';
            monsterAvatar.alt = '';
            if (monsterUnavailable) {
                monsterUnavailable.textContent = 'No image for this level';
                monsterUnavailable.classList.add('is-visible');
            }
        }
    }

    if (hpBarText) {
        hpBarText.textContent = `${challengeData.currentHP}/${levelInfo.maxHP}`;
    }
    if (hpBarTrack) {
        hpBarTrack.setAttribute('aria-valuenow', String(challengeData.currentHP));
        hpBarTrack.setAttribute('aria-valuemax', String(levelInfo.maxHP));
    }
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

    if (typeof window !== 'undefined' && !window.__classViewSmokeLoggedChallenge) {
        window.__classViewSmokeLoggedChallenge = true;
        runClassViewUiSmokeTest('after-updateChallengeDisplay');
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
    const hpBarText = document.getElementById('hpBarText');
    const hpBarTrack = document.getElementById('hpBarTrack');
    const hpFill = document.getElementById('hpFill');
    
    if (hpBarText) hpBarText.textContent = `${currentHP}/${maxHP}`;
    if (hpBarTrack) {
        hpBarTrack.setAttribute('aria-valuenow', String(currentHP));
        hpBarTrack.setAttribute('aria-valuemax', String(maxHP));
    }
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
