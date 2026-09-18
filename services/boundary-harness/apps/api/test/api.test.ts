import assert from "node:assert/strict";
import { test } from "node:test";
import { signWebhook } from "../src/hmac.js";
import { parseDatabasePath } from "../src/config.js";
import { assertSecretRef } from "@boundary-harness/domain";
import { briefOk, exploreReadyPath, json, testApp, token, WEBHOOK_SECRET } from "./helpers.js";

test("healthz_200", async () => {
  const { app } = testApp();
  const res = await json(app, "GET", "/healthz");
  assert.equal(res.status, 200);
  assert.equal((res.data as { ok: boolean }).ok, true);
  assert.equal((res.data as { schema_version: string }).schema_version, "1");
});

test("jwt_requires_claims", async () => {
  const { app } = testApp();
  const res = await json(app, "GET", "/v1/admin/freeze");
  assert.equal(res.status, 401);
});

test("brief_steps_http_422", async () => {
  const { app } = testApp();
  const coord = await token("coordinator");
  const goal = await json(app, "POST", "/v1/goals", {
    token: coord,
    body: { title: "g", mode: "explore", coordinator_ref: "c1", gate_template_id: null },
  });
  const res = await json(app, "POST", `/v1/goals/${(goal.data as { id: string }).id}/assignments`, {
    token: coord,
    body: { pool_id: "pool_noop", brief: { ...briefOk, steps: ["a"] } },
  });
  assert.equal(res.status, 422);
  assert.equal((res.data as { code: string }).code, "brief_forbidden_field");
  assert.ok(((res.data as { keys: string[] }).keys ?? []).includes("steps"));
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
    body: { enabled: true, reason: "incident" },
  });
  assert.equal(froze.status, 200);
  assert.equal((froze.data as { enabled: boolean }).enabled, true);
  const res = await json(app, "POST", `/v1/assignments/${(asg.data as { id: string }).id}/dispatch`, {
    token: coord,
    headers: { "Idempotency-Key": "k1" },
    body: {},
  });
  assert.equal(res.status, 423);
  assert.equal((res.data as { code: string }).code, "freeze_active");
});

test("executor_cannot_dispatch", async () => {
  const { app } = testApp();
  const coord = await token("coordinator");
  const exec = await token("executor");
  const goal = await json(app, "POST", "/v1/goals", {
    token: coord,
    body: { title: "g", mode: "explore", coordinator_ref: "c1" },
  });
  const asg = await json(app, "POST", `/v1/goals/${(goal.data as { id: string }).id}/assignments`, {
    token: coord,
    body: { pool_id: "pool_noop", brief: briefOk },
  });
  const res = await json(app, "POST", `/v1/assignments/${(asg.data as { id: string }).id}/dispatch`, {
    token: exec,
    headers: { "Idempotency-Key": "k2" },
    body: {},
  });
  assert.equal(res.status, 403);
});

test("gate_decide_optimistic_lock_409", async () => {
  const { app } = testApp();
  const coord = await token("coordinator");
  const dm = await token("decision_maker");
  const goal = await json(app, "POST", "/v1/goals", {
    token: coord,
    body: {
      title: "deliver one",
      mode: "deliver",
      coordinator_ref: "c1",
      gate_template_id: "deliver_ready_v1",
    },
  });
  const asg = await json(app, "POST", `/v1/goals/${(goal.data as { id: string }).id}/assignments`, {
    token: coord,
    body: { pool_id: "pool_noop", brief: briefOk },
  });
  const run = await json(app, "POST", `/v1/assignments/${(asg.data as { id: string }).id}/dispatch`, {
    token: coord,
    headers: { "Idempotency-Key": "k3" },
    body: { adapter: "noop" },
  });
  await json(app, "POST", `/v1/runs/${(run.data as { id: string }).id}/evidence`, {
    token: coord,
    body: { kind: "summary_md", uri: "file:/tmp/s.md" },
  });
  await json(app, "POST", `/v1/runs/${(run.data as { id: string }).id}/evidence`, {
    token: coord,
    body: { kind: "artifact_uri", uri: "file:/tmp/a.bin" },
  });
  const inbox = await json(app, "GET", "/v1/gates?status=ready", { token: dm });
  assert.equal(inbox.status, 200);
  const items = (inbox.data as { items: { id: string; version: number }[] }).items;
  assert.ok(items.length >= 1);
  const gate = items[0];
  const first = await json(app, "POST", `/v1/gates/${gate.id}/decide`, {
    token: dm,
    body: { decision: "pass", version: gate.version },
  });
  assert.equal(first.status, 200);
  const second = await json(app, "POST", `/v1/gates/${gate.id}/decide`, {
    token: dm,
    body: { decision: "revise", version: gate.version },
  });
  assert.equal(second.status, 409);
  assert.equal((second.data as { code: string }).code, "optimistic_lock");
});

