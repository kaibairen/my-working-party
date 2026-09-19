import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** HarnessQA office P0 anti — missing any frozen name is merge-red. */
export const OFFICE_P0_ANTI_CASE_NAMES = [
  "office_home_not_inbox_wall",
  "inbox_is_drawer_not_home",
  "office_no_assign_desk",
  "office_no_drag_dispatch",
  "office_no_start_run_button",
  "fill_board_not_dispatch_console",
] as const;

const specDir = join(dirname(fileURLToPath(import.meta.url)), "../../../web/e2e/gate-inbox");

describe("office P0 anti required case registry", () => {
  it("fails if any QA-frozen office P0 anti case name is missing", () => {
    const src = readdirSync(specDir)
      .filter((f) => f.endsWith(".spec.ts"))
      .map((f) => readFileSync(join(specDir, f), "utf8"))
      .join("\n");
    for (const name of OFFICE_P0_ANTI_CASE_NAMES) {
      expect(src, `missing test("${name}") in apps/web/e2e/gate-inbox`).toContain(`test("${name}"`);
    }
    expect(OFFICE_P0_ANTI_CASE_NAMES).toHaveLength(6);
  });
});
