# Office Home P0 — Frontend smoke notes

Base: `http://127.0.0.1:8080`

Auth for the decision-maker shell:

```
Authorization: Bearer decision_maker:you
X-Harness-Role: decision_maker
X-Harness-Actor: you
```

These office routes are a **READ projection + limited create**. Do not add assign / drag / start-run controls.

## 1. Goal list (human titles)

```http
GET /v1/office/goals
```

- `title` is a human label. If the stored name is a UUID, the API returns `未命名目标`.
- Use `id` only as a handle for `fill_slots`, never as the visible title.
- Empty list copy: `empty_copy` = `还没有目标。建一个，同事才会开工。`

## 2. Create goal (name + one-sentence intent)

```http
POST /v1/office/goals
Content-Type: application/json

{ "title": "周报交付验收", "intent": "把本周周报交出去" }
```

- `201` with `{ id, title, intent, status_summary }`.
- Body keys such as `steps` / `script` / `playbook` → **422** `brief_forbidden_field` (same BriefV1 floor as assignments).
- This does **not** assign a desk or start a run.

## 3. Fill-slot projection (read-only)

```http
GET /v1/office/goals/{id}/fill_slots
```

Render only: who is filling (`filled_by.name`), `stage` / `stage_label`, artifact `href`s.

Do **not** render「指派给 / 拖到工位 / 开始跑」. `POST` this path → **403** `office_write_forbidden`.

## 4. Desk presence (read-only)

```http
GET /v1/office/desks/presence
```

Three states only: `busy` | `waiting_evidence` | `idle` (`status` is 在忙 / 等证据 / 空闲).

`POST` / `PATCH` / owner-assign / dispatch under `/v1/office/desks*` or `/v1/office/goals/{id}/dispatch` → **403** `office_write_forbidden`.

Existing `GET /v1/desks` is the same projection.

## 5. HITL stays in the drawer

```http
GET /v1/gates?status=ready
```

Inbox `/inbox` is the only hard HITL. Office is not a dispatch board.

## Bot completion (not the DM shell)

`POST /v1/assignments/{id}/dispatch` and `POST /v1/runs/{id}/evidence` require:

```
X-Harness-Entry: mcp
```

(injected by the MCP proxy; M4 glove = bots on a Boundary Goal only).

| Call | Result |
|------|--------|
| No Bearer and no `X-Harness-Role` | **401** `unauthenticated` |
| Bot/browser direct write, no entry | **403** `mcp_entry_required` |
| `decide_gate` as executor | **403** `forbidden` |
| `attach_evidence` 2xx | does **not** mean Gate ready |
