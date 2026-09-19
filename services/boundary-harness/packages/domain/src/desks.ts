import { eq } from "drizzle-orm";
import type { Actor } from "./rbac";
import { requireRole } from "./rbac";
import type { Harness } from "./db";
import { agentHeartbeats, assignments, gateInstances, pools, runs } from "./schema";
import { HarnessError } from "./errors";

export const DESK_STATUS = {
  busy: "在忙",
  waiting_evidence: "等证据",
  idle: "空闲",
} as const;

export type DeskPresence = keyof typeof DESK_STATUS;

/** Default presence TTL. Fresh heartbeat = online; expired rows disappear from the office roster. */
export const HEARTBEAT_TTL_SECONDS = 90;
export const HEARTBEAT_TTL_MIN = 15;
export const HEARTBEAT_TTL_MAX = 3600;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fill-slot labels only. Office roster MUST NOT use these as Bot colleagues. */
const FILLER_NAMES: Record<string, string> = {
  pool_noop: "交付同事",
  pool_cursor: "Cursor 同事",
};

export function humanDeskName(poolId: string, kind: string): string {
  if (FILLER_NAMES[poolId]) return FILLER_NAMES[poolId];
  if (kind === "bot_group") return "群组同事";
  if (kind === "cursor_account") return "Cursor 同事";
  if (kind === "noop") return "交付同事";
  const stripped = poolId.replace(/^pool_/, "").trim();
  if (!stripped || UUID_RE.test(stripped)) return "同事";
  return stripped;
}

