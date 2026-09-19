# Office Home P0 — Frontend polish smoke (TTL + 我来填 form)

GO ③「我来填」already landed in #15. This file is polish-only (TTL paint + thin form UX). It is not a P0 Done redo.

Base: `http://127.0.0.1:8080`

Auth for the decision-maker shell:

```
Authorization: Bearer decision_maker:you
X-Harness-Role: decision_maker
X-Harness-Actor: you
```

Office is a **read projection + limited create + human fill**. Do not add assign / drag / start-run.

## 1. Desk presence TTL

```http
GET /v1/office/desks/presence
GET /v1/desks
```

The shell prefers `/v1/office/desks/presence` and falls back to `/v1/desks` (#15 SoT for mcp entry + overlapping desk/heartbeat shapes; #16 closed/deferred). Adapter is thin: read aliases, do not invent assign/dispatch.

**Expected JSON** (merged #15 + polish aliases). Clients must accept any of the timestamp / TTL names:

```json
{
  "desks": [
    {
      "id": "pool_noop",
      "name": "交付同事",
      "avatar": "交",
      "presence": "idle",
      "status": "空闲",
      "last_heartbeat": null,
      "last_seen_at": null,
      "last_heartbeat_at": null,
      "heartbeat_fresh": false,
      "source": "pool_seed",
      "ttl_seconds": 90
    }
  ],
  "readonly": true,
  "hitl": "待我拍板",
  "stub": true,
  "heartbeat_ttl_seconds": 90,
  "ttl_seconds": 90
}
```

Live overlay after `POST /v1/agents/heartbeat` (TTL 90s default): `source=heartbeat`, timestamps set, `heartbeat_fresh=true`. Expired beats fall back to `source=pool_seed` and timestamps `null` — the work `presence` stays.

| Field | Aliases the adapter accepts | UI |
|-------|-----------------------------|----|
| `presence` | — | `busy` \| `waiting_evidence` \| `idle` → 在忙 / 等证据 / 空闲 |
| `last_seen_at` | `last_heartbeat`, `last_heartbeat_at` | Chinese relative time |
| `ttl_seconds` | envelope / row `heartbeat_ttl_seconds` | Poll interval ≤ this window (default 90s) |
| `heartbeat_fresh` | `source=heartbeat` when the boolean is omitted | 心跳新鲜 / 心跳过期 / 尚无心跳 |

**TTL choice:** if `heartbeat_fresh === false` **or** last_seen is older than `ttl_seconds`, **never** paint `busy`. Prefer the API presence after TTL (`waiting_evidence` \| `idle`). Missing heartbeat keeps the work projection.

Roster stays read-only: no owner write, no dispatch.

## 2. 「我来填」

Empty / waiting-human fill slots show **我来填**. The dialog already has the goal title; submit `{ note, artifact_uri? }` to:

```http
POST /v1/goals/{id}/human-fill
```

This is the Domain human-fill path (fill-board projection). It does **not** assign a desk, drag-dispatch, or start a run. After submit the slot shows 人填 · 你 · note (+ 产物 when a URI was given).

## 3. Frozen Playwright names

`apps/web/e2e/gate-inbox/office-p0-anti.spec.ts`:

- `office_home_not_inbox_wall`
- `inbox_is_drawer_not_home`
- `office_no_assign_desk`
- `office_no_drag_dispatch`
- `office_no_start_run_button`
- `fill_board_not_dispatch_console`

Plus `office_home_p0_30s` (includes 我来填) and `desk_ttl_never_shows_stale_busy`.

## 4. Box smoke

```bash
cd services/boundary-harness
pnpm --filter @harness/api start   # :8080
# new terminal
E2E_BASE_URL=http://127.0.0.1:8080 pnpm test:e2e -- apps/web/e2e/gate-inbox/office-home.spec.ts apps/web/e2e/gate-inbox/office-p0-anti.spec.ts
```
