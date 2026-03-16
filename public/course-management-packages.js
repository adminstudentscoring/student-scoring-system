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
    
    const isMonthly = pkg.priceStrategy === 'monthly';
    const packagePriceDisplay = isMonthly 
        ? `$${formatNumber(pkg.monthlyLessonPrice)}/lesson (${pkg.monthlyPeriod} mo)`
        : `$${formatNumber(packagePrice)}`;
    
    const discountDisplay = isMonthly
        ? '-'
        : `$${formatNumber(discount)} (${discountPercent}%)`;
    
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
        <td>${packagePriceDisplay}</td>
        <td>${discountDisplay}</td>
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
  } else if (pkg.priceStrategy === 'monthly') {
    return pkg.monthlyLessonPrice || 0;
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
              <option value="monthly" ${isEdit && pkg.priceStrategy === 'monthly' ? 'selected' : ''}>Monthly Pay</option>
            </select>
            <div class="error-message" id="packagePriceStrategyError"></div>
          </div>
          
          <div class="form-group" id="packagePriceInputGroup" style="display: none;">
            <label id="packagePriceLabel"></label>
            <input type="text" id="packagePriceInput" placeholder="0.00" oninput="updatePackagePricePreview()" onblur="formatPriceInput(this)" onfocus="unformatPriceInput(this)">
            <div class="error-message" id="packagePriceError"></div>
          </div>

          <div class="form-group" id="packageMonthlyGroup" style="display: none;">
            <div style="display: flex; gap: 15px;">
                <div style="flex: 1;">
                    <label>Each Lesson Price <span class="required">*</span></label>
                    <input type="number" id="monthlyLessonPrice" min="0" step="0.01" placeholder="0.00" value="${isEdit && pkg.monthlyLessonPrice ? pkg.monthlyLessonPrice : ''}" oninput="updatePackagePricePreview()">
                </div>
                <div style="flex: 1;">
                    <label>Period (Months) <span class="required">*</span></label>
                    <input type="number" id="monthlyPeriod" min="1" step="1" placeholder="1" value="${isEdit && pkg.monthlyPeriod ? pkg.monthlyPeriod : ''}" oninput="updatePackagePricePreview()">
                </div>
            </div>
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
  const monthlyGroup = document.getElementById('packageMonthlyGroup');
  const label = document.getElementById('packagePriceLabel');
  const input = document.getElementById('packagePriceInput');
  const modal = document.getElementById('packageModal');
  const pkg = modal && modal.dataset.packageId ? packages.find(p => p.id === modal.dataset.packageId) : null;
  
  inputGroup.style.display = 'none';
  monthlyGroup.style.display = 'none';
  
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
  } else if (strategy === 'monthly') {
    monthlyGroup.style.display = 'block';
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
  } else if (strategy === 'monthly') {
    const mp = parseFloat(document.getElementById('monthlyLessonPrice')?.value) || 0;
    const mper = parseInt(document.getElementById('monthlyPeriod')?.value) || 0;
    document.getElementById('packageOriginalPrice').textContent = `$${formatNumber(originalPrice)}`;
    document.getElementById('packageDiscountedPrice').textContent = '-';
    document.getElementById('packageFinalPrice').textContent = `$${formatNumber(mp)}/lesson (${mper} mo)`;
    return;
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
  let monthlyLessonPrice = null;
  let monthlyPeriod = null;

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
  } else if (strategy === 'monthly') {
    const mp = document.getElementById('monthlyLessonPrice').value;
    const mper = document.getElementById('monthlyPeriod').value;
    if (!mp || !mper) {
      showPackageFieldError('packagePriceStrategy', 'Monthly price and period are required');
      return;
    }
    monthlyLessonPrice = parseFloat(mp);
    monthlyPeriod = parseInt(mper);
    if (isNaN(monthlyLessonPrice) || monthlyLessonPrice < 0) {
        showPackageFieldError('packagePriceStrategy', 'Monthly price must be valid');
        return;
    }
    if (isNaN(monthlyPeriod) || monthlyPeriod < 1) {
        showPackageFieldError('packagePriceStrategy', 'Period must be at least 1 month');
        return;
    }
  }
  
  // Prepare request body
  const body = {
    name,
    courses,
    priceStrategy: strategy,
    monthlyLessonPrice: strategy === 'monthly' ? monthlyLessonPrice : null,
    monthlyPeriod: strategy === 'monthly' ? monthlyPeriod : null,
    fixedPrice: strategy === 'fixed' ? priceValue : null,
    discountPercentage: strategy === 'discount' ? priceValue : null,
    customPrice: strategy === 'custom' ? priceValue : null,
    description: description || null,
    startDate: startDate || null,
    endDate: endDate || null,
    status: status || 'active'
  };
  
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

