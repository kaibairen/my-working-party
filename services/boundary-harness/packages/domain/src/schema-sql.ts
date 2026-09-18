export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  schema_version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pools (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  secret_ref TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  mode TEXT NOT NULL,
  dispatch_policy TEXT NOT NULL,
  coordinator_ref TEXT NOT NULL,
  gate_template_id TEXT,
  dial TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gate_defs (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  predicate_id TEXT NOT NULL,
  predicate_version INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  on_fail TEXT NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(id)
);

CREATE TABLE IF NOT EXISTS gate_instances (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  gate_def_id TEXT NOT NULL,
  assignment_id TEXT,
  status TEXT NOT NULL,
  ready_at TEXT,
  decided_at TEXT,
  ready_result_json TEXT,
  version INTEGER NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(id),
  FOREIGN KEY (gate_def_id) REFERENCES gate_defs(id)
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  pool_id TEXT NOT NULL,
  brief_json TEXT NOT NULL,
  budget_json TEXT NOT NULL,
  status TEXT NOT NULL,
  risk TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(id),
  FOREIGN KEY (pool_id) REFERENCES pools(id)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  adapter TEXT NOT NULL,
  external_agent_id TEXT,
  external_run_id TEXT,
  idempotency_key TEXT NOT NULL,
  dial_at_dispatch TEXT NOT NULL,
  status TEXT NOT NULL,
  usage_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (assignment_id, idempotency_key),
  FOREIGN KEY (assignment_id) REFERENCES assignments(id)
);

CREATE TABLE IF NOT EXISTS evidence_items (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  goal_id TEXT NOT NULL,
  assignment_id TEXT,
  kind TEXT NOT NULL,
  uri TEXT NOT NULL,
  sha256 TEXT,
  shadow INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS ready_predicates (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  dsl_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS github_snapshots (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  assignment_id TEXT,
  pr_number INTEGER,
  is_draft INTEGER NOT NULL,
  checks_conclusion TEXT,
  raw_hash TEXT,
  observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gate_decisions (
  id TEXT PRIMARY KEY,
  gate_instance_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  structural_change INTEGER NOT NULL,
  note TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (gate_instance_id) REFERENCES gate_instances(id)
);

CREATE TABLE IF NOT EXISTS exception_grants (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  grantee TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  max_uses INTEGER NOT NULL,
  used INTEGER NOT NULL,
  created_from_gate_instance_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(id)
);

CREATE TABLE IF NOT EXISTS policy_events (
  id TEXT PRIMARY KEY,
  goal_id TEXT,
  assignment_id TEXT,
  action TEXT NOT NULL,
  decision TEXT NOT NULL,
  track TEXT NOT NULL,
  fail_count INTEGER NOT NULL,
  closed INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor_sub TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  request_id TEXT,
  payload_json TEXT
);

CREATE TABLE IF NOT EXISTS admin_freeze (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,
  reason TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT
);
`;
