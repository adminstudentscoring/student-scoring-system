// Split from course-management-sales-orders.js
window.openStudentDetailsOverlay = async function (event) {
  if (event) event.stopPropagation();
  const student = salesState.selectedStudent;
  if (!student) return;

  let overlay = document.getElementById('studentDetailsOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'studentDetailsOverlay';
    overlay.className = 'student-details-overlay-backdrop';
    overlay.innerHTML = `
      <div class="student-details-overlay" onclick="event.stopPropagation();">
        <div class="overlay-header">
          <div class="overlay-avatar">${student.name.charAt(0).toUpperCase()}</div>
          <div class="overlay-meta">
            <div class="overlay-name-row">
              <span class="overlay-name"></span>
              <span class="overlay-id"></span>
            </div>
            <div class="overlay-balance"></div>
          </div>
        </div>
        <div class="overlay-tabs">
          <button class="overlay-tab active" data-tab="class" onclick="switchStudentOverlayTab('class')">Class History</button>
          <button class="overlay-tab" data-tab="payment" onclick="switchStudentOverlayTab('payment')">Payment History</button>
        </div>
        <div class="overlay-content">
          <div id="studentOverlayClassTab" class="overlay-tab-panel active"></div>
          <div id="studentOverlayPaymentTab" class="overlay-tab-panel"></div>
        </div>
        <div class="overlay-footer">
          <button class="btn-close-overlay" onclick="closeStudentOverlay()">Close</button>
        </div>
      </div>
    `;
    overlay.addEventListener('click', closeStudentOverlay);
    document.body.appendChild(overlay);

    if (!document.getElementById('studentOverlayStyles')) {
      const style = document.createElement('style');
      style.id = 'studentOverlayStyles';
      style.textContent = `
        .student-details-overlay-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: none; align-items: center; justify-content: center; padding: 20px; z-index: 2000; }
        .student-details-overlay { background: #fff; width: 520px; max-height: 85vh; border-radius: 12px; display: flex; flex-direction: column; box-shadow: 0 12px 30px rgba(0,0,0,0.18); overflow: hidden; }
        .student-details-overlay .overlay-header { display: flex; gap: 12px; padding: 18px 20px 12px; border-bottom: 1px solid #f1f5f9; }
        .student-details-overlay .overlay-avatar { width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #60a5fa, #2563eb); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 20px; }
        .student-details-overlay .overlay-meta { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
        .student-details-overlay .overlay-name-row { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 700; color: #111827; }
        .student-details-overlay .overlay-id { background: #eef2ff; color: #3730a3; padding: 3px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
        .student-details-overlay .overlay-balance { font-size: 14px; color: #6b7280; }
        .student-details-overlay .overlay-tabs { display: flex; gap: 8px; padding: 12px 20px 0; }
        .student-details-overlay .overlay-tab { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; color: #334155; padding: 10px; border-radius: 10px 10px 0 0; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .student-details-overlay .overlay-tab.active { background: #fff; border-bottom-color: #fff; color: #111827; box-shadow: 0 -1px 0 #fff; }
        .student-details-overlay .overlay-content { padding: 12px 20px 0; flex: 1; overflow-y: auto; }
        .student-details-overlay .overlay-tab-panel { display: none; }
        .student-details-overlay .overlay-tab-panel.active { display: block; }
        .student-details-overlay .overlay-footer { position: sticky; bottom: 0; background: #fff; padding: 14px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; }
        .student-details-overlay .btn-close-overlay { min-width: 100px; padding: 10px 14px; background: #1d4ed8; color: #fff; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; }
        .student-details-overlay .btn-close-overlay:hover { background: #1e40af; }
        .overlay-empty { color: #94a3b8; font-size: 14px; text-align: center; padding: 20px 10px; }
        .overlay-history-by-order { display: flex; flex-direction: column; gap: 12px; }
        .overlay-order-group { border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; overflow: hidden; }
        .overlay-order-group[open] .overlay-order-summary { border-bottom: 1px solid #e2e8f0; }
        .overlay-order-summary { list-style: none; cursor: pointer; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; color: #1e293b; background: #f8fafc; user-select: none; }
        .overlay-order-summary::-webkit-details-marker { display: none; }
        .overlay-order-label { font-weight: 600; flex: 1; min-width: 0; text-align: left; }
        .overlay-order-meta { font-size: 12px; color: #64748b; font-weight: 600; flex-shrink: 0; }
        .overlay-order-kind { font-size: 11px; font-weight: 600; color: #94a3b8; margin-left: 6px; }
        .overlay-order-classes { display: flex; flex-direction: column; gap: 8px; padding: 10px 10px 12px; background: #fafafa; }
        .overlay-history-list { display: flex; flex-direction: column; gap: 10px; }
        .overlay-history-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; }
        .overlay-history-item.makeup-class { border-color: #667eea; background: #eef2ff; }
        .overlay-history-date { font-weight: 700; color: #2563eb; }
        .overlay-history-title { flex: 1; margin-left: 12px; color: #111827; font-weight: 600; }
        .overlay-history-meta { font-size: 12px; color: #6b7280; }
        .overlay-history-note { font-size: 11px; color: #667eea; font-weight: 500; }
        .student-name-link { background: none; border: none; padding: 0; margin: 0; font: inherit; color: #1d4ed8; cursor: pointer; }
        .student-name-link:hover { text-decoration: underline; }
      `;
      document.head.appendChild(style);
    }
  }

  const balance = typeof student.balance === 'number' ? student.balance : 0;
  const nameEl = overlay.querySelector('.overlay-name');
  const idEl = overlay.querySelector('.overlay-id');
  const balanceEl = overlay.querySelector('.overlay-balance');
  const avatarEl = overlay.querySelector('.overlay-avatar');

  if (nameEl) nameEl.textContent = student.name || 'Student';
  // Show system Student ID + chess.com ID (and local name if any)
  if (idEl) {
    const sysId = String(student.id || '');
    const chessId = String(student.chessComId || '');
    const localName = String(student.localName || '');
    idEl.textContent = `${sysId ? `ID: ${sysId}` : 'ID: —'}${chessId ? ` · chess.com: ${chessId}` : ''}${localName ? ` · Local: ${localName}` : ''}`;
  }
  if (balanceEl) balanceEl.textContent = `Balance: $${balance.toFixed(2)}`;
  if (avatarEl) avatarEl.textContent = student.name ? student.name.charAt(0).toUpperCase() : '?';

  if (typeof window.refreshSalesTimetableFromApi === 'function') {
    classHistoryUiLog('openStudentDetailsOverlay: refreshing timetable before render');
    await window.refreshSalesTimetableFromApi();
  }
  if (typeof loadStudentOrders === 'function') {
    await loadStudentOrders(student.id);
  }

  switchStudentOverlayTab('class');
  overlay.style.display = 'flex';
};

