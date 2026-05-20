// Split from course-management-sales-orders.js
window.openCheckoutModal = function(mode = 'new', opts) {
    opts = opts || {};
    if (mode === 'new' && salesState.cart.length === 0) {
        alert('Cart is empty');
        return;
    }
    
    const modal = document.getElementById('checkoutModal');
    if (!modal) return;
    
    // Reset State
    checkoutState.mode = mode;
    if (mode !== 'existing') {
      checkoutState.orderId = null;
      checkoutState.existingOrder = null;
    }
    checkoutState.useBalance = false;
    checkoutState.balanceAmount = 0;
    
    const selectAll = document.getElementById('checkoutSelectAll');
    if (selectAll) {
        selectAll.checked = true;
        selectAll.disabled = false;
    }

    if (mode === 'new') {
        checkoutState.selectedIndices = new Set(salesState.cart.map((_, i) => i));
    } else if (mode === 'unpaid_orders') {
        // Select all unpaid orders by default. Indices correspond to salesState.currentUnpaidOrders array
        const unpaidOrders = salesState.currentUnpaidOrders || [];
        checkoutState.selectedIndices = new Set(unpaidOrders.map((_, i) => i));
    }
    
    // UI: Check Balance
    const balanceSection = document.getElementById('balancePaymentSection');
    const balanceDisplay = document.getElementById('availableBalanceDisplay');
    const useBalanceCheckbox = document.getElementById('useBalanceCheckbox');
    const student = salesState.selectedStudent;
    
    if (balanceSection) {
        if (student && (student.balance || 0) > 0) {
            balanceSection.style.display = 'block';
            if (balanceDisplay) balanceDisplay.textContent = `$${formatNumber(student.balance)}`;
            if (useBalanceCheckbox) useBalanceCheckbox.checked = false;
            const info = document.getElementById('balanceDeductionInfo');
            if (info) info.style.display = 'none';
        } else {
            balanceSection.style.display = 'none';
        }
    }
    
    renderCheckoutItems();
    const unpaidList = salesState.currentUnpaidOrders || [];
    const preferQuotaUnpaid =
      mode === 'unpaid_orders' &&
      unpaidList.length > 0 &&
      student &&
      typeof window.salesOrderCanPayRemainingWithLessonQuota === 'function' &&
      unpaidList.every((o) => window.salesOrderCanPayRemainingWithLessonQuota(student, o));
    const preferQuota =
      (!!opts.preferQuotaTab &&
        mode === 'new' &&
        salesState.cart.length > 0 &&
        typeof window.salesCartCanFullyPayWithLessonQuota === 'function' &&
        window.salesCartCanFullyPayWithLessonQuota(salesState.selectedStudent, salesState.cart)) ||
      preferQuotaUnpaid;
    if (preferQuotaUnpaid) {
      quotaPayClientLog('openCheckoutModal: defaulting to Quota tab (all unpaid orders match quota tiers)', {
        unpaidCount: unpaidList.length
      });
    }
    switchPaymentMethod(preferQuota ? 'quota' : 'cash');
    
    modal.classList.add('show');
};

window.closeCheckoutModal = function() {
    document.getElementById('checkoutModal').classList.remove('show');
};

window.toggleUseBalance = function() {
    const checkbox = document.getElementById('useBalanceCheckbox');
    checkoutState.useBalance = checkbox ? checkbox.checked : false;
    updateCheckoutTotal();
};

