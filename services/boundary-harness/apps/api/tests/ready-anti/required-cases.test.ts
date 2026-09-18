import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** QA / DevOps ready-anti 14 — missing any name is merge-red. */
export const READY_ANTI_CASE_NAMES = [
  "reject_brief_with_steps_422",
  "advisory_hint_never_creates_gate",
  "chat_done_never_ready",
  "run_succeeded_alone_never_ready",
  "explore_null_template_zero_gatedef",
  "explore_must_not_default_deliver_ready",
  "deliver_requires_summary_md",
  "noop_path_needs_artifact_and_contract",
  "canvas_not_required_for_dispatch",
  "human_dispatch_forbidden_without_exception",
  "assignment_success_ne_gate_pass",
  "no_auto_downgrade_deliver_to_explore",
  "dial_path_change_not_human",
  "ready_eval_uses_github_snapshots_only",
] as const;

const here = dirname(fileURLToPath(import.meta.url));

describe("ready-anti required case registry", () => {
  it("fails if any of the 14 QA-frozen case names is missing", () => {
    const src = readdirSync(here)
      .filter((f) => /\.(test|spec)\.(ts|mjs)$/.test(f))
      .map((f) => readFileSync(join(here, f), "utf8"))
      .join("\n");
    for (const name of READY_ANTI_CASE_NAMES) {
      expect(src, `missing it("${name}") in apps/api/tests/ready-anti`).toContain(`it("${name}"`);
    }
    expect(READY_ANTI_CASE_NAMES).toHaveLength(14);
  });
});
