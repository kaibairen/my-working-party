export const AUTHORITY_ACTIONS = [
  "external_send",
  "protected_merge",
  "over_budget",
  "destructive_delete",
  "privilege_escalation",
] as const;

export const LOW_RISK_ACTIONS = [
  "change_path",
  "create_file",
  "propose_assignment",
  "explore",
] as const;

export type PolicyTrack = "authority_gate" | "advisory_hint";
export type PolicyDecision = "allow" | "redirect_hint" | "require_gate" | "deny";

export type PolicyCheckInput = {
  action: string;
  track?: string;
  context?: Record<string, unknown>;
};

export type PolicyRedirect = {
  hint: string;
  fail_count: number;
  threshold: number;
};

export type PolicyCheckResult = {
  decision: PolicyDecision;
  track: PolicyTrack;
  reason_code: string;
  redirect: PolicyRedirect | null;
  action: string;
  blocks: boolean;
  creates_gate: boolean;
  hint?: string;
};

const AUTHORITY_SET = new Set<string>(AUTHORITY_ACTIONS);
const LOW_RISK_SET = new Set<string>(LOW_RISK_ACTIONS);

export function isAuthorityAction(action: string): boolean {
  return AUTHORITY_SET.has(action);
}

export function normalizeTrack(input: PolicyCheckInput): PolicyTrack {
  if (input.track === "authority_gate" || input.track === "advisory_hint") {
    return input.track;
  }
  return isAuthorityAction(input.action) ? "authority_gate" : "advisory_hint";
}

/**
 * Policy/Dial check. Authority whitelist is exactly five keys.
 * advisory_hint MUST NOT block dispatch / Run / Ready and MUST NOT create a GateInstance.
 */
export function checkPolicy(input: PolicyCheckInput): PolicyCheckResult {
  const action = input.action;
  const requestedTrack = input.track;
  const track = normalizeTrack(input);

  if (LOW_RISK_SET.has(action)) {
    return {
      decision: "allow",
      track: "advisory_hint",
      reason_code: "low_risk_not_whitelisted",
      redirect: null,
      action,
      blocks: false,
      creates_gate: false,
      hint: "low-risk exploration; not an authority gate",
    };
  }

  if (requestedTrack === "advisory_hint" || track === "advisory_hint") {
    const redirect =
      requestedTrack === "advisory_hint"
        ? { hint: "continue_without_human; advisory never blocks", fail_count: 0, threshold: 3 }
        : null;
    return {
      decision: requestedTrack === "advisory_hint" ? "redirect_hint" : "allow",
      track: "advisory_hint",
      reason_code: "advisory_hint_not_blocking",
      redirect,
      action,
      blocks: false,
      creates_gate: false,
      hint: "advisory_hint never blocks dispatch, run, or ready",
    };
  }

  if (isAuthorityAction(action)) {
    return {
      decision: "require_gate",
      track: "authority_gate",
      reason_code: "authority_whitelist",
      redirect: null,
      action,
      blocks: true,
      creates_gate: true,
    };
  }

  const failCount = Number(input.context?.fail_count ?? 0);
  if (failCount >= 3) {
    return {
      decision: "require_gate",
      track: "authority_gate",
      reason_code: "redirect_exhausted",
      redirect: null,
      action,
      blocks: true,
      creates_gate: true,
      hint: "consecutive redirect failures escalated",
    };
  }

  return {
    decision: "redirect_hint",
    track: "advisory_hint",
    reason_code: "redirect_before_human",
    redirect: { hint: "retry_with_alternate_path", fail_count: Number(input.context?.fail_count ?? 0), threshold: 3 },
    action,
    blocks: false,
    creates_gate: false,
    hint: "redirect before escalating to a human",
  };
}
