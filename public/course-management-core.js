// Course Management Module
// Handles all course-related functionality for organizations

// Predefined colors — Apple system–style palette (iOS / macOS accent family)
const PREDEFINED_COLORS = [
  '#007AFF', // Blue
  '#34C759', // Green
  '#5856D6', // Indigo
  '#FF9500', // Orange
  '#FF2D55', // Pink
  '#AF52DE', // Purple
  '#5AC8FA', // Light blue
  '#FFCC00', // Yellow
  '#FF3B30', // Red
  '#8E8E93'  // Gray
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
        <button class="course-sub-tab" data-subtab="setting">⚙️ Setting</button>
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
              
              <div class="sales-student-below-search">
                <div class="sales-create-student-row">
                  <button type="button" class="btn-sales-new-student" onclick="openSalesCreateStudentModal()" title="Add a new student">
                    <span class="btn-sales-new-student-icon" aria-hidden="true">+</span>
                    <span class="btn-sales-new-student-label">Create new student</span>
                  </button>
                </div>
                <div id="selectedStudentCard" class="selected-student-card" style="display: none;">
                  <!-- Selected student info will appear here -->
                </div>
              </div>
            </div>
            
            <!-- Enrollment/Cart Section -->
            <div class="sales-cart-section">
              <div class="cart-empty-state" aria-hidden="true"></div>
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
      <div id="settingSubTabContent" class="course-sub-tab-content">
        <div style="padding: 18px;">
          <div style="font-size:18px; font-weight:800; color:#0f172a; margin-bottom:10px;">Course Management Settings</div>
          <div style="color:#64748b; margin-bottom:16px;">These settings affect timetable scheduling and enrollments.</div>

          <div style="display:grid; grid-template-columns: 1fr; gap:14px; max-width: 720px;">
            <div style="border:1px solid #e2e8f0; border-radius:12px; padding:14px; background:#fff;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:6px;">
                <div style="font-weight:800; color:#0f172a;">Holidays / Closed Days</div>
                <div style="display:flex; gap:10px;">
                  <button class="btn btn-primary" onclick="openHolidayRuleModal()">Create</button>
                  <button class="btn btn-secondary" onclick="reloadCourseManagementHolidays()">Reload</button>
                </div>
              </div>
              <div style="color:#64748b; margin-bottom:10px;">Holidays will be skipped during class enrollment generation and auto-renew calculations.</div>
              <div id="cmHolidayRulesList" style="display:flex; flex-direction:column; gap:10px;"></div>
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
    width: fit-content;
    min-width: 0;
    max-width: 220px;
    align-self: flex-start;
    gap: 2px;
    padding: 8px 6px 8px 4px;
    background: rgba(245, 245, 247, 0.95);
    border-right: 1px solid rgba(60, 60, 67, 0.12);
    border-radius: 12px 0 0 12px;
  }
  
  .course-sub-tab {
    padding: 9px 12px 9px 10px;
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
    color: #007aff;
    background: rgba(0, 122, 255, 0.1);
    border-left-color: #007aff;
    font-weight: 600;
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
      border-bottom-color: #007aff;
      color: #007aff;
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
    background: rgba(0, 122, 255, 0.06);
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
    border-radius: 10px;
    cursor: pointer;
    border: 2px solid rgba(0, 0, 0, 0.06);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  
  .color-option:hover {
    transform: scale(1.06);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 12px rgba(0, 0, 0, 0.12);
  }
  
  .color-option.selected {
    border-color: rgba(0, 0, 0, 0.28);
    box-shadow: 0 0 0 2px #fff, 0 0 0 4px rgba(0, 122, 255, 0.45);
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
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
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
    color: #007aff;
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
    border-left: 3px solid #007aff;
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
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
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
    background: #007aff;
    color: #fff;
    border-color: #007aff;
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
    border-color: #007aff;
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
    padding: 10px 12px 12px;
    border-bottom: 1px solid #e0e0e0;
    background: #f8f9fa;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  
  .sales-student-below-search {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 2px;
  }
  
  .sales-create-student-row {
    display: flex;
    align-items: center;
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
    border-color: #007aff;
    box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.18);
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
    left: 12px;
    right: 12px;
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
    background: rgba(0, 122, 255, 0.06);
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
    flex-direction: row;
    align-items: center;
    padding: 2px 0 6px;
    font-size: 13px;
  }
  
  .btn-sales-new-student {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 4px 8px 4px 4px;
    border: 1px solid transparent;
    background: transparent;
    color: #64748b;
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
    border-radius: 6px;
    box-shadow: none;
    transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  }
  
  .btn-sales-new-student:hover {
    background: rgba(15, 23, 42, 0.04);
    border-color: var(--ui-border, #d0d4dc);
    color: #475569;
  }
  
  .btn-sales-new-student:active {
    background: rgba(15, 23, 42, 0.06);
  }
  
  .btn-sales-new-student-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 4px;
    background: transparent;
    border: 1px solid transparent;
    font-size: 1rem;
    line-height: 1;
    font-weight: 700;
    color: #94a3b8;
  }
  
  .btn-sales-new-student:hover .btn-sales-new-student-icon {
    color: #64748b;
    border-color: var(--ui-border, #d0d4dc);
  }
  
  .btn-sales-new-student-label {
    letter-spacing: 0.01em;
  }
  
  .btn-sales-new-student:focus-visible {
    outline: 2px solid var(--ui-accent, #2563eb);
    outline-offset: 2px;
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
    align-items: flex-start;
    gap: 12px;
    padding: 12px 12px 12px 12px;
    margin: 0;
    position: relative;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: saturate(180%) blur(12px);
    -webkit-backdrop-filter: saturate(180%) blur(12px);
    border: 1px solid rgba(60, 60, 67, 0.1);
    border-radius: 14px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.06);
  }
  
  .selected-student-avatar {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    background: linear-gradient(180deg, rgba(0, 122, 255, 0.14), rgba(0, 122, 255, 0.06));
    color: #0071e3;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 17px;
    letter-spacing: -0.02em;
  }
  
  .selected-student-info h3 {
    margin: 0 0 4px 0;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: #1d1d1f;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  
  .btn-sales-student-edit {
    margin-left: 4px;
    padding: 1px 8px;
    min-height: 0;
    font-size: 10px;
    font-weight: 500;
    line-height: 1.2;
    letter-spacing: -0.01em;
    border-radius: 980px;
    border: 1px solid rgba(60, 60, 67, 0.18);
    background: rgba(120, 120, 128, 0.08);
    color: #1d1d1f;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  
  .btn-sales-student-edit:hover {
    background: rgba(120, 120, 128, 0.12);
    border-color: rgba(60, 60, 67, 0.22);
  }
  
  .student-name-plain {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: #1d1d1f;
  }
  
  .btn-sales-student-history {
    margin-left: 4px;
    padding: 1px 8px;
    min-height: 0;
    font-size: 10px;
    font-weight: 500;
    line-height: 1.2;
    letter-spacing: -0.01em;
    border-radius: 980px;
    border: 1px solid rgba(60, 60, 67, 0.18);
    background: rgba(120, 120, 128, 0.08);
    color: #1d1d1f;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  
  .btn-sales-student-history:hover {
    background: rgba(120, 120, 128, 0.12);
    border-color: rgba(60, 60, 67, 0.22);
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
    color: #6e6e73;
    letter-spacing: -0.01em;
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
    min-height: 0;
    overflow: hidden;
    padding: 12px 15px;
    background: #fff;
    display: flex;
    flex-direction: column;
  }
  
  #salesCartContent {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }
  
  .cart-empty-state {
    flex: 0 0 auto;
    display: none;
    min-height: 0;
    padding: 0;
    margin: 0;
  }
  
  .sales-footer-actions {
    padding: 10px 12px;
    border-top: 1px solid #e0e0e0;
    background: #f8f9fa;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
  }
  
  .sales-footer-actions .btn {
    flex: 0 1 auto;
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
    color: #007aff;
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
    border-color: #007aff;
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
  
  .cart-item-body {
    cursor: pointer;
    border-radius: 4px;
    margin: -4px -4px 6px -4px;
    padding: 4px;
    transition: background 0.12s ease;
  }
  
  .cart-item-body:hover {
    background: rgba(15, 23, 42, 0.04);
  }
  
  .cart-item-hint {
    color: #94a3b8;
    font-weight: 500;
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

document.head.appendChild(style);
