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
  getAdminFreeze,
  getAssignment,
  getGoal,
  getRun,
  HarnessError,
  health,
  isHarnessError,
  listAudit,
  listGateInstances,
  listPools,
  parseBearer,
  parseRole,
  policyCheck,
  recordGithubSnapshot,
  requireRole,
  setAdminFreeze,
  setGoalDial,
  verifyHarnessWebhook,
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
  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
  const bearer = parseBearer(c.req.header("authorization"));
  if (bearer.jwt) {
    return {
      id: bearer.jwt.sub,
      role: bearer.jwt.role,
      pool_ids: bearer.jwt.pool_ids,
      tid: bearer.jwt.tid,
      request_id: requestId,
    };
  }
  const role = parseRole(bearer.role ?? c.req.header("x-harness-role") ?? c.req.query("role"));
  const id =
    bearer.actor ??
    c.req.header("x-harness-actor") ??
    c.req.query("actor") ??
    `anon:${role}`;
  return { id, role: role as Role, request_id: requestId };
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
      const keys =
        err.details && typeof err.details === "object" && err.details !== null && "keys" in err.details
          ? (err.details as { keys?: string[] }).keys
          : undefined;
      return c.json(
        {
          code: err.code,
          message: err.message,
          keys,
          details: err.details ?? null,
          error: { code: err.code, message: err.message, details: err.details ?? null },
        },
        err.status as 400 | 401 | 403 | 404 | 405 | 409 | 422 | 423 | 500,
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

  const sseEvents = (c: { get: (key: "actor") => Actor; get: (key: "harness") => Harness }) => {
    const actor = c.get("actor");
    requireRole(actor, ["decision_maker", "coordinator", "viewer", "service"]);
    const h = c.get("harness");
    return streamSSE(c as never, async (stream) => {
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
  };

  v1.get("/events", sseEvents as never);
  v1.get("/events/stream", sseEvents as never);

  v1.get("/pools", (c) => c.json({ pools: listPools(c.get("harness")) }));

  v1.get("/admin/freeze", (c) => {
    requireRole(c.get("actor"), ["decision_maker", "service"]);
    return c.json(getAdminFreeze(c.get("harness")));
  });

  v1.post("/admin/freeze", async (c) => {
    const body = (await c.req.json()) as { enabled?: boolean; reason?: string };
    return c.json(setAdminFreeze(c.get("harness"), c.get("actor"), {
      enabled: body.enabled as boolean,
      reason: body.reason,
    }));
  });

  v1.get("/audit", (c) => {
    requireRole(c.get("actor"), ["decision_maker", "coordinator", "service"]);
    return c.json({ audit: listAudit(c.get("harness")) });
  });

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
    const result = await dispatchAssignment(c.get("harness"), c.get("actor"), c.req.param("id"), key);
    const { created, ...run } = result as typeof result & { created?: boolean };
    return c.json(run, created === false ? 200 : 201);
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

  const inboundHook = (note: string) => async (c: { req: { text: () => Promise<string>; header: (n: string) => string | undefined } }) => {
    const rawBody = await c.req.text();
    verifyHarnessWebhook({
      signature: c.req.header("x-harness-signature"),
      timestamp: c.req.header("x-harness-timestamp"),
      rawBody,
    });
    return (c as { json: (body: unknown, status: 202) => Response }).json({ ok: true, accepted: false, note }, 202);
  };

  app.post("/hooks/github", inboundHook("GitHub Ready snapshots are M2; event must go through outbox") as never);
  app.post("/hooks/cursor", inboundHook("Cursor hook HMAC-SHA256 verified; event must go through outbox") as never);
  app.post("/v1/hooks/github", inboundHook("GitHub Ready snapshots are M2; event must go through outbox") as never);
  app.post("/v1/hooks/cursor", inboundHook("Cursor hook HMAC-SHA256 verified; event must go through outbox") as never);

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
