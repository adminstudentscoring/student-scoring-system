// Switch sub-tab
function switchSubTab(subTab) {
  document.querySelectorAll('.course-sub-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.course-sub-tab-content').forEach(c => c.classList.remove('active'));
  
  const tab = document.querySelector(`[data-subtab="${subTab}"]`);
  const content = document.getElementById(`${subTab}SubTabContent`);
  
  if (tab) tab.classList.add('active');
  if (content) content.classList.add('active');
  
  // Load courses when switching to courses tab
  if (subTab === 'courses') {
    loadCourses();
  }
  
  // Load timetable when switching to timetable tab
  if (subTab === 'timetable') {
    if (window.loadTimetableManagement) {
      window.loadTimetableManagement('organization');
    }
  }
  
  // Load packages when switching to package tab
  if (subTab === 'package') {
    loadPackages();
  }

  // Initialize Sales if active
  if (subTab === 'sales') {
    if (window.loadSalesModule) {
      window.loadSalesModule();
    } else {
        console.error('Sales module not loaded');
    }
  }
  
  // Load accounting
  if (subTab === 'accounting') {
    if (window.loadAccountingModule) {
      window.loadAccountingModule();
    }
  }

  // Settings
  if (subTab === 'setting') {
    reloadCourseManagementHolidays();
    if (typeof window.initSalesEnrollmentExcelExportUi === 'function') {
      window.initSalesEnrollmentExcelExportUi().catch(function () {});
    }
    if (typeof window.initVchessImportApplyUi === 'function') {
      window.initVchessImportApplyUi().catch(function () {});
    } else if (typeof window.refreshVchessInvoiceImportBanner === 'function') {
      window.refreshVchessInvoiceImportBanner();
    }
    requestAnimationFrame(function logVchessOnSettingTab() {
      const el = document.getElementById('vchessInvoiceImportSection');
      const pane = document.getElementById('settingSubTabContent');
      console.log('[VChessImport][switchSubTab setting]', {
        build: window.__STUDENT_SCORING_CM_CORE__,
        vchessSectionExists: !!el,
        settingPaneActive: pane ? pane.classList.contains('active') : false,
        hint: el
          ? 'If card still invisible, run debugVChessImportUi() in console.'
          : 'Missing #vchessInvoiceImportSection — hard-refresh or old JS cache.'
      });
    });
  }
}

// ==================== Course Management Settings (Holidays) ====================
let courseManagementSettingsCache = null;

window.reloadCourseManagementHolidays = async function() {
  try {
    const response = await window.authUtils.authenticatedFetch('/organizations/settings');
    if (!response || !response.ok) throw new Error('Failed to load settings');
    const settings = await response.json();
    courseManagementSettingsCache = settings || {};

    // keep global in sync for timetable/sales
    window.timetableSettings = settings.scheduleSettings || {};
    renderCourseManagementHolidayRules();
  } catch (e) {
    console.error('Failed to load course management settings', e);
    const list = document.getElementById('cmHolidayRulesList');
    if (list) list.innerHTML = '';
    if (window.showToast) window.showToast('Failed to load holidays', 'error');
  }
};

