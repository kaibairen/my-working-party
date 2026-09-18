/** Shapes aligned with openapi/m0_fragment.yaml + Gate Inbox IA (M2). */

export type Decision = "pass" | "revise" | "defer";

export type GateStatus = "pending" | "ready" | "decided";

export type GoalMode = "explore" | "deliver";

export type ReadyResult = {
  ok?: boolean;
  missing: string[];
};

export type GateInstance = {
  id: string;
  version: number;
  status: GateStatus;
  goal_id?: string;
  goal_title?: string;
  goal_mode?: GoalMode;
  assignment_id?: string;
  predicate_id: string;
  predicate_version: number | string;
  ready_at?: string;
  ready_result_json: ReadyResult;
};

export type GateListResponse = {
  items: GateInstance[];
};

/** OpenAPI GateDecideRequest — field is `version`, not `expected_version`. */
export type GateDecideRequest = {
  decision: Decision;
  version: number;
  note?: string;
  structural_change?: boolean;
};

export type ErrorBody = {
  code: string;
  message?: string;
  keys?: string[];
};

export type DataSource = "mock" | "api";

export type SseEventType =
  | "gate.ready"
  | "run.failed"
  | "budget.exceeded"
  | "freeze.changed";

export type SsePayload = {
  gate_instance_id?: string;
  goal_id?: string;
  run_id?: string;
  missing?: string[];
  enabled?: boolean;
  message?: string;
};

export type InboxException = {
  id: string;
  type: Exclude<SseEventType, "gate.ready"> | "run.succeeded";
  at: string;
  text: string;
};
