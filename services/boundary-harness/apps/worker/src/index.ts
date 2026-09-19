import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHarness, workerTick } from "@harness/domain";

const databasePath = process.env.DATABASE_PATH ?? "data/harness.db";
if (databasePath !== ":memory:") {
  mkdirSync(dirname(databasePath), { recursive: true });
}

const harness = createHarness({
  databasePath,
  webhookUrl: process.env.WEBHOOK_URL,
});
const interval = Number(process.env.WORKER_INTERVAL_MS ?? 500);
console.log(`harness worker listening db=${databasePath} interval=${interval}ms webhook=${harness.webhookUrl ?? "off"}`);

setInterval(() => {
  void workerTick(harness)
    .then(({ synced, published }) => {
      if (synced > 0) console.log(`synced ${synced} cursor runs`);
      if (published > 0) console.log(`published ${published} outbox events`);
    })
    .catch((err) => console.error("worker tick failed", err));
}, interval);