window.confirmPurgeAllOrganizationStudents = async function confirmPurgeAllOrganizationStudents() {
  if (!window.authUtils || !window.authUtils.authenticatedFetch) {
    alert('Not signed in.');
    return;
  }
  if (!window.authUtils.hasRole || !window.authUtils.hasRole('organization')) {
    alert('僅限機構帳號使用 · Organization account only.');
    return;
  }
  const warn =
    '將永久刪除本機構「全部」學生，以及其報名、課表內學員名單、訂單、交易與點名紀錄。無法復原。\n\n' +
    'This permanently deletes ALL students in your organization and related data. Continue?';
  if (!window.confirm(warn)) return;
  const phrase = window.prompt('請輸入 DELETE_ALL_STUDENTS 以確認 · Type DELETE_ALL_STUDENTS to confirm:');
  if (phrase !== 'DELETE_ALL_STUDENTS') {
    if (phrase !== null) alert('確認文字不符 · Confirmation did not match.');
    return;
  }
  const btn = document.getElementById('purgeAllOrgStudentsBtn');
  if (btn) {
    btn.disabled = true;
  }
  try {
    const res = await window.authUtils.authenticatedFetch('/organizations/students/purge-all', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'DELETE_ALL_STUDENTS' })
    });
    if (!res || !res.ok) {
      let msg = 'Purge failed';
      try {
        const e = await res.json();
        if (e.error) msg = e.error;
      } catch (e2) {
        /* ignore */
      }
      alert(msg);
      return;
    }
    const data = await res.json();
    window.students = [];
    if (window.showToast) {
      window.showToast(
        '已移除 ' + (data.removedStudents || 0) + ' 位學生 · Removed ' + (data.removedStudents || 0) + ' students',
        'success'
      );
    } else {
      alert(
        '完成：移除學生 ' +
          (data.removedStudents || 0) +
          '、報名 ' +
          (data.removedEnrollments || 0) +
          '、訂單 ' +
          (data.removedOrders || 0) +
          '。請重新整理頁面。'
      );
    }
    if (typeof window.loadStudents === 'function') {
      await window.loadStudents();
    }
  } catch (e) {
    console.error(e);
    alert('Request error · 請稍後再試');
  } finally {
    if (btn) btn.disabled = false;
  }
};

function cmGetHolidayRulesFromSettings(settings) {
  const rules = settings?.scheduleSettings?.holidayRules;
  if (Array.isArray(rules)) return rules;
  return null;
}

function cmLegacyDatesToRules(holidays) {
  const dates = Array.isArray(holidays) ? holidays : [];
  const uniq = Array.from(new Set(dates.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))).sort();
  return uniq.map(d => ({ id: `legacy_${d}`, from: d, to: d, reason: '' }));
}

