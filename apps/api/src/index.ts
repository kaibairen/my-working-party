import { serve } from "@hono/node-server";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHarness, publishOutbox } from "@harness/domain";
import { createApp } from "./app";

const mode = process.env.HARNESS_MODE ?? "api";
const databasePath = process.env.DATABASE_PATH ?? "data/harness.db";
if (databasePath !== ":memory:") {
  mkdirSync(dirname(databasePath), { recursive: true });
}

const harness = createHarness({ databasePath });
const port = Number(process.env.PORT ?? 8080);

if (mode === "api" || mode === "all") {
  const app = createApp(harness);
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`harness api listening on :${info.port} mode=${mode} db=${databasePath}`);
  });
}

if (mode === "worker" || mode === "all") {
  const interval = Number(process.env.WORKER_INTERVAL_MS ?? 500);
  console.log(`harness worker loop ${interval}ms`);
  setInterval(() => {
    try {
      const n = publishOutbox(harness);
      if (n > 0) console.log(`published ${n} outbox events`);
    } catch (err) {
      console.error("worker tick failed", err);
    }
  }, interval);
}

if (mode === "worker") {
  // worker-only process: keep event loop alive via interval above
}
