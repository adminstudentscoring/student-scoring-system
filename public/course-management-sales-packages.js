// ==================== Step 2: Class/Date Selection (Calendar View) ====================
//
// Debug Sales / enrollment sync (browser console):
//   window.__DEBUG_SALES__ = true  → [Sales] (verbose infer/sync)
//   window.__SALES_TRACE__ = true  OR  localStorage.setItem('salesTrace','1')  → [SalesTrace] (flow / UI branch)
// Then hard-refresh (Cmd+Shift+R). Filter console by Sales / SalesTrace.

function salesTraceEnabled() {
  try {
    return !!(
      (typeof window !== 'undefined' && window.__SALES_TRACE__) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('salesTrace') === '1')
    );
  } catch {
    return !!(typeof window !== 'undefined' && window.__SALES_TRACE__);
  }
}

function salesTrace(...args) {
  if (!salesTraceEnabled() || typeof console === 'undefined' || !console.info) return;
  console.info('%c[SalesTrace]', 'color:#af52de;font-weight:bold', ...args);
}

function salesDebug(...args) {
  if (typeof window !== 'undefined' && window.__DEBUG_SALES__) {
    console.log('%c[Sales]', 'color:#007aff;font-weight:bold', ...args);
  }
}
if (typeof window !== 'undefined') {
  window.salesDebug = salesDebug;
  window.salesTrace = salesTrace;
}

// Handle Product Select (Step 1 -> Step 2)
window.handleProductSelect = function(type, id) {
  if (!salesState.selectedStudent) {
    alert('Please select a student first');
    document.getElementById('salesStudentSearch').focus();
    return;
  }
  
  let product = null;
  if (type === 'package') {
    product = salesState.packages.find((p) => String(p.id) === String(id));
  } else {
    product = (window.courses || []).find((c) => String(c.id) === String(id));
  }
  
  if (!product) return;

  salesDebug('handleProductSelect', { type, id, name: product.name, priceStrategy: product.priceStrategy });
  if (typeof window.salesTrace === 'function') {
    window.salesTrace('handleProductSelect', {
      type,
      id,
      name: product.name,
      priceStrategy: product.priceStrategy,
      monthly: salesPackageIsMonthly(product)
    });
  }

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

function salesOrderItemIsPackage(item) {
  if (!item || !item.productData) return false;
  if (item.productType === 'package') return true;
  const d = item.productData;
  return Array.isArray(d.courses) && d.courses.length > 0;
}

function pickPackageLineFromOrder(order) {
  if (!order || !Array.isArray(order.items)) return null;
  for (const item of order.items) {
    if (salesOrderItemIsPackage(item) && item.productData && item.productData.id != null) {
      return {
        type: 'package',
        id: String(item.productData.id),
        productDataSnapshot: item.productData
      };
    }
  }
  return null;
}

function pickCourseLineFromOrder(order) {
  if (!order || !Array.isArray(order.items)) return null;
  for (const item of order.items) {
    if (item.productType === 'course' && item.productData && item.productData.id != null) {
      return { type: 'course', id: String(item.productData.id), productDataSnapshot: item.productData };
    }
  }
  for (const item of order.items) {
    if (!salesOrderItemIsPackage(item) && item.productData && item.productData.id != null) {
      return { type: 'course', id: String(item.productData.id), productDataSnapshot: item.productData };
    }
  }
  return null;
}

/**
 * Prefer package over course across the whole list (newest-first orders).
 * Avoids "Next 4 lessons" when any related order still has a package line but an older/other linked order was course-only.
 */
function inferProductFromOrderList(orders, label) {
  for (const order of orders) {
    const p = pickPackageLineFromOrder(order);
    if (p) {
      salesDebug(`infer: package hit (${label})`, order.id, p);
      return p;
    }
  }
  for (const order of orders) {
    const c = pickCourseLineFromOrder(order);
    if (c) {
      salesDebug(`infer: course hit (${label})`, order.id, c);
      return c;
    }
  }
  return null;
}

function inferSalesProductForStudent(studentId) {
  const paid = salesState.currentPaidOrdersForStudent || [];
  const sid = String(studentId);
  const enrollments = (window.timetableEnrollments || []).filter((e) => String(e.studentId) === sid);
  const linkedOrderIds = new Set(enrollments.map((e) => e.orderId).filter(Boolean).map(String));

  salesDebug('inferSalesProductForStudent: start', {
    studentId: sid,
    paidOrderCount: paid.length,
    paidOrderIds: paid.map((o) => o.id),
    enrollmentCount: enrollments.length,
    linkedOrderIds: [...linkedOrderIds]
  });

  const sortOrders = (arr) =>
    [...arr].sort(
      (a, b) =>
        new Date(b.updatedAt || b.date || 0) - new Date(a.updatedAt || a.date || 0)
    );

  const sortedPaid = sortOrders(paid);
  const linkedOrders = [...linkedOrderIds]
    .map((oid) => sortedPaid.find((o) => String(o.id) === oid))
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt || b.date || 0) - new Date(a.updatedAt || a.date || 0));

  let hit = linkedOrders.length ? inferProductFromOrderList(linkedOrders, 'linked') : null;
  if (hit) return hit;

  hit = inferProductFromOrderList(sortedPaid, 'all-paid');
  if (hit) return hit;

  salesDebug('infer: no match → null');
  return null;
}

