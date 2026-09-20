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

1. **必须先调 `harness_heartbeat`**（`display_name` 或 `name` = 侧栏 Bot 真名；可选 `pool_id`、`group` / `section`、`kind` / `entity_kind`）——**不报心跳就不会出现在办公室工位**。`group` 自报分组（`harness` / `2048` / 空=其他）。`kind` 默认 `bot`；频道实体用 `channel`（花名册不画）。种子执行池不是同事，默认花名册是空的。TTL **90s**，见下。  
   **播种机纪律：** 只扫真 Bot 目录。目录里有 `group.json`（Grok Bot `CreateChannel` 频道）就跳过，不要给 2048工作组 / harness开发 / harness组 / harness组研讨 报心跳。Dogfood 过渡桥：`pnpm presence-bridge`（见 `docs/dogfood/PRESENCE_BRIDGE_SOP.md`）。Bot 仍应自己循环调 `harness_heartbeat`；桥只是忘了自报时的兜底。
2. `harness_create_goal` / `harness_fill_assignment` / `harness_dispatch` / `harness_attach_evidence`。  
3. 办公室槽位应显示该 Bot 的填充，而不是 curl 代跑。

Stdio 备选（Cursor/`mcp.json`，仍是本机配置，不是账号目录）：`pnpm --filter @harness/mcp-server start`。HTTP 手套是 Grok Bot 桌面首选。

临时公网：cloudflared 指到 `:8787`；URL 会变，只作试连。

## 4. 工位 TTL

`GET /v1/desks` 只读，**默认只返回 TTL 内的心跳 Bot**（`display_name` / actor），按自报 `group` 分组（空组不画）。`kind=channel` 以及 `display_name` 撞组头、又没有真 Bot 身份的心跳**不会**出现。种子 `pool_noop` / `pool_cursor` **不会**当成「交付同事 / Cursor 同事」出现，也**不得占用决策人主花名册**。运维（非 decision_maker）可加 `?include_pools=1`，池行只标「执行池 · noop / Cursor」并落在「执行池」组；决策人带该参数仍只见心跳。脏频道行：`DELETE /v1/agents/heartbeat`。

- **必须调用 `harness_heartbeat`（或 `POST /v1/agents/heartbeat`）才会出现在工位。**  
- **默认 TTL：90 秒**（可在心跳体里设 `ttl_seconds`，夹在 15–3600）。  
- 过期后该 Bot 行消失；办公室空态「还没有 Bot 报心跳」。  
- 看板仍是投影，**不是**派工台。无官方侧栏 roster API——不要扫 `agent-data` 或 `:1340`。

## 5. 人也能填

办公室空槽「我来填」：目标已是 `human_allowed` 则直填；否则决策人先开 `exception_grant` 再填。填充板仍只显示谁在填 / 填到哪，不出现「指派 / 开跑」。

## 6. 明确不做

- 假装已读到侧栏每个 Bot（无官方 API）  
- OS 级禁用 Shell / 裸 Cursor  
- 本 SOP 不修 `pool_cursor` `cursor_http_400`  
- 账号级 `AddMcpServer` 自动化
