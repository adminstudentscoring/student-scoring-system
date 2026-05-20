  document.querySelectorAll('.sales-row-menu-panel.is-open').forEach((p) => p.classList.remove('is-open'));
  document.querySelectorAll('.sales-row-menu-trigger[aria-expanded="true"]').forEach((t) => {
    t.setAttribute('aria-expanded', 'false');
  });
}

function bindSalesScheduleRowMenusOnce() {
  if (window.__salesScheduleRowMenuBound) return;
  window.__salesScheduleRowMenuBound = true;
  // Document delegation: innerHTML on #dayScheduleList replaces nodes but listener stays valid.
  document.addEventListener('click', (e) => {
    const list = document.getElementById('dayScheduleList');
    if (!list || !list.contains(e.target)) {
      closeAllSalesRowMenus();
      return;
    }

    const trig = e.target.closest('.sales-row-menu-trigger');
    if (trig) {
      e.preventDefault();
      e.stopPropagation();
      const panel = trig.closest('.sales-row-menu')?.querySelector('.sales-row-menu-panel');
      const wasOpen = panel?.classList.contains('is-open');
      closeAllSalesRowMenus();
      if (panel && !wasOpen) {
        panel.classList.add('is-open');
        trig.setAttribute('aria-expanded', 'true');
      }
      return;
    }

    const menuItem = e.target.closest('[data-sales-menu]');
    if (menuItem) {
      e.preventDefault();
      e.stopPropagation();
      closeAllSalesRowMenus();
      const action = menuItem.getAttribute('data-sales-menu');
      const entryId = menuItem.getAttribute('data-entry-id') || '';
      const dateStr = menuItem.getAttribute('data-date') || '';
      const enrollmentId = menuItem.getAttribute('data-enrollment-id') || '';
      const studentId = salesState.selectedStudent?.id;
      if (!studentId) {
        if (window.showToast) window.showToast('Select a student first.', 'error');
        return;
      }
      if (action === 'attendance' && entryId && dateStr) {
        if (typeof window.openSalesEnrollmentAttendanceModal === 'function') {
          window.openSalesEnrollmentAttendanceModal(entryId, dateStr);
        }
        return;
      }
      if (action === 'makeup' && entryId && dateStr) {
        const student = (window.students || []).find((s) => String(s.id) === String(studentId));
        window.makeupContext = {
          studentId,
          studentName: student ? student.name : 'Student',
          entryId,
          dateStr
        };
        if (typeof window.startMakeupFlow === 'function') {
          window.startMakeupFlow();
        } else if (window.showToast) {
          window.showToast('Make-up is not available.', 'error');
        }
        return;
      }
      if (action === 'postpone' && entryId && dateStr) {
        const student = (window.students || []).find((s) => String(s.id) === String(studentId));
        window.makeupContext = {
          studentId,
          studentName: student ? student.name : 'Student',
          entryId,
          dateStr
        };
        if (typeof window.handlePostponeSelection === 'function') {
          Promise.resolve(window.handlePostponeSelection()).then(() => {
            if (typeof updateDaySchedule === 'function') updateDaySchedule();
          });
        } else if (window.showToast) {
          window.showToast('Postpone is not available.', 'error');
        }
        return;
      }
      if (action === 'drop-lesson' && enrollmentId) {
        if (typeof window.dropSalesLesson === 'function') window.dropSalesLesson(enrollmentId);
        return;
      }
      if (action === 'drop-all' && entryId) {
        if (typeof window.dropSalesAllFuture === 'function') window.dropSalesAllFuture(entryId, dateStr);
      }
      return;
    }

    closeAllSalesRowMenus();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeAllSalesRowMenus();
  });
}

window.closeSalesEnrollmentAttendanceModal = function () {
  const modal = document.getElementById('salesEnrollmentAttModal');
  if (modal) modal.style.display = 'none';
};

window.saveSalesEnrollmentAttendance = async function () {
  const modal = document.getElementById('salesEnrollmentAttModal');
  if (!modal) return;
  const entryId = modal.dataset.entryId;
  const dateStr = modal.dataset.dateStr;
  const studentId = modal.dataset.studentId;
  const sel = modal.querySelector('.sales-att-status-select');
  const status = sel ? sel.value : 'unmarked';
  if (!entryId || !dateStr || !studentId) return;
  try {
    const response = await window.authUtils.authenticatedFetch('/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timetableEntryId: entryId,
        date: dateStr,
        records: [{ studentId, status }]
      })
    });
    if (response && response.ok) {
      if (window.showToast) window.showToast('Attendance saved.', 'success');
      window.closeSalesEnrollmentAttendanceModal();
    } else {
      const err = await response.json().catch(() => ({}));
      if (window.showToast) window.showToast(err.error || 'Failed to save', 'error');
      else alert(err.error || 'Failed to save');
    }
  } catch (e) {
    console.error(e);
    if (window.showToast) window.showToast('Failed to save attendance', 'error');
  }
};