// Switch tabs inside student overlay
window.switchStudentOverlayTab = function(tab) {
  const overlay = document.getElementById('studentDetailsOverlay');
  if (!overlay) return;

  overlay.querySelectorAll('.overlay-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  overlay.querySelectorAll('.overlay-tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === (tab === 'class' ? 'studentOverlayClassTab' : 'studentOverlayPaymentTab'));
  });

  if (tab === 'class') {
    renderStudentOverlayClassHistory();
  } else {
    renderStudentOverlayPaymentHistory();
  }
};

// Close overlay
window.closeStudentOverlay = function() {
  const overlay = document.getElementById('studentDetailsOverlay');
  if (overlay) overlay.style.display = 'none';
};

// Render Class History tab content (grouped by purchase order / orderId)
function renderStudentOverlayClassHistory() {
  const panel = document.getElementById('studentOverlayClassTab');
  if (!panel) return;
  classHistoryUiLog('renderStudentOverlayClassHistory: start');
  if (!document.getElementById('studentOverlayOrderGroupStyles')) {
    const s = document.createElement('style');
    s.id = 'studentOverlayOrderGroupStyles';
    s.textContent = `
      .overlay-history-by-order { display: flex; flex-direction: column; gap: 12px; }
      .overlay-order-group { border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; overflow: hidden; }
      .overlay-order-group[open] .overlay-order-summary { border-bottom: 1px solid #e2e8f0; }
      .overlay-order-summary { list-style: none; cursor: pointer; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; color: #1e293b; background: #f8fafc; user-select: none; }
      .overlay-order-summary::-webkit-details-marker { display: none; }
      .overlay-order-label { font-weight: 600; flex: 1; min-width: 0; text-align: left; }
      .overlay-order-meta { font-size: 12px; color: #64748b; font-weight: 600; flex-shrink: 0; }
      .overlay-order-kind { font-size: 11px; font-weight: 600; color: #94a3b8; margin-left: 6px; }
      .overlay-order-classes { display: flex; flex-direction: column; gap: 8px; padding: 10px 10px 12px; background: #fafafa; }
      .overlay-order-classes .overlay-history-item { background: #fff; }
      .overlay-month-class-title { font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 8px; }
      .overlay-month-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; font-size: 13px; padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
      .overlay-month-row:last-child { border-bottom: none; }
      .overlay-month-label { color: #0f172a; font-weight: 700; flex-shrink: 0; }
      .overlay-month-days { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .overlay-day-jump { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; color: #2563eb; font-weight: 700; font-size: 13px; padding: 2px 10px; cursor: pointer; font-family: inherit; line-height: 1.3; }
      .overlay-day-jump:hover { background: #dbeafe; }
    `;
    document.head.appendChild(s);
  }
  const studentId = salesState.selectedStudent?.id;
  if (!studentId) {
    panel.innerHTML = '<div class="overlay-empty">No student selected.</div>';
    return;
  }

  const enrollments = (window.timetableEnrollments || []).filter(
    (e) => String(e.studentId) === String(studentId)
  );
  classHistoryUiLog('renderStudentOverlayClassHistory: enrollments', {
    count: enrollments.length,
    sampleRawOrderIds: enrollments.slice(0, 5).map((e) => e.orderId ?? null)
  });
  if (enrollments.length === 0) {
    panel.innerHTML = '<div class="overlay-empty">No class history yet.</div>';
    return;
  }

  const ordLookup = [
    ...(salesState.currentPaidOrdersForStudent || []),
    ...(salesState.currentUnpaidOrders || [])
  ];

  const groupMap = new Map();
  for (const e of enrollments) {
    const inferred = inferOrderIdForEnrollmentDisplay(e, studentId, ordLookup);
    const fromRec = e.orderId != null && String(e.orderId).trim() !== '' ? String(e.orderId) : '';
    const effectiveOid = fromRec || inferred;
    const k = effectiveOid ? `order:${effectiveOid}` : 'no-order';
    classHistoryUiVerboseLog('enrollment → group', {
      date: e.date,
      timetableEntryId: e.timetableEntryId,
      orderId_on_record: fromRec || null,
      inferred_orderId: inferred || null,
      groupKey: k
    });
    if (!groupMap.has(k)) groupMap.set(k, []);
    groupMap.get(k).push(e);
  }

  classHistoryUiLog('renderStudentOverlayClassHistory: groups built', {
    groupCount: groupMap.size,
    keys: Array.from(groupMap.keys())
  });

  const groups = Array.from(groupMap.entries()).map(([key, list]) => {
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
    const minDate = list[0].date;
    const orderId = key.startsWith('order:') ? key.slice(6) : '';
    const short =
      orderId.length > 12 ? `${escapeHtml(orderId.slice(0, 10))}…` : escapeHtml(orderId);
    const ordRow = orderId ? ordLookup.find((o) => String(o.id) === String(orderId)) : null;
    let productTitle = '';
    if (ordRow && ordRow.items && ordRow.items[0] && ordRow.items[0].productData) {
      const n = ordRow.items[0].productData.name;
      if (n) productTitle = ` · ${escapeHtml(String(n))}`;
    }
    const anyInferred = list.some(
      (en) => !(en.orderId != null && String(en.orderId).trim() !== '') && orderId
    );
    const inferredHint = anyInferred
      ? ` <span style="color:#94a3b8;font-size:11px;font-weight:500;">(order from schedule match)</span>`
      : '';
    const label =
      key === 'no-order'
        ? `<span style="color:#64748b;">Classes not linked to an order</span>`
        : `Order <span style="color:#64748b;font-weight:500;">${short || escapeHtml(orderId)}</span>${productTitle}${inferredHint}`;
    return { key, list, minDate, label, orderId, ordRow };
  });
  groups.sort((a, b) => new Date(a.minDate) - new Date(b.minDate));

  const entries = window.timetableEntries || [];

  panel.innerHTML = `
    <div class="overlay-history-by-order">
      ${groups
        .map((g) => {
          let kindSpan = '';
          if (g.orderId && g.ordRow && g.ordRow.items && g.ordRow.items.length) {
            const isPkg = g.ordRow.items.some(
              (it) =>
                it.productType === 'package' ||
                (it.productData &&
                  Array.isArray(it.productData.courses) &&
                  it.productData.courses.length > 0)
            );
            kindSpan = `<span class="overlay-order-kind">${isPkg ? 'Package' : 'Course'}</span>`;
          }
          return `
      <details class="overlay-order-group" ${groups.length === 1 ? 'open' : ''}>
        <summary class="overlay-order-summary">
          <span class="overlay-order-label">${g.label}${kindSpan}</span>
          <span class="overlay-order-meta">${g.list.length} class(es)</span>
        </summary>
        <div class="overlay-order-classes">
          ${buildEnrollmentMonthRowsMarkup(g.list, entries, 'overlay')}
        </div>
      </details>`;
        })
        .join('')}
    </div>
  `;
  classHistoryUiLog('renderStudentOverlayClassHistory: done', {
    detailsElements: panel.querySelectorAll('details.overlay-order-group').length
  });
}

