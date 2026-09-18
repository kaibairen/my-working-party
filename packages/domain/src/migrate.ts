import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHarness } from "./db";

const path = process.env.DATABASE_PATH ?? "data/harness.db";
if (path !== ":memory:") {
  mkdirSync(dirname(path), { recursive: true });
}
const h = createHarness({ databasePath: path });
const row = h.sqlite.prepare("SELECT schema_version FROM schema_meta LIMIT 1").get() as
  | { schema_version: number }
  | undefined;
console.log(JSON.stringify({ ok: true, database: path, schema_version: row?.schema_version ?? 0 }));
h.sqlite.close();
