// Load teacher's class view selection
async function loadClassViewSelection() {
    try {
        const response = await apiFetch('/teachers/class-view/students');
        if (response && response.ok) {
            const data = await response.json();
            selectedClassStudentIds = new Set(data.selectedStudentIds || []);
            updateSelectedCount();
            renderClassStudentsList();
        }
    } catch (error) {
        console.warn('Could not load class view selection:', error);
    }
}

// Render class students list with checkboxes
function renderClassStudentsList() {
    const container = document.getElementById('classStudentsList');
    const searchTerm = document.getElementById('classSearchInput')?.value.toLowerCase() || '';
    
    const filteredStudents = students.filter(student =>
        String(student.name || '').toLowerCase().includes(searchTerm) ||
        String(student.chessComId || '').toLowerCase().includes(searchTerm)
    );

    if (filteredStudents.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">No students found.</p>';
        updateSelectedCount();
        return;
    }

    container.innerHTML = filteredStudents.map(student => {
        const isChecked = selectedClassStudentIds.has(student.id);
        return `
            <label class="class-student-checkbox">
                <input type="checkbox" 
                       value="${student.id}" 
                       ${isChecked ? 'checked' : ''} 
                       onchange="toggleStudentSelection('${student.id}')">
                <span>${escapeHtml(student.name)} (${escapeHtml(student.chessComId || '')})</span>
            </label>
        `;
    }).join('');
    
    updateSelectedCount();
}

// Toggle student selection (using selectedClassStudentIds Set)
function toggleStudentSelection(studentId) {
    if (selectedClassStudentIds.has(studentId)) {
        selectedClassStudentIds.delete(studentId);
    } else {
        selectedClassStudentIds.add(studentId);
    }
    
    updateSelectedCount();
    renderClassStudentsList();
}

// Clear all class selections
async function clearClassSelections() {
    const previous = localStorage.getItem('selectedStudentIds') || '[]';
    localStorage.setItem('selectedStudentIds', JSON.stringify([]));
    renderClassStudentsList();
    updateSelectedCount();
    
    // Update selected students on server
    try {
        await apiFetch('/challenge/selected-students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selectedStudentIds: [] })
        });
    } catch (error) {
        console.error('Error updating selected students on server:', error);
    }
    
    window.dispatchEvent(new StorageEvent('storage', {
        key: 'selectedStudentIds',
        oldValue: previous,
        newValue: JSON.stringify([])
    }));
    showNotification('Class selection cleared', 'info');
}

// Clear all class selections (using selectedClassStudentIds Set)
function clearClassSelection() {
    selectedClassStudentIds.clear();
    renderClassStudentsList();
    updateSelectedCount();
    showNotification('Class selection cleared', 'info');
}

// Save Class View selection
async function saveClassViewSelection() {
    try {
        const selectedIds = Array.from(selectedClassStudentIds);
        const response = await apiFetch('/teachers/class-view/students', {
            method: 'POST',
            body: JSON.stringify({ studentIds: selectedIds })
        });

        if (!response) return;

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save');
        }

        showNotification('Class View selection saved successfully!', 'success');
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
}

// Update selected count display
function updateSelectedCount() {
    const count = selectedClassStudentIds.size;
    const countElement = document.getElementById('selectedCount');
    if (countElement) {
        countElement.textContent = `${count} selected`;
    }
}

// Open class view window
function openClassView() {
    const selectedIds = Array.from(selectedClassStudentIds);
    
    if (selectedIds.length === 0) {
        showNotification('Please select at least one student first', 'error');
        return;
    }
    
    // Check if running in Electron
    if (window.navigator.userAgent.indexOf('Electron') !== -1) {
        // Use IPC to open window in Electron
        if (window.electronAPI && window.electronAPI.openClassView) {
            window.electronAPI.openClassView();
        } else {
            // Fallback to window.open if IPC not available
            window.open('class-view.html?v=cv20260405', 'classView', 'width=390,height=820,resizable=yes');
        }
    } else {
        // Browser environment - use window.open
        const classWindow = window.open(
            'class-view.html?v=cv20260405',
            'classView',
            'width=390,height=820,resizable=yes,scrollbars=yes,alwaysRaised=yes'
        );
        
        if (!classWindow) {
            showNotification('Please allow popups for this site to open the class view', 'error');
            return;
        }
        
        // Try to set window properties (browser-dependent)
        try {
            classWindow.resizeTo(390, 820);
        } catch (e) {
            // Ignore errors if we can't resize
        }
    }
}