window.renderStudentOverlayClassHistory = renderStudentOverlayClassHistory;

// Render Payment History tab content (placeholder for backend hookup)
function renderStudentOverlayPaymentHistory() {
  const panel = document.getElementById('studentOverlayPaymentTab');
  if (!panel) return;
  panel.innerHTML = `
    <div class="overlay-empty">
      Payment history will appear here once connected to backend records.
    </div>
  `;
}

// Load Student Orders
window.loadStudentOrders = async function loadStudentOrders(studentId) {
    // Fetch all orders and filter (simplest integration)
    // Ideally backend should support /organizations/orders?studentId=...
    try {
        const response = await window.authUtils.authenticatedFetch('/organizations/orders');
        if (response.ok) {
            const allOrders = await response.json();
            const sid = String(studentId);
            const unpaidOrders = allOrders.filter(
              (o) => String(o.studentId) === sid && o.status === 'unpaid'
            );
            salesState.currentUnpaidOrders = unpaidOrders;
            salesState.currentPaidOrdersForStudent = allOrders.filter(
              (o) => String(o.studentId) === sid && o.status === 'paid'
            );
            if (typeof window.salesDebug === 'function') {
              const paid = salesState.currentPaidOrdersForStudent;
              window.salesDebug('loadStudentOrders', {
                studentId: sid,
                allOrdersCount: allOrders.length,
                paidCount: paid.length,
                unpaidCount: unpaidOrders.length,
                firstPaidItemSample: paid[0]?.items?.[0]
                  ? {
                      name: paid[0].items[0].productData?.name,
                      priceStrategy: paid[0].items[0].productData?.priceStrategy
                    }
                  : null
              });
            }
            if (typeof window.salesTrace === 'function') {
              const paid = salesState.currentPaidOrdersForStudent || [];
              window.salesTrace('loadStudentOrders', {
                studentId: sid,
                paidOrderIds: paid.map((o) => o.id),
                paidCount: paid.length,
                firstOrderFirstLine: paid[0]?.items?.[0]
                  ? {
                      productType: paid[0].items[0].productType,
                      priceStrategy: paid[0].items[0].productData?.priceStrategy
                    }
                  : null
              });
            }
            const unpaidSnap = salesState.currentUnpaidOrders || [];
            orderPayDebug('loadStudentOrders', {
              studentId: sid,
              unpaidCount: unpaidSnap.length,
              unpaidSummaries: unpaidSnap.map((o) => ({
                id: o.id,
                total: o.totalAmount,
                amountPaid: o.amountPaid,
                due: salesOrderBalanceDue(o),
                status: o.status
              }))
            });
            renderStudentUnpaidOrders();
        } else {
            salesState.currentPaidOrdersForStudent = [];
            if (typeof window.salesDebug === 'function') {
              window.salesDebug('loadStudentOrders: API not ok, cleared paid orders', { status: response.status });
            }
        }
    } catch (e) {
        console.error('Failed to load student orders', e);
        salesState.currentPaidOrdersForStudent = [];
        if (typeof window.salesDebug === 'function') {
          window.salesDebug('loadStudentOrders: exception', String(e && e.message ? e.message : e));
        }
    }
};

