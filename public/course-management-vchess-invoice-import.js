/**
 * Upload V.Chess invoice .xlsx (same columns as PDF→Excel converter) into org storage.
 * Requires SheetJS on organization.html (XLSX global).
 */
(function () {
  async function refreshVchessInvoiceImportBanner() {
    const el = document.getElementById('vchessInvoiceImportBanner');
    if (!el || !window.authUtils || !window.authUtils.authenticatedFetch) return;
    try {
      const res = await window.authUtils.authenticatedFetch('/organizations/vchess-invoices/import');
      if (!res || !res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data.imports) ? data.imports : [];
      if (list.length === 0) {
        el.textContent = '尚未匯入 · No imports yet';
        return;
      }
      const last = list[0];
      const when = last.createdAt ? new Date(last.createdAt).toLocaleString() : '';
      el.textContent =
        '最近：' +
        when +
        ' · ' +
        (last.rowCount || 0) +
        ' 筆 · ' +
        (last.fileName || '—');
    } catch (e) {
      console.warn('[VChessImport] banner', e);
    }
  }

  window.handleVchessInvoiceXlsxSelected = async function (input) {
    const file = input.files && input.files[0];
    const status = document.getElementById('vchessInvoiceImportStatus');
    if (!file) return;
    if (typeof XLSX === 'undefined') {
      if (status) status.textContent = 'Excel 程式庫未載入 · Reload page';
      if (window.showToast) window.showToast('Excel library missing', 'error');
      return;
    }
    if (!window.authUtils || !window.authUtils.authenticatedFetch) {
      if (status) status.textContent = '請先登入';
      return;
    }
    if (status) status.textContent = '讀取中…';
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const name0 = wb.SheetNames && wb.SheetNames[0];
      if (!name0) {
        if (status) status.textContent = '工作表為空';
        return;
      }
      const sheet = wb.Sheets[name0];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
      if (!Array.isArray(rows) || rows.length === 0) {
        if (status) status.textContent = '沒有資料列';
        return;
      }
      const resp = await window.authUtils.authenticatedFetch('/organizations/vchess-invoices/import', {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, rows })
      });
      if (!resp) {
        if (status) status.textContent = '登入逾期';
        return;
      }
      if (!resp.ok) {
        let msg = '上傳失敗';
        try {
          const err = await resp.json();
          if (err.error) msg = err.error;
        } catch (e) {
          /* ignore */
        }
        if (status) status.textContent = msg;
        if (window.showToast) window.showToast(msg, 'error');
        return;
      }
      const out = await resp.json();
      const line =
        '已儲存 ' + (out.rowCount || rows.length) + ' 筆 · id ' + (out.id || '').slice(0, 24) + '…';
      if (status) status.textContent = line;
      if (window.showToast) window.showToast('V.Chess invoice import saved', 'success');
      await refreshVchessInvoiceImportBanner();
    } catch (e) {
      console.error('[VChessImport]', e);
      if (status) status.textContent = '錯誤：' + (e && e.message ? e.message : String(e));
    } finally {
      input.value = '';
    }
  };

  window.refreshVchessInvoiceImportBanner = refreshVchessInvoiceImportBanner;
})();
