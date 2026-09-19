import { eq } from "drizzle-orm";
import { assertNoBriefForbiddenKeys } from "./brief";
import { humanDeskName, listDesks, UUID_RE } from "./desks";
import { HarnessError } from "./errors";
import type { Actor } from "./rbac";
import { requireRole } from "./rbac";
import type { Harness } from "./db";
import { assignments, evidenceItems, gateInstances, goals, pools, runs } from "./schema";
import { createGoal } from "./services";

export const OFFICE_EMPTY_COPY = "还没有目标。建一个，同事才会开工。";

export type OfficeFillStage =
  | "proposed"
  | "accepted"
  | "filling"
  | "waiting_evidence"
  | "has_artifacts"
  | "done";

const STAGE_LABEL: Record<OfficeFillStage, string> = {
  proposed: "待接",
  accepted: "已接",
  filling: "同事正在填",
  waiting_evidence: "等证据",
  has_artifacts: "已有产物",
  done: "填完了",
};

/** Display title for the office shell — never a raw UUID. */
export function humanGoalTitle(title: string | null | undefined): string {
  const trimmed = String(title ?? "").trim();
  if (!trimmed || UUID_RE.test(trimmed)) return "未命名目标";
  return trimmed;
}

function liveRun(status: string): boolean {
  return status === "queued" || status === "running" || status === "in_progress" || status === "dispatched";
}

function statusSummary(input: {
  assignmentStatuses: string[];
  runStatuses: string[];
  gateStatuses: string[];
}): string {
  if (input.gateStatuses.some((s) => s === "ready")) return "待我拍板";
  if (input.gateStatuses.some((s) => s === "pending")) return "等证据";
  if (input.runStatuses.some(liveRun) || input.assignmentStatuses.some((s) => s === "accepted" || s === "proposed" || s === "in_progress")) {
    return "同事正在填";
  }
  if (input.gateStatuses.some((s) => s === "decided")) return "已拍板";
  if (input.assignmentStatuses.some((s) => s === "succeeded")) return "填完了";
  if (input.assignmentStatuses.length === 0) return "还没有人填";
  return "进行中";
}

function slotStage(input: {
  assignmentStatus: string;
  runStatuses: string[];
  evidenceCount: number;
  gateStatuses: string[];
}): { stage: OfficeFillStage; stage_label: string } {
  if (input.assignmentStatus === "proposed") {
    return { stage: "proposed", stage_label: STAGE_LABEL.proposed };
  }
  if (input.runStatuses.some(liveRun)) {
    return { stage: "filling", stage_label: STAGE_LABEL.filling };
  }
  if (input.gateStatuses.some((s) => s === "pending") || (input.runStatuses.some((s) => s === "succeeded") && input.evidenceCount === 0)) {
    return { stage: "waiting_evidence", stage_label: STAGE_LABEL.waiting_evidence };
  }
  if (input.assignmentStatus === "succeeded" || input.gateStatuses.some((s) => s === "decided")) {
    return { stage: "done", stage_label: STAGE_LABEL.done };
  }
  if (input.evidenceCount > 0) {
    return { stage: "has_artifacts", stage_label: STAGE_LABEL.has_artifacts };
  }
  if (input.assignmentStatus === "accepted") {
    return { stage: "accepted", stage_label: STAGE_LABEL.accepted };
  }
  if (input.assignmentStatus === "in_progress") {
    return { stage: "filling", stage_label: STAGE_LABEL.filling };
  }
  return { stage: "accepted", stage_label: STAGE_LABEL.accepted };
}

