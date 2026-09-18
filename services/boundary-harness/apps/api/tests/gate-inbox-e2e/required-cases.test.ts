import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** QA GATE_INBOX_PLAYWRIGHT_CDP_v1 — missing any 🔴 name is merge-red for Inbox E2E. */
export const GATE_INBOX_E2E_CASE_NAMES = [
  "inbox_lists_only_ready",
  "inbox_empty_state_quiet",
  "inbox_card_shows_predicate_meta",
  "decide_pass_uses_version",
  "decide_revise_default_same_assignment",
  "decide_optimistic_lock_409_refresh",
  "card_renders_missing_array",
  "missing_empty_still_shows_ready_ok",
  "no_mark_done_button",
  "chat_done_text_never_creates_card",
  "run_succeeded_banner_not_decide",
] as const;

const specDir = join(dirname(fileURLToPath(import.meta.url)), "../../../web/e2e/gate-inbox");

describe("gate-inbox Playwright required case registry", () => {
  it("fails if any QA-frozen E2E case name is missing", () => {
    const src = readdirSync(specDir)
      .filter((f) => f.endsWith(".spec.ts"))
      .map((f) => readFileSync(join(specDir, f), "utf8"))
      .join("\n");
    for (const name of GATE_INBOX_E2E_CASE_NAMES) {
      expect(src, `missing test("${name}") in apps/web/e2e/gate-inbox`).toContain(`test("${name}"`);
    }
    expect(GATE_INBOX_E2E_CASE_NAMES).toHaveLength(11);
  });
});
