// Course Management Module
// Handles all course-related functionality for organizations

// Predefined colors (10 colors in 5x2 grid)
const PREDEFINED_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#8B5CF6', // Purple
  '#EF4444', // Red
  '#F59E0B', // Orange
  '#EAB308', // Yellow
  '#06B6D4', // Cyan
  '#EC4899', // Pink
  '#84CC16', // Lime
  '#6B7280'  // Gray
];

// State
window.courses = window.courses || [];
let currentSort = { field: 'createdAt', direction: 'desc' };
let currentSearch = '';
let currentPriceRange = { min: 0, max: 1000 };
let selectedCourseIds = new Set();
let currentPage = 1;
const ITEMS_PER_PAGE = 20;

// Initialize course management
window.loadCourseManagement = function() {
  const container = document.getElementById('courseManagementContainer');
  if (!container) return;
  
  renderCourseManagement();
  loadCourses();
};

// Render course management UI
function renderCourseManagement() {
  const container = document.getElementById('courseManagementContainer');
  if (!container) return;
  
  // Get saved sub-tab from localStorage
  const savedSubTab = localStorage.getItem('courseManagementSubTab') || 'courses';
  
  container.innerHTML = `
    <div class="course-management">
      <!-- Sub-tabs -->
      <div class="course-sub-tabs">
        <button class="course-sub-tab" data-subtab="timetable">📅 Timetable</button>
        <button class="course-sub-tab active" data-subtab="courses">📚 Courses</button>
        <button class="course-sub-tab" data-subtab="package">📦 Course Package</button>
        <button class="course-sub-tab" data-subtab="accounting">💰 Accounting</button>
        <button class="course-sub-tab" data-subtab="sales">📊 Sales</button>
      </div>
      
      <!-- Content Area -->
      <div class="course-management-content">
        <!-- Courses Sub-tab Content -->
        <div id="coursesSubTabContent" class="course-sub-tab-content active">
        <div class="courses-header">
          <div class="courses-controls">
            <div class="search-filter-group">
              <input type="text" id="courseSearch" class="search-input" placeholder="Search courses..." oninput="handleCourseSearch()">
              <div class="price-filter">
                <label>Price Range: <span id="priceRangeLabel">$0 - $1000</span></label>
                <div class="range-slider-container">
                  <input type="range" id="priceMin" min="0" max="1000" value="0" oninput="handlePriceFilter()">
                  <input type="range" id="priceMax" min="0" max="1000" value="1000" oninput="handlePriceFilter()">
                </div>
              </div>
              <select id="courseSort" class="sort-select" onchange="handleCourseSort()">
                <option value="name-asc">Name ↑</option>
                <option value="name-desc">Name ↓</option>
                <option value="price-asc">Price ↑</option>
                <option value="price-desc">Price ↓</option>
                <option value="date-asc">Date ↑</option>
                <option value="date-desc" selected>Date ↓</option>
              </select>
            </div>
            <div class="courses-actions">
              <button id="deleteCoursesBtn" class="btn btn-danger" style="display: none;" onclick="handleDeleteSelected()">Delete (<span id="selectedCount">0</span>)</button>
              <button class="btn btn-primary" onclick="openCreateCourseModal()">Create</button>
            </div>
          </div>
        </div>
        
        <div id="coursesListContainer">
          <p>Loading courses...</p>
        </div>
      </div>
      
      <!-- Other sub-tabs (placeholder) -->
      <div id="timetableSubTabContent" class="course-sub-tab-content">
        <p>Timetable feature coming soon...</p>
      </div>
      <div id="packageSubTabContent" class="course-sub-tab-content">
        <div class="packages-header">
          <div class="packages-controls">
            <div class="search-filter-group">
              <input type="text" id="packageSearch" class="search-input" placeholder="Search packages..." oninput="handlePackageSearch()">
              <select id="packageStatusFilter" class="sort-select" onchange="handlePackageFilter()">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
              <select id="packageValidityFilter" class="sort-select" onchange="handlePackageFilter()">
                <option value="all">All Validity</option>
                <option value="valid">Valid</option>
                <option value="expired">Expired</option>
                <option value="no-expiry">No Expiry</option>
              </select>
              <select id="packageSort" class="sort-select" onchange="handlePackageSort()">
                <option value="name-asc">Name ↑</option>
                <option value="name-desc">Name ↓</option>
                <option value="price-asc">Price ↑</option>
                <option value="price-desc">Price ↓</option>
                <option value="date-asc">Date ↑</option>
                <option value="date-desc" selected>Date ↓</option>
              </select>
            </div>
            <div class="packages-actions">
              <button class="btn btn-primary" onclick="openCreatePackageModal()">Create</button>
            </div>
          </div>
        </div>
        
        <div id="packagesListContainer">
          <p>Loading packages...</p>
        </div>
      </div>
      <div id="accountingSubTabContent" class="course-sub-tab-content">
        <p>Accounting feature coming soon...</p>
      </div>
      <div id="salesSubTabContent" class="course-sub-tab-content">
        <div class="sales-container">
          <!-- Left Panel: Course/Package Selection -->
          <div class="sales-left-panel">
            <div class="sales-product-search">
              <input type="text" id="salesProductSearch" class="search-input" placeholder="Search courses, fees, or products..." oninput="handleSalesProductSearch()">
            </div>
            
            <div class="sales-product-categories">
              <button class="category-btn active" onclick="filterSalesCategory('all')">All</button>
              <button class="category-btn" onclick="filterSalesCategory('packages')">Packages</button>
              <button class="category-btn" onclick="filterSalesCategory('courses')">Courses</button>
            </div>
            
            <div id="salesProductList" class="sales-product-list">
              <!-- Products will be loaded here -->
              <div class="loading-placeholder">Loading products...</div>
            </div>
          </div>
          
          <!-- Right Panel: Student & Enrollment -->
          <div class="sales-right-panel">
            <!-- Student Search Section -->
            <div class="sales-student-section">
              <div class="student-search-wrapper">
                <div class="search-icon">👤</div>
                <input type="text" id="salesStudentSearch" placeholder="Search a student to enroll*" onfocus="showStudentDropdown()" oninput="handleSalesStudentSearch()">
                <div class="dropdown-arrow">▼</div>
              </div>
              
              <div id="salesStudentDropdown" class="student-dropdown-list" style="display: none;">
                <!-- Student search results will appear here -->
              </div>
              
              <div id="selectedStudentCard" class="selected-student-card" style="display: none;">
                <!-- Selected student info will appear here -->
              </div>
              
              <div id="emptyStudentState" class="empty-student-state">
                <div class="empty-icon">🎓</div>
                <div class="empty-text">Walk-In</div>
                <button class="btn btn-sm btn-outline">Orders</button>
              </div>
            </div>
            
            <!-- Enrollment/Cart Section -->
            <div class="sales-cart-section">
              <div class="cart-empty-state">
                You will see student's orders here once you have selected a student above.
              </div>
              <div id="salesCartContent" style="display: none;">
                <!-- Cart items will go here -->
              </div>
            </div>
            
            <!-- Footer Actions -->
            <div class="sales-footer-actions">
              <button class="btn btn-secondary" onclick="resetSales()">Reset</button>
              <button class="btn btn-secondary" onclick="saveSalesOrder()">Save</button>
              <button class="btn btn-primary" onclick="processSalesPayment()">Pay $0</button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  `;
  
  // Add sub-tab click handlers
  document.querySelectorAll('.course-sub-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      const subTab = this.dataset.subtab;
      switchSubTab(subTab);
      localStorage.setItem('courseManagementSubTab', subTab);
    });
  });
  
  // Restore saved sub-tab
  switchSubTab(savedSubTab);
}

