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
  window.makeupContext = { studentId, studentName: name, entryId, dateStr };

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
  if (!window.makeupContext.studentId) {
    closeMakeupPopup();
    return;
  }
  closeMakeupPopup();
  window.makeupFlowState = {
    active: true,
    studentId: window.makeupContext.studentId,
    fromEntryId: window.makeupContext.entryId,
    fromDate: window.makeupContext.dateStr,
    studentName: window.makeupContext.studentName
  };

  // Close edit modal to allow interaction with timetable, but preserve makeup flow
  closeEditClassModal(true);

  document.body.classList.add('makeup-mode-active');
  const banner = document.getElementById('makeupModeBanner');
  if (banner) {
    const text = banner.querySelector('#makeupModeText');
    if (text) text.textContent = `Select a class for ${window.makeupContext.studentName} to make up`;
    banner.style.display = 'flex';
  }
  if (window.showToast) window.showToast('Make-up mode: click a class slot to assign.', 'info');
};

window.cancelMakeupFlow = function() {
  window.makeupFlowState = { active: false, studentId: null, fromEntryId: null, fromDate: null, studentName: '' };
  document.body.classList.remove('makeup-mode-active');
  const banner = document.getElementById('makeupModeBanner');
  if (banner) banner.style.display = 'none';
};

window.handleMakeupTargetSelect = function(entry, dateStr) {
  if (!window.makeupFlowState.active) return;

  performMakeupAssignment({
    studentId: window.makeupFlowState.studentId,
    fromEntryId: window.makeupFlowState.fromEntryId,
    fromDate: window.makeupFlowState.fromDate,
    toEntryId: entry.id,
    toDate: dateStr,
    studentName: window.makeupFlowState.studentName
  });
};

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
  if (!window.makeupContext.studentId) {
    closeMakeupPopup();
    return;
  }
  closeMakeupPopup();
  await postponeEnrollment(window.makeupContext);
};

window.handleCancelLessonSelection = async function() {
  if (!window.makeupContext.studentId) {
    closeMakeupPopup();
    return;
  }
  if (!confirm('Cancel this lesson? If it was paid, the fee will be returned as credit.')) return;
  closeMakeupPopup();
  await cancelEnrollmentWithRefund(window.makeupContext);
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

