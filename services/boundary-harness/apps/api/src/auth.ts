import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { HttpError } from "./errors.js";

export const ROLES = [
  "decision_maker",
  "coordinator",
  "executor",
  "viewer",
  "service",
] as const;

export type Role = (typeof ROLES)[number];

export type Actor = {
  sub: string;
  role: Role;
  pool_ids: string[];
  iat: number;
  exp: number;
  tid?: string;
};

const encoder = new TextEncoder();

function secretKey(secret: string): Uint8Array {
  return encoder.encode(secret);
}

export async function issueToken(
  secret: string,
  claims: { sub: string; role: Role; pool_ids: string[]; tid?: string; ttlSec?: number },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = claims.ttlSec ?? 3600;
  let jwt = new SignJWT({
    role: claims.role,
    pool_ids: claims.pool_ids,
    ...(claims.tid ? { tid: claims.tid } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl);
  return jwt.sign(secretKey(secret));
}

export async function verifyJwt(token: string, secret: string): Promise<Actor> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, secretKey(secret), { algorithms: ["HS256"] }));
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new HttpError(401, "unauthorized", "token expired");
    }
    throw new HttpError(401, "unauthorized", "invalid token");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new HttpError(401, "unauthorized", "JWT missing sub");
  }
  if (typeof payload.role !== "string" || !(ROLES as readonly string[]).includes(payload.role)) {
    throw new HttpError(401, "unauthorized", "JWT missing or invalid role");
  }
  if (!Array.isArray(payload.pool_ids)) {
    throw new HttpError(401, "unauthorized", "JWT missing pool_ids[]");
  }
  if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
    throw new HttpError(401, "unauthorized", "JWT missing iat/exp");
  }
  return {
    sub: payload.sub,
    role: payload.role as Role,
    pool_ids: payload.pool_ids.map(String),
    iat: payload.iat,
    exp: payload.exp,
    tid: typeof payload.tid === "string" ? payload.tid : undefined,
  };
}

export function assertPoolAccess(actor: Actor, poolId: string): void {
  if (actor.role === "service") return;
  if (actor.pool_ids.includes("*")) return;
  if (!actor.pool_ids.includes(poolId)) {
    throw new HttpError(403, "pool_forbidden", "Cross-pool operation denied");
  }
}

export function requireRoles(actor: Actor, allowed: Role[]): void {
  if (!allowed.includes(actor.role)) {
    throw new HttpError(403, "forbidden", `role ${actor.role} cannot perform this action`);
  }
}