function renderCheckoutItems() {
    const container = document.getElementById('checkoutItemsList');
    let itemsSource = [];
    
    if (checkoutState.mode === 'unpaid_orders') {
        itemsSource = salesState.currentUnpaidOrders || [];
    } else {
        itemsSource = salesState.cart;
    }

    container.innerHTML = itemsSource.map((item, index) => {
        const isChecked = checkoutState.selectedIndices.has(index);
        
        let name = '';
        let price = 0;
        let detailsHtml = '';
        
        if (checkoutState.mode === 'unpaid_orders') {
            // item is an Order — show balance due (extended paid orders may have partial payment)
            name = item.items.map(i => i.productData.name).join(', ');
            const due = salesOrderBalanceDue(item);
            const paid = salesOrderEffectivePaid(item);
            price = due;
            
            const dateStr = new Date(item.date).toLocaleDateString();
            let payLine = '';
            if (paid > 0 && Number(item.totalAmount) > due + 0.005) {
              payLine = ` · Invoiced $${formatNumber(item.totalAmount)} · Paid $${formatNumber(paid)}`;
            }
            detailsHtml = `<div style="font-size:0.85rem; color:#666; margin-left:20px;">Order Date: ${dateStr}${payLine}</div>`;
             if (item.items && item.items.length > 0) {
                item.items.forEach(orderItem => {
                    if (orderItem.enrolledClasses && orderItem.enrolledClasses.length > 0) {
                        detailsHtml += orderItem.enrolledClasses.map(cls => {
                            const d = new Date(cls.date);
                            const dateStr = !isNaN(d) ? d.toLocaleDateString() : 'Invalid Date';
                            const entry = cls.entry || {};
                            return `<div style="font-size:0.8rem; color:#888; margin-left:20px;">- ${entry.startTime || ''}-${entry.endTime || ''} | ${entry.className || ''} > ${dateStr}</div>`;
                        }).join('');
                    }
                });
            }
        } else {
            // item is Cart Item
            name = item.productData.name;
            price = item.price;
            
            if (item.enrolledClasses && item.enrolledClasses.length > 0) {
                detailsHtml = item.enrolledClasses.map(cls => {
                    const d = new Date(cls.date);
                    const dateStr = !isNaN(d) ? d.toLocaleDateString() : 'Invalid Date';
                    return `<div style="font-size:0.85rem; color:#666; margin-left:20px;">${cls.entry.startTime}-${cls.entry.endTime} | ${cls.entry.dayOfWeek} | ${cls.entry.className} > ${dateStr}</div>`;
                }).join('');
            }
        }
        
        return `
            <div class="checkout-item" style="margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label style="display:flex; align-items:center; gap:10px; font-weight:bold;">
                        <input type="checkbox" onchange="toggleCheckoutItem(${index})" ${isChecked ? 'checked' : ''}>
                        ${escapeHtml(name)}
                    </label>
                    <span style="font-weight:bold;">$${formatNumber(price)}</span>
                </div>
                <div style="margin-top:5px;">${detailsHtml}</div>
            </div>
        `;
    }).join('');
    
    updateCheckoutTotal();
}

window.toggleCheckoutSelectAll = function() {
    const checked = document.getElementById('checkoutSelectAll').checked;
    let itemsCount = 0;
    
    if (checkoutState.mode === 'unpaid_orders') {
        itemsCount = (salesState.currentUnpaidOrders || []).length;
    } else {
        itemsCount = salesState.cart.length;
    }

    if (checked) {
        checkoutState.selectedIndices = new Set(Array.from({length: itemsCount}, (_, i) => i));
    } else {
        checkoutState.selectedIndices.clear();
    }
    renderCheckoutItems();
};

window.toggleCheckoutItem = function(index) {
    if (checkoutState.selectedIndices.has(index)) {
        checkoutState.selectedIndices.delete(index);
    } else {
        checkoutState.selectedIndices.add(index);
    }
    
    let itemsCount = 0;
    if (checkoutState.mode === 'unpaid_orders') {
        itemsCount = (salesState.currentUnpaidOrders || []).length;
    } else {
        itemsCount = salesState.cart.length;
    }
    
    const allSelected = itemsCount > 0 && checkoutState.selectedIndices.size === itemsCount;
    document.getElementById('checkoutSelectAll').checked = allSelected;
    
    updateCheckoutTotal();
};

