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
    if (window.makeupFlowState.active) {
      window.handleMakeupTargetSelect(entry, dateStr);
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

