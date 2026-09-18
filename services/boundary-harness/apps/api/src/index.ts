import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { createApp } from "./app.js";

const config = loadConfig();
const db = openDb(config);
const app = createApp(db, config);

serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
  console.log(
    JSON.stringify({
      msg: "boundary-harness api listening",
      port: info.port,
      schema: "m0",
    }),
  );
});
