import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { HEARTBEAT_TTL_SECONDS, closeHarness, createHarness, type Harness } from "@harness/domain";
import { callTool, listTools } from "../../../mcp-server/src/index";
import { createMcpHttpApp } from "../../../mcp-server/src/http-proxy";
import { createApp } from "../../src/app";

const sopPath = join(dirname(fileURLToPath(import.meta.url)), "../../../../docs/DOGFOOD_GROKBOT_MCP_SOP.md");

const mcpHeaders = (role: string, actor = role) => ({
  "content-type": "application/json",
  "x-harness-role": role,
  "x-harness-actor": actor,
  "x-harness-entry": "mcp",
});

const roleOnly = (role: string, actor = role) => ({
  "content-type": "application/json",
  "x-harness-role": role,
  "x-harness-actor": actor,
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

describe("P0 linkage contracts", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  function setup(now?: () => string) {
    harness = createHarness({ databasePath: ":memory:", now });
    return { harness, app: createApp(harness) };
  }

  async function seedDeliverRun(app: ReturnType<typeof createApp>) {
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: mcpHeaders("coordinator", "c1"),
      body: JSON.stringify({ title: "周报交付验收", mode: "deliver", coordinator_ref: "c1" }),
    });
    const asg = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: mcpHeaders("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: {
          outcome: "working M0",
          constraints: [],
          evidence_shape: ["summary_md", "artifact_uri"],
        },
      }),
    });
    const run = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: mcpHeaders("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "p0-mcp-1" }),
    });
    expect(run.res.status).toBe(201);
    return { goal: goal.body, assignment: asg.body, run: run.body };
  }

  it("completion_writes_missing_mcp_entry_403", async () => {
    const { app } = setup();
    const { assignment, run } = await seedDeliverRun(app);
    const deniedDispatch = await json(app, `/v1/assignments/${assignment.id}/dispatch`, {
      method: "POST",
      headers: roleOnly("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "bypass-dispatch" }),
    });
    expect(deniedDispatch.res.status).toBe(403);
    expect(errCode(deniedDispatch.body)).toBe("mcp_entry_required");
    expect(deniedDispatch.body.details?.path ?? deniedDispatch.body.error?.details?.path).toBe(
      "/v1/assignments/{id}/dispatch",
    );

    const deniedEvidence = await json(app, `/v1/runs/${run.id}/evidence`, {
      method: "POST",
      headers: roleOnly("executor", "e1"),
      body: JSON.stringify({ items: [{ kind: "summary_md", uri: "file://s.md" }] }),
    });
    expect(deniedEvidence.res.status).toBe(403);
    expect(errCode(deniedEvidence.body)).toBe("mcp_entry_required");
    expect(deniedEvidence.body.details?.path ?? deniedEvidence.body.error?.details?.path).toBe(
      "/v1/runs/{id}/evidence",
    );
  });

  it("mcp_only_completion_path", async () => {
    const { app } = setup();
    const { goal, run } = await seedDeliverRun(app);

    const bypass = await json(app, `/v1/runs/${run.id}/evidence`, {
      method: "POST",
      headers: roleOnly("executor", "e1"),
      body: JSON.stringify({
        items: [
          { kind: "summary_md", uri: "file://summary.md" },
          { kind: "artifact_uri", uri: "file://out.tgz" },
        ],
      }),
    });
    expect(bypass.res.status).toBe(403);
    expect(errCode(bypass.body)).toBe("mcp_entry_required");

    const still = await json(app, `/v1/gates?goal_id=${goal.id}`, {
      headers: mcpHeaders("decision_maker", "dm"),
    });
    expect(still.body.gates[0].status).not.toBe("ready");

    const attached = await json(app, `/v1/runs/${run.id}/evidence`, {
      method: "POST",
      headers: mcpHeaders("executor", "e1"),
      body: JSON.stringify({
        items: [
          { kind: "summary_md", uri: "file://summary.md" },
          { kind: "artifact_uri", uri: "file://out.tgz" },
        ],
      }),
    });
    expect(attached.res.status).toBe(201);
    const ready = await json(app, `/v1/gates?status=ready&goal_id=${goal.id}`, {
      headers: mcpHeaders("decision_maker", "dm"),
    });
    expect(ready.body.gates).toHaveLength(1);
    expect(ready.body.gates[0].ready_result.ok).toBe(true);
  });

  it("bot_bypass_direct_cursor_forbidden", async () => {
    const { app } = setup();
    const { run } = await seedDeliverRun(app);

    const direct = await json(app, `/v1/runs/${run.id}/evidence`, {
      method: "POST",
      headers: roleOnly("executor", "e1"),
      body: JSON.stringify({ items: [{ kind: "summary_md", uri: "file://s.md" }] }),
    });
    expect(direct.res.status).toBe(403);
    expect(errCode(direct.body)).toBe("mcp_entry_required");

    await expect(callTool("cursor_raw_launch", {}, {})).rejects.toThrow(/not registered|forbidden_tool/);

    const mcpApp = createMcpHttpApp();
    const raw = await mcpApp.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "cursor_raw_launch", arguments: {} },
      }),
    });
    const rawBody = (await raw.json()) as { error: { message: string } };
    expect(rawBody.error.message).toBe("forbidden_tool");
    expect(listTools({ http: true }).some((t) => t.name.includes("cursor_raw"))).toBe(false);
  });

  it("harness_heartbeat_desks_ttl_readonly", async () => {
    let nowMs = Date.parse("2026-09-19T04:00:00.000Z");
    const { app } = setup(() => new Date(nowMs).toISOString());

    const before = await json(app, "/v1/desks", { headers: mcpHeaders("decision_maker", "you") });
    expect(before.body.readonly).toBe(true);
    expect(before.body.stub).toBe(true);
    expect(before.body.heartbeat_ttl_seconds).toBe(HEARTBEAT_TTL_SECONDS);
    expect(before.body.desks.find((d: { id: string }) => d.id === "pool_noop")).toBeUndefined();
    expect(before.body.desks.some((d: { name: string }) => d.name === "交付同事" || d.name === "Cursor 同事")).toBe(false);

    const beat = await json(app, "/v1/agents/heartbeat", {
      method: "POST",
      headers: mcpHeaders("executor", "bot-deliver"),
      body: JSON.stringify({ display_name: "交付同事", pool_id: "pool_noop" }),
    });
    expect(beat.res.status).toBe(200);
    expect(beat.body.ttl_seconds).toBe(HEARTBEAT_TTL_SECONDS);

    const live = await json(app, "/v1/desks", { headers: mcpHeaders("decision_maker", "you") });
    expect(live.body.stub).toBe(false);
    expect(live.body.readonly).toBe(true);
    const noop = live.body.desks.find((d: { id: string }) => d.id === "pool_noop");
    expect(noop.last_heartbeat).toBe(beat.body.last_heartbeat);
    expect(noop.source).toBe("heartbeat");

    const extra = await json(app, "/v1/agents/heartbeat", {
      method: "POST",
      headers: mcpHeaders("executor", "sidebar-bot"),
      body: JSON.stringify({ display_name: "侧栏同事", ttl_seconds: 60 }),
    });
    expect(extra.body.ttl_seconds).toBe(60);
    const withExtra = await json(app, "/v1/desks", { headers: mcpHeaders("decision_maker", "you") });
    expect(withExtra.body.desks.some((d: { id: string }) => d.id === "agent:sidebar-bot")).toBe(true);

    const write = await app.request("/v1/desks", {
      method: "POST",
      headers: mcpHeaders("decision_maker", "you"),
      body: JSON.stringify({ pool_id: "pool_noop" }),
    });
    expect(write.status).toBe(404);

    nowMs += (HEARTBEAT_TTL_SECONDS + 1) * 1000;
    const expired = await json(app, "/v1/desks", { headers: mcpHeaders("decision_maker", "you") });
    expect(expired.body.stub).toBe(true);
    expect(expired.body.desks.find((d: { id: string }) => d.id === "pool_noop")).toBeUndefined();
    expect(expired.body.desks.some((d: { name?: string; source?: string }) => d.name === "交付同事" || d.source === "pool_seed")).toBe(false);
    expect(expired.body.desks.some((d: { id: string }) => d.id === "agent:sidebar-bot")).toBe(false);
  });

  it("human fill path — human_allowed or exception_grant", async () => {
    const { app } = setup();
    const allowed = await json(app, "/v1/goals", {
      method: "POST",
      headers: mcpHeaders("coordinator", "c1"),
      body: JSON.stringify({
        title: "周报交付验收",
        mode: "deliver",
        coordinator_ref: "c1",
        dispatch_policy: "human_allowed",
        intent: "写一份能读的周报",
      }),
    });
    const filled = await json(app, `/v1/goals/${allowed.body.id}/assignments`, {
      method: "POST",
      headers: mcpHeaders("decision_maker", "you"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: {
          outcome: "写一份能读的周报",
          constraints: [],
          evidence_shape: ["summary_md", "artifact_uri"],
        },
      }),
    });
    expect(filled.res.status).toBe(201);
    const slots = await json(app, `/v1/goals/${allowed.body.id}/assignments`, {
      headers: mcpHeaders("decision_maker", "you"),
    });
    expect(slots.body.readonly).toBe(true);
    expect(slots.body.slots[0].filler_kind).toBe("human");
    expect(slots.body.slots[0].filler).toBe("你");
    expect(JSON.stringify(slots.body)).not.toMatch(/指派给|开始跑|dispatch/);

    const gated = await json(app, "/v1/goals", {
      method: "POST",
      headers: mcpHeaders("decision_maker", "you"),
      body: JSON.stringify({ title: "例外人填", intent: "我自己填一格" }),
    });
    const denied = await json(app, `/v1/goals/${gated.body.id}/assignments`, {
      method: "POST",
      headers: mcpHeaders("decision_maker", "you"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "我自己填一格", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
      }),
    });
    expect(denied.res.status).toBe(403);

    const grant = await json(app, `/v1/goals/${gated.body.id}/exception-grants`, {
      method: "POST",
      headers: mcpHeaders("decision_maker", "you"),
      body: JSON.stringify({ grantee: "you", scope: "fill_assignment", max_uses: 1 }),
    });
    const granted = await json(app, `/v1/goals/${gated.body.id}/assignments`, {
      method: "POST",
      headers: mcpHeaders("decision_maker", "you"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "我自己填一格", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
        exception_grant_id: grant.body.id,
      }),
    });
    expect(granted.res.status).toBe(201);
    const grantedSlots = await json(app, `/v1/goals/${gated.body.id}/assignments`, {
      headers: mcpHeaders("decision_maker", "you"),
    });
    expect(grantedSlots.body.slots[0].filler_kind).toBe("human");
  });

  it("dogfood_8787_mcp_sop", async () => {
    const sop = readFileSync(sopPath, "utf8");
    expect(sop).toContain("http://127.0.0.1:8787/mcp");
    expect(sop).toContain(":8080");
    expect(sop).toContain("禁止");
    expect(sop).toContain("CURSOR_API_KEY");
    expect(sop).toMatch(/Bearer/);

    const names = listTools({ http: true }).map((t) => t.name);
    expect(names.every((n) => n.startsWith("harness_"))).toBe(true);
    expect(names).toContain("harness_heartbeat");
    const mcpApp = createMcpHttpApp();
    const healthz = await mcpApp.request("/healthz");
    const hz = (await healthz.json()) as { ok: boolean; api: string };
    expect(hz.ok).toBe(true);
    expect(hz.api).toContain("8080");
    const listed = await mcpApp.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    const body = (await listed.json()) as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.map((t) => t.name)).toEqual(names);
    const raw = await mcpApp.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "cursor_raw_launch", arguments: {} },
      }),
    });
    expect(((await raw.json()) as { error: { message: string } }).error.message).toBe("forbidden_tool");
  });
});