test("policy_check_includes_track", async () => {
  const { app } = testApp();
  const coord = await token("coordinator");
  const advisory = await json(app, "POST", "/v1/policy/check", {
    token: coord,
    body: { action: "change_path" },
  });
  assert.equal(advisory.status, 200);
  assert.equal((advisory.data as { track: string }).track, "advisory_hint");
  assert.equal((advisory.data as { dispatch_blocked: boolean }).dispatch_blocked, false);
  assert.equal((advisory.data as { gate_created: boolean }).gate_created, false);
  const auth = await json(app, "POST", "/v1/policy/check", {
    token: coord,
    body: { action: "external_send" },
  });
  assert.equal((auth.data as { track: string }).track, "authority_gate");
});

test("webhook_hmac_and_skew", async () => {
  const { app } = testApp();
  const body = "{\"ok\":true}";
  const ts = String(Math.floor(Date.now() / 1000));
  const bad = await json(app, "POST", "/v1/hooks/github", {
    body: { ok: true },
    headers: {
      "X-Harness-Signature": "sha256=deadbeef",
      "X-Harness-Timestamp": ts,
    },
  });
  assert.equal(bad.status, 401);
  assert.equal((bad.data as { code: string }).code, "webhook_bad_signature");

  const skew = await json(app, "POST", "/v1/hooks/cursor", {
    body: { ok: true },
    headers: {
      "X-Harness-Signature": signWebhook(WEBHOOK_SECRET, "1", body),
      "X-Harness-Timestamp": "1",
    },
  });
  assert.equal(skew.status, 401);
  assert.equal((skew.data as { code: string }).code, "webhook_skew");

  const okBody = JSON.stringify({ ok: true, checks_conclusion: "success" });
  const ok = await json(app, "POST", "/v1/hooks/github", {
    body: okBody,
    headers: {
      "X-Harness-Signature": signWebhook(WEBHOOK_SECRET, ts, okBody),
      "X-Harness-Timestamp": ts,
    },
  });
  assert.equal(ok.status, 202);
});

test("secret_ref_only_file_or_env", () => {
  assert.equal(assertSecretRef("file:/run/secrets/k"), "file:/run/secrets/k");
  assert.equal(assertSecretRef("env:CURSOR_KEY"), "env:CURSOR_KEY");
  assert.throws(() => assertSecretRef("sops:foo"), (e: { code?: string; status?: number }) => {
    return e.status === 400 && (e as { message: string }).message === "secret_ref_unsupported";
  });
});

test("pool_forbidden_cross_pool", async () => {
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

test("human_fill_forbidden_without_exception", async () => {
  const { app } = testApp();
  const coord = await token("coordinator");
  const dm = await token("decision_maker");
  const goal = await json(app, "POST", "/v1/goals", {
    token: coord,
    body: { title: "g", mode: "explore", coordinator_ref: "c1", dispatch_policy: "coordinator_only" },
  });
  const res = await json(app, "POST", `/v1/goals/${(goal.data as { id: string }).id}/assignments`, {
    token: dm,
    body: { pool_id: "pool_noop", brief: briefOk },
  });
  assert.equal(res.status, 403);
});

test("explore_null_template_zero_gatedef_http", async () => {
  const { app } = testApp();
  const coord = await token("coordinator");
  const goal = await json(app, "POST", "/v1/goals", {
    token: coord,
    body: { title: "g", mode: "explore", coordinator_ref: "c1", gate_template_id: null },
  });
  assert.equal(goal.status, 201);
  assert.equal(((goal.data as { gate_defs: unknown[] }).gate_defs ?? []).length, 0);
});

test("database_url_file_prefix", () => {
  assert.equal(parseDatabasePath("file:/data/harness.m0.db"), "/data/harness.m0.db");
  assert.equal(parseDatabasePath(":memory:"), ":memory:");
});
