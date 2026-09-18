import { afterEach, describe, expect, it } from "vitest";
import {
  AUTHORITY_ACTIONS,
  MCP_TOOL_NAMES,
  checkPolicy,
  closeHarness,
  createHarness,
  signHarnessWebhook,
  signJwt,
  type Harness,
} from "@harness/domain";
import { listTools } from "../../../mcp-server/src/index";
import { createApp } from "../../src/app";

const headers = (role: string, actor = role) => ({
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

describe("security-anti S1–S8 (QA freeze)", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  function setup() {
    harness = createHarness({ databasePath: ":memory:" });
    return { harness, app: createApp(harness) };
  }

  it("hmac_bad_signature_401", async () => {
    const { app } = setup();
    const prev = process.env.WEBHOOK_SIGNING_SECRET;
    process.env.WEBHOOK_SIGNING_SECRET = "hook-test-secret";
    try {
      const now = Math.floor(Date.now() / 1000);
      const { res, body } = await json(app, "/v1/hooks/github", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-harness-signature": "sha256=00",
          "x-harness-timestamp": String(now),
        },
        body: "{}",
      });
      expect(res.status).toBe(401);
      expect(errCode(body)).toBe("webhook_bad_signature");
    } finally {
      if (prev === undefined) delete process.env.WEBHOOK_SIGNING_SECRET;
      else process.env.WEBHOOK_SIGNING_SECRET = prev;
    }
  });

  it("hmac_timestamp_skew_401", async () => {
    const { app } = setup();
    const prev = process.env.WEBHOOK_SIGNING_SECRET;
    process.env.WEBHOOK_SIGNING_SECRET = "hook-test-secret";
    try {
      const now = Math.floor(Date.now() / 1000);
      const raw = "{}";
      const skewTs = String(now - 301);
      const { res, body } = await json(app, "/v1/hooks/cursor", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-harness-signature": signHarnessWebhook("hook-test-secret", skewTs, raw),
          "x-harness-timestamp": skewTs,
        },
        body: raw,
      });
      expect(res.status).toBe(401);
      expect(errCode(body)).toBe("webhook_skew");
    } finally {
      if (prev === undefined) delete process.env.WEBHOOK_SIGNING_SECRET;
      else process.env.WEBHOOK_SIGNING_SECRET = prev;
    }
  });

  it("freeze_blocks_dispatch_423", async () => {
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
    await json(app, "/v1/admin/freeze", {
      method: "POST",
      headers: headers("decision_maker", "dm"),
      body: JSON.stringify({ enabled: true }),
    });
    const blocked = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ idempotency_key: "after-freeze" }),
    });
    expect(blocked.res.status).toBe(423);
    expect(errCode(blocked.body)).toBe("freeze_active");
    const mcp = await json(app, `/v1/assignments/${asg.body.id}/dispatch`, {
      method: "POST",
      headers: headers("service", "mcp"),
      body: JSON.stringify({ idempotency_key: "mcp-after-freeze" }),
    });
    expect(mcp.res.status).toBe(423);
    expect(errCode(mcp.body)).toBe("freeze_active");
    expect(listTools().map((t) => t.name)).toContain("harness_dispatch");
    expect([...MCP_TOOL_NAMES]).toContain("harness_dispatch");
  });

  it("secret_ref_never_echoed", async () => {
    const { app } = setup();
    const created = await json(app, "/v1/pools", {
      method: "POST",
      headers: headers("decision_maker", "dm"),
      body: JSON.stringify({ id: "pool_file", kind: "noop", secret_ref: "file:/var/lib/harness/extra.secret" }),
    });
    expect(created.res.status).toBe(201);
    expect(created.body.secret_ref).toBe("file:/var/lib/harness/extra.secret");
    const { body } = await json(app, "/v1/pools", { headers: headers("coordinator", "c1") });
    for (const pool of body.pools) {
      expect(pool.secret_ref).toMatch(/^(file:\/|env:)[A-Za-z0-9._/:-]+$/);
    }
    expect(JSON.stringify(body)).not.toMatch(/sk-live|password=|BEGIN PRIVATE KEY|secret:noop/);
  });

  it("secret_ref_unsupported_400", async () => {
    const { app } = setup();
    for (const secret_ref of ["secret:noop-local", "sops:prod/cursor", "kms:aws/alias/x"]) {
      const { res, body } = await json(app, "/v1/pools", {
        method: "POST",
        headers: headers("service", "svc"),
        body: JSON.stringify({ kind: "noop", secret_ref }),
      });
      expect(res.status).toBe(400);
      expect(errCode(body)).toBe("secret_ref_unsupported");
    }
  });

  it("audit_log_append_only", async () => {
    const { app } = setup();
    await json(app, "/v1/goals", {
      method: "POST",
      headers: { ...headers("coordinator", "c1"), "x-request-id": "req-s6" },
      body: JSON.stringify({ title: "e", mode: "explore", coordinator_ref: "c1" }),
    });
    const { body } = await json(app, "/v1/audit", { headers: headers("decision_maker", "dm") });
    expect(body.audit.length).toBeGreaterThan(0);
    expect(Object.keys(body.audit[0]).sort()).toEqual([
      "action",
      "actor_role",
      "actor_sub",
      "at",
      "id",
      "payload_json",
      "request_id",
      "resource_id",
      "resource_type",
    ]);
    for (const path of ["/v1/audit", "/v1/policy-events", "/v1/gate-decisions"]) {
      expect((await app.request(path, { method: "PATCH", headers: headers("coordinator", "c1") })).status).toBe(405);
      expect((await app.request(path, { method: "DELETE", headers: headers("coordinator", "c1") })).status).toBe(405);
    }
  });

  it("jwt_pool_forbidden_403", async () => {
    const { app } = setup();
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({
      sub: "c-jwt",
      role: "coordinator",
      pool_ids: ["pool_cursor"],
      iat: now,
      exp: now + 3600,
    });
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: "e", mode: "explore", coordinator_ref: "c-jwt" }),
    });
    const denied = await json(app, `/v1/goals/${goal.body.id}/assignments`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "x", constraints: [], evidence_shape: ["summary_md"] },
      }),
    });
    expect(denied.res.status).toBe(403);
    expect(errCode(denied.body)).toBe("pool_forbidden");
  });

  it("dial_whitelist_not_overbroad", async () => {
    expect([...AUTHORITY_ACTIONS].sort()).toEqual(
      ["destructive_delete", "external_send", "over_budget", "privilege_escalation", "protected_merge"].sort(),
    );
    for (const action of ["change_path", "create_file", "propose_assignment"]) {
      const r = checkPolicy({ action, track: "authority_gate" });
      expect(r.track).toBe("advisory_hint");
      expect(r.decision).not.toBe("require_gate");
      expect(r.creates_gate).toBe(false);
    }
  });
});
