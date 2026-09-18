import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  parseBriefOrThrow,
  policyCheck,
  applyPolicy,
  createStore,
  blocksDispatch,
  EvidenceKind,
  assertSecretRef,
} from "@boundary-harness/domain";
import type { AppConfig } from "./config.js";
import { HttpError, errorBody, fromDomainError } from "./errors.js";
import {
  type Actor,
  verifyJwt,
  assertPoolAccess,
  requireRoles,
} from "./auth.js";
import {
  type Db,
  appendAudit,
  appendOutbox,
  getFreeze,
  setFreeze,
  hasActiveException,
  nowIso,
  newId,
} from "./db.js";
import { verifyWebhook } from "./hmac.js";
import { maybeAdvanceGates, evalGoalReady } from "./ready.js";

type Env = {
  Variables: {
    actor: Actor;
    requestId: string;
  };
};

const EVIDENCE_KINDS = new Set<string>(EvidenceKind);

export function createApp(db: Db, config: AppConfig): Hono<Env> {
  const app = new Hono<Env>();

  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id") || newId("req");
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    await next();
  });

  app.onError((err, c) => {
    const mapped = fromDomainError(err);
    return c.json(errorBody(mapped), mapped.status as 400);
  });

  app.get("/healthz", (c) => {
    const row = db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get() as
      | { value: string }
      | undefined;
    return c.json({ ok: true, schema_version: row?.value ?? "unknown" });
  });

  const publicExact = new Set(["/healthz"]);
  const publicPrefix = ["/v1/hooks/"];

  app.use("/v1/*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (publicExact.has(path) || publicPrefix.some((p) => path.startsWith(p))) {
      await next();
      return;
    }
    const header = c.req.header("authorization") ?? "";
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (!m) throw new HttpError(401, "unauthorized", "Bearer token required");
    const actor = await verifyJwt(m[1], config.jwtSecret);
    c.set("actor", actor);
    await next();
  });

  app.get("/v1/admin/freeze", (c) => {
    c.get("actor");
    return c.json(getFreeze(db));
  });

  app.post("/v1/admin/freeze", async (c) => {
    const actor = c.get("actor");
    requireRoles(actor, ["decision_maker", "service"]);
    const body = (await c.req.json()) as { enabled?: boolean; reason?: string };
    if (typeof body.enabled !== "boolean") {
      throw new HttpError(400, "invalid_body", "enabled boolean required");
    }
    const state = setFreeze(db, body.enabled, body.reason ?? null, actor.sub);
    appendOutbox(db, "freeze.changed", { enabled: state.enabled, reason: state.reason });
    appendAudit(db, {
      actor_sub: actor.sub,
      actor_role: actor.role,
      action: "freeze.set",
      resource_type: "freeze_state",
      resource_id: "global",
      request_id: c.get("requestId"),
      payload: { enabled: state.enabled, reason: state.reason },
    });
    return c.json(state);
  });

  app.post("/v1/policy/check", async (c) => {
    const actor = c.get("actor");
    requireRoles(actor, ["decision_maker", "coordinator", "executor", "service"]);
    const body = (await c.req.json()) as {
      action?: string;
      goal_id?: string;
      assignment_id?: string;
    };
    if (!body.action || typeof body.action !== "string") {
      throw new HttpError(400, "invalid_body", "action required");
    }
    const result = policyCheck(body.action);
    const mem = createStore();
    const applied = applyPolicy(mem, body.action);
    db.prepare(
      `INSERT INTO policy_events(id, track, decision, reason_code, fail_count, goal_id, assignment_id, run_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, NULL, ?, ?)`,
    ).run(
      newId("pol"),
      result.track,
      result.decision,
      result.reason_code,
      body.goal_id ?? null,
      body.assignment_id ?? null,
      JSON.stringify({ action: body.action, gateCreated: applied.gateCreated }),
      nowIso(),
    );
    if (result.track === "authority_gate" && result.decision === "require_gate" && body.goal_id) {
      instantiateSafetyGate(db, body.goal_id);
    }
    return c.json({
      decision: result.decision,
      track: result.track,
      reason_code: result.reason_code,
      dispatch_blocked: applied.dispatchBlocked || blocksDispatch(result),
      gate_created: applied.gateCreated,
    });
  });

  app.post("/v1/goals", async (c) => {
    const actor = c.get("actor");
    requireRoles(actor, ["decision_maker", "coordinator"]);
    const body = (await c.req.json()) as {
      title?: string;
      mode?: string;
      coordinator_ref?: string;
      dispatch_policy?: string;
      gate_template_id?: string | null;
      gateTemplate?: string;
      safety_gate?: boolean;
      gate_defs?: Array<{
        id?: string;
        predicate_id: string;
        predicate_version?: number;
        ordinal?: number;
        on_fail?: string;
      }>;
    };
    if (!body.coordinator_ref) {
      throw new HttpError(422, "coordinator_ref_required", "coordinator_ref is required");
    }
    if (body.mode !== "explore" && body.mode !== "deliver") {
      throw new HttpError(422, "illegal_mode", "mode must be explore or deliver");
    }
    if (!body.title) throw new HttpError(422, "title_required", "title is required");
    const template = body.gateTemplate ?? body.gate_template_id ?? null;
    if (body.mode === "explore" && template === "deliver_ready_v1") {
      throw new HttpError(422, "explore_must_not_default_deliver_ready", "explore must not default to deliver_ready_v1");
    }
    const explicitDefs = body.gate_defs ?? [];
    if (body.mode === "deliver" && explicitDefs.length === 0 && template !== "deliver_ready_v1") {
      throw new HttpError(400, "deliver_requires_gatedef", "deliver mode requires at least one GateDef");
    }
    const id = newId("goal");
    const ts = nowIso();
    const dispatchPolicy = body.dispatch_policy === "human_allowed" ? "human_allowed" : "coordinator_only";
    db.prepare(
      `INSERT INTO goals(id, title, mode, dispatch_policy, coordinator_ref, gate_template_id, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    ).run(id, body.title, body.mode, dispatchPolicy, body.coordinator_ref, template, actor.sub, ts, ts);

    const createdDefs: { id: string; predicate_id: string; predicate_version: number }[] = [];
    const defsToInsert = [...explicitDefs];
    if (body.mode === "deliver" && template === "deliver_ready_v1" && defsToInsert.length === 0) {
      defsToInsert.push({ predicate_id: "deliver_ready_v1", predicate_version: 1 });
    }
    if (body.mode === "explore" && body.safety_gate) {
      defsToInsert.push({ predicate_id: "safety_only_v1", predicate_version: 1 });
    }
    for (const [i, d] of defsToInsert.entries()) {
      const defId = d.id || newId("gdef");
      db.prepare(
        `INSERT INTO gate_defs(id, goal_id, predicate_id, predicate_version, ordinal, on_fail)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(defId, id, d.predicate_id, d.predicate_version ?? 1, d.ordinal ?? i, d.on_fail ?? "keep_pending");
      createdDefs.push({ id: defId, predicate_id: d.predicate_id, predicate_version: d.predicate_version ?? 1 });
      if (d.predicate_id === "deliver_ready_v1") {
        db.prepare(
          `INSERT INTO gate_instances(id, goal_id, gate_def_id, status, version) VALUES (?, ?, ?, 'pending', 0)`,
        ).run(newId("gi"), id, defId);
      }
    }

    appendAudit(db, {
      actor_sub: actor.sub,
      actor_role: actor.role,
      action: "goal.create",
      resource_type: "goal",
      resource_id: id,
      request_id: c.get("requestId"),
      payload: { mode: body.mode, dispatch_policy: dispatchPolicy },
    });
    return c.json(
      {
        id,
        title: body.title,
        mode: body.mode,
        coordinator_ref: body.coordinator_ref,
        dispatch_policy: dispatchPolicy,
        gate_template_id: template,
        gate_defs: createdDefs,
      },
      201,
    );
  });

  app.get("/v1/goals/:id", (c) => {
    c.get("actor");
    const goal = getGoal(db, c.req.param("id"));
    const defs = db.prepare("SELECT id, predicate_id, predicate_version, ordinal, on_fail FROM gate_defs WHERE goal_id=?").all(
      goal.id,
    );
    return c.json({ ...goal, gate_defs: defs });
  });

  app.get("/v1/goals/:id/ready", (c) => {
    c.get("actor");
    const goal = getGoal(db, c.req.param("id"));
    const result = evalGoalReady(db, goal.id);
    return c.json({ goal_id: goal.id, mode: goal.mode, stub: goal.mode === "explore", ...result });
  });

  app.post("/v1/goals/:id/assignments", async (c) => {
    const actor = c.get("actor");
    const goal = getGoal(db, c.req.param("id"));
    if (actor.role === "decision_maker") {
      const allowed =
        goal.dispatch_policy === "human_allowed" || hasActiveException(db, goal.id, actor.sub);
      if (!allowed) {
        throw new HttpError(403, "human_dispatch_forbidden", "human fan-out requires exception_grant or human_allowed");
      }
    } else {
      requireRoles(actor, ["coordinator"]);
    }
    const body = (await c.req.json()) as {
      pool_id?: string;
      brief?: unknown;
      budget?: unknown;
    };
    if (!body.pool_id) throw new HttpError(400, "invalid_body", "pool_id required");
    const pool = db.prepare("SELECT id, kind, secret_ref FROM pools WHERE id=?").get(body.pool_id) as
      | { id: string; kind: string; secret_ref: string }
      | undefined;
    if (!pool) throw new HttpError(404, "not_found", "pool not found");
    assertPoolAccess(actor, pool.id);
    let brief;
    try {
      brief = parseBriefOrThrow(body.brief);
    } catch (err) {
      throw fromDomainError(err);
    }
    const defs = db
      .prepare("SELECT predicate_id FROM gate_defs WHERE goal_id=?")
      .all(goal.id) as { predicate_id: string }[];
    if (defs.some((d) => d.predicate_id === "deliver_ready_v1")) {
      if (!brief.evidence_shape.includes("summary_md")) {
        throw new HttpError(
          400,
          "predicate_evidence_mismatch",
          "deliver_ready_v1 requires summary_md in evidence_shape",
        );
      }
    }
    const id = newId("asg");
    const ts = nowIso();
    const budget = body.budget ?? {};
    db.prepare(
      `INSERT INTO assignments(id, goal_id, pool_id, brief_json, budget_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)`,
    ).run(id, goal.id, pool.id, JSON.stringify(brief), JSON.stringify(budget), ts, ts);
    appendAudit(db, {
      actor_sub: actor.sub,
      actor_role: actor.role,
      action: "assignment.fill",
      resource_type: "assignment",
      resource_id: id,
      request_id: c.get("requestId"),
      payload: { goal_id: goal.id, pool_id: pool.id },
    });
    return c.json(
      {
        id,
        goal_id: goal.id,
        pool_id: pool.id,
        brief,
        budget,
        status: "queued",
      },
      201,
    );
  });

  app.get("/v1/assignments/:id", (c) => {
    const actor = c.get("actor");
    const row = getAssignment(db, c.req.param("id"));
    assertPoolAccess(actor, row.pool_id);
    return c.json(row);
  });

  app.post("/v1/assignments/:id/dispatch", async (c) => {
    const actor = c.get("actor");
    requireRoles(actor, ["coordinator", "service"]);
    if (actor.role === "executor") {
      throw new HttpError(403, "executor_forbidden", "executor cannot dispatch");
    }
    const idem = c.req.header("idempotency-key");
    if (!idem) throw new HttpError(400, "idempotency_required", "Idempotency-Key header required");
    const assignment = getAssignment(db, c.req.param("id"));
    assertPoolAccess(actor, assignment.pool_id);
    const goal = getGoal(db, assignment.goal_id);
    if (!goal.coordinator_ref) {
      throw new HttpError(422, "coordinator_ref_required", "goal missing coordinator_ref");
    }
    const freeze = getFreeze(db);
    if (freeze.enabled) {
      throw new HttpError(423, "freeze_active", "Freeze enabled; new dispatch rejected");
    }
    const existing = db
      .prepare("SELECT * FROM runs WHERE assignment_id=? AND idempotency_key=?")
      .get(assignment.id, idem) as Record<string, unknown> | undefined;
    if (existing) {
      return c.json(existing, 200);
    }
    let body: { adapter?: string } = {};
    try {
      body = (await c.req.json()) as { adapter?: string };
    } catch {
      body = {};
    }
    const adapter = body.adapter === "cursor" ? "cursor" : "noop";
    const id = newId("run");
    const ts = nowIso();
    const dial = config.dialDefault;
    db.prepare(
      `INSERT INTO runs(id, assignment_id, adapter, external_agent_id, external_run_id, idempotency_key, dial_at_dispatch, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      assignment.id,
      adapter,
      adapter === "noop" ? "noop-agent" : null,
      adapter === "noop" ? `noop-${id}` : null,
      idem,
      dial,
      adapter === "noop" ? "succeeded" : "queued",
      ts,
      ts,
    );
    db.prepare("UPDATE assignments SET status=?, updated_at=? WHERE id=?").run(
      adapter === "noop" ? "succeeded" : "in_progress",
      ts,
      assignment.id,
    );
    const run = db.prepare("SELECT * FROM runs WHERE id=?").get(id);
    appendAudit(db, {
      actor_sub: actor.sub,
      actor_role: actor.role,
      action: "run.dispatch",
      resource_type: "run",
      resource_id: id,
      request_id: c.get("requestId"),
      payload: { assignment_id: assignment.id, adapter, canvas: null },
    });
    return c.json(run, 201);
  });

  app.get("/v1/runs/:id", (c) => {
    c.get("actor");
    const run = getRun(db, c.req.param("id"));
    return c.json(run);
  });

  app.post("/v1/runs/:id/evidence", async (c) => {
    const actor = c.get("actor");
    requireRoles(actor, ["coordinator", "executor", "service"]);
    const run = getRun(db, c.req.param("id"));
    if (!["succeeded", "failed", "cancelled"].includes(run.status)) {
      throw new HttpError(409, "evidence_not_completion", "evidence only on completion path");
    }
    const assignment = getAssignment(db, run.assignment_id);
    assertPoolAccess(actor, assignment.pool_id);
    const body = (await c.req.json()) as {
      kind?: string;
      uri?: string;
      sha256?: string;
      shadow?: boolean;
    };
    if (!body.kind || !EVIDENCE_KINDS.has(body.kind)) {
      throw new HttpError(400, "invalid_body", "valid evidence kind required");
    }
    if (!body.uri) throw new HttpError(400, "invalid_body", "uri required");
    const id = newId("ev");
    db.prepare(
      `INSERT INTO evidence_items(id, run_id, goal_id, assignment_id, kind, uri, sha256, shadow, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      run.id,
      assignment.goal_id,
      assignment.id,
      body.kind,
      body.uri,
      body.sha256 ?? null,
      body.shadow ? 1 : 0,
      nowIso(),
    );
    const ready = maybeAdvanceGates(db, assignment.goal_id, assignment.id, run.id);
    appendAudit(db, {
      actor_sub: actor.sub,
      actor_role: actor.role,
      action: "evidence.attach",
      resource_type: "evidence",
      resource_id: id,
      request_id: c.get("requestId"),
      payload: { kind: body.kind, run_id: run.id },
    });
    return c.json({ id, kind: body.kind, uri: body.uri, ready }, 201);
  });

  app.get("/v1/gates", (c) => {
    const actor = c.get("actor");
    requireRoles(actor, ["decision_maker", "coordinator", "viewer", "service"]);
    const status = c.req.query("status") ?? "ready";
    const rows = db
      .prepare(
        `SELECT gi.id, gi.goal_id, gi.gate_def_id, gi.status, gi.ready_at, gi.decided_at, gi.ready_result_json, gi.version,
                gd.predicate_id, gd.predicate_version
         FROM gate_instances gi
         JOIN gate_defs gd ON gd.id = gi.gate_def_id
         WHERE gi.status = ?
         ORDER BY gi.ready_at ASC`,
      )
      .all(status)
      .map((row) => hydrateGate(row as Record<string, unknown>));
    return c.json({ items: rows });
  });

  app.post("/v1/gates/:id/decide", async (c) => {
    const actor = c.get("actor");
    requireRoles(actor, ["decision_maker"]);
    const body = (await c.req.json()) as {
      decision?: string;
      version?: number;
      note?: string;
      structural_change?: boolean;
    };
    if (!body.decision || !["pass", "revise", "defer"].includes(body.decision)) {
      throw new HttpError(400, "invalid_body", "decision must be pass|revise|defer");
    }
    if (typeof body.version !== "number") {
      throw new HttpError(400, "invalid_body", "version required for optimistic lock");
    }
    const gi = db.prepare("SELECT * FROM gate_instances WHERE id=?").get(c.req.param("id")) as
      | {
          id: string;
          goal_id: string;
          status: string;
          version: number;
        }
      | undefined;
    if (!gi) throw new HttpError(404, "not_found", "gate instance not found");
    const result = db
      .prepare(
        `UPDATE gate_instances
         SET status='decided', decided_at=?, version=version+1
         WHERE id=? AND version=?`,
      )
      .run(nowIso(), gi.id, body.version);
    if (result.changes === 0) {
      throw new HttpError(409, "optimistic_lock", "gate instance version conflict");
    }
    const decisionId = newId("gd");
    db.prepare(
      `INSERT INTO gate_decisions(id, gate_instance_id, decision, structural_change, note, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      decisionId,
      gi.id,
      body.decision,
      body.structural_change ? 1 : 0,
      body.note ?? null,
      actor.sub,
      nowIso(),
    );
    appendAudit(db, {
      actor_sub: actor.sub,
      actor_role: actor.role,
      action: "gate.decide",
      resource_type: "gate_instance",
      resource_id: gi.id,
      request_id: c.get("requestId"),
      payload: { decision: body.decision, structural_change: Boolean(body.structural_change) },
    });
    const updated = db.prepare("SELECT * FROM gate_instances WHERE id=?").get(gi.id);
    return c.json({
      gate_instance: updated,
      decision: { id: decisionId, decision: body.decision, note: body.note ?? null },
    });
  });

  app.get("/v1/events/stream", (c) => {
    c.get("actor");
    const lastId = c.req.header("Last-Event-ID") ?? null;
    return streamSSE(c, async (stream) => {
      const sent = new Set<string>();
      const pump = () => {
        let rows: { id: string; type: string; payload: string }[];
        if (lastId) {
          const last = db.prepare("SELECT created_at FROM outbox WHERE id=?").get(lastId) as
            | { created_at: string }
            | undefined;
          rows = last
            ? (db
                .prepare(
                  "SELECT id, type, payload FROM outbox WHERE created_at >= ? AND id != ? ORDER BY created_at, id",
                )
                .all(last.created_at, lastId) as { id: string; type: string; payload: string }[])
            : (db.prepare("SELECT id, type, payload FROM outbox ORDER BY created_at, id").all() as {
                id: string;
                type: string;
                payload: string;
              }[]);
        } else {
          rows = db
            .prepare("SELECT id, type, payload FROM outbox WHERE published_at IS NULL ORDER BY created_at, id")
            .all() as { id: string; type: string; payload: string }[];
        }
        return rows;
      };
      for (const row of pump()) {
        if (sent.has(row.id)) continue;
        sent.add(row.id);
        await stream.writeSSE({ id: row.id, event: row.type, data: row.payload });
        db.prepare("UPDATE outbox SET published_at=? WHERE id=? AND published_at IS NULL").run(nowIso(), row.id);
      }
    });
  });

  app.post("/v1/hooks/github", async (c) => {
    const raw = await c.req.text();
    verifyWebhook(
      config.webhookSecret,
      raw,
      c.req.header("x-harness-signature") ?? c.req.header("X-Harness-Signature"),
      c.req.header("x-harness-timestamp") ?? c.req.header("X-Harness-Timestamp"),
    );
    let payload: Record<string, unknown> = {};
    try {
      payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      payload = {};
    }
    const pr = (payload.pull_request ?? payload) as Record<string, unknown>;
    const goalId = typeof payload.goal_id === "string" ? payload.goal_id : null;
    db.prepare(
      `INSERT INTO github_snapshots(id, goal_id, assignment_id, pr_number, is_draft, checks_conclusion, raw_hash, observed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId("ghs"),
      goalId,
      typeof payload.assignment_id === "string" ? payload.assignment_id : null,
      typeof pr.number === "number" ? pr.number : null,
      pr.draft === true || pr.is_draft === true ? 1 : 0,
      typeof payload.checks_conclusion === "string"
        ? payload.checks_conclusion
        : ((pr as { checks_conclusion?: string }).checks_conclusion ?? null),
      null,
      nowIso(),
    );
    if (goalId) maybeAdvanceGates(db, goalId);
    return c.json({ accepted: true }, 202);
  });

  app.post("/v1/hooks/cursor", async (c) => {
    const raw = await c.req.text();
    verifyWebhook(
      config.webhookSecret,
      raw,
      c.req.header("x-harness-signature") ?? c.req.header("X-Harness-Signature"),
      c.req.header("x-harness-timestamp") ?? c.req.header("X-Harness-Timestamp"),
    );
    return c.json({ accepted: true }, 202);
  });

  app.post("/v1/pools", async (c) => {
    const actor = c.get("actor");
    requireRoles(actor, ["decision_maker", "coordinator", "service"]);
    const body = (await c.req.json()) as { id?: string; kind?: string; secret_ref?: string };
    if (!body.id || !body.kind || !body.secret_ref) {
      throw new HttpError(400, "invalid_body", "id, kind, secret_ref required");
    }
    if (!["cursor_account", "bot_group", "noop"].includes(body.kind)) {
      throw new HttpError(400, "invalid_body", "invalid pool kind");
    }
    const ref = assertSecretRef(body.secret_ref);
    db.prepare("INSERT INTO pools(id, kind, secret_ref, created_at) VALUES (?, ?, ?, ?)").run(
      body.id,
      body.kind,
      ref,
      nowIso(),
    );
    return c.json({ id: body.id, kind: body.kind, secret_ref: ref }, 201);
  });

  return app;
}

function getGoal(db: Db, id: string): {
  id: string;
  title: string;
  mode: string;
  dispatch_policy: string;
  coordinator_ref: string;
  gate_template_id: string | null;
  status: string;
} {
  const row = db.prepare("SELECT * FROM goals WHERE id=?").get(id) as
    | {
        id: string;
        title: string;
        mode: string;
        dispatch_policy: string;
        coordinator_ref: string;
        gate_template_id: string | null;
        status: string;
      }
    | undefined;
  if (!row) throw new HttpError(404, "not_found", "goal not found");
  return row;
}

function getAssignment(db: Db, id: string): {
  id: string;
  goal_id: string;
  pool_id: string;
  brief_json: string;
  budget_json: string;
  status: string;
} {
  const row = db.prepare("SELECT * FROM assignments WHERE id=?").get(id) as
    | {
        id: string;
        goal_id: string;
        pool_id: string;
        brief_json: string;
        budget_json: string;
        status: string;
      }
    | undefined;
  if (!row) throw new HttpError(404, "not_found", "assignment not found");
  return {
    ...row,
    brief: JSON.parse(row.brief_json),
    budget: JSON.parse(row.budget_json),
  } as typeof row;
}

function getRun(db: Db, id: string): {
  id: string;
  assignment_id: string;
  adapter: string;
  status: string;
} {
  const row = db.prepare("SELECT * FROM runs WHERE id=?").get(id) as
    | { id: string; assignment_id: string; adapter: string; status: string }
    | undefined;
  if (!row) throw new HttpError(404, "not_found", "run not found");
  return row;
}

function hydrateGate(row: Record<string, unknown>) {
  let ready_result = null;
  if (typeof row.ready_result_json === "string") {
    try {
      ready_result = JSON.parse(row.ready_result_json);
    } catch {
      ready_result = row.ready_result_json;
    }
  }
  return { ...row, ready_result };
}

function instantiateSafetyGate(db: Db, goalId: string): void {
  const def = db
    .prepare("SELECT id FROM gate_defs WHERE goal_id=? AND predicate_id='safety_only_v1' LIMIT 1")
    .get(goalId) as { id: string } | undefined;
  if (!def) return;
  const existing = db
    .prepare("SELECT id FROM gate_instances WHERE gate_def_id=? AND status IN ('pending','ready') LIMIT 1")
    .get(def.id) as { id: string } | undefined;
  if (existing) return;
  db.prepare(
    `INSERT INTO gate_instances(id, goal_id, gate_def_id, status, version) VALUES (?, ?, ?, 'pending', 0)`,
  ).run(newId("gi"), goalId, def.id);
}
