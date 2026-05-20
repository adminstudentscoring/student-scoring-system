/** Org-level Stockfish depth cap load/save for Tactics Fighter. */

export function createTfSettingsHandlers(
  { apiRequest, tfJson },
  { ui, isTeacher, publicStudentId, publicStudentPassword }
) {
  async function loadTfSettings() {
    try {
      if (isTeacher) {
        const resp = await apiRequest('/api/teachers/tactics-fighter/settings', { method: 'GET' });
        const data = await tfJson(resp);
        ui.tfSettings.stockfishDepthCap = Number(data?.stockfishDepthCap || 14) || 14;
        return ui.tfSettings;
      }
      if (publicStudentId) {
        const qp = new URLSearchParams();
        if (publicStudentPassword) qp.set('password', String(publicStudentPassword));
        const resp = await apiRequest(
          `/api/public/students/${encodeURIComponent(publicStudentId)}/tactics-fighter/settings?${qp.toString()}`,
          { method: 'GET' }
        );
        const data = await tfJson(resp);
        ui.tfSettings.stockfishDepthCap = Number(data?.stockfishDepthCap || 14) || 14;
        return ui.tfSettings;
      }
    } catch {}
    return ui.tfSettings;
  }

  async function saveTfSettings(nextCap) {
    const cap = Math.max(4, Math.min(22, Number(nextCap || 14) || 14));
    const resp = await apiRequest('/api/teachers/tactics-fighter/settings', {
      method: 'PUT',
      body: JSON.stringify({ stockfishDepthCap: cap })
    });
    const data = await tfJson(resp);
    ui.tfSettings.stockfishDepthCap = Number(data?.stockfishDepthCap || cap) || cap;
    return ui.tfSettings;
  }

  function getDepthCap() {
    const cap = Number(ui.tfSettings?.stockfishDepthCap || 14) || 14;
    return Math.max(4, Math.min(22, cap));
  }

  function getPracticeDepth() {
    return Math.min(12, getDepthCap());
  }

  function getBuilderDepthDefault() {
    return Math.min(16, getDepthCap());
  }

  return { loadTfSettings, saveTfSettings, getDepthCap, getPracticeDepth, getBuilderDepthDefault };
}
