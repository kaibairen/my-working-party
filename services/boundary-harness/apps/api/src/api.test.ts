import { afterEach, describe, expect, it } from "vitest";
import { closeHarness, createHarness, MCP_TOOL_NAMES, type Harness } from "@harness/domain";
import { listTools } from "../../mcp-server/src/index";
import { createApp } from "./app";

const headers = (role: string, actor = role) => ({
  "content-type": "application/json",
  "x-harness-role": role,
  "x-harness-actor": actor,
});

async function json(app: ReturnType<typeof createApp>, path: string, init?: RequestInit) {
  const res = await app.request(path, init);
  const body = await res.json();
  return { res, body };
}

describe("domain API", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  function setup() {
    harness = createHarness({ databasePath: ":memory:" });
    return { harness, app: createApp(harness) };
  }

  it("health reports schema_version and noop adapter", async () => {
    const { app } = setup();
    const { res, body } = await json(app, "/health");
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.schema_version).toBe(1);
    expect(body.adapter).toBe("noop");
  });

  it("create goal requires coordinator_ref", async () => {
    const { app } = setup();
    const { res, body } = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "x", mode: "explore" }),
    });
    expect(res.status).toBe(422);
    expect(body.error.code).toBe("coordinator_ref_required");
  });

  it("explore_null_template_zero_gatedef", async () => {
    const { app } = setup();
    const { body } = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        title: "explore",
        mode: "explore",
        coordinator_ref: "c1",
        gate_template_id: null,
      }),
    });
    expect(body.gate_defs).toEqual([]);
  });

  it("explore_must_not_default_deliver_ready", async () => {
    const { app } = setup();
    const { res, body } = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        title: "bad",
        mode: "explore",
        coordinator_ref: "c1",
        gate_template_id: "deliver_ready_v1",
      }),
    });
    expect(res.status).toBe(422);
    expect(body.error.code).toBe("mode_template_mismatch");
  });

  it("deliver creates a deliver_ready_v1 GateDef", async () => {
    const { app } = setup();
    const { body } = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "ship", mode: "deliver", coordinator_ref: "c1" }),
    });
    expect(body.gate_defs).toHaveLength(1);
    expect(body.gate_defs[0].predicate_id).toBe("deliver_ready_v1");
  });

  it("canvas_not_required_for_dispatch — goal → assignment → noop → evidence → gate", async () => {
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
          outcome: "working M0",
          constraints: [],
          evidence_shape: ["summary_md", "artifact_uri"],
        },
        budget: { max_runs: 2 },
      }),
    });
    expect(asg.res.status).toBe(201);
    expect(asg.body.budget).toEqual({ max_runs: 2 });
    expect(asg.body.brief.steps).toBeUndefined();

    const run = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "k1" }),
    });
    expect(run.res.status).toBe(201);
    expect(run.body.adapter).toBe("noop");
    expect(run.body.external_agent_id).toBeTruthy();
    expect(run.body.external_run_id).toBeTruthy();
    expect(run.body.status).toBe("succeeded");
    expect(run.body.advisory).toBe(true);
    expect(run.body.usage.noop_or_offline_contract).toBe(true);

    const before = await json(app, `/v1/gates?goal_id=${goal.body.id}`, {
      headers: headers("coordinator", "c1"),
    });
    expect(before.body.gates[0].status).toBe("pending");

    const ev = await json(app, `/v1/runs/${run.body.id}/evidence`, {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({
        items: [
          { kind: "summary_md", uri: "file://summary.md" },
          { kind: "artifact_uri", uri: "file://out.tgz" },
        ],
      }),
    });
    expect(ev.res.status).toBe(201);

    const ready = await json(app, `/v1/gates?status=ready&goal_id=${goal.body.id}`, {
      headers: headers("decision_maker", "dm"),
    });
    expect(ready.body.gates).toHaveLength(1);
    expect(ready.body.gates[0].ready_result.missing).toEqual([]);
    expect(ready.body.gates[0].ready_result.ok).toBe(true);

    const decided = await json(app, `/v1/gates/${ready.body.gates[0].id}/decide`, {
      method: "POST",
      headers: headers("decision_maker", "dm"),
      body: JSON.stringify({ decision: "pass", version: ready.body.gates[0].version }),
    });
    expect(decided.res.status).toBe(200);
    expect(decided.body.gate.status).toBe("decided");
  });

  it("idempotent dispatch returns the same run", async () => {
    const { app } = setup();
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "e", mode: "explore", coordinator_ref: "c1" }),
    });
    const asg = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "x", constraints: [], evidence_shape: ["summary_md"] },
      }),
    });
    const a = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "same" }),
    });
    const b = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "same" }),
    });
    expect(a.body.id).toBe(b.body.id);
  });

  it("executor dispatch is 403", async () => {
    const { app } = setup();
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "e", mode: "explore", coordinator_ref: "c1" }),
    });
    const asg = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "x", constraints: [], evidence_shape: ["summary_md"] },
      }),
    });
    const { res } = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({ idempotency_key: "nope" }),
    });
    expect(res.status).toBe(403);
  });

  it("decide conflict is 409", async () => {
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
          { kind: "summary_md", uri: "file://s.md" },
          { kind: "artifact_uri", uri: "file://a.tgz" },
        ],
      }),
    });
    const ready = await json(app, `/v1/gates?status=ready`, { headers: headers("decision_maker", "dm") });
    const id = ready.body.gates[0].id;
    const ver = ready.body.gates[0].version;
    const first = await json(app, `/v1/gates/${id}/decide`, {
      method: "POST",
      headers: headers("decision_maker", "dm"),
      body: JSON.stringify({ decision: "pass", version: ver }),
    });
    expect(first.res.status).toBe(200);
    const second = await json(app, `/v1/gates/${id}/decide`, {
      method: "POST",
      headers: headers("decision_maker", "dm"),
      body: JSON.stringify({ decision: "pass", version: ver }),
    });
    expect(second.res.status).toBe(409);
    expect(second.body.error.code).toBe("optimistic_lock");
    expect(second.body.code).toBe("optimistic_lock");
  });

  it("registers MCP M1 minimal set and no raw cursor tools", () => {
    const names = listTools().map((t) => t.name);
    expect(names).toEqual([...MCP_TOOL_NAMES]);
    expect(names).toContain("harness_propose_assignment");
    expect(names).toContain("harness_dispatch_assignment");
    expect(names).toContain("harness_get_status");
    expect(names).toContain("harness_list_ready_gates");
    expect(names.some((n) => n.includes("cursor_raw"))).toBe(false);
    expect(names).not.toContain("set_steps");
  });

  it("cursor fixture pool persists dual external ids without CURSOR_API_KEY", async () => {
    const { app } = setup();
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "e", mode: "explore", coordinator_ref: "c1" }),
    });
    const asg = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_cursor",
        brief: { outcome: "x", constraints: [], evidence_shape: ["summary_md"] },
      }),
    });
    const run = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "cursor-fix" }),
    });
    expect(run.body.adapter).toBe("cursor");
    expect(run.body.external_agent_id).toMatch(/^cursor-fixture-agent:/);
    expect(run.body.external_run_id).toMatch(/^cursor-fixture-run:/);
    expect(JSON.stringify(run.body)).not.toContain("CURSOR_API_KEY");
  });

  it("serves inbox and ops pages", async () => {
    const { app } = setup();
    const home = await app.request("/");
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("AI 办公室");
    const inbox = await app.request("/inbox");
    expect(inbox.status).toBe(200);
    const html = await inbox.text();
    expect(html).toContain("AI 办公室");
    expect(html).toContain("待我拍板");
    expect(html).toContain("稍后处理");
    expect(html).toContain("打回重做");
    expect(html).toContain(">通过<");
    expect(html).toContain("此刻没有待办。安静是正常的。");
    expect(html).toContain("已通过。");
    expect(html).toContain("已打回，同事会再交一版。");
    expect(html).toContain("已搁下，需要时还会出现。");
    expect(html).toContain("别人刚处理过这张，已帮你刷新。");
    expect(html).toContain("missing-title\">还差<");
    expect(html).toContain("待你决定");
    expect(html).not.toContain("查看待我拍板");
    expect(html).not.toContain(">决策抽屉<");
    expect(html).toContain("同事已交：结论摘要、产物");
    expect(html).toContain("data-hitl=\"待我拍板\"");
    expect(html).not.toContain("Reload ready");
    expect(html).not.toContain("材料齐全");
    expect(html).not.toContain("还缺这些");
    expect(html).toContain("/v1/gates?status=ready");
    expect(html).toContain("待办");
    expect(html).toContain("n > 0 ? `待办 · ${n}`");
    expect(html).toContain("还差：一项材料");
    expect(html).toContain("/e2e/i");
    expect(html).toContain("g-[a-z0-9-]+");
    expect(html).not.toContain("M2-preview");
    expect(html).not.toContain('href="/ops">Health');
    expect(html).not.toContain("href=\"/openapi.yaml\"");
    expect(html).toContain('data-testid="gate-card"');
    expect(html).toContain('data-testid="missing-item"');
    expect(html).toContain('data-testid="decide-pass"');
    expect(html).toContain('data-testid="decide-revise"');
    expect(html).toContain('data-testid="decide-defer"');
    expect(html).toContain("/v1/gates?status=ready");
    expect(html).toContain("decision: act, version");
    expect(html).toContain("structural_change:");
    expect(html).not.toContain("标记完成");
    expect(html).not.toContain("mark done");
    expect(html).not.toContain("去画布看进度");
    const ops = await app.request("/ops");
    expect(ops.status).toBe(200);
    const opsHtml = await ops.text();
    expect(opsHtml).toContain("OpenAPI");
    expect(opsHtml).toContain("Outbox");
    expect(opsHtml).toContain("data-testid=\"outbox-table\"");
  });
});
