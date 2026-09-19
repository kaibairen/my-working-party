import { afterEach, describe, expect, it } from "vitest";
import { createCursorAdapter } from "@harness/adapters-cursor";
import { closeHarness, createHarness, type Harness } from "./db";
import {
  attachEvidence,
  createGoal,
  dispatchAssignment,
  fillAssignment,
  listGateInstances,
  syncCursorAgentRuns,
} from "./services";
import type { Actor } from "./rbac";

const coord: Actor = { id: "coord-1", role: "coordinator" };
const exec: Actor = { id: "exec-1", role: "executor" };
const dm: Actor = { id: "you", role: "decision_maker" };

describe("syncCursorAgentRuns", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  it("live-mocked FINISHED writes cursor_lifecycle and makes Gate ready without SQLite edits", async () => {
    const repository = "https://github.com/kaibairen/my-working-party";
    let remoteStatus = "CREATING";
    const posts: Array<Record<string, unknown>> = [];
    const adapter = createCursorAdapter({
      apiKey: "live-key",
      repository,
      startingRef: "main",
      fetchImpl: (async (url, init) => {
        const href = String(url);
        if ((init?.method ?? "GET") === "POST" && href.endsWith("/v1/agents")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
          posts.push(body);
          return new Response(
            JSON.stringify({
              agent: { id: "bc-sync", latestRunId: "run-sync" },
              run: { id: "run-sync", agentId: "bc-sync", status: "CREATING" },
            }),
            { status: 200 },
          );
        }
        if (href.includes("/v1/agents/bc-sync/runs/run-sync")) {
          return new Response(JSON.stringify({ id: "run-sync", agentId: "bc-sync", status: remoteStatus }), {
            status: 200,
          });
        }
        throw new Error(`unexpected ${href}`);
      }) as typeof fetch,
    });
    harness = createHarness({ databasePath: ":memory:", adapters: { cursor: adapter } });

    const goal = createGoal(harness, coord, {
      title: "周报交付验收",
      mode: "deliver",
      coordinator_ref: "coord-1",
    });
    const asg = fillAssignment(harness, coord, goal.id, {
      pool_id: "pool_cursor",
      brief: { outcome: "sync", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
    });
    const run = await dispatchAssignment(harness, coord, asg.id, "sync-1");
    expect(posts[0]?.source).toEqual({ repository, ref: "main" });
    expect(posts[0]?.repos).toEqual([{ url: repository, startingRef: "main" }]);
    expect(run.external_agent_id).toBe("bc-sync");
    expect(run.external_run_id).toBe("run-sync");
    expect(run.external_agent_id).not.toBe(run.external_run_id);
    expect(run.status).toBe("dispatched");

    attachEvidence(harness, exec, run.id, [
      { kind: "summary_md", uri: "file://s.md" },
      { kind: "artifact_uri", uri: "file://a.tgz" },
    ]);
    expect(listGateInstances(harness, dm, { status: "ready", goal_id: goal.id })).toEqual([]);

    expect(await syncCursorAgentRuns(harness)).toBe(0);
    remoteStatus = "FINISHED";
    expect(await syncCursorAgentRuns(harness)).toBe(1);

    const stored = harness.db.select().from((await import("./schema")).runs).all()
      .find((r) => r.id === run.id);
    const usage = JSON.parse(stored?.usageJson ?? "{}") as { cursor_lifecycle?: string };
    expect(usage.cursor_lifecycle).toBe("FINISHED");
    expect(stored?.status).toBe("succeeded");
    expect(listGateInstances(harness, dm, { status: "ready", goal_id: goal.id })).toHaveLength(1);
  });
});
