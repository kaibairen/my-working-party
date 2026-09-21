import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";
import {
  extractAssigneeBotIds,
  handleDomainOutboundEvent,
  resetWakeIdempotencyForTests,
  verifyWebhookHmac,
  buildWakeNote,
} from "./domain-events";
import { createMcpHttpApp } from "./http-proxy";

const here = dirname(fileURLToPath(import.meta.url));
const opsDocs = join(here, "../../../docs/ops");

describe("P0-D domain-events", () => {
  beforeEach(() => resetWakeIdempotencyForTests());

  it("outbound_wake_requires_assignee_bot_id", async () => {
    const r = await handleDomainOutboundEvent({
      id: "o1",
      type: "gate.ready",
      payload: { goal_id: "g1", gate_instance_id: "gi1" },
    });
    expect(r.action).toBe("skipped_no_assignee");
  });

  it("missing assignee_bot_ids[] also skips without exploding", async () => {
    const r = await handleDomainOutboundEvent({
      id: "o1b",
      type: "goal.status_changed",
      payload: { goal_id: "g1", assignee_bot_ids: [] },
    });
    expect(r.action).toBe("skipped_no_assignee");
    expect(r.assignee_bot_ids).toEqual([]);
  });

  it("outbound_wake_idempotent_by_outbox_id", async () => {
    const woke: string[] = [];
    const env = {
      id: "o2",
      type: "goal.status_changed" as const,
      payload: { goal_id: "g", status_line: "等你拍板", assignee_bot_id: "bot-a" },
    };
    const a = await handleDomainOutboundEvent(env, {
      wake: async (id) => {
        woke.push(id);
      },
    });
    const b = await handleDomainOutboundEvent(env, {
      wake: async (id) => {
        woke.push(id);
      },
    });
    expect(a.action).toBe("woke");
    expect(b.action).toBe("skipped_duplicate");
    expect(woke).toEqual(["bot-a"]);
  });

  it("recognizes stage.unlocked even if Domain ships later", async () => {
    const woke: string[] = [];
    const r = await handleDomainOutboundEvent(
      {
        id: "o-stage",
        type: "stage.unlocked",
        created_at: "2026-09-21T00:00:00.000Z",
        payload: { goal_id: "g", stage_key: "fill", assignee_bot_id: "bot-b" },
      },
      { wake: async (id) => woke.push(id) },
    );
    expect(r.action).toBe("woke");
    expect(r.assignee_bot_ids).toEqual(["bot-b"]);
    expect(r.note).toContain("stage.unlocked");
    expect(woke).toEqual(["bot-b"]);
  });

  it("unknown type is skipped", async () => {
    const r = await handleDomainOutboundEvent({
      id: "o-unknown",
      type: "goal.renamed",
      payload: { assignee_bot_id: "bot-a" },
    });
    expect(r.action).toBe("skipped_unknown_type");
  });

  it("extracts assignee_bot_ids array", () => {
    expect(extractAssigneeBotIds({ assignee_bot_ids: ["b1", "b2"], assignee_bot_id: "b1" })).toEqual([
      "b1",
      "b2",
    ]);
  });

  it("hmac optional when secret unset; required when set", () => {
    const body = '{"id":"1"}';
    expect(verifyWebhookHmac(body, undefined, undefined)).toBe(true);
    const secret = "s3cret";
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookHmac(body, `sha256=${sig}`, secret)).toBe(true);
    expect(verifyWebhookHmac(body, "sha256=dead", secret)).toBe(false);
  });

  it("wake note does not instruct attach bypass", () => {
    const n = buildWakeNote("gate.ready", { goal_id: "g", gate_instance_id: "x" });
    expect(n).toContain("手套");
    expect(n).not.toMatch(/代.?attach|旁路/);
  });

  it("status_line wording stays Domain SoT 等你拍板", () => {
    const n = buildWakeNote("goal.status_changed", { goal_id: "g", status_line: "等你拍板" });
    expect(n).toContain("等你拍板");
    expect(n).not.toContain("待拍板");
  });

  it("wake is remind-only and never attach_evidence", async () => {
    const calls: Array<{ botId: string; note: string }> = [];
    const r = await handleDomainOutboundEvent(
      {
        id: "o-remind",
        type: "gate.ready",
        payload: { goal_id: "g", gate_instance_id: "gi", assignee_bot_ids: ["bot-c"] },
      },
      {
        wake: async (botId, note) => {
          calls.push({ botId, note });
        },
      },
    );
    expect(r.action).toBe("woke");
    expect(JSON.stringify(calls)).not.toMatch(/attach_evidence/);
    expect(calls[0].note).not.toMatch(/代.?attach|主聊天|spam/);
  });
});

