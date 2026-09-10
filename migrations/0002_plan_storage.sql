-- Scores P3 (WSHED-102): the plan (free | premium) and the running total of
-- cloud score bytes per account. Quotas per plan live in js/lib/scores/plans.js.
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN storage_bytes INTEGER NOT NULL DEFAULT 0;
