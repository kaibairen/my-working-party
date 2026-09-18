export type NoopDispatchInput = {
  runId: string;
  assignmentId: string;
};

export type NoopDispatchResult = {
  adapter: "noop";
  external_agent_id: string;
  external_run_id: string;
  status: "succeeded";
  usage_json: {
    noop_or_offline_contract: true;
    adapter: "noop";
  };
};

/**
 * M0-only runtime adapter. Persists dual external ids as placeholders.
 * MUST NOT call Cursor. FINISHED-equivalent is the local contract flag.
 */
export function createNoopAdapter() {
  return {
    name: "noop" as const,
    dispatch(input: NoopDispatchInput): NoopDispatchResult {
      return {
        adapter: "noop",
        external_agent_id: `noop-agent:${input.assignmentId}`,
        external_run_id: `noop-run:${input.runId}`,
        status: "succeeded",
        usage_json: {
          noop_or_offline_contract: true,
          adapter: "noop",
        },
      };
    },
  };
}

export type NoopAdapter = ReturnType<typeof createNoopAdapter>;
