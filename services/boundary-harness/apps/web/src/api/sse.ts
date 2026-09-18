import type { SseEventType, SsePayload } from "../types/gate";

export type ParsedSse = {
  id: string;
  type: SseEventType;
  data: SsePayload;
};

type SubscribeOptions = {
  url: string;
  token?: string;
  getLastEventId: () => string | undefined;
  setLastEventId: (id: string) => void;
  onEvent: (event: ParsedSse) => void;
  /** After reconnect, caller MUST re-list GET /v1/gates?status=ready. */
  onReconnect: () => void;
  onStatus: (status: "connecting" | "open" | "retrying" | "off") => void;
};

const TYPES: SseEventType[] = [
  "gate.ready",
  "run.failed",
  "budget.exceeded",
  "freeze.changed",
];

function isSseType(value: string): value is SseEventType {
  return (TYPES as string[]).includes(value);
}

/**
 * Optional SSE consumer stub.
 * Envelope: event / id (outbox_id) / data (JSON). Last-Event-ID resume.
 * Decision-maker UI does not subscribe to run-progress timelines.
 */
export function subscribeGateEvents(opts: SubscribeOptions): () => void {
  let closed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let es: EventSource | null = null;

  const connect = () => {
    if (closed) return;
    opts.onStatus(attempt === 0 ? "connecting" : "retrying");

    const last = opts.getLastEventId();
    const url = new URL(opts.url, window.location.origin);
    if (last) url.searchParams.set("last_event_id", last);

    // EventSource cannot set Last-Event-ID as a request header except via
    // the built-in lastEventId after a native reconnect. We pass it as a
    // query hint and also rely on EventSource.lastEventId when available.
    es = new EventSource(url.toString());

    es.onopen = () => {
      if (attempt > 0) opts.onReconnect();
      attempt = 0;
      opts.onStatus("open");
    };

    const handle = (type: SseEventType) => (ev: MessageEvent<string>) => {
      const id = ev.lastEventId || crypto.randomUUID();
      opts.setLastEventId(id);
      let data: SsePayload = {};
      try {
        data = ev.data ? (JSON.parse(ev.data) as SsePayload) : {};
      } catch {
        data = { message: ev.data };
      }
      opts.onEvent({ id, type, data });
    };

    for (const type of TYPES) {
      es.addEventListener(type, handle(type) as EventListener);
    }

    es.onmessage = (ev) => {
      const named = ev.type && isSseType(ev.type) ? ev.type : undefined;
      if (!named) {
        try {
          const data = JSON.parse(ev.data) as SsePayload & { type?: string };
          if (data.type && isSseType(data.type)) {
            handle(data.type)(ev);
          }
        } catch {
          /* ignore unnamed frames */
        }
        return;
      }
      handle(named)(ev);
    };

    es.onerror = () => {
      es?.close();
      es = null;
      if (closed) return;
      attempt += 1;
      const delay = Math.min(30_000, 500 * 2 ** Math.min(attempt, 6));
      opts.onStatus("retrying");
      timer = setTimeout(connect, delay);
    };
  };

  connect();

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    es?.close();
    opts.onStatus("off");
  };
}
