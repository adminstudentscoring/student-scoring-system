// Split from course-management-sales-orders-checkout-pay.js
async function confirmCheckoutWithCash() {
    const suffix = method.charAt(0).toUpperCase() + method.slice(1);
    const amountInput = document.getElementById(`pay${suffix}Amount`);
    const cashAmount = amountInput ? parseFloat(amountInput.value) || 0 : 0;
    
    // Recalculate Total
    let totalOrderAmount = 0;
    let itemsSource = [];
    if (checkoutState.mode === 'unpaid_orders') {
        const unpaidOrders = salesState.currentUnpaidOrders || [];
        checkoutState.selectedIndices.forEach(i => {
            if (unpaidOrders[i]) totalOrderAmount += salesOrderBalanceDue(unpaidOrders[i]);
        });
    } else if (checkoutState.mode === 'existing') {
        totalOrderAmount = checkoutState.existingOrder ? salesOrderBalanceDue(checkoutState.existingOrder) : 0;
    } else {
        salesState.cart.forEach((item, i) => {
            if (checkoutState.selectedIndices.has(i)) totalOrderAmount += item.price;
        });
    }

    // Balance Deduction Logic
    const student = salesState.selectedStudent;
    const studentBalance = student ? (student.balance || 0) : 0;
    let balanceDeduction = 0;
    if (checkoutState.useBalance) {
        balanceDeduction = Math.min(totalOrderAmount, studentBalance);
    }

    // 1. Deduct Balance (API)
    if (balanceDeduction > 0) {
        if (!confirm(`Confirm deduct $${formatNumber(balanceDeduction)} from balance?`)) return;
        
        try {
            console.debug('[checkout] balance deduction payload', {
                studentId: student?.id,
                amount: balanceDeduction,
                totalOrderAmount,
                studentBalance,
                mode: checkoutState.mode
            });
            const response = await window.authUtils.authenticatedFetch(`/organizations/students/${student.id}/balance`, {
                method: 'POST',
                body: JSON.stringify({
                    type: 'debit',
                    amount: balanceDeduction,
                    remark: `Payment for Order (Checkout)` 
                })
            });
            if (!response.ok) {
                console.error('[checkout] balance deduction failed', response.status, response.statusText);
                alert('Failed to deduct balance. Payment aborted.');
                return;
            }
            // Update local balance
            const resData = await response.json();
            if (resData.balance !== undefined) student.balance = resData.balance;
        } catch (e) {
            console.error(e);
            alert('Error deducting balance');
            return;
        }
    }

    const remarkInput = document.getElementById(`pay${suffix}Remark`)?.value || '';
    let finalRemark = remarkInput;
    if (balanceDeduction > 0) {
        finalRemark += ` (Paid $${balanceDeduction} via Balance)`;
    }

    const paymentDetails = {
        method: method,
        amount: cashAmount,
        balanceUsed: balanceDeduction, // New Field
        remark: finalRemark,
        reference: document.getElementById(`pay${suffix}Ref`)?.value || '',
        bank: document.getElementById(`pay${suffix}Bank`)?.value || ''
    };
    
    // Determine General Status (for Single/New orders)
    const isPaidGeneral = (cashAmount + balanceDeduction) > 0 || totalOrderAmount === 0;
    const statusGeneral = isPaidGeneral ? 'paid' : 'unpaid';

    // Handle Existing Order Payment (Single)
    if (checkoutState.mode === 'existing' && checkoutState.orderId) {
        try {
            const updatePayload = {
                status: statusGeneral,
                paymentDetails: paymentDetails
            };
            
            const response = await window.authUtils.authenticatedFetch(`/organizations/orders/${checkoutState.orderId}/status`, {
                method: 'PATCH',
                body: JSON.stringify(updatePayload)
            });
            
            if (response.ok) {
                const updatedOrder = await response.json();
                if (window.showToast) window.showToast('Payment successful!', 'success');
                else alert('Payment successful!');
                
                closeCheckoutModal();
                if (typeof printReceipt === 'function') printReceipt(updatedOrder);
                
                if (salesState.selectedStudent) {
                    loadStudentOrders(salesState.selectedStudent.id);
                }
            } else {
                alert('Failed to update order');
            }
        } catch (e) {
            console.error(e);
            alert('Error processing payment');
        }
        return;
    }

    // Handle Unpaid Orders (Multiple)
    if (checkoutState.mode === 'unpaid_orders') {
        const selectedIndices = Array.from(checkoutState.selectedIndices);
        if (selectedIndices.length === 0) {
            alert('No orders selected');
            return;
        }

        const unpaidOrders = salesState.currentUnpaidOrders || [];
        const ordersToPay = selectedIndices.map(i => unpaidOrders[i]).filter(Boolean);
        
        if (ordersToPay.length === 0) return;
        
        const payBtn = document.getElementById('checkoutPayBtn');
        const originalText = payBtn ? payBtn.textContent : 'Pay';
        if (payBtn) {
            payBtn.textContent = 'Processing...';
            payBtn.disabled = true;
        }

        let successCount = 0;
        let updatedOrders = [];
        
        // Distribution state
        let remainingBal = balanceDeduction;
        let remainingCash = cashAmount;

        try {
            for (const order of ordersToPay) {
                const thisOrderDue = salesOrderBalanceDue(order);
                
                const thisOrderBal = Math.min(thisOrderDue, remainingBal);
                remainingBal -= thisOrderBal;
                
                const needed = thisOrderDue - thisOrderBal;
                const thisOrderCash = Math.min(needed, remainingCash);
                if (remainingCash > thisOrderCash) {
                    remainingCash -= thisOrderCash;
                } else {
                    remainingCash = 0;
                }

                const covered = thisOrderBal + thisOrderCash;
                const thisStatus =
                  thisOrderDue < 0.005 || covered + 0.005 >= thisOrderDue ? 'paid' : 'unpaid';
                
                const orderPaymentDetails = {
                    ...paymentDetails,
                    amount: thisOrderCash,
                    balanceUsed: thisOrderBal,
                    // If balance was used, ensure remark reflects it if not global?
                    // We set global remark already.
                };

                const response = await window.authUtils.authenticatedFetch(`/organizations/orders/${order.id}/status`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        status: thisStatus,
                        paymentDetails: orderPaymentDetails
                    })
                });
                
                if (response.ok) {
                    successCount++;
                    const updatedOrder = await response.json();
                    updatedOrders.push(updatedOrder);
                }
            }

            if (successCount > 0) {
                if (window.showToast) window.showToast(`Processed ${successCount} orders`, 'success');
                else alert(`Processed ${successCount} orders`);
                
                closeCheckoutModal();
                
                if (updatedOrders.length > 0 && typeof printReceipt === 'function') {
                    printReceipt(updatedOrders);
                }

                if (salesState.selectedStudent) {
                    loadStudentOrders(salesState.selectedStudent.id);
                }
            } else {
                alert('Failed to process orders');
            }
        } catch (e) {
            console.error(e);
            alert('Error processing payments');
        } finally {
            if (payBtn) {
                 payBtn.textContent = originalText;
                 payBtn.disabled = false;
            }
        }
        return;
    }
    
    // Handle New Order (Cart)
    const selectedItems = salesState.cart.filter((_, i) => checkoutState.selectedIndices.has(i));
    if (selectedItems.length === 0) {
        alert('No items selected');
        return;
    }
    
    // Call API
    const order = await submitSalesOrder(statusGeneral, selectedItems, paymentDetails);
    
    if (order) {
       closeCheckoutModal();
       if (typeof printReceipt === 'function') printReceipt(order);
       
       if (salesState.cart.length === 0) {
           const selectAll = document.getElementById('checkoutSelectAll');
           if (selectAll) selectAll.checked = false;
       }
       
       if (salesState.selectedStudent) {
           loadStudentOrders(salesState.selectedStudent.id);
       }
    }
}

window.confirmCheckoutWithCash = confirmCheckoutWithCash;
