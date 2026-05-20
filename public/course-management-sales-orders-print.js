// Split from course-management-sales-orders.js
window.jumpToDate = function(dateString, courseId) {
    if (!dateString) return;
    
    // Parse simple date string YYYY-MM-DD
    const parts = dateString.split('-');
    if (parts.length !== 3) return;
    const targetDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    
    // Check if we need to switch to Step 2 (Calendar View)
    const calendarExists =
      document.getElementById('miniCalendarGrid0') || document.getElementById('miniCalendarGrid');
    if (!calendarExists) {
        if (courseId) {
            let product = (window.courses || []).find(c => c.id === courseId);
            let type = 'course';
            
            if (product) {
                handleProductSelect(type, product.id);
            } else {
                console.warn('Product not found for jump:', courseId);
                return;
            }
        } else {
            return; 
        }
    }
    
    // Update View Date (Month) if different
    const currentView = salesState.classSelection.viewDate;
    if (targetDate.getMonth() !== currentView.getMonth() || targetDate.getFullYear() !== currentView.getFullYear()) {
        salesState.classSelection.viewDate = new Date(targetDate);
    }
    
    // Select Date
    salesState.classSelection.selectedDate = targetDate;
    
    // Refresh UI (rebuild dots when view month changes — same fix as changeCalendarMonth)
    if (document.getElementById('miniCalendarGrid0') || document.getElementById('miniCalendarGrid')) {
        const cid = salesState.classSelection && salesState.classSelection.courseId;
        if (typeof rebuildSalesAvailableClasses === 'function' && cid && Array.isArray(window.timetableEntries)) {
            rebuildSalesAvailableClasses(cid);
        } else {
            if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
            if (typeof updateDaySchedule === 'function') updateDaySchedule();
        }
    }
};

/** Close Class History overlay then jump (used by overlay month day buttons). */
window.jumpToDateFromClassHistory = function (dateString, courseId) {
    if (typeof closeStudentOverlay === 'function') closeStudentOverlay();
    window.jumpToDate(dateString, courseId || '');
};

(function installSalesEnrollmentDayJumpDelegation() {
    if (typeof document === 'undefined' || window.__salesEnrollmentDayJumpBound) return;
    window.__salesEnrollmentDayJumpBound = true;
    document.addEventListener(
        'click',
        function (ev) {
            const btn = ev.target.closest('.sales-day-jump, .overlay-day-jump');
            if (!btn) return;
            ev.preventDefault();
            ev.stopPropagation();
            const date = btn.getAttribute('data-date');
            if (!date) return;
            const courseId = btn.getAttribute('data-course-id') || '';
            if (btn.getAttribute('data-close-overlay') === '1' && typeof window.closeStudentOverlay === 'function') {
                window.closeStudentOverlay();
            }
            if (typeof window.jumpToDate === 'function') {
                window.jumpToDate(date, courseId);
            }
        },
        true
    );
})();

/**
 * UI smoke: verify month day buttons use data-* (not broken onclick) and delegation is installed.
 * Run: smokeTestEnrollmentDayJump()
 */
