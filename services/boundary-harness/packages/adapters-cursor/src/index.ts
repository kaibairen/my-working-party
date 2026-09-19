export type CursorLifecycle = "FINISHED" | "IDLE";

/** BriefV1 subset only — never steps/script/must_path. */
export type CursorBrief = {
  outcome: string;
  constraints: string[];
  evidence_shape: string[];
};

export type CursorGoalRef = {
  id: string;
  title: string;
  mode: string;
};

export type CursorDispatchInput = {
  runId: string;
  assignmentId: string;
  idempotencyKey?: string;
  lifecycle?: CursorLifecycle;
  brief?: CursorBrief;
  goal?: CursorGoalRef;
};

export type CursorLaunchRecord = {
  url: string;
  assignmentId: string;
  runId: string;
  idempotencyKey?: string;
  lifecycle: CursorLifecycle;
  mode: "fixture" | "stub" | "live";
  recorded_at: string;
  prompt: string;
  source?: { repository: string; ref?: string };
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
  /** Optional live source.repository (CURSOR_REPOSITORY). */
  repository?: string;
  /** Optional live source.ref (CURSOR_REF). */
  ref?: string;
};

const FORBIDDEN_PROMPT_KEYS = [
  "steps",
  "script",
  "must_path",
  "plan",
  "playbook",
  "workflow",
  "procedure",
  "ordered_steps",
  "runbook",
  "howto",
  "must_files",
] as const;

/**
 * Launch text for a dispatched Cloud Agent. BriefV1 fields only so the
 * executor can act without a second hop to the parent harness DB.
 */
export function buildCursorLaunchPrompt(input: CursorDispatchInput): string {
  const lines = [`Boundary Harness assignment ${input.assignmentId}`, `Run: ${input.runId}`];
  if (input.goal) {
    lines.push(`Goal: ${input.goal.title} (${input.goal.mode})`);
    lines.push(`Goal id: ${input.goal.id}`);
  }
  if (input.brief) {
    lines.push(`Outcome: ${input.brief.outcome}`);
    if (input.brief.constraints.length > 0) {
      lines.push("Constraints:");
      for (const c of input.brief.constraints) lines.push(`- ${c}`);
    }
    if (input.brief.evidence_shape.length > 0) {
      lines.push(`Evidence shape: ${input.brief.evidence_shape.join(", ")}`);
    }
  }
  lines.push(
    "Complete the outcome. Chat is not source of truth. Attach evidence matching evidence_shape.",
  );
  const text = lines.join("\n");
  for (const key of FORBIDDEN_PROMPT_KEYS) {
    if (new RegExp(`(?:^|\\n)${key}\\s*:`, "i").test(text)) {
      throw new Error(`cursor_launch_prompt_forbidden_field:${key}`);
    }
  }
  return text;
}

function liveSource(opts: CursorAdapterOpts): { repository: string; ref?: string } | undefined {
  const repository = (opts.repository ?? process.env.CURSOR_REPOSITORY ?? "").trim();
  if (!repository) return undefined;
  const ref = (opts.ref ?? process.env.CURSOR_REF ?? "").trim();
  return ref ? { repository, ref } : { repository };
}

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
      const prompt = buildCursorLaunchPrompt(input);
      const source = liveSource(opts);
      const launch: CursorLaunchRecord = {
        url: `${baseUrl}/v0/agents`,
        assignmentId: input.assignmentId,
        runId: input.runId,
        idempotencyKey: input.idempotencyKey,
        lifecycle,
        mode,
        recorded_at,
        prompt,
        ...(source ? { source } : {}),
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

      const payload: Record<string, unknown> = {
        prompt: { text: prompt },
      };
      if (source) payload.source = source;

      const res = await fetchImpl(`${baseUrl}/v0/agents`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
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
