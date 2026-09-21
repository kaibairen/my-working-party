import { describe, expect, it } from "vitest";
import {
  attachEvidence,
  closeHarness,
  createHarness,
  createGoal,
  dispatchAssignment,
  fillAssignment,
  listOutbox,
  policyCheck,
  publishOutbox,
} from "./index";

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
      expect(n).toBeGreaterThanOrEqual(1);
      expect(calls[0].url).toBe("http://hooks.test/inbox");
      expect(calls.some((c) => c.body.type === "gate.ready")).toBe(true);
      expect(calls[0].headers["x-harness-signature"]).toMatch(/^sha256=[0-9a-f]+$/);
      expect(calls[0].headers["x-harness-timestamp"]).toMatch(/^\d+$/);
    } finally {
      globalThis.fetch = original;
      closeHarness(h);
    }
  });

  it("outbound_publisher_posts_domain_events", async () => {
    const calls: { url: string; body: any }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    const h = createHarness({
      databasePath: ":memory:",
      webhookUrl: "http://127.0.0.1:8787/hooks/domain-events",
    });
    const coord = { id: "c1", role: "coordinator" as const };
    try {
      const goal = createGoal(h, coord, {
        title: "出站唤醒",
        mode: "deliver",
        coordinator_ref: "c1",
        gate_template_id: "deliver_ready_v1",
      });
      const asg = fillAssignment(h, coord, goal.id, {
        pool_id: "pool_noop",
        assignee_bot_id: "bot-bound",
        brief: { outcome: "wake", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
      });
      const statusRows = listOutbox(h).filter((r) => r.type === "goal.status_changed");
      expect(statusRows.length).toBeGreaterThan(0);
      expect(statusRows[0].payload.assignee_bot_id).toBe("bot-bound");

      const run = await dispatchAssignment(h, coord, asg.id, "p0d-wake");
      attachEvidence(h, { id: "e1", role: "executor" }, run.id, [
        { kind: "summary_md", uri: "file://s.md" },
        { kind: "artifact_uri", uri: "file://a.tgz" },
      ]);
      const n = await publishOutbox(h);
      expect(n).toBeGreaterThan(0);
      expect(calls.every((c) => c.url === "http://127.0.0.1:8787/hooks/domain-events")).toBe(true);
      expect(calls.every((c) => c.body.id && c.body.type && c.body.created_at && c.body.payload)).toBe(true);
      const status = calls.find((c) => c.body.type === "goal.status_changed");
      const ready = calls.find((c) => c.body.type === "gate.ready");
      expect(status?.body.payload.assignee_bot_id).toBe("bot-bound");
      expect(ready?.body.payload.assignee_bot_id).toBe("bot-bound");
      expect(status?.body.payload.status_line).toBeDefined();
    } finally {
      globalThis.fetch = original;
      closeHarness(h);
    }
  });

  it("writes human outbox without assignee_bot_id so Bridge can skip wake", async () => {
    const h = createHarness({ databasePath: ":memory:" });
    try {
      const goal = createGoal(h, { id: "c1", role: "coordinator" }, {
        title: "人填无绑定",
        mode: "deliver",
        coordinator_ref: "c1",
        dispatch_policy: "human_allowed",
      });
      fillAssignment(h, { id: "you", role: "decision_maker" }, goal.id, {
        pool_id: "pool_noop",
        brief: { outcome: "我来填", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
      });
      const rows = listOutbox(h).filter((r) => r.type === "goal.status_changed");
      expect(rows).toHaveLength(1);
      expect(rows[0].payload.assignee_bot_id).toBeUndefined();
      expect(rows[0].status).toBe("pending");
    } finally {
      closeHarness(h);
    }
  });
});
