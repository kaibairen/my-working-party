import { afterEach, describe, expect, it } from "vitest";
import { closeHarness, createHarness, type Harness } from "./db";
import { HarnessError } from "./errors";
import { createGoal, fillAssignment, listFillSlots, listGoals } from "./services";
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
    expect(listed[0].status_line).toBe("等同事开工");
    expect(listed[0].title).toBe("周报交付验收");
    expect(listed[0].team_group).toBeNull();
    expect(listed[0].required_evidence_kinds).toEqual(["summary_md"]);
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
    expect(slots).toHaveLength(1);
    expect(slots[0].empty).toBe(true);
    expect(slots[0].progress).toBe("等同事填");
    expect(slots[0].outcome).toBe("写一份能读的周报");
    expect(slots[0].required_evidence_kinds).toEqual(["summary_md"]);
    expect(JSON.stringify(slots)).not.toMatch(/指派给|开始跑|dispatch/);
  });

  it("surfaces missing_kinds when Fill evidence_shape misses the predicate", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const goal = createGoal(harness, dm, { title: "周报交付验收", intent: "写一份能读的周报" });
    expect(goal.required_evidence_kinds).toEqual(["summary_md"]);
    try {
      fillAssignment(harness, coord, goal.id, {
        pool_id: "pool_noop",
        brief: { outcome: "只交报告", constraints: [], evidence_shape: ["report_md"] },
      });
      throw new Error("expected predicate_evidence_mismatch");
    } catch (err) {
      expect(err).toBeInstanceOf(HarnessError);
      const he = err as HarnessError;
      expect(he.code).toBe("predicate_evidence_mismatch");
      expect(he.status).toBe(422);
      expect(he.details).toEqual({ missing: ["summary_md"], missing_kinds: ["summary_md"] });
    }
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
    expect(listGoals(harness, dm)[0].status_line).toBe("同事在填");
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
});
