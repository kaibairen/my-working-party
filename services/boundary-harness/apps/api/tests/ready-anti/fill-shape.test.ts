import { afterEach, describe, expect, it } from "vitest";
import { closeHarness, createHarness, type Harness } from "@harness/domain";
import { createApp } from "../../src/app";

const headers = (role: string, actor = role) => ({
  "content-type": "application/json",
  "x-harness-role": role,
  "x-harness-actor": actor,
  "x-harness-entry": "mcp",
});

async function json(app: ReturnType<typeof createApp>, path: string, init?: RequestInit) {
  const res = await app.request(path, init);
  return { res, body: await res.json() };
}

describe("fill evidence_shape vs GateDef predicate kinds", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  function setup() {
    harness = createHarness({ databasePath: ":memory:" });
    return { harness, app: createApp(harness) };
  }

  it("fill_shape_missing_kinds_422", async () => {
    const { app } = setup();
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "ship", mode: "deliver", coordinator_ref: "c1" }),
    });
    const { res, body } = await json(app, `/v1/goals/${(goal.body as { id: string }).id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "x", constraints: [], evidence_shape: ["artifact_uri"] },
      }),
    });
    expect(res.status).toBe(422);
    expect((body as { code: string }).code).toBe("predicate_evidence_mismatch");
    expect((body as { error: { code: string } }).error.code).toBe("predicate_evidence_mismatch");
    const missing = (body as { missing_kinds: string[] }).missing_kinds;
    expect(Array.isArray(missing)).toBe(true);
    expect(missing).toEqual(["summary_md"]);
    expect(missing.length).toBeGreaterThan(0);
    expect((body as { required_kinds: string[] }).required_kinds).toEqual(["summary_md"]);
    expect((body as { evidence_shape: string[] }).evidence_shape).toEqual(["artifact_uri"]);
    expect((body as { message: string }).message).toMatch(/summary_md/);
    expect((body as { message: string }).message).not.toMatch(/⊆/);
  });

  it("fill_shape_superset_ok", async () => {
    const { app } = setup();
    const goal = await json(app, "/v1/goals", {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({ title: "ship", mode: "deliver", coordinator_ref: "c1" }),
    });
    const { res, body } = await json(app, `/v1/goals/${(goal.body as { id: string }).id}/assignments`, {
      method: "POST",
      headers: headers("coordinator", "c1"),
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "x", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
      }),
    });
    expect(res.status).toBe(201);
    expect((body as { id: string }).id).toBeTruthy();
    expect((body as { brief: { evidence_shape: string[] } }).brief.evidence_shape).toEqual([
      "summary_md",
      "artifact_uri",
    ]);
  });
});
