import { afterEach, describe, expect, it } from "vitest";
import { closeHarness, createHarness, type Harness } from "./db";
import { createGoal, dispatchAssignment, fillAssignment } from "./services";
import { HEARTBEAT_TTL_SECONDS, listDesks, recordHeartbeat } from "./desks";
import type { Actor } from "./rbac";

const dm: Actor = { id: "you", role: "decision_maker" };
const coord: Actor = { id: "coord-1", role: "coordinator" };

describe("listDesks presence projection", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  it("projects default pools as idle colleagues", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const { desks, readonly, hitl } = listDesks(harness, dm);
    expect(readonly).toBe(true);
    expect(hitl).toBe("待我拍板");
    expect(desks.map((d) => d.name).sort()).toEqual(["Cursor 同事", "交付同事"]);
    expect(desks.every((d) => d.status === "空闲")).toBe(true);
    expect(desks.every((d) => d.presence === "idle")).toBe(true);
    expect(desks.find((d) => d.name === "交付同事")?.avatar).toBe("交");
    expect(listDesks(harness, dm).stub).toBe(true);
    expect(listDesks(harness, dm).heartbeat_ttl_seconds).toBe(HEARTBEAT_TTL_SECONDS);
    expect(desks.every((d) => d.last_heartbeat === null && d.source === "pool_seed")).toBe(true);
  });

  it("overlays a live heartbeat and drops it after TTL", () => {
    let nowMs = Date.parse("2026-09-19T05:00:00.000Z");
    harness = createHarness({ databasePath: ":memory:", now: () => new Date(nowMs).toISOString() });
    const bot: Actor = { id: "bot-1", role: "executor" };
    recordHeartbeat(harness, bot, { display_name: "交付同事", pool_id: "pool_noop", ttl_seconds: 90 });
    const live = listDesks(harness, dm);
    expect(live.stub).toBe(false);
    const noop = live.desks.find((d) => d.id === "pool_noop");
    expect(noop?.source).toBe("heartbeat");
    expect(noop?.last_heartbeat).toBe("2026-09-19T05:00:00.000Z");
    nowMs += 91_000;
    const expired = listDesks(harness, dm);
    expect(expired.stub).toBe(true);
    expect(expired.desks.find((d) => d.id === "pool_noop")?.source).toBe("pool_seed");
    expect(expired.desks.find((d) => d.id === "pool_noop")?.last_heartbeat).toBeNull();
  });

  it("marks an accepted assignment as 在忙, not a dispatch UI", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const goal = createGoal(harness, coord, {
      title: "周报交付验收",
      mode: "deliver",
      coordinator_ref: "coord-1",
    });
    fillAssignment(harness, coord, goal.id, {
      pool_id: "pool_cursor",
      brief: { outcome: "busy desk", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
    });
    const cursor = listDesks(harness, dm).desks.find((d) => d.id === "pool_cursor");
    expect(cursor?.status).toBe("在忙");
    expect(cursor?.presence).toBe("busy");
    const noop = listDesks(harness, dm).desks.find((d) => d.id === "pool_noop");
    expect(noop?.status).toBe("空闲");
  });

  it("marks a pending deliver gate as 等证据", async () => {
    harness = createHarness({ databasePath: ":memory:" });
    const goal = createGoal(harness, coord, {
      title: "周报交付验收",
      mode: "deliver",
      coordinator_ref: "coord-1",
    });
    const asg = fillAssignment(harness, coord, goal.id, {
      pool_id: "pool_noop",
      brief: { outcome: "waiting", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
    });
    await dispatchAssignment(harness, coord, asg.id, "desk-pending");
    const noop = listDesks(harness, dm).desks.find((d) => d.id === "pool_noop");
    expect(noop?.status).toBe("等证据");
    expect(noop?.presence).toBe("waiting_evidence");
  });
});
