// Split from course-management-sales-orders.js
function renderSalesCart() {
  const container = document.getElementById('salesCartContent');
  const emptyState = document.querySelector('.cart-empty-state');
  
  // Always update Pay Button first based on cart total
  let total = 0;
  salesState.cart.forEach(item => total += item.price);
  
  const payBtn = document.querySelector('.sales-footer-actions .btn-primary');
  if (payBtn) {
      payBtn.removeAttribute('data-pay-mode');
      const canQuota =
        total > 0 &&
        salesState.selectedStudent &&
        typeof window.salesCartCanFullyPayWithLessonQuota === 'function' &&
        window.salesCartCanFullyPayWithLessonQuota(salesState.selectedStudent, salesState.cart);
      if (canQuota) {
          payBtn.textContent = 'Pay quota';
          payBtn.setAttribute('data-pay-mode', 'quota');
      } else {
          payBtn.textContent = `Pay $${total.toFixed(0)}`;
      }
      
      if (total === 0 && salesState.currentUnpaidOrders && salesState.currentUnpaidOrders.length > 0) {
          const unpaidTotal = salesState.currentUnpaidOrders.reduce((sum, o) => sum + salesOrderBalanceDue(o), 0);
          payBtn.textContent = `Pay Unpaid ($${unpaidTotal.toFixed(0)})`;
          payBtn.removeAttribute('data-pay-mode');
      } else if (total === 0) {
          payBtn.textContent = `Pay $0`;
          payBtn.removeAttribute('data-pay-mode');
      }
  }

  if (salesState.cart.length === 0) {
    container.style.display = 'none';
    if (emptyState) {
      emptyState.style.display = 'none';
      emptyState.innerHTML = '';
    }
    return;
  }
  
  container.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';
  
  const html = salesState.cart.map((item, index) => {
    // total is already calculated above, do not add again
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
        <div class="cart-item-body" role="button" tabindex="0" onclick="openSalesCartLessonDatesModal(${index})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openSalesCartLessonDatesModal(${index});}">
          <div class="cart-item-header">
            <span class="cart-item-title">${escapeHtml(item.productData.name)}</span>
            <span class="cart-item-price">$${item.price.toFixed(0)}</span>
          </div>
          <div class="cart-item-details">
            ${dateCount} lesson${dateCount > 1 ? 's' : ''} • ${dateRange}
            <span class="cart-item-hint"> · Click for dates</span>
          </div>
        </div>
        <button type="button" class="btn-remove-item" onclick="event.stopPropagation(); removeSalesCartItem(${index})">Remove</button>
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
}

window.removeSalesCartItem = function(index) {
  if (index < 0 || index >= salesState.cart.length) return;
  if (document.getElementById('salesCartDatesModal')) window.closeSalesCartDatesModal();
  salesState.cart.splice(index, 1);
  renderSalesCart();
  if (typeof updateDaySchedule === 'function') updateDaySchedule();
  if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
};

window.closeSalesCartDatesModal = function() {
  const m = document.getElementById('salesCartDatesModal');
  if (!m) return;
  m.classList.remove('show');
  setTimeout(() => m.remove(), 250);
};

window.openSalesCartLessonDatesModal = function(index) {
  const item = salesState.cart[index];
  if (!item || !item.enrolledClasses || !item.enrolledClasses.length) return;
  const existing = document.getElementById('salesCartDatesModal');
  if (existing) existing.remove();

  const sorted = [...item.enrolledClasses].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const rows = sorted.map(cls => {
    const entry = cls.entry || {};
    const d = cls.date;
    let dateLabel = '';
    if (d) {
      const dateObj = new Date(d);
      dateLabel = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
        : String(d);
    }
    const time =
      entry.startTime && entry.endTime ? `${escapeHtml(String(entry.startTime))} – ${escapeHtml(String(entry.endTime))}` : '—';
    const title = entry.className ? escapeHtml(entry.className) : 'Class';
    return `<tr><td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${escapeHtml(dateLabel)}</td><td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${time}</td><td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${title}</td></tr>`;
  }).join('');

  const modal = document.createElement('div');
  modal.id = 'salesCartDatesModal';
  modal.className = 'edit-student-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="edit-student-modal-content" style="max-width:560px;" onclick="event.stopPropagation()">
      <div class="edit-student-modal-header">
        <h2 style="font-size:1.1rem;">Enrolled lesson dates (cart)</h2>
        <button type="button" class="org-modal-close-x" onclick="closeSalesCartDatesModal()" aria-label="Close">&times;</button>
      </div>
      <div class="edit-student-modal-body" style="padding-top:12px;">
        <p style="margin-bottom:12px;color:#64748b;font-size:0.875rem;">${escapeHtml(item.productData.name)} · ${sorted.length} lesson(s)</p>
        <div style="max-height:min(55vh,420px);overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;">
        <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
          <thead><tr style="background:#f8fafc;"><th style="text-align:left;padding:8px 10px;">Date</th><th style="text-align:left;padding:8px 10px;">Time</th><th style="text-align:left;padding:8px 10px;">Class</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
        <div class="edit-student-modal-actions" style="border-top:none;padding-top:16px;">
          <button type="button" class="btn btn-secondary" onclick="closeSalesCartDatesModal()">Close</button>
        </div>
      </div>
    </div>`;
  modal.onclick = () => window.closeSalesCartDatesModal();
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('show'), 10);
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

// Checkout Logic
let checkoutState = {
    selectedIndices: new Set(),
    method: 'cash',
    useBalance: false,
    balanceAmount: 0
};

