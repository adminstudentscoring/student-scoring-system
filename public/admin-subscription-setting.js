// Admin - Subscription Setting (extracted from admin.html)
// UI text and identifiers remain in English.
(function () {
  let adminPrices = [];
  let selectedIds = new Set();
  let activeEditId = null;

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

        return `
          <div class="admin-subscription-row">
            <div class="admin-subscription-row-left">
              <input class="admin-subscription-checkbox" type="checkbox" data-id="${p.id}" ${checked} />
              <div style="min-width:0;">
                <div class="admin-subscription-row-title">${p.name}</div>
                <div class="admin-subscription-row-meta">
                  <span><strong>${Number(p.amount || 0)}</strong></span>
                  <span>${p.billingType}</span>
                  <span>Teacher seats: ${teacherSeats}</span>
                  <span>Student seats: ${studentSeats}</span>
                  <span>Features: ${features}</span>
                </div>
              </div>
            </div>
            <div class="admin-subscription-row-actions">
              <button class="btn btn-secondary btn-small" type="button" data-action="edit" data-id="${p.id}">Edit</button>
              <div class="admin-subscription-code" title="Price Code">${p.code}</div>
            </div>
          </div>
        `;
      })
      .join('');

    syncDeleteSelectedButton();
  }

  function openAdminCreatePriceModal() {
    const modal = document.getElementById('adminCreatePriceModal');
    if (!modal) return;

    activeEditId = null;
    document.getElementById('adminPriceName').value = '';
    document.getElementById('adminPriceAmount').value = '';
    document.getElementById('adminPriceBillingType').value = 'monthly';
    document.getElementById('adminPriceCode').value = generatePriceCode('price', 'monthly');
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
    document.getElementById('adminPriceName').value = p.name || '';
    document.getElementById('adminPriceAmount').value = String(Number(p.amount || 0));
    document.getElementById('adminPriceBillingType').value = p.billingType || 'monthly';
    document.getElementById('adminPriceCode').value = p.code || generatePriceCode(p.name || 'price', p.billingType || 'monthly');
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
    await loadAdminPrices();
    renderAdminPriceList();

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
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      if (!id) return;
      openAdminEditPriceModal(id);
    });
  }

  function switchAdminSubscriptionSideTab(tab, element) {
    document.querySelectorAll('.admin-subscription-side-tab').forEach(t => t.classList.remove('active'));
    if (element) element.classList.add('active');

    const panels = {
      price: document.getElementById('adminSubscriptionPricePanel'),
      package: document.getElementById('adminSubscriptionPackagePanel'),
      discount: document.getElementById('adminSubscriptionDiscountPanel')
    };

    Object.values(panels).forEach(p => p?.classList.add('hidden'));
    panels[tab]?.classList.remove('hidden');
  }

  // Expose for inline onclick in admin.html
  window.switchAdminSubscriptionSideTab = switchAdminSubscriptionSideTab;

  // Auto-init
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      initAdminPriceSetting().catch(err => console.error(err));
    });
  } else {
    initAdminPriceSetting().catch(err => console.error(err));
  }
})();


