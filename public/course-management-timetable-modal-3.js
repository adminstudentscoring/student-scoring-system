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


