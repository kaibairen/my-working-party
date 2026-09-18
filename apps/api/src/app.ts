import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  assertNoClientStatusWrite,
  attachEvidence,
  createExceptionGrant,
  createGoal,
  decideGate,
  dispatchAssignment,
  fillAssignment,
  getAssignment,
  getGoal,
  getRun,
  health,
  isHarnessError,
  listGateInstances,
  listPools,
  parseRole,
  policyCheck,
  recordGithubSnapshot,
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

function readActor(c: { req: { header: (name: string) => string | undefined } }): Actor {
  const role = parseRole(c.req.header("x-harness-role"));
  const id = c.req.header("x-harness-actor") ?? `anon:${role}`;
  return { id, role: role as Role };
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
        err.status as 400 | 401 | 403 | 404 | 409 | 422 | 500,
      );
    }
    console.error(err);
    return c.json({ error: { code: "internal", message: "internal error" } }, 500);
  });

  app.get("/health", (c) => c.json(health(c.get("harness"))));

  const v1 = new Hono<AppEnv>();
  v1.use("*", async (c, next) => {
    if (c.req.path === "/health") return next();
    c.set("actor", readActor(c));
    await next();
  });

  v1.get("/pools", (c) => c.json({ pools: listPools(c.get("harness")) }));

  v1.post("/goals", async (c) => {
    const body = await c.req.json();
    return c.json(createGoal(c.get("harness"), c.get("actor"), body), 201);
  });

  v1.get("/goals/:id", (c) => c.json(getGoal(c.get("harness"), c.req.param("id"))));

  v1.post("/goals/:id/assignments", async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
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
    return c.json(dispatchAssignment(c.get("harness"), c.get("actor"), c.req.param("id"), key));
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
    return c.json(decideGate(c.get("harness"), c.get("actor"), c.req.param("id"), body));
  });

  v1.post("/github-snapshots", async (c) => {
    const actor = c.get("actor");
    if (actor.role !== "service") {
      return c.json({ error: { code: "forbidden", message: "service only" } }, 403);
    }
    const body = await c.req.json();
    return c.json(recordGithubSnapshot(c.get("harness"), body), 201);
  });

  app.route("/v1", v1);
  return app;
}
