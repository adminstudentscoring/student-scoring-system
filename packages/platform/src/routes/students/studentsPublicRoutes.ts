// Student routes extracted from server.js.
// Includes /api/students* and /api/public/students*.

import { Request, Response, NextFunction } from 'express';
import type { StudentsRouteDeps } from '@student-scoring/core';

function registerStudentsPublicRoutes(app: any, deps: any): void {
  const optionalAuth = deps?.optionalAuth;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const getStudentChessComCredentials = deps?.getStudentChessComCredentials;
  const readData = deps?.readData;
  const writeData = deps?.writeData;
  const readUsers = deps?.readUsers;
  const writeUsers = deps?.writeUsers;
  const readOrganizations = deps?.readOrganizations;
  const writeOrganizations = deps?.writeOrganizations;
  const filterStudentsByOrganization = deps?.filterStudentsByOrganization;
  const getRankInfo = deps?.getRankInfo;
  const updateStudentStats = deps?.updateStudentStats;
  const broadcast = deps?.broadcast;
  const LEVELS = deps?.LEVELS;
  const generateToken = deps?.generateToken;
  const isValidDateFormat = deps?.isValidDateFormat;
  const isValidDate = deps?.isValidDate;
  const isFutureDate = deps?.isFutureDate;
  const compareDates = deps?.compareDates;

  app.get('/api/public/students/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { password } = req.query;

      const data = await readData();
      const student = data.students.find(s => s.id === id);

      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      // Check password protection
      if (student.accessPassword) {
        if (!password || password !== student.accessPassword) {
          // Return protected status
          return res.json({
            protected: true,
            id: student.id,
            name: student.name // Basic info
          });
        }
      }

      // Return student data (public view)
      const rankInfo = getRankInfo(student.score || 0);

      // Teacher-specific ranking (first teacher that has this student assigned)
      let rankInTeacher = null;
      let totalStudentsInTeacher = null;
      try {
        const users = await readUsers();
        const teacher = users.find(u =>
          u.role === 'teacher' &&
          Array.isArray(u.assignedStudents) &&
          u.assignedStudents.includes(student.id)
        );
        if (teacher && Array.isArray(teacher.assignedStudents)) {
          const studentsForTeacher = data.students
            .filter(s => teacher.assignedStudents.includes(s.id))
            .sort((a, b) => (b.score || 0) - (a.score || 0));
          const index = studentsForTeacher.findIndex(s => s.id === student.id);
          if (index !== -1) {
            rankInTeacher = index + 1;
            totalStudentsInTeacher = studentsForTeacher.length;
          }
        }
      } catch (err) {
        console.warn('Unable to compute teacher ranking for public student view:', err);
      }

      const publicData: any = {
        id: student.id,
        name: student.name,
        chessComId: student.chessComId,
        studentId: student.chessComId,
        score: student.score,
        level: rankInfo.rankIndex + 1,
        rank: rankInfo.rank,
        rankIndex: rankInfo.rankIndex,
        nextRank: rankInfo.nextRank,
        progress: rankInfo.progress,
        answerCount: student.answerCount,
        stats: student.stats,
        protected: false,
        rankInTeacher,
        totalStudentsInTeacher
      };

      // Chess.com credentials (teacher-managed; optional)
      try {
        if (typeof getStudentChessComCredentials === 'function' && student.organizationId) {
          const cred = await getStudentChessComCredentials(String(student.organizationId), String(student.id));
          if (cred && typeof cred === 'object') {
            publicData.chessComUsername = cred.chessId != null ? String(cred.chessId) : '';
            publicData.chessComPassword = cred.password != null ? String(cred.password) : '';
            publicData.chessComUpdatedAt = cred.updatedAt != null ? String(cred.updatedAt) : null;
          }
        }
      } catch (e) {
        // Non-fatal: student dashboard can still function without Chess.com creds.
      }

      return res.json(publicData);
    } catch (error) {
      console.error('Error fetching public student:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Public Student Access: V.Chess Platform token (No Auth required, Password protected)
  // Returns a short-lived JWT with role=student so the student can use WebSocket realtime.
  app.get('/api/public/students/:id/vcp-token', async (req, res) => {
    try {
      const { id } = req.params;
      const { password } = req.query;

      const data = await readData();
      const student = data.students.find(s => s.id === id);
      if (!student) return res.status(404).json({ error: 'Student not found' });

      // Check password protection (same rules as public profile)
      if (student.accessPassword) {
        if (!password || password !== student.accessPassword) {
          return res.status(401).json({ error: 'Invalid password' });
        }
      }

      const tokenConfigCheck = (generateToken as any)?.isConfigured;
      if (typeof tokenConfigCheck === 'function' && !tokenConfigCheck()) {
        return res.status(503).json({ error: 'Authentication is not configured on this server' });
      }

      // Mint token with role=student and org context
      const token = generateToken({
        id: String(student.id),
        email: '',
        role: 'student',
        name: String(student.name || 'Student'),
        organizationId: student.organizationId || null
      });

      return res.json({
        ok: true,
        token,
        student: {
          id: String(student.id),
          name: String(student.name || 'Student'),
          chessComId: String(student.chessComId || ''),
          // Backward compatibility
          studentId: String(student.chessComId || '')
        }
      });
    } catch (error) {
      console.error('Error issuing VCP token:', error);
      return res.status(500).json({ error: 'Failed to issue token' });
    }
  });

}

module.exports = { registerStudentsPublicRoutes };
export {};
