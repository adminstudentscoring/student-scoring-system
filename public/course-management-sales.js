// Sales Management Module
// Handles sales, enrollment, and POS functionality

// State
let salesState = {
  selectedStudent: null,
  cart: [],
  products: [], // Combined list of courses and packages
  packages: [], // Cache packages
  step: 1, // 1: Product Selection, 2: Class/Date Selection
  selectedProduct: null, // The product being configured
  classSelection: {
    courseId: null,
    selectedDates: new Set()
  }
};

// Initialize Sales Module
window.loadSalesModule = function() {
  loadSalesProducts();
  // Initialize student search is handled by event listeners in HTML
  
  // Setup event listeners if not already set
  setupSalesEventListeners();
};

function setupSalesEventListeners() {
  // Any specific event listeners for sales module
}

// Load Sales Products (Courses and Packages)
async function loadSalesProducts() {
  const container = document.getElementById('salesProductList');
  if (!container) return;
  
  // Reset step if reloading products (back to step 1)
  if (salesState.step !== 1) {
    salesState.step = 1;
    salesState.selectedProduct = null;
    showProductList();
  }
  
  container.innerHTML = '<div class="loading-placeholder">Loading products...</div>';
  
  try {
    // Ensure courses loaded
    if (!window.courses || window.courses.length === 0) {
      if (window.loadCourses) await window.loadCourses();
    }
    
    // Fetch packages if not cached or force reload
    const packagesResponse = await window.authUtils.authenticatedFetch('/organizations/packages');
    if (packagesResponse && packagesResponse.ok) {
      salesState.packages = await packagesResponse.json();
    } else {
      salesState.packages = [];
    }
    
    renderSalesProducts('all', '', salesState.packages);
  } catch (error) {
    console.error('Error loading sales products:', error);
    container.innerHTML = '<div class="error-message">Failed to load products</div>';
  }
}

// Render Sales Products
function renderSalesProducts(category = 'all', searchTerm = '', packages = []) {
  const container = document.getElementById('salesProductList');
  if (!container) return;
  
  const term = searchTerm.toLowerCase();
  let items = [];
  
  // Add Packages
  if (category === 'all' || category === 'packages') {
    const activePackages = packages.filter(p => p.status === 'active');
    items = items.concat(activePackages.map(p => ({
      type: 'package',
      data: p,
      name: p.name,
      price: calculateSalesPackagePrice(p),
      info: `${p.courses.reduce((sum, c) => sum + c.quantity, 0)} lessons`
    })));
  }
  
  // Add Courses (Single Lessons)
  if (category === 'all' || category === 'courses') {
    items = items.concat((window.courses || []).map(c => ({
      type: 'course',
      data: c,
      name: c.name,
      price: parseFloat(c.price),
      info: 'Single lesson'
    })));
  }
  
  // Filter by search
  items = items.filter(item => item.name.toLowerCase().includes(term));
  
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">No products found</div>';
    return;
  }
  
  container.innerHTML = items.map(item => `
    <div class="sales-product-card ${item.type}" onclick="handleProductSelect('${item.type}', '${item.data.id}')">
      <div class="product-type-badge ${item.type}">${item.type === 'package' ? 'Multiple courses' : 'Single Lesson'}</div>
      <div class="product-name">${escapeHtml(item.name)}</div>
      <div class="product-footer">
        <div class="product-info">${item.info}</div>
        <div class="product-price">$${item.price.toFixed(0)}</div>
      </div>
    </div>
  `).join('');
}

// Calculate package price (duplicated helper for independence)
function calculateSalesPackagePrice(pkg) {
  if (pkg.priceStrategy === 'fixed') return parseFloat(pkg.fixedPrice);
  
  // Calculate sum of course prices
  const sum = pkg.courses.reduce((total, item) => {
    const course = (window.courses || []).find(c => c.id === item.courseId);
    const price = course ? parseFloat(course.price) : 0;
    return total + (price * item.quantity);
  }, 0);
  
  if (pkg.priceStrategy === 'discount') {
    return sum * (1 - (parseFloat(pkg.discountPercentage) / 100));
  }
  
  return sum; // Custom strategy or fallback
}

