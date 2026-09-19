import { afterEach, describe, expect, it } from "vitest";
import { createCursorAdapter } from "@harness/adapters-cursor";
import { closeHarness, createHarness, syncCursorAgentRuns, type Harness } from "./index";
import { createApp } from "../../../apps/api/src/app";

const headers = (role: string, actor = role) => ({
  "content-type": "application/json",
  "x-harness-role": role,
  "x-harness-actor": actor,
});

async function json(app: ReturnType<typeof createApp>, path: string, init?: RequestInit) {
  const res = await app.request(path, init);
  const body = await res.json();
  return { res, body };
}

describe("syncCursorAgentRuns", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  it("poll FINISHED → Domain marks lifecycle → Ready without hand-editing DB", async () => {
    let polls = 0;
    const cursor = createCursorAdapter({
      apiKey: "k",
      fetchImpl: (async (_url, init) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              agent: { id: "bc-agent-live" },
              run: { id: "run-live-9", status: "RUNNING" },
            }),
            { status: 201 },
          );
        }
        polls += 1;
        return new Response(JSON.stringify({ id: "run-live-9", status: "FINISHED" }), { status: 200 });
      }) as typeof fetch,
    });
    harness = createHarness({ databasePath: ":memory:", adapters: { cursor } });
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
      body: JSON.stringify({ idempotency_key: "poll-dual" }),
    });
    expect(run.res.status).toBe(201);
    expect(run.body.external_agent_id).toBe("bc-agent-live");
    expect(run.body.external_run_id).toBe("run-live-9");
    expect(run.body.status).toBe("dispatched");

    await json(app, `/v1/runs/${run.body.id}/evidence`, {
      method: "POST",
      headers: headers("executor", "e1"),
      body: JSON.stringify({
        items: [
          { kind: "summary_md", uri: "file://s.md" },
          { kind: "artifact_uri", uri: "file://a.bin" },
        ],
      }),
    });

    const before = await json(app, `/v1/gates?status=ready&goal_id=${goal.body.id}`, {
      headers: headers("decision_maker", "dm"),
    });
    expect(before.body.gates ?? before.body.items ?? []).toEqual([]);

    const sync = await syncCursorAgentRuns(harness);
    expect(polls).toBeGreaterThanOrEqual(1);
    expect(sync.polled).toBe(1);
    expect(sync.finished).toBe(1);

    const after = await json(app, `/v1/gates?status=ready&goal_id=${goal.body.id}`, {
      headers: headers("decision_maker", "dm"),
    });
    const gates = after.body.gates ?? after.body.items ?? [];
    expect(gates.length).toBeGreaterThanOrEqual(1);
  });
});
