# 附录：RBAC 动作×角色矩阵 v1

> 权威 PRD 引用；与 OpenAPI/Tech Impl 同源。TechLead 拍板：进权威附录。

| 动作 | decision_maker | coordinator | executor | viewer | service |
|------|----------------|-------------|----------|--------|---------|
| create Goal | 可 | 可 | 否 | 否 | 否 |
| fill/扇出 Assignment | 否（除非 exception_grant / human_allowed） | 可 | 否（仅 propose） | 否 | 否 |
| dispatch | 否 | 可 | **禁止** | 否 | 可（worker） |
| propose Assignment | 否 | 可 | 可 | 否 | 否 |
| attach_evidence | 可（Bearer 人兜底；audit human） | 可（Bearer 人兜底或 MCP） | 可（须 MCP） | 否 | 可（须 MCP） |
| policy_check | 可 | 可 | 可 | 否 | 可 |
| list ready GateInstance | 可 | 可 | 否 | 可 | 可 |
| decide GateInstance | **可** | 否 | 否 | 否 | 否 |
| 读投影/canvas | 默认可关 | 可 | 可 | 可 | 可 |

人扇出：仅 `dispatch_policy=human_allowed`（默认关，须一次性 Gate+TTL）或 `exception_grant`。

## JWT claims（M0 Security freeze · 与 RBAC 同源）

必含：`sub` · `role`（上表五角色 enum）· `pool_ids`（string[]）· `iat` · `exp`  
可选 M0：`tid`（租户，单租可省略）  
跨 `pool_ids` 操作 → **403** `pool_forbidden`（禁止别名 `pool_scope_denied`）。
