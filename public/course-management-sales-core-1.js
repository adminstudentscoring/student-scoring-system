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
  teachers: [], // Cache teachers
  /** Paid orders for selected student (filled in loadStudentOrders) */
  currentPaidOrdersForStudent: []
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
    await window.refreshSalesTimetableFromApi();
  } catch (e) {
    console.error('Failed to preload timetable for sales:', e);
  }
  
  // Setup event listeners if not already set
  setupSalesEventListeners();
};

function setupSalesEventListeners() {
  // Any specific event listeners for sales module
}

/** Reload org timetable + enrollments (e.g. after payment so orderId appears in Class History). */
window.refreshSalesTimetableFromApi = async function refreshSalesTimetableFromApi() {
  if (!window.authUtils || !window.authUtils.authenticatedFetch) {
    console.warn('[SalesTimetable] refreshSalesTimetableFromApi: no authUtils');
    return false;
  }
  const response = await window.authUtils.authenticatedFetch('/organizations/timetable');
  if (!response || !response.ok) {
    console.warn('[SalesTimetable] refresh failed', { ok: response?.ok, status: response?.status });
    return false;
  }
  const data = await response.json();
  window.timetableEntries = data.entries || [];
  window.timetableEnrollments = data.enrollments || [];
  console.log('[SalesTimetable] refreshed enrollments', {
    entryCount: (window.timetableEntries || []).length,
    enrollmentCount: (window.timetableEnrollments || []).length,
    withOrderId: (window.timetableEnrollments || []).filter((e) => e.orderId != null && String(e.orderId).trim() !== '')
      .length
  });
  return true;
};

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
