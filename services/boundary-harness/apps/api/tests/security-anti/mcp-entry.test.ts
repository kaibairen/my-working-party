import { afterEach, describe, expect, it } from "vitest";
import { closeHarness, createHarness, type Harness } from "@harness/domain";
import { callTool } from "../../../mcp-server/src/index";
import { createApp } from "../../src/app";

const headers = (role: string, actor = role) => ({
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

describe("MCP entry deny (option A)", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  function setup() {
    harness = createHarness({ databasePath: ":memory:" });
    return { harness, app: createApp(harness) };
  }

  async function seedDeliverRun(app: ReturnType<typeof createApp>) {
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "周报交付验收", mode: "deliver", coordinator_ref: "c1" }),
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
      }),
    });
    const run = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "mcp-entry-1" }),
    });
    expect(run.res.status).toBe(201);
    return { goal: goal.body, run: run.body };
  }

  it("mcp_only_completion_path", async () => {
    const { app } = setup();
    const { goal, run } = await seedDeliverRun(app);

    const before = await json(app, `/v1/gates?goal_id=${goal.id}`, {
      headers: headers("decision_maker", "dm"),
    });
    expect(before.body.gates[0].status).not.toBe("ready");
    expect(before.body.gates[0].ready_result?.ok ?? false).toBe(false);

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
      headers: headers("decision_maker", "dm"),
    });
    expect(still.body.gates[0].status).not.toBe("ready");
    expect(still.body.gates[0].ready_result?.ok ?? false).toBe(false);

    const attached = await json(app, `/v1/runs/${run.id}/evidence`, {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({
        items: [
          { kind: "summary_md", uri: "file://summary.md" },
          { kind: "artifact_uri", uri: "file://out.tgz" },
        ],
      }),
    });
    expect(attached.res.status).toBe(201);
    const ready = await json(app, `/v1/gates?status=ready&goal_id=${goal.id}`, {
      headers: headers("decision_maker", "dm"),
    });
    expect(ready.body.gates).toHaveLength(1);
    expect(ready.body.gates[0].ready_result.ok).toBe(true);
  });

  it("bot_bypass_direct_cursor_forbidden", async () => {
    const { app } = setup();
    const { run } = await seedDeliverRun(app);

    const noAuth = await json(app, `/v1/runs/${run.id}/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ kind: "summary_md", uri: "file://s.md" }] }),
    });
    expect(noAuth.res.status).toBe(401);
    expect(errCode(noAuth.body)).toBe("unauthenticated");

    const direct = await json(app, `/v1/runs/${run.id}/evidence`, {
      method: "POST",
      headers: roleOnly("executor", "e1"),
      body: JSON.stringify({ items: [{ kind: "summary_md", uri: "file://s.md" }] }),
    });
    expect([401, 403]).toContain(direct.res.status);
    expect(errCode(direct.body)).toBe("mcp_entry_required");

    const rawDispatch = await json(app, `/v1/assignments/${run.assignment_id}/dispatch`, {
      method: "POST",
      headers: roleOnly("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "direct-cursor" }),
    });
    expect(rawDispatch.res.status).toBe(403);
    expect(errCode(rawDispatch.body)).toBe("mcp_entry_required");

    await expect(callTool("cursor_raw_launch", {}, {})).rejects.toThrow(/forbidden_tool/);
    await expect(callTool("cursor_raw_agents", {}, {})).rejects.toThrow(/forbidden_tool/);

    const decide = await json(app, "/v1/gates/missing/decide", {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({ decision: "pass", version: 0 }),
    });
    expect(decide.res.status).toBe(403);
    expect(errCode(decide.body)).toBe("forbidden");
  });
});
