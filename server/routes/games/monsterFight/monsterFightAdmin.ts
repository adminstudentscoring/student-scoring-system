// Admin/teacher management routes extracted from monsterFightRoutes.js
// Handles: save/load game, get settings, update config
"use strict";

const { GAME_CONFIG, PLAYER_CLASSES, MONSTER_TYPES } = require('./monsterFightCore');

function registerMonsterFightAdminRoutes(app: any, deps: any): void {
  const fs = deps && deps.fs;
  const path = deps && deps.path;
  const readData = deps && deps.readData;
  const writeData = deps && deps.writeData;
  const broadcast = deps && deps.broadcast;
  const GAME_SAVES_DIR = deps && deps.GAME_SAVES_DIR;

  // Save game state
  app.post('/api/game/save', async (req, res) => {
    try {
      const { day, time } = req.body;

      if (!day || !time) {
        return res.status(400).json({ error: 'Day and time are required' });
      }

      const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      if (!validDays.includes(day)) {
        return res.status(400).json({ error: 'Invalid day' });
      }

      const timeMatch = time.match(/^(\d{2}):?(\d{2})$/);
      if (!timeMatch) {
        return res.status(400).json({ error: 'Invalid time format' });
      }

      const data = await readData();
      if (!data.gameState || !data.gameState.current) {
        return res.status(404).json({ error: 'No active game to save' });
      }

      const filename = `game_${day}_${time.replace(':', '')}.txt`;
      const filepath = path.join(GAME_SAVES_DIR, filename);

      const saveData = {
        day,
        time,
        savedAt: new Date().toISOString(),
        gameState: data.gameState.current
      };

      await fs.writeFile(filepath, JSON.stringify(saveData, null, 2), 'utf8');

      res.json({ success: true, filename, savedAt: saveData.savedAt });
    } catch (error) {
      console.error('Error saving game:', error);
      res.status(500).json({ error: 'Failed to save game' });
    }
  });

  // Get game saves list
  app.get('/api/game/saves', async (req, res) => {
    try {
      const files = await fs.readdir(GAME_SAVES_DIR);
      const saves = [];

      for (const file of files) {
        if (file.endsWith('.txt')) {
          try {
            const filepath = path.join(GAME_SAVES_DIR, file);
            const content = await fs.readFile(filepath, 'utf8');
            const saveData = JSON.parse(content);
            saves.push({
              filename: file,
              day: saveData.day,
              time: saveData.time,
              savedAt: saveData.savedAt
            });
          } catch (err) {
            console.error(`Error reading save file ${file}:`, err);
          }
        }
      }

      saves.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
      res.json(saves);
    } catch (error) {
      console.error('Error getting game saves:', error);
      res.status(500).json({ error: 'Failed to get game saves' });
    }
  });

  // Load game state
  app.post('/api/game/load', async (req, res) => {
    try {
      const { filename } = req.body;

      if (!filename) {
        return res.status(400).json({ error: 'Filename is required' });
      }

      const filepath = path.join(GAME_SAVES_DIR, filename);
      const content = await fs.readFile(filepath, 'utf8');
      const saveData = JSON.parse(content);

      const data = await readData();
      if (!data.gameState) {
        data.gameState = {};
      }
      data.gameState.current = saveData.gameState;
      data.lastUpdate = new Date().toISOString();
      await writeData(data);

      broadcast({ type: 'gameStateUpdated', gameState: saveData.gameState });
      res.json(saveData.gameState);
    } catch (error) {
      console.error('Error loading game:', error);
      res.status(500).json({ error: 'Failed to load game' });
    }
  });

  // Delete game save
  app.delete('/api/game/saves/:filename', async (req, res) => {
    try {
      const { filename } = req.params;
      const filepath = path.join(GAME_SAVES_DIR, filename);
      await fs.unlink(filepath);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting game save:', error);
      res.status(500).json({ error: 'Failed to delete game save' });
    }
  });

  // Get game settings (for editing)
  app.get('/api/game/settings', async (req, res) => {
    try {
      const data = await readData();

      const settings = {
        config: data.gameState?.current?.gameConfig || { ...GAME_CONFIG },
        playerClasses: data.gameSettings?.playerClasses || PLAYER_CLASSES,
        monsterTypes: data.gameSettings?.monsterTypes || MONSTER_TYPES,
        levelConfig: data.gameState?.current?.levelConfig || []
      };

      res.json(settings);
    } catch (error) {
      console.error('Error getting game settings:', error);
      res.status(500).json({ error: 'Failed to get game settings' });
    }
  });

  // Update game config (teacher settings)
  app.post('/api/game/config', async (req, res) => {
    try {
      const { config, playerClasses, monsterTypes, levelConfig } = req.body;

      const data = await readData();

      if (!data.gameSettings) {
        data.gameSettings = {};
      }

      if (config) {
        if (!data.gameSettings.config) {
          data.gameSettings.config = { ...GAME_CONFIG };
        }
        Object.assign(data.gameSettings.config, config);
      }

      if (playerClasses) {
        data.gameSettings.playerClasses = playerClasses;
      }

      if (monsterTypes) {
        data.gameSettings.monsterTypes = monsterTypes;
      }

      if (levelConfig) {
        if (!data.gameState) {
          data.gameState = {};
        }
        if (!data.gameState.current) {
          data.gameState.current = {};
        }
        data.gameState.current.levelConfig = levelConfig;
      }

      if (data.gameState && data.gameState.current) {
        if (config) {
          Object.assign(data.gameState.current.gameConfig, config);
        }
        if (levelConfig) {
          data.gameState.current.levelConfig = levelConfig;
        }
      }

      data.lastUpdate = new Date().toISOString();
      await writeData(data);

      broadcast({ type: 'gameConfigUpdated', config: config || data.gameSettings.config });
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating game config:', error);
      res.status(500).json({ error: 'Failed to update game config' });
    }
  });
}

module.exports = { registerMonsterFightAdminRoutes };
