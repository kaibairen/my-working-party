import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** QA M0_SECURITY_ANTI_FINAL_v1 — missing any name is merge-red. */
export const SECURITY_ANTI_CASE_NAMES = [
  "hmac_bad_signature_401",
  "hmac_timestamp_skew_401",
  "freeze_blocks_dispatch_423",
  "secret_ref_never_echoed",
  "secret_ref_unsupported_400",
  "audit_log_append_only",
  "jwt_pool_forbidden_403",
  "dial_whitelist_not_overbroad",
] as const;

const here = dirname(fileURLToPath(import.meta.url));

describe("security-anti required case registry", () => {
  it("fails if any of the 8 QA-frozen case names is missing", () => {
    const src = readdirSync(here)
      .filter((f) => /\.(test|spec)\.(ts|mjs)$/.test(f))
      .map((f) => readFileSync(join(here, f), "utf8"))
      .join("\n");
    for (const name of SECURITY_ANTI_CASE_NAMES) {
      expect(src, `missing it("${name}") in apps/api/tests/security-anti`).toContain(`it("${name}"`);
    }
    expect(SECURITY_ANTI_CASE_NAMES).toHaveLength(8);
  });
});