window.openSalesEnrollmentAttendanceModal = async function (entryId, dateStr) {
  const studentId = salesState.selectedStudent?.id;
  if (!studentId) {
    if (window.showToast) window.showToast('Select a student first.', 'error');
    return;
  }
  let current = 'unmarked';
  try {
    const url = `/attendance?timetableEntryId=${encodeURIComponent(entryId)}&date=${encodeURIComponent(dateStr)}&studentId=${encodeURIComponent(studentId)}`;
    const r = await window.authUtils.authenticatedFetch(url);
    if (r && r.ok) {
      const rows = await r.json();
      const mine = Array.isArray(rows) ? rows.find((x) => String(x.studentId) === String(studentId)) : null;
      if (mine && mine.status) current = mine.status;
    }
  } catch (_) {}

  let modal = document.getElementById('salesEnrollmentAttModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'salesEnrollmentAttModal';
    modal.className = 'sales-att-modal-backdrop';
    modal.innerHTML = `
      <div class="sales-att-modal" onclick="event.stopPropagation();">
        <h3>Attendance</h3>
        <p class="sales-att-modal-sub"></p>
        <label class="sales-att-sr-only" for="salesAttStatusSelect">Status</label>
        <select id="salesAttStatusSelect" class="sales-att-status-select">
          <option value="unmarked">Unmarked</option>
          <option value="present">Present</option>
          <option value="absent">Absent</option>
          <option value="late">Late</option>
        </select>
        <div class="sales-att-modal-actions">
          <button type="button" class="cancel" onclick="window.closeSalesEnrollmentAttendanceModal()">Cancel</button>
          <button type="button" class="save" onclick="window.saveSalesEnrollmentAttendance()">Save</button>
        </div>
      </div>`;
    modal.addEventListener('click', () => window.closeSalesEnrollmentAttendanceModal());
    document.body.appendChild(modal);
    if (!document.getElementById('salesAttModalSrStyle')) {
      const s = document.createElement('style');
      s.id = 'salesAttModalSrStyle';
      s.textContent = '.sales-att-sr-only { position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0; }';
      document.head.appendChild(s);
    }
  }

  const student = (window.students || []).find((s) => String(s.id) === String(studentId));
  const sub = modal.querySelector('.sales-att-modal-sub');
  if (sub) {
    sub.textContent = `${student ? student.name : 'Student'} · ${dateStr}`;
  }
  modal.dataset.entryId = entryId;
  modal.dataset.dateStr = dateStr;
  modal.dataset.studentId = studentId;
  const sel = modal.querySelector('.sales-att-status-select');
  if (sel) sel.value = current;
  modal.style.display = 'flex';
};

