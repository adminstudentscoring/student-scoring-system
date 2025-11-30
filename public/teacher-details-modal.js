// Teacher Details Modal
// Shared modal for viewing and editing teacher information in organization.html

let currentTeacher = null;
let originalTeacherData = null;
let currentTeacherOrgId = null;

// Initialize teacher details modal
function initTeacherDetailsModal() {
    if (typeof createTeacherModalHTML !== 'function') {
        console.error('CRITICAL ERROR: createTeacherModalHTML is not a function!');
        return false;
    }
    
    const created = createTeacherModalHTML();
    if (!created) {
        console.error('Failed to create teacher modal HTML structure');
        return false;
    }
    setupEventListeners();
    return true;
}

// Create modal HTML structure
// Use different function name to avoid conflict with student-details-modal.js
function createTeacherModalHTML() {
    try {
        // Check if modal already exists
        if (document.getElementById('teacherDetailsModal')) {
            return true; // Modal already exists
        }

        // Check if document.body is available
        if (!document.body) {
            console.error('Cannot create teacher modal: document.body is not available');
            return false;
        }

        // Check if document.head is available
        if (!document.head) {
            console.error('Cannot create teacher modal: document.head is not available');
            return false;
        }

        const modalHTML = `
        <div id="teacherDetailsModal" class="modal" style="display: none;">
            <div class="modal-content" style="max-width: 900px; max-height: 85vh; width: 95vw; min-width: 400px; margin: 20px auto; overflow-y: auto;">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 20px; border-bottom: 1px solid #ddd; position: sticky; top: 0; background: white; z-index: 10;">
                    <h2 style="margin: 0;">Teacher Information</h2>
                    <span class="modal-close" id="teacherDetailsModalClose" style="font-size: 28px; font-weight: bold; color: #aaa; cursor: pointer; line-height: 1;">&times;</span>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <div id="teacherDetailsError" style="display: none; background: #fee; color: #c33; padding: 10px; border-radius: 4px; margin-bottom: 20px;"></div>
                    <div id="teacherDetailsSuccess" style="display: none; background: #efe; color: #3c3; padding: 10px; border-radius: 4px; margin-bottom: 20px;"></div>
                    
                    <form id="teacherDetailsForm">
                        <!-- Basic Information -->
                        <div class="form-section" style="margin-bottom: 30px;">
                            <h3 style="margin-bottom: 15px; color: #333; border-bottom: 2px solid #667eea; padding-bottom: 5px;">Basic Information</h3>
                            <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                                <div class="form-group">
                                    <label for="teacherName" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Teacher Name <span style="color: red;">*</span></label>
                                    <input type="text" id="teacherName" name="name" maxlength="100" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                                <div class="form-group">
                                    <label for="teacherId" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Teacher ID <span style="color: red;">*</span></label>
                                    <input type="text" id="teacherId" name="teacherId" maxlength="50" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                            </div>
                            <div class="form-row" style="display: grid; grid-template-columns: 1fr; gap: 15px;">
                                <div class="form-group">
                                    <label for="teacherGender" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Gender</label>
                                    <select id="teacherGender" name="gender" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                        <option value="">Select...</option>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                    </select>
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Contact Information -->
                        <div class="form-section" style="margin-bottom: 30px;">
                            <h3 style="margin-bottom: 15px; color: #333; border-bottom: 2px solid #667eea; padding-bottom: 5px;">Contact Information</h3>
                            <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                                <div class="form-group">
                                    <label for="email" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Email</label>
                                    <input type="text" id="email" name="email" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                                <div class="form-group">
                                    <label for="teacherContactPhone" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Contact Phone</label>
                                    <input type="text" id="teacherContactPhone" name="contactPhone" maxlength="20" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                            </div>
                            <div class="form-row" style="display: grid; grid-template-columns: 1fr; gap: 15px;">
                                <div class="form-group">
                                    <label for="teacherRemark" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Remark</label>
                                    <textarea id="teacherRemark" name="remark" rows="4" maxlength="1000" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer" style="padding: 20px; border-top: 1px solid #ddd; display: flex; justify-content: flex-end; gap: 10px; position: sticky; bottom: 0; background: white;">
                    <button id="teacherDetailsCancel" class="btn btn-secondary" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                    <button id="teacherDetailsSave" class="btn btn-primary" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">Save</button>
                </div>
            </div>
        </div>
    `;

        // Insert modal HTML into body
        try {
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        } catch (insertError) {
            console.error('Error inserting teacher modal HTML:', insertError);
            return false;
        }
        
        // Add responsive styles
        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 768px) {
                .form-row {
                    grid-template-columns: 1fr !important;
                }
                #teacherDetailsModal .modal-content {
                    width: 100vw !important;
                    max-width: 100vw !important;
                    min-width: 100vw !important;
                    margin: 0 !important;
                    max-height: 100vh !important;
                    border-radius: 0 !important;
                }
            }
        `;
        try {
            document.head.appendChild(style);
        } catch (styleError) {
            console.error('Error appending teacher modal style:', styleError);
            // Don't fail if style append fails
        }
        
        // Verify modal was created
        const createdModal = document.getElementById('teacherDetailsModal');
        if (!createdModal) {
            console.error('Teacher modal HTML was inserted but element not found in DOM');
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error creating teacher modal HTML:', error);
        return false;
    }
}

// Setup event listeners
function setupEventListeners() {
    const modal = document.getElementById('teacherDetailsModal');
    const closeBtn = document.getElementById('teacherDetailsModalClose');
    const cancelBtn = document.getElementById('teacherDetailsCancel');
    const saveBtn = document.getElementById('teacherDetailsSave');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => handleCloseModal());
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => handleCloseModal());
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => handleSave());
    }
}

// Open modal with teacher data
async function openTeacherDetailsModal(teacher, organizationId) {
    try {
        // Validate teacher data
        if (!teacher) {
            console.error('Cannot open teacher modal: teacher data is required');
            return;
        }
        
        // Ensure document.body is available
        if (!document.body) {
            console.error('Cannot open teacher modal: document.body is not available');
            // Wait for body to be available
            await new Promise(resolve => {
                if (document.body) {
                    resolve();
                } else {
                    const checkBody = setInterval(() => {
                        if (document.body) {
                            clearInterval(checkBody);
                            resolve();
                        }
                    }, 50);
                    // Timeout after 5 seconds
                    setTimeout(() => {
                        clearInterval(checkBody);
                        resolve();
                    }, 5000);
                }
            });
            
            if (!document.body) {
                console.error('Timeout waiting for document.body');
                return;
            }
        }
        
        // Close any existing modal first
        closeAllModals();
        
        currentTeacher = teacher;
        // If organizationId not provided, try to get from teacher object
        currentTeacherOrgId = organizationId || teacher.organizationId || null;
        originalTeacherData = JSON.parse(JSON.stringify(teacher)); // Deep copy
        
        let modal = document.getElementById('teacherDetailsModal');
        if (!modal) {
            const initialized = initTeacherDetailsModal();
            if (!initialized) {
                console.error('Failed to initialize teacher modal');
                return;
            }
            // Wait for DOM to update
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        resolve();
                    });
                });
            });
            modal = document.getElementById('teacherDetailsModal');
        }
        
        if (!modal) {
            console.error('Failed to create teacher details modal');
            return;
        }
        
        // Populate form with teacher data
        populateForm(teacher);
        
        // Clear messages
        clearMessages();
        
        // Show modal
        modal.style.display = 'block';
        if (document.body) {
            document.body.style.overflow = 'hidden';
        }
    } catch (error) {
        console.error('Error opening teacher details modal:', error);
    }
}

// Close all modals (ensure only one is open)
function closeAllModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(m => {
        if (m.id !== 'teacherDetailsModal' || m.style.display === 'block') {
            m.style.display = 'none';
        }
    });
}

// Populate form with teacher data
function populateForm(teacher) {
    if (!teacher) return;
    
    document.getElementById('teacherName').value = teacher.name || '';
    document.getElementById('teacherId').value = teacher.teacherId || '';
    document.getElementById('teacherGender').value = teacher.gender || '';
    document.getElementById('email').value = teacher.email || '';
    document.getElementById('teacherContactPhone').value = teacher.contactPhone || '';
    document.getElementById('teacherRemark').value = teacher.remark || '';
}

// Get form data
function getFormData() {
    return {
        name: document.getElementById('teacherName').value.trim(),
        teacherId: document.getElementById('teacherId').value.trim(),
        gender: document.getElementById('teacherGender').value || null,
        email: document.getElementById('email').value.trim() || null,
        contactPhone: document.getElementById('teacherContactPhone').value.trim() || null,
        remark: document.getElementById('teacherRemark').value.trim() || null
    };
}

// Check if form has changes
function hasFormChanges() {
    const formData = getFormData();
    if (!originalTeacherData) return true;
    
    const fields = ['name', 'teacherId', 'gender', 'email', 'contactPhone', 'remark'];
    
    for (const field of fields) {
        const formValue = formData[field] || null;
        const originalValue = originalTeacherData[field] || null;
        if (formValue !== originalValue) {
            return true;
        }
    }
    
    return false;
}

// Handle close modal
function handleCloseModal() {
    if (hasFormChanges()) {
        if (confirm('You have unsaved changes. Are you sure you want to cancel?')) {
            closeModal();
        }
    } else {
        closeModal();
    }
}

// Close modal
function closeModal() {
    const modal = document.getElementById('teacherDetailsModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        currentTeacher = null;
        originalTeacherData = null;
        currentTeacherOrgId = null;
        clearMessages();
        clearFieldErrors();
    }
}

// Clear messages
function clearMessages() {
    const errorDiv = document.getElementById('teacherDetailsError');
    const successDiv = document.getElementById('teacherDetailsSuccess');
    if (errorDiv) errorDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'none';
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('teacherDetailsError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

// Show success message
function showSuccess(message) {
    const successDiv = document.getElementById('teacherDetailsSuccess');
    if (successDiv) {
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        // Scroll to top
        document.querySelector('#teacherDetailsModal .modal-body').scrollTop = 0;
    }
}

// Clear field errors
function clearFieldErrors() {
    const errors = document.querySelectorAll('#teacherDetailsModal .field-error');
    errors.forEach(err => err.textContent = '');
}

// Set field error
function setFieldError(fieldName, message) {
    const field = document.querySelector(`#teacherDetailsModal [name="${fieldName}"]`);
    if (field) {
        const errorDiv = field.closest('.form-group')?.querySelector('.field-error');
        if (errorDiv) {
            errorDiv.textContent = message;
        }
    }
}

