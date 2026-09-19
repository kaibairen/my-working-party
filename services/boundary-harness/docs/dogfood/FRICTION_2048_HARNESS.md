# Dogfood 摩擦 · 2048 × Boundary Harness

**日期：** 2026-09-19  
**路径：** Goal → 填充槽 → dispatch → Evidence → Gate（待我拍板）  
**产物：** `examples/2048/`（决策人打开 `/examples/2048/`）

这一局是用来咬自己产品的：办公室必须能看见「谁在填 / 工位在哪一组」，不能靠假同事墙装忙。下面是真实卡住的点，以及本刀已做 / 还没做的修法。

## 这一局实际怎么走

1. 决策人在 `/` 建目标：「做一个能玩的 2048」。  
2. 协调者或执行池填槽（`pool_noop` / `pool_cursor`）。  
3. dispatch 开跑（办公室右侧**不能**变成派工台）。  
4. 把可打开的页当作 Evidence（`artifact_uri` → `/examples/2048/`）。  
5. 待办抽屉里拍板：玩两下，过或打回。

## 卡住什么

| 摩擦 | 现象 | 为什么痛 | 拟修 / 本刀 |
|------|------|----------|-------------|
| MCP 手套没挂上 Bot | Bot 直打 `:8080` → `mcp_entry_required`；或桌面根本没有 `harness_*` | 填充 / 心跳 / 证据都走不了，人只能 curl 代跑，办公室看起来像死的 | **未做 OS 级强挂。** SOP 仍要求 HTTP 手套 `:8787/mcp`。每个执行 Bot 必须自带手套，缺了就不要假装在岗。 |
| 心跳不自报 | 右侧空态「还没有 Bot 报心跳」。#18 之后种子池不再冒充同事 | 决策人以为没人；其实是 Bot 没调 `harness_heartbeat` | **保持 #18。** Dogfood 强制先心跳。TTL 90s，过期行消失，不回落假名。 |
| 心跳不带组 | 花名册扁平：harness 开发 Bot 和 2048 工作组挤在一列 | 决策人要的是「组」，不是一堵名单 | **本刀：** Domain `group`（`section` 别名）。Bot 自报 `harness` / `2048` / 空=其他。空组不画。 |
| 池子名像 Grok Bot | 左侧槽位 `Bot 填 · 交付同事` | 和侧栏真名撞车，决策人以为那是同事 | **本刀：** 槽位改「执行池 · noop / Cursor」。禁止再用 同事 当池标签。 |
| 假名墙回潮 | 有人想把 `pool_noop` 画回花名册「凑热闹」 | 已在 #18 锁死；再画就是回灌派工台 | **不回归。** DM `GET /v1/desks` 只见活心跳；`?include_pools=1` 对决策人无效。 |
| 证据不是页 | 只交摘要，决策人没法玩 | Gate 要「可打开的产物」 | 2048 页就是 artifact。README 写清 Goal/Assignment/Evidence/Gate 映射。 |
| 填充板被当成派工台 | 想在槽位或工位上「指派 / 开跑」 | 官方已拒监工台 | 保持只读投影。摩擦里的「谁去跑」由协调者/Bot 自路由，不给人拖拽。 |

## 建议 Bot 心跳（2048 工作组）

```json
{
  "display_name": "2048 Bot",
  "pool_id": "pool_noop",
  "group": "2048"
}
```

`group` / `section` 别名：`harness` → harness开发，`2048` → 2048工作组，空 → 其他。

## 明确还没做

- 官方 Grok Bot 花名册 / 扫 `agent-data` / `:1340`  
- OS 级强迫每个 Bot 挂 MCP 手套  
- 工位可写回 owner 或前置 dispatch
