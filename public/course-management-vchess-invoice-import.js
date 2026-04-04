/**
 * V.Chess Excel upload + apply-config / preview / apply to students & enrollments.
 * Requires SheetJS on organization.html (XLSX global).
 */
(function () {
  const MAP_KEYS = [
    ['studentName', '學生 / student_display'],
    ['externalId', '客戶編號 customer_id'],
    ['className', '班名 course_name'],
    ['timeRange', '時段 schedule_time'],
    ['lessonDates', '日期列 schedule_dates'],
    ['invoiceDate', '發票日 invoice_date'],
    ['contactPhone', '電話 contactPhone']
  ];

  let lastPreviewDigest = '';

  async function refreshVchessInvoiceImportBanner() {
    const el = document.getElementById('vchessInvoiceImportBanner');
    if (!el || !window.authUtils || !window.authUtils.authenticatedFetch) return;
    try {
      const res = await window.authUtils.authenticatedFetch('/organizations/vchess-invoices/import');
      if (!res) return;
      if (res.status === 404) {
        el.textContent =
          'API 未註冊（請重啟伺服器：停止後再執行 pnpm start 或改用 pnpm dev）· Route missing — restart server (pnpm start / pnpm dev)';
        console.warn(
          '[VChessImport] GET /api/organizations/vchess-invoices/import returned 404 — server likely started before this route existed; restart the Node process.'
        );
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data.imports) ? data.imports : [];
      if (list.length === 0) {
        el.textContent = '尚未匯入 · No imports yet';
      } else {
        const last = list[0];
        const when = last.createdAt ? new Date(last.createdAt).toLocaleString() : '';
        el.textContent =
          '最近：' +
          when +
          ' · ' +
          (last.rowCount || 0) +
          ' 筆 · ' +
          (last.fileName || '—');
      }
      populateBatchSelect(list);
    } catch (e) {
      console.warn('[VChessImport] banner', e);
    }
  }

  function populateBatchSelect(list) {
    const sel = document.getElementById('vchessImportBatchSelect');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '';
    (list || []).forEach(function (imp) {
      const o = document.createElement('option');
      o.value = imp.id;
      o.textContent = (imp.fileName || imp.id || '').slice(0, 40) + ' · ' + (imp.rowCount || 0) + ' rows';
      sel.appendChild(o);
    });
    if (cur && Array.from(sel.options).some(function (x) { return x.value === cur; })) sel.value = cur;
    else if (list && list[0]) sel.value = list[0].id;
  }

  function ensureMappingGrid() {
    const grid = document.getElementById('vchessColumnMappingGrid');
    if (!grid || grid.dataset.wired === '1') return;
    grid.dataset.wired = '1';
    grid.innerHTML = '';
    MAP_KEYS.forEach(function (pair) {
      const key = pair[0];
      const label = pair[1];
      const l = document.createElement('div');
      l.textContent = label;
      const s = document.createElement('select');
      s.id = 'vchessMap_' + key;
      s.className = 'search-input';
      s.innerHTML = '<option value="">—</option>';
      grid.appendChild(l);
      grid.appendChild(s);
    });
  }

  function splitCommaIds(raw) {
    if (!raw || typeof raw !== 'string') return [];
    return raw
      .split(',')
      .map(function (s) {
        return String(s).trim();
      })
      .filter(Boolean);
  }

  function setSelectOptions(selectEl, keys, selected) {
    if (!selectEl) return;
    const v = selected || selectEl.value;
    selectEl.innerHTML = '<option value="">—</option>';
    keys.forEach(function (k) {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = k;
      selectEl.appendChild(o);
    });
    if (v && keys.indexOf(v) >= 0) selectEl.value = v;
  }

  async function loadApplyConfigIntoForm() {
    if (!window.authUtils || !window.authUtils.authenticatedFetch) return;
    const res = await window.authUtils.authenticatedFetch('/organizations/vchess-invoices/apply-config');
    if (!res || !res.ok) return;
    const data = await res.json();
    const cfg = data.applyConfig || {};
    const roles = cfg.columnRoles || {};
    const mf = document.getElementById('vchessStudentMatchField');
    if (mf && cfg.studentMatchField) mf.value = cfg.studentMatchField;
    const ct = document.getElementById('vchessCreateTimetableIfMissing');
    if (ct) ct.checked = !!cfg.createTimetableIfMissing;
    const dc = document.getElementById('vchessDefaultCourseIds');
    if (dc && Array.isArray(cfg.defaultCourseIds)) dc.value = cfg.defaultCourseIds.join(', ');
    const dt = document.getElementById('vchessDefaultTeacherIds');
    if (dt && Array.isArray(cfg.defaultTeacherIds)) dt.value = cfg.defaultTeacherIds.join(', ');
    const dr = document.getElementById('vchessDefaultClassroom');
    if (dr && cfg.defaultClassroom != null) dr.value = String(cfg.defaultClassroom);
    MAP_KEYS.forEach(function (pair) {
      const key = pair[0];
      const sel = document.getElementById('vchessMap_' + key);
      if (sel && roles[key]) sel.dataset.saved = roles[key];
    });
  }

  async function loadBatchHeadersAndMergeConfig() {
    const sel = document.getElementById('vchessImportBatchSelect');
    const id = sel && sel.value;
    if (!id || !window.authUtils || !window.authUtils.authenticatedFetch) return;
    const res = await window.authUtils.authenticatedFetch('/organizations/vchess-invoices/import/' + encodeURIComponent(id));
    if (!res || !res.ok) return;
    const batch = await res.json();
    const rows = batch.rows || [];
    const keys = rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]) : [];
    MAP_KEYS.forEach(function (pair) {
      const key = pair[0];
      const selEl = document.getElementById('vchessMap_' + key);
      const saved = selEl && selEl.dataset.saved;
      setSelectOptions(selEl, keys, saved || selEl.value);
      if (saved && keys.indexOf(saved) >= 0) selEl.value = saved;
    });
  }

  function collectApplyConfigFromForm() {
    const mf = document.getElementById('vchessStudentMatchField');
    const columnRoles = {};
    MAP_KEYS.forEach(function (pair) {
      const key = pair[0];
      const sel = document.getElementById('vchessMap_' + key);
      if (sel && sel.value) columnRoles[key] = sel.value;
    });
    const ct = document.getElementById('vchessCreateTimetableIfMissing');
    const dc = document.getElementById('vchessDefaultCourseIds');
    const dt = document.getElementById('vchessDefaultTeacherIds');
    const dr = document.getElementById('vchessDefaultClassroom');
    return {
      columnRoles,
      studentMatchField: mf ? mf.value : 'chessComId',
      createTimetableIfMissing: ct ? !!ct.checked : false,
      defaultCourseIds: splitCommaIds(dc ? dc.value : ''),
      defaultTeacherIds: splitCommaIds(dt ? dt.value : ''),
      defaultClassroom: dr && dr.value ? String(dr.value).trim() : ''
    };
  }

  async function saveApplyConfig() {
    const out = document.getElementById('vchessImportPreviewOut');
    if (!window.authUtils || !window.authUtils.authenticatedFetch) return;
    const body = { applyConfig: collectApplyConfigFromForm() };
    const res = await window.authUtils.authenticatedFetch('/organizations/vchess-invoices/apply-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res || !res.ok) {
      if (window.showToast) window.showToast('Save mapping failed', 'error');
      return;
    }
    if (window.showToast) window.showToast('Mapping saved', 'success');
    if (out) out.textContent = '欄位對照已儲存 · Mapping saved.';
  }

  async function runPreview() {
    const out = document.getElementById('vchessImportPreviewOut');
    const applyBtn = document.getElementById('vchessApplyImportBtn');
    const sel = document.getElementById('vchessImportBatchSelect');
    const id = sel && sel.value;
    if (!id || !window.authUtils || !window.authUtils.authenticatedFetch) {
      if (out) out.textContent = '請選擇匯入批次 · Select an import batch.';
      return;
    }
    lastPreviewDigest = '';
    if (applyBtn) applyBtn.disabled = true;
    const res = await window.authUtils.authenticatedFetch(
      '/organizations/vchess-invoices/import/' + encodeURIComponent(id) + '/preview',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applyConfig: collectApplyConfigFromForm() })
      }
    );
    if (!res || !res.ok) {
      let msg = 'Preview failed';
      try {
        const e = await res.json();
        if (e.error) msg = e.error;
      } catch (e2) {
        /* ignore */
      }
      if (out) out.textContent = msg;
      if (window.showToast) window.showToast(msg, 'error');
      return;
    }
    const data = await res.json();
    lastPreviewDigest = data.digest || '';
    if (applyBtn) applyBtn.disabled = !lastPreviewDigest;
    const lines = [
      'digest: ' + (data.digest || '').slice(0, 16) + '…',
      JSON.stringify(data.summary, null, 2),
      '--- rows (errors first) ---'
    ];
    (data.rows || []).forEach(function (r) {
      const tt =
        r.timetableWillCreate ? '(new) ' + (r.timetableCreateKey || '') : r.timetableEntryId || '—';
      lines.push(
        '#' +
          r.index +
          ' student:' +
          r.studentAction +
          ' timetable:' +
          tt +
          ' dates:' +
          (r.lessonDatesYmd || []).length +
          ' err:' +
          (r.errors || []).join(';')
      );
    });
    if (out) out.textContent = lines.join('\n');
    if (window.showToast) window.showToast('Preview ready — review then Apply', 'success');
  }

  async function runApply() {
    const sel = document.getElementById('vchessImportBatchSelect');
    const id = sel && sel.value;
    if (!id || !lastPreviewDigest || !window.authUtils || !window.authUtils.authenticatedFetch) return;
    if (!window.confirm('確認寫入學生與報名？Confirm apply students & enrollments?')) return;
    const res = await window.authUtils.authenticatedFetch(
      '/organizations/vchess-invoices/import/' + encodeURIComponent(id) + '/apply',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previewDigest: lastPreviewDigest,
          applyConfig: collectApplyConfigFromForm()
        })
      }
    );
    const out = document.getElementById('vchessImportPreviewOut');
    if (!res || !res.ok) {
      let msg = 'Apply failed';
      try {
        const e = await res.json();
        if (e.error) msg = e.error;
      } catch (e2) {
        /* ignore */
      }
      if (out) out.textContent = msg;
      if (window.showToast) window.showToast(msg, 'error');
      return;
    }
    const data = await res.json();
    lastPreviewDigest = '';
    const applyBtn = document.getElementById('vchessApplyImportBtn');
    if (applyBtn) applyBtn.disabled = true;
    if (out) out.textContent = JSON.stringify(data, null, 2);
    if (window.showToast) window.showToast('Apply completed', 'success');
  }

  function wireApplyUi() {
    ensureMappingGrid();
    const saveBtn = document.getElementById('vchessSaveApplyConfigBtn');
    const prevBtn = document.getElementById('vchessPreviewApplyBtn');
    const appBtn = document.getElementById('vchessApplyImportBtn');
    const batchSel = document.getElementById('vchessImportBatchSelect');
    if (saveBtn && !saveBtn.dataset.wired) {
      saveBtn.dataset.wired = '1';
      saveBtn.addEventListener('click', function () {
        saveApplyConfig();
      });
    }
    if (prevBtn && !prevBtn.dataset.wired) {
      prevBtn.dataset.wired = '1';
      prevBtn.addEventListener('click', function () {
        runPreview();
      });
    }
    if (appBtn && !appBtn.dataset.wired) {
      appBtn.dataset.wired = '1';
      appBtn.addEventListener('click', function () {
        runApply();
      });
    }
    if (batchSel && !batchSel.dataset.wired) {
      batchSel.dataset.wired = '1';
      batchSel.addEventListener('change', function () {
        loadBatchHeadersAndMergeConfig();
      });
    }
  }

  window.initVchessImportApplyUi = async function initVchessImportApplyUi() {
    wireApplyUi();
    await loadApplyConfigIntoForm();
    await refreshVchessInvoiceImportBanner();
    await loadBatchHeadersAndMergeConfig();
  };

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
        if (resp.status === 404) {
          msg =
            'API 未註冊，請重啟伺服器（pnpm start / pnpm dev）· Server restart required (404)';
        } else {
          try {
            const err = await resp.json();
            if (err.error) msg = err.error;
          } catch (e) {
            /* ignore */
          }
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
      await loadBatchHeadersAndMergeConfig();
    } catch (e) {
      console.error('[VChessImport]', e);
      if (status) status.textContent = '錯誤：' + (e && e.message ? e.message : String(e));
    } finally {
      input.value = '';
    }
  };

  window.refreshVchessInvoiceImportBanner = refreshVchessInvoiceImportBanner;
})();
