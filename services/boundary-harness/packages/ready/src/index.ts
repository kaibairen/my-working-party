export const SAFETY_ONLY_V1 = {
  id: "safety_only_v1",
  version: 1,
  all: [
    {
      type: "policy_clearance",
      require: "no_open_authority_escalation",
    },
  ],
} as const;

export const DELIVER_READY_V1 = {
  id: "deliver_ready_v1",
  version: 1,
  all: [
    {
      type: "run_finished",
    },
    {
      type: "evidence_present",
      kinds: ["summary_md"],
    },
    {
      type: "any",
      of: [
        {
          type: "all",
          items: [
            { type: "github_pr", is_draft: false },
            { type: "github_checks", conclusion: "success" },
          ],
        },
        {
          type: "all",
          items: [
            { type: "evidence_present", kinds: ["artifact_uri"] },
            { type: "noop_or_offline_contract", ok: true },
          ],
        },
      ],
    },
  ],
} as const;

/** Research-stage Ready. Report artifact only — chat / oral / screenshot never unlock. */
export const RESEARCH_READY_V1 = {
  id: "research_ready_v1",
  version: 1,
  all: [
    {
      type: "evidence_present",
      kinds: ["report_md"],
    },
  ],
} as const;

/**
 * Deliver-node variant: report_md writeup + the same github / noop contract as deliver_ready_v1.
 * Does not rewrite deliver_ready_v1@1. Screenshot / verbal done never satisfy this.
 */
export const DELIVER_REPORT_READY_V1 = {
  id: "deliver_report_ready_v1",
  version: 1,
  all: [
    {
      type: "run_finished",
    },
    {
      type: "evidence_present",
      kinds: ["report_md"],
    },
    {
      type: "any",
      of: [
        {
          type: "all",
          items: [
            { type: "github_pr", is_draft: false },
            { type: "github_checks", conclusion: "success" },
          ],
        },
        {
          type: "all",
          items: [
            { type: "evidence_present", kinds: ["artifact_uri"] },
            { type: "noop_or_offline_contract", ok: true },
          ],
        },
      ],
    },
  ],
} as const;

export const FROZEN_PREDICATES = {
  safety_only_v1: { 1: SAFETY_ONLY_V1 },
  deliver_ready_v1: { 1: DELIVER_READY_V1 },
  research_ready_v1: { 1: RESEARCH_READY_V1 },
  deliver_report_ready_v1: { 1: DELIVER_REPORT_READY_V1 },
} as const;

export type EvidenceKind =
  | "pr"
  | "report_md"
  | "summary_md"
  | "screenshot"
  | "ci_check"
  | "artifact_uri";

export type ReadyEvidence = {
  kind: string;
  uri: string;
  shadow?: boolean;
};

export type ReadyGithubSnapshot = {
  is_draft: boolean;
  checks_conclusion: string | null;
};

export type ReadyPolicyEvent = {
  decision: string;
  track: string;
  closed: boolean;
};

export type ReadyContext = {
  evidence: ReadyEvidence[];
  githubSnapshots: ReadyGithubSnapshot[];
  policyEvents: ReadyPolicyEvent[];
  noopOrOfflineContract: boolean;
  /** Cursor FINISHED or Noop stub equivalent. IDLE never counts. */
  runFinished?: boolean;
};

export type ReadyResult = {
  ok: boolean;
  missing: string[];
  predicate_id: string;
  predicate_version: number;
  evaluated_at: string;
};

type DslNode = Record<string, unknown>;

function liveEvidence(ctx: ReadyContext): ReadyEvidence[] {
  return ctx.evidence.filter((e) => !e.shadow && typeof e.uri === "string" && e.uri.length > 0);
}

function evalAll(nodes: DslNode[], ctx: ReadyContext): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  let ok = true;
  for (const node of nodes) {
    const r = evalNode(node, ctx);
    if (!r.ok) {
      ok = false;
      missing.push(...r.missing);
    }
  }
  return { ok, missing };
}

function evalAny(nodes: DslNode[], ctx: ReadyContext): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const node of nodes) {
    const r = evalNode(node, ctx);
    if (r.ok) return { ok: true, missing: [] };
    missing.push(...r.missing);
  }
  return { ok: false, missing };
}

function evalNode(node: DslNode, ctx: ReadyContext): { ok: boolean; missing: string[] } {
  if (Array.isArray(node.all)) return evalAll(node.all as DslNode[], ctx);
  const type = node.type as string | undefined;

  if (type === "all") {
    return evalAll((node.items ?? node.of ?? []) as DslNode[], ctx);
  }
  if (type === "any") {
    return evalAny((node.of ?? node.items ?? []) as DslNode[], ctx);
  }
  if (type === "evidence_present") {
    const kinds = (node.kinds as string[]) ?? [];
    const missing = kinds
      .filter((kind) => !liveEvidence(ctx).some((e) => e.kind === kind))
      .map((kind) => `evidence:${kind}`);
    return { ok: missing.length === 0, missing };
  }
  if (type === "github_pr") {
    const wantDraft = node.is_draft as boolean;
    const ok = ctx.githubSnapshots.some((s) => s.is_draft === wantDraft);
    return { ok, missing: ok ? [] : [`github_pr:is_draft=${String(wantDraft)}`] };
  }
  if (type === "github_checks") {
    const conclusion = node.conclusion as string;
    const ok = ctx.githubSnapshots.some((s) => s.checks_conclusion === conclusion);
    return { ok, missing: ok ? [] : [`github_checks:conclusion=${conclusion}`] };
  }
  if (type === "noop_or_offline_contract") {
    const ok = ctx.noopOrOfflineContract === true;
    return { ok, missing: ok ? [] : ["noop_or_offline_contract"] };
  }
  if (type === "run_finished") {
    const ok = ctx.runFinished === true;
    return { ok, missing: ok ? [] : ["run_lifecycle:FINISHED"] };
  }
  if (type === "policy_clearance") {
    const open = ctx.policyEvents.some(
      (e) =>
        !e.closed &&
        e.track === "authority_gate" &&
        (e.decision === "require_gate" || e.decision === "deny"),
    );
    const ok = !open;
    return {
      ok,
      missing: ok ? [] : ["policy_clearance:no_open_authority_escalation"],
    };
  }

  return { ok: false, missing: [`unknown_predicate_node:${type ?? "missing"}`] };
}

export function requiredEvidenceKinds(predicateId: string, predicateVersion: number): string[] {
  if (predicateId === "deliver_ready_v1" && predicateVersion === 1) return ["summary_md"];
  if (predicateId === "research_ready_v1" && predicateVersion === 1) return ["report_md"];
  if (predicateId === "deliver_report_ready_v1" && predicateVersion === 1) return ["report_md"];
  return [];
}

export function evaluateReady(
  predicateId: string,
  predicateVersion: number,
  ctx: ReadyContext,
  evaluatedAt: string,
): ReadyResult {
  const frozen = (FROZEN_PREDICATES as Record<string, Record<number, DslNode>>)[predicateId]?.[
    predicateVersion
  ];
  if (!frozen) {
    return {
      ok: false,
      missing: [`unknown_predicate:${predicateId}@${predicateVersion}`],
      predicate_id: predicateId,
      predicate_version: predicateVersion,
      evaluated_at: evaluatedAt,
    };
  }
  const result = evalNode(frozen, ctx);
  return {
    ok: result.ok,
    missing: result.missing,
    predicate_id: predicateId,
    predicate_version: predicateVersion,
    evaluated_at: evaluatedAt,
  };
}