window.smokeTestEnrollmentDayJump = function smokeTestEnrollmentDayJump() {
    const sample = buildEnrollmentMonthRowsMarkup(
        [
            { date: '2026-04-09', timetableEntryId: 'te_smoke', studentId: 's1' },
            { date: '2026-05-07', timetableEntryId: 'te_smoke', studentId: 's1' }
        ],
        [{ id: 'te_smoke', className: 'Chess Class', courseIds: ['course_smoke_1'] }],
        'sidebar'
    );
    const wrap = document.createElement('div');
    wrap.innerHTML = sample;
    const buttons = wrap.querySelectorAll('.sales-day-jump');
    const overlaySample = buildEnrollmentMonthRowsMarkup(
        [{ date: '2026-04-09', timetableEntryId: 'te_smoke', studentId: 's1' }],
        [{ id: 'te_smoke', className: 'Chess Class', courseIds: ['course_smoke_1'] }],
        'overlay'
    );
    const wrapO = document.createElement('div');
    wrapO.innerHTML = overlaySample;
    const ob = wrapO.querySelectorAll('.overlay-day-jump');
    const rows = Array.from(buttons).map((b) => ({
        day: b.textContent,
        dataDate: b.getAttribute('data-date'),
        dataCourse: b.getAttribute('data-course-id'),
        hasOnclick: b.hasAttribute('onclick')
    }));
    const orows = Array.from(ob).map((b) => ({
        closeOverlay: b.getAttribute('data-close-overlay'),
        hasOnclick: b.hasAttribute('onclick')
    }));
    console.log('[smokeTestEnrollmentDayJump] delegation', !!window.__salesEnrollmentDayJumpBound);
    console.log('[smokeTestEnrollmentDayJump] sidebar buttons', rows);
    console.log('[smokeTestEnrollmentDayJump] overlay buttons', orows);
    const ok =
        window.__salesEnrollmentDayJumpBound &&
        buttons.length >= 2 &&
        rows.every((r) => r.dataDate && !r.hasOnclick) &&
        orows.length >= 1 &&
        orows.every((r) => r.closeOverlay === '1' && !r.hasOnclick);
    console.log('[smokeTestEnrollmentDayJump] OK=', ok);
    return { ok, delegation: !!window.__salesEnrollmentDayJumpBound, sidebarButtons: rows, overlayMeta: orows };
};

