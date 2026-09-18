import { describe, expect, it } from "vitest";
import { BRIEF_FORBIDDEN_KEYS, parseBriefV1 } from "./brief";
import { HarnessError } from "./errors";

const valid = {
  outcome: "Ship a working M0 path",
  constraints: ["no Cursor"],
  evidence_shape: ["summary_md", "artifact_uri"],
};

describe("BriefV1", () => {
  it("accepts a strict BriefV1 object", () => {
    expect(parseBriefV1(valid)).toEqual(valid);
  });

  it("reject_brief_with_steps_422", () => {
    try {
      parseBriefV1({ ...valid, steps: ["do a", "do b"] });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HarnessError);
      const he = err as HarnessError;
      expect(he.code).toBe("brief_forbidden_field");
      expect(he.status).toBe(422);
      expect((he.details as { keys: string[] }).keys).toContain("steps");
    }
  });

  it("rejects the full forbidden key floor plus expansions", () => {
    for (const key of BRIEF_FORBIDDEN_KEYS) {
      try {
        parseBriefV1({ ...valid, [key]: key === "budget" ? { max_usd: 1 } : ["x"] });
        throw new Error(`expected ${key} to be forbidden`);
      } catch (err) {
        expect((err as HarnessError).code).toBe("brief_forbidden_field");
      }
    }
  });

  it("rejects additional properties (strict)", () => {
    try {
      parseBriefV1({ ...valid, extra: true });
      throw new Error("expected throw");
    } catch (err) {
      expect((err as HarnessError).code).toBe("brief_invalid");
      expect((err as HarnessError).status).toBe(422);
    }
  });
});