function cmExpandRuleDates(rule, maxDays = 366) {
  const from = String(rule?.from || '');
  const to = String(rule?.to || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return [];
  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return [];
  if (toMs < fromMs) return [];
  const out = [];
  const days = Math.floor((toMs - fromMs) / 86400000) + 1;
  if (days > maxDays) return [];
  for (let i = 0; i < days; i++) {
    const d = new Date(fromMs + i * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    out.push(`${y}-${m}-${dd}`);
  }
  return out;
}

function cmFormatDmy(ymd) {
  const s = String(ymd || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function renderCourseManagementHolidayRules() {
  const list = document.getElementById('cmHolidayRulesList');
  if (!list) return;

  const settings = courseManagementSettingsCache || {};
  const schedule = settings.scheduleSettings || {};
  let rules = cmGetHolidayRulesFromSettings(settings);
  if (!rules) rules = cmLegacyDatesToRules(schedule.holidays);

  if (!Array.isArray(rules) || rules.length === 0) {
    list.innerHTML = `<div style="padding:12px; border:1px dashed #cbd5e1; border-radius:10px; color:#64748b;">No holidays yet. Click <b>Create</b> to add one.</div>`;
    return;
  }

  const sorted = [...rules].sort((a, b) => String(a.from || '').localeCompare(String(b.from || '')));
  list.innerHTML = sorted.map(r => {
    const from = String(r.from || '');
    const to = String(r.to || '');
    const reason = String(r.reason || '').trim();
    const range = from === to ? cmFormatDmy(from) : `${cmFormatDmy(from)} → ${cmFormatDmy(to)}`;
    return `
      <div style="border:1px solid #e2e8f0; border-radius:10px; padding:10px; display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
        <div style="min-width:0;">
          <div style="font-weight:800; color:#0f172a;">${range}</div>
          <div style="color:#64748b; margin-top:4px; white-space:pre-wrap;">${escapeHtml(reason || '(no reason)')}</div>
        </div>
        <div class="btn-row-pair" style="flex-shrink:0;">
          <button class="btn btn-secondary" onclick="openHolidayRuleModal('${String(r.id || '')}')">Edit</button>
          <button class="btn btn-danger" onclick="deleteHolidayRule('${String(r.id || '')}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

async function saveCourseManagementHolidayRules(rules) {
  try {
    // Load settings if missing
    if (!courseManagementSettingsCache) {
      await reloadCourseManagementHolidays();
    }
    const settings = courseManagementSettingsCache || {};
    if (!settings.scheduleSettings) settings.scheduleSettings = {};

    // Save rules + derived holidays list
    const cleanedRules = (Array.isArray(rules) ? rules : [])
      .filter(r => r && /^\d{4}-\d{2}-\d{2}$/.test(String(r.from || '')) && /^\d{4}-\d{2}-\d{2}$/.test(String(r.to || '')))
      .map(r => ({
        id: String(r.id || `hr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
        from: String(r.from),
        to: String(r.to),
        reason: String(r.reason || '')
      }));

    const dateSet = new Set();
    for (const r of cleanedRules) {
      for (const d of cmExpandRuleDates(r)) dateSet.add(d);
    }
    settings.scheduleSettings.holidayRules = cleanedRules;
    settings.scheduleSettings.holidays = Array.from(dateSet).sort();

    const response = await window.authUtils.authenticatedFetch('/organizations/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
    if (!response || !response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save settings');
    }

    // Refresh cache + globals
    courseManagementSettingsCache = settings;
    window.timetableSettings = settings.scheduleSettings || {};
    renderCourseManagementHolidayRules();
    if (window.showToast) window.showToast('Holidays saved', 'success');
  } catch (e) {
    console.error('Failed to save holidays', e);
    if (window.showToast) window.showToast('Failed to save holidays', 'error');
    else alert('Failed to save holidays');
  }
};

window.openHolidayRuleModal = function(ruleId = null) {
  const settings = courseManagementSettingsCache || {};
  const schedule = settings.scheduleSettings || {};
  let rules = cmGetHolidayRulesFromSettings(settings);
  if (!rules) rules = cmLegacyDatesToRules(schedule.holidays);

  const existing = ruleId ? (rules || []).find(r => String(r.id) === String(ruleId)) : null;
  const initFrom = existing?.from || '';
  const initTo = existing?.to || '';
  const initReason = existing?.reason || '';

  let modal = document.getElementById('cmHolidayRuleModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cmHolidayRuleModal';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.35); display:none; align-items:center; justify-content:center; z-index:11000; padding:16px;';
    modal.innerHTML = `
      <div style="background:#fff; border-radius:14px; width: min(520px, 100%); padding:16px; box-shadow:0 10px 30px rgba(0,0,0,0.18);" onclick="event.stopPropagation();">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="font-size:16px; font-weight:900; color:#0f172a;">Holiday</div>
          <button class="btn btn-secondary" type="button" onclick="closeHolidayRuleModal()">Close</button>
        </div>
        <div style="margin-top:12px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          <div>
            <div style="font-weight:800; color:#0f172a; margin-bottom:6px;">From</div>
            <input id="cmHolidayFrom" type="date" style="width:100%; padding:10px; border:2px solid #e0e0e0; border-radius:10px;">
          </div>
          <div>
            <div style="font-weight:800; color:#0f172a; margin-bottom:6px;">To</div>
            <input id="cmHolidayTo" type="date" style="width:100%; padding:10px; border:2px solid #e0e0e0; border-radius:10px;">
          </div>
        </div>
        <div style="margin-top:10px;">
          <div style="font-weight:800; color:#0f172a; margin-bottom:6px;">Reason</div>
          <textarea id="cmHolidayReason" placeholder="Reason..." style="width:100%; height:110px; padding:10px; border:2px solid #e0e0e0; border-radius:10px;"></textarea>
        </div>
        <div id="cmHolidayModalErr" style="color:#b91c1c; margin-top:10px; display:none;"></div>
        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:12px;">
          <button class="btn btn-primary" type="button" onclick="saveHolidayRuleFromModal()">Save</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', () => window.closeHolidayRuleModal());
    document.body.appendChild(modal);
  }

  modal.dataset.ruleId = existing?.id ? String(existing.id) : '';
  const fromEl = document.getElementById('cmHolidayFrom');
  const toEl = document.getElementById('cmHolidayTo');
  const reasonEl = document.getElementById('cmHolidayReason');
  if (fromEl) fromEl.value = initFrom;
  if (toEl) toEl.value = initTo || initFrom;
  if (reasonEl) reasonEl.value = initReason;
  const err = document.getElementById('cmHolidayModalErr');
  if (err) { err.style.display = 'none'; err.textContent = ''; }
  modal.style.display = 'flex';
};

window.closeHolidayRuleModal = function() {
  const modal = document.getElementById('cmHolidayRuleModal');
  if (modal) modal.style.display = 'none';
};

window.saveHolidayRuleFromModal = async function() {
  const modal = document.getElementById('cmHolidayRuleModal');
  const err = document.getElementById('cmHolidayModalErr');
  const from = document.getElementById('cmHolidayFrom')?.value || '';
  const to = document.getElementById('cmHolidayTo')?.value || '';
  const reason = document.getElementById('cmHolidayReason')?.value || '';
  const ruleId = modal?.dataset?.ruleId ? String(modal.dataset.ruleId) : '';

  const showErr = (msg) => {
    if (!err) return;
    err.textContent = msg;
    err.style.display = 'block';
  };

  if (!from || !to) return showErr('Please select both From and To dates.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return showErr('Invalid date format.');
  if (to < from) return showErr('To date must be after (or same as) From date.');
  const tmp = cmExpandRuleDates({ from, to }, 366);
  if (tmp.length === 0) return showErr('Date range too large (max 366 days) or invalid.');

  const settings = courseManagementSettingsCache || {};
  const schedule = settings.scheduleSettings || {};
  let rules = cmGetHolidayRulesFromSettings(settings);
  if (!rules) rules = cmLegacyDatesToRules(schedule.holidays);
  rules = Array.isArray(rules) ? [...rules] : [];

  if (ruleId) {
    const idx = rules.findIndex(r => String(r.id) === ruleId);
    if (idx >= 0) {
      rules[idx] = { ...rules[idx], from, to, reason };
    } else {
      rules.push({ id: ruleId, from, to, reason });
    }
  } else {
    rules.push({ id: `hr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, from, to, reason });
  }

  await saveCourseManagementHolidayRules(rules);
  closeHolidayRuleModal();
};

