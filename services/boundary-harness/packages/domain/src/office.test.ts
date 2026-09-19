import { afterEach, describe, expect, it } from "vitest";
import { closeHarness, createHarness, type Harness } from "./db";
import { createGoal, fillAssignment } from "./services";
import { listGoals } from "./office";
import type { Actor } from "./rbac";

const dm: Actor = { id: "you", role: "decision_maker" };
const coord: Actor = { id: "coord-1", role: "coordinator" };

describe("listGoals office projection", () => {
  let harness: Harness | undefined;
  afterEach(() => {
    if (harness) closeHarness(harness);
    harness = undefined;
  });

  it("lists a created goal with an empty fill slot and persists the ask", () => {
    harness = createHarness({ databasePath: ":memory:" });
    createGoal(harness, dm, {
      title: "周报交付验收",
      summary: "要一份能转发的周报",
      mode: "deliver",
      coordinator_ref: "coord-1",
    });
    const board = listGoals(harness, dm);
    expect(board.readonly).toBe(true);
    expect(board.goals).toHaveLength(1);
    expect(board.goals[0]?.title).toBe("周报交付验收");
    expect(board.goals[0]?.summary).toBe("要一份能转发的周报");
    expect(board.goals[0]?.status_line).toBe("要一份能转发的周报");
    expect(board.goals[0]?.slots).toEqual([
      expect.objectContaining({
        filler: "还没人填",
        progress: "等同事接手",
        empty: true,
        readonly: true,
        artifact: null,
      }),
    ]);
    const json = JSON.stringify(board);
    expect(json).not.toMatch(/指派给|拖到工位|开始跑|dispatch|assign/i);
  });

  it("projects who is filling after coordinator fill, without a dispatch UI", () => {
    harness = createHarness({ databasePath: ":memory:" });
    const goal = createGoal(harness, coord, {
      title: "周报交付验收",
      mode: "deliver",
      coordinator_ref: "coord-1",
    });
    fillAssignment(harness, coord, goal.id, {
      pool_id: "pool_noop",
      brief: { outcome: "presence only", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
    });
    const board = listGoals(harness, dm);
    expect(board.goals[0]?.slots).toEqual([
      expect.objectContaining({
        filler: "交付同事",
        presence: "busy",
        progress: "同事在填",
        empty: false,
        readonly: true,
      }),
    ]);
  });
});
