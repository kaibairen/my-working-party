import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, sseUrl } from "./api/client";
import { isApiError } from "./api/errors";
import { mockStore } from "./api/mock";
import { subscribeGateEvents } from "./api/sse";
import { EmptyInbox } from "./components/EmptyInbox";
import { ExceptionStrip } from "./components/ExceptionStrip";
import { GateCard } from "./components/GateCard";
import { SourceToggle } from "./components/SourceToggle";
import type {
  DataSource,
  Decision,
  GateInstance,
  InboxException,
} from "./types/gate";

const SOURCE_KEY = "bh.gate-inbox.source";
const LAST_SSE_KEY = "bh.gate-inbox.last-event-id";

function initialSource(): DataSource {
  const fromEnv = import.meta.env.VITE_DATA_SOURCE;
  if (fromEnv === "api" || fromEnv === "mock") return fromEnv;
  try {
    const stored = localStorage.getItem(SOURCE_KEY);
    if (stored === "api" || stored === "mock") return stored;
  } catch {
    /* ignore */
  }
  return "mock";
}

function envSseOn(): boolean {
  return import.meta.env.VITE_SSE_ENABLED === "true";
}

export function App() {
  const [source, setSource] = useState<DataSource>(initialSource);
  const [gates, setGates] = useState<GateInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [locks, setLocks] = useState<Record<string, string>>({});
  const [exceptions, setExceptions] = useState<InboxException[]>([]);
  const [sseOn, setSseOn] = useState(envSseOn);
  const [sseStatus, setSseStatus] = useState<"off" | "connecting" | "open" | "retrying">("off");
  const [freezeOn, setFreezeOn] = useState(false);
  const seenEventIds = useRef(new Set<string>());

  const client = useMemo(() => createClient(source), [source]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await client.listReady();
      setGates(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load ready gates";
      setError(message);
      setGates([]);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    try {
      localStorage.setItem(SOURCE_KEY, source);
    } catch {
      /* ignore */
    }
  }, [source]);

  const upsertGate = useCallback(
    async (id: string, missing?: string[]) => {
      setGates((prev) => {
        if (prev.some((g) => g.id === id)) {
          return prev.map((g) =>
            g.id === id && missing
              ? { ...g, ready_result_json: { ...g.ready_result_json, missing } }
              : g,
          );
        }
        return prev;
      });
      try {
        const fresh = await client.refreshCard(id);
        if (fresh) {
          setGates((prev) => {
            const idx = prev.findIndex((g) => g.id === id);
            if (idx === -1) return [...prev, fresh];
            const next = [...prev];
            next[idx] = fresh;
            return next;
          });
        } else if (source === "mock" && missing) {
          mockStore.upsertFromEvent({ gate_instance_id: id, missing });
          setGates(mockStore.listReady());
        } else {
          await loadList();
        }
      } catch {
        await loadList();
      }
    },
    [client, loadList, source],
  );

  useEffect(() => {
    if (!sseOn || source !== "api") {
      setSseStatus("off");
      return;
    }
    const stop = subscribeGateEvents({
      url: sseUrl(),
      token: import.meta.env.VITE_API_TOKEN,
      getLastEventId: () => localStorage.getItem(LAST_SSE_KEY) ?? undefined,
      setLastEventId: (id) => localStorage.setItem(LAST_SSE_KEY, id),
      onStatus: setSseStatus,
      onReconnect: () => {
        void loadList();
      },
      onEvent: (event) => {
        if (seenEventIds.current.has(event.id)) return;
        seenEventIds.current.add(event.id);
        if (event.type === "gate.ready") {
          const id = event.data.gate_instance_id;
          if (id) void upsertGate(id, event.data.missing);
          else void loadList();
          return;
        }
        const exceptionType = event.type;
        if (exceptionType === "freeze.changed") {
          setFreezeOn(Boolean(event.data.enabled));
        }
        setExceptions((prev) => [
          {
            id: event.id,
            type: exceptionType,
            at: new Date().toISOString(),
            text:
              event.data.message ??
              event.data.run_id ??
              (exceptionType === "freeze.changed"
                ? event.data.enabled
                  ? "Freeze enabled — new dispatch rejected."
                  : "Freeze cleared."
                : exceptionType),
          },
          ...prev,
        ].slice(0, 6));
      },
    });
    return stop;
  }, [sseOn, source, loadList, upsertGate]);

  const decide = async (
    gate: GateInstance,
    decision: Decision,
    extra: { note?: string; structural_change: boolean },
  ) => {
    setBusyId(gate.id);
    setLocks((prev) => {
      const next = { ...prev };
      delete next[gate.id];
      return next;
    });
    const body = {
      decision,
      version: gate.version,
      note: extra.note,
      structural_change: extra.structural_change,
    };
    window.__lastGateDecide = { id: gate.id, body };
    try {
      await client.decide(gate.id, body);
      setGates((prev) => prev.filter((g) => g.id !== gate.id));
    } catch (err) {
      if (isApiError(err) && err.isOptimisticLock) {
        const fresh = await client.refreshCard(gate.id);
        if (!fresh) {
          setGates((prev) => prev.filter((g) => g.id !== gate.id));
          setError("That gate was already decided. Card removed.");
        } else {
          setGates((prev) => prev.map((g) => (g.id === gate.id ? fresh : g)));
          setLocks((prev) => ({
            ...prev,
            [gate.id]:
              "Optimistic lock (409). Card refreshed — decide was not retried.",
          }));
        }
      } else {
        setError(err instanceof Error ? err.message : "Decide failed");
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="shell">
      <header className="mast">
        <div className="mast-brand">
          <p className="kicker">Boundary Harness · M2-preview</p>
          <h1>Gate Inbox</h1>
          <p className="lede">
            Decision-maker HITL. Ready gates only. Dispatch does not wait on a canvas.
          </p>
        </div>
        <div className="mast-tools">
          <SourceToggle
            source={source}
            onChange={(next) => {
              setSource(next);
              setError(null);
              setLocks({});
            }}
          />
          <label className="sse-toggle">
            <input
              type="checkbox"
              checked={sseOn}
              onChange={(e) => setSseOn(e.target.checked)}
            />
            SSE stub <span className="muted">(API)</span>
            <span className="muted"> {sseStatus}</span>
          </label>
        </div>
      </header>

      {freezeOn ? (
        <p className="freeze-banner" role="status">
          Freeze is on. Open decide is not blocked; new dispatch is.
        </p>
      ) : null}

      <ExceptionStrip
        items={exceptions}
        onDismiss={(id) => setExceptions((prev) => prev.filter((x) => x.id !== id))}
      />

      {error ? (
        <p className="page-error" role="alert">
          {error}
        </p>
      ) : null}

      {source === "mock" ? (
        <p className="mock-hint">
          Mock source — two ready GateInstance rows, no live Domain API.
          <button
            type="button"
            className="text-btn"
            data-testid="reset-inbox"
            onClick={() => {
              client.resetMock?.();
              void loadList();
              setLocks({});
              setError(null);
            }}
          >
            Reset inbox
          </button>
        </p>
      ) : (
        <p className="mock-hint">
          API source — <code>GET /v1/gates?status=ready</code>
          {import.meta.env.VITE_API_BASE_URL
            ? ` @ ${import.meta.env.VITE_API_BASE_URL}`
            : " (same-origin /v1 proxy)"}
        </p>
      )}

      {loading ? (
        <p className="loading">Loading ready gates…</p>
      ) : gates.length === 0 ? (
        <EmptyInbox />
      ) : (
        <div className="card-list">
          {gates.map((gate) => (
            <GateCard
              key={gate.id}
              gate={gate}
              busy={busyId === gate.id}
              lockNotice={locks[gate.id]}
              mockMode={source === "mock"}
              onDecide={decide}
              onArmConflict={client.armConflict}
            />
          ))}
        </div>
      )}
    </div>
  );
}