export function listOfficeGoals(h: Harness, actor: Actor) {
  requireRole(actor, ["decision_maker", "coordinator", "viewer", "service"]);
  const goalRows = h.db.select().from(goals).all();
  const assignmentRows = h.db.select().from(assignments).all();
  const runRows = h.db.select().from(runs).all();
  const gateRows = h.db.select().from(gateInstances).all();

  const items = goalRows.map((goal) => {
    const asgs = assignmentRows.filter((a) => a.goalId === goal.id);
    const asgIds = new Set(asgs.map((a) => a.id));
    return {
      id: goal.id,
      title: humanGoalTitle(goal.title),
      intent: goal.intent ?? null,
      status: goal.status,
      status_summary: statusSummary({
        assignmentStatuses: asgs.map((a) => a.status),
        runStatuses: runRows.filter((r) => asgIds.has(r.assignmentId)).map((r) => r.status),
        gateStatuses: gateRows.filter((g) => g.goalId === goal.id).map((g) => g.status),
      }),
    };
  });

  return {
    goals: items,
    empty_copy: OFFICE_EMPTY_COPY,
    readonly: true as const,
  };
}

export function createOfficeGoal(
  h: Harness,
  actor: Actor,
  body: Record<string, unknown>,
) {
  requireRole(actor, ["decision_maker", "coordinator"]);
  assertNoBriefForbiddenKeys(body);
  const title = String(body.title ?? "").trim();
  const intent = String(body.intent ?? "").trim();
  if (!title) {
    throw new HarnessError("goal_title_required", "title is required", 422);
  }
  if (!intent) {
    throw new HarnessError("goal_intent_required", "intent is required", 422);
  }
  const created = createGoal(h, actor, {
    title,
    intent,
    mode: "explore",
    coordinator_ref: actor.id,
  });
  return {
    id: created.id,
    title: humanGoalTitle(created.title),
    intent: created.intent ?? intent,
    status: created.status,
    status_summary: "还没有人填",
    mode: created.mode,
    coordinator_ref: created.coordinator_ref,
  };
}

export function getOfficeFillSlots(h: Harness, actor: Actor, goalId: string) {
  requireRole(actor, ["decision_maker", "coordinator", "viewer", "service"]);
  const goal = h.db.select().from(goals).where(eq(goals.id, goalId)).get();
  if (!goal) throw new HarnessError("not_found", `goal ${goalId} not found`, 404);

  const assignmentRows = h.db.select().from(assignments).where(eq(assignments.goalId, goalId)).all();
  const poolRows = h.db.select().from(pools).all();
  const runRows = h.db.select().from(runs).all();
  const evRows = h.db.select().from(evidenceItems).where(eq(evidenceItems.goalId, goalId)).all();
  const gateRows = h.db.select().from(gateInstances).where(eq(gateInstances.goalId, goalId)).all();

  const slots = assignmentRows.map((asg) => {
    const pool = poolRows.find((p) => p.id === asg.poolId);
    const name = humanDeskName(asg.poolId, pool?.kind ?? "noop");
    const myRuns = runRows.filter((r) => r.assignmentId === asg.id);
    const myEv = evRows.filter((e) => e.assignmentId === asg.id && !e.shadow);
    const myGates = gateRows.filter((g) => g.assignmentId === asg.id);
    const { stage, stage_label } = slotStage({
      assignmentStatus: asg.status,
      runStatuses: myRuns.map((r) => r.status),
      evidenceCount: myEv.length,
      gateStatuses: myGates.map((g) => g.status),
    });
    return {
      assignment_id: asg.id,
      filled_by: {
        name,
        pool_kind: pool?.kind ?? null,
        role: pool?.kind === "bot_group" || pool?.kind === "cursor_account" || pool?.kind === "noop" ? "bot" : "human",
      },
      stage,
      stage_label,
      artifacts: myEv.map((e) => ({
        kind: e.kind,
        uri: e.uri,
        href: e.uri,
      })),
    };
  });

  return {
    goal_id: goal.id,
    title: humanGoalTitle(goal.title),
    intent: goal.intent ?? null,
    slots,
    readonly: true as const,
  };
}

export function listOfficeDeskPresence(h: Harness, actor: Actor) {
  return listDesks(h, actor);
}

export function forbidOfficeWrite(action: string): never {
  throw new HarnessError(
    "office_write_forbidden",
    "office shell is read-only for owner and dispatch",
    403,
    { action },
  );
}

