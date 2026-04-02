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

  bindSalesCalendarWheelNavigation();
}

function bindSalesCalendarWheelNavigation() {
  const sidebar = document.querySelector('.calendar-layout .calendar-sidebar');
  if (!sidebar) return;
  if (sidebar.dataset.salesWheelNav === '1') return;
  sidebar.dataset.salesWheelNav = '1';
  let lastWheelTs = 0;
  sidebar.addEventListener(
    'wheel',
    (e) => {
      if (!salesState.classSelection) return;
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheelTs < 100) return;
      lastWheelTs = now;
      const dir = e.deltaY > 0 ? 1 : -1;
      window.changeCalendarMonth(dir);
    },
    { passive: false }
  );
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
      // Ensure teacherName is populated if missing
      if (!e.teacherName && e.teacherIds && e.teacherIds.length > 0) {
          e.teacherName = getTeacherName(e.teacherIds[0]);
      }

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

  const holidaySet = new Set(
    Array.isArray(window.timetableSettings?.holidays) ? window.timetableSettings.holidays : []
  );
  
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

            if (holidaySet.has(dateString)) {
              current.setDate(current.getDate() + 7);
              continue;
            }

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

         if (!holidaySet.has(dateString)) {
           classes.push({
             date: entryDate,
             dateString: dateString,
             entry: entry,
             id: entry.id
           });
         }
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
  if (!salesState.classSelection) return;
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
  
  const firstDay = new Date(year, month, 1).getDay();
  const startOffset = (firstDay === 0 ? 6 : firstDay - 1); // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  for (let i = 0; i < startOffset; i++) {
    grid.innerHTML += `<div class="calendar-day empty"></div>`;
  }
  
  for (let d = 1; d <= daysInMonth; d++) {
    const currentDayDate = new Date(year, month, d);
    const currentStr = formatDateForCompare(currentDayDate);
    const isToday = formatDateForCompare(today) === currentStr;
    const isSelected = formatDateForCompare(selectedDate) === currentStr;
    
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

function updateDaySchedule() {
  const header = document.getElementById('scheduleHeader');
  const container = document.getElementById('dayScheduleList');
  if (!header || !container) return;
  
  const selectedDate = salesState.classSelection.selectedDate;
  const selectedStr = formatDateForCompare(selectedDate);
  
  header.innerHTML = `<h3>${selectedDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>`;
  
  // Inject styles
  if (!document.getElementById('salesDropStyles')) {
      const style = document.createElement('style');
      style.id = 'salesDropStyles';
      style.textContent = `
        .schedule-card.enrolled { border: 2px solid #10b981; background: #f0fdf4; }
        .schedule-card.in-cart { border: 2px solid #3b82f6; background: #eff6ff; }
        .card-header-badge { background: #10b981; color: white; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 4px; }
        .enrolled-status { font-size: 12px; color: #059669; margin-top: 4px; font-weight: 500; }
        .drop-actions { display: flex; gap: 10px; margin-top: 8px; font-size: 12px; }
        .drop-link { color: #ef4444; cursor: pointer; text-decoration: underline; }
        .drop-link:hover { color: #dc2626; }
      `;
      document.head.appendChild(style);
  }
  
  // 1. Get Saved Enrollments (from DB)
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
        <div class="card-header-badge">Enrolled</div>
        <div class="card-time">
          <div class="time-text">${timeStr}</div>
          <div class="cal-icon">📅</div>
        </div>
        <div class="card-details">
          <div class="card-title">${escapeHtml(entry.className)}</div>
          <div class="card-teacher">${escapeHtml(entry.teacherName || (entry.teacherIds && entry.teacherIds.length > 0 ? getTeacherName(entry.teacherIds[0]) : 'Unknown Teacher'))}</div>
          <div class="enrolled-status">✅ Saved</div>
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
      <div class="schedule-card in-cart">
        <div class="card-header-badge" style="background: #3b82f6;">In Cart</div>
        <div class="card-time">
          <div class="time-text">${timeStr}</div>
          <div class="cal-icon">🛒</div>
        </div>
        <div class="card-details">
          <div class="card-title">${escapeHtml(entry.className)}</div>
          <div class="card-teacher">${escapeHtml(entry.teacherName || (entry.teacherIds && entry.teacherIds.length > 0 ? getTeacherName(entry.teacherIds[0]) : 'Unknown Teacher'))}</div>
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
      
      if (pkg.priceStrategy === 'monthly') {
          const period = pkg.monthlyPeriod || 1;
          const label = `Monthly (${period} mo)`;
          buttonsHtml += `
            <div class="enroll-option">
              <span class="option-label">${label}</span>
              <button class="btn btn-sm btn-primary" onclick="enrollMonthly('${cls.id}', ${period})">Enroll</button>
            </div>
          `;
      } else {
          const lessonCount = getPackageLessonCount(pkg);
          buttonsHtml += `
            <div class="enroll-option">
              <span class="option-label">All lessons (${lessonCount} lessons from this date)</span>
              <button class="btn btn-sm btn-primary" onclick="enrollConsecutive('${cls.id}', ${lessonCount})">Enroll</button>
            </div>
          `;
      }
    } else if (productType === 'course' && salesState.selectedProduct) {
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
          <div class="card-teacher">${escapeHtml(cls.entry.teacherName || (cls.entry.teacherIds && cls.entry.teacherIds.length > 0 ? getTeacherName(cls.entry.teacherIds[0]) : 'Unknown Teacher'))}</div>
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
      
      if (window.loadTimetableData) await window.loadTimetableData();
      
      if (result.newBalance !== undefined) {
        const s = (window.students || []).find(stu => stu.id === salesState.selectedStudent.id);
        if (s) s.balance = result.newBalance;
        selectSalesStudent(salesState.selectedStudent.id); 
      }
      
      if (salesState.selectedStudent?.id && typeof window.loadStudentOrders === 'function') {
        await window.loadStudentOrders(salesState.selectedStudent.id);
      }
      
      if (salesState.classSelection.courseId) {
          loadAvailableClasses(salesState.classSelection.courseId);
      } else {
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
  const fromStr = formatDateForCompare(salesState.classSelection.selectedDate);
  if (
    !confirm(
      `Drop this class from ${fromStr} onward (including this date)? Earlier dates in this series stay enrolled. This cannot be undone.`
    )
  ) {
    return;
  }

   try {
    const response = await window.authUtils.authenticatedFetch('/organizations/enrollments/drop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: salesState.selectedStudent.id,
        mode: 'all',
        timetableEntryId: timetableEntryId,
        date: fromStr
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
      
      if (salesState.selectedStudent?.id && typeof window.loadStudentOrders === 'function') {
        await window.loadStudentOrders(salesState.selectedStudent.id);
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
  const allFuture = salesState.classSelection.availableClasses;
  const startIndex = allFuture.findIndex(c => c.id === startClassInstanceId);
  
  if (startIndex === -1) return;
  
  const startCls = allFuture[startIndex];
  const startTime = startCls.entry.startTime;
  
  const matchingClasses = allFuture.filter((c, idx) => 
    idx >= startIndex && 
    c.entry.startTime === startTime &&
    c.date.getDay() === startCls.date.getDay()
  );
  
  const selected = matchingClasses.slice(0, count);
  
  if (selected.length < count) {
    if(!confirm(`Only ${selected.length} future classes found. Enroll anyway?`)) return;
  }
  
  addToCart(selected);
};

window.enrollMonthly = function(startClassInstanceId, periodMonths) {
  const allFuture = salesState.classSelection.availableClasses;
  const startIndex = allFuture.findIndex(c => c.id === startClassInstanceId);
  
  if (startIndex === -1) return;
  
  const startCls = allFuture[startIndex];
  const startDate = new Date(startCls.date);
  
  const startMonth = startDate.getMonth();
  const startYear = startDate.getFullYear();
  const endDate = new Date(startYear, startMonth + periodMonths, 0);
  endDate.setHours(23, 59, 59, 999);
  
  console.log(`[DEBUG] Enroll Monthly: Start=${startDate.toISOString()}, Period=${periodMonths}, End=${endDate.toISOString()}`);
  
  const startTime = startCls.entry.startTime;
  const startDayOfWeek = startCls.date.getDay();
  
  const selected = allFuture.filter((c, idx) => {
      if (idx < startIndex) return false;
      if (c.date > endDate) return false;
      
      if (c.entry.startTime !== startTime) return false;
      if (c.date.getDay() !== startDayOfWeek) return false;
      
      return true;
  });
  
  console.log(`[DEBUG] Selected ${selected.length} classes`);
  
  if (selected.length === 0) {
      alert('No classes found in the selected period.');
      return;
  }
  
  addToCart(selected);
};

function findClassInstance(id) {
  return salesState.classSelection.availableClasses.find(c => c.id === id);
}

function addToCart(selectedClasses) {
  if (selectedClasses.length === 0) return;
  
  const formattedClasses = selectedClasses.map(cls => ({
      ...cls,
      date: formatDateForCompare(cls.date)
  }));
  
  let price = 0;
  if (salesState.selectedProduct.type === 'package') {
      const pkg = salesState.selectedProduct.data;
      if (pkg.priceStrategy === 'monthly') {
          price = (pkg.monthlyLessonPrice || 0) * selectedClasses.length;
      } else {
          price = calculateSalesPackagePrice(pkg);
      }
  } else {
      price = parseFloat(salesState.selectedProduct.data.price) * selectedClasses.length;
  }
  
  const orderItem = {
    id: Date.now().toString(),
    productType: salesState.selectedProduct.type,
    productData: salesState.selectedProduct.data,
    enrolledClasses: formattedClasses,
    price: price
  };
  
  salesState.cart.push(orderItem);
  renderSalesCart();
  if (typeof updateDaySchedule === 'function') updateDaySchedule();
  if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
}

// Show Student Dropdown
