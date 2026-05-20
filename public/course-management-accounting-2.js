window.openBalanceModal = function(studentId) {
    const student = window.students.find(s => s.id === studentId);
    if (!student) return;
    
    let modal = document.getElementById('balanceModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'balanceModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>💰 Adjust Balance</h2>
                    <span class="modal-close" onclick="closeBalanceModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <h3 id="balStudentName"></h3>
                    <div class="form-group">
                        <label>Current Balance: <span id="balCurrent" style="font-weight:bold;"></span></label>
                    </div>
                    <div class="form-group">
                        <label>Action</label>
                        <div style="display:flex; gap:10px;">
                            <label><input type="radio" name="balType" value="credit" checked> Add Credit (Top-up)</label>
                            <label><input type="radio" name="balType" value="debit"> Deduct (Charge)</label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Amount ($)</label>
                        <input type="number" id="balAmount" min="0" step="0.01" placeholder="0.00">
                    </div>
                    <div class="form-group">
                        <label>Note / Reason</label>
                        <input type="text" id="balNote" placeholder="e.g. Cash payment, Refund, Correction">
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="closeBalanceModal()">Cancel</button>
                        <button class="btn btn-primary" onclick="submitBalanceAdjustment()">Confirm</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    modal.dataset.studentId = studentId;
    document.getElementById('balStudentName').textContent = student.name;
    document.getElementById('balCurrent').textContent = `$${formatNumber(student.balance || 0)}`;
    document.getElementById('balAmount').value = '';
    document.getElementById('balNote').value = '';
    
    modal.classList.add('show');
};

window.closeBalanceModal = function() {
    document.getElementById('balanceModal').classList.remove('show');
};

window.submitBalanceAdjustment = async function() {
    const modal = document.getElementById('balanceModal');
    const studentId = modal.dataset.studentId;
    const amount = document.getElementById('balAmount').value;
    const type = document.querySelector('input[name="balType"]:checked').value;
    const note = document.getElementById('balNote').value;
    
    if (!amount || amount <= 0) {
        alert('Please enter a valid amount');
        return;
    }
    
    try {
        const response = await window.authUtils.authenticatedFetch(`/organizations/students/${studentId}/balance`, {
            method: 'POST',
            body: JSON.stringify({ amount, type, note })
        });
        
        if (response.ok) {
            const result = await response.json();
            alert('Balance updated');
            closeBalanceModal();
            
            const student = window.students.find(s => s.id === studentId);
            if (student) student.balance = result.balance;
            
            renderActiveTab(); 
        } else {
            alert('Failed to update balance');
        }
    } catch (e) {
        console.error(e);
        alert('Error updating balance');
    }
};

window.switchAccountingTab = function(tab) {
    accountingState.subTab = tab;
    renderAccountingUI();
};

window.filterOrders = function(filter) {
    accountingState.filter = filter;
    document.getElementById('ordersTableBody').innerHTML = getOrdersRows();
};

window.markOrderPaid = async function(orderId) {
    if (!confirm('Mark this order as Paid?')) return;
    
    try {
        const response = await window.authUtils.authenticatedFetch(`/organizations/orders/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'paid' })
        });
        
        if (response.ok) {
            const order = accountingState.orders.find(o => o.id === orderId);
            if (order) order.status = 'paid';
            renderAccountingUI();
            if (window.showToast) window.showToast('Order marked as paid', 'success');
            else alert('Order marked as paid');
        }
    } catch (e) {
        console.error(e);
        alert('Failed to update order');
    }
};

window.deleteOrder = async function(orderId) {
    if (!confirm('Are you sure you want to delete this order?')) return;
    
    try {
        const response = await window.authUtils.authenticatedFetch(`/organizations/orders/${orderId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            accountingState.orders = accountingState.orders.filter(o => o.id !== orderId);
            renderAccountingUI();
            if (window.showToast) window.showToast('Order deleted', 'success');
            else alert('Order deleted');
        } else {
            throw new Error('Failed to delete');
        }
    } catch (e) {
        console.error(e);
        alert('Failed to delete order');
    }
};

function formatNumber(num) {
    return parseFloat(num).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Reports Logic
function renderReportsTab(container) {
    const monthlyStats = calculateMonthlyStats();
    const productStats = calculateProductStats();
    
    container.innerHTML = `
        <div class="reports-container" style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <!-- Monthly Financials -->
            <div class="report-card" style="background:white; padding:20px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h3 style="margin:0;">📅 Monthly Financials</h3>
                    <button class="btn btn-sm btn-secondary" onclick="downloadMonthlyReport()">Export CSV</button>
                </div>
                <div style="max-height:300px; overflow-y:auto;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Month</th>
                                <th>Revenue</th>
                                <th>Expenses</th>
                                <th>Net</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${monthlyStats.map(s => `
                                <tr>
                                    <td>${s.month}</td>
                                    <td style="color:#10b981;">+$${formatNumber(s.revenue)}</td>
                                    <td style="color:#ef4444;">-$${formatNumber(s.expenses)}</td>
                                    <td style="font-weight:bold; color:${s.net >= 0 ? '#10b981' : '#ef4444'}">$${formatNumber(s.net)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Product Performance -->
            <div class="report-card" style="background:white; padding:20px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h3 style="margin:0;">🏆 Sales Performance</h3>
                    <button class="btn btn-sm btn-secondary" onclick="downloadProductReport()">Export CSV</button>
                </div>
                <div style="max-height:300px; overflow-y:auto;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Type</th>
                                <th>Sold</th>
                                <th>Revenue</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${productStats.map(p => `
                                <tr>
                                    <td>${escapeHtml(p.name)}</td>
                                    <td><span class="status-badge" style="background:#f3f4f6; color:#666;">${p.type}</span></td>
                                    <td>${p.count}</td>
                                    <td>$${formatNumber(p.revenue)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function calculateMonthlyStats() {
    const stats = {};
    
    accountingState.orders.forEach(order => {
        if (order.status !== 'paid') return;
        const date = new Date(order.date);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!stats[key]) stats[key] = { revenue: 0, expenses: 0 };
        stats[key].revenue += order.totalAmount;
    });
    
    accountingState.expenses.forEach(exp => {
        const date = new Date(exp.date);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!stats[key]) stats[key] = { revenue: 0, expenses: 0 };
        stats[key].expenses += exp.amount;
    });
    
    return Object.keys(stats).sort().reverse().map(key => ({
        month: key,
        revenue: stats[key].revenue,
        expenses: stats[key].expenses,
        net: stats[key].revenue - stats[key].expenses
    }));
}

function calculateProductStats() {
    const products = {};
    
    accountingState.orders.forEach(order => {
        if (order.status !== 'paid') return;
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
                const name = item.productData ? item.productData.name : 'Unknown Product';
                const type = item.productType || 'course';
                if (!products[name]) products[name] = { name, type, count: 0, revenue: 0 };
                products[name].count += 1;
                products[name].revenue += item.price || 0;
            });
        }
    });
    
    return Object.values(products).sort((a, b) => b.revenue - a.revenue);
}

window.downloadMonthlyReport = function() {
    const stats = calculateMonthlyStats();
    let csv = '\uFEFFMonth,Revenue,Expenses,Net Income\n';
    stats.forEach(s => {
        csv += `${s.month},${s.revenue},${s.expenses},${s.net}\n`;
    });
    downloadCSVFile(csv, 'monthly_financials.csv');
};

window.downloadProductReport = function() {
    const stats = calculateProductStats();
    let csv = '\uFEFFProduct,Type,Sold,Revenue\n';
    stats.forEach(s => {
        csv += `"${s.name}",${s.type},${s.count},${s.revenue}\n`;
    });
    downloadCSVFile(csv, 'product_performance.csv');
};

function downloadCSVFile(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}