// Validate form
async function validateForm() {
    clearFieldErrors();
    let isValid = true;
    const formData = getFormData();
    
    // Validate teacher name (required)
    if (!formData.name || formData.name.trim() === '') {
        setFieldError('name', 'Teacher name is required');
        isValid = false;
    } else if (formData.name.length > 100) {
        setFieldError('name', 'Teacher name must be 100 characters or less');
        isValid = false;
    }
    
    // Validate teacher ID (required)
    if (!formData.teacherId || formData.teacherId.trim() === '') {
        setFieldError('teacherId', 'Teacher ID is required');
        isValid = false;
    } else if (formData.teacherId.length > 50) {
        setFieldError('teacherId', 'Teacher ID must be 50 characters or less');
        isValid = false;
    }
    
    // Check teacher ID uniqueness (if changed)
    if (formData.teacherId && formData.teacherId !== (originalTeacherData?.teacherId || '')) {
        try {
            // We'll check this on the backend, but we can do a frontend check if needed
            // For now, we'll rely on backend validation
        } catch (error) {
            console.error('Error checking teacher ID:', error);
        }
    }
    
    // Validate gender
    if (formData.gender && formData.gender !== 'male' && formData.gender !== 'female') {
        setFieldError('gender', 'Gender must be male or female');
        isValid = false;
    }
    
    // Validate field lengths
    if (formData.contactPhone && formData.contactPhone.length > 20) {
        setFieldError('contactPhone', 'Contact phone must be 20 characters or less');
        isValid = false;
    }
    
    if (formData.remark && formData.remark.length > 1000) {
        setFieldError('remark', 'Remark must be 1000 characters or less');
        isValid = false;
    }
    
    return isValid;
}

