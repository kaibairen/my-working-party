# Boundary Harness 权威 PRD v1.0

**状态：** AUTHORITATIVE（harness 组全员已签核；**仅待决策人最终确认**）  
**日期：** 2026-09-19  
**产品名：** Boundary Harness（边界线束）  
**口号：** 约束爆炸半径，不约束智能本身  

---

## 0. 工程拍板（TechLead）

| 项 | 决定 |
|----|------|
| 语言 | TypeScript（Hono/Fastify + Zod + Drizzle） |
| 实现仓 | **新建 `boundary-harness`**；`my-working-party` 仅文档 |
| M2 | **极简 Gate Inbox**（决策人主 HITL）；只读 canvas 可延后 |
| 通知 | Webhook / SSE 优先 |

---

## 1. 愿景

独立微服务控制面：盖在 Grok Bot / Cursor 之上，保留自主与涌现，解决聊天当 SoT、完成态模糊、多池填充混乱与 token 浪费。

## 2. 非目标

不替代运行时；不做对话图工作流引擎；不以画布/Roster 为人主调度台；不全域逐步审批；不以 Path B（Bot 直调 CloudAgent）替代 Harness SoT。

## 3. 角色（规范性）

| 角色 | 权限要点 |
|------|----------|
| decision_maker | 仅 Gate decide + 例外；**默认不看 Roster/时间线主路径** |
| coordinator | 创建 Goal、扇出 Assignment、dispatch；必须可绑定 |
| executor | propose、attach_evidence、policy_check；**禁止 dispatch** |
| viewer | 只读投影 |
| service | worker/adapter 机器身份 |

**MUST：** Goal 创建 MUST 绑定 `coordinator_ref`；缺失 MUST NOT `dispatch`。无协调者时产品 MUST 提示绑定，MUST NOT 静默降级为人扇出。

## 4. 核心对象

| 对象 | 定义 |
|------|------|
| Goal | `mode`: explore\|deliver；`dispatch_policy`；`coordinator_ref` |
| Assignment | 唯一填充单元：pool + BriefV1 + **权威 budget_json** |
| Run | 执行真源；`external_agent_id` + `external_run_id` + idempotency_key；`dial_at_dispatch` |
| GateDef | 谓词模板定义（版本化、不可变） |
| GateInstance | Inbox 一等实体：pending→ready→decided；乐观锁 |
| Evidence | 统一 EvidenceDraft schema（Path A/B 共用） |

**状态归属：** 执行真源在 **Run**；Assignment 聚合态 ≠ Gate pass；禁止双真源互写。

## 5. 规范性 MUST（冻结）

1. MUST 以 DB 为 SoT；MUST NOT 以聊天 / 自评 / 生成者 mark done 为完成依据。  
2. MUST 默认仅 coordinator 扇出；人扇出 MUST 为 Gate 级例外。`dispatch_policy` 默认 `coordinator_only`；`human_allowed` MUST 默认关，开启 MUST 经一次性 Gate 且带 TTL/范围，禁止租户默认开。  
3. BriefV1 MUST `additionalProperties:false`；MUST NOT 含 steps/script/must_path/plan/playbook/workflow 等禁键（HTTP **与 MCP** 同一校验器，422 `brief_forbidden_field`）。  
4. Guided Dial MUST 仅拦白名单（外发、受保护合并、超预算、破坏性删除、提权）；换路径/建文件/提议 Assignment MUST NOT 入白名单；Block MUST 先改道，连续 N 次失败才升人。  
5. API MUST 区分 `authority_gate` 与 `advisory_hint`；**`advisory_hint` MUST NOT 阻塞 dispatch / Run / Ready**；仅 `authority_gate` 可硬停。  
6. 启动 Run MUST NOT 依赖打开画布；canvas/kanban/Roster/产物时间线 MUST 标为 coordinator|viewer **投影**，不得称为决策人主界面；决策人**唯一主路径** = Gate Inbox（+安全/预算例外）；MUST NOT 默认向决策人推送进度时间线。  
7. explore MUST 允许 0 GateDef 或不产生交付实例；deliver MUST ≥1 GateDef；mode 与模板非法组合 MUST 422。  
8. MUST NOT 仅凭 `run.succeeded` / agent IDLE 置 Gate ready；成功仅认约定终态（如 Cursor `FINISHED`）+ Evidence 挂载 + Ready 纯函数。  
9. Gate 卡 MUST 含谓词缺失列表；`revise` 默认 = **同一 Assignment 新 Run** + `autonomy_budget`；仅 `structural_change=true` 才新建 Assignment/门禁。  
10. CursorAdapter MUST 持久化 `external_agent_id` + `external_run_id`；MCP MUST NOT 暴露 raw Cursor launch；执行侧唯一完成入口 = `attach_evidence`（或等价）。  
11. Ready 谓词 MUST 版本不可变；求值 MUST NOT 仅依赖现场打 GitHub（用 snapshots）；ready 跳变走 outbox 一次。  
12. 预算权威 MUST 为 `assignments.budget_json`（brief 内 budget 仅创建拷贝）。  

