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

export const FORBIDDEN_ERROR_ALIASES = [
  "webhook_timestamp_skew",
  "webhook_signature_invalid",
  "pool_scope_denied",
] as const;
