import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHarness } from "./db";

const path = process.env.DATABASE_PATH ?? "data/harness.db";
if (path !== ":memory:") {
  mkdirSync(dirname(path), { recursive: true });
}
const h = createHarness({ databasePath: path });
const row = h.sqlite.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version' LIMIT 1").get() as
  | { value: string }
  | undefined;
console.log(JSON.stringify({ ok: true, database: path, schema_version: Number(row?.value ?? 0) }));
h.sqlite.close();
