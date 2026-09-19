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

/** TechLead office roster lock (2026-09-19) — missing either name is merge-red. */
export const OFFICE_ROSTER_MERGE_GATES = [
  "office_no_fake_name_wall",
  "heartbeat_ttl_expiry_clears_row",
] as const;

/** Office anti-dispatch six — layout grouping must not loosen these. */
export const OFFICE_DISPATCH_SIX = [
  "office_home_not_inbox_wall",
  "inbox_is_drawer_not_home",
  "office_no_assign_desk",
  "office_no_drag_dispatch",
  "office_no_start_run_button",
  "fill_board_not_dispatch_console",
] as const;

/** Grouped right-rail desks (OFFICE_DESKS_GROUPED_IA_v1). */
export const OFFICE_DESKS_GROUP_GATES = [
  "desks_grouped_layout_readonly",
  "desks_group_no_drag_assign",
  "desks_group_no_fake_seeds",
] as const;

export const FORBIDDEN_ERROR_ALIASES = [
  "webhook_timestamp_skew",
  "webhook_signature_invalid",
  "pool_scope_denied",
] as const;
