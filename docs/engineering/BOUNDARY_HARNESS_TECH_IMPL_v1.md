# Boundary Harness 完整技术实现方案 v1.1-candidate

> 与权威 PRD v1.0-CANDIDATE.2 对齐。全文细节以 PRD MUST 为准。  
> 日期：2026-09-19

## 栈
TS + Hono/Fastify + Zod + Drizzle；仓 `boundary-harness`；文档 `my-working-party`。

## 进程
api · worker · mcp-server（可同二进制多 mode）

## 实体补丁（相对 v1.0-draft）
- GateDef / **GateInstance** 分离；Inbox 只用 Instance id + 乐观锁  
- runs: `external_agent_id` + `external_run_id` + `idempotency_key` + `dial_at_dispatch`  
- assignments: 权威 `budget_json`；brief 禁键表扩展  
- policy/check: 必带 `track: authority_gate|advisory_hint`  
- goals: 必填 `coordinator_ref`；dispatch 前校验  

## MCP M1
见权威 PRD §8；禁止 cursor_raw / set_steps。

## CursorAdapter
见权威 PRD §8；FINISHED≠IDLE；SSE 优先；冲突 409 复用。

## Ready
版本化谓词 + github_snapshots；outbox 一次跳 ready。

## revise
默认同 Assignment 新 Run + autonomy_budget；structural_change 才新 Assignment。

## 决策人 UX
仅 Gate Inbox；Roster/时间线/canvas = 投影。

## 里程碑
M0–M3 同权威 PRD §9。
