const fs = require('fs').promises;
const bootstrap = require('../bootstrap');

const {
  BLUNDERS_PUZZLES_FILE,
  BLUNDERS_STATS_FILE,
  BLUNDERS_SETTINGS_FILE,
  BLUNDERS_MASTER_PROGRESS_FILE,
  BLUNDERS_CHALLENGE_SESSIONS_FILE,
  BLUNDERS_CHALLENGE_LEADERBOARD_FILE,
  BLUNDERS_TEACHER_JOBS_FILE
} = bootstrap;

function initBlundersStorage() {
  const { createBlundersStorage: factory } = require('@student-scoring/application-blunders');
  return factory({
    fs,
    BLUNDERS_PUZZLES_FILE,
    BLUNDERS_STATS_FILE,
    BLUNDERS_SETTINGS_FILE,
    BLUNDERS_MASTER_PROGRESS_FILE,
    BLUNDERS_CHALLENGE_SESSIONS_FILE,
    BLUNDERS_CHALLENGE_LEADERBOARD_FILE,
    BLUNDERS_TEACHER_JOBS_FILE
  });
}

module.exports = { initBlundersStorage };

export {};