window.deleteHolidayRule = async function(ruleId) {
  if (!confirm('Delete this holiday?')) return;
  const settings = courseManagementSettingsCache || {};
  const schedule = settings.scheduleSettings || {};
  let rules = cmGetHolidayRulesFromSettings(settings);
  if (!rules) rules = cmLegacyDatesToRules(schedule.holidays);
  rules = (Array.isArray(rules) ? rules : []).filter(r => String(r.id) !== String(ruleId));
  await saveCourseManagementHolidayRules(rules);
};

// Load courses from API
async function loadCourses() {
  try {
    const response = await window.authUtils.authenticatedFetch('/organizations/courses');
    if (!response) return;
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to load courses');
    }
    
    window.courses = await response.json();
    
    // Update price filter max
    updatePriceFilterMax();
    
    // Render courses
    renderCourses();
  } catch (error) {
    console.error('Error loading courses:', error);
    showToast('Failed to load courses. Please try again.', 'error');
    renderCoursesError();
  }
}

// Update price filter max based on courses
function updatePriceFilterMax() {
  if (!window.courses || window.courses.length === 0) {
    currentPriceRange.max = 1000;
    document.getElementById('priceMax').max = 1000;
    document.getElementById('priceMax').value = 1000;
    updatePriceRangeLabel();
    return;
  }
  
  const maxPrice = Math.max(...window.courses.map(c => c.price));
  const roundedMax = Math.ceil(maxPrice / 100) * 100; // Round up to nearest 100
  const finalMax = Math.max(roundedMax, 1000); // At least 1000
  
  currentPriceRange.max = finalMax;
  document.getElementById('priceMax').max = finalMax;
  document.getElementById('priceMax').value = finalMax;
  updatePriceRangeLabel();
}

