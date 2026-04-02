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
    viewDate: new Date(), // For calendar navigation (Year/Month)
    selectedDate: new Date(), // Currently selected day
    availableClasses: [] // All future classes cache
  },
  teachers: [] // Cache teachers
};

// Initialize Sales Module
window.loadSalesModule = async function() {
  loadSalesProducts();
  loadSalesTeachers();
  // Load schedule settings (holidays) used for enrollment generation
  try {
    const resp = await window.authUtils.authenticatedFetch('/organizations/settings');
    if (resp && resp.ok) {
      const settings = await resp.json();
      window.timetableSettings = settings.scheduleSettings || {};
    }
  } catch (e) {
    // ignore
  }
  
  // Preload Timetable Data for Enrollments History
  try {
    if (window.authUtils) {
      const response = await window.authUtils.authenticatedFetch('/organizations/timetable');
      if (response && response.ok) {
        const data = await response.json();
        window.timetableEntries = data.entries || [];
        window.timetableEnrollments = data.enrollments || [];
      }
    }
  } catch (e) {
    console.error('Failed to preload timetable for sales:', e);
  }
  
  // Setup event listeners if not already set
  setupSalesEventListeners();
};

function setupSalesEventListeners() {
  // Any specific event listeners for sales module
}

// Load Teachers for Sales
async function loadSalesTeachers() {
  try {
    const response = await window.authUtils.authenticatedFetch('/organizations/teachers');
    if (response && response.ok) {
      salesState.teachers = await response.json();
    }
  } catch (error) {
    console.error('Error loading teachers for sales:', error);
  }
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
  let coursesList = [];
  let packagesList = [];
  
  // 1. Gather Courses (Single Lessons)
  if (category === 'all' || category === 'courses') {
    coursesList = (window.courses || []).map(c => ({
      type: 'course',
      data: c,
      name: c.name,
      price: parseFloat(c.price),
      info: 'Single lesson'
    })).filter(item => item.name.toLowerCase().includes(term));
  }

  // 2. Gather Packages
  if (category === 'all' || category === 'packages') {
    const activePackages = packages.filter(p => p.status === 'active');
    packagesList = activePackages.map(p => ({
      type: 'package',
      data: p,
      name: p.name,
      price: calculateSalesPackagePrice(p),
      info: `${p.courses.reduce((sum, c) => sum + c.quantity, 0)} lessons`
    })).filter(item => item.name.toLowerCase().includes(term));
  }
  
  if (coursesList.length === 0 && packagesList.length === 0) {
    container.innerHTML = '<div class="empty-state">No products found</div>';
    return;
  }
  
  // Helper to render cards
  const renderCards = (items) => items.map(item => `
    <div class="sales-product-card ${item.type}" onclick="handleProductSelect('${item.type}', '${item.data.id}')">
      <div class="product-type-badge ${item.type}"></div>
      <div class="product-type-label">${item.type === 'package' ? 'Multiple courses' : 'Single Lesson'}</div>
      <div class="product-name">${escapeHtml(item.name)}</div>
      <div class="product-footer">
        <div class="product-info">${item.info}</div>
        <div class="product-price">$${item.price.toFixed(0)}</div>
      </div>
    </div>
  `).join('');

  // Inject Styles if not present
  if (!document.getElementById('salesSectionStyles')) {
      const style = document.createElement('style');
      style.id = 'salesSectionStyles';
      style.textContent = `
        .sales-product-sections { display: flex; flex-direction: column; gap: 25px; padding: 5px; overflow-y: auto; }
        .product-section-title { font-size: 15px; font-weight: 700; color: #6b7280; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; text-transform: uppercase; letter-spacing: 0.5px; }
        .sales-product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
      `;
      document.head.appendChild(style);
  }

  // Set Container Class to use Flex Column instead of Grid
  container.className = 'sales-product-sections';

  let html = '';
  
  if (coursesList.length > 0) {
      html += `<div class="product-section">
        <div class="product-section-title">Single Lessons</div>
        <div class="sales-product-grid">
            ${renderCards(coursesList)}
        </div>
      </div>`;
  }
  
  if (packagesList.length > 0) {
      html += `<div class="product-section">
        <div class="product-section-title">Packages</div>
        <div class="sales-product-grid">
            ${renderCards(packagesList)}
        </div>
      </div>`;
  }
  
  container.innerHTML = html;
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

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getPackageLessonCount(pkg) {
  if (!pkg.courses) return 0;
  return pkg.courses.reduce((sum, c) => sum + c.quantity, 0);
}

function getTeacherName(teacherId) {
    if (!salesState.teachers) return 'Unknown';
    const teacher = salesState.teachers.find(t => t.id === teacherId);
    return teacher ? teacher.name : 'Unknown';
}

// Add CSS styles dynamically for new layout
const salesStyles = document.createElement('style');
salesStyles.textContent = `
  .sales-class-selection-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: white;
    border-radius: 8px;
    overflow: hidden;
  }
  
  .selection-header-bar {
    display: flex;
    align-items: center;
    padding: 15px 20px;
    border-bottom: 1px solid #e0e0e0;
    gap: 15px;
  }
  
  .btn-back {
    background: none;
    border: none;
    color: #667eea;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
  }
  
  .header-product-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  
  .badge {
    background: #e0e7ff;
    color: #4338ca;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    font-weight: 700;
  }
  
  .calendar-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  
  .calendar-sidebar {
    width: 300px;
    border-right: 1px solid #e0e0e0;
    padding: 20px;
    display: flex;
    flex-direction: column;
    overscroll-behavior: contain;
  }
  
  .schedule-main {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    background: #fcfcfc;
  }
  
  .calendar-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  
  .calendar-nav button {
    background: none;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    cursor: pointer;
    padding: 2px 8px;
  }
  
  .calendar-grid-header {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    text-align: center;
    font-size: 12px;
    color: #999;
    margin-bottom: 5px;
  }
  
  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 5px;
  }
  
  .calendar-day {
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 50%;
    font-size: 13px;
    position: relative;
    transition: all 0.2s;
  }
  
  .calendar-day:hover:not(.empty) {
    background: #f0f4ff;
  }
  
  .calendar-day.selected {
    background: #667eea;
    color: white;
  }
  
  .calendar-day.today {
    border: 1px solid #667eea;
  }
  
  .calendar-day.has-class:after {
    content: '';
    position: absolute;
    bottom: 4px;
    width: 4px;
    height: 4px;
    background: #10b981;
    border-radius: 50%;
  }
  
  .dot-legend {
    display: inline-block;
    width: 6px;
    height: 6px;
    background: #10b981;
    border-radius: 50%;
    margin-right: 5px;
  }
  
  .calendar-legend {
    margin-top: 10px;
    font-size: 11px;
    color: #666;
    display: flex;
    align-items: center;
  }
  
  .schedule-header h3 {
    margin-top: 0;
    margin-bottom: 20px;
    border-bottom: 1px solid #eee;
    padding-bottom: 10px;
  }
  
  .schedule-card {
    background: white;
    border: 1px solid #eee;
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 15px;
    display: flex;
    align-items: flex-start;
    gap: 15px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.02);
  }
  
  .card-time {
    min-width: 80px;
    text-align: center;
    border-right: 1px solid #eee;
    padding-right: 15px;
  }
  
  .time-text {
    font-weight: bold;
    font-size: 14px;
    color: #333;
  }
  
  .cal-icon {
    font-size: 20px;
    margin-top: 5px;
  }
  
  .card-details {
    flex: 1;
  }
  
  .card-title {
    font-weight: bold;
    font-size: 16px;
    margin-bottom: 5px;
  }
  
  .card-teacher {
    color: #666;
    font-size: 13px;
  }
  
  .card-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 250px;
  }
  
  .enroll-option {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f8f9fa;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid #eee;
  }
  
  .option-label {
    font-size: 12px;
    color: #555;
  }
  
  .product-type-label {
    font-size: 10px;
    color: #888;
    text-transform: uppercase;
    margin-bottom: 4px;
    padding-left: 10px;
    font-weight: 600;
  }
  
  .empty-day-state {
    text-align: center;
    color: #999;
    padding: 40px;
    font-style: italic;
  }
  
  /* Checkout Modal Styles */
  .payment-tabs { margin-bottom: 15px; }
  .payment-form { border: 1px solid #eee; padding: 15px; border-radius: 8px; background: #f9fafb; }
  .payment-amount-input { font-size: 1.2rem; font-weight: bold; color: #333; }
  .checkout-item label { cursor: pointer; }
`;
document.head.appendChild(salesStyles);
