-- Domain Stage-edge P0
-- Additive: gate_defs.stage_key + assignments.unlock_after_gate_def_id
-- schema_version 1 → 2. Idempotent applicator is applyCompat() (ALTER only if missing).
-- harness≠jail: these columns only encode stage edges; they MUST NOT script path choice.

PRAGMA foreign_keys = ON;

ALTER TABLE gate_defs ADD COLUMN stage_key TEXT;
ALTER TABLE assignments ADD COLUMN unlock_after_gate_def_id TEXT REFERENCES gate_defs(id);

INSERT OR IGNORE INTO ready_predicates(id, version, dsl_json, created_at) VALUES
('research_ready_v1', 1,
 '{"id":"research_ready_v1","version":1,"all":[{"type":"evidence_present","kinds":["report_md"]}]}',
 datetime('now')),
('deliver_report_ready_v1', 1,
 '{"id":"deliver_report_ready_v1","version":1,"all":[{"type":"run_finished"},{"type":"evidence_present","kinds":["report_md"]},{"type":"any","of":[{"type":"all","items":[{"type":"github_pr","is_draft":false},{"type":"github_checks","conclusion":"success"}]},{"type":"all","items":[{"type":"evidence_present","kinds":["artifact_uri"]},{"type":"noop_or_offline_contract","ok":true}]}]}]}',
 datetime('now'));

UPDATE schema_meta SET value = '2' WHERE key = 'schema_version';
