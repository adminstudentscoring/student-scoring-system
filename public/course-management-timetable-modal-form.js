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
