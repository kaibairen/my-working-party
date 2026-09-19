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

describe("office home P0 APIs", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  function setup() {
    harness = createHarness({ databasePath: ":memory:" });
    return { harness, app: createApp(harness) };
  }

  it("creates and lists goals with human title + intent", async () => {
    const { app } = setup();
    const created = await json(app, "/v1/office/goals", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ title: "周报交付验收", intent: "把本周周报交出去" }),
    });
    expect(created.res.status).toBe(201);
    expect(created.body.title).toBe("周报交付验收");
    expect(created.body.intent).toBe("把本周周报交出去");
    expect(created.body.title).not.toBe(created.body.id);

    const listed = await json(app, "/v1/office/goals", { headers: headers("decision_maker", "you") });
    expect(listed.res.status).toBe(200);
    expect(listed.body.readonly).toBe(true);
    expect(listed.body.goals[0].title).toBe("周报交付验收");
    expect(listed.body.goals[0].status_summary).toBe("还没有人填");
  });

  it("does not expose a UUID as the office title label", async () => {
    const { app } = setup();
    const created = await json(app, "/v1/office/goals", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({
        title: "550e8400-e29b-41d4-a716-446655440000",
        intent: "不该用编号当标题",
      }),
    });
    expect(created.res.status).toBe(201);
    expect(created.body.title).toBe("未命名目标");
    const listed = await json(app, "/v1/office/goals", { headers: headers("decision_maker", "you") });
    expect(listed.body.goals[0].title).toBe("未命名目标");
  });

  it("rejects office create with BriefV1 forbidden keys", async () => {
    const { app } = setup();
    const { res, body } = await json(app, "/v1/office/goals", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({
        title: "x",
        intent: "y",
        steps: ["first"],
      }),
    });
    expect(res.status).toBe(422);
    expect(errCode(body)).toBe("brief_forbidden_field");
  });

  it("projects fill slots read-only with artifact links", async () => {
    const { app } = setup();
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "周报交付验收", mode: "deliver", coordinator_ref: "c1" }),
    });
    await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "fill", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
      }),
    });
    const slots = await json(app, `/v1/office/goals/${goal.body.id}/fill_slots`, {
      headers: headers("decision_maker", "you"),
    });
    expect(slots.res.status).toBe(200);
    expect(slots.body.readonly).toBe(true);
    expect(slots.body.title).toBe("周报交付验收");
    expect(slots.body.slots[0].filled_by.name).toBe("交付同事");
    expect(slots.body.slots[0].stage).toBe("accepted");
    expect(slots.body.slots[0]).not.toHaveProperty("assign_to");
    expect(JSON.stringify(slots.body)).not.toMatch(/指派给|开始跑/);
  });

  it("projects desk presence as busy | waiting_evidence | idle", async () => {
    const { app } = setup();
    const listed = await json(app, "/v1/office/desks/presence", {
      headers: headers("decision_maker", "you"),
    });
    expect(listed.res.status).toBe(200);
    expect(listed.body.readonly).toBe(true);
    for (const desk of listed.body.desks) {
      expect(["busy", "waiting_evidence", "idle"]).toContain(desk.presence);
    }
  });

  it("forbids owner/dispatch writes on office routes", async () => {
    const { app } = setup();
    const h = headers("decision_maker", "you");
    const created = await json(app, "/v1/office/goals", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ title: "周报交付验收", intent: "交出去" }),
    });
    const denied = [
      await json(app, "/v1/office/desks/presence", { method: "POST", headers: h, body: "{}" }),
      await json(app, "/v1/office/desks/pool_noop/assign", { method: "POST", headers: h, body: "{}" }),
      await json(app, `/v1/office/goals/${created.body.id}/dispatch`, { method: "POST", headers: h, body: "{}" }),
      await json(app, `/v1/office/goals/${created.body.id}/assign`, { method: "POST", headers: h, body: "{}" }),
      await json(app, `/v1/office/goals/${created.body.id}/fill_slots`, { method: "POST", headers: h, body: "{}" }),
    ];
    for (const row of denied) {
      expect(row.res.status).toBe(403);
      expect(errCode(row.body)).toBe("office_write_forbidden");
    }
  });
});