/**
 * After orders load: if user is on class/calendar step, align product type (course vs package)
 * with the student's paid enrollments (e.g. 2-month package → package options, not "Next 4 lessons").
 */
function salesPackageIsMonthly(pkg) {
  if (!pkg) return false;
  return String(pkg.priceStrategy || '').toLowerCase() === 'monthly';
}

window.syncSalesProductFromStudentOrders = async function (studentId) {
  if (salesState.step !== 2) {
    salesDebug('sync: skip (not step 2 calendar)', { step: salesState.step });
    if (typeof window.salesTrace === 'function') {
      window.salesTrace('syncSalesProductFromStudentOrders: skip (not step 2)', { step: salesState.step });
    }
    return;
  }
  if (!salesState.selectedProduct) {
    salesDebug('sync: skip (no selectedProduct)');
    if (typeof window.salesTrace === 'function') {
      window.salesTrace('syncSalesProductFromStudentOrders: skip (no selectedProduct)');
    }
    return;
  }

  const inferred = inferSalesProductForStudent(studentId);
  if (!inferred) {
    salesDebug('sync: skip (infer returned null)');
    if (typeof window.salesTrace === 'function') {
      window.salesTrace('syncSalesProductFromStudentOrders: skip (infer null)', { studentId });
    }
    return;
  }

  const cur = salesState.selectedProduct;
  salesDebug('sync: compare', {
    current: { type: cur.type, id: cur.data?.id, name: cur.data?.name, priceStrategy: cur.data?.priceStrategy },
    inferred: {
      type: inferred.type,
      id: inferred.id,
      snapStrategy: inferred.productDataSnapshot?.priceStrategy
    }
  });

  // User already chose a package (e.g. monthly); do not replace with inferred course from another order line.
  if (cur.type === 'package' && inferred.type === 'course') {
    salesDebug('sync: keep user package (no downgrade to inferred course)');
    return;
  }
  if (cur.type === inferred.type && String(cur.data.id) === String(inferred.id)) {
    salesDebug('sync: already same product, skip');
    return;
  }

  let data =
    inferred.type === 'package'
      ? salesState.packages.find((p) => String(p.id) === String(inferred.id))
      : (window.courses || []).find((c) => String(c.id) === String(inferred.id));

  if (inferred.type === 'package' && inferred.productDataSnapshot) {
    const snap = inferred.productDataSnapshot;
    if (!data) {
      data = JSON.parse(JSON.stringify(snap));
    } else if (salesPackageIsMonthly(snap) && !salesPackageIsMonthly(data)) {
      data = {
        ...data,
        priceStrategy: 'monthly',
        monthlyPeriod: snap.monthlyPeriod ?? data.monthlyPeriod,
        monthlyLessonPrice: snap.monthlyLessonPrice ?? data.monthlyLessonPrice
      };
    }
  }

  if (!data) {
    salesDebug('sync: abort (no resolved data after package/course lookup)');
    return;
  }

  const nextCourseId =
    inferred.type === 'course'
      ? data.id
      : data.courses && data.courses.length > 0
        ? data.courses[0].courseId
        : null;
  if (!nextCourseId) {
    salesDebug('sync: abort (no nextCourseId from data)', { inferredType: inferred.type, hasCourses: !!(data.courses && data.courses.length) });
    return;
  }

  const prevCourseId = salesState.classSelection && salesState.classSelection.courseId;
  salesState.selectedProduct = { type: inferred.type, data };
  salesDebug('sync: APPLY', {
    nextType: inferred.type,
    nextName: data.name,
    priceStrategy: data.priceStrategy,
    monthly: salesPackageIsMonthly(data),
    nextCourseId,
    prevCourseId
  });

  if (String(prevCourseId || '') !== String(nextCourseId)) {
    await loadAvailableClasses(nextCourseId);
  } else {
    try {
      const response = await window.authUtils.authenticatedFetch('/organizations/timetable');
      if (response && response.ok) {
        const d = await response.json();
        window.timetableEntries = d.entries || [];
        window.timetableEnrollments = d.enrollments || [];
      }
    } catch (_) {
      /* ignore */
    }
    if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
    if (typeof updateDaySchedule === 'function') updateDaySchedule();
  }

  const strong = document.querySelector('.header-product-info strong');
  const badge = document.querySelector('.header-product-info .badge');
  if (strong) strong.textContent = data.name || '';
  if (badge) {
    badge.textContent = inferred.type === 'package' ? 'Package' : 'Course';
    badge.classList.remove('badge-course', 'badge-package');
    badge.classList.add(inferred.type === 'package' ? 'badge-package' : 'badge-course');
  }
};

