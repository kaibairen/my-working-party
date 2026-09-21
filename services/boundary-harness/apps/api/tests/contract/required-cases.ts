/** Security acceptance case names — CI fails if any `it("…")` is missing. */
export const ACCEPTANCE_CASE_NAMES = [
  "hmac_bad_signature_401",
  "hmac_timestamp_skew_401",
  "freeze_blocks_dispatch_423",
  "secret_ref_never_echoed",
  "audit_log_append_only",
  "jwt_pool_forbidden_403",
  "dial_whitelist_not_overbroad",
] as const;

/**
 * TechLead office roster lock (#18) — do not loosen.
 * Freeze names MUST equal `it("…")` titles. Missing any name is merge-red.
 */
export const OFFICE_ROSTER_MERGE_GATES = [
  "office_no_fake_name_wall",
  "heartbeat_ttl_expiry_clears_row",
  "office_no_assign_desk",
  "office_no_drag_dispatch",
  "office_no_start_run_button",
] as const;

/** QA #21 grouped-desks freeze — `it("…")` titles must match exactly. */
export const DESKS_GROUP_MERGE_GATES = [
  "desks_grouped_layout_readonly",
  "desks_group_no_drag_assign",
  "desks_group_no_fake_seeds",
  "desks_ungrouped_bucket",
] as const;

/** QA #21 2048 freeze — `it("…")` titles must match exactly. */
export const GAME_2048_MERGE_GATES = [
  "game_2048_loads_playable",
  "game_2048_arrow_or_swipe_moves",
  "game_2048_score_updates",
  "game_2048_new_game_resets",
] as const;

/** Domain Stage-edge P0 — `it("…")` titles must match exactly. */
export const STAGE_EDGE_MERGE_GATES = [
  "stage_locked_blocks_downstream_dispatch",
  "stage_unlock_after_gate_pass",
] as const;

/** Office goal status_line — `it("…")` titles must match exactly. */
export const STATUS_LINE_MERGE_GATES = [
  "status_line_all_slots_done_not_filling",
] as const;

/** P0-B assignee bind + desk busy from heartbeat — `it("…")` titles must match exactly. */
export const P0_B_MERGE_GATES = [
  "assignment_binds_bot_id",
  "desk_busy_from_assignee_heartbeat",
] as const;

/** Bridge P0-C/D MCP glove + outbound wake — `it("…")` titles must match exactly. */
export const BRIDGE_P0CD_MERGE_GATES = [
  "bot_glove_default_evidence_ready",
  "status_change_outbound_wakes_assignee",
] as const;

/** Office stage strip — Playwright `test("…")` titles must match exactly. */
export const STAGE_STRIP_PLAYWRIGHT_GATES = [
  "stage_strip_shows_locked_downstream",
  "stage_locked_423_human_message",
] as const;

/** Office status_line — Playwright `test("…")` titles must match Domain gate name. */
export const STATUS_LINE_PLAYWRIGHT_GATES = [
  "status_line_all_slots_done_not_filling",
] as const;

export const FORBIDDEN_ERROR_ALIASES = [
  "webhook_timestamp_skew",
  "webhook_signature_invalid",
  "pool_scope_denied",
] as const;