// Update price range label
function updatePriceRangeLabel() {
  const label = document.getElementById('priceRangeLabel');
  if (label) {
    label.textContent = `$${formatNumber(currentPriceRange.min)} - $${formatNumber(currentPriceRange.max)}`;
  }
}

// Handle course search
window.handleCourseSearch = function() {
  currentSearch = document.getElementById('courseSearch').value.toLowerCase().trim();
  currentPage = 1;
  renderCourses();
};

// Handle price filter
window.handlePriceFilter = function() {
  const minInput = document.getElementById('priceMin');
  const maxInput = document.getElementById('priceMax');
  
  let min = parseInt(minInput.value);
  let max = parseInt(maxInput.value);
  
  // Ensure min <= max
  if (min > max) {
    if (minInput === document.activeElement) {
      max = min;
      maxInput.value = max;
    } else {
      min = max;
      minInput.value = min;
    }
  }
  
  currentPriceRange.min = min;
  currentPriceRange.max = max;
  updatePriceRangeLabel();
  currentPage = 1;
  renderCourses();
};

// Handle course sort
window.handleCourseSort = function() {
  const sortValue = document.getElementById('courseSort').value;
  const [field, direction] = sortValue.split('-');
  
  currentSort = { field, direction };
  currentPage = 1;
  renderCourses();
  
  // Update sort select display
  updateSortDisplay();
};

// Update sort display
function updateSortDisplay() {
  const sortSelect = document.getElementById('courseSort');
  if (!sortSelect) return;
  
  const option = sortSelect.querySelector(`option[value="${currentSort.field}-${currentSort.direction}"]`);
  if (option) {
    sortSelect.value = `${currentSort.field}-${currentSort.direction}`;
  }
}

// Render courses list
function renderCourses() {
  const container = document.getElementById('coursesListContainer');
  if (!container) return;
  
  // Filter courses
  let filteredCourses = (window.courses || []).filter(course => {
    // Search filter
    if (currentSearch && !course.name.toLowerCase().includes(currentSearch)) {
      return false;
    }
    
    // Price filter
    if (course.price < currentPriceRange.min || course.price > currentPriceRange.max) {
      return false;
    }
    
    return true;
  });
  
  // Sort courses
  filteredCourses.sort((a, b) => {
    let aVal, bVal;
    
    switch (currentSort.field) {
      case 'name':
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
        break;
      case 'price':
        aVal = a.price;
        bVal = b.price;
        break;
      case 'createdAt':
      default:
        aVal = new Date(a.createdAt);
        bVal = new Date(b.createdAt);
        break;
    }
    
    if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
    return 0;
  });
  
  // Pagination
  const totalPages = Math.ceil(filteredCourses.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedCourses = filteredCourses.slice(startIndex, endIndex);
  
  // Empty state
  if (filteredCourses.length === 0) {
    if (currentSearch || currentPriceRange.min > 0 || currentPriceRange.max < 10000) {
      container.innerHTML = '<p>No courses found matching your criteria.</p>';
    } else {
      container.innerHTML = '<p>No courses yet. Click \'Create\' to add your first course.</p>';
    }
    return;
  }
  
  // Render table
  let html = `
    <table class="courses-table">
      <thead>
        <tr>
          <th style="width: 40px;">
            <input type="checkbox" id="selectAllCourses" onchange="handleSelectAll()">
          </th>
          <th style="flex: 1;">Course Name</th>
          <th style="width: 180px;">Price</th>
          <th style="width: 100px;">Actions</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  paginatedCourses.forEach(course => {
    const isSelected = selectedCourseIds.has(course.id);
    const priceDisplay = formatPrice(course.price);
    
    html += `
      <tr class="${isSelected ? 'selected' : ''}" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.05)'" onmouseout="this.style.backgroundColor=''">
        <td>
          <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="handleCourseSelect('${course.id}', this.checked)">
        </td>
        <td>${escapeHtml(course.name)}</td>
        <td>${priceDisplay}</td>
        <td>
          <button class="btn btn-secondary" onclick="openEditCourseModal('${course.id}')">Edit</button>
        </td>
      </tr>
    `;
  });
  
  html += `
      </tbody>
    </table>
  `;
  
  // Add pagination if needed
  if (filteredCourses.length >= ITEMS_PER_PAGE) {
    html += `
      <div class="pagination">
        <div class="pagination-info">
          Showing ${startIndex + 1}-${Math.min(endIndex, filteredCourses.length)} of ${filteredCourses.length} courses
        </div>
        <div class="pagination-controls">
          <button class="btn btn-secondary" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">Previous</button>
          <span>Page ${currentPage} of ${totalPages}</span>
          <button class="btn btn-secondary" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">Next</button>
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  // Update select all checkbox
  const selectAll = document.getElementById('selectAllCourses');
  if (selectAll) {
    const allSelected = paginatedCourses.length > 0 && paginatedCourses.every(c => selectedCourseIds.has(c.id));
    selectAll.checked = allSelected;
  }
  
  // Update delete button
  updateDeleteButton();
}