/**
 * From a specific paid/unpaid order: restore Sales calendar context (package vs course, monthly snapshot).
 * Used when teacher clicks "Use product" on an enrollment group.
 */
window.salesApplyProductFromOrder = async function (orderId) {
  salesTrace('salesApplyProductFromOrder: start', {
    orderId,
    studentId: salesState.selectedStudent?.id,
    step: salesState.step
  });
  if (!orderId || !salesState.selectedStudent) {
    salesTrace('salesApplyProductFromOrder: abort (missing orderId or student)');
    return;
  }

  const findOrder = () => {
    const paid = salesState.currentPaidOrdersForStudent || [];
    const unpaid = salesState.currentUnpaidOrders || [];
    return [...paid, ...unpaid].find((o) => String(o.id) === String(orderId));
  };

  let order = findOrder();
  salesTrace('salesApplyProductFromOrder: findOrder (first)', {
    found: !!order,
    paidCount: (salesState.currentPaidOrdersForStudent || []).length,
    unpaidCount: (salesState.currentUnpaidOrders || []).length
  });
  if (!order && salesState.selectedStudent?.id && typeof window.loadStudentOrders === 'function') {
    salesTrace('salesApplyProductFromOrder: refetch loadStudentOrders');
    await window.loadStudentOrders(salesState.selectedStudent.id);
    order = findOrder();
    salesTrace('salesApplyProductFromOrder: findOrder (after refetch)', { found: !!order });
  }

  if (!order || !Array.isArray(order.items) || !order.items.length) {
    salesTrace('salesApplyProductFromOrder: abort (no order or empty items)', {
      hasOrder: !!order,
      itemCount: order?.items?.length
    });
    if (typeof window.showToast === 'function') {
      window.showToast('Order not found for this student.', 'error');
    }
    return;
  }

  const inferred = inferProductFromOrderList([order], 'order-click');
  if (!inferred) {
    salesTrace('salesApplyProductFromOrder: abort inferProductFromOrderList null', {
      orderId: order.id,
      rawItemTypes: (order.items || []).map((it) => ({
        productType: it.productType,
        hasProductData: !!it.productData,
        snapStrategy: it.productData?.priceStrategy
      }))
    });
    if (typeof window.showToast === 'function') {
      window.showToast('This order has no product line to load.', 'error');
    }
    return;
  }

  salesTrace('salesApplyProductFromOrder: inferred line', {
    type: inferred.type,
    id: inferred.id,
    snapStrategy: inferred.productDataSnapshot?.priceStrategy,
    snapMonthlyPeriod: inferred.productDataSnapshot?.monthlyPeriod
  });

  let data =
    inferred.type === 'package'
      ? salesState.packages.find((p) => String(p.id) === String(inferred.id))
      : (window.courses || []).find((c) => String(c.id) === String(inferred.id));

  if (inferred.type === 'package' && inferred.productDataSnapshot) {
    const snap = inferred.productDataSnapshot;
    if (!data) {
      data = JSON.parse(JSON.stringify(snap));
    } else if (salesPackageIsMonthly(snap) && !salesPackageIsMonthly(data)) {
      data = {
        ...data,
        priceStrategy: 'monthly',
        monthlyPeriod: snap.monthlyPeriod ?? data.monthlyPeriod,
        monthlyLessonPrice: snap.monthlyLessonPrice ?? data.monthlyLessonPrice
      };
    }
  }

  if (!data) {
    salesTrace('salesApplyProductFromOrder: abort (no resolved data after catalog merge)');
    if (typeof window.showToast === 'function') {
      window.showToast('Product missing from catalog.', 'error');
    }
    return;
  }

  salesTrace('salesApplyProductFromOrder: resolved product', {
    name: data.name,
    priceStrategy: data.priceStrategy,
    monthlyPeriod: data.monthlyPeriod,
    salesPackageIsMonthly: salesPackageIsMonthly(data)
  });

  const nextCourseId =
    inferred.type === 'course'
      ? data.id
      : data.courses && data.courses.length > 0
        ? data.courses[0].courseId
        : null;

  if (!nextCourseId) {
    salesTrace('salesApplyProductFromOrder: abort (no nextCourseId)', {
      inferredType: inferred.type,
      coursesLen: data.courses?.length
    });
    if (typeof window.showToast === 'function') {
      window.showToast('Could not resolve timetable course from this order.', 'error');
    }
    return;
  }

  salesState.selectedProduct = { type: inferred.type, data };
  salesState.step = 2;

  const prev = salesState.classSelection;
  const sameCourse = prev && String(prev.courseId || '') === String(nextCourseId);

  salesState.classSelection = {
    courseId: nextCourseId,
    viewDate: sameCourse && prev.viewDate ? prev.viewDate : new Date(),
    selectedDate: sameCourse && prev.selectedDate ? prev.selectedDate : new Date(),
    availableClasses: []
  };

  const container = document.getElementById('salesProductList');
  const needsClassSelectionShell =
    !container || !container.classList.contains('sales-class-selection-container');

  salesTrace('salesApplyProductFromOrder: apply UI', {
    nextCourseId,
    needsClassSelectionShell,
    sameCourse
  });

  if (needsClassSelectionShell) {
    renderClassSelectionUI();
  } else {
    const strong = document.querySelector('.header-product-info strong');
    const badge = document.querySelector('.header-product-info .badge');
    if (strong) strong.textContent = data.name || '';
    if (badge) {
      badge.textContent = inferred.type === 'package' ? 'Package' : 'Course';
      badge.classList.remove('badge-course', 'badge-package');
      badge.classList.add(inferred.type === 'package' ? 'badge-package' : 'badge-course');
    }
  }

  await loadAvailableClasses(nextCourseId);
  salesTrace('salesApplyProductFromOrder: done (after loadAvailableClasses)', {
    selectedProductType: salesState.selectedProduct?.type,
    priceStrategy: salesState.selectedProduct?.data?.priceStrategy,
    monthly: salesState.selectedProduct?.data && salesPackageIsMonthly(salesState.selectedProduct.data)
  });
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
  document.querySelectorAll('.sales-row-menu-panel.is-open').forEach((p) => p.classList.remove('is-open'));
  document.querySelectorAll('.sales-row-menu-trigger[aria-expanded="true"]').forEach((t) => {
    t.setAttribute('aria-expanded', 'false');
  });
}