window.printReceipt = async function(orderOrOrders) {
    // Handle array input (merged receipt/reminder)
    const isArray = Array.isArray(orderOrOrders);
    const orders = isArray ? orderOrOrders : [orderOrOrders];
    
    if (orders.length === 0) return;
    
    // Use the first order to determine status (assuming all in batch have same status)
    const primaryOrder = orders[0];
    const isPaid = primaryOrder.status === 'paid'; 
    
    // Ensure settings are loaded
    if (!window.currentSettings) {
        try {
            const response = await window.authUtils.authenticatedFetch('/organizations/settings');
            if (response && response.ok) {
                window.currentSettings = await response.json();
            }
        } catch (e) {
            console.error('Failed to load settings for receipt', e);
        }
    }

    const salesSettings = (window.currentSettings && window.currentSettings.salesSettings) ? window.currentSettings.salesSettings : {
        receipt: { logo: '', remark: 'Make-up Lesson Arrangements:\n- All make-up class quotas must be used within two months.\n- Sessions cannot be postponed under any circumstances.\n- Classes canceled by Typhoon/Rainstorm will be arranged via Zoom or face-to-face.\n- Must apply for leave at least 2 hours before class.' },
        paymentReminder: { logo: '', remark: 'Make-up Lesson Arrangements:\n- All make-up class quotas must be used within two months.\n- Sessions cannot be postponed under any circumstances.\n- Classes canceled by Typhoon/Rainstorm will be arranged via Zoom or face-to-face.\n- Must apply for leave at least 2 hours before class.', paymentMethod: '', qrCode: '' }
    };

    const title = isPaid ? 'Receipt' : 'Payment Reminder';
    const config = isPaid ? salesSettings.receipt : salesSettings.paymentReminder;
    
    const logoSrc = config.logo || '';
    const remarkText = (config.remark || '').replace(/\n/g, '<br>');
    const paymentMethodInfo = (!isPaid && config.paymentMethod) ? config.paymentMethod.replace(/\n/g, '<br>') : '';
    const qrCodeSrc = (!isPaid && config.qrCode) ? config.qrCode : '';
    
    const student = salesState.selectedStudent;
    const studentName = student ? student.name : 'Unknown';
    const studentId = student ? (student.chessComId || '') : '';
    
    const dateStr = new Date().toLocaleString('en-GB');
    
    let itemsHtml = '';
    let totalAmount = 0;
    let payAmount = 0;
    
    // Collect all order IDs
    const orderIds = orders.map(o => o.id.split('_').pop().toUpperCase()).join(', ');
    
    // Iterate through ALL orders
    orders.forEach(order => {
        const orderPayInfo = order.paymentDetails || {};
        payAmount += (orderPayInfo.amount || 0);

        order.items.forEach(item => {
            const productName = item.productData.name;
            const price = item.price;
            const quantity = item.enrolledClasses ? item.enrolledClasses.length : 1;
            totalAmount += price;
            
            let desc = `<b>${escapeHtml(productName)}</b>`;
            if (item.enrolledClasses && item.enrolledClasses.length > 0) {
                const dates = item.enrolledClasses.map(c => {
                    const d = new Date(c.date);
                    return `${d.getDate()}/${d.getMonth()+1}`;
                }).join(', ');
                
                const first = item.enrolledClasses[0];
                const teacherName = first.entry.teacherName || (first.entry.teacherIds && first.entry.teacherIds.length > 0 ? getTeacherName(first.entry.teacherIds[0]) : 'Unknown');

                desc += `<br><span style="font-size:0.9em; color:#666;">${first.entry.startTime}-${first.entry.endTime} | ${dates}</span>`;
                desc += `<br><span style="font-size:0.9em; color:#666;">Teacher: ${escapeHtml(teacherName)}</span>`;
            }
            
            itemsHtml += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:8px;">${desc}</td>
                    <td style="padding:8px; text-align:right;">$${formatNumber(price / quantity)}</td>
                    <td style="padding:8px; text-align:center;">${quantity}</td>
                    <td style="padding:8px; text-align:right;">$${formatNumber(price)}</td>
                </tr>
            `;
        });
    });
    
    const payInfo = primaryOrder.paymentDetails || {};
    const payMethod = payInfo.method || '-';
    const remark = payInfo.remark || '';

    const receiptCss = `
                body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                .header { text-align: center; margin-bottom: 30px; position: relative; }
                .header h1 { margin: 0; font-size: 24px; }
                .meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
                .meta-right { text-align: right; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
                th { border-bottom: 2px solid #000; text-align: left; padding: 8px; }
                .totals { text-align: right; margin-bottom: 30px; }
                .totals-row { display: flex; justify-content: flex-end; gap: 20px; margin-bottom: 5px; }
                .footer { margin-top: 50px; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 10px; }
                .logo { width: 80px; height: 80px; position: absolute; left: 0; top: 0; display:flex;align-items:center;justify-content:center; }
                .logo img { max-width: 100%; max-height: 100%; }
                .payment-info-section { margin-top: 30px; border: 1px dashed #ccc; padding: 15px; display: flex; gap: 20px; }
                .qr-code-container { width: 120px; height: 120px; flex-shrink: 0; }
                .qr-code-container img { width: 100%; height: 100%; object-fit: contain; }
            `;

    const receiptBodyInner = `
            <div class="header">
                <div class="logo">
                    ${logoSrc ? `<img src="${logoSrc}">` : '<div style="width:100%;height:100%;background:#eee;display:flex;align-items:center;justify-content:center;border-radius:50%;">Logo</div>'}
                </div>
                <h1>${title}</h1>
                <div style="text-align:right; font-size:12px; margin-top:5px;">
                    No.: ${orderIds}<br>
                    Date: ${dateStr}
                </div>
            </div>
            
            <div class="meta">
                <div class="meta-left">
                    <strong>Received From:</strong><br>
                    ${escapeHtml(studentName)} (${escapeHtml(studentId)})
                </div>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>Item Description</th>
                        <th style="text-align:right;">Price</th>
                        <th style="text-align:center;">Quantity</th>
                        <th style="text-align:right;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
            
            <div class="totals">
                <div class="totals-row">
                    <strong>TOTAL</strong>
                    <strong>$${formatNumber(totalAmount)}</strong>
                </div>
                ${isPaid ? `
                <div class="totals-row" style="border-top:1px dashed #ccc; padding-top:10px; margin-top:10px;">
                    <span>Pay By: ${payMethod.toUpperCase()}</span>
                    <span>$${formatNumber(payAmount)}</span>
                </div>
                ${remark ? `<div style="margin-top:5px; font-size:12px;">Remark: ${escapeHtml(remark)}</div>` : ''}
                ` : ''}
            </div>
            
            ${!isPaid && (paymentMethodInfo || qrCodeSrc) ? `
            <div class="payment-info-section">
                ${qrCodeSrc ? `<div class="qr-code-container"><img src="${qrCodeSrc}"></div>` : ''}
                <div style="flex:1; font-size:13px;">
                    <strong>Payment Methods:</strong><br>
                    ${paymentMethodInfo || 'Please contact us for payment details.'}
                </div>
            </div>
            ` : ''}
            
            <div class="footer">
                ${remarkText}
            </div>
            `;

    const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} - ${escapeHtml(orderIds)}</title><style>${receiptCss}</style></head><body>${receiptBodyInner}</body></html>`;

    if (!document.getElementById('receiptPreviewModalStyles')) {
        const st = document.createElement('style');
        st.id = 'receiptPreviewModalStyles';
        st.textContent = `
            .receipt-preview-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.55); z-index: 12000; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; }
            .receipt-preview-panel { background: #fff; width: min(920px, 100%); max-height: min(92vh, 900px); border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.25); display: flex; flex-direction: column; overflow: hidden; }
            .receipt-preview-toolbar { flex: 0 0 auto; display: flex; align-items: center; gap: 16px; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
            .receipt-preview-textbtn { background: none; border: none; padding: 0; margin: 0; font: inherit; font-size: 15px; font-weight: 600; color: #2563eb; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
            .receipt-preview-textbtn:hover { color: #1d4ed8; }
            .receipt-preview-textbtn-muted { color: #64748b; font-weight: 500; }
            .receipt-preview-textbtn-muted:hover { color: #334155; }
            .receipt-preview-iframe { flex: 1 1 auto; min-height: 0; width: 100%; border: 0; background: #fff; }
        `;
        document.head.appendChild(st);
    }

    window.closeReceiptPreviewModal = function closeReceiptPreviewModal() {
        const r = document.getElementById('receiptPreviewModalRoot');
        if (r) {
            const fn = r._receiptEscHandler;
            if (fn) document.removeEventListener('keydown', fn);
            r.remove();
        }
    };

    const oldRoot = document.getElementById('receiptPreviewModalRoot');
    if (oldRoot) oldRoot.remove();

    const root = document.createElement('div');
    root.id = 'receiptPreviewModalRoot';
    root.className = 'receipt-preview-backdrop';
    root.innerHTML = `
        <div class="receipt-preview-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" onclick="event.stopPropagation()">
            <div class="receipt-preview-toolbar">
                <button type="button" class="receipt-preview-textbtn" id="receiptPreviewPrintBtn">Print</button>
                <button type="button" class="receipt-preview-textbtn receipt-preview-textbtn-muted" id="receiptPreviewCloseBtn">Close</button>
            </div>
            <iframe class="receipt-preview-iframe" title="${escapeHtml(title)}"></iframe>
        </div>
    `;
    root.addEventListener('click', () => window.closeReceiptPreviewModal());
    const onKeyDown = (ev) => {
        if (ev.key === 'Escape') window.closeReceiptPreviewModal();
    };
    root._receiptEscHandler = onKeyDown;
    document.addEventListener('keydown', onKeyDown);

    document.body.appendChild(root);

    const iframe = root.querySelector('iframe');
    iframe.srcdoc = srcDoc;

    const runPrint = () => {
        try {
            const w = iframe.contentWindow;
            if (w) {
                w.focus();
                w.print();
            }
        } catch (err) {
            console.error('Receipt print failed', err);
        }
    };

    root.querySelector('#receiptPreviewPrintBtn').addEventListener('click', (ev) => {
        ev.stopPropagation();
        runPrint();
    });
    root.querySelector('#receiptPreviewCloseBtn').addEventListener('click', (ev) => {
        ev.stopPropagation();
        window.closeReceiptPreviewModal();
    });

    window.__receiptPreviewDoPrint = runPrint;
};

