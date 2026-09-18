import { afterEach, describe, expect, it } from "vitest";
import { closeHarness, createHarness, MCP_TOOL_NAMES, type Harness } from "@harness/domain";
import { listTools } from "../../mcp-server/src/index";
import { createApp } from "./app";

const headers = (role: string, actor = role) => ({
  "content-type": "application/json",
  "x-harness-role": role,
  "x-harness-actor": actor,
});

async function json(app: ReturnType<typeof createApp>, path: string, init?: RequestInit) {
  const res = await app.request(path, init);
  const text = await res.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { text };
  }
  return { res, body };
}

describe("security-anti S1–S8", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  function setup() {
    harness = createHarness({ databasePath: ":memory:" });
    return { harness, app: createApp(harness) };
  }

  it("S1 secret_ref_never_echoed", async () => {
    const { app } = setup();
    const { body } = await json(app, "/v1/pools", { headers: headers("coordinator", "c1") });
    expect(JSON.stringify(body)).not.toContain("secret_ref");
    expect(JSON.stringify(body)).not.toContain("secret:noop-local");
    expect(JSON.stringify(body)).not.toContain("secret:cursor-env");
  });

  it("S2 missing_role_is_401", async () => {
    const { app } = setup();
    const { res, body } = await json(app, "/v1/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "x", mode: "explore", coordinator_ref: "c1" }),
    });
    expect(res.status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
  });

  it("S3 executor_cannot_dispatch", async () => {
    const { app } = setup();
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
    const { res } = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({ idempotency_key: "nope" }),
    });
    expect(res.status).toBe(403);
  });

  it("S4 viewer_cannot_attach_evidence", async () => {
    const { app } = setup();
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
    const run = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "k" }),
    });
    const { res } = await json(app, `/v1/runs/${run.body.id}/evidence`, {
      method: "POST",
      headers: headers("viewer", "v1"),
      body: JSON.stringify({ items: [{ kind: "summary_md", uri: "file://s.md" }] }),
    });
    expect(res.status).toBe(403);
  });

  it("S5 only_decision_maker_decides", async () => {
    const { app } = setup();
    const { res } = await json(app, "/v1/gates/missing/decide", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ decision: "pass", version: 0 }),
    });
    expect(res.status).toBe(403);
  });

  it("S6 client_cannot_write_status", async () => {
    const { app } = setup();
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
        status: "succeeded",
        brief: { outcome: "x", constraints: [], evidence_shape: ["summary_md"] },
      }),
    });
    expect(res.status).toBe(422);
    expect(body.error.code).toBe("status_immutable");
  });

  it("S7 shadow_evidence_cannot_write_gate", async () => {
    const { app } = setup();
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
        brief: { outcome: "x", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
      }),
    });
    const run = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "k" }),
    });
    await json(app, `/v1/runs/${run.body.id}/evidence`, {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({
        items: [
          { kind: "summary_md", uri: "file://s.md", shadow: true },
          { kind: "artifact_uri", uri: "file://a.tgz", shadow: true },
        ],
      }),
    });
    const ready = await json(app, `/v1/gates?status=ready&goal_id=${goal.body.id}`, {
      headers: headers("decision_maker", "dm"),
    });
    expect(ready.body.gates).toEqual([]);
  });

  it("S8 cursor_raw_not_registered", () => {
    const names = listTools().map((t) => t.name);
    expect(names).toEqual([...MCP_TOOL_NAMES]);
    expect(names.some((n) => n.includes("cursor_raw"))).toBe(false);
    expect(names).not.toContain("set_steps");
  });

  it("Bearer role:actor works and insufficient role is 403", async () => {
    const { app } = setup();
    const ok = await json(app, "/v1/goals", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer coordinator:c1" },
      body: JSON.stringify({ title: "e", mode: "explore", coordinator_ref: "c1" }),
    });
    expect(ok.res.status).toBe(201);
    const denied = await json(app, `/v1/goals/${ok.body.id}/assignments`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer viewer:v1" },
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "x", constraints: [], evidence_shape: ["summary_md"] },
      }),
    });
    expect(denied.res.status).toBe(403);
  });

  it("rejects plaintext credential fields; secret_ref only", async () => {
    const { app } = setup();
    const { res, body } = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        title: "e",
        mode: "explore",
        coordinator_ref: "c1",
        api_key: "sk-live",
      }),
    });
    expect(res.status).toBe(422);
    expect(body.error.code).toBe("plaintext_credential_forbidden");
  });

  it("freeze rejects new dispatch and snapshots dial_at_dispatch otherwise", async () => {
    const { app } = setup();
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
    const run = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "before-freeze" }),
    });
    expect(run.body.dial_at_dispatch).toBe("free");

    const frozen = await json(app, `/v1/goals/${goal.body.id}/dial`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ dial: "freeze" }),
    });
    expect(frozen.body.dial).toBe("freeze");

    const replay = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "before-freeze" }),
    });
    expect(replay.body.id).toBe(run.body.id);

    const blocked = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "after-freeze" }),
    });
    expect(blocked.res.status).toBe(403);
    expect(blocked.body.error.code).toBe("dial_frozen");
  });

  it("audit/policy_events/gate_decisions have no PATCH or DELETE", async () => {
    const { app } = setup();
    for (const path of ["/v1/audit", "/v1/policy-events", "/v1/gate-decisions"]) {
      const patch = await app.request(path, { method: "PATCH", headers: headers("coordinator", "c1") });
      expect(patch.status).toBe(405);
      const del = await app.request(path, { method: "DELETE", headers: headers("coordinator", "c1") });
      expect(del.status).toBe(405);
    }
  });

  it("inbound hooks reject unsigned requests", async () => {
    const { app } = setup();
    const { res, body } = await json(app, "/hooks/github", { method: "POST" });
    expect(res.status).toBe(401);
    expect(body.error.code).toBe("hmac_unverified");
  });

  it("policy/check returns decision, track, reason_code, redirect", async () => {
    const { app } = setup();
    const { body } = await json(app, "/v1/policy/check", {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({ action: "protected_merge" }),
    });
    expect(body.decision).toBe("require_gate");
    expect(body.track).toBe("authority_gate");
    expect(body.reason_code).toBe("authority_whitelist");
    expect(body).toHaveProperty("redirect");
  });
});
