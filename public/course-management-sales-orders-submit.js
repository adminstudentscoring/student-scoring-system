// Split from course-management-sales-orders.js
window.saveSalesOrder = async function() {
  const order = await submitSalesOrder('unpaid');
  if (order) {
      // After saving, reload student orders to show in unpaid list
      if (salesState.selectedStudent) {
          await loadStudentOrders(salesState.selectedStudent.id);
      }
      // Automatically print Payment Reminder
      if (typeof printReceipt === 'function') {
          printReceipt(order);
      }
  }
};

window.processSalesPayment = function() {
  const payBtn = document.querySelector('.sales-footer-actions .btn-primary');
  if (
    payBtn &&
    payBtn.getAttribute('data-pay-mode') === 'quota' &&
    salesState.cart.length > 0 &&
    typeof window.salesCartCanFullyPayWithLessonQuota === 'function' &&
    window.salesCartCanFullyPayWithLessonQuota(salesState.selectedStudent, salesState.cart)
  ) {
    openCheckoutModal('new', { preferQuotaTab: true });
    return;
  }
  if (salesState.cart.length === 0 && salesState.currentUnpaidOrders && salesState.currentUnpaidOrders.length > 0) {
      openCheckoutModal('unpaid_orders');
  } else {
      openCheckoutModal('new');
  }
};

async function submitSalesOrder(status, itemsOverride = null, paymentDetails = null) {
  const itemsToSubmit = itemsOverride || salesState.cart;

  if (itemsToSubmit.length === 0) {
    if (window.showToast) window.showToast('Cart is empty', 'error');
    else alert('Cart is empty');
    return;
  }
  
  if (!salesState.selectedStudent) {
    if (window.showToast) window.showToast('No student selected', 'error');
    else alert('No student selected');
    return;
  }
  
  // Use button reference
  const payBtn = document.querySelector('.sales-footer-actions .btn-primary');
  const saveBtn = document.querySelector('.sales-footer-actions .btn-secondary'); 
  const activeBtn = status === 'paid' ? payBtn : saveBtn;
  
  if (activeBtn) {
    activeBtn.textContent = 'Processing...';
    activeBtn.disabled = true;
  }

  const mergeIntoOrderId = resolveSalesMergeIntoOrderId(itemsToSubmit);
  orderPayDebug('submitSalesOrder', {
    status,
    mergeIntoOrderId: mergeIntoOrderId || null,
    paymentMethod: paymentDetails && paymentDetails.method,
    itemCount: itemsToSubmit.length,
    cartTotal: itemsToSubmit.reduce((s, it) => s + (Number(it.price) || 0), 0)
  });
  if (paymentDetails && String(paymentDetails.method).toLowerCase() === 'lesson_quota') {
    const st = salesState.selectedStudent;
    quotaPayClientLog('submitSalesOrder lesson_quota → POST /organizations/orders', {
      studentId: st && st.id,
      mergeIntoOrderId: mergeIntoOrderId || null,
      itemLines: itemsToSubmit.map((it) => ({
        price: it.price,
        lessons: (it.enrolledClasses || []).length,
        unitCents:
          (it.enrolledClasses || []).length > 0
            ? Math.round(((Number(it.price) || 0) * 100) / (it.enrolledClasses || []).length)
            : null
      })),
      quotaTiersOnStudent: st && st.lessonQuotaByCents ? { ...st.lessonQuotaByCents } : {}
    });
  }
  const payload = {
    studentId: salesState.selectedStudent.id,
    items: itemsToSubmit,
    paymentStatus: status,
    paymentDetails: paymentDetails,
    ...(mergeIntoOrderId ? { mergeIntoOrderId } : {})
  };
  
  try {
     const response = await window.authUtils.authenticatedFetch('/organizations/orders', {
       method: 'POST',
       body: JSON.stringify(payload)
     });
     
     if (response && response.ok) {
       const order = await response.json();
       orderPayDebug('submitSalesOrder response OK', {
         orderId: order.id,
         orderStatus: order.status,
         totalAmount: order.totalAmount,
         amountPaid: order.amountPaid
       });
       if (window.showToast) window.showToast(status === 'paid' ? 'Payment successful!' : 'Order saved!', 'success');
       else alert(status === 'paid' ? 'Payment successful!' : 'Order saved!');

       if (paymentDetails && String(paymentDetails.method).toLowerCase() === 'lesson_quota') {
         try {
           const sr = await window.authUtils.authenticatedFetch('/students');
           if (sr && sr.ok) {
             const data = await sr.json();
             const list = Array.isArray(data) ? data : (data.students || []);
             window.students = list;
             if (salesState.selectedStudent) {
               const sid = salesState.selectedStudent.id;
               const updated = list.find((s) => String(s.id) === String(sid));
               if (updated) salesState.selectedStudent = updated;
             }
           }
         } catch (err) {
           console.error('Failed to refresh students after quota payment', err);
         }
         if (salesState.selectedStudent && typeof window.selectSalesStudent === 'function') {
           await window.selectSalesStudent(salesState.selectedStudent.id);
         }
       }
       
       // Update Cart
       if (itemsOverride) {
           salesState.cart = salesState.cart.filter(c => !itemsOverride.includes(c));
       } else {
           salesState.cart = [];
       }
       
       renderSalesCart();
       
       // Refresh Data
       if (typeof window.loadTimetableData === 'function') {
         await window.loadTimetableData();
       }
       
       // Refresh UI (History & Calendar)
       if (salesState.selectedStudent) {
           if (typeof loadStudentOrders === 'function') {
             await loadStudentOrders(salesState.selectedStudent.id);
           }
           if (typeof renderStudentEnrollments === 'function') renderStudentEnrollments();
           if (typeof updateDaySchedule === 'function') updateDaySchedule();
           if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
       }
       
       if (paymentDetails) {
           return order; // Return order object for receipt generation
       }
       return order; // Always return order for further processing
     } else {
       let errorMsg = 'Failed to save order';
       if (!response) {
         errorMsg = 'Not signed in or session expired (401). Please log in again.';
         quotaPayClientLog('submitSalesOrder: fetch returned null (typical 401)', {
           paymentMethod: paymentDetails && paymentDetails.method
         });
       } else {
         try {
           const err = await response.json();
           errorMsg = err.error || errorMsg;
         } catch (e) {
           /* ignore */
         }
         quotaPayClientLog('submitSalesOrder: HTTP error', {
           status: response.status,
           errorMsg,
           paymentMethod: paymentDetails && paymentDetails.method
         });
       }

       if (window.showToast) window.showToast(errorMsg, 'error');
       else alert(errorMsg);
     }
  } catch (e) {
    console.error('Order Error:', e);
    if (window.showToast) window.showToast('Error processing order', 'error');
    else alert('Error processing order');
  } finally {
    if (activeBtn) {
       activeBtn.disabled = false;
     }
    // Pay / Save label must reflect cart (success path cleared cart; finally used to reset "Processing…")
    renderSalesCart();
  }
}

