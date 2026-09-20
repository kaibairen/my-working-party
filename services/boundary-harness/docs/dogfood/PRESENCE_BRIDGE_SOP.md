# Dogfood SOP · Presence bridge（CreateAgent → 工位）

**日期：** 2026-09-20  
**范围：** 同机 Grok Bot 盒。把侧栏真 Bot 映到办公室工位，**不扫频道**。  
**地位：** 过渡。官方 Grok Bot 花名册 API 不存在；Bot 自己调 `harness_heartbeat` 仍是正路。本桥是 Bot 不自报时的兜底。

---

## 1. 决策人验收（连一只测试 Bot）

1. 办公室打开 `/`，工位心跳可以是空的。  
2. 侧栏 **CreateAgent** 一只真 Bot（不要 CreateChannel）。  
3. 等一个扫描周期（默认 30s）。  
4. `GET /v1/desks` / 办公室右侧出现该 Bot 的 `display_name`，落在对上的组。  
5. CreateChannel 出来的群（目录有 `group.json`）**不会**变成工位。

---

## 2. 同机怎么跑

控制面先起（见 `DOGFOOD_GROKBOT_MCP_SOP.md`）：API `:8080`，MCP 手套 `:8787` 可选。

```bash
cd services/boundary-harness
AGENT_DATA_ROOT=/home/box/agent-data/agents \
HARNESS_API_URL=http://127.0.0.1:8080 \
INTERVAL_SECONDS=30 \
pnpm presence-bridge
```

一次性 / 干跑：

```bash
node scripts/presence-bridge.mjs --once --dry-run
```

| 环境变量 | 默认 | 含义 |
|----------|------|------|
| `AGENT_DATA_ROOT` | `/home/box/agent-data/agents` | 每个子目录一份 `profile.json` |
| `HARNESS_API_URL` | `http://127.0.0.1:8080` | Domain |
| `INTERVAL_SECONDS` | `30` | 扫描周期 |
| `HEARTBEAT_TTL_SECONDS` | `90` | 与花名册 TTL 对齐 |
| `HARNESS_BOT_TOKEN` | （空则 `Bearer coordinator:<ascii actor>`） | 鉴权 |
| `PRESENCE_GROUP_MAP_JSON` | 内置 2048 真名表 | `{"CTO统筹bot":"2048工作组"}` |
| `PRESENCE_SECTION_ALIASES_JSON` | `bot harness` → `2048工作组` | 侧栏 section 别名 |

请求带 `x-harness-entry: mcp`（心跳本身不强制入口头；与手套纪律对齐）。

---

## 3. 跳过规则（必须）

| 目录情况 | 处置 |
|----------|------|
| 有 `group.json` | **跳过** — Grok Bot `CreateChannel`，不是工位 |
| `profile.json` 名为空 | 跳过 |
| 名以 `New ` 开头 | 跳过（未起名占位） |
| 名为 交付同事 / Cursor 同事 | 跳过（假名墙） |
| 只有 `profile.json` 的真 Bot | `POST /v1/agents/heartbeat` `kind=bot` |

脏数据：`DELETE /v1/agents/heartbeat` 清频道行；或等 90s TTL。

---

## 4. 组怎么对

1. `profile.group` / `profile.section` / `profile.team_group` 优先。  
2. section 文案 **`bot harness`** 默认映到办公室 **`2048工作组`**（可用 `PRESENCE_SECTION_ALIASES_JSON` 改成原样 `bot harness`）。  
3. 否则按真名：CTO统筹bot / HarnessTechLead / Frontend / Backend / Bridge / QA → `2048工作组`。  
4. 其余 `Harness*` → `harness开发`。  
5. 都不认得 → `其他`。

侧栏「bot harness」↔ 办公室「2048工作组」是 dogfood 约定，不是账号目录同步。

---

## 5. 和 MCP 心跳的关系

- **正路：** 每个执行 Bot 启动后循环调 `harness_heartbeat`（`display_name` = 侧栏真名，`group` = `2048` / `harness`）。  
- **桥：** Bot 还没戴手套、或忘了自报时，扫描 `agent-data` 代报。  
- 两边可以同时存在：同一 `actor` 覆盖同一行，不造假同事。

---

## 6. 明确不做

- 假装已订阅官方侧栏 roster（没有这个 API）  
- 把 `group.json` 频道报成工位  
- 修 `cursor_http_400`  
- OS 级强迫每个 Bot 挂手套
