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
let makeupFlowState = { active: false, studentId: null, fromEntryId: null, fromDate: null, studentName: '' };
let makeupContext = { studentId: null, studentName: '', entryId: null, dateStr: null };

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
  // Teachers may not have permission; fail silently.
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
    console.log('[DEBUG] Fetching teachers...');
    const response = await window.authUtils.authenticatedFetch('/organizations/teachers');
    if (!response) {
        console.error('[DEBUG] No response from fetch teachers');
        return;
    }
    
    if (!response.ok) {
      throw new Error('Failed to load teachers');
    }
    
    teachers = await response.json();
    console.log('[DEBUG] Teachers loaded:', teachers);
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
function renderWeekView() {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const allTimeSlots = generateTimeSlots();
  
  // Use all time slots based on settings
  const visibleTimeSlots = allTimeSlots;
  
  // Get current week dates
  const weekDates = getWeekDates(currentDate);
  const holidaySet = getHolidaySet();
  const isHolidayByIndex = weekDates.map(d => holidaySet.has(formatDateISO(d)));
  
  let html = '<div class="timetable-week-view">';
  
  // Header
  html += '<div class="timetable-week-header">';
  html += '<div class="timetable-week-header-cell timetable-week-time-col">Time</div>';
  days.forEach((day, index) => {
    const date = weekDates[index];
    const holidayCls = isHolidayByIndex[index] ? ' is-holiday' : '';
    html += `<div class="timetable-week-header-cell${holidayCls}">${day}<br><small>${formatDate(date)}</small></div>`;
  });
  html += '</div>';
  
  // Body with scrollable content
  html += '<div class="timetable-week-body-scrollable">';
  html += '<div class="timetable-week-body">';
  
  allTimeSlots.forEach(timeSlot => {
    // Time column
    html += `<div class="timetable-week-time-cell timetable-week-time-col">${timeSlot}</div>`;
    
    // Day columns
    days.forEach((day, dayIndex) => {
      const date = weekDates[dayIndex];
      const holidayCls = isHolidayByIndex[dayIndex] ? ' is-holiday' : '';
      html += `<div class="timetable-week-day-cell${holidayCls}" data-time="${timeSlot}" data-day="${day}" data-date="${formatDateISO(date)}"></div>`;
    });
  });
  
  html += '</div>';
  html += '</div>';
  html += '</div>';
  
  // Render entries
  setTimeout(() => {
    renderWeekEntries();
    scrollToCurrentTime();
  }, 10);
  
  return html;
}

// Scroll to current time
function scrollToCurrentTime() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMin;
  
  // Get settings for boundaries
  const settings = window.timetableSettings || {};
  const startStr = settings.viewStartTime || '08:00';
  const endStr = settings.viewEndTime || '22:00';
  
  const [startHour, startMin] = startStr.split(':').map(Number);
  const [endHour, endMin] = endStr.split(':').map(Number);
  
  const startBoundMinutes = startHour * 60 + startMin;
  const endBoundMinutes = endHour * 60 + endMin;
  
  // Calculate target time
  let targetTimeMinutes = currentTimeMinutes;
  
  // If current time is before view start, scroll to start
  if (currentTimeMinutes < startBoundMinutes) {
    targetTimeMinutes = startBoundMinutes;
  }
  // If current time is after view end, scroll to end
  else if (currentTimeMinutes > endBoundMinutes) {
    targetTimeMinutes = endBoundMinutes;
  }
  
  // Round to nearest 15 minutes
  const roundedMinutes = Math.floor(targetTimeMinutes / 15) * 15;
  const targetHour = Math.floor(roundedMinutes / 60);
  const targetMin = roundedMinutes % 60;
  
  // Find the time slot index
  const allTimeSlots = generateTimeSlots();
  const targetTime = `${String(targetHour).padStart(2, '0')}:${String(targetMin).padStart(2, '0')}`;
  const slotIndex = allTimeSlots.indexOf(targetTime);
  
  if (slotIndex !== -1) {
    const scrollableContainer = document.querySelector('.timetable-week-body-scrollable');
    if (scrollableContainer) {
      const slotHeight = 30; // 30px per 15 minutes
      const scrollPosition = Math.max(0, slotIndex * slotHeight - 100); // Offset by 100px to show some context
      scrollableContainer.scrollTop = scrollPosition;
    }
  }
}

// Render week entries
function renderWeekEntries() {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weekDates = getWeekDates(currentDate);
  
  timetableEntries.forEach(entry => {
    if (entry.isRecurring) {
      // Recurring entries
      entry.dayOfWeek.forEach(day => {
        const dayIndex = days.indexOf(day);
        if (dayIndex === -1) return;
        
        const date = weekDates[dayIndex];
        const dateISO = formatDateISO(date);
        
        // Check exceptions
        if (entry.exceptions && entry.exceptions.includes(dateISO)) return;
        
        // Check date range
        if (entry.startDate && entry.startDate > dateISO) return;
        if (entry.endDate && entry.endDate < dateISO) return;
        
        renderEntryInCell(entry, day, date);
      });
    } else {
      // One-time entries
      const entryDate = new Date(entry.date);
      weekDates.forEach((weekDate, index) => {
        if (isSameDate(entryDate, weekDate)) {
          renderEntryInCell(entry, days[index], weekDate);
        }
      });
    }
  });
}

