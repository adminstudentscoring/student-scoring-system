window.openSalesEditStudent = function(event, studentId) {
  if (event) event.stopPropagation();
  const student = (window.students || []).find(s => String(s.id) === String(studentId));
  if (!student) {
    if (typeof showToast === 'function') showToast('Student not found.', 'error');
    return;
  }
  if (typeof window.openEditStudentModal === 'function') {
    window.openEditStudentModal(student);
    return;
  }
  alert('Edit Student modal is not available on this page.');
};

// Helpers so other modules can refresh the Sales selected card safely
window.getSalesSelectedStudentId = function() {
  return salesState?.selectedStudent?.id || null;
};
window.refreshSalesSelectedStudentIfVisible = function(studentId) {
  // Only refresh if Sales DOM is present (avoid errors when Sales tab is not rendered)
  const card = document.getElementById('selectedStudentCard');
  const search = document.getElementById('salesStudentSearch');
  if (!card || !search) return;
  if (typeof window.selectSalesStudent === 'function') {
    window.selectSalesStudent(String(studentId));
  }
};

// ==================== Create New Student (Sales) — same form + API as Organization "Add student" ====================
function clearSalesCreateStudentFormErrors() {
  const modal = document.getElementById('salesCreateStudentModal');
  if (!modal) return;
  modal.querySelectorAll('.edit-student-form-group').forEach(g => g.classList.remove('has-error'));
  modal.querySelectorAll('.error-message').forEach(e => {
    e.textContent = '';
  });
}

function flagSalesCreateStudent(fieldKey, msg) {
  const map = {
    name: ['salesCreateStudentName', 'errSalesCreateStudentName'],
    chess: ['salesCreateStudentId', 'errSalesCreateStudentId'],
    dob: ['salesCreateStudentDateOfBirth', 'errSalesCreateStudentDob'],
    email: ['salesCreateStudentContactEmail', 'errSalesCreateStudentEmail']
  };
  const pair = map[fieldKey];
  if (!pair) return;
  const input = document.getElementById(pair[0]);
  const err = document.getElementById(pair[1]);
  if (input && input.closest('.edit-student-form-group')) {
    input.closest('.edit-student-form-group').classList.add('has-error');
  }
  if (err) err.textContent = msg;
}

