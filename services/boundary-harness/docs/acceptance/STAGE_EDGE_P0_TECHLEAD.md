# Domain Stage-edge P0 — TechLead scan

**When:** 2026-09-21  
**Path:** `services/boundary-harness/`  
**schema_version:** 2 (additive; M0 freeze tables unchanged)

## What landed

1. **Schema/API**
   - `gate_defs.stage_key` — `research` | `deliver` | `safety` (null = legacy unstaged).
   - `assignments.unlock_after_gate_def_id` — prior GateDef that must be **decided pass**.
   - Migration `packages/domain/migrations/0003_stage_edge.sql` + `applyCompat` ALTER-if-missing.
   - OpenAPI: FillAssignment field, GateDef.stage_key, 423 `stage_locked` on fill and dispatch.

2. **Hard edge (harness ≠ jail)**
   - fill / dispatch with `unlock_after_gate_def_id` while that gate has no `gate_decisions.decision=pass` → **423 `stage_locked`**.
   - Ready-but-not-passed still locks. `freeze_active` / `forbidden` / 422 are **not** used for this.
   - No unlock_after → first-stage / unstaged work. Multiple assignments and `change_path` stay free **inside** a stage.
   - Evidence-shape check is per target stage, not every GateDef on the Goal (so research briefs are not forced to carry deliver kinds).

3. **Ready**
   - `research_ready_v1` — live `report_md` only. Screenshot / chat / run-finished alone never ready.
   - Deliver-node variants: existing `deliver_ready_v1` (summary_md) + `deliver_report_ready_v1` (report_md + same github/noop contract). `deliver_ready_v1@1` is not rewritten.
   - Template `research_then_deliver_v1` (deliver mode) seeds research then deliver. explore may bind `research_ready_v1`; still must not bind deliver templates.

4. **Verbal unlock forbidden**
   - Chat / oral / `mark-done` / screenshot-as-done never pass a gate and never unlock the next stage.
   - Only Inbox `decide(pass)` unlocks `unlock_after_gate_def_id`.

## Merge-gate names (exact)

- `stage_locked_blocks_downstream_dispatch`
- `stage_unlock_after_gate_pass`

Existing anti-gates unchanged: mcp_entry, brief 422, fake desks, office dispatch forbids, freeze 423, chat_done_never_ready.

## Scan questions

| Q | A |
|---|---|
| Does this script path inside a stage? | No. Only the declared prior-gate edge. |
| Can chat unlock? | No. |
| Wrong 423 code? | No. Stage jump is `stage_locked`; admin freeze stays `freeze_active`. |
