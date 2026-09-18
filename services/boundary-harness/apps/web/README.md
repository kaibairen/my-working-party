# Gate Inbox (M2-preview)

Decision-maker **sole HITL**. This page lists ready `GateInstance` rows and
accepts `pass | revise | defer`. Canvas, Roster, and run timelines are not on
this path — dispatch does not require opening a canvas
(`canvas_not_required_for_dispatch`).

Inbox primary key: **`GateInstance.id` + optimistic lock `version`**.

## Run

```bash
cd services/boundary-harness/apps/web
npm install
npm run dev
```

Open **http://localhost:5173/**

```bash
npm run build    # tsc --noEmit && vite build
npm run preview  # serve the production bundle
npx playwright test e2e/gate-inbox   # HarnessQA 🔴 cases against Mock
```

First-time e2e: `npx playwright install chromium`.

## Screenshot

1. `npm run dev` (Mock is the default source).
2. Open http://localhost:5173/
3. Capture the first viewport. You should see:
   - Title **Gate Inbox** and a **Mock / API** toggle on Mock
   - Two ready cards (`gin_01k8q2m0deliver`, `gin_01k8q3safety`)
   - Each card: `ready_result_json.missing[]`, `predicate_id` + version, `ready_at`
   - Actions **Pass / Revise / Defer**
   - No canvas, Roster, or progress timeline
4. Optional: Pass one card — it leaves the list. After both, empty state is
   **“All quiet. No ready gates.”** (no nudge to open a canvas).
5. Optional 409: **Arm 409** on a card, then Pass. The card refreshes; the
   decide is **not** retried.

## Mock vs API

| Mode | How | Behavior |
|------|-----|----------|
| **Mock** (default) | Toggle, or `VITE_DATA_SOURCE=mock` | In-memory GateInstance rows. Demoable without Domain API. Session persists until Reset inbox / tab close. |
| **API** | Toggle, or `VITE_DATA_SOURCE=api` | `GET /v1/gates?status=ready`, `POST /v1/gates/{id}/decide`, card refresh via `GET /v1/gates/{id}` (falls back to re-list). |

Copy `.env.example` to `.env` if you need a token or a remote base URL:

```bash
VITE_DATA_SOURCE=api
VITE_API_BASE_URL=          # empty = same-origin /v1 (Vite proxy → :8080)
VITE_API_TOKEN=
VITE_SSE_ENABLED=false
```

Dev proxy target: `VITE_API_PROXY_TARGET` (vite.config, default `http://127.0.0.1:8080`).

## Decide contract

Body matches OpenAPI `GateDecideRequest` — field is **`version`**, not `expected_version`:

```json
{ "decision": "pass", "version": 12, "note": "optional", "structural_change": false }
```

HTTP **409** `optimistic_lock`: refresh the card from the server. Never silent
overwrite retry.

`structural_change` defaults false (same Assignment, new Run on revise). Check
the card box only when a new Assignment is intended.

## SSE stub (optional, not required for screenshots)

`GET /v1/events/stream` — envelope `event` / `id` (outbox) / `data` (JSON).
Client sends `Last-Event-ID` via EventSource resume and a `last_event_id` query
hint. Types: `gate.ready` (idempotent upsert) · `run.failed` · `budget.exceeded`
· `freeze.changed` (badge only; does not block an open decide).

On disconnect: exponential backoff, then **re-list** ready gates. This UI does
not subscribe to run-progress timelines. Enable the **SSE stub** checkbox in
API mode, or `VITE_SSE_ENABLED=true`.

## Contract files

- `../../openapi/m0_fragment.yaml`
- Gate Inbox IA (M2): ready list + decide first; SSE after
