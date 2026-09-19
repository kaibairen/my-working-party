-- Boundary Harness M0 migration 0001
-- Freeze: M0_SCHEMA_v1 · schema_version=1
-- Dialect: SQLite-compatible (TEXT timestamps); Postgres: swap TEXT→TIMESTAMPTZ / JSON→JSONB

PRAGMA foreign_keys = ON;

CREATE TABLE schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO schema_meta(key, value) VALUES ('schema_version', '1');

CREATE TABLE pools (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('cursor_account','bot_group','noop')),
  secret_ref  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE goals (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL,
  mode               TEXT NOT NULL CHECK (mode IN ('explore','deliver')),
  dispatch_policy    TEXT NOT NULL DEFAULT 'coordinator_only'
                       CHECK (dispatch_policy IN ('coordinator_only','human_allowed')),
  coordinator_ref    TEXT NOT NULL,
  gate_template_id   TEXT,
  status             TEXT NOT NULL DEFAULT 'active',
  created_by         TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE ready_predicates (
  id          TEXT NOT NULL,
  version     INTEGER NOT NULL,
  dsl_json    TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE TABLE gate_defs (
  id                 TEXT PRIMARY KEY,
  goal_id            TEXT NOT NULL REFERENCES goals(id),
  predicate_id       TEXT NOT NULL,
  predicate_version  INTEGER NOT NULL,
  ordinal            INTEGER NOT NULL DEFAULT 0,
  on_fail            TEXT NOT NULL DEFAULT 'keep_pending'
                       CHECK (on_fail IN ('keep_pending','open_revise_hint')),
  FOREIGN KEY (predicate_id, predicate_version)
    REFERENCES ready_predicates(id, version)
);

CREATE TABLE gate_instances (
  id                 TEXT PRIMARY KEY,
  goal_id            TEXT NOT NULL REFERENCES goals(id),
  gate_def_id        TEXT NOT NULL REFERENCES gate_defs(id),
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','ready','decided','cancelled')),
  ready_at           TEXT,
  decided_at         TEXT,
  ready_result_json  TEXT,
  version            INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_gate_instances_status ON gate_instances(status);

CREATE TABLE assignments (
  id           TEXT PRIMARY KEY,
  goal_id      TEXT NOT NULL REFERENCES goals(id),
  pool_id      TEXT NOT NULL REFERENCES pools(id),
  brief_json   TEXT NOT NULL,
  budget_json  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'proposed'
                 CHECK (status IN (
                   'proposed','accepted','queued','in_progress',
                   'succeeded','failed','cancelled')),
  risk         TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE runs (
  id                  TEXT PRIMARY KEY,
  assignment_id       TEXT NOT NULL REFERENCES assignments(id),
  adapter             TEXT NOT NULL,
  external_agent_id   TEXT,
  external_run_id     TEXT,
  idempotency_key     TEXT NOT NULL,
  dial_at_dispatch    TEXT NOT NULL
                        CHECK (dial_at_dispatch IN ('free','guided','gated','freeze')),
  status              TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN (
                          'queued','dispatched','running',
                          'succeeded','failed','cancelled')),
  usage_json          TEXT,
  error               TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE (assignment_id, idempotency_key)
);

CREATE TABLE evidence_items (
  id              TEXT PRIMARY KEY,
  run_id          TEXT REFERENCES runs(id),
  goal_id         TEXT,
  assignment_id   TEXT,
  kind            TEXT NOT NULL CHECK (kind IN (
                    'pr','report_md','summary_md','screenshot','ci_check','artifact_uri')),
  uri             TEXT NOT NULL,
  sha256          TEXT,
  shadow          INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);

CREATE INDEX idx_evidence_goal ON evidence_items(goal_id);
CREATE INDEX idx_evidence_assignment ON evidence_items(assignment_id);

CREATE TABLE github_snapshots (
  id                  TEXT PRIMARY KEY,
  goal_id             TEXT,
  assignment_id       TEXT,
  pr_number           INTEGER,
  is_draft            INTEGER,
  checks_conclusion   TEXT,
  raw_hash            TEXT,
  observed_at         TEXT NOT NULL
);

CREATE TABLE gate_decisions (
  id                  TEXT PRIMARY KEY,
  gate_instance_id    TEXT NOT NULL REFERENCES gate_instances(id),
  decision            TEXT NOT NULL CHECK (decision IN ('pass','revise','defer')),
  structural_change   INTEGER NOT NULL DEFAULT 0,
  note                TEXT,
  actor               TEXT NOT NULL,
  created_at          TEXT NOT NULL
);

CREATE TABLE exception_grants (
  id                              TEXT PRIMARY KEY,
  goal_id                         TEXT NOT NULL REFERENCES goals(id),
  grantee                         TEXT NOT NULL,
  scope                           TEXT NOT NULL,
  expires_at                      TEXT NOT NULL,
  max_uses                        INTEGER NOT NULL DEFAULT 1,
  used                            INTEGER NOT NULL DEFAULT 0,
  created_from_gate_instance_id   TEXT,
  created_at                      TEXT NOT NULL
);

CREATE TABLE policy_events (
  id           TEXT PRIMARY KEY,
  track        TEXT NOT NULL CHECK (track IN ('authority_gate','advisory_hint')),
  decision     TEXT NOT NULL,
  reason_code  TEXT,
  fail_count   INTEGER NOT NULL DEFAULT 0,
  goal_id      TEXT,
  assignment_id TEXT,
  run_id       TEXT,
  payload_json TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE audit_log (
  id              TEXT PRIMARY KEY,
  at              TEXT NOT NULL,
  actor_sub       TEXT NOT NULL,
  actor_role      TEXT NOT NULL,
  action          TEXT NOT NULL,
  resource_type   TEXT,
  resource_id     TEXT,
  request_id      TEXT,
  payload_json    TEXT
);

CREATE TABLE outbox (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  payload       TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  published_at  TEXT
);

CREATE INDEX idx_outbox_unpublished ON outbox(published_at) WHERE published_at IS NULL;

-- Seed Ready predicates (immutable versions)
INSERT INTO ready_predicates(id, version, dsl_json, created_at) VALUES
('safety_only_v1', 1,
 '{"all":[{"type":"policy_require_gate_cleared","track":"authority_gate"}]}',
 datetime('now')),
('deliver_ready_v1', 1,
 '{"all":[{"type":"evidence_present","kinds":["summary_md"]},{"any":[{"all":[{"type":"github_pr","is_draft":false},{"type":"github_checks","conclusion":"success"}]},{"type":"equiv_machine_pack"}]}]}',
 datetime('now'));