function bindSalesScheduleRowMenusOnce() {
  if (window.__salesScheduleRowMenuBound) return;
  window.__salesScheduleRowMenuBound = true;
  // Document delegation: innerHTML on #dayScheduleList replaces nodes but listener stays valid.
  document.addEventListener('click', (e) => {
    const list = document.getElementById('dayScheduleList');
    if (!list || !list.contains(e.target)) {
      closeAllSalesRowMenus();
      return;
    }

    const trig = e.target.closest('.sales-row-menu-trigger');
    if (trig) {
      e.preventDefault();
      e.stopPropagation();
      const panel = trig.closest('.sales-row-menu')?.querySelector('.sales-row-menu-panel');
      const wasOpen = panel?.classList.contains('is-open');
      closeAllSalesRowMenus();
      if (panel && !wasOpen) {
        panel.classList.add('is-open');
        trig.setAttribute('aria-expanded', 'true');
      }
      return;
    }

    const menuItem = e.target.closest('[data-sales-menu]');
    if (menuItem) {
      e.preventDefault();
      e.stopPropagation();
      closeAllSalesRowMenus();
      const action = menuItem.getAttribute('data-sales-menu');
      const entryId = menuItem.getAttribute('data-entry-id') || '';
      const dateStr = menuItem.getAttribute('data-date') || '';
      const enrollmentId = menuItem.getAttribute('data-enrollment-id') || '';
      const studentId = salesState.selectedStudent?.id;
      if (!studentId) {
        if (window.showToast) window.showToast('Select a student first.', 'error');
        return;
      }
      if (action === 'attendance' && entryId && dateStr) {
        if (typeof window.openSalesEnrollmentAttendanceModal === 'function') {
          window.openSalesEnrollmentAttendanceModal(entryId, dateStr);
        }
        return;
      }
      if (action === 'makeup' && entryId && dateStr) {
        const student = (window.students || []).find((s) => String(s.id) === String(studentId));
        window.makeupContext = {
          studentId,
          studentName: student ? student.name : 'Student',
          entryId,
          dateStr
        };
        if (typeof window.startMakeupFlow === 'function') {
          window.startMakeupFlow();
        } else if (window.showToast) {
          window.showToast('Make-up is not available.', 'error');
        }
        return;
      }
      if (action === 'postpone' && entryId && dateStr) {
        const student = (window.students || []).find((s) => String(s.id) === String(studentId));
        window.makeupContext = {
          studentId,
          studentName: student ? student.name : 'Student',
          entryId,
          dateStr
        };
        if (typeof window.handlePostponeSelection === 'function') {
          Promise.resolve(window.handlePostponeSelection()).then(() => {
            if (typeof updateDaySchedule === 'function') updateDaySchedule();
          });
        } else if (window.showToast) {
          window.showToast('Postpone is not available.', 'error');
        }
        return;
      }
      if (action === 'drop-lesson' && enrollmentId) {
        if (typeof window.dropSalesLesson === 'function') window.dropSalesLesson(enrollmentId);
        return;
      }
      if (action === 'drop-all' && entryId) {
        if (typeof window.dropSalesAllFuture === 'function') window.dropSalesAllFuture(entryId, dateStr);
      }
      return;
    }

    closeAllSalesRowMenus();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeAllSalesRowMenus();
  });
}

