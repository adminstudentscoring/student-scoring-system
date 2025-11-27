// API Configuration for Monster Fight
// Configure API endpoints to connect to Student Scoring System

const API_CONFIG = {
  // API base URL
  // If game runs on the same domain as Student Scoring System, use relative path
  // Otherwise, use current domain's API endpoint
  baseURL: window.location.origin === 'http://localhost:3000' 
    ? '/api'  // Local development: use relative path
    : window.location.origin + '/api',  // Production: use current domain's API
  
  // API 端點
  endpoints: {
    // 遊戲相關 API
    getGameState: '/game/state',
    getGameConfig: '/game/config',
    initGame: '/game/init',
    inputPuzzlePoints: '/game/input-puzzle-points',
    playerAction: '/game/player-action',
    monsterTurn: '/game/monster-turn',
    selectCharacter: '/game/select-character',
    revive: '/game/revive',
    updateGameConfig: '/game/config',
  },
  
  // 請求配置
  requestConfig: {
    headers: {
      'Content-Type': 'application/json',
    },
  }
};

// 導出配置（如果使用模組系統）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API_CONFIG;
}

// 全局可用
window.API_CONFIG = API_CONFIG;

