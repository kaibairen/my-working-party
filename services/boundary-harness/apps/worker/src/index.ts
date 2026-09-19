import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHarness, publishOutbox, syncCursorAgentRuns } from "@harness/domain";

const databasePath = process.env.DATABASE_PATH ?? "data/harness.db";
if (databasePath !== ":memory:") {
  mkdirSync(dirname(databasePath), { recursive: true });
}

const harness = createHarness({
  databasePath,
  webhookUrl: process.env.WEBHOOK_URL,
});
const interval = Number(process.env.WORKER_INTERVAL_MS ?? 2000);
console.log(
  `harness worker db=${databasePath} interval=${interval}ms webhook=${harness.webhookUrl ?? "off"} cursor_poll=on`,
);

async function tick() {
  try {
    const sync = await syncCursorAgentRuns(harness);
    if (sync.polled > 0 || sync.finished > 0) {
      console.log(`cursor sync polled=${sync.polled} finished=${sync.finished}`);
    }
  } catch (err) {
    console.error("cursor sync failed", err);
  }
  try {
    const n = await publishOutbox(harness);
    if (n > 0) console.log(`published ${n} outbox events`);
  } catch (err) {
    console.error("outbox tick failed", err);
  }
}

void tick();
setInterval(() => {
  void tick();
}, interval);
