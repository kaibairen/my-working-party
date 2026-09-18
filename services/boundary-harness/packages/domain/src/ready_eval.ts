type Evidence = { kind: string };

export type DeliverReadyInput = {
  evidence?: Evidence[];
  github?: { is_draft?: boolean; checks_conclusion?: string } | null;
  noopContractOk?: boolean;
  runSucceeded?: boolean;
  openAuthorityEscalation?: boolean;
};

export type ReadyResult = {
  ok: boolean;
  missing: string[];
  predicate_id: string;
  predicate_version: number;
};

function hasKind(ev: Evidence[], k: string): boolean {
  return ev.some((e) => e.kind === k);
}

export function evalDeliverReadyV1(input: DeliverReadyInput): ReadyResult {
  const missing: string[] = [];
  void input.runSucceeded;
  if (!hasKind(input.evidence || [], "summary_md")) missing.push("evidence:summary_md");
  const gh = input.github;
  const ghOk = gh != null && gh.is_draft === false && gh.checks_conclusion === "success";
  const noopOk = hasKind(input.evidence || [], "artifact_uri") && input.noopContractOk === true;
  if (!ghOk && !noopOk) {
    if (gh == null) {
      if (!hasKind(input.evidence || [], "artifact_uri")) missing.push("evidence:artifact_uri");
      if (input.noopContractOk !== true) missing.push("noop_or_offline_contract");
    } else {
      if (gh.is_draft) missing.push("github:is_draft_false");
      if (gh.checks_conclusion !== "success") missing.push("github:checks_success");
    }
  }
  return { ok: missing.length === 0, missing, predicate_id: "deliver_ready_v1", predicate_version: 1 };
}

export function evalSafetyOnlyV1(input: DeliverReadyInput): ReadyResult {
  const missing: string[] = [];
  if (input.openAuthorityEscalation) missing.push("policy:open_authority_escalation");
  return { ok: missing.length === 0, missing, predicate_id: "safety_only_v1", predicate_version: 1 };
}
