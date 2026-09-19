# Boundary Harness · 决策人点点用用 v1（体验权威稿）

> **P0 home supersede:** 决策人默认 `/` 以 [OFFICE_HOME_IA_P0_v1.md](experience/OFFICE_HOME_IA_P0_v1.md) 为准（目标列表 + 填充槽 + 工位心跳；Inbox 降为抽屉）。下文 G1 卡面 / R17–R25 仍约束抽屉与 `/inbox`。

**角色：** Harness体验（唯一产品体验负责人）  
**日期：** 2026-09-19 Asia/Shanghai  
**对齐：** 权威 PRD §5.5/§7 · 保留 `authority_gate` vs `advisory` · 禁画布作派发前置 · 禁口头 done  
**对照反例：** PR #5 截图（Gate Inbox / Health·OpenAPI·Outbox）——工程通了，但像调试台

---

## 1) 七步点点流程（第一次打开 → Pass 一张卡）

每步只写**屏幕上该看见的中文文案**；括号内是布局提示，不是给用户看的。

### 步骤 1 · 落地（默认页 = 办公室，不是 /ops）
- 顶栏标题：`AI 办公室`
- 副文案：`同事在工位上干活。你只在「待我拍板」出现时进来。`
- 主按钮：`查看待我拍板`（有待办时带红点数字，如 `待我拍板 · 1`）
- 次入口（弱）：`工位一览`（只读投影，**不要**写成「打开画布才能开工」）
- **禁止出现：** OpenAPI、/health、outbox、role 下拉、`decision_maker`、UUID、Reload ready

### 步骤 2 · 空办公室（稀疏 HITL 正常态）
- 中央空态标题：`此刻没有需要你拍板的事`
- 正文：`安静是正常的。同事填满工位后，卡片会自己出现在这里。`
- 小字：`不用去盯进度。完成以证据为准，不认口头说「好了」。`
- 无诱导：`去 Roster / 去画布看看` —— **删**

### 步骤 3 · 有卡进入「待我拍板」
- 页标题：`待我拍板`
- 筛选芯片（人话）：`要你决定`（默认）｜`已决定`（只读）
- 列表说明（一行）：`下面每张卡都过了硬门禁检查，可以拍板。`
- **禁止：** `Showing status=ready GateInstances`、`missing[]`、predicate 原文

### 步骤 4 · 卡片主面（30 秒能懂）
卡面只露四层：

1. **这是什么**：`交付验收`（由 gate 标题/目标标题映射；不要 UUID）
2. **为什么找你**：`证据已齐，等你过这一关`（若有缺失则见步骤 5）
3. **一眼摘要**：`目标：××` · `同事已交：摘要 / 产物链接`（人读 summary，不露 run id）
4. **三个按钮**（固定中文）：
   - 主：`通过`
   - 次：`打回重做`
   - 弱：`以后再说`

角标（仅 authority）：`硬门禁`  
若来源是 advisory：**根本不进这列表**（见 §3）

### 步骤 5 · 有「还缺什么」时（谓词缺失 → 人话）
- 区块标题：`还不能过，缺这些`
- 条目映射示例（机读 → 中文）：
  - `summary_md` → `还缺一份结论摘要`
  - `github_pr draft` → `相关合并请求还是草稿`
  - `checks not success` → `检查还没全部通过`
  - `artifact_uri` → `还缺可打开的产物`
- 底栏：此时 **「通过」禁用**；保留 `打回重做` / `以后再说`
- **禁止**原样甩 `missing[]` 字符串数组

### 步骤 6 · 点「通过」确认条（防误触，仍像产品）
- 条目标题：`确认通过？`
- 正文：`通过后，这张硬门禁记为同意。系统按规则继续；不会因为有人说「好了」就过关。`
- 按钮：`确认通过` · `取消`
- 成功反馈（非 UUID toast）：`已通过 · 办公室少了一张待办`
- 列表刷新：该卡消失；若空 → 回到步骤 2 文案

### 步骤 7 · 「打回重做」二次选择（对齐 PRD：默认同 Assignment 新 Run）
- 标题：`打回重做`
- 默认选项（选中）：`让同一工位再跑一版`（= structural_change false）
- 危险选项（折叠/二次确认）：`这是结构问题，要换任务边界`（= structural_change true）
- 可选备注框占位：`想改的方向（可选）`
- 提交按钮：`确认打回`
- **禁止**让用户填 `expected_version` / `GateInstance id`

---

## 2) 主界面信息架构

