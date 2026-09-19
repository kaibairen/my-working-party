import { and, eq, isNull } from "drizzle-orm";
import { checkPolicy, type PolicyCheckInput, type PolicyCheckResult } from "@harness/policy";
import { evaluateReady, requiredEvidenceKinds, type ReadyContext } from "@harness/ready";
import { parseBriefV1, parseBudget, EVIDENCE_KINDS, type EvidenceKind } from "./brief";
import { HarnessError } from "./errors";
import { signHarnessWebhook } from "./hmac";
import type { Actor, Dial, Role } from "./rbac";
import { DIALS, assertSecretRef, redactPayload, requirePoolAccess, requireRole } from "./rbac";
import type { Harness } from "./db";
import {
  freezeState,
  assignments,
  auditLog,
  evidenceItems,
  exceptionGrants,
  gateDecisions,
  gateDefs,
  gateInstances,
  githubSnapshots,
  goals,
  outbox,
  policyEvents,
  pools,
  runs,
} from "./schema";

export type CreateGoalInput = {
  title: string;
  mode: "explore" | "deliver";
  coordinator_ref?: string | null;
  dispatch_policy?: "coordinator_only" | "human_allowed";
  gate_template_id?: string | null;
  safety_gate?: boolean;
  dial?: Dial;
};

export type FillAssignmentInput = {
  pool_id: string;
  brief: unknown;
  budget?: unknown;
  exception_grant_id?: string;
};

export type EvidenceAttachItem = {
  kind: string;
  uri: string;
  sha256?: string;
  shadow?: boolean;
};

