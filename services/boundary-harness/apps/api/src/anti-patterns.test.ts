import { afterEach, describe, expect, it } from "vitest";
import { closeHarness, createHarness, type Harness } from "@harness/domain";
import { createApp } from "./app";

const headers = (role: string, actor = role) => ({
  "content-type": "application/json",
  "x-harness-role": role,
  "x-harness-actor": actor,
  "x-harness-entry": "mcp",
});

async function json(app: ReturnType<typeof createApp>, path: string, init?: RequestInit) {
  const res = await app.request(path, init);
  return { res, body: await res.json() };
}

describe("appendix A anti-patterns", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  function setup() {
    harness = createHarness({ databasePath: ":memory:" });
    return { harness, app: createApp(harness) };
  }

  it("AP-01 reject_brief_with_steps_422 (HTTP same validator as MCP)", async () => {
    const { app } = setup();
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "e", mode: "explore", coordinator_ref: "c1" }),
    });
    const { res, body } = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: {
          outcome: "x",
          constraints: [],
          evidence_shape: ["summary_md"],
          steps: ["first", "second"],
          playbook: "do it",
        },
      }),
    });
    expect(res.status).toBe(422);
    expect(body.error.code).toBe("brief_forbidden_field");
    expect(body.error.details.keys).toEqual(expect.arrayContaining(["steps", "playbook"]));
  });

  it("AP-02 advisory_hint_never_creates_gate and never blocks dispatch", async () => {
    const { app } = setup();
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        title: "e",
        mode: "explore",
        coordinator_ref: "c1",
        gate_template_id: "safety_only_v1",
      }),
    });
    const check = await json(app, "/v1/policy/check", {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({
        action: "protected_merge",
        track: "advisory_hint",
        goal_id: goal.body.id,
        context: {},
      }),
    });
    expect(check.body.track).toBe("advisory_hint");
    expect(check.body.blocks).toBe(false);
    expect(check.body.creates_gate).toBe(false);
    expect(check.body.gate_instance).toBeUndefined();

    const gates = await json(app, `/v1/gates?goal_id=${goal.body.id}`, {
      headers: headers("coordinator", "c1"),
    });
    expect(gates.body.gates).toEqual([]);

    const asg = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "x", constraints: [], evidence_shape: ["summary_md"] },
      }),
    });
    const run = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "after-advisory" }),
    });
    expect(run.res.status).toBe(201);
    expect(run.body.status).toBe("succeeded");
  });

  it("AP-03 chat_done_never_ready — no mark-done path and chat-like payload is not SoT", async () => {
    const { app } = setup();
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "ship", mode: "deliver", coordinator_ref: "c1" }),
    });
    const asg = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: {
          outcome: "x",
          constraints: [],
          evidence_shape: ["summary_md", "artifact_uri"],
        },
      }),
    });
    const run = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "k" }),
    });
    const markDone = await app.request(`/v1/runs/${run.body.id}/mark-done`, {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({ chat_done: true, message: "I am done" }),
    });
    expect(markDone.status).toBe(404);

    await json(app, `/v1/runs/${run.body.id}/evidence`, {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({
        items: [{ kind: "screenshot", uri: "file://chat-said-done.png" }],
      }),
    });
    const gates = await json(app, `/v1/gates?status=ready&goal_id=${goal.body.id}`, {
      headers: headers("decision_maker", "dm"),
    });
    expect(gates.body.gates).toEqual([]);
  });

  it("AP-07 run_succeeded_alone_never_ready", async () => {
    const { app } = setup();
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "ship", mode: "deliver", coordinator_ref: "c1" }),
    });
    const asg = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: {
          outcome: "x",
          constraints: [],
          evidence_shape: ["summary_md", "artifact_uri"],
        },
      }),
    });
    const run = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "k" }),
    });
    expect(run.body.status).toBe("succeeded");
    const pending = await json(app, `/v1/gates?goal_id=${goal.body.id}`, {
      headers: headers("coordinator", "c1"),
    });
    expect(pending.body.gates[0].status).toBe("pending");
    const ready = await json(app, `/v1/gates?status=ready&goal_id=${goal.body.id}`, {
      headers: headers("decision_maker", "dm"),
    });
    expect(ready.body.gates).toEqual([]);
  });

  it("human_dispatch_forbidden_without_exception", async () => {
    const { app } = setup();
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        title: "e",
        mode: "explore",
        coordinator_ref: "c1",
        dispatch_policy: "coordinator_only",
      }),
    });
    const fill = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: headers("decision_maker", "dm"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "x", constraints: [], evidence_shape: ["summary_md"] },
      }),
    });
    expect(fill.res.status).toBe(403);

    const grant = await json(app, `/v1/goals/${goal.body.id}/exception-grants`, {
      method: "POST",
      headers: headers("decision_maker", "dm"),
      body: JSON.stringify({ grantee: "dm", scope: "fill_assignment", max_uses: 1 }),
    });
    const ok = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: headers("decision_maker", "dm"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "x", constraints: [], evidence_shape: ["summary_md"] },
        exception_grant_id: grant.body.id,
      }),
    });
    expect(ok.res.status).toBe(201);

    const dispatch = await json(app, `/v1/assignments/${ok.body.id}/dispatch`, {
      method: "POST",
      headers: headers("decision_maker", "dm"),
      body: JSON.stringify({ idempotency_key: "human" }),
    });
    expect(dispatch.res.status).toBe(403);
  });

  it("authority require_gate on explore safety_only_v1 instantiates an Inbox card", async () => {
    const { app } = setup();
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        title: "e",
        mode: "explore",
        coordinator_ref: "c1",
        gate_template_id: "safety_only_v1",
      }),
    });
    const check = await json(app, "/v1/policy/check", {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({
        action: "destructive_delete",
        track: "authority_gate",
        goal_id: goal.body.id,
        context: {},
      }),
    });
    expect(check.body.track).toBe("authority_gate");
    expect(check.body.decision).toBe("require_gate");
    expect(check.body.gate_instance.status).toBe("ready");
    expect(check.body.gate_instance.ready_result.missing).toContain(
      "authority_escalation:destructive_delete",
    );
  });

  it("shadow evidence must not write Gate ready", async () => {
    const { app } = setup();
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "ship", mode: "deliver", coordinator_ref: "c1" }),
    });
    const asg = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: {
          outcome: "x",
          constraints: [],
          evidence_shape: ["summary_md", "artifact_uri"],
        },
      }),
    });
    const run = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "k" }),
    });
    await json(app, `/v1/runs/${run.body.id}/evidence`, {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({
        items: [
          { kind: "summary_md", uri: "file://s.md", shadow: true },
          { kind: "artifact_uri", uri: "file://a.tgz", shadow: true },
        ],
      }),
    });
    const ready = await json(app, `/v1/gates?status=ready&goal_id=${goal.body.id}`, {
      headers: headers("decision_maker", "dm"),
    });
    expect(ready.body.gates).toEqual([]);
  });
});
