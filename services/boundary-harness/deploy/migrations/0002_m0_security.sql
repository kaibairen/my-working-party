-- M0 Security freeze · aligns M0_SECURITY_FREEZE_v1
-- audit_log column reshape + freeze_state + secret_ref check note

PRAGMA foreign_keys = ON;

-- Recreate audit_log with frozen columns (M0 greenfield OK)
DROP TABLE IF EXISTS audit_log;
CREATE TABLE audit_log (
  id              TEXT PRIMARY KEY,
  at              TEXT NOT NULL,
  actor_sub       TEXT NOT NULL,
  actor_role      TEXT NOT NULL CHECK (actor_role IN (
                    'decision_maker','coordinator','executor','viewer','service')),
  action          TEXT NOT NULL,
  resource_type   TEXT,
  resource_id     TEXT,
  request_id      TEXT,
  payload_json    TEXT
  -- append-only: no UPDATE/DELETE APIs
);

CREATE TABLE freeze_state (
  id          TEXT PRIMARY KEY CHECK (id = 'global'),
  enabled     INTEGER NOT NULL DEFAULT 0,
  reason      TEXT,
  updated_by  TEXT,
  updated_at  TEXT NOT NULL
);
INSERT INTO freeze_state(id, enabled, reason, updated_by, updated_at)
VALUES ('global', 0, NULL, 'system', datetime('now'));

-- pools.secret_ref: document allowed prefixes (app-layer validate)
-- file:/... | env:VAR_NAME — reject others with 400 secret_ref_unsupported
