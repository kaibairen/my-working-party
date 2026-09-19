import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { closeHarness, createHarness, type Harness } from "@harness/domain";
import { createApp } from "../../src/app";

/** Extra office anti names — do not add to the frozen S1–S8 registry of 8. */
const here = dirname(fileURLToPath(import.meta.url));
const officeHtml = readFileSync(join(here, "../../src/office.html"), "utf8");

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

describe("office anti-dispatch regressions", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  it("desks_no_pool_seed_fake_names", async () => {
    harness = createHarness({ databasePath: ":memory:" });
    const app = createApp(harness);
    const listed = await json(app, "/v1/desks", { headers: headers("decision_maker", "you") });
    expect(listed.res.status).toBe(200);
    expect(listed.body.readonly).toBe(true);
    expect(listed.body.stub).toBe(true);
    expect(listed.body.desks).toEqual([]);
    const names = (listed.body.desks as Array<{ name: string }>).map((d) => d.name);
    expect(names).not.toContain("交付同事");
    expect(names).not.toContain("Cursor 同事");
  });

  it("desks_list_requires_fresh_heartbeat", async () => {
    let nowMs = Date.parse("2026-09-19T06:00:00.000Z");
    harness = createHarness({ databasePath: ":memory:", now: () => new Date(nowMs).toISOString() });
    const app = createApp(harness);
    const before = await json(app, "/v1/desks", { headers: headers("decision_maker", "you") });
    expect(before.body.desks).toEqual([]);
    expect(before.body.stub).toBe(true);

    const beat = await json(app, "/v1/agents/heartbeat", {
      method: "POST",
      headers: headers("executor", "bot-1"),
      body: JSON.stringify({ display_name: "侧栏同事", pool_id: "pool_noop", ttl_seconds: 90 }),
    });
    expect(beat.res.status).toBe(200);
    const live = await json(app, "/v1/desks", { headers: headers("decision_maker", "you") });
    expect(live.body.stub).toBe(false);
    expect(live.body.desks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "pool_noop",
          name: "侧栏同事",
          source: "heartbeat",
          last_heartbeat: beat.body.last_heartbeat,
        }),
      ]),
    );

    nowMs += 91_000;
    const stale = await json(app, "/v1/desks", { headers: headers("decision_maker", "you") });
    expect(stale.body.stub).toBe(true);
    expect(stale.body.desks).toEqual([]);
    expect(stale.body.desks.some((d: { name?: string; source?: string }) => d.name === "交付同事" || d.source === "pool_seed")).toBe(false);
  });

  it("office_no_assign_desk", async () => {
    harness = createHarness({ databasePath: ":memory:" });
    const app = createApp(harness);
    const listed = await json(app, "/v1/desks", { headers: headers("decision_maker", "you") });
    expect(listed.res.status).toBe(200);
    expect(listed.body.readonly).toBe(true);
    for (const desk of listed.body.desks) {
      expect(["busy", "waiting_evidence", "idle"]).toContain(desk.presence);
    }
    const assign = await app.request("/v1/desks/pool_noop/assign", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: "{}",
    });
    expect(assign.status).toBe(404);
    expect(officeHtml).not.toMatch(/指派给|拖到工位/);
  });

  it("office_no_drag_dispatch", () => {
    expect(officeHtml).toContain('data-readonly="true"');
    expect(officeHtml).not.toContain('draggable="true"');
    expect(officeHtml).not.toMatch(/指派给|拖到工位|派活/);
  });

  it("office_no_start_run_button", () => {
    expect(officeHtml).toContain("我来填");
    expect(officeHtml).not.toMatch(/>(开始跑|开跑)</);
    expect(officeHtml).not.toContain('data-testid="start-run"');
    expect(officeHtml).toContain("exception-grants");
  });

  it("fill_board_not_dispatch_console", async () => {
    harness = createHarness({ databasePath: ":memory:" });
    const app = createApp(harness);
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ title: "周报交付验收", intent: "写一份能读的周报" }),
    });
    const slots = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      headers: headers("decision_maker", "you"),
    });
    expect(slots.body.readonly).toBe(true);
    expect(JSON.stringify(slots.body)).not.toMatch(/指派给|开始跑|dispatch|assign_to/);
    const desksWrite = await app.request("/v1/desks", {
      method: "POST",
      headers: headers("decision_maker", "you"),
      body: JSON.stringify({ owner: "you", pool_id: "pool_noop" }),
    });
    expect(desksWrite.status).toBe(404);
  });
});
