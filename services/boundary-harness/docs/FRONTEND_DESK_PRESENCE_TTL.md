# Frontend — desk presence + TTL

Authority for heartbeat writes is PR #15: `POST /v1/agents/heartbeat` (MCP `harness_heartbeat`).
Office read path (same projection): `GET /v1/desks` or `GET /v1/office/desks/presence`.

Paint **`presence`**: `busy` | `waiting_evidence` | `idle` (`status` = 在忙 / 等证据 / 空闲).

| Field | Use |
|-------|-----|
| `presence` | Status dot. After TTL this is never still `busy`. |
| `last_seen_at` / `last_heartbeat` | ISO of last **live** heartbeat, or `null` when expired / never sent. |
| `ttl_seconds` / `heartbeat_ttl_seconds` | Default window (90; override `DESK_HEARTBEAT_TTL_SECONDS`). |
| `source` | `heartbeat` while fresh; `pool_seed` after expire. |

**TTL choice:** `busy` stays work-derived (live run / accepted assignment) until a heartbeat exists for that desk **and** is older than its TTL. Stale heartbeat → `waiting_evidence` if a pending gate remains, else `idle`. No heartbeat yet keeps the work projection.

Do **not** write owner / assign / dispatch on desks from the decision-maker shell (`POST /v1/desks` → 404).