// Change page
window.changePage = function(page) {
  currentPage = page;
  renderCourses();
};

// Handle select all
window.handleSelectAll = function() {
  const selectAll = document.getElementById('selectAllCourses');
  if (!selectAll) return;
  
  const container = document.getElementById('coursesListContainer');
  const checkboxes = container.querySelectorAll('tbody input[type="checkbox"]');
  
  checkboxes.forEach(checkbox => {
    const courseId = checkbox.onchange.toString().match(/'([^']+)'/)[1];
    checkbox.checked = selectAll.checked;
    handleCourseSelect(courseId, selectAll.checked);
  });
};

// Handle course select
window.handleCourseSelect = function(courseId, selected) {
  if (selected) {
    selectedCourseIds.add(courseId);
  } else {
    selectedCourseIds.delete(courseId);
  }
  updateDeleteButton();
  
  // Update select all checkbox
  const selectAll = document.getElementById('selectAllCourses');
  if (selectAll) {
    const container = document.getElementById('coursesListContainer');
    const checkboxes = container.querySelectorAll('tbody input[type="checkbox"]');
    const allSelected = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
    selectAll.checked = allSelected;
  }
};

// Update delete button
function updateDeleteButton() {
  const deleteBtn = document.getElementById('deleteCoursesBtn');
  const countSpan = document.getElementById('selectedCount');
  
  if (deleteBtn && countSpan) {
    const count = selectedCourseIds.size;
    deleteBtn.style.display = count > 0 ? 'inline-block' : 'none';
    countSpan.textContent = count;
  }
}

// Handle delete selected
window.handleDeleteSelected = async function() {
  if (selectedCourseIds.size === 0) return;
  
  const count = selectedCourseIds.size;
  const confirmed = confirm(`Are you sure you want to delete ${count} course(s)?`);
  
  if (!confirmed) return;
  
  try {
    const response = await window.authUtils.authenticatedFetch('/organizations/courses', {
      method: 'DELETE',
      body: JSON.stringify({ courseIds: Array.from(selectedCourseIds) })
    });
    
    if (!response) return;
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete courses');
    }
    
    selectedCourseIds.clear();
    showToast(`${count} course(s) deleted successfully`, 'success');
    loadCourses();
  } catch (error) {
    console.error('Error deleting courses:', error);
    showToast('Failed to delete courses: ' + error.message, 'error');
  }
};

