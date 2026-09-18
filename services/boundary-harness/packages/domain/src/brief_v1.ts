export const EvidenceKind = [
  "pr",
  "report_md",
  "summary_md",
  "screenshot",
  "ci_check",
  "artifact_uri",
] as const;

export type EvidenceKindName = (typeof EvidenceKind)[number];

export const BRIEF_FORBIDDEN_KEYS = [
  "steps",
  "script",
  "must_path",
  "plan",
  "playbook",
  "workflow",
  "procedure",
  "ordered_steps",
  "runbook",
  "howto",
  "must_files",
];

export type BriefV1 = {
  outcome: string;
  constraints: string[];
  evidence_shape: string[];
};

export function parseBriefOrThrow(raw: unknown): BriefV1 {
  if (raw && typeof raw === "object") {
    const hit = BRIEF_FORBIDDEN_KEYS.filter((k) =>
      Object.prototype.hasOwnProperty.call(raw, k),
    );
    if (hit.length) {
      const err = new Error("brief_forbidden_field") as Error & {
        status: number;
        keys: string[];
      };
      err.status = 422;
      err.keys = hit;
      throw err;
    }
    const allowed = new Set(["outcome", "constraints", "evidence_shape"]);
    for (const k of Object.keys(raw as object)) {
      if (!allowed.has(k)) {
        const err = new Error("brief_additional_property") as Error & {
          status: number;
        };
        err.status = 422;
        throw err;
      }
    }
  }
  const brief = raw as BriefV1 | null;
  if (
    !brief ||
    typeof brief.outcome !== "string" ||
    !Array.isArray(brief.constraints) ||
    !Array.isArray(brief.evidence_shape) ||
    brief.evidence_shape.length < 1
  ) {
    throw new Error("brief_invalid");
  }
  return brief;
}
