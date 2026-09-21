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

/** QA human evidence attach freeze — `it("…")` titles must match exactly. */
export const HUMAN_EVIDENCE_MERGE_GATES = [
  "bot_attach_requires_mcp_entry",
  "human_attach_bearer_allowed",
] as const;

export const FORBIDDEN_ERROR_ALIASES = [
  "webhook_timestamp_skew",
  "webhook_signature_invalid",
  "pool_scope_denied",
] as const;
