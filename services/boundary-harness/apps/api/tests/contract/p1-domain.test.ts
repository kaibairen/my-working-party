import { afterEach, describe, expect, it } from "vitest";
import {
  closeHarness,
  createHarness,
  DEFAULT_DELIVER_GATE_TEMPLATE,
  STAGE_KEY_DELIVER,
  STAGE_KEY_RESEARCH,
  type Harness,
} from "@harness/domain";
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

describe("P1 domain dogfood fixes", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  function setup() {
    harness = createHarness({ databasePath: ":memory:" });
    return { harness, app: createApp(harness) };
  }

  it("pool_cursor_fill_not_400", async () => {
    const { harness: h, app } = setup();
    const product = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ title: "周报交付验收", intent: "写一份能读的周报" }),
    });
    expect(product.res.status).toBe(201);

    const filled = await json(app, `/v1/goals/${product.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_cursor",
        brief: { outcome: "写一份能读的周报", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
      }),
    });
    expect(filled.res.status).not.toBe(400);
    expect(filled.res.status).toBe(201);
    expect(filled.body.pool_id).toBe("pool_cursor");
    expect(filled.body.brief.evidence_shape).toEqual(expect.arrayContaining(["summary_md", "artifact_uri"]));

    const orphan = createHarness({ databasePath: ":memory:" });
    try {
      orphan.sqlite.prepare("DELETE FROM pools WHERE id = 'pool_cursor'").run();
      const orphanApp = createApp(orphan);
      const restaged = await json(orphanApp, "/v1/goals", {
        method: "POST",
        headers: headers("coordinator", "c1"),
        body: JSON.stringify({ title: "Cursor 池补种", mode: "deliver", coordinator_ref: "c1" }),
      });
      const reseeded = await json(orphanApp, `/v1/goals/${restaged.body.id}/assignments`, {
        method: "POST",
        headers: headers("coordinator", "c1"),
        body: JSON.stringify({
          pool_id: "pool_cursor",
          brief: { outcome: "补种后也能填", constraints: [], evidence_shape: ["summary_md"] },
        }),
      });
      expect(reseeded.res.status).not.toBe(400);
      expect(reseeded.res.status).toBe(201);
      expect(reseeded.body.pool_id).toBe("pool_cursor");
    } finally {
      closeHarness(orphan);
    }

    const invalid = await json(app, `/v1/goals/${product.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_cursor",
        brief: { outcome: "坏 brief", constraints: [], evidence_shape: ["summary_md"], steps: ["nope"] },
      }),
    });
    expect(invalid.res.status).not.toBe(400);
    expect(invalid.res.status).toBe(422);
    expect(invalid.body.code ?? invalid.body.error?.code).toBe("brief_forbidden_field");
  });

  it("product_goal_default_stage_gates", async () => {
    const { app } = setup();
    expect(DEFAULT_DELIVER_GATE_TEMPLATE).toBe("research_then_deliver_v1");

    const dm = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ title: "产品交付", intent: "先调研再交" }),
    });
    expect(dm.res.status).toBe(201);
    expect(dm.body.mode).toBe("deliver");
    expect(dm.body.gate_template_id).toBe("research_then_deliver_v1");
    expect(dm.body.gate_defs.map((d: { stage_key: string; predicate_id: string }) => [d.stage_key, d.predicate_id]))
      .toEqual([
        [STAGE_KEY_RESEARCH, "research_ready_v1"],
        [STAGE_KEY_DELIVER, "deliver_ready_v1"],
      ]);

    const coord = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "协调者交付", mode: "deliver", coordinator_ref: "c1" }),
    });
    expect(coord.body.gate_template_id).toBe("research_then_deliver_v1");
    expect(coord.body.gate_defs).toHaveLength(2);

    const slots = await json(app, `/v1/goals/${dm.body.id}/assignments`, {
      headers: headers("decision_maker", "you"),
    });
    expect(slots.body.stage_strip.ready).toBe(true);
    expect(slots.body.stage_strip.stages.map((s: { stage_key: string; state: string }) => [s.stage_key, s.state]))
      .toEqual([["research", "current"], ["deliver", "locked"]]);
    const open = slots.body.slots.filter((s: { stage_locked?: boolean }) => !s.stage_locked);
    expect(open).toHaveLength(1);
    expect(open[0].empty).toBe(true);
    expect(open[0].stage_key).toBe("research");
    expect(open[0].stage_locked).not.toBe(true);
    expect(slots.body.slots.some((s: { stage_locked?: boolean; stage_key?: string }) => s.stage_locked && s.stage_key === "deliver")).toBe(true);

    const explicit = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        title: "单交付门",
        mode: "deliver",
        coordinator_ref: "c1",
        gate_template_id: "deliver_ready_v1",
      }),
    });
    expect(explicit.body.gate_defs).toHaveLength(1);
    expect(explicit.body.gate_defs[0].predicate_id).toBe("deliver_ready_v1");
  });

  it("api_8080_bind_no_blip", async () => {
    const { harness: h, app } = setup();
    h.bus.on("goal.status_changed", () => {
      throw new Error("bus listener must not kill bind");
    });

    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "绑定不掉线", mode: "deliver", coordinator_ref: "c1" }),
    });
    const filled = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_cursor",
        assignee_bot_id: "bot-bound",
        brief: { outcome: "bind", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
      }),
    });
    expect(filled.res.status).toBe(201);
    expect(filled.body.assignee_bot_id).toBe("bot-bound");

    const bound = await json(app, `/v1/assignments/${filled.body.id}/bind`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ assignee_bot_id: "bot-rebind" }),
    });
    expect(bound.res.status).not.toBe(400);
    expect(bound.res.status).toBe(200);
    expect(bound.body.assignee_bot_id).toBe("bot-rebind");

    const health = await json(app, "/health");
    expect(health.res.status).toBe(200);
    expect(health.body.ok ?? true).toBeTruthy();

    const parallel = await Promise.all([
      json(app, `/v1/assignments/${filled.body.id}/bind`, {
        method: "POST",
        headers: headers("service", "svc"),
        body: JSON.stringify({ assignee_bot_id: "bot-a" }),
      }),
      json(app, `/v1/goals/${goal.body.id}/assignments`, {
        method: "POST",
        headers: headers("coordinator", "c1"),
        body: JSON.stringify({
          pool_id: "pool_cursor",
          assignee_bot_id: "bot-b",
          brief: { outcome: "parallel", constraints: [], evidence_shape: ["summary_md"] },
        }),
      }),
      json(app, "/health"),
    ]);
    expect(parallel.every((p) => p.res.status < 500)).toBe(true);
    expect(parallel[0].res.status).toBe(200);
    expect(parallel[1].res.status).toBe(201);
    expect(parallel[2].res.status).toBe(200);
  });
});
