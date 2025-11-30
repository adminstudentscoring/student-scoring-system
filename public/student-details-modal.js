// Student Details Modal
// Shared modal for viewing and editing student information in organization.html and admin.html

let currentStudent = null;
let originalStudentData = null;
let currentOrgId = null;

// Initialize student details modal
function initStudentDetailsModal() {
    // Verify function exists before calling
    if (typeof createModalHTML !== 'function') {
        console.error('CRITICAL ERROR: createModalHTML is not a function!');
        return false;
    }
    
    let created;
    try {
        created = createModalHTML();
    } catch (callError) {
        console.error('Error calling createModalHTML():', callError);
        return false;
    }
    
    if (!created) {
        console.error('Failed to create modal HTML structure');
        return false;
    }
    
    setupEventListeners();
    return true;
}

// Create modal HTML structure
// Use function expression wrapped in IIFE to ensure proper definition and isolation
const createModalHTML = (function() {
    'use strict';
    
    // Return the actual function
    return function createModalHTML() {
        try {
        // Check if modal already exists
        const existingModal = document.getElementById('studentDetailsModal');
        if (existingModal) {
            return true; // Modal already exists
        }

        // Check if document.body is available
        if (!document.body) {
            console.error('Cannot create student modal: document.body is not available');
            return false;
        }

        // Check if document.head is available
        if (!document.head) {
            console.error('Cannot create student modal: document.head is not available');
            return false;
        }
        const modalHTML = `
        <div id="studentDetailsModal" class="modal" style="display: none;">
            <div class="modal-content" style="max-width: 900px; max-height: 85vh; width: 95vw; min-width: 400px; margin: 20px auto; overflow-y: auto;">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 20px; border-bottom: 1px solid #ddd; position: sticky; top: 0; background: white; z-index: 10;">
                    <h2 style="margin: 0;">Student Information</h2>
                    <span class="modal-close" id="studentDetailsModalClose" style="font-size: 28px; font-weight: bold; color: #aaa; cursor: pointer; line-height: 1;">&times;</span>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <div id="studentDetailsError" style="display: none; background: #fee; color: #c33; padding: 10px; border-radius: 4px; margin-bottom: 20px;"></div>
                    <div id="studentDetailsSuccess" style="display: none; background: #efe; color: #3c3; padding: 10px; border-radius: 4px; margin-bottom: 20px;"></div>
                    
                    <form id="studentDetailsForm">
                        <!-- Basic Information -->
                        <div class="form-section" style="margin-bottom: 30px;">
                            <h3 style="margin-bottom: 15px; color: #333; border-bottom: 2px solid #667eea; padding-bottom: 5px;">Basic Information</h3>
                            <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                                <div class="form-group">
                                    <label for="studentName" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Student Name <span style="color: red;">*</span></label>
                                    <input type="text" id="studentName" name="name" maxlength="100" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                                <div class="form-group">
                                    <label for="studentId" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Student No.</label>
                                    <input type="text" id="studentId" name="studentId" maxlength="50" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                            </div>
                            <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                <div class="form-group">
                                    <label for="dateOfBirth" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Date of Birth</label>
                                    <input type="text" id="dateOfBirth" name="dateOfBirth" placeholder="DD/MM/YYYY" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                                <div class="form-group">
                                    <label for="gender" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Gender</label>
                                    <select id="gender" name="gender" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                        <option value="">Select...</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Contact Information -->
                        <div class="form-section" style="margin-bottom: 30px;">
                            <h3 style="margin-bottom: 15px; color: #333; border-bottom: 2px solid #667eea; padding-bottom: 5px;">Contact Information</h3>
                            <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                <div class="form-group">
                                    <label for="contactPhone" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Contact Phone</label>
                                    <input type="text" id="contactPhone" name="contactPhone" maxlength="20" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                                <div class="form-group">
                                    <label for="contactEmail" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Contact Email</label>
                                    <input type="email" id="contactEmail" name="contactEmail" maxlength="100" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Emergency Contact -->
                        <div class="form-section" style="margin-bottom: 30px;">
                            <h3 style="margin-bottom: 15px; color: #333; border-bottom: 2px solid #667eea; padding-bottom: 5px;">Emergency Contact</h3>
                            <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                                <div class="form-group">
                                    <label for="emergencyContactName" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Emergency Contact Name</label>
                                    <input type="text" id="emergencyContactName" name="emergencyContactName" maxlength="100" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                                <div class="form-group">
                                    <label for="emergencyContactRelation" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Emergency Contact Relation</label>
                                    <select id="emergencyContactRelation" name="emergencyContactRelation" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                        <option value="">Select...</option>
                                        <option value="Parent">Parent</option>
                                        <option value="Guardian">Guardian</option>
                                        <option value="Other">Other</option>
                                    </select>
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                            </div>
                            <div class="form-row" style="margin-bottom: 0;">
                                <div class="form-group">
                                    <label for="emergencyContactNumber" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Emergency Contact Number</label>
                                    <input type="text" id="emergencyContactNumber" name="emergencyContactNumber" maxlength="20" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Membership Information -->
                        <div class="form-section" style="margin-bottom: 30px;">
                            <h3 style="margin-bottom: 15px; color: #333; border-bottom: 2px solid #667eea; padding-bottom: 5px;">Membership Information</h3>
                            <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                                <div class="form-group">
                                    <label for="membership" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Membership</label>
                                    <input type="text" id="membership" name="membership" maxlength="50" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                                <div class="form-group">
                                    <label for="membershipEndDate" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Membership End Date</label>
                                    <input type="text" id="membershipEndDate" name="membershipEndDate" placeholder="DD/MM/YYYY" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="membershipStartDate" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Membership Start Date</label>
                                    <input type="text" id="membershipStartDate" name="membershipStartDate" placeholder="DD/MM/YYYY" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                                    <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Remark -->
                        <div class="form-section" style="margin-bottom: 30px;">
                            <h3 style="margin-bottom: 15px; color: #333; border-bottom: 2px solid #667eea; padding-bottom: 5px;">Remark</h3>
                            <div class="form-group">
                                <label for="remark" style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">Remark</label>
                                <textarea id="remark" name="remark" rows="4" maxlength="1000" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
                                <div class="field-error" style="color: red; font-size: 12px; margin-top: 5px;"></div>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer" style="padding: 20px; border-top: 1px solid #ddd; display: flex; justify-content: flex-end; gap: 10px; position: sticky; bottom: 0; background: white;">
                    <button id="studentDetailsCancel" class="btn btn-secondary" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                    <button id="studentDetailsSave" class="btn btn-primary" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">Save</button>
                </div>
            </div>
        </div>
    `;

        // Insert modal HTML into body
        try {
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        } catch (insertError) {
            console.error('Error inserting student modal HTML:', insertError);
            throw insertError; // Re-throw to be caught by outer catch
        }
        
        // Add responsive styles
        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 768px) {
                .form-row {
                    grid-template-columns: 1fr !important;
                }
                #studentDetailsModal .modal-content {
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
            console.error('Error appending student modal style:', styleError);
            // Don't fail if style append fails
        }
        
        // Verify modal was created
        const createdModal = document.getElementById('studentDetailsModal');
        if (!createdModal) {
            console.error('Student modal HTML was inserted but element not found in DOM');
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error creating student modal HTML:', error);
        return false;
    }
    };
})(); // Immediately invoke to create the function