// Switch sub-tab
function switchSubTab(subTab) {
  document.querySelectorAll('.course-sub-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.course-sub-tab-content').forEach(c => c.classList.remove('active'));
  
  const tab = document.querySelector(`[data-subtab="${subTab}"]`);
  const content = document.getElementById(`${subTab}SubTabContent`);
  
  if (tab) tab.classList.add('active');
  if (content) content.classList.add('active');
  
  // Load courses when switching to courses tab
  if (subTab === 'courses') {
    loadCourses();
  }
  
  // Load timetable when switching to timetable tab
  if (subTab === 'timetable') {
    if (window.loadTimetableManagement) {
      window.loadTimetableManagement('organization');
    }
  }
  
  // Load packages when switching to package tab
  if (subTab === 'package') {
    loadPackages();
  }

  // Initialize Sales if active
  if (subTab === 'sales') {
    if (window.loadSalesModule) {
      window.loadSalesModule();
    } else {
        console.error('Sales module not loaded');
    }
  }
}

// Load courses from API
async function loadCourses() {
  try {
    const response = await window.authUtils.authenticatedFetch('/organizations/courses');
    if (!response) return;
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to load courses');
    }
    
    window.courses = await response.json();
    
    // Update price filter max
    updatePriceFilterMax();
    
    // Render courses
    renderCourses();
  } catch (error) {
    console.error('Error loading courses:', error);
    showToast('Failed to load courses. Please try again.', 'error');
    renderCoursesError();
  }
}

// Update price filter max based on courses
function updatePriceFilterMax() {
  if (!window.courses || window.courses.length === 0) {
    currentPriceRange.max = 1000;
    document.getElementById('priceMax').max = 1000;
    document.getElementById('priceMax').value = 1000;
    updatePriceRangeLabel();
    return;
  }
  
  const maxPrice = Math.max(...window.courses.map(c => c.price));
  const roundedMax = Math.ceil(maxPrice / 100) * 100; // Round up to nearest 100
  const finalMax = Math.max(roundedMax, 1000); // At least 1000
  
  currentPriceRange.max = finalMax;
  document.getElementById('priceMax').max = finalMax;
  document.getElementById('priceMax').value = finalMax;
  updatePriceRangeLabel();
}

// Update price range label
function updatePriceRangeLabel() {
  const label = document.getElementById('priceRangeLabel');
  if (label) {
    label.textContent = `$${formatNumber(currentPriceRange.min)} - $${formatNumber(currentPriceRange.max)}`;
  }
}

// Handle course search
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

// Format price for display
function formatPrice(price) {
  if (price % 1 === 0) {
    return `$${formatNumber(price)} / per lesson`;
  }
  return `$${formatNumber(price.toFixed(2))} / per lesson`;
}

