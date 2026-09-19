# Grok Bot 约束验证 + my-working-party Dogfood

日期：2026-09-19 Asia/Shanghai

## 目标纠偏
核心：约束 **Grok Bot**（Dial/Ready/Gate + 强制 Harness MCP）。
Cursor Cloud Agents = 执行池之一，不是替代。

## 验证清单（Grok Bot）
1. MCP `tools/list` 只有 `harness_*`，无 `cursor_raw_*`
2. `POST /v1/goals/.../assignments` brief 含 `steps` → **422** `brief_forbidden_field`
3. Bot 经 MCP/`attach_evidence` 写出证据 → deliver Gate ready → 决策人 Inbox Pass
4. 缺口记录：Bot 仍可用非 Harness 工具（浏览器等）时，约束不完整 → 需组默认装 connector + 流程纪律

## Dogfood 模式（后续优化）
仓：`kaibairen/my-working-party` → `services/boundary-harness/`
循环：使用（真实 Goal/Gate）→ 发现问题 → PR 修 → 再使用
组频道：`harness开发` / `harness组研讨`
