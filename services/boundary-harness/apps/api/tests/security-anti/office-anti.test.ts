import { afterEach, describe, expect, it } from "vitest";
import { closeHarness, createHarness, type Harness } from "@harness/domain";
import { createApp } from "../../src/app";

/**
 * Office shell anti names — Backend = 403 on assign/drag/start-run writes.
 * Presence and fill_slots are GET-only. Frontend owns UI button absences.
 * Does not change the frozen security-anti 8 registry.
 */
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

describe("office shell write-deny antis", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  function setup() {
    harness = createHarness({ databasePath: ":memory:" });
    return { harness, app: createApp(harness) };
  }

  it("office_no_assign_desk", async () => {
    const { app } = setup();
    const { res, body } = await json(app, "/v1/office/desks/pool_noop/assign", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ owner: "you" }),
    });
    expect(res.status).toBe(403);
    expect(errCode(body)).toBe("office_write_forbidden");
    const presence = await json(app, "/v1/office/desks/presence", {
      headers: headers("decision_maker", "you"),
    });
    expect(presence.res.status).toBe(200);
    expect(presence.body.readonly).toBe(true);
  });

  it("office_no_drag_dispatch", async () => {
    const { app } = setup();
    const created = await json(app, "/v1/office/goals", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ title: "周报交付验收", intent: "交出去" }),
    });
    const drag = await json(app, "/v1/office/desks/pool_noop/dispatch", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ goal_id: created.body.id }),
    });
    expect(drag.res.status).toBe(403);
    expect(errCode(drag.body)).toBe("office_write_forbidden");
    const dispatch = await json(app, `/v1/office/goals/${created.body.id}/dispatch`, {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({}),
    });
    expect(dispatch.res.status).toBe(403);
    expect(errCode(dispatch.body)).toBe("office_write_forbidden");
  });

  it("office_no_start_run_button", async () => {
    const { app } = setup();
    const created = await json(app, "/v1/office/goals", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ title: "周报交付验收", intent: "交出去" }),
    });
    const { res, body } = await json(app, `/v1/office/goals/${created.body.id}/fill_slots`, {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ start_run: true }),
    });
    expect(res.status).toBe(403);
    expect(errCode(body)).toBe("office_write_forbidden");
  });

  it("fill_board_not_dispatch_console", async () => {
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
    const dumped = JSON.stringify(slots.body);
    expect(dumped).not.toMatch(/指派给|拖到工位|开始跑|assign_to|start_run|dispatch_url/);
    const write = await json(app, `/v1/office/goals/${goal.body.id}/fill_slots`, {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({}),
    });
    expect(write.res.status).toBe(403);
    expect(errCode(write.body)).toBe("office_write_forbidden");
  });
});
