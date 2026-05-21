  }

  async function teacherLoadTagStats() {
    const dur = String(STATE.teacher.tagDuration || 'month');
    const qs = `?duration=${encodeURIComponent(dur)}`;
    const data = await teacherApi(`/teachers/blunders/tag-stats${qs}`);
    STATE.teacher.tagStats = (data && typeof data === 'object') ? data : null;
    entry().render();
    return data;
  }

  async function teacherBulkSyncSelected(force) {
    const selected = Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : [];
    const ids = selected.filter(Boolean);
    if (!ids.length) return;
    const allRows = Array.isArray(STATE.teacher.students) ? STATE.teacher.students : [];
    const idSet = new Set(allRows.map(s => String(s.id || '')));
    const valid = ids.filter(id => idSet.has(id));
    if (!valid.length) return;

    STATE.teacher.loading = true;
    STATE.teacher.error = '';
    entry().render();
    try {
      for (let i = 0; i < valid.length; i++) {
        const sid = valid[i];
        const hkDayKey = String(STATE.teacher?.dateByStudent?.[sid] || '') || todayYmdLocal();
        STATE.teacher.error = `Syncing ${i + 1}/${valid.length}...`;
        entry().render();
        await teacherSyncStudent(sid, hkDayKey, !!force);
      }
      STATE.teacher.error = '';
    } catch (e) {
      STATE.teacher.error = String(e?.message || e);
    } finally {
      STATE.teacher.loading = false;
      await teacherLoad('students').catch(() => {});
    }
  }

  async function teacherBulkCompleteSelected() {
    const selected = Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : [];
    const ids = selected.filter(Boolean);
    if (!ids.length) return;
    const allRows = Array.isArray(STATE.teacher.students) ? STATE.teacher.students : [];
    const idSet = new Set(allRows.map(s => String(s.id || '')));
    const valid = ids.filter(id => idSet.has(id));
    if (!valid.length) return;

    STATE.teacher.loading = true;
    STATE.teacher.error = '';
    entry().render();
    try {
      STATE.teacher.error = `Completing pending puzzles for ${valid.length} student(s)...`;
      entry().render();
      await teacherApi('/teachers/blunders/complete-pending', { method: 'POST', body: { studentIds: valid } });
      STATE.teacher.error = '';
    } catch (e) {
      STATE.teacher.error = String(e?.message || e);
    } finally {
      STATE.teacher.loading = false;
      await teacherLoad('students').catch(() => {});
    }
  }

  async function teacherBulkHistoryScanSelected(force) {
    const selected = Array.isArray(STATE.teacher.selectedIds) ? STATE.teacher.selectedIds.map(String) : [];
    const ids = selected.filter(Boolean);
    if (!ids.length) return;
    const allRows = Array.isArray(STATE.teacher.students) ? STATE.teacher.students : [];
    const idSet = new Set(allRows.map(s => String(s.id || '')));
    const valid = ids.filter(id => idSet.has(id));
    if (!valid.length) return;

    const n = Math.max(1, Math.min(500, Number(STATE.teacher.bulkHistoryGames || 200) || 200));

    STATE.teacher.loading = true;
    STATE.teacher.error = '';
    entry().render();
    try {
      const out = await teacherApi('/teachers/blunders/jobs/history-scan', {
        method: 'POST',
        body: { studentIds: valid, historyGames: n, force: !!force }
      });
      const jobId = out?.jobId ? String(out.jobId) : '';
      STATE.teacher.error = jobId
        ? `History queued for ${valid.length} student(s) (job: ${jobId}). Refresh later to see updates.`
        : `History queued for ${valid.length} student(s). Refresh later to see updates.`;
      entry().render();
      if (jobId) openTeacherJobModal(jobId).catch(() => {});
    } catch (e) {
      STATE.teacher.error = String(e?.message || e);
    } finally {
      STATE.teacher.loading = false;
      entry().render();
    }
  }

  window.BlundersTeacher = {
    renderTeacherSidebar,
    renderTeacherStudentsPage,
    renderTeacherAllBlundersPage,
    renderTeacherMasterGamePage,
    teacherLoad,
    teacherSaveStudentSettings,
    teacherSaveMasters,
    teacherSaveMasterConfig,
    teacherSyncStudent,
    teacherHistoryScanStudent,
    teacherSyncMaster,
    teacherHistoryScanMaster,
    teacherTagPuzzles,
    teacherLoadTagStats,
    teacherBulkSyncSelected,
    teacherBulkCompleteSelected,
    teacherBulkHistoryScanSelected
    ,
    // Job progress modal
    openTeacherJobModal,
    teacherJobRefresh,
    teacherJobCancel,
    teacherJobClose,
    stopTeacherJobPolling,
    // Teacher All blunders (paged buckets)
    teacherAllToggleBucket,
    teacherAllPrev,
    teacherAllNext,
    teacherAllGo,
    teacherAllSetJump
    ,
    teacherLoadAllBlundersStorageStats
  };
})();



