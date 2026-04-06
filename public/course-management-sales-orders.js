/**
 * Console: runSalesStudentSearchDropdownSmokeTest('manual')
 * Enable auto-log on open: localStorage.setItem('salesDropdownSmoke','1')
 */
window.runSalesStudentSearchDropdownSmokeTest = function (reason) {
  const tag = `[SalesStudentDropdown UI Smoke / ${reason || 'check'}]`;
  const drop = document.getElementById('salesStudentDropdown');
  const wrap = document.querySelector('.student-search-wrapper');
  const input = document.getElementById('salesStudentSearch');
  if (!drop || !wrap || !input) {
    console.warn(tag, 'missing DOM', { dropdown: !!drop, wrapper: !!wrap, input: !!input });
    return { ok: false };
  }
  const inside = wrap.contains(drop);
  const ir = input.getBoundingClientRect();
  const dr = drop.getBoundingClientRect();
  const visible = drop.style.display !== 'none' && dr.height > 0;
  const gap = visible ? dr.top - ir.bottom : null;
  const attached = inside && visible && gap != null && gap >= -4 && gap <= 12;
  console.info(tag, {
    dropdownInsideSearchWrapper: inside,
    inputBottom: Math.round(ir.bottom),
    dropdownTop: visible ? Math.round(dr.top) : null,
    gapPx: gap != null ? Math.round(gap * 10) / 10 : null,
    looksAttachedUnderInput: attached
  });
  return { ok: attached, inside, gapPx: gap };
};

window.showStudentDropdown = function () {
  const dropdown = document.getElementById('salesStudentDropdown');
  if (dropdown) dropdown.style.display = 'block';
  handleSalesStudentSearch();
  try {
    if (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('salesDropdownSmoke') === '1'
    ) {
      requestAnimationFrame(() =>
        window.runSalesStudentSearchDropdownSmokeTest('showStudentDropdown')
      );
    }
  } catch (e) {
    /* ignore */
  }
};

function hideStudentDropdown() {
  const dropdown = document.getElementById('salesStudentDropdown');
  if (dropdown) {
    setTimeout(() => {
      dropdown.style.display = 'none';
    }, 200);
  }
}

function salesOrderEffectivePaid(order) {
  if (!order) return 0;
  if (order.amountPaid != null && Number.isFinite(Number(order.amountPaid))) {
    return Math.round(Number(order.amountPaid) * 100) / 100;
  }
  if (order.status === 'paid') return Math.round(Number(order.totalAmount || 0) * 100) / 100;
  return 0;
}

function salesOrderBalanceDue(order) {
  const t = Math.round(Number(order?.totalAmount || 0) * 100) / 100;
  return Math.max(0, Math.round((t - salesOrderEffectivePaid(order)) * 100) / 100);
}

window.salesOrderEffectivePaid = salesOrderEffectivePaid;
window.salesOrderBalanceDue = salesOrderBalanceDue;

/** Verbose lines only when `localStorage.classHistoryUiDebug=1` or `window.__CLASS_HISTORY_UI_DEBUG__=true`. */
function classHistoryUiVerbose() {
  try {
    return (
      typeof window !== 'undefined' &&
      (window.__CLASS_HISTORY_UI_DEBUG__ === true ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('classHistoryUiDebug') === '1'))
    );
  } catch (e) {
    return false;
  }
}

function classHistoryUiLog(msg, data) {
  if (data !== undefined) console.log('[ClassHistoryUI]', msg, data);
  else console.log('[ClassHistoryUI]', msg);
}

function classHistoryUiVerboseLog(msg, data) {
  if (!classHistoryUiVerbose()) return;
  classHistoryUiLog(msg, data);
}

/**
 * When enrollment.orderId is missing (legacy / duplicate slot), infer from paid+unpaid sales orders' line items.
 */
function resolveCourseIdForEnrollment(e, entries) {
  const entry = (entries || []).find((ent) => ent.id === e.timetableEntryId);
  if (!entry) return '';
  if (entry.courseIds && entry.courseIds.length > 0) return String(entry.courseIds[0]);
  if (entry.courseId) return String(entry.courseId);
  return '';
}

/**
 * One row per month: "2026 April" + clickable day numbers. mode: 'sidebar' | 'overlay'
 */
function buildEnrollmentMonthRowsMarkup(enrollmentList, entries, mode) {
  const sorted = [...enrollmentList].sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!sorted.length) return '';
  const entList = entries && entries.length ? entries : window.timetableEntries || [];
  const byMonth = new Map();
  for (const e of sorted) {
    const ymd = String(e.date || '').split('T')[0].split(' ')[0];
    const mat = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!mat) continue;
    const key = `${mat[1]}-${mat[2]}`;
    const dayNum = parseInt(mat[3], 10);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push({ ymd, dayNum, e });
  }
  const keys = Array.from(byMonth.keys()).sort();
  if (keys.length === 0) return '';

  const firstEntry = entList.find((ent) => ent.id === sorted[0].timetableEntryId);
  const classTitle = firstEntry ? firstEntry.className : 'Class';

  const isOverlay = mode === 'overlay';
  const rowCls = isOverlay ? 'overlay-month-row' : 'sales-month-row';
  const labelCls = isOverlay ? 'overlay-month-label' : 'sales-month-label';
  const daysCls = isOverlay ? 'overlay-month-days' : 'sales-month-days';
  const btnCls = isOverlay ? 'overlay-day-jump' : 'sales-day-jump';
  const titleCls = isOverlay ? 'overlay-month-class-title' : 'sales-month-class-title';
  const closeOverlayAttr = isOverlay ? ' data-close-overlay="1"' : '';

  const parts = [`<div class="${titleCls}">${escapeHtml(classTitle)}</div>`];
  for (const key of keys) {
    const items = byMonth.get(key).sort((a, b) => a.dayNum - b.dayNum);
    const [y, m] = key.split('-');
    const monthName = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1).toLocaleDateString('en-US', {
      month: 'long'
    });
    const btns = items.map((it) => {
      const cid = resolveCourseIdForEnrollment(it.e, entList);
      return `<button type="button" class="${btnCls}" data-date="${escapeHtml(it.ymd)}" data-course-id="${escapeHtml(cid)}"${closeOverlayAttr}>${it.dayNum}</button>`;
    });
    parts.push(
      `<div class="${rowCls}"><span class="${labelCls}">${escapeHtml(y)} ${escapeHtml(monthName)}</span> <span class="${daysCls}">${btns.join(' ')}</span></div>`
    );
  }
  return parts.join('');
}

function inferOrderIdForEnrollmentDisplay(enrollment, studentId, orders) {
  if (enrollment.orderId != null && String(enrollment.orderId).trim() !== '') return String(enrollment.orderId);
  const sid = String(studentId);
  const enrDate = String(enrollment.date || '').split('T')[0].split(' ')[0];
  const tid = String(enrollment.timetableEntryId || '');
  for (const ord of orders || []) {
    if (String(ord.studentId) !== sid) continue;
    for (const item of ord.items || []) {
      for (const cls of item.enrolledClasses || []) {
        const rawD = cls.dateString != null ? cls.dateString : cls.date;
        const clsDate = rawD ? String(rawD).split('T')[0].split(' ')[0] : '';
        let cid = String(cls.id || '');
        const baseId = cid.includes('_') ? cid.slice(0, cid.lastIndexOf('_')) : cid;
        const dateOk = clsDate === enrDate;
        const idOk = baseId === tid || cid === tid || (tid && cid.startsWith(tid + '_'));
        if (dateOk && idOk) return String(ord.id);
      }
    }
  }
  return '';
}

window.inferOrderIdForEnrollmentDisplay = inferOrderIdForEnrollmentDisplay;

/**
 * UI smoke: refresh timetable + orders, log table of orderId vs inferred, re-render lists.
 * Run in console: await smokeTestClassHistoryUI()
 */
window.smokeTestClassHistoryUI = async function smokeTestClassHistoryUI() {
  console.log('[ClassHistoryUI:smoke] start');
  const sid = salesState.selectedStudent?.id;
  if (!sid) {
    console.warn('[ClassHistoryUI:smoke] select a student in Sales first');
    return { ok: false, reason: 'no_selected_student' };
  }
  if (typeof window.refreshSalesTimetableFromApi === 'function') {
    await window.refreshSalesTimetableFromApi();
  }
  if (typeof loadStudentOrders === 'function') await loadStudentOrders(sid);
  const enrollments = (window.timetableEnrollments || []).filter((e) => String(e.studentId) === String(sid));
  const ordLookup = [
    ...(salesState.currentPaidOrdersForStudent || []),
    ...(salesState.currentUnpaidOrders || [])
  ];
  const rows = enrollments.map((e) => {
    const inferred = inferOrderIdForEnrollmentDisplay(e, sid, ordLookup);
    return {
      date: e.date,
      timetableEntryId: e.timetableEntryId,
      orderId_on_record: e.orderId || '',
      inferred_orderId: inferred || ''
    };
  });
  console.log('[ClassHistoryUI:smoke] enrollments vs orders', {
    studentId: sid,
    enrollmentCount: enrollments.length,
    ordersForStudent: ordLookup.length
  });
  console.table(rows);
  if (typeof window.renderStudentEnrollments === 'function') window.renderStudentEnrollments();
  if (typeof window.renderStudentOverlayClassHistory === 'function') window.renderStudentOverlayClassHistory();
  return {
    ok: true,
    enrollmentCount: enrollments.length,
    withOrderIdOnRecord: enrollments.filter((e) => e.orderId != null && String(e.orderId).trim() !== '').length
  };
};

/** Refresh selected student from GET /api/students so lessonQuotaByCents matches server (fixes 2nd quota attempt after partial/stale UI). */
async function refreshSelectedSalesStudentFromApi() {
  const sid = salesState.selectedStudent?.id;
  if (!sid || !window.authUtils) return;
  try {
    const sr = await window.authUtils.authenticatedFetch('/students');
    if (!sr || !sr.ok) return;
    const data = await sr.json();
    const list = Array.isArray(data) ? data : data.students || [];
    window.students = list;
    const updated = list.find((s) => String(s.id) === String(sid));
    if (updated) {
      salesState.selectedStudent = updated;
      quotaPayClientLog('refreshSelectedSalesStudentFromApi', {
        lessonQuotaByCents: updated.lessonQuotaByCents
      });
    }
  } catch (e) {
    console.warn('[QuotaPay] refreshSelectedSalesStudentFromApi', e);
  }
}

/**
 * Console helper: same list as GET /api/organizations/orders (org-scoped). Run on Course → Sales while logged in.
 * Example: await debugDumpOrgOrders()
 */
window.debugDumpOrgOrders = async function () {
  try {
    const r = await window.authUtils.authenticatedFetch('/organizations/orders');
    if (!r) {
      console.error('[debugDumpOrgOrders] no response (session expired?)');
      return null;
    }
    if (!r.ok) {
      console.error('[debugDumpOrgOrders] HTTP', r.status);
      return null;
    }
    const list = await r.json();
    const arr = Array.isArray(list) ? list : [];
    const rows = arr.map((o) => ({
      id: o.id,
      studentId: o.studentId,
      status: o.status,
      total: o.totalAmount,
      amountPaid: o.amountPaid,
      due: typeof window.salesOrderBalanceDue === 'function' ? window.salesOrderBalanceDue(o) : null
    }));
    console.info('[debugDumpOrgOrders] rows=', rows.length, '(filter console by debugDump)');
    console.table(rows);
    return arr;
  } catch (e) {
    console.error('[debugDumpOrgOrders]', e);
    return null;
  }
};

function orderPayDebug(...args) {
  try {
    if (
      typeof window !== 'undefined' &&
      (window.__ORDER_PAY_DEBUG__ ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('orderPayDebug') === '1'))
    ) {
      console.info('%c[OrderPay]', 'color:#e11d48;font-weight:bold', ...args);
    }
  } catch (_) {
    /* ignore */
  }
}

/** Always-on browser logs for lesson quota pay (filter console by [QuotaPay]). */
function quotaPayClientLog(...args) {
  try {
    console.info('%c[QuotaPay]', 'color:#dc2626;font-weight:bold', ...args);
  } catch (_) {
    /* ignore */
  }
}

// Handle Student Search
window.handleSalesStudentSearch = async function() {
  const term = document.getElementById('salesStudentSearch').value.toLowerCase();
  const dropdown = document.getElementById('salesStudentDropdown');
  
  if (!dropdown) return;
  
  let studentsList = window.students || [];
  if (studentsList.length === 0) {
    try {
      const response = await window.authUtils.authenticatedFetch('/students');
      if (response && response.ok) {
        const data = await response.json();
        studentsList = Array.isArray(data) ? data : (data.students || []);
        window.students = studentsList;
      }
    } catch (e) {
      console.error('Failed to load students for search', e);
    }
  }
  
  const filtered = studentsList.filter(s => 
    (s.name && s.name.toLowerCase().includes(term)) || 
    (s.chessComId && s.chessComId.toLowerCase().includes(term))
  );
  
  if (filtered.length === 0) {
    dropdown.innerHTML = '<div class="dropdown-item empty">No students found</div>';
    return;
  }
  
  dropdown.innerHTML = filtered.map(s => `
    <div class="dropdown-item" onclick="selectSalesStudent('${s.id}')">
      <div class="student-avatar-small">${s.name.charAt(0).toUpperCase()}</div>
      <div class="student-info">
        <div class="student-name">${escapeHtml(s.name)}</div>
        <div class="student-id">${escapeHtml(s.chessComId || '')}</div>
      </div>
    </div>
  `).join('');
};

