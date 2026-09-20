import { describe, expect, it } from "vitest";
import {
  evidenceKindHumanLabel,
  fillKindsWarnMessage,
  isPredicateEvidenceMismatch,
  missingKindsHumanMessage,
  missingRequiredKinds,
  parseMissingKinds,
  requiredKindsLine,
} from "./evidenceKinds";

describe("office fill-slot evidence kinds", () => {
  it("fill_slot_shows_required_evidence_kinds", () => {
    expect(evidenceKindHumanLabel("summary_md")).toBe("结论摘要 summary_md");
    expect(requiredKindsLine(["summary_md"])).toBe("门禁要：结论摘要 summary_md");
    expect(requiredKindsLine(["summary_md", "artifact_uri"])).toContain("可打开的产物 artifact_uri");
    expect(requiredKindsLine(["summary_md"])).not.toBe("summary_md");
  });

  it("fill_ui_prompts_missing_summary_md", () => {
    expect(requiredKindsLine(["summary_md"])).toContain("结论摘要 summary_md");
    expect(fillKindsWarnMessage(["summary_md"])).toContain("结论摘要");
    expect(missingRequiredKinds(["summary_md"], ["report_md"])).toEqual(["summary_md"]);
  });

  it("fill_slot_missing_kinds_human_message", () => {
    const body = {
      code: "predicate_evidence_mismatch",
      details: { missing_kinds: ["summary_md"] },
    };
    expect(isPredicateEvidenceMismatch(body)).toBe(true);
    expect(parseMissingKinds(body)).toEqual(["summary_md"]);
    expect(parseMissingKinds({ error: { details: { missing: ["evidence:summary_md"] } } })).toEqual([
      "summary_md",
    ]);
    const msg = missingKindsHumanMessage(parseMissingKinds(body));
    expect(msg).toContain("结论摘要");
    expect(msg).toContain("summary_md");
    expect(msg).toMatch(/还差/);
    expect(msg).not.toBe("summary_md");
    expect(msg).not.toBe("predicate_evidence_mismatch");
  });

  it("warns when the Fill form is missing required kinds", () => {
    expect(missingRequiredKinds(["summary_md"], ["report_md"])).toEqual(["summary_md"]);
    expect(fillKindsWarnMessage(["summary_md"])).toContain("结论摘要 summary_md");
    expect(missingRequiredKinds(["summary_md"], ["summary_md", "report_md"])).toEqual([]);
  });
});
