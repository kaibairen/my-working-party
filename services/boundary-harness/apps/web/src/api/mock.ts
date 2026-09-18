import { HIDDEN_NON_READY_GATES, INITIAL_MOCK_GATES } from "../data/mockGates";
import { normalizeGate } from "../lib/missing";
import type { GateDecideRequest, GateInstance } from "../types/gate";
import { ApiError } from "./errors";

const STORAGE_KEY = "bh.gate-inbox.mock.v1";

type MockRow = GateInstance & { conflictArmed?: boolean };

function cloneInitial(): MockRow[] {
  return [...INITIAL_MOCK_GATES, ...HIDDEN_NON_READY_GATES].map((g) => ({
    ...g,
    ready_result_json: { ...g.ready_result_json, missing: [...g.ready_result_json.missing] },
  }));
}

function load(): MockRow[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneInitial();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return cloneInitial();
    return parsed.map((row) => normalizeGate(row) as MockRow);
  } catch {
    return cloneInitial();
  }
}

function persist(rows: MockRow[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

let rows = load();

function byId(id: string): MockRow | undefined {
  return rows.find((g) => g.id === id);
}

export const mockStore = {
  listReady(): GateInstance[] {
    return rows
      .filter((g) => g.status === "ready")
      .map((g) => normalizeGate(g));
  },

  get(id: string): GateInstance {
    const row = byId(id);
    if (!row) {
      throw new ApiError(404, { code: "not_found", message: `Gate ${id} not found` });
    }
    return normalizeGate(row);
  },

  decide(id: string, body: GateDecideRequest): GateInstance {
    const row = byId(id);
    if (!row) {
      throw new ApiError(404, { code: "not_found", message: `Gate ${id} not found` });
    }
    if (row.status !== "ready") {
      throw new ApiError(409, {
        code: "optimistic_lock",
        message: "Gate is no longer ready",
      });
    }
    if (row.conflictArmed || row.version !== body.version) {
      if (row.conflictArmed) {
        row.conflictArmed = false;
        row.version += 1;
        persist(rows);
      }
      throw new ApiError(409, {
        code: "optimistic_lock",
        message: "Gate version changed; refresh the card. Decide was not applied.",
      });
    }
    row.status = "decided";
    row.version += 1;
    persist(rows);
    return normalizeGate(row);
  },

  armConflict(id: string) {
    const row = byId(id);
    if (row) {
      row.conflictArmed = true;
      persist(rows);
    }
  },

  reset() {
    rows = cloneInitial();
    persist(rows);
  },

  upsertFromEvent(partial: { gate_instance_id: string; missing?: string[] }) {
    const existing = byId(partial.gate_instance_id);
    if (existing) {
      if (partial.missing) {
        existing.ready_result_json = {
          ...existing.ready_result_json,
          missing: partial.missing,
        };
      }
      existing.status = "ready";
      persist(rows);
      return;
    }
    rows.push({
      id: partial.gate_instance_id,
      version: 1,
      status: "ready",
      predicate_id: "deliver_ready_v1",
      predicate_version: 1,
      ready_at: new Date().toISOString(),
      ready_result_json: { ok: true, missing: partial.missing ?? [] },
      goal_title: "SSE upsert (mock)",
      goal_mode: "deliver",
    });
    persist(rows);
  },
};