// Select Student
window.selectSalesStudent = async function (studentId) {
  const student = (window.students || []).find((s) => String(s.id) === String(studentId));
  if (!student) return;

  if (typeof window.salesDebug === 'function') {
    window.salesDebug('selectSalesStudent: start', {
      studentId: String(studentId),
      step: salesState.step,
      hasSelectedProduct: !!salesState.selectedProduct,
      lessonQuotaByCents: student.lessonQuotaByCents
    });
  }

  salesState.selectedStudent = student;

  document.getElementById('salesStudentSearch').value = '';
  hideStudentDropdown();

  if (typeof window.refreshSalesTimetableFromApi === 'function') {
    await window.refreshSalesTimetableFromApi();
  }

  const card = document.getElementById('selectedStudentCard');
  card.style.display = 'flex';
  
  const balance = typeof student.balance === 'number' ? student.balance : 0;
  
  const quotaLine =
    typeof window.formatLessonQuotaPlainText === 'function'
      ? window.formatLessonQuotaPlainText(student)
      : '';

  card.innerHTML = `
    <div class="selected-student-avatar">${student.name.charAt(0).toUpperCase()}</div>
    <div class="selected-student-info">
      <h3>
        <span class="student-name-plain">${escapeHtml(student.name)}</span>
        <button type="button" class="btn-sales-student-edit" onclick="openSalesEditStudent(event, '${student.id}')">Edit</button>
        <button type="button" class="btn-sales-student-history" onclick="openStudentDetailsOverlay(event)">History</button>
      </h3>
      <div style="margin-top:6px;">
        <span class="student-id-badge">${escapeHtml(student.chessComId || '')}</span>
      </div>
      <div class="student-balance">Balance: $${balance.toFixed(2)}</div>
      <div class="student-balance" style="margin-top:4px;">Remaining lesson quota: ${escapeHtml(quotaLine)}</div>
    </div>
    <button class="btn-close-student" onclick="deselectSalesStudent()">×</button>
  `;
  
  let historyContainer = document.getElementById('salesStudentHistory');
  if (!historyContainer) {
      historyContainer = document.createElement('div');
      historyContainer.id = 'salesStudentHistory';
      historyContainer.className = 'sales-student-history';
      if (card.parentNode) card.parentNode.insertBefore(historyContainer, card.nextSibling);
  }
  
  await loadStudentOrders(studentId);

  if (typeof window.salesDebug === 'function') {
    const paid = salesState.currentPaidOrdersForStudent || [];
    window.salesDebug('selectSalesStudent: after loadStudentOrders', {
      paidCount: paid.length,
      paidIds: paid.map((o) => o.id),
      quotaAfterLoad: student.lessonQuotaByCents
    });
  }

  if (typeof window.syncSalesProductFromStudentOrders === 'function') {
    await window.syncSalesProductFromStudentOrders(studentId);
  }

  if (typeof window.salesDebug === 'function') {
    window.salesDebug('selectSalesStudent: after sync', {
      step: salesState.step,
      productType: salesState.selectedProduct?.type,
      productId: salesState.selectedProduct?.data?.id,
      priceStrategy: salesState.selectedProduct?.data?.priceStrategy
    });
  }

  if (window.renderStudentEnrollments) window.renderStudentEnrollments();

  renderSalesCart();
  if (typeof updateDaySchedule === 'function') updateDaySchedule();
  if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
};

// Edit Student shortcut from Sales selected card
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
window.openStudentDetailsOverlay = async function (event) {
  if (event) event.stopPropagation();
  const student = salesState.selectedStudent;
  if (!student) return;

  let overlay = document.getElementById('studentDetailsOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'studentDetailsOverlay';
    overlay.className = 'student-details-overlay-backdrop';
    overlay.innerHTML = `
      <div class="student-details-overlay" onclick="event.stopPropagation();">
        <div class="overlay-header">
          <div class="overlay-avatar">${student.name.charAt(0).toUpperCase()}</div>
          <div class="overlay-meta">
            <div class="overlay-name-row">
              <span class="overlay-name"></span>
              <span class="overlay-id"></span>
            </div>
            <div class="overlay-balance"></div>
          </div>
        </div>
        <div class="overlay-tabs">
          <button class="overlay-tab active" data-tab="class" onclick="switchStudentOverlayTab('class')">Class History</button>
          <button class="overlay-tab" data-tab="payment" onclick="switchStudentOverlayTab('payment')">Payment History</button>
        </div>
        <div class="overlay-content">
          <div id="studentOverlayClassTab" class="overlay-tab-panel active"></div>
          <div id="studentOverlayPaymentTab" class="overlay-tab-panel"></div>
        </div>
        <div class="overlay-footer">
          <button class="btn-close-overlay" onclick="closeStudentOverlay()">Close</button>
        </div>
      </div>
    `;
    overlay.addEventListener('click', closeStudentOverlay);
    document.body.appendChild(overlay);

    if (!document.getElementById('studentOverlayStyles')) {
      const style = document.createElement('style');
      style.id = 'studentOverlayStyles';
      style.textContent = `
        .student-details-overlay-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: none; align-items: center; justify-content: center; padding: 20px; z-index: 2000; }
        .student-details-overlay { background: #fff; width: 520px; max-height: 85vh; border-radius: 12px; display: flex; flex-direction: column; box-shadow: 0 12px 30px rgba(0,0,0,0.18); overflow: hidden; }
        .student-details-overlay .overlay-header { display: flex; gap: 12px; padding: 18px 20px 12px; border-bottom: 1px solid #f1f5f9; }
        .student-details-overlay .overlay-avatar { width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #60a5fa, #2563eb); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 20px; }
        .student-details-overlay .overlay-meta { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
        .student-details-overlay .overlay-name-row { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 700; color: #111827; }
        .student-details-overlay .overlay-id { background: #eef2ff; color: #3730a3; padding: 3px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
        .student-details-overlay .overlay-balance { font-size: 14px; color: #6b7280; }
        .student-details-overlay .overlay-tabs { display: flex; gap: 8px; padding: 12px 20px 0; }
        .student-details-overlay .overlay-tab { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; color: #334155; padding: 10px; border-radius: 10px 10px 0 0; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .student-details-overlay .overlay-tab.active { background: #fff; border-bottom-color: #fff; color: #111827; box-shadow: 0 -1px 0 #fff; }
        .student-details-overlay .overlay-content { padding: 12px 20px 0; flex: 1; overflow-y: auto; }
        .student-details-overlay .overlay-tab-panel { display: none; }
        .student-details-overlay .overlay-tab-panel.active { display: block; }
        .student-details-overlay .overlay-footer { position: sticky; bottom: 0; background: #fff; padding: 14px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; }
        .student-details-overlay .btn-close-overlay { min-width: 100px; padding: 10px 14px; background: #1d4ed8; color: #fff; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; }
        .student-details-overlay .btn-close-overlay:hover { background: #1e40af; }
        .overlay-empty { color: #94a3b8; font-size: 14px; text-align: center; padding: 20px 10px; }
        .overlay-history-by-order { display: flex; flex-direction: column; gap: 12px; }
        .overlay-order-group { border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; overflow: hidden; }
        .overlay-order-group[open] .overlay-order-summary { border-bottom: 1px solid #e2e8f0; }
        .overlay-order-summary { list-style: none; cursor: pointer; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; color: #1e293b; background: #f8fafc; user-select: none; }
        .overlay-order-summary::-webkit-details-marker { display: none; }
        .overlay-order-label { font-weight: 600; flex: 1; min-width: 0; text-align: left; }
        .overlay-order-meta { font-size: 12px; color: #64748b; font-weight: 600; flex-shrink: 0; }
        .overlay-order-kind { font-size: 11px; font-weight: 600; color: #94a3b8; margin-left: 6px; }
        .overlay-order-classes { display: flex; flex-direction: column; gap: 8px; padding: 10px 10px 12px; background: #fafafa; }
        .overlay-history-list { display: flex; flex-direction: column; gap: 10px; }
        .overlay-history-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; }
        .overlay-history-item.makeup-class { border-color: #667eea; background: #eef2ff; }
        .overlay-history-date { font-weight: 700; color: #2563eb; }
        .overlay-history-title { flex: 1; margin-left: 12px; color: #111827; font-weight: 600; }
        .overlay-history-meta { font-size: 12px; color: #6b7280; }
        .overlay-history-note { font-size: 11px; color: #667eea; font-weight: 500; }
        .student-name-link { background: none; border: none; padding: 0; margin: 0; font: inherit; color: #1d4ed8; cursor: pointer; }
        .student-name-link:hover { text-decoration: underline; }
      `;
      document.head.appendChild(style);
    }
  }

  const balance = typeof student.balance === 'number' ? student.balance : 0;
  const nameEl = overlay.querySelector('.overlay-name');
  const idEl = overlay.querySelector('.overlay-id');
  const balanceEl = overlay.querySelector('.overlay-balance');
  const avatarEl = overlay.querySelector('.overlay-avatar');

  if (nameEl) nameEl.textContent = student.name || 'Student';
  // Show system Student ID + chess.com ID (and local name if any)
  if (idEl) {
    const sysId = String(student.id || '');
    const chessId = String(student.chessComId || '');
    const localName = String(student.localName || '');
    idEl.textContent = `${sysId ? `ID: ${sysId}` : 'ID: —'}${chessId ? ` · chess.com: ${chessId}` : ''}${localName ? ` · Local: ${localName}` : ''}`;
  }
  if (balanceEl) balanceEl.textContent = `Balance: $${balance.toFixed(2)}`;
  if (avatarEl) avatarEl.textContent = student.name ? student.name.charAt(0).toUpperCase() : '?';

  if (typeof window.refreshSalesTimetableFromApi === 'function') {
    classHistoryUiLog('openStudentDetailsOverlay: refreshing timetable before render');
    await window.refreshSalesTimetableFromApi();
  }
  if (typeof loadStudentOrders === 'function') {
    await loadStudentOrders(student.id);
  }

  switchStudentOverlayTab('class');
  overlay.style.display = 'flex';
};

// Switch tabs inside student overlay
window.switchStudentOverlayTab = function(tab) {
  const overlay = document.getElementById('studentDetailsOverlay');
  if (!overlay) return;

  overlay.querySelectorAll('.overlay-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  overlay.querySelectorAll('.overlay-tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === (tab === 'class' ? 'studentOverlayClassTab' : 'studentOverlayPaymentTab'));
  });

  if (tab === 'class') {
    renderStudentOverlayClassHistory();
  } else {
    renderStudentOverlayPaymentHistory();
  }
};

// Close overlay
window.closeStudentOverlay = function() {
  const overlay = document.getElementById('studentDetailsOverlay');
  if (overlay) overlay.style.display = 'none';
};

// Render Class History tab content (grouped by purchase order / orderId)
function renderStudentOverlayClassHistory() {
  const panel = document.getElementById('studentOverlayClassTab');
  if (!panel) return;
  classHistoryUiLog('renderStudentOverlayClassHistory: start');
  if (!document.getElementById('studentOverlayOrderGroupStyles')) {
    const s = document.createElement('style');
    s.id = 'studentOverlayOrderGroupStyles';
    s.textContent = `
      .overlay-history-by-order { display: flex; flex-direction: column; gap: 12px; }
      .overlay-order-group { border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; overflow: hidden; }
      .overlay-order-group[open] .overlay-order-summary { border-bottom: 1px solid #e2e8f0; }
      .overlay-order-summary { list-style: none; cursor: pointer; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; color: #1e293b; background: #f8fafc; user-select: none; }
      .overlay-order-summary::-webkit-details-marker { display: none; }
      .overlay-order-label { font-weight: 600; flex: 1; min-width: 0; text-align: left; }
      .overlay-order-meta { font-size: 12px; color: #64748b; font-weight: 600; flex-shrink: 0; }
      .overlay-order-kind { font-size: 11px; font-weight: 600; color: #94a3b8; margin-left: 6px; }
      .overlay-order-classes { display: flex; flex-direction: column; gap: 8px; padding: 10px 10px 12px; background: #fafafa; }
      .overlay-order-classes .overlay-history-item { background: #fff; }
      .overlay-month-class-title { font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 8px; }
      .overlay-month-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; font-size: 13px; padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
      .overlay-month-row:last-child { border-bottom: none; }
      .overlay-month-label { color: #0f172a; font-weight: 700; flex-shrink: 0; }
      .overlay-month-days { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .overlay-day-jump { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; color: #2563eb; font-weight: 700; font-size: 13px; padding: 2px 10px; cursor: pointer; font-family: inherit; line-height: 1.3; }
      .overlay-day-jump:hover { background: #dbeafe; }
    `;
    document.head.appendChild(s);
  }
  const studentId = salesState.selectedStudent?.id;
  if (!studentId) {
    panel.innerHTML = '<div class="overlay-empty">No student selected.</div>';
    return;
  }

  const enrollments = (window.timetableEnrollments || []).filter(
    (e) => String(e.studentId) === String(studentId)
  );
  classHistoryUiLog('renderStudentOverlayClassHistory: enrollments', {
    count: enrollments.length,
    sampleRawOrderIds: enrollments.slice(0, 5).map((e) => e.orderId ?? null)
  });
  if (enrollments.length === 0) {
    panel.innerHTML = '<div class="overlay-empty">No class history yet.</div>';
    return;
  }

  const ordLookup = [
    ...(salesState.currentPaidOrdersForStudent || []),
    ...(salesState.currentUnpaidOrders || [])
  ];

  const groupMap = new Map();
  for (const e of enrollments) {
    const inferred = inferOrderIdForEnrollmentDisplay(e, studentId, ordLookup);
    const fromRec = e.orderId != null && String(e.orderId).trim() !== '' ? String(e.orderId) : '';
    const effectiveOid = fromRec || inferred;
    const k = effectiveOid ? `order:${effectiveOid}` : 'no-order';
    classHistoryUiVerboseLog('enrollment → group', {
      date: e.date,
      timetableEntryId: e.timetableEntryId,
      orderId_on_record: fromRec || null,
      inferred_orderId: inferred || null,
      groupKey: k
    });
    if (!groupMap.has(k)) groupMap.set(k, []);
    groupMap.get(k).push(e);
  }

  classHistoryUiLog('renderStudentOverlayClassHistory: groups built', {
    groupCount: groupMap.size,
    keys: Array.from(groupMap.keys())
  });

  const groups = Array.from(groupMap.entries()).map(([key, list]) => {
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
    const minDate = list[0].date;
    const orderId = key.startsWith('order:') ? key.slice(6) : '';
    const short =
      orderId.length > 12 ? `${escapeHtml(orderId.slice(0, 10))}…` : escapeHtml(orderId);
    const ordRow = orderId ? ordLookup.find((o) => String(o.id) === String(orderId)) : null;
    let productTitle = '';
    if (ordRow && ordRow.items && ordRow.items[0] && ordRow.items[0].productData) {
      const n = ordRow.items[0].productData.name;
      if (n) productTitle = ` · ${escapeHtml(String(n))}`;
    }
    const anyInferred = list.some(
      (en) => !(en.orderId != null && String(en.orderId).trim() !== '') && orderId
    );
    const inferredHint = anyInferred
      ? ` <span style="color:#94a3b8;font-size:11px;font-weight:500;">(order from schedule match)</span>`
      : '';
    const label =
      key === 'no-order'
        ? `<span style="color:#64748b;">Classes not linked to an order</span>`
        : `Order <span style="color:#64748b;font-weight:500;">${short || escapeHtml(orderId)}</span>${productTitle}${inferredHint}`;
    return { key, list, minDate, label, orderId, ordRow };
  });
  groups.sort((a, b) => new Date(a.minDate) - new Date(b.minDate));

  const entries = window.timetableEntries || [];

  panel.innerHTML = `
    <div class="overlay-history-by-order">
      ${groups
        .map((g) => {
          let kindSpan = '';
          if (g.orderId && g.ordRow && g.ordRow.items && g.ordRow.items.length) {
            const isPkg = g.ordRow.items.some(
              (it) =>
                it.productType === 'package' ||
                (it.productData &&
                  Array.isArray(it.productData.courses) &&
                  it.productData.courses.length > 0)
            );
            kindSpan = `<span class="overlay-order-kind">${isPkg ? 'Package' : 'Course'}</span>`;
          }
          return `
      <details class="overlay-order-group" ${groups.length === 1 ? 'open' : ''}>
        <summary class="overlay-order-summary">
          <span class="overlay-order-label">${g.label}${kindSpan}</span>
          <span class="overlay-order-meta">${g.list.length} class(es)</span>
        </summary>
        <div class="overlay-order-classes">
          ${buildEnrollmentMonthRowsMarkup(g.list, entries, 'overlay')}
        </div>
      </details>`;
        })
        .join('')}
    </div>
  `;
  classHistoryUiLog('renderStudentOverlayClassHistory: done', {
    detailsElements: panel.querySelectorAll('details.overlay-order-group').length
  });
}

