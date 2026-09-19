/** Desk presence TTL paint — keep in sync with office.html `paintDeskPresence`. */

export const DEFAULT_DESK_TTL_SECONDS = 90;

export const DESK_STATUS_ZH = {
  busy: "在忙",
  waiting_evidence: "等证据",
  idle: "空闲",
} as const;

export type DeskPresence = keyof typeof DESK_STATUS_ZH;

export type DeskPresenceInput = {
  presence?: string | null;
  last_seen_at?: string | null;
  last_heartbeat?: string | null;
  last_heartbeat_at?: string | null;
  heartbeat_fresh?: boolean | null;
  source?: string | null;
  ttl_seconds?: number | null;
  heartbeat_ttl_seconds?: number | null;
  nowMs?: number;
};

/** Thin alias: #15 last_heartbeat / last_seen_at; also last_heartbeat_at if a later rebase ships it. */
export function lastSeenAt(desk: DeskPresenceInput): string | null {
  const raw = desk.last_seen_at ?? desk.last_heartbeat ?? desk.last_heartbeat_at ?? null;
  if (!raw) return null;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? raw : null;
}

export function deskTtlSeconds(desk: DeskPresenceInput): number {
  const ttl = Number(desk.ttl_seconds ?? desk.heartbeat_ttl_seconds);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_DESK_TTL_SECONDS;
}

/**
 * Stale only when a heartbeat timestamp exists AND
 * (`heartbeat_fresh === false` OR last_seen older than ttl).
 * Missing heartbeat keeps the API work projection (never expire busy).
 */
export function isHeartbeatStale(desk: DeskPresenceInput): boolean {
  const seen = lastSeenAt(desk);
  if (!seen) return false;
  const window = deskTtlSeconds(desk);
  const now = desk.nowMs ?? Date.now();
  const ageSec = (now - Date.parse(seen)) / 1000;
  const olderThanTtl = !Number.isFinite(ageSec) || ageSec > window;
  const freshFlag =
    typeof desk.heartbeat_fresh === "boolean"
      ? desk.heartbeat_fresh
      : desk.source == null
        ? undefined
        : desk.source === "heartbeat";
  return freshFlag === false || olderThanTtl;
}

export function normalizePresence(raw: string | null | undefined): DeskPresence {
  if (raw === "busy" || raw === "waiting_evidence" || raw === "idle") return raw;
  return "idle";
}

/**
 * Never paint stale heartbeats as busy. Prefer the API presence after TTL
 * (`waiting_evidence` | `idle`). If the API still says busy, fall back to idle.
 */
export function paintDeskPresence(desk: DeskPresenceInput): {
  presence: DeskPresence;
  status: string;
  stale: boolean;
  heartbeat_fresh: boolean;
  last_seen_at: string | null;
  ttl_seconds: number;
} {
  const api = normalizePresence(desk.presence);
  const stale = isHeartbeatStale(desk);
  const ttl_seconds = deskTtlSeconds(desk);
  const seen = lastSeenAt(desk);
  if (api === "busy" && stale) {
    const fallback: DeskPresence = "idle";
    return {
      presence: fallback,
      status: DESK_STATUS_ZH[fallback],
      stale: true,
      heartbeat_fresh: false,
      last_seen_at: seen,
      ttl_seconds,
    };
  }
  return {
    presence: api,
    status: DESK_STATUS_ZH[api],
    stale,
    heartbeat_fresh: Boolean(seen) && !stale,
    last_seen_at: seen,
    ttl_seconds,
  };
}

export function pollIntervalMs(ttlSeconds: number | null | undefined): number {
  const ttl = Number(ttlSeconds);
  const window = Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_DESK_TTL_SECONDS;
  return Math.max(5_000, Math.min(window, DEFAULT_DESK_TTL_SECONDS) * 1000);
}

export function heartbeatLabelZh(input: {
  last_seen_at: string | null;
  heartbeat_fresh: boolean;
  stale: boolean;
  relative: string;
}): string {
  if (!input.last_seen_at) return "尚无心跳";
  if (input.stale || !input.heartbeat_fresh) return `心跳过期 · ${input.relative}`;
  return `心跳新鲜 · ${input.relative}`;
}
