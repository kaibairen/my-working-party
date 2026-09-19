import type { Actor } from "./rbac";
import { requireRole } from "./rbac";
import type { Harness } from "./db";
import { assignments, gateInstances, pools, runs } from "./schema";

export const DESK_STATUS = {
  busy: "在忙",
  waiting_evidence: "等证据",
  idle: "空闲",
} as const;

export type DeskPresence = keyof typeof DESK_STATUS;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DESK_NAMES: Record<string, string> = {
  pool_noop: "交付同事",
  pool_cursor: "Cursor 同事",
};

export function humanDeskName(poolId: string, kind: string): string {
  if (DESK_NAMES[poolId]) return DESK_NAMES[poolId];
  if (kind === "bot_group") return "群组同事";
  if (kind === "cursor_account") return "Cursor 同事";
  if (kind === "noop") return "交付同事";
  const stripped = poolId.replace(/^pool_/, "").trim();
  if (!stripped || UUID_RE.test(stripped)) return "同事";
  return stripped;
}

function presenceFor(input: {
  runStatuses: string[];
  assignmentStatuses: string[];
  gateStatuses: string[];
}): DeskPresence {
  const liveRun = input.runStatuses.some(
    (s) => s === "queued" || s === "running" || s === "in_progress" || s === "dispatched",
  );
  const assigned = input.assignmentStatuses.some(
    (s) => s === "accepted" || s === "proposed" || s === "in_progress",
  );
  if (liveRun || assigned) return "busy";
  if (input.gateStatuses.some((s) => s === "pending")) return "waiting_evidence";
  return "idle";
}

/** Read-only office projection. Never a dispatch / assign surface. */
export function listDesks(h: Harness, actor: Actor) {
  requireRole(actor, ["decision_maker", "coordinator", "viewer", "service"]);
  const poolRows = h.db.select().from(pools).all();
  const assignmentRows = h.db.select().from(assignments).all();
  const runRows = h.db.select().from(runs).all();
  const gateRows = h.db.select().from(gateInstances).all();

  const desks = poolRows.map((pool) => {
    const asgs = assignmentRows.filter((a) => a.poolId === pool.id);
    const asgIds = new Set(asgs.map((a) => a.id));
    const presence = presenceFor({
      runStatuses: runRows.filter((r) => asgIds.has(r.assignmentId)).map((r) => r.status),
      assignmentStatuses: asgs.map((a) => a.status),
      gateStatuses: gateRows.filter((g) => g.assignmentId && asgIds.has(g.assignmentId)).map((g) => g.status),
    });
    const name = humanDeskName(pool.id, pool.kind);
    return {
      id: pool.id,
      name,
      avatar: Array.from(name)[0] ?? "同",
      presence,
      status: DESK_STATUS[presence],
    };
  });

  return { desks, readonly: true as const, hitl: "待我拍板" as const };
}
