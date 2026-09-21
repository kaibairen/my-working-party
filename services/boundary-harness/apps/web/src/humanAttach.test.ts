import { describe, expect, it } from "vitest";
import {
  actorForRole,
  canHumanAttach,
  evidenceKindHumanLabel,
  fileToEvidenceUri,
  humanAttachHeaders,
  humanizeAttachError,
  parseMissingKinds,
  requiredKindsFromContext,
  resolveShellRole,
} from "./humanAttach";

describe("human attach helpers", () => {
  it("lets decision_maker and coordinator attach, hides executor", () => {
    expect(canHumanAttach("decision_maker")).toBe(true);
    expect(canHumanAttach("coordinator")).toBe(true);
    expect(canHumanAttach("executor")).toBe(false);
    expect(resolveShellRole("executor")).toBe("executor");
    expect(resolveShellRole(undefined)).toBe("decision_maker");
    expect(actorForRole("decision_maker")).toBe("you");
    expect(actorForRole("executor")).toBe("exec-1");
  });

  it("never puts x-harness-entry on human attach headers", () => {
    const headers = humanAttachHeaders("decision_maker", "you");
    expect(headers.authorization).toBe("Bearer decision_maker:you");
    expect(headers["x-harness-entry"]).toBeUndefined();
    expect(JSON.stringify(headers)).not.toMatch(/x-harness-entry|mcp/);
  });

  it("humanizes Domain missing_kinds including summary_md", () => {
    const body = {
      code: "predicate_evidence_mismatch",
      missing_kinds: ["summary_md"],
      details: { missing_kinds: ["summary_md"] },
    };
    expect(parseMissingKinds(body)).toEqual(["summary_md"]);
    expect(humanizeAttachError(body)).toContain("还差：结论摘要 summary_md");
    expect(evidenceKindHumanLabel("evidence:summary_md")).toBe("结论摘要 summary_md");
    expect(requiredKindsFromContext({ missing: ["evidence:artifact_uri"] })).toEqual([
      "summary_md",
      "artifact_uri",
    ]);
    expect(fileToEvidenceUri({ name: "notes.md" })).toBe("file://notes.md");
  });
});
