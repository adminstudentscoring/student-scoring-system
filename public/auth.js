/**
 * Authentication utilities for frontend
 */

function buildApiUrl(url) {
    const u = String(url || '');
    // Always use absolute path so the browser never treats "api" as a hostname (e.g. https://api/...).
    // Accept callers passing:
    // - "/students"  -> "/api/students"
    // - "students"   -> "/api/students"
    // - "/api/..."   -> "/api/..."
    if (u.startsWith('/api/')) return u;
    if (u === '/api') return '/api';
    if (u.startsWith('/')) return `/api${u}`;
    return `/api/${u}`;
}

/**
 * Get authentication token from localStorage
 */
function getAuthToken() {
    return localStorage.getItem('authToken');
}

/**
 * Get current user from localStorage
 */
function getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
}

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
    return !!getAuthToken();
}

/**
 * Check if user has specific role
 */
function hasRole(role) {
    const user = getCurrentUser();
    return user && user.role === role;
}

/**
 * Logout user
 */
function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

/**
 * Make authenticated API request
 */
async function authenticatedFetch(url, options = {}) {
    const token = getAuthToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(buildApiUrl(url), {
        ...options,
        headers
    });
    
    if (response.status === 401) {
        logout();
        return null;
    }
    
    return response;
}

/**
 * Verify token and get current user info
 */
async function verifyAuth() {
    try {
        const response = await authenticatedFetch('/auth/me');
        if (!response) return null;
        
        if (!response.ok) {
            logout();
            return null;
        }
        
        const user = await response.json();
        localStorage.setItem('user', JSON.stringify(user));
        return user;
    } catch (error) {
        console.error('Auth verification failed:', error);
        logout();
        return null;
    }
}

/**
 * Require authentication - redirect to login if not authenticated
 */
function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = '/login.html';
        return false;
    }
    return true;
}

/**
 * Require specific role - redirect if user doesn't have role
 */
function requireRole(role) {
    if (!requireAuth()) return false;
    
    if (!hasRole(role)) {
        alert('You do not have permission to access this page');
        window.location.href = '/login.html';
        return false;
    }
    
    return true;
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.authUtils = {
        getAuthToken,
        getCurrentUser,
        isAuthenticated,
        hasRole,
        logout,
        authenticatedFetch,
        verifyAuth,
        requireAuth,
        requireRole
    };
}

