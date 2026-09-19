import { afterEach, describe, expect, it } from "vitest";
import { closeHarness, createHarness, MCP_TOOL_NAMES, type Harness } from "@harness/domain";
import { listTools } from "../../mcp-server/src/index";
import { createApp } from "./app";

const headers = (role: string, actor = role) => ({
  "content-type": "application/json",
  "x-harness-role": role,
  "x-harness-actor": actor,
  "x-harness-entry": "mcp",
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
    const office = await app.request("/");
    expect(office.status).toBe(200);
    const officeHtml = await office.text();
    expect(officeHtml).toContain("AI 办公室");
    expect(officeHtml).toContain("新建目标");
    expect(officeHtml).toContain("我来填");
    expect(officeHtml).toContain("exception-grants");
    expect(officeHtml).toContain("还没有目标。建一个，同事才会开工。");
    expect(officeHtml).toContain("工位心跳");
    expect(officeHtml).toContain("只读投影。开跑不依赖打开这一页或画布。");
    expect(officeHtml).toContain('data-testid="roster"');
    expect(officeHtml).toContain('data-readonly="true"');
    expect(officeHtml).toContain("/v1/desks");
    expect(officeHtml).toContain("/v1/goals");
    expect(officeHtml).toContain("inbox-drawer");
    expect(officeHtml).toContain("sanitizeCardTitle");
    expect(officeHtml).toContain("此刻没有待办。安静是正常的。");
    expect(officeHtml).not.toContain("查看待我拍板");
    expect(officeHtml).not.toContain("OpenAPI");
    expect(officeHtml).not.toContain('href="/ops"');
    expect(officeHtml).not.toContain("派活");
    expect(officeHtml).not.toContain("指派给");
    expect(officeHtml).not.toContain("开始跑");
    expect(officeHtml).not.toContain("draggable=\"true\"");
    const inbox = await app.request("/inbox");
    expect(inbox.status).toBe(200);
    const html = await inbox.text();
    expect(html).toContain("待办");
    expect(html).toContain("稍后处理");
    expect(html).toContain('data-testid="gate-card"');
    expect(html).toContain('data-testid="missing-item"');
    expect(html).toContain('data-testid="decide-pass"');
    expect(html).toContain('data-testid="decide-revise"');
    expect(html).toContain('data-testid="decide-defer"');
    expect(html).toContain("/v1/gates?status=ready");
    expect(html).toContain("sanitizeCardTitle");
    expect(html).toContain("/e2e/i");
    expect(html).toContain("g-[a-z0-9-]+");
    expect(html).toContain("未命名目标");
    expect(html).not.toContain('href="/ops"');
    expect(html).not.toContain("OpenAPI");
    expect(html).not.toContain("标记完成");
    expect(html).not.toContain("mark done");
    expect(html).not.toContain("去画布看进度");
    const opsDm = await app.request("/ops", { headers: { "x-harness-role": "decision_maker" } });
    expect(opsDm.status).toBe(403);
    const ops = await app.request("/ops");
    expect(ops.status).toBe(200);
    const opsHtml = await ops.text();
    expect(opsHtml).toContain("OpenAPI");
    expect(opsHtml).toContain("Outbox");
    expect(opsHtml).toContain("data-testid=\"outbox-table\"");
  });

  it("projects read-only desks for the office roster", async () => {
    const { app } = setup();
    const listed = await json(app, "/v1/desks", { headers: headers("decision_maker", "you") });
    expect(listed.res.status).toBe(200);
    expect(listed.body.readonly).toBe(true);
    expect(listed.body.hitl).toBe("待我拍板");
    expect(listed.body.stub).toBe(true);
    expect(listed.body.heartbeat_ttl_seconds).toBe(90);
    expect(listed.body.desks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "交付同事", status: "空闲", presence: "idle", source: "pool_seed" }),
        expect.objectContaining({ name: "Cursor 同事", status: "空闲", presence: "idle", source: "pool_seed" }),
      ]),
    );
    const write = await app.request("/v1/desks", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ pool_id: "pool_noop" }),
    });
    expect(write.status).toBe(404);
  });

  it("lists goals and fill slots for the office home", async () => {
    const { app } = setup();
    const created = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ title: "周报交付验收", intent: "写一份能读的周报" }),
    });
    expect(created.res.status).toBe(201);
    expect(created.body.title).toBe("周报交付验收");
    expect(created.body.intent).toBe("写一份能读的周报");
    expect(created.body.mode).toBe("deliver");

    const steps = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ title: "坏目标", steps: ["先打开画布"] }),
    });
    expect(steps.res.status).toBe(422);
    expect(steps.body.code ?? steps.body.error?.code).toBe("brief_forbidden_field");

    const listed = await json(app, "/v1/goals", { headers: headers("decision_maker", "you") });
    expect(listed.res.status).toBe(200);
    expect(listed.body.goals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "周报交付验收", status_line: "等同事开工" }),
      ]),
    );

    const slots = await json(app, `/v1/goals/${created.body.id}/assignments`, {
      headers: headers("decision_maker", "you"),
    });
    expect(slots.res.status).toBe(200);
    expect(slots.body.readonly).toBe(true);
    expect(slots.body.slots[0].progress).toBe("等同事填");
    expect(JSON.stringify(slots.body)).not.toMatch(/指派给|开始跑|dispatch/);
  });

  it("exposes desk TTL fields on office presence and desks", async () => {
    const { app } = setup();
    for (const path of ["/v1/office/desks/presence", "/v1/desks"]) {
      const listed = await json(app, path, { headers: headers("decision_maker", "you") });
      expect(listed.res.status).toBe(200);
      expect(listed.body.readonly).toBe(true);
      expect(listed.body.ttl_seconds).toBe(90);
      expect(listed.body.desks[0]).toEqual(
        expect.objectContaining({
          presence: expect.stringMatching(/^(busy|waiting_evidence|idle)$/),
          last_seen_at: null,
          heartbeat_fresh: false,
          ttl_seconds: 90,
        }),
      );
    }
  });

  it("accepts decision_maker human-fill without assign or dispatch", async () => {
    const { app } = setup();
    const created = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ title: "周报交付验收", intent: "写一份能读的周报" }),
    });
    const filled = await json(app, `/v1/goals/${created.body.id}/human-fill`, {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ note: "我先写大纲", artifact_uri: "file://outline.md" }),
    });
    expect(filled.res.status).toBe(201);
    expect(filled.body.slots[0].filler_kind).toBe("human");
    expect(filled.body.slots[0].filler).toBe("你");
    expect(filled.body.slots[0].outcome).toBe("我先写大纲");
    expect(filled.body.slots[0].artifact_uri).toBe("file://outline.md");
    expect(JSON.stringify(filled.body)).not.toMatch(/指派给|开始跑|dispatch/);

    const assign = await json(app, `/v1/goals/${created.body.id}/assignments`, {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "nope", constraints: [], evidence_shape: ["summary_md"] },
      }),
    });
    expect(assign.res.status).toBe(403);
  });
});
