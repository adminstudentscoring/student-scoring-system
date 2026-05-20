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

