/* Office human attach helpers — keep in sync with apps/web/src/humanAttach.ts */
(function (root) {
  const HUMAN_ATTACH_ROLES = ["decision_maker", "coordinator"];
  const SHELL_ROLES = ["decision_maker", "coordinator", "executor", "viewer", "service"];
  const EVIDENCE_KIND_ZH = {
    summary_md: "结论摘要",
    artifact_uri: "可打开的产物",
    report_md: "报告正文",
    screenshot: "截图",
    pr: "合并请求",
    ci_check: "检查结果",
  };
  const ATTACH_KIND_OPTIONS = [
    "summary_md",
    "artifact_uri",
    "report_md",
    "screenshot",
    "pr",
    "ci_check",
  ];

  function resolveShellRole(raw) {
    const role = String(raw ?? "").trim().toLowerCase();
    return SHELL_ROLES.includes(role) ? role : "decision_maker";
  }
  function actorForRole(role) {
    if (role === "coordinator") return "coord-1";
    if (role === "executor") return "exec-1";
    if (role === "viewer") return "viewer-1";
    return "you";
  }
  function canHumanAttach(role) {
    return HUMAN_ATTACH_ROLES.includes(role);
  }
  function humanAttachHeaders(role, actor) {
    return {
      "content-type": "application/json",
      authorization: "Bearer " + role + ":" + actor,
      "x-harness-role": role,
      "x-harness-actor": actor,
    };
  }
  function normalizeEvidenceKind(kind) {
    return String(kind ?? "").replace(/^evidence:/, "").trim();
  }
  function uniqueKinds(list) {
    const seen = new Set();
    const out = [];
    for (const raw of list || []) {
      const kind = normalizeEvidenceKind(raw);
      if (!kind || seen.has(kind)) continue;
      seen.add(kind);
      out.push(kind);
    }
    return out;
  }
  function evidenceKindHumanLabel(kind) {
    const code = normalizeEvidenceKind(kind);
    if (!code) return "";
    const zh = EVIDENCE_KIND_ZH[code];
    return zh ? zh + " " + code : code;
  }
  function kindListFromBody(body, key) {
    if (!body || typeof body !== "object") return [];
    const details = body.details && typeof body.details === "object" ? body.details : {};
    const error = body.error && typeof body.error === "object" ? body.error : {};
    const errorDetails = error.details && typeof error.details === "object" ? error.details : {};
    const raw = body[key] ?? details[key] ?? error[key] ?? errorDetails[key];
    return Array.isArray(raw) ? uniqueKinds(raw) : [];
  }
  function parseMissingKinds(body) {
    const fromContract = kindListFromBody(body, "missing_kinds");
    if (fromContract.length) return fromContract;
    if (!body || typeof body !== "object") return [];
    const details = body.details && typeof body.details === "object" ? body.details : {};
    const error = body.error && typeof body.error === "object" ? body.error : {};
    const errorDetails = error.details && typeof error.details === "object" ? error.details : {};
    const raw = details.missing ?? errorDetails.missing ?? body.missing;
    return Array.isArray(raw) ? uniqueKinds(raw) : [];
  }
  function missingKindsHumanMessage(kinds) {
    const labels = (kinds || []).map(evidenceKindHumanLabel).filter(Boolean);
    if (!labels.length) return "门禁要的证据种类对不上。";
    return "门禁要的证据种类对不上。还差：" + labels.join("、");
  }
  function humanizeAttachError(body) {
    const missing = parseMissingKinds(body);
    if (missing.length) return missingKindsHumanMessage(missing);
    if (!body || typeof body !== "object") return "没挂上。";
    const error = body.error && typeof body.error === "object" ? body.error : {};
    const code = String(body.code ?? error.code ?? "");
    const message = String(body.message ?? error.message ?? "").trim();
    if (code === "mcp_entry_required") {
      return "Bot 回写请戴 MCP 手套；这里只给人补挂已有文件。";
    }
    return message || "没挂上。";
  }
  function requiredKindsFromContext(input) {
    const fromMissing = uniqueKinds((input && input.missing) || []);
    const fromRequired = uniqueKinds((input && input.required_kinds) || []);
    const base = uniqueKinds(fromRequired.concat(fromMissing));
    if (base.length) return uniqueKinds(["summary_md"].concat(base));
    return ["summary_md"];
  }
  function fileToEvidenceUri(file) {
    const name = String((file && file.name) || "").trim() || "attachment";
    return "file://" + name;
  }

  root.HarnessAttach = {
    HUMAN_ATTACH_ROLES,
    ATTACH_KIND_OPTIONS,
    EVIDENCE_KIND_ZH,
    resolveShellRole,
    actorForRole,
    canHumanAttach,
    humanAttachHeaders,
    normalizeEvidenceKind,
    uniqueKinds,
    evidenceKindHumanLabel,
    parseMissingKinds,
    missingKindsHumanMessage,
    humanizeAttachError,
    requiredKindsFromContext,
    fileToEvidenceUri,
  };
})(globalThis);
