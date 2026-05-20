window.closeEditClassModal = function(preserveMakeup = false) {
  const modal = document.getElementById('editClassModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => {
      modal.remove();
    }, 300);
  }
  window.selectedCourseIds = new Set();
  window.selectedTeacherIds = new Set();
  window.selectedDays = new Set();
  closeMakeupPopup();
  if (!preserveMakeup) {
    cancelMakeupFlow();
  }
};

// Makeup/Postpone popup for enrolled students
window.openMakeupPopup = function(studentId, entryId, dateStr) {
  const student = (window.students || []).find(s => s.id === studentId);
  const name = student ? student.name : 'Student';
  window.makeupContext = { studentId, studentName: name, entryId, dateStr };

  let popup = document.getElementById('makeupPopup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'makeupPopup';
    popup.className = 'makeup-popup-backdrop';
    popup.innerHTML = `
      <div class="makeup-popup" onclick="event.stopPropagation();">
        <div class="makeup-popup-header">
          <div>
            <div class="makeup-popup-title">Make-up / Postpone</div>
            <div class="makeup-popup-subtitle"></div>
          </div>
          <button class="makeup-popup-close" onclick="closeMakeupPopup()">×</button>
        </div>
        <div class="makeup-popup-actions">
          <button class="makeup-popup-btn primary" onclick="startMakeupFlow()">Make Up Class</button>
          <button class="makeup-popup-btn" onclick="handlePostponeSelection()">Postpone (next available)</button>
          <button class="makeup-popup-btn danger" onclick="handleCancelLessonSelection()">Cancel lesson (refund credit)</button>
        </div>
      </div>
    `;
    popup.addEventListener('click', closeMakeupPopup);
    document.body.appendChild(popup);

    if (!document.getElementById('makeupPopupStyles')) {
      const style = document.createElement('style');
      style.id = 'makeupPopupStyles';
      style.textContent = `
        .makeup-action-btn { min-width: 34px; height: 28px; border-radius: 6px; border: 1px solid #cbd5e1; background:#f8fafc; cursor:pointer; font-weight:700; }
        .makeup-action-btn:hover { background:#e2e8f0; }
        .makeup-popup-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: none; align-items: center; justify-content: center; z-index: 10100; padding: 16px; }
        .makeup-popup { background: #fff; border-radius: 12px; padding: 16px; width: 320px; box-shadow: 0 10px 30px rgba(0,0,0,0.18); }
        .makeup-popup-header { display:flex; align-items:center; justify-content: space-between; gap:10px; }
        .makeup-popup-title { font-size: 16px; font-weight: 700; color:#0f172a; }
        .makeup-popup-subtitle { font-size: 13px; color:#64748b; margin-top:4px; }
        .makeup-popup-close { border:none; background:transparent; font-size: 20px; cursor: pointer; color:#475569; }
        .makeup-popup-actions { display:flex; flex-direction:column; gap:10px; margin-top:14px; }
        .makeup-popup-btn { padding: 10px 12px; border-radius: 10px; border:1px solid #e2e8f0; background:#f8fafc; cursor:pointer; font-weight:600; text-align:left; }
        .makeup-popup-btn.primary { background:#2563eb; color:#fff; border-color:#2563eb; }
        .makeup-popup-btn.primary:hover { background:#1d4ed8; }
        .makeup-popup-btn.danger { background:#fee2e2; border-color:#fecaca; color:#991b1b; }
        .makeup-popup-btn.danger:hover { background:#fecaca; }
        .makeup-popup-btn:hover { background:#e2e8f0; }
        body.makeup-mode-active .timetable-entry { outline: 2px dashed #2563eb; cursor: pointer; }
        .makeup-mode-banner { position: fixed; bottom: 15px; right: 15px; background:#1d4ed8; color:#fff; padding:10px 14px; border-radius:10px; box-shadow:0 6px 16px rgba(0,0,0,0.2); z-index:2101; display:none; align-items:center; gap:10px; }
        .makeup-mode-banner button { background:rgba(255,255,255,0.15); border:none; color:#fff; padding:6px 10px; border-radius:8px; cursor:pointer; }
      `;
      document.head.appendChild(style);
    }

    // Banner for guidance
    const banner = document.createElement('div');
    banner.id = 'makeupModeBanner';
    banner.className = 'makeup-mode-banner';
    banner.innerHTML = `
      <span id="makeupModeText">Make-up mode active</span>
      <button onclick="cancelMakeupFlow()">Cancel</button>
    `;
    document.body.appendChild(banner);
  }

  const subtitle = popup.querySelector('.makeup-popup-subtitle');
  if (subtitle) subtitle.textContent = `${name} • ${dateStr}`;
  popup.style.display = 'flex';
};

