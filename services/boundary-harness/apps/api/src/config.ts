import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type AppConfig = {
  port: number;
  databasePath: string;
  jwtSecret: string;
  webhookSecret: string;
  dialDefault: "free" | "guided" | "gated" | "freeze";
  migrationsDir: string;
  cursorPoolSecretRef?: string;
};

function readSecretFile(path: string): string {
  return readFileSync(path, "utf8").trim();
}

function secretFromEnv(valueName: string, fileName: string, fallback: string): string {
  const file = process.env[fileName];
  if (file) return readSecretFile(file);
  const value = process.env[valueName];
  if (value) return value;
  return fallback;
}

export function parseDatabasePath(url: string): string {
  if (url === ":memory:" || url === "file::memory:" || url === "file::memory:?cache=shared") {
    return ":memory:";
  }
  if (url.startsWith("file:")) return url.slice("file:".length);
  return url;
}

function findMigrationsDir(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../migrations"),
    join(here, "../../migrations"),
    join(here, "../../../deploy/migrations"),
    join(process.cwd(), "apps/api/migrations"),
    join(process.cwd(), "deploy/migrations"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "0001_m0_schema.sql"))) return c;
  }
  return candidates[0];
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const dbUrl = process.env.DATABASE_URL ?? "file:./data/harness.m0.db";
  return {
    port: Number(process.env.PORT ?? 8080),
    databasePath: parseDatabasePath(dbUrl),
    jwtSecret: secretFromEnv("AUTH_JWT_SECRET", "AUTH_JWT_SECRET_FILE", "dev-m0-jwt-secret-change-me"),
    webhookSecret: secretFromEnv(
      "WEBHOOK_SIGNING_SECRET",
      "WEBHOOK_SIGNING_SECRET_FILE",
      "dev-m0-webhook-secret-change-me",
    ),
    dialDefault: (process.env.DIAL_DEFAULT as AppConfig["dialDefault"]) || "guided",
    migrationsDir: findMigrationsDir(),
    cursorPoolSecretRef: process.env.CURSOR_POOL_SECRET_REF,
    ...overrides,
  };
}
