// Split from course-management-sales-orders.js — load quota + cash scripts first
window.confirmCheckout = async function() {
    const method = checkoutState.method;
    if (method === 'quota') {
        return window.confirmCheckoutWithQuota();
    }
    return window.confirmCheckoutWithCash();
};
