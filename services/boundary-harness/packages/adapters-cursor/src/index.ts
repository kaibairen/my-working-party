export type CursorLifecycle = "FINISHED" | "IDLE";

export type CursorDispatchInput = {
  runId: string;
  assignmentId: string;
  idempotencyKey?: string;
  lifecycle?: CursorLifecycle;
};

export type CursorLaunchRecord = {
  url: string;
  assignmentId: string;
  runId: string;
  idempotencyKey?: string;
  lifecycle: CursorLifecycle;
  mode: "fixture" | "stub" | "live";
  recorded_at: string;
};

export type CursorDispatchResult = {
  adapter: "cursor";
  external_agent_id: string | null;
  external_run_id: string | null;
  status: "succeeded" | "dispatched" | "failed" | "idle";
  usage_json: Record<string, unknown>;
  error?: string;
};

export type CursorAdapterOpts = {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** CURSOR_API stub: record launch payloads, never call Cursor. */
  stub?: boolean;
  /** Default lifecycle for fixture/stub (FINISHED ≠ IDLE). */
  lifecycle?: CursorLifecycle;
};

/**
 * M1 Cursor adapter. Real HTTP client is behind this interface.
 * Default CI: FakeCursor fixture (no network).
 * CURSOR_API_STUB=1: stub mode that records launch payloads.
 * CURSOR_API_KEY: live POST /v0/agents.
 * Dual external ids always persist. MCP MUST NOT expose this as cursor_raw_*.
 */
export function createCursorAdapter(opts: CursorAdapterOpts = {}) {
  const apiKey = opts.apiKey ?? process.env.CURSOR_API_KEY ?? "";
  const stub = opts.stub ?? process.env.CURSOR_API_STUB === "1";
  const baseUrl = (opts.baseUrl ?? process.env.CURSOR_API_BASE ?? "https://api.cursor.com").replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const defaultLifecycle: CursorLifecycle = opts.lifecycle ?? "FINISHED";
  const mode = apiKey ? ("live" as const) : stub ? ("stub" as const) : ("fixture" as const);
  const launches: CursorLaunchRecord[] = [];

  return {
    name: "cursor" as const,
    mode,
    launches,
    async dispatch(input: CursorDispatchInput): Promise<CursorDispatchResult> {
      const lifecycle: CursorLifecycle = input.lifecycle ?? defaultLifecycle;
      const recorded_at = new Date().toISOString();
      const launch: CursorLaunchRecord = {
        url: `${baseUrl}/v0/agents`,
        assignmentId: input.assignmentId,
        runId: input.runId,
        idempotencyKey: input.idempotencyKey,
        lifecycle,
        mode,
        recorded_at,
      };
      launches.push(launch);

      if (mode === "fixture" || mode === "stub") {
        const finished = lifecycle === "FINISHED";
        return {
          adapter: "cursor",
          external_agent_id: `cursor-${mode}-agent:${input.assignmentId}`,
          external_run_id: `cursor-${mode}-run:${input.runId}`,
          status: finished ? "succeeded" : "dispatched",
          usage_json: {
            fixture: mode === "fixture",
            stub: mode === "stub",
            adapter: "cursor",
            cursor_lifecycle: lifecycle,
            noop_or_offline_contract: finished,
            launch,
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
          usage_json: { live: true, adapter: "cursor", http_status: res.status, launch },
          error: `cursor_http_${res.status}`,
        };
      }
      const agentId = String(body.id ?? body.agent_id ?? "");
      const runId = String(body.run_id ?? body.latest_run_id ?? body.id ?? "");
      const remoteLifecycle = String(body.status ?? body.lifecycle ?? "dispatched").toUpperCase();
      const finished = remoteLifecycle === "FINISHED";
      return {
        adapter: "cursor",
        external_agent_id: agentId || `cursor-agent:${input.assignmentId}`,
        external_run_id: runId || `cursor-run:${input.runId}`,
        status: finished ? "succeeded" : "dispatched",
        usage_json: {
          live: true,
          adapter: "cursor",
          cursor_lifecycle: finished ? "FINISHED" : remoteLifecycle === "IDLE" ? "IDLE" : "DISPATCHED",
          launch,
        },
      };
    },
  };
}

export type CursorAdapter = ReturnType<typeof createCursorAdapter>;