// Handle Product Search
window.handleSalesProductSearch = function() {
  const term = document.getElementById('salesProductSearch').value;
  const activeCategory = document.querySelector('.sales-product-categories .category-btn.active').textContent.toLowerCase();
  // Map button text to category key
  const categoryMap = { 'all': 'all', 'packages': 'packages', 'courses': 'courses' };
  
  if (salesState.packages && salesState.packages.length > 0) {
    renderSalesProducts(categoryMap[activeCategory] || 'all', term, salesState.packages);
  } else {
    loadSalesProducts();
  }
};

// Filter Sales Category
window.filterSalesCategory = function(category) {
  // Update buttons
  document.querySelectorAll('.sales-product-categories .category-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.textContent.toLowerCase() === category || (category === 'all' && btn.textContent === 'All')) {
      btn.classList.add('active');
    }
  });
  
  const term = document.getElementById('salesProductSearch').value;
  if (salesState.packages && salesState.packages.length > 0) {
    renderSalesProducts(category, term, salesState.packages);
  } else {
    loadSalesProducts();
  }
};

// ==================== Step 2: Class/Date Selection ====================

// Handle Product Select (Step 1 -> Step 2)
window.handleProductSelect = function(type, id) {
  if (!salesState.selectedStudent) {
    alert('Please select a student first');
    document.getElementById('salesStudentSearch').focus();
    return;
  }
  
  let product = null;
  if (type === 'package') {
    product = salesState.packages.find(p => p.id === id);
  } else {
    product = (window.courses || []).find(c => c.id === id);
  }
  
  if (!product) return;
  
  salesState.selectedProduct = { type, data: product };
  salesState.step = 2;
  
  // Determine courseId for timetable lookup
  let courseId = null;
  if (type === 'course') {
    courseId = product.id;
  } else if (type === 'package') {
    // Assumption: Package maps to the first course for now
    if (product.courses && product.courses.length > 0) {
      courseId = product.courses[0].courseId;
    }
  }
  
  salesState.classSelection = {
    courseId: courseId,
    selectedDates: new Set()
  };
  
  renderClassSelectionUI();
  loadAvailableClasses(courseId);
};

// Render Class Selection UI (Replaces Product List)
function renderClassSelectionUI() {
  const leftPanel = document.querySelector('.sales-left-panel');
  if (!leftPanel) return;
  
  // Save original content (or just rebuild it when going back)
  // For simplicity, we replace the innerHTML of specific containers
  
  // Hide Search and Categories
  document.querySelector('.sales-product-search').style.display = 'none';
  document.querySelector('.sales-product-categories').style.display = 'none';
  
  const container = document.getElementById('salesProductList');
  container.className = 'sales-class-selection'; // Change class for styling
  
  const product = salesState.selectedProduct.data;
  const productName = escapeHtml(product.name);
  const productType = salesState.selectedProduct.type === 'package' ? 'Package' : 'Course';
  
  container.innerHTML = `
    <div class="class-selection-header">
      <button class="btn-back" onclick="backToProductList()">← Back</button>
      <div class="selection-title">
        <h3>${productName}</h3>
        <span class="selection-subtitle">Select dates for this ${productType}</span>
      </div>
    </div>
    
    <div class="class-selection-controls">
      <div class="selection-mode">
        <label><input type="radio" name="enrollMode" value="consecutive" checked onchange="handleEnrollModeChange(this)"> Consecutive</label>
        <label><input type="radio" name="enrollMode" value="manual" onchange="handleEnrollModeChange(this)"> Manual Pick</label>
      </div>
      <div class="lessons-count" id="lessonsCountDisplay">
        Lessons to enroll: <strong>${productType === 'package' ? getPackageLessonCount(product) : 1}</strong>
      </div>
    </div>
    
    <div id="availableClassesList" class="available-classes-list">
      <div class="loading-placeholder">Loading available classes...</div>
    </div>
  `;
}

