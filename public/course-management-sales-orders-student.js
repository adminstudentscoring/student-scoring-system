// Split from course-management-sales-orders.js
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
    (s.localName && String(s.localName).toLowerCase().includes(term)) ||
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
        <div class="student-id">${escapeHtml([s.localName, s.chessComId].filter(Boolean).join(' · ') || '')}</div>
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
