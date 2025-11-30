// Student Details Modal
// Shared modal for viewing and editing student information in organization.html and admin.html

let currentStudent = null;
let originalStudentData = null;
let currentOrgId = null;

// Initialize student details modal
function initStudentDetailsModal() {
    console.log('[Modal Debug] ========== initStudentDetailsModal() called ==========');
    console.log('[Modal Debug] Call stack:', new Error().stack);
    
    const created = createModalHTML();
    console.log('[Modal Debug] createModalHTML() returned:', created);
    
    if (!created) {
        console.error('[Modal Debug] ERROR: Failed to create modal HTML structure');
        console.error('[Modal Debug] Current DOM state:', {
            bodyExists: !!document.body,
            headExists: !!document.head,
            modalExists: !!document.getElementById('studentDetailsModal'),
            readyState: document.readyState
        });
        return false;
    }
    
    console.log('[Modal Debug] Setting up event listeners...');
    setupEventListeners();
    console.log('[Modal Debug] Event listeners set up');
    console.log('[Modal Debug] ========== initStudentDetailsModal() completed ==========');
    return true;
}

// Create modal HTML structure
function createModalHTML() {
    console.log('[Modal Debug] Starting createModalHTML()');
    console.log('[Modal Debug] Timestamp:', new Date().toISOString());
    
    try {
        // Check if modal already exists
        const existingModal = document.getElementById('studentDetailsModal');
        if (existingModal) {
            console.log('[Modal Debug] Modal already exists in DOM');
            console.log('[Modal Debug] Existing modal:', existingModal);
            return true; // Modal already exists
        }
        console.log('[Modal Debug] No existing modal found');

        // Check if document.body is available
        if (!document.body) {
            console.error('[Modal Debug] ERROR: document.body is not available');
            console.error('[Modal Debug] Document readyState:', document.readyState);
            console.error('[Modal Debug] Document state:', {
                documentElement: !!document.documentElement,
                head: !!document.head,
                body: !!document.body
            });
            return false;
        }
        console.log('[Modal Debug] document.body is available');
        console.log('[Modal Debug] Body children count before:', document.body.children.length);
        console.log('[Modal Debug] Body innerHTML length before:', document.body.innerHTML.length);

        // Check if document.head is available
        if (!document.head) {
            console.error('[Modal Debug] ERROR: document.head is not available');
            return false;
        }
        console.log('[Modal Debug] document.head is available');

        // Check for ID conflicts
        const conflictingElements = document.querySelectorAll('[id="studentDetailsModal"]');
        if (conflictingElements.length > 0) {
            console.warn('[Modal Debug] WARNING: Found conflicting elements with ID studentDetailsModal:', conflictingElements);
        }

        console.log('[Modal Debug] Creating modal HTML string...');
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

        console.log('[Modal Debug] Modal HTML string created');
        console.log('[Modal Debug] HTML length:', modalHTML.length);
        console.log('[Modal Debug] HTML preview (first 200 chars):', modalHTML.substring(0, 200));
        console.log('[Modal Debug] HTML preview (last 200 chars):', modalHTML.substring(modalHTML.length - 200));
        
        // Check for potential HTML issues
        const hasUnclosedTags = (modalHTML.match(/<[^/>]+>/g) || []).length !== (modalHTML.match(/<\/[^>]+>/g) || []).length;
        if (hasUnclosedTags) {
            console.warn('[Modal Debug] WARNING: Potential unclosed tags detected');
        }
        
        // Check for special characters that might cause issues
        const hasProblematicChars = /[^\x20-\x7E\n\r\t]/.test(modalHTML);
        if (hasProblematicChars) {
            console.warn('[Modal Debug] WARNING: Non-ASCII characters detected in HTML');
        }

        // Insert modal HTML into body
        console.log('[Modal Debug] Attempting to insert HTML into body...');
        console.log('[Modal Debug] Body element:', document.body);
        console.log('[Modal Debug] Body tagName:', document.body.tagName);
        console.log('[Modal Debug] Body parentNode:', document.body.parentNode);
        
        try {
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            console.log('[Modal Debug] insertAdjacentHTML completed successfully');
        } catch (insertError) {
            console.error('[Modal Debug] ERROR in insertAdjacentHTML:', insertError);
            console.error('[Modal Debug] Insert error details:', {
                name: insertError.name,
                message: insertError.message,
                stack: insertError.stack
            });
            throw insertError; // Re-throw to be caught by outer catch
        }
        
        // Check body state after insertion
        console.log('[Modal Debug] Body children count after insertion:', document.body.children.length);
        console.log('[Modal Debug] Body last child:', document.body.lastElementChild);
        console.log('[Modal Debug] Body last child ID:', document.body.lastElementChild?.id);
        console.log('[Modal Debug] Body last child tagName:', document.body.lastElementChild?.tagName);
        
        // Immediately check if modal exists
        const immediateCheck = document.getElementById('studentDetailsModal');
        console.log('[Modal Debug] Immediate getElementById check:', immediateCheck);
        if (immediateCheck) {
            console.log('[Modal Debug] Modal found immediately after insertion');
            console.log('[Modal Debug] Modal parent:', immediateCheck.parentElement);
            console.log('[Modal Debug] Modal parentNode:', immediateCheck.parentNode);
        } else {
            console.warn('[Modal Debug] WARNING: Modal not found immediately after insertion');
            // Check all elements with similar IDs
            const allModals = document.querySelectorAll('[id*="studentDetails"]');
            console.log('[Modal Debug] All elements with "studentDetails" in ID:', allModals);
            // Check if it's in a different location
            const allDivs = document.querySelectorAll('div[id]');
            console.log('[Modal Debug] Total divs with IDs:', allDivs.length);
        }
        
        // Add responsive styles
        console.log('[Modal Debug] Creating style element...');
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
            console.log('[Modal Debug] Style element appended to head');
        } catch (styleError) {
            console.error('[Modal Debug] ERROR appending style:', styleError);
            // Don't fail if style append fails
        }
        
        // Wait a bit and verify modal was created (synchronous check first)
        console.log('[Modal Debug] Performing immediate verification...');
        
        // Verify modal was created
        const createdModal = document.getElementById('studentDetailsModal');
        console.log('[Modal Debug] Final getElementById check:', createdModal);
        
        if (!createdModal) {
            console.error('[Modal Debug] ERROR: Modal HTML was inserted but element not found in DOM');
            console.error('[Modal Debug] Body HTML length:', document.body.innerHTML.length);
            console.error('[Modal Debug] Body HTML preview (last 500 chars):', document.body.innerHTML.substring(Math.max(0, document.body.innerHTML.length - 500)));
            
            // Try querySelector as alternative
            const queryResult = document.querySelector('#studentDetailsModal');
            console.error('[Modal Debug] querySelector result:', queryResult);
            
            // Check if it's in a shadow DOM or iframe
            console.error('[Modal Debug] Document location:', window.location.href);
            console.error('[Modal Debug] Document type:', document.doctype);
            
            return false;
        }
        
        console.log('[Modal Debug] Modal successfully created and verified');
        console.log('[Modal Debug] Modal element:', createdModal);
        console.log('[Modal Debug] Modal classes:', createdModal.className);
        console.log('[Modal Debug] Modal style.display:', createdModal.style.display);
        console.log('[Modal Debug] Modal parent:', createdModal.parentElement);
        
        return true;
    } catch (error) {
        console.error('[Modal Debug] ========== ERROR CAUGHT ==========');
        console.error('[Modal Debug] Error creating modal HTML:', error);
        console.error('[Modal Debug] Error name:', error.name);
        console.error('[Modal Debug] Error message:', error.message);
        console.error('[Modal Debug] Error stack:', error.stack);
        console.error('[Modal Debug] Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            bodyExists: !!document.body,
            headExists: !!document.head,
            documentReadyState: document.readyState,
            documentBodyType: document.body?.constructor?.name,
            documentHeadType: document.head?.constructor?.name,
            bodyChildrenCount: document.body?.children?.length || 0,
            bodyInnerHTMLLength: document.body?.innerHTML?.length || 0
        });
        
        // Additional diagnostics
        if (error.message) {
            console.error('[Modal Debug] Error message analysis:');
            if (error.message.includes('insertAdjacentHTML')) {
                console.error('[Modal Debug] - Error is related to insertAdjacentHTML');
            }
            if (error.message.includes('Invalid')) {
                console.error('[Modal Debug] - Error suggests invalid HTML');
            }
            if (error.message.includes('Security')) {
                console.error('[Modal Debug] - Error suggests security/CSP violation');
            }
        }
        
        // Check if error is a DOMException
        if (error instanceof DOMException) {
            console.error('[Modal Debug] DOMException code:', error.code);
            console.error('[Modal Debug] DOMException name:', error.name);
        }
        
        console.error('[Modal Debug] ====================================');
        return false;
    }
}

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
        console.log('[Modal Debug] ========== Starting modal creation retry loop ==========');
        while (!modal && retryCount < maxRetries) {
            console.log(`[Modal Debug] Retry attempt ${retryCount + 1}/${maxRetries}`);
            console.log(`[Modal Debug] Current modal state:`, {
                modalExists: !!document.getElementById('studentDetailsModal'),
                bodyChildren: document.body?.children?.length || 0
            });
            
            const initialized = initStudentDetailsModal();
            console.log(`[Modal Debug] initStudentDetailsModal() returned:`, initialized);
            
            if (!initialized) {
                console.error(`[Modal Debug] ERROR: Failed to initialize modal (attempt ${retryCount + 1}/${maxRetries})`);
                console.error(`[Modal Debug] Error context:`, {
                    retryCount: retryCount + 1,
                    maxRetries: maxRetries,
                    bodyExists: !!document.body,
                    headExists: !!document.head,
                    readyState: document.readyState
                });
                retryCount++;
                if (retryCount < maxRetries) {
                    console.log(`[Modal Debug] Waiting 100ms before retry...`);
                    // Wait a bit before retrying
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                continue;
            }
            
            console.log('[Modal Debug] Waiting for DOM to update...');
            // Wait for DOM to update and verify modal was created
            await new Promise(resolve => {
                // Use requestAnimationFrame to ensure DOM is updated
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        console.log('[Modal Debug] DOM update frames completed');
                        resolve();
                    });
                });
            });
            
            console.log('[Modal Debug] Checking for modal after DOM update...');
            modal = document.getElementById('studentDetailsModal');
            console.log(`[Modal Debug] Modal found after update:`, !!modal);
            
            if (!modal) {
                console.warn(`[Modal Debug] WARNING: Modal not found after initialization (attempt ${retryCount + 1}/${maxRetries})`);
                console.warn(`[Modal Debug] Current DOM state:`, {
                    bodyChildren: document.body?.children?.length || 0,
                    bodyLastChild: document.body?.lastElementChild?.id || 'none',
                    allModals: document.querySelectorAll('[id*="Modal"]').length
                });
                retryCount++;
                if (retryCount < maxRetries) {
                    console.warn(`[Modal Debug] Retrying... (attempt ${retryCount}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } else {
                console.log('[Modal Debug] Modal successfully found!');
            }
        }
        console.log('[Modal Debug] ========== Retry loop completed ==========');
        
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
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            student: student ? student.id : null,
            bodyExists: !!document.body
        });
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