window.closeMakeupPopup = function() {
  const popup = document.getElementById('makeupPopup');
  if (popup) popup.style.display = 'none';
};

window.startMakeupFlow = function() {
  if (!window.makeupContext.studentId) {
    closeMakeupPopup();
    return;
  }
  closeMakeupPopup();
  window.makeupFlowState = {
    active: true,
    studentId: window.makeupContext.studentId,
    fromEntryId: window.makeupContext.entryId,
    fromDate: window.makeupContext.dateStr,
    studentName: window.makeupContext.studentName
  };

  // Close edit modal to allow interaction with timetable, but preserve makeup flow
  closeEditClassModal(true);

  document.body.classList.add('makeup-mode-active');
  const banner = document.getElementById('makeupModeBanner');
  if (banner) {
    const text = banner.querySelector('#makeupModeText');
    if (text) text.textContent = `Select a class for ${window.makeupContext.studentName} to make up`;
    banner.style.display = 'flex';
  }
  if (window.showToast) window.showToast('Make-up mode: click a class slot to assign.', 'info');
};

window.cancelMakeupFlow = function() {
  window.makeupFlowState = { active: false, studentId: null, fromEntryId: null, fromDate: null, studentName: '' };
  document.body.classList.remove('makeup-mode-active');
  const banner = document.getElementById('makeupModeBanner');
  if (banner) banner.style.display = 'none';
};

window.handleMakeupTargetSelect = function(entry, dateStr) {
  if (!window.makeupFlowState.active) return;

  performMakeupAssignment({
    studentId: window.makeupFlowState.studentId,
    fromEntryId: window.makeupFlowState.fromEntryId,
    fromDate: window.makeupFlowState.fromDate,
    toEntryId: entry.id,
    toDate: dateStr,
    studentName: window.makeupFlowState.studentName
  });
};

