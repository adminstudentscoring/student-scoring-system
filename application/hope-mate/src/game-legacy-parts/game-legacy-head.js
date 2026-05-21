// Hope Mate
// - 5x5 board (a1-e5)
// - Level 1: black king only
// - Level 2: black king + 1 random black piece (no extra king)
// - Player (white) gets 2 random pieces and must place both, then Confirm.
// - After placement: black to move. Checkmate = success. Stalemate = fail.
// - Scoring: +1 if solved on first attempt. If any failed confirm happened, later solve gives 0.
// - No time limit. No helper overlays.
//
// Note: White king is NOT required to exist; it may appear as a random piece. Rule: white king cannot be placed adjacent to black king.

