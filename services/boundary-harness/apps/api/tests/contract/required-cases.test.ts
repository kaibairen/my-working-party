import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_CASE_NAMES,
  FORBIDDEN_ERROR_ALIASES,
  OFFICE_DESKS_GROUP_GATES,
  OFFICE_DISPATCH_SIX,
  OFFICE_ROSTER_MERGE_GATES,
} from "./required-cases";

const here = dirname(fileURLToPath(import.meta.url));
const acceptanceSrc = readFileSync(join(here, "acceptance.test.ts"), "utf8");
const p0Src = readFileSync(join(here, "p0-linkage.test.ts"), "utf8");
const officeAntiSrc = readFileSync(join(here, "../security-anti/office-anti.test.ts"), "utf8");
const harnessRoot = join(here, "../../../../");

describe("Security acceptance case registry", () => {
  it("registers every named QA/CI acceptance case", () => {
    for (const name of ACCEPTANCE_CASE_NAMES) {
      expect(acceptanceSrc, `missing it("${name}")`).toContain(`it("${name}"`);
    }
  });

  it("registers TechLead office roster merge gates", () => {
    for (const name of OFFICE_ROSTER_MERGE_GATES) {
      expect(p0Src, `missing it("${name}") in p0-linkage.test.ts`).toContain(`it("${name}"`);
    }
    expect(OFFICE_ROSTER_MERGE_GATES).toHaveLength(2);
  });

  it("registers office dispatch-six and grouped-desk gates", () => {
    for (const name of OFFICE_DISPATCH_SIX) {
      expect(officeAntiSrc, `missing it("${name}") in office-anti.test.ts`).toContain(`it("${name}"`);
    }
    expect(OFFICE_DISPATCH_SIX).toHaveLength(6);
    for (const name of OFFICE_DESKS_GROUP_GATES) {
      expect(officeAntiSrc, `missing it("${name}") in office-anti.test.ts`).toContain(`it("${name}"`);
    }
    expect(OFFICE_DESKS_GROUP_GATES).toHaveLength(3);
  });

  it("does not use forbidden error-code aliases", () => {
    const scan = [
      readFileSync(join(harnessRoot, "apps/api/src/app.ts"), "utf8"),
      readFileSync(join(harnessRoot, "packages/domain/src/hmac.ts"), "utf8"),
      readFileSync(join(harnessRoot, "packages/domain/src/rbac.ts"), "utf8"),
      readFileSync(join(harnessRoot, "packages/domain/src/services.ts"), "utf8"),
    ].join("\n");
    for (const alias of FORBIDDEN_ERROR_ALIASES) {
      expect(scan).not.toContain(alias);
    }
  });
});
