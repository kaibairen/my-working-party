export type CursorLifecycle = "FINISHED" | "IDLE" | "RUNNING" | "DISPATCHED" | "ERROR";

export type CursorDispatchInput = {
  runId: string;
  assignmentId: string;
  idempotencyKey?: string;
  lifecycle?: CursorLifecycle;
  prompt?: string;
  repository?: string;
  ref?: string;
};

export type CursorLaunchRecord = {
  url: string;
  assignmentId: string;
  runId: string;
  idempotencyKey?: string;
  lifecycle: CursorLifecycle;
  mode: "fixture" | "stub" | "live";
  recorded_at: string;
  body?: Record<string, unknown>;
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
  external_agent_id: string;
  external_run_id: string;
  remote_status: string;
  lifecycle: CursorLifecycle;
  finished: boolean;
  raw?: Record<string, unknown>;
};

export type CursorAdapterOpts = {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  stub?: boolean;
  lifecycle?: CursorLifecycle;
  repository?: string;
  ref?: string;
};

function mapRemoteLifecycle(status: string): CursorLifecycle {
  const s = status.toUpperCase();
  if (s === "FINISHED" || s === "COMPLETED" || s === "SUCCEEDED") return "FINISHED";
  if (s === "IDLE") return "IDLE";
  if (s === "ERROR" || s === "FAILED" || s === "CANCELLED" || s === "EXPIRED") return "ERROR";
  if (s === "RUNNING" || s === "CREATING") return "RUNNING";
  return "DISPATCHED";
}

/**
 * Cursor adapter. Live path uses Cloud Agents **v1** (repos + dual ids).
 * Never expose as cursor_raw_*. MCP stays Domain-only.
 */
export function createCursorAdapter(opts: CursorAdapterOpts = {}) {
  // Under Vitest, ignore ambient CURSOR_API_KEY unless CURSOR_ADAPTER_LIVE=1
  // so contract tests stay on fixture dual-ids (never hit live network).
  const envKey =
    process.env.VITEST && process.env.CURSOR_ADAPTER_LIVE !== "1"
      ? ""
      : (process.env.CURSOR_API_KEY ?? "");
  const apiKey = opts.apiKey ?? envKey;
  const stub = opts.stub ?? process.env.CURSOR_API_STUB === "1";
  const baseUrl = (opts.baseUrl ?? process.env.CURSOR_API_BASE ?? "https://api.cursor.com").replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const defaultLifecycle: CursorLifecycle = opts.lifecycle ?? "FINISHED";
  const defaultRepo =
    opts.repository ??
    process.env.CURSOR_REPO_URL ??
    "https://github.com/kaibairen/my-working-party";
  const defaultRef = opts.ref ?? process.env.CURSOR_REPO_REF ?? "main";
  const mode = apiKey ? ("live" as const) : stub ? ("stub" as const) : ("fixture" as const);
  const launches: CursorLaunchRecord[] = [];

  async function poll(input: {
    external_agent_id: string;
    external_run_id?: string | null;
  }): Promise<CursorPollResult> {
    if (mode !== "live") {
      return {
        external_agent_id: input.external_agent_id,
        external_run_id: input.external_run_id || input.external_agent_id,
        remote_status: defaultLifecycle,
        lifecycle: defaultLifecycle,
        finished: defaultLifecycle === "FINISHED",
      };
    }
    const agentId = input.external_agent_id;
    const runId = input.external_run_id;
    const url = runId
      ? `${baseUrl}/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`
      : `${baseUrl}/v1/agents/${encodeURIComponent(agentId)}`;
    const res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      const e = new Error(`cursor_poll_http_${res.status}`) as Error & { status: number; body: unknown };
      e.status = res.status;
      e.body = body;
      throw e;
    }
    const agent = (body.agent as Record<string, unknown> | undefined) ?? body;
    const run = (body.run as Record<string, unknown> | undefined) ?? body;
    const remote = String(run.status ?? agent.status ?? body.status ?? "RUNNING");
    const lifecycle = mapRemoteLifecycle(remote);
    return {
      external_agent_id: String(agent.id ?? agentId),
      external_run_id: String(run.id ?? runId ?? agent.latestRunId ?? ""),
      remote_status: remote,
      lifecycle,
      finished: lifecycle === "FINISHED",
      raw: body,
    };
  }

  return {
    name: "cursor" as const,
    mode,
    launches,
    poll,
    async dispatch(input: CursorDispatchInput): Promise<CursorDispatchResult> {
      const lifecycle: CursorLifecycle = input.lifecycle ?? defaultLifecycle;
      const recorded_at = new Date().toISOString();
      const repository = input.repository ?? defaultRepo;
      const ref = input.ref ?? defaultRef;
      const promptText =
        input.prompt ?? `Boundary Harness assignment ${input.assignmentId} (run ${input.runId})`;

      const requestBody = {
        prompt: { text: promptText },
        // v1 shape
        repos: [{ url: repository, startingRef: ref }],
        // also accepted by some gateways / docs as source.repository
        source: { repository, ref },
      };

      const launch: CursorLaunchRecord = {
        url: `${baseUrl}/v1/agents`,
        assignmentId: input.assignmentId,
        runId: input.runId,
        idempotencyKey: input.idempotencyKey,
        lifecycle,
        mode,
        recorded_at,
        body: requestBody,
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
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "idempotency-key": input.idempotencyKey ?? input.runId,
        },
        body: JSON.stringify(requestBody),
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
          usage_json: { live: true, adapter: "cursor", http_status: res.status, launch, response: body },
          error: `cursor_http_${res.status}`,
        };
      }

      const agentObj = (body.agent as Record<string, unknown> | undefined) ?? undefined;
      const runObj = (body.run as Record<string, unknown> | undefined) ?? undefined;
      const agentId = String(agentObj?.id ?? body.id ?? body.agent_id ?? "");
      // Dual id: prefer distinct run id; never silently collapse to agent id when run id exists
      const runId = String(
        runObj?.id ?? body.run_id ?? body.latestRunId ?? body.latest_run_id ?? body.runId ?? "",
      );
      if (!agentId) {
        return {
          adapter: "cursor",
          external_agent_id: null,
          external_run_id: null,
          status: "failed",
          usage_json: { live: true, adapter: "cursor", launch, response: body },
          error: "cursor_missing_agent_id",
        };
      }
      const externalRunId = runId && runId !== agentId ? runId : runId || `cursor-run-pending:${input.runId}`;
      const remoteLifecycle = mapRemoteLifecycle(String(runObj?.status ?? body.status ?? "DISPATCHED"));
      const finished = remoteLifecycle === "FINISHED";
      return {
        adapter: "cursor",
        external_agent_id: agentId,
        external_run_id: externalRunId,
        status: finished ? "succeeded" : "dispatched",
        usage_json: {
          live: true,
          adapter: "cursor",
          cursor_lifecycle: finished ? "FINISHED" : remoteLifecycle,
          source: { repository, ref },
          launch,
        },
      };
    },
  };
}

export type CursorAdapter = ReturnType<typeof createCursorAdapter>;
