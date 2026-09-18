import { HarnessError } from "./errors.ts";

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

export function parseRole(value: string | undefined): Role {
  if (!value || !(ROLES as readonly string[]).includes(value)) {
    throw new HarnessError("unauthorized", "missing or invalid X-Harness-Role", 401);
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
