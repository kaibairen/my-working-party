import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_CASE_NAMES,
  DESKS_GROUP_MERGE_GATES,
  FORBIDDEN_ERROR_ALIASES,
  GAME_2048_MERGE_GATES,
  OFFICE_ROSTER_MERGE_GATES,
  STAGE_EDGE_MERGE_GATES,
  STAGE_STRIP_PLAYWRIGHT_GATES,
} from "./required-cases";

const here = dirname(fileURLToPath(import.meta.url));
const acceptanceSrc = readFileSync(join(here, "acceptance.test.ts"), "utf8");
const p0Src = readFileSync(join(here, "p0-linkage.test.ts"), "utf8");
const officeAntiSrc = readFileSync(join(here, "../security-anti/office-anti.test.ts"), "utf8");
const desksDomainSrc = readFileSync(join(here, "../../../../packages/domain/src/desks.test.ts"), "utf8");
const game2048Src = readFileSync(join(here, "../../../../examples/2048/board.test.ts"), "utf8");
const stageEdgeSrc = readFileSync(join(here, "stage-edge.test.ts"), "utf8");
const rosterSrc = [p0Src, officeAntiSrc].join("\n");
const desksGroupSrc = [p0Src, desksDomainSrc].join("\n");
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
    expect(OFFICE_ROSTER_MERGE_GATES).toHaveLength(5);
    expect(OFFICE_ROSTER_MERGE_GATES).toEqual([
      "office_no_fake_name_wall",
      "heartbeat_ttl_expiry_clears_row",
      "office_no_assign_desk",
      "office_no_drag_dispatch",
      "office_no_start_run_button",
    ]);
  });

  it("registers QA grouped-desks freeze names", () => {
    for (const name of DESKS_GROUP_MERGE_GATES) {
      expect(desksGroupSrc, `missing it("${name}") in grouped-desks freeze sources`).toContain(`it("${name}"`);
    }
    expect(DESKS_GROUP_MERGE_GATES).toEqual([
      "desks_grouped_layout_readonly",
      "desks_group_no_drag_assign",
      "desks_group_no_fake_seeds",
      "desks_ungrouped_bucket",
    ]);
  });

  it("registers QA 2048 freeze names", () => {
    for (const name of GAME_2048_MERGE_GATES) {
      expect(game2048Src, `missing it("${name}") in examples/2048/board.test.ts`).toContain(`it("${name}"`);
    }
    expect(GAME_2048_MERGE_GATES).toEqual([
      "game_2048_loads_playable",
      "game_2048_arrow_or_swipe_moves",
      "game_2048_score_updates",
      "game_2048_new_game_resets",
    ]);
  });

  it("registers Domain Stage-edge P0 merge gates", () => {
    for (const name of STAGE_EDGE_MERGE_GATES) {
      expect(stageEdgeSrc, `missing it("${name}") in stage-edge.test.ts`).toContain(`it("${name}"`);
    }
    expect(STAGE_EDGE_MERGE_GATES).toEqual([
      "stage_locked_blocks_downstream_dispatch",
      "stage_unlock_after_gate_pass",
    ]);
  });

  it("registers office stage-strip Playwright titles", () => {
    const stageStripPw = readFileSync(
      join(here, "../../../web/e2e/gate-inbox/stage-strip.spec.ts"),
      "utf8",
    );
    for (const name of STAGE_STRIP_PLAYWRIGHT_GATES) {
      expect(stageStripPw, `missing test("${name}") in stage-strip.spec.ts`).toContain(`test("${name}"`);
    }
    expect(STAGE_STRIP_PLAYWRIGHT_GATES).toEqual([
      "stage_strip_shows_locked_downstream",
      "stage_locked_423_human_message",
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
