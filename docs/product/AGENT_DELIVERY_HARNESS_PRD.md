# Agent Delivery Harness（交付护栏控制面）产品方案 v0.1

> 仓库：`kaibairen/my-working-party`  
> 作者：技术研讨 bot（Grok Bot）+ 研讨类协作 bot  
> 日期：2026-09-18  
> 状态：研讨草案，供决策人评审迭代

---

## 0. 一句话定位

**做一层 harness（护栏），不是又一个工作流监工。**  
在完全对齐 Grok Bot「持久自主队友」定位的前提下，只约束「乱碰乱撞」与「把聊天当成系统真源」，**不削弱 Bot 在边界内的自主性与涌现能力**。

---

## 1. 问题陈述

### 1.1 我们观察到的痛

1. **多 Bot / 多 Cursor 账号协作靠对话编排**：进度互转告、完成态靠模型自觉 → token 暴涨、交付边界模糊。  
2. **想用状态机/画布管死全流程**：容易做成 Dify 式死流水线，**自主性与涌现被掐死**，与 Grok Bot 设计目标背道而驰。  
3. **缺失「护栏层」**：既没有机器可读的交付判定，也没有「低风险自由跑、越界才减速」的拨盘。

### 1.2 非目标（明确不做）

- 不做「对话画成图」的纯编排器（Orchestrator-as-chat）。  
- 不要求用户变成 dispatcher（与 Grok Bot「协调 Bot 路由、少给用户看板活」一致）。  
- 不把每一次工具调用都变成审批（Cursor Auto-review 已证明这会疲劳失效）。  
- 不替代 Grok Bot / Cursor 的运行时；我们是**其上的 harness / 控制面**。

---

## 2. 官方思想锚点（必须对齐）

### 2.1 Grok Bot：持久 Agent，而不是会话工具

