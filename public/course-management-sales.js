// Sales Management Module
// Handles sales, enrollment, and POS functionality

// State
let salesState = {
  selectedStudent: null,
  cart: [],
  products: [] // Combined list of courses and packages
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
  
  container.innerHTML = '<div class="loading-placeholder">Loading products...</div>';
  
  try {
    // Ensure data is loaded from course-management.js globals
    if (!window.courses || window.courses.length === 0) {
      // Check if loadCourses is available globally
      if (window.loadCourses) {
        await window.loadCourses();
      }
    }
    // We need to access packages. Since packages is let in course-management.js, 
    // we might need to expose it or reload it. 
    // Best practice: Expose loadPackages if needed, but packages variable is local to course-management.js
    // Let's assume we can fetch them again or better yet, expose a getter in course-management.js?
    // For now, we'll fetch them again to be safe and independent.
    
    const packagesResponse = await window.authUtils.authenticatedFetch('/organizations/packages');
    let packages = [];
    if (packagesResponse && packagesResponse.ok) {
      packages = await packagesResponse.json();
    }
    
    renderSalesProducts('all', '', packages);
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
    <div class="sales-product-card ${item.type}" onclick="addToSalesCart('${item.type}', '${item.data.id}')">
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
  
  // We need to reload packages to filter, which is inefficient. 
  // TODO: Cache packages in salesState
  loadSalesProductsWithFilter(categoryMap[activeCategory] || 'all', term);
};

// Helper to reload with filter without refetching if possible
async function loadSalesProductsWithFilter(category, term) {
  // For now, just call the main load function which fetches. 
  // Optimization: Store packages in salesState.packages
  // Let's update loadSalesProducts to store in state
  
  if (salesState.packages && salesState.packages.length > 0) {
    renderSalesProducts(category, term, salesState.packages);
  } else {
    // Fallback
    loadSalesProducts();
  }
}

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
  loadSalesProductsWithFilter(category, term);
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
};

// Deselect Student
window.deselectSalesStudent = function() {
  salesState.selectedStudent = null;
  document.getElementById('selectedStudentCard').style.display = 'none';
  document.getElementById('emptyStudentState').style.display = 'flex';
  document.querySelector('.cart-empty-state').innerHTML = 'You will see student\'s orders here once you have selected a student above.';
};

// Add to Cart (Placeholder)
window.addToSalesCart = function(type, id) {
  console.log('Add to cart:', type, id);
  // Will implement next step
  if (!salesState.selectedStudent) {
    alert('Please select a student first');
    // Highlight student search
    document.getElementById('salesStudentSearch').focus();
  }
};

window.resetSales = function() {
  salesState.cart = [];
  deselectSalesStudent();
  // Refresh products
  loadSalesProducts(); 
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

// Improve loadSalesProducts to cache packages
async function loadSalesProducts() {
  const container = document.getElementById('salesProductList');
  if (!container) return;
  
  container.innerHTML = '<div class="loading-placeholder">Loading products...</div>';
  
  try {
    // Ensure courses loaded
    if (!window.courses || window.courses.length === 0) {
      if (window.loadCourses) await window.loadCourses();
    }
    
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

// Helper Functions
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
