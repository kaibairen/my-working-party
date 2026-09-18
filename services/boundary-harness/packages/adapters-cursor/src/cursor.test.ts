import { describe, expect, it } from "vitest";
import { createCursorAdapter } from "./index";

describe("cursor adapter", () => {
  it("uses fixture mode and dual external ids when no API key", async () => {
    const adapter = createCursorAdapter({ apiKey: "" });
    expect(adapter.mode).toBe("fixture");
    const result = await adapter.dispatch({ runId: "r1", assignmentId: "a1" });
    expect(result.external_agent_id).toBe("cursor-fixture-agent:a1");
    expect(result.external_run_id).toBe("cursor-fixture-run:r1");
    expect(result.status).toBe("succeeded");
    expect(result.usage_json.cursor_lifecycle).toBe("FINISHED");
  });

  it("stub mode records launch payloads without calling Cursor", async () => {
    const adapter = createCursorAdapter({ apiKey: "", stub: true, baseUrl: "https://cursor.example" });
    expect(adapter.mode).toBe("stub");
    const result = await adapter.dispatch({ runId: "r1", assignmentId: "a1", idempotencyKey: "k1" });
    expect(result.external_agent_id).toBe("cursor-stub-agent:a1");
    expect(result.external_run_id).toBe("cursor-stub-run:r1");
    expect(adapter.launches).toHaveLength(1);
    expect(adapter.launches[0]).toMatchObject({
      url: "https://cursor.example/v0/agents",
      assignmentId: "a1",
      runId: "r1",
      idempotencyKey: "k1",
      lifecycle: "FINISHED",
      mode: "stub",
    });
  });

  it("IDLE lifecycle is not FINISHED", async () => {
    const adapter = createCursorAdapter({ apiKey: "", lifecycle: "IDLE" });
    const result = await adapter.dispatch({ runId: "r1", assignmentId: "a1" });
    expect(result.status).toBe("dispatched");
    expect(result.usage_json.cursor_lifecycle).toBe("IDLE");
    expect(result.usage_json.noop_or_offline_contract).toBe(false);
  });

  it("live mode posts to Cursor and maps both ids", async () => {
    const adapter = createCursorAdapter({
      apiKey: "test-key",
      baseUrl: "https://cursor.example",
      fetchImpl: (async (_url, init) => {
        expect(init?.headers).toMatchObject({ authorization: "Bearer test-key" });
        return new Response(JSON.stringify({ id: "ag_1", run_id: "run_9" }), { status: 200 });
      }) as typeof fetch,
    });
    expect(adapter.mode).toBe("live");
    const result = await adapter.dispatch({ runId: "r1", assignmentId: "a1", idempotencyKey: "k" });
    expect(result.external_agent_id).toBe("ag_1");
    expect(result.external_run_id).toBe("run_9");
    expect(result.status).toBe("dispatched");
    expect(adapter.launches).toHaveLength(1);
  });
});