window.renderStudentOverlayClassHistory = renderStudentOverlayClassHistory;

// Render Payment History tab content (placeholder for backend hookup)
function renderStudentOverlayPaymentHistory() {
  const panel = document.getElementById('studentOverlayPaymentTab');
  if (!panel) return;
  panel.innerHTML = `
    <div class="overlay-empty">
      Payment history will appear here once connected to backend records.
    </div>
  `;
}

// Load Student Orders
window.loadStudentOrders = async function loadStudentOrders(studentId) {
    // Fetch all orders and filter (simplest integration)
    // Ideally backend should support /organizations/orders?studentId=...
    try {
        const response = await window.authUtils.authenticatedFetch('/organizations/orders');
        if (response.ok) {
            const allOrders = await response.json();
            const sid = String(studentId);
            const unpaidOrders = allOrders.filter(
              (o) => String(o.studentId) === sid && o.status === 'unpaid'
            );
            salesState.currentUnpaidOrders = unpaidOrders;
            salesState.currentPaidOrdersForStudent = allOrders.filter(
              (o) => String(o.studentId) === sid && o.status === 'paid'
            );
            if (typeof window.salesDebug === 'function') {
              const paid = salesState.currentPaidOrdersForStudent;
              window.salesDebug('loadStudentOrders', {
                studentId: sid,
                allOrdersCount: allOrders.length,
                paidCount: paid.length,
                unpaidCount: unpaidOrders.length,
                firstPaidItemSample: paid[0]?.items?.[0]
                  ? {
                      name: paid[0].items[0].productData?.name,
                      priceStrategy: paid[0].items[0].productData?.priceStrategy
                    }
                  : null
              });
            }
            if (typeof window.salesTrace === 'function') {
              const paid = salesState.currentPaidOrdersForStudent || [];
              window.salesTrace('loadStudentOrders', {
                studentId: sid,
                paidOrderIds: paid.map((o) => o.id),
                paidCount: paid.length,
                firstOrderFirstLine: paid[0]?.items?.[0]
                  ? {
                      productType: paid[0].items[0].productType,
                      priceStrategy: paid[0].items[0].productData?.priceStrategy
                    }
                  : null
              });
            }
            const unpaidSnap = salesState.currentUnpaidOrders || [];
            orderPayDebug('loadStudentOrders', {
              studentId: sid,
              unpaidCount: unpaidSnap.length,
              unpaidSummaries: unpaidSnap.map((o) => ({
                id: o.id,
                total: o.totalAmount,
                amountPaid: o.amountPaid,
                due: salesOrderBalanceDue(o),
                status: o.status
              }))
            });
            renderStudentUnpaidOrders();
        } else {
            salesState.currentPaidOrdersForStudent = [];
            if (typeof window.salesDebug === 'function') {
              window.salesDebug('loadStudentOrders: API not ok, cleared paid orders', { status: response.status });
            }
        }
    } catch (e) {
        console.error('Failed to load student orders', e);
        salesState.currentPaidOrdersForStudent = [];
        if (typeof window.salesDebug === 'function') {
          window.salesDebug('loadStudentOrders: exception', String(e && e.message ? e.message : e));
        }
    }
};

