// Timetable Management Module
// Handles timetable functionality for organizations and teachers

// State
let timetableEntries = [];
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
  loadTeachers();
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

// Load teachers
async function loadTeachers() {
  try {
    const response = await window.authUtils.authenticatedFetch('/organizations/teachers');
    if (!response) return;
    
    if (!response.ok) {
      throw new Error('Failed to load teachers');
    }
    
    teachers = await response.json();
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
        <div class="timetable-view-buttons">
          <button class="timetable-view-btn ${currentView === 'day' ? 'active' : ''}" onclick="switchTimetableView('day')">Day</button>
          <button class="timetable-view-btn ${currentView === 'week' ? 'active' : ''}" onclick="switchTimetableView('week')">Week</button>
          <button class="timetable-view-btn ${currentView === 'month' ? 'active' : ''}" onclick="switchTimetableView('month')">Month</button>
        </div>
        ${!isReadOnly ? '<button class="create-class-btn" onclick="openCreateClassModal()">Create New Class</button>' : ''}
      </div>
      <div id="timetableContent">
        ${renderWeekView()}
      </div>
    </div>
  `;
}

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
  event.target.classList.add('active');
};

// Render week view
function renderWeekView() {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const timeSlots = generateTimeSlots();
  
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
  
  // Body
  html += '<div class="timetable-week-body">';
  
  timeSlots.forEach(timeSlot => {
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
  
  // Render entries
  setTimeout(() => {
    renderWeekEntries();
  }, 10);
  
  return html;
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
  
  const [startHour, startMin] = entry.startTime.split(':').map(Number);
  const [endHour, endMin] = entry.endTime.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  const duration = endMinutes - startMinutes;
  
  // Calculate position and height
  const timeSlots = generateTimeSlots();
  const slotHeight = 30; // 30px per 15 minutes
  const startSlotIndex = timeSlots.indexOf(formatTimeSlot(entry.startTime));
  const top = startSlotIndex * slotHeight;
  const height = (duration / 15) * slotHeight;
  
  // Get course color
  const courseColor = entry.courseIds.length > 0 ? getCourseColor(entry.courseIds[0]) : '#667eea';
  
  // Get teacher names
  const teacherNames = entry.teacherIds.map(id => {
    const teacher = teachers.find(t => t.id === id);
    return teacher ? teacher.name : '';
  }).filter(Boolean).join(', ');
  
  const entryEl = document.createElement('div');
  entryEl.className = `timetable-entry ${duration <= 15 ? 'timetable-entry-small' : ''}`;
  entryEl.style.cssText = `
    top: ${top}px;
    height: ${height}px;
    background: ${courseColor};
  `;
  entryEl.setAttribute('data-entry-id', entry.id);
  entryEl.onclick = () => openEditClassModal(entry);
  
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
  
  if (height >= 75 && entry.studentIds.length > 0) {
    content += `<div class="timetable-entry-students">${entry.studentIds.length} student(s)</div>`;
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

// Placeholder functions (to be implemented)
function renderDayView() {
  return '<p>Day view coming soon...</p>';
}

function renderMonthView() {
  return '<p>Month view coming soon...</p>';
}

window.openCreateClassModal = function() {
  openEditClassModal(null);
};

window.openEditClassModal = function(entry) {
  // To be implemented
  console.log('Open edit class modal', entry);
};

