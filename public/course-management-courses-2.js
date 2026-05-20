window.handleCourseSearch = function() {
  currentSearch = document.getElementById('courseSearch').value.toLowerCase().trim();
  currentPage = 1;
  renderCourses();
};

// Handle price filter
window.handlePriceFilter = function() {
  const minInput = document.getElementById('priceMin');
  const maxInput = document.getElementById('priceMax');
  
  let min = parseInt(minInput.value);
  let max = parseInt(maxInput.value);
  
  // Ensure min <= max
  if (min > max) {
    if (minInput === document.activeElement) {
      max = min;
      maxInput.value = max;
    } else {
      min = max;
      minInput.value = min;
    }
  }
  
  currentPriceRange.min = min;
  currentPriceRange.max = max;
  updatePriceRangeLabel();
  currentPage = 1;
  renderCourses();
};

// Handle course sort
window.handleCourseSort = function() {
  const sortValue = document.getElementById('courseSort').value;
  const [field, direction] = sortValue.split('-');
  
  currentSort = { field, direction };
  currentPage = 1;
  renderCourses();
  
  // Update sort select display
  updateSortDisplay();
};

// Update sort display
function updateSortDisplay() {
  const sortSelect = document.getElementById('courseSort');
  if (!sortSelect) return;
  
  const option = sortSelect.querySelector(`option[value="${currentSort.field}-${currentSort.direction}"]`);
  if (option) {
    sortSelect.value = `${currentSort.field}-${currentSort.direction}`;
  }
}

// Render courses list
function renderCourses() {
  const container = document.getElementById('coursesListContainer');
  if (!container) return;
  
  // Filter courses
  let filteredCourses = (window.courses || []).filter(course => {
    // Search filter
    if (currentSearch && !course.name.toLowerCase().includes(currentSearch)) {
      return false;
    }
    
    // Price filter
    if (course.price < currentPriceRange.min || course.price > currentPriceRange.max) {
      return false;
    }
    
    return true;
  });
  
  // Sort courses
  filteredCourses.sort((a, b) => {
    let aVal, bVal;
    
    switch (currentSort.field) {
      case 'name':
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
        break;
      case 'price':
        aVal = a.price;
        bVal = b.price;
        break;
      case 'createdAt':
      default:
        aVal = new Date(a.createdAt);
        bVal = new Date(b.createdAt);
        break;
    }
    
    if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
    return 0;
  });
  
  // Pagination
  const totalPages = Math.ceil(filteredCourses.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedCourses = filteredCourses.slice(startIndex, endIndex);
  
  // Empty state
  if (filteredCourses.length === 0) {
    if (currentSearch || currentPriceRange.min > 0 || currentPriceRange.max < 10000) {
      container.innerHTML = '<p>No courses found matching your criteria.</p>';
    } else {
      container.innerHTML = '<p>No courses yet. Click \'Create\' to add your first course.</p>';
    }
    return;
  }
  
  // Render table
  let html = `
    <table class="courses-table">
      <thead>
        <tr>
          <th style="width: 40px;">
            <input type="checkbox" id="selectAllCourses" onchange="handleSelectAll()">
          </th>
          <th style="flex: 1;">Course Name</th>
          <th style="width: 180px;">Price</th>
          <th style="width: 100px;">Actions</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  paginatedCourses.forEach(course => {
    const isSelected = selectedCourseIds.has(course.id);
    const priceDisplay = formatPrice(course.price);
    
    html += `
      <tr class="${isSelected ? 'selected' : ''}" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.05)'" onmouseout="this.style.backgroundColor=''">
        <td>
          <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="handleCourseSelect('${course.id}', this.checked)">
        </td>
        <td>${escapeHtml(course.name)}</td>
        <td>${priceDisplay}</td>
        <td>
          <button class="btn btn-secondary" onclick="openEditCourseModal('${course.id}')">Edit</button>
        </td>
      </tr>
    `;
  });
  
  html += `
      </tbody>
    </table>
  `;
  
  // Add pagination if needed
  if (filteredCourses.length >= ITEMS_PER_PAGE) {
    html += `
      <div class="pagination">
        <div class="pagination-info">
          Showing ${startIndex + 1}-${Math.min(endIndex, filteredCourses.length)} of ${filteredCourses.length} courses
        </div>
        <div class="pagination-controls">
          <button class="btn btn-secondary" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">Previous</button>
          <span>Page ${currentPage} of ${totalPages}</span>
          <button class="btn btn-secondary" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">Next</button>
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  // Update select all checkbox
  const selectAll = document.getElementById('selectAllCourses');
  if (selectAll) {
    const allSelected = paginatedCourses.length > 0 && paginatedCourses.every(c => selectedCourseIds.has(c.id));
    selectAll.checked = allSelected;
  }
  
  // Update delete button
  updateDeleteButton();
}