function getPackageLessonCount(pkg) {
  if (!pkg.courses) return 0;
  return pkg.courses.reduce((sum, c) => sum + c.quantity, 0);
}

window.backToProductList = function() {
  salesState.step = 1;
  salesState.selectedProduct = null;
  showProductList();
};

function showProductList() {
  // Restore UI
  document.querySelector('.sales-product-search').style.display = 'block';
  document.querySelector('.sales-product-categories').style.display = 'flex';
  
  const container = document.getElementById('salesProductList');
  container.className = 'sales-product-list';
  
  // Reload products
  const term = document.getElementById('salesProductSearch').value;
  const activeCategory = document.querySelector('.sales-product-categories .category-btn.active').textContent.toLowerCase();
  const categoryMap = { 'all': 'all', 'packages': 'packages', 'courses': 'courses' };
  
  if (salesState.packages && salesState.packages.length > 0) {
    renderSalesProducts(categoryMap[activeCategory] || 'all', term, salesState.packages);
  } else {
    loadSalesProducts();
  }
}

// Load Available Classes
async function loadAvailableClasses(courseId) {
  const container = document.getElementById('availableClassesList');
  if (!container) return;
  
  if (!courseId) {
    container.innerHTML = '<div class="empty-state">No linked course found for this package.</div>';
    return;
  }

  try {
    // Fetch timetable entries for this course
    // We need a backend endpoint that returns future instances of a recurring class or single classes
    // Since we don't have a dedicated endpoint for "future instances", we might need to fetch timetable and calculate locally
    // Or reuse GET /organizations/timetable
    
    const response = await window.authUtils.authenticatedFetch('/organizations/timetable');
    if (!response || !response.ok) {
      throw new Error('Failed to load timetable');
    }
    
    const allEntries = await response.json();
    
    // Filter for this course
    const courseEntries = allEntries.filter(e => e.courseId === courseId);
    
    if (courseEntries.length === 0) {
      container.innerHTML = '<div class="empty-state">No classes scheduled for this course. Please add classes in Timetable first.</div>';
      return;
    }
    
    // Generate next 8 weeks of classes
    const futureClasses = generateFutureClasses(courseEntries, 8);
    
    renderAvailableClasses(futureClasses);
    
  } catch (error) {
    console.error('Error loading classes:', error);
    container.innerHTML = '<div class="error-message">Failed to load classes</div>';
  }
}