// Render entry in cell
function renderEntryInCell(entry, day, date) {
  const cell = document.querySelector(`.timetable-week-day-cell[data-day="${day}"][data-date="${formatDateISO(date)}"]`);
  if (!cell) return;
  
  // Parse start and end times
  const [startHour, startMin] = entry.startTime.split(':').map(Number);
  const [endHour, endMin] = entry.endTime.split(':').map(Number);
  const startTotalMinutes = startHour * 60 + startMin;
  const endTotalMinutes = endHour * 60 + endMin;
  const duration = endTotalMinutes - startTotalMinutes;
  
  // Calculate position and height directly from minutes
  const settings = window.timetableSettings || {};
  const startStr = settings.viewStartTime || '08:00';
  const interval = settings.slotInterval || 15;
  
  const [baseHour, baseMin] = startStr.split(':').map(Number);
  const baseMinutes = baseHour * 60 + baseMin;
  
  const slotHeight = 30; // 30px per interval slot
  
  // Calculate slot index: round to nearest interval slot
  const startSlotIndex = Math.round((startTotalMinutes - baseMinutes) / interval);
  const endSlotIndex = Math.round((endTotalMinutes - baseMinutes) / interval);
  
  // Get max slots from generated slots (approximate calculation to avoid regeneration)
  const endStr = settings.viewEndTime || '22:00';
  const [endLimitHour, endLimitMin] = endStr.split(':').map(Number);
  const endLimitMinutes = endLimitHour * 60 + endLimitMin;
  const totalSlots = Math.floor((endLimitMinutes - baseMinutes) / interval) + 1;
  
  // Ensure indices are valid
  const validStartIndex = Math.max(0, Math.min(startSlotIndex, totalSlots));
  const validEndIndex = Math.max(0, Math.min(endSlotIndex, totalSlots));
  
  // Calculate top position: each slot is 30px, align to slot start
  const top = validStartIndex * slotHeight;
  
  // Calculate height: number of slots * slot height
  const slotCount = Math.max(1, validEndIndex - validStartIndex);
  const height = slotCount * slotHeight;
  
  // Get course color
  const courseColor = entry.courseIds.length > 0 ? getCourseColor(entry.courseIds[0]) : '#667eea';
  
  // Get teacher names
  const teacherNames = entry.teacherIds.map(id => {
    const teacher = teachers.find(t => t.id === id);
    return teacher ? teacher.name : '';
  }).filter(Boolean).join(', ');
  
  // Calculate student count
  const baseStudents = entry.studentIds ? entry.studentIds.length : 0;
  const dateStr = formatDateISO(date);
  const isHoliday = getHolidaySet().has(dateStr);
  
  // Filter extra students (single enrollments)
  const extraStudentIds = (timetableEnrollments || []).filter(e => 
    e.timetableEntryId === entry.id && 
    e.date === dateStr && 
    e.type === 'single'
  ).map(e => e.studentId);
  
  // Filter excluded students
  const excludedStudentIds = (timetableEnrollments || []).filter(e => 
    e.timetableEntryId === entry.id && 
    e.date === dateStr && 
    e.type === 'exclusion'
  ).map(e => e.studentId);

  // Combine base + extra - excluded
  // Convert IDs to strings for safe comparison
  const baseStudentIds = (entry.studentIds || []).map(String);
  const extraStudentIdsStr = extraStudentIds.map(String);
  const excludedStudentIdsStr = excludedStudentIds.map(String);
  
  const allStudentIds = [...new Set([...baseStudentIds, ...extraStudentIdsStr])]
      .filter(id => !excludedStudentIdsStr.includes(id));
  
  const totalStudents = allStudentIds.length;
  
  const entryEl = document.createElement('div');
  entryEl.className = `timetable-entry ${duration <= 15 ? 'timetable-entry-small' : ''}${isHoliday ? ' is-holiday' : ''}`;
  entryEl.style.cssText = `
    top: ${top}px;
    height: ${height}px;
    background: ${courseColor};
  `;
  entryEl.setAttribute('data-entry-id', entry.id);
  entryEl.setAttribute('data-date', dateStr);
  entryEl.onmouseenter = () => {
    try {
      entryEl.classList.add('is-expanded');
      // keep at least original height so it doesn't "jump" smaller
      entryEl.style.minHeight = `${height}px`;
    } catch (e) {}
  };
  entryEl.onmouseleave = () => {
    try {
      entryEl.classList.remove('is-expanded');
      entryEl.style.minHeight = '';
    } catch (e) {}
  };
  entryEl.onclick = (e) => {
    e.stopPropagation();
    if (makeupFlowState.active) {
      handleMakeupTargetSelect(entry, dateStr);
      return;
    }
    if (!isReadOnly) {
      window.openEditClassModal(entry, dateStr);
    }
  };
  
  let content = `<div class="timetable-entry-class-name">${escapeHtml(entry.className)}</div>`;
  
  if (height >= 30) {
    content += `<div class="timetable-entry-time">${entry.startTime} - ${entry.endTime}</div>`;
  }
  
  if (height >= 45 && teacherNames) {
    content += `<div class="timetable-entry-teacher">${escapeHtml(teacherNames)}</div>`;
    content += `<div class="timetable-entry-count">${totalStudents} students</div>`;
  }
  
  if (height >= 60 && entry.classroom) {
    content += `<div class="timetable-entry-classroom">${escapeHtml(entry.classroom)}</div>`;
  }
  
  if (totalStudents > 0) {
    // Always prepare full student list, even if block is too small.
    // - If height < 75: list is hover-only popover
    // - Else: list is in-flow, and hover will expand by overflow:visible
    ensureAttendanceLoaded(entry.id, dateStr);
    entryEl.setAttribute('data-students-payload', JSON.stringify({ entryId: entry.id, dateStr, studentIds: allStudentIds }));
    const hoverOnly = height < 75;
    content += `<div class="timetable-entry-students${hoverOnly ? ' hover-only' : ''}"></div>`;
  }
  
  entryEl.innerHTML = content;
  cell.appendChild(entryEl);

  // Replace placeholder students list with DOM-built list
  if (totalStudents > 0) {
    const placeholder = entryEl.querySelector('.timetable-entry-students');
    if (placeholder) {
      const listEl = buildStudentsListEl(entry.id, dateStr, allStudentIds);
      if (height < 75) listEl.classList.add('hover-only');
      placeholder.replaceWith(listEl);
    }
  }
}

