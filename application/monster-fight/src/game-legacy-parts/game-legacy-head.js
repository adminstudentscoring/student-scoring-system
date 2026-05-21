// Monster Fight Game Logic (legacy body; bundled via src/main.js)
import { escapeHtml, renderIconWrap } from './html-utils.js';
import { getImagesBase, imageSrcForFile, applyBackgroundTheme } from './images.js';
import {
  POPUP_AUTO_CLOSE_MS,
  MF_DISABLE_ACTION_POPUPS,
  MF_REPLAY_STEP_MS,
  MF_UNIT_SCALE
} from './constants.js';

const GAME_API_BASE = (typeof window !== 'undefined' && typeof window.API_BASE !== 'undefined')
    ? window.API_BASE
    : (typeof API_CONFIG !== 'undefined' ? API_CONFIG.baseURL : '/api');
let gameState = null;
let gameConfig = null;
let playerClasses = [];
let monsterTypes = [];

const CLASS_ICON_MAP = {};
let monsterIconMap = {};

