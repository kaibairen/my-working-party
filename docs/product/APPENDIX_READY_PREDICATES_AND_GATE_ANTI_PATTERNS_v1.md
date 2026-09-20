# 附录 A：Ready 谓词与 Gate 反模式（权威冻结稿）

**状态：** 可并入 `BOUNDARY_HARNESS_PRD_AUTHORITATIVE` 附录  
**冻结依据：** HarnessTechLead 拍板 5 MUST（2026-09-19）+ HarnessReady 验收底线 + Backend C 节补丁对齐  
**版本：** v1.0  
**时区标注：** Asia/Shanghai

---

## A0. 规范性前提（TechLead 5 MUST — 全文冻结）

下列条文为本附录求值与验收的上位法；与之冲突的实现 MUST NOT 合并。

1. MUST 以 DB 为 SoT；MUST NOT 以聊天记录为完成依据。  
2. MUST 默认仅 coordinator 扇出 Assignment；人扇出 MUST 为 Gate 级例外。  
3. Brief MUST NOT 含 `steps` / `script` / `must_path`（及 BriefV1 扩展违禁键）；违者 API **422** `brief_forbidden_field`。  
4. Guided Dial MUST 仅拦截白名单高风险；换路径 / 建文件 / 提议 Assignment MUST NOT 列为高风险；Block MUST 先改道反馈 Runtime，连续失败才升人。  
5. API MUST 区分 `authority_gate` 与 `advisory_hint`；启动 Run MUST NOT 依赖打开画布；explore Goal MUST 允许空门禁链或仅安全门。

---

## A1. 通用求值规则

1. Ready 求值器 MUST 为**纯函数**：输入 = 不可变 `ready_predicates` 版本 + `github_snapshots`（若适用）+ `evidence_items`；MUST NOT 在求值瞬间现场请求 GitHub。  
2. 口头 done、自评成功、聊天截图、仅 `runs.status=succeeded`：**一律不得**使 GateInstance 进入 `ready`。  
3. 谓词失败 MUST 返回机读缺失列表 `ready_result_json.missing[]`，供改道；MUST NOT 用进度刷屏替代。  
4. `gates.status` 迁移：`pending → ready` **仅当**谓词 `ok=true`，且只跳一次并 outbox `gate.ready`（至少一次投递 + 消费者幂等）。  
5. 「规范化降级」MVP：仅允许 GateDef 配置 `on_fail: keep_pending | open_revise_hint`；**禁止**自动把 deliver 谓词降成 explore 空链。  
6. EvidenceKind（MVP 冻结）：`pr` | `report_md` | `summary_md` | `screenshot` | `ci_check` | `artifact_uri`。  
7. 绑定 GateDef 时：谓词所需 `kinds` MUST ⊆ 该 Goal 下 Assignment `evidence_shape` 并集（或 Goal 默认 shape）；否则 **422** `predicate_evidence_mismatch`（机读 `missing_kinds`；不得放松 ⊆ 规则）。

---

## A2. `ready_predicates` 冻结定义

### A2.1 `safety_only_v1`（explore 安全门）

**适用：** `goals.mode=explore` 且选择「仅安全门」（非 0 行空链时）。

**语义：** 不证明交付完成；仅在 authority 越界 / 需人拍板的安全例外时，允许产生 GateInstance。

```json
{
  "id": "safety_only_v1",
  "version": 1,
  "all": [
    {
      "type": "policy_clearance",
      "require": "no_open_authority_escalation"
    }
  ]
}
```

**机器规则：**

| 规则 | 条文 |
|------|------|
| 空链 | `mode=explore` ∧ `gate_template_id IS NULL` ∧ 未开 `safety_gate` ⇒ GateDef 可为 **0 行**；MUST NOT 产生交付类 GateInstance |
| 安全门 | `safety_gate=true` ⇒ 插入唯一 GateDef(`predicate_id=safety_only_v1`)；仅当 Dial/`policy.check` 产出 `require_gate`（`track=authority_gate`）时实例化 |
| 禁止 | explore MUST NOT 默认绑定 `deliver_ready_v1` 或全量 G0–G5 交付模板 |
| 证据 | explore 可附着 evidence，但 **不**作为继续探索的阻塞条件（安全门触发除外） |

**`policy_clearance` 求值输入（MVP）：** 不存在未关闭的 `policy_events` 且 `decision=require_gate|deny` 且 `track=authority_gate` 的开放升级；或已有对应 `gate_decisions` 结案。

---

### A2.2 `deliver_ready_v1`（交付 Ready 底线）

**适用：** `goals.mode=deliver`；创建 Goal 时 MUST 至少 1 个 GateDef，否则 **400**。

```json
{
  "id": "deliver_ready_v1",
  "version": 1,
  "all": [
    {
      "type": "evidence_present",
      "kinds": ["summary_md"]
    },
    {
      "type": "any",
      "of": [
        {
          "type": "all",
          "items": [
            { "type": "github_pr", "is_draft": false },
            { "type": "github_checks", "conclusion": "success" }
          ]
        },
        {
          "type": "all",
          "items": [
            { "type": "evidence_present", "kinds": ["artifact_uri"] },
            { "type": "noop_or_offline_contract", "ok": true }
          ]
        }
      ]
    }
  ]
}
```

**机器规则：**

