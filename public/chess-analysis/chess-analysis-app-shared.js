/**
 * Chess Analysis — shared state & chess.js imports.
 */
import {
  Chess,
  validateFen,
  WHITE,
  BLACK,
  PAWN,
  KNIGHT,
  BISHOP,
  ROOK,
  QUEEN,
  KING
} from '/chess-analysis/vendor/chess.js';

export {
  Chess,
  validateFen,
  WHITE,
  BLACK,
  PAWN,
  KNIGHT,
  BISHOP,
  ROOK,
  QUEEN,
  KING
};

export const STORAGE_KEY = 'chessAnalysisSaved';

export const PIECE_CHARS = {
  w: { p: '\u2659', n: '\u2658', b: '\u2657', r: '\u2656', q: '\u2655', k: '\u2654' },
  b: { p: '\u265F', n: '\u265E', b: '\u265D', r: '\u265C', q: '\u265B', k: '\u265A' }
};

export const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const state = {
  startFen: START_FEN,
  moves: [],
  moveIndex: 0,
  whiteName: 'White',
  blackName: 'Black',
  positionLabel: 'Starting position',
  flipped: false,
  coordsVisible: true,
  currentPgn: '',
  editorChess: null,
  /** @type {{ type: string, color: string } | 'delete' | null} */
  paletteSelection: null
};
