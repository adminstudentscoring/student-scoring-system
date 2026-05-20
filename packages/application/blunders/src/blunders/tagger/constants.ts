// Blunders tag constants and piece values.

function buildTaggerConstants() {
const BLUNDERS_TAGGER_VERSION = 'v2';
  const BLUNDERS_TAGS = {
    MISSED_MATE: 'missed_mate',
    ALLOWED_MATE: 'allowed_mate',
    MISSED_WIN: 'missed_win',
    ALLOWED_WIN: 'allowed_win',
    HANGING_PIECE: 'hanging_piece',
    MISSED_HUNG_PIECE: 'missed_hung_piece',
    ALLOWED_HUNG_PIECE: 'allowed_hung_piece',
    FORK: 'fork',
    MISSED_FORK: 'missed_fork',
    ALLOWED_FORK: 'allowed_fork',
    DOUBLE_ATTACK: 'double_attack',
    MISSED_DOUBLE_ATTACK: 'missed_double_attack',
    ALLOWED_DOUBLE_ATTACK: 'allowed_double_attack',
    DISCOVERED_ATTACK: 'discovered_attack',
    MISSED_DISCOVERED_ATTACK: 'missed_discovered_attack',
    ALLOWED_DISCOVERED_ATTACK: 'allowed_discovered_attack',
    PIN: 'pin',
    MISSED_PIN: 'missed_pin',
    ALLOWED_PIN: 'allowed_pin',
    SKEWER: 'skewer',
    MISSED_SKEWER: 'missed_skewer',
    ALLOWED_SKEWER: 'allowed_skewer',
    UNPROTECTED_PIECE: 'unprotected_piece',
    MISSED_UNPROTECTED_PIECE: 'missed_unprotected_piece',
    ALLOWED_UNPROTECTED_PIECE: 'allowed_unprotected_piece',
    LOOSE_PIECE: 'loose_piece',
    MISSED_LOOSE_PIECE: 'missed_loose_piece',
    ALLOWED_LOOSE_PIECE: 'allowed_loose_piece',
    KING_SAFETY_BLUNDER: 'king_safety_blunder',
    MISSED_KING_SAFETY_BLUNDER: 'missed_king_safety_blunder',
    ALLOWED_KING_SAFETY_BLUNDER: 'allowed_king_safety_blunder',
    TACTICAL_OVERSIGHT: 'tactical_oversight',
    MISSED_TACTICAL_OVERSIGHT: 'missed_tactical_oversight',
    ALLOWED_TACTICAL_OVERSIGHT: 'allowed_tactical_oversight',
    PHASE_OPENING: 'phase_opening',
    PHASE_MIDDLEGAME: 'phase_middlegame',
    PHASE_ENDGAME: 'phase_endgame'
  };

  const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  function pieceValue(piece) {
    if (!piece) return 0;
    return PIECE_VALUE[String(piece.type || '').toLowerCase()] || 0;
  }

  function forkTargetValue(piece) {
    // For forks, king counts as a high-value target (king+piece forks matter).
    if (!piece) return 0;
    const t = String(piece.type || '').toLowerCase();
    if (t === 'k') return 100;
    return pieceValue(piece);
  }

  return { BLUNDERS_TAGGER_VERSION, BLUNDERS_TAGS, pieceValue, forkTargetValue };
}

module.exports = { buildTaggerConstants };

export {};
