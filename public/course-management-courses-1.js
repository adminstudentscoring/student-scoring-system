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
