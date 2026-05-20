function getTeacherName(teacherId) {
    if (!salesState.teachers) return 'Unknown';
    const teacher = salesState.teachers.find(t => t.id === teacherId);
    return teacher ? teacher.name : 'Unknown';
}

// Add CSS styles dynamically for new layout
const salesStyles = document.createElement('style');
salesStyles.textContent = `
  .sales-class-selection-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
  }
  
  .selection-header-bar {
    display: flex;
    align-items: center;
    padding: 15px 20px;
    border-bottom: 1px solid rgba(60, 60, 67, 0.12);
    gap: 15px;
  }
  
  .btn-back {
    background: none;
    border: none;
    color: #007aff;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
  }
  
  .header-product-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  
  .badge {
    background: rgba(0, 122, 255, 0.12);
    color: #007aff;
    font-size: 10px;
    padding: 3px 8px;
    border-radius: 980px;
    text-transform: uppercase;
    font-weight: 700;
  }
  .badge.badge-package {
    background: rgba(52, 199, 89, 0.15);
    color: #248a3d;
  }
  .badge.badge-course {
    background: rgba(0, 122, 255, 0.12);
    color: #007aff;
  }
  
  .calendar-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  
  .calendar-sidebar {
    width: min(100%, 320px);
    min-width: 260px;
    border-right: 1px solid #e0e0e0;
    padding: 16px;
    display: flex;
    flex-direction: column;
    overscroll-behavior: contain;
  }

  /* Three months stacked top-to-bottom in the left column */
  .calendar-triple-wrap {
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding-bottom: 8px;
  }

  .calendar-month-column {
    flex: 0 0 auto;
    width: 100%;
    min-width: 0;
    padding-bottom: 4px;
    border-bottom: 1px solid #eee;
  }

  .calendar-month-column:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .mini-cal-month-title {
    font-size: 12px;
    font-weight: 700;
    text-align: center;
    color: #333;
    margin-bottom: 4px;
  }

  .calendar-grid-header.mini-cal-head {
    margin-bottom: 4px;
  }

  .calendar-grid-triple {
    gap: 3px;
  }

  .calendar-grid-triple .calendar-day {
    height: 26px;
    font-size: 11px;
  }

  .calendar-grid-triple .calendar-day.has-class:after {
    bottom: 2px;
    width: 3px;
    height: 3px;
  }
  
  .schedule-main {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    background: #f5f5f7;
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
  
  .calendar-day.selected {
    background: #007aff;
    color: #fff;
    font-weight: 600;
  }
  
  .calendar-day.today {
    border: 1px solid rgba(0, 122, 255, 0.45);
  }
  
  .calendar-day.has-class:after {
    content: '';
    position: absolute;
    bottom: 4px;
    width: 4px;
    height: 4px;
    background: #10b981;
    border-radius: 50%;
  }
  
  .dot-legend {
    display: inline-block;
    width: 6px;
    height: 6px;
    background: #10b981;
    border-radius: 50%;
    margin-right: 5px;
  }
  
  .calendar-legend {
    margin-top: 10px;
    font-size: 11px;
    color: #666;
    display: flex;
    align-items: center;
  }
  
  .schedule-header h3 {
    margin-top: 0;
    margin-bottom: 20px;
    border-bottom: 1px solid #eee;
    padding-bottom: 10px;
  }
  
  .schedule-card {
    background: #fff;
    border: 1px solid rgba(60, 60, 67, 0.1);
    border-radius: 12px;
    padding: 15px;
    margin-bottom: 15px;
    display: flex;
    align-items: flex-start;
    gap: 15px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 14px rgba(0,0,0,0.04);
  }
  
  .card-time {
    min-width: 80px;
    text-align: center;
    border-right: 1px solid #eee;
    padding-right: 15px;
  }
  
  .time-text {
    font-weight: bold;
    font-size: 14px;
    color: #333;
  }
  
  .cal-icon {
    font-size: 20px;
    margin-top: 5px;
  }
  
  .card-details {
    flex: 1;
  }
  
  .card-title {
    font-weight: bold;
    font-size: 16px;
    margin-bottom: 5px;
  }
  
  .card-teacher {
    color: #666;
    font-size: 13px;
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
  
  /* Checkout Modal Styles */
  .payment-tabs { margin-bottom: 15px; }
  .payment-form { border: 1px solid #eee; padding: 15px; border-radius: 8px; background: #f9fafb; }
  .payment-amount-input { font-size: 1.2rem; font-weight: bold; color: #333; }
  .checkout-item label { cursor: pointer; }
`;
document.head.appendChild(salesStyles);

// Lesson quota (paid drops credit by price tier, cents → count)
/** Plain text for student card (same line weight as Balance). */
window.formatLessonQuotaPlainText = function (student) {
  const q = student && student.lessonQuotaByCents;
  if (!q || typeof q !== 'object') return 'No quota credit';
  const entries = Object.entries(q).filter(([, n]) => Number(n) > 0);
  if (!entries.length) return 'No quota credit';
  return entries
    .map(([cents, n]) => {
      const dollars = (Number(cents) / 100).toFixed(2);
      return `$${dollars} × ${Number(n)}`;
    })
    .join(', ');
};

