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
  
  // Header + body share one scroll container so column widths match (avoids scrollbar width drift).
  html += '<div class="timetable-week-body-scrollable">';
  html += '<div class="timetable-week-header">';
  html += '<div class="timetable-week-header-cell timetable-week-time-col">Time</div>';
  days.forEach((day, index) => {
    const date = weekDates[index];
    const holidayCls = isHolidayByIndex[index] ? ' is-holiday' : '';
    html += `<div class="timetable-week-header-cell${holidayCls}">${day}<br><small>${formatDate(date)}</small></div>`;
  });
  html += '</div>';
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

