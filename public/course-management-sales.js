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
  }
};

// Initialize Sales Module
window.loadSalesModule = async function() {
  loadSalesProducts();
  
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
  
  // Filter by search
  items = items.filter(item => item.name.toLowerCase().includes(term));
  
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">No products found</div>';
    return;
  }
  
  container.innerHTML = items.map(item => `
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

// ==================== Step 2: Class/Date Selection (Calendar View) ====================

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
    viewDate: new Date(), // Start with current month
    selectedDate: new Date(), // Select today by default
    availableClasses: []
  };
  
  renderClassSelectionUI(); // Render skeleton
  loadAvailableClasses(courseId); // Load data and refresh UI
};

// Render Class Selection UI (Split View: Calendar + List)
function renderClassSelectionUI() {
  const leftPanel = document.querySelector('.sales-left-panel');
  if (!leftPanel) return;
  
  // Hide Search and Categories
  document.querySelector('.sales-product-search').style.display = 'none';
  document.querySelector('.sales-product-categories').style.display = 'none';
  
  const container = document.getElementById('salesProductList');
  container.className = 'sales-class-selection-container'; 
  
  const product = salesState.selectedProduct.data;
  const productName = escapeHtml(product.name);
  const productType = salesState.selectedProduct.type === 'package' ? 'Package' : 'Course';
  
  container.innerHTML = `
    <div class="selection-header-bar">
      <button class="btn-back" onclick="backToProductList()">← Back</button>
      <div class="header-product-info">
        <strong>${productName}</strong>
        <span class="badge">${productType}</span>
      </div>
    </div>
    
    <div class="calendar-layout">
      <!-- Left Column: Calendar -->
      <div class="calendar-sidebar">
        <div class="calendar-nav">
          <button onclick="changeCalendarMonth(-1)">‹</button>
          <span id="calendarTitle">Month Year</span>
          <button onclick="changeCalendarMonth(1)">›</button>
        </div>
        <div class="calendar-grid-header">
          <div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div>
        </div>
        <div id="miniCalendarGrid" class="calendar-grid">
          <!-- Calendar days generated here -->
        </div>
        <div class="calendar-legend">
          <span class="dot-legend"></span> Available
        </div>
      </div>
      
      <!-- Right Column: Schedule -->
      <div class="schedule-main">
        <div id="scheduleHeader" class="schedule-header">
          <!-- e.g. "Monday 1, December" -->
        </div>
        <div id="dayScheduleList" class="day-schedule-list">
          <div class="loading-placeholder">Loading schedule...</div>
        </div>
      </div>
    </div>
  `;
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
  container.className = 'sales-product-list'; // Restore original class
  
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
  if (!courseId) {
    updateDaySchedule();
    return;
  }

  try {
    const response = await window.authUtils.authenticatedFetch('/organizations/timetable');
    if (!response || !response.ok) {
      throw new Error('Failed to load timetable');
    }
    
    const data = await response.json();
    const allEntries = data.entries || [];
    
    // Sync global data for Sales module
    window.timetableEntries = allEntries;
    window.timetableEnrollments = data.enrollments || [];
    
    // Filter for this course
    const courseEntries = allEntries.filter(e => {
      if (e.courseIds && Array.isArray(e.courseIds) && e.courseIds.includes(courseId)) {
        return true;
      }
      return e.courseId === courseId;
    });
    
    // Generate next 6 months of classes for the calendar
    const futureClasses = generateFutureClasses(courseEntries, 26); // 26 weeks ~ 6 months
    
    salesState.classSelection.availableClasses = futureClasses;
    
    // Refresh Calendar and Schedule
    renderMiniCalendar();
    updateDaySchedule();
    
  } catch (error) {
    console.error('Error loading classes:', error);
    const scheduleList = document.getElementById('dayScheduleList');
    if (scheduleList) scheduleList.innerHTML = '<div class="error-message">Failed to load classes</div>';
  }
}

// Generate future class instances
function generateFutureClasses(entries, weeks = 8) {
  const classes = [];
  const now = new Date();
  // Start from today 00:00 for display purposes
  const startCheck = new Date(now);
  startCheck.setHours(0,0,0,0);
  
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + (weeks * 7));
  
  entries.forEach(entry => {
    if (entry.isRecurring && entry.dayOfWeek && Array.isArray(entry.dayOfWeek)) {
      entry.dayOfWeek.forEach(dayStr => {
        console.log(`[DEBUG] Processing Recurring Entry: ${entry.className}, Day: ${dayStr}`);
        let current = new Date(startCheck);
        
        // Map day name to 0-6 (Sun-Sat)
        const dayMap = {
          'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
          'thursday': 4, 'friday': 5, 'saturday': 6
        };
        
        let targetDay;
        const dayKey = String(dayStr).trim().toLowerCase();
        
        if (!isNaN(parseInt(dayStr)) && parseInt(dayStr) >= 0 && parseInt(dayStr) <= 6) {
           // Assume 0=Sun..6=Sat if integer provided (JS standard)
           targetDay = parseInt(dayStr); 
        } else {
           targetDay = dayMap[dayKey];
        }
        
        console.log(`[DEBUG] Generating Future: DayStr='${dayStr}', Target=${targetDay}`);
        
        if (targetDay === undefined) {
            console.warn(`[DEBUG] Invalid day string: ${dayStr}`);
            return;
        }

        const currentDay = current.getDay(); // 0=Sun...6=Sat
        
        let daysUntil = targetDay - currentDay;
        if (daysUntil < 0) daysUntil += 7;
        
        // Important: If today is the target day, daysUntil is 0. 
        // But if the time has passed? The logic below handles startCheck.
        // If we want to include today, keep 0.
        
        current.setDate(current.getDate() + daysUntil);
        
        console.log(`[DEBUG] Start Date adjusted to first instance: ${current.toDateString()}`);
        
        while (current <= endDate) {
          const currentStr = formatDateForCompare(current);
          let isValid = true;
          
          if (entry.startDate) {
            const startStr = entry.startDate.split('T')[0];
            if (currentStr < startStr) isValid = false;
          }
          if (entry.endDate) {
            const endStr = entry.endDate.split('T')[0];
            if (currentStr > endStr) isValid = false;
          }
          
          if (isValid) {
            // Local date string YYYY-MM-DD
            const yyyy = current.getFullYear();
            const mm = String(current.getMonth() + 1).padStart(2, '0');
            const dd = String(current.getDate()).padStart(2, '0');
            const dateString = `${yyyy}-${mm}-${dd}`;

            classes.push({
              date: new Date(current),
              dateString: dateString,
              entry: entry,
              id: `${entry.id}_${current.getTime()}`
            });
          }
          
          current.setDate(current.getDate() + 7);
        }
      });
    } else if (!entry.isRecurring && entry.date) {
      const entryDate = new Date(entry.date);
      const [hours, mins] = entry.startTime.split(':');
      entryDate.setHours(parseInt(hours), parseInt(mins), 0);
      
      if (entryDate >= startCheck) {
         const yyyy = entryDate.getFullYear();
         const mm = String(entryDate.getMonth() + 1).padStart(2, '0');
         const dd = String(entryDate.getDate()).padStart(2, '0');
         const dateString = `${yyyy}-${mm}-${dd}`;

         classes.push({
           date: entryDate,
           dateString: dateString,
           entry: entry,
           id: entry.id
         });
      }
    }
  });
  
  return classes.sort((a, b) => a.date - b.date);
}

function formatDateForCompare(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// --- Calendar UI Logic ---

window.changeCalendarMonth = function(delta) {
  const currentDate = salesState.classSelection.viewDate;
  currentDate.setMonth(currentDate.getMonth() + delta);
  renderMiniCalendar();
};

window.selectCalendarDate = function(year, month, day) {
  const newDate = new Date(year, month, day);
  salesState.classSelection.selectedDate = newDate;
  renderMiniCalendar(); // Refresh to update selected state
  updateDaySchedule();
};

function renderMiniCalendar() {
  const grid = document.getElementById('miniCalendarGrid');
  const title = document.getElementById('calendarTitle');
  if (!grid || !title) return;
  
  const viewDate = salesState.classSelection.viewDate;
  const selectedDate = salesState.classSelection.selectedDate;
  const today = new Date();
  
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  
  title.textContent = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  grid.innerHTML = '';
  
  // First day of month (0-6, Sun=0) -> Convert to Mon=0
  const firstDay = new Date(year, month, 1).getDay();
  const startOffset = (firstDay === 0 ? 6 : firstDay - 1); // Mon=0, ... Sun=6
  
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Empty slots
  for (let i = 0; i < startOffset; i++) {
    grid.innerHTML += `<div class="calendar-day empty"></div>`;
  }
  
  // Days
  for (let d = 1; d <= daysInMonth; d++) {
    const currentDayDate = new Date(year, month, d);
    const currentStr = formatDateForCompare(currentDayDate);
    const isToday = formatDateForCompare(today) === currentStr;
    const isSelected = formatDateForCompare(selectedDate) === currentStr;
    
    // Check if has classes
    const hasClass = salesState.classSelection.availableClasses.some(c => 
      formatDateForCompare(c.date) === currentStr
    );
    
    const classes = [
      'calendar-day',
      isToday ? 'today' : '',
      isSelected ? 'selected' : '',
      hasClass ? 'has-class' : ''
    ].join(' ');
    
    grid.innerHTML += `
      <div class="${classes}" onclick="selectCalendarDate(${year}, ${month}, ${d})">
        ${d}
        ${hasClass ? '<div class="day-dot"></div>' : ''}
      </div>
    `;
  }
}

// --- Schedule List UI Logic ---

function updateDaySchedule() {
  const header = document.getElementById('scheduleHeader');
  const container = document.getElementById('dayScheduleList');
  if (!header || !container) return;
  
  const selectedDate = salesState.classSelection.selectedDate;
  const selectedStr = formatDateForCompare(selectedDate);
  
  header.innerHTML = `<h3>${selectedDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>`;
  
  // Inject styles for Enrolled/Drop if not present
  if (!document.getElementById('salesDropStyles')) {
      const style = document.createElement('style');
      style.id = 'salesDropStyles';
      style.textContent = `
        .schedule-card.enrolled { border: 2px solid #10b981; background: #f0fdf4; }
        .card-header-badge { background: #10b981; color: white; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 4px; }
        .enrolled-status { font-size: 12px; color: #059669; margin-top: 4px; font-weight: 500; }
        .drop-actions { display: flex; gap: 10px; margin-top: 8px; font-size: 12px; }
        .drop-link { color: #ef4444; cursor: pointer; text-decoration: underline; }
        .drop-link:hover { color: #dc2626; }
      `;
      document.head.appendChild(style);
  }
  
  // 1. Get Student Enrollments for this day
  const studentId = salesState.selectedStudent?.id;
  let enrolledClasses = [];
  if (studentId) {
      enrolledClasses = (window.timetableEnrollments || []).filter(e => 
          e.studentId === studentId && e.date === selectedStr
      );
  }

  // 2. Get Cart Items (Pending)
  let cartClasses = [];
  salesState.cart.forEach((item, cartIndex) => {
      if (item.enrolledClasses && Array.isArray(item.enrolledClasses)) {
          item.enrolledClasses.forEach(cls => {
              // cls.date might be Date object or string
              const d = new Date(cls.date);
              const dStr = formatDateForCompare(d);
              if (dStr === selectedStr) {
                  cartClasses.push({
                      ...cls,
                      cartIndex: cartIndex,
                      productName: item.productData.name
                  });
              }
          });
      }
  });
  
  // 3. Get Available Classes
  const dayClasses = salesState.classSelection.availableClasses.filter(c => 
    formatDateForCompare(c.date) === selectedStr
  );
  
  if (dayClasses.length === 0 && enrolledClasses.length === 0 && cartClasses.length === 0) {
    container.innerHTML = '<div class="empty-day-state">No classes scheduled for this day.</div>';
    return;
  }
  
  let html = '';
  
  // Render Saved Enrollments
  enrolledClasses.forEach(enrollment => {
      const entry = (window.timetableEntries || []).find(e => e.id === enrollment.timetableEntryId);
      if (!entry) return;
      
      const timeStr = `${entry.startTime} - ${entry.endTime}`;
      
      html += `
      <div class="schedule-card enrolled">
        <div class="card-header-badge">Current order</div>
        <div class="card-time">
          <div class="time-text">${timeStr}</div>
          <div class="cal-icon">📅</div>
        </div>
        <div class="card-details">
          <div class="card-title">${escapeHtml(entry.className)}</div>
          <div class="card-teacher">${escapeHtml(entry.teacherName || 'Unknown Teacher')}</div>
          <div class="enrolled-status">✅ Enrolled</div>
        </div>
        <div class="card-actions">
             <div class="drop-actions">
                 <span class="drop-link" onclick="dropSalesLesson('${enrollment.id}')">Drop Lesson</span>
                 <span class="drop-link" onclick="dropSalesAllFuture('${entry.id}')">Drop All Future</span>
             </div>
        </div>
      </div>`;
  });

  // Render Cart Classes
  cartClasses.forEach(cls => {
      const entry = cls.entry;
      const timeStr = `${entry.startTime} - ${entry.endTime}`;
      
      html += `
      <div class="schedule-card in-cart" style="border: 2px solid #3b82f6; background: #eff6ff;">
        <div class="card-header-badge" style="background: #3b82f6;">In Cart</div>
        <div class="card-time">
          <div class="time-text">${timeStr}</div>
          <div class="cal-icon">🛒</div>
        </div>
        <div class="card-details">
          <div class="card-title">${escapeHtml(entry.className)}</div>
          <div class="card-teacher">${escapeHtml(entry.teacherName || 'Unknown Teacher')}</div>
          <div class="enrolled-status" style="color: #2563eb;">Pending Payment</div>
        </div>
        <div class="card-actions">
             <div class="drop-actions">
                 <span class="drop-link" onclick="removeSalesCartItem(${cls.cartIndex}); if(typeof updateDaySchedule === 'function') updateDaySchedule();" style="color:#ef4444;">Remove from Cart</span>
             </div>
        </div>
      </div>`;
  });
  
  // Render Available Classes
  const productType = salesState.selectedProduct ? salesState.selectedProduct.type : 'course';
  
  html += dayClasses.map(cls => {
    // Skip if already enrolled or in cart
    const isEnrolled = enrolledClasses.some(e => e.timetableEntryId === cls.entry.id);
    const isInCart = cartClasses.some(c => c.entry.id === cls.entry.id);
    
    if (isEnrolled || isInCart) return ''; 
    
    const timeStr = `${cls.entry.startTime} - ${cls.entry.endTime}`;
    let buttonsHtml = '';
    
    buttonsHtml += `
      <div class="enroll-option">
        <span class="option-label">Single lesson (${cls.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})</span>
        <button class="btn btn-sm btn-outline" onclick="enrollSingle('${cls.id}')">Enroll</button>
      </div>
    `;
    
    if (productType === 'package' && salesState.selectedProduct) {
      const pkg = salesState.selectedProduct.data;
      const lessonCount = getPackageLessonCount(pkg);
      buttonsHtml += `
        <div class="enroll-option">
          <span class="option-label">All lessons (${lessonCount} lessons from this date)</span>
          <button class="btn btn-sm btn-primary" onclick="enrollConsecutive('${cls.id}', ${lessonCount})">Enroll</button>
        </div>
      `;
    } else if (productType === 'course' && salesState.selectedProduct) {
      // Enable "Enroll Next 4" for single courses too, as requested
      const lessonCount = 4;
      buttonsHtml += `
        <div class="enroll-option">
          <span class="option-label">Next 4 lessons</span>
          <button class="btn btn-sm btn-primary" onclick="enrollConsecutive('${cls.id}', ${lessonCount})">Enroll</button>
        </div>
      `;
    }
    
    return `
      <div class="schedule-card">
        <div class="card-time">
          <div class="time-text">${timeStr}</div>
          <div class="cal-icon">📅</div>
        </div>
        <div class="card-details">
          <div class="card-title">${escapeHtml(cls.entry.className)}</div>
          <div class="card-teacher">${escapeHtml(cls.entry.teacherName || 'Unknown Teacher')}</div>
        </div>
        <div class="card-actions">
          ${buttonsHtml}
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
}

// Drop Lesson Logic
window.dropSalesLesson = async function(enrollmentId) {
  if (!confirm('Are you sure you want to drop this lesson? Credit will be refunded if applicable.')) return;
  
  try {
    const response = await window.authUtils.authenticatedFetch('/organizations/enrollments/drop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: salesState.selectedStudent.id,
        mode: 'single',
        enrollmentId: enrollmentId
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      if (window.showToast) window.showToast('Lesson dropped successfully', 'success');
      else alert('Lesson dropped successfully');
      
      // Refresh Timetable (Enrollments)
      if (window.loadTimetableData) await window.loadTimetableData();
      
      // Refresh Student (Balance update)
      if (result.newBalance !== undefined) {
        // We need to refresh the student object in window.students list too?
        const s = (window.students || []).find(stu => stu.id === salesState.selectedStudent.id);
        if (s) s.balance = result.newBalance;
        
        // Trigger UI update via re-selection
        selectSalesStudent(salesState.selectedStudent.id); 
      }
      
      // Refresh Calendar
      // If a course is selected, reload available classes
      if (salesState.classSelection.courseId) {
          loadAvailableClasses(salesState.classSelection.courseId);
      } else {
          // Or just update view
          updateDaySchedule();
      }
      
    } else {
      const err = await response.json();
      alert(err.error || 'Failed to drop lesson');
    }
  } catch (e) {
    console.error(e);
    alert('Error processing request');
  }
};

window.dropSalesAllFuture = async function(timetableEntryId) {
   if (!confirm('Are you sure you want to drop ALL future lessons for this class series? This action cannot be undone.')) return;
   
   try {
    const response = await window.authUtils.authenticatedFetch('/organizations/enrollments/drop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: salesState.selectedStudent.id,
        mode: 'all',
        timetableEntryId: timetableEntryId
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      if (window.showToast) window.showToast(`Dropped ${result.droppedCount} lessons. Refund: $${result.refundAmount}`, 'success');
      else alert(`Dropped ${result.droppedCount} lessons. Refund: $${result.refundAmount}`);
      
      if (window.loadTimetableData) await window.loadTimetableData();
      
      if (result.newBalance !== undefined) {
        const s = (window.students || []).find(stu => stu.id === salesState.selectedStudent.id);
        if (s) s.balance = result.newBalance;
        selectSalesStudent(salesState.selectedStudent.id); 
      }
      
      if (salesState.classSelection.courseId) {
          loadAvailableClasses(salesState.classSelection.courseId);
      } else {
          updateDaySchedule();
      }
    } else {
      const err = await response.json();
      alert(err.error || 'Failed to drop lessons');
    }
   } catch (e) {
       console.error(e);
       alert('Error processing request');
   }
};

window.enrollSingle = function(classInstanceId) {
  const cls = findClassInstance(classInstanceId);
  if (!cls) return;
  addToCart([cls]);
};

window.enrollConsecutive = function(startClassInstanceId, count) {
  // Find start index
  const allFuture = salesState.classSelection.availableClasses;
  const startIndex = allFuture.findIndex(c => c.id === startClassInstanceId);
  
  if (startIndex === -1) return;
  
  // Select consecutive classes matching the same time/day logic?
  // Or just next N available classes for this course?
  // Usually "Every Monday" means same day/time.
  // Filter allFuture to match the dayOfWeek and Time of the start class
  const startCls = allFuture[startIndex];
  const startDayStr = startCls.date.toDateString().split(' ')[0]; // "Mon"
  const startTime = startCls.entry.startTime;
  
  const matchingClasses = allFuture.filter((c, idx) => 
    idx >= startIndex && 
    c.entry.startTime === startTime &&
    c.date.getDay() === startCls.date.getDay() // Strict same day of week
  );
  
  const selected = matchingClasses.slice(0, count);
  
  if (selected.length < count) {
    if(!confirm(`Only ${selected.length} future classes found. Enroll anyway?`)) return;
  }
  
  addToCart(selected);
};

function findClassInstance(id) {
  return salesState.classSelection.availableClasses.find(c => c.id === id);
}

function addToCart(selectedClasses) {
  if (selectedClasses.length === 0) return;
  
  // Format classes for order (Ensure Date is YYYY-MM-DD string to prevent timezone shifts)
  const formattedClasses = selectedClasses.map(cls => ({
      ...cls,
      date: formatDateForCompare(cls.date) // e.g. "2025-12-08"
  }));
  
  // Create Order Item
  const orderItem = {
    id: Date.now().toString(),
    productType: salesState.selectedProduct.type,
    productData: salesState.selectedProduct.data,
    enrolledClasses: formattedClasses,
    price: salesState.selectedProduct.type === 'package' 
      ? calculateSalesPackagePrice(salesState.selectedProduct.data)
      : parseFloat(salesState.selectedProduct.data.price) * selectedClasses.length
  };
  
  salesState.cart.push(orderItem);
  
  // Stay on Calendar View (Step 2)
  // salesState.step = 1;
  // salesState.selectedProduct = null;
  // showProductList();
  
  renderSalesCart();
  
  // Refresh Schedule to show "In Cart" status
  if (typeof updateDaySchedule === 'function') updateDaySchedule();
  if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
}

// ==================== Student Search in Sales ====================
// (Keep existing student search code below...)

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
  
  const balance = typeof student.balance === 'number' ? student.balance : 0;
  
  card.innerHTML = `
    <div class="selected-student-avatar">${student.name.charAt(0).toUpperCase()}</div>
    <div class="selected-student-info">
      <h3>${escapeHtml(student.name)} <span class="student-id-badge">${escapeHtml(student.studentId)}</span></h3>
      <div class="student-balance">Balance: $${balance.toFixed(2)}</div>
    </div>
    <button class="btn-close-student" onclick="deselectSalesStudent()">×</button>
  `;

  // Create/Update History Container
  let historyContainer = document.getElementById('salesStudentHistory');
  if (!historyContainer) {
      historyContainer = document.createElement('div');
      historyContainer.id = 'salesStudentHistory';
      historyContainer.className = 'sales-student-history';
      // Insert after student card
      if (card.parentNode) card.parentNode.insertBefore(historyContainer, card.nextSibling);
  }
  
  if (window.renderStudentEnrollments) window.renderStudentEnrollments();
  
  // Show cart placeholder text
  document.querySelector('.cart-empty-state').innerHTML = 'Select products from the left to create an order.';
  
  // Render cart if any
  renderSalesCart();
  
  // Refresh Calendar
  if (typeof updateDaySchedule === 'function') updateDaySchedule();
  if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
};

// Deselect Student
window.deselectSalesStudent = function() {
  salesState.selectedStudent = null;
  document.getElementById('selectedStudentCard').style.display = 'none';
  
  const historyContainer = document.getElementById('salesStudentHistory');
  if (historyContainer) historyContainer.innerHTML = '';
  
  document.getElementById('emptyStudentState').style.display = 'flex';
  document.querySelector('.cart-empty-state').innerHTML = 'You will see student\'s orders here once you have selected a student above.';
  // Hide cart content
  document.getElementById('salesCartContent').style.display = 'none';
  
  // Refresh Calendar
  if (typeof updateDaySchedule === 'function') updateDaySchedule();
  if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
};

// Jump to Date from History
window.jumpToDate = function(dateString, courseId) {
    if (!dateString) return;
    
    // Parse simple date string YYYY-MM-DD
    const parts = dateString.split('-');
    if (parts.length !== 3) return;
    const targetDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    
    // Check if we need to switch to Step 2 (Calendar View)
    const calendarExists = document.getElementById('miniCalendarGrid');
    if (!calendarExists) {
        if (courseId) {
            // Find product context to display calendar
            // Try Course
            let product = (window.courses || []).find(c => c.id === courseId);
            let type = 'course';
            
            // If not found in courses, might be a package? 
            // But entry.courseIds usually refers to Course definitions.
            
            if (product) {
                // Simulate selecting the product to open calendar
                handleProductSelect(type, product.id);
                // Note: handleProductSelect resets salesState.classSelection
                // We will override the date below.
            } else {
                console.warn('Product not found for jump:', courseId);
                // Try to force render anyway if possible? 
                // renderClassSelectionUI fails without selectedProduct.
                return;
            }
        } else {
            return; // No context
        }
    }
    
    // Update View Date (Month) if different
    const currentView = salesState.classSelection.viewDate;
    if (targetDate.getMonth() !== currentView.getMonth() || targetDate.getFullYear() !== currentView.getFullYear()) {
        salesState.classSelection.viewDate = new Date(targetDate);
    }
    
    // Select Date
    salesState.classSelection.selectedDate = targetDate;
    
    // Refresh UI
    // If we just called handleProductSelect, loadAvailableClasses is running and will refresh UI.
    // But we update state here, so when it renders, it should use our date.
    // We also call render here for immediate feedback if UI exists.
    if (document.getElementById('miniCalendarGrid')) {
        if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
        if (typeof updateDaySchedule === 'function') updateDaySchedule();
    }
};

// Render Student Enrollments List
window.renderStudentEnrollments = function() {
    const container = document.getElementById('salesStudentHistory');
    if (!container) return;
    
    const studentId = salesState.selectedStudent?.id;
    if (!studentId) {
        container.innerHTML = '';
        return;
    }
    
    // Get enrollments
    const enrollments = (window.timetableEnrollments || []).filter(e => e.studentId === studentId);
    
    // Sort by date (Oldest -> Newest)
    enrollments.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    if (enrollments.length === 0) {
        container.innerHTML = ''; // No history to show
        return;
    }
    
    // Inject CSS for history
    if (!document.getElementById('salesHistoryStyles')) {
        const style = document.createElement('style');
        style.id = 'salesHistoryStyles';
        style.textContent = `
            .sales-student-history { margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 8px; max-height: 200px; overflow-y: auto; }
            .history-header { font-weight: bold; font-size: 12px; color: #666; margin-bottom: 5px; }
            .history-item { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; border-bottom: 1px solid #eee; cursor: pointer; transition: background 0.2s; }
            .history-item:hover { background: #e5e7eb; }
            .history-date { color: #667eea; font-weight: 500; margin-right: 10px; }
            .history-info { flex: 1; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        `;
        document.head.appendChild(style);
    }
    
    container.innerHTML = `
        <div class="history-header">Enrolled Dates (${enrollments.length})</div>
        <div class="history-list">
            ${enrollments.map(e => {
                const entry = (window.timetableEntries || []).find(ent => ent.id === e.timetableEntryId);
                const className = entry ? entry.className : 'Unknown Class';
                const courseId = (entry && entry.courseIds && entry.courseIds.length > 0) ? entry.courseIds[0] : '';
                return `
                    <div class="history-item" onclick="jumpToDate('${e.date}', '${courseId}')" title="Jump to date">
                        <div class="history-date">${e.date}</div>
                        <div class="history-info">${escapeHtml(className)}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    // Scroll to bottom
    const list = container.querySelector('.sales-student-history');
    if (list) list.scrollTop = list.scrollHeight;
};

window.resetSales = function() {
  salesState.cart = [];
  deselectSalesStudent();
  // Refresh products
  salesState.step = 1;
  showProductList();
};

window.saveSalesOrder = async function() {
  await submitSalesOrder('unpaid');
};

window.processSalesPayment = async function() {
  await submitSalesOrder('paid');
};

async function submitSalesOrder(status) {
  if (salesState.cart.length === 0) {
    if (window.showToast) window.showToast('Cart is empty', 'error');
    else alert('Cart is empty');
    return;
  }
  
  if (!salesState.selectedStudent) {
    if (window.showToast) window.showToast('No student selected', 'error');
    else alert('No student selected');
    return;
  }
  
  // Use button reference
  const payBtn = document.querySelector('.sales-footer-actions .btn-primary');
  const saveBtn = document.querySelector('.sales-footer-actions .btn-secondary'); // Assuming Save is the secondary button
  const activeBtn = status === 'paid' ? payBtn : saveBtn;
  const originalText = activeBtn ? activeBtn.textContent : '';
  
  if (activeBtn) {
    activeBtn.textContent = 'Processing...';
    activeBtn.disabled = true;
  }
  
  const payload = {
    studentId: salesState.selectedStudent.id,
    items: salesState.cart,
    paymentStatus: status
  };
  
  try {
     const response = await window.authUtils.authenticatedFetch('/organizations/orders', {
       method: 'POST',
       body: JSON.stringify(payload)
     });
     
     if (response && response.ok) {
       const order = await response.json();
       if (window.showToast) window.showToast(status === 'paid' ? 'Payment successful!' : 'Order saved!', 'success');
       else alert(status === 'paid' ? 'Payment successful!' : 'Order saved!');
       
       // resetSales();
       
       // Keep State, Clear Cart
       salesState.cart = [];
       renderSalesCart();
       
       // Refresh Data
       if (typeof window.loadTimetableData === 'function') {
         await window.loadTimetableData();
       }
       
       // Refresh UI (History & Calendar)
       if (salesState.selectedStudent) {
           if (typeof renderStudentEnrollments === 'function') renderStudentEnrollments();
           if (typeof updateDaySchedule === 'function') updateDaySchedule();
           if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
       }
     } else {
       let errorMsg = 'Failed to save order';
       try {
         const err = await response.json();
         errorMsg = err.error || errorMsg;
       } catch(e) {}
       
       if (window.showToast) window.showToast(errorMsg, 'error');
       else alert(errorMsg);
     }
  } catch (e) {
    console.error('Order Error:', e);
    if (window.showToast) window.showToast('Error processing order', 'error');
    else alert('Error processing order');
  } finally {
    if (activeBtn) {
       activeBtn.textContent = originalText;
       activeBtn.disabled = false;
     }
  }
}

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
    
    const getFormattedDate = (d) => {
        if (!d) return '';
        const dateObj = new Date(d);
        return !isNaN(dateObj) ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    };

    const firstDate = getFormattedDate(item.enrolledClasses[0]?.date);
    const lastDate = getFormattedDate(item.enrolledClasses[dateCount-1]?.date);
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

function getPackageLessonCount(pkg) {
  if (!pkg.courses) return 0;
  return pkg.courses.reduce((sum, c) => sum + c.quantity, 0);
}

// Add CSS styles dynamically for new layout
const salesStyles = document.createElement('style');
salesStyles.textContent = `
  .sales-class-selection-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #fff;
  }
  
  .selection-header-bar {
    display: flex;
    align-items: center;
    padding: 15px;
    border-bottom: 1px solid #e0e0e0;
    background: #f8f9fa;
  }
  
  .header-product-info {
    display: flex;
    flex-direction: column;
  }
  
  .header-product-info .badge {
    display: inline-block;
    font-size: 10px;
    background: #e0e0e0;
    padding: 2px 6px;
    border-radius: 4px;
    width: fit-content;
    margin-top: 2px;
  }
  
  .calendar-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  
  .calendar-sidebar {
    width: 280px;
    border-right: 1px solid #e0e0e0;
    padding: 15px;
    display: flex;
    flex-direction: column;
    background: #fff;
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
  
  .calendar-day.empty {
    cursor: default;
  }
  
  .calendar-day.selected {
    background: #667eea;
    color: #fff;
  }
  
  .calendar-day.today {
    border: 1px solid #667eea;
  }
  
  .day-dot {
    position: absolute;
    bottom: 4px;
    width: 4px;
    height: 4px;
    background: #10b981;
    border-radius: 50%;
  }
  
  .calendar-day.selected .day-dot {
    background: #fff;
  }
  
  .calendar-legend {
    margin-top: 15px;
    font-size: 12px;
    color: #666;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  
  .dot-legend {
    width: 6px;
    height: 6px;
    background: #10b981;
    border-radius: 50%;
    display: inline-block;
  }
  
  .schedule-header {
    margin-bottom: 20px;
    border-bottom: 1px solid #e0e0e0;
    padding-bottom: 10px;
  }
  
  .schedule-header h3 {
    margin: 0;
    color: #333;
  }
  
  .schedule-card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 15px;
    display: flex;
    gap: 15px;
    align-items: flex-start;
  }
  
  .card-time {
    min-width: 80px;
    text-align: center;
    border-right: 1px solid #eee;
    padding-right: 15px;
  }
  
  .time-text {
    font-weight: bold;
    color: #333;
    font-size: 14px;
  }
  
  .cal-icon {
    font-size: 20px;
    margin-top: 5px;
  }
  
  .card-details {
    flex: 1;
  }
  
  .card-title {
    font-weight: 600;
    font-size: 16px;
    color: #333;
    margin-bottom: 4px;
  }
  
  .card-teacher {
    font-size: 13px;
    color: #666;
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
`;
document.head.appendChild(salesStyles);
