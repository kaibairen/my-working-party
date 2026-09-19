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
      url: "https://cursor.example/v1/agents",
      assignmentId: "a1",
      runId: "r1",
      idempotencyKey: "k1",
      lifecycle: "FINISHED",
      mode: "stub",
    });
    expect(adapter.launches[0].body).toMatchObject({
      source: { repository: expect.any(String), ref: expect.any(String) },
      repos: [expect.objectContaining({ url: expect.any(String) })],
    });
  });

  it("IDLE lifecycle is not FINISHED", async () => {
    const adapter = createCursorAdapter({ apiKey: "", lifecycle: "IDLE" });
    const result = await adapter.dispatch({ runId: "r1", assignmentId: "a1" });
    expect(result.status).toBe("dispatched");
    expect(result.usage_json.cursor_lifecycle).toBe("IDLE");
    expect(result.usage_json.noop_or_offline_contract).toBe(false);
  });

  it("live mode posts v1 with source.repository and maps DISTINCT dual ids", async () => {
    let posted: unknown;
    const adapter = createCursorAdapter({
      apiKey: "test-key",
      baseUrl: "https://cursor.example",
      repository: "https://github.com/kaibairen/my-working-party",
      ref: "main",
      fetchImpl: (async (url, init) => {
        expect(String(url)).toContain("/v1/agents");
        expect(init?.headers).toMatchObject({ authorization: "Bearer test-key" });
        posted = JSON.parse(String(init?.body ?? "{}"));
        return new Response(
          JSON.stringify({
            agent: { id: "bc-agent-1", status: "ACTIVE" },
            run: { id: "run-9", status: "RUNNING" },
          }),
          { status: 201 },
        );
      }) as typeof fetch,
    });
    expect(adapter.mode).toBe("live");
    const result = await adapter.dispatch({ runId: "r1", assignmentId: "a1", idempotencyKey: "k" });
    expect(posted).toMatchObject({
      source: { repository: "https://github.com/kaibairen/my-working-party", ref: "main" },
      repos: [{ url: "https://github.com/kaibairen/my-working-party", startingRef: "main" }],
    });
    expect(result.external_agent_id).toBe("bc-agent-1");
    expect(result.external_run_id).toBe("run-9");
    expect(result.external_agent_id).not.toBe(result.external_run_id);
    expect(result.status).toBe("dispatched");
  });

  it("poll maps FINISHED from v1 run status", async () => {
    const adapter = createCursorAdapter({
      apiKey: "test-key",
      baseUrl: "https://cursor.example",
      fetchImpl: (async () =>
        new Response(JSON.stringify({ id: "run-9", status: "FINISHED", agentId: "bc-agent-1" }), {
          status: 200,
        })) as typeof fetch,
    });
    const p = await adapter.poll({ external_agent_id: "bc-agent-1", external_run_id: "run-9" });
    expect(p.finished).toBe(true);
    expect(p.lifecycle).toBe("FINISHED");
  });
});
