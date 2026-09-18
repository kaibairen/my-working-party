export type CursorDispatchInput = {
  runId: string;
  assignmentId: string;
  idempotencyKey?: string;
};

export type CursorDispatchResult = {
  adapter: "cursor";
  external_agent_id: string | null;
  external_run_id: string | null;
  status: "succeeded" | "dispatched" | "failed";
  usage_json: Record<string, unknown>;
  error?: string;
};

export type CursorAdapterOpts = {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

/**
 * M1 Cursor adapter. Without CURSOR_API_KEY this is fixture-only and never
 * calls Cursor. Live HTTP is behind CURSOR_API_KEY. Dual external ids always
 * persist. MCP MUST NOT expose this as cursor_raw_*.
 */
export function createCursorAdapter(opts: CursorAdapterOpts = {}) {
  const apiKey = opts.apiKey ?? process.env.CURSOR_API_KEY ?? "";
  const baseUrl = (opts.baseUrl ?? process.env.CURSOR_API_BASE ?? "https://api.cursor.com").replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const mode = apiKey ? ("live" as const) : ("fixture" as const);

  return {
    name: "cursor" as const,
    mode,
    async dispatch(input: CursorDispatchInput): Promise<CursorDispatchResult> {
      if (mode === "fixture") {
        return {
          adapter: "cursor",
          external_agent_id: `cursor-fixture-agent:${input.assignmentId}`,
          external_run_id: `cursor-fixture-run:${input.runId}`,
          status: "succeeded",
          usage_json: {
            fixture: true,
            adapter: "cursor",
            noop_or_offline_contract: true,
          },
        };
      }

      const res = await fetchImpl(`${baseUrl}/v0/agents`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "idempotency-key": input.idempotencyKey ?? input.runId,
        },
        body: JSON.stringify({
          prompt: { text: `Boundary Harness assignment ${input.assignmentId}` },
        }),
      });
      const text = await res.text();
      let body: Record<string, unknown> = {};
      try {
        body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        body = { raw: text };
      }
      if (!res.ok) {
        return {
          adapter: "cursor",
          external_agent_id: null,
          external_run_id: null,
          status: "failed",
          usage_json: { live: true, adapter: "cursor", http_status: res.status },
          error: `cursor_http_${res.status}`,
        };
      }
      const agentId = String(body.id ?? body.agent_id ?? "");
      const runId = String(body.run_id ?? body.latest_run_id ?? body.id ?? "");
      return {
        adapter: "cursor",
        external_agent_id: agentId || `cursor-agent:${input.assignmentId}`,
        external_run_id: runId || `cursor-run:${input.runId}`,
        status: "dispatched",
        usage_json: { live: true, adapter: "cursor" },
      };
    },
  };
}

export type CursorAdapter = ReturnType<typeof createCursorAdapter>;
