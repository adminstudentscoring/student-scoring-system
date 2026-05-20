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

  function formatPricePerPeriod(currency, value, billingType) {
    const n = Number(value) || 0;
    const bt = String(billingType || '');
    const amountText = `$${n.toFixed(2)}`;
    if (bt === 'yearly') return `${amountText} per Year`;
    if (bt === 'one-time') return `${amountText} one-time`;
    return `${amountText} per Month`;
  }

  function formatMonthlyFromPackageTotal(value, quantity) {
    const total = Number(value) || 0;
    const qty = Math.max(1, Number(quantity) || 1);
    return `$${(total / qty).toFixed(2)} per Month`;
  }

  function getPriceMonthlyEquivalent(amount, billingType) {
    const n = Number(amount) || 0;
    const bt = String(billingType || '');
    if (bt === 'yearly') return n / 12;
    return n; // monthly + one-time fall back to raw amount
  }

  function getPackageMonthlyEquivalent(pkg, price, pricing, hasDiscount) {
    const bt = String(price?.billingType || 'monthly');
    const finalTotal = hasDiscount ? Number(pricing.total) : Number(pricing.subtotal);
    if (bt === 'one-time') return finalTotal;
    const qty = Math.max(1, Number(pkg?.quantity) || 1);
    return finalTotal / qty;
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

    const activeLivePrices = allPricesForSelect.filter(p => String(p.status) === 'active' && String(p.publishState) === 'live');

    const renderPriceCards = (prices) => {
      if (!prices.length) return `<div class="help" style="margin:0;">No active plans.</div>`;
      return `
        <div class="admin-subscription-plan-grid">
          ${prices
            .slice()
            .sort((a, b) => {
              const va = getPriceMonthlyEquivalent(a.amount, a.billingType);
              const vb = getPriceMonthlyEquivalent(b.amount, b.billingType);
              if (va !== vb) return va - vb;
              return String(a.name || '').localeCompare(String(b.name || ''));
            })
            .map(p => {
              const points = [
                `Price code: ${p.code || '-'}`,
                `Billing: ${p.billingType || '-'}`,
                `Teacher seats: ${p?.limits?.teacherSeats ?? '-'}`,
                `Student seats: ${p?.limits?.studentSeats ?? '-'}`,
                `Features: ${featuresToText(p?.features)}`
              ];
              return `
                <div class="admin-subscription-plan-card">
                  <h4 class="admin-subscription-plan-name">${p.name}</h4>
                  <div class="admin-subscription-plan-prices">
                    <span class="admin-subscription-plan-price-final">${formatPricePerPeriod(p.currency || 'HKD', Number(p.amount || 0), p.billingType)}</span>
                  </div>
                  <ul class="admin-subscription-plan-points">
                    ${points.map(t => `<li>${t}</li>`).join('')}
                  </ul>
                </div>
              `;
            })
            .join('')}
        </div>
      `;
    };

    const column = (title, innerHtml) => `
      <section class="admin-subscription-preview-section">
        <h4 class="admin-subscription-preview-title">${title}</h4>
        ${innerHtml}
      </section>
    `;

    container.innerHTML = `
      <div class="admin-subscription-preview-sections admin-subscription-preview-columns admin-subscription-preview-plan-only">
        ${column('Plan', renderPriceCards(activeLivePrices))}
      </div>
    `;
