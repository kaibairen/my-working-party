/**
 * Local 对照门: real HTTP against a listening API on :8080 (no Docker).
 * Starts the API if /healthz is not already up; tears down only if we spawned it.
 *
 * This is NOT M0 Done. Compose smoke + a non-draft PR are still required.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { issueToken } from "../apps/api/src/auth.js";

const BASE = process.env.SMOKE_BASE ?? "http://127.0.0.1:8080";
const JWT_SECRET = process.env.AUTH_JWT_SECRET ?? "dev-m0-jwt-secret-change-me";
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

type Json = { status: number; data: unknown };

async function request(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Json> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function fail(step: string, got: unknown): never {
  console.error(`SMOKE FAIL: ${step}`, got);
  process.exit(1);
}

function expect(step: string, cond: boolean, detail?: unknown): void {
  if (!cond) fail(step, detail);
  console.log(`SMOKE OK  ${step}`);
}

async function healthzOk(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/healthz`);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitHealthz(timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await healthzOk()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  fail("api did not become healthy on :8080", BASE);
}

async function startApi(): Promise<ChildProcess> {
  const dir = mkdtempSync(join(tmpdir(), "harness-smoke-"));
  const child = spawn("npm", ["run", "start"], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: `file:${join(dir, "smoke.db")}`,
      AUTH_JWT_SECRET: JWT_SECRET,
      WEBHOOK_SIGNING_SECRET: process.env.WEBHOOK_SIGNING_SECRET ?? "dev-m0-webhook-secret-change-me",
      PORT: "8080",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  child.stdout?.on("data", (b) => process.stdout.write(b));
  child.stderr?.on("data", (b) => process.stderr.write(b));
  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      console.error(`API exited early code=${code} signal=${signal}`);
    }
  });
  await waitHealthz();
  return child;
}

function stopApi(child: ChildProcess): void {
  child.stdout?.destroy();
  child.stderr?.destroy();
  if (child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

const briefOk = {
  outcome: "ship a stub",
  constraints: [] as string[],
  evidence_shape: ["summary_md", "artifact_uri"],
};

async function main(): Promise<void> {
  let spawned: ChildProcess | undefined;
  const alreadyUp = await healthzOk();
  if (alreadyUp) {
    console.log("SMOKE using existing API on", BASE);
  } else {
    console.log("SMOKE starting API on :8080");
    spawned = await startApi();
  }

  try {
    const hz = await request("GET", "/healthz");
    expect("GET /healthz 200", hz.status === 200 && (hz.data as { ok?: boolean }).ok === true, hz);

    const coord = await issueToken(JWT_SECRET, {
      sub: "smoke-coord",
      role: "coordinator",
      pool_ids: ["pool_noop"],
    });
    const dm = await issueToken(JWT_SECRET, {
      sub: "smoke-dm",
      role: "decision_maker",
      pool_ids: ["pool_noop"],
    });

    const goal = await request("POST", "/v1/goals", {
      token: coord,
      body: {
        title: "npm-run-smoke",
        mode: "explore",
        coordinator_ref: "smoke-coord",
        gate_template_id: null,
      },
    });
    expect("POST /v1/goals explore", goal.status === 201, goal);
    const goalId = (goal.data as { id: string }).id;

    const badBrief = await request("POST", `/v1/goals/${goalId}/assignments`, {
      token: coord,
      body: { pool_id: "pool_noop", brief: { ...briefOk, steps: ["do a", "do b"] } },
    });
    expect(
      "brief with steps → 422 brief_forbidden_field",
      badBrief.status === 422 && (badBrief.data as { code?: string }).code === "brief_forbidden_field",
      badBrief,
    );

    const asg = await request("POST", `/v1/goals/${goalId}/assignments`, {
      token: coord,
      body: { pool_id: "pool_noop", brief: briefOk, budget: { max_runs: 1 } },
    });
    expect("POST assignment BriefV1", asg.status === 201, asg);
    const asgId = (asg.data as { id: string }).id;

    const froze = await request("POST", "/v1/admin/freeze", {
      token: dm,
      body: { enabled: true, reason: "npm-run-smoke" },
    });
    expect("POST freeze enabled", froze.status === 200 && (froze.data as { enabled?: boolean }).enabled === true, froze);

    const blocked = await request("POST", `/v1/assignments/${asgId}/dispatch`, {
      token: coord,
      headers: { "Idempotency-Key": `smoke-freeze-${Date.now()}` },
      body: { adapter: "noop" },
    });
    expect(
      "freeze → dispatch 423 freeze_active",
      blocked.status === 423 && (blocked.data as { code?: string }).code === "freeze_active",
      blocked,
    );

    const thawed = await request("POST", "/v1/admin/freeze", {
      token: dm,
      body: { enabled: false },
    });
    expect("POST freeze disabled", thawed.status === 200 && (thawed.data as { enabled?: boolean }).enabled === false, thawed);

    const run = await request("POST", `/v1/assignments/${asgId}/dispatch`, {
      token: coord,
      headers: { "Idempotency-Key": `smoke-noop-${Date.now()}` },
      body: { adapter: "noop" },
    });
    expect("noop dispatch 201", run.status === 201 && (run.data as { adapter?: string }).adapter === "noop", run);
    const runId = (run.data as { id: string }).id;

    const ev1 = await request("POST", `/v1/runs/${runId}/evidence`, {
      token: coord,
      body: { kind: "summary_md", uri: "file:/tmp/smoke-summary.md" },
    });
    expect("evidence summary_md", ev1.status === 201, ev1);
    const ev2 = await request("POST", `/v1/runs/${runId}/evidence`, {
      token: coord,
      body: { kind: "artifact_uri", uri: "file:/tmp/smoke-artifact.bin" },
    });
    expect("evidence artifact_uri", ev2.status === 201, ev2);

    const ready = await request("GET", `/v1/goals/${goalId}/ready`, { token: coord });
    expect(
      "happy noop ready stub",
      ready.status === 200 &&
        (ready.data as { stub?: boolean; ok?: boolean }).stub === true &&
        (ready.data as { ok?: boolean }).ok === true,
      ready,
    );

    console.log("SMOKE PASS (对照门; compose smoke still required for M0 Done)");
  } finally {
    if (spawned) stopApi(spawned);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
