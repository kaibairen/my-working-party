import { afterEach, describe, expect, it } from "vitest";
import { closeHarness, createHarness, type Harness } from "./db";
import { createGoal, dispatchAssignment, fillAssignment } from "./services";
import { createOfficeGoal, getOfficeFillSlots, humanGoalTitle, listOfficeGoals } from "./office";
import type { Actor } from "./rbac";

const dm: Actor = { id: "you", role: "decision_maker" };
const coord: Actor = { id: "coord-1", role: "coordinator" };

describe("office projections", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  it("replaces UUID titles with 未命名目标", () => {
    expect(humanGoalTitle("550e8400-e29b-41d4-a716-446655440000")).toBe("未命名目标");
    expect(humanGoalTitle("周报交付验收")).toBe("周报交付验收");
  });

  it("lists created office goals with intent and human status", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const created = createOfficeGoal(harness, dm, {
      title: "周报交付验收",
      intent: "把本周周报交出去",
    });
    expect(created.title).toBe("周报交付验收");
    expect(created.intent).toBe("把本周周报交出去");
    expect(created.status_summary).toBe("还没有人填");
    const listed = listOfficeGoals(harness, dm);
    expect(listed.readonly).toBe(true);
    expect(listed.empty_copy).toContain("还没有目标");
    expect(listed.goals[0]?.title).toBe("周报交付验收");
    expect(listed.goals[0]?.title).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("rejects BriefV1 forbidden keys on office create", () => {
    harness = createHarness({ databasePath: ":memory:" });
    expect(() =>
      createOfficeGoal(harness!, dm, {
        title: "x",
        intent: "y",
        steps: ["do a"],
      }),
    ).toThrow(/BriefV1 contains forbidden fields/);
  });

  it("projects fill slots as who / stage / artifacts, not a dispatch board", async () => {
    harness = createHarness({ databasePath: ":memory:" });
    const goal = createGoal(harness, coord, {
      title: "周报交付验收",
      intent: "交周报",
      mode: "deliver",
      coordinator_ref: "coord-1",
    });
    const asg = fillAssignment(harness, coord, goal.id, {
      pool_id: "pool_noop",
      brief: { outcome: "waiting", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
    });
    await dispatchAssignment(harness, coord, asg.id, "office-slot");
    const slots = getOfficeFillSlots(harness, dm, goal.id);
    expect(slots.readonly).toBe(true);
    expect(slots.title).toBe("周报交付验收");
    expect(slots.slots).toHaveLength(1);
    expect(slots.slots[0]?.filled_by.name).toBe("交付同事");
    expect(slots.slots[0]?.stage).toBe("waiting_evidence");
    expect(JSON.stringify(slots)).not.toMatch(/指派给|拖到工位|开始跑|dispatch/);
  });
});
