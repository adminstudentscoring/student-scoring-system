async function savePackage(event, packageId) {
  event.preventDefault();
  
  // Clear previous errors
  clearPackageErrors();
  
  // Get form data
  const name = document.getElementById('packageName').value.trim();
  const strategy = document.getElementById('packagePriceStrategy').value;
  const description = document.getElementById('packageDescription').value.trim();
  const startDate = document.getElementById('packageStartDate').value;
  const endDate = document.getElementById('packageEndDate').value;
  const status = document.getElementById('packageStatus').value;
  
  // Validate dates
  if (!validatePackageDates()) {
    return;
  }
  
  // Get courses from table
  const rows = document.querySelectorAll('#packageCoursesTableBody tr');
  const courses = [];
  
  rows.forEach(row => {
    const select = row.querySelector('.package-course-select');
    const quantityInput = row.querySelector('.package-course-quantity');
    
    const courseId = select?.value;
    const quantity = parseInt(quantityInput?.value) || 0;
    
    if (courseId && quantity > 0) {
      courses.push({ courseId, quantity });
    }
  });
  
  // Validation
  if (!name) {
    showPackageFieldError('packageName', 'Package name is required');
    return;
  }
  
  if (courses.length === 0) {
    showPackageFieldError('packageCoursesError', 'At least one course is required');
    return;
  }
  
  if (!strategy) {
    showPackageFieldError('packagePriceStrategy', 'Price strategy is required');
    return;
  }
  
  let priceValue = null;
  let monthlyLessonPrice = null;
  let monthlyPeriod = null;

  if (strategy === 'fixed') {
    const fixedPrice = document.getElementById('packagePriceInput').value.replace(/,/g, '');
    if (!fixedPrice) {
      showPackageFieldError('packagePriceError', 'Fixed price is required');
      return;
    }
    priceValue = parseFloat(fixedPrice);
    if (isNaN(priceValue) || priceValue < 0) {
      showPackageFieldError('packagePriceError', 'Fixed price must be a valid number >= 0');
      return;
    }
  } else if (strategy === 'discount') {
    const discount = document.getElementById('packagePriceInput').value;
    if (!discount) {
      showPackageFieldError('packagePriceError', 'Discount percentage is required');
      return;
    }
    priceValue = parseFloat(discount);
    if (isNaN(priceValue) || priceValue < 0 || priceValue > 100) {
      showPackageFieldError('packagePriceError', 'Discount percentage must be between 0 and 100');
      return;
    }
  } else if (strategy === 'custom') {
    const customPrice = document.getElementById('packagePriceInput').value.replace(/,/g, '');
    if (!customPrice) {
      showPackageFieldError('packagePriceError', 'Custom price is required');
      return;
    }
    priceValue = parseFloat(customPrice);
    if (isNaN(priceValue) || priceValue < 0) {
      showPackageFieldError('packagePriceError', 'Custom price must be a valid number >= 0');
      return;
    }
  } else if (strategy === 'monthly') {
    const mp = document.getElementById('monthlyLessonPrice').value;
    const mper = document.getElementById('monthlyPeriod').value;
    if (!mp || !mper) {
      showPackageFieldError('packagePriceStrategy', 'Monthly price and period are required');
      return;
    }
    monthlyLessonPrice = parseFloat(mp);
    monthlyPeriod = parseInt(mper);
    if (isNaN(monthlyLessonPrice) || monthlyLessonPrice < 0) {
        showPackageFieldError('packagePriceStrategy', 'Monthly price must be valid');
        return;
    }
    if (isNaN(monthlyPeriod) || monthlyPeriod < 1) {
        showPackageFieldError('packagePriceStrategy', 'Period must be at least 1 month');
        return;
    }
  }
  
  // Prepare request body
  const body = {
    name,
    courses,
    priceStrategy: strategy,
    monthlyLessonPrice: strategy === 'monthly' ? monthlyLessonPrice : null,
    monthlyPeriod: strategy === 'monthly' ? monthlyPeriod : null,
    fixedPrice: strategy === 'fixed' ? priceValue : null,
    discountPercentage: strategy === 'discount' ? priceValue : null,
    customPrice: strategy === 'custom' ? priceValue : null,
    description: description || null,
    startDate: startDate || null,
    endDate: endDate || null,
    status: status || 'active'
  };
  
  try {
    const url = packageId 
      ? `/organizations/packages/${packageId}`
      : '/organizations/packages';
    
    const method = packageId ? 'PUT' : 'POST';
    
    const response = await window.authUtils.authenticatedFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (!response) return;
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to save package');
    }
    
    showToast(packageId ? 'Package updated successfully!' : 'Package created successfully!', 'success');
    closePackageModal();
    await loadPackages();
  } catch (error) {
    console.error('Error saving package:', error);
    showToast(error.message || 'Failed to save package', 'error');
  }
}

// Delete package
async function deletePackage(packageId, packageName) {
  // TODO: Check for purchase records in the future
  // For now, show confirmation dialog
  if (!confirm(`Are you sure you want to delete "${packageName}"?\n\nNote: If this package has purchase records, it will be marked as Archived instead of being deleted.`)) {
    return;
  }
  
  try {
    const response = await window.authUtils.authenticatedFetch(`/organizations/packages/${packageId}`, {
      method: 'DELETE'
    });
    
    if (!response) return;
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete package');
    }
    
    showToast('Package deleted successfully!', 'success');
    await loadPackages();
  } catch (error) {
    console.error('Error deleting package:', error);
    showToast(error.message || 'Failed to delete package', 'error');
  }
}

// Close package modal
window.closePackageModal = function() {
  const modal = document.getElementById('packageModal');
  if (modal) {
    modal.remove();
  }
  window.currentPackageModal = null;
  packageCourseRowIndex = 0;
};

function showPackageFieldError(fieldId, message) {
  const errorElement = document.getElementById(fieldId + 'Error') || document.getElementById(fieldId);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }
}

function clearPackageErrors() {
  document.querySelectorAll('#packageForm .error-message').forEach(el => {
    el.textContent = '';
    el.style.display = 'none';
  });
}

