import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACCEPTANCE_CASE_NAMES, FORBIDDEN_ERROR_ALIASES } from "./required-cases";

const here = dirname(fileURLToPath(import.meta.url));
const acceptanceSrc = readFileSync(join(here, "acceptance.test.ts"), "utf8");
const harnessRoot = join(here, "../../../../");

describe("Security acceptance case registry", () => {
  it("registers every named QA/CI acceptance case", () => {
    for (const name of ACCEPTANCE_CASE_NAMES) {
      expect(acceptanceSrc, `missing it("${name}")`).toContain(`it("${name}"`);
    }
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
