import type { GateInstance, ReadyResult } from "../types/gate";

type LooseGate = Record<string, unknown>;

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function readReadyResult(raw: unknown): ReadyResult {
  if (!raw || typeof raw !== "object") {
    return { missing: [] };
  }
  const obj = raw as Record<string, unknown>;
  const missing =
    asStringArray(obj.missing) ??
    asStringArray(obj.missing_list) ??
    [];
  return {
    ok: typeof obj.ok === "boolean" ? obj.ok : undefined,
    missing,
  };
}

/** Prefer ready_result_json.missing[]; accept equivalent ready-result shapes. */
export function extractMissing(gate: GateInstance | LooseGate): string[] {
  const loose = gate as LooseGate;
  const fromJson = readReadyResult(loose.ready_result_json).missing;
  if (fromJson.length > 0) return fromJson;
  const fromResult = readReadyResult(loose.ready_result).missing;
  if (fromResult.length > 0) return fromResult;
  return asStringArray(loose.missing) ?? fromJson;
}

export function normalizeGate(raw: unknown): GateInstance {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid GateInstance");
  }
  const g = raw as LooseGate;
  const id = typeof g.id === "string" ? g.id : undefined;
  if (!id) throw new Error("GateInstance.id required");

  const versionRaw = g.version ?? g.expected_version;
  const version = typeof versionRaw === "number" ? versionRaw : Number(versionRaw);
  if (!Number.isFinite(version)) {
    throw new Error(`GateInstance ${id} missing version`);
  }

  const readyResult = readReadyResult(g.ready_result_json ?? g.ready_result);
  if (readyResult.missing.length === 0) {
    const alt = asStringArray(g.missing);
    if (alt) readyResult.missing = alt;
  }

  const status =
    g.status === "pending" || g.status === "ready" || g.status === "decided"
      ? g.status
      : "ready";

  return {
    id,
    version,
    status,
    goal_id: typeof g.goal_id === "string" ? g.goal_id : undefined,
    goal_title: typeof g.goal_title === "string" ? g.goal_title : undefined,
    goal_mode: g.goal_mode === "explore" || g.goal_mode === "deliver" ? g.goal_mode : undefined,
    assignment_id: typeof g.assignment_id === "string" ? g.assignment_id : undefined,
    predicate_id:
      typeof g.predicate_id === "string"
        ? g.predicate_id
        : typeof g.ready_predicate_id === "string"
          ? g.ready_predicate_id
          : "unknown",
    predicate_version:
      typeof g.predicate_version === "number" || typeof g.predicate_version === "string"
        ? g.predicate_version
        : 1,
    ready_at: typeof g.ready_at === "string" ? g.ready_at : undefined,
    ready_result_json: readyResult,
  };
}

export function normalizeList(raw: unknown): GateInstance[] {
  if (Array.isArray(raw)) return raw.map(normalizeGate);
  if (raw && typeof raw === "object") {
    const obj = raw as LooseGate;
    const items = obj.items ?? obj.gates ?? obj.data;
    if (Array.isArray(items)) return items.map(normalizeGate);
  }
  throw new Error("Unexpected GET /v1/gates response");
}

export function formatReadyAt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d) + " CST";
}