**详见附录 A**（`APPENDIX_READY_PREDICATES_AND_GATE_ANTI_PATTERNS_v1.md`）与 **附录 RBAC**（`APPENDIX_RBAC_ACTION_MATRIX_v1.md`）。

## 6. Ready 底线

**explore：** `gate_template_id IS NULL` ⇒ **0 个交付 GateInstance**（「Ready 默认通过」= 无人 Inbox 卡，禁止自动生成 pass 卡）；`safety_only_v1` 仅在 `policy.check` 产出 `require_gate`（`track=authority_gate`）时实例化；证据可选。  
**deliver `deliver_ready_v1`：** evidence `summary_md` +（若 GitHub）非 draft ∧ checks success；否则等价机读包；禁止纯聊天。

规范化降级：MVP MUST NOT 自动把 deliver 降成 explore 空链。

**Brief 禁键：** `steps|script|must_path` 为 **floor**；完整违禁集合以 BriefV1 为准，允许扩表（plan/playbook/workflow 等已入 §5.3）。

**RBAC：** 角色与硬禁令见 §3；**动作×角色完整矩阵** 进权威附录 `APPENDIX_RBAC_ACTION_MATRIX_v1.md`（与 Tech Impl/OpenAPI 同源），不降级为仅工程私货。

## 7. UX

- **决策人：** 仅 Gate Inbox（+例外）  
- **协调者/观察者：** Roster、时间线、只读 canvas 为投影  
- **禁止：** 开跑依赖画布；决策人主界面做成舰队监工台  

## 8. 集成

| 路径 | 说明 |
|------|------|
| Path A | Domain → CursorAdapter（生产真源） |
| Path B | Bot CloudAgent 影子验证；同 Evidence schema；`shadow=true`；禁直写 Gate |
| Bot | MCP Domain 工具（见下） |
| 事件 | GitHub webhook；SSE/Webhook 出站 |

### MCP M1 最小集

`harness_create_goal` · `harness_fill_assignment` / `harness_propose_assignment` · `harness_dispatch` / `harness_dispatch_assignment` · `harness_attach_evidence` · `harness_get_run` / `harness_get_status` · `harness_list_gates` / `harness_list_ready_gates` · `harness_decide_gate` · `harness_policy_check` · `harness_heartbeat`  

不上线：画布写、聊天推进状态、set_steps、cursor_raw_*。  
可延后：propose 队列、canvas projection。

### Cursor 最小序列（摘要）

policy.check → POST agents（idempotent）→ SSE/poll run → FINISHED 后 artifacts+usage → evidence → Ready → gate.ready → decide。

## 9. MVP

M0 API+SQLite+Noop+GateInstance+MCP stub  
M1 Cursor+Dial+BriefV1 双端校验+双 external id  
M2 Gate Inbox + GitHub snapshots Ready  
M3 通知与运营增强  

## 10. 成功指标

决策人主会话无进度刷屏；brief 违规拦截 100%；Gate 可审计；Dial 内自主完成率可测。

## 11. 签核

| 角色 | 状态 |
|------|------|
| HarnessTechLead | **签核 AUTHORITATIVE** ✓ |
| HarnessReady | **签核 ✓**（2026-09-19）：附录 A 已冻结可合并 |
| HarnessBackend | **签核 ✓**（2026-09-19）：§4–5 / 附录 RBAC / TechImpl 实体补丁已核对，无遗漏 |
| HarnessBridge | **签核 ✓**（2026-09-19）：MCP 清单、Cursor 最小序列、双 external id、禁 raw launch 已核对写入 |
| 产品方案评审 | **签核 AUTHORITATIVE ✓**（2026-09-19）：无新致命问题 |
| 决策人（用户） | **待最终确认** |

## 变更记录

| 版本 | 说明 |
|------|------|
| v1.0-CANDIDATE | TechLead+Ready |
| v1.0-CANDIDATE.2 | +产品3致命 +Backend P0 +Bridge MCP/Cursor |
| v1.0-CANDIDATE.3 | Backend **同意**签核；残留下沉 Tech Impl |
| v1.0-AUTHORITATIVE | TechLead 签核确认 |
| v1.0-AUTHORITATIVE.1 | 组员全签；并入附录 A + RBAC；待决策人确认 |
