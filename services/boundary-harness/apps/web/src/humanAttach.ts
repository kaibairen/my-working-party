/** Office human attach — DM/coordinator Bearer only. Never forge MCP entry. */

export const HUMAN_ATTACH_ROLES = ["decision_maker", "coordinator"] as const;

export const EVIDENCE_KIND_ZH: Record<string, string> = {
  summary_md: "结论摘要",
  artifact_uri: "可打开的产物",
  report_md: "报告正文",
  screenshot: "截图",
  pr: "合并请求",
  ci_check: "检查结果",
};

export const ATTACH_KIND_OPTIONS = [
  "summary_md",
  "artifact_uri",
  "report_md",
  "screenshot",
  "pr",
  "ci_check",
] as const;

export const SHELL_ROLES = [
  "decision_maker",
  "coordinator",
  "executor",
  "viewer",
  "service",
] as const;

export function resolveShellRole(raw: string | null | undefined): (typeof SHELL_ROLES)[number] {
  const role = String(raw ?? "").trim().toLowerCase();
  if ((SHELL_ROLES as readonly string[]).includes(role)) {
    return role as (typeof SHELL_ROLES)[number];
  }
  return "decision_maker";
}

export function actorForRole(role: string): string {
  if (role === "coordinator") return "coord-1";
  if (role === "executor") return "exec-1";
  if (role === "viewer") return "viewer-1";
  return "you";
}

export function canHumanAttach(role: string): boolean {
  return (HUMAN_ATTACH_ROLES as readonly string[]).includes(role);
}

/** Browser attach headers — Bearer only. Do not add x-harness-entry. */
export function humanAttachHeaders(role: string, actor: string): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${role}:${actor}`,
    "x-harness-role": role,
    "x-harness-actor": actor,
  };
}

export function normalizeEvidenceKind(kind: unknown): string {
  return String(kind ?? "")
    .replace(/^evidence:/, "")
    .trim();
}

export function uniqueKinds(list: unknown[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list ?? []) {
    const kind = normalizeEvidenceKind(raw);
    if (!kind || seen.has(kind)) continue;
    seen.add(kind);
    out.push(kind);
  }
  return out;
}

export function evidenceKindHumanLabel(kind: unknown): string {
  const code = normalizeEvidenceKind(kind);
  if (!code) return "";
  const zh = EVIDENCE_KIND_ZH[code];
  return zh ? `${zh} ${code}` : code;
}

export function kindListFromBody(body: unknown, key: string): string[] {
  if (!body || typeof body !== "object") return [];
  const rec = body as Record<string, unknown>;
  const details = rec.details && typeof rec.details === "object" ? (rec.details as Record<string, unknown>) : {};
  const error = rec.error && typeof rec.error === "object" ? (rec.error as Record<string, unknown>) : {};
  const errorDetails =
    error.details && typeof error.details === "object" ? (error.details as Record<string, unknown>) : {};
  const raw = rec[key] ?? details[key] ?? error[key] ?? errorDetails[key];
  return Array.isArray(raw) ? uniqueKinds(raw) : [];
}

export function parseMissingKinds(body: unknown): string[] {
  const fromContract = kindListFromBody(body, "missing_kinds");
  if (fromContract.length) return fromContract;
  if (!body || typeof body !== "object") return [];
  const rec = body as Record<string, unknown>;
  const details = rec.details && typeof rec.details === "object" ? (rec.details as Record<string, unknown>) : {};
  const error = rec.error && typeof rec.error === "object" ? (rec.error as Record<string, unknown>) : {};
  const errorDetails =
    error.details && typeof error.details === "object" ? (error.details as Record<string, unknown>) : {};
  const raw = details.missing ?? errorDetails.missing ?? rec.missing;
  return Array.isArray(raw) ? uniqueKinds(raw) : [];
}

export function missingKindsHumanMessage(kinds: string[]): string {
  const labels = kinds.map(evidenceKindHumanLabel).filter(Boolean);
  if (!labels.length) return "门禁要的证据种类对不上。";
  return `门禁要的证据种类对不上。还差：${labels.join("、")}`;
}

export function humanizeAttachError(body: unknown): string {
  const missing = parseMissingKinds(body);
  if (missing.length) return missingKindsHumanMessage(missing);
  if (!body || typeof body !== "object") return "没挂上。";
  const rec = body as Record<string, unknown>;
  const error = rec.error && typeof rec.error === "object" ? (rec.error as Record<string, unknown>) : {};
  const code = String(rec.code ?? error.code ?? "");
  const message = String(rec.message ?? error.message ?? "").trim();
  if (code === "mcp_entry_required") {
    return "Bot 回写请戴 MCP 手套；这里只给人补挂已有文件。";
  }
  return message || "没挂上。";
}

export function requiredKindsFromContext(input: {
  predicate_id?: string | null;
  missing?: string[] | null;
  required_kinds?: string[] | null;
}): string[] {
  const fromMissing = uniqueKinds(input.missing ?? []);
  const fromRequired = uniqueKinds(input.required_kinds ?? []);
  const base = uniqueKinds([...fromRequired, ...fromMissing]);
  if (base.length) return uniqueKinds(["summary_md", ...base]);
  return ["summary_md"];
}

export function fileToEvidenceUri(file: { name?: string } | null | undefined): string {
  const name = String(file?.name ?? "").trim() || "attachment";
  return `file://${name}`;
}
