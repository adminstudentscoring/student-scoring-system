// Timetable Management Module
// Handles timetable functionality for organizations and teachers

// State
let timetableEntries = [];
let timetableEnrollments = [];
let timetableMetadata = { classNames: [], classrooms: [] };
// Note: courses variable is shared from course-management.js
let teachers = [];
let timetableOrders = [];
let timetableOrdersById = {};
let attendanceCache = {}; // key: `${entryId}|${dateStr}` -> { loaded, loading, rows }
window.timetableSettings = {};
let currentView = 'week'; // 'day', 'week', 'month'
let currentDate = new Date();
let isReadOnly = false; // For teacher view
// Makeup / postpone state
window.makeupFlowState = { active: false, studentId: null, fromEntryId: null, fromDate: null, studentName: '' };
window.makeupContext = { studentId: null, studentName: '', entryId: null, dateStr: null };

// Holidays helpers
function getHolidaySet() {
  const hol = window.timetableSettings?.holidays;
  const list = Array.isArray(hol) ? hol : [];
  const out = new Set();
  for (const d of list) {
    const s = String(d || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) out.add(s);
  }
  return out;
}

// Initialize timetable management
window.loadTimetableManagement = function(userRole = 'organization') {
  isReadOnly = userRole === 'teacher';
  loadTimetableSettings().then(() => {
      loadTimetableData();
      loadTimetableCourses();
      loadTimetableTeachers();
      loadTimetableStudents();
      loadTimetableOrders();
  });
};

function applyScheduleSettingsFromTimetablePayload(data) {
  if (!data || typeof data.scheduleSettings !== 'object' || data.scheduleSettings === null) return;
  window.timetableSettings = data.scheduleSettings;
}

async function loadTimetableStudents() {
  try {
    if (window.students && Array.isArray(window.students) && window.students.length > 0) return;
    const response = await window.authUtils.authenticatedFetch('/students');
    if (!response || !response.ok) return;
    const data = await response.json().catch(() => []);
    window.students = Array.isArray(data) ? data : (data.students || []);
    renderTimetable();
  } catch (e) {
    // ignore
  }
}

async function loadTimetableOrders() {
  // Orders are used for paid/unpaid coloring (organization only).
  if (isReadOnly) {
    timetableOrders = [];
    timetableOrdersById = {};
    return;
  }
  try {
    timetableOrders = [];
    timetableOrdersById = {};
    const response = await window.authUtils.authenticatedFetch('/organizations/orders');
    if (!response || !response.ok) return;
    const data = await response.json().catch(() => []);
    timetableOrders = Array.isArray(data) ? data : [];
    timetableOrdersById = {};
    for (const o of timetableOrders) {
      if (o && o.id) timetableOrdersById[String(o.id)] = o;
    }
    renderTimetable();
  } catch (e) {
    // ignore
  }
}

async function loadTimetableSettings() {
    if (isReadOnly) {
        window.timetableSettings = window.timetableSettings || {};
        return;
    }
    try {
        const response = await window.authUtils.authenticatedFetch('/organizations/settings');
        if (response && response.ok) {
            const settings = await response.json();
            window.timetableSettings = settings.scheduleSettings || {};
        }
    } catch (e) {
        console.error('Error loading settings', e);
    }
}

// Load timetable data
async function loadTimetableData() {
  try {
    const endpoint = isReadOnly ? '/teachers/timetable' : '/organizations/timetable';
    const response = await window.authUtils.authenticatedFetch(endpoint);
    if (!response) return;

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to load timetable');
    }

    const data = await response.json();
    applyScheduleSettingsFromTimetablePayload(data);
    timetableEntries = data.entries || [];
    timetableEnrollments = data.enrollments || [];
    // Expose globally for Sales module
    window.timetableEntries = timetableEntries;
    window.timetableEnrollments = timetableEnrollments;

    timetableMetadata = data.metadata || { classNames: [], classrooms: [] };

    renderTimetable();
  } catch (error) {
    console.error('Error loading timetable:', error);
    showTimetableError('Failed to load timetable');
  }
}

function getOrderStatusById(orderId) {
  if (!orderId) return null;
  const o = timetableOrdersById[String(orderId)];
  return o ? String(o.status || '') : null;
}

