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

export const DESK_GROUP_HARNESS = "harness开发";
export const DESK_GROUP_2048 = "2048工作组";
export const DESK_GROUP_OTHER = "其他";
export const DESK_GROUP_POOLS = "执行池";

const GROUP_ALIASES: Record<string, string> = {
  harness: DESK_GROUP_HARNESS,
  "harness-dev": DESK_GROUP_HARNESS,
  "harness开发": DESK_GROUP_HARNESS,
  "2048": DESK_GROUP_2048,
  "2048工作组": DESK_GROUP_2048,
  other: DESK_GROUP_OTHER,
  "其他": DESK_GROUP_OTHER,
  pool: DESK_GROUP_POOLS,
  pools: DESK_GROUP_POOLS,
  "执行池": DESK_GROUP_POOLS,
};

export const HEARTBEAT_KIND_BOT = "bot";
export const HEARTBEAT_KIND_CHANNEL = "channel";
export type HeartbeatEntityKind = typeof HEARTBEAT_KIND_BOT | typeof HEARTBEAT_KIND_CHANNEL;

/**
 * Grok Bot CreateChannel dirs still have profile.json, so a naive agent-data
 * seeder heartbeats the channel itself. Those display_names collide with
 * roster group headers (2048工作组 / harness开发) or are the channel title
 * (harness组 / harness组研讨).
 */
const RESERVED_CHANNEL_DISPLAY_NAMES = new Set([
  DESK_GROUP_HARNESS,
  DESK_GROUP_2048,
  DESK_GROUP_OTHER,
  DESK_GROUP_POOLS,
  "harness组",
  "harness组研讨",
]);

/** `kind` / `entity_kind`. Unknown or omitted → bot (back-compat). `group` aliases channel. */
export function normalizeHeartbeatKind(raw?: string | null): HeartbeatEntityKind {
  const trimmed = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (trimmed === HEARTBEAT_KIND_CHANNEL || trimmed === "group") return HEARTBEAT_KIND_CHANNEL;
  return HEARTBEAT_KIND_BOT;
}

/** True when display_name is a roster header or a known channel entity name. */
export function isReservedGroupHeaderName(raw?: string | null): boolean {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return false;
  if (RESERVED_CHANNEL_DISPLAY_NAMES.has(trimmed)) return true;
  const clipped = trimmed.slice(0, 32);
  return Boolean(GROUP_ALIASES[clipped] || GROUP_ALIASES[clipped.toLowerCase()]);
}

function hasRealBotIdentity(input: {
  displayName?: string | null;
  poolId?: string | null;
  entityKind?: string | null;
}): boolean {
  if (normalizeHeartbeatKind(input.entityKind) === HEARTBEAT_KIND_CHANNEL) return false;
  const name = input.displayName?.trim() || "";
  if (!name || isReservedGroupHeaderName(name)) return false;
  return true;
}

/** Channel / group entities must never occupy a desk row. */
export function isChannelLikeHeartbeat(input: {
  displayName?: string | null;
  poolId?: string | null;
  entityKind?: string | null;
}): boolean {
  if (normalizeHeartbeatKind(input.entityKind) === HEARTBEAT_KIND_CHANNEL) return true;
  const name = input.displayName?.trim() || "";
  return Boolean(name) && isReservedGroupHeaderName(name) && !hasRealBotIdentity(input);
}

/** Bots self-report `group` (or `section`). Empty / unknown → 其他. */
export function normalizeDeskGroup(raw?: string | null): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return DESK_GROUP_OTHER;
  const clipped = trimmed.slice(0, 32);
  return GROUP_ALIASES[clipped] ?? GROUP_ALIASES[clipped.toLowerCase()] ?? clipped;
}

function groupRank(name: string): number {
  if (name === DESK_GROUP_HARNESS) return 0;
  if (name === DESK_GROUP_2048) return 1;
  if (name === DESK_GROUP_OTHER) return 1000;
  if (name === DESK_GROUP_POOLS) return 1001;
  return 50;
}

export function compareDeskGroups(a: string, b: string): number {
  const diff = groupRank(a) - groupRank(b);
  if (diff !== 0) return diff;
  return a.localeCompare(b, "zh");
}

export function groupDesks<T extends { group?: string | null }>(desks: T[]) {
  const buckets = new Map<string, T[]>();
  for (const desk of desks) {
    const name = normalizeDeskGroup(desk.group);
    const list = buckets.get(name) ?? [];
    list.push(desk);
    buckets.set(name, list);
  }
  return [...buckets.keys()]
    .filter((name) => (buckets.get(name)?.length ?? 0) > 0)
    .sort(compareDeskGroups)
    .map((name) => ({ name, desks: buckets.get(name)! }));
}

/** Fill-slot labels. Never humanize execution pools as 同事 / Grok Bot names. */
export function executionPoolName(poolId: string, kind: string): string {
  if (poolId === "pool_noop" || kind === "noop") return "执行池 · noop";
  if (poolId === "pool_cursor" || kind === "cursor_account") return "执行池 · Cursor";
  if (kind === "bot_group") return "执行池 · 群组";
  const stripped = poolId.replace(/^pool_/, "").trim();
  if (!stripped || UUID_RE.test(stripped)) return "执行池";
  return `执行池 · ${stripped}`;
}