window.formatLessonQuotaChipsHtml = function (student) {
  const q = student && student.lessonQuotaByCents;
  if (!q || typeof q !== 'object') {
    return '<span class="sales-quota-muted" title="Paid drops credit lessons here by per-lesson price tier ($/lesson × count)">No quota credit</span>';
  }
  const entries = Object.entries(q).filter(([, n]) => Number(n) > 0);
  if (!entries.length) {
    return '<span class="sales-quota-muted" title="Paid drops credit lessons here by per-lesson price tier">No quota credit</span>';
  }
  return entries
    .map(([cents, n]) => {
      const dollars = (Number(cents) / 100).toFixed(2);
      return `<span class="sales-quota-chip" title="Credit lessons at this per-lesson price">$${dollars} × ${Number(n)}</span>`;
    })
    .join('');
};

/** True if each cart line has enough quota at implied per-lesson tier (price ÷ lesson count). */
window.salesCartCanFullyPayWithLessonQuota = function (student, cart) {
  if (!student || !cart || !cart.length) return false;
  const q = student.lessonQuotaByCents;
  if (!q || typeof q !== 'object') return false;
  for (let i = 0; i < cart.length; i++) {
    const item = cart[i];
    const classes = item.enrolledClasses;
    if (!Array.isArray(classes) || classes.length === 0) return false;
    const n = classes.length;
    const unitCents = Math.round(((Number(item.price) || 0) * 100) / n);
    if (!Number.isFinite(unitCents) || unitCents <= 0) return false;
    const have = Number(q[String(unitCents)]) || 0;
    if (have < n) return false;
  }
  return true;
};

/**
 * Split order balance due across lines with enrollments (same math as server buildSyntheticQuotaItemsForBalance).
 */
window.salesBuildQuotaItemsForOrderBalance = function (order, balanceDue) {
  const roundMoney = (n) => Math.round(Number(n) * 100) / 100;
  const due = roundMoney(Number(balanceDue) || 0);
  if (due <= 0.005) return [];
  const items = order.items || [];
  const withClasses = items.filter(
    (it) => Array.isArray(it.enrolledClasses) && it.enrolledClasses.length > 0
  );
  if (withClasses.length === 0) return [];
  const subtotals = withClasses.map((it) => roundMoney(Number(it.price) || 0));
  const sumSub = roundMoney(subtotals.reduce((a, b) => a + b, 0));
  let allocated = 0;
  const out = [];
  for (let i = 0; i < withClasses.length; i++) {
    const it = withClasses[i];
    let lineDue;
    if (i === withClasses.length - 1) {
      lineDue = roundMoney(due - allocated);
    } else if (sumSub > 0.005) {
      lineDue = roundMoney((due * subtotals[i]) / sumSub);
    } else {
      lineDue = roundMoney(due / withClasses.length);
    }
    allocated = roundMoney(allocated + lineDue);
    if (lineDue > 0.005) {
      out.push({ ...it, price: lineDue, enrolledClasses: it.enrolledClasses });
    }
  }
  return out;
};

/** True if student's lesson quota can cover the remaining balance on this order (per-lesson tiers from balance ÷ lesson counts). */
window.salesOrderCanPayRemainingWithLessonQuota = function (student, order) {
  if (!student || !order) return false;
  const dueFn = typeof window.salesOrderBalanceDue === 'function' ? window.salesOrderBalanceDue : null;
  if (!dueFn || !window.salesBuildQuotaItemsForOrderBalance || !window.salesCartCanFullyPayWithLessonQuota) {
    return false;
  }
  const due = dueFn(order);
  if (due < 0.005) return false;
  const synth = window.salesBuildQuotaItemsForOrderBalance(order, due);
  if (!synth.length) return false;
  return window.salesCartCanFullyPayWithLessonQuota(student, synth);
};

window.applyDropResultToSalesStudent = function (studentId, result) {
  if (!result || studentId == null) return;
  const s = (window.students || []).find((stu) => String(stu.id) === String(studentId));
  if (!s) return;
  if (result.newBalance !== undefined) s.balance = result.newBalance;
  if (result.lessonQuotaByCents && typeof result.lessonQuotaByCents === 'object') {
    s.lessonQuotaByCents = JSON.parse(JSON.stringify(result.lessonQuotaByCents));
  }
};

window.formatDropQuotaToastMessage = function (result) {
  const n = Number(result.droppedCount) || 0;
  const delta = result.lessonQuotaDelta;
  if (!delta || typeof delta !== 'object' || !Object.keys(delta).length) {
    return n === 1 ? 'Dropped 1 lesson.' : `Dropped ${n} lessons.`;
  }
  const parts = Object.entries(delta).map(
    ([cents, add]) => `$${(Number(cents) / 100).toFixed(2)} +${add}`
  );
  const head = n === 1 ? 'Dropped 1 lesson' : `Dropped ${n} lessons`;
  return `${head}. Lesson quota credit: ${parts.join(', ')}.`;
};
