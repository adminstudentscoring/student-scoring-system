// Challenge/Level routes extracted from server.js.
// Includes /api/challenge* routes.
import { Request, Response, NextFunction } from 'express';

function registerChallengeRoutes(app: any, deps: any): void {
  const authenticateUser = deps?.authenticateUser;
  const readData = deps?.readData;
  const writeData = deps?.writeData;
  const readOrganizations = deps?.readOrganizations;
  const broadcast = deps?.broadcast;
  const LEVELS = deps?.LEVELS;
  const SAVES_DIR = deps?.SAVES_DIR;
  const fs = deps?.fs;
  const path = deps?.path;

  if (!app) throw new Error('registerChallengeRoutes: missing app');
  if (typeof authenticateUser !== 'function') throw new Error('registerChallengeRoutes: missing authenticateUser');
  if (typeof readData !== 'function') throw new Error('registerChallengeRoutes: missing readData');
  if (typeof writeData !== 'function') throw new Error('registerChallengeRoutes: missing writeData');
  if (typeof readOrganizations !== 'function') throw new Error('registerChallengeRoutes: missing readOrganizations');
  if (typeof broadcast !== 'function') throw new Error('registerChallengeRoutes: missing broadcast');
  if (!Array.isArray(LEVELS)) throw new Error('registerChallengeRoutes: missing LEVELS');
  if (!SAVES_DIR) throw new Error('registerChallengeRoutes: missing SAVES_DIR');
  if (!fs) throw new Error('registerChallengeRoutes: missing fs');
  if (!path) throw new Error('registerChallengeRoutes: missing path');

  // Get challenge/level information
  app.get('/api/challenge', authenticateUser, async (req, res) => {
    try {
      console.log(`[DEBUG] GET /api/challenge for user ${req.user.id} (Role: ${req.user.role})`);
      
      const data = await readData();
      const challenge = data.challenge || {
        currentLevel: 1,
        currentHP: 200,
        completedLevels: [],
        totalDamage: 0,
        selectedStudentIds: []
      };
      // Ensure selectedStudentIds exists
      if (!challenge.selectedStudentIds) {
        challenge.selectedStudentIds = [];
      }

      // Load Game Config
      let levels = LEVELS; // Default
      if (req.user && req.user.organizationId) {
          const organizations = await readOrganizations();
          const org = organizations.find(o => o.id === req.user.organizationId);
          
          if (org) {
              console.log(`[DEBUG] Found Org: ${org.id}`);
              if (org.settings && org.settings.challengeLevels && org.settings.challengeLevels.levels && org.settings.challengeLevels.levels.length > 0) {
                  console.log(`[DEBUG] Using org.settings.challengeLevels (${org.settings.challengeLevels.levels.length} levels)`);
                  levels = org.settings.challengeLevels.levels;
              } else if (org.gameConfig && org.gameConfig.classicLevels && org.gameConfig.classicLevels.length > 0) {
                  console.log(`[DEBUG] Using org.gameConfig.classicLevels`);
                  levels = org.gameConfig.classicLevels;
              } else {
                  console.log('[DEBUG] No custom levels found, using default');
              }
          } else {
              console.log('[DEBUG] Org not found in database');
          }
      } else {
          console.log('[DEBUG] No organizationId in request user');
      }

      const currentLevelIndex = challenge.currentLevel - 1;
      const currentLevelInfo = levels[currentLevelIndex] || levels[levels.length - 1] || LEVELS[0];
      
      // Fix currentHP
      if (!challenge.currentHP && challenge.currentHP !== 0) challenge.currentHP = currentLevelInfo.maxHP;
      
      if (challenge.currentHP > currentLevelInfo.maxHP) {
        challenge.currentHP = currentLevelInfo.maxHP;
        data.challenge = challenge;
        await writeData(data);
      }
      
      res.json({
        ...challenge,
        levelInfo: currentLevelInfo,
        allLevels: levels
      });
    } catch (error) {
      console.error('Error getting challenge:', error);
      res.status(500).json({ error: 'Failed to get challenge info' });
    }
  });

  // Set selected students for Class View
  app.post('/api/challenge/selected-students', async (req, res) => {
    try {
      const { selectedStudentIds } = req.body;
      
      if (!Array.isArray(selectedStudentIds)) {
        return res.status(400).json({ error: 'selectedStudentIds must be an array' });
      }
      
      const data = await readData();
      if (!data.challenge) {
        data.challenge = {
          currentLevel: 1,
          currentHP: LEVELS[0].maxHP,
          completedLevels: [],
          totalDamage: 0,
          selectedStudentIds: []
        };
      }
      
      // Update selected student IDs
      data.challenge.selectedStudentIds = selectedStudentIds;
      data.lastUpdate = new Date().toISOString();
      await writeData(data);
      
      broadcast({ 
        type: 'selectedStudentsUpdated', 
        selectedStudentIds: selectedStudentIds 
      });
      
      res.json({ success: true, selectedStudentIds: selectedStudentIds });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update selected students' });
    }
  });

  // Reset challenge (start from level 1)
  app.post('/api/challenge/reset', async (req, res) => {
    try {
      const data = await readData();
      // Preserve selectedStudentIds when resetting challenge
      const selectedStudentIds = data.challenge?.selectedStudentIds || [];
      data.challenge = {
        currentLevel: 1,
        currentHP: LEVELS[0].maxHP,
        completedLevels: [],
        totalDamage: 0,
        selectedStudentIds: selectedStudentIds
      };
      data.lastUpdate = new Date().toISOString();
      await writeData(data);
      broadcast({ type: 'challengeReset', challenge: data.challenge });
      res.json(data.challenge);
    } catch (error) {
      res.status(500).json({ error: 'Failed to reset challenge' });
    }
  });

  // Save challenge progress
  app.post('/api/challenge/save', async (req, res) => {
    try {
      const { day, time } = req.body;
      
      if (!day || !time) {
        return res.status(400).json({ error: 'Day and time are required' });
      }
      
      // Validate day
      const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      if (!validDays.includes(day)) {
        return res.status(400).json({ error: 'Invalid day' });
      }
      
      // Validate time format (HHMM or HH:MM)
      const timeMatch = time.match(/^(\d{2}):?(\d{2})$/);
      if (!timeMatch) {
        return res.status(400).json({ error: 'Invalid time format' });
      }
      
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      
      if (hours < 8 || hours > 22 || (hours === 22 && minutes > 0) || minutes % 30 !== 0) {
        return res.status(400).json({ error: 'Time must be between 08:00 and 22:00, in 30-minute intervals' });
      }
      
      // Get current challenge data
      const data = await readData();
      const challengeData = data.challenge || {
        currentLevel: 1,
        currentHP: LEVELS[0].maxHP,
        completedLevels: [],
        totalDamage: 0,
        selectedStudentIds: []
      };
      // Ensure selectedStudentIds exists
      if (!challengeData.selectedStudentIds) {
        challengeData.selectedStudentIds = [];
      }
      
      // Format time for filename (HHMM)
      const timeFormatted = `${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}`;
      const filename = `save_${day}_${timeFormatted}.txt`;
      const filepath = path.join(SAVES_DIR, filename);
      
      // Save challenge data (only challenge, not students)
      const saveData = {
        day,
        time: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
        savedAt: new Date().toISOString(),
        challenge: challengeData
      };
      
      await fs.writeFile(filepath, JSON.stringify(saveData, null, 2), 'utf8');
      
      res.json({ success: true, filename, message: 'Challenge progress saved successfully' });
    } catch (error) {
      console.error('Error saving challenge:', error);
      res.status(500).json({ error: 'Failed to save challenge progress' });
    }
  });

  // Get all saves list
  app.get('/api/challenge/saves', async (req, res) => {
    try {
      const files = await fs.readdir(SAVES_DIR);
      const saveFiles = files.filter(f => f.startsWith('save_') && f.endsWith('.txt'));
      
      const saves = [];
      for (const file of saveFiles) {
        try {
          const filepath = path.join(SAVES_DIR, file);
          const content = await fs.readFile(filepath, 'utf8');
          const saveData = JSON.parse(content);
          
          // Get file stats for sorting
          const stats = await fs.stat(filepath);
          
          saves.push({
            filename: file,
            day: saveData.day,
            time: saveData.time,
            savedAt: saveData.savedAt,
            modifiedAt: stats.mtime.toISOString(),
            challenge: {
              currentLevel: saveData.challenge?.currentLevel || 1,
              currentHP: saveData.challenge?.currentHP || 0,
              completedLevels: saveData.challenge?.completedLevels || []
            }
          });
        } catch (error) {
          console.error(`Error reading save file ${file}:`, error);
        }
      }
      
      // Sort by modified time (newest first)
      saves.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
      
      res.json(saves);
    } catch (error) {
      console.error('Error listing saves:', error);
      res.status(500).json({ error: 'Failed to list saves' });
    }
  });

  // Load challenge from save
  app.post('/api/challenge/load', async (req, res) => {
    try {
      const { filename } = req.body;
      
      if (!filename) {
        return res.status(400).json({ error: 'Filename is required' });
      }
      
      // Security: prevent directory traversal
      if (filename.includes('..') || !filename.startsWith('save_') || !filename.endsWith('.txt')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      
      const filepath = path.join(SAVES_DIR, filename);
      
      // Read save file
      const content = await fs.readFile(filepath, 'utf8');
      const saveData = JSON.parse(content);
      
      // Update current challenge data
      const data = await readData();
      data.challenge = saveData.challenge;
      // Ensure selectedStudentIds exists
      if (!data.challenge.selectedStudentIds) {
        data.challenge.selectedStudentIds = [];
      }
      data.lastUpdate = new Date().toISOString();
      await writeData(data);
      
      // Broadcast update
      broadcast({ type: 'challengeLoaded', challenge: data.challenge });
      
      res.json({
        success: true,
        challenge: data.challenge,
        saveInfo: {
          day: saveData.day,
          time: saveData.time,
          savedAt: saveData.savedAt
        }
      });
    } catch (error) {
      console.error('Error loading challenge:', error);
      if (error.code === 'ENOENT') {
        res.status(404).json({ error: 'Save file not found' });
      } else {
        res.status(500).json({ error: 'Failed to load challenge' });
      }
    }
  });

  // Delete save
  app.delete('/api/challenge/saves/:filename', async (req, res) => {
    try {
      const { filename } = req.params;
      
      // Security: prevent directory traversal
      if (filename.includes('..') || !filename.startsWith('save_') || !filename.endsWith('.txt')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      
      const filepath = path.join(SAVES_DIR, filename);
      await fs.unlink(filepath);
      
      res.json({ success: true, message: 'Save file deleted successfully' });
    } catch (error) {
      console.error('Error deleting save:', error);
      if (error.code === 'ENOENT') {
        res.status(404).json({ error: 'Save file not found' });
      } else {
        res.status(500).json({ error: 'Failed to delete save file' });
      }
    }
  });
}

module.exports = { registerChallengeRoutes };