// Render Unpaid Orders in Sidebar
function renderStudentUnpaidOrders() {
    let container = document.getElementById('salesUnpaidOrders');
    const card = document.getElementById('selectedStudentCard');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'salesUnpaidOrders';
        container.className = 'sales-unpaid-orders';
        // Insert after selectedStudentCard
        if (card && card.parentNode) card.parentNode.insertBefore(container, card.nextSibling);
        
        // Add styles if not present
        if (!document.getElementById('salesUnpaidStyles')) {
            const style = document.createElement('style');
            style.id = 'salesUnpaidStyles';
            style.textContent = `
                .sales-unpaid-orders { margin-top: 6px; padding: 12px; background: rgba(255, 59, 48, 0.06); border: 1px solid rgba(255, 59, 48, 0.18); border-radius: 12px; }
                .unpaid-header { font-weight: 600; font-size: 12px; color: #1d1d1f; margin-bottom: 8px; display:flex; justify-content:space-between; letter-spacing: -0.01em; }
                .unpaid-item { display: flex; justify-content: space-between; align-items: center; font-size: 13px; padding: 8px 0; border-bottom: 1px solid rgba(60, 60, 67, 0.1); }
                .unpaid-item:last-child { border-bottom: none; }
                .unpaid-info { flex: 1; }
                .unpaid-date { font-size: 11px; color: #6e6e73; }
                .unpaid-amount { font-weight: 600; color: #ff3b30; }
                .btn-pay-order { padding: 4px 10px; font-size: 11px; background: #e11d48; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 10px; }
                .btn-pay-order:hover { background: #be123c; }
            `;
            document.head.appendChild(style);
        }
    }
    
    const orders = salesState.currentUnpaidOrders || [];
    
    if (orders.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    container.innerHTML = `
        <div class="unpaid-header">
            <span>⚠️ Unpaid Orders (${orders.length})</span>
        </div>
        <div class="unpaid-list">
            ${orders.map(order => {
                const dateStr = new Date(order.date).toLocaleDateString();
                const itemsSummary = order.items.map(i => i.productData.name).join(', ');
                
                const firstItem = order.items[0];
                const firstClass = (firstItem && firstItem.enrolledClasses && firstItem.enrolledClasses.length > 0) ? firstItem.enrolledClasses[0] : null;
                const dateToJump = firstClass ? firstClass.date : null;
                const courseToJump = firstClass ? firstClass.entry.courseIds[0] : null;
                const jumpAttr = dateToJump ? `onclick="jumpToDate('${dateToJump}', '${courseToJump}')" style="cursor:pointer;" title="Jump to ${dateToJump}"` : '';

                // Format class date if available
                let displayDate = dateStr; // Default to order date
                let dateLabel = 'Order: ';
                if (dateToJump) {
                    const classDateObj = new Date(dateToJump);
                    if (!isNaN(classDateObj)) {
                        displayDate = classDateObj.toLocaleDateString();
                        dateLabel = 'Class: ';
                    }
                }

                return `
                    <div class="unpaid-item">
                        <div class="unpaid-info" ${jumpAttr}>
                            <div class="unpaid-date" style="font-size:10px; color:#666;">${dateLabel}${displayDate}</div>
                            <div title="${escapeHtml(itemsSummary)}" style="font-weight:600; color:#333;">${escapeHtml(itemsSummary.substring(0, 25))}${itemsSummary.length > 25 ? '...' : ''}</div>
                        </div>
                        <div class="unpaid-amount">$${formatNumber(salesOrderBalanceDue(order))}</div>
                        ${salesOrderEffectivePaid(order) > 0 && salesOrderBalanceDue(order) > 0 ? `<div class="unpaid-date" style="margin-top:2px;">Paid $${formatNumber(salesOrderEffectivePaid(order))} of $${formatNumber(order.totalAmount)}</div>` : ''}
                        <div style="display:flex; gap:5px;">
                            <button class="btn-pay-order" onclick="payExistingOrder('${order.id}')">Pay</button>
                            <button class="btn-pay-order" style="background:#ef4444;" onclick="deleteSalesOrder('${order.id}')">Del</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

window.payExistingOrder = function(orderId) {
    const order = (salesState.currentUnpaidOrders || []).find(o => o.id === orderId);
    if (!order) return;
    
    // Set checkout state for existing order
    checkoutState.mode = 'existing';
    checkoutState.orderId = orderId;
    checkoutState.existingOrder = order;
    checkoutState.method = 'cash';
    
    // Open modal specifically for existing order to bypass empty cart check
    window.openCheckoutModal('existing');
    
    // Render items from order
    const container = document.getElementById('checkoutItemsList');
    container.innerHTML = order.items.map(item => `
        <div class="checkout-item" style="margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <label style="display:flex; align-items:center; gap:10px; font-weight:bold;">
                    <input type="checkbox" checked disabled>
                    ${escapeHtml(item.productData.name)}
                </label>
                <span style="font-weight:bold;">$${formatNumber(item.price)}</span>
            </div>
        </div>
    `).join('');
    
    // Disable select all as it's fixed for existing order
    const selectAll = document.getElementById('checkoutSelectAll');
    if (selectAll) selectAll.disabled = true;
    
    const due = salesOrderBalanceDue(order);
    document.getElementById('checkoutShouldPay').textContent = `$${formatNumber(due)}`;
    
    const input = document.querySelector(`#paymentFormCash .payment-amount-input`);
    const canQuota =
      salesState.selectedStudent &&
      typeof window.salesOrderCanPayRemainingWithLessonQuota === 'function' &&
      window.salesOrderCanPayRemainingWithLessonQuota(salesState.selectedStudent, order);
    orderPayDebug('payExistingOrder', {
      orderId,
      due,
      canQuota,
      paid: salesOrderEffectivePaid(order),
      total: order.totalAmount
    });
    if (canQuota) {
      switchPaymentMethod('quota');
    } else {
      switchPaymentMethod('cash');
      if (input) input.value = due;
    }
    updatePayButton();
};

window.deleteSalesOrder = async function(orderId) {
    if (!confirm('Are you sure you want to delete this order? This will also drop enrolled classes.')) return;
    
    try {
        // First, get order details to find enrollments
        const order = (salesState.currentUnpaidOrders || []).find(o => o.id === orderId);
        if (order && order.items) {
            for (const item of order.items) {
                if (item.enrolledClasses) {
                    for (const cls of item.enrolledClasses) {
                        // Find actual enrollment ID from timetableEnrollments
                        // The cls object here is from order structure which might be static snapshot
                        // We need to find active enrollment that matches this class entry
                        
                        // We match by timetableEntryId, studentId and date
                        const enrollment = (window.timetableEnrollments || []).find(e => 
                            e.timetableEntryId === cls.entry.id && 
                            e.studentId === salesState.selectedStudent.id &&
                            e.date === cls.date
                        );
                        
                        if (enrollment) {
                            console.log('[DEBUG] Dropping enrollment:', enrollment.id);
                            await window.authUtils.authenticatedFetch('/organizations/enrollments/drop', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    studentId: salesState.selectedStudent.id,
                                    mode: 'single',
                                    enrollmentId: enrollment.id
                                })
                            });
                        }
                    }
                }
            }
        }

        const response = await window.authUtils.authenticatedFetch(`/organizations/orders/${orderId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            if (window.showToast) window.showToast('Order deleted and classes dropped', 'success');
            else alert('Order deleted and classes dropped');
            
            // Reload orders
            if (salesState.selectedStudent) {
                loadStudentOrders(salesState.selectedStudent.id);
            }
            
            // Refresh timetable to reflect dropped classes
            if (typeof window.loadTimetableData === 'function') {
                await window.loadTimetableData();
            }
            
            // Refresh UI
            if (typeof updateDaySchedule === 'function') updateDaySchedule();
            if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
            if (typeof renderStudentEnrollments === 'function') renderStudentEnrollments();
            
        } else {
            const err = await response.json();
            alert(err.error || 'Failed to delete order');
        }
    } catch (e) {
        console.error('Error deleting order:', e);
        alert('Error deleting order');
    }
};

window.deselectSalesStudent = function() {
  salesState.selectedStudent = null;
  salesState.currentPaidOrdersForStudent = [];
  document.getElementById('selectedStudentCard').style.display = 'none';
  const historyContainer = document.getElementById('salesStudentHistory');
  if (historyContainer) historyContainer.innerHTML = '';
  const unpaidEl = document.getElementById('salesUnpaidOrders');
  if (unpaidEl) {
    unpaidEl.style.display = 'none';
    unpaidEl.innerHTML = '';
  }
  closeStudentOverlay();
  const ces = document.querySelector('.cart-empty-state');
  if (ces) {
    ces.innerHTML = '';
    ces.style.display = 'none';
  }
  document.getElementById('salesCartContent').style.display = 'none';
  if (typeof updateDaySchedule === 'function') updateDaySchedule();
  if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
};

// Render Student Enrollments List (grouped by purchase / orderId, expand/collapse)
