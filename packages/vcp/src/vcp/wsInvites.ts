'use strict';

function registerVcpWsInvites(ctx: any): void {
  const { vcp, nowIso } = ctx;

  async function vcpHandleWsInvitesMessage(ws: any, msg: any, type: string): Promise<boolean> {
    const { kind, orgId, userId, name } = ws.vcp;

    if (type === 'vcp_invite_create') {
      if (kind !== 'teacher') return true;
      const mode = String(msg?.mode || '');
      const studentIds = Array.isArray(msg?.studentIds) ? msg.studentIds.map(x => String(x)) : [];
      const configRaw = msg?.config;
      const config: Record<string, unknown> =
        configRaw && typeof configRaw === 'object' && !Array.isArray(configRaw)
          ? (configRaw as Record<string, unknown>)
          : {};

      if (mode !== 'chess') {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'Only Normal Chess is supported for now' });
        return true;
      }
      if (studentIds.length !== 2) {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'Normal Chess requires exactly 2 students' });
        return true;
      }

      const smap = ctx.vcpOrgStudentsMap(orgId);
      const p1 = smap.get(studentIds[0]);
      const p2 = smap.get(studentIds[1]);
      if (!p1 || !p2) {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'One or more students are not online' });
        return true;
      }
      if (p1.inGame || p2.inGame) {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'One or more students are already in-game' });
        return true;
      }

      const minutes = Math.max(1, Math.min(60, Number(config?.minutes) || 3));
      const incrementSec = Math.max(0, Math.min(60, Number(config?.incrementSec) || 2));
      const whiteStudentId = String(config?.whiteStudentId || studentIds[0]);
      const blackStudentId = String(config?.blackStudentId || studentIds[1]);
      if (![studentIds[0], studentIds[1]].includes(whiteStudentId) || ![studentIds[0], studentIds[1]].includes(blackStudentId) || whiteStudentId === blackStudentId) {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'Invalid color assignment' });
        return true;
      }

      const inviteId = `vcp_inv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const invite = {
        id: inviteId,
        orgId,
        teacher: { id: String(userId), name: String(name || 'Teacher') },
        mode: 'chess',
        studentIds: [studentIds[0], studentIds[1]],
        config: { minutes, incrementSec, whiteStudentId, blackStudentId },
        createdAt: nowIso(),
        status: 'pending',
        responses: {}
      };
      vcp.invites.set(inviteId, invite);

      // Send invite to students
      const payload = { type: 'vcp_invite', invite };
      for (const sid of invite.studentIds) {
        const pres = smap.get(String(sid));
        if (!pres) continue;
        for (const sWs of pres.connections) ctx.wsSend(sWs, payload);
      }
      ctx.wsSend(ws, { type: 'vcp_invite_sent', inviteId });
      return true;
    }

    // Teacher vs Student match (teacher plays as a player; only 1 student needs to accept)
    if (type === 'vcp_invite_teacher_match') {
      if (kind !== 'teacher') return true;
      const mode = String(msg?.mode || '');
      const studentId = String(msg?.studentId || '');
      const configRawTm = msg?.config;
      const config: Record<string, unknown> =
        configRawTm && typeof configRawTm === 'object' && !Array.isArray(configRawTm)
          ? (configRawTm as Record<string, unknown>)
          : {};

      if (mode !== 'chess') {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'Only Normal Chess is supported for now' });
        return true;
      }
      if (!studentId) {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'studentId is required' });
        return true;
      }

      const smap = ctx.vcpOrgStudentsMap(orgId);
      const p1 = smap.get(studentId);
      if (!p1) {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'Student is not online' });
        return true;
      }
      if (p1.inGame) {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'Student is already in-game' });
        return true;
      }

      const minutes = Math.max(1, Math.min(60, Number(config?.minutes) || 3));
      const incrementSec = Math.max(0, Math.min(60, Number(config?.incrementSec) || 2));
      const teacherId = String(userId || '');
      const whiteStudentId = String(config?.whiteStudentId || teacherId);
      const blackStudentId = String(config?.blackStudentId || studentId);
      const ids = [teacherId, studentId];
      if (!ids.includes(whiteStudentId) || !ids.includes(blackStudentId) || whiteStudentId === blackStudentId) {
        ctx.wsSend(ws, { type: 'vcp_error', error: 'Invalid color assignment' });
        return true;
      }

      const inviteId = `vcp_inv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const invite = {
        id: inviteId,
        orgId,
        teacher: { id: teacherId, name: String(name || 'Teacher') },
        mode: 'chess',
        studentIds: [studentId],
        config: { minutes, incrementSec, whiteStudentId, blackStudentId },
        createdAt: nowIso(),
        status: 'pending',
        responses: {}
      };
      vcp.invites.set(inviteId, invite);

      const payload = { type: 'vcp_invite', invite };
      for (const sWs of p1.connections || []) ctx.wsSend(sWs, payload);
      ctx.wsSend(ws, { type: 'vcp_invite_sent', inviteId });
      return true;
    }

    if (type === 'vcp_invite_respond') {
      if (kind !== 'student') return true;
      const inviteId = String(msg?.inviteId || '');
      const response = String(msg?.response || '');
      const invite = vcp.invites.get(inviteId);
      if (!invite || String(invite.orgId) !== String(orgId)) return true;
      if (!invite.studentIds.includes(String(userId))) return true;
      if (!['accept', 'decline'].includes(response)) return true;

      invite.responses[String(userId)] = response;
      // Notify teachers in org (simple broadcast)
      for (const tws of ctx.vcpOrgTeachersSet(orgId)) ctx.wsSend(tws, { type: 'vcp_invite_update', inviteId, studentId: String(userId), response });

      if (response === 'decline') {
        invite.status = 'declined';
        vcp.invites.set(inviteId, invite);
        return true;
      }

      // If accepted -> start session (2-student or teacher-vs-student)
      const r1 = invite.responses[invite.studentIds[0]];
      const r2 = invite.studentIds.length > 1 ? invite.responses[invite.studentIds[1]] : null;
      const allAccepted = invite.studentIds.length === 1
        ? (r1 === 'accept')
        : (r1 === 'accept' && r2 === 'accept');

      if (allAccepted) {
        invite.status = 'accepted';
        vcp.invites.set(inviteId, invite);

        const sessionId = `vcp_sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const startedAt = nowIso();
        const smap2 = ctx.vcpOrgStudentsMap(orgId);
        const whiteId = String(invite.config?.whiteStudentId || invite.studentIds[0]);
        const blackId = String(invite.config?.blackStudentId || (invite.studentIds[1] || invite.teacher?.id || ''));
        const wp = smap2.get(whiteId);
        const bp = smap2.get(blackId);
        const session = {
          id: sessionId,
          orgId,
          teacherId: invite.teacher.id,
          teacherName: String(invite.teacher?.name || ''),
          mode: invite.mode,
          studentIds: invite.studentIds.slice(),
          config: invite.config,
          chessState: null,
          createdAt: startedAt,
          startedAt,
          whiteName: wp ? String(wp.name || 'White') : (whiteId === String(invite.teacher?.id || '') ? String(invite.teacher?.name || 'Teacher') : 'White'),
          blackName: bp ? String(bp.name || 'Black') : (blackId === String(invite.teacher?.id || '') ? String(invite.teacher?.name || 'Teacher') : 'Black'),
          whiteStudentId: wp ? String(wp.studentId || '') : '',
          blackStudentId: bp ? String(bp.studentId || '') : '',
          status: 'active'
        };
        if (String(session.mode) === 'chess') session.chessState = ctx.vcpCreateInitialChessState(session);
        vcp.sessions.set(sessionId, session);

        // Mark students in-game
        for (const sid of session.studentIds) {
          ctx.setStudentStatus(orgId, sid, 'in-game', true);
        }
        ctx.vcpBroadcastPresence(orgId);

        const startPayload = { type: 'vcp_session_start', session };
        // Notify teacher sockets
        for (const tws of ctx.vcpOrgTeachersSet(orgId)) {
          if (tws?.vcp?.kind === 'teacher' && String(tws.vcp.userId) === String(session.teacherId)) ctx.wsSend(tws, startPayload);
        }
        // Notify students
        const smap = ctx.vcpOrgStudentsMap(orgId);
        for (const sid of session.studentIds) {
          const pres = smap.get(String(sid));
          if (!pres) continue;
          for (const sWs of pres.connections) ctx.wsSend(sWs, startPayload);
        }

        // Broadcast live games snapshot
        ctx.vcpBroadcastLiveGames(orgId);
      }
      return true;
    }

    return false;
  }

  Object.assign(ctx, { vcpHandleWsInvitesMessage });
}

module.exports = { registerVcpWsInvites };
export {};
