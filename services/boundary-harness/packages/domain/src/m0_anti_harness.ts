import { parseBriefOrThrow, type BriefV1 } from "./brief_v1.js";
import { evalDeliverReadyV1 } from "./ready_eval.js";
import { policyCheck, blocksDispatch, type PolicyCheckResult } from "./dial_policy.js";

export type GoalInput = {
  id?: string;
  mode: "explore" | "deliver";
  coordinator_ref: string;
  gate_template_id?: string | null;
  gateTemplate?: string;
  gateDefs?: Array<Record<string, unknown> & { id: string }>;
  dispatch_policy?: "coordinator_only" | "human_allowed";
  exception_grant?: boolean;
  title?: string;
};

export type Store = {
  freeze: boolean;
  goals: Map<string, GoalInput & { id: string; gateDefs: Array<Record<string, unknown> & { id: string }> }>;
  gateDefs: Map<string, Record<string, unknown> & { id: string }>;
  gateInstances: Map<string, { id: string; status: string }>;
  assignments: Map<string, { id: string; goalId: string; brief: BriefV1; status: string }>;
  runs: Map<string, { id: string; assignmentId: string; status: string }>;
  outbox: unknown[];
};

export function createStore(): Store {
  return {
    freeze: false,
    goals: new Map(),
    gateDefs: new Map(),
    gateInstances: new Map(),
    assignments: new Map(),
    runs: new Map(),
    outbox: [],
  };
}

export function createGoal(store: Store, g: GoalInput) {
  if (g.mode === "deliver" && (!g.gateDefs || g.gateDefs.length === 0)) {
    const e = new Error("deliver_requires_gatedef") as Error & { status: number };
    e.status = 400;
    throw e;
  }
  if (g.mode === "explore" && g.gateTemplate === "deliver_ready_v1") {
    const e = new Error("explore_must_not_default_deliver_ready") as Error & { status: number };
    e.status = 422;
    throw e;
  }
  const id = g.id || `g_${store.goals.size + 1}`;
  const defs: Array<Record<string, unknown> & { id: string }> = [];
  if (g.mode === "explore" && (g.gate_template_id == null || g.gate_template_id === "")) {
    // zero deliver GateDef
  } else if (g.gateDefs) {
    for (const d of g.gateDefs) defs.push({ ...d, goal_id: id });
  }
  store.goals.set(id, { ...g, id, gateDefs: defs });
  for (const d of defs) store.gateDefs.set(d.id, d);
  return store.goals.get(id);
}

export function fillAssignment(
  store: Store,
  goalId: string,
  brief: unknown,
  actorRole = "coordinator",
) {
  parseBriefOrThrow(brief);
  if (actorRole === "human" || actorRole === "decision_maker") {
    const goal = store.goals.get(goalId);
    if (!goal?.exception_grant && goal?.dispatch_policy !== "human_allowed") {
      const e = new Error("human_dispatch_forbidden") as Error & { status: number };
      e.status = 403;
      throw e;
    }
  }
  const id = `a_${store.assignments.size + 1}`;
  store.assignments.set(id, { id, goalId, brief: brief as BriefV1, status: "queued" });
  return store.assignments.get(id);
}

export function dispatch(
  store: Store,
  assignmentId: string,
  { role = "coordinator", canvasSession = null }: { role?: string; canvasSession?: unknown } = {},
) {
  void canvasSession; // canvas never required
  if (store.freeze) {
    const e = new Error("freeze_active") as Error & { status: number };
    e.status = 423;
    throw e;
  }
  if (role === "executor") {
    const e = new Error("executor_forbidden") as Error & { status: number };
    e.status = 403;
    throw e;
  }
  const id = `r_${store.runs.size + 1}`;
  store.runs.set(id, { id, assignmentId, status: "succeeded" });
  return store.runs.get(id);
}

export function applyPolicy(store: Store, action: string) {
  const r = policyCheck(action);
  if (r.track === "advisory_hint") {
    return { policy: r, gateCreated: false, dispatchBlocked: blocksDispatch(r) };
  }
  if (r.decision === "require_gate" || r.decision === "redirect_hint") {
    const create = r.decision === "require_gate";
    if (create) {
      const gid = `gi_${store.gateInstances.size + 1}`;
      store.gateInstances.set(gid, { id: gid, status: "pending" });
    }
    return { policy: r, gateCreated: create, dispatchBlocked: blocksDispatch(r) };
  }
  return { policy: r, gateCreated: false, dispatchBlocked: false };
}

export function tryReadyFromChatDone() {
  return { status: "pending", reason: "chat_done_ignored" };
}

export function tryReadyFromRunSucceeded(run: { status: string }) {
  return { status: "pending", runStatus: run.status };
}

export function assignmentSuccessNeGatePass(
  assignment: { status: string },
  gate: { status: string; decided?: boolean } | undefined,
) {
  return !(assignment.status === "succeeded" && gate?.status === "ready" && !gate.decided);
}

export function noAutoDowngrade(goal: { mode: string }) {
  return goal.mode === "deliver";
}

export function evalReadySnapshotsOnly(input: {
  evidence?: { kind: string }[];
  github_snapshot?: { is_draft?: boolean; checks_conclusion?: string } | null;
  noopContractOk?: boolean;
  fetchGitHub?: boolean;
}) {
  if (input.fetchGitHub) throw new Error("network_forbidden");
  return evalDeliverReadyV1({
    evidence: input.evidence,
    github: input.github_snapshot ?? null,
    noopContractOk: input.noopContractOk,
  });
}

export { parseBriefOrThrow, evalDeliverReadyV1, policyCheck, blocksDispatch };
export type { PolicyCheckResult };
