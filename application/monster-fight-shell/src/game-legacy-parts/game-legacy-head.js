// Monster Fight Game Logic
// Use a unique constant name to avoid conflicts with other scripts
// Check if API_BASE exists in window scope, otherwise use default
// For standalone version, use API_CONFIG from config.js
const GAME_API_BASE = (typeof window !== 'undefined' && typeof window.API_BASE !== 'undefined') 
    ? window.API_BASE 
    : (typeof API_CONFIG !== 'undefined' ? API_CONFIG.baseURL : '/api');
let gameState = null;
let gameConfig = null;
let playerClasses = [];
let monsterTypes = [];

const CLASS_ICON_MAP = {};
let monsterIconMap = {};

