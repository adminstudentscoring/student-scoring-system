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
        if (classViewLoadSelectedDay) {
            classViewLoadRestoreDayAfterReload = classViewLoadSelectedDay;
        }
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
    window.resizeTo(390, 820);
}

// Collapsible footer (Save / Load / Reset)
(function setupClassViewFooterToggle() {
    const footer = document.getElementById('classViewFooter');
    const toggle = document.getElementById('cvFooterToggle');
    if (!footer || !toggle) {
        console.warn('[ClassView UI Smoke] setupClassViewFooterToggle: missing #classViewFooter or #cvFooterToggle');
        return;
    }
    toggle.addEventListener('click', () => {
        const collapsed = footer.classList.toggle('cv-footer-collapsed');
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        console.info('[ClassView UI Smoke] Tools toggled', {
            collapsed,
            ariaExpanded: toggle.getAttribute('aria-expanded'),
            panelHidden: footer.classList.contains('cv-footer-collapsed')
        });
    });
    console.info('[ClassView UI Smoke] Footer toggle ready', {
        build: CLASS_VIEW_ASSETS_BUILD,
        panelChildButtons: document.getElementById('cvFooterPanel')?.querySelectorAll('button').length
    });
})();

runClassViewUiSmokeTest('script-parsed');

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => runClassViewUiSmokeTest('DOMContentLoaded'));
} else {
    runClassViewUiSmokeTest('DOM-already-ready');
}

window.addEventListener('load', () => {
    runClassViewUiSmokeTest('window-load');
});

setTimeout(() => runClassViewUiSmokeTest('delayed-1.5s'), 1500);

// Filter logic
document.getElementById('classViewSearch')?.addEventListener('input', renderClassView);

