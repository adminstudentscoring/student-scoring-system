// Accounting Management Module

let accountingState = {
    orders: [],
    expenses: [],
    filter: 'all', // all, paid, unpaid
    subTab: 'orders' // orders, accounts, expenses, reports
};

window.loadAccountingModule = async function() {
    const container = document.getElementById('accountingSubTabContent');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-placeholder" style="padding:20px; text-align:center;">Loading accounting data...</div>';
    
    await Promise.all([loadOrders(), loadExpenses()]);
    renderAccountingUI();
};

async function loadOrders() {
    try {
        const response = await window.authUtils.authenticatedFetch('/organizations/orders');
        if (response.ok) {
            accountingState.orders = await response.json();
            // Sort desc date
            accountingState.orders.sort((a, b) => new Date(b.date) - new Date(a.date));
        }
    } catch (e) {
        console.error('Failed to load orders', e);
    }
}

async function loadExpenses() {
    try {
        const response = await window.authUtils.authenticatedFetch('/organizations/expenses');
        if (response.ok) {
            accountingState.expenses = await response.json();
            // Sort desc date
            accountingState.expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
        }
    } catch (e) {
        console.error('Failed to load expenses', e);
    }
}

function renderAccountingUI() {
    const container = document.getElementById('accountingSubTabContent');
    if (!container) return;
    
    // Calculate Overview Stats
    const totalRevenue = accountingState.orders
        .filter(o => o.status === 'paid')
        .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        
    const totalExpenses = accountingState.expenses
        .reduce((sum, e) => sum + (e.amount || 0), 0);
        
    const netIncome = totalRevenue - totalExpenses;
    const outstanding = accountingState.orders
        .filter(o => o.status === 'unpaid')
        .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    
    // Sub-tab navigation
    let navHtml = `
        <div class="accounting-header">
            <div class="stat-cards">
                <div class="stat-card">
                    <div class="stat-value">$${formatNumber(totalRevenue)}</div>
                    <div class="stat-label">Total Revenue</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: #ef4444;">$${formatNumber(totalExpenses)}</div>
                    <div class="stat-label">Total Expenses</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: ${netIncome >= 0 ? '#10b981' : '#ef4444'};">$${formatNumber(netIncome)}</div>
                    <div class="stat-label">Net Income</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: #f59e0b;">$${formatNumber(outstanding)}</div>
                    <div class="stat-label">Outstanding (Unpaid)</div>
                </div>
            </div>
        
            <div class="accounting-tabs" style="display:flex; gap:10px; margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:10px;">
                <button class="btn ${accountingState.subTab === 'orders' ? 'btn-primary' : 'btn-secondary'}" onclick="switchAccountingTab('orders')">Orders</button>
                <button class="btn ${accountingState.subTab === 'accounts' ? 'btn-primary' : 'btn-secondary'}" onclick="switchAccountingTab('accounts')">Student Accounts</button>
                <button class="btn ${accountingState.subTab === 'expenses' ? 'btn-primary' : 'btn-secondary'}" onclick="switchAccountingTab('expenses')">Expenses</button>
                <button class="btn ${accountingState.subTab === 'reports' ? 'btn-primary' : 'btn-secondary'}" onclick="switchAccountingTab('reports')">Reports</button>
            </div>
        </div>
        <div id="accountingTabContent"></div>
    `;
    
    container.innerHTML = navHtml;
    
    // Inject CSS
    if (!document.getElementById('accountingStyles')) {
        const style = document.createElement('style');
        style.id = 'accountingStyles';
        style.textContent = `
            .accounting-header { margin-bottom: 20px; }
            .stat-cards { display: flex; gap: 20px; margin-bottom: 20px; }
            .stat-card { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); flex: 1; text-align: center; border: 1px solid #eee; }
            .stat-value { font-size: 24px; font-weight: bold; color: #10b981; margin-bottom: 5px; }
            .stat-label { color: #666; font-size: 14px; }
            .filters { display: flex; gap: 10px; margin-bottom: 15px; }
            .data-table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
            .data-table th, .data-table td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #eee; }
            .data-table th { background: #f8f9fa; font-weight: 600; color: #555; }
            .status-badge { padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; display: inline-block; }
            .status-paid { background: #d1fae5; color: #065f46; }
            .status-unpaid { background: #fee2e2; color: #991b1b; }
        `;
        document.head.appendChild(style);
    }
    
    renderActiveTab();
}

