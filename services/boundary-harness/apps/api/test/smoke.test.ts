import assert from "node:assert/strict";
import { test } from "node:test";
import { exploreReadyPath, json, testApp, token } from "./helpers.js";

test("smoke_explore_goal_assignment_noop_evidence_ready_stub", async () => {
  const { app } = testApp();
  const coord = await token("coordinator", ["pool_noop"], "coord-1");
  const path = await exploreReadyPath(app, coord);
  assert.equal(path.goal.status, 201);
  assert.equal(path.assignment.status, 201);
  assert.equal(path.run.status, 201);
  assert.equal((path.run.data as { adapter: string }).adapter, "noop");
  assert.equal((path.run.data as { status: string }).status, "succeeded");
  assert.equal(path.ev1.status, 201);
  assert.equal(path.ev2.status, 201);
  assert.equal(path.ready.status, 200);
  const ready = path.ready.data as { ok: boolean; stub: boolean; missing: string[] };
  assert.equal(ready.stub, true);
  assert.equal(ready.ok, true);
  const inbox = await json(app, "GET", "/v1/gates?status=ready", { token: coord });
  assert.equal(((inbox.data as { items: unknown[] }).items ?? []).length, 0);
});