| 规则 | 条文 |
|------|------|
| 底线 | `summary_md` MUST 存在且指向 DB 内可解引用 URI/blob |
| 有 GitHub 绑定 | `is_draft==false` ∧ `checks_conclusion==success`（读自 `github_snapshots`，非实时 API） |
| 无 GitHub / Noop 路径 | MUST 同时满足 `artifact_uri` + `noop_or_offline_contract.ok`（M0 Noop 契约证明）；MUST NOT 用聊天文本替代 |
| 禁止单条件 | 单独 `runs.status=succeeded`、单独 `ci_check`、单独截图 → MUST NOT `ok` |
| Assignment≠Gate | Assignment/`Run` 成功 MUST NOT 隐含 Gate `pass` |

**可选扩展（非 MVP 冻结，须新 `predicate_id` 版本）：** 追加 `report_md`、`screenshot`、映射 G3/G4 的模板变体；不得原地改写 `deliver_ready_v1` version=1 语义。

---

## A3. `gate_anti_patterns`（验收硬挡）

凡命中下列任一模式，HarnessReady / 合并评审 MUST **打回**，不得用「先上线再改」绕过。

| ID | 反模式 | 为何致命 | 正确替代 |
|----|--------|----------|----------|
| AP-01 | Brief / Skill 含步骤剧本或违禁键 | 扼杀涌现；「按步骤做完」冒充 Ready | BriefV1 + 422；Skill 只写何时调用与证据形态 |
| AP-02 | 将 `advisory_hint` / `redirect_hint` 升格为 `authority_gate` 或强制工序 | 控制面变 jail；人习惯口头勾选 | 响应带 `track`；advisory MUST NOT 产 GateInstance、MUST NOT 阻塞 dispatch |
| AP-03 | 聊天 / 自评 / 生成者 mark done 作为完成 SoT | 口头 done 复活 | 仅 DB 证据 + Ready 纯函数 |
| AP-04 | Gate 过密：换路径、建文件、提议 Assignment、非白名单探索也弹人 | 人成微观调度 → 口头放行 | 仅白名单高风险 + Ready 真 + 连续改道失败升人 |
| AP-05 | explore 套用 deliver 全闸 / 空谓词却自动 merge | 无涌现或无闸交付 | explore：0 行或 `safety_only_v1`；deliver：`deliver_ready_v1` |
| AP-06 | 画布/看板为 dispatch 前置；人默认可扇出 | 用户变总调度 | canvas 只读投影；扇出 `coordinator_only`；人扇出=Gate 例外 |
| AP-07 | 自评分或无独立 evidence kinds 即绿 | 口头 done 的机读马甲 | 见 `deliver_ready_v1` 底线 |
| AP-08 | Gate 卡无 `missing[]`，只有「请批准」 | 决策人无法一枪判断 | Ready 失败必带缺失列表；Inbox 只收 `status=ready` |
| AP-09 | 求值时现场打 GitHub / 无谓词版本 | Inbox 闪烁、改写历史 Ready | 快照表 + 不可变 `ready_predicates(version)` |
| AP-10 | 自动把 deliver 谓词降成 explore 空链 | 交付无闸偷渡 | 仅 `keep_pending` / `open_revise_hint` |

**白名单高风险（Dial authority，与 AP-04 对齐，MVP 冻结枚举）：**  
`external_send` | `protected_merge` | `over_budget` | `destructive_delete` | `privilege_escalation`

---

## A4. Gate 场景矩阵（该弹人 / 不该弹人）

| 场景 | 弹人？ | 依据 |
|------|--------|------|
| `deliver_ready_v1` 为真 | 是 → Inbox `ready` | 稀疏 HITL |
| Dial `require_gate` 且 `track=authority_gate` | 是 | MUST 4/5 |
| 连续 redirect 达阈值仍失败 | 是（升人） | MUST 4 |
| 改范围 / 改已锁判断 / 发布上线 | 是 | 决策人专属 |
| 人请求扇出 Assignment | 是（Gate 例外）或已 `human_allowed` | MUST 2 |
| 换路径 / 建文件 / 提议 Assignment | **否** | MUST 4 |
| `advisory_hint`、进度、peer receipt | **否** | MUST 1/5 |
| explore 常规探索（无 authority 升级） | **否** | MUST 5 + A2.1 |

---

## A5. 验收反例（CI / 评审用例名建议）

1. `reject_brief_with_steps_422`  
2. `advisory_hint_never_creates_gate`  
3. `chat_done_never_ready`  
4. `run_succeeded_alone_never_ready`  
5. `explore_null_template_zero_gatedef`  
6. `explore_must_not_default_deliver_ready`  
7. `deliver_requires_summary_md`  
8. `noop_path_needs_artifact_and_contract`  
9. `canvas_not_required_for_dispatch`  
10. `human_dispatch_forbidden_without_exception`

---

## A6. 签核

| 角色 | 意见 | 签核 |
|------|------|------|
| HarnessTechLead | 5 MUST 已拍板，本附录与之冻结 | （研讨合并时勾） |
| HarnessReady | 同意本附录为验收上位口径 | 同意 · 2026-09-19 |
| HarnessBackend | 对齐 C 节存储/求值（实现跟进） | |
| HarnessBridge | 对齐 evidence 回写与 brief 禁键 | |
| 决策人（用户） | | |

---

## 变更记录

| 版本 | 说明 |
|------|------|
| v1.0 | 首版：`safety_only_v1` + `deliver_ready_v1` + `gate_anti_patterns` AP-01..10，与 TechLead 5 MUST 一并冻结 |
