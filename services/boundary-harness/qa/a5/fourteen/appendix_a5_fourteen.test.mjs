/**
 * QA merge gate: 14 named anti cases (A5×10 + 追加×4).
 * Domain-layer until HTTP exists; names MUST match matrix exactly.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createStore,
  createGoal,
  fillAssignment,
  dispatch,
  applyPolicy,
  tryReadyFromChatDone,
  tryReadyFromRunSucceeded,
  noAutoDowngrade,
  evalReadySnapshotsOnly,
  parseBriefOrThrow,
  evalDeliverReadyV1,
  policyCheck,
} from "../../../../packages/domain/dist/m0_anti_harness.js";

const briefOk = {
  outcome: "x",
  constraints: [],
  evidence_shape: ["summary_md"],
};

test("reject_brief_with_steps_422", () => {
  assert.throws(
    () => parseBriefOrThrow({ ...briefOk, steps: ["do a", "do b"] }),
    (e) => e.message === "brief_forbidden_field" && e.status === 422,
  );
});

test("advisory_hint_never_creates_gate", () => {
  const store = createStore();
  const r = applyPolicy(store, "change_path");
  assert.equal(r.policy.track, "advisory_hint");
  assert.equal(r.gateCreated, false);
  assert.equal(r.dispatchBlocked, false);
  assert.equal(store.gateInstances.size, 0);
});

test("chat_done_never_ready", () => {
  const r = tryReadyFromChatDone();
  assert.equal(r.status, "pending");
});

test("run_succeeded_alone_never_ready", () => {
  const r = tryReadyFromRunSucceeded({ status: "succeeded" });
  assert.equal(r.status, "pending");
  const ready = evalDeliverReadyV1({ evidence: [], runSucceeded: true });
  assert.equal(ready.ok, false);
});

test("explore_null_template_zero_gatedef", () => {
  const store = createStore();
  const g = createGoal(store, {
    mode: "explore",
    gate_template_id: null,
    coordinator_ref: "c1",
  });
  assert.equal(g.gateDefs.length, 0);
});

test("explore_must_not_default_deliver_ready", () => {
  const store = createStore();
  assert.throws(
    () =>
      createGoal(store, {
        mode: "explore",
        gateTemplate: "deliver_ready_v1",
        coordinator_ref: "c1",
      }),
    (e) => e.status === 422,
  );
});

test("deliver_requires_summary_md", () => {
  const r = evalDeliverReadyV1({
    evidence: [{ kind: "artifact_uri" }],
    noopContractOk: true,
  });
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes("evidence:summary_md"));
});

test("noop_path_needs_artifact_and_contract", () => {
  assert.equal(
    evalDeliverReadyV1({ evidence: [{ kind: "summary_md" }], noopContractOk: true }).ok,
    false,
  );
  assert.equal(
    evalDeliverReadyV1({
      evidence: [{ kind: "summary_md" }, { kind: "artifact_uri" }],
      noopContractOk: true,
    }).ok,
    true,
  );
});

test("canvas_not_required_for_dispatch", () => {
  const store = createStore();
  createGoal(store, { id: "g1", mode: "explore", gate_template_id: null, coordinator_ref: "c" });
  const a = fillAssignment(store, "g1", briefOk);
  const run = dispatch(store, a.id, { role: "coordinator", canvasSession: null });
  assert.ok(run.id);
});

test("human_dispatch_forbidden_without_exception", () => {
  const store = createStore();
  createGoal(store, {
    id: "g1",
    mode: "explore",
    gate_template_id: null,
    coordinator_ref: "c",
    dispatch_policy: "coordinator_only",
  });
  assert.throws(
    () => fillAssignment(store, "g1", briefOk, "decision_maker"),
    (e) => e.status === 403,
  );
});

test("assignment_success_ne_gate_pass", () => {
  // Run/Assignment green must not imply Gate ready/pass
  const ready = evalDeliverReadyV1({ evidence: [], runSucceeded: true });
  assert.equal(ready.ok, false);
});

test("no_auto_downgrade_deliver_to_explore", () => {
  const goal = { mode: "deliver" };
  assert.equal(noAutoDowngrade(goal), true);
  // failing ready must not mutate mode
  evalDeliverReadyV1({ evidence: [] });
  assert.equal(goal.mode, "deliver");
});

test("dial_path_change_not_human", () => {
  const r = policyCheck("change_path");
  assert.equal(r.track, "advisory_hint");
  assert.notEqual(r.decision, "require_gate");
  assert.equal(policyCheck("create_workspace_file").track, "advisory_hint");
  assert.equal(policyCheck("propose_assignment").track, "advisory_hint");
});

test("ready_eval_uses_github_snapshots_only", () => {
  assert.throws(() =>
    evalReadySnapshotsOnly({
      evidence: [{ kind: "summary_md" }],
      fetchGitHub: true,
    }),
  );
  const r = evalReadySnapshotsOnly({
    evidence: [{ kind: "summary_md" }],
    github_snapshot: { is_draft: false, checks_conclusion: "success" },
  });
  assert.equal(r.ok, true);
});