async function performMakeupAssignment(payload) {
  try {
    console.log('[MAKEUP] Sending makeup request:', payload);
    const response = await window.authUtils.authenticatedFetch('/organizations/timetable/makeup', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (response && response.ok) {
      const result = await response.json();
      console.log('[MAKEUP] Makeup success:', result);

      if (window.showToast) window.showToast('Make-up completed successfully', 'success');
      else alert('Make-up completed successfully');

      cancelMakeupFlow();
      await loadTimetableData();
      return;
    }

    const errorData = await response.json();
    console.error('[MAKEUP] Makeup failed:', errorData);
    throw new Error(errorData.error || 'Failed to complete make-up');
  } catch (e) {
    console.error('Make-up error', e);
    if (window.showToast) window.showToast('Failed to complete make-up', 'error');
    else alert('Failed to complete make-up');
    cancelMakeupFlow();
  }
}

window.handlePostponeSelection = async function() {
  if (!window.makeupContext.studentId) {
    closeMakeupPopup();
    return;
  }
  closeMakeupPopup();
  await postponeEnrollment(window.makeupContext);
};

window.handleCancelLessonSelection = async function() {
  if (!window.makeupContext.studentId) {
    closeMakeupPopup();
    return;
  }
  if (
    !confirm(
      'Cancel this lesson? If it was paid, credit becomes lesson quota for that price tier (not cash balance).'
    )
  )
    return;
  closeMakeupPopup();
  await cancelEnrollmentWithRefund(window.makeupContext);
};

async function cancelEnrollmentWithRefund(ctx) {
  try {
    const response = await window.authUtils.authenticatedFetch('/organizations/enrollments/drop', {
      method: 'POST',
      body: JSON.stringify({
        studentId: ctx.studentId,
        mode: 'single',
        timetableEntryId: ctx.entryId,
        date: ctx.dateStr
      })
    });
    if (response && response.ok) {
      const r = await response.json().catch(() => ({}));
      const delta = r.lessonQuotaDelta && typeof r.lessonQuotaDelta === 'object' ? r.lessonQuotaDelta : {};
      const keys = Object.keys(delta);
      let msg = 'Cancelled.';
      if (keys.length) {
        const parts = keys.map(
          (cents) => `$${(Number(cents) / 100).toFixed(2)} +${delta[cents]}`
        );
        msg = `Cancelled. Lesson quota credit: ${parts.join(', ')}.`;
      }
      if (window.showToast) {
        window.showToast(msg, 'success');
      } else {
        alert(msg);
      }
      await loadTimetableData();
      return;
    }
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to cancel');
  } catch (e) {
    console.error('Cancel lesson error', e);
    if (window.showToast) window.showToast('Failed to cancel lesson', 'error');
    else alert('Failed to cancel lesson');
  }
}

async function postponeEnrollment(ctx) {
  try {
    const response = await window.authUtils.authenticatedFetch('/organizations/timetable/postpone', {
      method: 'POST',
      body: JSON.stringify({
        timetableEntryId: ctx.entryId,
        date: ctx.dateStr,
        studentId: ctx.studentId
      })
    });
    if (response && response.ok) {
      const r = await response.json().catch(() => ({}));
      const newDate = r?.data?.enrolledToDate || null;
      if (window.showToast) window.showToast(newDate ? `Postponed to ${newDate}` : 'Postponed', 'success');
      else alert(newDate ? `Postponed to ${newDate}` : 'Postponed');
      await loadTimetableData();
      return;
    }
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to postpone');
  } catch (e) {
    console.error('Postpone error', e);
    if (window.showToast) window.showToast('Failed to postpone class', 'error');
    else alert('Failed to postpone class');
  }
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// Remove student tag
window.removeStudentTag = function(studentId) {
  if (!window.currentClassStudentIds) return;
  
  window.currentClassStudentIds = window.currentClassStudentIds.filter(id => id !== studentId);
  
  // Remove from DOM
  const tags = document.querySelectorAll('#selectedStudents .tag-selector-tag');
  tags.forEach(tag => {
    if (tag.innerHTML.includes(`removeStudentTag('${studentId}')`)) {
      tag.remove();
    }
  });
  
  // Update label count
  const label = document.querySelector('.edit-class-form-group label[for="Enrolled Students"]'); // No for attribute on label
  // Find the label by text content or structure
  const labels = document.querySelectorAll('.edit-class-form-group label');
  labels.forEach(l => {
    if (l.textContent.includes('Enrolled Students')) {
      l.textContent = `Enrolled Students (${window.currentClassStudentIds.length})`;
    }
  });
};

// Save class entry
window.saveClassEntry = async function(event, entryId) {
  event.preventDefault();
  
  // Clear previous errors
  document.querySelectorAll('.edit-class-form-group').forEach(group => {
    group.classList.remove('has-error');
  });
  document.querySelectorAll('.error-message').forEach(msg => {
    msg.textContent = '';
  });

  // Get form values
  const className = document.getElementById('editClassName').value.trim();
  const classroom = document.getElementById('editClassClassroom').value.trim() || null;
  const startTime = (document.getElementById('editClassStartHour') && document.getElementById('editClassStartMin'))
    ? getTimeFromSplit('Start')
    : document.getElementById('editClassStartTime')?.value;
  const endTime = (document.getElementById('editClassEndHour') && document.getElementById('editClassEndMin'))
    ? getTimeFromSplit('End')
    : document.getElementById('editClassEndTime')?.value;
  const isRecurring = document.getElementById('editClassIsRecurring').value === 'true';
  const date = isRecurring ? null : document.getElementById('editClassDate').value;
  const dayOfWeek = isRecurring ? Array.from(window.selectedDays || []) : null;
  
  // Get recurring date range
