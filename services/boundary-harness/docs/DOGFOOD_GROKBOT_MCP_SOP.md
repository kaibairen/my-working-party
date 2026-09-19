# Dogfood SOP · 同机 Grok Bot 挂 Boundary Harness MCP

**日期：** 2026-09-19  
**范围：** 组内交付 Bot，本机 dogfood。不改账号 `AddMcpServer` 目录。

## 1. 起控制面

```bash
cd services/boundary-harness
pnpm install
pnpm --filter @harness/api dev          # Domain :8080
pnpm --filter @harness/mcp-server start:http   # HTTP 手套 :8787/mcp
```

健康检查：`GET http://127.0.0.1:8080/health` · `GET http://127.0.0.1:8787/healthz` → `{"ok":true,"api":"http://127.0.0.1:8080"}`。

## 2. Bot connector（同机）

| 项 | 值 |
|----|----|
| URL | `http://127.0.0.1:8787/mcp` |
| Auth | `Authorization: Bearer <bot token>`（如 `executor:bot-1` 或签发的 bot JWT） |
| 工具面 | 仅 `harness_*`（含 `harness_heartbeat`）；`cursor_raw_*` → `forbidden_tool` |

**禁止**把 `CURSOR_API_KEY`（或任何 Cursor 明文密钥）写进 Bot connector / MCP env。Cursor 密钥只留在 Domain/worker 进程，经 `pool_cursor` 的 `secret_ref=env:CURSOR_API_KEY`。

代理会在打 Domain 时注入 `x-harness-entry: mcp`。Bot **不要**直打 `:8080` 的 dispatch / evidence——缺入口头会 **403** `mcp_entry_required`。

## 3. 建议先调的工具

1. `harness_heartbeat`（`display_name` + 可选 `pool_id=pool_noop`）→ 办公室「工位心跳」出现 `last_heartbeat`（TTL **90s**，见下）。  
2. `harness_create_goal` / `harness_fill_assignment` / `harness_dispatch` / `harness_attach_evidence`。  
3. 办公室槽位应显示该 Bot 的填充，而不是 curl 代跑。

Stdio 备选（Cursor/`mcp.json`，仍是本机配置，不是账号目录）：`pnpm --filter @harness/mcp-server start`。HTTP 手套是 Grok Bot 桌面首选。

临时公网：cloudflared 指到 `:8787`；URL 会变，只作试连。

## 4. 工位 TTL

`GET /v1/desks` 只读。`POST /v1/agents/heartbeat`（或 `harness_heartbeat`）刷新 `last_heartbeat`。

- **默认 TTL：90 秒**（可在心跳体里设 `ttl_seconds`，夹在 15–3600）。  
- 过期后该行不再算在线：池工位回落 `source=pool_seed`、`last_heartbeat=null`；无池的 agent 行消失。  
- 看板仍是投影，**不是**派工台。无官方侧栏 roster API——不要扫 `agent-data` 或 `:1340`。

## 5. 人也能填

办公室空槽「我来填」：目标已是 `human_allowed` 则直填；否则决策人先开 `exception_grant` 再填。填充板仍只显示谁在填 / 填到哪，不出现「指派 / 开跑」。

## 6. 明确不做

- 假装已读到侧栏每个 Bot（无官方 API）  
- OS 级禁用 Shell / 裸 Cursor  
- 本 SOP 不修 `pool_cursor` `cursor_http_400`  
- 账号级 `AddMcpServer` 自动化
