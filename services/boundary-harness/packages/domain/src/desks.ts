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

/**
 * Default presence TTL (#15). Fresh heartbeat = online.
 * Expired / never-recorded rows are omitted from the default office list
 * (no pool_seed fallback — those labels are inventory, not colleagues).
 */
export const HEARTBEAT_TTL_SECONDS = 90;
export const HEARTBEAT_TTL_MIN = 15;
export const HEARTBEAT_TTL_MAX = 3600;

/**
 * Pool-seed placeholder labels. They MUST NOT appear as default GET /v1/desks
 * entries unless a live heartbeat is overlaying that row (then the heartbeat
 * display_name is used, which may coincide with these strings).
 */
export const FAKE_SEED_DESK_NAMES = ["交付同事", "Cursor 同事"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DESK_NAMES: Record<string, string> = {
  pool_noop: "交付同事",
  pool_cursor: "Cursor 同事",
};

export function isFakeSeedDeskName(name: string): boolean {
  return (FAKE_SEED_DESK_NAMES as readonly string[]).includes(name);
}

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

function isLiveHeartbeat(lastSeenAt: string, ttlSeconds: number, nowIso: string): boolean {
  const seen = Date.parse(lastSeenAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(seen) || !Number.isFinite(now)) return false;
  return now - seen < ttlSeconds * 1000;
}

export type HeartbeatInput = {
  display_name?: string;
  pool_id?: string | null;
  ttl_seconds?: number;
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
  const displayName = input.display_name?.trim() || actor.id;
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
}) {
  return {
    id: input.id,
    name: input.name,
    avatar: Array.from(input.name)[0] ?? "同",
    presence: input.presence,
    status: DESK_STATUS[input.presence],
    last_heartbeat: input.last_heartbeat,
    source: input.source,
    ttl_seconds: input.ttl_seconds,
  };
}

/**
 * Read-only office roster. Never a dispatch / assign surface.
 *
 * Default list semantics (trusted heartbeat = live TTL):
 * - Include a desk/bot only when `agent_heartbeats.last_seen_at` is parseable
 *   and still within that row's `ttl_seconds` (`now - last_seen_at < ttl`).
 * - Never-recorded pool seeds are omitted (not colleagues).
 * - Expired heartbeats are omitted — no `source=pool_seed` fallback, so
 *   placeholder names like 「交付同事」「Cursor 同事」 cannot reappear.
 * - We pick "within TTL", not "ever recorded": #15 already treated expiry as
 *   not-present, and a stale last_seen without a live beat is not a real desk.
 *
 * Live rows use the heartbeat `display_name` (or actor id), never the
 * hardcoded seed map. Fill-slot filler labels may still use `humanDeskName`.
 */
export function listDesks(h: Harness, actor: Actor) {
  requireRole(actor, ["decision_maker", "coordinator", "viewer", "service"]);
  const now = h.now();
  const poolRows = h.db.select().from(pools).all();
  const assignmentRows = h.db.select().from(assignments).all();
  const runRows = h.db.select().from(runs).all();
  const gateRows = h.db.select().from(gateInstances).all();
  const beats = h.db.select().from(agentHeartbeats).all();
  const live = beats.filter((b) => isLiveHeartbeat(b.lastSeenAt, b.ttlSeconds, now));

  const usedBeatActors = new Set<string>();
  const desks: ReturnType<typeof deskRow>[] = [];
  for (const pool of poolRows) {
    const beat = live.find((b) => b.poolId === pool.id);
    if (!beat) continue;
    usedBeatActors.add(beat.actorId);
    const asgs = assignmentRows.filter((a) => a.poolId === pool.id);
    const asgIds = new Set(asgs.map((a) => a.id));
    const presence = presenceFor({
      runStatuses: runRows.filter((r) => asgIds.has(r.assignmentId)).map((r) => r.status),
      assignmentStatuses: asgs.map((a) => a.status),
      gateStatuses: gateRows.filter((g) => g.assignmentId && asgIds.has(g.assignmentId)).map((g) => g.status),
    });
    const name = beat.displayName?.trim() || beat.actorId;
    desks.push(
      deskRow({
        id: pool.id,
        name,
        presence,
        last_heartbeat: beat.lastSeenAt,
        source: "heartbeat",
        ttl_seconds: beat.ttlSeconds,
      }),
    );
  }

  for (const beat of live) {
    if (usedBeatActors.has(beat.actorId)) continue;
    const name = beat.displayName?.trim() || beat.actorId;
    desks.push(
      deskRow({
        id: `agent:${beat.actorId}`,
        name,
        presence: "idle",
        last_heartbeat: beat.lastSeenAt,
        source: "heartbeat",
        ttl_seconds: beat.ttlSeconds,
      }),
    );
  }

  return {
    desks,
    readonly: true as const,
    hitl: "待我拍板" as const,
    stub: live.length === 0,
    heartbeat_ttl_seconds: HEARTBEAT_TTL_SECONDS,
  };
}
