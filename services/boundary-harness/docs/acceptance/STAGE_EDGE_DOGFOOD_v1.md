# Stage-edge dogfood evidence v1 — TechLead → CTO

**When:** 2026-09-21 (Asia/Shanghai, recorded 12:10 CST)  
**Repo:** `kaibairen/my-working-party`  
**Main SHA:** `8319fc07add1a87708e1aba14e8b5189055a7191`  
(`Merge pull request #32` — Domain Stage-edge P0)  
**Path:** `services/boundary-harness/docs/acceptance/` (live-acceptance tree)  
**Gate:** short-drama reopen — TechLead scan landed; this is CTO dogfood evidence only.  
**Lock behavior:** unchanged. This note records a green rerun; it does not edit Domain.

`harness-live-acceptance/` was searched at repo root and under `services/`; it does not exist. Sibling live-acceptance notes already live here (`GAP_FIX_ADAPTER_WORKER_2026-09-19.md`, `STAGE_EDGE_P0_TECHLEAD.md`), so this evidence is filed in the same tree — not a generic `docs/` dump.

Domain Stage-edge under test: template `research_then_deliver_v1`, fill/dispatch with `unlock_after_gate_def_id` stays **423 `stage_locked`** until Inbox `decide=pass`, then fill/dispatch **201**.

---

## 1) Command run

On `main` at `8319fc07add1a87708e1aba14e8b5189055a7191`:

```bash
pnpm --dir services/boundary-harness test -- apps/api/tests/contract/stage-edge.test.ts
```

`package.json` `test` is `vitest run`, so that invocation executed the harness suite (including Stage-edge). **195 passed / 30 files.**  
`apps/api/tests/contract/stage-edge.test.ts` — **5 passed**.

Equivalent vitest file filter (verbose `it()` names):

```bash
pnpm --dir services/boundary-harness exec vitest run \
  apps/api/tests/contract/stage-edge.test.ts --reporter=verbose
```

Named freeze-gate filter (this note’s reopen pair):

```bash
pnpm --dir services/boundary-harness exec vitest run \
  apps/api/tests/contract/stage-edge.test.ts \
  -t "stage_locked_blocks_downstream_dispatch|stage_unlock_after_gate_pass" \
  --reporter=verbose
```

Helper (same filter): `docs/dogfood/run-stage-edge-freeze.sh`

---

## 2) Freeze gates — both green

| `it()` (exact) | Result | Meaning |
|---|---|---|
| `stage_locked_blocks_downstream_dispatch` | **pass** (38ms) | Downstream fill **and** dispatch → **423 `stage_locked`** |
| `stage_unlock_after_gate_pass` | **pass** (18ms) | Ready-not-passed still 423; `decide=pass` then fill/dispatch **201** |

Verbose capture:

```
✓ Domain Stage-edge P0 > stage_locked_blocks_downstream_dispatch 38ms
✓ Domain Stage-edge P0 > stage_unlock_after_gate_pass 18ms
Test Files  1 passed (1)
     Tests  2 passed | 3 skipped (5)
```

Full file (same SHA): 5 passed, including `verbal_done_never_unlocks_stage` and `stage_edge_does_not_jail_path_choice`.

---

## 3) 423 lock / pass / 201 unlock

Seed: `POST /v1/goals` `mode=deliver` `gate_template_id=research_then_deliver_v1`  
→ research (`research_ready_v1`) then deliver (`deliver_ready_v1`).

**Lock (before pass)**

- First-stage fill/dispatch (no `unlock_after_gate_def_id`) → **201**.
- Later-stage fill with `unlock_after_gate_def_id` = research GateDef → **423**, `code=stage_locked`.
- Not `freeze_active`, not `forbidden`, not 422.
- Dispatch of a later-stage assignment while research has no `gate_decisions.decision=pass` → **423 `stage_locked`**.
- Research Ready in Inbox but **not** decided still **423**.

**Pass**

- Only Inbox `POST /v1/gates/:id/decide` `{ decision: "pass" }` unlocks.
- Chat / oral / `mark-done` / screenshot-as-done never unlock (covered by `verbal_done_never_unlocks_stage`).

**Unlock (after pass)**

- Same later-stage fill → **201**, body keeps `unlock_after_gate_def_id`.
- Dispatch → **201** (`adapter=noop` in this fixture).

---

## 4) Harness ≠ jail

Stage-edge is a **prior-gate edge**, not a path script.

- Inside a stage, multiple assignments are allowed (path A / path B both **201**).
- `change_path` stays advisory (`advisory_hint`, `creates_gate=false`).
- No unlock_after → first-stage / unstaged work is free.
- Evidence-shape is per **target** stage (research briefs are not forced to carry deliver kinds).

Do not treat this lock as a jail on how a colleague works inside the current stage.

---

## 5) Strip copy — no UUID

Human body for Frontend (`message` + `strip`, also `zhDM.stageLocked`):

```
上一关还没通过，先别跳到下一阶段。
```

Constant: `STAGE_LOCKED_STRIP` in `@harness/domain`.  
The 423 body must not embed a GateDef / assignment UUID in `message` / `strip`. IDs stay in `details.unlock_after_gate_def_id` only.

---

## 6) Out of scope

- No Domain / OpenAPI / Ready / copy change in this dogfood PR.
- Product SoT for short-drama remains [video-copilot](https://github.com/kaibairen/video-copilot); this evidence is harness Stage-edge only.
- Existing anti-gates unchanged: mcp_entry, brief 422, fake desks, office dispatch forbids, freeze 423, chat_done_never_ready.

TechLead scan: [STAGE_EDGE_P0_TECHLEAD.md](./STAGE_EDGE_P0_TECHLEAD.md)
