import { MCP_ENTRY_HEADER, MCP_ENTRY_VALUE, MCP_HTTP_TOOL_NAMES, MCP_TOOL_NAMES } from "@harness/domain";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.HARNESS_API_URL ?? "http://127.0.0.1:8080";
const here = dirname(fileURLToPath(import.meta.url));
const TOOLS_SCHEMA_PATH = join(here, "../tools.schema.json");

type ToolSchemaFile = {
  tools: Record<string, { description?: string; inputSchema?: Record<string, unknown> }>;
};

function loadToolSchemas(): ToolSchemaFile {
  try {
    return JSON.parse(readFileSync(TOOLS_SCHEMA_PATH, "utf8")) as ToolSchemaFile;
  } catch {
    return { tools: {} };
  }
}

type ToolDef = {
  name: (typeof MCP_TOOL_NAMES)[number];
  description: string;
  method: string;
  path: (args: Record<string, unknown>) => string;
};

const TOOLS: ToolDef[] = [
  {
    name: "harness_create_goal",
    description: "Create a Goal. coordinator_ref is required.",
    method: "POST",
    path: () => "/v1/goals",
  },
  {
    name: "harness_fill_assignment",
    description: "Fill an Assignment with BriefV1. budget is stored on assignments.budget_json.",
    method: "POST",
    path: (args) => `/v1/goals/${args.goal_id}/assignments`,
  },
  {
    name: "harness_propose_assignment",
    description: "Propose/fill an Assignment (alias of harness_fill_assignment). Same BriefV1 validator.",
    method: "POST",
    path: (args) => `/v1/goals/${args.goal_id}/assignments`,
  },
  {
    name: "harness_dispatch",
    description: "Dispatch an Assignment via adapter. Coordinator or service only. Canvas not required.",
    method: "POST",
    path: (args) => `/v1/assignments/${args.assignment_id}/dispatch`,
  },
  {
    name: "harness_dispatch_assignment",
    description: "Alias of harness_dispatch.",
    method: "POST",
    path: (args) => `/v1/assignments/${args.assignment_id}/dispatch`,
  },
  {
    name: "harness_attach_evidence",
    description: "Attach evidence to a Run. Unique completion entry.",
    method: "POST",
    path: (args) => `/v1/runs/${args.run_id}/evidence`,
  },
  {
    name: "harness_get_run",
    description: "Get a Run. Advisory only — never a Ready/Gate source.",
    method: "GET",
    path: (args) => `/v1/runs/${args.run_id}`,
  },
  {
    name: "harness_get_status",
    description: "Alias of harness_get_run. IDLE/succeeded is not Gate ready.",
    method: "GET",
    path: (args) => `/v1/runs/${args.run_id}`,
  },
  {
    name: "harness_list_gates",
    description: "List GateInstances, optionally status=ready.",
    method: "GET",
    path: (args) => {
      const q = new URLSearchParams();
      if (args.status) q.set("status", String(args.status));
      if (args.goal_id) q.set("goal_id", String(args.goal_id));
      const qs = q.toString();
      return `/v1/gates${qs ? `?${qs}` : ""}`;
    },
  },
  {
    name: "harness_list_ready_gates",
    description: "List ready GateInstances only (Inbox default).",
    method: "GET",
    path: (args) => {
      const q = new URLSearchParams({ status: "ready" });
      if (args.goal_id) q.set("goal_id", String(args.goal_id));
      return `/v1/gates?${q.toString()}`;
    },
  },
  {
    name: "harness_decide_gate",
    description: "Decide a ready GateInstance. decision_maker only. Optimistic lock on version.",
    method: "POST",
    path: (args) => `/v1/gates/${args.gate_instance_id}/decide`,
  },
  {
    name: "harness_policy_check",
    description: "Policy/Dial check. Response includes track. advisory_hint never blocks.",
    method: "POST",
    path: () => "/v1/policy/check",
  },
  {
    name: "harness_heartbeat",
    description: "Report bot presence so GET /v1/desks shows this bot. Seed pools are not colleagues.",
    method: "POST",
    path: () => "/v1/agents/heartbeat",
  },
];

const FORBIDDEN = ["cursor_raw_", "set_steps", "mark_done", "cursor_launch"];

export function listTools(opts?: { http?: boolean }) {
  const schemas = loadToolSchemas().tools;
  const names = opts?.http ? MCP_HTTP_TOOL_NAMES : MCP_TOOL_NAMES;
  return TOOLS.filter((t) => (names as readonly string[]).includes(t.name)).map((t) => ({
    name: t.name,
    description: schemas[t.name]?.description ?? t.description,
    inputSchema: schemas[t.name]?.inputSchema ?? { type: "object", additionalProperties: true },
  }));
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  headers: Record<string, string>,
) {
  if (FORBIDDEN.some((p) => name.includes(p))) {
    throw new Error(`tool ${name} is not registered`);
  }
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`unknown tool ${name}`);
  const path = tool.path(args);
  const body =
    tool.method === "GET"
      ? undefined
      : JSON.stringify(
          name === "harness_dispatch" || name === "harness_dispatch_assignment"
            ? { idempotency_key: args.idempotency_key }
            : name === "harness_attach_evidence"
              ? { items: args.items }
              : name === "harness_decide_gate"
                ? {
                    decision: args.decision,
                    version: args.version,
                    note: args.note,
                    structural_change: args.structural_change,
                  }
                : args,
        );
  const role = headers["x-harness-role"] ?? String(args.role ?? "coordinator");
  const actor = headers["x-harness-actor"] ?? String(args.actor ?? "mcp");
  const res = await fetch(`${API}${path}`, {
    method: tool.method,
    headers: {
      "content-type": "application/json",
      authorization: headers.authorization ?? `Bearer ${role}:${actor}`,
      "x-harness-role": role,
      "x-harness-actor": actor,
      [MCP_ENTRY_HEADER]: MCP_ENTRY_VALUE,
    },
    body,
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

function writeMessage(msg: unknown) {
  const payload = JSON.stringify(msg);
  const buf = Buffer.from(payload, "utf8");
  process.stdout.write(`Content-Length: ${buf.length}\r\n\r\n`);
  process.stdout.write(buf);
}

async function handleRpc(msg: { id?: unknown; method?: string; params?: Record<string, unknown> }) {
  if (msg.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "boundary-harness-mcp", version: "1" },
      },
    };
  }
  if (msg.method === "tools/list") {
    return { jsonrpc: "2.0", id: msg.id, result: { tools: listTools() } };
  }
  if (msg.method === "tools/call") {
    const params = msg.params ?? {};
    const name = String(params.name ?? "");
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    try {
      const result = await callTool(name, args, {});
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result) }],
        },
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

export function main() {
  if (process.argv.includes("--print-tools")) {
    console.log(JSON.stringify({ tools: listTools().map((t) => t.name) }));
    return;
  }

  let buffer = Buffer.alloc(0);
  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    void drain();
  });

  async function drain() {
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = buffer.subarray(0, headerEnd).toString("utf8");
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (buffer.length < start + length) return;
      const body = buffer.subarray(start, start + length).toString("utf8");
      buffer = buffer.subarray(start + length);
      const msg = JSON.parse(body);
      const reply = await handleRpc(msg);
      if (reply) writeMessage(reply);
    }
  }

}

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntry) {
  main();
}
