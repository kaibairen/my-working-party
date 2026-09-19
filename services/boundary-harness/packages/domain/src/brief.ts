import { z } from "zod";
import { HarnessError } from "./errors";

export const EVIDENCE_KINDS = [
  "pr",
  "report_md",
  "summary_md",
  "screenshot",
  "ci_check",
  "artifact_uri",
] as const;

export const EvidenceKind = z.enum(EVIDENCE_KINDS);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

/** Floor + BriefV1 expanded set. HTTP and MCP share this validator. */
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
  "budget",
] as const;

export const BriefV1Schema = z
  .object({
    outcome: z.string().min(1).max(2000),
    constraints: z.array(z.string().max(500)).max(32),
    evidence_shape: z.array(EvidenceKind).min(1),
  })
  .strict();

export type BriefV1 = z.infer<typeof BriefV1Schema>;

export const BudgetSchema = z
  .object({
    max_usd: z.number().nonnegative().optional(),
    max_tokens: z.number().int().nonnegative().optional(),
    max_runs: z.number().int().positive().optional(),
  })
  .strict();

export type Budget = z.infer<typeof BudgetSchema>;

export function parseBriefV1(input: unknown): BriefV1 {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new HarnessError("brief_invalid", "brief must be an object", 422);
  }
  const keys = Object.keys(input as Record<string, unknown>);
  const forbidden = keys.filter((k) =>
    (BRIEF_FORBIDDEN_KEYS as readonly string[]).includes(k),
  );
  if (forbidden.length > 0) {
    throw new HarnessError(
      "brief_forbidden_field",
      "BriefV1 contains forbidden fields",
      422,
      { keys: forbidden },
    );
  }
  const parsed = BriefV1Schema.safeParse(input);
  if (!parsed.success) {
    throw new HarnessError("brief_invalid", "BriefV1 failed validation", 422, parsed.error.flatten());
  }
  return parsed.data;
}

/** Backend canonical name — same validator as parseBriefV1 (HTTP + MCP). */
export function parseBriefOrThrow(raw: unknown): BriefV1 {
  return parseBriefV1(raw);
}

export function parseBudget(input: unknown): Budget {
  if (input === undefined || input === null) return {};
  const parsed = BudgetSchema.safeParse(input);
  if (!parsed.success) {
    throw new HarnessError("budget_invalid", "budget failed validation", 422, parsed.error.flatten());
  }
  return parsed.data;
}
