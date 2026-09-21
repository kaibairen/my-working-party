# 侧栏 Bot 戴手套清单 v1

> **P0-C：** 参与 Goal 的侧栏 Bot **默认**戴手套（见 `P0C_DEFAULT_MCP_GLOVE_v1.md`）。无手套不上岗写证据。  
> **Freeze：** `bot_glove_default_evidence_ready`（能自挂）· `status_change_outbound_wakes_assignee`（状态变了叫醒，不代写）

- **Owner：** HarnessBridge  
- **卡点：** 体验官能产文件，不能自调 `harness_attach_evidence`  
- **原则：** 要回写证据的 Bot **无手套不上岗**；人不给 Bot 旁路写；422/假名/派工合闸不松  
- **现树 SOP：** `docs/DOGFOOD_GROKBOT_MCP_SOP.md`（`:8787/mcp` + heartbeat）。本清单不另起 connector。

## 1. 谁必须戴

| 角色 | 是否必须挂 `:8787` MCP |
|------|------------------------|
| 参与 Boundary Goal、要 `attach_evidence` / Fill 的侧栏 Bot | **必须** |
| 纯只读/闲聊、不回写 Domain 的 Bot | 可不挂（不上岗写证据） |
| 决策人/协调者壳「一键入账」 | **人路径**（Bearer + 人角色），不是 Bot 手套旁路 |

## 2. 戴手套步骤（箱内）

1. Domain `http://127.0.0.1:8080` 已起；MCP `http://127.0.0.1:8787/mcp` 已起。  
2. 侧栏 Bot → Connectors → 加 MCP：  
   - URL：`http://127.0.0.1:8787/mcp`  
   - Header：`Authorization: Bearer <HARNESS_BOT_TOKEN>`  
3. **禁止**把 `CURSOR_API_KEY` 配进 connector。  
4. 写调用走 `harness_attach_evidence`（或 Fill）；代理注入 `x-harness-entry: mcp`。  
5. 自检（30s）：

```bash
curl -sS -X POST http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
# 期望：仅 harness_*；含 harness_attach_evidence / harness_heartbeat
```

故意缺 `summary_md` 等 kinds → Domain **422** + `missing_kinds[]`（MCP 原样透传，不改 400）。

Domain 出站唤醒（P0-D）打 `POST http://127.0.0.1:8787/hooks/domain-events`。无 `assignee_bot_id` / `assignee_bot_ids[]` 则跳过；wake 只提醒戴手套自挂，**不**代 `attach_evidence`，**不**刷决策人主聊天。`status_line` 用 Domain「等你拍板」。

## 3. 上岗口令（SOP）

> 无 `:8787` 手套、tools/list 看不到 `harness_attach_evidence` → **不上岗写证据**。  
> 可产本地文件但未戴手套 → 记 FRICTION，由协调者代挂或等人兜底「一键入账」，**不**给 executor 开无 entry 写。

## 4. 与人兜底（P1）分界

| 路径 | 谁 | entry |
|------|----|-------|
| MCP `harness_attach_evidence` | Bot（executor 等） | `x-harness-entry: mcp` **强制** |
| 壳「从附件一键入账」 | decision_maker / coordinator | 人 Bearer；审计 actor=human（Backend #人填入口） |

Bot 不得冒充人入口；人入口不得当成 Bot 免手套通行证。

## 5. 狗粮检查表

- [ ] 要回写的侧栏 Bot 已挂 `:8787`  
- [ ] tools/list 有 `harness_attach_evidence`  
- [ ] 无 CURSOR_API_KEY 进 connector  
- [ ] 缺 kinds → 422 + `missing_kinds[]` 可见  
- [ ] 未戴手套不上岗（FRICTION 可记，不挡短剧人手/统筹代挂）
- [ ] 出站唤醒只叫醒 assignee；不代 attach；不刷决策人主聊天
