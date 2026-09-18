import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import {
  assertNoClientStatusWrite,
  assertNoPlaintextCredentials,
  attachEvidence,
  createExceptionGrant,
  createGoal,
  decideGate,
  dispatchAssignment,
  fillAssignment,
  getAssignment,
  getGoal,
  getRun,
  HarnessError,
  health,
  isHarnessError,
  listGateInstances,
  listPools,
  parseBearer,
  parseRole,
  policyCheck,
  recordGithubSnapshot,
  requireRole,
  setGoalDial,
  type Actor,
  type Harness,
  type Role,
} from "@harness/domain";

export type AppEnv = {
  Variables: {
    harness: Harness;
    actor: Actor;
  };
};

const here = dirname(fileURLToPath(import.meta.url));
const inboxHtml = readFileSync(join(here, "inbox.html"), "utf8");
const opsHtml = readFileSync(join(here, "ops.html"), "utf8");
const openapiPath = join(here, "../../../openapi/openapi.yaml");

function readActor(c: {
  req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined };
}): Actor {
  const bearer = parseBearer(c.req.header("authorization"));
  const role = parseRole(bearer.role ?? c.req.header("x-harness-role") ?? c.req.query("role"));
  const id =
    bearer.actor ??
    c.req.header("x-harness-actor") ??
    c.req.query("actor") ??
    `anon:${role}`;
  return { id, role: role as Role };
}

function verifyInboundHmac(c: { req: { header: (name: string) => string | undefined } }): void {
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  const sig = c.req.header("x-harness-signature") ?? c.req.header("x-hub-signature-256");
  if (!secret || !sig) {
    throw new HarnessError(
      "hmac_unverified",
      "inbound hook rejected: signature not verified (HMAC algorithm/header not frozen)",
      401,
    );
  }
}

export function createApp(harness: Harness) {
  const app = new Hono<AppEnv>();
  app.use("*", cors());
  app.use("*", async (c, next) => {
    c.set("harness", harness);
    await next();
  });

  app.onError((err, c) => {
    if (isHarnessError(err)) {
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details ?? null } },
        err.status as 400 | 401 | 403 | 404 | 405 | 409 | 422 | 500,
      );
    }
    console.error(err);
    return c.json({ error: { code: "internal", message: "internal error" } }, 500);
  });

  app.get("/", (c) => c.redirect("/inbox"));
  app.get("/inbox", (c) => c.html(inboxHtml));
  app.get("/ops", (c) => c.html(opsHtml));
  app.get("/health", (c) => c.json(health(c.get("harness"))));
  app.get("/openapi.yaml", (c) => {
    const yaml = readFileSync(openapiPath, "utf8");
    return c.body(yaml, 200, { "content-type": "application/yaml; charset=utf-8" });
  });

  const v1 = new Hono<AppEnv>();
  v1.use("*", async (c, next) => {
    c.set("actor", readActor(c));
    await next();
  });

  v1.get("/events", (c) => {
    const actor = c.get("actor");
    requireRole(actor, ["decision_maker", "coordinator", "viewer", "service"]);
    const h = c.get("harness");
    return streamSSE(c, async (stream) => {
      const onReady = async (payload: unknown) => {
        await stream.writeSSE({ event: "gate.ready", data: JSON.stringify(payload) });
      };
      h.bus.on("gate.ready", onReady);
      await stream.writeSSE({ event: "hello", data: JSON.stringify({ ok: true, actor }) });
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          void stream.writeSSE({ event: "ping", data: "{}" });
        }, 15000);
        stream.onAbort(() => {
          clearInterval(timer);
          h.bus.off("gate.ready", onReady);
          resolve();
        });
      });
    });
  });

  v1.get("/pools", (c) => c.json({ pools: listPools(c.get("harness")) }));

  v1.post("/goals", async (c) => {
    const body = await c.req.json();
    assertNoPlaintextCredentials(body);
    return c.json(createGoal(c.get("harness"), c.get("actor"), body), 201);
  });

  v1.post("/goals/:id/dial", async (c) => {
    const body = (await c.req.json()) as { dial?: string };
    return c.json(setGoalDial(c.get("harness"), c.get("actor"), c.req.param("id"), String(body.dial ?? "")));
  });

  v1.get("/goals/:id", (c) => c.json(getGoal(c.get("harness"), c.req.param("id"))));

  v1.post("/goals/:id/assignments", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    assertNoPlaintextCredentials(body);
    assertNoClientStatusWrite(c.get("actor").role, body);
    return c.json(
      fillAssignment(c.get("harness"), c.get("actor"), c.req.param("id"), {
        pool_id: String(body.pool_id ?? ""),
        brief: body.brief,
        budget: body.budget,
        exception_grant_id: body.exception_grant_id as string | undefined,
      }),
      201,
    );
  });

  v1.post("/goals/:id/exception-grants", async (c) => {
    const body = await c.req.json();
    return c.json(createExceptionGrant(c.get("harness"), c.get("actor"), c.req.param("id"), body), 201);
  });

  v1.get("/assignments/:id", (c) => c.json(getAssignment(c.get("harness"), c.req.param("id"))));

  v1.post("/assignments/:id/dispatch", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const key = String(body.idempotency_key ?? c.req.header("idempotency-key") ?? "");
    return c.json(await dispatchAssignment(c.get("harness"), c.get("actor"), c.req.param("id"), key));
  });

  v1.get("/runs/:id", (c) => c.json(getRun(c.get("harness"), c.req.param("id"))));

  v1.post("/runs/:id/evidence", async (c) => {
    const body = (await c.req.json()) as { items?: unknown };
    return c.json(
      attachEvidence(c.get("harness"), c.get("actor"), c.req.param("id"), (body.items ?? []) as never),
      201,
    );
  });

  v1.post("/policy/check", async (c) => {
    const body = await c.req.json();
    return c.json(policyCheck(c.get("harness"), c.get("actor"), body));
  });

  v1.get("/gates", (c) => {
    return c.json({
      gates: listGateInstances(c.get("harness"), c.get("actor"), {
        status: c.req.query("status"),
        goal_id: c.req.query("goal_id"),
      }),
    });
  });

  v1.post("/gates/:id/decide", async (c) => {
    const body = await c.req.json();
    return c.json(await decideGate(c.get("harness"), c.get("actor"), c.req.param("id"), body));
  });

  v1.post("/github-snapshots", async (c) => {
    const actor = c.get("actor");
    if (actor.role !== "service") {
      return c.json({ error: { code: "forbidden", message: "service only" } }, 403);
    }
    const body = await c.req.json();
    return c.json(recordGithubSnapshot(c.get("harness"), body), 201);
  });

  app.post("/hooks/github", async (c) => {
    verifyInboundHmac(c);
    return c.json({ ok: true, accepted: false, note: "GitHub Ready snapshots are M2; event must go through outbox" });
  });
  app.post("/hooks/cursor", async (c) => {
    verifyInboundHmac(c);
    return c.json({ ok: true, accepted: false, note: "Cursor hook HMAC header/algorithm not frozen" });
  });

  for (const path of ["/audit", "/policy-events", "/gate-decisions"]) {
    v1.on("PATCH", path, () => {
      throw new HarnessError("append_only", "audit/policy_events/gate_decisions are append-only", 405);
    });
    v1.on("DELETE", path, () => {
      throw new HarnessError("append_only", "audit/policy_events/gate_decisions are append-only", 405);
    });
  }

  app.route("/v1", v1);
  return app;
}