window.closeSalesEnrollmentAttendanceModal = function () {
  const modal = document.getElementById('salesEnrollmentAttModal');
  if (modal) modal.style.display = 'none';
};

window.saveSalesEnrollmentAttendance = async function () {
  const modal = document.getElementById('salesEnrollmentAttModal');
  if (!modal) return;
  const entryId = modal.dataset.entryId;
  const dateStr = modal.dataset.dateStr;
  const studentId = modal.dataset.studentId;
  const sel = modal.querySelector('.sales-att-status-select');
  const status = sel ? sel.value : 'unmarked';
  if (!entryId || !dateStr || !studentId) return;
  try {
    const response = await window.authUtils.authenticatedFetch('/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timetableEntryId: entryId,
        date: dateStr,
        records: [{ studentId, status }]
      })
    });
    if (response && response.ok) {
      if (window.showToast) window.showToast('Attendance saved.', 'success');
      window.closeSalesEnrollmentAttendanceModal();
    } else {
      const err = await response.json().catch(() => ({}));
      if (window.showToast) window.showToast(err.error || 'Failed to save', 'error');
      else alert(err.error || 'Failed to save');
    }
  } catch (e) {
    console.error(e);
    if (window.showToast) window.showToast('Failed to save attendance', 'error');
  }
};