// Format number with thousand separator
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show toast notification
function showToast(message, type = 'success') {
  // Remove existing toast
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Show toast
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Hide toast after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add CSS styles
const style = document.createElement('style');
style.textContent = `
  .course-management {
    display: flex;
    gap: 0;
    min-height: 500px;
  }
  
  .course-sub-tabs {
    display: flex;
    flex-direction: column;
    width: 200px;
    min-width: 200px;
    gap: 5px;
    padding: 10px;
    background: #f8f9fa;
    border-right: 2px solid #e0e0e0;
    border-radius: 8px 0 0 8px;
  }
  
  .course-sub-tab {
    padding: 12px 16px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 15px;
    color: #666;
    border-left: 3px solid transparent;
    transition: all 0.3s;
    border-radius: 6px;
    text-align: left;
    width: 100%;
  }
  
  .course-sub-tab:hover {
    background: #e9ecef;
    color: #333;
  }
  
  .course-sub-tab.active {
    color: #667eea;
    background: #e0f2fe;
    border-left-color: #667eea;
    font-weight: bold;
  }
  
  .course-sub-tab-content {
    display: none;
    flex: 1;
    padding: 25px;
    overflow-y: auto;
    background: #fff;
    color: #333;
  }
  
  .course-sub-tab-content.active {
    display: block;
  }
  
  .course-management-content {
    flex: 1;
    min-width: 0;
    background: #fff;
  }
  
  @media (max-width: 768px) {
    .course-management {
      flex-direction: column;
    }
    
    .course-sub-tabs {
      width: 100%;
      flex-direction: row;
      border-right: none;
      border-bottom: 2px solid #e0e0e0;
      border-radius: 8px 8px 0 0;
      overflow-x: auto;
      background: #f8f9fa;
    }
    
    .course-sub-tab {
      white-space: nowrap;
      border-left: none;
      border-bottom: 3px solid transparent;
      color: #333;
    }
    
    .course-sub-tab.active {
      border-left: none;
      border-bottom-color: #667eea;
      color: #667eea;
    }
    
    .course-sub-tab-content {
      padding: 15px;
    }
  }
  
  .courses-header {
    margin-bottom: 20px;
  }
  
  .courses-controls {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }
  
  .search-filter-group {
    display: flex;
    gap: 15px;
    align-items: center;
    flex-wrap: wrap;
  }
  
  .search-input {
    flex: 1;
    min-width: 200px;
    padding: 8px 12px;
    border: 2px solid #e0e0e0;
    border-radius: 4px;
    background: #fff;
    color: #333;
  }
  
  .price-filter {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 200px;
  }
  
  .price-filter label {
    font-size: 14px;
    color: #333;
  }
  
  .range-slider-container {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  
  .range-slider-container input[type="range"] {
    flex: 1;
  }
  
  .sort-select {
    padding: 8px 12px;
    border: 2px solid #e0e0e0;
    border-radius: 4px;
    background: #fff;
    color: #333;
  }
  
  .courses-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
  
  .courses-table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e0e0e0;
  }
  
  .courses-table thead {
    background: #f8f9fa;
  }
  
  .courses-table th {
    padding: 12px;
    text-align: left;
    font-weight: bold;
    color: #333;
    border-bottom: 2px solid #e0e0e0;
  }
  
  .courses-table td {
    padding: 12px;
    border-top: 1px solid #e0e0e0;
    color: #333;
  }
  
  .courses-table tbody tr.selected {
    background: #f0f4ff;
  }
  
  .courses-table tbody tr:hover {
    background: #f8f9fa;
  }
  
  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 20px;
    padding: 15px;
    background: #fff;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
  }
  
  .pagination-info {
    color: #333;
  }
  
  .pagination-controls {
    display: flex;
    gap: 15px;
    align-items: center;
  }
  
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  }
  
  .modal-content {
    background: #fff;
    border-radius: 8px;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
  
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid #e0e0e0;
  }
  
  .modal-header h2 {
    margin: 0;
    color: #333;
  }
  
  .modal-close {
    background: none;
    border: none;
    color: #666;
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
  }

  .modal-close:hover {
    color: #333;
  }
  
  .modal-body {
    padding: 20px;
  }
  
  .form-group {
    margin-bottom: 20px;
  }
  
  .form-group label {
    display: block;
    margin-bottom: 8px;
    color: #333;
    font-weight: 500;
  }
  
  .required {
    color: #ef4444;
  }
  
  .form-group input[type="text"] {
    width: 100%;
    padding: 8px 12px;
    border: 2px solid #e0e0e0;
    border-radius: 4px;
    background: #fff;
    color: #333;
    box-sizing: border-box;
  }
  
  .input-hint {
    display: block;
    margin-top: 5px;
    font-size: 12px;
    color: #666;
  }
  
  .error-message {
    color: #ef4444;
    font-size: 12px;
    margin-top: 5px;
  }
  
  .color-selector {
    margin-top: 10px;
  }
  
  .predefined-colors {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
    margin-bottom: 15px;
  }
  
  .color-option {
    width: 40px;
    height: 40px;
    border-radius: 4px;
    cursor: pointer;
    border: 2px solid transparent;
    transition: all 0.2s;
  }
  
  .color-option:hover {
    transform: scale(1.1);
    border-color: #fff;
  }
  
  .color-option.selected {
    border-color: #fff;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
  }
  
  .custom-color-input {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  
  .custom-color-input input[type="text"] {
    flex: 1;
  }
  
  .custom-color-input input[type="color"] {
    width: 50px;
    height: 40px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 4px;
    cursor: pointer;
  }
  
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
  }
  
  .toast {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 4px;
    color: #fff;
    font-weight: 500;
    z-index: 10001;
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s;
  }
  
  .toast.show {
    opacity: 1;
    transform: translateX(0);
  }
  
  .toast-success {
    background: #10b981;
  }
  
  .toast-error {
    background: #ef4444;
  }
  
  @media (max-width: 768px) {
    .courses-table {
      display: block;
      overflow-x: auto;
    }
    
    .search-filter-group {
      flex-direction: column;
    }
    
    .predefined-colors {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  
  /* Package Management Styles */
  .package-courses-cell {
    position: relative;
  }
  
  .package-courses-summary {
    color: #667eea;
    text-decoration: underline;
    cursor: pointer;
  }
  
  .package-courses-summary:hover {
    color: #5568d3;
  }
  
  .package-courses-details {
    margin-top: 10px;
    padding: 10px;
    background: #f8f9fa;
    border-radius: 4px;
    border-left: 3px solid #667eea;
  }
  
  .package-course-detail {
    padding: 5px 0;
    color: #333;
    font-size: 14px;
  }
  
  .package-course-detail.deleted {
    color: #ef4444;
    font-style: italic;
  }
  
  .package-total {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #e0e0e0;
    font-weight: bold;
    color: #333;
  }
  
  .package-status {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }
  
  .package-status.active {
    background: #10b981;
    color: #fff;
  }
  
  .package-status.inactive {
    background: #6b7280;
    color: #fff;
  }
  
  .package-status.archived {
    background: #ef4444;
    color: #fff;
  }
  
  .package-courses-table-container {
    margin-top: 10px;
  }
  
  .package-courses-table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid #e0e0e0;
  }
  
  .package-courses-table thead {
    background: #f8f9fa;
  }
  
  .package-courses-table th {
    padding: 8px;
    text-align: left;
    font-weight: bold;
    color: #333;
    font-size: 13px;
    border-bottom: 2px solid #e0e0e0;
  }
  
  .package-courses-table td {
    padding: 8px;
    border-top: 1px solid #e0e0e0;
    color: #333;
  }
  
  .package-courses-table select,
  .package-courses-table input[type="number"] {
    width: 100%;
    padding: 6px 8px;
    border: 2px solid #e0e0e0;
    border-radius: 4px;
    background: #fff;
    color: #333;
    box-sizing: border-box;
  }
  
  .package-courses-table select option {
    background: #fff;
    color: #333;
  }
  
  /* Sales Module Styles */
  .sales-container {
    display: flex;
    height: 100%;
    min-height: 600px;
    gap: 20px;
  }
  
  .sales-left-panel {
    flex: 1;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .sales-right-panel {
    width: 350px;
    min-width: 350px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .sales-product-search {
    padding: 15px;
    border-bottom: 1px solid #e0e0e0;
  }
  
  .sales-product-categories {
    display: flex;
    padding: 10px 15px;
    gap: 10px;
    border-bottom: 1px solid #e0e0e0;
    background: #f8f9fa;
  }
  
  .category-btn {
    padding: 6px 12px;
    border: 1px solid #e0e0e0;
    background: #fff;
    border-radius: 20px;
    cursor: pointer;
    font-size: 14px;
    color: #666;
    transition: all 0.2s;
  }
  
  .category-btn.active {
    background: #667eea;
    color: #fff;
    border-color: #667eea;
  }
  
  .sales-product-list {
    flex: 1;
    overflow-y: auto;
    padding: 15px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 15px;
    align-content: start;
  }
  
  .sales-product-card {
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 15px;
    cursor: pointer;
    transition: all 0.2s;
    background: #fff;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
  }
  
  .sales-product-card:hover {
    border-color: #667eea;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    transform: translateY(-2px);
  }
  
  .product-type-badge {
    display: inline-block;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 12px;
    margin-bottom: 8px;
    width: fit-content;
    color: #fff;
    font-weight: 500;
  }
  
  .product-type-badge.package {
    background-color: #10b981;
  }
  
  .product-type-badge.course {
    background-color: #8b5cf6;
  }
  
  .product-name {
    font-weight: 600;
    color: #333;
    margin-bottom: 10px;
    font-size: 15px;
    padding-left: 0;
  }
  
  .product-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: 10px;
    padding-left: 0;
  }
  
  .product-info {
    font-size: 12px;
    color: #666;
  }
  
  .product-price {
    font-weight: bold;
    color: #333;
    font-size: 16px;
  }
  
  /* Sales Right Panel Styles */
  .sales-student-section {
    padding: 15px;
    border-bottom: 1px solid #e0e0e0;
    background: #f8f9fa;
    position: relative;
  }
  
  .student-search-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 0 10px;
  }
  
  .student-search-wrapper:focus-within {
    border-color: #667eea;
    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
  }
  
  .search-icon {
    color: #999;
    margin-right: 8px;
  }
  
  .student-search-wrapper input {
    flex: 1;
    border: none;
    padding: 10px 0;
    outline: none;
    font-size: 14px;
  }
  
  .dropdown-arrow {
    color: #999;
    font-size: 12px;
    margin-left: 8px;
  }
  
  .student-dropdown-list {
    position: absolute;
    top: 100%;
    left: 15px;
    right: 15px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 0 0 6px 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 100;
    max-height: 300px;
    overflow-y: auto;
    margin-top: 2px;
  }
  
  .dropdown-item {
    padding: 10px 15px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
  }
  
  .dropdown-item:last-child {
    border-bottom: none;
  }
  
  .dropdown-item:hover {
    background: #f0f4ff;
  }
  
  .dropdown-item.empty {
    padding: 20px;
    justify-content: center;
    color: #999;
    font-style: italic;
    cursor: default;
  }
  
  .student-avatar-small {
    width: 32px;
    height: 32px;
    background: #e0f2fe;
    color: #0284c7;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 14px;
  }
  
  .student-info {
    flex: 1;
  }
  
  .student-name {
    font-weight: 500;
    color: #333;
    font-size: 14px;
  }
  
  .student-id {
    font-size: 12px;
    color: #666;
  }
  
  .empty-student-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 30px 0;
    color: #666;
  }
  
  .empty-icon {
    font-size: 48px;
    margin-bottom: 10px;
    opacity: 0.3;
  }
  
  .empty-text {
    font-size: 18px;
    font-weight: 500;
    margin-bottom: 15px;
  }
  
  .btn-outline {
    background: transparent;
    border: 1px solid #e0e0e0;
    color: #666;
  }
  
  .btn-outline:hover {
    background: #f8f9fa;
    color: #333;
  }
  
  .selected-student-card {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 10px 0;
    position: relative;
  }
  
  .selected-student-avatar {
    width: 50px;
    height: 50px;
    background: #e0f2fe;
    color: #0284c7;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 20px;
  }
  
  .selected-student-info h3 {
    margin: 0 0 5px 0;
    font-size: 16px;
    color: #333;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .student-id-badge {
    background: #f3f4f6;
    color: #666;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: normal;
  }
  
  .student-balance {
    font-size: 13px;
    color: #666;
  }
  
  .btn-close-student {
    position: absolute;
    top: 0;
    right: 0;
    background: none;
    border: none;
    color: #999;
    font-size: 20px;
    cursor: pointer;
    padding: 5px;
  }
  
  .btn-close-student:hover {
    color: #ef4444;
  }
  
  .sales-cart-section {
    flex: 1;
    overflow-y: auto;
    padding: 15px;
    background: #fff;
  }
  
  .cart-empty-state {
    text-align: center;
    color: #999;
    padding: 40px 20px;
    font-size: 14px;
    line-height: 1.5;
  }
  
  .sales-footer-actions {
    padding: 15px;
    border-top: 1px solid #e0e0e0;
    background: #f8f9fa;
    display: flex;
    gap: 10px;
  }
  
  .sales-footer-actions .btn {
    flex: 1;
  }
  
  @media (max-width: 1024px) {
    .sales-container {
      flex-direction: column;
    }
    
    .sales-right-panel {
      width: 100%;
      min-width: 0;
      min-height: 300px;
    }
  }
  
  .package-price-preview {
    margin: 20px 0;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 4px;
    border-left: 4px solid #3b82f6;
  }
  
  .price-preview-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
    font-size: 16px;
  }
  
  .price-preview-item:last-child {
    margin-bottom: 0;
    padding-top: 10px;
    border-top: 1px solid #e0e0e0;
  }
  
  .price-label {
    color: #333;
    font-weight: 500;
  }
  
  .price-value {
    color: #333;
    font-weight: bold;
  }
  
  .price-value.save {
    color: #10b981;
  }
  
  .btn-sm {
    padding: 4px 8px;
    font-size: 12px;
  }
  
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
  }
  
  @media (max-width: 768px) {
    .form-row {
      grid-template-columns: 1fr;
    }
  }

  /* Sales Class Selection Styles */
  .class-selection-header {
    display: flex;
    align-items: center;
    padding: 15px;
    border-bottom: 1px solid #e0e0e0;
    background: #f8f9fa;
  }
  
  .btn-back {
    background: none;
    border: none;
    color: #667eea;
    font-size: 14px;
    cursor: pointer;
    margin-right: 15px;
    padding: 5px;
    font-weight: 500;
  }
  
  .btn-back:hover {
    text-decoration: underline;
  }
  
  .selection-title h3 {
    margin: 0;
    font-size: 16px;
    color: #333;
  }
  
  .selection-subtitle {
    font-size: 12px;
    color: #666;
  }
  
  .class-selection-controls {
    padding: 15px;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fff;
  }
  
  .selection-mode {
    display: flex;
    gap: 15px;
  }
  
  .selection-mode label {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    font-size: 14px;
    color: #333;
  }
  
  .lessons-count {
    font-size: 14px;
    color: #666;
  }
  
  .available-classes-list {
    padding: 15px;
    overflow-y: auto;
    flex: 1;
  }
  
  .class-selection-item {
    margin-bottom: 10px;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    transition: all 0.2s;
  }
  
  .class-selection-item:hover {
    border-color: #667eea;
    background: #f8f9fa;
  }
  
  .class-checkbox-label {
    display: flex;
    align-items: center;
    padding: 12px;
    cursor: pointer;
    width: 100%;
  }
  
  .class-select-cb {
    margin-right: 15px;
    width: 18px;
    height: 18px;
  }
  
  .class-info {
    flex: 1;
  }
  
  .class-date {
    font-weight: 600;
    color: #333;
  }
  
  .class-time {
    color: #666;
    font-size: 13px;
  }
  
  .class-teacher {
    color: #888;
    font-size: 12px;
  }
  
  .class-selection-actions {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #e0e0e0;
  }
  
  .btn-block {
    display: block;
    width: 100%;
  }
  
  /* Cart Item Styles */
  .cart-item {
    background: #f8f9fa;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 10px;
  }
  
  .cart-item-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 5px;
  }
  
  .cart-item-title {
    font-weight: 600;
    color: #333;
    font-size: 14px;
  }
  
  .cart-item-price {
    font-weight: bold;
    color: #333;
  }
  
  .cart-item-details {
    font-size: 12px;
    color: #666;
    margin-bottom: 8px;
  }
  
  .btn-remove-item {
    background: none;
    border: none;
    color: #ef4444;
    font-size: 12px;
    cursor: pointer;
    padding: 0;
  }
  
  .btn-remove-item:hover {
    text-decoration: underline;
  }
  
  .cart-total {
    display: flex;
    justify-content: space-between;
    padding: 15px 0;
    border-top: 2px solid #e0e0e0;
    margin-top: 15px;
    font-weight: bold;
    font-size: 16px;
    color: #333;
  }
`;

// ==================== Course Package Management ====================

// Package state
let packages = [];
let packageCurrentSort = { field: 'createdAt', direction: 'desc' };
let packageCurrentSearch = '';
let packageStatusFilter = 'all';
let packageValidityFilter = 'all';
let expandedPackageIds = new Set();

// Load packages from API
async function loadPackages() {
  try {
    // Ensure courses are loaded first (needed for price calculations)
    if (!window.courses || window.courses.length === 0) {
      await loadCourses();
    }
    
    const response = await window.authUtils.authenticatedFetch('/organizations/packages');
    if (!response) return;
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to load packages');
    }
    
    packages = await response.json();
    
    // Check for expired packages and update status
    const now = new Date();
    packages.forEach(pkg => {
      if (pkg.status === 'active' && pkg.endDate) {
        const endDate = new Date(pkg.endDate);
        if (endDate < now) {
          pkg.status = 'inactive';
        }
      }
    });
    
    renderPackages();
  } catch (error) {
    console.error('Error loading packages:', error);
    showToast('Failed to load packages. Please try again.', 'error');
    renderPackagesError();
  }
}

