import { normalizeGate, normalizeList } from "../lib/missing";
import type {
  DataSource,
  GateDecideRequest,
  GateInstance,
} from "../types/gate";
import { ApiError } from "./errors";
import { mockStore } from "./mock";

function apiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL ?? "";
  return raw.replace(/\/$/, "");
}

function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const token = import.meta.env.VITE_API_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function readError(res: Response): Promise<ApiError> {
  let body: { code?: string; message?: string } | undefined;
  try {
    body = (await res.json()) as { code?: string; message?: string };
  } catch {
    body = undefined;
  }
  return new ApiError(res.status, body?.code ? { code: body.code, message: body.message } : undefined);
}

async function apiListReady(): Promise<GateInstance[]> {
  const res = await fetch(`${apiBase()}/v1/gates?status=ready`, { headers: headers() });
  if (!res.ok) throw await readError(res);
  return normalizeList(await res.json());
}

async function apiGet(id: string): Promise<GateInstance> {
  const res = await fetch(`${apiBase()}/v1/gates/${encodeURIComponent(id)}`, {
    headers: headers(),
  });
  if (!res.ok) throw await readError(res);
  return normalizeGate(await res.json());
}

async function apiDecide(id: string, body: GateDecideRequest): Promise<void> {
  const res = await fetch(`${apiBase()}/v1/gates/${encodeURIComponent(id)}/decide`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res);
}

export type GateClient = {
  source: DataSource;
  listReady: () => Promise<GateInstance[]>;
  get: (id: string) => Promise<GateInstance>;
  decide: (id: string, body: GateDecideRequest) => Promise<void>;
  refreshCard: (id: string) => Promise<GateInstance | null>;
  armConflict?: (id: string) => void;
  resetMock?: () => void;
};

export function createClient(source: DataSource): GateClient {
  if (source === "mock") {
    return {
      source,
      async listReady() {
        return mockStore.listReady();
      },
      async get(id) {
        return mockStore.get(id);
      },
      async decide(id, body) {
        mockStore.decide(id, body);
      },
      async refreshCard(id) {
        try {
          const gate = mockStore.get(id);
          return gate.status === "ready" ? gate : null;
        } catch {
          return null;
        }
      },
      armConflict(id) {
        mockStore.armConflict(id);
      },
      resetMock() {
        mockStore.reset();
      },
    };
  }

  return {
    source,
    listReady: apiListReady,
    get: apiGet,
    decide: apiDecide,
    async refreshCard(id) {
      try {
        const gate = await apiGet(id);
        return gate.status === "ready" ? gate : null;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        const list = await apiListReady();
        return list.find((g) => g.id === id) ?? null;
      }
    },
  };
}

export function sseUrl(): string {
  return `${apiBase()}/v1/events/stream`;
}