// Helper functions
function generateTimeSlots() {
  const settings = window.timetableSettings || {};
  const startStr = settings.viewStartTime || '08:00';
  const endStr = settings.viewEndTime || '22:00';
  const interval = settings.slotInterval || 15;
  
  const [startHour, startMin] = startStr.split(':').map(Number);
  const [endHour, endMin] = endStr.split(':').map(Number);
  
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;
  
  const slots = [];
  for (let time = startTime; time <= endTime; time += interval) {
      const h = Math.floor(time / 60);
      const m = time % 60;
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return slots;
}

function formatTimeSlot(time) {
  const [hour, min] = time.split(':').map(Number);
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function getWeekDates(date) {
  const dates = [];
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  const monday = new Date(d.setDate(diff));
  
  for (let i = 0; i < 7; i++) {
    const newDate = new Date(monday);
    newDate.setDate(monday.getDate() + i);
    dates.push(newDate);
  }
  
  return dates;
}

function formatDate(date) {
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

function formatDateISO(date) {
  return date.toISOString().split('T')[0];
}

function isSameDate(date1, date2) {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

function getCourseColor(courseId) {
  // Use courses from course-management.js (shared via window.courses)
  const coursesList = window.courses || [];
  const course = coursesList.find(c => c.id === courseId);
  return course && course.color ? course.color : '#667eea';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showTimetableError(message) {
  const container = document.getElementById('timetableSubTabContent');
  if (container) {
    container.innerHTML = `<p style="color: #ef4444;">${message}</p>`;
  }
}

// Render day view
function renderDayView() {
  const timeSlots = generateTimeSlots();
  const date = currentDate;
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
  const dateISO = formatDateISO(date);
  const isHoliday = getHolidaySet().has(dateISO);
  
  let html = `<div class="timetable-day-view${isHoliday ? ' is-holiday' : ''}">`;
  
  // Header
  html += `<div class="timetable-day-header${isHoliday ? ' is-holiday' : ''}">${dayName} - ${formatDate(date)}</div>`;
  
  // Body
  html += '<div class="timetable-day-body">';
  
  timeSlots.forEach(timeSlot => {
    // Time column
    html += `<div class="timetable-day-time-cell">${timeSlot}</div>`;
    
    // Schedule column
    html += `<div class="timetable-day-schedule-cell" data-time="${timeSlot}" data-date="${formatDateISO(date)}"></div>`;
  });
  
  html += '</div>';
  html += '</div>';
  
  // Render entries
  setTimeout(() => {
    renderDayEntries(date);
  }, 10);
  
  return html;
}

// Render day entries
function renderDayEntries(date) {
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
  const dateISO = formatDateISO(date);
  
  timetableEntries.forEach(entry => {
    if (entry.isRecurring) {
      // Recurring entries - check if this day matches
      if (entry.dayOfWeek && entry.dayOfWeek.includes(dayName)) {
        // Check exceptions
        if (entry.exceptions && entry.exceptions.includes(dateISO)) return;
        
        // Check date range
        if (entry.startDate && entry.startDate > dateISO) return;
        if (entry.endDate && entry.endDate < dateISO) return;
        
        renderEntryInDayCell(entry, date);
      }
    } else {
      // One-time entries - check if date matches
      const entryDate = new Date(entry.date);
      if (isSameDate(entryDate, date)) {
        renderEntryInDayCell(entry, date);
      }
    }
  });
}

// Render entry in day cell
function renderEntryInDayCell(entry, date) {
  const cell = document.querySelector(`.timetable-day-schedule-cell[data-date="${formatDateISO(date)}"]`);
  if (!cell) return;
  
  // Parse start and end times
  const [startHour, startMin] = entry.startTime.split(':').map(Number);
  const [endHour, endMin] = entry.endTime.split(':').map(Number);
  const startTotalMinutes = startHour * 60 + startMin;
  const endTotalMinutes = endHour * 60 + endMin;
  const duration = endTotalMinutes - startTotalMinutes;
  
  // Calculate position and height directly from minutes
  const settings = window.timetableSettings || {};
  const startStr = settings.viewStartTime || '08:00';
  const interval = settings.slotInterval || 15;
  
  const [baseHour, baseMin] = startStr.split(':').map(Number);
  const baseMinutes = baseHour * 60 + baseMin;
  
  const slotHeight = 30; // 30px per interval slot
  
  // Calculate slot index: round to nearest interval slot
  const startSlotIndex = Math.round((startTotalMinutes - baseMinutes) / interval);
  const endSlotIndex = Math.round((endTotalMinutes - baseMinutes) / interval);
  
  // Get max slots from generated slots (approximate calculation to avoid regeneration)
  const endStr = settings.viewEndTime || '22:00';
  const [endLimitHour, endLimitMin] = endStr.split(':').map(Number);
  const endLimitMinutes = endLimitHour * 60 + endLimitMin;
  const totalSlots = Math.floor((endLimitMinutes - baseMinutes) / interval) + 1;
  
  // Ensure indices are valid
  const validStartIndex = Math.max(0, Math.min(startSlotIndex, totalSlots));
  const validEndIndex = Math.max(0, Math.min(endSlotIndex, totalSlots));
  
  // Calculate top position: each slot is 30px, align to slot start
  const top = validStartIndex * slotHeight;
  
  // Calculate height: number of slots * slot height
  const slotCount = Math.max(1, validEndIndex - validStartIndex);
  const height = slotCount * slotHeight;
  
  // Get course color
  const courseColor = entry.courseIds.length > 0 ? getCourseColor(entry.courseIds[0]) : '#667eea';
  
  // Get teacher names
  const teacherNames = entry.teacherIds.map(id => {
    const teacher = teachers.find(t => t.id === id);
    return teacher ? teacher.name : '';
  }).filter(Boolean).join(', ');
  
  // Calculate student count
  const baseStudents = entry.studentIds ? entry.studentIds.length : 0;
  const dateStr = formatDateISO(date);
  const isHoliday = getHolidaySet().has(dateStr);
  const extraStudents = (timetableEnrollments || []).filter(e => 
    e.timetableEntryId === entry.id && 
    e.date === dateStr && 
    e.type === 'single'
  ).length;
  const totalStudents = baseStudents + extraStudents;
  
  const entryEl = document.createElement('div');
  entryEl.className = `timetable-entry ${duration <= 15 ? 'timetable-entry-small' : ''}${isHoliday ? ' is-holiday' : ''}`;
  entryEl.style.cssText = `
    top: ${top}px;
    height: ${height}px;
    background: ${courseColor};
  `;
  entryEl.setAttribute('data-entry-id', entry.id);
  entryEl.setAttribute('data-date', dateStr);
  entryEl.onmouseenter = () => {
    try {
      entryEl.classList.add('is-expanded');
      entryEl.style.minHeight = `${height}px`;
    } catch (e) {}
  };
  entryEl.onmouseleave = () => {
    try {
      entryEl.classList.remove('is-expanded');
      entryEl.style.minHeight = '';
    } catch (e) {}
  };
  entryEl.onclick = (e) => {
    e.stopPropagation();
    if (!isReadOnly) {
      window.openEditClassModal(entry, dateStr);
    }
  };
  
  let content = `<div class="timetable-entry-class-name">${escapeHtml(entry.className)}</div>`;
  
  if (height >= 30) {
    content += `<div class="timetable-entry-time">${entry.startTime} - ${entry.endTime}</div>`;
  }
  
  if (height >= 45 && teacherNames) {
    content += `<div class="timetable-entry-teacher">${escapeHtml(teacherNames)}</div>`;
    content += `<div class="timetable-entry-count">${totalStudents} students</div>`;
  }
  
  if (height >= 60 && entry.classroom) {
    content += `<div class="timetable-entry-classroom">${escapeHtml(entry.classroom)}</div>`;
  }
  
  if (totalStudents > 0) {
      const s1 = (entry.studentIds || []).map(String);
      const s2 = (timetableEnrollments || []).filter(e => 
        String(e.timetableEntryId) === String(entry.id) && 
        String(e.date) === String(dateStr) && 
        e.type === 'single'
      ).map(e => String(e.studentId));
      const allIds = [...new Set([...s1, ...s2])];
      
      ensureAttendanceLoaded(entry.id, dateStr);
      entryEl.setAttribute('data-students-payload', JSON.stringify({ entryId: entry.id, dateStr, studentIds: allIds }));
      const hoverOnly = height < 75;
      content += `<div class="timetable-entry-students${hoverOnly ? ' hover-only' : ''}"></div>`;
  }
  
  entryEl.innerHTML = content;
  cell.appendChild(entryEl);

  if (totalStudents > 0) {
    try {
      const payload = JSON.parse(entryEl.getAttribute('data-students-payload') || 'null');
      if (payload) {
        const placeholder = entryEl.querySelector('.timetable-entry-students');
        if (placeholder) {
          const listEl = buildStudentsListEl(payload.entryId, payload.dateStr, payload.studentIds);
          if (height < 75) listEl.classList.add('hover-only');
          placeholder.replaceWith(listEl);
        }
      }
    } catch (e) {
      // ignore
    }
  }
}

// Render month view
function renderMonthView() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  // Get first day of month and number of days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();
  
  // Adjust to Monday as first day (0 = Monday, 6 = Sunday)
  const adjustedStartingDay = (startingDayOfWeek + 6) % 7;
  
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const holidaySet = getHolidaySet();
  
  let html = '<div class="timetable-month-view">';
  
  // Header
  html += '<div class="timetable-month-header">';
  days.forEach(day => {
    html += `<div class="timetable-month-header-cell">${day.substring(0, 3)}</div>`;
  });
  html += '</div>';
  
  // Body
  html += '<div class="timetable-month-body">';
  
  // Empty cells for days before month starts
  for (let i = 0; i < adjustedStartingDay; i++) {
    html += '<div class="timetable-month-day-cell"></div>';
  }
  
  // Days of month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dayOfWeek = (date.getDay() + 6) % 7; // Monday = 0
    const dayName = days[dayOfWeek];
    const dateISO = formatDateISO(date);
    const isHoliday = holidaySet.has(dateISO);
    
    html += `<div class="timetable-month-day-cell${isHoliday ? ' is-holiday' : ''}" data-date="${dateISO}" onclick="switchToDayView('${dateISO}')">`;
    html += `<div class="timetable-month-day-number">${day}</div>`;
    html += '<div class="timetable-month-day-entries">';
    
    // Get entries for this day
    const dayEntries = getEntriesForDate(date);
    dayEntries.forEach(entry => {
      const courseColor = entry.courseIds.length > 0 ? getCourseColor(entry.courseIds[0]) : '#667eea';
      html += `<div class="timetable-month-entry${isHoliday ? ' is-holiday' : ''}" style="background: ${courseColor};" data-entry-id="${entry.id}" onclick="event.stopPropagation(); ${!isReadOnly ? `window.openEditClassModal(${JSON.stringify(entry).replace(/"/g, '&quot;')}, '${dateISO}')` : ''}">${escapeHtml(entry.className)}</div>`;
    });
    
    html += '</div>';
    html += '</div>';
  }
  
  html += '</div>';
  html += '</div>';
  
  return html;
}

// Get entries for a specific date
function getEntriesForDate(date) {
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
  const entries = [];
  const dateISO = formatDateISO(date);
  
  timetableEntries.forEach(entry => {
    if (entry.isRecurring) {
      // Recurring entries
      if (entry.dayOfWeek && entry.dayOfWeek.includes(dayName)) {
        // Check exceptions
        if (entry.exceptions && entry.exceptions.includes(dateISO)) return;
        
        // Check date range
        if (entry.startDate && entry.startDate > dateISO) return;
        if (entry.endDate && entry.endDate < dateISO) return;

        entries.push(entry);
      }
    } else {
      // One-time entries
      const entryDate = new Date(entry.date);
      if (isSameDate(entryDate, date)) {
        entries.push(entry);
      }
    }
  });
  
  return entries;
}

// Switch to day view with specific date
window.switchToDayView = function(dateString) {
  currentDate = new Date(dateString);
  currentView = 'day';
  switchTimetableView('day');
};

window.openCreateClassModal = function() {
  openEditClassModal(null);
};

window.openEditClassModal = async function(entry, dateStr) {
  console.log('[Debug] Opening Edit Class Modal', { entry, dateStr });
  
  // Store date for attendance saving
  window.currentEditingDate = dateStr;
  
  // Load Attendance if date provided
  let currentAttendance = [];
  if (entry && dateStr) {
      try {
          const response = await window.authUtils.authenticatedFetch(`/attendance?timetableEntryId=${entry.id}&date=${dateStr}`);
          if (response.ok) {
              currentAttendance = await response.json();
          }
      } catch(e) { console.error('Error loading attendance:', e); }
  }
  
  // Ensure teachers are loaded
  if (!teachers || teachers.length === 0) {
      console.log('[Debug] Teachers list empty, reloading...');
      await loadTimetableTeachers();
      console.log('[Debug] Teachers loaded:', teachers.length);
  }

  console.log('[Debug] Entry Data:', entry);
  console.log('[Debug] Window Students:', window.students);

  // Remove existing modal if any
  const existingModal = document.getElementById('editClassModal');
  if (existingModal) {
    existingModal.remove();
  }

  const isEdit = entry !== null;
  const entryData = entry || {
    className: '',
    startTime: '08:00',
    endTime: '09:00',
    isRecurring: false,
    dayOfWeek: [],
    date: '',
    courseIds: [],
    teacherIds: [],
    classroom: '',
    studentIds: []
  };

  // Format date for input (YYYY-MM-DD)
  let dateValue = '';
  if (entryData.date) {
    const date = new Date(entryData.date);
    if (!isNaN(date.getTime())) {
      dateValue = date.toISOString().split('T')[0];
    }
  }

  // Format start/end dates for recurring input
  let startDateValue = '';
  if (entryData.startDate) {
    const sDate = new Date(entryData.startDate);
    if (!isNaN(sDate.getTime())) {
      startDateValue = sDate.toISOString().split('T')[0];
    }
  }
  
  let endDateValue = '';
  if (entryData.endDate) {
    const eDate = new Date(entryData.endDate);
    if (!isNaN(eDate.getTime())) {
      endDateValue = eDate.toISOString().split('T')[0];
    }
  }

  // Generate time options (15-minute intervals from 08:00 to 20:00)
  const timeOptions = generateTimeOptions();
  const timeParts = (t) => {
    const [h, m] = String(t || '00:00').split(':').map(Number);
    return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
  };
  const startParts = timeParts(entryData.startTime || '08:00');
  const endParts = timeParts(entryData.endTime || '09:00');
  const hourOptions = Array.from({ length: 19 }, (_, i) => i + 5); // 05..23
  const minuteOptions = [0, 15, 30, 45];
  const formatHM = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const toMinutes = (h, m) => Number(h) * 60 + Number(m);
  const durationOptions = Array.from({ length: 32 }, (_, i) => (i + 1) * 15); // 15..480
  const initialDurationMin = Math.max(15, toMinutes(endParts.h, endParts.m) - toMinutes(startParts.h, startParts.m));
  const initialDuration = durationOptions.includes(initialDurationMin) ? initialDurationMin : 60;

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'editClassModal';
  modal.className = 'edit-class-modal';
  modal.innerHTML = `
    <div class="edit-class-modal-content">
      <div class="edit-class-modal-header">
        <h2>${isEdit ? 'Edit Class' : 'Create New Class'}</h2>
      </div>
      <div class="edit-class-modal-body">
        <form id="editClassForm" onsubmit="saveClassEntry(event, ${isEdit ? `'${entry.id}'` : 'null'})">
          <div class="form-row">
            <div class="edit-class-form-group">
              <label for="editClassName">Class Name <span style="color: #ef4444;">*</span></label>
              <input type="text" id="editClassName" list="classNamesList" value="${escapeHtml(entryData.className)}" required maxlength="50">
              <datalist id="classNamesList">
                ${timetableMetadata.classNames.map(name => `<option value="${escapeHtml(name)}">`).join('')}
              </datalist>
              <div class="error-message" id="errorClassName"></div>
            </div>
            <div class="edit-class-form-group">
              <label for="editClassClassroom">Classroom</label>
              <input type="text" id="editClassClassroom" list="classroomsList" value="${escapeHtml(entryData.classroom || '')}" maxlength="50">
              <datalist id="classroomsList">
                ${timetableMetadata.classrooms.map(room => `<option value="${escapeHtml(room)}">`).join('')}
              </datalist>
              <div class="error-message" id="errorClassroom"></div>
            </div>
          </div>
          <div class="form-row cm-time-row">
            <div class="edit-class-form-group">
              <label for="editClassStartTime">Start Time <span style="color: #ef4444;">*</span></label>
              <div class="cm-time-inline">
                <select id="editClassStartHour" required onchange="onTimetableTimeChanged('start')">
                  ${hourOptions.map(h => `<option value="${h}" ${h === startParts.h ? 'selected' : ''}>${String(h).padStart(2, '0')}</option>`).join('')}
              </select>
                <span class="cm-time-sep">:</span>
                <select id="editClassStartMin" required onchange="onTimetableTimeChanged('start')">
                  ${minuteOptions.map(m => `<option value="${m}" ${m === startParts.m ? 'selected' : ''}>${String(m).padStart(2, '0')}</option>`).join('')}
                </select>
              </div>
              <div class="error-message" id="errorStartTime"></div>
            </div>
            <div class="edit-class-form-group">
              <label for="editClassDuration">Duration</label>
              <select id="editClassDuration" onchange="onTimetableDurationChanged()">
                ${durationOptions.map(d => {
                  const h = Math.floor(d / 60);
                  const m = d % 60;
                  const label = h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
                  return `<option value="${d}" ${d === initialDuration ? 'selected' : ''}>${label}</option>`;
                }).join('')}
              </select>
              <div class="error-message" id="errorDuration"></div>
            </div>
            <div class="edit-class-form-group">
              <label for="editClassEndTime">End Time <span style="color: #ef4444;">*</span></label>
              <div class="cm-time-inline">
                <select id="editClassEndHour" required onchange="onTimetableTimeChanged('end')">
                  ${hourOptions.map(h => `<option value="${h}" ${h === endParts.h ? 'selected' : ''}>${String(h).padStart(2, '0')}</option>`).join('')}
              </select>
                <span class="cm-time-sep">:</span>
                <select id="editClassEndMin" required onchange="onTimetableTimeChanged('end')">
                  ${minuteOptions.map(m => `<option value="${m}" ${m === endParts.m ? 'selected' : ''}>${String(m).padStart(2, '0')}</option>`).join('')}
                </select>
              </div>
              <div class="error-message" id="errorEndTime"></div>
            </div>
          </div>
          <div class="form-row">
            <div class="edit-class-form-group">
              <label for="editClassIsRecurring">Repeat</label>
              <select id="editClassIsRecurring" onchange="toggleRecurringOptions()">
                <option value="false" ${!entryData.isRecurring ? 'selected' : ''}>No Repeat</option>
                <option value="true" ${entryData.isRecurring ? 'selected' : ''}>Weekly Repeat</option>
              </select>
              <div class="error-message" id="errorIsRecurring"></div>
            </div>
            <div class="edit-class-form-group" id="recurringOptionsGroup" style="display: ${entryData.isRecurring ? 'block' : 'none'};">
              <label>Days of Week</label>
              <div class="day-selector" id="daySelector">
                ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => `
                  <div class="day-selector-tag ${entryData.dayOfWeek && entryData.dayOfWeek.includes(day) ? 'selected' : ''}" 
                       data-day="${day}" onclick="toggleDaySelection(this)">
                    ${day}
                  </div>
                `).join('')}
              </div>
              <div class="error-message" id="errorDayOfWeek"></div>
              
              <div style="display: flex; gap: 15px; margin-top: 15px;">
                <div style="flex: 1;">
                  <label for="editClassStartDate" style="font-size: 14px; margin-bottom: 5px; display: block;">Start Date (Optional)</label>
                  <input type="date" id="editClassStartDate" value="${startDateValue}" style="width: 100%; padding: 8px; border: 1px solid #e5e7eb; border-radius: 6px;">
                </div>
                <div style="flex: 1;">
                  <label for="editClassEndDate" style="font-size: 14px; margin-bottom: 5px; display: block;">End Date (Optional)</label>
                  <input type="date" id="editClassEndDate" value="${endDateValue}" style="width: 100%; padding: 8px; border: 1px solid #e5e7eb; border-radius: 6px;">
                </div>
              </div>
              <div class="error-message" id="errorDateRange"></div>
            </div>
            <div class="edit-class-form-group" id="dateOptionsGroup" style="display: ${!entryData.isRecurring ? 'block' : 'none'};">
              <label for="editClassDate">Date</label>
              <input type="date" id="editClassDate" value="${dateValue}">
              <div class="error-message" id="errorDate"></div>
            </div>
          </div>
          <div class="edit-class-form-group">
            <label>Courses</label>
            <div class="tag-selector-container" id="courseSelector">
              <input type="text" class="tag-selector-search" id="courseSearch" placeholder="Search courses..." oninput="filterCourseOptions()">
              <div class="tag-selector-tags" id="selectedCourses">
                ${entryData.courseIds.map(courseId => {
                  const course = (window.courses || []).find(c => c.id === courseId);
                  if (!course) return '';
                  return `<div class="tag-selector-tag">
                    ${escapeHtml(course.name)}
                    <span class="tag-selector-tag-remove" onclick="removeCourseTag('${courseId}')">×</span>
                  </div>`;
                }).join('')}
              </div>
              <div class="tag-selector-options" id="courseOptions">
                ${(window.courses || []).map(course => `
                  <div class="tag-selector-option ${entryData.courseIds.includes(course.id) ? 'selected' : ''}" 
                       data-course-id="${course.id}" 
                       onclick="toggleCourseSelection('${course.id}')">
                    ${escapeHtml(course.name)}
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
          <div class="edit-class-form-group">
            <label>Teachers</label>
            <div class="tag-selector-container" id="teacherSelector">
              <input type="text" class="tag-selector-search" id="teacherSearch" placeholder="Search teachers..." oninput="filterTeacherOptions()">
              <div class="tag-selector-tags" id="selectedTeachers">
                ${entryData.teacherIds.map(teacherId => {
                  const teacher = teachers.find(t => t.id === teacherId);
                  if (!teacher) return '';
                  return `<div class="tag-selector-tag">
                    ${escapeHtml(teacher.name)}
                    <span class="tag-selector-tag-remove" onclick="removeTeacherTag('${teacherId}')">×</span>
                  </div>`;
                }).join('')}
              </div>
              <div class="tag-selector-options" id="teacherOptions">
                ${teachers.map(teacher => `
                  <div class="tag-selector-option ${entryData.teacherIds.includes(teacher.id) ? 'selected' : ''}" 
                       data-teacher-id="${teacher.id}" 
                       onclick="toggleTeacherSelection('${teacher.id}')">
                    ${escapeHtml(teacher.name)}
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
          <div class="edit-class-form-group">
            ${(() => {
              const linkedEnrollments = (timetableEnrollments || []).filter(e => e.timetableEntryId === entryData.id);
              // Filter enrollments for this specific date if dateStr exists
              const activeEnrollments = dateStr 
                 ? linkedEnrollments.filter(e => e.date === dateStr)
                 : linkedEnrollments;
                 
              const linkedStudentIds = [...new Set(activeEnrollments.filter(e => e.type === 'single').map(e => e.studentId))];
              
              // Get excluded students for this date
              const excludedStudentIds = dateStr
                 ? linkedEnrollments.filter(e => e.date === dateStr && e.type === 'exclusion').map(e => e.studentId)
                 : [];
                 
              const seriesStudentIds = (entryData.studentIds || []).map(String);
              const linkedStudentIdsStr = linkedStudentIds.map(String);
              const excludedStudentIdsStr = excludedStudentIds.map(String);
              
              const allStudentIds = [...new Set([...seriesStudentIds, ...linkedStudentIdsStr])]
                  .filter(id => !excludedStudentIdsStr.includes(id));
              
              return `
              <div style="display:flex; justify-content:space-between; align-items:center;">
                  <label>Enrolled Students (${allStudentIds.length})</label>
                  ${dateStr ? `<span style="font-size:12px; color:#667eea; font-weight:bold;">Attendance: ${dateStr}</span>` : ''}
              </div>
              <div class="enrolled-students-list" style="border: 1px solid #e0e0e0; border-radius: 6px; max-height: 150px; overflow-y: auto;">
                ${allStudentIds.map(studentId => {
                  const student = (window.students || []).find(s => s.id === studentId);
                  const name = student ? escapeHtml(student.name) : 'Unknown Student';
                  const dispId = student ? escapeHtml(student.chessComId || '') : studentId;
                  const isSeries = seriesStudentIds.includes(studentId);
                  
                  let attHtml = '';
                  if (dateStr) {
                      const att = currentAttendance.find(r => r.studentId === studentId);
                      const status = att ? att.status : '';
                      attHtml = `
                      <div class="attendance-controls" style="margin-left:auto;">
                          <select name="att_${studentId}" style="padding:2px 5px; border-radius:4px; border:1px solid #ccc; font-size:12px;">
                              <option value="unmarked" ${!status || status==='unmarked'?'selected':''}>Select Status</option>
                              <option value="present" ${status==='present'?'selected':''}>Present</option>
                              <option value="absent" ${status==='absent'?'selected':''}>Absent</option>
                              <option value="late" ${status==='late'?'selected':''}>Late</option>
                          </select>
                      </div>`;
                  }
                  
                  const showMakeupBtn = dateStr && (!status || status === 'unmarked' || status === 'absent');
                  return `<div style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 14px; display: flex; justify-content: space-between; align-items: center; gap:10px;">
                    <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                      <div style="min-width:0;">
                          <strong>${name}</strong> <span style="color:#666;">(${dispId})</span>
                          ${!isSeries ? '<span style="font-size:11px; color:#999; margin-left:5px; background:#f3f4f6; padding:2px 6px; border-radius:4px;">Session</span>' : ''}
                      </div>
                      ${attHtml}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                      ${showMakeupBtn ? `<button type="button" class="makeup-action-btn" title="Make up / Postpone" onclick="event.stopPropagation(); openMakeupPopup('${studentId}', '${entryData.id}', '${dateStr}')">⋯</button>` : ''}
                      ${isSeries ? `<span style="cursor:pointer; color:#ef4444; font-weight:bold;" onclick="removeStudentTag('${studentId}')">×</span>` : ''}
                    </div>
                  </div>`;
                }).join('') || '<div style="padding: 15px; text-align: center; color: #999; font-style: italic;">No enrolled students</div>'}
              </div>`;
            })()}
          </div>
          <div class="edit-class-modal-actions">
            ${isEdit ? `<button type="button" class="btn btn-danger" onclick="deleteClassEntry('${entry.id}', '${dateStr || ''}')">Delete</button>` : ''}
            <button type="button" class="btn btn-secondary" onclick="closeEditClassModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Show modal
  setTimeout(() => {
    modal.classList.add('show');
  }, 10);

  // Initialize duration/end-time sync
  setTimeout(() => {
    try {
      window.onTimetableDurationChanged && window.onTimetableDurationChanged(true);
    } catch (e) {}
  }, 30);
  
  // Store selected courses and teachers
  window.selectedCourseIds = new Set(entryData.courseIds || []);
  window.selectedTeacherIds = new Set(entryData.teacherIds || []);
  window.selectedDays = new Set(entryData.dayOfWeek || []);
  window.currentClassStudentIds = entryData.studentIds || []; // Store current students
};

// Generate time options
function generateTimeOptions() {
  const options = [];
  // 15-minute intervals from 05:00 to 23:45
  for (let hour = 5; hour <= 23; hour++) {
    for (let min = 0; min < 60; min += 15) {
      options.push(`${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
    }
  }
  return options;
}

function clampToLastQuarterHour(totalMinutes) {
  const min = Math.max(5 * 60, Math.min(totalMinutes, 23 * 60 + 45));
  const snapped = Math.round(min / 15) * 15;
  return Math.max(5 * 60, Math.min(snapped, 23 * 60 + 45));
}

function getTimeFromSplit(prefix) {
  const hEl = document.getElementById(`editClass${prefix}Hour`);
  const mEl = document.getElementById(`editClass${prefix}Min`);
  if (hEl && mEl) {
    const h = Number(hEl.value);
    const m = Number(mEl.value);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const legacy = document.getElementById(`editClass${prefix}Time`);
  return legacy ? legacy.value : '08:00';
}

function setTimeToSplit(prefix, timeStr) {
  const hEl = document.getElementById(`editClass${prefix}Hour`);
  const mEl = document.getElementById(`editClass${prefix}Min`);
  if (!hEl || !mEl) return;
  const [hh, mm] = String(timeStr || '08:00').split(':').map(Number);
  if (Number.isFinite(hh)) hEl.value = String(hh);
  if (Number.isFinite(mm)) mEl.value = String(mm);
}

function minutesFromTimeStr(t) {
  const [h, m] = String(t || '00:00').split(':').map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

// Keep End Time in sync with Start + Duration, and keep Duration in sync when End is edited.
window.onTimetableDurationChanged = function(isInit = false) {
  const start = getTimeFromSplit('Start');
  const durEl = document.getElementById('editClassDuration');
  const d = Number(durEl?.value || 60);
  const startMin = minutesFromTimeStr(start);
  const endMin = clampToLastQuarterHour(startMin + d);
  const hh = Math.floor(endMin / 60);
  const mm = endMin % 60;
  setTimeToSplit('End', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);

  if (!isInit) {
    // clear end-time errors
    const err = document.getElementById('errorEndTime');
    if (err) err.textContent = '';
  }
};

window.onTimetableTimeChanged = function(which) {
  const start = getTimeFromSplit('Start');
  const end = getTimeFromSplit('End');
  const startMin = minutesFromTimeStr(start);
  const endMin = minutesFromTimeStr(end);

  const durEl = document.getElementById('editClassDuration');
  if (which === 'start') {
    // Move end according to duration
    window.onTimetableDurationChanged(false);
    return;
  }

  // which === 'end': update duration if valid, otherwise auto-fix end = start + 60m
  if (endMin <= startMin) {
    if (durEl) durEl.value = '60';
    window.onTimetableDurationChanged(false);
    return;
  }
  const diff = endMin - startMin;
  const snapped = Math.round(diff / 15) * 15;
  if (durEl) durEl.value = String(Math.max(15, Math.min(snapped, 480)));
};

// Toggle recurring options
window.toggleRecurringOptions = function() {
  const isRecurring = document.getElementById('editClassIsRecurring').value === 'true';
  document.getElementById('recurringOptionsGroup').style.display = isRecurring ? 'block' : 'none';
  document.getElementById('dateOptionsGroup').style.display = isRecurring ? 'none' : 'block';
};

// Toggle day selection
window.toggleDaySelection = function(element) {
  const day = element.getAttribute('data-day');
  if (window.selectedDays.has(day)) {
    window.selectedDays.delete(day);
    element.classList.remove('selected');
  } else {
    window.selectedDays.add(day);
    element.classList.add('selected');
  }
};

// Toggle course selection
window.toggleCourseSelection = function(courseId) {
  if (!window.selectedCourseIds) {
    window.selectedCourseIds = new Set();
  }
  
  const option = document.querySelector(`#courseOptions [data-course-id="${courseId}"]`);
  if (!option) return;
  
  if (window.selectedCourseIds.has(courseId)) {
    window.selectedCourseIds.delete(courseId);
    option.classList.remove('selected');
    removeCourseTag(courseId);
  } else {
    window.selectedCourseIds.add(courseId);
    option.classList.add('selected');
    addCourseTag(courseId);
  }
};

// Add course tag
function addCourseTag(courseId) {
  const course = (window.courses || []).find(c => c.id === courseId);
  if (!course) return;
  
  const container = document.getElementById('selectedCourses');
  if (container.querySelector(`[data-course-id="${courseId}"]`)) return; // Already added
  
  const tag = document.createElement('div');
  tag.className = 'tag-selector-tag';
  tag.setAttribute('data-course-id', courseId);
  tag.innerHTML = `
    ${escapeHtml(course.name)}
    <span class="tag-selector-tag-remove" onclick="removeCourseTag('${courseId}')">×</span>
  `;
  container.appendChild(tag);
}

// Remove course tag
window.removeCourseTag = function(courseId) {
  if (!window.selectedCourseIds) {
    window.selectedCourseIds = new Set();
  }
  window.selectedCourseIds.delete(courseId);
  
  const tag = document.getElementById('selectedCourses').querySelector(`[data-course-id="${courseId}"]`);
  if (tag) tag.remove();
  
  const option = document.querySelector(`#courseOptions [data-course-id="${courseId}"]`);
  if (option) option.classList.remove('selected');
};

// Filter course options
window.filterCourseOptions = function() {
  const search = document.getElementById('courseSearch').value.toLowerCase();
  const options = document.querySelectorAll('#courseOptions .tag-selector-option');
  options.forEach(option => {
    const text = option.textContent.toLowerCase();
    option.style.display = text.includes(search) ? 'block' : 'none';
  });
};

// Toggle teacher selection
window.toggleTeacherSelection = function(teacherId) {
  if (!window.selectedTeacherIds) {
    window.selectedTeacherIds = new Set();
  }
  
  const option = document.querySelector(`#teacherOptions [data-teacher-id="${teacherId}"]`);
  if (!option) return;
  
  if (window.selectedTeacherIds.has(teacherId)) {
    window.selectedTeacherIds.delete(teacherId);
    option.classList.remove('selected');
    removeTeacherTag(teacherId);
  } else {
    window.selectedTeacherIds.add(teacherId);
    option.classList.add('selected');
    addTeacherTag(teacherId);
  }
};

// Add teacher tag
function addTeacherTag(teacherId) {
  const teacher = teachers.find(t => t.id === teacherId);
  if (!teacher) return;
  
  const container = document.getElementById('selectedTeachers');
  if (container.querySelector(`[data-teacher-id="${teacherId}"]`)) return; // Already added
  
  const tag = document.createElement('div');
  tag.className = 'tag-selector-tag';
  tag.setAttribute('data-teacher-id', teacherId);
  tag.innerHTML = `
    ${escapeHtml(teacher.name)}
    <span class="tag-selector-tag-remove" onclick="removeTeacherTag('${teacherId}')">×</span>
  `;
  container.appendChild(tag);
}

// Remove teacher tag
window.removeTeacherTag = function(teacherId) {
  if (!window.selectedTeacherIds) {
    window.selectedTeacherIds = new Set();
  }
  window.selectedTeacherIds.delete(teacherId);
  
  const tag = document.getElementById('selectedTeachers').querySelector(`[data-teacher-id="${teacherId}"]`);
  if (tag) tag.remove();
  
  const option = document.querySelector(`#teacherOptions [data-teacher-id="${teacherId}"]`);
  if (option) option.classList.remove('selected');
};

// Filter teacher options
window.filterTeacherOptions = function() {
  const search = document.getElementById('teacherSearch').value.toLowerCase();
  const options = document.querySelectorAll('#teacherOptions .tag-selector-option');
  options.forEach(option => {
    const text = option.textContent.toLowerCase();
    option.style.display = text.includes(search) ? 'block' : 'none';
  });
};

// Close Edit Class Modal
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
  makeupContext = { studentId, studentName: name, entryId, dateStr };

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
  if (!makeupContext.studentId) {
    closeMakeupPopup();
    return;
  }
  closeMakeupPopup();
  makeupFlowState = {
    active: true,
    studentId: makeupContext.studentId,
    fromEntryId: makeupContext.entryId,
    fromDate: makeupContext.dateStr,
    studentName: makeupContext.studentName
  };

  // Close edit modal to allow interaction with timetable, but preserve makeup flow
  closeEditClassModal(true);

  document.body.classList.add('makeup-mode-active');
  const banner = document.getElementById('makeupModeBanner');
  if (banner) {
    const text = banner.querySelector('#makeupModeText');
    if (text) text.textContent = `Select a class for ${makeupContext.studentName} to make up`;
    banner.style.display = 'flex';
  }
  if (window.showToast) window.showToast('Make-up mode: click a class slot to assign.', 'info');
};

window.cancelMakeupFlow = function() {
  makeupFlowState = { active: false, studentId: null, fromEntryId: null, fromDate: null, studentName: '' };
  document.body.classList.remove('makeup-mode-active');
  const banner = document.getElementById('makeupModeBanner');
  if (banner) banner.style.display = 'none';
};

function handleMakeupTargetSelect(entry, dateStr) {
  if (!makeupFlowState.active) return;

  performMakeupAssignment({
    studentId: makeupFlowState.studentId,
    fromEntryId: makeupFlowState.fromEntryId,
    fromDate: makeupFlowState.fromDate,
    toEntryId: entry.id,
    toDate: dateStr,
    studentName: makeupFlowState.studentName
  });
}

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
  if (!makeupContext.studentId) {
    closeMakeupPopup();
    return;
  }
  closeMakeupPopup();
  await postponeEnrollment(makeupContext);
};

window.handleCancelLessonSelection = async function() {
  if (!makeupContext.studentId) {
    closeMakeupPopup();
    return;
  }
  if (!confirm('Cancel this lesson? If it was paid, the fee will be returned as credit.')) return;
  closeMakeupPopup();
  await cancelEnrollmentWithRefund(makeupContext);
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
      const amt = Number(r.refundAmount || 0) || 0;
      if (window.showToast) {
        window.showToast(amt > 0 ? `Cancelled. Refunded $${amt.toFixed(2)} credit.` : 'Cancelled.', 'success');
      } else {
        alert(amt > 0 ? `Cancelled. Refunded $${amt.toFixed(2)} credit.` : 'Cancelled.');
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
  let startDate = null;
  let endDate = null;
  if (isRecurring) {
    startDate = document.getElementById('editClassStartDate').value || null;
    endDate = document.getElementById('editClassEndDate').value || null;
  }

  const courseIds = Array.from(window.selectedCourseIds || []);
  const teacherIds = Array.from(window.selectedTeacherIds || []);
  const studentIds = window.currentClassStudentIds || [];

  // Validation
  let hasError = false;

  if (!className) {
    showClassFieldError('editClassName', 'Class name is required');
    hasError = true;
  }

  if (className.length > 50) {
    showClassFieldError('editClassName', 'Class name must be 50 characters or less');
    hasError = true;
  }

  if (classroom && classroom.length > 50) {
    showClassFieldError('editClassClassroom', 'Classroom name must be 50 characters or less');
    hasError = true;
  }

  // Validate start time is before end time
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  if (startMinutes >= endMinutes) {
    showClassFieldError(document.getElementById('editClassEndHour') ? 'editClassEndHour' : 'editClassEndTime', 'End time must be after start time');
    hasError = true;
  }

  if (isRecurring) {
    if (!dayOfWeek || dayOfWeek.length === 0) {
      showClassFieldError('errorDayOfWeek', 'Please select at least one day of week');
      hasError = true;
    }
    
    if (startDate && endDate) {
      if (new Date(startDate) > new Date(endDate)) {
        showClassFieldError('errorDateRange', 'Start date cannot be after end date');
        hasError = true;
      }
    }
  } else {
    if (!date) {
      showClassFieldError('editClassDate', 'Date is required for non-recurring classes');
      hasError = true;
    }
  }

  if (hasError) {
    if (window.showToast) {
      window.showToast('Please fix the errors in the form', 'error');
    } else {
      alert('Please fix the errors in the form');
    }
    return;
  }

  // Prepare data
  const data = {
    className,
    startTime,
    endTime,
    isRecurring,
    dayOfWeek,
    date,
    startDate,
    endDate,
    courseIds,
    teacherIds,
    classroom,
    studentIds
  };

  try {
    const endpoint = entryId 
      ? `/organizations/timetable/${entryId}`
      : '/organizations/timetable';
    const method = entryId ? 'PUT' : 'POST';
    
    const response = await window.authUtils.authenticatedFetch(endpoint, {
      method,
      body: JSON.stringify(data)
    });

    if (!response) return;

    if (!response.ok) {
      const errorData = await response.json();
      if (errorData.error) {
        if (window.showToast) {
          window.showToast(errorData.error, 'error');
        } else {
          alert(errorData.error);
        }
        return;
      }
      throw new Error(errorData.error || 'Failed to save class entry');
    }

    const savedEntry = await response.json();

    // Save Attendance if date is present (Instance Edit)
    if (window.currentEditingDate) {
        const targetId = entryId ? entryId : savedEntry.id;
        const attendanceRecords = [];
        const selects = document.querySelectorAll('select[name^="att_"]');
        selects.forEach(s => {
            const studentId = s.name.replace('att_', '');
            if (s.value !== 'unmarked') {
                attendanceRecords.push({ studentId, status: s.value });
            }
        });
        
        if (attendanceRecords.length > 0) {
             await window.authUtils.authenticatedFetch('/attendance', {
                  method: 'POST',
                  body: JSON.stringify({
                      timetableEntryId: targetId,
                      date: window.currentEditingDate,
                      records: attendanceRecords
                  })
             });
        }
    }

    if (window.showToast) {
      window.showToast(entryId ? 'Class updated successfully!' : 'Class created successfully!', 'success');
    } else {
      alert(entryId ? 'Class updated successfully!' : 'Class created successfully!');
    }
    
    closeEditClassModal();
    loadTimetableData();
  } catch (error) {
    console.error('Error saving class entry:', error);
    if (window.showToast) {
      window.showToast('Error: ' + error.message, 'error');
    } else {
      alert('Error: ' + error.message);
    }
  }
};

// Delete class entry logic
window.deleteClassEntry = async function(entryId, dateStr) {
  const entry = (window.timetableEntries || []).find(e => e.id === entryId);
  
  if (entry && entry.isRecurring && dateStr) {
      const modal = document.createElement('div');
      modal.className = 'modal show';
      modal.style.zIndex = '10002'; // Ensure it's above edit modal
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h2>Delete Recurring Class</h2>
                <span class="modal-close" onclick="this.closest('.modal').remove()">&times;</span>
            </div>
            <div class="modal-body">
                <p>This is a recurring class (${dateStr}). How do you want to delete?</p>
                <div style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
                    <button class="btn btn-secondary" style="text-align:left;" onclick="window.confirmDeleteInstance('${entryId}', '${dateStr}', 'single', this)">
                        <strong>Delete This Session Only</strong><br>
                        <span style="font-size:0.8rem">Remove only this specific class instance.</span>
                    </button>
                    <button class="btn btn-warning" style="text-align:left;" onclick="window.confirmDeleteInstance('${entryId}', '${dateStr}', 'future', this)">
                        <strong>Delete This and Future Sessions</strong><br>
                        <span style="font-size:0.8rem">End the series here. Future classes will be removed.</span>
                    </button>
                    <button class="btn btn-danger" style="text-align:left;" onclick="window.confirmDeleteInstance('${entryId}', '${dateStr}', 'series', this)">
                        <strong>Delete Entire Series</strong><br>
                        <span style="font-size:0.8rem">Remove the class and all its history.</span>
                    </button>
                </div>
            </div>
        </div>
      `;
      document.body.appendChild(modal);
      return;
  }

  if (!confirm('Are you sure you want to delete this class? This action cannot be undone.')) {
    return;
  }
  await performDeleteSeries(entryId);
};

window.confirmDeleteInstance = async function(entryId, dateStr, mode, btn) {
    btn.closest('.modal').remove();
    
    if (mode === 'series') {
        await performDeleteSeries(entryId);
    } else {
        try {
            const response = await window.authUtils.authenticatedFetch(`/organizations/timetable/${entryId}/delete-instance`, {
                method: 'POST',
                body: JSON.stringify({ date: dateStr, mode })
            });
            
            if (response.ok) {
                if (window.showToast) window.showToast('Class deleted successfully', 'success');
                else alert('Class deleted successfully');
                closeEditClassModal();
                loadTimetableData();
            } else {
                alert('Failed to delete class');
            }
        } catch(e) { console.error(e); alert('Error deleting class'); }
    }
};

async function performDeleteSeries(entryId) {
  try {
    const response = await window.authUtils.authenticatedFetch(`/organizations/timetable/${entryId}`, {
      method: 'DELETE'
    });

    if (!response) return;

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete class entry');
    }

    if (window.showToast) {
      window.showToast('Class deleted successfully!', 'success');
    } else {
      alert('Class deleted successfully!');
    }
    
    closeEditClassModal();
    loadTimetableData();
  } catch (error) {
    console.error('Error deleting class entry:', error);
    if (window.showToast) {
      window.showToast('Error: ' + error.message, 'error');
    } else {
      alert('Error: ' + error.message);
    }
  }
}

// Show class field error
function showClassFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (field) {
    const formGroup = field.closest('.edit-class-form-group');
    if (formGroup) {
      formGroup.classList.add('has-error');
      const errorElement = formGroup.querySelector('.error-message');
      if (errorElement) {
        errorElement.textContent = message;
      }
    }
  } else {
    // For error messages without direct field (like dayOfWeek)
    const errorElement = document.getElementById(fieldId);
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
      errorElement.style.color = '#ef4444';
    }
  }
}

