# 2048 协作交付 · 多 Bot / 多账号交互

**日期：** 2026-09-20  
**范围：** 2048 dogfood 工作组（Grok Bot 侧栏 ↔ 办公室花名册）  
**状态：** 设计 + 薄落地（`team_group` / 频道不当工位）。不把建议写成强制步骤。  
**非目标：** `cursor_http_400`、OS 级强迫手套、把办公室改成派工台。

---

## 1. 交互：办公室 / Inbox / 侧栏怎么对

```
Grok Bot 侧栏                         AI 办公室 `/`
┌─────────────────────┐               ┌──────────────────┬──────────────────┐
│ bot harness         │  映射组名     │ 目标（填充板）    │ 工位心跳（只读）  │
│ · CTO统筹bot        │ ───────────► │ · 新建 / 选中     │ · 2048工作组     │
│ · HarnessTechLead   │  2048工作组   │ · 槽：角色+组     │ · harness开发    │
│ · HarnessFrontend   │               │ · 人也能填        │ · 其他（空则隐）  │
│ · HarnessBackend    │               └────────┬─────────┴──────────────────┘
│ · HarnessBridge     │                        │ 待办 · n
│ · HarnessQA         │                        ▼
│ harness开发         │               抽屉：待我拍板（唯一硬 HITL）
│ · harness组 / 研讨  │               通过 / 打回 / 稍后 · 证据齐才能过
└─────────────────────┘
```

| 面 | 决策人看见 | 禁止 |
|----|------------|------|
| **办公室首页** | Goal 填充板 + 按组花名册 | Inbox 墙、派工按钮、频道实体当工位 |
| **Inbox** | 只作为「待我拍板」抽屉 | 再升回唯一首页 |
| **侧栏 section** | `bot harness` 里的**真 Bot** | 把 CreateChannel 出来的频道（`group.json`）画成工位 |

**映射（dogfood 约定，不是账号目录同步）：**

| Grok Bot 侧栏 | 办公室 `group` / Goal `team_group` |
|---------------|-----------------------------------|
| section「bot harness」里的 2048 交付 Bot | `2048` → **2048工作组** |
| harness 控制面开发 Bot | `harness` → **harness开发** |
| 未自报组 | **其他**（空组不画） |
| Channel / 群（`group.json`） | **不是工位。** 心跳可标 `kind=channel`；`GET /v1/desks` 省略。 |

选中带 `team_group` 的 Goal 时，花名册**高亮**该组，不把其他组藏死（仍是投影，不是过滤器派工）。

---

## 2. 2048 各角色「交付」定义

完成只认 **Gate 证据**，不认聊天里的「好了」。角色是 Assignment 槽上的 `role` + `group`，人也能填。

| 角色 | 侧栏真名（例） | 交付是什么 | 证据形状 | 不是交付 |
|------|----------------|------------|----------|----------|
| **CTO统筹bot** | CTO统筹bot | 建 Goal / 写清一句话要什么 / 协调谁填槽 / 把 Gate 问到决策人面前 / 把产物 URI 挂上 | Goal 在办公室可见；槽已填；Gate 进抽屉 | 在群里催一圈、口头「都在跑」 |
| **TechLead** | HarnessTechLead | SoT 口径 + PR 合并放行（该合的合、不该合的挡住） | 可打开的 PR / 合并记录；Ready 谓词过 | 只在聊天里说 LGTM |
| **Frontend** | HarnessFrontend | 办公室 UI / 花名册（组、空态、中文标签、不当派工台） | 可打开的办公室页；决策人能看见组与真名 | 截一张图当「前端好了」 |
| **Backend** | HarnessBackend | Domain API / Ready / policy（心跳 `kind`、desks 过滤、Goal 字段） | 契约测试绿；OpenAPI 与 Domain 一致 | 只改文档不改 `listDesks` |
| **Bridge** | HarnessBridge | MCP 手套 / Cursor 适配 / 证据回写 | `harness_*` 可调；`attach_evidence` 落 Domain | 教 Bot 直打 `:8080` 或扫 `agent-data` |
| **QA** | HarnessQA | Ready 谓词 / 反假完成（缺产物、口头 done、假名墙、频道当工位） | 失败用例先红再绿；反例写进摩擦日志 | 「测过了」没有谓词 |

**槽位模型（设计；薄落地可后补列）：** Assignment 带 `role` + `group`。填充者 = Bot **或** 人（`filler_kind`）。空槽「我来填」仍只是投影。  
**唯一 done：** Gate evidence 齐 + 决策人拍板。Advisory 提示不升格成必经步骤。

---

## 3. 状态效率：别用聊天回声刷进度

工位状态已经部分来自 Assignment / Run / Gate（`在忙` / `等证据` / `空闲`）。下一刀优先：

1. **桌面状态** — 心跳 TTL 内才出现；过期消失；频道永不占行。  
2. **最后一条证据 URI 片段** — 工位行可跟一行可打开的产物（设计；未阻塞本刀）。  
3. **SSE / outbox** — `gate.ready` 已推抽屉角标。进度走事件，不走「我开始了 / 我做完了」群刷。

| 该走哪 | 不该走哪 |
|--------|----------|
| `harness_heartbeat` + desks 投影 | 每个 Bot 在频道里复读状态 |
| outbox / `GET /v1/events` | 把办公室当聊天室 |
| Gate 卡上的「还差」 | 口头 done、假名墙凑热闹 |

---

## 4. 多 Bot 交接

1. 决策人或 CTO统筹bot **建 Goal**（可带 `team_group=2048`）。  
2. 槽位按 **role + group** 打开（Frontend / Backend / …）。谁空谁填；人可以「我来填」。  
3. 各角色只交自己的证据形状，不互相在聊天里宣布完工。  
4. Ready 谓词全过 → 抽屉出现 → 决策人玩 / 看 PR / 拍板。  
5. 打回 = 同一槽再交一版，不是再开一个假同事。

Harness ≠ 监狱：MCP 手套和 Ready 是默认路径；Shell / 原生 Cloud Agent 仍是纪律旁路，记审计，不假装 OS 沙箱。

---

## 5. 频道不当工位（P0 已落地）

根因：Grok Bot `CreateChannel` 仍写 `profile.json` + `serverId`，并带 `group.json`（`memberIds`）。扫 agent-data 的心跳播种机会把 **2048工作组 / harness开发 / harness组 / harness组研讨** 当成 Bot 报心跳。`GET /v1/desks` 若照单全收，组头和工位行重名。

| 层 | 规则 |
|----|------|
| Heartbeat | 可选 `kind` / `entity_kind`：`bot` \| `channel`（默认 `bot`） |
| `listDesks` | 省略 `kind=channel`；也省略 `display_name` 等于组头、又没有真 Bot 身份的行 |
| 播种机 | **跳过含 `group.json` 的目录**（见摩擦日志） |
| 清理 | `DELETE /v1/agents/heartbeat` 扫频道行；或等 90s TTL。Dogfood 同步后先 DELETE 再停播种机 |

---

## 6. 请决策人当验收，不当时序官

- 办公室打开 = 目标 + 分组工位；待办只在抽屉。  
- 2048工作组里只有真 Bot，没有一条也叫「2048工作组」的工位。  
- 选中 2048 Goal 时该组被高亮。  
- 没有人靠群聊「好了」过 Gate。
