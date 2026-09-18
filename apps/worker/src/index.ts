import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHarness, publishOutbox } from "@harness/domain";

const databasePath = process.env.DATABASE_PATH ?? "data/harness.db";
if (databasePath !== ":memory:") {
  mkdirSync(dirname(databasePath), { recursive: true });
}

const harness = createHarness({ databasePath });
const interval = Number(process.env.WORKER_INTERVAL_MS ?? 500);
console.log(`harness worker listening db=${databasePath} interval=${interval}ms`);

setInterval(() => {
  try {
    const n = publishOutbox(harness);
    if (n > 0) console.log(`published ${n} outbox events`);
  } catch (err) {
    console.error("worker tick failed", err);
  }
}, interval);
