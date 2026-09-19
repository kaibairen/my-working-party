# M4 切片一页纸：组 Bot 默认戴 Harness MCP 手套

- **作者：** HarnessBridge  
- **状态：** 定稿候选 · 研讨已钉板 · 等决策人点头再排实现（不写代码）  
- **范围：** 约束 **Grok Bot** 走 Harness；Cloud Agent 仍只是执行池  
- **非目标：** OS 级强制侧边栏（已确认做不到，不阻塞）

---

## 1) 组内默认安装 / 检查（Harness MCP）

**安装（每个 harness 组 Bot）**

1. 起 Domain API（本机 `:8080`）+ MCP 代理（`:8787/mcp`）。  
2. 公网验收时再开临时 tunnel；日常 dogfood 可用 `http://127.0.0.1:8787/mcp`。  
3. Bot connector：URL = `{MCP_BASE}/mcp`；Header `Authorization: Bearer $HARNESS_BOT_TOKEN`（coordinator/executor 按角色签发）。  
4. **禁止**把 `CURSOR_API_KEY` 配进 Bot connector。  
5. Skill 可选：同机 HTTPS 回写作影子；**MUST NOT 当 SoT**——完成只认 MCP/`attach_evidence`（Domain）。

**检查（30 秒）**

```text
POST {MCP}/mcp  tools/list
→ 仅 harness_*（建议 8 个：create_goal / fill_assignment / dispatch /
  attach_evidence / get_run / list_gates / decide_gate / policy_check）
→ 零 cursor_raw*
故意 tools/call cursor_raw_* → forbidden_tool
```

---

## 2) MCP 工具允许表：只允许 `harness_*`

| 层 | 规则 |
|----|------|
| MCP 代理 | 路由表硬编码 `harness_*`；未知名 / `cursor_raw*` → 拒绝 |
| Domain Policy / Dial | Bot 角色可调用的 authority 动作 ⊆ 经 Harness 的工具面；直调 Cursor launch、直写 Gate 状态 = deny 或 redirect_hint |
| BriefV1 | 禁键（`steps`/`script`/…）保留；422 `brief_forbidden_field` 为硬拦 |

**原则：** MCP 工具允许表 =「手套上有什么按钮」；**Guided Dial** 仍只拦外发/合保护分支/超预算/破坏删/提权，二者勿混。不是把 Bot 关进监狱，而是默认只能戴手套操作 Domain。

---

## 3) 旁路清单与「纪律 vs 可强制」

| 旁路 | 今日能否强制封死 | M4 处置 |
|------|------------------|--------|
| Harness MCP 外的 Domain HTTP 直调 | 部分可强制（鉴权 + 入口标记） | 契约：非 MCP / 无 bot token → 拒写或只读；需 Backend 补 |
| `cursor_raw_*` / 裸 Cursor API Key 进 Bot | MCP 面可强制 | 已禁；Token 不进 connector |
| 原生 CloudAgent 工具 | **不可** OS 级禁 | **纪律**：只作池，由 coordinator 经 Harness dispatch；审计记录「谁绕开了」 |
| Shell / 本机改 DB | **不可**对侧边栏 Bot OS 级禁 | **纪律** + 验收反例；生产靠人审 + audit |
| Browser 直开 Cursor 控制台 | 不可强制 | 纪律；不计入 Ready |

**边界一句话：**  
可强制 = MCP 手套内 + Domain 鉴权/入口。  
纪律 = Shell / 原生 CloudAgent / browser——标为旁路，dogfood 靠流程与审计，不假装 OS 沙箱。

---

## 4) 验收（M4 Done 门槛）

| # | 用例 | 期望 |
|---|------|------|
| V1 | `tools/list` | 仅 `harness_*`，无 `cursor_raw*` |
| V2 | `tools/call cursor_raw_*` | 失败（forbidden） |
| V3 | `fill_assignment` brief 含 `steps` | **422** `brief_forbidden_field` |
| V4 | 合法 `attach_evidence`（含 uri） | **2xx**，Domain 落库 |
| V5 | 故意旁路：无 token 直 POST Domain 写路径 | **401/403** 或等价拒写（若本切片含入口拒） |
| V6 | 故意旁路：原生 CloudAgent 不经 dispatch | **至少可审计**（日志/outbox 事件标 `bypass_suspected`）；不要求技术封死 |

**已有基线（可复现）：** V1–V4 本机 PASS（2026-09-19）。V5–V6 为本切片开工项。

---

## 5) 开工前要决策人点头的三句话

1. M4 接受「纪律旁路」存在，不追求 OS 级强制。  
2. 组 Bot **默认**必须装 Harness MCP；无手套不算组内可用 Bot。  
3. V5 Domain 入口拒写由 Bridge 出契约、Backend 落地；V6 以审计为准。

点头后：PR 进 `kaibairen/my-working-party` → `services/boundary-harness`（文档 + 契约，再代码）。


---

## 定稿钉板（研讨收口 · 不写代码）

**命名**

- **MCP 工具允许表**（仅 `harness_*`）≠ **Guided Dial**（外发 / 合保护分支 / 超预算 / 破坏删 / 提权）。

**完成与 Ready**

- Skill 影子路径 **MUST NOT** 当 SoT；完成只认 MCP/`attach_evidence`（Domain 落库）。
- **V4 `attach_evidence` 落库 ≠ Gate `ready`**：仍须附录 A 谓词（`deliver_ready_v1` / `safety_only_v1`）。
- Skill 影子与 browser 旁路 **永不计入 Ready**。
- **V6** 只认 audit / `bypass_suspected`，禁止用「纪律过了」冒充绿。

**手套范围（涌现）**

1. 手套只盖 **参与 Boundary Harness Goal 的组 Bot**；不得暗示账号内所有 Bot 都要戴（探索类队友不是软 Jail）。
2. MCP 可挂 `decide_gate`，但 RBAC **仅 `decision_maker`**；`executor` 调 → **403**（执行侧自过 Gate = 绕开唯一 HITL）。

**旁路**

- Shell / browser / 原生 CloudAgent：**纪律 + 审计**，不追求 OS 封死，也 **不卸掉**（卸掉才扼杀涌现）。
