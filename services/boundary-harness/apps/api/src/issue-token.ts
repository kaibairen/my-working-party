import { issueToken, ROLES, type Role } from "./auth.js";
import { loadConfig } from "./config.js";

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const role = (arg("role", "coordinator") ?? "coordinator") as Role;
if (!(ROLES as readonly string[]).includes(role)) {
  console.error(`invalid role; one of ${ROLES.join(",")}`);
  process.exit(1);
}

const config = loadConfig();
const token = await issueToken(config.jwtSecret, {
  sub: arg("sub", "coord-1") ?? "coord-1",
  role,
  pool_ids: (arg("pools", "pool_noop") ?? "pool_noop").split(","),
  tid: arg("tid"),
  ttlSec: Number(arg("ttl", "3600")),
});
process.stdout.write(`${token}\n`);