// Setup event listeners
function setupEventListeners() {
    const modal = document.getElementById('studentDetailsModal');
    const closeBtn = document.getElementById('studentDetailsModalClose');
    const cancelBtn = document.getElementById('studentDetailsCancel');
    const saveBtn = document.getElementById('studentDetailsSave');

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

// Open modal with student data
async function openStudentDetailsModal(student, organizationId) {
    try {
        // Close any existing modal first
        closeAllModals();
        
        // Validate student data
        if (!student) {
            console.error('Cannot open modal: student data is required');
            return;
        }
        
        currentStudent = student;
        // If organizationId not provided, try to get from student object
        currentOrgId = organizationId || student.organizationId || null;
        originalStudentData = JSON.parse(JSON.stringify(student)); // Deep copy
        
        // Ensure document.body is available
        if (!document.body) {
            console.error('Cannot open modal: document.body is not available');
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
        
        let modal = document.getElementById('studentDetailsModal');
        let retryCount = 0;
        const maxRetries = 3;
        
        // Try to create modal if it doesn't exist
        while (!modal && retryCount < maxRetries) {
            const initialized = initStudentDetailsModal();
            
            if (!initialized) {
                retryCount++;
                if (retryCount < maxRetries) {
                    // Wait a bit before retrying
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                continue;
            }
            
            // Wait for DOM to update and verify modal was created
            await new Promise(resolve => {
                // Use requestAnimationFrame to ensure DOM is updated
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        resolve();
                    });
                });
            });
            
            modal = document.getElementById('studentDetailsModal');
            
            if (!modal) {
                retryCount++;
                if (retryCount < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }
        
        if (!modal) {
            console.error('Failed to create student details modal after multiple attempts');
            alert('無法打開學生詳情視窗，請刷新頁面後重試。\nUnable to open student details modal, please refresh the page and try again.');
            return;
        }
        
        // Populate form with student data
        populateForm(student);
        
        // Clear messages
        clearMessages();
        
        // Show modal
        modal.style.display = 'block';
        if (document.body) {
            document.body.style.overflow = 'hidden';
        }
    } catch (error) {
        console.error('Error opening student details modal:', error);
        alert('打開學生詳情視窗時發生錯誤，請刷新頁面後重試。\nAn error occurred while opening the student details modal, please refresh the page and try again.');
    }
}

// Close all modals (ensure only one is open)
function closeAllModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(m => {
        if (m.id !== 'studentDetailsModal' || m.style.display === 'block') {
            m.style.display = 'none';
        }
    });
}

