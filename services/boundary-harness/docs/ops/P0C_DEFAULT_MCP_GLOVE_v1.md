# P0-C 默认 MCP 手套 v1

- **Owner：** HarnessBridge  
- **Freeze：** `bot_glove_default_evidence_ready`  
- **目标：** 侧栏参与 Boundary Goal 的 Bot **默认**能自挂证据 + 读 Ready（无需人代挂）  
- **非目标：** OS 强制全账号；给人开 Bot 旁路写  
- **现树：** HTTP 手套已是 `apps/mcp-server` `:8787/mcp`（`pnpm dev:mcp-http`）。狗粮步骤见 `docs/DOGFOOD_GROKBOT_MCP_SOP.md`，不另起一套 connector。

## Done 标准

1. 参与 Goal 的 Bot connector 默认指向箱内 `http://127.0.0.1:8787/mcp`（或 live MCP URL）  
2. tools/list 含 `harness_attach_evidence` · `harness_list_gates` · `harness_heartbeat`  
3. Bot 可自调 attach（带 `x-harness-entry: mcp`）；缺 kinds → 422 + `missing_kinds[]` 透传  
4. Bot 可读 Ready/gates；**不**用 chat done 当 Ready  
5. SOP：无手套不上岗；狗粮步骤可复现  
6. 合闸不松：假名/派工/mcp_entry/stage_locked/422

## 实现切片

- A. 文档：本页 + 更新 `SIDEBAR_BOT_MCP_GLOVE_CHECKLIST_v1.md`「默认」段  
- B. 配置：沿用现有 SOP 的 URL / Bearer；**禁止** `CURSOR_API_KEY` 进 connector  
- C. 狗粮：现有 `docs/DOGFOOD_GROKBOT_MCP_SOP.md`（list → attach 或缺 kinds 422）  
- D.（可选）Bridge 侧「新 Bot 入 Goal 时打印手套必装提示」——产品壳另线

## 与 P0-D

P0-C = Bot **能**自写/自读；P0-D = Domain 状态变了 **叫醒** Bot。可并行，P0-D 不替代手套。  
唤醒只提醒，**不**代 `attach_evidence`，**不**刷决策人主聊天。

## 约束（CTO）

- **手套 ≠ 路径监工**：默认手套只提供 attach/读 Ready 能力，不把 Bot 锁进逐步脚本。
- P0-D 唤醒只提醒，不代写。
- Domain `status_line` SoT 是「等你拍板」（Backend P0-A）。Bridge 不发明「待拍板」。
