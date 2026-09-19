# M0 Security 冻结面 v1（TechLead）

Canonical copy also lives at repo-root [`docs/engineering/M0_SECURITY_FREEZE_v1.md`](../../../docs/engineering/M0_SECURITY_FREEZE_v1.md).

> 写入 M0 OpenAPI / Tech Impl；口头约定无效。  
> 2026-09-19

## 1. Webhook HMAC

| 项 | 冻结值 |
|----|--------|
| 算法 | **HMAC-SHA256** |
| 签名头 | `X-Harness-Signature: sha256=<hex>` |
| 时间戳头 | `X-Harness-Timestamp: <unix_seconds>` |
| 签名载荷 | `{timestamp}.{raw_body}` |
| 时钟 skew | **±300s**；超窗 → **401** `webhook_skew` |
| 验签失败 | **401** `webhook_bad_signature` |
| 密钥 | `WEBHOOK_SIGNING_SECRET`（经 secret 挂载，不明文日志） |

## 2. Freeze

| 项 | 冻结值 |
|----|--------|
| API | `POST /v1/admin/freeze` body `{ "enabled": bool, "reason"?: string }` |
| 读 | `GET /v1/admin/freeze` |
| 角色 | 仅 `decision_maker` 或 `service` |
| 生效 | `enabled=true` 时 **拒绝新 dispatch**（含 MCP dispatch） |
| 拒绝码 | HTTP **423**，`code=freeze_active` |
| 已跑 Run | 不强制杀；可 cancel 另议（M0 不自动杀） |

## 3. audit_log（只追加）

列：`id` · `at` · `actor_sub` · `actor_role` · `action` · `resource_type` · `resource_id` · `request_id` · `payload_json`（脱敏）  

禁止 UPDATE/DELETE；无软删。

## 4. JWT claims（进附录，与 RBAC 同源）

必含：`sub` · `role`（enum）· `pool_ids`（string[]）· `iat` · `exp`  
可选 M0：`tid`（租户，单租可省略）  
跨 `pool_ids` 操作 → **403** `pool_forbidden`

## 5. secret_ref URI（M0）

允许：
- `file:/abs/or/mounted/path`
- `env:VAR_NAME`

延后：`sops:` / 云 KMS URI  

API **永不**回显解析后的明文；仅存/回 `secret_ref` 字符串。

## 6. Dial 白名单（复述，防过宽）

authority 仅：`external_send` · `protected_merge` · `over_budget` · `destructive_delete` · `privilege_escalation`  
换路径/建文件/提议 Assignment **不得**入白名单。