// Render packages list
function renderPackages() {
  const container = document.getElementById('packagesListContainer');
  if (!container) return;
  
  // Filter packages
  let filteredPackages = packages.filter(pkg => {
    // Search filter
    if (packageCurrentSearch && !pkg.name.toLowerCase().includes(packageCurrentSearch)) {
      return false;
    }
    
    // Status filter
    if (packageStatusFilter !== 'all' && pkg.status !== packageStatusFilter) {
      return false;
    }
    
    // Validity filter
    if (packageValidityFilter !== 'all') {
      const now = new Date();
      if (packageValidityFilter === 'valid') {
        if (!pkg.startDate || !pkg.endDate) return false;
        const start = new Date(pkg.startDate);
        const end = new Date(pkg.endDate);
        if (start > now || end < now) return false;
      } else if (packageValidityFilter === 'expired') {
        if (!pkg.endDate) return false;
        const end = new Date(pkg.endDate);
        if (end >= now) return false;
      } else if (packageValidityFilter === 'no-expiry') {
        if (pkg.startDate || pkg.endDate) return false;
      }
    }
    
    return true;
  });
  
  // Sort packages
  filteredPackages.sort((a, b) => {
    let aVal, bVal;
    
    switch (packageCurrentSort.field) {
      case 'name':
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
        break;
      case 'price':
        aVal = getPackagePrice(a);
        bVal = getPackagePrice(b);
        break;
      case 'createdAt':
      default:
        aVal = new Date(a.createdAt);
        bVal = new Date(b.createdAt);
        break;
    }
    
    if (aVal < bVal) return packageCurrentSort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return packageCurrentSort.direction === 'asc' ? 1 : -1;
    return 0;
  });
  
  // Empty state
  if (filteredPackages.length === 0) {
    if (packageCurrentSearch || packageStatusFilter !== 'all' || packageValidityFilter !== 'all') {
      container.innerHTML = '<p>No packages found matching your criteria.</p>';
    } else {
      container.innerHTML = '<p>No packages yet. Click \'Create\' to add your first package.</p>';
    }
    return;
  }
  
  // Render table
  let html = `
    <table class="courses-table">
      <thead>
        <tr>
          <th style="width: 200px;">Package Name</th>
          <th style="width: 200px;">Included Courses</th>
          <th style="width: 120px;">Original Price</th>
          <th style="width: 120px;">Package Price</th>
          <th style="width: 100px;">Discount</th>
          <th style="width: 120px;">Status</th>
          <th style="width: 120px;">Validity</th>
          <th style="width: 100px;">Actions</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  filteredPackages.forEach(pkg => {
    const originalPrice = calculateOriginalPrice(pkg);
    const packagePrice = getPackagePrice(pkg);
    const discount = originalPrice - packagePrice;
    const discountPercent = originalPrice > 0 ? ((discount / originalPrice) * 100).toFixed(1) : 0;
    const isExpanded = expandedPackageIds.has(pkg.id);
    const validityStatus = getValidityStatus(pkg);
    const hasDeletedCourse = checkHasDeletedCourse(pkg);
    
    html += `
      <tr>
        <td>${escapeHtml(pkg.name)}</td>
        <td>
          <div class="package-courses-cell">
            <span class="package-courses-summary" onclick="togglePackageDetails('${pkg.id}')" style="cursor: pointer;">
              ${pkg.courses ? pkg.courses.length : 0} course(s) ${isExpanded ? '▼' : '▶'}
            </span>
            ${isExpanded ? `
              <div class="package-courses-details">
                ${getPackageCoursesDetails(pkg)}
                <div class="package-total">Total: $${formatNumber(originalPrice)}</div>
              </div>
            ` : ''}
          </div>
        </td>
        <td>$${formatNumber(originalPrice)}</td>
        <td>$${formatNumber(packagePrice)}</td>
        <td>$${formatNumber(discount)} (${discountPercent}%)</td>
        <td>
          <span class="package-status ${pkg.status}">
            ${pkg.status === 'inactive' && hasDeletedCourse ? 'Inactive (Course Deleted)' : pkg.status.charAt(0).toUpperCase() + pkg.status.slice(1)}
          </span>
        </td>
        <td>${validityStatus}</td>
        <td>
          <button class="btn btn-secondary" onclick="openEditPackageModal('${pkg.id}')">Edit</button>
          <button class="btn btn-danger" onclick="deletePackage('${pkg.id}', '${escapeHtml(pkg.name)}')">Delete</button>
        </td>
      </tr>
    `;
  });
  
  html += `
      </tbody>
    </table>
  `;
  
  container.innerHTML = html;
}

// Helper functions for packages
function calculateOriginalPrice(pkg) {
  if (!pkg.courses || pkg.courses.length === 0) return 0;
  
  let total = 0;
  pkg.courses.forEach(courseItem => {
    const course = (window.courses || []).find(c => c.id === courseItem.courseId);
    if (course) {
      total += course.price * courseItem.quantity;
    }
  });
  
  return total;
}

function getPackagePrice(pkg) {
  if (pkg.priceStrategy === 'fixed') {
    return pkg.fixedPrice || 0;
  } else if (pkg.priceStrategy === 'discount') {
    const originalPrice = calculateOriginalPrice(pkg);
    const discount = (originalPrice * (pkg.discountPercentage || 0)) / 100;
    return originalPrice - discount;
  } else if (pkg.priceStrategy === 'custom') {
    return pkg.customPrice || 0;
  }
  return 0;
}

function getValidityStatus(pkg) {
  if (!pkg.startDate && !pkg.endDate) {
    return 'N/A';
  }
  
  const now = new Date();
  if (pkg.endDate) {
    const end = new Date(pkg.endDate);
    if (end < now) {
      return 'Expired';
    }
    return `Valid until ${formatDate(pkg.endDate)}`;
  }
  
  return 'N/A';
}

function checkHasDeletedCourse(pkg) {
  if (!pkg.courses || pkg.courses.length === 0) return false;
  
  return pkg.courses.some(courseItem => {
    const course = (window.courses || []).find(c => c.id === courseItem.courseId);
    return !course;
  });
}

function getPackageCoursesDetails(pkg) {
  if (!pkg.courses || pkg.courses.length === 0) return '';
  
  let html = '';
  pkg.courses.forEach(courseItem => {
    const course = (window.courses || []).find(c => c.id === courseItem.courseId);
    if (course) {
      const subtotal = course.price * courseItem.quantity;
      html += `
        <div class="package-course-detail">
          ${escapeHtml(course.name)} - $${formatNumber(course.price)}/lesson × ${courseItem.quantity} = $${formatNumber(subtotal)}
        </div>
      `;
    } else {
      html += `
        <div class="package-course-detail deleted">
          Course Deleted (ID: ${courseItem.courseId}) × ${courseItem.quantity}
        </div>
      `;
    }
  });
  
  return html;
}

function togglePackageDetails(packageId) {
  if (expandedPackageIds.has(packageId)) {
    expandedPackageIds.delete(packageId);
  } else {
    expandedPackageIds.add(packageId);
  }
  renderPackages();
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Package search and filter handlers
window.handlePackageSearch = function() {
  packageCurrentSearch = document.getElementById('packageSearch').value.toLowerCase().trim();
  renderPackages();
};

window.handlePackageFilter = function() {
  packageStatusFilter = document.getElementById('packageStatusFilter').value;
  packageValidityFilter = document.getElementById('packageValidityFilter').value;
  renderPackages();
};

window.handlePackageSort = function() {
  const sortValue = document.getElementById('packageSort').value;
  const [field, direction] = sortValue.split('-');
  
  packageCurrentSort = { field, direction };
  renderPackages();
};

function renderPackagesError() {
  const container = document.getElementById('packagesListContainer');
  if (container) {
    container.innerHTML = '<p>Error loading packages. Please refresh the page.</p>';
  }
}

// Open create package modal
window.openCreatePackageModal = function() {
  openPackageModal(null);
};

// Open edit package modal
window.openEditPackageModal = function(packageId) {
  const pkg = packages.find(p => p.id === packageId);
  if (!pkg) {
    showToast('Package not found', 'error');
    return;
  }
  openPackageModal(pkg);
};

// Open package modal (create or edit)
function openPackageModal(pkg) {
  const isEdit = !!pkg;
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'packageModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 800px;">
      <div class="modal-header">
        <h2>${isEdit ? 'Edit Package' : 'Create New Package'}</h2>
        <button class="modal-close" onclick="closePackageModal()">&times;</button>
      </div>
      <div class="modal-body">
        <form id="packageForm" onsubmit="savePackage(event, ${isEdit ? `'${pkg.id}'` : 'null'})">
          <div class="form-group">
            <label>Package Name <span class="required">*</span></label>
            <input type="text" id="packageName" required maxlength="50" value="${isEdit ? escapeHtml(pkg.name) : ''}">
            <div class="error-message" id="packageNameError"></div>
          </div>
          
          <div class="form-group">
            <label>Courses <span class="required">*</span></label>
            <div class="package-courses-table-container">
              <table class="package-courses-table">
                <thead>
                  <tr>
                    <th>Course Name</th>
                    <th style="width: 100px;">Quantity</th>
                    <th style="width: 120px;">Price/lesson</th>
                    <th style="width: 120px;">Subtotal</th>
                    <th style="width: 60px;">Action</th>
                  </tr>
                </thead>
                <tbody id="packageCoursesTableBody">
                  ${isEdit && pkg.courses ? pkg.courses.map((courseItem, index) => {
                    const course = (window.courses || []).find(c => c.id === courseItem.courseId);
                    return `
                      <tr data-course-index="${index}">
                        <td>
                          <select class="package-course-select" onchange="updatePackageCoursePrice(this, ${index})">
                            <option value="">Select Course</option>
                            ${(window.courses || []).map(c => `
                              <option value="${c.id}" ${courseItem.courseId === c.id ? 'selected' : ''}>
                                ${escapeHtml(c.name)} - $${formatNumber(c.price)}/lesson
                              </option>
                            `).join('')}
                          </select>
                        </td>
                        <td>
                          <input type="number" class="package-course-quantity" min="1" max="999" value="${courseItem.quantity}" 
                                 onchange="updatePackageCourseSubtotal(${index})" oninput="updatePackagePricePreview()">
                        </td>
                        <td class="package-course-price">${course ? `$${formatNumber(course.price)}` : 'N/A'}</td>
                        <td class="package-course-subtotal">${course ? `$${formatNumber(course.price * courseItem.quantity)}` : 'N/A'}</td>
                        <td>
                          <button type="button" class="btn btn-danger btn-sm" onclick="removePackageCourseRow(${index})">Remove</button>
                        </td>
                      </tr>
                    `;
                  }).join('') : ''}
                </tbody>
              </table>
              <button type="button" class="btn btn-secondary" onclick="addPackageCourseRow()" style="margin-top: 10px;">Add Course</button>
            </div>
            <div class="error-message" id="packageCoursesError"></div>
          </div>
          
          <div class="package-price-preview">
            <div class="price-preview-item">
              <span class="price-label">Original Price:</span>
              <span class="price-value" id="packageOriginalPrice">$0.00</span>
            </div>
            <div class="price-preview-item">
              <span class="price-label">Discounted Price:</span>
              <span class="price-value" id="packageDiscountedPrice">$0.00</span>
            </div>
            <div class="price-preview-item">
              <span class="price-label">Package Price:</span>
              <span class="price-value save" id="packageFinalPrice">$0.00</span>
            </div>
          </div>
          
          <div class="form-group">
            <label>Price Strategy <span class="required">*</span></label>
            <select id="packagePriceStrategy" required onchange="updatePackagePriceStrategy()">
              <option value="">Please select</option>
              <option value="fixed" ${isEdit && pkg.priceStrategy === 'fixed' ? 'selected' : ''}>Fixed Price</option>
              <option value="discount" ${isEdit && pkg.priceStrategy === 'discount' ? 'selected' : ''}>Discount Percentage</option>
              <option value="custom" ${isEdit && pkg.priceStrategy === 'custom' ? 'selected' : ''}>Custom Price</option>
            </select>
            <div class="error-message" id="packagePriceStrategyError"></div>
          </div>
          
          <div class="form-group" id="packagePriceInputGroup" style="display: none;">
            <label id="packagePriceLabel"></label>
            <input type="text" id="packagePriceInput" placeholder="0.00" oninput="updatePackagePricePreview()" onblur="formatPriceInput(this)" onfocus="unformatPriceInput(this)">
            <div class="error-message" id="packagePriceError"></div>
          </div>
          
          <div class="form-group">
            <label>Description (Optional)</label>
            <textarea id="packageDescription" maxlength="500" rows="3" style="width: 100%; padding: 8px 12px; border: 2px solid rgba(255, 255, 255, 0.3); border-radius: 4px; background: rgba(255, 255, 255, 0.1); color: #fff; box-sizing: border-box; resize: vertical;">${isEdit && pkg.description ? escapeHtml(pkg.description) : ''}</textarea>
            <div class="input-hint">Maximum 500 characters</div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>Start Date (Optional)</label>
              <input type="date" id="packageStartDate" value="${isEdit && pkg.startDate ? pkg.startDate.split('T')[0] : ''}">
            </div>
            <div class="form-group">
              <label>End Date (Optional)</label>
              <input type="date" id="packageEndDate" value="${isEdit && pkg.endDate ? pkg.endDate.split('T')[0] : ''}" onchange="validatePackageDates()">
            </div>
          </div>
          
          <div class="form-group">
            <label>Status</label>
            <select id="packageStatus">
              <option value="active" ${isEdit && pkg.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="inactive" ${isEdit && pkg.status === 'inactive' ? 'selected' : ''}>Inactive</option>
              <option value="archived" ${isEdit && pkg.status === 'archived' ? 'selected' : ''}>Archived</option>
            </select>
          </div>
          
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closePackageModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="savePackageBtn">${isEdit ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  window.currentPackageModal = modal;
  
  // Store package ID in modal for reference
  if (isEdit) {
    modal.dataset.packageId = pkg.id;
  }
  
  // Initialize packageCourseRowIndex
  if (isEdit && pkg.courses) {
    packageCourseRowIndex = pkg.courses.length;
  } else {
    packageCourseRowIndex = 0;
  }
  
  // Initialize price preview
  updatePackagePricePreview();
  
  // If editing, set price input based on strategy
  if (isEdit) {
    updatePackagePriceStrategy();
  }
}

// Package modal helper functions
let packageCourseRowIndex = 0;

function addPackageCourseRow() {
  const tbody = document.getElementById('packageCoursesTableBody');
  if (!tbody) return;
  
  const row = document.createElement('tr');
  row.setAttribute('data-course-index', packageCourseRowIndex);
  row.innerHTML = `
    <td>
      <select class="package-course-select" onchange="updatePackageCoursePrice(this, ${packageCourseRowIndex})">
        <option value="">Select Course</option>
        ${(window.courses || []).map(c => `
          <option value="${c.id}">${escapeHtml(c.name)} - $${formatNumber(c.price)}/lesson</option>
        `).join('')}
      </select>
    </td>
    <td>
      <input type="number" class="package-course-quantity" min="1" max="999" value="1" 
             onchange="updatePackageCourseSubtotal(${packageCourseRowIndex})" oninput="updatePackagePricePreview()">
    </td>
    <td class="package-course-price">-</td>
    <td class="package-course-subtotal">-</td>
    <td>
      <button type="button" class="btn btn-danger btn-sm" onclick="removePackageCourseRow(${packageCourseRowIndex})">Remove</button>
    </td>
  `;
  
  tbody.appendChild(row);
  packageCourseRowIndex++;
}

function removePackageCourseRow(index) {
  const row = document.querySelector(`#packageCoursesTableBody tr[data-course-index="${index}"]`);
  if (row) {
    row.remove();
    updatePackagePricePreview();
  }
}

