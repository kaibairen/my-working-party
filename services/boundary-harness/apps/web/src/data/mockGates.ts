import type { GateInstance } from "../types/gate";

/** Two screenshotable ready GateInstance rows (Inbox key = id + version). */
export const INITIAL_MOCK_GATES: GateInstance[] = [
  {
    id: "gin_01k8q2m0deliver",
    version: 12,
    status: "ready",
    goal_id: "gol_m0_domain_api",
    goal_title: "Ship Boundary Harness M0 Domain API",
    goal_mode: "deliver",
    assignment_id: "asn_cursor_pool_a",
    predicate_id: "deliver_ready_v1",
    predicate_version: 1,
    ready_at: "2026-09-18T08:02:14Z",
    ready_result_json: {
      ok: true,
      missing: ["ci_check:e2e", "screenshot:mobile"],
    },
  },
  {
    id: "gin_01k8q3safety",
    version: 3,
    status: "ready",
    goal_id: "gol_explore_predicates",
    goal_title: "Map Ready predicates without locking path",
    goal_mode: "explore",
    assignment_id: "asn_noop_research",
    predicate_id: "safety_only_v1",
    predicate_version: 1,
    ready_at: "2026-09-18T09:41:02Z",
    ready_result_json: {
      ok: true,
      missing: [],
    },
  },
];

/** Present in the store but MUST NOT appear in Inbox (status ≠ ready). */
export const HIDDEN_NON_READY_GATES: GateInstance[] = [
  {
    id: "gin_pending_must_not_list",
    version: 1,
    status: "pending",
    goal_title: "Should never appear in Inbox",
    goal_mode: "deliver",
    predicate_id: "deliver_ready_v1",
    predicate_version: 1,
    ready_result_json: { ok: false, missing: ["summary_md"] },
  },
];
