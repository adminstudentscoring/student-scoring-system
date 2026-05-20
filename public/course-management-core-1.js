// Course Management Module
// Handles all course-related functionality for organizations

/** Bump when changing Setting / V.Chess UI (also used in org.html ?v= for cache-bust). */
(function initCmCoreBuildTag() {
  const BUILD = '2026-04-04-vchess-apply1';
  window.__STUDENT_SCORING_CM_CORE__ = BUILD;
  console.log('[CourseManagement-core] script loaded, build:', BUILD);
})();

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
                <!-- Must stay inside wrapper: absolute top:100% anchors to the input row, not the whole sales-student-section -->
                <div id="salesStudentDropdown" class="student-dropdown-list" style="display: none;" role="listbox" aria-label="Student matches">
                </div>
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
          <div style="color:#64748b; margin-bottom:16px;">Timetable / enrollments options below. <strong>V.Chess invoice Excel</strong> is the first card; <strong>Sales Excel export</strong> second; holidays third. · 發票、Sales 匯出、假期順序如下。</div>

          <div style="display:grid; grid-template-columns: 1fr; gap:14px; max-width: 720px;">
            <div style="border:1px solid #e2e8f0; border-radius:12px; padding:14px; background:#fff;">
              <div class="vchess-invoice-import-panel" aria-label="V.Chess invoice Excel import" id="vchessInvoiceImportSection">
                <div class="vchess-invoice-import-title">V.Chess 發票表（Excel）</div>
                <div class="vchess-invoice-import-row">
                  <input type="file" id="vchessInvoiceXlsxInput" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="display:none" onchange="window.handleVchessInvoiceXlsxSelected(this)">
                  <button type="button" class="btn btn-secondary btn-small" onclick="document.getElementById('vchessInvoiceXlsxInput').click()">上傳 .xlsx</button>
                  <span id="vchessInvoiceImportStatus" class="vchess-invoice-import-status"></span>
                </div>
                <div id="vchessInvoiceImportBanner" class="vchess-invoice-import-banner">—</div>
                <p class="vchess-invoice-import-hint">請使用 PDF 轉 Excel 或 Sales 匯出之欄位；日期可為 <code>d/m</code> 或 <code>YYYY-MM-DD</code>。上傳後務必<strong>預覽</strong>：錯誤列不會寫入。套用僅建立<strong>學生＋課表（可選）＋報名</strong>，不會建立 Sales 訂單。無課表時段時勾選「自動建立課表」並填預設課程 ID。 · Map columns, preview first; import does not create POS orders.</p>
                <div id="vchessImportApplyUi" class="vchess-import-apply-ui" style="margin-top:12px;border-top:1px solid #e2e8f0;padding-top:12px;">
                  <div style="font-weight:700;margin-bottom:8px;color:#0f172a;">套用至學生／報名 · Apply (preview first)</div>
                  <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px;">
                    <label style="font-size:13px;">批次 batch <select id="vchessImportBatchSelect" class="search-input" style="min-width:200px;"></select></label>
                    <label style="font-size:13px;">比對學生 By <select id="vchessStudentMatchField" class="search-input">
                      <option value="chessComId">customer_id → chessComId</option>
                      <option value="name">姓名 name</option>
                      <option value="name_phone">姓名+電話 name+phone</option>
                    </select></label>
                  </div>
                  <div id="vchessColumnMappingGrid" style="display:grid;grid-template-columns:140px 1fr;gap:6px 10px;font-size:13px;max-width:560px;"></div>
                  <div style="margin-top:12px;padding:10px;background:#f1f5f9;border-radius:8px;font-size:12px;color:#334155;max-width:560px;">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;margin-bottom:8px;">
                      <input type="checkbox" id="vchessCreateTimetableIfMissing" style="width:16px;height:16px;">
                      無課表時自動建立時段 · Create timetable row if missing (Phase 2)
                    </label>
                    <div style="display:grid;grid-template-columns:1fr;gap:6px;">
                      <label style="display:flex;flex-direction:column;gap:4px;">預設課程 ID（逗號）· default courseIds
                        <input type="text" id="vchessDefaultCourseIds" class="search-input" placeholder="e.g. course_abc, course_xyz" autocomplete="off">
                      </label>
                      <label style="display:flex;flex-direction:column;gap:4px;">預設老師 ID（逗號）· default teacherIds
                        <input type="text" id="vchessDefaultTeacherIds" class="search-input" placeholder="optional" autocomplete="off">
                      </label>
                      <label style="display:flex;flex-direction:column;gap:4px;">預設教室 · default classroom
                        <input type="text" id="vchessDefaultClassroom" class="search-input" placeholder="optional" maxlength="50" autocomplete="off">
                      </label>
                    </div>
                  </div>
                  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">
                    <button type="button" class="btn btn-secondary btn-small" id="vchessSaveApplyConfigBtn">儲存欄位對照 · Save mapping</button>
                    <button type="button" class="btn btn-primary btn-small" id="vchessPreviewApplyBtn">預覽 · Preview</button>
                    <button type="button" class="btn btn-primary btn-small" id="vchessApplyImportBtn" disabled>套用 · Apply</button>
                  </div>
                  <pre id="vchessImportPreviewOut" style="margin-top:10px;padding:10px;background:#f8fafc;border-radius:8px;font-size:11px;max-height:220px;overflow:auto;white-space:pre-wrap;"></pre>
                </div>
              </div>
            </div>
            <div style="border:1px solid #e2e8f0; border-radius:12px; padding:14px; background:#fff;">
              <div style="font-weight:800; color:#0f172a; margin-bottom:6px;">Sales enrollment export (Excel)</div>
              <div style="color:#64748b; margin-bottom:12px; font-size:13px; line-height:1.45;">
                多選學生下載 .xlsx，欄位對齊 Sales 右側學生／課堂／上課日（姓名、學號、餘額、Quota、班名、時段、老師、上課日、訂單）。<br>
                Multi-select students; columns mirror the Sales sidebar (name, ID, balance, quota, class, time, teacher, enrolled dates, order).
              </div>
              <input type="text" id="salesExportStudentFilter" class="search-input" placeholder="Filter by name or student ID…" style="max-width:100%; margin-bottom:8px;" autocomplete="off">
              <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px; align-items:center;">
                <button type="button" class="btn btn-secondary btn-small" id="salesExportSelectAllBtn">Select all (filtered)</button>
                <button type="button" class="btn btn-secondary btn-small" id="salesExportClearBtn">Clear selection</button>
                <button type="button" class="btn btn-primary btn-small" id="salesExportDownloadBtn">Download Excel</button>
              </div>
              <div id="salesExportStudentList" style="max-height:240px; overflow:auto; border:1px solid #e2e8f0; border-radius:8px; padding:8px; background:#f8fafc; font-size:13px;"></div>
            </div>
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
            <div style="border:1px solid #fecaca; border-radius:12px; padding:14px; background:#fef2f2;">
              <div style="font-weight:800; color:#991b1b; margin-bottom:6px;">Danger zone · 危險操作</div>
              <div style="color:#7f1d1d; margin-bottom:12px; font-size:13px; line-height:1.45;">
                一鍵刪除<strong>本機構</strong>全部學生，並移除其報名、課表名單中的學員、訂單、帳務交易與點名紀錄。<strong>無法復原。</strong><br>
                Permanently deletes <strong>all students in this organization</strong> and related enrollments, timetable student lists, orders, transactions, and attendance. <strong>Cannot be undone.</strong>
              </div>
              <button type="button" class="btn btn-danger" id="purgeAllOrgStudentsBtn" onclick="window.confirmPurgeAllOrganizationStudents && window.confirmPurgeAllOrganizationStudents()">移除所有學生資料 · Remove all students</button>
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

  requestAnimationFrame(function logVchessImportDomProbe() {
    const el = document.getElementById('vchessInvoiceImportSection');
    const pane = document.getElementById('settingSubTabContent');
    const cs = el ? window.getComputedStyle(el) : null;
    const r = el ? el.getBoundingClientRect() : null;
    console.log('[VChessImport][renderCourseManagement]', {
      build: window.__STUDENT_SCORING_CM_CORE__,
      savedSubTab: savedSubTab,
      vchessSectionExists: !!el,
      settingPaneExists: !!pane,
      settingPaneHasActiveClass: pane ? pane.classList.contains('active') : false,
      vchessDisplay: cs ? cs.display : null,
      vchessVisibility: cs ? cs.visibility : null,
      vchessHeight: cs ? cs.height : null,
      boundingRect: r
        ? { top: r.top, left: r.left, width: r.width, height: r.height }
        : null
    });
    if (!el) {
      console.warn(
        '[VChessImport] #vchessInvoiceImportSection missing after render — likely OLD cached course-management-core.js. Hard-refresh (Cmd+Shift+R) or check Network tab for 304.'
      );
    }
  });
}

/**
 * Run in console: debugVChessImportUi()
 * Dumps DOM / visibility for V.Chess block under Course → Setting.
 */
window.debugVChessImportUi = function debugVChessImportUi() {
  const build = window.__STUDENT_SCORING_CM_CORE__ || '(unknown — core script not loaded or cached old file)';
  const el = document.getElementById('vchessInvoiceImportSection');
  const pane = document.getElementById('settingSubTabContent');
  const container = document.getElementById('courseManagementContainer');
  const settingHtmlHasVchessCopy =
    pane && typeof pane.innerHTML === 'string' && pane.innerHTML.includes('V.Chess');
  const out = {
    build,
    courseManagementContainer: !!container,
    vchessInvoiceImportSection: !!el,
    settingSubTabContent: !!pane,
    settingActive: pane ? pane.classList.contains('active') : false,
    settingHtmlIncludesVchessMarker: !!settingHtmlHasVchessCopy
  };
  if (el) {
    const cs = window.getComputedStyle(el);
    out.vchessComputed = {
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      height: cs.height
    };
    out.boundingRect = el.getBoundingClientRect();
  }
  console.log('[VChessImport][debugVChessImportUi]', out);
  return out;
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
