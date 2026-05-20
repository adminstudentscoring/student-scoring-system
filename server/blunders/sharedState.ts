function nowIso(): string {
  return new Date().toISOString();
}

function blundersChallengeDifficultyConfig(difficulty: any): any {
  const d = String(difficulty || '').toLowerCase();
  if (d === 'easy') return { key: 'easy', min: 3.0, max: Infinity, points: 1 };
  if (d === 'medium') return { key: 'medium', min: 2.0, max: 3.0, points: 2 };
  if (d === 'hard') return { key: 'hard', min: 1.0, max: 2.0, points: 3 };
  return null;
}

function createBlundersRuntimeState() {
  const BLUNDERS_ALLOWED_TIME_CLASSES = new Set(['rapid', 'blitz']);
  const BLUNDERS_MAX_GAMES_PER_DAY = 10;
  const BLUNDERS_MAX_PUZZLES_PER_STUDENT = 0;
  const BLUNDERS_DROP_POINTS = 1.0;
  const blundersLastStudentSync = new Map();
  const blundersLastStudentHistoryScan = new Map();
  const blundersStudentLocks = new Map();
  const blundersSyncState = new Map();

  return {
    BLUNDERS_ALLOWED_TIME_CLASSES,
    BLUNDERS_MAX_GAMES_PER_DAY,
    BLUNDERS_MAX_PUZZLES_PER_STUDENT,
    BLUNDERS_DROP_POINTS,
    blundersLastStudentSync,
    blundersLastStudentHistoryScan,
    blundersStudentLocks,
    blundersSyncState
  };
}

module.exports = { nowIso, blundersChallengeDifficultyConfig, createBlundersRuntimeState };

export {};
