import { describe, expect, it } from "vitest";
import { closeHarness, createHarness, createGoal, policyCheck, publishOutbox } from "./index";

describe("M3 webhook outbox", () => {
  it("POSTs gate.ready to WEBHOOK_URL with HMAC and marks published", async () => {
    const calls: { url: string; body: any; headers: Record<string, string> }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url, init) => {
      calls.push({
        url: String(url),
        body: JSON.parse(String(init?.body ?? "{}")),
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    const h = createHarness({
      databasePath: ":memory:",
      webhookUrl: "http://hooks.test/inbox",
      webhookSecret: "hook-test-secret",
    });
    try {
      const goal = createGoal(h, { id: "c1", role: "coordinator" }, {
        title: "e",
        mode: "explore",
        coordinator_ref: "c1",
        gate_template_id: "safety_only_v1",
      });
      policyCheck(h, { id: "e1", role: "executor" }, {
        action: "destructive_delete",
        track: "authority_gate",
        goal_id: goal.id,
      });
      const n = await publishOutbox(h);
      expect(n).toBe(1);
      expect(calls[0].url).toBe("http://hooks.test/inbox");
      expect(calls[0].body.type).toBe("gate.ready");
      expect(calls[0].headers["x-harness-signature"]).toMatch(/^sha256=[0-9a-f]+$/);
      expect(calls[0].headers["x-harness-timestamp"]).toMatch(/^\d+$/);
    } finally {
      globalThis.fetch = original;
      closeHarness(h);
    }
  });
});
