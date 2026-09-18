import { HarnessError } from "./errors";

export const ROLES = [
  "decision_maker",
  "coordinator",
  "executor",
  "viewer",
  "service",
] as const;

export type Role = (typeof ROLES)[number];

export type Actor = {
  id: string;
  role: Role;
};

export const DIALS = ["free", "guided", "gated", "freeze"] as const;
export type Dial = (typeof DIALS)[number];

/** JWT claims are not frozen. M0 Bearer token is `role` or `role:actor`. */
export function parseBearer(authorization: string | undefined): { role?: string; actor?: string } {
  if (!authorization) return {};
  const match = /^Bearer\s+(\S+)/i.exec(authorization.trim());
  if (!match) return {};
  const [role, actor] = match[1].split(":");
  return { role, actor };
}

export function parseRole(value: string | undefined): Role {
  if (!value || !(ROLES as readonly string[]).includes(value)) {
    throw new HarnessError("unauthorized", "missing or invalid Bearer role", 401);
  }
  return value as Role;
}

export function requireRole(actor: Actor, allowed: readonly Role[]): void {
  if (!allowed.includes(actor.role)) {
    throw new HarnessError("forbidden", `role ${actor.role} cannot perform this action`, 403, {
      role: actor.role,
      allowed,
    });
  }
}

export const PLAINTEXT_CREDENTIAL_KEYS = [
  "password",
  "api_key",
  "token",
  "secret",
  "credential",
  "credentials",
  "access_token",
  "private_key",
] as const;

export function assertNoPlaintextCredentials(body: unknown): void {
  if (!body || typeof body !== "object" || Array.isArray(body)) return;
  const keys = Object.keys(body as Record<string, unknown>);
  const hit = keys.filter((k) =>
    (PLAINTEXT_CREDENTIAL_KEYS as readonly string[]).includes(k.toLowerCase()),
  );
  if (hit.length > 0) {
    throw new HarnessError(
      "plaintext_credential_forbidden",
      "plaintext credential fields are forbidden; use secret_ref",
      422,
      { keys: hit },
    );
  }
}

export const MCP_TOOL_NAMES = [
  "harness_create_goal",
  "harness_fill_assignment",
  "harness_dispatch",
  "harness_attach_evidence",
  "harness_get_run",
  "harness_list_gates",
  "harness_decide_gate",
  "harness_policy_check",
] as const;
