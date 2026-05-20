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
