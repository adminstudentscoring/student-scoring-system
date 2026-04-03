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
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
  }
  
  .selection-header-bar {
    display: flex;
    align-items: center;
    padding: 15px 20px;
    border-bottom: 1px solid rgba(60, 60, 67, 0.12);
    gap: 15px;
  }
  
  .btn-back {
    background: none;
    border: none;
    color: #007aff;
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
    background: rgba(0, 122, 255, 0.12);
    color: #007aff;
    font-size: 10px;
    padding: 3px 8px;
    border-radius: 980px;
    text-transform: uppercase;
    font-weight: 700;
  }
  .badge.badge-package {
    background: rgba(52, 199, 89, 0.15);
    color: #248a3d;
  }
  .badge.badge-course {
    background: rgba(0, 122, 255, 0.12);
    color: #007aff;
  }
  
  .calendar-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  
  .calendar-sidebar {
    width: min(100%, 320px);
    min-width: 260px;
    border-right: 1px solid #e0e0e0;
    padding: 16px;
    display: flex;
    flex-direction: column;
    overscroll-behavior: contain;
  }

  /* Three months stacked top-to-bottom in the left column */
  .calendar-triple-wrap {
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding-bottom: 8px;
  }

  .calendar-month-column {
    flex: 0 0 auto;
    width: 100%;
    min-width: 0;
    padding-bottom: 4px;
    border-bottom: 1px solid #eee;
  }

  .calendar-month-column:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .mini-cal-month-title {
    font-size: 12px;
    font-weight: 700;
    text-align: center;
    color: #333;
    margin-bottom: 4px;
  }

  .calendar-grid-header.mini-cal-head {
    margin-bottom: 4px;
  }

  .calendar-grid-triple {
    gap: 3px;
  }

  .calendar-grid-triple .calendar-day {
    height: 26px;
    font-size: 11px;
  }

  .calendar-grid-triple .calendar-day.has-class:after {
    bottom: 2px;
    width: 3px;
    height: 3px;
  }
  
  .schedule-main {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    background: #f5f5f7;
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
    background: #007aff;
    color: #fff;
    font-weight: 600;
  }
  
  .calendar-day.today {
    border: 1px solid rgba(0, 122, 255, 0.45);
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
    background: #fff;
    border: 1px solid rgba(60, 60, 67, 0.1);
    border-radius: 12px;
    padding: 15px;
    margin-bottom: 15px;
    display: flex;
    align-items: flex-start;
    gap: 15px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 14px rgba(0,0,0,0.04);
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

// Lesson quota (paid drops credit by price tier, cents → count)
/** Plain text for student card (same line weight as Balance). */
window.formatLessonQuotaPlainText = function (student) {
  const q = student && student.lessonQuotaByCents;
  if (!q || typeof q !== 'object') return 'No quota credit';
  const entries = Object.entries(q).filter(([, n]) => Number(n) > 0);
  if (!entries.length) return 'No quota credit';
  return entries
    .map(([cents, n]) => {
      const dollars = (Number(cents) / 100).toFixed(2);
      return `$${dollars} × ${Number(n)}`;
    })
    .join(', ');
};

window.formatLessonQuotaChipsHtml = function (student) {
  const q = student && student.lessonQuotaByCents;
  if (!q || typeof q !== 'object') {
    return '<span class="sales-quota-muted" title="Paid drops credit lessons here by per-lesson price tier ($/lesson × count)">No quota credit</span>';
  }
  const entries = Object.entries(q).filter(([, n]) => Number(n) > 0);
  if (!entries.length) {
    return '<span class="sales-quota-muted" title="Paid drops credit lessons here by per-lesson price tier">No quota credit</span>';
  }
  return entries
    .map(([cents, n]) => {
      const dollars = (Number(cents) / 100).toFixed(2);
      return `<span class="sales-quota-chip" title="Credit lessons at this per-lesson price">$${dollars} × ${Number(n)}</span>`;
    })
    .join('');
};

/** True if each cart line has enough quota at implied per-lesson tier (price ÷ lesson count). */
window.salesCartCanFullyPayWithLessonQuota = function (student, cart) {
  if (!student || !cart || !cart.length) return false;
  const q = student.lessonQuotaByCents;
  if (!q || typeof q !== 'object') return false;
  for (let i = 0; i < cart.length; i++) {
    const item = cart[i];
    const classes = item.enrolledClasses;
    if (!Array.isArray(classes) || classes.length === 0) return false;
    const n = classes.length;
    const unitCents = Math.round(((Number(item.price) || 0) * 100) / n);
    if (!Number.isFinite(unitCents) || unitCents <= 0) return false;
    const have = Number(q[String(unitCents)]) || 0;
    if (have < n) return false;
  }
  return true;
};

/**
 * Split order balance due across lines with enrollments (same math as server buildSyntheticQuotaItemsForBalance).
 */
window.salesBuildQuotaItemsForOrderBalance = function (order, balanceDue) {
  const roundMoney = (n) => Math.round(Number(n) * 100) / 100;
  const due = roundMoney(Number(balanceDue) || 0);
  if (due <= 0.005) return [];
  const items = order.items || [];
  const withClasses = items.filter(
    (it) => Array.isArray(it.enrolledClasses) && it.enrolledClasses.length > 0
  );
  if (withClasses.length === 0) return [];
  const subtotals = withClasses.map((it) => roundMoney(Number(it.price) || 0));
  const sumSub = roundMoney(subtotals.reduce((a, b) => a + b, 0));
  let allocated = 0;
  const out = [];
  for (let i = 0; i < withClasses.length; i++) {
    const it = withClasses[i];
    let lineDue;
    if (i === withClasses.length - 1) {
      lineDue = roundMoney(due - allocated);
    } else if (sumSub > 0.005) {
      lineDue = roundMoney((due * subtotals[i]) / sumSub);
    } else {
      lineDue = roundMoney(due / withClasses.length);
    }
    allocated = roundMoney(allocated + lineDue);
    if (lineDue > 0.005) {
      out.push({ ...it, price: lineDue, enrolledClasses: it.enrolledClasses });
    }
  }
  return out;
};

/** True if student's lesson quota can cover the remaining balance on this order (per-lesson tiers from balance ÷ lesson counts). */
window.salesOrderCanPayRemainingWithLessonQuota = function (student, order) {
  if (!student || !order) return false;
  const dueFn = typeof window.salesOrderBalanceDue === 'function' ? window.salesOrderBalanceDue : null;
  if (!dueFn || !window.salesBuildQuotaItemsForOrderBalance || !window.salesCartCanFullyPayWithLessonQuota) {
    return false;
  }
  const due = dueFn(order);
  if (due < 0.005) return false;
  const synth = window.salesBuildQuotaItemsForOrderBalance(order, due);
  if (!synth.length) return false;
  return window.salesCartCanFullyPayWithLessonQuota(student, synth);
};

window.applyDropResultToSalesStudent = function (studentId, result) {
  if (!result || studentId == null) return;
  const s = (window.students || []).find((stu) => String(stu.id) === String(studentId));
  if (!s) return;
  if (result.newBalance !== undefined) s.balance = result.newBalance;
  if (result.lessonQuotaByCents && typeof result.lessonQuotaByCents === 'object') {
    s.lessonQuotaByCents = JSON.parse(JSON.stringify(result.lessonQuotaByCents));
  }
};

window.formatDropQuotaToastMessage = function (result) {
  const n = Number(result.droppedCount) || 0;
  const delta = result.lessonQuotaDelta;
  if (!delta || typeof delta !== 'object' || !Object.keys(delta).length) {
    return n === 1 ? 'Dropped 1 lesson.' : `Dropped ${n} lessons.`;
  }
  const parts = Object.entries(delta).map(
    ([cents, add]) => `$${(Number(cents) / 100).toFixed(2)} +${add}`
  );
  const head = n === 1 ? 'Dropped 1 lesson' : `Dropped ${n} lessons`;
  return `${head}. Lesson quota credit: ${parts.join(', ')}.`;
};
