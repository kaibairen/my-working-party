import { createHmac, timingSafeEqual } from "node:crypto";
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
  pool_ids?: string[];
  tid?: string;
  request_id?: string;
};

export const DIALS = ["free", "guided", "gated", "freeze"] as const;
export type Dial = (typeof DIALS)[number];

/** Frozen JWT claims (TechLead M0_SECURITY_FREEZE_v1). */
export type JwtClaims = {
  sub: string;
  role: Role;
  pool_ids: string[];
  iat: number;
  exp: number;
  tid?: string;
};

/** Backend OpenAPI SecretRef: `file:/…` | `env:VAR` */
export const SECRET_REF_PATTERN = /^(file:\/|env:)[A-Za-z0-9._/:-]+$/;
export const SECRET_REF_FILE = /^file:\/[A-Za-z0-9._/:-]+$/;
export const SECRET_REF_ENV = /^env:[A-Za-z0-9._/:-]+$/;

export function jwtSecret(): string {
  return process.env.JWT_SIGNING_SECRET ?? process.env.AUTH_JWT_SECRET ?? "harness-m0-dev-jwt";
}

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function parseB64urlJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function safeEqualUtf8(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function signJwt(claims: JwtClaims, secret = jwtSecret()): string {
  const header = b64urlJson({ alg: "HS256", typ: "JWT" });
  const payload = b64urlJson(claims);
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export function verifyJwt(token: string, secret = jwtSecret(), now = Math.floor(Date.now() / 1000)): JwtClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new HarnessError("unauthorized", "invalid JWT", 401);
  }
  const [h, p, s] = parts;
  let header: { alg?: string };
  try {
    header = parseB64urlJson(h) as { alg?: string };
  } catch {
    throw new HarnessError("unauthorized", "invalid JWT header", 401);
  }
  if (header.alg !== "HS256") {
    throw new HarnessError("unauthorized", "JWT alg must be HS256", 401);
  }
  const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  if (!safeEqualUtf8(s, expected)) {
    throw new HarnessError("unauthorized", "invalid JWT signature", 401);
  }
  let raw: Record<string, unknown>;
  try {
    raw = parseB64urlJson(p) as Record<string, unknown>;
  } catch {
    throw new HarnessError("unauthorized", "invalid JWT payload", 401);
  }
  if (typeof raw.sub !== "string" || !raw.sub) {
    throw new HarnessError("unauthorized", "JWT claim sub is required", 401);
  }
  if (typeof raw.role !== "string" || !(ROLES as readonly string[]).includes(raw.role)) {
    throw new HarnessError("unauthorized", "JWT claim role is required and must be a Role", 401);
  }
  if (!Array.isArray(raw.pool_ids) || !raw.pool_ids.every((id) => typeof id === "string")) {
    throw new HarnessError("unauthorized", "JWT claim pool_ids must be string[]", 401);
  }
  if (typeof raw.iat !== "number" || typeof raw.exp !== "number") {
    throw new HarnessError("unauthorized", "JWT claims iat and exp are required", 401);
  }
  if (raw.tid !== undefined && typeof raw.tid !== "string") {
    throw new HarnessError("unauthorized", "JWT claim tid must be a string when present", 401);
  }
  if (now > raw.exp) {
    throw new HarnessError("unauthorized", "JWT expired", 401);
  }
  return {
    sub: raw.sub,
    role: raw.role as Role,
    pool_ids: raw.pool_ids as string[],
    iat: raw.iat,
    exp: raw.exp,
    tid: raw.tid,
  };
}

/**
 * Bearer is a JWT with frozen claims sub,role,pool_ids,iat,exp.
 * Compatibility alias (non-authoritative): `role` or `role:actor`.
 */
