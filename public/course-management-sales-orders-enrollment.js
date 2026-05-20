// Split from course-management-sales-orders.js
window.renderStudentEnrollments = function () {
  const container = document.getElementById('salesStudentHistory');
  if (!container) return;

  const studentId = salesState.selectedStudent?.id;
  if (!studentId) {
    container.innerHTML = '';
    return;
  }

  classHistoryUiLog('renderStudentEnrollments: start', { studentId: String(studentId) });

  const enrollments = (window.timetableEnrollments || []).filter(
    (e) => String(e.studentId) === String(studentId)
  );
  if (enrollments.length === 0) {
    container.innerHTML = '';
    classHistoryUiLog('renderStudentEnrollments: no enrollments');
    return;
  }

  if (!document.getElementById('salesHistoryStyles')) {
    const style = document.createElement('style');
    style.id = 'salesHistoryStyles';
    style.textContent = `
            .sales-student-history { margin-top: 6px; padding: 10px 12px; background: rgba(248,248,250,0.95); border-radius: 14px; max-height: 280px; overflow-y: auto;
              border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 2px 12px rgba(0,0,0,0.04); font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif; }
            .sales-enroll-wrap { display: flex; flex-direction: column; gap: 8px; }
            .history-header { font-weight: 600; font-size: 13px; color: #3c3c43; letter-spacing: -0.01em; margin-bottom: 2px; }
            .sales-enroll-group { border-radius: 12px; background: #fff; border: 1px solid rgba(0,0,0,0.06); overflow: hidden; }
            .sales-enroll-summary { list-style: none; cursor: pointer; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px;
              font-size: 13px; color: #1c1c1e; user-select: none; }
            .sales-enroll-summary::-webkit-details-marker { display: none; }
            .sales-enroll-summary-label { font-weight: 500; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .sales-enroll-summary-meta { font-size: 12px; color: #8e8e93; font-weight: 500; }
            .sales-enroll-group[open] .sales-enroll-summary { border-bottom: 1px solid rgba(0,0,0,0.06); }
            .sales-enroll-list { padding: 8px 10px 10px; }
            .history-item { display: flex; justify-content: space-between; align-items: center; font-size: 13px; padding: 8px 12px; cursor: pointer;
              transition: background 0.15s; gap: 10px; border-bottom: 1px solid rgba(0,0,0,0.04); }
            .history-item:last-child { border-bottom: none; }
            .history-item:hover { background: rgba(0,122,255,0.06); }
            .history-date { color: #007aff; font-weight: 600; flex-shrink: 0; }
            .history-info { flex: 1; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #3c3c43; }
            .sales-quota-label { font-size: 12px; font-weight: 600; color: #8e8e93; margin-bottom: 4px; }
            .sales-quota-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
            .sales-quota-chip { display: inline-block; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 980px;
              background: rgba(0,122,255,0.12); color: #007aff; }
            .sales-quota-muted { font-size: 12px; color: #8e8e93; }
            .sales-enroll-summary-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
            .sales-history-kind { font-size: 11px; font-weight: 600; color: #8e8e93; margin-left: 4px; }
            .sales-order-use-product-btn { font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 8px;
              border: 1px solid rgba(0,122,255,0.35); background: rgba(0,122,255,0.08); color: #007aff; cursor: pointer;
              font-family: inherit; }
            .sales-order-use-product-btn:hover { background: rgba(0,122,255,0.14); }
            .sales-month-class-title { font-size: 12px; font-weight: 600; color: #3c3c43; margin-bottom: 6px; }
            .sales-month-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 8px; font-size: 13px; padding: 4px 0; border-bottom: 1px solid rgba(0,0,0,0.06); }
            .sales-month-row:last-child { border-bottom: none; }
            .sales-month-label { color: #1c1c1e; font-weight: 600; flex-shrink: 0; }
            .sales-month-days { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
            .sales-day-jump { background: rgba(0,122,255,0.1); border: none; border-radius: 6px; color: #007aff; font-weight: 700; font-size: 13px; padding: 2px 8px; cursor: pointer; font-family: inherit; line-height: 1.3; }
            .sales-day-jump:hover { background: rgba(0,122,255,0.18); }
        `;
    document.head.appendChild(style);
  }

  const ordLookupHist = [
    ...(salesState.currentPaidOrdersForStudent || []),
    ...(salesState.currentUnpaidOrders || [])
  ];

  const groupMap = new Map();
  for (const e of enrollments) {
    const inferred = inferOrderIdForEnrollmentDisplay(e, studentId, ordLookupHist);
    const fromRec = e.orderId != null && String(e.orderId).trim() !== '' ? String(e.orderId) : '';
    const effectiveOid = fromRec || inferred;
    const k = effectiveOid ? `order:${effectiveOid}` : 'no-order';
    classHistoryUiVerboseLog('sidebar enrollment → group', {
      date: e.date,
      orderId_on_record: fromRec || null,
      inferred: inferred || null,
      groupKey: k
    });
    if (!groupMap.has(k)) groupMap.set(k, []);
    groupMap.get(k).push(e);
  }

  classHistoryUiLog('renderStudentEnrollments: groups', {
    count: groupMap.size,
    keys: Array.from(groupMap.keys())
  });

  const groups = Array.from(groupMap.entries()).map(([key, list]) => {
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
    const minDate = list[0].date;
    const orderId = key.startsWith('order:') ? key.slice(6) : '';
    const short =
      orderId.length > 12 ? `${escapeHtml(orderId.slice(0, 10))}…` : escapeHtml(orderId);
    const anyInferred = list.some(
      (en) => !(en.orderId != null && String(en.orderId).trim() !== '') && orderId
    );
    const inferredHint = anyInferred
      ? ` <span style="color:#8e8e93;font-size:10px;font-weight:500;">(matched)</span>`
      : '';
    const label =
      key === 'no-order'
        ? 'Other enrollments'
        : `Order <span style="color:#8e8e93;font-weight:500;">${short || escapeHtml(orderId)}</span>${inferredHint}`;
    return { key, list, minDate, label, orderId };
  });
  groups.sort((a, b) => new Date(a.minDate) - new Date(b.minDate));

  container.innerHTML = `
        <div class="sales-enroll-wrap">
            <div class="history-header">Enrolled dates (${enrollments.length})</div>
            ${groups
              .map((g) => {
                const ordRow = g.orderId
                  ? ordLookupHist.find((o) => String(o.id) === String(g.orderId))
                  : null;
                let kindSpan = '';
                if (g.orderId && ordRow && ordRow.items && ordRow.items.length) {
                  const isPkg = ordRow.items.some(
                    (it) =>
                      it.productType === 'package' ||
                      (it.productData &&
                        Array.isArray(it.productData.courses) &&
                        it.productData.courses.length > 0)
                  );
                  kindSpan = `<span class="sales-history-kind">${isPkg ? 'Package' : 'Course'}</span>`;
                }
                const useBtn = g.orderId
                  ? `<button type="button" class="sales-order-use-product-btn" data-order-id="${escapeHtml(String(g.orderId))}">Use product</button>`
                  : '';
                return `
            <details class="sales-enroll-group" ${groups.length === 1 ? 'open' : ''}>
                <summary class="sales-enroll-summary">
                    <span class="sales-enroll-summary-label">${g.label}${kindSpan}</span>
                    <span class="sales-enroll-summary-actions">
                        ${useBtn}
                        <span class="sales-enroll-summary-meta">${g.list.length} date(s)</span>
                    </span>
                </summary>
                <div class="sales-enroll-list">
                    ${buildEnrollmentMonthRowsMarkup(g.list, window.timetableEntries || [], 'sidebar')}
                </div>
            </details>`;
              })
              .join('')}
        </div>
    `;
  container.querySelectorAll('.sales-order-use-product-btn').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const id = btn.getAttribute('data-order-id');
      if (typeof window.salesTrace === 'function') {
        window.salesTrace('Use product button', { orderId: id, hasHandler: typeof window.salesApplyProductFromOrder === 'function' });
      }
      if (id && typeof window.salesApplyProductFromOrder === 'function') {
        window.salesApplyProductFromOrder(id);
      }
    });
  });
  container.scrollTop = container.scrollHeight;
  classHistoryUiLog('renderStudentEnrollments: done', {
    detailsCount: container.querySelectorAll('details.sales-enroll-group').length
  });
};

window.resetSales = function() {
  salesState.cart = [];
  deselectSalesStudent();
  salesState.step = 1;
  showProductList();
};

