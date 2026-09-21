import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeHarness,
  createHarness,
  STATUS_LINE_DONE,
  STATUS_LINE_FILLING,
  STATUS_LINE_PENDING_DECISION,
  STATUS_LINE_WAITING,
  STATUS_LINE_WAITING_EVIDENCE,
  type Harness,
} from "@harness/domain";
import { zhDM } from "../../../web/copy/zh-DM";
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
    expect(officeHtml).toContain("desk-group");
    expect(officeHtml).not.toContain("Bot 填 ·");
    expect(officeHtml).not.toContain("交付同事");
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
    expect(officeHtml).not.toContain("强制开工");
    expect(officeHtml).not.toContain('data-testid="start-run"');
    expect(officeHtml).toContain("exception-grants");
    expect(officeHtml).toContain("阶段未解锁：先完成上一道门禁");
    expect(officeHtml).toContain("需先通过上一道门禁");
    expect(officeHtml).toContain('data-testid="stage-strip"');
    expect(officeHtml).toContain('data-act="stage-locked"');
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

  it("office_consumes_domain_status_line", () => {
    expect(officeHtml).toContain("status_line");
    expect(officeHtml).toContain("goalStatusLine");
    expect(officeHtml).toContain('data-testid="goal-status"');
    expect(officeHtml).not.toMatch(/status_line\s*\|\|\s*["'`][^"'`]+["'`]/);
    expect(officeHtml).not.toMatch(/["'`]待拍板["'`]/);
    expect(officeHtml).not.toMatch(/["'`]同事在填["'`]/);
    expect(officeHtml).not.toContain(STATUS_LINE_FILLING);
    expect(officeHtml).not.toContain("待拍板");
    expect(officeHtml).not.toContain(STATUS_LINE_DONE);
    expect(zhDM.statusWaiting).toBe(STATUS_LINE_WAITING);
    expect(zhDM.statusFilling).toBe(STATUS_LINE_FILLING);
    expect(zhDM.statusWaitingEvidence).toBe(STATUS_LINE_WAITING_EVIDENCE);
    expect(zhDM.statusPendingDecision).toBe(STATUS_LINE_PENDING_DECISION);
    expect(zhDM.statusPendingDecision).toBe("等你拍板");
    expect(zhDM.statusPendingDecision).not.toBe("待拍板");
    expect(zhDM.statusDone).toBe(STATUS_LINE_DONE);
    expect(zhDM.statusDone).toBe("已交齐");
    expect(zhDM.statusDone).not.toBe("已交产物");
  });

  it("office_desks_paint_domain_presence_only", () => {
    expect(officeHtml).toContain("heartbeatFresh");
    expect(officeHtml).toContain("deskPresence");
    expect(officeHtml).toContain("last_heartbeat");
    expect(officeHtml).not.toMatch(/presence\s*\|\|\s*["']busy["']/);
    expect(officeHtml).toContain('data-presence="${esc(presence)}"');
  });
});
