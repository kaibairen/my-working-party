import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Hono } from "hono";
import { createHarness, health as domainHealth, workerTick, type Harness } from "@harness/domain";
import { createApp } from "./app";

export type StartApiOpts = {
  port?: number;
  hostname?: string;
  databasePath?: string;
  mode?: string;
  webhookUrl?: string;
  /** CLI: process.exit(2) on EADDRINUSE. Tests: throw. */
  exitOnBusy?: boolean;
};

export type StartedApi = {
  server: ServerType;
  port: number;
  harness: Promise<Harness>;
  close: () => Promise<void>;
};

export function logEaddrInUse(port: number): void {
  console.error(
    JSON.stringify({
      code: "eaddrinuse",
      port,
      message: `harness api :${port} already in use — structured exit, not an unhandled crash`,
    }),
  );
}

/**
 * H1: bind + /health before applySchema so the empty window is listen→ready, not
 * migrate→listen. H3: EADDRINUSE is a structured exit (2), never unhandled.
 */
export function startApiServer(opts: StartApiOpts = {}): Promise<StartedApi> {
  const port = opts.port ?? Number(process.env.PORT ?? 8080);
  const hostname = opts.hostname ?? "0.0.0.0";
  const databasePath = opts.databasePath ?? process.env.DATABASE_PATH ?? "data/harness.db";
  const mode = opts.mode ?? process.env.HARNESS_MODE ?? "api";
  const webhookUrl = opts.webhookUrl ?? process.env.WEBHOOK_URL ?? process.env.DOMAIN_EVENTS_URL;
  const exitOnBusy = opts.exitOnBusy ?? false;

  let harness: Harness | undefined;
  let appFetch: ((req: Request) => Response | Promise<Response>) | undefined;
  let ready = false;

  const boot = new Hono();
  const startingBody = () => ({ ok: true, starting: !ready, port });
  boot.get("/health", (c) => {
    if (ready && harness) return c.json(domainHealth(harness));
    return c.json(startingBody(), 200);
  });
  boot.get("/healthz", (c) => {
    if (ready && harness) return c.json(domainHealth(harness));
    return c.json(startingBody(), 200);
  });
  boot.all("*", async (c) => {
    if (ready && appFetch) return appFetch(c.req.raw);
    return c.json({ ok: false, starting: true }, 503);
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const server = serve({ fetch: boot.fetch, port, hostname }, (info) => {
      if (settled) return;
      settled = true;
      const listenPort = info.port;
      const harnessReady = Promise.resolve().then(() => {
        if (databasePath !== ":memory:") {
          mkdirSync(dirname(databasePath), { recursive: true });
        }
        const h = createHarness({ databasePath, webhookUrl });
        harness = h;
        const app = createApp(h);
        appFetch = (req) => app.fetch(req);
        ready = true;
        if (mode === "worker" || mode === "all") {
          const interval = Number(process.env.WORKER_INTERVAL_MS ?? 500);
          console.log(`harness worker loop ${interval}ms`);
          setInterval(() => {
            void workerTick(h)
              .then(({ synced, published }) => {
                if (synced > 0) console.log(`synced ${synced} cursor runs`);
                if (published > 0) console.log(`published ${published} outbox events`);
              })
              .catch((err) => console.error("worker tick failed", err));
          }, interval);
        }
        console.log(`harness api listening on :${listenPort} mode=${mode} db=${databasePath}`);
        return h;
      });
      resolve({
        server,
        port: listenPort,
        harness: harnessReady,
        close: () =>
          new Promise<void>((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        logEaddrInUse(port);
        if (exitOnBusy) process.exit(2);
        if (!settled) {
          settled = true;
          reject(Object.assign(new Error(`eaddrinuse:${port}`), { code: "EADDRINUSE" }));
        }
        return;
      }
      if (!settled) {
        settled = true;
        reject(err);
      } else {
        console.error("harness api server error", err);
      }
    });
  });
}
