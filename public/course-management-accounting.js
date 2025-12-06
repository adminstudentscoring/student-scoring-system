// Accounting Management Module

let accountingState = {
    orders: [],
    filter: 'all', // all, paid, unpaid
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

window.filterOrders = function(filter) {
    accountingState.filter = filter;
    renderAccountingUI();
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
            renderAccountingUI();
            if (window.showToast) window.showToast('Order marked as paid', 'success');
            else alert('Order marked as paid');
        }
    } catch (e) {
        console.error(e);
        alert('Failed to update order');
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

