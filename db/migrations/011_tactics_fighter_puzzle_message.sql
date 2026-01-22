-- Tactics Fighter: puzzle-level message (teacher instructions for a specific puzzle)

ALTER TABLE tactics_fighter_puzzles
ADD COLUMN IF NOT EXISTS message TEXT;