function renderActiveTab() {
    const content = document.getElementById('accountingTabContent');
    if (accountingState.subTab === 'orders') {
        renderOrdersTab(content);
    } else if (accountingState.subTab === 'accounts') {
        renderAccountsTab(content);
    } else if (accountingState.subTab === 'expenses') {
        renderExpensesTab(content);
    } else if (accountingState.subTab === 'reports') {
        renderReportsTab(content);
    }
}

function printOrderReceipt(orderId) {
    const order = accountingState.orders.find(o => o.id === orderId);
    if (!order) return;
    
    // Check if sales module printReceipt exists
    if (typeof window.printReceipt === 'function') {
        // Find student for sales state context (required by printReceipt)
        if (window.salesState) {
            const student = (window.students || []).find(s => s.id === order.studentId);
            window.salesState.selectedStudent = student;
        }
        window.printReceipt(order);
    } else {
        alert('Receipt printing is available in Sales module. Please ensure Sales module is loaded.');
    }
}

function renderOrdersTab(container) {
    container.innerHTML = `
        <div class="filters">
            <button class="btn btn-sm ${accountingState.filter === 'all' ? 'btn-primary' : 'btn-secondary'}" onclick="filterOrders('all')">All</button>
            <button class="btn btn-sm ${accountingState.filter === 'paid' ? 'btn-primary' : 'btn-secondary'}" onclick="filterOrders('paid')">Paid</button>
            <button class="btn btn-sm ${accountingState.filter === 'unpaid' ? 'btn-primary' : 'btn-secondary'}" onclick="filterOrders('unpaid')">Unpaid</button>
        </div>
        
        <div class="orders-list">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Student</th>
                        <th>Items</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="ordersTableBody">
                    ${getOrdersRows()}
                </tbody>
            </table>
        </div>
    `;
}

function getOrdersRows() {
    let filtered = accountingState.orders;
    if (accountingState.filter !== 'all') {
        filtered = filtered.filter(o => o.status === accountingState.filter);
    }
    
    if (filtered.length === 0) return '<tr><td colspan="6" style="text-align:center; padding:20px;">No orders found</td></tr>';
    
    return filtered.map(order => {
        const student = (window.students || []).find(s => s.id === order.studentId);
        const studentName = student ? escapeHtml(student.name) : 'Unknown';
        const dateStr = new Date(order.date).toLocaleDateString();
        const itemsSummary = order.items.map(i => i.productData.name).join(', ');
        
        let actionHtml = '';
        if (order.status === 'unpaid') {
            actionHtml = `<button class="btn btn-sm btn-success" onclick="markOrderPaid('${order.id}')">Mark Paid</button>`;
            actionHtml += ` <button class="btn btn-sm btn-outline" onclick="printOrderReceipt('${order.id}')" title="Print Payment Reminder">Reminder</button>`;
        } else {
             actionHtml = `<button class="btn btn-sm btn-outline" onclick="printOrderReceipt('${order.id}')" title="Print Receipt">Receipt</button>`;
        }
        actionHtml += ` <button class="btn btn-sm btn-danger" onclick="deleteOrder('${order.id}')">Delete</button>`;
        
        return `
            <tr>
                <td>${dateStr}</td>
                <td>${studentName}</td>
                <td>${itemsSummary}</td>
                <td>$${formatNumber(order.totalAmount)}</td>
                <td><span class="status-badge status-${order.status}">${order.status}</span></td>
                <td>${actionHtml}</td>
            </tr>
        `;
    }).join('');
}

function renderAccountsTab(container) {
    const students = window.students || [];
    
    container.innerHTML = `
        <div class="accounting-header">
            <div class="search-filter">
                <input type="text" id="accountSearch" placeholder="Search students..." class="search-input" style="padding:8px; width:300px; border:1px solid #ccc; border-radius:4px;" oninput="renderAccountsRows()">
            </div>
        </div>
        
        <div class="accounts-list">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Student Name</th>
                        <th>chess.com ID</th>
                        <th>Current Balance</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="accountsTableBody">
                    ${getAccountsRows(students)}
                </tbody>
            </table>
        </div>
    `;
}

window.renderAccountsRows = function() {
    const search = document.getElementById('accountSearch').value.toLowerCase();
    const students = (window.students || []).filter(s => 
        s.name.toLowerCase().includes(search) || 
        String(s.chessComId || '').toLowerCase().includes(search)
    );
    document.getElementById('accountsTableBody').innerHTML = getAccountsRows(students);
};