// Render courses error
function renderCoursesError() {
  const container = document.getElementById('coursesListContainer');
  if (container) {
    container.innerHTML = `
      <p>Failed to load courses. <button class="btn btn-secondary" onclick="loadCourses()">Retry</button></p>
    `;
  }
}

// Open create course modal
window.openCreateCourseModal = function() {
  openCourseModal(null);
};

// Open edit course modal
window.openEditCourseModal = function(courseId) {
  const course = (window.courses || []).find(c => c.id === courseId);
  if (!course) {
    showToast('Course not found', 'error');
    return;
  }
  openCourseModal(course);
};

// Open course modal (create or edit)
function openCourseModal(course) {
  const isEdit = !!course;
  const randomColor = PREDEFINED_COLORS[Math.floor(Math.random() * PREDEFINED_COLORS.length)];
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div class="modal-header">
        <h2>${isEdit ? 'Edit Course' : 'Create New Course'}</h2>
        <button class="modal-close" onclick="closeCourseModal()">&times;</button>
      </div>
      <div class="modal-body">
        <form id="courseForm" onsubmit="saveCourse(event, ${isEdit ? `'${course.id}'` : 'null'})">
          <div class="form-group">
            <label>Course Name <span class="required">*</span></label>
            <input type="text" id="courseName" required maxlength="50" value="${isEdit ? escapeHtml(course.name) : ''}">
            <div class="error-message" id="courseNameError"></div>
          </div>
          
          <div class="form-group">
            <label>Price <span class="required">*</span></label>
            <input type="text" id="coursePrice" required placeholder="0.00" value="${isEdit ? course.price : ''}" onblur="formatPriceInput(this)" onfocus="unformatPriceInput(this)">
            <span class="input-hint">per lesson</span>
            <div class="error-message" id="coursePriceError"></div>
          </div>
          
          <div class="form-group">
            <label>Color (Optional)</label>
            <div class="color-selector">
              <div class="predefined-colors">
                ${PREDEFINED_COLORS.map((color, index) => `
                  <div class="color-option ${isEdit && course.color === color ? 'selected' : !isEdit && color === randomColor ? 'selected' : ''}" 
                       style="background-color: ${color}" 
                       onclick="selectPredefinedColor('${color}')"
                       data-color="${color}"></div>
                `).join('')}
              </div>
              <div class="custom-color-input">
                <input type="text" id="customColor" placeholder="#RRGGBB" value="${isEdit && course.color && !PREDEFINED_COLORS.includes(course.color) ? course.color : ''}" oninput="validateColorInput(this)">
                <input type="color" id="colorPicker" value="${isEdit && course.color ? course.color : randomColor}" onchange="handleColorPickerChange(this)">
              </div>
            </div>
            <div class="error-message" id="courseColorError"></div>
          </div>
          
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeCourseModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="saveCourseBtn">${isEdit ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Set initial color
  if (isEdit && course.color) {
    document.getElementById('colorPicker').value = course.color;
  } else if (!isEdit) {
    document.getElementById('colorPicker').value = randomColor;
  }
  
  // Store original form data for unsaved changes check
  window.courseModalOriginalData = {
    name: isEdit ? course.name : '',
    price: isEdit ? course.price : '',
    color: isEdit ? course.color : randomColor
  };
  
  window.currentCourseModal = modal;
}

// Close course modal
window.closeCourseModal = function() {
  if (!window.currentCourseModal) return;
  
  // Check for unsaved changes
  const form = document.getElementById('courseForm');
  if (form) {
    const currentData = {
      name: document.getElementById('courseName').value,
      price: document.getElementById('coursePrice').value,
      color: document.getElementById('colorPicker').value
    };
    
    const hasChanges = JSON.stringify(currentData) !== JSON.stringify(window.courseModalOriginalData);
    
    if (hasChanges) {
      const confirmed = confirm('You have unsaved changes. Are you sure you want to close?');
      if (!confirmed) return;
    }
  }
  
  document.body.removeChild(window.currentCourseModal);
  window.currentCourseModal = null;
  window.courseModalOriginalData = null;
};

// Select predefined color
window.selectPredefinedColor = function(color) {
  document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
  document.querySelector(`[data-color="${color}"]`).classList.add('selected');
  document.getElementById('colorPicker').value = color;
  document.getElementById('customColor').value = '';
};

// Handle color picker change
window.handleColorPickerChange = function(picker) {
  const color = picker.value;
  document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
  const predefined = document.querySelector(`[data-color="${color}"]`);
  if (predefined) {
    predefined.classList.add('selected');
    document.getElementById('customColor').value = '';
  } else {
    document.getElementById('customColor').value = color;
  }
};

// Validate color input
window.validateColorInput = function(input) {
  const color = input.value.trim();
  const errorDiv = document.getElementById('courseColorError');
  
  if (color === '') {
    errorDiv.textContent = '';
    return;
  }
  
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    errorDiv.textContent = 'Color must be in #RRGGBB format';
    return;
  }
  
  errorDiv.textContent = '';
  document.getElementById('colorPicker').value = color;
  document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
};

