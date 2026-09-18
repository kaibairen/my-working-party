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

export const FORBIDDEN_ERROR_ALIASES = [
  "webhook_timestamp_skew",
  "webhook_signature_invalid",
  "pool_scope_denied",
] as const;
