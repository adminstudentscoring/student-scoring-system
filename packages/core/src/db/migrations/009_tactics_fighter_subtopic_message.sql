-- Tactics Fighter: subtopic message shown in Practice spacer

ALTER TABLE tactics_fighter_subtopics
  ADD COLUMN IF NOT EXISTS message TEXT;

