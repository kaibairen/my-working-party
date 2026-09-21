import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { fileURLToPath } from "node:url";
import { MCP_HTTP_TOOL_NAMES } from "@harness/domain";
import { callTool, listTools } from "./index";
import { handleDomainOutboundEvent, verifyWebhookHmac, type DomainOutboundEnvelope } from "./domain-events";

const API = process.env.HARNESS_API_URL ?? "http://127.0.0.1:8080";
const PORT = Number(process.env.MCP_HTTP_PORT ?? 8787);

type JsonRpc = {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: Record<string, unknown>;
};

function incomingAuth(c: { req: { header: (n: string) => string | undefined } }) {
  return {
    authorization: c.req.header("authorization") ?? "",
    "x-harness-role": c.req.header("x-harness-role") ?? "",
    "x-harness-actor": c.req.header("x-harness-actor") ?? "",
  };
}

async function handleRpc(msg: JsonRpc, headers: Record<string, string>) {
  if (msg.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "boundary-harness-mcp-http", version: "1" },
      },
    };
  }
  if (msg.method === "tools/list") {
    return { jsonrpc: "2.0", id: msg.id, result: { tools: listTools({ http: true }) } };
  }
  if (msg.method === "tools/call") {
    const params = msg.params ?? {};
    const name = String(params.name ?? "");
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    if (!name.startsWith("harness_") || !(MCP_HTTP_TOOL_NAMES as readonly string[]).includes(name)) {
      return {
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32601, message: "forbidden_tool" },
      };
    }
    try {
      const result = await callTool(name, args, headers);
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: { content: [{ type: "text", text: JSON.stringify(result) }] },
      };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32000, message: err instanceof Error ? err.message : String(err) },
      };
    }
  }
  if (msg.method === "notifications/initialized") return null;
  return {
    jsonrpc: "2.0",
    id: msg.id,
    error: { code: -32601, message: `unknown method ${msg.method}` },
  };
}

export function createMcpHttpApp() {
  const app = new Hono();
  app.use("*", cors());
  app.get("/healthz", (c) => c.json({ ok: true, api: API }));
  app.get("/mcp", (c) =>
    c.json({
      ok: true,
      transport: "streamable-http",
      tools: listTools({ http: true }).map((t) => t.name),
    }),
  );

  // P0-D: Domain outbox → wake assignee bots (no attach, no DM chat spam)
  app.post("/hooks/domain-events", async (c) => {
    const raw = await c.req.text();
    const secret = process.env.HARNESS_WEBHOOK_SECRET ?? process.env.WEBHOOK_SIGNING_SECRET;
    const sig =
      c.req.header("x-harness-webhook-signature") ??
      c.req.header("x-hub-signature-256") ??
      c.req.header("x-harness-signature");
    if (!verifyWebhookHmac(raw, sig ?? undefined, secret || undefined)) {
      return c.json({ ok: false, code: "invalid_signature" }, 401);
    }
    let body: DomainOutboundEnvelope | DomainOutboundEnvelope[];
    try {
      body = JSON.parse(raw) as DomainOutboundEnvelope | DomainOutboundEnvelope[];
    } catch {
      return c.json({ ok: false, code: "parse_error" }, 400);
    }
    const events = Array.isArray(body) ? body : [body];
    const results = [];
    for (const ev of events) {
      results.push(await handleDomainOutboundEvent(ev));
    }
    return c.json({ ok: true, results });
  });

  app.post("/mcp", async (c) => {
    const msg = (await c.req.json()) as JsonRpc;
    const reply = await handleRpc(msg, incomingAuth(c));
    if (!reply) return c.body(null, 204);
    return c.json(reply);
  });
  return app;
}

export function main() {
  const app = createMcpHttpApp();
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`harness mcp http listening on :${info.port}/mcp + /hooks/domain-events api=${API}`);
  });
}

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntry) {
  main();
}