function getEnrollmentFor(entryId, dateStr, studentId) {
  const sid = String(studentId);
  const eid = String(entryId);
  const d = String(dateStr);
  return (
    (timetableEnrollments || []).find(
      (e) => String(e.timetableEntryId) === eid && String(e.date) === d && String(e.studentId) === sid
    ) || null
  );
}

function getAttendanceKey(entryId, dateStr) {
  return `${String(entryId)}|${String(dateStr)}`;
}

function ensureAttendanceLoaded(entryId, dateStr) {
  const key = getAttendanceKey(entryId, dateStr);
  if (attendanceCache[key]?.loaded || attendanceCache[key]?.loading) return;
  attendanceCache[key] = { loaded: false, loading: true, rows: [] };

  window.authUtils
    .authenticatedFetch(
      `/attendance?timetableEntryId=${encodeURIComponent(entryId)}&date=${encodeURIComponent(dateStr)}`
    )
    .then(async (resp) => {
      if (!resp || !resp.ok) return [];
      return resp.json().catch(() => []);
    })
    .then((rows) => {
      attendanceCache[key] = { loaded: true, loading: false, rows: Array.isArray(rows) ? rows : [] };
      // Re-render only affected blocks (best-effort)
      const selector = `.timetable-entry[data-entry-id="${CSS.escape(String(entryId))}"][data-date="${CSS.escape(
        String(dateStr)
      )}"]`;
      document.querySelectorAll(selector).forEach((el) => {
        try {
          const payload = JSON.parse(el.getAttribute('data-students-payload') || 'null');
          if (!payload) return;
          const next = buildStudentsListEl(payload.entryId, payload.dateStr, payload.studentIds);
          const old = el.querySelector('.timetable-entry-students');
          if (old) old.replaceWith(next);
        } catch (e) {
          // ignore
        }
      });
    })
    .catch(() => {
      attendanceCache[key] = { loaded: true, loading: false, rows: [] };
    });
}

function attendanceStatusFor(entryId, dateStr, studentId) {
  const key = getAttendanceKey(entryId, dateStr);
  const rows = attendanceCache[key]?.rows || [];
  const r = rows.find((x) => String(x.studentId) === String(studentId));
  const s = String(r?.status || '').toLowerCase();
  if (s === 'present') return 'present';
  if (s === 'absent') return 'absent';
  return 'unknown';
}

function paymentStatusFor(entryId, dateStr, studentId) {
  const enrollment = getEnrollmentFor(entryId, dateStr, studentId);
  if (!enrollment || !enrollment.orderId) return 'paid'; // default to paid/neutral
  const status = getOrderStatusById(enrollment.orderId);
  if (!status) return 'paid';
  return status === 'paid' ? 'paid' : 'unpaid';
}

function buildStudentsListEl(entryId, dateStr, studentIds) {
  const wrapper = document.createElement('div');
  wrapper.className = 'timetable-entry-students';

  const ids = Array.isArray(studentIds) ? studentIds : [];
  if (!ids.length) return wrapper;

  for (const id of ids) {
    const student = (window.students || []).find((s) => String(s.id) === String(id));
    const name = student?.name ? String(student.name) : 'Unknown';

    const paid = paymentStatusFor(entryId, dateStr, id);
    const att = attendanceStatusFor(entryId, dateStr, id);

    const row = document.createElement('div');
    row.className = `timetable-entry-student ${paid === 'unpaid' ? 'unpaid' : 'paid'}`;

    const dot = document.createElement('span');
    dot.className = `attendance-dot ${att}`;
    dot.title = att === 'unknown' ? 'Attendance: not marked' : `Attendance: ${att}`;

    const label = document.createElement('span');
    label.className = 'timetable-entry-student-name';
    label.textContent = name;

    row.appendChild(dot);
    row.appendChild(label);
    wrapper.appendChild(row);
  }

  return wrapper;
}

