// Admin - Subscription Setting (placeholder UI)
// Extracted from public/admin.html for easier maintenance.
(function () {
  const STORAGE_KEY = 'adminSubscriptionPackages_v1';

  const DEFAULT_PACKAGES = [
    {
      id: 'starter_monthly',
      name: 'Starter',
      code: 'starter_monthly',
      status: 'active',
      currency: 'HKD',
      billingType: 'monthly',
      price: 199,
      badge: 'popular',
      limits: { teacherSeats: 2, studentSeats: 80 },
      features: { classView: true, challengeMode: true }
    },
    {
      id: 'pro_yearly',
      name: 'Pro',
      code: 'pro_yearly',
      status: 'active',
      currency: 'USD',
      billingType: 'yearly',
      price: 499,
      badge: 'bestValue',
      limits: { teacherSeats: 10, studentSeats: 600 },
      features: { classView: true, challengeMode: true }
    },
    {
      id: 'lifetime_one_time',
      name: 'Lifetime',
      code: 'lifetime_one_time',
      status: 'inactive',
      currency: 'HKD',
      billingType: 'one-time',
      price: 9999,
      badge: '',
      limits: { teacherSeats: 999, studentSeats: 99999 },
      features: { classView: true, challengeMode: true }
    }
  ];

  function loadPackagesFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function savePackagesToStorage(packages) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(packages));
    } catch (e) {
      // ignore
    }
  }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText =
      'position:fixed; bottom:20px; left:50%; transform:translateX(-50%);' +
      `background:${type === 'error' ? '#ef4444' : '#10b981'}; color:white;` +
      'padding:10px 16px; border-radius:10px; z-index:9999; box-shadow:0 10px 24px rgba(0,0,0,0.18);';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  let subscriptionPackages = loadPackagesFromStorage() || DEFAULT_PACKAGES;
  let activeSubscriptionPackageId = subscriptionPackages[0]?.id || null;
  let formListenersBound = false;
  let isRenderingForm = false;

  function formatMoney(currency, value) {
    const n = Number(value) || 0;
    return `${currency} ${n.toFixed(2)}`;
  }

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') {
      el.checked = Boolean(value);
    } else {
      el.value = value ?? '';
    }
  }

  function renderSubscriptionPackageDetail() {
    const p = subscriptionPackages.find(x => x.id === activeSubscriptionPackageId);
    if (!p) return;
    isRenderingForm = true;
    setValue('pkgName', p.name);
    setValue('pkgCode', p.code);
    setValue('pkgStatus', p.status);
    setValue('pkgCurrency', p.currency);
    setValue('pkgBillingType', p.billingType);
    setValue('pkgPrice', p.price);
    setValue('pkgBadge', p.badge);
    setValue('limitTeachers', p.limits?.teacherSeats);
    setValue('limitStudents', p.limits?.studentSeats);
    setValue('featureClassView', p.features?.classView);
    setValue('featureChallengeMode', p.features?.challengeMode);
    isRenderingForm = false;
  }

  function renderSubscriptionPackageList() {
    const listEl = document.getElementById('subscriptionPackageList');
    if (!listEl) return;
    const query = (document.getElementById('subscriptionSearchInput')?.value || '').trim().toLowerCase();
    const filtered = subscriptionPackages.filter(p => {
      if (p.status === 'archived') return false; // archived packages are hidden
      if (!query) return true;
      return p.name.toLowerCase().includes(query) || p.code.toLowerCase().includes(query);
    });

    if (!filtered.length) {
      listEl.innerHTML = '<div class="help">No packages found.</div>';
      return;
    }

    listEl.innerHTML = filtered
      .map(p => {
        const isActive = p.id === activeSubscriptionPackageId;
        const statusTag =
          p.status === 'archived'
            ? '<span class="tag archived">Archived</span>'
            : p.status === 'active'
              ? '<span class="tag active">Active</span>'
              : '<span class="tag">Inactive</span>';
        const oneTimeTag = p.billingType === 'one-time' ? '<span class="tag oneTime">One-time</span>' : '';
        const canToggle = p.status !== 'archived';
        const isOn = p.status === 'active';

        return `
          <div class="package-item ${isActive ? 'active' : ''}" onclick="selectSubscriptionPackage('${p.id}')">
            <div class="package-item-row">
              <div class="package-item-main">
                <div class="package-item-title">${p.name}</div>
                <div class="package-item-meta">
                  <span>${formatMoney(p.currency, p.price)}</span>
                  <span>${p.billingType}</span>
                  ${statusTag}
                  ${oneTimeTag}
                </div>
              </div>
              <button
                class="package-toggle ${isOn ? 'on' : ''}"
                ${canToggle ? '' : 'disabled'}
                title="${canToggle ? 'Toggle Active/Inactive' : 'Archived packages cannot be toggled'}"
                onclick="event.stopPropagation(); toggleSubscriptionPackageActive('${p.id}')"
                type="button"
              >
                <span class="package-toggle-switch"><span class="package-toggle-knob"></span></span>
                <span>${isOn ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function selectSubscriptionPackage(id) {
    activeSubscriptionPackageId = id;
    renderSubscriptionPackageList();
    renderSubscriptionPackageDetail();
  }

  function toggleSubscriptionPackageActive(id) {
    const pkg = subscriptionPackages.find(p => p.id === id);
    if (!pkg) return;
    if (pkg.status === 'archived') return;
    pkg.status = pkg.status === 'active' ? 'inactive' : 'active';
    savePackagesToStorage(subscriptionPackages);
    renderSubscriptionPackageList();
    renderSubscriptionPackageDetail();
  }

  function switchSubscriptionSubTab(tab, element) {
    document.querySelectorAll('#subscriptionSubTabs .subtab').forEach(t => t.classList.remove('active'));
    if (element) element.classList.add('active');
    // Only one subtab for now; placeholder for future expansion
    document.querySelectorAll('.subscription-subtab-content').forEach(c => c.classList.add('hidden'));
    const target = document.getElementById(`subscription${tab.charAt(0).toUpperCase()}${tab.slice(1)}`);
    if (target) target.classList.remove('hidden');
  }

  function initSubscriptionUi() {
    document.getElementById('subscriptionSearchInput')?.addEventListener('input', renderSubscriptionPackageList);
    document.getElementById('subscriptionNewBtn')?.addEventListener('click', createNewPackage);
    document.getElementById('subscriptionSaveBtn')?.addEventListener('click', saveActivePackage);
    document.getElementById('subscriptionArchiveBtn')?.addEventListener('click', archiveActivePackage);
    bindDetailFormListeners();
    renderSubscriptionPackageList();
    renderSubscriptionPackageDetail();
  }

  function slugify(input) {
    return String(input || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || 'package';
  }

  function ensureUniqueCode(baseCode) {
    const existing = new Set(subscriptionPackages.map(p => String(p.code || '').toLowerCase()));
    let code = baseCode;
    let i = 2;
    while (existing.has(code.toLowerCase())) {
      code = `${baseCode}_${i++}`;
    }
    return code;
  }

  function ensureUniqueId(baseId) {
    const existing = new Set(subscriptionPackages.map(p => String(p.id || '').toLowerCase()));
    let id = baseId;
    let i = 2;
    while (existing.has(id.toLowerCase())) {
      id = `${baseId}_${i++}`;
    }
    return id;
  }

  function createNewPackage() {
    const name = prompt('New package name?', 'New Package');
    if (!name) return;

    const currency = (prompt('Currency (HKD or USD)?', 'HKD') || 'HKD').trim().toUpperCase();
    const normalizedCurrency = currency === 'USD' ? 'USD' : 'HKD';

    const billingTypeRaw = (prompt('Billing type (monthly / yearly / one-time)?', 'monthly') || 'monthly')
      .trim()
      .toLowerCase();
    const normalizedBillingType = ['monthly', 'yearly', 'one-time'].includes(billingTypeRaw) ? billingTypeRaw : 'monthly';

    const priceRaw = prompt(`Price (${normalizedCurrency})?`, '0');
    const price = Math.max(0, Number(priceRaw) || 0);

    const base = slugify(name);
    const baseCode = ensureUniqueCode(`${base}_${normalizedBillingType}`);
    const baseId = ensureUniqueId(baseCode);

    const pkg = {
      id: baseId,
      name: String(name).trim(),
      code: baseCode,
      status: 'inactive',
      currency: normalizedCurrency,
      billingType: normalizedBillingType,
      price,
      badge: '',
      limits: { teacherSeats: 0, studentSeats: 0 },
      features: { classView: false, challengeMode: false, runningQueen: false, royalExchange: false }
    };

    subscriptionPackages = [pkg, ...subscriptionPackages];
    activeSubscriptionPackageId = pkg.id;
    savePackagesToStorage(subscriptionPackages);
    renderSubscriptionPackageList();
    renderSubscriptionPackageDetail();
  }

  function getActivePackage() {
    return subscriptionPackages.find(p => p.id === activeSubscriptionPackageId) || null;
  }

  function saveActivePackage() {
    const p = getActivePackage();
    if (!p) {
      showToast('No package selected.', 'error');
      return;
    }
    const name = String(p.name || '').trim();
    const code = String(p.code || '').trim();
    if (!name) {
      showToast('Package Name is required.', 'error');
      return;
    }
    if (!code) {
      showToast('Package Code is required.', 'error');
      return;
    }
    const dupe = subscriptionPackages.some(x => x.id !== p.id && String(x.code || '').toLowerCase() === code.toLowerCase());
    if (dupe) {
      showToast('Package Code must be unique.', 'error');
      return;
    }
    // Persist (most fields auto-save already; this is an explicit save + validation)
    p.name = name;
    p.code = code;
    savePackagesToStorage(subscriptionPackages);
    renderSubscriptionPackageList();
    renderSubscriptionPackageDetail();
    showToast('Saved.');
  }

  function archiveActivePackage() {
    const p = getActivePackage();
    if (!p) {
      showToast('No package selected.', 'error');
      return;
    }
    if (!confirm(`Archive "${p.name}"? It will be hidden from the list.`)) return;
    p.status = 'archived';
    savePackagesToStorage(subscriptionPackages);

    // Select next visible package
    const next = subscriptionPackages.find(x => x.status !== 'archived');
    activeSubscriptionPackageId = next ? next.id : null;
    renderSubscriptionPackageList();
    if (activeSubscriptionPackageId) {
      renderSubscriptionPackageDetail();
    } else {
      // Clear form if nothing left
      ['pkgName','pkgCode','pkgStatus','pkgCurrency','pkgBillingType','pkgPrice','pkgBadge','limitTeachers','limitStudents'].forEach(id => setValue(id, ''));
      ['featureClassView','featureChallengeMode'].forEach(id => setValue(id, false));
    }
    showToast('Archived.');
  }

  function bindDetailFormListeners() {
    if (formListenersBound) return;
    formListenersBound = true;

    const getActive = () => subscriptionPackages.find(p => p.id === activeSubscriptionPackageId);
    const update = (fn) => {
      if (isRenderingForm) return;
      const p = getActive();
      if (!p) return;
      fn(p);
      savePackagesToStorage(subscriptionPackages);
      renderSubscriptionPackageList();
    };

    document.getElementById('pkgName')?.addEventListener('input', (e) => update(p => { p.name = e.target.value; }));
    document.getElementById('pkgCode')?.addEventListener('input', (e) => update(p => { p.code = e.target.value; }));
    document.getElementById('pkgStatus')?.addEventListener('change', (e) => update(p => { p.status = e.target.value; }));
    document.getElementById('pkgCurrency')?.addEventListener('change', (e) => update(p => { p.currency = e.target.value; }));
    document.getElementById('pkgBillingType')?.addEventListener('change', (e) => update(p => { p.billingType = e.target.value; }));
    document.getElementById('pkgPrice')?.addEventListener('input', (e) => update(p => { p.price = Math.max(0, Number(e.target.value) || 0); }));
    document.getElementById('pkgBadge')?.addEventListener('change', (e) => update(p => { p.badge = e.target.value; }));
    document.getElementById('limitTeachers')?.addEventListener('input', (e) => update(p => { p.limits.teacherSeats = Math.max(0, parseInt(e.target.value || '0', 10) || 0); }));
    document.getElementById('limitStudents')?.addEventListener('input', (e) => update(p => { p.limits.studentSeats = Math.max(0, parseInt(e.target.value || '0', 10) || 0); }));

    document.getElementById('featureClassView')?.addEventListener('change', (e) => update(p => { p.features.classView = Boolean(e.target.checked); }));
    document.getElementById('featureChallengeMode')?.addEventListener('change', (e) => update(p => { p.features.challengeMode = Boolean(e.target.checked); }));

    // No further wiring needed: selectSubscriptionPackage already renders detail.
  }

  // Expose for inline onclick in admin.html
  window.subscriptionPackages = subscriptionPackages;
  window.renderSubscriptionPackageList = renderSubscriptionPackageList;
  window.renderSubscriptionPackageDetail = renderSubscriptionPackageDetail;
  window.selectSubscriptionPackage = selectSubscriptionPackage;
  window.toggleSubscriptionPackageActive = toggleSubscriptionPackageActive;
  window.switchSubscriptionSubTab = switchSubscriptionSubTab;
  window.initSubscriptionUi = initSubscriptionUi;
  window.createNewSubscriptionPackage = createNewPackage;

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initSubscriptionUi);
  } else {
    initSubscriptionUi();
  }
})();


