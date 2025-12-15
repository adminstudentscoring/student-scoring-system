// Admin - Subscription Setting (placeholder UI)
// Extracted from public/admin.html for easier maintenance.
(function () {
  const subscriptionPackages = [
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
      features: { classView: true, challengeMode: true, runningQueen: true, royalExchange: false }
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
      features: { classView: true, challengeMode: true, runningQueen: true, royalExchange: true }
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
      features: { classView: true, challengeMode: true, runningQueen: true, royalExchange: true }
    }
  ];
  let activeSubscriptionPackageId = subscriptionPackages[0]?.id || null;

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
    setValue('featureRunningQueen', p.features?.runningQueen);
    setValue('featureRoyalExchange', p.features?.royalExchange);
  }

  function renderSubscriptionPackageList() {
    const listEl = document.getElementById('subscriptionPackageList');
    if (!listEl) return;
    const query = (document.getElementById('subscriptionSearchInput')?.value || '').trim().toLowerCase();
    const filtered = subscriptionPackages.filter(
      p => !query || p.name.toLowerCase().includes(query) || p.code.toLowerCase().includes(query)
    );

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
    renderSubscriptionPackageList();
    renderSubscriptionPackageDetail();
  }

  // Expose for inline onclick in admin.html
  window.subscriptionPackages = subscriptionPackages;
  window.renderSubscriptionPackageList = renderSubscriptionPackageList;
  window.renderSubscriptionPackageDetail = renderSubscriptionPackageDetail;
  window.selectSubscriptionPackage = selectSubscriptionPackage;
  window.toggleSubscriptionPackageActive = toggleSubscriptionPackageActive;
  window.switchSubscriptionSubTab = switchSubscriptionSubTab;
  window.initSubscriptionUi = initSubscriptionUi;

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initSubscriptionUi);
  } else {
    initSubscriptionUi();
  }
})();


