// Split from course-management-sales-orders-checkout-pay.js
async function confirmCheckoutWithQuota() {
        if (checkoutState.mode === 'existing' && checkoutState.orderId && checkoutState.existingOrder) {
            await refreshSelectedSalesStudentFromApi();
            const student = salesState.selectedStudent;
            if (!student) {
                alert('No student selected');
                return;
            }
            const ord = checkoutState.existingOrder;
            const due = salesOrderBalanceDue(ord);
            const can =
                typeof window.salesOrderCanPayRemainingWithLessonQuota === 'function' &&
                window.salesOrderCanPayRemainingWithLessonQuota(student, ord);
            orderPayDebug('confirmCheckout quota existing', {
                orderId: checkoutState.orderId,
                due,
                can,
                synthPreview:
                    typeof window.salesBuildQuotaItemsForOrderBalance === 'function'
                        ? window.salesBuildQuotaItemsForOrderBalance(ord, due).map((it) => ({
                              price: it.price,
                              lessons: (it.enrolledClasses || []).length
                          }))
                        : []
            });
            if (!can) {
                quotaPayClientLog('existing quota: precheck failed after refresh', {
                    lessonQuotaByCents: student.lessonQuotaByCents,
                    due
                });
                alert(
                    'Not enough lesson quota for this remaining balance (refreshed from server). If a previous attempt used credits without marking the order paid, check [QuotaPay] logs or pay with cash.'
                );
                return;
            }
            if (!confirm('Apply lesson quota credits to settle the remaining balance on this order?')) return;
            const paymentDetails = {
                method: 'lesson_quota',
                amount: 0,
                balanceUsed: 0,
                remark: 'Paid remaining balance with lesson quota'
            };
            try {
                quotaPayClientLog('PATCH lesson_quota (existing order)', {
                    orderId: checkoutState.orderId,
                    due,
                    paymentDetails
                });
                const response = await window.authUtils.authenticatedFetch(
                    `/organizations/orders/${checkoutState.orderId}/status`,
                    {
                        method: 'PATCH',
                        body: JSON.stringify({ status: 'paid', paymentDetails })
                    }
                );
                if (!response) {
                    quotaPayClientLog('PATCH lesson_quota: response null (401?)');
                    alert('Not signed in or session expired. Please log in again.');
                    return;
                }
                if (response.ok) {
                    const updatedOrder = await response.json();
                    orderPayDebug('PATCH lesson_quota existing OK', {
                        orderId: updatedOrder.id,
                        amountPaid: updatedOrder.amountPaid,
                        status: updatedOrder.status
                    });
                    if (window.showToast) window.showToast('Payment successful!', 'success');
                    else alert('Payment successful!');
                    closeCheckoutModal();
                    if (typeof printReceipt === 'function') printReceipt(updatedOrder);
                    try {
                        const sr = await window.authUtils.authenticatedFetch('/students');
                        if (sr && sr.ok) {
                            const data = await sr.json();
                            const list = Array.isArray(data) ? data : data.students || [];
                            window.students = list;
                            if (salesState.selectedStudent) {
                                const sid = salesState.selectedStudent.id;
                                const updated = list.find((s) => String(s.id) === String(sid));
                                if (updated) salesState.selectedStudent = updated;
                            }
                        }
                    } catch (err) {
                        console.error('Failed to refresh students after quota PATCH', err);
                    }
                    if (salesState.selectedStudent && typeof window.selectSalesStudent === 'function') {
                        await window.selectSalesStudent(salesState.selectedStudent.id);
                    }
                    if (salesState.selectedStudent && typeof loadStudentOrders === 'function') {
                        await loadStudentOrders(salesState.selectedStudent.id);
                    }
                    if (typeof renderStudentEnrollments === 'function') renderStudentEnrollments();
                    if (typeof updateDaySchedule === 'function') updateDaySchedule();
                    if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
                } else {
                    let msg = 'Failed to update order';
                    try {
                        const err = await response.json();
                        msg = err.error || msg;
                    } catch (e) {
                        /* ignore */
                    }
                    orderPayDebug('PATCH lesson_quota existing failed', { status: response.status, msg });
                    quotaPayClientLog('PATCH lesson_quota failed', { httpStatus: response.status, msg });
                    alert(msg);
                }
            } catch (e) {
                console.error(e);
                alert('Error processing quota payment');
            }
            return;
        }
        if (checkoutState.mode === 'unpaid_orders') {
            await refreshSelectedSalesStudentFromApi();
            const selectedIndices = Array.from(checkoutState.selectedIndices);
            if (selectedIndices.length === 0) {
                alert('No orders selected');
                return;
            }
            const unpaidOrders = salesState.currentUnpaidOrders || [];
            const ordersToPay = selectedIndices.map((i) => unpaidOrders[i]).filter(Boolean);
            if (ordersToPay.length === 0) return;
            const student = salesState.selectedStudent;
            if (!student) {
                alert('No student selected');
                return;
            }
            for (const ord of ordersToPay) {
                const can =
                    typeof window.salesOrderCanPayRemainingWithLessonQuota === 'function' &&
                    window.salesOrderCanPayRemainingWithLessonQuota(student, ord);
                quotaPayClientLog('unpaid_orders quota precheck', {
                    orderId: ord.id,
                    due: salesOrderBalanceDue(ord),
                    canPayWithQuota: can
                });
                if (!can) {
                    quotaPayClientLog('unpaid_orders quota: precheck failed after refresh', {
                        orderId: ord.id,
                        due: salesOrderBalanceDue(ord),
                        lessonQuotaByCents: student.lessonQuotaByCents
                    });
                    alert(
                        'Not enough lesson quota for at least one selected order. If you already confirmed quota once, credits may have been deducted while the order stayed unpaid — check [QuotaPay] logs or run await debugDumpOrgOrders(). You can pay the remainder with cash/FPS or restore quota via admin.'
                    );
                    return;
                }
            }
            if (!confirm(`Apply lesson quota to settle ${ordersToPay.length} unpaid order(s)?`)) return;
            const payBtn = document.getElementById('checkoutPayBtn');
            if (payBtn) {
                payBtn.textContent = 'Processing...';
                payBtn.disabled = true;
            }
            let okCount = 0;
            const errors = [];
            try {
                for (const ord of ordersToPay) {
                    const due = salesOrderBalanceDue(ord);
                    const paymentDetails = {
                        method: 'lesson_quota',
                        amount: 0,
                        balanceUsed: 0,
                        remark: 'Paid with lesson quota (Pay Unpaid checkout)'
                    };
                    quotaPayClientLog('PATCH lesson_quota unpaid_orders batch', {
                        orderId: ord.id,
                        due
                    });
                    const response = await window.authUtils.authenticatedFetch(
                        `/organizations/orders/${ord.id}/status`,
                        {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'paid', paymentDetails })
                        }
                    );
                    if (!response) {
                        errors.push({ id: ord.id, msg: 'no response (401?)' });
                        break;
                    }
                    if (response.ok) {
                        okCount += 1;
                    } else {
                        let msg = 'failed';
                        try {
                            const e = await response.json();
                            msg = e.error || msg;
                        } catch (_) {
                            /* ignore */
                        }
                        errors.push({ id: ord.id, httpStatus: response.status, msg });
                    }
                }
            } catch (e) {
                quotaPayClientLog('unpaid_orders quota exception', { error: String(e) });
                alert('Error processing quota payment');
            } finally {
                if (payBtn) {
                    payBtn.disabled = false;
                    payBtn.textContent = 'Confirm lesson quota payment';
                }
            }
            if (errors.length) {
                quotaPayClientLog('unpaid_orders quota finished with errors', { okCount, errors });
                alert(
                    `Completed ${okCount} of ${ordersToPay.length} order(s). ${errors.map((e) => `${e.id}: ${e.msg || e.httpStatus}`).join('; ')}`
                );
            } else if (okCount > 0) {
                if (window.showToast) window.showToast(`Paid ${okCount} order(s) with lesson quota`, 'success');
                else alert(`Paid ${okCount} order(s) with lesson quota`);
                closeCheckoutModal();
            }
            try {
                const sr = await window.authUtils.authenticatedFetch('/students');
                if (sr && sr.ok) {
                    const data = await sr.json();
                    const list = Array.isArray(data) ? data : data.students || [];
                    window.students = list;
                    if (salesState.selectedStudent) {
                        const sid = salesState.selectedStudent.id;
                        const updated = list.find((s) => String(s.id) === String(sid));
                        if (updated) salesState.selectedStudent = updated;
                    }
                }
            } catch (err) {
                console.error('Failed to refresh students after unpaid_orders quota', err);
            }
            if (salesState.selectedStudent && typeof window.selectSalesStudent === 'function') {
                await window.selectSalesStudent(salesState.selectedStudent.id);
            }
            if (salesState.selectedStudent && typeof loadStudentOrders === 'function') {
                await loadStudentOrders(salesState.selectedStudent.id);
            }
            if (typeof renderStudentEnrollments === 'function') renderStudentEnrollments();
            if (typeof updateDaySchedule === 'function') updateDaySchedule();
            if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
            return;
        }
        if (checkoutState.mode !== 'new') {
            alert(
                'Lesson quota is available for the cart, Pay Unpaid (when quota covers all selected orders), or the small Pay button on one order.'
            );
            return;
        }
        await refreshSelectedSalesStudentFromApi();
        const student = salesState.selectedStudent;
        if (!student) {
            alert('No student selected');
            return;
        }
        const selectedItems = salesState.cart.filter((_, i) => checkoutState.selectedIndices.has(i));
        if (selectedItems.length === 0) {
            alert('No items selected');
            return;
        }
        if (
            typeof window.salesCartCanFullyPayWithLessonQuota !== 'function' ||
            !window.salesCartCanFullyPayWithLessonQuota(student, selectedItems)
        ) {
            quotaPayClientLog('cart quota: precheck failed after API refresh', {
                lessonQuotaByCents: student.lessonQuotaByCents,
                lines: selectedItems.map((it) => ({
                    price: it.price,
                    n: (it.enrolledClasses || []).length
                }))
            });
            alert(
                'Not enough lesson quota at the required per-lesson price tiers for this cart. If you already tried paying, credits may have been used — check the student card quota line or server logs [QuotaPay].'
            );
            return;
        }
        if (!confirm('Apply lesson quota credits for this order?')) return;

        const paymentDetails = {
            method: 'lesson_quota',
            amount: 0,
            balanceUsed: 0,
            remark: 'Paid with lesson quota'
        };

        quotaPayClientLog('confirmCheckout: cart lesson_quota → submitSalesOrder', {
            selectedLineCount: selectedItems.length,
            studentId: student.id,
            precheckOk: true
        });
        const order = await submitSalesOrder('paid', selectedItems, paymentDetails);
        if (!order) {
            quotaPayClientLog(
                'confirmCheckout: submitSalesOrder returned no order — see Network tab + terminal [QuotaPay]'
            );
        }
        if (order) {
            closeCheckoutModal();
            if (typeof printReceipt === 'function') printReceipt(order);
            if (typeof window.refreshSalesTimetableFromApi === 'function') {
                await window.refreshSalesTimetableFromApi();
            }
            if (salesState.selectedStudent && typeof loadStudentOrders === 'function') {
                await loadStudentOrders(salesState.selectedStudent.id);
            }
            if (typeof renderStudentEnrollments === 'function') renderStudentEnrollments();
            if (typeof updateDaySchedule === 'function') updateDaySchedule();
            if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
        }
        return;
}

window.confirmCheckoutWithQuota = confirmCheckoutWithQuota;
