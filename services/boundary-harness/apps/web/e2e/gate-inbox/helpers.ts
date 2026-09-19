import { test as base, chromium, expect, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const shotDir = join(dirname(fileURLToPath(import.meta.url)), "../../../../artifacts/screenshots");
export const evidenceDir = join(dirname(fileURLToPath(import.meta.url)), "../../evidence");
mkdirSync(shotDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

export const test = base.extend<{ page: Page }>({
  page: async ({ page: defaultPage }, use) => {
    if (!process.env.CDP_URL) {
      await use(defaultPage);
      return;
    }
    const browser: Browser = await chromium.connectOverCDP(process.env.CDP_URL);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = await context.newPage();
    await use(page);
    await page.close();
  },
});

export { expect };

export type Json = Record<string, unknown>;

const jsonHeaders = (role: string, actor: string) => ({
  "content-type": "application/json",
  authorization: `Bearer ${role}:${actor}`,
  "x-harness-role": role,
  "x-harness-actor": actor,
  "x-harness-entry": "mcp",
});

export const headers = {
  coordinator: jsonHeaders("coordinator", "coord-1"),
  executor: jsonHeaders("executor", "exec-1"),
  decisionMaker: jsonHeaders("decision_maker", "dm-1"),
};

export async function api<T = Json>(
  baseURL: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${baseURL}${path}`, init);
  const text = await res.text();
  let body = {} as T;
  try {
    body = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    body = { raw: text } as T;
  }
  return { status: res.status, body };
}

async function requireOk<T>(label: string, result: { status: number; body: T }, ok: number[] = [200, 201]): Promise<T> {
  if (!ok.includes(result.status)) {
    throw new Error(`${label} failed ${result.status}: ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

function uniq(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Visible Inbox titles — never e2e-* / g-{digits} fixture junk. */
export const HUMAN_GOAL = {
  deliver: "周报交付验收",
  pending: "周报交付验收",
  authority: "清理临时分支",
  explore: "调研备忘",
} as const;

export const JUNK_TITLE_RE = /e2e|g-[0-9]/i;

export async function drainReadyGates(baseURL: string) {
  const { body } = await api<{ gates: Array<{ id: string; version: number }> }>(
    baseURL,
    "/v1/gates?status=ready",
    { headers: headers.decisionMaker },
  );
  for (const gate of body.gates ?? []) {
    await api(baseURL, `/v1/gates/${gate.id}/decide`, {
      method: "POST",
      headers: headers.decisionMaker,
      body: JSON.stringify({ decision: "defer", version: gate.version }),
    });
  }
}

export async function seedDeliverPending(baseURL: string, title = HUMAN_GOAL.deliver) {
  const goal = await requireOk(
    "create goal",
    await api<{ id: string; title: string }>(baseURL, "/v1/goals", {
      method: "POST",
      headers: headers.coordinator,
      body: JSON.stringify({
        title,
        mode: "deliver",
        coordinator_ref: "coord-1",
      }),
    }),
  );
  const asg = await requireOk(
    "fill assignment",
    await api<{ id: string }>(baseURL, `/v1/goals/${goal.id}/assignments`, {
      method: "POST",
      headers: headers.coordinator,
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "pending only", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
      }),
    }),
  );
  const run = await requireOk(
    "dispatch",
    await api<{ id: string; status: string }>(baseURL, `/v1/assignments/${asg.id}/dispatch`, {
      method: "POST",
      headers: headers.coordinator,
      body: JSON.stringify({ idempotency_key: uniq("pending") }),
    }),
  );
  const pending = await requireOk(
    "list gates",
    await api<{ gates: Array<{ id: string; status: string; version: number }> }>(
      baseURL,
      `/v1/gates?goal_id=${goal.id}`,
      { headers: headers.coordinator },
    ),
  );
  const gate = (pending.gates ?? []).find((g) => g.status === "pending");
  return { goal, assignment: asg, run, gate };
}

export async function seedDeliverReady(baseURL: string, title = HUMAN_GOAL.deliver) {
  const seeded = await seedDeliverPending(baseURL, title);
  await requireOk(
    "attach evidence",
    await api(baseURL, `/v1/runs/${seeded.run.id}/evidence`, {
      method: "POST",
      headers: headers.executor,
      body: JSON.stringify({
        items: [
          { kind: "summary_md", uri: "file://summary.md" },
          { kind: "artifact_uri", uri: "file://out.tgz" },
        ],
      }),
    }),
  );
  const ready = await requireOk(
    "list ready",
    await api<{
      gates: Array<{
        id: string;
        status: string;
        version: number;
        assignment_id?: string;
        predicate_id?: string;
        predicate_version?: number;
        ready_at?: string;
        ready_result?: { ok?: boolean; missing?: string[] };
      }>;
    }>(baseURL, `/v1/gates?status=ready&goal_id=${seeded.goal.id}`, { headers: headers.decisionMaker }),
  );
  const gate = (ready.gates ?? [])[0];
  return { ...seeded, gate };
}

export async function seedAuthorityReady(baseURL: string, action = "destructive_delete") {
  const goal = await requireOk(
    "create explore safety goal",
    await api<{ id: string }>(baseURL, "/v1/goals", {
      method: "POST",
      headers: headers.coordinator,
      body: JSON.stringify({
        title: HUMAN_GOAL.authority,
        mode: "explore",
        coordinator_ref: "coord-1",
        gate_template_id: "safety_only_v1",
      }),
    }),
  );
  const check = await requireOk(
    "policy check",
    await api<{
      gate_instance?: {
        id: string;
        status: string;
        version: number;
        ready_result?: { missing?: string[] };
      };
    }>(baseURL, "/v1/policy/check", {
      method: "POST",
      headers: headers.executor,
      body: JSON.stringify({
        action,
        track: "authority_gate",
        goal_id: goal.id,
        context: {},
      }),
    }),
  );
  return { goal, gate: check.gate_instance };
}

/** Bot self-report so the office roster shows a real name (not a seed pool). */
export async function seedHeartbeat(
  baseURL: string,
  opts: { actor?: string; display_name: string; pool_id?: string; ttl_seconds?: number },
) {
  const actor = opts.actor ?? "bot-1";
  return requireOk(
    "heartbeat",
    await api(baseURL, "/v1/agents/heartbeat", {
      method: "POST",
      headers: jsonHeaders("executor", actor),
      body: JSON.stringify({
        display_name: opts.display_name,
        pool_id: opts.pool_id,
        ttl_seconds: opts.ttl_seconds,
      }),
    }),
  );
}

/** Fill an assignment without dispatch so a bound heartbeat desk projects 在忙. */
export async function seedBusyDesk(baseURL: string, poolId = "pool_cursor") {
  const goal = await requireOk(
    "create busy-desk goal",
    await api<{ id: string }>(baseURL, "/v1/goals", {
      method: "POST",
      headers: headers.coordinator,
      body: JSON.stringify({
        title: HUMAN_GOAL.explore,
        mode: "explore",
        coordinator_ref: "coord-1",
      }),
    }),
  );
  const asg = await requireOk(
    "fill busy desk",
    await api<{ id: string; status: string }>(baseURL, `/v1/goals/${goal.id}/assignments`, {
      method: "POST",
      headers: headers.coordinator,
      body: JSON.stringify({
        pool_id: poolId,
        brief: { outcome: "presence only", constraints: [], evidence_shape: ["summary_md"] },
      }),
    }),
  );
  return { goal, assignment: asg };
}

export async function seedExploreNoGate(baseURL: string) {
  const goal = await requireOk(
    "create explore goal",
    await api<{ id: string }>(baseURL, "/v1/goals", {
      method: "POST",
      headers: headers.coordinator,
      body: JSON.stringify({
        title: HUMAN_GOAL.explore,
        mode: "explore",
        coordinator_ref: "coord-1",
      }),
    }),
  );
  const asg = await requireOk(
    "fill explore assignment",
    await api<{ id: string }>(baseURL, `/v1/goals/${goal.id}/assignments`, {
      method: "POST",
      headers: headers.coordinator,
      body: JSON.stringify({
        pool_id: "pool_noop",
        brief: { outcome: "chat only", constraints: [], evidence_shape: ["summary_md"] },
      }),
    }),
  );
  const run = await requireOk(
    "dispatch explore",
    await api<{ id: string; status: string }>(baseURL, `/v1/assignments/${asg.id}/dispatch`, {
      method: "POST",
      headers: headers.coordinator,
      body: JSON.stringify({ idempotency_key: uniq("explore") }),
    }),
  );
  return { goal, assignment: asg, run };
}

export const VERBAL_DONE_RE =
  /标记完成|mark done|mark as done|i(?:'|’)m done|我确认好了|我确认了|口头完成/i;
export const CANVAS_CTA_RE = /去画布看进度|go to canvas|view progress on canvas|open canvas/i;
export const RUN_GREEN_PASS_RE = /Run 绿了直接通过|run succeeded.?pass|pass because run (?:is )?green/i;
export const PLEASE_APPROVE_ONLY_RE = /请批准/;
export const MISSING_EVIDENCE_FAKE_RE = /缺证据|missing evidence required/;

export async function confirmPass(page: Page) {
  await page.getByTestId("decide-pass").click();
  await page.getByTestId("decide-pass-confirm").click();
}

export async function confirmRevise(page: Page) {
  await page.getByTestId("decide-revise").click();
  await page.getByTestId("decide-revise-confirm").click();
}
