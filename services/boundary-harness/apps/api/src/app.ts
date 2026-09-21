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
  createPool,
  decideGate,
  dispatchAssignment,
  fillAssignment,
  bindAssignment,
  getAdminFreeze,
  getAssignment,
  getGoal,
  getRun,
  listFillSlots,
  listGoals,
  HarnessError,
  health,
  isHarnessError,
  listAudit,
  listEventsAfter,
  listGateInstances,
  listGithubSnapshots,
  listDesks,
  listOutbox,
  listPools,
  parseBearer,
  parseRole,
  policyCheck,
  expireChannelHeartbeats,
  recordHeartbeat,
  assertMcpEntry,
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
const officeHtml = readFileSync(join(here, "office.html"), "utf8");
const opsHtml = readFileSync(join(here, "ops.html"), "utf8");
const openapiPath = join(here, "../../../openapi/openapi.yaml");
const examplesRoot = join(here, "../../../examples");

function mountExample(app: Hono<AppEnv>, name: string, assets: readonly string[]) {
  const dir = join(examplesRoot, name);
  const base = `/examples/${name}`;
  app.get(base, (c) => c.redirect(`${base}/`));
  app.get(`${base}/`, (c) => c.html(readFileSync(join(dir, "index.html"), "utf8")));
  for (const asset of assets) {
    app.get(`${base}/${asset}`, (c) => {
      const contentType = asset.endsWith(".js")
        ? "text/javascript; charset=utf-8"
        : asset.endsWith(".md")
          ? "text/markdown; charset=utf-8"
          : "text/plain; charset=utf-8";
      return c.body(readFileSync(join(dir, asset), "utf8"), 200, { "content-type": contentType });
    });
  }
}

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
      const detailObj =
        err.details && typeof err.details === "object" && err.details !== null
          ? (err.details as { keys?: string[]; strip?: string })
          : undefined;
      const keys = detailObj?.keys;
      const strip = detailObj?.strip;
      return c.json(
        {
          code: err.code,
          message: err.message,
          strip,
          keys,
          details: err.details ?? null,
          error: { code: err.code, message: err.message, details: err.details ?? null, strip },
        },
        err.status as 400 | 401 | 403 | 404 | 405 | 409 | 422 | 423 | 500,
      );
    }
    console.error(err);
    return c.json({ error: { code: "internal", message: "internal error" } }, 500);
  });

  app.get("/", (c) => c.html(officeHtml));
  app.get("/office", (c) => c.html(officeHtml));
  app.get("/inbox", (c) => c.html(inboxHtml));
  app.get("/ops", (c) => {
    const role = (c.req.header("x-harness-role") ?? c.req.query("role") ?? "").toLowerCase();
    if (role === "decision_maker") {
      return c.json(
        { code: "ops_forbidden", message: "决策人主路径是待办，不含运维页" },
        403,
      );
    }
    return c.html(opsHtml);
  });
  mountExample(app, "2048", ["board.js", "README.md"]);
  mountExample(app, "drama", ["README.md"]);
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

  const sseEvents = (c: {
    get: (key: "actor") => Actor;
    get: (key: "harness") => Harness;
    req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined };
  }) => {
    const actor = c.get("actor");
    requireRole(actor, ["decision_maker", "coordinator", "viewer", "service"]);
    const h = c.get("harness");
    const lastEventId = c.req.header("last-event-id") ?? c.req.query("last_event_id") ?? undefined;
    return streamSSE(c as never, async (stream) => {
      const replay = listEventsAfter(h, lastEventId);
      for (const ev of replay) {
        await stream.writeSSE({ id: ev.id, event: ev.type, data: ev.payload });
      }
      const onReady = async (payload: unknown) => {
        const id = (payload as { outbox_id?: string }).outbox_id;
        await stream.writeSSE({ id, event: "gate.ready", data: JSON.stringify(payload) });
      };
      h.bus.on("gate.ready", onReady);
      await stream.writeSSE({ event: "hello", data: JSON.stringify({ ok: true, actor, last_event_id: lastEventId ?? null }) });
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

  v1.get("/desks", (c) => {
    const flag = (c.req.query("include_pools") ?? "").trim().toLowerCase();
    const requested = flag === "1" || flag === "true" || flag === "yes";
    const actor = c.get("actor");
    const includePools = requested && actor.role !== "decision_maker";
    return c.json(listDesks(c.get("harness"), actor, { includePools }));
  });

  v1.post("/agents/heartbeat", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      display_name?: string;
      name?: string;
      pool_id?: string;
      ttl_seconds?: number;
      group?: string;
      section?: string;
      kind?: string;
      entity_kind?: string;
    };
    return c.json(
      recordHeartbeat(c.get("harness"), c.get("actor"), {
        display_name: body.display_name,
        name: body.name,
        pool_id: body.pool_id,
        ttl_seconds: body.ttl_seconds,
        group: body.group,
        section: body.section,
        kind: body.kind,
        entity_kind: body.entity_kind,
      }),
      200,
    );
  });

  v1.delete("/agents/heartbeat", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      kind?: string;
      entity_kind?: string;
      actor_id?: string;
    };
    return c.json(
      expireChannelHeartbeats(c.get("harness"), c.get("actor"), {
        kind: body.kind ?? c.req.query("kind"),
        entity_kind: body.entity_kind ?? c.req.query("entity_kind"),
        actor_id: body.actor_id ?? c.req.query("actor_id"),
      }),
    );
  });

  v1.post("/pools", async (c) => {
    const body = (await c.req.json()) as { id?: string; kind?: string; secret_ref?: string };
    assertNoPlaintextCredentials(body);
    return c.json(
      createPool(c.get("harness"), c.get("actor"), {
        id: body.id,
        kind: String(body.kind ?? ""),
        secret_ref: String(body.secret_ref ?? ""),
      }),
      201,
    );
  });

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

  v1.get("/outbox", (c) => {
    requireRole(c.get("actor"), ["decision_maker", "coordinator", "service", "viewer"]);
    return c.json({ outbox: listOutbox(c.get("harness")) });
  });

  v1.get("/github-snapshots", (c) => {
    requireRole(c.get("actor"), ["decision_maker", "coordinator", "service", "viewer"]);
    return c.json({ snapshots: listGithubSnapshots(c.get("harness"), c.req.query("goal_id")) });
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

  v1.get("/goals", (c) => {
    return c.json({ goals: listGoals(c.get("harness"), c.get("actor")) });
  });

  v1.post("/goals/:id/dial", async (c) => {
    const body = (await c.req.json()) as { dial?: string };
    return c.json(setGoalDial(c.get("harness"), c.get("actor"), c.req.param("id"), String(body.dial ?? "")));
  });

  v1.get("/goals/:id", (c) => c.json(getGoal(c.get("harness"), c.req.param("id"))));

  v1.get("/goals/:id/assignments", (c) => {
    return c.json(listFillSlots(c.get("harness"), c.get("actor"), c.req.param("id")));
  });

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
        unlock_after_gate_def_id: body.unlock_after_gate_def_id as string | undefined,
        assignee_bot_id: (body.assignee_bot_id as string | undefined) ?? null,
      }),
      201,
    );
  });

  v1.post("/goals/:id/exception-grants", async (c) => {
    const body = await c.req.json();
    return c.json(createExceptionGrant(c.get("harness"), c.get("actor"), c.req.param("id"), body), 201);
  });

  v1.get("/assignments/:id", (c) => c.json(getAssignment(c.get("harness"), c.req.param("id"))));

  v1.post("/assignments/:id/bind", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { assignee_bot_id?: string };
    try {
      return c.json(
        bindAssignment(c.get("harness"), c.get("actor"), c.req.param("id"), body.assignee_bot_id),
      );
    } catch (err) {
      if (isHarnessError(err)) throw err;
      console.error("bindAssignment failed", err);
      throw new HarnessError("internal", "bind failed", 500);
    }
  });

  v1.post("/assignments/:id/dispatch", async (c) => {
    assertMcpEntry(c.req.header("x-harness-entry"), c.req.path);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const key = String(body.idempotency_key ?? c.req.header("idempotency-key") ?? "");
    const result = await dispatchAssignment(c.get("harness"), c.get("actor"), c.req.param("id"), key);
    const { created, ...run } = result as typeof result & { created?: boolean };
    return c.json(run, created === false ? 200 : 201);
  });

  v1.get("/runs/:id", (c) => c.json(getRun(c.get("harness"), c.req.param("id"))));

  v1.post("/runs/:id/evidence", async (c) => {
    assertMcpEntry(c.req.header("x-harness-entry"), c.req.path);
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
