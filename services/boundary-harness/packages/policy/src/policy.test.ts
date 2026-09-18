import { describe, expect, it } from "vitest";
import { AUTHORITY_ACTIONS, checkPolicy } from "./index";

describe("policy track", () => {
  it("marks whitelist actions as authority_gate require_gate", () => {
    const r = checkPolicy({ action: "protected_merge" });
    expect(r.track).toBe("authority_gate");
    expect(r.decision).toBe("require_gate");
    expect(r.reason_code).toBe("authority_whitelist");
    expect(r.redirect).toBeNull();
    expect(r.blocks).toBe(true);
    expect(r.creates_gate).toBe(true);
  });

  it("advisory_hint never blocks and never creates a gate", () => {
    const r = checkPolicy({ action: "protected_merge", track: "advisory_hint" });
    expect(r.track).toBe("advisory_hint");
    expect(r.reason_code).toBe("advisory_hint_not_blocking");
    expect(r.redirect).toBeTruthy();
    expect(r.blocks).toBe(false);
    expect(r.creates_gate).toBe(false);
  });

  it("authority whitelist is exactly five keys", () => {
    expect([...AUTHORITY_ACTIONS].sort()).toEqual(
      ["destructive_delete", "external_send", "over_budget", "privilege_escalation", "protected_merge"].sort(),
    );
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
