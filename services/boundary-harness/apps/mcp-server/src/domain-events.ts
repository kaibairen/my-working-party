/**
 * P0-D Bridge hook: Domain outbox → wake assignee bots.
 * Gloves ≠ path supervision; never attach_evidence here.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type DomainOutboundEnvelope = {
  id: string; // outbox_id
  type: string;
  created_at?: string;
  payload: Record<string, unknown>;
};

export type WakeResult = {
  outbox_id: string;
  type: string;
  action: "woke" | "skipped_no_assignee" | "skipped_duplicate" | "skipped_unknown_type" | "accepted_noop";
  assignee_bot_ids: string[];
  note?: string;
};

const seen = new Set<string>();
const MAX_SEEN = 10_000;

const WAKE_TYPES = new Set(["goal.status_changed", "gate.ready", "stage.unlocked"]);

export function resetWakeIdempotencyForTests() {
  seen.clear();
}

function remember(id: string): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > MAX_SEEN) {
    const first = seen.values().next().value as string | undefined;
    if (first) seen.delete(first);
  }
  return true;
}

export function extractAssigneeBotIds(payload: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const one = payload.assignee_bot_id;
  if (typeof one === "string" && one.trim()) ids.push(one.trim());
  const many = payload.assignee_bot_ids;
  if (Array.isArray(many)) {
    for (const x of many) {
      if (typeof x === "string" && x.trim()) ids.push(x.trim());
    }
  }
  return [...new Set(ids)];
}

export function verifyWebhookHmac(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string | undefined,
): boolean {
  if (!secret) return true; // HMAC optional / can be off
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = signatureHeader.replace(/^sha256=/i, "").trim();
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(got, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Build wake note — reminder only, not a playbook. */
export function buildWakeNote(type: string, payload: Record<string, unknown>): string {
  const goal = String(payload.goal_id ?? "");
  if (type === "gate.ready") {
    return `Harness gate.ready goal=${goal} gate=${payload.gate_instance_id ?? ""} — 戴 :8787 手套自挂证据或读 Ready（不代路径）`;
  }
  if (type === "goal.status_changed") {
    return `Harness goal.status_changed goal=${goal} status_line=${payload.status_line ?? ""} — 戴手套自处理（不代 attach）`;
  }
  if (type === "stage.unlocked") {
    return `Harness stage.unlocked goal=${goal} stage=${payload.stage_key ?? ""} — 下游可填；戴手套自挂`;
  }
  return `Harness event ${type} goal=${goal}`;
}

/**
 * Handle one Domain outbound event.
 * Wake transport is pluggable; default logs + records (P0-B bind table may make this a real ping later).
 */
export async function handleDomainOutboundEvent(
  env: DomainOutboundEnvelope,
  opts?: {
    wake?: (botId: string, note: string, env: DomainOutboundEnvelope) => Promise<void> | void;
  },
): Promise<WakeResult> {
  const outbox_id = String(env.id ?? "");
  const type = String(env.type ?? "");
  if (!outbox_id) {
    return { outbox_id: "", type, action: "skipped_unknown_type", assignee_bot_ids: [], note: "missing id" };
  }
  if (!remember(outbox_id)) {
    return { outbox_id, type, action: "skipped_duplicate", assignee_bot_ids: [] };
  }
  if (!WAKE_TYPES.has(type)) {
    return { outbox_id, type, action: "skipped_unknown_type", assignee_bot_ids: [] };
  }
  const payload = env.payload ?? {};
  const assignee_bot_ids = extractAssigneeBotIds(payload);
  if (assignee_bot_ids.length === 0) {
    return {
      outbox_id,
      type,
      action: "skipped_no_assignee",
      assignee_bot_ids: [],
      note: "no assignee_bot_id — human SSE may still deliver",
    };
  }
  const note = buildWakeNote(type, payload);
  const wake =
    opts?.wake ??
    (async (botId: string, n: string) => {
      // Default: structured log only — real side-channel ping lands with P0-B bot bind.
      console.log(JSON.stringify({ harness_wake: true, bot_id: botId, note: n, outbox_id, type }));
    });
  for (const botId of assignee_bot_ids) {
    await wake(botId, note, env);
  }
  return { outbox_id, type, action: "woke", assignee_bot_ids, note };
}