export function parseBearer(authorization: string | undefined): {
  role?: string;
  actor?: string;
  jwt?: JwtClaims;
} {
  if (!authorization) return {};
  const match = /^Bearer\s+(\S+)/i.exec(authorization.trim());
  if (!match) return {};
  const token = match[1];
  if (token.split(".").length === 3) {
    const jwt = verifyJwt(token);
    return { role: jwt.role, actor: jwt.sub, jwt };
  }
  const [role, actor] = token.split(":");
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

export function requirePoolAccess(actor: Actor, poolId: string): void {
  if (!actor.pool_ids) return;
  if (!actor.pool_ids.includes(poolId)) {
    throw new HarnessError("pool_forbidden", "actor cannot operate on this pool", 403, {
      pool_id: poolId,
      pool_ids: actor.pool_ids,
    });
  }
}

export function assertSecretRef(ref: string): void {
  if (SECRET_REF_PATTERN.test(ref)) return;
  throw new HarnessError(
    "secret_ref_unsupported",
    "secret_ref must be file:/abs/or/mounted/path or env:VAR_NAME",
    400,
    { secret_ref: ref },
  );
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

export function redactPayload(payload: unknown): unknown {
  if (payload === undefined) return undefined;
  if (Array.isArray(payload)) return payload.map((item) => redactPayload(item));
  if (!payload || typeof payload !== "object") return payload;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if ((PLAINTEXT_CREDENTIAL_KEYS as readonly string[]).includes(key.toLowerCase())) {
      out[key] = "[redacted]";
    } else {
      out[key] = redactPayload(value);
    }
  }
  return out;
}

export const MCP_TOOL_NAMES = [
  "harness_create_goal",
  "harness_fill_assignment",
  "harness_propose_assignment",
  "harness_dispatch",
  "harness_dispatch_assignment",
  "harness_attach_evidence",
  "harness_get_run",
  "harness_get_status",
  "harness_list_gates",
  "harness_list_ready_gates",
  "harness_decide_gate",
  "harness_policy_check",
  "harness_heartbeat",
] as const;

/** Canonical HTTP MCP glove (aliases stay on stdio only). */
export const MCP_HTTP_TOOL_NAMES = [
  "harness_create_goal",
  "harness_fill_assignment",
  "harness_dispatch",
  "harness_attach_evidence",
  "harness_get_run",
  "harness_list_gates",
  "harness_decide_gate",
  "harness_policy_check",
  "harness_heartbeat",
] as const;

/** CONTRACT_MCP_ENTRY_DENY_v0 option A — MCP proxy injects this on Domain writes. */
export const MCP_ENTRY_HEADER = "x-harness-entry";
export const MCP_ENTRY_VALUE = "mcp";

export function isBotCompletionWritePath(method: string, path: string): boolean {
  if (method.toUpperCase() !== "POST") return false;
  return /\/assignments\/[^/]+\/dispatch\/?$/.test(path) || /\/runs\/[^/]+\/evidence\/?$/.test(path);
}

function completionWriteTemplatePath(path: string): string {
  if (/\/assignments\/[^/]+\/dispatch/.test(path)) return "/v1/assignments/{id}/dispatch";
  if (/\/runs\/[^/]+\/evidence/.test(path)) return "/v1/runs/{id}/evidence";
  return path;
}

/**
 * Bot completion writes (dispatch / attach_evidence) must come through the MCP glove.
 * Coordinators hitting Domain HTTP without the header are treated as a bypass
 * unless the caller is a human office role on the evidence path (see
 * {@link assertEvidenceWriteEntry}).
 */
export function assertMcpEntry(entry: string | undefined, path: string): void {
  if (entry?.trim().toLowerCase() !== MCP_ENTRY_VALUE) {
    throw new HarnessError("mcp_entry_required", "write requires MCP entry", 403, {
      path: completionWriteTemplatePath(path),
    });
  }
}

/** Office humans may POST evidence with Bearer only (no MCP glove). */
export const HUMAN_EVIDENCE_ROLES = ["decision_maker", "coordinator"] as const;

export function isHumanEvidenceRole(role: Role): boolean {
  return (HUMAN_EVIDENCE_ROLES as readonly Role[]).includes(role);
}

/**
 * Evidence attach: Bot/executor/service still require `x-harness-entry: mcp`.
 * decision_maker and coordinator may attach with Bearer only — office 人兜底.
 * Dispatch stays MCP-gated for every role (do not open a bot bypass).
 */
export function assertEvidenceWriteEntry(
  entry: string | undefined,
  path: string,
  actor: Actor,
): void {
  if (isHumanEvidenceRole(actor.role)) return;
  assertMcpEntry(entry, path);
}
