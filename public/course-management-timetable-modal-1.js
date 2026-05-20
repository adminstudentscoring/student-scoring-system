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
          <div class="edit-class-modal-actions edit-class-modal-actions-bar">
            <span class="edit-class-modal-actions-left">${isEdit ? `<button type="button" class="btn btn-danger" onclick="deleteClassEntry('${entry.id}', '${dateStr || ''}')">Delete</button>` : ''}</span>
            <span class="btn-row-pair">
            <button type="button" class="btn btn-secondary" onclick="closeEditClassModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
            </span>
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