function updateDaySchedule() {
  const header = document.getElementById('scheduleHeader');
  const container = document.getElementById('dayScheduleList');
  if (!header || !container) return;
  
  const selectedDate = salesState.classSelection.selectedDate;
  const selectedStr = formatDateForCompare(selectedDate);
  
  header.innerHTML = `<h3>${selectedDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>`;
  
  // Inject styles
  if (!document.getElementById('salesDropStyles')) {
      const style = document.createElement('style');
      style.id = 'salesDropStyles';
      style.textContent = `
        .schedule-card.enrolled { border: 1px solid rgba(52, 199, 89, 0.35); background: rgba(52, 199, 89, 0.06); }
        .schedule-card.in-cart { border: 1px solid rgba(0, 122, 255, 0.4); background: rgba(0, 122, 255, 0.08); }
        .card-header-badge { background: #34c759; color: #fff; font-size: 10px; font-weight: 600; padding: 4px 8px; border-radius: 980px; display: inline-block; margin-bottom: 6px; letter-spacing: 0.02em; }
        .schedule-card.enrolled .schedule-card-actions-menu { min-width: 0; align-items: flex-end; }
        .sales-row-menu { position: relative; flex-shrink: 0; margin-left: auto; }
        .sales-row-menu-trigger {
          width: 36px; height: 36px; border: none; border-radius: 50%;
          background: rgba(0, 0, 0, 0.05); color: #007aff;
          font-size: 22px; line-height: 0; padding: 0; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
        }
        .sales-row-menu-trigger:hover { background: rgba(0, 122, 255, 0.12); }
        .sales-row-menu-panel {
          position: absolute; right: 0; top: calc(100% + 6px);
          min-width: 212px; max-width: 280px;
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border-radius: 14px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 1px 0 rgba(255, 255, 255, 0.8) inset;
          border: 1px solid rgba(0, 0, 0, 0.06);
          padding: 6px; z-index: 80; display: none;
        }
        .sales-row-menu-panel.is-open { display: block; }
        .sales-row-menu-item {
          display: block; width: 100%; text-align: left;
          padding: 11px 14px; border: none; background: transparent;
          border-radius: 10px; font-size: 15px; font-weight: 500; cursor: pointer;
          color: #007aff; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
        }
        .sales-row-menu-item:hover { background: rgba(0, 0, 0, 0.04); }
        .sales-row-menu-item.danger { color: #ff3b30; }
        .sales-row-menu-sep { height: 1px; margin: 4px 8px; background: rgba(0, 0, 0, 0.08); }
        .sales-att-modal-backdrop {
          position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); z-index: 10200;
          display: none; align-items: center; justify-content: center; padding: 16px;
        }
        .sales-att-modal {
          width: 100%; max-width: 340px; background: #fff; border-radius: 16px;
          padding: 18px 20px; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
        }
        .sales-att-modal h3 { margin: 0 0 6px; font-size: 17px; font-weight: 600; color: #1c1c1e; }
        .sales-att-modal p { margin: 0 0 14px; font-size: 13px; color: #8e8e93; }
        .sales-att-modal select {
          width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(0, 0, 0, 0.1);
          font-size: 16px; margin-bottom: 16px; background: #f2f2f7;
        }
        .sales-att-modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
        .sales-att-modal-actions button {
          padding: 10px 18px; border-radius: 12px; border: none; font-size: 16px; font-weight: 600; cursor: pointer;
        }
        .sales-att-modal-actions .cancel { background: #e5e5ea; color: #1c1c1e; }
        .sales-att-modal-actions .save { background: #007aff; color: #fff; }
      `;
      document.head.appendChild(style);
  }
  
  // 1. Get Saved Enrollments (from DB)
  const studentId = salesState.selectedStudent?.id;
  let enrolledClasses = [];
  if (studentId) {
      enrolledClasses = (window.timetableEnrollments || []).filter(
        (e) =>
          String(e.studentId) === String(studentId) && enrollmentDateYmd(e.date) === selectedStr
      );
  }

  bindSalesScheduleRowMenusOnce();

  // 2. Get Cart Items (Pending)
  let cartClasses = [];
  salesState.cart.forEach((item, cartIndex) => {
      if (item.enrolledClasses && Array.isArray(item.enrolledClasses)) {
          item.enrolledClasses.forEach(cls => {
              const d = new Date(cls.date);
              const dStr = formatDateForCompare(d);
              if (dStr === selectedStr) {
                  cartClasses.push({
                      ...cls,
                      cartIndex: cartIndex,
                      productName: item.productData.name
                  });
              }
          });
      }
  });
  
  // 3. Get Available Classes
  const dayClasses = salesState.classSelection.availableClasses.filter(c => 
    formatDateForCompare(c.date) === selectedStr
  );
  
  if (dayClasses.length === 0 && enrolledClasses.length === 0 && cartClasses.length === 0) {
    container.innerHTML = '<div class="empty-day-state">No classes scheduled for this day.</div>';
    return;
  }
  
  let html = '';
  
  // Render Saved Enrollments
  enrolledClasses.forEach(enrollment => {
      const entry = (window.timetableEntries || []).find(e => e.id === enrollment.timetableEntryId);
      if (!entry) return;
      const timeStr = `${entry.startTime} - ${entry.endTime}`;
      
      html += `
      <div class="schedule-card enrolled">
        <div class="card-header-badge">Enrolled</div>
        <div class="card-time">
          <div class="time-text">${timeStr}</div>
        </div>
        <div class="card-details">
          <div class="card-title">${escapeHtml(entry.className)}</div>
          <div class="card-teacher">${escapeHtml(entry.teacherName || (entry.teacherIds && entry.teacherIds.length > 0 ? getTeacherName(entry.teacherIds[0]) : 'Unknown Teacher'))}</div>
        </div>
        <div class="card-actions schedule-card-actions-menu">
          <div class="sales-row-menu">
            <button type="button" class="sales-row-menu-trigger" aria-label="Lesson actions" aria-haspopup="true" aria-expanded="false">⋯</button>
            <div class="sales-row-menu-panel" role="menu">
              <button type="button" class="sales-row-menu-item" role="menuitem" data-sales-menu="attendance"
                data-entry-id=${JSON.stringify(entry.id)} data-date=${JSON.stringify(selectedStr)}>Attendance</button>
              <button type="button" class="sales-row-menu-item" role="menuitem" data-sales-menu="makeup"
                data-entry-id=${JSON.stringify(entry.id)} data-date=${JSON.stringify(selectedStr)}>Makeup</button>
              <button type="button" class="sales-row-menu-item" role="menuitem" data-sales-menu="postpone"
                data-entry-id=${JSON.stringify(entry.id)} data-date=${JSON.stringify(selectedStr)}>Postpone</button>
              <div class="sales-row-menu-sep" aria-hidden="true"></div>
              <button type="button" class="sales-row-menu-item danger" role="menuitem" data-sales-menu="drop-lesson"
                data-enrollment-id=${JSON.stringify(enrollment.id)}>Drop lesson</button>
              <button type="button" class="sales-row-menu-item danger" role="menuitem" data-sales-menu="drop-all"
                data-entry-id=${JSON.stringify(entry.id)} data-date=${JSON.stringify(enrollment.date != null ? String(enrollment.date) : '')}>Drop all future</button>
            </div>
          </div>
        </div>
      </div>`;
  });

  // Render Cart Classes
  cartClasses.forEach(cls => {
      const entry = cls.entry;
      const timeStr = `${entry.startTime} - ${entry.endTime}`;
      
      html += `
      <div class="schedule-card in-cart">
        <div class="card-header-badge" style="background: #007aff;">In Cart</div>
        <div class="card-time">
          <div class="time-text">${timeStr}</div>
        </div>
        <div class="card-details">
          <div class="card-title">${escapeHtml(entry.className)}</div>
          <div class="card-teacher">${escapeHtml(entry.teacherName || (entry.teacherIds && entry.teacherIds.length > 0 ? getTeacherName(entry.teacherIds[0]) : 'Unknown Teacher'))}</div>
          <div class="enrolled-status" style="color: #2563eb;">Pending Payment</div>
        </div>
        <div class="card-actions">
             <div class="drop-actions">
                 <span class="drop-link" onclick="removeSalesCartItem(${cls.cartIndex}); if(typeof updateDaySchedule === 'function') updateDaySchedule();" style="color:#ef4444;">Remove from Cart</span>
             </div>
        </div>
      </div>`;
  });
  
  // Render Available Classes
  const productType = salesState.selectedProduct ? salesState.selectedProduct.type : 'course';
  const selPkg = salesState.selectedProduct?.type === 'package' ? salesState.selectedProduct.data : null;
  if (typeof window !== 'undefined' && window.salesTrace) {
    window.salesTrace('updateDaySchedule: enroll options branch', {
      productType,
      priceStrategy: salesState.selectedProduct?.data?.priceStrategy,
      monthlyPeriod: salesState.selectedProduct?.data?.monthlyPeriod,
      salesPackageIsMonthly: selPkg ? salesPackageIsMonthly(selPkg) : false,
      dayClassesForSelectedDate: dayClasses.length
    });
  }

  html += dayClasses.map(cls => {
    const isEnrolled = enrolledClasses.some(e => e.timetableEntryId === cls.entry.id);
    const isInCart = cartClasses.some(c => c.entry.id === cls.entry.id);
    
    if (isEnrolled || isInCart) return ''; 
    
    const timeStr = `${cls.entry.startTime} - ${cls.entry.endTime}`;
    let buttonsHtml = '';
    
    buttonsHtml += `
      <div class="enroll-option">
        <span class="option-label">Single lesson (${cls.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})</span>
        <button class="btn btn-sm btn-outline" onclick="enrollSingle('${cls.id}')">Enroll</button>
      </div>
    `;
    
    if (productType === 'package' && salesState.selectedProduct) {
      const pkg = salesState.selectedProduct.data;

      if (salesPackageIsMonthly(pkg)) {
          const period = pkg.monthlyPeriod || 1;
