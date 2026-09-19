/** Main-list desks — keep in sync with office.html `visibleOfficeDesks`. */

export const DEFAULT_HEARTBEAT_TTL_SECONDS = 90;

/** Pool-seed fixture labels. Never paint these as coworkers. */
const SEED_NAME_RE = /^(交付|Cursor|群组)\s*同事/i;
const SEED_ID_RE = /^(pool[_-]?)?(noop|cursor)$/i;

export type OfficeDesk = {
  id?: string;
  name?: string | null;
  avatar?: string | null;
  presence?: string | null;
  status?: string | null;
  last_heartbeat?: string | null;
  last_seen_at?: string | null;
  last_heartbeat_at?: string | null;
  heartbeat_fresh?: boolean | null;
  source?: string | null;
  ttl_seconds?: number | null;
  heartbeat_ttl_seconds?: number | null;
};

export type DesksEnvelope = {
  desks?: OfficeDesk[] | null;
  heartbeat_ttl_seconds?: number | null;
};

export function lastHeartbeatOf(desk: OfficeDesk): string | null {
  const raw = desk.last_heartbeat ?? desk.last_seen_at ?? desk.last_heartbeat_at ?? null;
  if (!raw) return null;
  return Number.isFinite(Date.parse(raw)) ? raw : null;
}

export function looksLikePoolSeedName(name: unknown): boolean {
  const n = String(name ?? "").trim();
  if (!n || n === "同事") return true;
  if (SEED_NAME_RE.test(n)) return true;
  if (SEED_ID_RE.test(n)) return true;
  return false;
}

export function deskTtlSeconds(desk: OfficeDesk, envelopeTtl?: number | null): number {
  const ttl = Number(desk.ttl_seconds ?? desk.heartbeat_ttl_seconds ?? envelopeTtl);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_HEARTBEAT_TTL_SECONDS;
}

/**
 * Real Domain presence only. Seeds / forever-stale rows stay off the main list.
 * `heartbeat_fresh === false` always hides, even if last_heartbeat is recent.
 */
export function isFreshHeartbeat(
  desk: OfficeDesk,
  nowMs = Date.now(),
  envelopeTtl?: number | null,
): boolean {
  if (desk.heartbeat_fresh === false) return false;
  if (String(desk.source ?? "") === "pool_seed") return false;
  const last = lastHeartbeatOf(desk);
  if (!last) return false;
  const ageSec = (nowMs - Date.parse(last)) / 1000;
  if (!Number.isFinite(ageSec)) return false;
  if (ageSec > deskTtlSeconds(desk, envelopeTtl)) return false;
  if (desk.heartbeat_fresh === true) return true;
  if (String(desk.source ?? "") === "heartbeat") return true;
  return true;
}

export function isVisibleOfficeDesk(
  desk: OfficeDesk,
  nowMs = Date.now(),
  envelopeTtl?: number | null,
): boolean {
  if (looksLikePoolSeedName(desk.name)) return false;
  return isFreshHeartbeat(desk, nowMs, envelopeTtl);
}

export function visibleOfficeDesks(
  desks: OfficeDesk[] | null | undefined,
  envelope: DesksEnvelope = {},
  nowMs = Date.now(),
): OfficeDesk[] {
  const ttl = envelope.heartbeat_ttl_seconds;
  return (desks ?? []).filter((d) => isVisibleOfficeDesk(d, nowMs, ttl));
}
