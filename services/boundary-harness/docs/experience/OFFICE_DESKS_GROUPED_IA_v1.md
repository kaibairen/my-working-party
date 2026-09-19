# 办公室右侧工位 · 分组排布 IA v1（2048 工作组）

**状态：** Frontend 起草 · 对齐 TechLead 钉板（2026-09-19）  
**范围：** 只改布局投影；不改派工语义、不引入假名墙  
**合闸：** 派工六刀 + `office_no_fake_name_wall` · `heartbeat_ttl_expiry_clears_row` 不松

---

## 1. 一句话

右侧工位从「扁列表」改为**按组折叠的只读心跳墙**：同组 Bot 聚在一起，仍只显示真 heartbeat；禁止拖拽/指派/开跑。

---

## 2. 布局

```
┌────────────── 办公室主区 ──────────────┬── 工位（分组）─┐
│ Goal / 填充槽 / 待办·n                   │ ▼ 交付组      │
│                                          │   · Bot A 在忙 │
│                                          │   · Bot B 空闲 │
│                                          │ ▶ 调研组 (2)   │
│                                          │ ▼ 未分组       │
│                                          │   · Bot C 等证据│
└──────────────────────────────────────────┴───────────────┘
```

| 元素 | 规则 |
|------|------|
| 组头 | 人读组名 + 人数；默认可展开；无拖组 |
| 组内行 | 与现 desks 行同：名 / presence 三态；无按钮 |
| 未分组 | `group` 空或缺失 →「未分组」桶 |
| 空态 | 整侧仍：`还没有 Bot 报心跳`（无假种子填坑） |

---

## 3. 数据

**优先：** Domain 若已有 `group` / `pool_label` / `team` 字段则直接用。  
**缺字段时（本轮默认）：** 壳侧派生分组，**不挡交付**：

1. `desk.group` 或 `desk.group_id`（若 API 有）  
2. 否则用 `desk.pool_id` 映射人读名（仅当该 desk 已在真 heartbeat 列表内）  
3. 再否则 →「未分组」

**禁止：** 为填满侧栏注入 pool seed /「交付同事」「Cursor 同事」。

Backend：**仅当** dogfood 需要稳定跨刷新组名且派生不够，再补只读 `group` 字段；本 IA 不强制本轮 API。

---

## 4. 交互（只读）

- 组头点击：仅展开/折叠  
- 行：无 click-to-assign、无 drag、无「开始跑」  
- 与 Inbox 抽屉无关；`/` 仍是办公室首页

---

## 5. 验收（Frontend + QA）

| ID | 期望 |
|----|------|
| `desks_grouped_layout_readonly` | 右侧按组渲染；`data-readonly=true` |
| `desks_group_no_drag_assign` | 组内无 draggable / 指派 / 开跑 |
| `desks_group_no_fake_seeds` | 分组后仍零命中假名墙两刀 |
| （既有）假名两刀 + 派工六刀 | 不回归 |

---

## 6. 非目标

- Roster 当派工 SoT  
- 用户本机环回说明（运行时钉箱内 `127.0.0.1:8080`）  
- 本轮修 `cursor_http_400`
