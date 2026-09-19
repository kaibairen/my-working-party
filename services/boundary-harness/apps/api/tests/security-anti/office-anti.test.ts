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

  it("office_home_not_inbox_wall", async () => {
    harness = createHarness({ databasePath: ":memory:" });
    const app = createApp(harness);
    const html = await (await app.request("/")).text();
    expect(html).toContain("AI 办公室");
    expect(html).toContain('data-testid="office-shell"');
    expect(html).toContain('data-testid="goals-panel"');
    expect(html).toContain('data-testid="desks-entry"');
    expect(html).toContain("还没有目标。建一个，同事才会开工。");
    expect(html).not.toMatch(/指派给|拖到工位|开始跑|派活/);
    expect(html).not.toContain("OpenAPI");
  });

  it("inbox_is_drawer_not_home", () => {
    expect(officeHtml).toContain('data-testid="inbox-drawer"');
    expect(officeHtml).toContain('data-testid="open-inbox"');
    expect(officeHtml).toContain("openDrawer");
    expect(officeHtml).toContain('id="inbox-drawer"');
    expect(officeHtml).toContain("/inbox");
  });

  it("office_no_assign_desk", async () => {
    harness = createHarness({ databasePath: ":memory:" });
    const app = createApp(harness);
    const listed = await json(app, "/v1/desks", { headers: headers("decision_maker", "you") });
    expect(listed.res.status).toBe(200);
    expect(listed.body.readonly).toBe(true);
    expect(listed.body.desks).toEqual([]);
    expect(JSON.stringify(listed.body.desks)).not.toMatch(/交付同事|Cursor 同事/);
    const dmFlag = await json(app, "/v1/desks?include_pools=1", {
      headers: headers("decision_maker", "you"),
    });
    expect(dmFlag.body.include_pools).toBe(false);
    expect(dmFlag.body.desks).toEqual([]);
    expect(JSON.stringify(dmFlag.body)).not.toMatch(/交付同事|Cursor 同事/);
    for (const desk of listed.body.desks) {
      expect(["busy", "waiting_evidence", "idle"]).toContain(desk.presence);
    }
    expect(officeHtml).toContain("还没有 Bot 报心跳");
    expect(officeHtml).toContain("不是侧栏同步");
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

  it("desks_grouped_layout_readonly", async () => {
    expect(officeHtml).toContain('data-readonly="true"');
    expect(officeHtml).toContain("groupDesks");
    expect(officeHtml).toContain('data-testid="desk-group"');
    expect(officeHtml).toContain("未分组");
    expect(officeHtml).toContain("交付组");
    expect(officeHtml).toContain("调研组");
    expect(officeHtml).toContain("isTrustedDesk");
    harness = createHarness({ databasePath: ":memory:" });
    const app = createApp(harness);
    const listed = await json(app, "/v1/desks", { headers: headers("decision_maker", "you") });
    expect(listed.body.readonly).toBe(true);
    expect(listed.body.desks).toEqual([]);
    const beatA = await json(app, "/v1/agents/heartbeat", {
      method: "POST",
      headers: headers("executor", "bot-a"),
      body: JSON.stringify({ display_name: "Bot A", pool_id: "pool_noop" }),
    });
    expect(beatA.res.status).toBe(200);
    await json(app, "/v1/agents/heartbeat", {
      method: "POST",
      headers: headers("executor", "bot-b"),
      body: JSON.stringify({ display_name: "Bot B", pool_id: "pool_cursor" }),
    });
    await json(app, "/v1/agents/heartbeat", {
      method: "POST",
      headers: headers("executor", "bot-c"),
      body: JSON.stringify({ display_name: "Bot C" }),
    });
    const live = await json(app, "/v1/desks", { headers: headers("decision_maker", "you") });
    expect(live.body.readonly).toBe(true);
    expect(live.body.desks.map((d: { name: string; pool_id: string | null }) => [d.name, d.pool_id])).toEqual([
      ["Bot A", "pool_noop"],
      ["Bot B", "pool_cursor"],
      ["Bot C", null],
    ]);
  });

  it("desks_group_no_drag_assign", () => {
    expect(officeHtml).toContain("groupDesks");
    expect(officeHtml).toContain('data-testid="desk-group"');
    expect(officeHtml).toContain('draggable="false"');
    expect(officeHtml).not.toContain('draggable="true"');
    expect(officeHtml).not.toMatch(/指派给|拖到工位|开始跑|派活/);
    expect(officeHtml).not.toContain('data-testid="start-run"');
    expect(officeHtml).not.toContain('data-act="assign"');
    expect(officeHtml).toContain('data-act="toggle-group"');
  });

  it("desks_group_no_fake_seeds", async () => {
    expect(officeHtml).toContain("isTrustedDesk");
    expect(officeHtml).toContain("FAKE_SEED_RE");
    harness = createHarness({ databasePath: ":memory:" });
    const app = createApp(harness);
    const listed = await json(app, "/v1/desks", { headers: headers("decision_maker", "you") });
    expect(listed.body.desks).toEqual([]);
    expect(JSON.stringify(listed.body)).not.toMatch(/交付同事|Cursor 同事|群组同事/);
    await json(app, "/v1/agents/heartbeat", {
      method: "POST",
      headers: headers("executor", "bot-deliver"),
      body: JSON.stringify({ display_name: "周报 Bot", pool_id: "pool_noop" }),
    });
    const live = await json(app, "/v1/desks", { headers: headers("decision_maker", "you") });
    expect(live.body.desks.map((d: { name: string }) => d.name)).toEqual(["周报 Bot"]);
    expect(JSON.stringify(live.body.desks)).not.toMatch(/交付同事|Cursor 同事|群组同事/);
    expect(live.body.desks.every((d: { source: string }) => d.source === "heartbeat")).toBe(true);
  });
});
