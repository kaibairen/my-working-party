export type CursorLifecycle = "FINISHED" | "IDLE";

export type CursorDispatchInput = {
  runId: string;
  assignmentId: string;
  idempotencyKey?: string;
  lifecycle?: CursorLifecycle;
  repository?: string;
  startingRef?: string;
};

export type CursorLaunchPayload = {
  prompt: { text: string };
  repos: Array<{ url: string; startingRef: string }>;
  source: { repository: string; ref: string };
  mode: "agent";
};

export type CursorLaunchRecord = {
  url: string;
  assignmentId: string;
  runId: string;
  idempotencyKey?: string;
  lifecycle: CursorLifecycle;
  mode: "fixture" | "stub" | "live";
  recorded_at: string;
  payload: CursorLaunchPayload;
};

export type CursorDispatchResult = {
  adapter: "cursor";
  external_agent_id: string | null;
  external_run_id: string | null;
  status: "succeeded" | "dispatched" | "failed" | "idle";
  usage_json: Record<string, unknown>;
  error?: string;
};

export type CursorPollResult = {
  status: string;
  cursor_lifecycle: string;
  raw?: Record<string, unknown>;
};

export type CursorAdapterOpts = {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** CURSOR_API stub: record launch payloads, never call Cursor. */
  stub?: boolean;
  /** Default lifecycle for fixture/stub (FINISHED ≠ IDLE). */
  lifecycle?: CursorLifecycle;
  repository?: string;
  startingRef?: string;
};

export function defaultCursorRepository(): string {
  return (
    process.env.CURSOR_REPO_URL ??
    process.env.CURSOR_REPOSITORY ??
    "https://github.com/kaibairen/my-working-party"
  );
}

export function defaultCursorStartingRef(): string {
  return process.env.CURSOR_REPO_REF ?? process.env.CURSOR_STARTING_REF ?? "main";
}

function resolveApiKey(opts: CursorAdapterOpts): string {
  if (opts.apiKey !== undefined) return opts.apiKey;
  if (process.env.VITEST && process.env.CURSOR_ADAPTER_LIVE !== "1") return "";
  return process.env.CURSOR_API_KEY ?? "";
}

export function buildCursorLaunchPayload(input: {
  assignmentId: string;
  repository?: string;
  startingRef?: string;
}): CursorLaunchPayload {
  const repository = input.repository || defaultCursorRepository();
  const startingRef = input.startingRef || defaultCursorStartingRef();
  return {
    prompt: { text: `Boundary Harness assignment ${input.assignmentId}` },
    repos: [{ url: repository, startingRef }],
    source: { repository, ref: startingRef },
    mode: "agent",
  };
}

function nest(body: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = body[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function mapLiveIds(body: Record<string, unknown>): { agentId: string; runId: string; remoteStatus: string } {
  const agent = nest(body, "agent");
  const run = nest(body, "run");
  const agentId = String(agent.id ?? body.agent_id ?? body.id ?? "");
  const runId = String(run.id ?? body.run_id ?? agent.latestRunId ?? body.latest_run_id ?? body.latestRunId ?? "");
  const remoteStatus = String(run.status ?? body.status ?? body.lifecycle ?? "CREATING").toUpperCase();
  return { agentId, runId, remoteStatus };
}

/**
 * M1 Cursor adapter. Real HTTP client is behind this interface.
 * Default CI: FakeCursor fixture (no network).
 * CURSOR_API_STUB=1: stub mode that records launch payloads.
 * CURSOR_API_KEY: live POST /v1/agents (Cloud Agents v1 repos[] + source.repository).
 * Dual external ids always persist (agent.id ≠ run.id). MCP MUST NOT expose this as cursor_raw_*.
 */
export function createCursorAdapter(opts: CursorAdapterOpts = {}) {
  const apiKey = resolveApiKey(opts);
  const stub = opts.stub ?? process.env.CURSOR_API_STUB === "1";
  const baseUrl = (opts.baseUrl ?? process.env.CURSOR_API_BASE ?? "https://api.cursor.com").replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const defaultLifecycle: CursorLifecycle = opts.lifecycle ?? "FINISHED";
  const mode = apiKey ? ("live" as const) : stub ? ("stub" as const) : ("fixture" as const);
  const launches: CursorLaunchRecord[] = [];
  const authHeaders = (): Record<string, string> => ({
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  });

  return {
    name: "cursor" as const,
    mode,
    launches,
    async dispatch(input: CursorDispatchInput): Promise<CursorDispatchResult> {
      const lifecycle: CursorLifecycle = input.lifecycle ?? defaultLifecycle;
      const payload = buildCursorLaunchPayload({
        assignmentId: input.assignmentId,
        repository: input.repository ?? opts.repository,
        startingRef: input.startingRef ?? opts.startingRef,
      });
      const recorded_at = new Date().toISOString();
      const launch: CursorLaunchRecord = {
        url: `${baseUrl}/v1/agents`,
        assignmentId: input.assignmentId,
        runId: input.runId,
        idempotencyKey: input.idempotencyKey,
        lifecycle,
        mode,
        recorded_at,
        payload,
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

      const res = await fetchImpl(`${baseUrl}/v1/agents`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "idempotency-key": input.idempotencyKey ?? input.runId,
        },
        body: JSON.stringify(payload),
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
      const { agentId, runId, remoteStatus } = mapLiveIds(body);
      const finished = remoteStatus === "FINISHED";
      return {
        adapter: "cursor",
        external_agent_id: agentId || `cursor-agent:${input.assignmentId}`,
        external_run_id: runId || `cursor-run:${input.runId}`,
        status: finished ? "succeeded" : "dispatched",
        usage_json: {
          live: true,
          adapter: "cursor",
          cursor_lifecycle: finished ? "FINISHED" : remoteStatus === "IDLE" ? "IDLE" : "DISPATCHED",
          launch,
        },
      };
    },
    async poll(input: { external_agent_id: string; external_run_id: string }): Promise<CursorPollResult> {
      const agentId = input.external_agent_id;
      const runId = input.external_run_id;
      if (mode === "fixture" || mode === "stub") {
        return { status: defaultLifecycle, cursor_lifecycle: defaultLifecycle };
      }
      const res = await fetchImpl(`${baseUrl}/v1/agents/${agentId}/runs/${runId}`, {
        headers: authHeaders(),
      });
      const text = await res.text();
      let body: Record<string, unknown> = {};
      try {
        body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        body = { raw: text };
      }
      const status = String(body.status ?? "").toUpperCase();
      return {
        status,
        cursor_lifecycle: status === "FINISHED" ? "FINISHED" : status === "IDLE" ? "IDLE" : status || "UNKNOWN",
        raw: body,
      };
    },
  };
}

export type CursorAdapter = ReturnType<typeof createCursorAdapter>;
