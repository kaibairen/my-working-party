import type { Actor } from "./rbac";
import { requireRole } from "./rbac";
import type { Harness } from "./db";
import { assignments, evidenceItems, gateInstances, goals, pools, runs } from "./schema";
import { humanDeskName, type DeskPresence } from "./desks";

/** Read-only fill-slot projection. Never a dispatch / assign surface. */
export type FillSlot = {
  id: string;
  filler: string;
  presence: DeskPresence;
  progress: string;
  artifact: { label: string; uri: string } | null;
  empty: boolean;
  readonly: true;
};

export type OfficeGoal = {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  status_line: string;
  created_at: string;
  slots: FillSlot[];
};

function artifactFor(
  items: Array<{ kind: string; uri: string; shadow: boolean; assignmentId: string | null }>,
  assignmentId: string,
): FillSlot["artifact"] {
  const live = items.filter((e) => e.assignmentId === assignmentId && !e.shadow);
  const artifact = live.find((e) => e.kind === "artifact_uri");
  if (artifact) return { label: "产物", uri: artifact.uri };
  const summary = live.find((e) => e.kind === "summary_md" || e.kind === "report_md");
  if (summary) return { label: "摘要", uri: summary.uri };
  return null;
}

function slotPresence(input: {
  runStatuses: string[];
  assignmentStatus: string;
  gateStatuses: string[];
}): DeskPresence {
  const liveRun = input.runStatuses.some(
    (s) => s === "queued" || s === "running" || s === "in_progress" || s === "dispatched",
  );
  const assigned =
    input.assignmentStatus === "accepted" ||
    input.assignmentStatus === "proposed" ||
    input.assignmentStatus === "in_progress";
  if (liveRun || assigned) return "busy";
  if (input.gateStatuses.some((s) => s === "pending")) return "waiting_evidence";
  return "idle";
}

function slotProgress(input: {
  presence: DeskPresence;
  gateStatuses: string[];
  artifact: FillSlot["artifact"];
}): string {
  if (input.gateStatuses.some((s) => s === "ready")) return "填到：等拍板";
  if (input.gateStatuses.some((s) => s === "decided")) return "已拍板";
  if (input.gateStatuses.some((s) => s === "pending")) return "填到：等证据";
  if (input.artifact) return "填到：已交产物";
  if (input.presence === "busy") return "同事在填";
  return "还没人填";
}

function goalStatusLine(goal: {
  summary: string | null;
  slots: FillSlot[];
  gateStatuses: string[];
}): string {
  if (goal.gateStatuses.some((s) => s === "ready")) return "有一张待你拍板";
  if (goal.gateStatuses.some((s) => s === "pending")) return "同事在补证据";
  if (goal.slots.some((s) => !s.empty && s.presence === "busy")) return "同事在填";
  if (goal.summary && goal.summary.trim()) return goal.summary.trim();
  return "已建好，等同事接手";
}

function emptySlot(goalId: string): FillSlot {
  return {
    id: `empty:${goalId}`,
    filler: "还没人填",
    presence: "idle",
    progress: "等同事接手",
    artifact: null,
    empty: true,
    readonly: true,
  };
}

/** Office home board. READ projection only — no assign / drag-dispatch. */
export function listGoals(h: Harness, actor: Actor): { goals: OfficeGoal[]; readonly: true } {
  requireRole(actor, ["decision_maker", "coordinator", "viewer", "service"]);
  const goalRows = h.db
    .select()
    .from(goals)
    .all()
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const assignmentRows = h.db.select().from(assignments).all();
  const runRows = h.db.select().from(runs).all();
  const evidenceRows = h.db.select().from(evidenceItems).all();
  const gateRows = h.db.select().from(gateInstances).all();
  const poolRows = h.db.select().from(pools).all();
  const poolById = new Map(poolRows.map((p) => [p.id, p]));

  const board = goalRows.map((goal) => {
    const asgs = assignmentRows.filter((a) => a.goalId === goal.id);
    const goalGates = gateRows.filter((g) => g.goalId === goal.id);
    const slots: FillSlot[] = asgs.length
      ? asgs.map((asg) => {
          const pool = poolById.get(asg.poolId);
          const asgRuns = runRows.filter((r) => r.assignmentId === asg.id);
          const asgGates = goalGates.filter((g) => g.assignmentId === asg.id);
          const artifact = artifactFor(evidenceRows, asg.id);
          const presence = slotPresence({
            runStatuses: asgRuns.map((r) => r.status),
            assignmentStatus: asg.status,
            gateStatuses: asgGates.map((g) => g.status),
          });
          return {
            id: asg.id,
            filler: humanDeskName(asg.poolId, pool?.kind ?? ""),
            presence,
            progress: slotProgress({
              presence,
              gateStatuses: asgGates.map((g) => g.status),
              artifact,
            }),
            artifact,
            empty: false,
            readonly: true as const,
          };
        })
      : [emptySlot(goal.id)];

    const summaryText = typeof goal.summary === "string" && goal.summary.trim() ? goal.summary.trim() : null;
    return {
      id: goal.id,
      title: goal.title,
      summary: summaryText,
      status: goal.status,
      status_line: goalStatusLine({
        summary: summaryText,
        slots,
        gateStatuses: goalGates.map((g) => g.status),
      }),
      created_at: goal.createdAt,
      slots,
    };
  });

  return { goals: board, readonly: true };
}

export const listOfficeGoals = listGoals;