function updateCheckoutTotal() {
    let total = 0;
    let itemsSource = [];
    
    if (checkoutState.mode === 'existing' && checkoutState.existingOrder) {
        total = salesOrderBalanceDue(checkoutState.existingOrder);
    } else if (checkoutState.mode === 'unpaid_orders') {
        itemsSource = salesState.currentUnpaidOrders || [];
        checkoutState.selectedIndices.forEach(index => {
            if (itemsSource[index]) {
                total += salesOrderBalanceDue(itemsSource[index]);
            }
        });
    } else {
        itemsSource = salesState.cart;
        checkoutState.selectedIndices.forEach(index => {
            if (itemsSource[index]) {
                total += itemsSource[index].price;
            }
        });
    }

    if (checkoutState.method === 'quota') {
        const qEq = document.getElementById('quotaCheckoutEquivalent');
        if (qEq) qEq.textContent = `$${formatNumber(total)}`;
        checkoutState.balanceAmount = 0;
        const deductionInfo = document.getElementById('balanceDeductionInfo');
        if (deductionInfo) deductionInfo.style.display = 'none';
        const payDisplay = document.getElementById('checkoutShouldPay');
        const payLabel = document.getElementById('checkoutShouldPayLabel');
        const quotaFoot = document.getElementById('checkoutQuotaFootnote');
        if (payLabel) payLabel.textContent = 'Lesson quota (equiv.)';
        if (payDisplay) payDisplay.textContent = `$${formatNumber(total)}`;
        if (quotaFoot) quotaFoot.style.display = 'block';
        updatePayButton();
        return;
    }

    const payLabelReset = document.getElementById('checkoutShouldPayLabel');
    if (payLabelReset) payLabelReset.textContent = 'Should Pay';
    const quotaFootHide = document.getElementById('checkoutQuotaFootnote');
    if (quotaFootHide) quotaFootHide.style.display = 'none';

    // Balance Calculation
    const student = salesState.selectedStudent;
    const studentBalance = student ? (student.balance || 0) : 0;
    
    let balanceDeduction = 0;
    if (checkoutState.useBalance) {
        balanceDeduction = Math.min(total, studentBalance);
    }
    checkoutState.balanceAmount = balanceDeduction;
    
    const remainingPay = Math.max(0, total - balanceDeduction);
    
    // Update UI for Balance
    const deductionDisplay = document.getElementById('balanceDeductionAmount');
    const deductionInfo = document.getElementById('balanceDeductionInfo');
    if (deductionDisplay && deductionInfo) {
        if (balanceDeduction > 0) {
            deductionDisplay.textContent = `$${formatNumber(balanceDeduction)}`;
            deductionInfo.style.display = 'block';
        } else {
            deductionInfo.style.display = 'none';
        }
    }
    
    // Update Should Pay display
    const payDisplay = document.getElementById('checkoutShouldPay');
    if (payDisplay) {
        payDisplay.textContent = `$${formatNumber(remainingPay)}`;
    }
    
    const input = document.querySelector(`#paymentForm${checkoutState.method.charAt(0).toUpperCase() + checkoutState.method.slice(1)} .payment-amount-input`);
    if (input) {
        input.value = remainingPay;
    }
    updatePayButton();
}

window.switchPaymentMethod = function(method) {
    checkoutState.method = method;
    
    // Update Tabs
    ['Cash', 'FPS', 'Other', 'Quota'].forEach(m => {
        const key = m.toLowerCase();
        const btn = document.getElementById(`payMethod${m}`);
        const form = document.getElementById(`paymentForm${m}`);
        
        if (key === method) {
            btn.className = 'btn btn-primary';
            form.style.display = 'block';
        } else {
            btn.className = 'btn btn-secondary';
            form.style.display = 'none';
        }
    });
    
    // Sync Amount
    updateCheckoutTotal();
};

window.updatePayButton = function() {
    const method = checkoutState.method;
    const btn = document.getElementById('checkoutPayBtn');
    if (!btn) return;
    if (method === 'quota') {
        btn.textContent = 'Confirm lesson quota payment';
        return;
    }
    const input = document.querySelector(`#paymentForm${method.charAt(0).toUpperCase() + method.slice(1)} .payment-amount-input`);
    const amount = input ? parseFloat(input.value) || 0 : 0;
    btn.textContent = `Pay $${formatNumber(amount)}`;
};