隐喻三块，**一张屏能指清**：

```
┌──────────────────────────────────────────────────────────┐
│ AI 办公室                                    待我拍板 · N │
├──────────────┬─────────────────────┬─────────────────────┤
│ ① 办公室工位  │ ② 填充槽（只读）      │ ③ 待我拍板（唯一HITL）│
│              │                     │                     │
│ 每位同事一格  │ 每个槽 = 一个 Assignment│ 只列 authority 硬卡 │
│ 状态：在忙/   │ 「目标要填的坑」       │ pass/revise/defer  │
│ 等证据/空闲  │ 显示：池名+一句话目标  │                     │
│              │ 不显示：brief JSON    │                     │
└──────────────┴─────────────────────┴─────────────────────┘
```

### 怎么摆（决策人默认）
| 区域 | 决策人默认 | 协调者可多看 |
|------|------------|--------------|
| ③ 待我拍板 | **主路径 / 默认落地焦点** | 同左 |
| ① 办公室工位 | 次要只读，可收起 | 主协作投影 |
| ② 填充槽 | 折叠在工位详情里 | 派活前看槽，**仍不是开跑前置 UI** |

硬规则：
- **开跑 / dispatch 零 UI 依赖**（含不打开画布、不打开本页）
- 决策人**默认不进** Roster 舰队感时间线
- 画布 = 延后投影，**禁止**写成派发前置

### 主路径只留
- 目标人话标题、门禁人话名、硬/软标记、`还缺什么` 人话列表、证据摘要入口、三按钮、安静空态

### 藏进「详情 / 工程抽屉」（默认折叠，决策人可不看）
- 一切 UUID / `GateInstance.id` / `goal_id` / `run_id`
- `predicate_id` / `predicate_version` / raw `ready_result_json`
- `version` 乐观锁（前端静默携带；409 只提示 `别人刚拍过，已刷新`）
- OpenAPI、/health、outbox attempts、HMAC、adapter=noop、schema_version
- SSE 技术字样；角色枚举 `decision_maker`（改成「你是决策人」或干脆不展示）
- advisory 原文（若需可见：标成 `参考建议 · 不挡事`，**绝不**进待拍板队列）

---

## 3) PR #5 打回清单（必须从主路径拿掉或改名）

对照 PR 文物：`gate_inbox_ready` / `gate_decide_success` / `health_openapi` / `ops_outbox_*`。

| # | 现状（主路径） | 处置 | 改成（若仍要保留能力） |
|---|---------------|------|------------------------|
| R1 | 顶栏 `Gate Inbox M2-preview · decision-maker path` | **改名** | `待我拍板` 或落地 `AI 办公室` |
| R2 | 文案 `Showing status=ready GateInstances. Cards include missing[].` | **删除** | `要你决定的卡片` |
| R3 | 卡面主标题 = UUID | **拿掉** | 目标/门禁中文标题；UUID 仅详情 |
| R4 | 字段行 `predicate_id` / `predicate_version` / `ready_at` ISO / `goal` UUID | **拿掉或改名** | `规则：交付验收` · `就绪时间：今天 01:50` · `所属目标：…` |
| R5 | `missing[] (empty – ready)` 黄字调试味 | **改名** | 无缺失时：`检查已齐，可以拍板`；有缺失：§1 步骤 5 |
| R6 | 按钮 `Pass` / `Revise` / `Defer` | **改名** | `通过` / `打回重做` / `以后再说` |
| R7 | 成功条 `Decide pass succeeded for <uuid>` | **改名** | `已通过 · 办公室少了一张待办` |
| R8 | 顶栏入口 `Health / OpenAPI` | **移出决策人主路径** | 工程师抽屉或 `/ops` 需显式角色 |
| R9 | 整页 `Health / OpenAPI / Outbox` + 裸 JSON/YAML + outbox 表 | **禁止当产品首页** | 仅 ops 角色；决策人登录不得默认进 `/ops` |
| R10 | 角色下拉 `decision_maker` + `dm-1` | **拿掉或人话** | 登录身份即可；调试切角色进「开发者工具」 |
| R11 | 按钮 `Reload ready` | **改名** | `刷新` 或不露（靠 SSE 静默） |
| R12 | 空态 `No ready gates.` | **改名** | §1 步骤 2 安静文案 |
| R13 | 导航链 `/health` `/v1/outbox` `/openapi.yaml` | **禁止决策人 IA** | 文档站 / ops |
| R14 | 若把 advisory 画成同款 Pass 卡 | **禁止** | advisory → 非阻塞浅提示；**不进**待我拍板 |
| R15 | 任何「先打开画布再 dispatch」暗示 | **禁止** | 保留 API 级 `canvas_not_required_for_dispatch` |
| R16 | 任何「同事说 done / 聊天说好了」当完成 | **禁止** | 文案明示：只认证据 + 硬门禁 |
| R17 | 卡标题 = GateInstance UUID | **禁止** | Goal 人读 `title` |
| R18 | 卡标题 = `e2e-*` / `g-{digits}` 夹具 | **禁止** | 「周报交付验收」「清理临时分支」 |
| R19 | 主面露出 `predicate_id` 原文 | **禁止** | `规则：交付验收`；原文仅详情 |
| R20 | `missing[]` 裸数组或 `(empty)` | **禁止** | 非空才「还差：…」 |
| R21 | 按钮 Pass / Revise / Defer | **禁止** | 通过 / 打回重做 / 稍后处理 |
| R22 | 顶栏 Health / OpenAPI | **禁止** | 仅 `/ops` |
| R23 | 角色下拉 / `dm-1` | **禁止** | 决策人主路径不露调试身份 |
| R24 | Reload ready 主按钮 | **禁止** | SSE 静默刷新 |
| R25 | 空态教去画布 / 口头 done | **禁止** | 「此刻没有待办。安静是正常的。」 |

