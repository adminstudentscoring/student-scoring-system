// ==================== Course Package Management ====================

// Package state
let packages = [];
let packageCurrentSort = { field: 'createdAt', direction: 'desc' };
let packageCurrentSearch = '';
let packageStatusFilter = 'all';
let packageValidityFilter = 'all';
let expandedPackageIds = new Set();

// Load packages from API
async function loadPackages() {
  try {
    // Ensure courses are loaded first (needed for price calculations)
    if (!window.courses || window.courses.length === 0) {
      await loadCourses();
    }
    
    const response = await window.authUtils.authenticatedFetch('/organizations/packages');
    if (!response) return;
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to load packages');
    }
    
    packages = await response.json();
    
    // Check for expired packages and update status
    const now = new Date();
    packages.forEach(pkg => {
      if (pkg.status === 'active' && pkg.endDate) {
        const endDate = new Date(pkg.endDate);
        if (endDate < now) {
          pkg.status = 'inactive';
        }
      }
    });
    
    renderPackages();
  } catch (error) {
    console.error('Error loading packages:', error);
    showToast('Failed to load packages. Please try again.', 'error');
    renderPackagesError();
  }
}

// Render packages list
function renderPackages() {
  const container = document.getElementById('packagesListContainer');
  if (!container) return;
  
  // Filter packages
  let filteredPackages = packages.filter(pkg => {
    // Search filter
    if (packageCurrentSearch && !pkg.name.toLowerCase().includes(packageCurrentSearch)) {
      return false;
    }
    
    // Status filter
    if (packageStatusFilter !== 'all' && pkg.status !== packageStatusFilter) {
      return false;
    }
    
    // Validity filter
    if (packageValidityFilter !== 'all') {
      const now = new Date();
      if (packageValidityFilter === 'valid') {
        if (!pkg.startDate || !pkg.endDate) return false;
        const start = new Date(pkg.startDate);
        const end = new Date(pkg.endDate);
        if (start > now || end < now) return false;
      } else if (packageValidityFilter === 'expired') {
        if (!pkg.endDate) return false;
        const end = new Date(pkg.endDate);
        if (end >= now) return false;
      } else if (packageValidityFilter === 'no-expiry') {
        if (pkg.startDate || pkg.endDate) return false;
      }
    }
    
    return true;
  });
  
  // Sort packages
  filteredPackages.sort((a, b) => {
    let aVal, bVal;
    
    switch (packageCurrentSort.field) {
      case 'name':
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
        break;
      case 'price':
        aVal = getPackagePrice(a);
        bVal = getPackagePrice(b);
        break;
      case 'createdAt':
      default:
        aVal = new Date(a.createdAt);
        bVal = new Date(b.createdAt);
        break;
    }
    
    if (aVal < bVal) return packageCurrentSort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return packageCurrentSort.direction === 'asc' ? 1 : -1;
    return 0;
  });
  
  // Empty state
  if (filteredPackages.length === 0) {
    if (packageCurrentSearch || packageStatusFilter !== 'all' || packageValidityFilter !== 'all') {
      container.innerHTML = '<p>No packages found matching your criteria.</p>';
    } else {
      container.innerHTML = '<p>No packages yet. Click \'Create\' to add your first package.</p>';
    }
    return;
  }
  
  // Render table
  let html = `
    <table class="courses-table">
      <thead>
        <tr>
          <th style="width: 200px;">Package Name</th>
          <th style="width: 200px;">Included Courses</th>
          <th style="width: 120px;">Original Price</th>
          <th style="width: 120px;">Package Price</th>
          <th style="width: 100px;">Discount</th>
          <th style="width: 120px;">Status</th>
          <th style="width: 120px;">Validity</th>
          <th style="width: 100px;">Actions</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  filteredPackages.forEach(pkg => {
    const originalPrice = calculateOriginalPrice(pkg);
    const packagePrice = getPackagePrice(pkg);
    const discount = originalPrice - packagePrice;
    const discountPercent = originalPrice > 0 ? ((discount / originalPrice) * 100).toFixed(1) : 0;
    const isExpanded = expandedPackageIds.has(pkg.id);
    const validityStatus = getValidityStatus(pkg);
    const hasDeletedCourse = checkHasDeletedCourse(pkg);
    
    const isMonthly = pkg.priceStrategy === 'monthly';
    const packagePriceDisplay = isMonthly 
        ? `$${formatNumber(pkg.monthlyLessonPrice)}/lesson (${pkg.monthlyPeriod} mo)`
        : `$${formatNumber(packagePrice)}`;
    
    const discountDisplay = isMonthly
        ? '-'
        : `$${formatNumber(discount)} (${discountPercent}%)`;
    
    html += `
      <tr>
        <td>${escapeHtml(pkg.name)}</td>
        <td>
          <div class="package-courses-cell">
            <span class="package-courses-summary" onclick="togglePackageDetails('${pkg.id}')" style="cursor: pointer;">
              ${pkg.courses ? pkg.courses.length : 0} course(s) ${isExpanded ? '▼' : '▶'}
            </span>
            ${isExpanded ? `
              <div class="package-courses-details">
                ${getPackageCoursesDetails(pkg)}
                <div class="package-total">Total: $${formatNumber(originalPrice)}</div>
              </div>
            ` : ''}
          </div>
        </td>
        <td>$${formatNumber(originalPrice)}</td>
        <td>${packagePriceDisplay}</td>
        <td>${discountDisplay}</td>
        <td>
          <span class="package-status ${pkg.status}">
            ${pkg.status === 'inactive' && hasDeletedCourse ? 'Inactive (Course Deleted)' : pkg.status.charAt(0).toUpperCase() + pkg.status.slice(1)}
          </span>
        </td>
        <td>${validityStatus}</td>
        <td>
          <span class="btn-row-pair">
          <button class="btn btn-secondary" onclick="openEditPackageModal('${pkg.id}')">Edit</button>
          <button class="btn btn-danger" onclick="deletePackage('${pkg.id}', '${escapeHtml(pkg.name)}')">Delete</button>
          </span>
        </td>
      </tr>
    `;
  });
  
  html += `
      </tbody>
    </table>
  `;
  
  container.innerHTML = html;
}

// Helper functions for packages
function calculateOriginalPrice(pkg) {
  if (!pkg.courses || pkg.courses.length === 0) return 0;
  
  let total = 0;
  pkg.courses.forEach(courseItem => {
    const course = (window.courses || []).find(c => c.id === courseItem.courseId);
    if (course) {
      total += course.price * courseItem.quantity;
    }
  });
  
  return total;
}

function getPackagePrice(pkg) {
  if (pkg.priceStrategy === 'fixed') {
    return pkg.fixedPrice || 0;
  } else if (pkg.priceStrategy === 'discount') {
    const originalPrice = calculateOriginalPrice(pkg);
    const discount = (originalPrice * (pkg.discountPercentage || 0)) / 100;
    return originalPrice - discount;
  } else if (pkg.priceStrategy === 'custom') {
    return pkg.customPrice || 0;
  } else if (pkg.priceStrategy === 'monthly') {
    return pkg.monthlyLessonPrice || 0;
  }
  return 0;
}

function getValidityStatus(pkg) {
  if (!pkg.startDate && !pkg.endDate) {
    return 'N/A';
  }
  
  const now = new Date();
  if (pkg.endDate) {
    const end = new Date(pkg.endDate);
    if (end < now) {
      return 'Expired';
    }
    return `Valid until ${formatDate(pkg.endDate)}`;
  }
  
  return 'N/A';
}

function checkHasDeletedCourse(pkg) {
  if (!pkg.courses || pkg.courses.length === 0) return false;
  
  return pkg.courses.some(courseItem => {
    const course = (window.courses || []).find(c => c.id === courseItem.courseId);
    return !course;
  });
}

function getPackageCoursesDetails(pkg) {
  if (!pkg.courses || pkg.courses.length === 0) return '';
  
  let html = '';
  pkg.courses.forEach(courseItem => {
    const course = (window.courses || []).find(c => c.id === courseItem.courseId);
    if (course) {
      const subtotal = course.price * courseItem.quantity;
      html += `
        <div class="package-course-detail">
          ${escapeHtml(course.name)} - $${formatNumber(course.price)}/lesson × ${courseItem.quantity} = $${formatNumber(subtotal)}
        </div>
      `;
    } else {
      html += `
        <div class="package-course-detail deleted">
          Course Deleted (ID: ${courseItem.courseId}) × ${courseItem.quantity}
        </div>
      `;
    }
  });
  
  return html;
}

function togglePackageDetails(packageId) {
  if (expandedPackageIds.has(packageId)) {
    expandedPackageIds.delete(packageId);
  } else {
    expandedPackageIds.add(packageId);
  }
  renderPackages();
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Package search and filter handlers
window.handlePackageSearch = function() {
  packageCurrentSearch = document.getElementById('packageSearch').value.toLowerCase().trim();
  renderPackages();
};

window.handlePackageFilter = function() {
  packageStatusFilter = document.getElementById('packageStatusFilter').value;
  packageValidityFilter = document.getElementById('packageValidityFilter').value;
  renderPackages();
};

window.handlePackageSort = function() {
  const sortValue = document.getElementById('packageSort').value;
  const [field, direction] = sortValue.split('-');
  
  packageCurrentSort = { field, direction };
  renderPackages();
};

function renderPackagesError() {
  const container = document.getElementById('packagesListContainer');
  if (container) {
    container.innerHTML = '<p>Error loading packages. Please refresh the page.</p>';
  }
}

// Open create package modal
window.openCreatePackageModal = function() {
  openPackageModal(null);
};

// Open edit package modal
window.openEditPackageModal = function(packageId) {
  const pkg = packages.find(p => p.id === packageId);
  if (!pkg) {
    showToast('Package not found', 'error');
    return;
  }
  openPackageModal(pkg);
};

// Open package modal (create or edit)