来源：[Designing Grok Bot for a world of persistent agents](https://x.ai/news/designing-grok-bot)、[Introducing Grok Bot](https://x.ai/news/introducing-grok-bot)、[docs.x.ai/grok-bot](https://docs.x.ai/grok-bot/overview)

关键产品选择：

| 原则 | 含义 | 对本产品的约束 |
|------|------|----------------|
| Bot 是一等公民，Chat 是界面 | 侧边栏是 roster，不是历史会话列表 | 控制面挂 Goal/职责到 **Bot/执行池**，不是挂到一次性会话 |
| 电脑是 Bot 的工作区 | Status → Preview → Takeover，避免用户被迫监工 | UI 默认「瞥一眼」，不要强制盯屏看板 |
| 能力共享、上下文分角色 | Tools/Skills 账户级；Memory/Routines Bot 级 | Assignment brief 要自包含，但不要强行合并所有记忆 |
| 协调 Bot 做路由，少给用户 assignment board | 官方考虑过看板/显式交接，因增加用户协调负担而收敛 | **我们的画布是可选护栏视图，默认由协调 Bot 使用，人只看门禁** |
| 人只在需要判断时介入 | Routines/事件可无用户启动工作 | Gate 才打扰人；流转中保持安静 |
| 消失的界面 | 能删的控件就删；限制 roster/群规模 | MVP 控件极少，原则优先于功能堆砌 |

**一句话：Grok Bot 要的是「可委托的同事」；我们的产品只能当「安全带 + 仪表」，不能当「遥控器把同事变成脚本」。**

### 2.2 Anthropic：Harness 是脚手架，且应随模型变强而删减

来源：[Harness design for long-running apps](https://www.anthropic.com/engineering/harness-design-long-running-apps)、[Harnessing Claude's intelligence](https://claude.com/blog/harnessing-claudes-intelligence)

可迁移思想：

1. **Harness = loop + tools + context + guardrails**，把智力变成能干活的 Agent。  
2. **「我还能停止做什么？」** —— 模型变强后，曾经 load-bearing 的脚手架会变死重（如 context reset）。  
3. **Generator ≠ Evaluator**：自夸问题靠分离评审；评审吃证据（Playwright/测试），不是吃自我叙述。  
4. **Handoff 用结构化产物**，不是灌全文对话。  
5. **只在任务压在模型能力边界时加脚手架**；边界内让模型自己跑。

### 2.3 Cursor：自主是拨盘，不是开关

来源：[Governing agent autonomy with Auto-review](https://cursor.com/blog/agent-autonomy-auto-review)、[Run modes](https://cursor.com/docs/agent/security/run-modes)

可迁移思想：

1. 低利害自由跑，越界才减速。  
2. **Block 优先反馈给 Agent 改道**，而不是立刻弹给人（减少打断、保留主动性）。  
3. 情境判断（同一命令在不同意图下风险不同）。  
4. 沙箱 + allowlist + 分类器分层，而不是全域审批。

### 2.4 与「对话编排烧 token」的关系

公开量级参照：单 Agent ~4× 普通聊天；多 Agent 编排可至 ~15×（Anthropic multi-agent research 讨论口径）。  
对策不是禁止多 Agent，而是：**编排与完成判定尽量不走 LLM**；对话只服务探索与门禁包。

---

## 3. 产品原则（硬约束）

### P1. Harness，不是 Jail
边界外：挡破坏性、越权、无证据宣称完成、聊天当 SoT。  
边界内：路径、工具选择、创造性拆解、涌现式方案 **默认自由**。

### P2. 对齐 Grok Bot，不另起炉灶哲学
默认假设 Bot 是自主队友；控制面增强「可审计交付」与「防乱撞」，不要求用户成为调度员。

### P3. 状态真源在仓，不在聊天
Goal / Assignment / Gate / Run / Evidence 落库（或工作流引擎）。聊天 = 通知层（门禁卡、例外、超时）。

### P4. 完成靠 Ready 谓词 + 证据，不靠自觉
口头 `done` 无效；证据可机器校验；矛盾时**规范化降级**（学 evidence-first）。

### P5. 打断是稀缺资源
仅 Gate、安全越界、预算耗尽、Ready 失败超 SLA 可打断决策人。进度汇报禁止进入决策主上下文。

### P6. 脚手架可退役
每个护栏标注「假设模型缺什么」；模型升级后复审删除（Anthropic 原则）。

### P7. 填充的是 Assignment，不是把一切叫 Goal
Goal = 稳定意图；Assignment = 填到执行池的一班；Run = 一次尝试；Gate = 硬停。

---

## 4. 领域模型

```
Goal（意图）
  ├── GateChain（交付门禁模板，如 G0–G5）
  ├── Assignment[]（填充到执行池）
  │     ├── PoolRef（Cursor 账号 / Cloud Agent 池 / Bot 组）
  │     ├── Brief（自包含任务包 / handoff artifact）
  │     ├── Risk / Budget / Concurrency
  │     └── Run[]（Attempt）
  └── EvidenceStore（artifact 指针、CI、截图、谓词结果）
```

### 4.1 Goal
跨班次仍成立的成果。字段：标题、范围、验收标准、门禁模板、决策人、优先级。

### 4.2 Assignment（真正的「填充单元」）
绑定执行池 + brief + 配额。一个 Goal 可扇出多个 Assignment（并行池）。  
**探索期允许 Bot 自行提议拆 Assignment**（保留涌现）；控制面只校验预算/风险策略，不规定唯一拆法。

### 4.3 Gate
硬停。进入：Ready 谓词为真。退出：人一次决策（pass/revise/defer）。  
Gate 卡片是决策人聊天里**唯一常规主路径**。

### 4.4 Run
一次 Cloud Agent / CLI / Bot 执行。失败可重试；不自动否定 Goal。回写产物与用量，不回写全文 transcript 到决策主会话。

### 4.5 Autonomy Dial（自主拨盘，学 Auto-review）

| 档位 | 行为 |
|------|------|
| Free | 边界内工具自由；只记审计 |
| Guided | 高风险动作分类器拦截 → **先让 Bot 改道** |
| Gated | 指定动作必须 Gate（发送外部消息、合并主线、花超预算） |
| Freeze | 暂停新 Run（事故模式） |

默认：**Guided**。不是把所有步骤编成死 BPMN。

---

## 5. 体验形态（B 为骨，A 为皮）

### 5.1 默认体验（对齐「消失的界面」）
- 决策人日常：只收 **Gate 卡** 与例外。  
- 协调 Bot（可选）：在控制面派 Assignment、看池子负载。  
- 执行 Bot：仍用自然语言干活，不感知「被管死」。

### 5.2 可选画布 / 看板（给需要的人）
- 节点：Goal、Gate、Pool 槽位。  
- 边：串行门禁 / 并行 Assignment。  
- **不是**把每句对话画成节点。

### 5.3 与 Grok Bot 官方「不做 assignment board」的调和
官方拒绝的是「让用户日常当调度员的板」。  
我们的板是：
1. **护栏配置面**（策略、谓词、池、预算）；  
2. **审计/复盘面**；  
3. 可由 **协调 Bot** 操作，人可不管。

---

## 6. 参考方案矩阵

| 参考 | 类型 | 可偷 | 慎用/避免 |
|------|------|------|-----------|
| [Loop Control Plane](https://github.com/BankNatchapol/Loop-Control-Plane) | 工程控制台 | Feature→Task、风险门、handoff 文件、CI 回写 | 过细列生命周期若强迫逐步确认会伤自主 |
| [builderz-labs/mission-control](https://github.com/builderz-labs/mission-control) | Agent 运营驾驶舱 | Assignment 生命周期、质量门、花费、多 runtime | 别变成纯任务工单系统替代 Bot 对话 |
| [CAPHTECH/state_gate](https://github.com/CAPHTECH/state_gate) | 外部状态机 | **证据提交模型**、Guard、审计、乐观锁 | 别把探索过程每一步都状态机化 |
| [graphed-orchestrator](https://github.com/graphed-org/graphed-orchestrator) | 确定性裁判 | Ready 纯函数、角色不互聊、红灯不能 APPROVE | 三角色冻结流水线不宜套所有探索任务 |
| Temporal HITL | 耐久工作流 | Gate 挂起零算力、Signal 审批、审计历史 | MVP 可用 DB 状态代替 |
| Cursor Cloud Agents API + control-tower | 执行面 | 多 Run 启停、跟进 | 控制面不要重做 IDE |
| Dify/Langflow/AutoGen Studio | 可视化编排 | 画布交互皮 | **不当骨**：易滑回对话图编排 |
| Anthropic harness / Cursor Auto-review | 思想 | 可删脚手架、拨盘自主、block→改道 | — |

**产品缝（机会）：** 多 Cursor 账号/Bot 组目标槽 + 交付门禁 + 聊天降级为通知 + **明确保留自主拨盘** —— 开源少见一体方案。

---

## 7. 系统架构（建议）

```
┌──────────────────────────────────────────────┐
│ UI：Gate 卡 / 可选画布 / 池与预算（通知可进 IM） │
├──────────────────────────────────────────────┤
│ Domain：Goal · Assignment · Gate · Run · Dial │
├──────────────────────────────────────────────┤
│ Ready Engine：谓词 + Evidence Store           │
├──────────────────────────────────────────────┤
│ Policy：风险分级 · 预算 · 改道反馈（学 Auto-review）│
├──────────────────────────────────────────────┤
│ Workflow：DB 状态机（MVP）→ 可选 Temporal      │
├──────────────────────────────────────────────┤
│ Adapters：Cursor Cloud API / Bot 消息 / CLI   │
└──────────────────────────────────────────────┘
```

### 7.1 运行时序（理想）

1. 建 Goal + 选门禁模板（可来自 G0–G5）。  
2. **协调 Bot 或人** 扇出 Assignment 到池；或执行 Bot **提议**拆分，控制面只做策略校验。  
3. Dispatch → Run；Bot 在 Dial 允许范围内自主推进。  
4. 产物/CI/证据入仓；transcript 不进决策主上下文。  
5. Ready 真 → Gate 卡；人拍板。  
6. 越界动作：分类器/策略 block → **反馈 Bot 改道**；改不了再升人。

### 7.2 Token 控制清单

- 进度禁止刷决策主会话  
- 跨 Bot 传 artifact 指针，不传全文  
- 完成判定零 LLM（谓词）  
- Gate 等待不唤醒编排模型  
- 短活不强制扇出；设最小工作量阈值  
- Dial=Guided 时 block 先改道，减少无效重试刷屏

---

## 8. MVP 路线

### MVP-1（验证护栏哲学）
- 数据模型四层 + Autonomy Dial  
- 单执行适配：Cursor Cloud Agents API（单账号）  
- 一个 Ready 谓词 + 一张 Gate 卡  
- 决策人聊天仅 Gate/例外  
**成功标准：** 同一任务对比「纯群聊编排」token 与误交付率下降，且执行 Bot 仍能自主换路径完成。

### MVP-2
- 多 Pool（第二 Cursor 账号或 Bot 组）  
- Assignment 槽位填充 UI（可给协调 Bot API）  
- Run 级花费记账  

### MVP-3
- 门禁模板（接入团队 G0–G5）  
- 可选交付画布  
- 证据包规范 + 规范化降级  

### 刻意延后
- 重型 BPMN  
- 全域逐步审批  
- 复刻完整 IDE  

---

## 9. 与现有技能/资产的关系

本用户侧已有：

- `工程操作系统 G0-G5`：门禁与通信预算（直接作 Gate 模板候选）  
- `交付节点升级`：按期交付、升级路径  

本方案把它们产品化为控制面对象，而不是再写一套聊天规矩。

---

## 10. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 护栏过厚 → 涌现消失 | Dial 默认 Guided；探索 Goal 可标记 `mode=explore` 放松谓词 |
| 用户又变调度员 | 默认协调 Bot 操作；人只看 Gate |
| 谓词过严 → 永远 Ready 不了 | 谓词可配置；失败要可诊断；允许 defer |
| 与 Grok Bot 体验冲突 | 遵循「消失的界面」；不强制盯计算机/看板 |
| 多账号安全 | Pool 凭证隔离；审计；Freeze 档 |

---

## 11. 开放问题（需决策人）

1. 第一客户场景：纯软件交付 / 还是 Grok Bot 多角色办公也要盖？  
2. 协调者默认是人、还是必须有「首席协调 Bot」？  
3. Gate 模板第一版是否直接采用 G0–G5？  
4. 多 Cursor 账号是个人额度池，还是团队共享池模型？  
5. 品牌名：Agent Delivery Harness / 交付护栏 / 其它？

---

## 12. 附录：关键链接

- https://x.ai/news/designing-grok-bot  
- https://x.ai/news/introducing-grok-bot  
- https://docs.x.ai/grok-bot/overview  
- https://www.anthropic.com/engineering/harness-design-long-running-apps  
- https://claude.com/blog/harnessing-claudes-intelligence  
- https://cursor.com/blog/agent-autonomy-auto-review  
- https://cursor.com/docs/cloud-agent/api/endpoints  
- https://github.com/BankNatchapol/Loop-Control-Plane  
- https://github.com/builderz-labs/mission-control  
- https://github.com/CAPHTECH/state_gate  
- https://github.com/graphed-org/graphed-orchestrator  

---

## 变更记录

| 版本 | 说明 |
|------|------|
| v0.1 | 首版研讨草案：harness 定位、领域模型、参考矩阵、MVP |
