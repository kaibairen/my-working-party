import { afterEach, describe, expect, it } from "vitest";
import { createCursorAdapter } from "../../../../packages/adapters-cursor/src/index";
import {
  BRIEF_FORBIDDEN_KEYS,
  closeHarness,
  createHarness,
  MCP_TOOL_NAMES,
  parseBriefV1,
  publishOutbox,
  syncCursorAgentRuns,
  type Harness,
} from "@harness/domain";
import { listTools } from "../../../mcp-server/src/index";
import { createApp } from "../../src/app";

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

describe("M1 Cursor + Dial + Brief + MCP", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  it("dual_id_persistence — cursor fixture stores both external ids + dial_at_dispatch", async () => {
    harness = createHarness({ databasePath: ":memory:" });
    const app = createApp(harness);
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
      body: JSON.stringify({ idempotency_key: "cursor-dual" }),
    });
    expect(run.res.status).toBe(201);
    expect(run.body.external_agent_id).toMatch(/^cursor-fixture-agent:/);
    expect(run.body.external_run_id).toMatch(/^cursor-fixture-run:/);
    expect(run.body.idempotency_key).toBe("cursor-dual");
    expect(run.body.dial_at_dispatch).toBe("free");
    expect(run.body.usage.cursor_lifecycle).toBe("FINISHED");
  });

  it("idle_neq_ready — IDLE + evidence does not make Gate ready", async () => {
    harness = createHarness({
      databasePath: ":memory:",
      adapters: { cursor: createCursorAdapter({ apiKey: "", lifecycle: "IDLE" }) },
    });
    const app = createApp(harness);
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "ship", mode: "deliver", coordinator_ref: "c1" }),
    });
    const asg = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_cursor",
        brief: { outcome: "x", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
      }),
    });
    const run = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "idle-1" }),
    });
    expect(run.body.status).not.toBe("succeeded");
    expect(run.body.usage.cursor_lifecycle).toBe("IDLE");
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
    const ready = await json(app, `/v1/gates?status=ready&goal_id=${goal.body.id}`, {
      headers: headers("decision_maker", "dm"),
    });
    expect(ready.body.gates).toEqual([]);
  });

  it("brief_forbidden_http_and_mcp — same 422 brief_forbidden_field", async () => {
    harness = createHarness({ databasePath: ":memory:" });
    const app = createApp(harness);
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "e", mode: "explore", coordinator_ref: "c1" }),
    });
    const { res, body } = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "x", constraints: [], evidence_shape: ["summary_md"], steps: ["nope"] },
      }),
    });
    expect(res.status).toBe(422);
    expect(body.code).toBe("brief_forbidden_field");
    expect(() => parseBriefV1({ outcome: "x", constraints: [], evidence_shape: ["summary_md"], plan: "x" })).toThrow();
    expect(BRIEF_FORBIDDEN_KEYS).toEqual(expect.arrayContaining(["steps", "script", "plan", "playbook"]));
  });

  it("dial_freeze_dispatch_423", async () => {
    harness = createHarness({ databasePath: ":memory:" });
    const app = createApp(harness);
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
    await json(app, `/v1/goals/${goal.body.id}/dial`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ dial: "freeze" }),
    });
    const blocked = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "frozen" }),
    });
    expect(blocked.res.status).toBe(423);
    expect(blocked.body.code).toBe("dial_frozen");
  });

  it("live_cursor_launch_has_repository_and_poll_makes_gate_ready", async () => {
    const repository = "https://github.com/kaibairen/my-working-party";
    let remoteStatus = "CREATING";
    const posts: Array<Record<string, unknown>> = [];
    const adapter = createCursorAdapter({
      apiKey: "live-key",
      baseUrl: "https://cursor.example",
      repository,
      fetchImpl: (async (url, init) => {
        const href = String(url);
        if ((init?.method ?? "GET") === "POST" && href.endsWith("/v1/agents")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
          posts.push(body);
          return new Response(
            JSON.stringify({
              agent: { id: "bc-live", latestRunId: "run-live" },
              run: { id: "run-live", agentId: "bc-live", status: "CREATING" },
            }),
            { status: 200 },
          );
        }
        if (href.includes("/v1/agents/bc-live/runs/run-live")) {
          return new Response(JSON.stringify({ id: "run-live", agentId: "bc-live", status: remoteStatus }), {
            status: 200,
          });
        }
        throw new Error(`unexpected cursor url ${href}`);
      }) as typeof fetch,
    });
    harness = createHarness({ databasePath: ":memory:", adapters: { cursor: adapter } });
    const app = createApp(harness);
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "ship", mode: "deliver", coordinator_ref: "c1" }),
    });
    const asg = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_cursor",
        brief: { outcome: "x", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
      }),
    });
    const run = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "live-1" }),
    });
    expect(run.res.status).toBe(201);
    expect(posts).toHaveLength(1);
    expect(posts[0].source).toEqual({ repository, ref: "main" });
    expect(posts[0].repos).toEqual([{ url: repository, startingRef: "main" }]);
    expect(run.body.external_agent_id).toBe("bc-live");
    expect(run.body.external_run_id).toBe("run-live");
    expect(run.body.external_agent_id).not.toBe(run.body.external_run_id);
    expect(run.body.status).toBe("dispatched");
    expect(run.body.usage.cursor_lifecycle).toBe("DISPATCHED");

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
    const before = await json(app, `/v1/gates?status=ready&goal_id=${goal.body.id}`, {
      headers: headers("decision_maker", "dm"),
    });
    expect(before.body.gates).toEqual([]);

    expect(await syncCursorAgentRuns(harness)).toBe(0);
    remoteStatus = "FINISHED";
    expect(await syncCursorAgentRuns(harness)).toBe(1);
    const refreshed = await json(app, `/v1/runs/${run.body.id}`, { headers: headers("coordinator", "c1") });
    expect(refreshed.body.usage.cursor_lifecycle).toBe("FINISHED");
    expect(refreshed.body.status).toBe("succeeded");
    const ready = await json(app, `/v1/gates?status=ready&goal_id=${goal.body.id}`, {
      headers: headers("decision_maker", "dm"),
    });
    expect(ready.body.gates).toHaveLength(1);
  });

  it("mcp_surface_denylist", () => {
    const names = listTools().map((t) => t.name);
    expect(names).toEqual([...MCP_TOOL_NAMES]);
    for (const banned of ["cursor_raw_launch", "set_steps", "mark_done", "cursor_launch"]) {
      expect(names.some((n) => n.includes(banned) || n === banned)).toBe(false);
    }
  });

  it("github_fixture_snapshot_ready_path", async () => {
    harness = createHarness({ databasePath: ":memory:" });
    const app = createApp(harness);
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
        brief: { outcome: "x", constraints: [], evidence_shape: ["summary_md"] },
      }),
    });
    const run = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "gh-1" }),
    });
    await json(app, `/v1/runs/${run.body.id}/evidence`, {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({ items: [{ kind: "summary_md", uri: "file://s.md" }] }),
    });
    const snap = await json(app, "/v1/github-snapshots", {
      method: "POST",
      headers: headers("service", "svc"),
      body: JSON.stringify({
        goal_id: goal.body.id,
        assignment_id: asg.body.id,
        is_draft: false,
        checks_conclusion: "success",
        raw_hash: "fixture",
      }),
    });
    expect(snap.res.status).toBe(201);
    const listed = await json(app, `/v1/github-snapshots?goal_id=${goal.body.id}`, {
      headers: headers("coordinator", "c1"),
    });
    expect(listed.body.snapshots).toHaveLength(1);
    const ready = await json(app, `/v1/gates?status=ready&goal_id=${goal.body.id}`, {
      headers: headers("decision_maker", "dm"),
    });
    expect(ready.body.gates).toHaveLength(1);
  });
});

