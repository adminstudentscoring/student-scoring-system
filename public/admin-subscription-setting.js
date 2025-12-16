// Admin - Subscription Setting (extracted from admin.html)
// UI text and identifiers remain in English.
(function () {
  let adminPrices = [];
  let selectedIds = new Set();
  let activeEditId = null;

  // Packages
  let adminSubscriptionPackages = [];
  let selectedPackageIds = new Set();
  let activePackageEditId = null;
  let allPricesForSelect = [];

  async function apiFetch(url, options = {}) {
    if (!window.authUtils?.authenticatedFetch) {
      throw new Error('authUtils not available');
    }
    const resp = await window.authUtils.authenticatedFetch(url, options);
    if (!resp) throw new Error('Not authenticated');
    return resp;
  }

  async function loadAdminPrices() {
    const q = String(document.getElementById('adminPriceSearchInput')?.value || '').trim();
    const query = q ? `?q=${encodeURIComponent(q)}` : '';
    const resp = await apiFetch(`/admin/subscription/prices${query}`);
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to load prices');
    }
    const data = await resp.json();
    adminPrices = Array.isArray(data) ? data : [];
  }

  async function loadAllPricesForSelect() {
    const resp = await apiFetch('/admin/subscription/prices');
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to load prices');
    }
    const data = await resp.json();
    allPricesForSelect = Array.isArray(data) ? data : [];
  }

  function slugify(input) {
    return (
      String(input || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64) || 'price'
    );
  }

  function ensureUniquePriceCode(baseCode) {
    const existing = new Set(adminPrices.map(p => String(p.code || '').toLowerCase()));
    let code = baseCode;
    let i = 2;
    while (existing.has(code.toLowerCase())) {
      code = `${baseCode}_${i++}`;
    }
    return code;
  }

  function generatePriceCode(name, billingType) {
    const base = slugify(name);
    const bt = ['monthly', 'yearly', 'one-time'].includes(String(billingType)) ? billingType : 'monthly';
    return ensureUniquePriceCode(`${base}_${bt}`);
  }

  function renderAdminPriceList() {
    const el = document.getElementById('adminPriceList');
    if (!el) return;

    if (!adminPrices.length) {
      el.innerHTML = '<div class="help">No prices yet.</div>';
      selectedIds = new Set();
      syncDeleteSelectedButton();
      return;
    }

    el.innerHTML = adminPrices
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .map(p => {
        const features =
          Object.entries(p.features || {})
            .filter(([, v]) => !!v)
            .map(([k]) => k)
            .join(', ') || 'None';

        const limits = p.limits || {};
        const teacherSeats = Number(limits.teacherSeats || 0);
        const studentSeats = Number(limits.studentSeats || 0);
        const checked = selectedIds.has(p.id) ? 'checked' : '';

        const currency = String(p.currency || 'HKD');
        const status = String(p.status || 'inactive');
        const publishState = String(p.publishState || 'draft');

        return `
          <div class="admin-subscription-row">
            <div class="admin-subscription-row-left">
              <input class="admin-subscription-checkbox" type="checkbox" data-id="${p.id}" ${checked} />
              <div style="min-width:0;">
                <div class="admin-subscription-row-title">${p.name}</div>
                <div class="admin-subscription-row-meta">
                  <span><strong>${currency} ${Number(p.amount || 0)}</strong></span>
                  <span>${p.billingType}</span>
                  <span class="admin-subscription-tag ${publishState}">${publishState.toUpperCase()}</span>
                  <span class="admin-subscription-tag ${status}">${status.toUpperCase()}</span>
                  <span>Teacher seats: ${teacherSeats}</span>
                  <span>Student seats: ${studentSeats}</span>
                  <span>Features: ${features}</span>
                </div>
              </div>
            </div>
            <div class="admin-subscription-row-actions">
              <button class="btn btn-secondary btn-small" type="button" data-action="edit" data-id="${p.id}">Edit</button>
              <button class="btn btn-secondary btn-small" type="button" data-action="clone" data-id="${p.id}">Clone</button>
              <div class="admin-subscription-code" title="Price Code">${p.code}</div>
            </div>
          </div>
        `;
      })
      .join('');

    syncDeleteSelectedButton();
  }

  function formatPackageDiscount(p) {
    const t = String(p.discountType || 'none');
    const v = Number(p.discountValue || 0);
    if (t === 'percent') return `${v}%`;
    if (t === 'fixed') return `${v}`;
    return 'None';
  }

  function formatPackageValidity(p) {
    const from = String(p.validFrom || '');
    const to = String(p.validTo || '');
    if (!from && !to) return 'No limit';
    if (from && !to) return `From ${from}`;
    if (!from && to) return `Until ${to}`;
    return `${from} → ${to}`;
  }

  function syncDeleteSelectedPackagesButton() {
    const btn = document.getElementById('adminDeleteSelectedPackagesBtn');
    if (!btn) return;
    btn.disabled = selectedPackageIds.size === 0;
  }

  async function loadAdminSubscriptionPackages() {
    const q = String(document.getElementById('adminPackageSearchInput')?.value || '').trim();
    const query = q ? `?q=${encodeURIComponent(q)}` : '';
    const resp = await apiFetch(`/admin/subscription/packages${query}`);
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to load packages');
    }
    const data = await resp.json();
    adminSubscriptionPackages = Array.isArray(data) ? data : [];
  }

  function renderAdminPackageList() {
    const el = document.getElementById('adminPackageList');
    if (!el) return;

    if (!adminSubscriptionPackages.length) {
      el.innerHTML = '<div class="help">No packages yet.</div>';
      selectedPackageIds = new Set();
      syncDeleteSelectedPackagesButton();
      return;
    }

    el.innerHTML = adminSubscriptionPackages
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .map(p => {
        const checked = selectedPackageIds.has(p.id) ? 'checked' : '';
        const status = String(p.status || 'inactive');
        const publishState = String(p.publishState || 'draft');
        const expired = Boolean(p.expired);
        return `
          <div class="admin-subscription-row">
            <div class="admin-subscription-row-left">
              <input class="admin-subscription-checkbox" type="checkbox" data-package-id="${p.id}" ${checked} />
              <div style="min-width:0;">
                <div class="admin-subscription-row-title">${p.name}</div>
                <div class="admin-subscription-row-meta">
                  <span>Price: ${p.priceCode || '-'}</span>
                  <span>${p.currency ? `Currency: ${p.currency}` : ''}</span>
                  <span>Qty: ${Number(p.quantity || 1)}</span>
                  <span>Discount: ${formatPackageDiscount(p)}</span>
                  <span>Validity: ${formatPackageValidity(p)}</span>
                  ${expired ? '<span class="admin-subscription-tag expired">EXPIRED</span>' : ''}
                  <span class="admin-subscription-tag ${publishState}">${publishState.toUpperCase()}</span>
                  <span class="admin-subscription-tag ${status}">${status.toUpperCase()}</span>
                </div>
              </div>
            </div>
            <div class="admin-subscription-row-actions">
              <button class="btn btn-secondary btn-small" type="button" data-action="edit-package" data-id="${p.id}">Edit</button>
              <button class="btn btn-secondary btn-small" type="button" data-action="clone-package" data-id="${p.id}">Clone</button>
              <div class="admin-subscription-code" title="Package ID">${p.id}</div>
            </div>
          </div>
        `;
      })
      .join('');

    syncDeleteSelectedPackagesButton();
  }

  function setSelectOptions(selectEl, prices, selectedPriceId = '') {
    if (!selectEl) return;
    const options = prices
      .slice()
      .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))
      .map(p => `<option value="${p.id}" ${p.id === selectedPriceId ? 'selected' : ''}>${p.code}</option>`)
      .join('');
    selectEl.innerHTML = `<option value="">Select price code...</option>${options}`;
  }

  function openAdminCreatePackageModal() {
    const modal = document.getElementById('adminCreatePackageModal');
    if (!modal) return;

    activePackageEditId = null;
    document.getElementById('adminCreatePackageTitle').textContent = 'Create Package';
    document.getElementById('adminPackageName').value = '';
    document.getElementById('adminPackageStatus').value = 'inactive';
    document.getElementById('adminPackagePublishState').value = 'draft';
    document.getElementById('adminPackageQuantity').value = '1';
    document.getElementById('adminPackageDiscountType').value = 'none';
    document.getElementById('adminPackageDiscountValue').value = '0';
    document.getElementById('adminPackageDiscountValue').disabled = true;
    document.getElementById('adminPackageValidFrom').value = '';
    document.getElementById('adminPackageValidTo').value = '';

    setSelectOptions(document.getElementById('adminPackagePriceCode'), allPricesForSelect, '');
    modal.classList.add('show');
    updatePackagePricePreview();
  }

  function openAdminEditPackageModal(id) {
    const p = adminSubscriptionPackages.find(x => x.id === id);
    if (!p) return;
    const modal = document.getElementById('adminCreatePackageModal');
    if (!modal) return;

    activePackageEditId = id;
    document.getElementById('adminCreatePackageTitle').textContent = 'Edit Package';
    document.getElementById('adminPackageName').value = p.name || '';
    document.getElementById('adminPackageStatus').value = String(p.status || 'inactive');
    document.getElementById('adminPackagePublishState').value = String(p.publishState || 'draft');
    document.getElementById('adminPackageQuantity').value = String(Number(p.quantity || 1));
    document.getElementById('adminPackageDiscountType').value = String(p.discountType || 'none');
    document.getElementById('adminPackageDiscountValue').value = String(Number(p.discountValue || 0));
    document.getElementById('adminPackageDiscountValue').disabled = String(p.discountType || 'none') === 'none';
    document.getElementById('adminPackageValidFrom').value = p.validFrom || '';
    document.getElementById('adminPackageValidTo').value = p.validTo || '';

    setSelectOptions(document.getElementById('adminPackagePriceCode'), allPricesForSelect, p.priceId || '');
    modal.classList.add('show');
    updatePackagePricePreview();
  }

  function closeAdminCreatePackageModal() {
    const modal = document.getElementById('adminCreatePackageModal');
    if (!modal) return;
    modal.classList.remove('show');
  }

  function onPackageDiscountTypeChange() {
    const t = document.getElementById('adminPackageDiscountType')?.value || 'none';
    const v = document.getElementById('adminPackageDiscountValue');
    if (!v) return;
    v.disabled = t === 'none';
    if (t === 'none') v.value = '0';
    updatePackagePricePreview();
  }

  function updatePackagePricePreview() {
    const priceId = String(document.getElementById('adminPackagePriceCode')?.value || '').trim();
    const qty = Math.max(1, parseInt(document.getElementById('adminPackageQuantity')?.value || '1', 10) || 1);
    const discountType = String(document.getElementById('adminPackageDiscountType')?.value || 'none');
    const discountValue = Number(document.getElementById('adminPackageDiscountValue')?.value || 0);

    const price = allPricesForSelect.find(p => p.id === priceId) || null;
    // Backward-compat: older stored prices might not have currency. Default to HKD if a price is selected.
    const currency = price ? (price.currency || 'HKD') : '-';
    const amount = Number(price?.amount || 0);
    const subtotal = amount * qty;
    let discount = 0;
    if (discountType === 'percent') {
      const pct = Math.max(0, Math.min(100, Number.isFinite(discountValue) ? discountValue : 0));
      discount = subtotal * (pct / 100);
    } else if (discountType === 'fixed') {
      discount = Math.max(0, Number.isFinite(discountValue) ? discountValue : 0);
    }
    discount = Math.min(subtotal, discount);
    const total = Math.max(0, subtotal - discount);

    const setText = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    setText('adminPackagePreviewCurrency', currency);
    setText('adminPackagePreviewSubtotal', currency === '-' ? '-' : `${currency} ${subtotal.toFixed(2)}`);
    setText('adminPackagePreviewDiscount', currency === '-' ? '-' : `${currency} ${discount.toFixed(2)}`);
    setText('adminPackagePreviewTotal', currency === '-' ? '-' : `${currency} ${total.toFixed(2)}`);
  }

  async function saveAdminPackage() {
    const name = String(document.getElementById('adminPackageName')?.value || '').trim();
    const priceId = String(document.getElementById('adminPackagePriceCode')?.value || '').trim();
    const quantity = Math.max(1, parseInt(document.getElementById('adminPackageQuantity')?.value || '1', 10) || 1);
    const status = String(document.getElementById('adminPackageStatus')?.value || 'inactive');
    const publishState = String(document.getElementById('adminPackagePublishState')?.value || 'draft');
    const discountType = String(document.getElementById('adminPackageDiscountType')?.value || 'none');
    const discountValue = Number(document.getElementById('adminPackageDiscountValue')?.value || 0);
    const validFrom = String(document.getElementById('adminPackageValidFrom')?.value || '').trim();
    const validTo = String(document.getElementById('adminPackageValidTo')?.value || '').trim();

    if (!name) {
      alert('Package Name is required.');
      return;
    }
    if (!priceId) {
      alert('Price Code is required.');
      return;
    }
    if (!Number.isFinite(discountValue) || discountValue < 0) {
      alert('Discount Value must be >= 0.');
      return;
    }
    if (discountType === 'percent' && discountValue > 100) {
      alert('Percent discount should be between 0 and 100.');
      return;
    }
    if (validFrom && validTo && validFrom > validTo) {
      alert('Validity "From" must be earlier than or equal to "To".');
      return;
    }

    const selectedPrice = allPricesForSelect.find(p => p.id === priceId);
    const payload = {
      name,
      priceId,
      priceCode: selectedPrice?.code || '',
      quantity,
      status,
      publishState,
      discountType,
      discountValue: discountType === 'none' ? 0 : discountValue,
      validFrom,
      validTo
    };

    const isEdit = Boolean(activePackageEditId);
    const url = isEdit ? `/admin/subscription/packages/${encodeURIComponent(activePackageEditId)}` : '/admin/subscription/packages';
    const method = isEdit ? 'PUT' : 'POST';
    const resp = await apiFetch(url, { method, body: JSON.stringify(payload) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      alert(data.error || 'Failed to save package');
      return;
    }

    await loadAdminSubscriptionPackages();
    renderAdminPackageList();
    closeAdminCreatePackageModal();
  }

  function openAdminClonePackageModal(id) {
    const p = adminSubscriptionPackages.find(x => x.id === id);
    if (!p) return;
    openAdminCreatePackageModal();
    document.getElementById('adminPackageName').value = `${p.name || 'Package'} Copy`;
    document.getElementById('adminPackageQuantity').value = String(Number(p.quantity || 1));
    document.getElementById('adminPackageDiscountType').value = String(p.discountType || 'none');
    document.getElementById('adminPackageDiscountValue').value = String(Number(p.discountValue || 0));
    document.getElementById('adminPackageDiscountValue').disabled = String(p.discountType || 'none') === 'none';
    document.getElementById('adminPackageValidFrom').value = p.validFrom || '';
    document.getElementById('adminPackageValidTo').value = p.validTo || '';
    document.getElementById('adminPackageStatus').value = 'inactive';
    document.getElementById('adminPackagePublishState').value = 'draft';
    setSelectOptions(document.getElementById('adminPackagePriceCode'), allPricesForSelect, p.priceId || '');
    updatePackagePricePreview();
  }

  async function deleteSelectedPackages() {
    if (selectedPackageIds.size === 0) return;
    const ids = Array.from(selectedPackageIds);
    if (!confirm(`Delete ${ids.length} selected package(s)?`)) return;

    const resp = await apiFetch('/admin/subscription/packages/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      alert(data.error || 'Failed to delete packages');
      return;
    }

    selectedPackageIds = new Set();
    await loadAdminSubscriptionPackages();
    renderAdminPackageList();
  }

  async function loadSubscriptionAudit() {
    const q = String(document.getElementById('adminSubscriptionAuditSearch')?.value || '').trim();
    const entityType = String(document.getElementById('adminSubscriptionAuditEntityType')?.value || '').trim();
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (entityType) qs.set('entityType', entityType);
    qs.set('limit', '120');
    const resp = await apiFetch(`/admin/subscription/audit?${qs.toString()}`);
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to load audit log');
    }
    return await resp.json();
  }

  function renderSubscriptionAudit(items) {
    const el = document.getElementById('adminSubscriptionAuditList');
    if (!el) return;
    if (!Array.isArray(items) || items.length === 0) {
      el.innerHTML = '<div class="help">No audit records.</div>';
      return;
    }
    el.innerHTML = items
      .map(it => {
        const when = it.at ? new Date(it.at).toLocaleString('en-US') : '';
        const who = it.actor?.email || it.actor?.id || 'Unknown';
        const type = String(it.entityType || '').toUpperCase();
        const action = String(it.action || '').replace(/_/g, ' ').toUpperCase();
        const id = it.entityId || '';
        return `
          <div class="admin-subscription-row">
            <div style="min-width:0;">
              <div class="admin-subscription-row-title">${action} <span class="admin-subscription-tag">${type}</span></div>
              <div class="admin-subscription-row-meta">
                <span>${when}</span>
                <span>By: ${who}</span>
                ${id ? `<span>ID: ${id}</span>` : ''}
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function openAdminCreatePriceModal() {
    const modal = document.getElementById('adminCreatePriceModal');
    if (!modal) return;

    activeEditId = null;
    document.getElementById('adminCreatePriceTitle').textContent = 'Create Price';
    document.getElementById('adminPriceName').value = '';
    document.getElementById('adminPriceAmount').value = '';
    document.getElementById('adminPriceBillingType').value = 'monthly';
    document.getElementById('adminPriceCode').value = generatePriceCode('price', 'monthly');
    document.getElementById('adminPriceCurrency').value = 'HKD';
    document.getElementById('adminPriceStatus').value = 'inactive';
    document.getElementById('adminPricePublishState').value = 'draft';
    document.getElementById('adminPriceTeacherSeats').value = '0';
    document.getElementById('adminPriceStudentSeats').value = '0';
    document.getElementById('adminPriceFeatureClassView').checked = false;
    document.getElementById('adminPriceFeatureChallengeMode').checked = false;

    modal.classList.add('show');
  }

  function openAdminEditPriceModal(id) {
    const p = adminPrices.find(x => x.id === id);
    if (!p) return;

    const modal = document.getElementById('adminCreatePriceModal');
    if (!modal) return;

    activeEditId = id;
    document.getElementById('adminCreatePriceTitle').textContent = 'Edit Price';
    document.getElementById('adminPriceName').value = p.name || '';
    document.getElementById('adminPriceAmount').value = String(Number(p.amount || 0));
    document.getElementById('adminPriceBillingType').value = p.billingType || 'monthly';
    document.getElementById('adminPriceCode').value = p.code || generatePriceCode(p.name || 'price', p.billingType || 'monthly');
    document.getElementById('adminPriceCurrency').value = String(p.currency || 'HKD');
    document.getElementById('adminPriceStatus').value = String(p.status || 'inactive');
    document.getElementById('adminPricePublishState').value = String(p.publishState || 'draft');
    document.getElementById('adminPriceTeacherSeats').value = String(Number(p.limits?.teacherSeats || 0));
    document.getElementById('adminPriceStudentSeats').value = String(Number(p.limits?.studentSeats || 0));
    document.getElementById('adminPriceFeatureClassView').checked = Boolean(p.features?.classView);
    document.getElementById('adminPriceFeatureChallengeMode').checked = Boolean(p.features?.challengeMode);

    modal.classList.add('show');
  }

  function closeAdminCreatePriceModal() {
    const modal = document.getElementById('adminCreatePriceModal');
    if (!modal) return;
    modal.classList.remove('show');
  }

  function syncAdminPriceCode() {
    const name = document.getElementById('adminPriceName')?.value || '';
    const billingType = document.getElementById('adminPriceBillingType')?.value || 'monthly';
    const codeEl = document.getElementById('adminPriceCode');
    if (!codeEl) return;
    codeEl.value = generatePriceCode(name || 'price', billingType || 'monthly');
  }

  async function saveAdminPrice() {
    const name = String(document.getElementById('adminPriceName')?.value || '').trim();
    const amount = Number(document.getElementById('adminPriceAmount')?.value || 0);
    const billingType = String(document.getElementById('adminPriceBillingType')?.value || 'monthly');
    const code = String(document.getElementById('adminPriceCode')?.value || '').trim();
    const currency = String(document.getElementById('adminPriceCurrency')?.value || 'HKD');
    const status = String(document.getElementById('adminPriceStatus')?.value || 'inactive');
    const publishState = String(document.getElementById('adminPricePublishState')?.value || 'draft');
    const teacherSeats = Math.max(0, parseInt(document.getElementById('adminPriceTeacherSeats')?.value || '0', 10) || 0);
    const studentSeats = Math.max(0, parseInt(document.getElementById('adminPriceStudentSeats')?.value || '0', 10) || 0);

    if (!name) {
      alert('Name is required.');
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      alert('Price must be a valid number (>= 0).');
      return;
    }
    if (!code) {
      alert('Price Code is required.');
      return;
    }

    const features = {
      classView: Boolean(document.getElementById('adminPriceFeatureClassView')?.checked),
      challengeMode: Boolean(document.getElementById('adminPriceFeatureChallengeMode')?.checked)
    };

    const payload = {
      name,
      amount,
      billingType: ['monthly', 'yearly', 'one-time'].includes(billingType) ? billingType : 'monthly',
      currency,
      status,
      publishState,
      code,
      limits: { teacherSeats, studentSeats },
      features
    };

    const isEdit = Boolean(activeEditId);
    const url = isEdit ? `/admin/subscription/prices/${encodeURIComponent(activeEditId)}` : '/admin/subscription/prices';
    const method = isEdit ? 'PUT' : 'POST';
    const resp = await apiFetch(url, { method, body: JSON.stringify(payload) });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      alert(data.error || 'Failed to save price');
      return;
    }

    await loadAdminPrices();
    renderAdminPriceList();
    closeAdminCreatePriceModal();
  }

  function openAdminClonePriceModal(id) {
    const p = adminPrices.find(x => x.id === id);
    if (!p) return;
    openAdminCreatePriceModal();
    document.getElementById('adminPriceName').value = `${p.name || 'Price'} Copy`;
    document.getElementById('adminPriceAmount').value = String(Number(p.amount || 0));
    document.getElementById('adminPriceBillingType').value = p.billingType || 'monthly';
    document.getElementById('adminPriceCurrency').value = String(p.currency || 'HKD');
    document.getElementById('adminPriceTeacherSeats').value = String(Number(p.limits?.teacherSeats || 0));
    document.getElementById('adminPriceStudentSeats').value = String(Number(p.limits?.studentSeats || 0));
    document.getElementById('adminPriceFeatureClassView').checked = Boolean(p.features?.classView);
    document.getElementById('adminPriceFeatureChallengeMode').checked = Boolean(p.features?.challengeMode);
    // Clones should start as Draft/Inactive
    document.getElementById('adminPriceStatus').value = 'inactive';
    document.getElementById('adminPricePublishState').value = 'draft';
    syncAdminPriceCode();
  }

  function syncDeleteSelectedButton() {
    const btn = document.getElementById('adminDeleteSelectedPricesBtn');
    if (!btn) return;
    btn.disabled = selectedIds.size === 0;
  }

  async function deleteSelectedPrices() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    if (!confirm(`Delete ${ids.length} selected price(s)?`)) return;

    const resp = await apiFetch('/admin/subscription/prices/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      alert(data.error || 'Failed to delete prices');
      return;
    }

    selectedIds = new Set();
    await loadAdminPrices();
    renderAdminPriceList();
  }

  async function initAdminPriceSetting() {
    await loadAllPricesForSelect();
    await loadAdminPrices();
    await loadAdminSubscriptionPackages();

    renderAdminPriceList();
    renderAdminPackageList();

    document.getElementById('adminCreatePriceBtn')?.addEventListener('click', openAdminCreatePriceModal);
    document.getElementById('adminCreatePriceModalClose')?.addEventListener('click', closeAdminCreatePriceModal);
    document.getElementById('adminCreatePriceCancel')?.addEventListener('click', closeAdminCreatePriceModal);
    document.getElementById('adminCreatePriceSave')?.addEventListener('click', () => {
      // Save (Create or Edit)
      saveAdminPrice().catch(err => alert(err.message || 'Failed to save price'));
    });
    document.getElementById('adminDeleteSelectedPricesBtn')?.addEventListener('click', () => {
      deleteSelectedPrices().catch(err => alert(err.message || 'Failed to delete prices'));
    });

    document.getElementById('adminPriceName')?.addEventListener('input', syncAdminPriceCode);
    document.getElementById('adminPriceBillingType')?.addEventListener('change', syncAdminPriceCode);
    document.getElementById('adminPriceSearchInput')?.addEventListener('input', async () => {
      try {
        selectedIds = new Set(); // reset selection on new query
        await loadAdminPrices();
        renderAdminPriceList();
      } catch (e) {
        // ignore
      }
    });

    document.getElementById('adminCreatePriceModal')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'adminCreatePriceModal') {
        closeAdminCreatePriceModal();
      }
    });

    document.getElementById('adminPriceList')?.addEventListener('change', (e) => {
      const cb = e.target?.closest?.('input[type="checkbox"][data-id]');
      if (!cb) return;
      const id = cb.getAttribute('data-id');
      if (!id) return;
      if (cb.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      syncDeleteSelectedButton();
    });

    document.getElementById('adminPriceList')?.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('button[data-action="edit"][data-id]');
      if (btn) {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        openAdminEditPriceModal(id);
        return;
      }
      const cloneBtn = e.target?.closest?.('button[data-action="clone"][data-id]');
      if (!cloneBtn) return;
      const cloneId = cloneBtn.getAttribute('data-id');
      if (!cloneId) return;
      openAdminClonePriceModal(cloneId);
    });

    // Package Setting
    document.getElementById('adminCreatePackageBtn')?.addEventListener('click', () => {
      openAdminCreatePackageModal();
    });
    document.getElementById('adminDeleteSelectedPackagesBtn')?.addEventListener('click', () => {
      deleteSelectedPackages().catch(err => alert(err.message || 'Failed to delete packages'));
    });
    document.getElementById('adminPackageSearchInput')?.addEventListener('input', async () => {
      try {
        selectedPackageIds = new Set();
        await loadAdminSubscriptionPackages();
        renderAdminPackageList();
      } catch (e) {
        // ignore
      }
    });

    document.getElementById('adminPackageList')?.addEventListener('change', (e) => {
      const cb = e.target?.closest?.('input[type="checkbox"][data-package-id]');
      if (!cb) return;
      const id = cb.getAttribute('data-package-id');
      if (!id) return;
      if (cb.checked) selectedPackageIds.add(id);
      else selectedPackageIds.delete(id);
      syncDeleteSelectedPackagesButton();
    });

    document.getElementById('adminPackageList')?.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('button[data-action="edit-package"][data-id]');
      if (btn) {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        openAdminEditPackageModal(id);
        return;
      }
      const cloneBtn = e.target?.closest?.('button[data-action="clone-package"][data-id]');
      if (!cloneBtn) return;
      const cloneId = cloneBtn.getAttribute('data-id');
      if (!cloneId) return;
      openAdminClonePackageModal(cloneId);
    });

    document.getElementById('adminCreatePackageModalClose')?.addEventListener('click', closeAdminCreatePackageModal);
    document.getElementById('adminCreatePackageCancel')?.addEventListener('click', closeAdminCreatePackageModal);
    document.getElementById('adminCreatePackageSave')?.addEventListener('click', () => {
      saveAdminPackage().catch(err => alert(err.message || 'Failed to save package'));
    });
    document.getElementById('adminPackageDiscountType')?.addEventListener('change', onPackageDiscountTypeChange);
    document.getElementById('adminPackageDiscountValue')?.addEventListener('input', updatePackagePricePreview);
    document.getElementById('adminPackageQuantity')?.addEventListener('input', updatePackagePricePreview);
    document.getElementById('adminPackagePriceCode')?.addEventListener('change', updatePackagePricePreview);

    document.getElementById('adminCreatePackageModal')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'adminCreatePackageModal') {
        closeAdminCreatePackageModal();
      }
    });

    // Audit Log (in Discount Setting panel)
    const refreshAudit = async () => {
      try {
        const items = await loadSubscriptionAudit();
        renderSubscriptionAudit(items);
      } catch (e) {
        renderSubscriptionAudit([]);
      }
    };
    document.getElementById('adminSubscriptionAuditRefreshBtn')?.addEventListener('click', () => {
      refreshAudit().catch(() => {});
    });
    document.getElementById('adminSubscriptionAuditSearch')?.addEventListener('input', () => {
      refreshAudit().catch(() => {});
    });
    document.getElementById('adminSubscriptionAuditEntityType')?.addEventListener('change', () => {
      refreshAudit().catch(() => {});
    });
    await refreshAudit();
  }

  function switchAdminSubscriptionSideTab(tab, element) {
    document.querySelectorAll('.admin-subscription-side-tab').forEach(t => t.classList.remove('active'));
    if (element) element.classList.add('active');

    const panels = {
      price: document.getElementById('adminSubscriptionPricePanel'),
      package: document.getElementById('adminSubscriptionPackagePanel'),
      discount: document.getElementById('adminSubscriptionDiscountPanel'),
      preview: document.getElementById('adminSubscriptionPreviewPanel')
    };

    Object.values(panels).forEach(p => p?.classList.add('hidden'));
    panels[tab]?.classList.remove('hidden');

    // Refresh preview when opening
    if (tab === 'preview') {
      renderSubscriptionPreview().catch(() => {});
    }
  }

  // Expose for inline onclick in admin.html
  window.switchAdminSubscriptionSideTab = switchAdminSubscriptionSideTab;

  function formatMoney(currency, value) {
    const n = Number(value) || 0;
    const c = String(currency || 'HKD');
    return `${c} ${n.toFixed(2)}`;
  }

  function featuresToText(features) {
    const enabled = Object.entries(features || {}).filter(([, v]) => !!v).map(([k]) => k);
    return enabled.length ? enabled.join(', ') : 'None';
  }

  function calcPackagePricing(pkg, price) {
    const currency = price?.currency || pkg?.currency || 'HKD';
    const amount = Number(price?.amount || 0);
    const qty = Math.max(1, Number(pkg?.quantity || 1));
    const subtotal = amount * qty;
    const discountType = String(pkg?.discountType || 'none');
    const discountValue = Number(pkg?.discountValue || 0);
    let discount = 0;
    if (discountType === 'percent') {
      const pct = Math.max(0, Math.min(100, Number.isFinite(discountValue) ? discountValue : 0));
      discount = subtotal * (pct / 100);
    } else if (discountType === 'fixed') {
      discount = Math.max(0, Number.isFinite(discountValue) ? discountValue : 0);
    }
    discount = Math.min(subtotal, discount);
    const total = Math.max(0, subtotal - discount);
    return { currency, subtotal, discount, total };
  }

  async function renderSubscriptionPreview() {
    const container = document.getElementById('adminSubscriptionPreviewContent');
    if (!container) return;

    // Always refresh latest data for preview
    await loadAllPricesForSelect();
    await loadAdminSubscriptionPackages();

    const activeLive = adminSubscriptionPackages.filter(p => String(p.status) === 'active' && String(p.publishState) === 'live');

    const groups = {
      monthly: [],
      yearly: [],
      'one-time': []
    };

    for (const pkg of activeLive) {
      const price = allPricesForSelect.find(pr => pr.id === pkg.priceId) || allPricesForSelect.find(pr => pr.code === pkg.priceCode);
      const billingType = String(price?.billingType || 'monthly');
      if (!groups[billingType]) continue;
      groups[billingType].push({ pkg, price });
    }

    const section = (title, items) => {
      const cards = items.length
        ? `
          <div class="admin-subscription-plan-grid">
            ${items
              .slice()
              .sort((a, b) => String(a.pkg?.name || '').localeCompare(String(b.pkg?.name || '')))
              .map(({ pkg, price }) => {
                const pricing = calcPackagePricing(pkg, price);
                const hasDiscount = Number(pricing.discount) > 0.000001;
                const points = [
                  `Price code: ${price?.code || pkg.priceCode || '-'}`,
                  `Billing: ${price?.billingType || '-'}`,
                  `Teacher seats: ${price?.limits?.teacherSeats ?? '-'}`,
                  `Student seats: ${price?.limits?.studentSeats ?? '-'}`,
                  `Features: ${featuresToText(price?.features)}`,
                  `Quantity: ${pkg.quantity}`,
                  `Discount: ${pkg.discountType === 'percent' ? `${pkg.discountValue}%` : pkg.discountType === 'fixed' ? formatMoney(pricing.currency, pkg.discountValue) : 'None'}`,
                  `Validity: ${pkg.validFrom || pkg.validTo ? `${pkg.validFrom || '—'} → ${pkg.validTo || '—'}` : 'No limit'}`
                ];

                return `
                  <div class="admin-subscription-plan-card">
                    <h4 class="admin-subscription-plan-name">${pkg.name}</h4>
                    <div class="admin-subscription-plan-prices">
                      ${hasDiscount ? `<span class="admin-subscription-plan-price-original">${formatMoney(pricing.currency, pricing.subtotal)}</span>` : ''}
                      <span class="admin-subscription-plan-price-final">${formatMoney(pricing.currency, hasDiscount ? pricing.total : pricing.subtotal)}</span>
                    </div>
                    <ul class="admin-subscription-plan-points">
                      ${points.map(t => `<li>${t}</li>`).join('')}
                    </ul>
                  </div>
                `;
              })
              .join('')}
          </div>
        `
        : `<div class="help" style="margin:0;">No active plans.</div>`;

      return `
        <section class="admin-subscription-preview-section">
          <h4 class="admin-subscription-preview-title">${title}</h4>
          ${cards}
        </section>
      `;
    };

    container.innerHTML = `
      <div class="admin-subscription-preview-sections">
        ${section('Monthly Plans', groups.monthly)}
        ${section('Yearly Plans', groups.yearly)}
        ${section('One-time Plans', groups['one-time'])}
      </div>
    `;
  }

  // Auto-init
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      initAdminPriceSetting().catch(err => console.error(err));
    });
  } else {
    initAdminPriceSetting().catch(err => console.error(err));
  }
})();


