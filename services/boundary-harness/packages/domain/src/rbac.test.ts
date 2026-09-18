import { describe, expect, it } from "vitest";
import { isHarnessError } from "./errors";
import { assertSecretRef, signJwt, verifyJwt } from "./rbac";

describe("JWT claims and secret_ref", () => {
  it("requires sub, role, pool_ids, iat, exp", () => {
    const now = 1_700_000_000;
    const token = signJwt({
      sub: "u1",
      role: "coordinator",
      pool_ids: ["pool_noop"],
      iat: now,
      exp: now + 60,
      tid: "t1",
    });
    const claims = verifyJwt(token, undefined, now + 10);
    expect(claims).toEqual({
      sub: "u1",
      role: "coordinator",
      pool_ids: ["pool_noop"],
      iat: now,
      exp: now + 60,
      tid: "t1",
    });
  });

  it("rejects expired JWT", () => {
    const now = 1_700_000_000;
    const token = signJwt({
      sub: "u1",
      role: "viewer",
      pool_ids: [],
      iat: now,
      exp: now + 1,
    });
    try {
      verifyJwt(token, undefined, now + 2);
      throw new Error("expected expired");
    } catch (err) {
      expect(isHarnessError(err)).toBe(true);
      if (isHarnessError(err)) {
        expect(err.code).toBe("unauthorized");
        expect(err.status).toBe(401);
      }
    }
  });

  it("accepts only file: and env: secret_ref", () => {
    expect(() => assertSecretRef("file:/var/lib/harness/noop.secret")).not.toThrow();
    expect(() => assertSecretRef("env:CURSOR_API_KEY")).not.toThrow();
    expect(() => assertSecretRef("secret:noop-local")).toThrow();
    expect(() => assertSecretRef("sops:prod/cursor")).toThrow();
    try {
      assertSecretRef("env:lowercase");
    } catch (err) {
      expect(isHarnessError(err)).toBe(true);
      if (isHarnessError(err)) expect(err.code).toBe("secret_ref_invalid");
    }
  });
});