function getAccountsRows(students) {
    if (students.length === 0) return '<tr><td colspan="4" style="text-align:center; padding:20px;">No students found</td></tr>';
    
    return students.map(s => `
        <tr>
            <td>${escapeHtml(s.name)}</td>
            <td>${escapeHtml(s.chessComId || '')}</td>
            <td style="font-weight:bold; color:${(s.balance || 0) >= 0 ? '#10b981' : '#ef4444'}">$${formatNumber(s.balance || 0)}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="openBalanceModal('${s.id}')">Adjust Balance</button>
            </td>
        </tr>
    `).join('');
}

function renderExpensesTab(container) {
    container.innerHTML = `
        <div class="accounting-header" style="display:flex; justify-content:flex-end;">
            <button class="btn btn-primary" onclick="openAddExpenseModal()">+ Add Expense</button>
        </div>
        
        <div class="expenses-list">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Item</th>
                        <th>Category</th>
                        <th>Amount</th>
                        <th>Note</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${getExpensesRows()}
                </tbody>
            </table>
        </div>
    `;
}

function getExpensesRows() {
    if (accountingState.expenses.length === 0) return '<tr><td colspan="6" style="text-align:center; padding:20px;">No expenses found</td></tr>';
    
    return accountingState.expenses.map(exp => `
        <tr>
            <td>${new Date(exp.date).toLocaleDateString()}</td>
            <td>${escapeHtml(exp.item)}</td>
            <td>${escapeHtml(exp.category)}</td>
            <td style="color:#ef4444;">-$${formatNumber(exp.amount)}</td>
            <td>${escapeHtml(exp.note)}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteExpense('${exp.id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

// Expense Modal
window.openAddExpenseModal = function() {
    let modal = document.getElementById('expenseModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'expenseModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>💸 Add Expense</h2>
                    <span class="modal-close" onclick="closeExpenseModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Date</label>
                        <input type="date" id="expDate" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div class="form-group">
                        <label>Item / Description</label>
                        <input type="text" id="expItem" placeholder="e.g. Office Rent">
                    </div>
                    <div class="form-group">
                        <label>Category</label>
                        <select id="expCategory">
                            <option value="Rent">Rent</option>
                            <option value="Salary">Salary</option>
                            <option value="Utilities">Utilities</option>
                            <option value="Equipment">Equipment</option>
                            <option value="Marketing">Marketing</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Amount ($)</label>
                        <input type="number" id="expAmount" min="0" step="0.01" placeholder="0.00">
                    </div>
                    <div class="form-group">
                        <label>Note (Optional)</label>
                        <input type="text" id="expNote">
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="closeExpenseModal()">Cancel</button>
                        <button class="btn btn-primary" onclick="submitExpense()">Save</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Reset form
    document.getElementById('expItem').value = '';
    document.getElementById('expAmount').value = '';
    document.getElementById('expNote').value = '';
    
    modal.classList.add('show');
};

window.closeExpenseModal = function() {
    document.getElementById('expenseModal')?.classList.remove('show');
};

window.submitExpense = async function() {
    const date = document.getElementById('expDate').value;
    const item = document.getElementById('expItem').value;
    const category = document.getElementById('expCategory').value;
    const amount = document.getElementById('expAmount').value;
    const note = document.getElementById('expNote').value;
    
    if (!item || !amount) {
        alert('Item and Amount are required');
        return;
    }
    
    try {
        const response = await window.authUtils.authenticatedFetch('/organizations/expenses', {
            method: 'POST',
            body: JSON.stringify({ date, item, category, amount, note })
        });
        
        if (response.ok) {
            const newExp = await response.json();
            accountingState.expenses.push(newExp);
            accountingState.expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
            alert('Expense added');
            closeExpenseModal();
            renderAccountingUI(); // Update dashboard and list
        } else {
            alert('Failed to add expense');
        }
    } catch (e) {
        console.error(e);
        alert('Error adding expense');
    }
};

window.deleteExpense = async function(id) {
    if (!confirm('Delete this expense?')) return;
    try {
        const response = await window.authUtils.authenticatedFetch(`/organizations/expenses/${id}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            accountingState.expenses = accountingState.expenses.filter(e => e.id !== id);
            renderAccountingUI();
            alert('Expense deleted');
        }
    } catch(e) { alert('Error deleting expense'); }
};

// Balance Modal (Keep existing)
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