// Change page
window.changePage = function(page) {
  currentPage = page;
  renderCourses();
};

// Handle select all
window.handleSelectAll = function() {
  const selectAll = document.getElementById('selectAllCourses');
  if (!selectAll) return;
  
  const container = document.getElementById('coursesListContainer');
  const checkboxes = container.querySelectorAll('tbody input[type="checkbox"]');
  
  checkboxes.forEach(checkbox => {
    const courseId = checkbox.onchange.toString().match(/'([^']+)'/)[1];
    checkbox.checked = selectAll.checked;
    handleCourseSelect(courseId, selectAll.checked);
  });
};

// Handle course select
window.handleCourseSelect = function(courseId, selected) {
  if (selected) {
    selectedCourseIds.add(courseId);
  } else {
    selectedCourseIds.delete(courseId);
  }
  updateDeleteButton();
  
  // Update select all checkbox
  const selectAll = document.getElementById('selectAllCourses');
  if (selectAll) {
    const container = document.getElementById('coursesListContainer');
    const checkboxes = container.querySelectorAll('tbody input[type="checkbox"]');
    const allSelected = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
    selectAll.checked = allSelected;
  }
};

// Update delete button
function updateDeleteButton() {
  const deleteBtn = document.getElementById('deleteCoursesBtn');
  const countSpan = document.getElementById('selectedCount');
  
  if (deleteBtn && countSpan) {
    const count = selectedCourseIds.size;
    deleteBtn.style.display = count > 0 ? 'inline-block' : 'none';
    countSpan.textContent = count;
  }
}

// Handle delete selected
window.handleDeleteSelected = async function() {
  if (selectedCourseIds.size === 0) return;
  
  const count = selectedCourseIds.size;
  const confirmed = confirm(`Are you sure you want to delete ${count} course(s)?`);
  
  if (!confirmed) return;
  
  try {
    const response = await window.authUtils.authenticatedFetch('/organizations/courses', {
      method: 'DELETE',
      body: JSON.stringify({ courseIds: Array.from(selectedCourseIds) })
    });
    
    if (!response) return;
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete courses');
    }
    
    selectedCourseIds.clear();
    showToast(`${count} course(s) deleted successfully`, 'success');
    loadCourses();
  } catch (error) {
    console.error('Error deleting courses:', error);
    showToast('Failed to delete courses: ' + error.message, 'error');
  }
};

// Render courses error
function renderCoursesError() {
  const container = document.getElementById('coursesListContainer');
  if (container) {
    container.innerHTML = `
      <p>Failed to load courses. <button class="btn btn-secondary" onclick="loadCourses()">Retry</button></p>
    `;
  }
}

// Open create course modal
window.openCreateCourseModal = function() {
  openCourseModal(null);
};

// Open edit course modal
window.openEditCourseModal = function(courseId) {
  const course = (window.courses || []).find(c => c.id === courseId);
  if (!course) {
    showToast('Course not found', 'error');
    return;
  }
  openCourseModal(course);
};

