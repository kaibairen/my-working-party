import { EventEmitter } from "node:events";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createCursorAdapter, type CursorAdapter } from "@harness/adapters-cursor";
import { createNoopAdapter, type NoopAdapter } from "@harness/adapters-noop";
import { DELIVER_READY_V1, SAFETY_ONLY_V1 } from "@harness/ready";
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
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO pools (id, kind, secret_ref, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run("pool_noop", "noop", "secret:noop-local", now);
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO pools (id, kind, secret_ref, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run("pool_cursor", "cursor_account", "secret:cursor-env", now);
}

export function applySchema(sqlite: Database.Database): void {
  sqlite.exec(SCHEMA_SQL);
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