function audit(
  h: Harness,
  actor: Actor,
  action: string,
  resourceType?: string,
  resourceId?: string,
  payload?: unknown,
): void {
  const redacted = payload === undefined ? undefined : redactPayload(payload);
  h.db.insert(auditLog).values({
    id: h.newId(),
    at: h.now(),
    actorSub: actor.id,
    actorRole: actor.role,
    action,
    resourceType: resourceType ?? null,
    resourceId: resourceId ?? null,
    requestId: actor.request_id ?? null,
    payloadJson: redacted === undefined ? null : JSON.stringify(redacted),
  }).run();
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

function publicPool(row: typeof pools.$inferSelect) {
  return { id: row.id, kind: row.kind, secret_ref: row.secretRef, created_at: row.createdAt };
}

function publicGoal(row: typeof goals.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode,
    dispatch_policy: row.dispatchPolicy,
    coordinator_ref: row.coordinatorRef,
    gate_template_id: row.gateTemplateId,
    dial: row.dial,
    status: row.status,
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function publicAssignment(row: typeof assignments.$inferSelect) {
  return {
    id: row.id,
    goal_id: row.goalId,
    pool_id: row.poolId,
    brief: parseJson(row.briefJson),
    budget: parseJson(row.budgetJson),
    status: row.status,
    risk: row.risk,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function publicRun(row: typeof runs.$inferSelect) {
  return {
    id: row.id,
    assignment_id: row.assignmentId,
    adapter: row.adapter,
    external_agent_id: row.externalAgentId,
    external_run_id: row.externalRunId,
    idempotency_key: row.idempotencyKey,
    dial_at_dispatch: row.dialAtDispatch,
    status: row.status,
    usage: parseJson(row.usageJson),
    error: row.error,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    advisory: true as const,
  };
}

function publicGate(
  row: typeof gateInstances.$inferSelect,
  def?: typeof gateDefs.$inferSelect | null,
  goalTitle?: string | null,
) {
  const ready = parseJson<{
    missing?: string[];
    predicate_id?: string;
    predicate_version?: number;
  }>(row.readyResultJson);
  return {
    id: row.id,
    goal_id: row.goalId,
    goal_title: goalTitle ?? null,
    gate_def_id: row.gateDefId,
    assignment_id: row.assignmentId,
    status: row.status,
    ready_at: row.readyAt,
    decided_at: row.decidedAt,
    ready_result: ready,
    version: row.version,
    predicate_id: def?.predicateId ?? ready?.predicate_id ?? null,
    predicate_version: def?.predicateVersion ?? ready?.predicate_version ?? null,
  };
}

export function listPools(h: Harness) {
  return h.db.select().from(pools).all().map(publicPool);
}

export function createPool(
  h: Harness,
  actor: Actor,
  input: { id?: string; kind: string; secret_ref: string },
) {
  requireRole(actor, ["decision_maker", "service"]);
  const kinds = ["cursor_account", "bot_group", "noop"] as const;
  if (!(kinds as readonly string[]).includes(input.kind)) {
    throw new HarnessError("pool_kind_invalid", "kind must be cursor_account|bot_group|noop", 422);
  }
  assertSecretRef(input.secret_ref);
  const id = input.id?.trim() || h.newId();
  const existing = h.db.select().from(pools).where(eq(pools.id, id)).get();
  if (existing) {
    throw new HarnessError("pool_exists", `pool ${id} already exists`, 409);
  }
  h.db.insert(pools).values({
    id,
    kind: input.kind,
    secretRef: input.secret_ref,
    createdAt: h.now(),
  }).run();
  audit(h, actor, "create_pool", "pool", id, { kind: input.kind, secret_ref: input.secret_ref });
  const row = h.db.select().from(pools).where(eq(pools.id, id)).get();
  if (!row) throw new HarnessError("not_found", "pool missing after insert", 500);
  return publicPool(row);
}

export function getGoal(h: Harness, id: string) {
  const row = h.db.select().from(goals).where(eq(goals.id, id)).get();
  if (!row) throw new HarnessError("not_found", `goal ${id} not found`, 404);
  const defs = h.db.select().from(gateDefs).where(eq(gateDefs.goalId, id)).all().map((d) => ({
    id: d.id,
    goal_id: d.goalId,
    predicate_id: d.predicateId,
    predicate_version: d.predicateVersion,
    ordinal: d.ordinal,
    on_fail: d.onFail,
  }));
  return { ...publicGoal(row), gate_defs: defs };
}

export function createGoal(h: Harness, actor: Actor, input: CreateGoalInput) {
  requireRole(actor, ["decision_maker", "coordinator"]);
  if (!input.coordinator_ref || !input.coordinator_ref.trim()) {
    throw new HarnessError("coordinator_ref_required", "Goal MUST bind coordinator_ref", 422);
  }
  if (input.mode !== "explore" && input.mode !== "deliver") {
    throw new HarnessError("mode_invalid", "mode must be explore or deliver", 422);
  }

  let template = input.gate_template_id ?? null;
  if (input.safety_gate) template = "safety_only_v1";

  if (input.mode === "explore" && template === "deliver_ready_v1") {
    throw new HarnessError(
      "mode_template_mismatch",
      "explore MUST NOT default-bind deliver_ready_v1",
      422,
    );
  }
  if (input.mode === "deliver") {
    if (template && template !== "deliver_ready_v1") {
      throw new HarnessError(
        "mode_template_mismatch",
        "deliver MUST use deliver_ready_v1 in M0",
        422,
      );
    }
    template = "deliver_ready_v1";
  }
  if (input.mode === "explore" && template && template !== "safety_only_v1") {
    throw new HarnessError(
      "mode_template_mismatch",
      "explore may use null template or safety_only_v1",
      422,
    );
  }

  const id = h.newId();
  const ts = h.now();
  h.db.insert(goals).values({
    id,
    title: input.title,
    mode: input.mode,
    dispatchPolicy: input.dispatch_policy ?? "coordinator_only",
    coordinatorRef: input.coordinator_ref,
    gateTemplateId: template,
    dial: input.dial && (DIALS as readonly string[]).includes(input.dial) ? input.dial : "free",
    status: "active",
    createdBy: actor.id,
    createdAt: ts,
    updatedAt: ts,
  }).run();

  if (template === "deliver_ready_v1") {
    h.db.insert(gateDefs).values({
      id: h.newId(),
      goalId: id,
      predicateId: "deliver_ready_v1",
      predicateVersion: 1,
      ordinal: 0,
      onFail: "keep_pending",
    }).run();
  } else if (template === "safety_only_v1") {
    h.db.insert(gateDefs).values({
      id: h.newId(),
      goalId: id,
      predicateId: "safety_only_v1",
      predicateVersion: 1,
      ordinal: 0,
      onFail: "keep_pending",
    }).run();
  }

  audit(h, actor, "create_goal", "goal", id, { mode: input.mode, template });
  return getGoal(h, id);
}

export function setGoalDial(h: Harness, actor: Actor, goalId: string, dial: string) {
  requireRole(actor, ["coordinator", "decision_maker"]);
  if (!(DIALS as readonly string[]).includes(dial)) {
    throw new HarnessError("dial_invalid", "dial must be free|guided|gated|freeze", 422);
  }
  getGoal(h, goalId);
  h.db.update(goals).set({ dial, updatedAt: h.now() }).where(eq(goals.id, goalId)).run();
  audit(h, actor, "set_dial", "goal", goalId, { dial });
  return getGoal(h, goalId);
}

function consumeGrant(h: Harness, actor: Actor, goalId: string, grantId: string, scope: string) {
  const grant = h.db.select().from(exceptionGrants).where(eq(exceptionGrants.id, grantId)).get();
  if (!grant || grant.goalId !== goalId) {
    throw new HarnessError("forbidden", "exception_grant not found for this goal", 403);
  }
  if (grant.grantee !== actor.id) {
    throw new HarnessError("forbidden", "exception_grant grantee mismatch", 403);
  }
  if (grant.scope !== scope) {
    throw new HarnessError("forbidden", "exception_grant scope mismatch", 403);
  }
  if (grant.expiresAt <= h.now()) {
    throw new HarnessError("forbidden", "exception_grant expired", 403);
  }
  if (grant.used >= grant.maxUses) {
    throw new HarnessError("forbidden", "exception_grant exhausted", 403);
  }
  h.db
    .update(exceptionGrants)
    .set({ used: grant.used + 1 })
    .where(eq(exceptionGrants.id, grantId))
    .run();
}

export function createExceptionGrant(
  h: Harness,
  actor: Actor,
  goalId: string,
  input: { grantee: string; scope?: string; ttl_seconds?: number; max_uses?: number },
) {
  requireRole(actor, ["decision_maker"]);
  getGoal(h, goalId);
  const ts = h.now();
  const ttl = input.ttl_seconds ?? 3600;
  const expires = new Date(Date.parse(ts) + ttl * 1000).toISOString();
  const id = h.newId();
  h.db.insert(exceptionGrants).values({
    id,
    goalId,
    grantee: input.grantee,
    scope: input.scope ?? "fill_assignment",
    expiresAt: expires,
    maxUses: input.max_uses ?? 1,
    used: 0,
    createdFromGateInstanceId: null,
    createdAt: ts,
  }).run();
  audit(h, actor, "create_exception_grant", "exception_grant", id);
  return { id, goal_id: goalId, grantee: input.grantee, expires_at: expires, scope: input.scope ?? "fill_assignment" };
}

export function fillAssignment(h: Harness, actor: Actor, goalId: string, input: FillAssignmentInput) {
  const goal = h.db.select().from(goals).where(eq(goals.id, goalId)).get();
  if (!goal) throw new HarnessError("not_found", `goal ${goalId} not found`, 404);

  const brief = parseBriefV1(input.brief);
  const budget = parseBudget(input.budget);

  const pool = h.db.select().from(pools).where(eq(pools.id, input.pool_id)).get();
  if (!pool) throw new HarnessError("not_found", `pool ${input.pool_id} not found`, 404);
  requirePoolAccess(actor, input.pool_id);

  const defs = h.db.select().from(gateDefs).where(eq(gateDefs.goalId, goalId)).all();
  for (const def of defs) {
    const needed = requiredEvidenceKinds(def.predicateId, def.predicateVersion);
    const missing = needed.filter((k) => !brief.evidence_shape.includes(k as EvidenceKind));
    if (missing.length > 0) {
      throw new HarnessError(
        "predicate_evidence_mismatch",
        "predicate kinds must be ⊆ assignment evidence_shape",
        400,
        { missing },
      );
    }
  }

  let status = "accepted";
  if (actor.role === "coordinator") {
    // ok
  } else if (actor.role === "executor") {
    status = "proposed";
  } else if (actor.role === "decision_maker") {
    if (goal.dispatchPolicy === "human_allowed") {
      // scoped open on this goal
    } else if (input.exception_grant_id) {
      consumeGrant(h, actor, goalId, input.exception_grant_id, "fill_assignment");
    } else {
      throw new HarnessError(
        "forbidden",
        "human fan-out requires exception_grant or human_allowed",
        403,
      );
    }
  } else {
    throw new HarnessError("forbidden", `role ${actor.role} cannot fill assignment`, 403);
  }

  const id = h.newId();
  const ts = h.now();
  h.db.insert(assignments).values({
    id,
    goalId,
    poolId: input.pool_id,
    briefJson: JSON.stringify(brief),
    budgetJson: JSON.stringify(budget),
    status,
    risk: null,
    createdAt: ts,
    updatedAt: ts,
  }).run();
  audit(h, actor, status === "proposed" ? "propose_assignment" : "fill_assignment", "assignment", id);
  return getAssignment(h, id);
}

export function getAssignment(h: Harness, id: string) {
  const row = h.db.select().from(assignments).where(eq(assignments.id, id)).get();
  if (!row) throw new HarnessError("not_found", `assignment ${id} not found`, 404);
  return publicAssignment(row);
}

function collectReadyContext(h: Harness, goalId: string): ReadyContext {
  const ev = h.db.select().from(evidenceItems).where(eq(evidenceItems.goalId, goalId)).all();
  const snaps = h.db.select().from(githubSnapshots).where(eq(githubSnapshots.goalId, goalId)).all();
  const events = h.db.select().from(policyEvents).where(eq(policyEvents.goalId, goalId)).all();
  const assignmentRows = h.db.select().from(assignments).where(eq(assignments.goalId, goalId)).all();
  const runRows = assignmentRows.flatMap((a) =>
    h.db.select().from(runs).where(eq(runs.assignmentId, a.id)).all(),
  );
  const finished = (r: (typeof runRows)[number]) => {
    const usage = parseJson<{ cursor_lifecycle?: string; noop_or_offline_contract?: boolean }>(r.usageJson);
    if (usage?.cursor_lifecycle === "IDLE" || r.status === "idle") return false;
    if (usage?.cursor_lifecycle === "FINISHED") return true;
    return r.adapter === "noop" && usage?.noop_or_offline_contract === true;
  };
  const noopOrOfflineContract = runRows.some((r) => {
    const usage = parseJson<{ noop_or_offline_contract?: boolean }>(r.usageJson);
    return finished(r) && r.adapter === "noop" && usage?.noop_or_offline_contract === true;
  });
  return {
    evidence: ev.map((e) => ({ kind: e.kind, uri: e.uri, shadow: e.shadow })),
    githubSnapshots: snaps.map((s) => ({
      is_draft: s.isDraft,
      checks_conclusion: s.checksConclusion,
    })),
    policyEvents: events.map((e) => ({
      decision: e.decision,
      track: e.track,
      closed: e.closed,
    })),
    noopOrOfflineContract,
    runFinished: runRows.some(finished),
  };
}

function evaluatePendingDeliverGates(h: Harness, goalId: string): void {
  const pending = h.db
    .select()
    .from(gateInstances)
    .where(and(eq(gateInstances.goalId, goalId), eq(gateInstances.status, "pending")))
    .all();
  if (pending.length === 0) return;
  const ctx = collectReadyContext(h, goalId);
  for (const inst of pending) {
    const def = h.db.select().from(gateDefs).where(eq(gateDefs.id, inst.gateDefId)).get();
    if (!def) continue;
    const result = evaluateReady(def.predicateId, def.predicateVersion, ctx, h.now());
    if (result.ok) {
      const nextVersion = inst.version + 1;
      h.db
        .update(gateInstances)
        .set({
          status: "ready",
          readyAt: result.evaluated_at,
          readyResultJson: JSON.stringify(result),
          version: nextVersion,
        })
        .where(and(eq(gateInstances.id, inst.id), eq(gateInstances.status, "pending"), eq(gateInstances.version, inst.version)))
        .run();
      const outboxId = h.newId();
      const payload = { gate_instance_id: inst.id, goal_id: goalId, result, outbox_id: outboxId };
      h.db.insert(outbox).values({
        id: outboxId,
        type: "gate.ready",
        payload: JSON.stringify(payload),
        createdAt: h.now(),
        publishedAt: null,
        attempts: 0,
        lastError: null,
        nextAttemptAt: null,
      }).run();
      h.bus.emit("gate.ready", payload);
    } else {
      h.db
        .update(gateInstances)
        .set({ readyResultJson: JSON.stringify(result) })
        .where(eq(gateInstances.id, inst.id))
        .run();
    }
  }
}

function ensureDeliverGateInstance(h: Harness, goalId: string, assignmentId: string): void {
  const defs = h.db
    .select()
    .from(gateDefs)
    .where(and(eq(gateDefs.goalId, goalId), eq(gateDefs.predicateId, "deliver_ready_v1")))
    .all();
  for (const def of defs) {
    const existing = h.db
      .select()
      .from(gateInstances)
      .where(and(eq(gateInstances.gateDefId, def.id), eq(gateInstances.assignmentId, assignmentId)))
      .get();
    if (existing) continue;
    h.db.insert(gateInstances).values({
      id: h.newId(),
      goalId,
      gateDefId: def.id,
      assignmentId,
      status: "pending",
      readyAt: null,
      decidedAt: null,
      readyResultJson: null,
      version: 0,
    }).run();
  }
}

export async function dispatchAssignment(
  h: Harness,
  actor: Actor,
  assignmentId: string,
  idempotencyKey: string,
) {
  requireRole(actor, ["coordinator", "service"]);
  if (!idempotencyKey) {
    throw new HarnessError("idempotency_key_required", "idempotency_key is required", 422);
  }

  const assignment = h.db.select().from(assignments).where(eq(assignments.id, assignmentId)).get();
  if (!assignment) throw new HarnessError("not_found", `assignment ${assignmentId} not found`, 404);
  const goal = h.db.select().from(goals).where(eq(goals.id, assignment.goalId)).get();
  if (!goal) throw new HarnessError("not_found", "goal not found", 404);
  if (!goal.coordinatorRef) {
    throw new HarnessError("coordinator_ref_required", "cannot dispatch without coordinator_ref", 422);
  }

  requirePoolAccess(actor, assignment.poolId);

  const existing = h.db
    .select()
    .from(runs)
    .where(and(eq(runs.assignmentId, assignmentId), eq(runs.idempotencyKey, idempotencyKey)))
    .get();
  if (existing) return { ...publicRun(existing), created: false };

  assertAdminNotFrozen(h);

  const dial = ((goal as { dial?: string }).dial ?? "free") as Dial;
  if (dial === "freeze") {
    throw new HarnessError("dial_frozen", "freeze rejects new dispatch", 423, {
      goal_id: goal.id,
      dial,
    });
  }

  const pool = h.db.select().from(pools).where(eq(pools.id, assignment.poolId)).get();
  const adapterName = pool?.kind === "cursor_account" ? "cursor" : "noop";
  const adapter = adapterName === "cursor" ? h.adapters.cursor : h.adapters.noop;

  const runId = h.newId();
  const ts = h.now();
  h.db.insert(runs).values({
    id: runId,
    assignmentId,
    adapter: adapterName,
    externalAgentId: null,
    externalRunId: null,
    idempotencyKey,
    dialAtDispatch: dial,
    status: "queued",
    usageJson: null,
    error: null,
    createdAt: ts,
    updatedAt: ts,
  }).run();

  const storedBrief = parseJson<{
    outcome?: string;
    constraints?: string[];
    evidence_shape?: string[];
  }>(assignment.briefJson);
  const result = await adapter.dispatch({
    runId,
    assignmentId,
    idempotencyKey,
    ...(adapterName === "cursor"
      ? {
          brief: {
            outcome: storedBrief?.outcome ?? "",
            constraints: Array.isArray(storedBrief?.constraints) ? storedBrief.constraints : [],
            evidence_shape: Array.isArray(storedBrief?.evidence_shape)
              ? storedBrief.evidence_shape
              : [],
          },
          goal: { id: goal.id, title: goal.title, mode: goal.mode },
        }
      : {}),
  });
  const doneAt = h.now();
  h.db
    .update(runs)
    .set({
      adapter: result.adapter,
      externalAgentId: result.external_agent_id,
      externalRunId: result.external_run_id,
      status: result.status,
      usageJson: JSON.stringify(result.usage_json),
      error: "error" in result ? result.error ?? null : null,
      updatedAt: doneAt,
    })
    .where(eq(runs.id, runId))
    .run();

  h.db
    .update(assignments)
    .set({
      status: result.status === "failed" ? "failed" : "succeeded",
      updatedAt: doneAt,
    })
    .where(eq(assignments.id, assignmentId))
    .run();

  ensureDeliverGateInstance(h, goal.id, assignmentId);
  evaluatePendingDeliverGates(h, goal.id);

  audit(h, actor, "dispatch", "run", runId, { assignment_id: assignmentId, adapter: result.adapter });
  const run = h.db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!run) throw new HarnessError("not_found", "run missing after dispatch", 500);
  return { ...publicRun(run), created: true };
}

export function getRun(h: Harness, id: string) {
  const row = h.db.select().from(runs).where(eq(runs.id, id)).get();
  if (!row) throw new HarnessError("not_found", `run ${id} not found`, 404);
  return publicRun(row);
}

export function attachEvidence(
  h: Harness,
  actor: Actor,
  runId: string,
  items: EvidenceAttachItem[],
) {
  requireRole(actor, ["coordinator", "executor", "service"]);
  const run = h.db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!run) throw new HarnessError("not_found", `run ${runId} not found`, 404);
  const assignment = h.db.select().from(assignments).where(eq(assignments.id, run.assignmentId)).get();
  if (!assignment) throw new HarnessError("not_found", "assignment not found", 404);
  requirePoolAccess(actor, assignment.poolId);

  if (!Array.isArray(items) || items.length === 0) {
    throw new HarnessError("evidence_invalid", "items must be a non-empty array", 422);
  }

  const created = [];
  let anyLive = false;
  for (const item of items) {
    if (!(EVIDENCE_KINDS as readonly string[]).includes(item.kind)) {
      throw new HarnessError("evidence_kind_invalid", `unknown evidence kind ${item.kind}`, 422);
    }
    if (!item.uri) {
      throw new HarnessError("evidence_invalid", "uri is required", 422);
    }
    const shadow = item.shadow === true;
    if (!shadow) anyLive = true;
    const id = h.newId();
    h.db.insert(evidenceItems).values({
      id,
      runId,
      goalId: assignment.goalId,
      assignmentId: assignment.id,
      kind: item.kind,
      uri: item.uri,
      sha256: item.sha256 ?? null,
      shadow,
      createdAt: h.now(),
    }).run();
    created.push({ id, kind: item.kind, uri: item.uri, shadow });
  }

  if (anyLive) {
    evaluatePendingDeliverGates(h, assignment.goalId);
  }

  audit(h, actor, "attach_evidence", "run", runId, { count: created.length });
  return { run_id: runId, items: created };
}

export function recordGithubSnapshot(
  h: Harness,
  input: {
    goal_id: string;
    assignment_id?: string;
    pr_number?: number;
    is_draft: boolean;
    checks_conclusion?: string | null;
    raw_hash?: string;
  },
) {
  const id = h.newId();
  h.db.insert(githubSnapshots).values({
    id,
    goalId: input.goal_id,
    assignmentId: input.assignment_id ?? null,
    prNumber: input.pr_number ?? null,
    isDraft: input.is_draft,
    checksConclusion: input.checks_conclusion ?? null,
    rawHash: input.raw_hash ?? null,
    observedAt: h.now(),
  }).run();
  evaluatePendingDeliverGates(h, input.goal_id);
  return { id };
}

export function policyCheck(
  h: Harness,
  actor: Actor,
  input: PolicyCheckInput & { goal_id?: string; assignment_id?: string },
): PolicyCheckResult & { policy_event_id: string; gate_instance?: ReturnType<typeof publicGate> } {
  requireRole(actor, ["decision_maker", "coordinator", "executor", "service"]);
  if (!input.action) {
    throw new HarnessError("policy_invalid", "action is required", 422);
  }
  const result = checkPolicy(input);
  const eventId = h.newId();
  h.db.insert(policyEvents).values({
    id: eventId,
    track: result.track,
    decision: result.decision,
    reasonCode: result.reason_code,
    failCount: Number(input.context?.fail_count ?? 0),
    goalId: input.goal_id ?? null,
    assignmentId: input.assignment_id ?? null,
    runId: null,
    payloadJson: JSON.stringify(result),
    action: input.action,
    closed: false,
    createdAt: h.now(),
  }).run();

  let gate_instance: ReturnType<typeof publicGate> | undefined;
  if (result.creates_gate && result.track === "authority_gate" && input.goal_id) {
    const goal = h.db.select().from(goals).where(eq(goals.id, input.goal_id)).get();
    if (goal) {
      const safetyDef = h.db
        .select()
        .from(gateDefs)
        .where(and(eq(gateDefs.goalId, goal.id), eq(gateDefs.predicateId, "safety_only_v1")))
        .get();
      if (safetyDef) {
        const instId = h.newId();
        const readyResult = {
          ok: true,
          missing: [`authority_escalation:${input.action}`],
          predicate_id: "safety_only_v1",
          predicate_version: 1,
          evaluated_at: h.now(),
        };
        h.db.insert(gateInstances).values({
          id: instId,
          goalId: goal.id,
          gateDefId: safetyDef.id,
          assignmentId: input.assignment_id ?? null,
          status: "ready",
          readyAt: h.now(),
          decidedAt: null,
          readyResultJson: JSON.stringify(readyResult),
          version: 0,
        }).run();
        const outboxId = h.newId();
        const payload = { gate_instance_id: instId, goal_id: goal.id, result: readyResult, outbox_id: outboxId };
        h.db.insert(outbox).values({
          id: outboxId,
          type: "gate.ready",
          payload: JSON.stringify(payload),
          createdAt: h.now(),
          publishedAt: null,
          attempts: 0,
          lastError: null,
          nextAttemptAt: null,
        }).run();
        h.bus.emit("gate.ready", payload);
        const inst = h.db.select().from(gateInstances).where(eq(gateInstances.id, instId)).get();
        if (inst) gate_instance = publicGate(inst, safetyDef, goal.title);
      }
    }
  }

  audit(h, actor, "policy_check", "policy_event", eventId, result);
  return { ...result, policy_event_id: eventId, gate_instance };
}

export function listGateInstances(
  h: Harness,
  actor: Actor,
  query: { status?: string; goal_id?: string },
) {
  requireRole(actor, ["decision_maker", "coordinator", "viewer", "service"]);
  let rows = h.db.select().from(gateInstances).all();
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.goal_id) rows = rows.filter((r) => r.goalId === query.goal_id);
  return rows.map((r) => {
    const def = h.db.select().from(gateDefs).where(eq(gateDefs.id, r.gateDefId)).get();
    const goal = h.db.select().from(goals).where(eq(goals.id, r.goalId)).get();
    return publicGate(r, def, goal?.title);
  });
}

export async function decideGate(
  h: Harness,
  actor: Actor,
  gateInstanceId: string,
  input: { decision: "pass" | "revise" | "defer"; version: number; note?: string; structural_change?: boolean },
) {
  requireRole(actor, ["decision_maker"]);
  if (!["pass", "revise", "defer"].includes(input.decision)) {
    throw new HarnessError("decision_invalid", "decision must be pass|revise|defer", 422);
  }
  if (typeof input.version !== "number") {
    throw new HarnessError("version_required", "version is required for optimistic lock", 422);
  }

  const inst = h.db.select().from(gateInstances).where(eq(gateInstances.id, gateInstanceId)).get();
  if (!inst) throw new HarnessError("not_found", `gate ${gateInstanceId} not found`, 404);

  const ts = h.now();
  const updated = h.db
    .update(gateInstances)
    .set({
      status: "decided",
      decidedAt: ts,
      version: inst.version + 1,
    })
    .where(
      and(
        eq(gateInstances.id, gateInstanceId),
        eq(gateInstances.status, "ready"),
        eq(gateInstances.version, input.version),
      ),
    )
    .run();
  if (updated.changes === 0) {
    throw new HarnessError("optimistic_lock", "gate decide conflict", 409, {
      id: gateInstanceId,
      version: inst.version,
      status: inst.status,
    });
  }

  const decisionId = h.newId();
  h.db.insert(gateDecisions).values({
    id: decisionId,
    gateInstanceId,
    decision: input.decision,
    structuralChange: input.structural_change === true,
    note: input.note ?? null,
    actor: actor.id,
    createdAt: ts,
  }).run();

  const openEvents = h.db
    .select()
    .from(policyEvents)
    .where(and(eq(policyEvents.goalId, inst.goalId), eq(policyEvents.closed, false)))
    .all();
  for (const ev of openEvents) {
    if (ev.track === "authority_gate" && (ev.decision === "require_gate" || ev.decision === "deny")) {
      h.db.update(policyEvents).set({ closed: true }).where(eq(policyEvents.id, ev.id)).run();
    }
  }

  let follow_up: { assignment_id?: string; run?: ReturnType<typeof publicRun> } | undefined;
  if (input.decision === "revise" && input.structural_change !== true && inst.assignmentId) {
    const newRun = await dispatchAssignment(h, { id: "service:revise", role: "service" }, inst.assignmentId, `revise:${decisionId}`);
    follow_up = { assignment_id: inst.assignmentId, run: newRun };
  }

  audit(h, actor, "decide_gate", "gate_instance", gateInstanceId, input);
  const latest = h.db.select().from(gateInstances).where(eq(gateInstances.id, gateInstanceId)).get();
  return {
    gate: latest ? publicGate(latest) : null,
    decision_id: decisionId,
    follow_up,
  };
}

function backoffIso(nowIso: string, attempts: number): string {
  const ms = Math.min(60_000, 250 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.parse(nowIso) + ms).toISOString();
}

export function listOutbox(h: Harness, limit = 100) {
  return h.db
    .select()
    .from(outbox)
    .all()
    .slice(-limit)
    .map((row) => ({
      id: row.id,
      type: row.type,
      payload: parseJson(row.payload),
      created_at: row.createdAt,
      published_at: row.publishedAt,
      attempts: row.attempts ?? 0,
      last_error: row.lastError,
      next_attempt_at: row.nextAttemptAt,
      status: row.publishedAt ? "published" : "pending",
    }));
}

export function outboxStats(h: Harness) {
  const rows = listOutbox(h, 10_000);
  return {
    pending: rows.filter((r) => r.status === "pending").length,
    published: rows.filter((r) => r.status === "published").length,
    last_error: rows.filter((r) => r.last_error).at(-1)?.last_error ?? null,
  };
}

export function listEventsAfter(h: Harness, lastEventId?: string | null) {
  const rows = h.db
    .select()
    .from(outbox)
    .all()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const idx = lastEventId ? rows.findIndex((r) => r.id === lastEventId) : -1;
  return (idx === -1 ? rows : rows.slice(idx + 1)).map((row) => ({
    id: row.id,
    type: row.type,
    payload: row.payload,
    created_at: row.createdAt,
  }));
}

export function listGithubSnapshots(h: Harness, goalId?: string) {
  let rows = h.db.select().from(githubSnapshots).all();
  if (goalId) rows = rows.filter((r) => r.goalId === goalId);
  return rows.map((row) => ({
    id: row.id,
    goal_id: row.goalId,
    assignment_id: row.assignmentId,
    pr_number: row.prNumber,
    is_draft: row.isDraft,
    checks_conclusion: row.checksConclusion,
    raw_hash: row.rawHash,
    observed_at: row.observedAt,
  }));
}

/**
 * Exactly-once attempt: claim by incrementing attempts, mark published_at
 * only after a successful webhook (or local ack when WEBHOOK_URL is unset).
 * Failed deliveries stay unpublished and retry after backoff.
 */
export async function publishOutbox(h: Harness, limit = 50): Promise<number> {
  const now = h.now();
  const pending = h.db
    .select()
    .from(outbox)
    .where(isNull(outbox.publishedAt))
    .all()
    .filter((row) => !row.nextAttemptAt || row.nextAttemptAt <= now)
    .slice(0, limit);
  let published = 0;
  for (const row of pending) {
    const attempts = (row.attempts ?? 0) + 1;
    const claimed = h.db
      .update(outbox)
      .set({ attempts })
      .where(and(eq(outbox.id, row.id), isNull(outbox.publishedAt)))
      .run();
    if (claimed.changes === 0) continue;

    if (h.webhookUrl) {
      const body = JSON.stringify({
        id: row.id,
        type: row.type,
        payload: JSON.parse(row.payload),
        created_at: row.createdAt,
      });
      const ts = String(Math.floor(Date.parse(now) / 1000) || Math.floor(Date.now() / 1000));
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (h.webhookSecret) {
        headers["x-harness-signature"] = signHarnessWebhook(h.webhookSecret, ts, body);
        headers["x-harness-timestamp"] = ts;
      }
      try {
        const res = await fetch(h.webhookUrl, { method: "POST", headers, body });
        if (!res.ok) {
          h.db
            .update(outbox)
            .set({ lastError: `http_${res.status}`, nextAttemptAt: backoffIso(now, attempts) })
            .where(eq(outbox.id, row.id))
            .run();
          continue;
        }
      } catch (err) {
        h.db
          .update(outbox)
          .set({
            lastError: err instanceof Error ? err.message : "fetch_failed",
            nextAttemptAt: backoffIso(now, attempts),
          })
          .where(eq(outbox.id, row.id))
          .run();
        continue;
      }
    }
    h.db
      .update(outbox)
      .set({ publishedAt: now, lastError: null, nextAttemptAt: null })
      .where(eq(outbox.id, row.id))
      .run();
    published += 1;
  }
  return published;
}

export function getAdminFreeze(h: Harness) {
  const row = h.db.select().from(freezeState).where(eq(freezeState.id, "global")).get();
  return {
    enabled: row?.enabled === true,
    reason: row?.reason ?? null,
    updated_by: row?.updatedBy ?? null,
    updated_at: row?.updatedAt ?? null,
  };
}

export function setAdminFreeze(
  h: Harness,
  actor: Actor,
  input: { enabled: boolean; reason?: string },
) {
  requireRole(actor, ["decision_maker", "service"]);
  if (typeof input.enabled !== "boolean") {
    throw new HarnessError("freeze_invalid", "enabled must be a boolean", 422);
  }
  const ts = h.now();
  const existing = h.db.select().from(freezeState).where(eq(freezeState.id, "global")).get();
  if (existing) {
    h.db
      .update(freezeState)
      .set({
        enabled: input.enabled,
        reason: input.reason ?? null,
        updatedBy: actor.id,
        updatedAt: ts,
      })
      .where(eq(freezeState.id, "global"))
      .run();
  } else {
    h.db.insert(freezeState).values({
      id: "global",
      enabled: input.enabled,
      reason: input.reason ?? null,
      updatedBy: actor.id,
      updatedAt: ts,
    }).run();
  }
  audit(h, actor, input.enabled ? "admin_freeze_enable" : "admin_freeze_disable", "freeze_state", "global", {
    enabled: input.enabled,
    reason: input.reason ?? null,
  });
  return getAdminFreeze(h);
}

export function assertAdminNotFrozen(h: Harness): void {
  const freeze = getAdminFreeze(h);
  if (freeze.enabled) {
    throw new HarnessError("freeze_active", "Freeze enabled; new dispatch rejected", 423, {
      reason: freeze.reason,
    });
  }
}

export function listAudit(h: Harness, limit = 200) {
  return h.db
    .select()
    .from(auditLog)
    .all()
    .slice(-limit)
    .map((row) => ({
      id: row.id,
      at: row.at,
      actor_sub: row.actorSub,
      actor_role: row.actorRole,
      action: row.action,
      resource_type: row.resourceType,
      resource_id: row.resourceId,
      request_id: row.requestId,
      payload_json: parseJson(row.payloadJson),
    }));
}

export function health(h: Harness) {
  const row = h.sqlite.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version' LIMIT 1").get() as
    | { value: string }
    | undefined;
  return {
    ok: true,
    schema_version: Number(row?.value ?? 0),
    adapter: "noop" as const,
    adapters: {
      noop: true,
      cursor: h.adapters.cursor.mode,
    },
    store: "sqlite",
    inbox: "/inbox",
    openapi: "/openapi.yaml",
    outbox: outboxStats(h),
  };
}

export function assertNoClientStatusWrite(_role: Role, body: Record<string, unknown>): void {
  if ("status" in body) {
    throw new HarnessError(
      "status_immutable",
      "clients MUST NOT write assignment/run terminal status",
      422,
    );
  }
}
