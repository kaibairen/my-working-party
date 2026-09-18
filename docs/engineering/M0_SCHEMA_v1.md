# Boundary Harness M0 Schema v1（Backend 放行稿）

> 对齐权威 PRD §4–5、TechImpl 实体补丁、APPENDIX_RBAC。  
> 栈：TS + Drizzle + SQLite（MVP）→ Postgres。  
> **状态：HarnessBackend 签核放行 · 2026-09-19**  
> 开 Domain API / migration 以此为冻结面；改字段须 bump schema_version。

`schema_version = 1`

## 表

### pools
| 列 | 类型 | 约束 |
|----|------|------|
| id | text | PK |
| kind | text | `cursor_account\|bot_group\|noop` |
| secret_ref | text | 非空；API 永不回显明文 |
| created_at | timestamptz | not null |

### goals
| 列 | 类型 | 约束 |
|----|------|------|
| id | text | PK |
| title | text | not null |
| mode | text | `explore\|deliver` |
| dispatch_policy | text | 默认 `coordinator_only`；可选 `human_allowed` |
| coordinator_ref | text | not null（缺则禁止 dispatch） |
| gate_template_id | text | nullable；explore 可空 |
| status | text | `active\|archived\|…` |
| created_by | text | not null |
| created_at / updated_at | timestamptz | |

### gate_defs
| 列 | 类型 | 约束 |
|----|------|------|
| id | text | PK |
| goal_id | text | FK goals |
| predicate_id | text | FK ready_predicates.id |
| predicate_version | int | not null |
| ordinal | int | deliver 链顺序 |
| on_fail | text | `keep_pending\|open_revise_hint` |

### gate_instances
| 列 | 类型 | 约束 |
|----|------|------|
| id | text | PK（Inbox / decide 唯一 id） |
| goal_id | text | FK |
| gate_def_id | text | FK gate_defs |
| status | text | `pending\|ready\|decided\|cancelled` |
| ready_at / decided_at | timestamptz | |
| ready_result_json | text/jsonb | `{ok, missing[], predicate_id, predicate_version, evaluated_at}` |
| version | int | 乐观锁；decide `WHERE status='ready' AND version=?` → 冲突 409 |

### assignments
| 列 | 类型 | 约束 |
|----|------|------|
| id | text | PK |
| goal_id | text | FK |
| pool_id | text | FK pools |
| brief_json | text/jsonb | BriefV1；`additionalProperties:false` |
| budget_json | text/jsonb | **预算权威** |
| status | text | `proposed\|accepted\|queued\|in_progress\|succeeded\|failed\|cancelled`（in_progress/succeeded 由服务端派生，禁客户端直写终态语义冒充 Gate） |
| risk | text | optional |
| created_at / updated_at | timestamptz | |

### runs
| 列 | 类型 | 约束 |
|----|------|------|
| id | text | PK |
| assignment_id | text | FK |
| adapter | text | `noop\|cursor\|…` |
| external_agent_id | text | nullable |
| external_run_id | text | nullable |
| idempotency_key | text | not null |
| dial_at_dispatch | text | `free\|guided\|gated\|freeze` 快照 |
| status | text | `queued\|dispatched\|running\|succeeded\|failed\|cancelled` |
| usage_json | text/jsonb | |
| error | text | |
| created_at / updated_at | timestamptz | |
| UNIQUE(assignment_id, idempotency_key) | | |

### evidence_items
| 列 | 类型 | 约束 |
|----|------|------|
| id | text | PK |
| run_id | text | FK nullable |
| goal_id / assignment_id | text | 索引 |
| kind | text | EvidenceKind：`pr\|report_md\|summary_md\|screenshot\|ci_check\|artifact_uri` |
| uri | text | not null |
| sha256 | text | optional |
| shadow | bool | Path B 标记；禁直写 Gate |
| created_at | timestamptz | |

### ready_predicates
| 列 | 类型 | 约束 |
|----|------|------|
| id | text | PK 逻辑名 |
| version | int | PK 合成；不可变 |
| dsl_json | text/jsonb | all/any 树 |
| created_at | timestamptz | |
| PRIMARY KEY (id, version) | | |

### github_snapshots
| 列 | 类型 | 约束 |
|----|------|------|
| id | text | PK |
| goal_id / assignment_id | text | |
| pr_number | int | |
| is_draft | bool | |
| checks_conclusion | text | |
| raw_hash | text | |
| observed_at | timestamptz | |

### gate_decisions
| 列 | 类型 | 约束 |
|----|------|------|
| id | text | PK |
| gate_instance_id | text | FK |
| decision | text | `pass\|revise\|defer` |
| structural_change | bool | 默认 false（revise→同 Assignment 新 Run） |
| note | text | |
| actor | text | decision_maker |
| created_at | timestamptz | 只追加 |

### exception_grants
| 列 | 类型 | 约束 |
|----|------|------|
| id | text | PK |
| goal_id | text | FK |
| grantee | text | 人/身份 |
| scope | text | 如 `fill_assignment` |
| expires_at | timestamptz | |
| max_uses / used | int | |
| created_from_gate_instance_id | text | |
| created_at | timestamptz | |

### policy_events / audit_log / outbox
- policy_events：dial block/redirect/escalate；含 `track`、fail_count  
- audit_log：只追加  
- outbox：`type,payload,created_at,published_at`（gate.ready 等 at-least-once）

## BriefV1（Zod 同源）
```
{
  outcome: string,
  constraints: string[],
  evidence_shape: EvidenceKind[]  // min 1
}
additionalProperties: false
// budget 禁止持久化进 brief；写入 assignments.budget_json
rejected_keys → 422 brief_forbidden_field:
  steps|script|must_path|plan|playbook|workflow|procedure|ordered_steps|runbook|howto|must_files
```

## 放行条件（已满足）
- [x] TechLead 四问全是  
- [x] H1–H8 锁定  
- [x] RBAC 附录存在  
- [x] Backend 签核  

**下一步：** `boundary-harness` 仓内 `packages/domain` Drizzle migration = 本文件；OpenAPI `/v1` 与表同步后才合 Domain API。