function updatePackageCoursePrice(select, index) {
  const courseId = select.value;
  const course = (window.courses || []).find(c => c.id === courseId);
  const row = select.closest('tr');
  const priceCell = row.querySelector('.package-course-price');
  const quantityInput = row.querySelector('.package-course-quantity');
  
  if (course) {
    priceCell.textContent = `$${formatNumber(course.price)}`;
    updatePackageCourseSubtotal(index);
  } else {
    priceCell.textContent = '-';
    row.querySelector('.package-course-subtotal').textContent = '-';
  }
  updatePackagePricePreview();
}

function updatePackageCourseSubtotal(index) {
  const row = document.querySelector(`#packageCoursesTableBody tr[data-course-index="${index}"]`);
  if (!row) return;
  
  const select = row.querySelector('.package-course-select');
  const quantityInput = row.querySelector('.package-course-quantity');
  const subtotalCell = row.querySelector('.package-course-subtotal');
  
  const courseId = select.value;
  const quantity = parseInt(quantityInput.value) || 0;
  const course = (window.courses || []).find(c => c.id === courseId);
  
  if (course && quantity > 0) {
    const subtotal = course.price * quantity;
    subtotalCell.textContent = `$${formatNumber(subtotal)}`;
  } else {
    subtotalCell.textContent = '-';
  }
  updatePackagePricePreview();
}

