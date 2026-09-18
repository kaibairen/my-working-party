import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { assertSecretRef } from "@boundary-harness/domain";
import type { AppConfig } from "./config.js";

export type Db = DatabaseSync;

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix = ""): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function openDb(config: AppConfig): Db {
  const path = config.databasePath;
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db, config.migrationsDir);
  seed(db, config);
  return db;
}

function migrate(db: Db, migrationsDir: string): void {
  const hasMeta = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'")
    .get() as { name?: string } | undefined;
  if (!hasMeta) {
    db.exec(readFileSync(join(migrationsDir, "0001_m0_schema.sql"), "utf8"));
  }
  const hasFreeze = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='freeze_state'")
    .get() as { name?: string } | undefined;
  if (!hasFreeze) {
    db.exec(readFileSync(join(migrationsDir, "0002_m0_security.sql"), "utf8"));
  }
}

function seed(db: Db, config: AppConfig): void {
  const existing = db.prepare("SELECT id FROM pools WHERE id = ?").get("pool_noop") as
    | { id: string }
    | undefined;
  if (!existing) {
    db.prepare("INSERT INTO pools(id, kind, secret_ref, created_at) VALUES (?, ?, ?, ?)").run(
      "pool_noop",
      "noop",
      "env:NOOP_POOL_PLACEHOLDER",
      nowIso(),
    );
  }
  if (config.cursorPoolSecretRef) {
    try {
      const ref = assertSecretRef(config.cursorPoolSecretRef);
      const row = db.prepare("SELECT id FROM pools WHERE id = ?").get("pool_cursor") as
        | { id: string }
        | undefined;
      if (!row) {
        db.prepare("INSERT INTO pools(id, kind, secret_ref, created_at) VALUES (?, ?, ?, ?)").run(
          "pool_cursor",
          "cursor_account",
          ref,
          nowIso(),
        );
      }
    } catch {
      // invalid CURSOR_POOL_SECRET_REF is ignored at boot; create-pool APIs reject
    }
  }
}

export function getFreeze(db: Db): {
  enabled: boolean;
  reason: string | null;
  updated_by: string | null;
  updated_at: string;
} {
  const row = db.prepare("SELECT enabled, reason, updated_by, updated_at FROM freeze_state WHERE id='global'").get() as {
    enabled: number;
    reason: string | null;
    updated_by: string | null;
    updated_at: string;
  };
  return {
    enabled: Boolean(row.enabled),
    reason: row.reason,
    updated_by: row.updated_by,
    updated_at: row.updated_at,
  };
}

export function setFreeze(
  db: Db,
  enabled: boolean,
  reason: string | null,
  updatedBy: string,
): ReturnType<typeof getFreeze> {
  db.prepare(
    "UPDATE freeze_state SET enabled=?, reason=?, updated_by=?, updated_at=? WHERE id='global'",
  ).run(enabled ? 1 : 0, reason, updatedBy, nowIso());
  return getFreeze(db);
}

export function appendAudit(
  db: Db,
  entry: {
    actor_sub: string;
    actor_role: string;
    action: string;
    resource_type?: string;
    resource_id?: string;
    request_id?: string;
    payload?: unknown;
  },
): void {
  db.prepare(
    `INSERT INTO audit_log(id, at, actor_sub, actor_role, action, resource_type, resource_id, request_id, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId("aud"),
    nowIso(),
    entry.actor_sub,
    entry.actor_role,
    entry.action,
    entry.resource_type ?? null,
    entry.resource_id ?? null,
    entry.request_id ?? null,
    entry.payload == null ? null : JSON.stringify(redact(entry.payload)),
  );
}

export function appendOutbox(db: Db, type: string, payload: unknown): string {
  const id = newId("ob");
  db.prepare("INSERT INTO outbox(id, type, payload, created_at, published_at) VALUES (?, ?, ?, ?, NULL)").run(
    id,
    type,
    JSON.stringify(payload),
    nowIso(),
  );
  return id;
}

function redact(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const src = payload as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    const key = k.toLowerCase();
    if (key.includes("secret") || key.includes("password") || key.includes("token") || key === "plaintext") {
      out[k] = "[redacted]";
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function hasActiveException(db: Db, goalId: string, grantee: string): boolean {
  const now = nowIso();
  const row = db
    .prepare(
      `SELECT id FROM exception_grants
       WHERE goal_id = ? AND grantee = ? AND expires_at > ? AND used < max_uses
       LIMIT 1`,
    )
    .get(goalId, grantee, now) as { id: string } | undefined;
  return Boolean(row);
}
