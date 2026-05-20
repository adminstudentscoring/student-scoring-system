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
