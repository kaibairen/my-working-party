import { describe, expect, it } from "vitest";
import { buildCursorLaunchPrompt, createCursorAdapter } from "./index";

const brief = {
  outcome: "ship a working M0",
  constraints: ["no secrets", "no dispatch UI"],
  evidence_shape: ["summary_md", "artifact_uri"],
};

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
    expect(adapter.launches[0].prompt).toContain("Boundary Harness assignment a1");
  });

  it("IDLE lifecycle is not FINISHED", async () => {
    const adapter = createCursorAdapter({ apiKey: "", lifecycle: "IDLE" });
    const result = await adapter.dispatch({ runId: "r1", assignmentId: "a1" });
    expect(result.status).toBe("dispatched");
    expect(result.usage_json.cursor_lifecycle).toBe("IDLE");
    expect(result.usage_json.noop_or_offline_contract).toBe(false);
  });

  it("live mode posts BriefV1 prompt and maps both ids", async () => {
    let posted: { prompt?: { text?: string }; source?: { repository?: string; ref?: string } } = {};
    const adapter = createCursorAdapter({
      apiKey: "test-key",
      baseUrl: "https://cursor.example",
      repository: "https://github.com/kaibairen/my-working-party",
      ref: "cursor/harness-ux-roster-f63b",
      fetchImpl: (async (_url, init) => {
        expect(init?.headers).toMatchObject({ authorization: "Bearer test-key" });
        posted = JSON.parse(String(init?.body ?? "{}")) as typeof posted;
        return new Response(JSON.stringify({ id: "ag_1", run_id: "run_9" }), { status: 200 });
      }) as typeof fetch,
    });
    expect(adapter.mode).toBe("live");
    const result = await adapter.dispatch({
      runId: "r1",
      assignmentId: "a1",
      idempotencyKey: "k",
      brief,
      goal: { id: "g1", title: "M0 path", mode: "deliver" },
    });
    expect(result.external_agent_id).toBe("ag_1");
    expect(result.external_run_id).toBe("run_9");
    expect(result.status).toBe("dispatched");
    expect(adapter.launches).toHaveLength(1);
    expect(posted.prompt?.text).toContain("Outcome: ship a working M0");
    expect(posted.prompt?.text).toContain("no dispatch UI");
    expect(posted.prompt?.text).toContain("Evidence shape: summary_md, artifact_uri");
    expect(posted.prompt?.text).toContain("Goal: M0 path (deliver)");
    expect(posted.prompt?.text).not.toMatch(/^(steps|script|must_path|plan|playbook):/m);
    expect(posted.source).toEqual({
      repository: "https://github.com/kaibairen/my-working-party",
      ref: "cursor/harness-ux-roster-f63b",
    });
  });

  it("buildCursorLaunchPrompt is BriefV1-only", () => {
    const text = buildCursorLaunchPrompt({
      runId: "r1",
      assignmentId: "06e655a7-5ec1-489e-b868-5b120d8c07e7",
      brief,
      goal: { id: "g1", title: "M0 path", mode: "deliver" },
    });
    expect(text).toContain("Boundary Harness assignment 06e655a7-5ec1-489e-b868-5b120d8c07e7");
    expect(text).toContain("Outcome: ship a working M0");
    expect(text).toContain("- no secrets");
    expect(text).not.toMatch(/^(steps|script|must_path|plan|playbook|workflow):/m);
  });
});
