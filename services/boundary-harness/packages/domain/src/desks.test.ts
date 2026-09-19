import { afterEach, describe, expect, it } from "vitest";
import { closeHarness, createHarness, type Harness } from "./db";
import { createGoal, dispatchAssignment, fillAssignment } from "./services";
import { HEARTBEAT_TTL_SECONDS, executionPoolName, listDesks, recordHeartbeat } from "./desks";
import type { Actor } from "./rbac";

const dm: Actor = { id: "you", role: "decision_maker" };
const coord: Actor = { id: "coord-1", role: "coordinator" };
const FAKE_COLLEAGUE = /交付同事|Cursor 同事|群组同事/;

describe("listDesks presence projection", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  it("defaults to an empty roster — seed pools are not Bot colleagues", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const { desks, readonly, hitl, stub, include_pools } = listDesks(harness, dm);
    expect(readonly).toBe(true);
    expect(hitl).toBe("待我拍板");
    expect(stub).toBe(true);
    expect(include_pools).toBe(false);
    expect(desks).toEqual([]);
    expect(listDesks(harness, dm).groups).toEqual([]);
    expect(desks.some((d) => FAKE_COLLEAGUE.test(d.name))).toBe(false);
    expect(listDesks(harness, dm).heartbeat_ttl_seconds).toBe(HEARTBEAT_TTL_SECONDS);
  });

  it("shows a live heartbeat by display_name and drops it after TTL", () => {
    let nowMs = Date.parse("2026-09-19T05:00:00.000Z");
    harness = createHarness({ databasePath: ":memory:", now: () => new Date(nowMs).toISOString() });
    const bot: Actor = { id: "bot-1", role: "executor" };
    const beat = recordHeartbeat(harness, bot, { display_name: "周报 Bot", pool_id: "pool_noop", ttl_seconds: 90 });
    expect(beat.group).toBe("pool_noop");
    const live = listDesks(harness, dm);
    expect(live.stub).toBe(false);
    expect(live.desks).toHaveLength(1);
    expect(live.desks[0]).toMatchObject({
      id: "agent:bot-1",
      name: "周报 Bot",
      source: "heartbeat",
      pool_id: "pool_noop",
      group: "pool_noop",
      last_heartbeat: "2026-09-19T05:00:00.000Z",
    });
    expect(live.groups).toEqual([expect.objectContaining({ name: "pool_noop" })]);
    expect(live.desks.some((d) => FAKE_COLLEAGUE.test(d.name))).toBe(false);
    nowMs += 91_000;
    const expired = listDesks(harness, dm);
    expect(expired.stub).toBe(true);
    expect(expired.desks).toEqual([]);
  });

  it("accepts name as an alias for display_name", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const bot: Actor = { id: "sidebar-bot", role: "executor" };
    const beat = recordHeartbeat(harness, bot, { name: "侧栏真名" });
    expect(beat.display_name).toBe("侧栏真名");
    const listed = listDesks(harness, dm);
    expect(listed.desks.find((d) => d.id === "agent:sidebar-bot")?.name).toBe("侧栏真名");
  });

  it("optionally lists execution pools as 执行池 for non-DM only, never 同事", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const dmFlag = listDesks(harness, dm, { includePools: true });
    expect(dmFlag.include_pools).toBe(false);
    expect(dmFlag.desks).toEqual([]);
    const { desks, include_pools } = listDesks(harness, coord, { includePools: true });
    expect(include_pools).toBe(true);
    expect(desks.map((d) => d.name).sort()).toEqual(["执行池 · Cursor", "执行池 · noop"]);
    expect(desks.every((d) => d.source === "pool_seed" && d.last_heartbeat === null)).toBe(true);
    expect(desks.some((d) => FAKE_COLLEAGUE.test(d.name))).toBe(false);
    expect(executionPoolName("pool_noop", "noop")).toBe("执行池 · noop");
    expect(executionPoolName("pool_cursor", "cursor_account")).toBe("执行池 · Cursor");
  });

  it("marks an accepted assignment as 在忙 on the heartbeat desk, not a dispatch UI", () => {
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
    expect(listDesks(harness, dm).desks).toEqual([]);
    const bot: Actor = { id: "cursor-bot", role: "executor" };
    recordHeartbeat(harness, bot, { display_name: "调研 Bot", pool_id: "pool_cursor" });
    const listed = listDesks(harness, dm);
    const agent = listed.desks.find((d) => d.id === "agent:cursor-bot");
    expect(agent?.name).toBe("调研 Bot");
    expect(agent?.status).toBe("在忙");
    expect(agent?.presence).toBe("busy");
    const ops = listDesks(harness, coord, { includePools: true });
    expect(ops.desks.find((d) => d.id === "pool_cursor")?.status).toBe("在忙");
    expect(ops.desks.find((d) => d.id === "pool_noop")?.status).toBe("空闲");
    expect(ops.desks.find((d) => d.id === "pool_cursor")?.name).toBe("执行池 · Cursor");
    expect(listDesks(harness, dm, { includePools: true }).desks.every((d) => d.source === "heartbeat")).toBe(true);
  });

  it("desks_grouped_layout_readonly", () => {
    harness = createHarness({ databasePath: ":memory:" });
    recordHeartbeat(harness, { id: "bot-h", role: "executor" }, { display_name: "Harness Bot", pool_id: "pool_noop" });
    recordHeartbeat(harness, { id: "bot-g", role: "executor" }, { display_name: "2048 Bot", pool_id: "pool_cursor" });
    const listed = listDesks(harness, dm);
    expect(listed.readonly).toBe(true);
    expect(listed.groups.map((g) => g.name)).toEqual(["pool_cursor", "pool_noop"]);
    expect(listed.groups.every((g) => g.desks.length > 0)).toBe(true);
    expect(listed.groups.some((g) => g.name === "未分组")).toBe(false);
  });

  it("desks_group_no_drag_assign", () => {
    harness = createHarness({ databasePath: ":memory:" });
    recordHeartbeat(harness, { id: "bot-h", role: "executor" }, { display_name: "Harness Bot", pool_id: "pool_noop" });
    const listed = listDesks(harness, dm);
    expect(listed.readonly).toBe(true);
    expect(listed.hitl).toBe("待我拍板");
    expect(JSON.stringify(listed)).not.toMatch(/指派给|拖到工位|开始跑|dispatch|assign_to/);
  });

  it("desks_group_no_fake_seeds", () => {
    harness = createHarness({ databasePath: ":memory:" });
    expect(listDesks(harness, dm).desks).toEqual([]);
    recordHeartbeat(harness, { id: "bot-h", role: "executor" }, { display_name: "Harness Bot", pool_id: "pool_noop" });
    const listed = listDesks(harness, dm);
    expect(listed.desks.map((d) => d.name)).toEqual(["Harness Bot"]);
    expect(listed.desks.every((d) => d.source === "heartbeat")).toBe(true);
    expect(JSON.stringify(listed)).not.toMatch(FAKE_COLLEAGUE);
    expect(listDesks(harness, dm, { includePools: true }).desks.every((d) => d.source === "heartbeat")).toBe(true);
  });

  it("desks_ungrouped_bucket", () => {
    harness = createHarness({ databasePath: ":memory:" });
    recordHeartbeat(harness, { id: "bot-o", role: "executor" }, { display_name: "闲逛 Bot" });
    recordHeartbeat(harness, { id: "bot-h", role: "executor" }, { display_name: "Harness Bot", pool_id: "pool_noop" });
    const listed = listDesks(harness, dm);
    expect(listed.desks.find((d) => d.id === "agent:bot-o")?.group).toBe("未分组");
    expect(listed.groups.map((g) => g.name)).toEqual(["pool_noop", "未分组"]);
    expect(listed.groups.find((g) => g.name === "未分组")?.desks.map((d) => d.name)).toEqual(["闲逛 Bot"]);
    recordHeartbeat(harness, { id: "bot-o", role: "executor" }, { display_name: "闲逛 Bot", group: "2048" });
    const stillLoose = listDesks(harness, dm);
    expect(stillLoose.desks.find((d) => d.id === "agent:bot-o")?.group).toBe("未分组");
    recordHeartbeat(harness, { id: "bot-o", role: "executor" }, { display_name: "闲逛 Bot", pool_id: "pool_cursor" });
    const after = listDesks(harness, dm);
    expect(after.groups.map((g) => g.name)).toEqual(["pool_cursor", "pool_noop"]);
    expect(after.groups.some((g) => g.name === "未分组")).toBe(false);
  });

  it("marks a pending deliver gate as 等证据 on the heartbeat desk", async () => {
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
    const bot: Actor = { id: "deliver-bot", role: "executor" };
    recordHeartbeat(harness, bot, { display_name: "周报 Bot", pool_id: "pool_noop" });
    const agent = listDesks(harness, dm).desks.find((d) => d.id === "agent:deliver-bot");
    expect(agent?.status).toBe("等证据");
    expect(agent?.presence).toBe("waiting_evidence");
  });
});
