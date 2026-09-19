import { integer, sqliteTable, text, unique, primaryKey } from "drizzle-orm/sqlite-core";

export const schemaMeta = sqliteTable("schema_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const pools = sqliteTable("pools", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  secretRef: text("secret_ref").notNull(),
  createdAt: text("created_at").notNull(),
});

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  mode: text("mode").notNull(),
  dispatchPolicy: text("dispatch_policy").notNull(),
  coordinatorRef: text("coordinator_ref").notNull(),
  gateTemplateId: text("gate_template_id"),
  dial: text("dial").notNull(),
  status: text("status").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  /** One-line intent from the office home form. Optional extra (applyCompat). */
  intent: text("intent"),
});

export const gateDefs = sqliteTable("gate_defs", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull(),
  predicateId: text("predicate_id").notNull(),
  predicateVersion: integer("predicate_version").notNull(),
  ordinal: integer("ordinal").notNull(),
  onFail: text("on_fail").notNull(),
});

export const gateInstances = sqliteTable("gate_instances", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull(),
  gateDefId: text("gate_def_id").notNull(),
  assignmentId: text("assignment_id"),
  status: text("status").notNull(),
  readyAt: text("ready_at"),
  decidedAt: text("decided_at"),
  readyResultJson: text("ready_result_json"),
  version: integer("version").notNull(),
});

export const assignments = sqliteTable("assignments", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull(),
  poolId: text("pool_id").notNull(),
  briefJson: text("brief_json").notNull(),
  budgetJson: text("budget_json").notNull(),
  status: text("status").notNull(),
  risk: text("risk"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  assignmentId: text("assignment_id").notNull(),
  adapter: text("adapter").notNull(),
  externalAgentId: text("external_agent_id"),
  externalRunId: text("external_run_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  dialAtDispatch: text("dial_at_dispatch").notNull(),
  status: text("status").notNull(),
  usageJson: text("usage_json"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => ({
  uniqIdem: unique("runs_assignment_idempotency").on(t.assignmentId, t.idempotencyKey),
}));

export const evidenceItems = sqliteTable("evidence_items", {
  id: text("id").primaryKey(),
  runId: text("run_id"),
  goalId: text("goal_id").notNull(),
  assignmentId: text("assignment_id"),
  kind: text("kind").notNull(),
  uri: text("uri").notNull(),
  sha256: text("sha256"),
  shadow: integer("shadow", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const readyPredicates = sqliteTable("ready_predicates", {
  id: text("id").notNull(),
  version: integer("version").notNull(),
  dslJson: text("dsl_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.id, t.version] }),
}));

export const githubSnapshots = sqliteTable("github_snapshots", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull(),
  assignmentId: text("assignment_id"),
  prNumber: integer("pr_number"),
  isDraft: integer("is_draft", { mode: "boolean" }).notNull(),
  checksConclusion: text("checks_conclusion"),
  rawHash: text("raw_hash"),
  observedAt: text("observed_at").notNull(),
});

export const gateDecisions = sqliteTable("gate_decisions", {
  id: text("id").primaryKey(),
  gateInstanceId: text("gate_instance_id").notNull(),
  decision: text("decision").notNull(),
  structuralChange: integer("structural_change", { mode: "boolean" }).notNull(),
  note: text("note"),
  actor: text("actor").notNull(),
  createdAt: text("created_at").notNull(),
});

export const exceptionGrants = sqliteTable("exception_grants", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull(),
  grantee: text("grantee").notNull(),
  scope: text("scope").notNull(),
  expiresAt: text("expires_at").notNull(),
  maxUses: integer("max_uses").notNull(),
  used: integer("used").notNull(),
  createdFromGateInstanceId: text("created_from_gate_instance_id"),
  createdAt: text("created_at").notNull(),
});

export const policyEvents = sqliteTable("policy_events", {
  id: text("id").primaryKey(),
  track: text("track").notNull(),
  decision: text("decision").notNull(),
  reasonCode: text("reason_code"),
  failCount: integer("fail_count").notNull(),
  goalId: text("goal_id"),
  assignmentId: text("assignment_id"),
  runId: text("run_id"),
  payloadJson: text("payload_json"),
  action: text("action"),
  closed: integer("closed", { mode: "boolean" }),
  createdAt: text("created_at").notNull(),
});

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  at: text("at").notNull(),
  actorSub: text("actor_sub").notNull(),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  requestId: text("request_id"),
  payloadJson: text("payload_json"),
});

export const freezeState = sqliteTable("freeze_state", {
  id: text("id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  reason: text("reason"),
  updatedBy: text("updated_by"),
  updatedAt: text("updated_at").notNull(),
});

export const outbox = sqliteTable("outbox", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
  publishedAt: text("published_at"),
  attempts: integer("attempts"),
  lastError: text("last_error"),
  nextAttemptAt: text("next_attempt_at"),
});

export const schema = {
  schemaMeta,
  pools,
  goals,
  gateDefs,
  gateInstances,
  assignments,
  runs,
  evidenceItems,
  readyPredicates,
  githubSnapshots,
  gateDecisions,
  exceptionGrants,
  policyEvents,
  auditLog,
  freezeState,
  outbox,
};
