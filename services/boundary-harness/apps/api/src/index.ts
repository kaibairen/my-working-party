import { startApiServer } from "./server";

function stayUp(err: unknown) {
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
