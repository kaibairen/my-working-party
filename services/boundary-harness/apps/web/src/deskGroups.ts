/** Shell-side desk grouping. Only live heartbeat rows — never pool seeds. */

export const FAKE_SEED_DESK_NAMES = ["交付同事", "Cursor 同事", "群组同事"] as const;
export const UNGROUPED_LABEL = "未分组";
export const POOL_GROUP_LABELS: Record<string, string> = {
  pool_noop: "交付组",
  pool_cursor: "调研组",
};

const FAKE_SEED_RE = /交付同事|Cursor 同事|群组同事/;
const PREFERRED_GROUPS = ["交付组", "调研组"];

export type DeskLike = {
  name?: string;
  source?: string;
  last_heartbeat?: string | null;
  group?: string | null;
  group_id?: string | null;
  team?: string | null;
  pool_label?: string | null;
  pool_id?: string | null;
};

export function isTrustedDesk(desk: DeskLike | null | undefined): boolean {
  if (!desk) return false;
  if (FAKE_SEED_RE.test(String(desk.name ?? ""))) return false;
  return Boolean(desk.last_heartbeat) && desk.source === "heartbeat";
}

export function deskGroupLabel(desk: DeskLike): string {
  const explicit = [desk.group, desk.group_id, desk.team, desk.pool_label]
    .map((value) => String(value ?? "").trim())
    .find((value) => value && !FAKE_SEED_RE.test(value));
  if (explicit) return explicit;
  const poolId = String(desk.pool_id ?? "").trim();
  if (poolId && POOL_GROUP_LABELS[poolId]) return POOL_GROUP_LABELS[poolId];
  return UNGROUPED_LABEL;
}

export function groupDesks(desks: DeskLike[] | null | undefined): { label: string; desks: DeskLike[] }[] {
  const buckets = new Map<string, DeskLike[]>();
  for (const desk of desks ?? []) {
    if (!isTrustedDesk(desk)) continue;
    const label = deskGroupLabel(desk);
    const list = buckets.get(label) ?? [];
    list.push(desk);
    buckets.set(label, list);
  }
  return [...buckets.keys()]
    .sort((a, b) => {
      if (a === UNGROUPED_LABEL) return 1;
      if (b === UNGROUPED_LABEL) return -1;
      const ia = PREFERRED_GROUPS.indexOf(a);
      const ib = PREFERRED_GROUPS.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b, "zh");
    })
    .map((label) => ({ label, desks: buckets.get(label) ?? [] }));
}