describe("P0-C/D ops freeze names", () => {
  it("docs pin bot_glove_default_evidence_ready and status_change_outbound_wakes_assignee", () => {
    const p0c = readFileSync(join(opsDocs, "P0C_DEFAULT_MCP_GLOVE_v1.md"), "utf8");
    const p0d = readFileSync(join(opsDocs, "P0D_OUTBOUND_WAKE_PROTOCOL_v0.md"), "utf8");
    const checklist = readFileSync(join(opsDocs, "SIDEBAR_BOT_MCP_GLOVE_CHECKLIST_v1.md"), "utf8");
    expect(p0c).toContain("bot_glove_default_evidence_ready");
    expect(p0d).toContain("status_change_outbound_wakes_assignee");
    expect(`${p0c}\n${p0d}\n${checklist}`).toContain("等你拍板");
    expect(`${p0c}\n${p0d}\n${checklist}`).not.toContain("待拍板");
  });
});

describe("POST /hooks/domain-events", () => {
  const prevSecret = process.env.HARNESS_WEBHOOK_SECRET;
  const prevAlt = process.env.WEBHOOK_SIGNING_SECRET;

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.HARNESS_WEBHOOK_SECRET;
    else process.env.HARNESS_WEBHOOK_SECRET = prevSecret;
    if (prevAlt === undefined) delete process.env.WEBHOOK_SIGNING_SECRET;
    else process.env.WEBHOOK_SIGNING_SECRET = prevAlt;
    resetWakeIdempotencyForTests();
  });

  it("keeps /mcp + /healthz and accepts envelope without HMAC when secret unset", async () => {
    delete process.env.HARNESS_WEBHOOK_SECRET;
    delete process.env.WEBHOOK_SIGNING_SECRET;
    const app = createMcpHttpApp();
    const health = await app.request("/healthz");
    expect(health.status).toBe(200);
    const mcp = await app.request("/mcp");
    expect(mcp.status).toBe(200);

    const res = await app.request("/hooks/domain-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "hook-1",
        type: "gate.ready",
        created_at: "2026-09-21T00:00:00.000Z",
        payload: { goal_id: "g", assignee_bot_id: "bot-a" },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; results: Array<{ action: string }> };
    expect(body.ok).toBe(true);
    expect(body.results[0].action).toBe("woke");
  });

  it("rejects invalid HMAC when secret is set", async () => {
    process.env.HARNESS_WEBHOOK_SECRET = "hook-secret";
    delete process.env.WEBHOOK_SIGNING_SECRET;
    const app = createMcpHttpApp();
    const raw = JSON.stringify({
      id: "hook-2",
      type: "gate.ready",
      payload: { assignee_bot_id: "bot-a" },
    });
    const bad = await app.request("/hooks/domain-events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-harness-webhook-signature": "sha256=dead" },
      body: raw,
    });
    expect(bad.status).toBe(401);
    const sig = createHmac("sha256", "hook-secret").update(raw).digest("hex");
    const ok = await app.request("/hooks/domain-events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-harness-webhook-signature": `sha256=${sig}` },
      body: raw,
    });
    expect(ok.status).toBe(200);
  });
});
