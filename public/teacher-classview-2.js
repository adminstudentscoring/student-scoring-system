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
