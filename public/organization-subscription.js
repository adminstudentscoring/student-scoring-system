// Organization - Subscription (read-only view)
// Shows Admin-configured packages (from localStorage placeholder) as Monthly / Yearly sections.
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
    }
  ];

  function loadPackages() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_PACKAGES;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULT_PACKAGES;
      return parsed;
    } catch (e) {
      return DEFAULT_PACKAGES;
    }
  }

  function formatMoney(currency, value) {
    const n = Number(value) || 0;
    return `${currency} ${n.toFixed(2)}`;
  }

  function renderPlanCard(p) {
    const limits = p.limits || {};
    const features = p.features || {};

    const limitBadges = [
      { label: `Teacher seats: ${Number(limits.teacherSeats ?? 0)}`, kind: 'limit' },
      { label: `Student seats: ${Number(limits.studentSeats ?? 0)}`, kind: 'limit' }
    ];

    const featureBadges = [
      { key: 'classView', label: 'Class View' },
      { key: 'challengeMode', label: 'Challenge Mode' },
      { key: 'runningQueen', label: 'Running Queen' },
      { key: 'royalExchange', label: 'Royal Exchange' }
    ]
      .filter(f => Boolean(features[f.key]))
      .map(f => ({ label: f.label, kind: 'feature' }));

    return `
      <div class="org-plan-card">
        <div class="org-plan-card-header">
          <div>
            <p class="org-plan-name">${escapeHtml(p.name || '')}</p>
            <div class="org-plan-sub">${escapeHtml(p.code || '')}</div>
          </div>
          <div class="org-plan-price">${formatMoney(p.currency, p.price)}</div>
        </div>

        <div class="org-plan-badges">
          ${limitBadges.map(b => `<span class="org-badge ${b.kind}">${escapeHtml(b.label)}</span>`).join('')}
        </div>

        <div class="org-plan-badges">
          ${featureBadges.length ? featureBadges.map(b => `<span class="org-badge ${b.kind}">${escapeHtml(b.label)}</span>`).join('') : `<span class="org-plan-sub">No available features</span>`}
        </div>
      </div>
    `;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
  }

  function renderSubscriptionPlan() {
    const container = document.getElementById('orgSubscriptionPlanContainer');
    if (!container) return;

    const packages = loadPackages()
      .filter(p => p && p.status === 'active')
      .filter(p => p.billingType === 'monthly' || p.billingType === 'yearly');

    const monthly = packages.filter(p => p.billingType === 'monthly');
    const yearly = packages.filter(p => p.billingType === 'yearly');

    if (!packages.length) {
      container.innerHTML = '<p style="color:#666; margin:0;">No active Monthly/Yearly subscription plans configured yet.</p>';
      return;
    }

    container.innerHTML = `
      <div class="org-plan-sections">
        <div>
          <h3 class="org-plan-section-title">Monthly</h3>
          <div class="org-plan-card-grid">
            ${monthly.length ? monthly.map(renderPlanCard).join('') : '<p style="color:#666; margin:0;">No monthly plans.</p>'}
          </div>
        </div>
        <div>
          <h3 class="org-plan-section-title">Yearly</h3>
          <div class="org-plan-card-grid">
            ${yearly.length ? yearly.map(renderPlanCard).join('') : '<p style="color:#666; margin:0;">No yearly plans.</p>'}
          </div>
        </div>
      </div>
    `;
  }

  function switchOrganizationSubscriptionTab(tab, element) {
    document.querySelectorAll('.org-subscription-nav').forEach(t => t.classList.remove('active'));
    if (element) element.classList.add('active');

    // single tab for now
    if (tab === 'plan') {
      renderSubscriptionPlan();
    }
  }

  // Expose for inline onclick & organization switchTab hook
  window.switchOrganizationSubscriptionTab = switchOrganizationSubscriptionTab;
  window.loadOrganizationSubscription = renderSubscriptionPlan;

  // If user lands on Subscription directly
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      // do nothing by default; loaded when switching tab
    });
  }
})();


