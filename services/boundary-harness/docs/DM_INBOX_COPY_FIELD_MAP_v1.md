# Decision-maker Inbox copy / field map v1

Locked with `DECISION_MAKER_CLICK_FLOW_v1`. Primary UI uses these strings only.

## Shell

| Surface | Copy |
|---|---|
| Office title | AI办公室 |
| Office lede | 工作在推进。需要你拍板时，会进待办。 |
| Office → Inbox | 待我拍板 |
| Inbox top bar | 待办·n |
| Empty (office or inbox) | 现在没有需要你拍板的事。 |

## Card

| API / storage | Primary UI |
|---|---|
| `goal.title` / `goal_title` | Card title |
| `GateInstance.id` | Collapsed 详情 only |
| `predicate_id=deliver_ready_v1` | 验收标准：交付就绪 |
| `predicate_id=safety_only_v1` | 验收标准：安全审批 |
| `ready_at` | Relative Chinese time（刚刚 / N 分钟前） |
| `status=ready` | Badge 待你决定 |
| empty `missing[]` | Hidden |
| non-empty `missing[]` | 还差： + Chinese chips |
| `decision=pass` | 通过 → 已通过。 |
| `decision=revise` | 打回重做 → 已打回重做。 |
| `decision=defer` | 稍后处理 → 已稍后处理。 |
| HTTP 409 / `optimistic_lock` | 这条已有人处理，已为你刷新 |

## Missing chip labels

| `missing[]` key | Chip |
|---|---|
| `authority_escalation:destructive_delete` | 破坏性删除 |
| `authority_escalation:external_send` | 对外发送 |
| `authority_escalation:protected_merge` | 受保护合并 |
| `authority_escalation:over_budget` | 超预算 |
| `authority_escalation:privilege_escalation` | 提权 |
| `run_lifecycle:FINISHED` | 运行尚未结束 |
| `evidence:summary_md` | 摘要 |
| `evidence:artifact_uri` | 产物 |

Unknown keys fall back to the raw code inside the chip (sr-only / collapsed), never as the card title.

## Forbidden on the decision-maker path

Health, OpenAPI, Outbox table, role dropdown, `dm-1`, Reload ready, `M2-preview`, `GateInstances`, `status=ready`, `missing[]`, `READY v1`.