// Class search functionality
document.getElementById('classSearchInput').addEventListener('input', renderClassStudentsList);

// Class search functionality
document.getElementById('classSearchInput')?.addEventListener('input', renderClassStudentsList);

// Clear class selection button
document.getElementById('clearClassSelectionBtn')?.addEventListener('click', clearClassSelection);

// Open class view button
document.getElementById('openClassViewBtn')?.addEventListener('click', openClassView);
document.getElementById('saveClassViewBtn')?.addEventListener('click', saveClassViewSelection);

// Student view button (if exists)
document.getElementById('viewStudentBtn')?.addEventListener('click', () => {
    window.open('student.html', '_blank');
});

// Make functions available globally
window.toggleStudentSelection = toggleStudentSelection;
window.openClassView = openClassView;


// Initialize
initWebSocket();
loadStudents();
initRightSidebar();

// Check for current class
async function checkCurrentClass() {
    const section = document.getElementById('currentClassSection');
    if (!section || !currentUser) return;
    
    // Ensure timetable data is loaded
    if ((!window.timetableEntries || window.timetableEntries.length === 0) && window.loadTimetableData) {
        await window.loadTimetableData();
    }
    
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[now.getDay()];
    const currentDateStr = now.toISOString().split('T')[0];
    
    // Find Active Entry
    const activeEntry = (window.timetableEntries || []).find(entry => {
        if (!entry.teacherIds || !entry.teacherIds.includes(currentUser.id)) return false;
        
        if (entry.isRecurring) {
            if (!entry.dayOfWeek.includes(currentDay)) return false;
            if (entry.startDate && entry.startDate > currentDateStr) return false;
            if (entry.endDate && entry.endDate < currentDateStr) return false;
        } else {
            if (entry.date !== currentDateStr) return false;
        }
        
        const [sh, sm] = entry.startTime.split(':').map(Number);
        const [eh, em] = entry.endTime.split(':').map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;
        const nowMins = now.getHours() * 60 + now.getMinutes();
        
        return nowMins >= (startMins - 15) && nowMins < endMins;
    });
    
    // Update Current Class Widget UI
    const title = document.getElementById('currentClassTitle');
    const info = document.getElementById('currentClassInfo');
    const time = document.getElementById('currentClassTime');
    const count = document.getElementById('currentClassStudentCount');
    const btn = document.getElementById('startCurrentClassBtn');
    const list = document.getElementById('currentClassStudents');
    
    if (activeEntry) {
        // Active State
        section.style.borderLeft = '5px solid #10b981';
        section.style.background = '#f0fdf4';
        
        title.textContent = '🟢 Current Class';
        title.style.color = '#059669';
        
        info.textContent = activeEntry.className;
        info.style.color = '#065f46';
        
        time.textContent = `${activeEntry.startTime} - ${activeEntry.endTime}`;
        time.style.color = '#047857';
        
        const students = getStudentsForEntry(activeEntry, currentDateStr);
        
        count.style.display = 'block';
        count.textContent = `${students.length} Students`;
        count.style.color = '#065f46';
        
        btn.style.display = 'inline-block';
        btn.onclick = () => startClassFromEntry(activeEntry);
        
        // Add Attendance Button dynamically
        let attBtn = document.getElementById('attCurrentClassBtn');
        if (!attBtn) {
            attBtn = document.createElement('button');
            attBtn.id = 'attCurrentClassBtn';
            attBtn.className = 'btn btn-info';
            attBtn.textContent = '📝 Attendance';
            attBtn.style.marginTop = '5px';
            attBtn.style.marginLeft = '5px';
            attBtn.style.border = 'none';
            if (btn.parentNode) btn.parentNode.appendChild(attBtn);
        }
        attBtn.style.display = 'inline-block';
        attBtn.onclick = () => openAttendanceModal(activeEntry);
        
        list.style.display = 'block';
        list.textContent = students.map(s => s.name).join(', ') || 'No students enrolled';
        list.style.color = '#065f46';
        
        currentClassEntry = activeEntry;
        section.setAttribute('onmouseenter', `showClassTooltip(event, '${activeEntry.id}')`);
        section.setAttribute('onmouseleave', 'hideClassTooltip()');
    } else {
        // No Active Class State
        section.style.borderLeft = '5px solid #ccc';
        section.style.background = '#f9fafb';
        
        title.textContent = '⚪ Current Class';
        title.style.color = '#666';
        
        info.textContent = 'No active class';
        info.style.color = '#333';
        
        time.textContent = '';
        
        count.style.display = 'none';
        btn.style.display = 'none';
        list.style.display = 'none';
        
        currentClassEntry = null;
        section.removeAttribute('onmouseenter');
        section.removeAttribute('onmouseleave');
    }
    
    // Render All Classes Today
    renderTodaysClasses(currentDateStr, currentDay);
}

