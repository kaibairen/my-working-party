import { afterEach, describe, expect, it } from "vitest";
import { closeHarness, createHarness, schema, STAGE_LOCKED_STRIP, type Harness } from "@harness/domain";
import { zhDM } from "../../../web/copy/zh-DM";
import { createApp } from "../../src/app";

const headers = (role: string, actor = role) => ({
  "content-type": "application/json",
  "x-harness-role": role,
  "x-harness-actor": actor,
  "x-harness-entry": "mcp",
});

async function json(app: ReturnType<typeof createApp>, path: string, init?: RequestInit) {
  const res = await app.request(path, init);
  const text = await res.text();
  let body: Record<string, any> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { text };
  }
  return { res, body };
}

function errCode(body: Record<string, any>): string {
  return String(body.code ?? body.error?.code ?? "");
}

describe("Domain Stage-edge P0", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  function setup() {
    harness = createHarness({ databasePath: ":memory:" });
    return { harness, app: createApp(harness) };
  }

  async function seedStagedGoal(app: ReturnType<typeof createApp>) {
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        title: "调研后交付",
        mode: "deliver",
        coordinator_ref: "c1",
        gate_template_id: "research_then_deliver_v1",
      }),
    });
    expect(goal.res.status).toBe(201);
    expect(goal.body.gate_defs).toHaveLength(2);
    const research = goal.body.gate_defs.find((d: { stage_key: string }) => d.stage_key === "research");
    const deliver = goal.body.gate_defs.find((d: { stage_key: string }) => d.stage_key === "deliver");
    expect(research?.predicate_id).toBe("research_ready_v1");
    expect(deliver?.predicate_id).toBe("deliver_ready_v1");
    return { goal: goal.body, research, deliver };
  }

  it("stage_locked_blocks_downstream_dispatch", async () => {
    const { harness: h, app } = setup();
    const { goal, research } = await seedStagedGoal(app);

    const first = await json(app, `/v1/goals/${goal.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "先调研", constraints: [], evidence_shape: ["report_md"] },
      }),
    });
    expect(first.res.status).toBe(201);
    expect(first.body.unlock_after_gate_def_id).toBeNull();

    const firstRun = await json(app, `/v1/assignments/${first.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "stage0" }),
    });
    expect(firstRun.res.status).toBe(201);

    const lockedFill = await json(app, `/v1/goals/${goal.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "交付", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
        unlock_after_gate_def_id: research.id,
      }),
    });
    expect(lockedFill.res.status).toBe(423);
    expect(errCode(lockedFill.body)).toBe("stage_locked");
    expect(errCode(lockedFill.body)).not.toBe("freeze_active");
    expect(errCode(lockedFill.body)).not.toBe("forbidden");
    expect(zhDM.stageLocked).toBe(STAGE_LOCKED_STRIP);
    expect(lockedFill.body.message).toBe(STAGE_LOCKED_STRIP);
    expect(lockedFill.body.strip).toBe(STAGE_LOCKED_STRIP);
    expect(lockedFill.body.message).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );

    const ts = h.now();
    const lockedId = h.newId();
    h.db.insert(schema.assignments).values({
      id: lockedId,
      goalId: goal.id,
      poolId: "pool_noop",
      briefJson: JSON.stringify({
        outcome: "交付",
        constraints: [],
        evidence_shape: ["summary_md", "artifact_uri"],
      }),
      budgetJson: JSON.stringify({}),
      status: "accepted",
      risk: null,
      createdAt: ts,
      updatedAt: ts,
      createdBy: "c1",
      fillerKind: "bot",
      unlockAfterGateDefId: research.id,
    }).run();

    const lockedDispatch = await json(app, `/v1/assignments/${lockedId}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "jump-ahead" }),
    });
    expect(lockedDispatch.res.status).toBe(423);
    expect(errCode(lockedDispatch.body)).toBe("stage_locked");
    expect(errCode(lockedDispatch.body)).not.toBe("freeze_active");
    expect(errCode(lockedDispatch.body)).not.toBe("dial_frozen");
    expect(lockedDispatch.body.message).toBe(STAGE_LOCKED_STRIP);
    expect(lockedDispatch.body.strip).toBe(STAGE_LOCKED_STRIP);
    expect(lockedDispatch.body.details?.unlock_after_gate_def_id ?? lockedDispatch.body.error?.details?.unlock_after_gate_def_id)
      .toBe(research.id);
  });

  it("stage_unlock_after_gate_pass", async () => {
    const { app } = setup();
    const { goal, research } = await seedStagedGoal(app);

    const researchAsg = await json(app, `/v1/goals/${goal.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "调研纪要", constraints: [], evidence_shape: ["report_md"] },
      }),
    });
    const researchRun = await json(app, `/v1/assignments/${researchAsg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "research-1" }),
    });
    await json(app, `/v1/runs/${researchRun.body.id}/evidence`, {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({ items: [{ kind: "report_md", uri: "file://research.md" }] }),
    });
    const ready = await json(app, `/v1/gates?status=ready&goal_id=${goal.id}`, {
      headers: headers("decision_maker", "dm"),
    });
    expect(ready.body.gates).toHaveLength(1);

    const readyNotPass = await json(app, `/v1/goals/${goal.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "交付", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
        unlock_after_gate_def_id: research.id,
      }),
    });
    expect(readyNotPass.res.status).toBe(423);
    expect(errCode(readyNotPass.body)).toBe("stage_locked");

    const decided = await json(app, `/v1/gates/${ready.body.gates[0].id}/decide`, {
      method: "POST",
      headers: headers("decision_maker", "dm"),
      body: JSON.stringify({ decision: "pass", version: ready.body.gates[0].version }),
    });
    expect(decided.res.status).toBe(200);

    const unlocked = await json(app, `/v1/goals/${goal.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "交付", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
        unlock_after_gate_def_id: research.id,
      }),
    });
    expect(unlocked.res.status).toBe(201);
    expect(unlocked.body.unlock_after_gate_def_id).toBe(research.id);

    const run = await json(app, `/v1/assignments/${unlocked.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "deliver-after-pass" }),
    });
    expect(run.res.status).toBe(201);
    expect(run.body.adapter).toBe("noop");
  });

  it("verbal_done_never_unlocks_stage", async () => {
    const { app } = setup();
    const { goal, research } = await seedStagedGoal(app);

    await json(app, "/v1/policy/check", {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({
        action: "chat_done",
        track: "advisory_hint",
        goal_id: goal.id,
        context: { text: "done", verbal: true, oral: true },
      }),
    });

    const researchAsg = await json(app, `/v1/goals/${goal.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "调研", constraints: [], evidence_shape: ["report_md"] },
      }),
    });
    const run = await json(app, `/v1/assignments/${researchAsg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "verbal" }),
    });
    expect((await app.request(`/v1/runs/${run.body.id}/mark-done`, {
      method: "POST",
      headers: headers("executor"),
    })).status).toBe(404);
    await json(app, `/v1/runs/${run.body.id}/evidence`, {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({ items: [{ kind: "screenshot", uri: "file://oral-done.png" }] }),
    });

    const ready = await json(app, `/v1/gates?status=ready&goal_id=${goal.id}`, {
      headers: headers("decision_maker", "dm"),
    });
    expect(ready.body.gates).toEqual([]);

    const locked = await json(app, `/v1/goals/${goal.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "交付", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
        unlock_after_gate_def_id: research.id,
      }),
    });
    expect(locked.res.status).toBe(423);
    expect(errCode(locked.body)).toBe("stage_locked");
  });

  it("stage_edge_does_not_jail_path_choice", async () => {
    const { app } = setup();
    const { goal } = await seedStagedGoal(app);

    const a = await json(app, `/v1/goals/${goal.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "路径A", constraints: [], evidence_shape: ["report_md"] },
      }),
    });
    const b = await json(app, `/v1/goals/${goal.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "路径B", constraints: [], evidence_shape: ["report_md"] },
      }),
    });
    expect(a.res.status).toBe(201);
    expect(b.res.status).toBe(201);

    const path = await json(app, "/v1/policy/check", {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({ action: "change_path", track: "authority_gate" }),
    });
    expect(path.body.track).toBe("advisory_hint");
    expect(path.body.creates_gate).toBe(false);

    const run = await json(app, `/v1/assignments/${a.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "path-a" }),
    });
    expect(run.res.status).toBe(201);
  });

  it("default deliver still seeds deliver_ready_v1 with stage_key", async () => {
    const { app } = setup();
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "ship", mode: "deliver", coordinator_ref: "c1" }),
    });
    expect(goal.body.gate_defs).toHaveLength(1);
    expect(goal.body.gate_defs[0].predicate_id).toBe("deliver_ready_v1");
    expect(goal.body.gate_defs[0].stage_key).toBe("deliver");
  });
});