工程可留：API、Playwright、Ready 反例、SSE——**UI 皮肤与信息层级必须换**，否则决策人仍看不懂。

---

## 4) 给 HarnessFrontend 的改版 Brief（可直接开 PR）

**标题建议：** `feat(web): 决策人 AI 办公室 + 待我拍板（去调试台）`

### 目标
把 `apps/web` 决策人默认体验从「Gate Inbox / ops 调试台」改成「AI 办公室 + 填充槽投影 + 待我拍板」；**不改** Domain Ready / authority vs advisory 语义。

### 范围（P0，本 PR）
1. **路由**
   - 决策人默认：`/` → 办公室壳 + 待我拍板面板
   - `/ops`、OpenAPI、health JSON：**不链进**决策人顶栏；可保留路由但加 `ops` 角色或 `?dev=1`
2. **文案包**（新建 `apps/web/copy/zh-DM.ts`）
   - 落地 §1 步骤 1–2；卡面 §1 步骤 4–7；409：`别人刚拍过，已为你刷新`
3. **GateCard 重构**
   - 主面只渲染人话字段；`version` 静默；UUID 进 `<details>工程详情</details>`
   - `missing[]` → 映射表（未知 key 显示 `还缺：{key}` 而非裸数组）
4. **按钮**
   - 中文三键；Pass 成功用产品 toast；Revise 带默认/结构两档
5. **authority vs advisory**
   - Inbox 列表 API 仍只拉可决定的硬门禁实例
   - 若错误返回 advisory：UI **不渲染**为待拍板卡（可 console/dev 警告）
6. **空态**
   - 换 §1 步骤 2；去掉「去画布看进度」
7. **验收截图（换新文物）**
   - `office_empty_quiet.png`
   - `inbox_one_card_human.png`（无 UUID 主面）
   - `inbox_after_pass_quiet.png`
   - **不要**再把 `ops_outbox` / `health_openapi` 当作决策人验收图

### 非目标（本 PR 不做）
- Roster 舰队监工台、可写画布、进度时间线默认推送
- 改 Ready 谓词、改 decide API 语义
- 口头 done / 聊天推进状态

### 验收标准（产品）
- [x] 决策人 30 秒内能独立完成：打开 → 看见卡 → 通过 → 回到安静空态
- [x] 主路径零 OpenAPI/outbox/UUID 标题
- [x] advisory 不能冒充硬门禁卡
- [x] 文档/测试仍断言：dispatch 不依赖打开任何 UI
- [x] Playwright 选择器改靠 `data-testid`，不断言英文调试文案

### 给实现的文件提示（非强制路径）
- `services/boundary-harness/apps/web/` 决策人壳
- 更新 `docs/GATE_INBOX_IA_M2.md` → 更名或追加 `AI_OFFICE_IA_M2.md`（办公室 + 待我拍板）
- QA：旧截图路径从「决策人完成定义」中移除 ops 页

### 打回标准（我方）
若 PR 仍出现：顶栏 Health/OpenAPI、卡面 UUID 作标题、`missing[]` 原文、Pass 成功 toast 带 uuid、空态教人去画布——**体验打回，不进决策人演示。**
