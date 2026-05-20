'use strict';

function registerVcpPresence(ctx: any): void {
  const { vcp, WebSocket } = ctx;

  function wsSend(ws: any, payload: any) {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    } catch {}
  }

  function vcpOrgStudentsMap(orgId: any) {
    const key = String(orgId || '');
    if (!vcp.studentsByOrg.has(key)) vcp.studentsByOrg.set(key, new Map());
    return vcp.studentsByOrg.get(key);
  }

  function vcpOrgTeachersSet(orgId: any) {
    const key = String(orgId || '');
    if (!vcp.teachersByOrg.has(key)) vcp.teachersByOrg.set(key, new Set());
    return vcp.teachersByOrg.get(key);
  }

  function vcpSnapshotForOrg(orgId: any) {
    const students = Array.from(vcpOrgStudentsMap(orgId).values()).map((p: any) => ({
      id: p.id,
      name: p.name,
      studentId: p.studentId || '',
      status: p.status,
      lastActivity: p.lastActivity,
      inGame: !!p.inGame
    }));
    // Stable sort: in-game, online, idle
    const order = { 'in-game': 0, online: 1, idle: 2 };
    students.sort((a, b) => {
      const oa = order[a.status] ?? 9;
      const ob = order[b.status] ?? 9;
      if (oa !== ob) return oa - ob;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return students;
  }

  function vcpBroadcastPresence(orgId: any) {
    const payload = { type: 'vcp_presence_snapshot', students: vcpSnapshotForOrg(orgId) };
    for (const tws of vcpOrgTeachersSet(orgId)) wsSend(tws, payload);
  }

  function updateStudentPresence(orgId: any, student: any) {
    const map = vcpOrgStudentsMap(orgId);
    map.set(String(student.id), student);
    vcpBroadcastPresence(orgId);
  }

  function setStudentStatus(orgId: any, studentId: any, status: any, inGame = false) {
    const map = vcpOrgStudentsMap(orgId);
    const cur = map.get(String(studentId));
    if (!cur) return;
    cur.status = status;
    cur.inGame = !!inGame;
    map.set(String(studentId), cur);
  }

  Object.assign(ctx, {
    wsSend,
    vcpOrgStudentsMap,
    vcpOrgTeachersSet,
    vcpSnapshotForOrg,
    vcpBroadcastPresence,
    updateStudentPresence,
    setStudentStatus
  });
}

module.exports = { registerVcpPresence };
export {};