function getStudentsForEntry(entry, dateStr) {
    const seriesIds = entry.studentIds || [];
    const enrollments = (window.timetableEnrollments || []).filter(e => 
        e.timetableEntryId === entry.id && 
        e.date === dateStr
    );
    const singleIds = enrollments.map(e => e.studentId);
    const allIds = [...new Set([...seriesIds, ...singleIds])];
    return students.filter(s => allIds.includes(s.id));
}

function startClassFromEntry(entry) {
    if (!entry) return;
    
    const now = new Date();
    const currentDateStr = now.toISOString().split('T')[0];
    const classStudents = getStudentsForEntry(entry, currentDateStr);
    
    // 1. Deselect All
    selectedClassStudentIds.clear();
    
    // 2. Select Class Students
    classStudents.forEach(s => selectedClassStudentIds.add(s.id));
    
    // 3. Save Selection
    saveClassViewSelection();
    
    // 4. Open Class View
    openClassView();
    
    updateSelectedCount();
    renderClassStudentsList();
}

function renderTodaysClasses(dateStr, dayName) {
    const container = document.getElementById('todaysClassesList');
    if (!container || !currentUser) return;
    
    // Filter entries for today
    const todaysEntries = (window.timetableEntries || []).filter(entry => {
        if (!entry.teacherIds || !entry.teacherIds.includes(currentUser.id)) return false;
        
        if (entry.isRecurring) {
            if (!entry.dayOfWeek.includes(dayName)) return false;
            if (entry.startDate && entry.startDate > dateStr) return false;
            if (entry.endDate && entry.endDate < dateStr) return false;
        } else {
            if (entry.date !== dateStr) return false;
        }
        return true;
    });
    
    // Sort by Start Time
    todaysEntries.sort((a, b) => a.startTime.localeCompare(b.startTime));
    
    if (todaysEntries.length === 0) {
        container.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">No classes today.</p>';
        return;
    }
    
    // Find next/active class index
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    
    // Find the first class that ends AFTER now (so active or future)
    let nextClassIndex = todaysEntries.findIndex(e => e.endTime > nowTime);
    // If all ended, stay at last? Or -1
    if (nextClassIndex === -1 && todaysEntries.length > 0 && todaysEntries[todaysEntries.length-1].endTime < nowTime) {
        // All finished
        nextClassIndex = todaysEntries.length - 1; 
    }
    if (nextClassIndex === -1) nextClassIndex = 0;
    
    container.innerHTML = todaysEntries.map((entry, index) => {
        const isNext = index === nextClassIndex;
        const students = getStudentsForEntry(entry, dateStr);
        
        return `
            <div class="todays-class-item ${isNext ? 'next-class' : ''}" id="class-item-${index}" style="padding: 15px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; background: ${isNext ? '#f0fdf4' : 'white'}; border-left: ${isNext ? '4px solid #10b981' : 'none'};" onmouseenter="showClassTooltip(event, '${entry.id}')" onmouseleave="hideClassTooltip()">
                <div>
                    <div style="font-weight: bold; font-size: 1.05rem; color: ${isNext ? '#059669' : '#333'};">
                        ${escapeHtml(entry.className)}  
                        ${isNext ? '<span style="font-size: 0.8rem; background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; margin-left: 5px;">Target</span>' : ''}
                    </div>
                    <div style="color: #666; font-size: 0.9rem;">${entry.startTime} - ${entry.endTime}</div>
                    <div style="color: #888; font-size: 0.85rem;">${students.length} Students</div>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button class="btn btn-sm btn-info" onclick="openAttendanceModalWithId('${entry.id}')">Attendance</button>
                    <button class="btn btn-sm btn-primary" onclick="startClassFromEntryWithId('${entry.id}')">Start Class</button>
                </div>
            </div>
        `;
    }).join('');
    
    // Scroll to next class if container is scrollable
    // Using setTimeout to ensure render
    if (window.hasScrolledToClass !== dateStr) { // Simple debounce
        setTimeout(() => {
            const nextEl = document.getElementById(`class-item-${nextClassIndex}`);
            if (nextEl) {
                nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 500);
        window.hasScrolledToClass = dateStr;
    }
}

// Attendance Logic
function openAttendanceModal(entry) {
    if (!entry) return;
    
    const modal = document.getElementById('attendanceModal');
    if (modal) {
        modal.classList.add('show');
        document.getElementById('attClassName').textContent = entry.className;
        document.getElementById('attClassTime').textContent = `${entry.startTime} - ${entry.endTime}`;
        
        // Load students
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const students = getStudentsForEntry(entry, dateStr);
        
        // Load existing attendance
        loadTeacherAttendanceData(entry.id, dateStr, students);
    }
}

function closeAttendanceModal() {
    const modal = document.getElementById('attendanceModal');
    if (modal) modal.classList.remove('show');
}

async function loadTeacherAttendanceData(entryId, dateStr, students) {
    const container = document.getElementById('attStudentList');
    container.innerHTML = '<p style="padding:10px;">Loading...</p>';
    
    let currentAttendance = [];
    try {
        const response = await apiFetch(`/attendance?timetableEntryId=${entryId}&date=${dateStr}`);
        if (response.ok) {
            currentAttendance = await response.json();
        }
    } catch(e) { console.error(e); }
    
    if (students.length === 0) {
        container.innerHTML = '<p style="padding:10px;">No students enrolled.</p>';
        return;
    }
    
    container.innerHTML = students.map(s => {
        const att = currentAttendance.find(r => r.studentId === s.id);
        const status = att ? att.status : 'unmarked';
        
        return `
        <div style="padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>${escapeHtml(s.name)}</strong> <span style="color:#666; font-size:0.9rem;">(${s.studentId})</span>
            </div>
            <div class="attendance-options">
                <select name="t_att_${s.id}" style="padding:5px; border-radius:4px; border:1px solid #ccc;">
                    <option value="unmarked" ${!status || status==='unmarked'?'selected':''}>Select Status</option>
                    <option value="present" ${status==='present'?'selected':''}>Present</option>
                    <option value="absent" ${status==='absent'?'selected':''}>Absent</option>
                    <option value="late" ${status==='late'?'selected':''}>Late</option>
                </select>
            </div>
        </div>
        `;
    }).join('');
    
    // Store context for save
    window.currentAttContext = { entryId, dateStr };
}

async function saveTeacherAttendance() {
    if (!window.currentAttContext) return;
    const { entryId, dateStr } = window.currentAttContext;
    
    const attendanceRecords = [];
    const selects = document.querySelectorAll('#attStudentList select[name^="t_att_"]');
    selects.forEach(s => {
        const studentId = s.name.replace('t_att_', '');
        if (s.value !== 'unmarked') {
            attendanceRecords.push({ studentId, status: s.value });
        }
    });
    
    try {
        const response = await apiFetch('/attendance', {
            method: 'POST',
            body: JSON.stringify({
                timetableEntryId: entryId,
                date: dateStr,
                records: attendanceRecords
            })
        });
        
        if (response.ok) {
            showNotification('Attendance saved!', 'success');
            closeAttendanceModal();
        } else {
            throw new Error('Failed to save');
        }
    } catch (e) {
        showNotification('Error saving attendance', 'error');
    }
}

// Make global
window.closeAttendanceModal = closeAttendanceModal;
window.saveTeacherAttendance = saveTeacherAttendance;
window.openAttendanceModalWithId = function(entryId) {
    const entry = (window.timetableEntries || []).find(e => e.id === entryId);
    if (entry) openAttendanceModal(entry);
};

window.startClassFromEntryWithId = function(entryId) {
    const entry = (window.timetableEntries || []).find(e => e.id === entryId);
    if (entry) startClassFromEntry(entry);
};

// ==================== Quick Class View Functions ====================

let tempClassViewSelection = new Set();

function openQuickClassViewModal() {
    const modal = document.getElementById('quickClassViewModal');
    if (!modal) return;
    
    // Initialize temp set with current selection
    tempClassViewSelection = new Set(selectedClassStudentIds);
    
    renderQuickClassViewList();
    updateQuickClassViewCount();
    modal.classList.add('show');
    
    // Focus search
    setTimeout(() => {
        document.getElementById('quickClassViewSearch')?.focus();
    }, 100);
}

function closeQuickClassViewModal() {
    const modal = document.getElementById('quickClassViewModal');
    if (modal) modal.classList.remove('show');
}

function renderQuickClassViewList() {
    const container = document.getElementById('quickClassViewList');
    if (!container) return;
    
    const searchTerm = document.getElementById('quickClassViewSearch')?.value.toLowerCase() || '';
    
    const filteredStudents = students.filter(student =>
        String(student.name || '').toLowerCase().includes(searchTerm) ||
        String(student.chessComId || '').toLowerCase().includes(searchTerm)
    );
    
    if (filteredStudents.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">No students found</div>';
        return;
    }
    
    container.innerHTML = filteredStudents.map(student => {
        const isChecked = tempClassViewSelection.has(student.id);
        // Escape function needs to be safe for inline HTML
        const safeName = escapeHtml(student.name);
        const safeId = escapeHtml(student.chessComId || '');
        
        return `
            <label style="display:flex; align-items:center; padding:8px; border-bottom:1px solid #eee; cursor:pointer;">
                <input type="checkbox" 
                       value="${student.id}" 
                       ${isChecked ? 'checked' : ''} 
                       onchange="toggleQuickClassViewSelection('${student.id}')"
                       style="margin-right:10px; width:18px; height:18px;">
                <span>${safeName} <span style="color:#888; font-size:0.9rem;">(${safeId})</span></span>
            </label>
        `;
    }).join('');
}

function toggleQuickClassViewSelection(studentId) {
    if (tempClassViewSelection.has(studentId)) {
        tempClassViewSelection.delete(studentId);
    } else {
        tempClassViewSelection.add(studentId);
    }
    updateQuickClassViewCount();
}

function quickClassViewSelectAll() {
    const searchTerm = document.getElementById('quickClassViewSearch')?.value.toLowerCase() || '';
    const filteredStudents = students.filter(student =>
        String(student.name || '').toLowerCase().includes(searchTerm) ||
        String(student.chessComId || '').toLowerCase().includes(searchTerm)
    );
    
    filteredStudents.forEach(s => tempClassViewSelection.add(s.id));
    renderQuickClassViewList();
    updateQuickClassViewCount();
}

function quickClassViewDeselectAll() {
    const searchTerm = document.getElementById('quickClassViewSearch')?.value.toLowerCase() || '';
    
    // If search is active, only deselect visible ones
    if (searchTerm) {
        const filteredStudents = students.filter(student =>
            String(student.name || '').toLowerCase().includes(searchTerm) ||
            String(student.chessComId || '').toLowerCase().includes(searchTerm)
        );
        filteredStudents.forEach(s => tempClassViewSelection.delete(s.id));
    } else {
        tempClassViewSelection.clear();
    }
    
    renderQuickClassViewList();
    updateQuickClassViewCount();
}

function updateQuickClassViewCount() {
    const el = document.getElementById('quickClassViewCount');
    if (el) el.textContent = tempClassViewSelection.size;
}

async function confirmQuickClassView() {
    // Update main selection
    selectedClassStudentIds = new Set(tempClassViewSelection);
    
    // Save to server
    await saveClassViewSelection(); // Reuse existing save function
    
    // Update main UI
    renderClassStudentsList();
    updateSelectedCount();
    
    closeQuickClassViewModal();
    
    // Optional: Ask to open Class View immediately
    if (confirm('Selection updated! Open Class View now?')) {
        openClassView();
    }
}

// Event Listeners for Quick Class View
document.getElementById('quickClassViewSearch')?.addEventListener('input', renderQuickClassViewList);

// Make global
window.openQuickClassViewModal = openQuickClassViewModal;
window.closeQuickClassViewModal = closeQuickClassViewModal;
window.toggleQuickClassViewSelection = toggleQuickClassViewSelection;
window.quickClassViewSelectAll = quickClassViewSelectAll;
window.quickClassViewDeselectAll = quickClassViewDeselectAll;
window.confirmQuickClassView = confirmQuickClassView;
