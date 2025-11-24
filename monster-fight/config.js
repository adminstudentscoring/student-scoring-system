// API Configuration for Monster Fight
// 配置 API 端點以連接到學生計分器

const API_CONFIG = {
  // API 基礎 URL
  // 如果遊戲與學生計分器在同一域名下運行，使用相對路徑
  // 如果遊戲在不同端口或域名運行，使用完整 URL
  baseURL: window.location.origin === 'http://localhost:3000' 
    ? '/api'  // 同域使用相對路徑
    : 'http://localhost:3000/api',  // 跨域使用完整 URL
  
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