// Render Unpaid Orders in Sidebar
function renderStudentUnpaidOrders() {
    let container = document.getElementById('salesUnpaidOrders');
    const card = document.getElementById('selectedStudentCard');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'salesUnpaidOrders';
        container.className = 'sales-unpaid-orders';
        // Insert after selectedStudentCard
        if (card && card.parentNode) card.parentNode.insertBefore(container, card.nextSibling);
        
        // Add styles if not present
        if (!document.getElementById('salesUnpaidStyles')) {
            const style = document.createElement('style');
            style.id = 'salesUnpaidStyles';
            style.textContent = `
                .sales-unpaid-orders { margin-top: 6px; padding: 12px; background: rgba(255, 59, 48, 0.06); border: 1px solid rgba(255, 59, 48, 0.18); border-radius: 12px; }
                .unpaid-header { font-weight: 600; font-size: 12px; color: #1d1d1f; margin-bottom: 8px; display:flex; justify-content:space-between; letter-spacing: -0.01em; }
                .unpaid-item { display: flex; justify-content: space-between; align-items: center; font-size: 13px; padding: 8px 0; border-bottom: 1px solid rgba(60, 60, 67, 0.1); }
                .unpaid-item:last-child { border-bottom: none; }
                .unpaid-info { flex: 1; }
                .unpaid-date { font-size: 11px; color: #6e6e73; }
                .unpaid-amount { font-weight: 600; color: #ff3b30; }
                .btn-pay-order { padding: 4px 10px; font-size: 11px; background: #e11d48; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 10px; }
                .btn-pay-order:hover { background: #be123c; }
            `;
            document.head.appendChild(style);
        }
    }
    
    const orders = salesState.currentUnpaidOrders || [];
    
    if (orders.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    container.innerHTML = `
        <div class="unpaid-header">
            <span>⚠️ Unpaid Orders (${orders.length})</span>
        </div>
        <div class="unpaid-list">
            ${orders.map(order => {
                const dateStr = new Date(order.date).toLocaleDateString();
                const itemsSummary = order.items.map(i => i.productData.name).join(', ');
                
                const firstItem = order.items[0];
                const firstClass = (firstItem && firstItem.enrolledClasses && firstItem.enrolledClasses.length > 0) ? firstItem.enrolledClasses[0] : null;
                const dateToJump = firstClass ? firstClass.date : null;
                const courseToJump = firstClass ? firstClass.entry.courseIds[0] : null;
                const jumpAttr = dateToJump ? `onclick="jumpToDate('${dateToJump}', '${courseToJump}')" style="cursor:pointer;" title="Jump to ${dateToJump}"` : '';

                // Format class date if available
                let displayDate = dateStr; // Default to order date
                let dateLabel = 'Order: ';
                if (dateToJump) {
                    const classDateObj = new Date(dateToJump);
                    if (!isNaN(classDateObj)) {
                        displayDate = classDateObj.toLocaleDateString();
                        dateLabel = 'Class: ';
                    }
                }

                return `
                    <div class="unpaid-item">
                        <div class="unpaid-info" ${jumpAttr}>
                            <div class="unpaid-date" style="font-size:10px; color:#666;">${dateLabel}${displayDate}</div>
                            <div title="${escapeHtml(itemsSummary)}" style="font-weight:600; color:#333;">${escapeHtml(itemsSummary.substring(0, 25))}${itemsSummary.length > 25 ? '...' : ''}</div>
                        </div>
                        <div class="unpaid-amount">$${formatNumber(salesOrderBalanceDue(order))}</div>
                        ${salesOrderEffectivePaid(order) > 0 && salesOrderBalanceDue(order) > 0 ? `<div class="unpaid-date" style="margin-top:2px;">Paid $${formatNumber(salesOrderEffectivePaid(order))} of $${formatNumber(order.totalAmount)}</div>` : ''}
                        <div style="display:flex; gap:5px;">
                            <button class="btn-pay-order" onclick="payExistingOrder('${order.id}')">Pay</button>
                            <button class="btn-pay-order" style="background:#ef4444;" onclick="deleteSalesOrder('${order.id}')">Del</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

window.payExistingOrder = function(orderId) {
    const order = (salesState.currentUnpaidOrders || []).find(o => o.id === orderId);
    if (!order) return;
    
    // Set checkout state for existing order
    checkoutState.mode = 'existing';
    checkoutState.orderId = orderId;
    checkoutState.existingOrder = order;
    checkoutState.method = 'cash';
    
    // Open modal specifically for existing order to bypass empty cart check
    window.openCheckoutModal('existing');
    
    // Render items from order
    const container = document.getElementById('checkoutItemsList');
    container.innerHTML = order.items.map(item => `
        <div class="checkout-item" style="margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <label style="display:flex; align-items:center; gap:10px; font-weight:bold;">
                    <input type="checkbox" checked disabled>
                    ${escapeHtml(item.productData.name)}
                </label>
                <span style="font-weight:bold;">$${formatNumber(item.price)}</span>
            </div>
        </div>
    `).join('');
    
    // Disable select all as it's fixed for existing order
    const selectAll = document.getElementById('checkoutSelectAll');
    if (selectAll) selectAll.disabled = true;
    
    const due = salesOrderBalanceDue(order);
    document.getElementById('checkoutShouldPay').textContent = `$${formatNumber(due)}`;
    
    const input = document.querySelector(`#paymentFormCash .payment-amount-input`);
    const canQuota =
      salesState.selectedStudent &&
      typeof window.salesOrderCanPayRemainingWithLessonQuota === 'function' &&
      window.salesOrderCanPayRemainingWithLessonQuota(salesState.selectedStudent, order);
    orderPayDebug('payExistingOrder', {
      orderId,
      due,
      canQuota,
      paid: salesOrderEffectivePaid(order),
      total: order.totalAmount
    });
    if (canQuota) {
      switchPaymentMethod('quota');
    } else {
      switchPaymentMethod('cash');
      if (input) input.value = due;
    }
    updatePayButton();
};

window.deleteSalesOrder = async function(orderId) {
    if (!confirm('Are you sure you want to delete this order? This will also drop enrolled classes.')) return;
    
    try {
        // First, get order details to find enrollments
        const order = (salesState.currentUnpaidOrders || []).find(o => o.id === orderId);
        if (order && order.items) {
            for (const item of order.items) {
                if (item.enrolledClasses) {
                    for (const cls of item.enrolledClasses) {
                        // Find actual enrollment ID from timetableEnrollments
                        // The cls object here is from order structure which might be static snapshot
                        // We need to find active enrollment that matches this class entry
                        
                        // We match by timetableEntryId, studentId and date
                        const enrollment = (window.timetableEnrollments || []).find(e => 
                            e.timetableEntryId === cls.entry.id && 
                            e.studentId === salesState.selectedStudent.id &&
                            e.date === cls.date
                        );
                        
                        if (enrollment) {
                            console.log('[DEBUG] Dropping enrollment:', enrollment.id);
                            await window.authUtils.authenticatedFetch('/organizations/enrollments/drop', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    studentId: salesState.selectedStudent.id,
                                    mode: 'single',
                                    enrollmentId: enrollment.id
                                })
                            });
                        }
                    }
                }
            }
        }

        const response = await window.authUtils.authenticatedFetch(`/organizations/orders/${orderId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            if (window.showToast) window.showToast('Order deleted and classes dropped', 'success');
            else alert('Order deleted and classes dropped');
            
            // Reload orders
            if (salesState.selectedStudent) {
                loadStudentOrders(salesState.selectedStudent.id);
            }
            
            // Refresh timetable to reflect dropped classes
            if (typeof window.loadTimetableData === 'function') {
                await window.loadTimetableData();
            }
            
            // Refresh UI
            if (typeof updateDaySchedule === 'function') updateDaySchedule();
            if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
            if (typeof renderStudentEnrollments === 'function') renderStudentEnrollments();
            
        } else {
            const err = await response.json();
            alert(err.error || 'Failed to delete order');
        }
    } catch (e) {
        console.error('Error deleting order:', e);
        alert('Error deleting order');
    }
};

window.deselectSalesStudent = function() {
  salesState.selectedStudent = null;
  salesState.currentPaidOrdersForStudent = [];
  document.getElementById('selectedStudentCard').style.display = 'none';
  const historyContainer = document.getElementById('salesStudentHistory');
  if (historyContainer) historyContainer.innerHTML = '';
  const unpaidEl = document.getElementById('salesUnpaidOrders');
  if (unpaidEl) {
    unpaidEl.style.display = 'none';
    unpaidEl.innerHTML = '';
  }
  closeStudentOverlay();
  const ces = document.querySelector('.cart-empty-state');
  if (ces) {
    ces.innerHTML = '';
    ces.style.display = 'none';
  }
  document.getElementById('salesCartContent').style.display = 'none';
  if (typeof updateDaySchedule === 'function') updateDaySchedule();
  if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
};

// Render Student Enrollments List (grouped by purchase / orderId, expand/collapse)
window.renderStudentEnrollments = function () {
  const container = document.getElementById('salesStudentHistory');
  if (!container) return;

  const studentId = salesState.selectedStudent?.id;
  if (!studentId) {
    container.innerHTML = '';
    return;
  }

  classHistoryUiLog('renderStudentEnrollments: start', { studentId: String(studentId) });

  const enrollments = (window.timetableEnrollments || []).filter(
    (e) => String(e.studentId) === String(studentId)
  );
  if (enrollments.length === 0) {
    container.innerHTML = '';
    classHistoryUiLog('renderStudentEnrollments: no enrollments');
    return;
  }

  if (!document.getElementById('salesHistoryStyles')) {
    const style = document.createElement('style');
    style.id = 'salesHistoryStyles';
    style.textContent = `
            .sales-student-history { margin-top: 6px; padding: 10px 12px; background: rgba(248,248,250,0.95); border-radius: 14px; max-height: 280px; overflow-y: auto;
              border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 2px 12px rgba(0,0,0,0.04); font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif; }
            .sales-enroll-wrap { display: flex; flex-direction: column; gap: 8px; }
            .history-header { font-weight: 600; font-size: 13px; color: #3c3c43; letter-spacing: -0.01em; margin-bottom: 2px; }
            .sales-enroll-group { border-radius: 12px; background: #fff; border: 1px solid rgba(0,0,0,0.06); overflow: hidden; }
            .sales-enroll-summary { list-style: none; cursor: pointer; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px;
              font-size: 13px; color: #1c1c1e; user-select: none; }
            .sales-enroll-summary::-webkit-details-marker { display: none; }
            .sales-enroll-summary-label { font-weight: 500; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .sales-enroll-summary-meta { font-size: 12px; color: #8e8e93; font-weight: 500; }
            .sales-enroll-group[open] .sales-enroll-summary { border-bottom: 1px solid rgba(0,0,0,0.06); }
            .sales-enroll-list { padding: 8px 10px 10px; }
            .history-item { display: flex; justify-content: space-between; align-items: center; font-size: 13px; padding: 8px 12px; cursor: pointer;
              transition: background 0.15s; gap: 10px; border-bottom: 1px solid rgba(0,0,0,0.04); }
            .history-item:last-child { border-bottom: none; }
            .history-item:hover { background: rgba(0,122,255,0.06); }
            .history-date { color: #007aff; font-weight: 600; flex-shrink: 0; }
            .history-info { flex: 1; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #3c3c43; }
            .sales-quota-label { font-size: 12px; font-weight: 600; color: #8e8e93; margin-bottom: 4px; }
            .sales-quota-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
            .sales-quota-chip { display: inline-block; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 980px;
              background: rgba(0,122,255,0.12); color: #007aff; }
            .sales-quota-muted { font-size: 12px; color: #8e8e93; }
            .sales-enroll-summary-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
            .sales-history-kind { font-size: 11px; font-weight: 600; color: #8e8e93; margin-left: 4px; }
            .sales-order-use-product-btn { font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 8px;
              border: 1px solid rgba(0,122,255,0.35); background: rgba(0,122,255,0.08); color: #007aff; cursor: pointer;
              font-family: inherit; }
            .sales-order-use-product-btn:hover { background: rgba(0,122,255,0.14); }
            .sales-month-class-title { font-size: 12px; font-weight: 600; color: #3c3c43; margin-bottom: 6px; }
            .sales-month-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 8px; font-size: 13px; padding: 4px 0; border-bottom: 1px solid rgba(0,0,0,0.06); }
            .sales-month-row:last-child { border-bottom: none; }
            .sales-month-label { color: #1c1c1e; font-weight: 600; flex-shrink: 0; }
            .sales-month-days { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
            .sales-day-jump { background: rgba(0,122,255,0.1); border: none; border-radius: 6px; color: #007aff; font-weight: 700; font-size: 13px; padding: 2px 8px; cursor: pointer; font-family: inherit; line-height: 1.3; }
            .sales-day-jump:hover { background: rgba(0,122,255,0.18); }
        `;
    document.head.appendChild(style);
  }

  const ordLookupHist = [
    ...(salesState.currentPaidOrdersForStudent || []),
    ...(salesState.currentUnpaidOrders || [])
  ];

  const groupMap = new Map();
  for (const e of enrollments) {
    const inferred = inferOrderIdForEnrollmentDisplay(e, studentId, ordLookupHist);
    const fromRec = e.orderId != null && String(e.orderId).trim() !== '' ? String(e.orderId) : '';
    const effectiveOid = fromRec || inferred;
    const k = effectiveOid ? `order:${effectiveOid}` : 'no-order';
    classHistoryUiVerboseLog('sidebar enrollment → group', {
      date: e.date,
      orderId_on_record: fromRec || null,
      inferred: inferred || null,
      groupKey: k
    });
    if (!groupMap.has(k)) groupMap.set(k, []);
    groupMap.get(k).push(e);
  }

  classHistoryUiLog('renderStudentEnrollments: groups', {
    count: groupMap.size,
    keys: Array.from(groupMap.keys())
  });

  const groups = Array.from(groupMap.entries()).map(([key, list]) => {
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
    const minDate = list[0].date;
    const orderId = key.startsWith('order:') ? key.slice(6) : '';
    const short =
      orderId.length > 12 ? `${escapeHtml(orderId.slice(0, 10))}…` : escapeHtml(orderId);
    const anyInferred = list.some(
      (en) => !(en.orderId != null && String(en.orderId).trim() !== '') && orderId
    );
    const inferredHint = anyInferred
      ? ` <span style="color:#8e8e93;font-size:10px;font-weight:500;">(matched)</span>`
      : '';
    const label =
      key === 'no-order'
        ? 'Other enrollments'
        : `Order <span style="color:#8e8e93;font-weight:500;">${short || escapeHtml(orderId)}</span>${inferredHint}`;
    return { key, list, minDate, label, orderId };
  });
  groups.sort((a, b) => new Date(a.minDate) - new Date(b.minDate));

  container.innerHTML = `
        <div class="sales-enroll-wrap">
            <div class="history-header">Enrolled dates (${enrollments.length})</div>
            ${groups
              .map((g) => {
                const ordRow = g.orderId
                  ? ordLookupHist.find((o) => String(o.id) === String(g.orderId))
                  : null;
                let kindSpan = '';
                if (g.orderId && ordRow && ordRow.items && ordRow.items.length) {
                  const isPkg = ordRow.items.some(
                    (it) =>
                      it.productType === 'package' ||
                      (it.productData &&
                        Array.isArray(it.productData.courses) &&
                        it.productData.courses.length > 0)
                  );
                  kindSpan = `<span class="sales-history-kind">${isPkg ? 'Package' : 'Course'}</span>`;
                }
                const useBtn = g.orderId
                  ? `<button type="button" class="sales-order-use-product-btn" data-order-id="${escapeHtml(String(g.orderId))}">Use product</button>`
                  : '';
                return `
            <details class="sales-enroll-group" ${groups.length === 1 ? 'open' : ''}>
                <summary class="sales-enroll-summary">
                    <span class="sales-enroll-summary-label">${g.label}${kindSpan}</span>
                    <span class="sales-enroll-summary-actions">
                        ${useBtn}
                        <span class="sales-enroll-summary-meta">${g.list.length} date(s)</span>
                    </span>
                </summary>
                <div class="sales-enroll-list">
                    ${buildEnrollmentMonthRowsMarkup(g.list, window.timetableEntries || [], 'sidebar')}
                </div>
            </details>`;
              })
              .join('')}
        </div>
    `;
  container.querySelectorAll('.sales-order-use-product-btn').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const id = btn.getAttribute('data-order-id');
      if (typeof window.salesTrace === 'function') {
        window.salesTrace('Use product button', { orderId: id, hasHandler: typeof window.salesApplyProductFromOrder === 'function' });
      }
      if (id && typeof window.salesApplyProductFromOrder === 'function') {
        window.salesApplyProductFromOrder(id);
      }
    });
  });
  container.scrollTop = container.scrollHeight;
  classHistoryUiLog('renderStudentEnrollments: done', {
    detailsCount: container.querySelectorAll('details.sales-enroll-group').length
  });
};

window.resetSales = function() {
  salesState.cart = [];
  deselectSalesStudent();
  salesState.step = 1;
  showProductList();
};

window.saveSalesOrder = async function() {
  const order = await submitSalesOrder('unpaid');
  if (order) {
      // After saving, reload student orders to show in unpaid list
      if (salesState.selectedStudent) {
          await loadStudentOrders(salesState.selectedStudent.id);
      }
      // Automatically print Payment Reminder
      if (typeof printReceipt === 'function') {
          printReceipt(order);
      }
  }
};

window.processSalesPayment = function() {
  const payBtn = document.querySelector('.sales-footer-actions .btn-primary');
  if (
    payBtn &&
    payBtn.getAttribute('data-pay-mode') === 'quota' &&
    salesState.cart.length > 0 &&
    typeof window.salesCartCanFullyPayWithLessonQuota === 'function' &&
    window.salesCartCanFullyPayWithLessonQuota(salesState.selectedStudent, salesState.cart)
  ) {
    openCheckoutModal('new', { preferQuotaTab: true });
    return;
  }
  if (salesState.cart.length === 0 && salesState.currentUnpaidOrders && salesState.currentUnpaidOrders.length > 0) {
      openCheckoutModal('unpaid_orders');
  } else {
      openCheckoutModal('new');
  }
};

async function submitSalesOrder(status, itemsOverride = null, paymentDetails = null) {
  const itemsToSubmit = itemsOverride || salesState.cart;

  if (itemsToSubmit.length === 0) {
    if (window.showToast) window.showToast('Cart is empty', 'error');
    else alert('Cart is empty');
    return;
  }
  
  if (!salesState.selectedStudent) {
    if (window.showToast) window.showToast('No student selected', 'error');
    else alert('No student selected');
    return;
  }
  
  // Use button reference
  const payBtn = document.querySelector('.sales-footer-actions .btn-primary');
  const saveBtn = document.querySelector('.sales-footer-actions .btn-secondary'); 
  const activeBtn = status === 'paid' ? payBtn : saveBtn;
  
  if (activeBtn) {
    activeBtn.textContent = 'Processing...';
    activeBtn.disabled = true;
  }

  const mergeIntoOrderId = resolveSalesMergeIntoOrderId(itemsToSubmit);
  orderPayDebug('submitSalesOrder', {
    status,
    mergeIntoOrderId: mergeIntoOrderId || null,
    paymentMethod: paymentDetails && paymentDetails.method,
    itemCount: itemsToSubmit.length,
    cartTotal: itemsToSubmit.reduce((s, it) => s + (Number(it.price) || 0), 0)
  });
  if (paymentDetails && String(paymentDetails.method).toLowerCase() === 'lesson_quota') {
    const st = salesState.selectedStudent;
    quotaPayClientLog('submitSalesOrder lesson_quota → POST /organizations/orders', {
      studentId: st && st.id,
      mergeIntoOrderId: mergeIntoOrderId || null,
      itemLines: itemsToSubmit.map((it) => ({
        price: it.price,
        lessons: (it.enrolledClasses || []).length,
        unitCents:
          (it.enrolledClasses || []).length > 0
            ? Math.round(((Number(it.price) || 0) * 100) / (it.enrolledClasses || []).length)
            : null
      })),
      quotaTiersOnStudent: st && st.lessonQuotaByCents ? { ...st.lessonQuotaByCents } : {}
    });
  }
  const payload = {
    studentId: salesState.selectedStudent.id,
    items: itemsToSubmit,
    paymentStatus: status,
    paymentDetails: paymentDetails,
    ...(mergeIntoOrderId ? { mergeIntoOrderId } : {})
  };
  
  try {
     const response = await window.authUtils.authenticatedFetch('/organizations/orders', {
       method: 'POST',
       body: JSON.stringify(payload)
     });
     
     if (response && response.ok) {
       const order = await response.json();
       orderPayDebug('submitSalesOrder response OK', {
         orderId: order.id,
         orderStatus: order.status,
         totalAmount: order.totalAmount,
         amountPaid: order.amountPaid
       });
       if (window.showToast) window.showToast(status === 'paid' ? 'Payment successful!' : 'Order saved!', 'success');
       else alert(status === 'paid' ? 'Payment successful!' : 'Order saved!');

       if (paymentDetails && String(paymentDetails.method).toLowerCase() === 'lesson_quota') {
         try {
           const sr = await window.authUtils.authenticatedFetch('/students');
           if (sr && sr.ok) {
             const data = await sr.json();
             const list = Array.isArray(data) ? data : (data.students || []);
             window.students = list;
             if (salesState.selectedStudent) {
               const sid = salesState.selectedStudent.id;
               const updated = list.find((s) => String(s.id) === String(sid));
               if (updated) salesState.selectedStudent = updated;
             }
           }
         } catch (err) {
           console.error('Failed to refresh students after quota payment', err);
         }
         if (salesState.selectedStudent && typeof window.selectSalesStudent === 'function') {
           await window.selectSalesStudent(salesState.selectedStudent.id);
         }
       }
       
       // Update Cart
       if (itemsOverride) {
           salesState.cart = salesState.cart.filter(c => !itemsOverride.includes(c));
       } else {
           salesState.cart = [];
       }
       
       renderSalesCart();
       
       // Refresh Data
       if (typeof window.loadTimetableData === 'function') {
         await window.loadTimetableData();
       }
       
       // Refresh UI (History & Calendar)
       if (salesState.selectedStudent) {
           if (typeof loadStudentOrders === 'function') {
             await loadStudentOrders(salesState.selectedStudent.id);
           }
           if (typeof renderStudentEnrollments === 'function') renderStudentEnrollments();
           if (typeof updateDaySchedule === 'function') updateDaySchedule();
           if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
       }
       
       if (paymentDetails) {
           return order; // Return order object for receipt generation
       }
       return order; // Always return order for further processing
     } else {
       let errorMsg = 'Failed to save order';
       if (!response) {
         errorMsg = 'Not signed in or session expired (401). Please log in again.';
         quotaPayClientLog('submitSalesOrder: fetch returned null (typical 401)', {
           paymentMethod: paymentDetails && paymentDetails.method
         });
       } else {
         try {
           const err = await response.json();
           errorMsg = err.error || errorMsg;
         } catch (e) {
           /* ignore */
         }
         quotaPayClientLog('submitSalesOrder: HTTP error', {
           status: response.status,
           errorMsg,
           paymentMethod: paymentDetails && paymentDetails.method
         });
       }

       if (window.showToast) window.showToast(errorMsg, 'error');
       else alert(errorMsg);
     }
  } catch (e) {
    console.error('Order Error:', e);
    if (window.showToast) window.showToast('Error processing order', 'error');
    else alert('Error processing order');
  } finally {
    if (activeBtn) {
       activeBtn.disabled = false;
     }
    // Pay / Save label must reflect cart (success path cleared cart; finally used to reset "Processing…")
    renderSalesCart();
  }
}

function orderProductKeys(order) {
  return new Set(
    (order.items || []).map((it) => `${it.productType}:${String(it.productData?.id ?? '')}`)
  );
}

/**
 * Merge cart into one existing order (same order id, enrollments use same orderId):
 * 1) If exactly one unpaid order and its lines cover all cart products → that order.
 * 2) Else if exactly one paid order covers all cart products → extend paid order (amountPaid kept; balance becomes due until paid).
 */
function resolveSalesMergeIntoOrderId(itemsToSubmit) {
  if (!itemsToSubmit || itemsToSubmit.length === 0) return undefined;
  const cartKeys = [
    ...new Set(itemsToSubmit.map((ci) => `${ci.productType}:${String(ci.productData?.id ?? '')}`))
  ];

  const unpaid = salesState.currentUnpaidOrders || [];
  const unpaidMatches = unpaid.filter((o) => {
    const keys = orderProductKeys(o);
    return keys.size > 0 && cartKeys.every((k) => keys.has(k));
  });
  if (unpaidMatches.length === 1) {
    orderPayDebug('resolveSalesMergeIntoOrderId → unpaid', {
      orderId: unpaidMatches[0].id,
      unpaidCount: unpaid.length
    });
    return unpaidMatches[0].id;
  }
  if (unpaidMatches.length > 1) {
    orderPayDebug('resolveSalesMergeIntoOrderId: multiple unpaid match cart keys, skip merge', {
      matchIds: unpaidMatches.map((o) => o.id)
    });
  }

  const paid = salesState.currentPaidOrdersForStudent || [];
  const candidates = paid.filter((o) => {
    if (o.status === 'cancelled' || o.status === 'refunded') return false;
    const keys = orderProductKeys(o);
    if (keys.size === 0) return false;
    return cartKeys.every((k) => keys.has(k));
  });
  if (candidates.length === 1) return candidates[0].id;
  return undefined;
}

function renderSalesCart() {
  const container = document.getElementById('salesCartContent');
  const emptyState = document.querySelector('.cart-empty-state');
  
  // Always update Pay Button first based on cart total
  let total = 0;
  salesState.cart.forEach(item => total += item.price);
  
  const payBtn = document.querySelector('.sales-footer-actions .btn-primary');
  if (payBtn) {
      payBtn.removeAttribute('data-pay-mode');
      const canQuota =
        total > 0 &&
        salesState.selectedStudent &&
        typeof window.salesCartCanFullyPayWithLessonQuota === 'function' &&
        window.salesCartCanFullyPayWithLessonQuota(salesState.selectedStudent, salesState.cart);
      if (canQuota) {
          payBtn.textContent = 'Pay quota';
          payBtn.setAttribute('data-pay-mode', 'quota');
      } else {
          payBtn.textContent = `Pay $${total.toFixed(0)}`;
      }
      
      if (total === 0 && salesState.currentUnpaidOrders && salesState.currentUnpaidOrders.length > 0) {
          const unpaidTotal = salesState.currentUnpaidOrders.reduce((sum, o) => sum + salesOrderBalanceDue(o), 0);
          payBtn.textContent = `Pay Unpaid ($${unpaidTotal.toFixed(0)})`;
          payBtn.removeAttribute('data-pay-mode');
      } else if (total === 0) {
          payBtn.textContent = `Pay $0`;
          payBtn.removeAttribute('data-pay-mode');
      }
  }

  if (salesState.cart.length === 0) {
    container.style.display = 'none';
    if (emptyState) {
      emptyState.style.display = 'none';
      emptyState.innerHTML = '';
    }
    return;
  }
  
  container.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';
  
  const html = salesState.cart.map((item, index) => {
    // total is already calculated above, do not add again
    const dateCount = item.enrolledClasses.length;
    
    const getFormattedDate = (d) => {
        if (!d) return '';
        const dateObj = new Date(d);
        return !isNaN(dateObj) ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    };

    const firstDate = getFormattedDate(item.enrolledClasses[0]?.date);
    const lastDate = getFormattedDate(item.enrolledClasses[dateCount-1]?.date);
    const dateRange = dateCount > 1 ? `${firstDate} - ${lastDate}` : firstDate;
    
    return `
      <div class="cart-item">
        <div class="cart-item-body" role="button" tabindex="0" onclick="openSalesCartLessonDatesModal(${index})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openSalesCartLessonDatesModal(${index});}">
          <div class="cart-item-header">
            <span class="cart-item-title">${escapeHtml(item.productData.name)}</span>
            <span class="cart-item-price">$${item.price.toFixed(0)}</span>
          </div>
          <div class="cart-item-details">
            ${dateCount} lesson${dateCount > 1 ? 's' : ''} • ${dateRange}
            <span class="cart-item-hint"> · Click for dates</span>
          </div>
        </div>
        <button type="button" class="btn-remove-item" onclick="event.stopPropagation(); removeSalesCartItem(${index})">Remove</button>
      </div>
    `;
  }).join('');
  
  const totalHtml = `
    <div class="cart-total">
      <span>Total</span>
      <span>$${total.toFixed(0)}</span>
    </div>
  `;
  
  container.innerHTML = html + totalHtml;
}

window.removeSalesCartItem = function(index) {
  if (index < 0 || index >= salesState.cart.length) return;
  if (document.getElementById('salesCartDatesModal')) window.closeSalesCartDatesModal();
  salesState.cart.splice(index, 1);
  renderSalesCart();
  if (typeof updateDaySchedule === 'function') updateDaySchedule();
  if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
};

window.closeSalesCartDatesModal = function() {
  const m = document.getElementById('salesCartDatesModal');
  if (!m) return;
  m.classList.remove('show');
  setTimeout(() => m.remove(), 250);
};

window.openSalesCartLessonDatesModal = function(index) {
  const item = salesState.cart[index];
  if (!item || !item.enrolledClasses || !item.enrolledClasses.length) return;
  const existing = document.getElementById('salesCartDatesModal');
  if (existing) existing.remove();

  const sorted = [...item.enrolledClasses].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const rows = sorted.map(cls => {
    const entry = cls.entry || {};
    const d = cls.date;
    let dateLabel = '';
    if (d) {
      const dateObj = new Date(d);
      dateLabel = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
        : String(d);
    }
    const time =
      entry.startTime && entry.endTime ? `${escapeHtml(String(entry.startTime))} – ${escapeHtml(String(entry.endTime))}` : '—';
    const title = entry.className ? escapeHtml(entry.className) : 'Class';
    return `<tr><td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${escapeHtml(dateLabel)}</td><td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${time}</td><td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${title}</td></tr>`;
  }).join('');

  const modal = document.createElement('div');
  modal.id = 'salesCartDatesModal';
  modal.className = 'edit-student-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="edit-student-modal-content" style="max-width:560px;" onclick="event.stopPropagation()">
      <div class="edit-student-modal-header">
        <h2 style="font-size:1.1rem;">Enrolled lesson dates (cart)</h2>
        <button type="button" class="org-modal-close-x" onclick="closeSalesCartDatesModal()" aria-label="Close">&times;</button>
      </div>
      <div class="edit-student-modal-body" style="padding-top:12px;">
        <p style="margin-bottom:12px;color:#64748b;font-size:0.875rem;">${escapeHtml(item.productData.name)} · ${sorted.length} lesson(s)</p>
        <div style="max-height:min(55vh,420px);overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
          <thead><tr style="background:#f8fafc;"><th style="text-align:left;padding:8px 10px;">Date</th><th style="text-align:left;padding:8px 10px;">Time</th><th style="text-align:left;padding:8px 10px;">Class</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
        <div class="edit-student-modal-actions" style="border-top:none;padding-top:16px;">
          <button type="button" class="btn btn-secondary" onclick="closeSalesCartDatesModal()">Close</button>
        </div>
      </div>
    </div>`;
  modal.onclick = () => window.closeSalesCartDatesModal();
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('show'), 10);
};

// Click outside to close dropdown
document.addEventListener('click', function(event) {
  const searchWrapper = document.querySelector('.student-search-wrapper');
  const dropdown = document.getElementById('salesStudentDropdown');
  if (searchWrapper && !searchWrapper.contains(event.target) && dropdown && !dropdown.contains(event.target)) {
    dropdown.style.display = 'none';
  }
});

// Helper Functions

// Checkout Logic
let checkoutState = {
    selectedIndices: new Set(),
    method: 'cash',
    useBalance: false,
    balanceAmount: 0
};

window.openCheckoutModal = function(mode = 'new', opts) {
    opts = opts || {};
    if (mode === 'new' && salesState.cart.length === 0) {
        alert('Cart is empty');
        return;
    }
    
    const modal = document.getElementById('checkoutModal');
    if (!modal) return;
    
    // Reset State
    checkoutState.mode = mode;
    if (mode !== 'existing') {
      checkoutState.orderId = null;
      checkoutState.existingOrder = null;
    }
    checkoutState.useBalance = false;
    checkoutState.balanceAmount = 0;
    
    const selectAll = document.getElementById('checkoutSelectAll');
    if (selectAll) {
        selectAll.checked = true;
        selectAll.disabled = false;
    }

    if (mode === 'new') {
        checkoutState.selectedIndices = new Set(salesState.cart.map((_, i) => i));
    } else if (mode === 'unpaid_orders') {
        // Select all unpaid orders by default. Indices correspond to salesState.currentUnpaidOrders array
        const unpaidOrders = salesState.currentUnpaidOrders || [];
        checkoutState.selectedIndices = new Set(unpaidOrders.map((_, i) => i));
    }
    
    // UI: Check Balance
    const balanceSection = document.getElementById('balancePaymentSection');
    const balanceDisplay = document.getElementById('availableBalanceDisplay');
    const useBalanceCheckbox = document.getElementById('useBalanceCheckbox');
    const student = salesState.selectedStudent;
    
    if (balanceSection) {
        if (student && (student.balance || 0) > 0) {
            balanceSection.style.display = 'block';
            if (balanceDisplay) balanceDisplay.textContent = `$${formatNumber(student.balance)}`;
            if (useBalanceCheckbox) useBalanceCheckbox.checked = false;
            const info = document.getElementById('balanceDeductionInfo');
            if (info) info.style.display = 'none';
        } else {
            balanceSection.style.display = 'none';
        }
    }
    
    renderCheckoutItems();
    const unpaidList = salesState.currentUnpaidOrders || [];
    const preferQuotaUnpaid =
      mode === 'unpaid_orders' &&
      unpaidList.length > 0 &&
      student &&
      typeof window.salesOrderCanPayRemainingWithLessonQuota === 'function' &&
      unpaidList.every((o) => window.salesOrderCanPayRemainingWithLessonQuota(student, o));
    const preferQuota =
      (!!opts.preferQuotaTab &&
        mode === 'new' &&
        salesState.cart.length > 0 &&
        typeof window.salesCartCanFullyPayWithLessonQuota === 'function' &&
        window.salesCartCanFullyPayWithLessonQuota(salesState.selectedStudent, salesState.cart)) ||
      preferQuotaUnpaid;
    if (preferQuotaUnpaid) {
      quotaPayClientLog('openCheckoutModal: defaulting to Quota tab (all unpaid orders match quota tiers)', {
        unpaidCount: unpaidList.length
      });
    }
    switchPaymentMethod(preferQuota ? 'quota' : 'cash');
    
    modal.classList.add('show');
};

window.closeCheckoutModal = function() {
    document.getElementById('checkoutModal').classList.remove('show');
};

window.toggleUseBalance = function() {
    const checkbox = document.getElementById('useBalanceCheckbox');
    checkoutState.useBalance = checkbox ? checkbox.checked : false;
    updateCheckoutTotal();
};

function renderCheckoutItems() {
    const container = document.getElementById('checkoutItemsList');
    let itemsSource = [];
    
    if (checkoutState.mode === 'unpaid_orders') {
        itemsSource = salesState.currentUnpaidOrders || [];
    } else {
        itemsSource = salesState.cart;
    }

    container.innerHTML = itemsSource.map((item, index) => {
        const isChecked = checkoutState.selectedIndices.has(index);
        
        let name = '';
        let price = 0;
        let detailsHtml = '';
        
        if (checkoutState.mode === 'unpaid_orders') {
            // item is an Order — show balance due (extended paid orders may have partial payment)
            name = item.items.map(i => i.productData.name).join(', ');
            const due = salesOrderBalanceDue(item);
            const paid = salesOrderEffectivePaid(item);
            price = due;
            
            const dateStr = new Date(item.date).toLocaleDateString();
            let payLine = '';
            if (paid > 0 && Number(item.totalAmount) > due + 0.005) {
              payLine = ` · Invoiced $${formatNumber(item.totalAmount)} · Paid $${formatNumber(paid)}`;
            }
            detailsHtml = `<div style="font-size:0.85rem; color:#666; margin-left:20px;">Order Date: ${dateStr}${payLine}</div>`;
             if (item.items && item.items.length > 0) {
                item.items.forEach(orderItem => {
                    if (orderItem.enrolledClasses && orderItem.enrolledClasses.length > 0) {
                        detailsHtml += orderItem.enrolledClasses.map(cls => {
                            const d = new Date(cls.date);
                            const dateStr = !isNaN(d) ? d.toLocaleDateString() : 'Invalid Date';
                            const entry = cls.entry || {};
                            return `<div style="font-size:0.8rem; color:#888; margin-left:20px;">- ${entry.startTime || ''}-${entry.endTime || ''} | ${entry.className || ''} > ${dateStr}</div>`;
                        }).join('');
                    }
                });
            }
        } else {
            // item is Cart Item
            name = item.productData.name;
            price = item.price;
            
            if (item.enrolledClasses && item.enrolledClasses.length > 0) {
                detailsHtml = item.enrolledClasses.map(cls => {
                    const d = new Date(cls.date);
                    const dateStr = !isNaN(d) ? d.toLocaleDateString() : 'Invalid Date';
                    return `<div style="font-size:0.85rem; color:#666; margin-left:20px;">${cls.entry.startTime}-${cls.entry.endTime} | ${cls.entry.dayOfWeek} | ${cls.entry.className} > ${dateStr}</div>`;
                }).join('');
            }
        }
        
        return `
            <div class="checkout-item" style="margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label style="display:flex; align-items:center; gap:10px; font-weight:bold;">
                        <input type="checkbox" onchange="toggleCheckoutItem(${index})" ${isChecked ? 'checked' : ''}>
                        ${escapeHtml(name)}
                    </label>
                    <span style="font-weight:bold;">$${formatNumber(price)}</span>
                </div>
                <div style="margin-top:5px;">${detailsHtml}</div>
            </div>
        `;
    }).join('');
    
    updateCheckoutTotal();
}

window.toggleCheckoutSelectAll = function() {
    const checked = document.getElementById('checkoutSelectAll').checked;
    let itemsCount = 0;
    
    if (checkoutState.mode === 'unpaid_orders') {
        itemsCount = (salesState.currentUnpaidOrders || []).length;
    } else {
        itemsCount = salesState.cart.length;
    }

    if (checked) {
        checkoutState.selectedIndices = new Set(Array.from({length: itemsCount}, (_, i) => i));
    } else {
        checkoutState.selectedIndices.clear();
    }
    renderCheckoutItems();
};

window.toggleCheckoutItem = function(index) {
    if (checkoutState.selectedIndices.has(index)) {
        checkoutState.selectedIndices.delete(index);
    } else {
        checkoutState.selectedIndices.add(index);
    }
    
    let itemsCount = 0;
    if (checkoutState.mode === 'unpaid_orders') {
        itemsCount = (salesState.currentUnpaidOrders || []).length;
    } else {
        itemsCount = salesState.cart.length;
    }
    
    const allSelected = itemsCount > 0 && checkoutState.selectedIndices.size === itemsCount;
    document.getElementById('checkoutSelectAll').checked = allSelected;
    
    updateCheckoutTotal();
};

function updateCheckoutTotal() {
    let total = 0;
    let itemsSource = [];
    
    if (checkoutState.mode === 'existing' && checkoutState.existingOrder) {
        total = salesOrderBalanceDue(checkoutState.existingOrder);
    } else if (checkoutState.mode === 'unpaid_orders') {
        itemsSource = salesState.currentUnpaidOrders || [];
        checkoutState.selectedIndices.forEach(index => {
            if (itemsSource[index]) {
                total += salesOrderBalanceDue(itemsSource[index]);
            }
        });
    } else {
        itemsSource = salesState.cart;
        checkoutState.selectedIndices.forEach(index => {
            if (itemsSource[index]) {
                total += itemsSource[index].price;
            }
        });
    }

    if (checkoutState.method === 'quota') {
        const qEq = document.getElementById('quotaCheckoutEquivalent');
        if (qEq) qEq.textContent = `$${formatNumber(total)}`;
        checkoutState.balanceAmount = 0;
        const deductionInfo = document.getElementById('balanceDeductionInfo');
        if (deductionInfo) deductionInfo.style.display = 'none';
        const payDisplay = document.getElementById('checkoutShouldPay');
        const payLabel = document.getElementById('checkoutShouldPayLabel');
        const quotaFoot = document.getElementById('checkoutQuotaFootnote');
        if (payLabel) payLabel.textContent = 'Lesson quota (equiv.)';
        if (payDisplay) payDisplay.textContent = `$${formatNumber(total)}`;
        if (quotaFoot) quotaFoot.style.display = 'block';
        updatePayButton();
        return;
    }

    const payLabelReset = document.getElementById('checkoutShouldPayLabel');
    if (payLabelReset) payLabelReset.textContent = 'Should Pay';
    const quotaFootHide = document.getElementById('checkoutQuotaFootnote');
    if (quotaFootHide) quotaFootHide.style.display = 'none';

    // Balance Calculation
    const student = salesState.selectedStudent;
    const studentBalance = student ? (student.balance || 0) : 0;
    
    let balanceDeduction = 0;
    if (checkoutState.useBalance) {
        balanceDeduction = Math.min(total, studentBalance);
    }
    checkoutState.balanceAmount = balanceDeduction;
    
    const remainingPay = Math.max(0, total - balanceDeduction);
    
    // Update UI for Balance
    const deductionDisplay = document.getElementById('balanceDeductionAmount');
    const deductionInfo = document.getElementById('balanceDeductionInfo');
    if (deductionDisplay && deductionInfo) {
        if (balanceDeduction > 0) {
            deductionDisplay.textContent = `$${formatNumber(balanceDeduction)}`;
            deductionInfo.style.display = 'block';
        } else {
            deductionInfo.style.display = 'none';
        }
    }
    
    // Update Should Pay display
    const payDisplay = document.getElementById('checkoutShouldPay');
    if (payDisplay) {
        payDisplay.textContent = `$${formatNumber(remainingPay)}`;
    }
    
    const input = document.querySelector(`#paymentForm${checkoutState.method.charAt(0).toUpperCase() + checkoutState.method.slice(1)} .payment-amount-input`);
    if (input) {
        input.value = remainingPay;
    }
    updatePayButton();
}

window.switchPaymentMethod = function(method) {
    checkoutState.method = method;
    
    // Update Tabs
    ['Cash', 'FPS', 'Other', 'Quota'].forEach(m => {
        const key = m.toLowerCase();
        const btn = document.getElementById(`payMethod${m}`);
        const form = document.getElementById(`paymentForm${m}`);
        
        if (key === method) {
            btn.className = 'btn btn-primary';
            form.style.display = 'block';
        } else {
            btn.className = 'btn btn-secondary';
            form.style.display = 'none';
        }
    });
    
    // Sync Amount
    updateCheckoutTotal();
};

window.updatePayButton = function() {
    const method = checkoutState.method;
    const btn = document.getElementById('checkoutPayBtn');
    if (!btn) return;
    if (method === 'quota') {
        btn.textContent = 'Confirm lesson quota payment';
        return;
    }
    const input = document.querySelector(`#paymentForm${method.charAt(0).toUpperCase() + method.slice(1)} .payment-amount-input`);
    const amount = input ? parseFloat(input.value) || 0 : 0;
    btn.textContent = `Pay $${formatNumber(amount)}`;
};

window.confirmCheckout = async function() {
    const method = checkoutState.method;

    if (method === 'quota') {
        if (checkoutState.mode === 'existing' && checkoutState.orderId && checkoutState.existingOrder) {
            await refreshSelectedSalesStudentFromApi();
            const student = salesState.selectedStudent;
            if (!student) {
                alert('No student selected');
                return;
            }
            const ord = checkoutState.existingOrder;
            const due = salesOrderBalanceDue(ord);
            const can =
                typeof window.salesOrderCanPayRemainingWithLessonQuota === 'function' &&
                window.salesOrderCanPayRemainingWithLessonQuota(student, ord);
            orderPayDebug('confirmCheckout quota existing', {
                orderId: checkoutState.orderId,
                due,
                can,
                synthPreview:
                    typeof window.salesBuildQuotaItemsForOrderBalance === 'function'
                        ? window.salesBuildQuotaItemsForOrderBalance(ord, due).map((it) => ({
                              price: it.price,
                              lessons: (it.enrolledClasses || []).length
                          }))
                        : []
            });
            if (!can) {
                quotaPayClientLog('existing quota: precheck failed after refresh', {
                    lessonQuotaByCents: student.lessonQuotaByCents,
                    due
                });
                alert(
                    'Not enough lesson quota for this remaining balance (refreshed from server). If a previous attempt used credits without marking the order paid, check [QuotaPay] logs or pay with cash.'
                );
                return;
            }
            if (!confirm('Apply lesson quota credits to settle the remaining balance on this order?')) return;
            const paymentDetails = {
                method: 'lesson_quota',
                amount: 0,
                balanceUsed: 0,
                remark: 'Paid remaining balance with lesson quota'
            };
            try {
                quotaPayClientLog('PATCH lesson_quota (existing order)', {
                    orderId: checkoutState.orderId,
                    due,
                    paymentDetails
                });
                const response = await window.authUtils.authenticatedFetch(
                    `/organizations/orders/${checkoutState.orderId}/status`,
                    {
                        method: 'PATCH',
                        body: JSON.stringify({ status: 'paid', paymentDetails })
                    }
                );
                if (!response) {
                    quotaPayClientLog('PATCH lesson_quota: response null (401?)');
                    alert('Not signed in or session expired. Please log in again.');
                    return;
                }
                if (response.ok) {
                    const updatedOrder = await response.json();
                    orderPayDebug('PATCH lesson_quota existing OK', {
                        orderId: updatedOrder.id,
                        amountPaid: updatedOrder.amountPaid,
                        status: updatedOrder.status
                    });
                    if (window.showToast) window.showToast('Payment successful!', 'success');
                    else alert('Payment successful!');
                    closeCheckoutModal();
                    if (typeof printReceipt === 'function') printReceipt(updatedOrder);
                    try {
                        const sr = await window.authUtils.authenticatedFetch('/students');
                        if (sr && sr.ok) {
                            const data = await sr.json();
                            const list = Array.isArray(data) ? data : data.students || [];
                            window.students = list;
                            if (salesState.selectedStudent) {
                                const sid = salesState.selectedStudent.id;
                                const updated = list.find((s) => String(s.id) === String(sid));
                                if (updated) salesState.selectedStudent = updated;
                            }
                        }
                    } catch (err) {
                        console.error('Failed to refresh students after quota PATCH', err);
                    }
                    if (salesState.selectedStudent && typeof window.selectSalesStudent === 'function') {
                        await window.selectSalesStudent(salesState.selectedStudent.id);
                    }
                    if (salesState.selectedStudent && typeof loadStudentOrders === 'function') {
                        await loadStudentOrders(salesState.selectedStudent.id);
                    }
                    if (typeof renderStudentEnrollments === 'function') renderStudentEnrollments();
                    if (typeof updateDaySchedule === 'function') updateDaySchedule();
                    if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
                } else {
                    let msg = 'Failed to update order';
                    try {
                        const err = await response.json();
                        msg = err.error || msg;
                    } catch (e) {
                        /* ignore */
                    }
                    orderPayDebug('PATCH lesson_quota existing failed', { status: response.status, msg });
                    quotaPayClientLog('PATCH lesson_quota failed', { httpStatus: response.status, msg });
                    alert(msg);
                }
            } catch (e) {
                console.error(e);
                alert('Error processing quota payment');
            }
            return;
        }
        if (checkoutState.mode === 'unpaid_orders') {
            await refreshSelectedSalesStudentFromApi();
            const selectedIndices = Array.from(checkoutState.selectedIndices);
            if (selectedIndices.length === 0) {
                alert('No orders selected');
                return;
            }
            const unpaidOrders = salesState.currentUnpaidOrders || [];
            const ordersToPay = selectedIndices.map((i) => unpaidOrders[i]).filter(Boolean);
            if (ordersToPay.length === 0) return;
            const student = salesState.selectedStudent;
            if (!student) {
                alert('No student selected');
                return;
            }
            for (const ord of ordersToPay) {
                const can =
                    typeof window.salesOrderCanPayRemainingWithLessonQuota === 'function' &&
                    window.salesOrderCanPayRemainingWithLessonQuota(student, ord);
                quotaPayClientLog('unpaid_orders quota precheck', {
                    orderId: ord.id,
                    due: salesOrderBalanceDue(ord),
                    canPayWithQuota: can
                });
                if (!can) {
                    quotaPayClientLog('unpaid_orders quota: precheck failed after refresh', {
                        orderId: ord.id,
                        due: salesOrderBalanceDue(ord),
                        lessonQuotaByCents: student.lessonQuotaByCents
                    });
                    alert(
                        'Not enough lesson quota for at least one selected order. If you already confirmed quota once, credits may have been deducted while the order stayed unpaid — check [QuotaPay] logs or run await debugDumpOrgOrders(). You can pay the remainder with cash/FPS or restore quota via admin.'
                    );
                    return;
                }
            }
            if (!confirm(`Apply lesson quota to settle ${ordersToPay.length} unpaid order(s)?`)) return;
            const payBtn = document.getElementById('checkoutPayBtn');
            if (payBtn) {
                payBtn.textContent = 'Processing...';
                payBtn.disabled = true;
            }
            let okCount = 0;
            const errors = [];
            try {
                for (const ord of ordersToPay) {
                    const due = salesOrderBalanceDue(ord);
                    const paymentDetails = {
                        method: 'lesson_quota',
                        amount: 0,
                        balanceUsed: 0,
                        remark: 'Paid with lesson quota (Pay Unpaid checkout)'
                    };
                    quotaPayClientLog('PATCH lesson_quota unpaid_orders batch', {
                        orderId: ord.id,
                        due
                    });
                    const response = await window.authUtils.authenticatedFetch(
                        `/organizations/orders/${ord.id}/status`,
                        {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'paid', paymentDetails })
                        }
                    );
                    if (!response) {
                        errors.push({ id: ord.id, msg: 'no response (401?)' });
                        break;
                    }
                    if (response.ok) {
                        okCount += 1;
                    } else {
                        let msg = 'failed';
                        try {
                            const e = await response.json();
                            msg = e.error || msg;
                        } catch (_) {
                            /* ignore */
                        }
                        errors.push({ id: ord.id, httpStatus: response.status, msg });
                    }
                }
            } catch (e) {
                quotaPayClientLog('unpaid_orders quota exception', { error: String(e) });
                alert('Error processing quota payment');
            } finally {
                if (payBtn) {
                    payBtn.disabled = false;
                    payBtn.textContent = 'Confirm lesson quota payment';
                }
            }
            if (errors.length) {
                quotaPayClientLog('unpaid_orders quota finished with errors', { okCount, errors });
                alert(
                    `Completed ${okCount} of ${ordersToPay.length} order(s). ${errors.map((e) => `${e.id}: ${e.msg || e.httpStatus}`).join('; ')}`
                );
            } else if (okCount > 0) {
                if (window.showToast) window.showToast(`Paid ${okCount} order(s) with lesson quota`, 'success');
                else alert(`Paid ${okCount} order(s) with lesson quota`);
                closeCheckoutModal();
            }
            try {
                const sr = await window.authUtils.authenticatedFetch('/students');
                if (sr && sr.ok) {
                    const data = await sr.json();
                    const list = Array.isArray(data) ? data : data.students || [];
                    window.students = list;
                    if (salesState.selectedStudent) {
                        const sid = salesState.selectedStudent.id;
                        const updated = list.find((s) => String(s.id) === String(sid));
                        if (updated) salesState.selectedStudent = updated;
                    }
                }
            } catch (err) {
                console.error('Failed to refresh students after unpaid_orders quota', err);
            }
            if (salesState.selectedStudent && typeof window.selectSalesStudent === 'function') {
                await window.selectSalesStudent(salesState.selectedStudent.id);
            }
            if (salesState.selectedStudent && typeof loadStudentOrders === 'function') {
                await loadStudentOrders(salesState.selectedStudent.id);
            }
            if (typeof renderStudentEnrollments === 'function') renderStudentEnrollments();
            if (typeof updateDaySchedule === 'function') updateDaySchedule();
            if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
            return;
        }
        if (checkoutState.mode !== 'new') {
            alert(
                'Lesson quota is available for the cart, Pay Unpaid (when quota covers all selected orders), or the small Pay button on one order.'
            );
            return;
        }
        await refreshSelectedSalesStudentFromApi();
        const student = salesState.selectedStudent;
        if (!student) {
            alert('No student selected');
            return;
        }
        const selectedItems = salesState.cart.filter((_, i) => checkoutState.selectedIndices.has(i));
        if (selectedItems.length === 0) {
            alert('No items selected');
            return;
        }
        if (
            typeof window.salesCartCanFullyPayWithLessonQuota !== 'function' ||
            !window.salesCartCanFullyPayWithLessonQuota(student, selectedItems)
        ) {
            quotaPayClientLog('cart quota: precheck failed after API refresh', {
                lessonQuotaByCents: student.lessonQuotaByCents,
                lines: selectedItems.map((it) => ({
                    price: it.price,
                    n: (it.enrolledClasses || []).length
                }))
            });
            alert(
                'Not enough lesson quota at the required per-lesson price tiers for this cart. If you already tried paying, credits may have been used — check the student card quota line or server logs [QuotaPay].'
            );
            return;
        }
        if (!confirm('Apply lesson quota credits for this order?')) return;

        const paymentDetails = {
            method: 'lesson_quota',
            amount: 0,
            balanceUsed: 0,
            remark: 'Paid with lesson quota'
        };

        quotaPayClientLog('confirmCheckout: cart lesson_quota → submitSalesOrder', {
            selectedLineCount: selectedItems.length,
            studentId: student.id,
            precheckOk: true
        });
        const order = await submitSalesOrder('paid', selectedItems, paymentDetails);
        if (!order) {
            quotaPayClientLog(
                'confirmCheckout: submitSalesOrder returned no order — see Network tab + terminal [QuotaPay]'
            );
        }
        if (order) {
            closeCheckoutModal();
            if (typeof printReceipt === 'function') printReceipt(order);
            if (typeof window.refreshSalesTimetableFromApi === 'function') {
                await window.refreshSalesTimetableFromApi();
            }
            if (salesState.selectedStudent && typeof loadStudentOrders === 'function') {
                await loadStudentOrders(salesState.selectedStudent.id);
            }
            if (typeof renderStudentEnrollments === 'function') renderStudentEnrollments();
            if (typeof updateDaySchedule === 'function') updateDaySchedule();
            if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
        }
        return;
    }

    const suffix = method.charAt(0).toUpperCase() + method.slice(1);
    const amountInput = document.getElementById(`pay${suffix}Amount`);
    const cashAmount = amountInput ? parseFloat(amountInput.value) || 0 : 0;
    
    // Recalculate Total
    let totalOrderAmount = 0;
    let itemsSource = [];
    if (checkoutState.mode === 'unpaid_orders') {
        const unpaidOrders = salesState.currentUnpaidOrders || [];
        checkoutState.selectedIndices.forEach(i => {
            if (unpaidOrders[i]) totalOrderAmount += salesOrderBalanceDue(unpaidOrders[i]);
        });
    } else if (checkoutState.mode === 'existing') {
        totalOrderAmount = checkoutState.existingOrder ? salesOrderBalanceDue(checkoutState.existingOrder) : 0;
    } else {
        salesState.cart.forEach((item, i) => {
            if (checkoutState.selectedIndices.has(i)) totalOrderAmount += item.price;
        });
    }

    // Balance Deduction Logic
    const student = salesState.selectedStudent;
    const studentBalance = student ? (student.balance || 0) : 0;
    let balanceDeduction = 0;
    if (checkoutState.useBalance) {
        balanceDeduction = Math.min(totalOrderAmount, studentBalance);
    }

    // 1. Deduct Balance (API)
    if (balanceDeduction > 0) {
        if (!confirm(`Confirm deduct $${formatNumber(balanceDeduction)} from balance?`)) return;
        
        try {
            console.debug('[checkout] balance deduction payload', {
                studentId: student?.id,
                amount: balanceDeduction,
                totalOrderAmount,
                studentBalance,
                mode: checkoutState.mode
            });
            const response = await window.authUtils.authenticatedFetch(`/organizations/students/${student.id}/balance`, {
                method: 'POST',
                body: JSON.stringify({
                    type: 'debit',
                    amount: balanceDeduction,
                    remark: `Payment for Order (Checkout)` 
                })
            });
            if (!response.ok) {
                console.error('[checkout] balance deduction failed', response.status, response.statusText);
                alert('Failed to deduct balance. Payment aborted.');
                return;
            }
            // Update local balance
            const resData = await response.json();
            if (resData.balance !== undefined) student.balance = resData.balance;
        } catch (e) {
            console.error(e);
            alert('Error deducting balance');
            return;
        }
    }

    const remarkInput = document.getElementById(`pay${suffix}Remark`)?.value || '';
    let finalRemark = remarkInput;
    if (balanceDeduction > 0) {
        finalRemark += ` (Paid $${balanceDeduction} via Balance)`;
    }

    const paymentDetails = {
        method: method,
        amount: cashAmount,
        balanceUsed: balanceDeduction, // New Field
        remark: finalRemark,
        reference: document.getElementById(`pay${suffix}Ref`)?.value || '',
        bank: document.getElementById(`pay${suffix}Bank`)?.value || ''
    };
    
    // Determine General Status (for Single/New orders)
    const isPaidGeneral = (cashAmount + balanceDeduction) > 0 || totalOrderAmount === 0;
    const statusGeneral = isPaidGeneral ? 'paid' : 'unpaid';

    // Handle Existing Order Payment (Single)
    if (checkoutState.mode === 'existing' && checkoutState.orderId) {
        try {
            const updatePayload = {
                status: statusGeneral,
                paymentDetails: paymentDetails
            };
            
            const response = await window.authUtils.authenticatedFetch(`/organizations/orders/${checkoutState.orderId}/status`, {
                method: 'PATCH',
                body: JSON.stringify(updatePayload)
            });
            
            if (response.ok) {
                const updatedOrder = await response.json();
                if (window.showToast) window.showToast('Payment successful!', 'success');
                else alert('Payment successful!');
                
                closeCheckoutModal();
                if (typeof printReceipt === 'function') printReceipt(updatedOrder);
                
                if (salesState.selectedStudent) {
                    loadStudentOrders(salesState.selectedStudent.id);
                }
            } else {
                alert('Failed to update order');
            }
        } catch (e) {
            console.error(e);
            alert('Error processing payment');
        }
        return;
    }

    // Handle Unpaid Orders (Multiple)
    if (checkoutState.mode === 'unpaid_orders') {
        const selectedIndices = Array.from(checkoutState.selectedIndices);
        if (selectedIndices.length === 0) {
            alert('No orders selected');
            return;
        }

        const unpaidOrders = salesState.currentUnpaidOrders || [];
        const ordersToPay = selectedIndices.map(i => unpaidOrders[i]).filter(Boolean);
        
        if (ordersToPay.length === 0) return;
        
        const payBtn = document.getElementById('checkoutPayBtn');
        const originalText = payBtn ? payBtn.textContent : 'Pay';
        if (payBtn) {
            payBtn.textContent = 'Processing...';
            payBtn.disabled = true;
        }

        let successCount = 0;
        let updatedOrders = [];
        
        // Distribution state
        let remainingBal = balanceDeduction;
        let remainingCash = cashAmount;

        try {
            for (const order of ordersToPay) {
                const thisOrderDue = salesOrderBalanceDue(order);
                
                const thisOrderBal = Math.min(thisOrderDue, remainingBal);
                remainingBal -= thisOrderBal;
                
                const needed = thisOrderDue - thisOrderBal;
                const thisOrderCash = Math.min(needed, remainingCash);
                if (remainingCash > thisOrderCash) {
                    remainingCash -= thisOrderCash;
                } else {
                    remainingCash = 0;
                }

                const covered = thisOrderBal + thisOrderCash;
                const thisStatus =
                  thisOrderDue < 0.005 || covered + 0.005 >= thisOrderDue ? 'paid' : 'unpaid';
                
                const orderPaymentDetails = {
                    ...paymentDetails,
                    amount: thisOrderCash,
                    balanceUsed: thisOrderBal,
                    // If balance was used, ensure remark reflects it if not global?
                    // We set global remark already.
                };

                const response = await window.authUtils.authenticatedFetch(`/organizations/orders/${order.id}/status`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        status: thisStatus,
                        paymentDetails: orderPaymentDetails
                    })
                });
                
                if (response.ok) {
                    successCount++;
                    const updatedOrder = await response.json();
                    updatedOrders.push(updatedOrder);
                }
            }

            if (successCount > 0) {
                if (window.showToast) window.showToast(`Processed ${successCount} orders`, 'success');
                else alert(`Processed ${successCount} orders`);
                
                closeCheckoutModal();
                
                if (updatedOrders.length > 0 && typeof printReceipt === 'function') {
                    printReceipt(updatedOrders);
                }

                if (salesState.selectedStudent) {
                    loadStudentOrders(salesState.selectedStudent.id);
                }
            } else {
                alert('Failed to process orders');
            }
        } catch (e) {
            console.error(e);
            alert('Error processing payments');
        } finally {
            if (payBtn) {
                 payBtn.textContent = originalText;
                 payBtn.disabled = false;
            }
        }
        return;
    }
    
    // Handle New Order (Cart)
    const selectedItems = salesState.cart.filter((_, i) => checkoutState.selectedIndices.has(i));
    if (selectedItems.length === 0) {
        alert('No items selected');
        return;
    }
    
    // Call API
    const order = await submitSalesOrder(statusGeneral, selectedItems, paymentDetails);
    
    if (order) {
       closeCheckoutModal();
       if (typeof printReceipt === 'function') printReceipt(order);
       
       if (salesState.cart.length === 0) {
           const selectAll = document.getElementById('checkoutSelectAll');
           if (selectAll) selectAll.checked = false;
       }
       
       if (salesState.selectedStudent) {
           loadStudentOrders(salesState.selectedStudent.id);
       }
    }
};

// Jump to Date from History
window.jumpToDate = function(dateString, courseId) {
    if (!dateString) return;
    
    // Parse simple date string YYYY-MM-DD
    const parts = dateString.split('-');
    if (parts.length !== 3) return;
    const targetDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    
    // Check if we need to switch to Step 2 (Calendar View)
    const calendarExists =
      document.getElementById('miniCalendarGrid0') || document.getElementById('miniCalendarGrid');
    if (!calendarExists) {
        if (courseId) {
            let product = (window.courses || []).find(c => c.id === courseId);
            let type = 'course';
            
            if (product) {
                handleProductSelect(type, product.id);
            } else {
                console.warn('Product not found for jump:', courseId);
                return;
            }
        } else {
            return; 
        }
    }
    
    // Update View Date (Month) if different
    const currentView = salesState.classSelection.viewDate;
    if (targetDate.getMonth() !== currentView.getMonth() || targetDate.getFullYear() !== currentView.getFullYear()) {
        salesState.classSelection.viewDate = new Date(targetDate);
    }
    
    // Select Date
    salesState.classSelection.selectedDate = targetDate;
    
    // Refresh UI (rebuild dots when view month changes — same fix as changeCalendarMonth)
    if (document.getElementById('miniCalendarGrid0') || document.getElementById('miniCalendarGrid')) {
        const cid = salesState.classSelection && salesState.classSelection.courseId;
        if (typeof rebuildSalesAvailableClasses === 'function' && cid && Array.isArray(window.timetableEntries)) {
            rebuildSalesAvailableClasses(cid);
        } else {
            if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
            if (typeof updateDaySchedule === 'function') updateDaySchedule();
        }
    }
};

/** Close Class History overlay then jump (used by overlay month day buttons). */
window.jumpToDateFromClassHistory = function (dateString, courseId) {
    if (typeof closeStudentOverlay === 'function') closeStudentOverlay();
    window.jumpToDate(dateString, courseId || '');
};

(function installSalesEnrollmentDayJumpDelegation() {
    if (typeof document === 'undefined' || window.__salesEnrollmentDayJumpBound) return;
    window.__salesEnrollmentDayJumpBound = true;
    document.addEventListener(
        'click',
        function (ev) {
            const btn = ev.target.closest('.sales-day-jump, .overlay-day-jump');
            if (!btn) return;
            ev.preventDefault();
            ev.stopPropagation();
            const date = btn.getAttribute('data-date');
            if (!date) return;
            const courseId = btn.getAttribute('data-course-id') || '';
            if (btn.getAttribute('data-close-overlay') === '1' && typeof window.closeStudentOverlay === 'function') {
                window.closeStudentOverlay();
            }
            if (typeof window.jumpToDate === 'function') {
                window.jumpToDate(date, courseId);
            }
        },
        true
    );
})();

/**
 * UI smoke: verify month day buttons use data-* (not broken onclick) and delegation is installed.
 * Run: smokeTestEnrollmentDayJump()
 */
window.smokeTestEnrollmentDayJump = function smokeTestEnrollmentDayJump() {
    const sample = buildEnrollmentMonthRowsMarkup(
        [
            { date: '2026-04-09', timetableEntryId: 'te_smoke', studentId: 's1' },
            { date: '2026-05-07', timetableEntryId: 'te_smoke', studentId: 's1' }
        ],
        [{ id: 'te_smoke', className: 'Chess Class', courseIds: ['course_smoke_1'] }],
        'sidebar'
    );
    const wrap = document.createElement('div');
    wrap.innerHTML = sample;
    const buttons = wrap.querySelectorAll('.sales-day-jump');
    const overlaySample = buildEnrollmentMonthRowsMarkup(
        [{ date: '2026-04-09', timetableEntryId: 'te_smoke', studentId: 's1' }],
        [{ id: 'te_smoke', className: 'Chess Class', courseIds: ['course_smoke_1'] }],
        'overlay'
    );
    const wrapO = document.createElement('div');
    wrapO.innerHTML = overlaySample;
    const ob = wrapO.querySelectorAll('.overlay-day-jump');
    const rows = Array.from(buttons).map((b) => ({
        day: b.textContent,
        dataDate: b.getAttribute('data-date'),
        dataCourse: b.getAttribute('data-course-id'),
        hasOnclick: b.hasAttribute('onclick')
    }));
    const orows = Array.from(ob).map((b) => ({
        closeOverlay: b.getAttribute('data-close-overlay'),
        hasOnclick: b.hasAttribute('onclick')
    }));
    console.log('[smokeTestEnrollmentDayJump] delegation', !!window.__salesEnrollmentDayJumpBound);
    console.log('[smokeTestEnrollmentDayJump] sidebar buttons', rows);
    console.log('[smokeTestEnrollmentDayJump] overlay buttons', orows);
    const ok =
        window.__salesEnrollmentDayJumpBound &&
        buttons.length >= 2 &&
        rows.every((r) => r.dataDate && !r.hasOnclick) &&
        orows.length >= 1 &&
        orows.every((r) => r.closeOverlay === '1' && !r.hasOnclick);
    console.log('[smokeTestEnrollmentDayJump] OK=', ok);
    return { ok, delegation: !!window.__salesEnrollmentDayJumpBound, sidebarButtons: rows, overlayMeta: orows };
};

window.printReceipt = async function(orderOrOrders) {
    // Handle array input (merged receipt/reminder)
    const isArray = Array.isArray(orderOrOrders);
    const orders = isArray ? orderOrOrders : [orderOrOrders];
    
    if (orders.length === 0) return;
    
    // Use the first order to determine status (assuming all in batch have same status)
    const primaryOrder = orders[0];
    const isPaid = primaryOrder.status === 'paid'; 
    
    // Ensure settings are loaded
    if (!window.currentSettings) {
        try {
            const response = await window.authUtils.authenticatedFetch('/organizations/settings');
            if (response && response.ok) {
                window.currentSettings = await response.json();
            }
        } catch (e) {
            console.error('Failed to load settings for receipt', e);
        }
    }

    const salesSettings = (window.currentSettings && window.currentSettings.salesSettings) ? window.currentSettings.salesSettings : {
        receipt: { logo: '', remark: 'Make-up Lesson Arrangements:\n- All make-up class quotas must be used within two months.\n- Sessions cannot be postponed under any circumstances.\n- Classes canceled by Typhoon/Rainstorm will be arranged via Zoom or face-to-face.\n- Must apply for leave at least 2 hours before class.' },
        paymentReminder: { logo: '', remark: 'Make-up Lesson Arrangements:\n- All make-up class quotas must be used within two months.\n- Sessions cannot be postponed under any circumstances.\n- Classes canceled by Typhoon/Rainstorm will be arranged via Zoom or face-to-face.\n- Must apply for leave at least 2 hours before class.', paymentMethod: '', qrCode: '' }
    };

    const title = isPaid ? 'Receipt' : 'Payment Reminder';
    const config = isPaid ? salesSettings.receipt : salesSettings.paymentReminder;
    
    const logoSrc = config.logo || '';
    const remarkText = (config.remark || '').replace(/\n/g, '<br>');
    const paymentMethodInfo = (!isPaid && config.paymentMethod) ? config.paymentMethod.replace(/\n/g, '<br>') : '';
    const qrCodeSrc = (!isPaid && config.qrCode) ? config.qrCode : '';
    
    const student = salesState.selectedStudent;
    const studentName = student ? student.name : 'Unknown';
    const studentId = student ? (student.chessComId || '') : '';
    
    const dateStr = new Date().toLocaleString('en-GB');
    
    let itemsHtml = '';
    let totalAmount = 0;
    let payAmount = 0;
    
    // Collect all order IDs
    const orderIds = orders.map(o => o.id.split('_').pop().toUpperCase()).join(', ');
    
    // Iterate through ALL orders
    orders.forEach(order => {
        const orderPayInfo = order.paymentDetails || {};
        payAmount += (orderPayInfo.amount || 0);

        order.items.forEach(item => {
            const productName = item.productData.name;
            const price = item.price;
            const quantity = item.enrolledClasses ? item.enrolledClasses.length : 1;
            totalAmount += price;
            
            let desc = `<b>${escapeHtml(productName)}</b>`;
            if (item.enrolledClasses && item.enrolledClasses.length > 0) {
                const dates = item.enrolledClasses.map(c => {
                    const d = new Date(c.date);
                    return `${d.getDate()}/${d.getMonth()+1}`;
                }).join(', ');
                
                const first = item.enrolledClasses[0];
                const teacherName = first.entry.teacherName || (first.entry.teacherIds && first.entry.teacherIds.length > 0 ? getTeacherName(first.entry.teacherIds[0]) : 'Unknown');

                desc += `<br><span style="font-size:0.9em; color:#666;">${first.entry.startTime}-${first.entry.endTime} | ${dates}</span>`;
                desc += `<br><span style="font-size:0.9em; color:#666;">Teacher: ${escapeHtml(teacherName)}</span>`;
            }
            
            itemsHtml += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:8px;">${desc}</td>
                    <td style="padding:8px; text-align:right;">$${formatNumber(price / quantity)}</td>
                    <td style="padding:8px; text-align:center;">${quantity}</td>
                    <td style="padding:8px; text-align:right;">$${formatNumber(price)}</td>
                </tr>
            `;
        });
    });
    
    const payInfo = primaryOrder.paymentDetails || {};
    const payMethod = payInfo.method || '-';
    const remark = payInfo.remark || '';

    const receiptCss = `
                body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                .header { text-align: center; margin-bottom: 30px; position: relative; }
                .header h1 { margin: 0; font-size: 24px; }
                .meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
                .meta-right { text-align: right; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
                th { border-bottom: 2px solid #000; text-align: left; padding: 8px; }
                .totals { text-align: right; margin-bottom: 30px; }
                .totals-row { display: flex; justify-content: flex-end; gap: 20px; margin-bottom: 5px; }
                .footer { margin-top: 50px; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 10px; }
                .logo { width: 80px; height: 80px; position: absolute; left: 0; top: 0; display:flex;align-items:center;justify-content:center; }
                .logo img { max-width: 100%; max-height: 100%; }
                .payment-info-section { margin-top: 30px; border: 1px dashed #ccc; padding: 15px; display: flex; gap: 20px; }
                .qr-code-container { width: 120px; height: 120px; flex-shrink: 0; }
                .qr-code-container img { width: 100%; height: 100%; object-fit: contain; }
            `;

    const receiptBodyInner = `
            <div class="header">
                <div class="logo">
                    ${logoSrc ? `<img src="${logoSrc}">` : '<div style="width:100%;height:100%;background:#eee;display:flex;align-items:center;justify-content:center;border-radius:50%;">Logo</div>'}
                </div>
                <h1>${title}</h1>
                <div style="text-align:right; font-size:12px; margin-top:5px;">
                    No.: ${orderIds}<br>
                    Date: ${dateStr}
                </div>
            </div>
            
            <div class="meta">
                <div class="meta-left">
                    <strong>Received From:</strong><br>
                    ${escapeHtml(studentName)} (${escapeHtml(studentId)})
                </div>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>Item Description</th>
                        <th style="text-align:right;">Price</th>
                        <th style="text-align:center;">Quantity</th>
                        <th style="text-align:right;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
            
            <div class="totals">
                <div class="totals-row">
                    <strong>TOTAL</strong>
                    <strong>$${formatNumber(totalAmount)}</strong>
                </div>
                ${isPaid ? `
                <div class="totals-row" style="border-top:1px dashed #ccc; padding-top:10px; margin-top:10px;">
                    <span>Pay By: ${payMethod.toUpperCase()}</span>
                    <span>$${formatNumber(payAmount)}</span>
                </div>
                ${remark ? `<div style="margin-top:5px; font-size:12px;">Remark: ${escapeHtml(remark)}</div>` : ''}
                ` : ''}
            </div>
            
            ${!isPaid && (paymentMethodInfo || qrCodeSrc) ? `
            <div class="payment-info-section">
                ${qrCodeSrc ? `<div class="qr-code-container"><img src="${qrCodeSrc}"></div>` : ''}
                <div style="flex:1; font-size:13px;">
                    <strong>Payment Methods:</strong><br>
                    ${paymentMethodInfo || 'Please contact us for payment details.'}
                </div>
            </div>
            ` : ''}
            
            <div class="footer">
                ${remarkText}
            </div>
            `;

    const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} - ${escapeHtml(orderIds)}</title><style>${receiptCss}</style></head><body>${receiptBodyInner}</body></html>`;

    if (!document.getElementById('receiptPreviewModalStyles')) {
        const st = document.createElement('style');
        st.id = 'receiptPreviewModalStyles';
        st.textContent = `
            .receipt-preview-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.55); z-index: 12000; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; }
            .receipt-preview-panel { background: #fff; width: min(920px, 100%); max-height: min(92vh, 900px); border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.25); display: flex; flex-direction: column; overflow: hidden; }
            .receipt-preview-toolbar { flex: 0 0 auto; display: flex; align-items: center; gap: 16px; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
            .receipt-preview-textbtn { background: none; border: none; padding: 0; margin: 0; font: inherit; font-size: 15px; font-weight: 600; color: #2563eb; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
            .receipt-preview-textbtn:hover { color: #1d4ed8; }
            .receipt-preview-textbtn-muted { color: #64748b; font-weight: 500; }
            .receipt-preview-textbtn-muted:hover { color: #334155; }
            .receipt-preview-iframe { flex: 1 1 auto; min-height: 0; width: 100%; border: 0; background: #fff; }
        `;
        document.head.appendChild(st);
    }

    window.closeReceiptPreviewModal = function closeReceiptPreviewModal() {
        const r = document.getElementById('receiptPreviewModalRoot');
        if (r) {
            const fn = r._receiptEscHandler;
            if (fn) document.removeEventListener('keydown', fn);
            r.remove();
        }
    };

    const oldRoot = document.getElementById('receiptPreviewModalRoot');
    if (oldRoot) oldRoot.remove();

    const root = document.createElement('div');
    root.id = 'receiptPreviewModalRoot';
    root.className = 'receipt-preview-backdrop';
    root.innerHTML = `
        <div class="receipt-preview-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" onclick="event.stopPropagation()">
            <div class="receipt-preview-toolbar">
                <button type="button" class="receipt-preview-textbtn" id="receiptPreviewPrintBtn">Print</button>
                <button type="button" class="receipt-preview-textbtn receipt-preview-textbtn-muted" id="receiptPreviewCloseBtn">Close</button>
            </div>
            <iframe class="receipt-preview-iframe" title="${escapeHtml(title)}"></iframe>
        </div>
    `;
    root.addEventListener('click', () => window.closeReceiptPreviewModal());
    const onKeyDown = (ev) => {
        if (ev.key === 'Escape') window.closeReceiptPreviewModal();
    };
    root._receiptEscHandler = onKeyDown;
    document.addEventListener('keydown', onKeyDown);

    document.body.appendChild(root);

    const iframe = root.querySelector('iframe');
    iframe.srcdoc = srcDoc;

    const runPrint = () => {
        try {
            const w = iframe.contentWindow;
            if (w) {
                w.focus();
                w.print();
            }
        } catch (err) {
            console.error('Receipt print failed', err);
        }
    };

    root.querySelector('#receiptPreviewPrintBtn').addEventListener('click', (ev) => {
        ev.stopPropagation();
        runPrint();
    });
    root.querySelector('#receiptPreviewCloseBtn').addEventListener('click', (ev) => {
        ev.stopPropagation();
        window.closeReceiptPreviewModal();
    });

    window.__receiptPreviewDoPrint = runPrint;
};