function updatePackagePriceStrategy() {
  const strategy = document.getElementById('packagePriceStrategy').value;
  const inputGroup = document.getElementById('packagePriceInputGroup');
  const label = document.getElementById('packagePriceLabel');
  const input = document.getElementById('packagePriceInput');
  const modal = document.getElementById('packageModal');
  const pkg = modal && modal.dataset.packageId ? packages.find(p => p.id === modal.dataset.packageId) : null;
  
  if (strategy === 'fixed') {
    inputGroup.style.display = 'block';
    label.innerHTML = 'Fixed Price <span class="required">*</span>';
    input.placeholder = '0.00';
    input.value = pkg && pkg.fixedPrice ? pkg.fixedPrice.toFixed(2) : '';
  } else if (strategy === 'discount') {
    inputGroup.style.display = 'block';
    label.innerHTML = 'Discount Percentage <span class="required">*</span>';
    input.placeholder = '0-100';
    input.value = pkg && pkg.discountPercentage ? pkg.discountPercentage.toFixed(1) : '';
    // Auto-suggest 10% discount
    if (!pkg && !input.value) {
      input.value = '10';
    }
  } else if (strategy === 'custom') {
    inputGroup.style.display = 'block';
    label.innerHTML = 'Custom Price <span class="required">*</span>';
    input.placeholder = '0.00';
    input.value = pkg && pkg.customPrice ? pkg.customPrice.toFixed(2) : '';
  } else {
    inputGroup.style.display = 'none';
  }
  
  updatePackagePricePreview();
}

