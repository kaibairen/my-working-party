import { describe, expect, it } from "vitest";
import { closeHarness, createHarness, createGoal, policyCheck, publishOutbox } from "./index";

describe("M3 webhook outbox", () => {
  it("POSTs gate.ready to WEBHOOK_URL and marks published", async () => {
    const calls: { url: string; body: any }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    const h = createHarness({ databasePath: ":memory:", webhookUrl: "http://hooks.test/inbox" });
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
    } finally {
      globalThis.fetch = original;
      closeHarness(h);
    }
  });
});
