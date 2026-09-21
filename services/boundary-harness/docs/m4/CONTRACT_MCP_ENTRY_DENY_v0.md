# 契约草案 v0：非 MCP / 未鉴权 → Domain 拒写

- **作者：** HarnessBridge  
- **对接：** @HarnessBackend（落地）· @HarnessQA（anti 名）  
- **状态：** **已落地（P0）** · Bot/executor dispatch + attach_evidence 强制 `x-harness-entry: mcp` → 缺则 **403** `mcp_entry_required`。**办公室人兜底：** `decision_maker` / `coordinator` 可用 Bearer-only `POST /v1/runs/{id}/evidence`（不带 mcp 头），audit `actor_kind=human`。dispatch 仍一律 MCP。不打开 executor/bot 旁路。

## 1. 写路径清单（必须过鉴权）

以下 **POST/PATCH/PUT/DELETE** 视为写路径（完成态相关加粗）：

- `POST /v1/goals`、`POST /v1/goals/{id}/assignments`
- **`POST /v1/assignments/{id}/dispatch`**
- **`POST /v1/runs/{id}/evidence`**（attach_evidence）
- `POST /v1/gates/{id}/decide`
- `POST /v1/policy/check`（可只读放行，但若带 side-effect 则同写）

只读 GET（gates?status=ready、runs/{id}）可保留现有角色头，不在本切片强制 MCP 入口标记。

## 2. 鉴权与入口

| 条件 | 写路径结果 |
|------|------------|
| 无 `Authorization: Bearer` 且无合法 `x-harness-role` 会话 | **401** `unauthenticated` |
| Token/角色无效或 pool 越权 | **403** `forbidden` |
| 调用方声明为 bot 完成态写（dispatch / executor evidence），但缺入口标记 | **403** `mcp_entry_required`（见下） |
| decision_maker / coordinator POST evidence（Bearer，无 mcp 头） | **2xx**；audit `actor_kind=human` |

**入口标记（二选一，Backend 拍）：**

- A. Header `x-harness-entry: mcp`（仅 MCP 代理注入；Bot/浏览器直调不带）  
- B. Audience/claim `entry=mcp` 打在 bot JWT 内（代理换票）

推荐 **A（代理注入）**：直调 Domain 即使偷到角色头也缺 entry → 拒写。

## 3. 错误体（稳定 code）

```json
{ "code": "mcp_entry_required", "message": "write requires MCP entry", "details": { "path": "/v1/runs/{id}/evidence" } }
```

`brief_forbidden_field`（steps 等）保持现有 **422**，与入口拒写正交。

## 4. 与 QA 两刀对齐

| Anti 名 | 期望 |
|---------|------|
| `mcp_only_completion_path` | 无成功 `attach_evidence`（经 MCP/入口）→ Ready **不得** true |
| `bot_bypass_direct_cursor_forbidden` | 直调 Cursor / `cursor_raw_*` / 无入口写 evidence **不得**冒充完成；MCP 调 raw → forbidden；直 POST evidence 无 entry → 401/403 |

## 5. 非目标

- 不封 Shell / 原生 CloudAgent / browser（纪律 + 审计）  
- 不要求 Gate Inbox UI 变更  
- Cloud Agent 池仍只经 Domain dispatch，不经 Bot 直调 Cursor

## 6. Bridge 侧义务

- MCP 代理所有写 tools/call 注入 `x-harness-entry: mcp`  
- tools/list 仅 `harness_*`；`cursor_raw*` → `forbidden_tool`  
- 契约测：直调写无 entry → 401/403；经 MCP evidence → 2xx


## 7. 命名澄清

- **MCP 工具允许表**（本契约）：仅 `harness_*`。
- **Guided Dial**（风险白名单）：外发/合保护分支/超预算/破坏删/提权——与工具允许表正交，勿混称 Dial 白名单。
- Skill 影子路径 **MUST NOT** 当 SoT；完成只认 Domain `attach_evidence`。


## 8. 定稿补丁（与一页纸对齐）

- 手套范围：仅 **参与 Boundary Goal 的组 Bot**，非全账号。
- `decide_gate`：工具可在 MCP 允许表；Domain RBAC **仅 decision_maker**，executor → **403**。
- `attach_evidence` 成功 ≠ Gate ready；Ready 仍走附录 A 谓词；旁路永不计入 Ready。
- V6 = audit/`bypass_suspected` only。
