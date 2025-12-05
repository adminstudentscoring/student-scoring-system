// Timetable Management Module
// Handles timetable functionality for organizations and teachers

// State
let timetableEntries = [];
let timetableEnrollments = [];
let timetableMetadata = { classNames: [], classrooms: [] };
// Note: courses variable is shared from course-management.js
let teachers = [];
let currentView = 'week'; // 'day', 'week', 'month'
let currentDate = new Date();
let isReadOnly = false; // For teacher view

// Initialize timetable management
window.loadTimetableManagement = function(userRole = 'organization') {
  isReadOnly = userRole === 'teacher';
  loadTimetableData();
  loadTimetableCourses();
  loadTimetableTeachers();
};

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
  
  // Only show first 18 time slots (08:00 to 12:30)
  const visibleTimeSlots = allTimeSlots.slice(0, 18);
  
  // Get current week dates
  const weekDates = getWeekDates(currentDate);
  
  let html = '<div class="timetable-week-view">';
  
  // Header
  html += '<div class="timetable-week-header">';
  html += '<div class="timetable-week-header-cell timetable-week-time-col">Time</div>';
  days.forEach((day, index) => {
    const date = weekDates[index];
    html += `<div class="timetable-week-header-cell">${day}<br><small>${formatDate(date)}</small></div>`;
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
      html += `<div class="timetable-week-day-cell" data-time="${timeSlot}" data-day="${day}" data-date="${formatDateISO(date)}"></div>`;
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
  
  // Calculate target time
  let targetTimeMinutes = currentTimeMinutes;
  
  // If current time is before 08:00, scroll to start
  if (currentTimeMinutes < 8 * 60) {
    targetTimeMinutes = 8 * 60;
  }
  // If current time is after 20:00, scroll to end
  else if (currentTimeMinutes > 20 * 60) {
    targetTimeMinutes = 20 * 60;
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
  const slotHeight = 30; // 30px per 15 minutes
  const baseMinutes = 8 * 60; // 08:00 in minutes (480)
  
  // Calculate slot index: round to nearest 15-minute slot
  const startSlotIndex = Math.round((startTotalMinutes - baseMinutes) / 15);
  const endSlotIndex = Math.round((endTotalMinutes - baseMinutes) / 15);
  
  // Ensure indices are valid
  const validStartIndex = Math.max(0, Math.min(startSlotIndex, 52)); // Max index for 20:45
  const validEndIndex = Math.max(0, Math.min(endSlotIndex, 52));
  
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
  const extraStudents = (timetableEnrollments || []).filter(e => 
    e.timetableEntryId === entry.id && 
    e.date === dateStr && 
    e.type === 'single'
  ).length;
  const totalStudents = baseStudents + extraStudents;
  
  const entryEl = document.createElement('div');
  entryEl.className = `timetable-entry ${duration <= 15 ? 'timetable-entry-small' : ''}`;
  entryEl.style.cssText = `
    top: ${top}px;
    height: ${height}px;
    background: ${courseColor};
  `;
  entryEl.setAttribute('data-entry-id', entry.id);
  entryEl.onclick = (e) => {
    e.stopPropagation();
    if (!isReadOnly) {
      window.openEditClassModal(entry);
    }
  };
  
  let content = `<div class="timetable-entry-class-name">${escapeHtml(entry.className)}</div>`;
  
  if (height >= 30) {
    content += `<div class="timetable-entry-time">${entry.startTime} - ${entry.endTime}</div>`;
  }
  
  if (height >= 45 && teacherNames) {
    content += `<div class="timetable-entry-teacher">${escapeHtml(teacherNames)}</div>`;
  }
  
  if (height >= 60 && entry.classroom) {
    content += `<div class="timetable-entry-classroom">${escapeHtml(entry.classroom)}</div>`;
  }
  
  if (height >= 75 && totalStudents > 0) {
    content += `<div class="timetable-entry-students">${totalStudents} student(s)</div>`;
  }
  
  entryEl.innerHTML = content;
  cell.appendChild(entryEl);
}

// Helper functions
function generateTimeSlots() {
  const slots = [];
  for (let hour = 8; hour <= 20; hour++) {
    for (let min = 0; min < 60; min += 15) {
      slots.push(`${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
    }
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
  
  let html = '<div class="timetable-day-view">';
  
  // Header
  html += `<div class="timetable-day-header">${dayName} - ${formatDate(date)}</div>`;
  
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
  const slotHeight = 30; // 30px per 15 minutes
  const baseMinutes = 8 * 60; // 08:00 in minutes (480)
  
  // Calculate slot index: round to nearest 15-minute slot
  const startSlotIndex = Math.round((startTotalMinutes - baseMinutes) / 15);
  const endSlotIndex = Math.round((endTotalMinutes - baseMinutes) / 15);
  
  // Ensure indices are valid
  const validStartIndex = Math.max(0, Math.min(startSlotIndex, 52)); // Max index for 20:45
  const validEndIndex = Math.max(0, Math.min(endSlotIndex, 52));
  
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
  const extraStudents = (timetableEnrollments || []).filter(e => 
    e.timetableEntryId === entry.id && 
    e.date === dateStr && 
    e.type === 'single'
  ).length;
  const totalStudents = baseStudents + extraStudents;
  
  const entryEl = document.createElement('div');
  entryEl.className = `timetable-entry ${duration <= 15 ? 'timetable-entry-small' : ''}`;
  entryEl.style.cssText = `
    top: ${top}px;
    height: ${height}px;
    background: ${courseColor};
  `;
  entryEl.setAttribute('data-entry-id', entry.id);
  entryEl.onclick = (e) => {
    e.stopPropagation();
    if (!isReadOnly) {
      window.openEditClassModal(entry);
    }
  };
  
  let content = `<div class="timetable-entry-class-name">${escapeHtml(entry.className)}</div>`;
  
  if (height >= 30) {
    content += `<div class="timetable-entry-time">${entry.startTime} - ${entry.endTime}</div>`;
  }
  
  if (height >= 45 && teacherNames) {
    content += `<div class="timetable-entry-teacher">${escapeHtml(teacherNames)}</div>`;
  }
  
  if (height >= 60 && entry.classroom) {
    content += `<div class="timetable-entry-classroom">${escapeHtml(entry.classroom)}</div>`;
  }
  
  if (height >= 75 && totalStudents > 0) {
    content += `<div class="timetable-entry-students">${totalStudents} student(s)</div>`;
  }
  
  entryEl.innerHTML = content;
  cell.appendChild(entryEl);
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
    
    html += `<div class="timetable-month-day-cell" data-date="${formatDateISO(date)}" onclick="switchToDayView('${formatDateISO(date)}')">`;
    html += `<div class="timetable-month-day-number">${day}</div>`;
    html += '<div class="timetable-month-day-entries">';
    
    // Get entries for this day
    const dayEntries = getEntriesForDate(date);
    dayEntries.forEach(entry => {
      const courseColor = entry.courseIds.length > 0 ? getCourseColor(entry.courseIds[0]) : '#667eea';
      html += `<div class="timetable-month-entry" style="background: ${courseColor};" data-entry-id="${entry.id}" onclick="event.stopPropagation(); ${!isReadOnly ? `window.openEditClassModal(${JSON.stringify(entry).replace(/"/g, '&quot;')})` : ''}">${escapeHtml(entry.className)}</div>`;
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

window.openEditClassModal = async function(entry) {
  console.log('[Debug] Opening Edit Class Modal');
  
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
          <div class="form-row">
            <div class="edit-class-form-group">
              <label for="editClassStartTime">Start Time <span style="color: #ef4444;">*</span></label>
              <select id="editClassStartTime" required>
                ${timeOptions.map(time => `<option value="${time}" ${time === entryData.startTime ? 'selected' : ''}>${time}</option>`).join('')}
              </select>
              <div class="error-message" id="errorStartTime"></div>
            </div>
            <div class="edit-class-form-group">
              <label for="editClassEndTime">End Time <span style="color: #ef4444;">*</span></label>
              <select id="editClassEndTime" required>
                ${timeOptions.map(time => `<option value="${time}" ${time === entryData.endTime ? 'selected' : ''}>${time}</option>`).join('')}
              </select>
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
              const linkedStudentIds = [...new Set(linkedEnrollments.map(e => e.studentId))];
              const seriesStudentIds = entryData.studentIds || [];
              const allStudentIds = [...new Set([...seriesStudentIds, ...linkedStudentIds])];
              
              return `
              <label>Enrolled Students (${allStudentIds.length})</label>
              <div class="enrolled-students-list" style="border: 1px solid #e0e0e0; border-radius: 6px; max-height: 150px; overflow-y: auto;">
                ${allStudentIds.map(studentId => {
                  const student = (window.students || []).find(s => s.id === studentId);
                  const name = student ? escapeHtml(student.name) : 'Unknown Student';
                  const dispId = student ? escapeHtml(student.studentId) : studentId;
                  const isSeries = seriesStudentIds.includes(studentId);
                  
                  return `<div style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 14px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <strong>${name}</strong> <span style="color:#666;">(${dispId})</span>
                      ${!isSeries ? '<span style="font-size:11px; color:#999; margin-left:5px; background:#f3f4f6; padding:2px 6px; border-radius:4px;">Session</span>' : ''}
                    </div>
                    ${isSeries ? `<span style="cursor:pointer; color:#ef4444; font-weight:bold;" onclick="removeStudentTag('${studentId}')">×</span>` : ''}
                  </div>`;
                }).join('') || '<div style="padding: 15px; text-align: center; color: #999; font-style: italic;">No enrolled students</div>'}
              </div>`;
            })()}
          </div>
          <div class="edit-class-modal-actions">
            ${isEdit ? `<button type="button" class="btn btn-danger" onclick="deleteClassEntry('${entry.id}')">Delete</button>` : ''}
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
  
  // Store selected courses and teachers
  window.selectedCourseIds = new Set(entryData.courseIds || []);
  window.selectedTeacherIds = new Set(entryData.teacherIds || []);
  window.selectedDays = new Set(entryData.dayOfWeek || []);
  window.currentClassStudentIds = entryData.studentIds || []; // Store current students
};

// Generate time options
function generateTimeOptions() {
  const options = [];
  for (let hour = 8; hour <= 20; hour++) {
    for (let min = 0; min < 60; min += 15) {
      options.push(`${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
    }
  }
  return options;
}

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
window.closeEditClassModal = function() {
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
};

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
  const startTime = document.getElementById('editClassStartTime').value;
  const endTime = document.getElementById('editClassEndTime').value;
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
    showClassFieldError('editClassEndTime', 'End time must be after start time');
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

// Delete class entry
window.deleteClassEntry = async function(entryId) {
  if (!confirm('Are you sure you want to delete this class? This action cannot be undone.')) {
    return;
  }

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
};

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

