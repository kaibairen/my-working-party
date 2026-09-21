import { startApiServer } from "./server";

/**
 * api_8080_bind_no_blip — process entry (H1 / H2 / H3).
 *
 * H1: startApiServer binds + serves /health BEFORE applySchema (deferred in server).
 *     Do not migrate in this file — that was the ~1.2s cold refused window.
 * H2: compose may map host:8080 before Node listen; early listen shrinks RST.
 *     DevOps wait-api-healthy.sh / compose healthcheck are complementary.
 * H3: EADDRINUSE is a structured exit(2) + JSON log, never an unhandled crash.
 *     Mid-session 「绑定时闪断」is H3/cold restart, not bindAssignment SQLite.
 */
function stayUp(err: unknown) {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code === "EADDRINUSE") {
    process.exit(2);
  }
  // Bind / fill / worker ticks must not take :8080 down after listen.
  console.error("harness api: non-fatal", err);
}
process.on("uncaughtException", stayUp);
process.on("unhandledRejection", stayUp);

startApiServer({ exitOnBusy: true }).catch((err: NodeJS.ErrnoException) => {
  if (err?.code === "EADDRINUSE") process.exit(2);
  console.error("harness api failed to start", err);
  process.exit(1);
});
