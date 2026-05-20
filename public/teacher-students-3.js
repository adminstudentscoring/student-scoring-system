window.copyShareLink = function() {
    const input = document.getElementById('shareLinkInput');
    input.select();
    document.execCommand('copy');
    showNotification('Link copied!', 'success');
};

window.copyShareInfo = function() {
    const link = document.getElementById('shareLinkInput').value;
    const enabled = document.getElementById('enablePasswordToggle').checked;
    const password = document.getElementById('accessPassword').value;
    
    let text = `Student Link: ${link}`;
    if (enabled && password) {
        text += `\nStudent Password: ${password}`;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Link & Password copied!', 'success');
    }).catch(err => {
        console.error('Copy failed', err);
        showNotification('Copy failed', 'error');
    });
};

document.getElementById('shareModalClose')?.addEventListener('click', closeShareModal);

// ==================== Create Student Modal (same behavior as Organization "Add student") ====================

function clearTeacherCreateStudentFormErrors() {
    document.querySelectorAll('#teacherCreateStudentForm .teacher-create-student-field').forEach((g) => g.classList.remove('has-error'));
    document.querySelectorAll('#teacherCreateStudentForm .error-message').forEach((el) => {
        el.textContent = '';
        el.style.display = 'none';
    });
}

function openCreateStudentModal() {
    const modal = document.getElementById('teacherCreateStudentModal');
    if (modal) {
        clearTeacherCreateStudentFormErrors();
        document.getElementById('teacherCreateStudentForm')?.reset();
        modal.classList.add('show');
    }
}