// Generate future class instances
function generateFutureClasses(entries, weeks = 8) {
  const classes = [];
  const now = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + (weeks * 7));
  
  entries.forEach(entry => {
    if (entry.isRecurring) {
      // Generate dates for recurring entry
      // entry.dayOfWeek: "1" (Mon) - "7" (Sun) or "0" (Sun)? usually 1-7 in our app based on previous context (Mon=1)
      // Actually let's check timetable.json format or assume standard ISO 1-7 (Mon-Sun) or 0-6 (Sun-Sat)
      // In course-management-timetable.js, we see buttons data-day="1" (Mon). So 1=Mon.
      
      let current = new Date(now);
      // Align to next occurrence of dayOfWeek
      const targetDay = parseInt(entry.dayOfWeek); // 1-7
      const currentDay = current.getDay() || 7; // Convert Sun(0) to 7 for easier calc
      
      let daysUntil = targetDay - currentDay;
      if (daysUntil < 0) daysUntil += 7;
      
      current.setDate(current.getDate() + daysUntil);
      
      // If today is the day, check time. If passed, move to next week
      if (daysUntil === 0) {
        const [hours, mins] = entry.startTime.split(':');
        const classTime = new Date(current);
        classTime.setHours(parseInt(hours), parseInt(mins), 0);
        if (classTime < now) {
          current.setDate(current.getDate() + 7);
        }
      }
      
      while (current <= endDate) {
        // Check start/end date constraints of the recurring entry itself
        const entryStart = entry.startDate ? new Date(entry.startDate) : null;
        const entryEnd = entry.endDate ? new Date(entry.endDate) : null;
        
        // Reset time part of current for date comparison
        const dateCheck = new Date(current);
        dateCheck.setHours(0,0,0,0);
        
        let isValid = true;
        if (entryStart) {
          entryStart.setHours(0,0,0,0);
          if (dateCheck < entryStart) isValid = false;
        }
        if (entryEnd) {
          entryEnd.setHours(0,0,0,0);
          if (dateCheck > entryEnd) isValid = false;
        }
        
        if (isValid) {
          classes.push({
            date: new Date(current),
            entry: entry,
            id: `${entry.id}_${current.getTime()}` // Virtual ID
          });
        }
        
        current.setDate(current.getDate() + 7);
      }
    } else {
      // Single entry - check if in future
      // Single entry usually has a specific date? 
      // The current data structure for single entry might not have a date field if it was just "weekly repeat=false"
      // If it's a one-off, it should have a date. 
      // Based on previous turn: "startDate" and "endDate" were added. 
      // If not recurring, it effectively happens once? Or is it just a template?
      // If timetable entry doesn't have a date for single class, it's ambiguous. 
      // Let's assume non-recurring entries are ignored here unless they have a specific date (which we haven't fully implemented for single-slot overrides yet).
      // Or maybe we treat them as templates available every day? Unlikely.
      // Let's stick to recurring for now as that's the main use case.
    }
  });
  
  // Sort by date
  return classes.sort((a, b) => a.date - b.date);
}

function renderAvailableClasses(classes) {
  const container = document.getElementById('availableClassesList');
  if (!container) return;
  
  if (classes.length === 0) {
    container.innerHTML = '<div class="empty-state">No upcoming classes found.</div>';
    return;
  }
  
  window.currentAvailableClasses = classes; // Store for selection logic
  
  const html = classes.map((cls, index) => {
    const dateStr = cls.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = `${cls.entry.startTime} - ${cls.entry.endTime}`;
    
    return `
      <div class="class-selection-item">
        <label class="class-checkbox-label">
          <input type="checkbox" class="class-select-cb" value="${index}" onchange="handleClassSelect(${index})">
          <div class="class-info">
            <div class="class-date">${dateStr}</div>
            <div class="class-time">${timeStr}</div>
            <div class="class-teacher">Teacher: ${cls.entry.teacherName || 'Unknown'}</div>
          </div>
        </label>
      </div>
    `;
  }).join('');
  
  // Add "Confirm Enrollment" button at the bottom
  const actionsHtml = `
    <div class="class-selection-actions">
      <button class="btn btn-primary btn-block" onclick="confirmEnrollment()">Confirm Enrollment</button>
    </div>
  `;
  
  container.innerHTML = html + actionsHtml;
  
  // Auto-select based on mode
  applyEnrollMode();
}

window.handleEnrollModeChange = function(radio) {
  applyEnrollMode();
};

function applyEnrollMode() {
  const mode = document.querySelector('input[name="enrollMode"]:checked').value;
  const checkboxes = document.querySelectorAll('.class-select-cb');
  const limit = salesState.selectedProduct.type === 'package' ? getPackageLessonCount(salesState.selectedProduct.data) : 1;
  
  // Reset
  checkboxes.forEach(cb => cb.checked = false);
  salesState.classSelection.selectedDates.clear();
  
  if (mode === 'consecutive') {
    // Select first N
    for (let i = 0; i < Math.min(checkboxes.length, limit); i++) {
      checkboxes[i].checked = true;
      handleClassSelect(i, true); // Force add
    }
  }
}