function getSalesAddStudentModalMarkup() {
  return `
    <div class="edit-student-modal-content" style="max-width:840px;" onclick="event.stopPropagation()">
      <div class="edit-student-modal-header">
        <h2 id="salesCreateStudentModalTitle">Add student</h2>
        <button type="button" class="org-modal-close-x" onclick="closeSalesCreateStudentModal()" aria-label="Close">&times;</button>
      </div>
      <div class="edit-student-modal-body">
        <form id="salesCreateStudentForm">
          <div class="form-row sales-student-form-row-3">
            <div class="edit-student-form-group">
              <label for="salesCreateStudentName">Student name <span style="color:#ef4444">*</span></label>
              <input type="text" id="salesCreateStudentName" required autocomplete="name">
              <div class="error-message" id="errSalesCreateStudentName"></div>
            </div>
            <div class="edit-student-form-group">
              <label for="salesCreateStudentLocalName">Local name</label>
              <input type="text" id="salesCreateStudentLocalName" autocomplete="nickname">
            </div>
            <div class="edit-student-form-group">
              <label for="salesCreateStudentId">chess.com ID</label>
              <input type="text" id="salesCreateStudentId" placeholder="Optional if not applicable" autocomplete="username">
              <div class="error-message" id="errSalesCreateStudentId"></div>
            </div>
          </div>
          <div class="form-row sales-student-form-row-2">
            <div class="edit-student-form-group">
              <label for="salesCreateStudentGender">Gender</label>
              <select id="salesCreateStudentGender">
                <option value="">Please select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div class="edit-student-form-group">
              <label for="salesCreateStudentDateOfBirth">Date of birth (DD/MM/YYYY)</label>
              <input type="text" id="salesCreateStudentDateOfBirth" placeholder="DD/MM/YYYY" autocomplete="bday">
              <div class="error-message" id="errSalesCreateStudentDob"></div>
            </div>
          </div>
          <div class="form-row sales-student-form-row-2">
            <div class="edit-student-form-group">
              <label for="salesCreateStudentContactPhone">Contact no.</label>
              <div style="display:flex; gap:8px; align-items:center;">
                <select id="salesCreateStudentContactPhoneCountryCode" style="width:160px; padding:8px 10px; border:2px solid #e2e8f0; border-radius:var(--ui-radius, 8px); font-size:0.875rem; box-sizing:border-box;">
                  <option value="+852" data-country="HK" selected>Hong Kong (+852)</option>
                  <option value="+853" data-country="MO">Macau (+853)</option>
                  <option value="+86" data-country="CN">China (+86)</option>
                  <option value="+886" data-country="TW">Taiwan (+886)</option>
                  <option value="+65" data-country="SG">Singapore (+65)</option>
                  <option value="+44" data-country="GB">United Kingdom (+44)</option>
                  <option value="+1" data-country="US">United States (+1)</option>
                </select>
                <input type="text" id="salesCreateStudentContactPhone" placeholder="Phone number" style="flex:1; padding:8px 10px; border:2px solid #e2e8f0; border-radius:var(--ui-radius, 8px); font-size:0.875rem; box-sizing:border-box;" inputmode="numeric">
              </div>
              <div class="error-message" id="errSalesCreateStudentPhone"></div>
            </div>
            <div class="edit-student-form-group">
              <label for="salesCreateStudentContactEmail">Email</label>
              <input type="email" id="salesCreateStudentContactEmail" autocomplete="email">
              <div class="error-message" id="errSalesCreateStudentEmail"></div>
            </div>
          </div>
          <div class="form-row sales-student-form-row-2">
            <div class="edit-student-form-group">
              <label for="salesCreateStudentEmergencyContactName">Emergency contact name</label>
              <input type="text" id="salesCreateStudentEmergencyContactName">
            </div>
            <div class="edit-student-form-group">
              <label for="salesCreateStudentEmergencyContactRelation">Relation</label>
              <select id="salesCreateStudentEmergencyContactRelation">
                <option value="">Please select</option>
                <option value="Parent">Parent</option>
                <option value="Guardian">Guardian</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div class="edit-student-form-group">
            <label for="salesCreateStudentEmergencyContactNumber">Emergency contact no.</label>
            <input type="text" id="salesCreateStudentEmergencyContactNumber">
          </div>
          <div class="edit-student-modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeSalesCreateStudentModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

window.openSalesCreateStudentModal = function() {
  const existing = document.getElementById('salesCreateStudentModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'salesCreateStudentModal';
  modal.className = 'edit-student-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'salesCreateStudentModalTitle');
  modal.onclick = function(ev) {
    if (ev.target === modal) closeSalesCreateStudentModal();
  };
  modal.innerHTML = getSalesAddStudentModalMarkup();
  document.body.appendChild(modal);

  setTimeout(() => modal.classList.add('show'), 10);

  const form = modal.querySelector('#salesCreateStudentForm');
  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      await createStudentFromSalesModal();
    });
  }

  setTimeout(() => {
    const el = document.getElementById('salesCreateStudentName');
    if (el) el.focus();
  }, 50);
};

window.closeSalesCreateStudentModal = function() {
  const modal = document.getElementById('salesCreateStudentModal');
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(() => modal.remove(), 300);
};

async function createStudentFromSalesModal() {
  clearSalesCreateStudentFormErrors();

  const name = String(document.getElementById('salesCreateStudentName')?.value || '').trim();
  const chessComId = String(document.getElementById('salesCreateStudentId')?.value || '').trim();
  const localName = String(document.getElementById('salesCreateStudentLocalName')?.value || '').trim();
  const gender = document.getElementById('salesCreateStudentGender')?.value || null;
  let dateOfBirth = String(document.getElementById('salesCreateStudentDateOfBirth')?.value || '').trim() || null;
  const contactPhone = String(document.getElementById('salesCreateStudentContactPhone')?.value || '')
    .replace(/[^\d]/g, '')
    .trim() || null;
  const contactPhoneCountryCode = String(
    document.getElementById('salesCreateStudentContactPhoneCountryCode')?.value || '+852'
  ).trim();
  const contactPhoneCountry = String(
    document.getElementById('salesCreateStudentContactPhoneCountryCode')?.selectedOptions[0]?.dataset?.country || 'HK'
  ).trim();
  const contactEmail = String(document.getElementById('salesCreateStudentContactEmail')?.value || '').trim() || null;
  const emergencyContactName = String(document.getElementById('salesCreateStudentEmergencyContactName')?.value || '').trim() || null;
  const emergencyContactRelation = document.getElementById('salesCreateStudentEmergencyContactRelation')?.value || null;
  const emergencyContactNumber = String(document.getElementById('salesCreateStudentEmergencyContactNumber')?.value || '').trim() || null;

  let hasError = false;
  function flag(key, msg) {
    hasError = true;
    flagSalesCreateStudent(key, msg);
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
    if (typeof showToast === 'function') showToast('Please fix the errors in the form', 'error');
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
    const response = await window.authUtils.authenticatedFetch('/organizations/students', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (!response) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data?.error || 'Failed to create student';
      if (data.error && String(data.error).includes('chess.com')) {
        flagSalesCreateStudent('chess', msg);
      }
      if (typeof showToast === 'function') showToast(msg, 'error');
      return;
    }

    try {
      const r = await window.authUtils.authenticatedFetch('/students');
      if (r && r.ok) {
        const list = await r.json().catch(() => []);
        window.students = Array.isArray(list) ? list : (list.students || []);
      }
    } catch (e) {
      /* ignore */
    }

    if (typeof showToast === 'function') showToast('Student created successfully!', 'success');
    closeSalesCreateStudentModal();

    try {
      if (typeof window.refreshStudentList === 'function') {
        window.refreshStudentList();
      }
    } catch (e) {
      /* ignore */
    }

    if (data?.id && typeof window.selectSalesStudent === 'function') {
      window.selectSalesStudent(String(data.id));
    }
  } catch (e) {
    if (typeof showToast === 'function') showToast(e.message || 'Failed to create student', 'error');
  }
}

// Open Student Details Overlay (Class/Payment History)