function updatePackagePricePreview() {
  const originalPrice = calculatePackageOriginalPriceFromForm();
  const strategy = document.getElementById('packagePriceStrategy')?.value;
  const priceInput = document.getElementById('packagePriceInput')?.value;
  
  let finalPrice = originalPrice;
  
  if (strategy === 'fixed' && priceInput) {
    finalPrice = parseFloat(priceInput.replace(/,/g, '')) || 0;
  } else if (strategy === 'discount' && priceInput) {
    const discount = parseFloat(priceInput) || 0;
    finalPrice = originalPrice - (originalPrice * discount / 100);
  } else if (strategy === 'custom' && priceInput) {
    finalPrice = parseFloat(priceInput.replace(/,/g, '')) || 0;
  }
  
  const discountedAmount = originalPrice - finalPrice;
  
  document.getElementById('packageOriginalPrice').textContent = `$${formatNumber(originalPrice)}`;
  document.getElementById('packageDiscountedPrice').textContent = `$${formatNumber(discountedAmount)}`;
  document.getElementById('packageFinalPrice').textContent = `$${formatNumber(finalPrice)}`;
}

function calculatePackageOriginalPriceFromForm() {
  const rows = document.querySelectorAll('#packageCoursesTableBody tr');
  let total = 0;
  
  rows.forEach(row => {
    const select = row.querySelector('.package-course-select');
    const quantityInput = row.querySelector('.package-course-quantity');
    
    const courseId = select?.value;
    const quantity = parseInt(quantityInput?.value) || 0;
    
    if (courseId && quantity > 0) {
      const course = (window.courses || []).find(c => c.id === courseId);
      if (course) {
        total += course.price * quantity;
      }
    }
  });
  
  return total;
}