window.handleClassSelect = function(index, forceState) {
  const checkbox = document.querySelector(`.class-select-cb[value="${index}"]`);
  if (!checkbox) return;
  
  const isChecked = forceState !== undefined ? forceState : checkbox.checked;
  const cls = window.currentAvailableClasses[index];
  
  if (isChecked) {
    salesState.classSelection.selectedDates.add(cls);
  } else {
    // If consecutive mode, maybe we shouldn't allow unchecking middle ones? 
    // For now allow flexibility.
    salesState.classSelection.selectedDates.forEach(item => {
        if (item.id === cls.id) salesState.classSelection.selectedDates.delete(item);
    });
  }
  
  // Update count in UI?
};

// Confirm Enrollment (Add to Cart)
window.confirmEnrollment = function() {
  const selected = Array.from(salesState.classSelection.selectedDates);
  
  if (selected.length === 0) {
    alert('Please select at least one class date.');
    return;
  }
  
  // Create Order Item
  const orderItem = {
    id: Date.now().toString(), // Temp ID
    productType: salesState.selectedProduct.type,
    productData: salesState.selectedProduct.data,
    enrolledClasses: selected,
    price: salesState.selectedProduct.type === 'package' 
      ? calculateSalesPackagePrice(salesState.selectedProduct.data)
      : parseFloat(salesState.selectedProduct.data.price) * selected.length
  };
  
  // Add to cart
  salesState.cart.push(orderItem);
  
  // Reset Step
  salesState.step = 1;
  salesState.selectedProduct = null;
  showProductList();
  
  // Render Cart
  renderSalesCart();
};

function renderSalesCart() {
  const container = document.getElementById('salesCartContent');
  const emptyState = document.querySelector('.cart-empty-state');
  
  if (salesState.cart.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    emptyState.innerHTML = 'You will see student\'s orders here once you have selected a student above.';
    return;
  }
  
  container.style.display = 'block';
  emptyState.style.display = 'none';
  
  let total = 0;
  
  const html = salesState.cart.map((item, index) => {
    total += item.price;
    const dateCount = item.enrolledClasses.length;
    const firstDate = item.enrolledClasses[0]?.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const lastDate = item.enrolledClasses[dateCount-1]?.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dateRange = dateCount > 1 ? `${firstDate} - ${lastDate}` : firstDate;
    
    return `
      <div class="cart-item">
        <div class="cart-item-header">
          <span class="cart-item-title">${escapeHtml(item.productData.name)}</span>
          <span class="cart-item-price">$${item.price.toFixed(0)}</span>
        </div>
        <div class="cart-item-details">
          ${dateCount} lesson${dateCount > 1 ? 's' : ''} • ${dateRange}
        </div>
        <button class="btn-remove-item" onclick="removeSalesCartItem(${index})">Remove</button>
      </div>
    `;
  }).join('');
  
  const totalHtml = `
    <div class="cart-total">
      <span>Total</span>
      <span>$${total.toFixed(0)}</span>
    </div>
  `;
  
  container.innerHTML = html + totalHtml;
  
  // Update Pay Button
  const payBtn = document.querySelector('.sales-footer-actions .btn-primary');
  if (payBtn) payBtn.textContent = `Pay $${total.toFixed(0)}`;
}

window.removeSalesCartItem = function(index) {
  salesState.cart.splice(index, 1);
  renderSalesCart();
};

// ==================== Student Search in Sales ====================

// Show Student Dropdown
window.showStudentDropdown = function() {
  const dropdown = document.getElementById('salesStudentDropdown');
  if (dropdown) dropdown.style.display = 'block';
  handleSalesStudentSearch(); // Load initial list
};

// Hide Student Dropdown
function hideStudentDropdown() {
  const dropdown = document.getElementById('salesStudentDropdown');
  if (dropdown) {
    // Small delay to allow click events on items to fire
    setTimeout(() => {
      dropdown.style.display = 'none';
    }, 200);
  }
}