// Load courses - use shared courses from course-management.js if available
async function loadTimetableCourses() {
  try {
    // Check if courses are already loaded from course-management.js
    if (window.courses && Array.isArray(window.courses) && window.courses.length > 0) {
      return; // Courses already loaded
    }
    
    // Otherwise load courses
    const response = await window.authUtils.authenticatedFetch('/organizations/courses');
    if (!response) return;
    
    if (!response.ok) {
      throw new Error('Failed to load courses');
    }
    
    // Assign to global courses variable
    window.courses = await response.json();
  } catch (error) {
    console.error('Error loading courses:', error);
  }
}

// Load teachers for Timetable
async function loadTimetableTeachers() {
  try {
    const response = await window.authUtils.authenticatedFetch('/organizations/teachers');
    if (!response) {
        return;
    }
    
    if (!response.ok) {
      throw new Error('Failed to load teachers');
    }
    
    teachers = await response.json();
    renderTimetable(); // Re-render to update names
  } catch (error) {
    console.error('Error loading teachers:', error);
  }
}

// Render timetable
function renderTimetable() {
  const container = document.getElementById('timetableSubTabContent');
  if (!container) return;
  
  container.innerHTML = `
    <div class="timetable-container">
      <div class="timetable-header">
        <div class="timetable-header-left">
          <div class="timetable-view-buttons">
            <button class="timetable-view-btn ${currentView === 'day' ? 'active' : ''}" onclick="switchTimetableView('day')">Day</button>
            <button class="timetable-view-btn ${currentView === 'week' ? 'active' : ''}" onclick="switchTimetableView('week')">Week</button>
            <button class="timetable-view-btn ${currentView === 'month' ? 'active' : ''}" onclick="switchTimetableView('month')">Month</button>
          </div>
          <div class="timetable-nav-buttons">
            <button class="timetable-nav-btn" onclick="navigateTimetable(-1)">&lt;</button>
            <div class="timetable-date-picker-wrapper">
              <input type="date" id="timetableDatePicker" class="timetable-date-native-input" onchange="onDatePickerChange(this.value)">
            </div>
            <button class="timetable-nav-btn" onclick="navigateTimetable(1)">&gt;</button>
            <button class="timetable-nav-btn today-btn" onclick="navigateToToday()">Today</button>
          </div>
        </div>
        ${!isReadOnly ? '<button class="create-class-btn" onclick="openCreateClassModal()">Create New Class</button>' : ''}
      </div>
      <div id="timetableContent">
        ${renderWeekView()}
      </div>
    </div>
  `;
  
  // Initialize date picker value
  updateDatePickerValue();
}

// Update date picker value
function updateDatePickerValue() {
  const picker = document.getElementById('timetableDatePicker');
  if (!picker) return;
  picker.value = formatDateISO(currentDate);
}

// Open date picker - No longer needed for native input
window.openDatePicker = function() {
  // No-op
};

// On date picker change
window.onDatePickerChange = function(dateString) {
  if (!dateString) return;
  currentDate = new Date(dateString);
  switchTimetableView(currentView);
};

// Navigate timetable
window.navigateTimetable = function(direction) {
  if (currentView === 'day') {
    currentDate.setDate(currentDate.getDate() + direction);
  } else if (currentView === 'week') {
    currentDate.setDate(currentDate.getDate() + (direction * 7));
  } else if (currentView === 'month') {
    currentDate.setMonth(currentDate.getMonth() + direction);
  }
  switchTimetableView(currentView);
};

// Navigate to today
window.navigateToToday = function() {
  currentDate = new Date();
  switchTimetableView(currentView);
};

// Switch timetable view
window.switchTimetableView = function(view) {
  currentView = view;
  const content = document.getElementById('timetableContent');
  if (!content) return;
  
  switch(view) {
    case 'day':
      content.innerHTML = renderDayView();
      break;
    case 'week':
      content.innerHTML = renderWeekView();
      break;
    case 'month':
      content.innerHTML = renderMonthView();
      break;
  }
  
  // Update active button
  document.querySelectorAll('.timetable-view-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  // Find the button with correct onclick attribute text
  const buttons = document.querySelectorAll('.timetable-view-btn');
  buttons.forEach(btn => {
    if (btn.getAttribute('onclick').includes(`'${view}'`)) {
      btn.classList.add('active');
    }
  });
  
  updateDatePickerValue();
};

// Render week view
