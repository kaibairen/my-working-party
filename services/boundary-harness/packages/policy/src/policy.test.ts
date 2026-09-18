import { describe, expect, it } from "vitest";
import { checkPolicy } from "./index";

describe("policy track", () => {
  it("marks whitelist actions as authority_gate require_gate", () => {
    const r = checkPolicy({ action: "protected_merge" });
    expect(r.track).toBe("authority_gate");
    expect(r.decision).toBe("require_gate");
    expect(r.blocks).toBe(true);
    expect(r.creates_gate).toBe(true);
  });

  it("advisory_hint never blocks and never creates a gate", () => {
    const r = checkPolicy({ action: "protected_merge", track: "advisory_hint" });
    expect(r.track).toBe("advisory_hint");
    expect(r.blocks).toBe(false);
    expect(r.creates_gate).toBe(false);
  });

  it("does not treat change_path / create_file / propose_assignment as authority", () => {
    for (const action of ["change_path", "create_file", "propose_assignment"]) {
      const r = checkPolicy({ action, track: "authority_gate" });
      expect(r.track).toBe("advisory_hint");
      expect(r.creates_gate).toBe(false);
      expect(r.blocks).toBe(false);
    }
  });
});