window.openSalesEnrollmentAttendanceModal = async function (entryId, dateStr) {
  const studentId = salesState.selectedStudent?.id;
  if (!studentId) {
    if (window.showToast) window.showToast('Select a student first.', 'error');
    return;
  }
  let current = 'unmarked';
  try {
    const url = `/attendance?timetableEntryId=${encodeURIComponent(entryId)}&date=${encodeURIComponent(dateStr)}&studentId=${encodeURIComponent(studentId)}`;
    const r = await window.authUtils.authenticatedFetch(url);
    if (r && r.ok) {
      const rows = await r.json();
      const mine = Array.isArray(rows) ? rows.find((x) => String(x.studentId) === String(studentId)) : null;
      if (mine && mine.status) current = mine.status;
    }
  } catch (_) {}

  let modal = document.getElementById('salesEnrollmentAttModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'salesEnrollmentAttModal';
    modal.className = 'sales-att-modal-backdrop';
    modal.innerHTML = `
      <div class="sales-att-modal" onclick="event.stopPropagation();">
        <h3>Attendance</h3>
        <p class="sales-att-modal-sub"></p>
        <label class="sales-att-sr-only" for="salesAttStatusSelect">Status</label>
        <select id="salesAttStatusSelect" class="sales-att-status-select">
          <option value="unmarked">Unmarked</option>
          <option value="present">Present</option>
          <option value="absent">Absent</option>
          <option value="late">Late</option>
        </select>
        <div class="sales-att-modal-actions">
          <button type="button" class="cancel" onclick="window.closeSalesEnrollmentAttendanceModal()">Cancel</button>
          <button type="button" class="save" onclick="window.saveSalesEnrollmentAttendance()">Save</button>
        </div>
      </div>`;
    modal.addEventListener('click', () => window.closeSalesEnrollmentAttendanceModal());
    document.body.appendChild(modal);
    if (!document.getElementById('salesAttModalSrStyle')) {
      const s = document.createElement('style');
      s.id = 'salesAttModalSrStyle';
      s.textContent = '.sales-att-sr-only { position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0; }';
      document.head.appendChild(s);
    }
  }

  const student = (window.students || []).find((s) => String(s.id) === String(studentId));
  const sub = modal.querySelector('.sales-att-modal-sub');
  if (sub) {
    sub.textContent = `${student ? student.name : 'Student'} · ${dateStr}`;
  }
  modal.dataset.entryId = entryId;
  modal.dataset.dateStr = dateStr;
  modal.dataset.studentId = studentId;
  const sel = modal.querySelector('.sales-att-status-select');
  if (sel) sel.value = current;
  modal.style.display = 'flex';
};

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
        .schedule-card.enrolled { border: 1px solid rgba(52, 199, 89, 0.35); background: rgba(52, 199, 89, 0.06); }
        .schedule-card.in-cart { border: 1px solid rgba(0, 122, 255, 0.4); background: rgba(0, 122, 255, 0.08); }
        .card-header-badge { background: #34c759; color: #fff; font-size: 10px; font-weight: 600; padding: 4px 8px; border-radius: 980px; display: inline-block; margin-bottom: 6px; letter-spacing: 0.02em; }
        .schedule-card.enrolled .schedule-card-actions-menu { min-width: 0; align-items: flex-end; }
        .sales-row-menu { position: relative; flex-shrink: 0; margin-left: auto; }
        .sales-row-menu-trigger {
          width: 36px; height: 36px; border: none; border-radius: 50%;
          background: rgba(0, 0, 0, 0.05); color: #007aff;
          font-size: 22px; line-height: 0; padding: 0; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
        }
        .sales-row-menu-trigger:hover { background: rgba(0, 122, 255, 0.12); }
        .sales-row-menu-panel {
          position: absolute; right: 0; top: calc(100% + 6px);
          min-width: 212px; max-width: 280px;
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border-radius: 14px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 1px 0 rgba(255, 255, 255, 0.8) inset;
          border: 1px solid rgba(0, 0, 0, 0.06);
          padding: 6px; z-index: 80; display: none;
        }
        .sales-row-menu-panel.is-open { display: block; }
        .sales-row-menu-item {
          display: block; width: 100%; text-align: left;
          padding: 11px 14px; border: none; background: transparent;
          border-radius: 10px; font-size: 15px; font-weight: 500; cursor: pointer;
          color: #007aff; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
        }
        .sales-row-menu-item:hover { background: rgba(0, 0, 0, 0.04); }
        .sales-row-menu-item.danger { color: #ff3b30; }
        .sales-row-menu-sep { height: 1px; margin: 4px 8px; background: rgba(0, 0, 0, 0.08); }
        .sales-att-modal-backdrop {
          position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); z-index: 10200;
          display: none; align-items: center; justify-content: center; padding: 16px;
        }
        .sales-att-modal {
          width: 100%; max-width: 340px; background: #fff; border-radius: 16px;
          padding: 18px 20px; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
        }
        .sales-att-modal h3 { margin: 0 0 6px; font-size: 17px; font-weight: 600; color: #1c1c1e; }
        .sales-att-modal p { margin: 0 0 14px; font-size: 13px; color: #8e8e93; }
        .sales-att-modal select {
          width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(0, 0, 0, 0.1);
          font-size: 16px; margin-bottom: 16px; background: #f2f2f7;
        }
        .sales-att-modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
        .sales-att-modal-actions button {
          padding: 10px 18px; border-radius: 12px; border: none; font-size: 16px; font-weight: 600; cursor: pointer;
        }
        .sales-att-modal-actions .cancel { background: #e5e5ea; color: #1c1c1e; }
        .sales-att-modal-actions .save { background: #007aff; color: #fff; }
      `;
      document.head.appendChild(style);
  }
  
  // 1. Get Saved Enrollments (from DB)
  const studentId = salesState.selectedStudent?.id;
  let enrolledClasses = [];
  if (studentId) {
      enrolledClasses = (window.timetableEnrollments || []).filter(
        (e) => String(e.studentId) === String(studentId) && e.date === selectedStr
      );
  }

  bindSalesScheduleRowMenusOnce();

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
        </div>
        <div class="card-details">
          <div class="card-title">${escapeHtml(entry.className)}</div>
          <div class="card-teacher">${escapeHtml(entry.teacherName || (entry.teacherIds && entry.teacherIds.length > 0 ? getTeacherName(entry.teacherIds[0]) : 'Unknown Teacher'))}</div>
        </div>
        <div class="card-actions schedule-card-actions-menu">
          <div class="sales-row-menu">
            <button type="button" class="sales-row-menu-trigger" aria-label="Lesson actions" aria-haspopup="true" aria-expanded="false">⋯</button>
            <div class="sales-row-menu-panel" role="menu">
              <button type="button" class="sales-row-menu-item" role="menuitem" data-sales-menu="attendance"
                data-entry-id=${JSON.stringify(entry.id)} data-date=${JSON.stringify(selectedStr)}>Attendance</button>
              <button type="button" class="sales-row-menu-item" role="menuitem" data-sales-menu="makeup"
                data-entry-id=${JSON.stringify(entry.id)} data-date=${JSON.stringify(selectedStr)}>Makeup</button>
              <button type="button" class="sales-row-menu-item" role="menuitem" data-sales-menu="postpone"
                data-entry-id=${JSON.stringify(entry.id)} data-date=${JSON.stringify(selectedStr)}>Postpone</button>
              <div class="sales-row-menu-sep" aria-hidden="true"></div>
              <button type="button" class="sales-row-menu-item danger" role="menuitem" data-sales-menu="drop-lesson"
                data-enrollment-id=${JSON.stringify(enrollment.id)}>Drop lesson</button>
              <button type="button" class="sales-row-menu-item danger" role="menuitem" data-sales-menu="drop-all"
                data-entry-id=${JSON.stringify(entry.id)} data-date=${JSON.stringify(enrollment.date != null ? String(enrollment.date) : '')}>Drop all future</button>
            </div>
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
        <div class="card-header-badge" style="background: #007aff;">In Cart</div>
        <div class="card-time">
          <div class="time-text">${timeStr}</div>
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
  const selPkg = salesState.selectedProduct?.type === 'package' ? salesState.selectedProduct.data : null;
  if (typeof window !== 'undefined' && window.salesTrace) {
    window.salesTrace('updateDaySchedule: enroll options branch', {
      productType,
      priceStrategy: salesState.selectedProduct?.data?.priceStrategy,
      monthlyPeriod: salesState.selectedProduct?.data?.monthlyPeriod,
      salesPackageIsMonthly: selPkg ? salesPackageIsMonthly(selPkg) : false,
      dayClassesForSelectedDate: dayClasses.length
    });
  }

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

      if (salesPackageIsMonthly(pkg)) {
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
  if (
    !confirm(
      'Drop this lesson? If it was paid, credit becomes lesson quota for the same per-lesson price tier (not cash balance).'
    )
  )
    return;
  
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
      const toastMsg =
        typeof window.formatDropQuotaToastMessage === 'function'
          ? window.formatDropQuotaToastMessage(result)
          : 'Lesson dropped.';
      if (window.showToast) window.showToast(toastMsg, 'success');
      else alert(toastMsg);

      if (typeof window.applyDropResultToSalesStudent === 'function') {
        window.applyDropResultToSalesStudent(salesState.selectedStudent.id, result);
      }

      if (window.loadTimetableData) await window.loadTimetableData();

      if (typeof window.selectSalesStudent === 'function') {
        window.selectSalesStudent(salesState.selectedStudent.id);
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

window.dropSalesAllFuture = async function(timetableEntryId, enrollmentDateRaw) {
  const head =
    enrollmentDateRaw != null && String(enrollmentDateRaw).trim()
      ? String(enrollmentDateRaw).trim().split('T')[0].slice(0, 10)
      : '';
  const fromCalendar =
    salesState.classSelection && salesState.classSelection.selectedDate
      ? formatDateForCompare(salesState.classSelection.selectedDate)
      : '';
  const fromStr = /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : fromCalendar;
  if (!fromStr) {
    console.error('[dropSalesAllFuture] missing cutoff date', {
      timetableEntryId,
      enrollmentDateRaw,
      fromCalendar,
      classSelection: !!salesState.classSelection
    });
    alert('Could not determine the start date for drop; please click the lesson day on the calendar again.');
    return;
  }

  console.log('[dropSalesAllFuture] request', {
    timetableEntryId,
    enrollmentDateRaw,
    fromStr,
    fromCalendar,
    studentId: salesState.selectedStudent && salesState.selectedStudent.id
  });

  if (
    !confirm(
      `Drop this class from ${fromStr} onward (including this date)? Earlier dates in this series stay enrolled. This cannot be undone.`
    )
  ) {
    return;
  }

   try {
    const payload = {
      studentId: salesState.selectedStudent.id,
      mode: 'all',
      timetableEntryId: timetableEntryId,
      date: fromStr,
      fromDate: fromStr
    };
    console.log('[dropSalesAllFuture] POST body', payload);
    console.log('[dropSalesAllFuture] POST JSON string', JSON.stringify(payload));
    const response = await window.authUtils.authenticatedFetch('/organizations/enrollments/drop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('[dropSalesAllFuture] response', result);
      if (result.dropAll) {
        console.log('[dropSalesAllFuture] server dropAll summary', JSON.stringify(result.dropAll, null, 2));
      }
      const toastMsg =
        typeof window.formatDropQuotaToastMessage === 'function'
          ? window.formatDropQuotaToastMessage(result)
          : `Dropped ${result.droppedCount} lessons.`;
      if (window.showToast) window.showToast(toastMsg, 'success');
      else alert(toastMsg);

      if (typeof window.applyDropResultToSalesStudent === 'function') {
        window.applyDropResultToSalesStudent(salesState.selectedStudent.id, result);
      }

      if (window.loadTimetableData) await window.loadTimetableData();

      if (typeof window.selectSalesStudent === 'function') {
        window.selectSalesStudent(salesState.selectedStudent.id);
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
      const err = await response.json().catch(() => ({}));
      console.error('[dropSalesAllFuture] error response', response.status, err);
      alert(err.error || err.hint || 'Failed to drop lessons');
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
      if (salesPackageIsMonthly(pkg)) {
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
