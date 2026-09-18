# Boundary Harness 权威 PRD v1.0-DRAFT（待 harness 组签核）

> **Superseded.** Use [`BOUNDARY_HARNESS_PRD_AUTHORITATIVE_v1.md`](./BOUNDARY_HARNESS_PRD_AUTHORITATIVE_v1.md) (**AUTHORITATIVE** — team signed; pending decision-maker/user final confirm). This draft is kept for history only.

**状态：** SUPERSEDED — 已被 AUTHORITATIVE v1 替代  
**产品名：** Boundary Harness（边界线束）  
**口号：** 约束爆炸半径，不约束智能本身  

---

## 1. 愿景

为 Grok Bot / Cursor 等自主 Agent 提供**独立微服务控制面**：在保留自主与涌现的前提下，解决「聊天当状态真源、完成态模糊、多账号/多 Bot 填充混乱、token 浪费」问题。

## 2. 非目标

- 不替代 Grok Bot / Cursor 运行时  
- 不做对话图式工作流引擎  
- 不以画布/看板为用户主调度台  
- 不全域逐步审批  

## 3. 用户与角色

| 角色 | 诉求 |
|------|------|
| 决策人 | 只看 Gate/例外，少打断 |
| 协调 Bot | 建 Goal、扇出 Assignment、盯预算 |
| 执行 Bot/Cursor Agent | 边界内自主完成，用 MCP/API 回写证据 |
| 观察者 | 只读投影与审计 |

## 4. 核心对象

- **Goal**（mode: explore|deliver）  
- **Assignment**（唯一填充单元：pool + brief）  
- **Gate**（Ready 谓词 + 人决策）  
- **Run**（一次尝试）  
- **Evidence**（可验证产物指针）  

## 5. 行为规则（规范性 — MUST）

1. MUST 以 DB 为 SoT；MUST NOT 以聊天记录为完成依据。  
2. MUST 默认仅 coordinator 扇出 Assignment；人扇出 MUST 为 Gate 级例外。  
3. Brief MUST NOT 含步骤脚本字段。  
4. Guided Dial MUST 仅拦截白名单高风险；换路径/建文件/提议 Assignment MUST NOT 列为高风险。  
5. Block MUST 先改道反馈 Runtime；连续失败才升人。  
6. 启动 Run MUST NOT 依赖打开画布。  
7. API MUST 区分 authority_gate 与 advisory_hint。  
8. explore Goal MUST 允许空/仅安全门禁链。  

## 6. 集成

- **出站：** Cursor Cloud Agents API  
- **入站（Bot）：** MCP tools → Harness HTTPS  
- **事件：** GitHub webhook、SSE/Webhook 通知  

## 7. UX

- 主界面：Roster + Gate Inbox + 产物/对话时间线  
- 次级：只读 canvas/kanban 投影  

## 8. MVP 范围

M0 骨架 → M1 Cursor+Dial → M2 Inbox+GitHub → M3 Bot 协作增强（详见技术实现方案）

## 9. 成功指标

- 决策主会话 token / 无效进度消息下降  
- Gate 误报/漏报可度量  
- 执行任务在 Dial 内自主完成率  
- brief 违规（steps）拦截率 100%  

## 10. 签核栏（研讨后填写）

| 角色 | 意见 | 签核 |
|------|------|------|
| HarnessTechLead | | |
| HarnessBackend | | |
| HarnessBridge | | |
| HarnessReady | | |
| 产品方案评审 | | |
| 决策人（用户） | | |

