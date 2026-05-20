async function initTeacherPermission() {
    const listEl = document.getElementById('tsTeacherList');
    const statusEl = document.getElementById('tsStatus');
    if (!listEl || !statusEl) return;

    statusEl.textContent = 'Loading...';
    listEl.innerHTML = '';
    teacherPermissionState.loading = true;
    teacherPermissionState.error = null;

    try {
        const resp = await window.authUtils.authenticatedFetch('/organizations/teachers');
        if (!resp || !resp.ok) {
            throw new Error('Failed to load teachers');
        }
        const data = await resp.json();
        const teachers = Array.isArray(data) ? data : (Array.isArray(data.teachers) ? data.teachers : []);
        teacherPermissionState.teachers = teachers;
        teacherPermissionState.filtered = teachers;
        statusEl.textContent = `${teachers.length} teacher(s)`;
        renderTeacherPermissionList();
    } catch (err) {
        console.error('load teachers failed', err);
        teacherPermissionState.error = err;
        statusEl.textContent = 'Error loading teachers';
        listEl.innerHTML = `<div class="empty-state" style="padding:12px; color:#c00;">${err.message || 'Error loading teachers'}</div>`;
    } finally {
        teacherPermissionState.loading = false;
    }
}

function renderTeacherPermissionList() {
    const listEl = document.getElementById('tsTeacherList');
    const statusEl = document.getElementById('tsStatus');
    if (!listEl) return;

    const items = teacherPermissionState.filtered || [];
    if (statusEl) statusEl.textContent = teacherPermissionState.loading ? 'Loading...' : `${items.length} teacher(s)`;

    if (items.length === 0) {
        listEl.innerHTML = `<div class="empty-state" style="padding:12px; color:#666;">No teachers found.</div>`;
        return;
    }

    listEl.innerHTML = items.map(t => {
        const name = t.name || 'Unknown';
        const email = t.email || t.username || '';
        const tid = t.teacherId || '';
        return `
            <div class="settings-group" style="display:flex; align-items:center; justify-content: space-between; gap:10px; border:1px solid #eee; border-radius:8px; padding:10px 12px; background:#fff;">
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:600;">${name}</span>
                    <span style="color:#666; font-size:0.9rem;">${email}</span>
                    ${tid ? `<span style="color:#999; font-size:0.8rem;">ID: ${tid}</span>` : ''}
                </div>
                <button class="btn btn-primary" onclick="openTeacherPermissionModal('${t.id || ''}', '${name.replace(/'/g, "\\'")}')">Manage</button>
            </div>
        `;
    }).join('');
}

function filterTeacherPermissionList() {
    const input = document.getElementById('tsSearchInput');
    if (!input) return;
    const keyword = input.value.trim().toLowerCase();
    if (!keyword) {
        teacherPermissionState.filtered = teacherPermissionState.teachers;
    } else {
        teacherPermissionState.filtered = teacherPermissionState.teachers.filter(t => {
            const name = (t.name || '').toLowerCase();
            const email = (t.email || t.username || '').toLowerCase();
            const tid = (t.teacherId || '').toLowerCase();
            return name.includes(keyword) || email.includes(keyword) || tid.includes(keyword);
        });
    }
    renderTeacherPermissionList();
}

let currentTeacherId = null;

function openTeacherPermissionModal(teacherId, teacherName = '') {
    const modal = document.getElementById('tsPermissionModal');
    const titleEl = document.getElementById('tsModalTitle');
    if (!modal) return;
    if (titleEl) titleEl.textContent = teacherName ? `Teacher Permissions - ${teacherName}` : 'Teacher Permissions';
    
    currentTeacherId = teacherId;
    switchTsPermissionTab('edit');
    modal.style.display = 'flex';
}

function closeTeacherPermissionModal() {
    const modal = document.getElementById('tsPermissionModal');
    if (modal) modal.style.display = 'none';
    currentTeacherId = null;
}

async function confirmTeacherPermission() {
    if (!currentTeacherId) return;
    
    // Gather permissions
    const permissions = {
        addStudent: document.getElementById('tsPerm_addStudent')?.checked || false,
        deleteStudent: document.getElementById('tsPerm_deleteStudent')?.checked || false,
        editScore: document.getElementById('tsPerm_editScore')?.checked || false,
        editStudentProfile: document.getElementById('tsPerm_editStudentProfile')?.checked || false,
        editSharePwd: document.getElementById('tsPerm_editSharePwd')?.checked || false
    };
    
    try {
        const response = await window.authUtils.authenticatedFetch(`/organizations/teachers/${currentTeacherId}/permissions`, {
            method: 'PUT',
            body: JSON.stringify(permissions)
        });
        
        if (!response.ok) {
            throw new Error('Failed to update permissions');
        }
        
        // Update local state if needed
        const teacher = teacherPermissionState.teachers.find(t => t.id === currentTeacherId);
        if (teacher) {
            teacher.teacherPermissions = permissions;
        }
        
        closeTeacherPermissionModal();
        alert('Permissions saved successfully.');
    } catch (error) {
        console.error('Save permissions failed', error);
        alert('Error saving permissions: ' + error.message);
    }
