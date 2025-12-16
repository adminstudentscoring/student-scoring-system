// Admin - Subscription Setting (extracted from admin.html)
// UI text and identifiers remain in English.
(function () {
  const ADMIN_PRICES_STORAGE_KEY = 'adminSubscriptionPrices_v1';
  let adminPrices = [];

  function loadAdminPrices() {
    try {
      const raw = localStorage.getItem(ADMIN_PRICES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      adminPrices = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      adminPrices = [];
    }
  }

  function saveAdminPrices() {
    try {
      localStorage.setItem(ADMIN_PRICES_STORAGE_KEY, JSON.stringify(adminPrices));
    } catch (e) {
      // ignore
    }
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

        return `
          <div class="admin-subscription-row">
            <div style="min-width:0;">
              <div class="admin-subscription-row-title">${p.name}</div>
              <div class="admin-subscription-row-meta">
                <span><strong>${Number(p.amount || 0)}</strong></span>
                <span>${p.billingType}</span>
                <span>Features: ${features}</span>
              </div>
            </div>
            <div class="admin-subscription-code" title="Price Code">${p.code}</div>
          </div>
        `;
      })
      .join('');
  }

  function openAdminCreatePriceModal() {
    const modal = document.getElementById('adminCreatePriceModal');
    if (!modal) return;

    document.getElementById('adminPriceName').value = '';
    document.getElementById('adminPriceAmount').value = '';
    document.getElementById('adminPriceBillingType').value = 'monthly';
    document.getElementById('adminPriceCode').value = generatePriceCode('price', 'monthly');
    document.getElementById('adminPriceFeatureClassView').checked = false;
    document.getElementById('adminPriceFeatureChallengeMode').checked = false;

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

  function createAdminPrice() {
    const name = String(document.getElementById('adminPriceName')?.value || '').trim();
    const amount = Number(document.getElementById('adminPriceAmount')?.value || 0);
    const billingType = String(document.getElementById('adminPriceBillingType')?.value || 'monthly');
    const code = String(document.getElementById('adminPriceCode')?.value || '').trim();

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

    adminPrices.push({
      id: `price_${Date.now()}`,
      name,
      amount,
      billingType: ['monthly', 'yearly', 'one-time'].includes(billingType) ? billingType : 'monthly',
      code: ensureUniquePriceCode(code),
      features,
      createdAt: new Date().toISOString()
    });

    saveAdminPrices();
    renderAdminPriceList();
    closeAdminCreatePriceModal();
  }

  function initAdminPriceSetting() {
    loadAdminPrices();
    renderAdminPriceList();

    document.getElementById('adminCreatePriceBtn')?.addEventListener('click', openAdminCreatePriceModal);
    document.getElementById('adminCreatePriceModalClose')?.addEventListener('click', closeAdminCreatePriceModal);
    document.getElementById('adminCreatePriceCancel')?.addEventListener('click', closeAdminCreatePriceModal);
    document.getElementById('adminCreatePriceSave')?.addEventListener('click', createAdminPrice);

    document.getElementById('adminPriceName')?.addEventListener('input', syncAdminPriceCode);
    document.getElementById('adminPriceBillingType')?.addEventListener('change', syncAdminPriceCode);

    document.getElementById('adminCreatePriceModal')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'adminCreatePriceModal') {
        closeAdminCreatePriceModal();
      }
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
    window.addEventListener('DOMContentLoaded', initAdminPriceSetting);
  } else {
    initAdminPriceSetting();
  }
})();