function orderProductKeys(order) {
  return new Set(
    (order.items || []).map((it) => `${it.productType}:${String(it.productData?.id ?? '')}`)
  );
}

/**
 * Merge cart into one existing order (same order id, enrollments use same orderId):
 * 1) If exactly one unpaid order and its lines cover all cart products → that order.
 * 2) Else if exactly one paid order covers all cart products → extend paid order (amountPaid kept; balance becomes due until paid).
 */
function resolveSalesMergeIntoOrderId(itemsToSubmit) {
  if (!itemsToSubmit || itemsToSubmit.length === 0) return undefined;
  const cartKeys = [
    ...new Set(itemsToSubmit.map((ci) => `${ci.productType}:${String(ci.productData?.id ?? '')}`))
  ];

  const unpaid = salesState.currentUnpaidOrders || [];
  const unpaidMatches = unpaid.filter((o) => {
    const keys = orderProductKeys(o);
    return keys.size > 0 && cartKeys.every((k) => keys.has(k));
  });
  if (unpaidMatches.length === 1) {
    orderPayDebug('resolveSalesMergeIntoOrderId → unpaid', {
      orderId: unpaidMatches[0].id,
      unpaidCount: unpaid.length
    });
    return unpaidMatches[0].id;
  }
  if (unpaidMatches.length > 1) {
    orderPayDebug('resolveSalesMergeIntoOrderId: multiple unpaid match cart keys, skip merge', {
      matchIds: unpaidMatches.map((o) => o.id)
    });
  }

  const paid = salesState.currentPaidOrdersForStudent || [];
  const candidates = paid.filter((o) => {
    if (o.status === 'cancelled' || o.status === 'refunded') return false;
    const keys = orderProductKeys(o);
    if (keys.size === 0) return false;
    return cartKeys.every((k) => keys.has(k));
  });
  if (candidates.length === 1) return candidates[0].id;
  return undefined;
}

