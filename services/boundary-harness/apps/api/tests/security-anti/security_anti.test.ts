/**
 * QA merge gate: security-anti (exact names).
 * HTTP-level; do not demote to docs-only hooks.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { signWebhook } from "../../src/hmac.js";
import { briefOk, json, testApp, token, WEBHOOK_SECRET } from "../../test/helpers.js";

test("hmac_bad_signature_401", async () => {
  const { app } = testApp();
  const ts = String(Math.floor(Date.now() / 1000));
  const res = await json(app, "POST", "/v1/hooks/github", {
    body: { ping: true },
    headers: {
      "X-Harness-Signature": "sha256=deadbeef",
      "X-Harness-Timestamp": ts,
    },
  });
  assert.equal(res.status, 401);
  assert.equal((res.data as { code: string }).code, "webhook_bad_signature");
});

test("hmac_timestamp_skew_401", async () => {
  const { app } = testApp();
  const raw = JSON.stringify({ ping: true });
  const res = await json(app, "POST", "/v1/hooks/cursor", {
    body: raw,
    headers: {
      "X-Harness-Signature": signWebhook(WEBHOOK_SECRET, "1", raw),
      "X-Harness-Timestamp": "1",
    },
  });
  assert.equal(res.status, 401);
  assert.equal((res.data as { code: string }).code, "webhook_skew");
});

test("freeze_blocks_dispatch_423", async () => {
  const { app } = testApp();
  const dm = await token("decision_maker");
  const coord = await token("coordinator");
  const goal = await json(app, "POST", "/v1/goals", {
    token: coord,
    body: { title: "g", mode: "explore", coordinator_ref: "c1" },
  });
  const asg = await json(app, "POST", `/v1/goals/${(goal.data as { id: string }).id}/assignments`, {
    token: coord,
    body: { pool_id: "pool_noop", brief: briefOk },
  });
  const froze = await json(app, "POST", "/v1/admin/freeze", {
    token: dm,
    body: { enabled: true, reason: "security-anti" },
  });
  assert.equal(froze.status, 200);
  const res = await json(app, "POST", `/v1/assignments/${(asg.data as { id: string }).id}/dispatch`, {
    token: coord,
    headers: { "Idempotency-Key": "sec-freeze-1" },
    body: {},
  });
  assert.equal(res.status, 423);
  assert.equal((res.data as { code: string }).code, "freeze_active");
});

test("freeze_rbac_only_decision_maker_or_service", async () => {
  const { app } = testApp();
  const body = { enabled: true, reason: "rbac" };
  for (const role of ["coordinator", "executor", "viewer"] as const) {
    const res = await json(app, "POST", "/v1/admin/freeze", {
      token: await token(role),
      body,
    });
    assert.equal(res.status, 403, role);
  }
  const dm = await json(app, "POST", "/v1/admin/freeze", {
    token: await token("decision_maker"),
    body: { enabled: true, reason: "dm" },
  });
  assert.equal(dm.status, 200);
  const svc = await json(app, "POST", "/v1/admin/freeze", {
    token: await token("service"),
    body: { enabled: false },
  });
  assert.equal(svc.status, 200);
});

test("secret_ref_never_echoed", async () => {
  process.env.SEC_ANTI_POOL_PLAINTEXT = "super-secret-plaintext-value";
  const { app } = testApp();
  const coord = await token("coordinator");
  const res = await json(app, "POST", "/v1/pools", {
    token: coord,
    body: { id: "pool_sec_anti", kind: "noop", secret_ref: "env:SEC_ANTI_POOL_PLAINTEXT" },
  });
  assert.equal(res.status, 201);
  const dumped = JSON.stringify(res.data);
  assert.ok(dumped.includes("env:SEC_ANTI_POOL_PLAINTEXT"));
  assert.equal(dumped.includes("super-secret-plaintext-value"), false);
  delete process.env.SEC_ANTI_POOL_PLAINTEXT;
});

test("secret_ref_unsupported_400", async () => {
  const { app } = testApp();
  const coord = await token("coordinator");
  const res = await json(app, "POST", "/v1/pools", {
    token: coord,
    body: { id: "pool_sops", kind: "cursor_account", secret_ref: "sops:prod/cursor" },
  });
  assert.equal(res.status, 400);
  assert.equal((res.data as { code: string }).code, "secret_ref_unsupported");
});

test("audit_log_append_only", async () => {
  const { app } = testApp();
  const coord = await token("coordinator");
  const dm = await token("decision_maker");
  const created = await json(app, "POST", "/v1/goals", {
    token: coord,
    body: { title: "audited", mode: "explore", coordinator_ref: "c1" },
  });
  assert.equal(created.status, 201);
  const list = await json(app, "GET", "/v1/admin/audit", { token: dm });
  assert.equal(list.status, 200);
  const items = (list.data as { items: { action: string; payload_json?: unknown }[] }).items;
  assert.ok(items.some((i) => i.action === "goal.create"));
  const dumped = JSON.stringify(list.data);
  assert.equal(dumped.includes("super-secret"), false);

  const patch = await json(app, "PATCH", "/v1/admin/audit", { token: dm, body: { action: "tamper" } });
  assert.equal(patch.status, 405);
  const del = await json(app, "DELETE", "/v1/audit_log/aud_1", { token: dm });
  assert.equal(del.status, 405);
  const post = await json(app, "POST", "/v1/admin/audit", { token: dm, body: { action: "inject" } });
  assert.equal(post.status, 405);
});

test("jwt_pool_forbidden_403", async () => {
  const { app } = testApp();
  const coord = await token("coordinator", ["other_pool"]);
  const goal = await json(app, "POST", "/v1/goals", {
    token: coord,
    body: { title: "g", mode: "explore", coordinator_ref: "c1" },
  });
  const res = await json(app, "POST", `/v1/goals/${(goal.data as { id: string }).id}/assignments`, {
    token: coord,
    body: { pool_id: "pool_noop", brief: briefOk },
  });
  assert.equal(res.status, 403);
  assert.equal((res.data as { code: string }).code, "pool_forbidden");
});

test("dial_whitelist_not_overbroad", async () => {
  const { app } = testApp();
  const coord = await token("coordinator");
  for (const action of ["change_path", "create_workspace_file", "propose_assignment", "read", "search"]) {
    const res = await json(app, "POST", "/v1/policy/check", { token: coord, body: { action } });
    assert.equal(res.status, 200, action);
    const body = res.data as { track: string; decision: string; gate_created: boolean; dispatch_blocked: boolean };
    assert.equal(body.track, "advisory_hint", action);
    assert.notEqual(body.decision, "require_gate", action);
    assert.equal(body.gate_created, false, action);
    assert.equal(body.dispatch_blocked, false, action);
  }
  const listed = await json(app, "POST", "/v1/policy/check", {
    token: coord,
    body: { action: "external_send" },
  });
  assert.equal((listed.data as { track: string }).track, "authority_gate");
});