// Format price input (add thousand separator on blur)
window.formatPriceInput = function(input) {
  const value = input.value.replace(/,/g, '');
  const num = parseFloat(value);
  
  if (!isNaN(num)) {
    input.value = formatNumber(num);
  }
};

// Unformat price input (remove thousand separator on focus)
window.unformatPriceInput = function(input) {
  input.value = input.value.replace(/,/g, '');
};

// Save course
window.saveCourse = async function(event, courseId) {
  event.preventDefault();
  
  const name = document.getElementById('courseName').value.trim();
  const priceInput = document.getElementById('coursePrice').value.replace(/,/g, '');
  const price = parseFloat(priceInput);
  const color = document.getElementById('colorPicker').value;
  
  // Clear previous errors
  document.getElementById('courseNameError').textContent = '';
  document.getElementById('coursePriceError').textContent = '';
  document.getElementById('courseColorError').textContent = '';
  
  // Validation
  let hasError = false;
  
  if (!name || name.length === 0) {
    document.getElementById('courseNameError').textContent = 'Course name is required';
    hasError = true;
  } else if (name.length > 50) {
    document.getElementById('courseNameError').textContent = 'Course name must be 50 characters or less';
    hasError = true;
  }
  
  if (isNaN(price) || price < 0) {
    document.getElementById('coursePriceError').textContent = price < 0 ? 'Price must be greater than or equal to 0' : 'Price must be a valid number';
    hasError = true;
  }
  
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    document.getElementById('courseColorError').textContent = 'Color must be in #RRGGBB format';
    hasError = true;
  }
  
  if (hasError) return;
  
  // Check name uniqueness (frontend check)
  const existingCourse = (window.courses || []).find(c => 
    c.id !== courseId &&
    c.name.toLowerCase().trim() === name.toLowerCase().trim()
  );
  
  if (existingCourse) {
    document.getElementById('courseNameError').textContent = 'Course name already exists in this organization';
    return;
  }
  
  // Disable save button
  const saveBtn = document.getElementById('saveCourseBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  
  try {
    const url = courseId ? `/organizations/courses/${courseId}` : '/organizations/courses';
    const method = courseId ? 'PUT' : 'POST';
    
    const response = await window.authUtils.authenticatedFetch(url, {
      method: method,
      body: JSON.stringify({
        name: name,
        price: price,
        color: color || null
      })
    });
    
    if (!response) {
      saveBtn.disabled = false;
      saveBtn.textContent = courseId ? 'Update' : 'Create';
      return;
    }
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to save course');
    }
    
    showToast(`Course ${courseId ? 'updated' : 'created'} successfully`, 'success');
    closeCourseModal();
    loadCourses();
  } catch (error) {
    console.error('Error saving course:', error);
    showToast('Failed to save course: ' + error.message, 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = courseId ? 'Update' : 'Create';
  }
};

