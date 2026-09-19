import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACCEPTANCE_CASE_NAMES, FORBIDDEN_ERROR_ALIASES, OFFICE_ROSTER_MERGE_GATES } from "./required-cases";

const here = dirname(fileURLToPath(import.meta.url));
const acceptanceSrc = readFileSync(join(here, "acceptance.test.ts"), "utf8");
const p0Src = readFileSync(join(here, "p0-linkage.test.ts"), "utf8");
const officeAntiSrc = readFileSync(join(here, "../security-anti/office-anti.test.ts"), "utf8");
const officeDomainSrc = readFileSync(join(here, "../../../../packages/domain/src/office.test.ts"), "utf8");
const rosterSrc = [p0Src, officeAntiSrc, officeDomainSrc].join("\n");
const harnessRoot = join(here, "../../../../");

describe("Security acceptance case registry", () => {
  it("registers every named QA/CI acceptance case", () => {
    for (const name of ACCEPTANCE_CASE_NAMES) {
      expect(acceptanceSrc, `missing it("${name}")`).toContain(`it("${name}"`);
    }
  });

  it("registers TechLead office roster merge gates", () => {
    for (const name of OFFICE_ROSTER_MERGE_GATES) {
      expect(rosterSrc, `missing it("${name}") in office roster freeze sources`).toContain(`it("${name}"`);
    }
    expect(OFFICE_ROSTER_MERGE_GATES).toHaveLength(7);
    expect(OFFICE_ROSTER_MERGE_GATES).toEqual([
      "office_no_fake_name_wall",
      "heartbeat_ttl_expiry_clears_row",
      "desks_grouped_by_heartbeat_group",
      "fill_slots_pool_labels_not_colleague",
      "office_no_assign_desk",
      "office_no_drag_dispatch",
      "office_no_start_run_button",
    ]);
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
