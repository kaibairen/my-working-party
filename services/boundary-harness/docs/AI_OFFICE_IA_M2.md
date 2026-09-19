# AI 办公室 IA（M2 · 决策人主路径）

对齐 `DECISION_MAKER_CLICK_FLOW_v1` §4。默认 `/` 与 `/inbox` 是同一壳：**AI 办公室 + 待我拍板**。

- 落地：`AI 办公室` + 弱 `工位一览`（CLICK_FLOW）
- Inbox 顶栏：仅 `待办` / `待办 · n`（COPY map）
- 空态：`此刻没有待办。安静是正常的。`
- 卡面：Goal 人读标题、`还差` + 人话条目（空 missing 整块不渲染）、authority `硬门禁` / `待你决定`
- UUID / `predicate_id` / raw missing code：仅「工程详情」
- 按钮：`通过` / `打回重做` / `稍后处理`；409：`别人刚处理过这张，已帮你刷新。`
- 文案包：`apps/web/copy/zh-DM.ts`
- Ops / Health / OpenAPI：仅 `/ops` 或 `?dev=1`

Roster / 填充槽可写 UI / 画布派发前置 = 非本 PR。
