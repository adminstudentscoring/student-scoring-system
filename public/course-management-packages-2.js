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
