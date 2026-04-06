/**
 * Settings → Sales enrollment Excel export (multi-select students).
 * Depends: auth.js, XLSX (organization.html), course-management-sales-orders (inferOrderId), sales-core (formatLessonQuotaPlainText).
 */
(function () {
  'use strict';

  const salesExportSelectedIds = new Set();
  let salesExportInitBound = false;

  function normYmdFromEnrollment(e) {
    return String(e.date || '')
      .split('T')[0]
      .split(' ')[0];
  }

  function getFilteredStudents(all, term) {
    const t = (term || '').trim().toLowerCase();
    if (!t) return all.slice();
    return all.filter(
      (s) =>
        (s.name && String(s.name).toLowerCase().includes(t)) ||
        (s.chessComId && String(s.chessComId).toLowerCase().includes(t))
    );
  }

  async function ensureStudentsLoaded() {
    let list = window.students || [];
    if (list.length === 0 && window.authUtils) {
      const response = await window.authUtils.authenticatedFetch('/students');
      if (response && response.ok) {
        const data = await response.json();
        list = Array.isArray(data) ? data : data.students || [];
        window.students = list;
      }
    }
    return list;
  }

  function renderSalesExportStudentList() {
    const container = document.getElementById('salesExportStudentList');
    const filterEl = document.getElementById('salesExportStudentFilter');
    if (!container) return;
    const term = filterEl ? filterEl.value : '';
    const all = window.students || [];
    const filtered = getFilteredStudents(all, term);
    if (filtered.length === 0) {
      container.innerHTML =
        '<div style="color:#64748b;padding:8px;">No students match. · 無符合學生（可先開啟 Sales 分頁載入名單）</div>';
      return;
    }
    container.innerHTML = filtered
      .map((s) => {
        const id = String(s.id);
        const checked = salesExportSelectedIds.has(id) ? ' checked' : '';
        return `
      <label style="display:flex;align-items:center;gap:10px;padding:6px 4px;border-bottom:1px solid #e2e8f0;cursor:pointer;">
        <input type="checkbox" class="sales-export-stu-cb" data-student-id=${JSON.stringify(id)}${checked}>
        <span style="flex:1;min-width:0;">
          <span style="font-weight:600;color:#0f172a;">${escapeHtml(s.name || '')}</span>
          <span style="color:#64748b;margin-left:8px;">${escapeHtml(s.chessComId || '')}</span>
        </span>
      </label>`;
      })
      .join('');
  }

  function bindSalesExportUiOnce() {
    if (salesExportInitBound) return;
    const list = document.getElementById('salesExportStudentList');
    const filter = document.getElementById('salesExportStudentFilter');
    const btnAll = document.getElementById('salesExportSelectAllBtn');
    const btnClear = document.getElementById('salesExportClearBtn');
    const btnDl = document.getElementById('salesExportDownloadBtn');
    if (!list || !filter || !btnAll || !btnClear || !btnDl) return;
    salesExportInitBound = true;

    filter.addEventListener('input', function () {
      renderSalesExportStudentList();
    });

    list.addEventListener('change', function (ev) {
      const t = ev.target;
      if (!t || !t.classList || !t.classList.contains('sales-export-stu-cb')) return;
      const sid = String(t.getAttribute('data-student-id') || '');
      if (!sid) return;
      if (t.checked) salesExportSelectedIds.add(sid);
      else salesExportSelectedIds.delete(sid);
    });

    btnAll.addEventListener('click', function () {
      const filtered = getFilteredStudents(window.students || [], filter.value);
      filtered.forEach((s) => salesExportSelectedIds.add(String(s.id)));
      renderSalesExportStudentList();
    });

    btnClear.addEventListener('click', function () {
      salesExportSelectedIds.clear();
      renderSalesExportStudentList();
    });

    btnDl.addEventListener('click', function () {
      downloadSalesEnrollmentExcel();
    });
  }

  async function fetchOrgOrders() {
    const r = await window.authUtils.authenticatedFetch('/organizations/orders');
    if (!r || !r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : data.orders || [];
  }

  async function fetchTeachersMap() {
    const map = new Map();
    try {
      const r = await window.authUtils.authenticatedFetch('/organizations/teachers');
      if (r && r.ok) {
        const arr = await r.json();
        (arr || []).forEach((t) => {
          if (t && t.id) map.set(String(t.id), t.name || '');
        });
      }
    } catch (e) {
      /* ignore */
    }
    return map;
  }

  function teacherDisplay(entry, teacherById) {
    if (entry && entry.teacherName) return String(entry.teacherName);
    const ids = entry && entry.teacherIds;
    if (Array.isArray(ids) && ids.length > 0) {
      const n = teacherById.get(String(ids[0]));
      if (n) return n;
    }
    return '';
  }

  function inferOrderId(e, studentId, orders) {
    const fn = window.inferOrderIdForEnrollmentDisplay;
    if (typeof fn === 'function') return fn(e, studentId, orders) || '';
    return '';
  }

  async function downloadSalesEnrollmentExcel() {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS (XLSX) not loaded. Hard-refresh this page. · 請強制重新整理');
      return;
    }
    if (!window.authUtils) {
      alert('Not signed in.');
      return;
    }
    const ids = Array.from(salesExportSelectedIds);
    if (ids.length === 0) {
      alert('請先勾選至少一位學生。 · Select at least one student.');
      return;
    }

    const btn = document.getElementById('salesExportDownloadBtn');
    const prevText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '…';
    }

    try {
      await ensureStudentsLoaded();
      if (typeof window.refreshSalesTimetableFromApi === 'function') {
        await window.refreshSalesTimetableFromApi();
      } else {
        const tr = await window.authUtils.authenticatedFetch('/organizations/timetable');
        if (tr && tr.ok) {
          const td = await tr.json();
          window.timetableEntries = td.entries || [];
          window.timetableEnrollments = td.enrollments || [];
        }
      }

      const entries = window.timetableEntries || [];
      const enrollments = window.timetableEnrollments || [];
      const orders = await fetchOrgOrders();
      const teacherById = await fetchTeachersMap();

      const headers = [
        'Student Name',
        'Student ID',
        'Account Balance',
        'Lesson Quota',
        'Class Name',
        'Time Slot',
        'Teacher',
        'Enrolled Dates',
        'Date Count',
        'Order ID'
      ];
      const rows = [headers];

      for (const sid of ids) {
        const student = (window.students || []).find((s) => String(s.id) === String(sid));
        const name = student ? String(student.name || '') : '';
        const chessId = student ? String(student.chessComId || '') : '';
        const balRaw = student && student.balance != null ? Number(student.balance) : 0;
        const balanceStr = Number.isFinite(balRaw) ? balRaw.toFixed(2) : '0.00';
        const quotaLine =
          typeof window.formatLessonQuotaPlainText === 'function' && student
            ? window.formatLessonQuotaPlainText(student)
            : '';

        const stEnr = enrollments.filter((e) => String(e.studentId) === String(sid));
        const byEntry = new Map();
        for (const e of stEnr) {
          const tid = String(e.timetableEntryId || '');
          if (!byEntry.has(tid)) byEntry.set(tid, []);
          byEntry.get(tid).push(e);
        }

        if (byEntry.size === 0) {
          rows.push([name, chessId, balanceStr, quotaLine, '', '', '', '', 0, '']);
          continue;
        }

        const entryKeys = Array.from(byEntry.keys()).sort();
        for (const entryId of entryKeys) {
          const list = byEntry.get(entryId) || [];
          const entry = entries.find((en) => String(en.id) === entryId);
          const className = entry ? String(entry.className || '') : '(unknown class)';
          const timeSlot = entry ? `${entry.startTime || ''} - ${entry.endTime || ''}`.trim() : '';
          const teacher = entry ? teacherDisplay(entry, teacherById) : '';

          const ymds = [
            ...new Set(
              list.map(normYmdFromEnrollment).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
            )
          ].sort();

          const directOid = list.map((e) => String(e.orderId || '').trim()).find((x) => x);
          const orderId = directOid || (list.length ? inferOrderId(list[0], sid, orders) : '');

          rows.push([
            name,
            chessId,
            balanceStr,
            quotaLine,
            className,
            timeSlot,
            teacher,
            ymds.join(', '),
            ymds.length,
            orderId
          ]);
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        { wch: 18 },
        { wch: 14 },
        { wch: 12 },
        { wch: 24 },
        { wch: 22 },
        { wch: 14 },
        { wch: 18 },
        { wch: 44 },
        { wch: 8 },
        { wch: 24 }
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sales export');

      const d = new Date();
      const fn = `sales-enrollment-export-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}.xlsx`;
      XLSX.writeFile(wb, fn);
    } catch (err) {
      console.error(err);
      alert('Export failed: ' + (err && err.message ? err.message : String(err)));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevText || 'Download Excel';
      }
    }
  }

  window.initSalesEnrollmentExcelExportUi = async function initSalesEnrollmentExcelExportUi() {
    bindSalesExportUiOnce();
    if (!document.getElementById('salesExportStudentList')) return;
    await ensureStudentsLoaded();
    renderSalesExportStudentList();
  };
})();