// Populate form with student data
function populateForm(student) {
    if (!student) return;
    
    document.getElementById('studentName').value = student.name || '';
    document.getElementById('studentId').value = student.studentId || '';
    document.getElementById('dateOfBirth').value = student.dateOfBirth || '';
    document.getElementById('gender').value = student.gender || '';
    document.getElementById('contactPhone').value = student.contactPhone || '';
    document.getElementById('contactEmail').value = student.contactEmail || '';
    document.getElementById('emergencyContactName').value = student.emergencyContactName || '';
    document.getElementById('emergencyContactRelation').value = student.emergencyContactRelation || '';
    document.getElementById('emergencyContactNumber').value = student.emergencyContactNumber || '';
    document.getElementById('membership').value = student.membership || '';
    document.getElementById('membershipStartDate').value = student.membershipStartDate || '';
    document.getElementById('membershipEndDate').value = student.membershipEndDate || '';
    document.getElementById('remark').value = student.remark || '';
}

// Get form data
function getFormData() {
    return {
        name: document.getElementById('studentName').value.trim(),
        studentId: document.getElementById('studentId').value.trim(),
        dateOfBirth: document.getElementById('dateOfBirth').value.trim() || null,
        gender: document.getElementById('gender').value || null,
        contactPhone: document.getElementById('contactPhone').value.trim() || null,
        contactEmail: document.getElementById('contactEmail').value.trim() || null,
        emergencyContactName: document.getElementById('emergencyContactName').value.trim() || null,
        emergencyContactRelation: document.getElementById('emergencyContactRelation').value || null,
        emergencyContactNumber: document.getElementById('emergencyContactNumber').value.trim() || null,
        membership: document.getElementById('membership').value.trim() || null,
        membershipStartDate: document.getElementById('membershipStartDate').value.trim() || null,
        membershipEndDate: document.getElementById('membershipEndDate').value.trim() || null,
        remark: document.getElementById('remark').value.trim() || null
    };
}