describe("M3 outbox retry + HMAC", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  it("outbox_retry_and_webhook_signature", async () => {
    const calls: Array<{ headers: Record<string, string>; body: string; status: number }> = [];
    let fail = true;
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url, init) => {
      const headersIn = (init?.headers ?? {}) as Record<string, string>;
      const body = String(init?.body ?? "");
      if (fail) {
        calls.push({ headers: headersIn, body, status: 500 });
        return new Response("nope", { status: 500 });
      }
      calls.push({ headers: headersIn, body, status: 200 });
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    harness = createHarness({
      databasePath: ":memory:",
      webhookUrl: "http://hooks.test/inbox",
      webhookSecret: "hook-test-secret",
    });
    try {
      const app = createApp(harness);
      const goal = await json(app, "/v1/goals", {
        method: "POST",
        headers: headers("coordinator", "c1"),
        body: JSON.stringify({
          title: "e",
          mode: "explore",
          coordinator_ref: "c1",
          gate_template_id: "safety_only_v1",
        }),
      });
      await json(app, "/v1/policy/check", {
        method: "POST",
        headers: headers("executor", "e1"),
        body: JSON.stringify({
          action: "destructive_delete",
          track: "authority_gate",
          goal_id: goal.body.id,
        }),
      });
      const first = await publishOutbox(harness);
      expect(first).toBe(0);
      const pending = await json(app, "/v1/outbox", { headers: headers("coordinator", "c1") });
      expect(pending.body.outbox.every((r: { status: string }) => r.status === "pending")).toBe(true);
      expect(pending.body.outbox[0].attempts).toBe(1);
      expect(pending.body.outbox[0].last_error).toBe("http_500");

      fail = false;
      for (const row of pending.body.outbox) {
        harness.sqlite.prepare("UPDATE outbox SET next_attempt_at = NULL WHERE id = ?").run(row.id);
      }
      const second = await publishOutbox(harness);
      expect(second).toBeGreaterThanOrEqual(1);
      expect(calls.some((c) => c.status === 200)).toBe(true);
      const ok = calls.find((c) => c.status === 200);
      expect(ok?.headers["x-harness-signature"]).toMatch(/^sha256=[0-9a-f]+$/);
      expect(ok?.headers["x-harness-timestamp"]).toMatch(/^\d+$/);
      const delivered = await json(app, "/v1/outbox", { headers: headers("coordinator", "c1") });
      expect(delivered.body.outbox.some((r: { status: string }) => r.status === "published")).toBe(true);
      const health = await json(app, "/health");
      expect(health.body.outbox.published).toBeGreaterThanOrEqual(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
