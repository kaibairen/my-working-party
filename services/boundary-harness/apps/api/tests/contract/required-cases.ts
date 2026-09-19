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
 * TechLead office roster lock — freeze names MUST equal `it("…")` titles.
 * Fake-name two knives + grouped desks + pool-label copy + anti-dispatch three knives.
 * Missing any name is merge-red.
 */
export const OFFICE_ROSTER_MERGE_GATES = [
  "office_no_fake_name_wall",
  "heartbeat_ttl_expiry_clears_row",
  "desks_grouped_by_heartbeat_group",
  "fill_slots_pool_labels_not_colleague",
  "office_no_assign_desk",
  "office_no_drag_dispatch",
  "office_no_start_run_button",
] as const;

export const FORBIDDEN_ERROR_ALIASES = [
  "webhook_timestamp_skew",
  "webhook_signature_invalid",
  "pool_scope_denied",
] as const;
