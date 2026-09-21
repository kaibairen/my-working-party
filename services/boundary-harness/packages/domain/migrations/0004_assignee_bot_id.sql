-- P0-B: assignments.assignee_bot_id binds a concrete bot (not a pool seed).
-- Additive. schema_version 2 → 3. Idempotent applicator is applyCompat()
-- (ALTER only if missing). Coordinator/service set the bind; office DM
-- MUST NOT gain a new assign/dispatch write route.

PRAGMA foreign_keys = ON;

ALTER TABLE assignments ADD COLUMN assignee_bot_id TEXT;

UPDATE schema_meta SET value = '3' WHERE key = 'schema_version';