function closeCreateStudentModal() {
    const modal = document.getElementById('teacherCreateStudentModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

async function submitCreateStudent(event) {
    event.preventDefault();
    clearTeacherCreateStudentFormErrors();

    const name = document.getElementById('teacherCreateStudentName').value.trim();
    const chessComId = document.getElementById('teacherCreateStudentId').value.trim();
    const localName = document.getElementById('teacherCreateStudentLocalName').value.trim();
    const gender = document.getElementById('teacherCreateStudentGender').value || null;
    let dateOfBirth = document.getElementById('teacherCreateStudentDateOfBirth').value.trim() || null;
    const contactPhone = String(document.getElementById('teacherCreateStudentContactPhone').value || '').replace(/[^\d]/g, '').trim() || null;
    const contactPhoneCountryCode = String(document.getElementById('teacherCreateStudentContactPhoneCountryCode').value || '+852').trim();
    const contactPhoneCountry = String(document.getElementById('teacherCreateStudentContactPhoneCountryCode').selectedOptions[0]?.dataset?.country || 'HK');
    const contactEmail = document.getElementById('teacherCreateStudentContactEmail').value.trim() || null;
    const emergencyContactName = document.getElementById('teacherCreateStudentEmergencyContactName').value.trim() || null;
    const emergencyContactRelation = document.getElementById('teacherCreateStudentEmergencyContactRelation').value || null;
    const emergencyContactNumber = document.getElementById('teacherCreateStudentEmergencyContactNumber').value.trim() || null;

    let hasError = false;
    function flag(fieldKey, msg) {
        hasError = true;
        const map = {
            name: ['teacherCreateStudentName', 'errTeacherCreateStudentName'],
            chess: ['teacherCreateStudentId', 'errTeacherCreateStudentId'],
            dob: ['teacherCreateStudentDateOfBirth', 'errTeacherCreateStudentDob'],
            email: ['teacherCreateStudentContactEmail', 'errTeacherCreateStudentEmail']
        };
        const pair = map[fieldKey];
        if (pair) {
            const input = document.getElementById(pair[0]);
            const err = document.getElementById(pair[1]);
            if (input && input.closest('.teacher-create-student-field')) input.closest('.teacher-create-student-field').classList.add('has-error');
            if (err) {
                err.textContent = msg;
                err.style.display = 'block';
            }
        }
    }

    if (!name) flag('name', 'Student name is required');

    if (dateOfBirth) {
        const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
        if (!dateRegex.test(dateOfBirth)) {
            flag('dob', 'Date must be in DD/MM/YYYY format');
        } else {
            const [, day, month, year] = dateOfBirth.match(dateRegex);
            const d = new Date(year, month - 1, day);
            if (d.getDate() != day || d.getMonth() != month - 1 || d.getFullYear() != year) flag('dob', 'Invalid date');
            else if (d > new Date()) flag('dob', 'Date of birth cannot be in the future');
        }
    }

    if (contactEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(contactEmail)) flag('email', 'Invalid email format');
    }

    if (hasError) {
        showNotification('Please fix the errors in the form', 'error');
        return;
    }

    const payload = {
        name,
        chessComId: chessComId || '',
        localName: localName || '',
        gender,
        dateOfBirth: dateOfBirth || '',
        contactPhone: contactPhone || '',
        contactPhoneCountryCode,
        contactPhoneCountry,
        contactEmail: contactEmail || '',
        emergencyContactName: emergencyContactName || '',
        emergencyContactRelation: emergencyContactRelation || '',
        emergencyContactNumber: emergencyContactNumber || ''
    };

    try {
        const response = await apiFetch('/organizations/students', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (!response) return;

        const data = await response.json();
        if (!response.ok) {
            if (data.error && String(data.error).includes('chess.com')) {
                flag('chess', data.error);
            }
            throw new Error(data.error || 'Failed to create student');
        }

        showNotification('Student created and assigned!', 'success');
        closeCreateStudentModal();
        loadStudents();
    } catch (error) {
        showNotification(error.message || 'Failed to create student', 'error');
    }
}

window.openCreateStudentModal = openCreateStudentModal;
window.closeCreateStudentModal = closeCreateStudentModal;
window.submitCreateStudent = submitCreateStudent;



// ==================== Edit Student Profile Functions ====================

async function openEditStudentProfile(student) {
    if (!currentUser) {
        try {
            const resp = await apiFetch('/auth/me');
            if (resp.ok) currentUser = await resp.json();
        } catch(e) {}
    }

    if (currentUser && currentUser.role === 'teacher') {
        if (!currentUser.teacherPermissions || !currentUser.teacherPermissions.editStudentProfile) {
            showNotification('Insufficient permissions: You are not allowed to edit student profiles.', 'error');
            return;
        }
    }

    const modal = document.getElementById('editStudentModal');
    if (!modal) return;

    document.getElementById('editStudentId_Hidden').value = student.id;
    const sysIdEl = document.getElementById('editStudentSystemId');
    if (sysIdEl) sysIdEl.value = String(student.id || '');
    document.getElementById('editStudentName').value = student.name || '';
    document.getElementById('editStudentStudentId').value = student.chessComId || '';
    const localNameEl = document.getElementById('editStudentLocalName');
    if (localNameEl) localNameEl.value = student.localName || '';
    document.getElementById('editStudentGender').value = student.gender || '';
    
    let dob = student.dateOfBirth || '';
    if (dob.includes('-')) {
        try {
            const d = new Date(dob);
            if (!isNaN(d.getTime())) {
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                dob = `${day}/${month}/${year}`;
            }
        } catch(e) {}
    }
    document.getElementById('editStudentDOB').value = dob;

    // Phone: store digits in contactPhone; countryCode in contactPhoneCountryCode
    const ccEl = document.getElementById('editStudentPhoneCountryCode');
    const phoneEl = document.getElementById('editStudentPhone');
    if (ccEl) ccEl.value = String(student.contactPhoneCountryCode || '+852');
    if (phoneEl) phoneEl.value = String(student.contactPhone || '');
    document.getElementById('editStudentEmail').value = student.contactEmail || '';
    document.getElementById('editStudentEmergName').value = student.emergencyContactName || '';
    document.getElementById('editStudentEmergRel').value = student.emergencyContactRelation || '';
    document.getElementById('editStudentEmergPhone').value = student.emergencyContactNumber || '';

    modal.classList.add('show');
}

function closeEditStudentProfile() {
    const modal = document.getElementById('editStudentModal');
    if (modal) modal.classList.remove('show');
}

async function saveStudentProfile(event) {
    event.preventDefault();
    
    const id = document.getElementById('editStudentId_Hidden').value;
    if (!id) return;

    const updateData = {
        name: document.getElementById('editStudentName').value.trim(),
        chessComId: document.getElementById('editStudentStudentId').value.trim(),
        localName: document.getElementById('editStudentLocalName')?.value?.trim?.() || '',
        gender: document.getElementById('editStudentGender').value,
        dateOfBirth: document.getElementById('editStudentDOB').value.trim(),
        contactPhone: String(document.getElementById('editStudentPhone')?.value || '').replace(/[^\d]/g, '').trim(),
        contactPhoneCountryCode: String(document.getElementById('editStudentPhoneCountryCode')?.value || '+852').trim(),
        contactPhoneCountry: String(document.getElementById('editStudentPhoneCountryCode')?.selectedOptions?.[0]?.dataset?.country || 'HK'),
        contactEmail: document.getElementById('editStudentEmail').value.trim(),
        emergencyContactName: document.getElementById('editStudentEmergName').value.trim(),
        emergencyContactRelation: document.getElementById('editStudentEmergRel').value,
        emergencyContactNumber: document.getElementById('editStudentEmergPhone').value.trim()
    };

    try {
        const response = await apiFetch(`/students/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to update student profile');
        }

        showNotification('Student profile updated successfully!', 'success');
        closeEditStudentProfile();
        loadStudents(); 
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

window.openEditStudentProfile = openEditStudentProfile;
window.closeEditStudentProfile = closeEditStudentProfile;
window.saveStudentProfile = saveStudentProfile;

// Delete from Edit Student Profile modal (bottom-left)
window.deleteStudentFromProfile = function() {
    const id = document.getElementById('editStudentId_Hidden')?.value;
    if (!id) return;
    // Reuse existing delete logic + confirmation prompt.
    return deleteStudent(String(id));
};
