// Blunders tagger factory (composes tagger/* submodules).

const { buildTaggerConstants } = require('./constants');
const { buildBoardHelpers } = require('./board');
const { buildTagBlunderPuzzle } = require('./tagBlunderPuzzle');

function createBlundersTagger(deps) {
  const Chess = deps?.Chess;
  const parseUciMove = deps?.parseUciMove;
  const puzzleDropPoints = deps?.puzzleDropPoints;
  const isMissMatePuzzle = deps?.isMissMatePuzzle;

  if (!Chess) throw new Error('createBlundersTagger: missing deps.Chess');
  if (typeof parseUciMove !== 'function') throw new Error('createBlundersTagger: missing deps.parseUciMove');
  if (typeof puzzleDropPoints !== 'function') throw new Error('createBlundersTagger: missing deps.puzzleDropPoints');
  if (typeof isMissMatePuzzle !== 'function') throw new Error('createBlundersTagger: missing deps.isMissMatePuzzle');

  const constants = buildTaggerConstants();
  const board = buildBoardHelpers(
    Chess,
    constants.BLUNDERS_TAGS,
    constants.pieceValue,
    constants.forkTargetValue,
    parseUciMove
  );
  const tagBlunderPuzzle = buildTagBlunderPuzzle(deps, board, constants);

  return {
    BLUNDERS_TAGGER_VERSION: constants.BLUNDERS_TAGGER_VERSION,
    BLUNDERS_TAGS: constants.BLUNDERS_TAGS,
    tagBlunderPuzzle
  };
}

module.exports = { createBlundersTagger };

export {};
