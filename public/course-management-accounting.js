// Accounting Management Module

let accountingState = {
    orders: [],
    filter: 'all', // all, paid, unpaid
    subTab: 'orders' // orders, accounts, expenses, reports
};

window.loadAccountingModule = async function() {
    const container = document.getElementById('accountingSubTabContent');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-placeholder" style="padding:20px; text-align:center;">Loading accounting data...</div>';
    
    await loadOrders();
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

function renderAccountingUI() {
    const container = document.getElementById('accountingSubTabContent');
    if (!container) return;
    
    // Sub-tab navigation
    let navHtml = `
        <div class="accounting-tabs" style="display:flex; gap:10px; margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:10px;">
            <button class="btn ${accountingState.subTab === 'orders' ? 'btn-primary' : 'btn-secondary'}" onclick="switchAccountingTab('orders')">Orders</button>
            <button class="btn ${accountingState.subTab === 'accounts' ? 'btn-primary' : 'btn-secondary'}" onclick="switchAccountingTab('accounts')">Student Accounts</button>
            <button class="btn ${accountingState.subTab === 'expenses' ? 'btn-primary' : 'btn-secondary'}" onclick="switchAccountingTab('expenses')">Expenses</button>
            <button class="btn ${accountingState.subTab === 'reports' ? 'btn-primary' : 'btn-secondary'}" onclick="switchAccountingTab('reports')">Reports</button>
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
    } else {
        const titleMap = { 'accounts': 'Student Accounts', 'expenses': 'Expenses', 'reports': 'Reports' };
        content.innerHTML = `<div style="padding:40px; text-align:center; color:#666;"><h3>${titleMap[accountingState.subTab]}</h3><p>Coming soon...</p></div>`;
    }
}

function renderOrdersTab(container) {
    const totalRevenue = accountingState.orders
        .filter(o => o.status === 'paid')
        .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        
    const outstanding = accountingState.orders
        .filter(o => o.status === 'unpaid')
        .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    container.innerHTML = `
        <div class="accounting-header">
            <div class="stat-cards">
                <div class="stat-card">
                    <div class="stat-value">$${formatNumber(totalRevenue)}</div>
                    <div class="stat-label">Total Revenue (Paid)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: #ef4444;">$${formatNumber(outstanding)}</div>
                    <div class="stat-label">Outstanding (Unpaid)</div>
                </div>
            </div>
            
            <div class="filters">
                <button class="btn btn-sm ${accountingState.filter === 'all' ? 'btn-primary' : 'btn-secondary'}" onclick="filterOrders('all')">All</button>
                <button class="btn btn-sm ${accountingState.filter === 'paid' ? 'btn-primary' : 'btn-secondary'}" onclick="filterOrders('paid')">Paid</button>
                <button class="btn btn-sm ${accountingState.filter === 'unpaid' ? 'btn-primary' : 'btn-secondary'}" onclick="filterOrders('unpaid')">Unpaid</button>
            </div>
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
                <tbody>
                    ${renderOrdersRows()}
                </tbody>
            </table>
        </div>
    `;
}

function renderOrdersRows() {
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

window.switchAccountingTab = function(tab) {
    accountingState.subTab = tab;
    renderAccountingUI();
};

window.filterOrders = function(filter) {
    accountingState.filter = filter;
    renderActiveTab();
};

window.markOrderPaid = async function(orderId) {
    if (!confirm('Mark this order as Paid?')) return;
    
    try {
        const response = await window.authUtils.authenticatedFetch(`/organizations/orders/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'paid' })
        });
        
        if (response.ok) {
            // Update local state
            const order = accountingState.orders.find(o => o.id === orderId);
            if (order) order.status = 'paid';
            renderActiveTab();
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
            // Update local state
            accountingState.orders = accountingState.orders.filter(o => o.id !== orderId);
            renderActiveTab();
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
