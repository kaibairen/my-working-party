import { afterEach, describe, expect, it } from "vitest";
import { closeHarness, createHarness, type Harness } from "./db";
import { createGoal, dispatchAssignment, fillAssignment } from "./services";
import { FAKE_SEED_DESK_NAMES, HEARTBEAT_TTL_SECONDS, listDesks, recordHeartbeat } from "./desks";
import type { Actor } from "./rbac";

const dm: Actor = { id: "you", role: "decision_maker" };
const coord: Actor = { id: "coord-1", role: "coordinator" };

describe("listDesks presence projection", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  it("desks_no_pool_seed_fake_names", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const { desks, readonly, hitl, stub, heartbeat_ttl_seconds } = listDesks(harness, dm);
    expect(readonly).toBe(true);
    expect(hitl).toBe("待我拍板");
    expect(stub).toBe(true);
    expect(heartbeat_ttl_seconds).toBe(HEARTBEAT_TTL_SECONDS);
    expect(desks).toEqual([]);
    expect(desks.map((d) => d.name)).not.toEqual(expect.arrayContaining([...FAKE_SEED_DESK_NAMES]));
    for (const name of FAKE_SEED_DESK_NAMES) {
      expect(desks.some((d) => d.name === name)).toBe(false);
    }
    expect(desks.every((d) => d.source === "heartbeat" && d.last_heartbeat)).toBe(true);
  });

  it("projects default pools as idle colleagues", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const { desks, readonly, hitl } = listDesks(harness, dm);
    expect(readonly).toBe(true);
    expect(hitl).toBe("待我拍板");
    expect(desks).toEqual([]);
    expect(listDesks(harness, dm).stub).toBe(true);
    expect(listDesks(harness, dm).heartbeat_ttl_seconds).toBe(HEARTBEAT_TTL_SECONDS);
  });

  it("desks_list_requires_fresh_heartbeat", () => {
    let nowMs = Date.parse("2026-09-19T05:00:00.000Z");
    harness = createHarness({ databasePath: ":memory:", now: () => new Date(nowMs).toISOString() });
    const empty = listDesks(harness, dm);
    expect(empty.stub).toBe(true);
    expect(empty.desks).toEqual([]);
    const bot: Actor = { id: "bot-1", role: "executor" };
    recordHeartbeat(harness, bot, { display_name: "交付同事", pool_id: "pool_noop", ttl_seconds: 90 });
    const live = listDesks(harness, dm);
    expect(live.stub).toBe(false);
    const noop = live.desks.find((d) => d.id === "pool_noop");
    expect(noop?.source).toBe("heartbeat");
    expect(noop?.name).toBe("交付同事");
    expect(noop?.last_heartbeat).toBe("2026-09-19T05:00:00.000Z");
    nowMs += 91_000;
    const expired = listDesks(harness, dm);
    expect(expired.stub).toBe(true);
    expect(expired.desks.find((d) => d.id === "pool_noop")).toBeUndefined();
    expect(expired.desks.some((d) => d.name === "交付同事" || d.source === "pool_seed")).toBe(false);
  });

  it("does not project assignment presence without a live heartbeat", () => {
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
    const listed = listDesks(harness, dm);
    expect(listed.desks.find((d) => d.id === "pool_cursor")).toBeUndefined();
    expect(listed.desks.some((d) => d.name === "Cursor 同事")).toBe(false);
  });

  it("marks an accepted assignment as 在忙, not a dispatch UI", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const bot: Actor = { id: "cursor-bot", role: "executor" };
    recordHeartbeat(harness, bot, { display_name: "Cursor 工位", pool_id: "pool_cursor" });
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
    expect(cursor?.source).toBe("heartbeat");
    expect(cursor?.name).toBe("Cursor 工位");
    expect(listDesks(harness, dm).desks.find((d) => d.id === "pool_noop")).toBeUndefined();
  });

  it("marks a pending deliver gate as 等证据", async () => {
    harness = createHarness({ databasePath: ":memory:" });
    const bot: Actor = { id: "noop-bot", role: "executor" };
    recordHeartbeat(harness, bot, { display_name: "交付工位", pool_id: "pool_noop" });
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
    expect(noop?.source).toBe("heartbeat");
  });
});
