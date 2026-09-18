import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createNoopAdapter, type NoopAdapter } from "@harness/adapters-noop";
import { DELIVER_READY_V1, SAFETY_ONLY_V1 } from "@harness/ready";
import { schema } from "./schema";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema-sql";

export type Db = BetterSQLite3Database<typeof schema>;

export type Harness = {
  db: Db;
  sqlite: Database.Database;
  adapter: NoopAdapter;
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
}

export function applySchema(sqlite: Database.Database): void {
  sqlite.exec(SCHEMA_SQL);
}

export function createHarness(opts?: {
  databasePath?: string;
  now?: () => string;
  newId?: () => string;
  adapter?: NoopAdapter;
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
    adapter: opts?.adapter ?? createNoopAdapter(),
    now,
    newId: opts?.newId ?? (() => crypto.randomUUID()),
  };
}

export function closeHarness(h: Harness): void {
  h.sqlite.close();
}
