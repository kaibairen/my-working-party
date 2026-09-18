import { loadConfig, type AppConfig } from "../src/config.js";
import { openDb, type Db } from "../src/db.js";
import { createApp } from "../src/app.js";
import { issueToken, type Role } from "../src/auth.js";

export const JWT_SECRET = "test-jwt-secret";
export const WEBHOOK_SECRET = "test-webhook-secret";

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return loadConfig({
    databasePath: ":memory:",
    jwtSecret: JWT_SECRET,
    webhookSecret: WEBHOOK_SECRET,
    ...overrides,
  });
}

export function testApp() {
  const config = testConfig();
  const db = openDb(config);
  const app = createApp(db, config);
  return { app, db, config };
}

export async function token(role: Role, pools: string[] = ["pool_noop"], sub = role): Promise<string> {
  return issueToken(JWT_SECRET, { sub, role, pool_ids: pools });
}

export async function json(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = headers["content-type"] ?? "application/json";
  const payload =
    opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  const res = await app.request(path, {
    method,
    headers,
    body: payload,
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

export const briefOk = {
  outcome: "ship a stub",
  constraints: [],
  evidence_shape: ["summary_md", "artifact_uri"],
};

export async function exploreReadyPath(app: ReturnType<typeof createApp>, coord: string) {
  const goal = await json(app, "POST", "/v1/goals", {
    token: coord,
    body: {
      title: "explore smoke",
      mode: "explore",
      coordinator_ref: "coord-1",
      gate_template_id: null,
    },
  });
  const assignment = await json(app, "POST", `/v1/goals/${(goal.data as { id: string }).id}/assignments`, {
    token: coord,
    body: { pool_id: "pool_noop", brief: briefOk, budget: { max_runs: 1 } },
  });
  const run = await json(app, "POST", `/v1/assignments/${(assignment.data as { id: string }).id}/dispatch`, {
    token: coord,
    body: { adapter: "noop" },
    headers: { "Idempotency-Key": "smoke-1" },
  });
  const ev1 = await json(app, "POST", `/v1/runs/${(run.data as { id: string }).id}/evidence`, {
    token: coord,
    body: { kind: "summary_md", uri: "file:/tmp/summary.md" },
  });
  const ev2 = await json(app, "POST", `/v1/runs/${(run.data as { id: string }).id}/evidence`, {
    token: coord,
    body: { kind: "artifact_uri", uri: "file:/tmp/artifact.bin" },
  });
  const ready = await json(app, "GET", `/v1/goals/${(goal.data as { id: string }).id}/ready`, {
    token: coord,
  });
  return { goal, assignment, run, ev1, ev2, ready };
}