/** Ops-only pool row. Never humanize execution pools as 同事. */
export function executionPoolName(poolId: string, kind: string): string {
  if (poolId === "pool_noop" || kind === "noop") return "执行池 · noop";
  if (poolId === "pool_cursor" || kind === "cursor_account") return "执行池 · Cursor";
  if (kind === "bot_group") return "执行池 · 群组";
  const stripped = poolId.replace(/^pool_/, "").trim();
  if (!stripped || UUID_RE.test(stripped)) return "执行池";
  return `执行池 · ${stripped}`;
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

function isLiveHeartbeat(lastSeenAt: string, ttlSeconds: number, nowIso: string): boolean {
  const seen = Date.parse(lastSeenAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(seen) || !Number.isFinite(now)) return false;
  return now - seen < ttlSeconds * 1000;
}

export type HeartbeatInput = {
  display_name?: string;
  name?: string;
  pool_id?: string | null;
  ttl_seconds?: number;
};

export type ListDesksOptions = {
  /** Ops overlay. Ignored for decision_maker — pool seeds never occupy the DM roster. */
  includePools?: boolean;
};

/**
 * Bot self-report. Domain is SoT — not :1340 / agent-data files.
 * TTL refreshes on each POST (Discord / Redis EXPIRE style).
 */
export function recordHeartbeat(h: Harness, actor: Actor, input: HeartbeatInput = {}) {
  requireRole(actor, ["coordinator", "executor", "service"]);
  const ttlRaw = input.ttl_seconds ?? HEARTBEAT_TTL_SECONDS;
  if (typeof ttlRaw !== "number" || !Number.isFinite(ttlRaw)) {
    throw new HarnessError("heartbeat_invalid", "ttl_seconds must be a number", 422);
  }
  const ttl = Math.min(HEARTBEAT_TTL_MAX, Math.max(HEARTBEAT_TTL_MIN, Math.floor(ttlRaw)));
  const poolId = input.pool_id?.trim() || null;
  if (poolId) {
    const pool = h.db.select().from(pools).where(eq(pools.id, poolId)).get();
    if (!pool) throw new HarnessError("not_found", `pool ${poolId} not found`, 404);
  }
  const rawName = input.display_name ?? input.name;
  const displayName = typeof rawName === "string" && rawName.trim() ? rawName.trim() : actor.id;
  const ts = h.now();
  const existing = h.db.select().from(agentHeartbeats).where(eq(agentHeartbeats.actorId, actor.id)).get();
  if (existing) {
    h.db
      .update(agentHeartbeats)
      .set({
        displayName,
        poolId,
        lastSeenAt: ts,
        ttlSeconds: ttl,
      })
      .where(eq(agentHeartbeats.actorId, actor.id))
      .run();
  } else {
    h.db.insert(agentHeartbeats).values({
      actorId: actor.id,
      displayName,
      poolId,
      lastSeenAt: ts,
      ttlSeconds: ttl,
    }).run();
  }
  return {
    actor_id: actor.id,
    display_name: displayName,
    pool_id: poolId,
    last_heartbeat: ts,
    ttl_seconds: ttl,
    expires_at: new Date(Date.parse(ts) + ttl * 1000).toISOString(),
  };
}

function deskRow(input: {
  id: string;
  name: string;
  presence: DeskPresence;
  last_heartbeat: string | null;
  source: "pool_seed" | "heartbeat";
  ttl_seconds: number | null;
  pool_id?: string | null;
}) {
  return {
    id: input.id,
    name: input.name,
    avatar: Array.from(input.name)[0] ?? "B",
    presence: input.presence,
    status: DESK_STATUS[input.presence],
    last_heartbeat: input.last_heartbeat,
    source: input.source,
    ttl_seconds: input.ttl_seconds,
    pool_id: input.pool_id ?? null,
  };
}

function presenceForPool(
  poolId: string,
  assignmentRows: Array<{ id: string; poolId: string; status: string }>,
  runRows: Array<{ assignmentId: string; status: string }>,
  gateRows: Array<{ assignmentId: string | null; status: string }>,
): DeskPresence {
  const asgs = assignmentRows.filter((a) => a.poolId === poolId);
  const asgIds = new Set(asgs.map((a) => a.id));
  return presenceFor({
    runStatuses: runRows.filter((r) => asgIds.has(r.assignmentId)).map((r) => r.status),
    assignmentStatuses: asgs.map((a) => a.status),
    gateStatuses: gateRows.filter((g) => g.assignmentId && asgIds.has(g.assignmentId)).map((g) => g.status),
  });
}

/**
 * Read-only office roster. Never a dispatch / assign surface.
 *
 * Default: live `agent_heartbeats` within TTL only, named from heartbeat
 * `display_name`. Seed execution pools are not Bot colleagues.
 * `include_pools` is a non-DM ops overlay labeled 「执行池 · …」.
 * Decision-maker always gets heartbeat agents only — seed 同事 never occupy
 * the primary roster, even if the query flag is set.
 * Expired heartbeats are omitted (no pool_seed fallback on the office roster).
 */
export function listDesks(h: Harness, actor: Actor, opts: ListDesksOptions = {}) {
  requireRole(actor, ["decision_maker", "coordinator", "viewer", "service"]);
  const now = h.now();
  const includePools = Boolean(opts.includePools) && actor.role !== "decision_maker";
  const assignmentRows = h.db.select().from(assignments).all();
  const runRows = h.db.select().from(runs).all();
  const gateRows = h.db.select().from(gateInstances).all();
  const beats = h.db.select().from(agentHeartbeats).all();
  const live = beats.filter((b) => isLiveHeartbeat(b.lastSeenAt, b.ttlSeconds, now));

  const desks: ReturnType<typeof deskRow>[] = [];

  if (includePools) {
    for (const pool of h.db.select().from(pools).all()) {
      desks.push(
        deskRow({
          id: pool.id,
          name: executionPoolName(pool.id, pool.kind),
          presence: presenceForPool(pool.id, assignmentRows, runRows, gateRows),
          last_heartbeat: null,
          source: "pool_seed",
          ttl_seconds: null,
          pool_id: pool.id,
        }),
      );
    }
  }

  for (const beat of live) {
    const name = beat.displayName?.trim() || beat.actorId;
    desks.push(
      deskRow({
        id: `agent:${beat.actorId}`,
        name,
        presence: beat.poolId ? presenceForPool(beat.poolId, assignmentRows, runRows, gateRows) : "idle",
        last_heartbeat: beat.lastSeenAt,
        source: "heartbeat",
        ttl_seconds: beat.ttlSeconds,
        pool_id: beat.poolId ?? null,
      }),
    );
  }

  return {
    desks,
    readonly: true as const,
    hitl: "待我拍板" as const,
    stub: live.length === 0,
    heartbeat_ttl_seconds: HEARTBEAT_TTL_SECONDS,
    include_pools: includePools,
  };
}
