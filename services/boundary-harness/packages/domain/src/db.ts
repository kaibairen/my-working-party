import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createCursorAdapter, type CursorAdapter } from "@harness/adapters-cursor";
import { createNoopAdapter, type NoopAdapter } from "@harness/adapters-noop";
import { DELIVER_READY_V1, SAFETY_ONLY_V1 } from "@harness/ready";
import { assertSecretRef } from "./rbac";
import { schema } from "./schema";
import { SCHEMA_VERSION } from "./schema-sql";

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
  webhookSecret?: string;
  now: () => string;
  newId: () => string;
};

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "../migrations");

function tableExists(sqlite: Database.Database, name: string): boolean {
  const row = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) as
    | { name: string }
    | undefined;
  return Boolean(row);
}

function columnNames(sqlite: Database.Database, table: string): string[] {
  return (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

function seed(sqlite: Database.Database, now: string): void {
  sqlite.prepare("INSERT OR IGNORE INTO schema_meta (key, value) VALUES (?, ?)").run("schema_version", String(SCHEMA_VERSION));
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
      `INSERT OR IGNORE INTO freeze_state (id, enabled, reason, updated_by, updated_at)
       VALUES ('global', 0, NULL, 'system', ?)`,
    )
    .run(now);
}

function applyCompat(sqlite: Database.Database): void {
  if (tableExists(sqlite, "goals") && !columnNames(sqlite, "goals").includes("dial")) {
    sqlite.exec("ALTER TABLE goals ADD COLUMN dial TEXT NOT NULL DEFAULT 'free'");
  }
  if (tableExists(sqlite, "goals") && !columnNames(sqlite, "goals").includes("intent")) {
    sqlite.exec("ALTER TABLE goals ADD COLUMN intent TEXT");
  }
  if (tableExists(sqlite, "gate_instances") && !columnNames(sqlite, "gate_instances").includes("assignment_id")) {
    sqlite.exec("ALTER TABLE gate_instances ADD COLUMN assignment_id TEXT");
  }
  if (tableExists(sqlite, "outbox")) {
    const cols = columnNames(sqlite, "outbox");
    if (!cols.includes("attempts")) sqlite.exec("ALTER TABLE outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0");
    if (!cols.includes("last_error")) sqlite.exec("ALTER TABLE outbox ADD COLUMN last_error TEXT");
    if (!cols.includes("next_attempt_at")) sqlite.exec("ALTER TABLE outbox ADD COLUMN next_attempt_at TEXT");
  }
  if (tableExists(sqlite, "policy_events")) {
    const cols = columnNames(sqlite, "policy_events");
    if (!cols.includes("reason_code")) sqlite.exec("ALTER TABLE policy_events ADD COLUMN reason_code TEXT");
    if (!cols.includes("fail_count")) sqlite.exec("ALTER TABLE policy_events ADD COLUMN fail_count INTEGER NOT NULL DEFAULT 0");
    if (!cols.includes("payload_json")) sqlite.exec("ALTER TABLE policy_events ADD COLUMN payload_json TEXT");
    if (!cols.includes("action")) sqlite.exec("ALTER TABLE policy_events ADD COLUMN action TEXT");
    if (!cols.includes("closed")) sqlite.exec("ALTER TABLE policy_events ADD COLUMN closed INTEGER NOT NULL DEFAULT 0");
  }
  if (tableExists(sqlite, "schema_meta") && columnNames(sqlite, "schema_meta").includes("schema_version") && !columnNames(sqlite, "schema_meta").includes("key")) {
    sqlite.exec(`
      CREATE TABLE schema_meta_v2 (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO schema_meta_v2(key, value)
        SELECT 'schema_version', CAST(schema_version AS TEXT) FROM schema_meta;
      DROP TABLE schema_meta;
      ALTER TABLE schema_meta_v2 RENAME TO schema_meta;
    `);
  }
}

export function applySchema(sqlite: Database.Database): void {
  if (!tableExists(sqlite, "schema_meta")) {
    sqlite.exec(readFileSync(join(migrationsDir, "0001_m0_schema.sql"), "utf8"));
  }
  if (!tableExists(sqlite, "freeze_state")) {
    sqlite.exec(readFileSync(join(migrationsDir, "0002_m0_security.sql"), "utf8"));
  }
  applyCompat(sqlite);
}

export function createHarness(opts?: {
  databasePath?: string;
  now?: () => string;
  newId?: () => string;
  adapters?: Partial<Harness["adapters"]>;
  webhookUrl?: string;
  webhookSecret?: string;
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
    webhookSecret: opts?.webhookSecret ?? process.env.WEBHOOK_SIGNING_SECRET,
    now,
    newId: opts?.newId ?? (() => crypto.randomUUID()),
  };
}

export function closeHarness(h: Harness): void {
  h.sqlite.close();
}