// Handle Student Search
window.handleSalesStudentSearch = async function() {
  const term = document.getElementById('salesStudentSearch').value.toLowerCase();
  const dropdown = document.getElementById('salesStudentDropdown');
  
  if (!dropdown) return;
  
  // Reuse global students list or fetch if needed
  let studentsList = window.students || [];
  if (studentsList.length === 0) {
    // Try to load students if not available
    try {
      const response = await window.authUtils.authenticatedFetch('/students');
      if (response && response.ok) {
        const data = await response.json();
        studentsList = Array.isArray(data) ? data : (data.students || []);
        window.students = studentsList;
      }
    } catch (e) {
      console.error('Failed to load students for search', e);
    }
  }
  
  const filtered = studentsList.filter(s => 
    (s.name && s.name.toLowerCase().includes(term)) || 
    (s.studentId && s.studentId.toLowerCase().includes(term))
  );
  
  if (filtered.length === 0) {
    dropdown.innerHTML = '<div class="dropdown-item empty">No students found</div>';
    return;
  }
  
  dropdown.innerHTML = filtered.map(s => `
    <div class="dropdown-item" onclick="selectSalesStudent('${s.id}')">
      <div class="student-avatar-small">${s.name.charAt(0).toUpperCase()}</div>
      <div class="student-info">
        <div class="student-name">${escapeHtml(s.name)}</div>
        <div class="student-id">${escapeHtml(s.studentId)}</div>
      </div>
    </div>
  `).join('');
};

// Select Student
window.selectSalesStudent = function(studentId) {
  const student = (window.students || []).find(s => s.id === studentId);
  if (!student) return;
  
  salesState.selectedStudent = student;
  
  // Update UI
  document.getElementById('salesStudentSearch').value = ''; // Clear search
  hideStudentDropdown();
  
  // Hide empty state, show card
  document.getElementById('emptyStudentState').style.display = 'none';
  const card = document.getElementById('selectedStudentCard');
  card.style.display = 'flex';
  
  card.innerHTML = `
    <div class="selected-student-avatar">${student.name.charAt(0).toUpperCase()}</div>
    <div class="selected-student-info">
      <h3>${escapeHtml(student.name)} <span class="student-id-badge">${escapeHtml(student.studentId)}</span></h3>
      <div class="student-balance">Balance: $0.00 (Coming soon)</div>
    </div>
    <button class="btn-close-student" onclick="deselectSalesStudent()">×</button>
  `;
  
  // Show cart placeholder text
  document.querySelector('.cart-empty-state').innerHTML = 'Select products from the left to create an order.';
  
  // Render cart if any
  renderSalesCart();
};

// Deselect Student
window.deselectSalesStudent = function() {
  salesState.selectedStudent = null;
  document.getElementById('selectedStudentCard').style.display = 'none';
  document.getElementById('emptyStudentState').style.display = 'flex';
  document.querySelector('.cart-empty-state').innerHTML = 'You will see student\'s orders here once you have selected a student above.';
  // Hide cart content
  document.getElementById('salesCartContent').style.display = 'none';
};

// Add to Cart (Placeholder)
// Replaced by handleProductSelect

window.resetSales = function() {
  salesState.cart = [];
  deselectSalesStudent();
  // Refresh products
  salesState.step = 1;
  showProductList();
};

window.saveSalesOrder = function() {
  alert('Save functionality coming soon');
};

window.processSalesPayment = function() {
  alert('Payment functionality coming soon');
};

// Click outside to close dropdown
document.addEventListener('click', function(event) {
  const searchWrapper = document.querySelector('.student-search-wrapper');
  const dropdown = document.getElementById('salesStudentDropdown');
  if (searchWrapper && !searchWrapper.contains(event.target) && dropdown && !dropdown.contains(event.target)) {
    dropdown.style.display = 'none';
  }
});

// Helper Functions
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
