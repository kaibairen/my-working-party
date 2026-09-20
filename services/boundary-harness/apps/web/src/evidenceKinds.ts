/** Frozen EvidenceKind labels for office fill slots / Fill form. */
export const EVIDENCE_KIND_ZH: Record<string, string> = {
  summary_md: "结论摘要",
  artifact_uri: "可打开的产物",
  report_md: "报告正文",
  screenshot: "截图",
  pr: "合并请求",
  ci_check: "检查结果",
};

export const FILL_KIND_OPTIONS = [
  "summary_md",
  "artifact_uri",
  "report_md",
  "screenshot",
  "pr",
  "ci_check",
] as const;

export function normalizeEvidenceKind(kind: unknown): string {
  return String(kind ?? "").replace(/^evidence:/, "").trim();
}

/** Human chip: 「结论摘要 summary_md」— never a bare machine code. */
export function evidenceKindHumanLabel(kind: unknown): string {
  const code = normalizeEvidenceKind(kind);
  if (!code) return "";
  const zh = EVIDENCE_KIND_ZH[code];
  return zh ? `${zh} ${code}` : code;
}

export function requiredKindsLine(kinds: readonly string[]): string {
  const labels = kinds.map(evidenceKindHumanLabel).filter(Boolean);
  if (!labels.length) return "";
  return `门禁要：${labels.join("、")}`;
}

export function missingKindsHumanMessage(kinds: readonly string[]): string {
  const labels = kinds.map(evidenceKindHumanLabel).filter(Boolean);
  if (!labels.length) return "门禁要的证据种类对不上。";
  return `门禁要的证据种类对不上。还差：${labels.join("、")}`;
}

export function fillKindsWarnMessage(kinds: readonly string[]): string {
  const labels = kinds.map(evidenceKindHumanLabel).filter(Boolean);
  if (!labels.length) return "";
  return `还没勾上门禁要的种类：${labels.join("、")}。先补上再交。`;
}

export function missingRequiredKinds(required: readonly string[], selected: readonly string[]): string[] {
  const have = new Set(selected.map(normalizeEvidenceKind));
  return required.map(normalizeEvidenceKind).filter((k) => k && !have.has(k));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeEvidenceKind).filter(Boolean);
}

function firstKindList(body: unknown, key: "missing_kinds" | "required_kinds" | "evidence_shape"): string[] {
  const rec = asRecord(body);
  if (!rec) return [];
  const details = asRecord(rec.details);
  const error = asRecord(rec.error);
  const errorDetails = asRecord(error?.details);
  return asStringList(rec[key] ?? details?.[key] ?? error?.[key] ?? errorDetails?.[key]);
}

/** Domain 422 body: missing_kinds[] (PR #25). */
export function parseMissingKinds(body: unknown): string[] {
  const rec = asRecord(body);
  if (!rec) return [];
  const details = asRecord(rec.details);
  const error = asRecord(rec.error);
  const errorDetails = asRecord(error?.details);
  const fromContract = firstKindList(body, "missing_kinds");
  if (fromContract.length) return fromContract;
  return asStringList(details?.missing ?? errorDetails?.missing ?? rec.missing);
}

export function parseRequiredKinds(body: unknown): string[] {
  return firstKindList(body, "required_kinds");
}

export function parseEvidenceShape(body: unknown): string[] {
  return firstKindList(body, "evidence_shape");
}

export function isPredicateEvidenceMismatch(body: unknown): boolean {
  const rec = asRecord(body);
  if (!rec) return false;
  const error = asRecord(rec.error);
  return rec.code === "predicate_evidence_mismatch" || error?.code === "predicate_evidence_mismatch";
}