// Handle save
async function handleSave() {
    clearMessages();
    clearFieldErrors();
    
    // Validate form
    const isValid = await validateForm();
    if (!isValid) {
        showError('Please fix the errors before saving.');
        return;
    }
    
    const formData = getFormData();
    
    // Disable save button
    const saveBtn = document.getElementById('teacherDetailsSave');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    
    try {
        const response = await window.authUtils?.authenticatedFetch(`/organizations/teachers/${currentTeacher.id}`, {
            method: 'PUT',
            body: JSON.stringify(formData)
        });
        
        if (!response) {
            showError('Failed to save. Please try again.');
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
            return;
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = errorData.error || 'Failed to save teacher information';
            showError(errorMessage);
            
            // Set field-specific errors if available
            if (errorData.field) {
                setFieldError(errorData.field, errorMessage);
            }
            
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
            return;
        }
        
        const updatedTeacher = await response.json();
        
        // Show success message
        showSuccess('Teacher information saved successfully!');
        
        // Show toast notification (use showToast from organization.html if available)
        if (typeof showToast === 'function') {
            showToast('Teacher information saved successfully!', 'success');
        } else if (window.showToast) {
            window.showToast('Teacher information saved successfully!', 'success');
        }
        
        // Update original data
        originalTeacherData = JSON.parse(JSON.stringify(updatedTeacher));
        currentTeacher = updatedTeacher;
        
        // Refresh teacher list if function exists
        if (window.refreshTeacherList) {
            window.refreshTeacherList();
        }
        
        // Close modal after a short delay
        setTimeout(() => {
            closeModal();
        }, 1000);
        
    } catch (error) {
        console.error('Error saving teacher:', error);
        showError('An error occurred while saving. Please try again.');
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
}

// Make function globally available
window.openTeacherDetailsModal = openTeacherDetailsModal;

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTeacherDetailsModal);
} else {
    initTeacherDetailsModal();
}

