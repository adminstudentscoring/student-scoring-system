window.unformatPriceInput = function(input) {
  input.value = input.value.replace(/,/g, '');
};

// Save course
window.saveCourse = async function(event, courseId) {
  event.preventDefault();
  
  const name = document.getElementById('courseName').value.trim();
  const priceInput = document.getElementById('coursePrice').value.replace(/,/g, '');
  const price = parseFloat(priceInput);
  const color = document.getElementById('colorPicker').value;
  
  // Clear previous errors
  document.getElementById('courseNameError').textContent = '';
  document.getElementById('coursePriceError').textContent = '';
  document.getElementById('courseColorError').textContent = '';
  
  // Validation
  let hasError = false;
  
  if (!name || name.length === 0) {
    document.getElementById('courseNameError').textContent = 'Course name is required';
    hasError = true;
  } else if (name.length > 50) {
    document.getElementById('courseNameError').textContent = 'Course name must be 50 characters or less';
    hasError = true;
  }
  
  if (isNaN(price) || price < 0) {
    document.getElementById('coursePriceError').textContent = price < 0 ? 'Price must be greater than or equal to 0' : 'Price must be a valid number';
    hasError = true;
  }
  
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    document.getElementById('courseColorError').textContent = 'Color must be in #RRGGBB format';
    hasError = true;
  }
  
  if (hasError) return;
  
  // Check name uniqueness (frontend check)
  const existingCourse = (window.courses || []).find(c => 
    c.id !== courseId &&
    c.name.toLowerCase().trim() === name.toLowerCase().trim()
  );
  
  if (existingCourse) {
    document.getElementById('courseNameError').textContent = 'Course name already exists in this organization';
    return;
  }
  
  // Disable save button
  const saveBtn = document.getElementById('saveCourseBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  
  try {
    const url = courseId ? `/organizations/courses/${courseId}` : '/organizations/courses';
    const method = courseId ? 'PUT' : 'POST';
    
    const response = await window.authUtils.authenticatedFetch(url, {
      method: method,
      body: JSON.stringify({
        name: name,
        price: price,
        color: color || null
      })
    });
    
    if (!response) {
      saveBtn.disabled = false;
      saveBtn.textContent = courseId ? 'Update' : 'Create';
      return;
    }
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to save course');
    }
    
    showToast(`Course ${courseId ? 'updated' : 'created'} successfully`, 'success');
    closeCourseModal();
    loadCourses();
  } catch (error) {
    console.error('Error saving course:', error);
    showToast('Failed to save course: ' + error.message, 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = courseId ? 'Update' : 'Create';
  }
};

