import { tfDbgTeacherPractice } from './debug.js';
import { createTfSettingsHandlers } from './settings.js';

const TF = window.__TacticsFighterCore;
if (!TF) {
  console.error('[tactics-fighter] Missing core.js (window.__TacticsFighterCore). Ensure /application/tactics-fighter/core.js is loaded before tactics-fighter.js');
} else {

  const {
    escapeHtml,
    getUrlMode,
    setUrlMode,
    normalizeMode,
    fetchConfig,
    apiRequest,
    getPublicStudentPassword,
    getPublicStudentId,
    normalizeBucketKey,
    tfJson,

    pieceImageSrc,
    rcToCoord,
    parseFenToBoard,
    buildFenFromBoard,
    fenSideToMove,
    cloneBoard,
    coordToRc,
    displayToBoardRc,
    applyUciToBoard,
    undoOnePly,
    uciToPseudoSan,

    studentFetchTree,
    studentFetchSubtopicPuzzles,
    studentFetchStats,
    studentFetchGhostPuzzles,
    studentPostAttempt,
    studentEngineAnalyze,
    studentApplyMove,
    teacherApplyMove,

    builderFetchPuzzles,
    builderCreatePuzzle,
    engineAnalyze,
    builderDeletePuzzle,
    builderUpdatePuzzle,
    builderFetchTree,
    builderCreateCategory,
    builderRenameCategory,
      builderMoveCategory,
    builderDeleteCategory,
    builderCreateTopic,
    builderRenameTopic,
    builderDeleteTopic,
    builderCreateSubtopic,
    builderRenameSubtopic,
    builderUpdateSubtopicMessage,
    builderDeleteSubtopic,

    renderShell,
    renderHome,
    renderMode
  } = TF;