// Check if form has changes
function hasFormChanges() {
    const formData = getFormData();
    if (!originalStudentData) return true;
    
    const fields = ['name', 'studentId', 'dateOfBirth', 'gender', 'contactPhone', 'contactEmail',
                   'emergencyContactName', 'emergencyContactRelation', 'emergencyContactNumber',
                   'membership', 'membershipStartDate', 'membershipEndDate', 'remark'];
    
    for (const field of fields) {
        const formValue = formData[field] || null;
        const originalValue = originalStudentData[field] || null;
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
    const modal = document.getElementById('studentDetailsModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        currentStudent = null;
        originalStudentData = null;
        currentOrgId = null;
        clearMessages();
        clearFieldErrors();
    }
}

// Clear messages
function clearMessages() {
    const errorDiv = document.getElementById('studentDetailsError');
    const successDiv = document.getElementById('studentDetailsSuccess');
    if (errorDiv) errorDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'none';
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('studentDetailsError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

// Show success message
function showSuccess(message) {
    const successDiv = document.getElementById('studentDetailsSuccess');
    if (successDiv) {
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        // Scroll to top
        document.querySelector('#studentDetailsModal .modal-body').scrollTop = 0;
    }
}

// Clear field errors
function clearFieldErrors() {
    const errors = document.querySelectorAll('.field-error');
    errors.forEach(err => err.textContent = '');
}

// Set field error
function setFieldError(fieldName, message) {
    const field = document.querySelector(`[name="${fieldName}"]`);
    if (field) {
        const errorDiv = field.closest('.form-group')?.querySelector('.field-error');
        if (errorDiv) {
            errorDiv.textContent = message;
        }
    }
}

// Validate date format DD/MM/YYYY
function isValidDateFormat(dateString) {
    if (!dateString || dateString.trim() === '') return true;
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    return regex.test(dateString);
}

// Validate date value
function isValidDate(dateString) {
    if (!dateString || dateString.trim() === '') return true;
    if (!isValidDateFormat(dateString)) return false;
    
    const parts = dateString.split('/');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return false;
    }
    
    return true;
}

// Check if date is in the future
function isFutureDate(dateString) {
    if (!dateString || dateString.trim() === '') return false;
    if (!isValidDate(dateString)) return false;
    
    const parts = dateString.split('/');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return date > today;
}

// Compare dates (DD/MM/YYYY)
function compareDates(date1, date2) {
    if (!date1 || !date2) return 0;
    if (!isValidDate(date1) || !isValidDate(date2)) return 0;
    
    const parts1 = date1.split('/');
    const parts2 = date2.split('/');
    const d1 = new Date(parseInt(parts1[2]), parseInt(parts1[1]) - 1, parseInt(parts1[0]));
    const d2 = new Date(parseInt(parts2[2]), parseInt(parts2[1]) - 1, parseInt(parts2[0]));
    
    return d1 - d2;
}

// Validate form
async function validateForm() {
    clearFieldErrors();
    let isValid = true;
    const formData = getFormData();
    
    // Validate student name (required)
    if (!formData.name || formData.name.trim() === '') {
        setFieldError('name', 'Student name is required');
        isValid = false;
    } else if (formData.name.length > 100) {
        setFieldError('name', 'Student name must be 100 characters or less');
        isValid = false;
    }
    
    // Validate student ID length
    if (formData.studentId && formData.studentId.length > 50) {
        setFieldError('studentId', 'Student ID must be 50 characters or less');
        isValid = false;
    }
    
    // Check student ID uniqueness (if changed)
    if (formData.studentId && formData.studentId !== (originalStudentData?.studentId || '')) {
        try {
            const checkUrl = `/api/organizations/${currentOrgId}/students/check-id/${encodeURIComponent(formData.studentId)}?excludeId=${currentStudent.id}`;
            const response = await window.authUtils?.authenticatedFetch(checkUrl) || fetch(checkUrl);
            if (response && response.ok) {
                const result = await response.json();
                if (!result.available) {
                    setFieldError('studentId', 'Student ID already exists in this organization');
                    isValid = false;
                }
            }
        } catch (error) {
            console.error('Error checking student ID:', error);
        }
    }
    
    // Validate date of birth
    if (formData.dateOfBirth) {
        if (!isValidDateFormat(formData.dateOfBirth)) {
            setFieldError('dateOfBirth', 'Date must be in DD/MM/YYYY format');
            isValid = false;
        } else if (!isValidDate(formData.dateOfBirth)) {
            setFieldError('dateOfBirth', 'Invalid date');
            isValid = false;
        } else if (isFutureDate(formData.dateOfBirth)) {
            setFieldError('dateOfBirth', 'Date of birth cannot be in the future');
            isValid = false;
        }
    }
    
    // Validate membership start date
    if (formData.membershipStartDate) {
        if (!isValidDateFormat(formData.membershipStartDate)) {
            setFieldError('membershipStartDate', 'Date must be in DD/MM/YYYY format');
            isValid = false;
        } else if (!isValidDate(formData.membershipStartDate)) {
            setFieldError('membershipStartDate', 'Invalid date');
            isValid = false;
        }
    }
    
    // Validate membership end date
    if (formData.membershipEndDate) {
        if (!isValidDateFormat(formData.membershipEndDate)) {
            setFieldError('membershipEndDate', 'Date must be in DD/MM/YYYY format');
            isValid = false;
        } else if (!isValidDate(formData.membershipEndDate)) {
            setFieldError('membershipEndDate', 'Invalid date');
            isValid = false;
        } else {
            // Check if end date is after start date
            const startDate = formData.membershipStartDate || originalStudentData?.membershipStartDate;
            if (startDate && startDate.trim() !== '') {
                if (compareDates(formData.membershipEndDate, startDate) < 0) {
                    setFieldError('membershipEndDate', 'Membership end date must be after start date');
                    isValid = false;
                }
            }
        }
    }
    
    // Validate field lengths
    const fieldLengths = {
        contactPhone: 20,
        contactEmail: 100,
        emergencyContactName: 100,
        emergencyContactNumber: 20,
        remark: 1000,
        membership: 50
    };
    
    for (const [field, maxLength] of Object.entries(fieldLengths)) {
        if (formData[field] && formData[field].length > maxLength) {
            setFieldError(field, `Must be ${maxLength} characters or less`);
            isValid = false;
        }
    }
    
    return isValid;
}

// Handle save
async function handleSave() {
    clearMessages();
    
    // Validate form
    const isValid = await validateForm();
    if (!isValid) {
        showError('Please fix the errors in the form');
        return;
    }
    
    const saveBtn = document.getElementById('studentDetailsSave');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    
    try {
        const formData = getFormData();
        
        // Only send fields that have values
        const updates = {};
        Object.keys(formData).forEach(key => {
            if (formData[key] !== null && formData[key] !== '') {
                updates[key] = formData[key];
            }
        });
        
        const response = await window.authUtils?.authenticatedFetch(`/students/${currentStudent.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        
        if (!response || !response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to save student information' }));
            throw new Error(errorData.error || 'Failed to save student information');
        }
        
        const updatedStudent = await response.json();
        
        // Update original data
        originalStudentData = JSON.parse(JSON.stringify(updatedStudent));
        currentStudent = updatedStudent;
        
        // Show success message
        showSuccess('Student information saved successfully!');
        
        // Refresh student list (via WebSocket or single card update)
        if (typeof refreshStudentList === 'function') {
            refreshStudentList();
        } else if (typeof loadStudents === 'function') {
            loadStudents();
        }
        
        // Dispatch custom event for other components
        window.dispatchEvent(new CustomEvent('studentUpdated', { detail: updatedStudent }));
        
    } catch (error) {
        console.error('Error saving student:', error);
        showError(error.message || 'Failed to save student information. Please try again.');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
}


// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStudentDetailsModal);
} else {
    initStudentDetailsModal();
}