/** @deprecated Use executionPoolName — pools are not colleagues. */
export function humanDeskName(poolId: string, kind: string): string {
  return executionPoolName(poolId, kind);
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
  group?: string | null;
  section?: string | null;
  /** `bot` (default) | `channel`. Alias: `entity_kind`. */
  kind?: string | null;
  entity_kind?: string | null;
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
  const group = normalizeDeskGroup(input.group ?? input.section);
  const entityKind = normalizeHeartbeatKind(input.kind ?? input.entity_kind);
  const ts = h.now();
  const existing = h.db.select().from(agentHeartbeats).where(eq(agentHeartbeats.actorId, actor.id)).get();
  if (existing) {
    h.db
      .update(agentHeartbeats)
      .set({
        displayName,
        poolId,
        groupName: group,
        entityKind,
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
      groupName: group,
      entityKind,
      lastSeenAt: ts,
      ttlSeconds: ttl,
    }).run();
  }
  return {
    actor_id: actor.id,
    display_name: displayName,
    pool_id: poolId,
    group,
    kind: entityKind,
    entity_kind: entityKind,
    last_heartbeat: ts,
    ttl_seconds: ttl,
    expires_at: new Date(Date.parse(ts) + ttl * 1000).toISOString(),
  };
}

export type ExpireHeartbeatsInput = {
  /** Sweep channel-like rows when `channel` (default) or omitted. */
  kind?: string | null;
  entity_kind?: string | null;
  /** Delete one actor row (ops cleanup of a stuck channel heartbeat). */
  actor_id?: string | null;
};

/**
 * Clear bad channel / group-entity heartbeats so dogfood does not wait on TTL.
 * Default sweep is channel-like only — real bot rows are left alone.
 */
export function expireChannelHeartbeats(h: Harness, actor: Actor, input: ExpireHeartbeatsInput = {}) {
  requireRole(actor, ["decision_maker", "coordinator", "service"]);
  const actorId = input.actor_id?.trim() || "";
  if (actorId) {
    const row = h.db.select().from(agentHeartbeats).where(eq(agentHeartbeats.actorId, actorId)).get();
    if (!row) throw new HarnessError("not_found", `heartbeat ${actorId} not found`, 404);
    h.db.delete(agentHeartbeats).where(eq(agentHeartbeats.actorId, actorId)).run();
    return { deleted: 1, actor_ids: [actorId], kind: normalizeHeartbeatKind(row.entityKind) };
  }
  const wantKind = normalizeHeartbeatKind(input.kind ?? input.entity_kind ?? HEARTBEAT_KIND_CHANNEL);
  const beats = h.db.select().from(agentHeartbeats).all();
  const actorIds: string[] = [];
  for (const beat of beats) {
    const channelLike =
      wantKind === HEARTBEAT_KIND_CHANNEL
        ? isChannelLikeHeartbeat({
            displayName: beat.displayName,
            poolId: beat.poolId,
            entityKind: beat.entityKind,
          })
        : normalizeHeartbeatKind(beat.entityKind) === wantKind;
    if (!channelLike) continue;
    h.db.delete(agentHeartbeats).where(eq(agentHeartbeats.actorId, beat.actorId)).run();
    actorIds.push(beat.actorId);
  }
  return { deleted: actorIds.length, actor_ids: actorIds, kind: wantKind };
}

function deskRow(input: {
  id: string;
  name: string;
  presence: DeskPresence;
  last_heartbeat: string | null;
  source: "pool_seed" | "heartbeat";
  ttl_seconds: number | null;
  group: string;
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
    group: input.group,
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

/** Heartbeat desk busy/waiting only from assignments bound to this actor. Pool match is not enough. */
function presenceForAssignee(
  actorId: string,
  assignmentRows: Array<{ id: string; assigneeBotId?: string | null; status: string }>,
  runRows: Array<{ assignmentId: string; status: string }>,
  gateRows: Array<{ assignmentId: string | null; status: string }>,
): DeskPresence {
  const asgs = assignmentRows.filter((a) => a.assigneeBotId && a.assigneeBotId === actorId);
  if (asgs.length === 0) return "idle";
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
 * `display_name`, grouped by self-reported `group` / `section`.
 * `kind=channel` (and header-named heartbeats with no bot identity) are omitted —
 * Grok Bot channels are not desks. Seed execution pools are not Bot colleagues.
 * `include_pools` is a non-DM ops overlay labeled 「执行池 · …」.
 * Decision-maker always gets heartbeat agents only — seed 同事 never occupy
 * the primary roster, even if the query flag is set.
 * Expired heartbeats are omitted (no pool_seed fallback on the office roster).
 * Empty groups are omitted.
 */
export function listDesks(h: Harness, actor: Actor, opts: ListDesksOptions = {}) {
  requireRole(actor, ["decision_maker", "coordinator", "viewer", "service"]);
  const now = h.now();
  const includePools = Boolean(opts.includePools) && actor.role !== "decision_maker";
  const assignmentRows = h.db.select().from(assignments).all();
  const runRows = h.db.select().from(runs).all();
  const gateRows = h.db.select().from(gateInstances).all();
  const beats = h.db.select().from(agentHeartbeats).all();
  const live = beats.filter(
    (b) =>
      isLiveHeartbeat(b.lastSeenAt, b.ttlSeconds, now) &&
      !isChannelLikeHeartbeat({
        displayName: b.displayName,
        poolId: b.poolId,
        entityKind: b.entityKind,
      }),
  );

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
          group: DESK_GROUP_POOLS,
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
        presence: presenceForAssignee(beat.actorId, assignmentRows, runRows, gateRows),
        last_heartbeat: beat.lastSeenAt,
        source: "heartbeat",
        ttl_seconds: beat.ttlSeconds,
        group: normalizeDeskGroup(beat.groupName),
      }),
    );
  }

  const groups = groupDesks(desks);

  return {
    desks,
    groups,
    readonly: true as const,
    hitl: "待我拍板" as const,
    stub: live.length === 0,
    heartbeat_ttl_seconds: HEARTBEAT_TTL_SECONDS,
    include_pools: includePools,
  };
}
