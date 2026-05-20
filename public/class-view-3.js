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
// Load modal bucket state (day -> times)
let classViewLoadSavesCache = [];
let classViewLoadSelectedDay = '';
let classViewLoadRestoreDayAfterReload = '';
let classViewLoadUiBound = false;

const CLASS_VIEW_DAYS = [
    { key: 'Monday', abbr: 'Mon' },
    { key: 'Tuesday', abbr: 'Tue' },
    { key: 'Wednesday', abbr: 'Wed' },
    { key: 'Thursday', abbr: 'Thu' },
    { key: 'Friday', abbr: 'Fri' },
    { key: 'Saturday', abbr: 'Sat' },
    { key: 'Sunday', abbr: 'Sun' }
];

function normalizeSaveDay(day) {
    const d = String(day || '').trim().toLowerCase();
    const found = CLASS_VIEW_DAYS.find(x => x.key.toLowerCase() === d || x.abbr.toLowerCase() === d);
    return found ? found.key : String(day || '').trim();
}

function bindClassViewLoadBucketUi() {
    if (classViewLoadUiBound) return;
    classViewLoadUiBound = true;

    const daysRoot = document.getElementById('loadBucketDays');
    const backBtn = document.getElementById('loadBucketBackBtn');
    const searchInput = document.getElementById('saveSearchInput');

    daysRoot?.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('[data-load-day]');
        if (!btn) return;
        const day = btn.getAttribute('data-load-day') || '';
        if (!day) return;
        if (btn.hasAttribute('disabled')) return;
        classViewOpenLoadDay(day);
    });

    backBtn?.addEventListener('click', () => {
        classViewRenderLoadDayBuckets();
    });

    searchInput?.addEventListener('input', () => {
        if (!classViewLoadSelectedDay) return;
        classViewRenderLoadTimesForDay(classViewLoadSelectedDay);
    });
}

function classViewSetLoadView(mode) {
    const daysRoot = document.getElementById('loadBucketDays');
    const timesWrap = document.getElementById('loadBucketTimesWrap');
    const searchGroup = document.getElementById('loadBucketSearchGroup');
    const searchInput = document.getElementById('saveSearchInput');

    if (mode === 'days') {
        if (daysRoot) daysRoot.style.display = '';
        if (timesWrap) timesWrap.style.display = 'none';
        if (searchGroup) searchGroup.style.display = 'none';
        if (searchInput) searchInput.value = '';
    } else {
        if (daysRoot) daysRoot.style.display = 'none';
        if (timesWrap) timesWrap.style.display = '';
        if (searchGroup) searchGroup.style.display = '';
    }
}

function classViewRenderLoadDayBuckets() {
    classViewLoadSelectedDay = '';
    classViewSetLoadView('days');

    const daysRoot = document.getElementById('loadBucketDays');
    if (!daysRoot) return;

    const counts = new Map();
    for (const s of classViewLoadSavesCache) {
        const key = normalizeSaveDay(s.day);
        counts.set(key, (counts.get(key) || 0) + 1);
    }

    daysRoot.innerHTML = CLASS_VIEW_DAYS.map(({ key, abbr }) => {
        const count = counts.get(key) || 0;
        const disabledAttr = count === 0 ? 'disabled' : '';
        return `
            <button type="button" class="cv-save-bucket-btn" data-load-day="${escapeHtml(key)}" ${disabledAttr}>
                <div class="cv-save-bucket-day">${escapeHtml(abbr)}</div>
                <div class="cv-save-bucket-count">${count} save${count === 1 ? '' : 's'}</div>
            </button>
        `;
    }).join('');
}

function classViewOpenLoadDay(day) {
    classViewLoadSelectedDay = normalizeSaveDay(day);
    classViewRenderLoadTimesForDay(classViewLoadSelectedDay);
}

function parseTimeToMinutes(timeStr) {
    const m = String(timeStr || '').match(/^(\d{2}):(\d{2})$/);
    if (!m) return Number.POSITIVE_INFINITY;
    return (parseInt(m[1], 10) * 60) + parseInt(m[2], 10);
}

function classViewCreateSaveTimeItemHTML(save) {
    const savedDate = new Date(save.savedAt);
    const dateStr = savedDate.toLocaleDateString() + ' ' + savedDate.toLocaleTimeString();
    const levelName = `Level ${save.challenge.currentLevel}`;
    return `
        <div class="save-item">
            <div class="save-item-info">
                <div class="save-item-header">
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

function classViewRenderLoadTimesForDay(day) {
    classViewSetLoadView('times');

    const titleEl = document.getElementById('loadBucketDayTitle');
    const listEl = document.getElementById('loadBucketTimesList');
    const searchInput = document.getElementById('saveSearchInput');
    if (!listEl) return;

    if (titleEl) titleEl.textContent = day;

    const term = String(searchInput?.value || '').trim().toLowerCase();
    const items = classViewLoadSavesCache
        .filter(s => normalizeSaveDay(s.day) === day)
        .filter(s => !term || String(s.time || '').toLowerCase().includes(term))
        .slice()
        .sort((a, b) => {
            const ta = parseTimeToMinutes(a.time);
            const tb = parseTimeToMinutes(b.time);
            if (ta !== tb) return ta - tb;
            return new Date(b.modifiedAt || b.savedAt || 0) - new Date(a.modifiedAt || a.savedAt || 0);
        });

    listEl.innerHTML = items.length
        ? items.map(s => classViewCreateSaveTimeItemHTML(s)).join('')
        : '<div class="no-saves">No saves found for this day</div>';
}

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
        bindClassViewLoadBucketUi();
        loadSavesList();
    }
}

function closeLoadModal() {
    const modal = document.getElementById('loadModal');
    if (modal) {
        modal.classList.remove('show');
        const input = document.getElementById('saveSearchInput');
        if (input) input.value = '';
        classViewLoadSelectedDay = '';
        classViewSetLoadView('days');
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
    classViewLoadSavesCache = Array.isArray(saves) ? saves : [];

    if (classViewLoadRestoreDayAfterReload) {
        const restoreDay = classViewLoadRestoreDayAfterReload;
        classViewLoadRestoreDayAfterReload = '';
        const hasDay = classViewLoadSavesCache.some(s => normalizeSaveDay(s.day) === restoreDay);
        if (hasDay) {
            classViewOpenLoadDay(restoreDay);
            return;
        }
    }

    classViewRenderLoadDayBuckets();
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
