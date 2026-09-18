import { EventEmitter } from "node:events";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createCursorAdapter, type CursorAdapter } from "@harness/adapters-cursor";
import { createNoopAdapter, type NoopAdapter } from "@harness/adapters-noop";
import { DELIVER_READY_V1, SAFETY_ONLY_V1 } from "@harness/ready";
import { assertSecretRef } from "./rbac";
import { schema } from "./schema";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema-sql";

export type Db = BetterSQLite3Database<typeof schema>;

export type RuntimeDispatchResult = {
  adapter: string;
  external_agent_id: string | null;
  external_run_id: string | null;
  status: string;
  usage_json: unknown;
  error?: string;
};

export type RuntimeAdapter = {
  name: string;
  dispatch(input: {
    runId: string;
    assignmentId: string;
    idempotencyKey?: string;
  }): RuntimeDispatchResult | Promise<RuntimeDispatchResult>;
};

export type Harness = {
  db: Db;
  sqlite: Database.Database;
  adapters: { noop: NoopAdapter; cursor: CursorAdapter };
  bus: EventEmitter;
  webhookUrl?: string;
  now: () => string;
  newId: () => string;
};

function seed(sqlite: Database.Database, now: string): void {
  sqlite.prepare("INSERT OR IGNORE INTO schema_meta (schema_version) VALUES (?)").run(SCHEMA_VERSION);
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO ready_predicates (id, version, dsl_json, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(SAFETY_ONLY_V1.id, SAFETY_ONLY_V1.version, JSON.stringify(SAFETY_ONLY_V1), now);
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO ready_predicates (id, version, dsl_json, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(DELIVER_READY_V1.id, DELIVER_READY_V1.version, JSON.stringify(DELIVER_READY_V1), now);
  const noopRef = "file:/var/lib/harness/noop.secret";
  const cursorRef = "env:CURSOR_API_KEY";
  assertSecretRef(noopRef);
  assertSecretRef(cursorRef);
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO pools (id, kind, secret_ref, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run("pool_noop", "noop", noopRef, now);
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO pools (id, kind, secret_ref, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run("pool_cursor", "cursor_account", cursorRef, now);
  sqlite
    .prepare(
      `UPDATE pools SET secret_ref = ? WHERE id = 'pool_noop' AND secret_ref NOT LIKE 'file:%' AND secret_ref NOT LIKE 'env:%'`,
    )
    .run(noopRef);
  sqlite
    .prepare(
      `UPDATE pools SET secret_ref = ? WHERE id = 'pool_cursor' AND secret_ref NOT LIKE 'file:%' AND secret_ref NOT LIKE 'env:%'`,
    )
    .run(cursorRef);
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO admin_freeze (id, enabled, reason, updated_by, updated_at)
       VALUES ('default', 0, NULL, NULL, ?)`,
    )
    .run(now);
}

function migrateAuditLog(sqlite: Database.Database): void {
  const cols = sqlite.prepare("PRAGMA table_info(audit_log)").all() as { name: string }[];
  const names = cols.map((c) => c.name);
  if (names.includes("actor_sub")) return;
  if (!names.includes("actor")) return;
  sqlite.exec(`
    CREATE TABLE audit_log_v2 (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      actor_sub TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      request_id TEXT,
      payload_json TEXT
    );
    INSERT INTO audit_log_v2 (id, at, actor_sub, actor_role, action, resource_type, resource_id, request_id, payload_json)
    SELECT id, created_at, actor, role, action, entity_type, entity_id, NULL, payload_json FROM audit_log;
    DROP TABLE audit_log;
    ALTER TABLE audit_log_v2 RENAME TO audit_log;
  `);
}

export function applySchema(sqlite: Database.Database): void {
  sqlite.exec(SCHEMA_SQL);
  const cols = sqlite.prepare("PRAGMA table_info(goals)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "dial")) {
    sqlite.exec("ALTER TABLE goals ADD COLUMN dial TEXT NOT NULL DEFAULT 'free'");
  }
  migrateAuditLog(sqlite);
}

export function createHarness(opts?: {
  databasePath?: string;
  now?: () => string;
  newId?: () => string;
  adapters?: Partial<Harness["adapters"]>;
  webhookUrl?: string;
}): Harness {
  const databasePath = opts?.databasePath ?? process.env.DATABASE_PATH ?? ":memory:";
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  if (databasePath !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
  }
  applySchema(sqlite);
  const now = opts?.now ?? (() => new Date().toISOString());
  seed(sqlite, now());
  return {
    db: drizzle(sqlite, { schema }),
    sqlite,
    adapters: {
      noop: opts?.adapters?.noop ?? createNoopAdapter(),
      cursor: opts?.adapters?.cursor ?? createCursorAdapter(),
    },
    bus: new EventEmitter(),
    webhookUrl: opts?.webhookUrl ?? process.env.WEBHOOK_URL,
    now,
    newId: opts?.newId ?? (() => crypto.randomUUID()),
  };
}

export function closeHarness(h: Harness): void {
  h.sqlite.close();
}
