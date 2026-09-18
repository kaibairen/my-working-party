export const DIAL_WHITELIST = [
  "external_send",
  "protected_merge",
  "over_budget",
  "destructive_delete",
  "privilege_escalation",
] as const;

export type DialAuthorityAction = (typeof DIAL_WHITELIST)[number];

export type PolicyTrack = "authority_gate" | "advisory_hint";
export type PolicyDecision = "allow" | "redirect_hint" | "require_gate" | "deny";

export type PolicyCheckResult = {
  decision: PolicyDecision;
  track: PolicyTrack;
  reason_code: string;
};

const NEVER_AUTHORITY = new Set([
  "change_path",
  "create_workspace_file",
  "propose_assignment",
  "read",
  "search",
]);

export function policyCheck(action: string): PolicyCheckResult {
  if (NEVER_AUTHORITY.has(action)) {
    return { decision: "allow", track: "advisory_hint", reason_code: "path_autonomy" };
  }
  if ((DIAL_WHITELIST as readonly string[]).includes(action)) {
    return { decision: "redirect_hint", track: "authority_gate", reason_code: `whitelist:${action}` };
  }
  return { decision: "allow", track: "advisory_hint", reason_code: "audit_only" };
}

export function blocksDispatch(r: PolicyCheckResult): boolean {
  return r.track === "authority_gate" && r.decision !== "allow";
}