// Open course modal (create or edit)
function openCourseModal(course) {
  const isEdit = !!course;
  const randomColor = PREDEFINED_COLORS[Math.floor(Math.random() * PREDEFINED_COLORS.length)];
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div class="modal-header">
        <h2>${isEdit ? 'Edit Course' : 'Create New Course'}</h2>
        <button class="modal-close" onclick="closeCourseModal()">&times;</button>
      </div>
      <div class="modal-body">
        <form id="courseForm" onsubmit="saveCourse(event, ${isEdit ? `'${course.id}'` : 'null'})">
          <div class="form-group">
            <label>Course Name <span class="required">*</span></label>
            <input type="text" id="courseName" required maxlength="50" value="${isEdit ? escapeHtml(course.name) : ''}">
            <div class="error-message" id="courseNameError"></div>
          </div>
          
          <div class="form-group">
            <label>Price <span class="required">*</span></label>
            <input type="text" id="coursePrice" required placeholder="0.00" value="${isEdit ? course.price : ''}" onblur="formatPriceInput(this)" onfocus="unformatPriceInput(this)">
            <span class="input-hint">per lesson</span>
            <div class="error-message" id="coursePriceError"></div>
          </div>
          
          <div class="form-group">
            <label>Color (Optional)</label>
            <div class="color-selector">
              <div class="predefined-colors">
                ${PREDEFINED_COLORS.map((color, index) => `
                  <div class="color-option ${isEdit && course.color === color ? 'selected' : !isEdit && color === randomColor ? 'selected' : ''}" 
                       style="background-color: ${color}" 
                       onclick="selectPredefinedColor('${color}')"
                       data-color="${color}"></div>
                `).join('')}
              </div>
              <div class="custom-color-input">
                <input type="text" id="customColor" placeholder="#RRGGBB" value="${isEdit && course.color && !PREDEFINED_COLORS.includes(course.color) ? course.color : ''}" oninput="validateColorInput(this)">
                <input type="color" id="colorPicker" value="${isEdit && course.color ? course.color : randomColor}" onchange="handleColorPickerChange(this)">
              </div>
            </div>
            <div class="error-message" id="courseColorError"></div>
          </div>
          
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeCourseModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="saveCourseBtn">${isEdit ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Set initial color
  if (isEdit && course.color) {
    document.getElementById('colorPicker').value = course.color;
  } else if (!isEdit) {
    document.getElementById('colorPicker').value = randomColor;
  }
  
  // Store original form data for unsaved changes check
  window.courseModalOriginalData = {
    name: isEdit ? course.name : '',
    price: isEdit ? course.price : '',
    color: isEdit ? course.color : randomColor
  };
  
  window.currentCourseModal = modal;
}

// Close course modal
window.closeCourseModal = function() {
  if (!window.currentCourseModal) return;
  
  // Check for unsaved changes
  const form = document.getElementById('courseForm');
  if (form) {
    const currentData = {
      name: document.getElementById('courseName').value,
      price: document.getElementById('coursePrice').value,
      color: document.getElementById('colorPicker').value
    };
    
    const hasChanges = JSON.stringify(currentData) !== JSON.stringify(window.courseModalOriginalData);
    
    if (hasChanges) {
      const confirmed = confirm('You have unsaved changes. Are you sure you want to close?');
      if (!confirmed) return;
    }
  }
  
  document.body.removeChild(window.currentCourseModal);
  window.currentCourseModal = null;
  window.courseModalOriginalData = null;
};

// Select predefined color
window.selectPredefinedColor = function(color) {
  document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
  document.querySelector(`[data-color="${color}"]`).classList.add('selected');
  document.getElementById('colorPicker').value = color;
  document.getElementById('customColor').value = '';
};

// Handle color picker change
window.handleColorPickerChange = function(picker) {
  const color = picker.value;
  document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
  const predefined = document.querySelector(`[data-color="${color}"]`);
  if (predefined) {
    predefined.classList.add('selected');
    document.getElementById('customColor').value = '';
  } else {
    document.getElementById('customColor').value = color;
  }
};

// Validate color input
window.validateColorInput = function(input) {
  const color = input.value.trim();
  const errorDiv = document.getElementById('courseColorError');
  
  if (color === '') {
    errorDiv.textContent = '';
    return;
  }
  
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    errorDiv.textContent = 'Color must be in #RRGGBB format';
    return;
  }
  
  errorDiv.textContent = '';
  document.getElementById('colorPicker').value = color;
  document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
};

// Format price input (add thousand separator on blur)
window.formatPriceInput = function(input) {
  const value = input.value.replace(/,/g, '');
  const num = parseFloat(value);
  
  if (!isNaN(num)) {
    input.value = formatNumber(num);
  }
};

// Unformat price input (remove thousand separator on focus)
