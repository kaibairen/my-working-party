import { afterEach, describe, expect, it } from "vitest";
import { closeHarness, createHarness, type Harness } from "./db";
import { evidenceItems } from "./schema";
import {
  attachEvidence,
  createGoal,
  dispatchAssignment,
  fillAssignment,
  listFillSlots,
  listGoals,
  STAGE_LOCKED_HUMAN,
  STATUS_LINE_DONE,
  STATUS_LINE_FILLING,
  STATUS_LINE_PENDING_DECISION,
  STATUS_LINE_WAITING,
} from "./services";
import type { Actor } from "./rbac";

const dm: Actor = { id: "you", role: "decision_maker" };
const coord: Actor = { id: "coord-1", role: "coordinator" };

describe("office home goals + fill slots", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  it("lets a decision_maker create a goal with title + intent only", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const goal = createGoal(harness, dm, { title: "周报交付验收", intent: "写一份能读的周报" });
    expect(goal.title).toBe("周报交付验收");
    expect(goal.intent).toBe("写一份能读的周报");
    expect(goal.mode).toBe("deliver");
    expect(goal.coordinator_ref).toBe("coord-1");
    const listed = listGoals(harness, dm);
    expect(listed).toHaveLength(1);
    expect(listed[0].status_line).toBe(STATUS_LINE_WAITING);
    expect(listed[0].title).toBe("周报交付验收");
    expect(listed[0].team_group).toBeNull();
  });

  it("stores optional team_group on Goal so the office can highlight that roster", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const goal = createGoal(harness, dm, {
      title: "做一个能玩的 2048",
      intent: "可玩页",
      team_group: "2048",
    });
    expect(goal.team_group).toBe("2048工作组");
    expect(listGoals(harness, dm)[0].team_group).toBe("2048工作组");
  });

  it("rejects Brief steps on goal create", () => {
    harness = createHarness({ databasePath: ":memory:" });
    expect(() =>
      createGoal(harness!, dm, { title: "x", steps: ["nope"] } as never),
    ).toThrow(/Brief steps|brief_forbidden_field/);
  });

  it("projects an empty fill slot until a colleague fills", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const goal = createGoal(harness, dm, { title: "周报交付验收", intent: "写一份能读的周报" });
    const { slots, readonly } = listFillSlots(harness, dm, goal.id);
    expect(readonly).toBe(true);
    const open = slots.filter((s) => !s.stage_locked);
    expect(open).toHaveLength(1);
    expect(open[0].empty).toBe(true);
    expect(open[0].progress).toBe("等同事填");
    expect(open[0].outcome).toBe("写一份能读的周报");
    expect(open[0].stage_key).toBe("research");
    expect(slots.some((s) => s.stage_locked && s.stage_key === "deliver")).toBe(true);
    expect(JSON.stringify(slots)).not.toMatch(/指派给|开始跑|dispatch/);
  });

  it("projects who is filling after an assignment exists", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const goal = createGoal(harness, coord, {
      title: "周报交付验收",
      mode: "deliver",
      coordinator_ref: "coord-1",
      intent: "写一份能读的周报",
    });
    fillAssignment(harness, coord, goal.id, {
      pool_id: "pool_noop",
      brief: { outcome: "写一份能读的周报", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
    });
    const { slots } = listFillSlots(harness, dm, goal.id);
    expect(slots[0].empty).toBe(false);
    expect(slots[0].filler).toBe("执行池 · noop");
    expect(slots[0].filler_kind).toBe("bot");
    expect(slots[0].filler).not.toMatch(/同事/);
    expect(JSON.stringify(slots)).not.toMatch(/交付同事|Cursor 同事|Bot 填/);
    expect(slots[0].progress).toBe("在填");
    expect(listGoals(harness, dm)[0].status_line).toBe(STATUS_LINE_FILLING);
  });

  it("fill_slots_pool_labels_not_colleague", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const goal = createGoal(harness, coord, {
      title: "2048 可玩页",
      mode: "deliver",
      coordinator_ref: "coord-1",
      intent: "做一个能玩的 2048",
    });
    fillAssignment(harness, coord, goal.id, {
      pool_id: "pool_cursor",
      brief: { outcome: "做一个能玩的 2048", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
    });
    const { slots } = listFillSlots(harness, dm, goal.id);
    expect(slots[0].filler).toBe("执行池 · Cursor");
    expect(slots.map((s) => s.filler).join(" ")).not.toMatch(/同事/);
    expect(JSON.stringify(slots)).not.toMatch(/Bot 填 ·|交付同事|Cursor 同事|群组同事/);
  });

  it("marks a decision_maker fill as 人填 after human_allowed or grant", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const allowed = createGoal(harness, coord, {
      title: "人填目标",
      mode: "deliver",
      coordinator_ref: "coord-1",
      dispatch_policy: "human_allowed",
      intent: "我来写结论",
    });
    fillAssignment(harness, dm, allowed.id, {
      pool_id: "pool_noop",
      brief: { outcome: "我来写结论", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
    });
    const { slots } = listFillSlots(harness, dm, allowed.id);
    expect(slots[0].filler_kind).toBe("human");
    expect(slots[0].filler).toBe("你");
    expect(slots[0].empty).toBe(false);
  });

  it("projects a read-only stage strip and greys locked downstream slots", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const goal = createGoal(harness, coord, {
      title: "调研后交付",
      mode: "deliver",
      coordinator_ref: "coord-1",
      gate_template_id: "research_then_deliver_v1",
      intent: "先调研再交付",
    });
    const { slots, readonly, stage_strip } = listFillSlots(harness, dm, goal.id);
    expect(readonly).toBe(true);
    expect(stage_strip.ready).toBe(true);
    expect(stage_strip.stages.map((s) => s.stage_key)).toEqual(["research", "deliver"]);
    expect(stage_strip.stages[0].state).toBe("current");
    expect(stage_strip.stages[0].label).toBe("调研");
    expect(stage_strip.stages[1].state).toBe("locked");
    expect(stage_strip.stages[1].label).toBe("交付");
    expect(stage_strip.stages[1].tooltip).toBe("需先通过「调研」门禁");
    expect(slots.some((s) => s.stage_locked)).toBe(true);
    const locked = slots.find((s) => s.stage_locked);
    expect(locked?.progress).toBe(STAGE_LOCKED_HUMAN);
    expect(locked?.unlock_after_gate_def_id).toBe(stage_strip.stages[1].unlock_after_gate_def_id);
    expect(JSON.stringify({ slots, stage_strip })).not.toMatch(/强制开工|指派给|开始跑|dispatch/);
  });

  it("status_line_all_slots_done_not_filling", async () => {
    harness = createHarness({ databasePath: ":memory:" });
    const goal = createGoal(harness, coord, {
      title: "五槽交齐",
      mode: "deliver",
      coordinator_ref: "coord-1",
      intent: "交齐五份产物",
    });
    const asgs = [1, 2, 3, 4, 5].map((n) =>
      fillAssignment(harness!, coord, goal.id, {
        pool_id: "pool_noop",
        brief: { outcome: `槽 ${n}`, constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
      }),
    );
    expect(listGoals(harness, dm)[0].status_line).toBe(STATUS_LINE_FILLING);

    for (const [i, asg] of asgs.entries()) {
      harness.db.insert(evidenceItems).values({
        id: harness.newId(),
        runId: null,
        goalId: goal.id,
        assignmentId: asg.id,
        kind: "artifact_uri",
        uri: `file://slot-${i + 1}.tgz`,
        sha256: null,
        shadow: false,
        createdAt: harness.now(),
      }).run();
    }

    const { slots } = listFillSlots(harness, dm, goal.id);
    const delivered = slots.filter((s) => !s.empty && !s.stage_locked);
    expect(delivered).toHaveLength(5);
    expect(delivered.every((s) => s.progress === "已交产物" && s.artifact_uri)).toBe(true);

    const line = listGoals(harness, dm)[0].status_line;
    expect(line).not.toMatch(/同事在填|filling/i);
    expect(line).toBe(STATUS_LINE_DONE);

    const readyGoal = createGoal(harness, coord, {
      title: "等你拍板目标",
      mode: "deliver",
      coordinator_ref: "coord-1",
      gate_template_id: "deliver_ready_v1",
      intent: "交产物后拍板",
    });
    const readyAsg = fillAssignment(harness, coord, readyGoal.id, {
      pool_id: "pool_noop",
      brief: { outcome: "交产物后拍板", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
    });
    const run = await dispatchAssignment(harness, coord, readyAsg.id, "status-line-ready");
    attachEvidence(harness, { id: "exec-1", role: "executor" }, run.id, [
      { kind: "summary_md", uri: "file://summary.md" },
      { kind: "artifact_uri", uri: "file://out.tgz" },
    ]);
    const readyLine = listGoals(harness, dm).find((g) => g.id === readyGoal.id)?.status_line ?? "";
    expect(readyLine).not.toMatch(/同事在填|filling/i);
    expect(readyLine).toBe(STATUS_LINE_PENDING_DECISION);
  });
});
