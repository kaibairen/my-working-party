import { logEaddrInUse, startApiServer } from "./server";

/**
 * api_8080_bind_no_blip — process entry (CTO+DevOps H1 primary).
 *
 * 1) Bind/listen + /health BEFORE applySchema. startApiServer listens first
 *    and defers createHarness. Do not migrate in this file.
 * 2) EADDRINUSE → structured log + exit 2. Never an unhandled crash.
 * 3) Compose host-port-after-listen is DevOps; early listen helps.
 *    Align: deploy/wait-api-healthy.sh (BASE / TIMEOUT_SECS / NO_BLIP_SECS).
 */
function eaddrExit(): never {
  logEaddrInUse(Number(process.env.PORT ?? 8080));
  process.exit(2);
}

function stayUp(err: unknown) {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code === "EADDRINUSE") eaddrExit();
  // Bind / fill / worker ticks must not take :8080 down after listen.
  console.error("harness api: non-fatal", err);
}
process.on("uncaughtException", stayUp);
process.on("unhandledRejection", stayUp);

startApiServer({ exitOnBusy: true }).catch((err: NodeJS.ErrnoException) => {
  if (err?.code === "EADDRINUSE") eaddrExit();
  console.error("harness api failed to start", err);
  process.exit(1);
});
