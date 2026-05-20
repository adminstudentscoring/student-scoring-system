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
  const badgeClass =
    salesState.selectedProduct.type === 'package' ? 'badge badge-package' : 'badge badge-course';

  container.innerHTML = `
    <div class="selection-header-bar">
      <button class="btn-back" onclick="backToProductList()">← Back</button>
      <div class="header-product-info">
        <strong>${productName}</strong>
        <span class="${badgeClass}">${productType}</span>
      </div>
    </div>
    
    <div class="calendar-layout">
      <!-- Left Column: Calendar -->
      <div class="calendar-sidebar">
        <div class="calendar-nav">
          <button type="button" onclick="changeCalendarMonth(-1)">‹</button>
          <span id="calendarTitle">—</span>
          <button type="button" onclick="changeCalendarMonth(1)">›</button>
        </div>
        <div class="calendar-triple-wrap">
          ${[0, 1, 2]
            .map(
              (i) => `
          <div class="calendar-month-column">
            <div id="calendarMonthLabel${i}" class="mini-cal-month-title"></div>
            <div class="calendar-grid-header mini-cal-head">
              <div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div>
            </div>
            <div id="miniCalendarGrid${i}" class="calendar-grid calendar-grid-triple"></div>
          </div>`
            )
            .join('')}
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

function filterTimetableEntriesForSalesCourse(courseId) {
  const allEntries = window.timetableEntries || [];
  return allEntries.filter((e) => {
    if (!e.teacherName && e.teacherIds && e.teacherIds.length > 0) {
      e.teacherName = getTeacherName(e.teacherIds[0]);
    }
    if (e.courseIds && Array.isArray(e.courseIds) && e.courseIds.includes(courseId)) {
      return true;
    }
    return e.courseId === courseId;
  });
}

/** Recompute green-dot / day list from cached timetable (call after month navigation). */
function rebuildSalesAvailableClasses(courseId) {
  if (!courseId || !salesState.classSelection) {
    updateDaySchedule();
    return;
  }
  const courseEntries = filterTimetableEntriesForSalesCourse(courseId);
  const viewDate = salesState.classSelection.viewDate;
  salesState.classSelection.availableClasses = generateFutureClasses(courseEntries, 26, viewDate);
  renderMiniCalendar();
  updateDaySchedule();
}

// Load Available Classes
async function loadAvailableClasses(courseId) {
  if (typeof window !== 'undefined' && window.salesTrace) {
    window.salesTrace('loadAvailableClasses', { courseId });
  }
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
    
    rebuildSalesAvailableClasses(courseId);
    
  } catch (error) {
    console.error('Error loading classes:', error);
    const scheduleList = document.getElementById('dayScheduleList');
    if (scheduleList) scheduleList.innerHTML = '<div class="error-message">Failed to load classes</div>';
  }
}

// Generate class instances for the sales calendar: visible 3-month window + forward weeks,
// and at least 1 calendar year before today (whichever reaches further back).
function generateFutureClasses(entries, weeks = 8, viewDate = null) {
  const classes = [];
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  let startCheck = new Date(todayStart);
  let endDate = new Date(todayStart);
  endDate.setDate(endDate.getDate() + (weeks * 7));

  if (viewDate && !isNaN(viewDate.getTime())) {
    const visStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    visStart.setHours(0, 0, 0, 0);
    const visEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 3, 0);
    visEnd.setHours(23, 59, 59, 999);
    if (visStart < startCheck) {
      startCheck = visStart;
    }
    if (visEnd.getTime() > endDate.getTime()) {
      endDate = visEnd;
    }
  }

  // Allow ~1 year before today so you can scroll far back without empty dots / lists.
  const historyStart = new Date(todayStart);
  historyStart.setFullYear(historyStart.getFullYear() - 1);
  if (historyStart < startCheck) {
    startCheck = historyStart;
  }

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

/** Match enrollment `date` to calendar day (handles plain YYYY-MM-DD or ISO strings). */
function enrollmentDateYmd(dateVal) {
  if (dateVal == null || dateVal === '') return '';
  const s = String(dateVal);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

// --- Calendar UI Logic ---

window.changeCalendarMonth = function(delta) {
  if (!salesState.classSelection) return;
  const currentDate = salesState.classSelection.viewDate;
  currentDate.setMonth(currentDate.getMonth() + delta);
  const cid = salesState.classSelection.courseId;
  if (cid && Array.isArray(window.timetableEntries)) {
    rebuildSalesAvailableClasses(cid);
  } else {
    renderMiniCalendar();
  }
};

window.selectCalendarDate = function(year, month, day) {
  const newDate = new Date(year, month, day);
  salesState.classSelection.selectedDate = newDate;
  renderMiniCalendar(); // Refresh to update selected state
  updateDaySchedule();
};

function renderOneMiniMonth(gridEl, labelEl, year, month, selectedDate, today) {
  if (!gridEl) return;
  if (labelEl) {
    labelEl.textContent = new Date(year, month, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });
  }
  let html = '';
  const firstDay = new Date(year, month, 1).getDay();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < startOffset; i++) {
    html += `<div class="calendar-day empty"></div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const currentDayDate = new Date(year, month, d);
    const currentStr = formatDateForCompare(currentDayDate);
    const isToday = formatDateForCompare(today) === currentStr;
    const isSelected = formatDateForCompare(selectedDate) === currentStr;
    const hasClass = salesState.classSelection.availableClasses.some(
      (c) => formatDateForCompare(c.date) === currentStr
    );
    const classes = [
      'calendar-day',
      isToday ? 'today' : '',
      isSelected ? 'selected' : '',
      hasClass ? 'has-class' : ''
    ].join(' ');
    html += `
      <div class="${classes}" onclick="selectCalendarDate(${year}, ${month}, ${d})">
        ${d}
        ${hasClass ? '<div class="day-dot"></div>' : ''}
      </div>
    `;
  }
  gridEl.innerHTML = html;
}

function renderMiniCalendar() {
  const title = document.getElementById('calendarTitle');
  const viewDate = salesState.classSelection.viewDate;
  const selectedDate = salesState.classSelection.selectedDate;
  const today = new Date();
  const y0 = viewDate.getFullYear();
  const m0 = viewDate.getMonth();

  const g0 = document.getElementById('miniCalendarGrid0');
  if (g0) {
    for (let i = 0; i < 3; i++) {
      const d = new Date(y0, m0 + i, 1);
      const grid = document.getElementById(`miniCalendarGrid${i}`);
      const label = document.getElementById(`calendarMonthLabel${i}`);
      renderOneMiniMonth(grid, label, d.getFullYear(), d.getMonth(), selectedDate, today);
    }
    if (title) {
      const first = new Date(y0, m0, 1);
      const last = new Date(y0, m0 + 2, 1);
      title.textContent = `${first.toLocaleDateString('en-US', { month: 'short' })} – ${last.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
    }
    console.log('[SalesCalendar] renderMiniCalendar 3 months (stacked)', {
      anchor: `${y0}-${String(m0 + 1).padStart(2, '0')}`,
      title: title?.textContent
    });
    return;
  }

  const grid = document.getElementById('miniCalendarGrid');
  if (!grid || !title) return;
  title.textContent = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  renderOneMiniMonth(grid, null, y0, m0, selectedDate, today);
}

function closeAllSalesRowMenus() {
