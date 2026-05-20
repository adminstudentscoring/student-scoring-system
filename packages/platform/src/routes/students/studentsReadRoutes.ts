// Student routes extracted from server.js.
// Includes /api/students* and /api/public/students*.

import { Request, Response, NextFunction } from 'express';
import type { StudentsRouteDeps } from '@student-scoring/core';

function registerStudentsReadRoutes(app: any, deps: any): void {
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

  // Get all students data (with data isolation)
  app.get('/api/students', optionalAuth, async (req, res) => {
    try {
      const data = await readData();

      // Filter students by organization if user is authenticated
      let students = data.students;
      if (req.user) {
        // Apply organization filter if user is authenticated
        if (req.user.role === 'admin') {
          // Admin sees all students
        } else if (req.user.role === 'teacher') {
          // Teachers see all students in their organization (for Statistics leaderboard)
          if (req.user.organizationId) {
            students = filterStudentsByOrganization(students, req.user.organizationId);
          } else {
            students = [];
          }
        } else if (req.user.organizationId) {
          // Organization users see all students in their organization
          students = filterStudentsByOrganization(students, req.user.organizationId);
        } else {
          // If user has no organizationId, they see nothing
          students = [];
        }
      }

      // Update ranks for all students based on current scores
      students.forEach(student => {
        const rankInfo = getRankInfo(student.score || 0);
        student.rank = rankInfo.rank;
        student.rankIndex = rankInfo.rankIndex;
        student.level = rankInfo.rankIndex + 1;
      });
      return res.json(students);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to read students data' });
    }
  });

  // Add a new student (deprecated - use /api/organizations/students instead)
  // Kept for backward compatibility, but requires organization authentication
  app.post('/api/students', authenticateUser, requireOrganizationAccess, async (req, res) => {
    try {
      const name = (req.body?.name || '').toString();
      // `studentId` historically stored Chess.com ID. New field name: `chessComId`.
      const chessComId = (req.body?.chessComId ?? req.body?.studentId ?? '').toString();
      if (!name || !chessComId) {
        return res.status(400).json({ error: 'Name and chess.com ID are required' });
      }

      // Get user's organization
      const users = await readUsers();
      const user = users.find(u => u.id === req.user.id);
      let organizationId = null;

      if (user) {
        if (user.role === 'organization' && user.organizationId) {
          organizationId = user.organizationId;
        } else if (user.role === 'teacher' && user.organizationId) {
          organizationId = user.organizationId;
        } else if (user.role === 'admin') {
          // Admin can create students but need to specify organizationId
          organizationId = req.body.organizationId;
          if (!organizationId) {
            return res.status(400).json({ error: 'organizationId is required for admin' });
          }
        }
      }

      if (!organizationId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Organization authentication required' });
      }

      const data = await readData();

      // Check if student already exists in this organization
      const exists = data.students.find(s =>
        String(s.chessComId || '') === String(chessComId || '') &&
        (organizationId ? s.organizationId === organizationId : true)
      );
      if (exists) {
        return res.status(400).json({ error: 'chess.com ID already exists' });
      }

      const initialRankInfo = getRankInfo(0);
      const newStudent = {
        id: Date.now().toString(),
        name,
        chessComId,
        organizationId: organizationId,
        answerCount: 0,
        totalAnswers: 0,
        correctAnswers: 0,
        level: 1,
        rank: initialRankInfo.rank || 'Wood',
        rankIndex: initialRankInfo.rankIndex || 0,
        experience: 0,
        score: 0,
        createdAt: new Date().toISOString(),
        stats: {
          daily: {},
          weekly: {},
          monthly: {},
          yearly: {}
        }
      };

      data.students.push(newStudent);
      data.lastUpdate = new Date().toISOString();
      await writeData(data);

      // Update organization if exists
      if (organizationId) {
        const organizations = await readOrganizations();
        const organization = organizations.find(o => o.id === organizationId);
        if (organization) {
          organization.students.push(newStudent.id);
          await writeOrganizations(organizations);
        }
      }

      broadcast({ type: 'studentAdded', student: newStudent });
      return res.json(newStudent);
    } catch (error) {
      console.error('Error adding student:', error);
      return res.status(500).json({ error: 'Failed to add student' });
    }
  });

  // Record an answer - changed to accept points (1-n), points added directly without multiplying
  app.post('/api/students/:id/answer', async (req, res) => {
    try {
      const { id } = req.params;
      let { points = 1 } = req.body; // Changed from 'correct' to 'points'

      // Ensure points is a number and not multiplied
      points = parseInt(points, 10);

      if (!points || points < 1 || isNaN(points)) {
        return res.status(400).json({ error: 'Points must be a positive integer' });
      }

      // Debug logging - log what we received
      console.log(`[DEBUG SERVER START] Received request with points: ${points} (type: ${typeof points}), raw body:`, JSON.stringify(req.body));

      const data = await readData();
      const student = data.students.find(s => s.id === id);

      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      // Update student data - points added directly (no multiplication)
      // Force conversion to number and ensure no multiplication happens
      const pointsToAdd = Number(points);
      const oldScore = Number(student.score) || 0;

      // CRITICAL: Direct addition only - NO multiplication, NO factor of 10
      const newScore = oldScore + pointsToAdd;

      student.answerCount = (student.answerCount || 0) + 1;
      student.score = newScore; // Direct addition, NO multiplication
      student.experience = student.score;

      // Ensure score is stored as a number (not string)
      student.score = Number(student.score);

      // Update statistics
      updateStudentStats(student, pointsToAdd);

      // Debug logging - detailed verification
      console.log(`[DEBUG SERVER END] Student: ${student.name}`);
      console.log(`  - Points received from client: ${points}`);
      console.log(`  - Points to add (Number): ${pointsToAdd}`);
      console.log(`  - Old score: ${oldScore}`);
      console.log(`  - Calculation: ${oldScore} + ${pointsToAdd} = ${newScore}`);
      console.log(`  - Final score stored: ${student.score}`);

      // Calculate rank based on score
      const rankInfo = getRankInfo(student.score);
      student.rank = rankInfo.rank;
      student.rankIndex = rankInfo.rankIndex;
      student.level = rankInfo.rankIndex + 1; // Keep level for compatibility

      // Update challenge HP (deduct damage equal to points)
      if (!data.challenge) {
        data.challenge = {
          currentLevel: 1,
          currentHP: LEVELS[0].maxHP,
          completedLevels: [],
          totalDamage: 0,
          selectedStudentIds: []
        };
      }
      if (!data.challenge.selectedStudentIds) {
        data.challenge.selectedStudentIds = [];
      }

      // Resolve org-specific levels (same logic as GET /api/challenge) so that
      // maxHP, reward, and level-up thresholds match what the client displays.
      let levels = LEVELS;
      if (student.organizationId && readOrganizations) {
        try {
          const organizations = await readOrganizations();
          const org = organizations.find(o => o.id === student.organizationId);
          if (org) {
            if (org.settings && org.settings.challengeLevels && org.settings.challengeLevels.levels && org.settings.challengeLevels.levels.length > 0) {
              levels = org.settings.challengeLevels.levels;
            } else if (org.gameConfig && org.gameConfig.classicLevels && org.gameConfig.classicLevels.length > 0) {
              levels = org.gameConfig.classicLevels;
            }
          }
        } catch (_e) { /* fall back to global LEVELS */ }
      }

      const currentLevelInfo = levels[data.challenge.currentLevel - 1] || levels[levels.length - 1] || LEVELS[0];
      if (currentLevelInfo) {
        // Fix currentHP if it exceeds maxHP (due to config changes)
        if (data.challenge.currentHP > currentLevelInfo.maxHP) {
          data.challenge.currentHP = currentLevelInfo.maxHP;
        }

        // Deduct HP equal to points (each point = 1 HP damage)
        const damage = points;
        data.challenge.currentHP = Math.max(0, data.challenge.currentHP - damage);
        data.challenge.totalDamage = (data.challenge.totalDamage || 0) + damage;

        // Check if level is completed
        const levelCompleted = data.challenge.currentHP <= 0;
        let levelReward = null;

        if (levelCompleted && !data.challenge.completedLevels.includes(data.challenge.currentLevel)) {
          levelReward = currentLevelInfo.reward;
          data.challenge.completedLevels.push(data.challenge.currentLevel);

          // Award points only to selected students in Class View
          const selectedIds = data.challenge.selectedStudentIds || [];
          if (selectedIds.length > 0) {
            selectedIds.forEach(studentId => {
              const st = data.students.find(s => s.id === studentId);
              if (st) {
                st.score = (st.score || 0) + levelReward;
                st.experience = st.score;
                const rInfo = getRankInfo(st.score);
                st.rank = rInfo.rank;
                st.rankIndex = rInfo.rankIndex;
                st.level = rInfo.rankIndex + 1;
              }
            });
          }

          // Move to next level
          if (data.challenge.currentLevel < levels.length) {
            data.challenge.currentLevel += 1;
            const nextLevelInfo = levels[data.challenge.currentLevel - 1];
            data.challenge.currentHP = nextLevelInfo.maxHP;
          }

          broadcast({
            type: 'levelCompleted',
            level: data.challenge.currentLevel - 1,
            reward: levelReward,
            students: data.students
          });
        } else {
          broadcast({
            type: 'damageDealt',
            damage: damage,
            currentHP: data.challenge.currentHP,
            maxHP: currentLevelInfo.maxHP,
            level: data.challenge.currentLevel,
            studentName: student.name
          });
        }
      }

      data.lastUpdate = new Date().toISOString();
      await writeData(data);

      broadcast({ type: 'answerRecorded', student, challenge: data.challenge });
      return res.json({ student, challenge: data.challenge });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to record answer' });
    }
  });

  // Update student manually (requires organization, teacher, or admin authentication)
}

module.exports = { registerStudentsReadRoutes };
export {};
