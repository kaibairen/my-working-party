import { describe, expect, it } from "vitest";
import { buildCursorLaunchPayload, createCursorAdapter } from "./index";

describe("cursor adapter", () => {
  it("uses fixture mode and dual external ids when no API key", async () => {
    const adapter = createCursorAdapter({ apiKey: "" });
    expect(adapter.mode).toBe("fixture");
    const result = await adapter.dispatch({ runId: "r1", assignmentId: "a1" });
    expect(result.external_agent_id).toBe("cursor-fixture-agent:a1");
    expect(result.external_run_id).toBe("cursor-fixture-run:r1");
    expect(result.external_agent_id).not.toBe(result.external_run_id);
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
    expect(adapter.launches[0].payload.source.repository).toMatch(/^https:\/\//);
    expect(adapter.launches[0].payload.repos[0].url).toBe(adapter.launches[0].payload.source.repository);
  });

  it("IDLE lifecycle is not FINISHED", async () => {
    const adapter = createCursorAdapter({ apiKey: "", lifecycle: "IDLE" });
    const result = await adapter.dispatch({ runId: "r1", assignmentId: "a1" });
    expect(result.status).toBe("dispatched");
    expect(result.usage_json.cursor_lifecycle).toBe("IDLE");
    expect(result.usage_json.noop_or_offline_contract).toBe(false);
  });

  it("live launch payload includes repository (v1 repos[] + source.repository)", async () => {
    let posted: { url: string; body: Record<string, unknown> } | undefined;
    const repository = "https://github.com/kaibairen/my-working-party";
    const adapter = createCursorAdapter({
      apiKey: "test-key",
      baseUrl: "https://cursor.example",
      repository,
      startingRef: "main",
      fetchImpl: (async (url, init) => {
        posted = { url: String(url), body: JSON.parse(String(init?.body ?? "{}")) };
        expect(init?.headers).toMatchObject({ authorization: "Bearer test-key" });
        return new Response(
          JSON.stringify({
            agent: { id: "bc-agent-1", latestRunId: "run-9" },
            run: { id: "run-9", agentId: "bc-agent-1", status: "CREATING" },
          }),
          { status: 200 },
        );
      }) as typeof fetch,
    });
    expect(adapter.mode).toBe("live");
    const result = await adapter.dispatch({ runId: "r1", assignmentId: "a1", idempotencyKey: "k" });
    expect(posted?.url).toBe("https://cursor.example/v1/agents");
    expect(posted?.body).toMatchObject({
      source: { repository, ref: "main" },
      repos: [{ url: repository, startingRef: "main" }],
    });
    expect((posted?.body.source as { repository?: string })?.repository).toBeTruthy();
    expect(result.external_agent_id).toBe("bc-agent-1");
    expect(result.external_run_id).toBe("run-9");
    expect(result.external_agent_id).not.toBe(result.external_run_id);
    expect(result.status).toBe("dispatched");
    expect(result.usage_json.cursor_lifecycle).toBe("DISPATCHED");
    expect(adapter.launches[0].payload.source.repository).toBe(repository);
    expect(adapter.launches[0].payload.repos[0].url).toBe(repository);
  });

  it("buildCursorLaunchPayload always sets repository", () => {
    const payload = buildCursorLaunchPayload({
      assignmentId: "a1",
      repository: "https://github.com/acme/repo",
    });
    expect(payload.source.repository).toBe("https://github.com/acme/repo");
    expect(payload.repos[0].url).toBe("https://github.com/acme/repo");
  });

  it("poll maps GET run status to cursor_lifecycle", async () => {
    const adapter = createCursorAdapter({
      apiKey: "test-key",
      baseUrl: "https://cursor.example",
      fetchImpl: (async (url) => {
        expect(String(url)).toBe("https://cursor.example/v1/agents/bc-agent-1/runs/run-9");
        return new Response(JSON.stringify({ id: "run-9", agentId: "bc-agent-1", status: "FINISHED" }), {
          status: 200,
        });
      }) as typeof fetch,
    });
    const snap = await adapter.poll("bc-agent-1", "run-9");
    expect(snap.status).toBe("FINISHED");
    expect(snap.cursor_lifecycle).toBe("FINISHED");
  });
});