function validatePackageDates() {
  const startDate = document.getElementById('packageStartDate').value;
  const endDate = document.getElementById('packageEndDate').value;
  
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (end <= start) {
      showPackageFieldError('packageEndDate', 'End date must be after start date');
      return false;
    }
  }
  
  return true;
}

// Save package
async function savePackage(event, packageId) {
  event.preventDefault();
  
  // Clear previous errors
  clearPackageErrors();
  
  // Get form data
  const name = document.getElementById('packageName').value.trim();
  const strategy = document.getElementById('packagePriceStrategy').value;
  const description = document.getElementById('packageDescription').value.trim();
  const startDate = document.getElementById('packageStartDate').value;
  const endDate = document.getElementById('packageEndDate').value;
  const status = document.getElementById('packageStatus').value;
  
  // Validate dates
  if (!validatePackageDates()) {
    return;
  }
  
  // Get courses from table
  const rows = document.querySelectorAll('#packageCoursesTableBody tr');
  const courses = [];
  
  rows.forEach(row => {
    const select = row.querySelector('.package-course-select');
    const quantityInput = row.querySelector('.package-course-quantity');
    
    const courseId = select?.value;
    const quantity = parseInt(quantityInput?.value) || 0;
    
    if (courseId && quantity > 0) {
      courses.push({ courseId, quantity });
    }
  });
  
  // Validation
  if (!name) {
    showPackageFieldError('packageName', 'Package name is required');
    return;
  }
  
  if (courses.length === 0) {
    showPackageFieldError('packageCoursesError', 'At least one course is required');
    return;
  }
  
  if (!strategy) {
    showPackageFieldError('packagePriceStrategy', 'Price strategy is required');
    return;
  }
  
  let priceValue = null;
  if (strategy === 'fixed') {
    const fixedPrice = document.getElementById('packagePriceInput').value.replace(/,/g, '');
    if (!fixedPrice) {
      showPackageFieldError('packagePriceError', 'Fixed price is required');
      return;
    }
    priceValue = parseFloat(fixedPrice);
    if (isNaN(priceValue) || priceValue < 0) {
      showPackageFieldError('packagePriceError', 'Fixed price must be a valid number >= 0');
      return;
    }
  } else if (strategy === 'discount') {
    const discount = document.getElementById('packagePriceInput').value;
    if (!discount) {
      showPackageFieldError('packagePriceError', 'Discount percentage is required');
      return;
    }
    priceValue = parseFloat(discount);
    if (isNaN(priceValue) || priceValue < 0 || priceValue > 100) {
      showPackageFieldError('packagePriceError', 'Discount percentage must be between 0 and 100');
      return;
    }
  } else if (strategy === 'custom') {
    const customPrice = document.getElementById('packagePriceInput').value.replace(/,/g, '');
    if (!customPrice) {
      showPackageFieldError('packagePriceError', 'Custom price is required');
      return;
    }
    priceValue = parseFloat(customPrice);
    if (isNaN(priceValue) || priceValue < 0) {
      showPackageFieldError('packagePriceError', 'Custom price must be a valid number >= 0');
      return;
    }
  }
  
  // Prepare request body
  const body = {
    name,
    courses,
    priceStrategy: strategy,
    description: description || null,
    startDate: startDate || null,
    endDate: endDate || null,
    status: status || 'active'
  };
  
  if (strategy === 'fixed') {
    body.fixedPrice = priceValue;
  } else if (strategy === 'discount') {
    body.discountPercentage = priceValue;
  } else if (strategy === 'custom') {
    body.customPrice = priceValue;
  }
  
  try {
    const url = packageId 
      ? `/organizations/packages/${packageId}`
      : '/organizations/packages';
    
    const method = packageId ? 'PUT' : 'POST';
    
    const response = await window.authUtils.authenticatedFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (!response) return;
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to save package');
    }
    
    showToast(packageId ? 'Package updated successfully!' : 'Package created successfully!', 'success');
    closePackageModal();
    await loadPackages();
  } catch (error) {
    console.error('Error saving package:', error);
    showToast(error.message || 'Failed to save package', 'error');
  }
}

// Delete package
async function deletePackage(packageId, packageName) {
  // TODO: Check for purchase records in the future
  // For now, show confirmation dialog
  if (!confirm(`Are you sure you want to delete "${packageName}"?\n\nNote: If this package has purchase records, it will be marked as Archived instead of being deleted.`)) {
    return;
  }
  
  try {
    const response = await window.authUtils.authenticatedFetch(`/organizations/packages/${packageId}`, {
      method: 'DELETE'
    });
    
    if (!response) return;
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete package');
    }
    
    showToast('Package deleted successfully!', 'success');
    await loadPackages();
  } catch (error) {
    console.error('Error deleting package:', error);
    showToast(error.message || 'Failed to delete package', 'error');
  }
}

// Close package modal
window.closePackageModal = function() {
  const modal = document.getElementById('packageModal');
  if (modal) {
    modal.remove();
  }
  window.currentPackageModal = null;
  packageCourseRowIndex = 0;
};

function showPackageFieldError(fieldId, message) {
  const errorElement = document.getElementById(fieldId + 'Error') || document.getElementById(fieldId);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }
}

function clearPackageErrors() {
  document.querySelectorAll('#packageForm .error-message').forEach(el => {
    el.textContent = '';
    el.style.display = 'none';
  });
}

document.head.appendChild(style);
