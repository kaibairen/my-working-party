# Gap fix: adapter v1 dual-id + worker Cursor poll → Ready

- **When:** 2026-09-19 (Asia/Shanghai)
- **Repo:** `kaibairen/my-working-party`
- **Path prefix:** `services/boundary-harness/`
- **Trigger:** CTO live acceptance — local patches must land in-tree; no hand DB edits for FINISHED.

## 1) Adapter: `source.repository` + v1 dual ids

**File:** `packages/adapters-cursor/src/index.ts` (+ `cursor.test.ts`)

- Live POST hits **`/v1/agents`** with:
  - `repos: [{ url, startingRef }]`
  - `source: { repository, ref }` (env: `CURSOR_REPO_URL` / `CURSOR_REPO_REF`)
- Dual ids: `agent.id` → `external_agent_id`, `run.id` → `external_run_id` (must stay distinct when both exist).
- New **`poll({ external_agent_id, external_run_id })`** for worker.
- Vitest ignores ambient `CURSOR_API_KEY` unless `CURSOR_ADAPTER_LIVE=1`.

## 2) Worker: poll Cursor FINISHED → Domain → Ready

**Files:**
- `packages/domain/src/services.ts` — `syncCursorAgentRuns`
- `packages/domain/src/index.ts` — export
- `packages/domain/src/db.ts` — Vitest fixture default for cursor adapter
- `apps/worker/src/index.ts` — each tick: `syncCursorAgentRuns` then `publishOutbox`
- Ready context: cursor with `cursor_lifecycle=FINISHED` unlocks artifact/offline branch (no fake github snapshot, no SQLite hand edit).

Flow: open cursor runs → adapter.poll → write usage lifecycle + status via Domain → re-eval Ready gates. **Forbidden:** hand `UPDATE runs SET …` in SQLite.

## 3) Tests

- `packages/adapters-cursor/src/cursor.test.ts` — v1 body + distinct dual ids + poll FINISHED
- `packages/domain/src/sync-cursor.test.ts` — mocked dispatch → evidence → sync → gate ready
- Contract m1–m3 stay green with ambient key present

## 4) Still recommended (product)

UI: decision maker clicks Pass once on Inbox (API Pass ≠ human UX proof).

## 5) Env for live

```
CURSOR_API_KEY=…
CURSOR_REPO_URL=https://github.com/kaibairen/my-working-party
CURSOR_REPO_REF=<branch>
DATABASE_PATH=…
```

Worker must run alongside API.
