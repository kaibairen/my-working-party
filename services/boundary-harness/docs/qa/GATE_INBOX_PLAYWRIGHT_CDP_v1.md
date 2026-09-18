# Gate Inbox Playwright（CDP）E2E 用例清单 v1

**触发：** 决策人要 CDP/E2E  
**作者：** HarnessQA · 2026-09-19 Asia/Shanghai  
**对齐：** `GATE_INBOX_IA_M2.md` · SSE 契约 · 附录 A（禁口头 done）· OpenAPI Gate decide  
**栈建议：** Playwright + CDP（`connectOverCDP` / Chromium）；Mock API 或 compose `api`  
**路径约定（实现仓）：** `services/boundary-harness/apps/web/e2e/gate-inbox/**/*.spec.ts`  
**CI：** M2 起建议 nightly + main；**不**替代 ready-anti / security-anti 强制单测

---

## 0. 强制覆盖面（决策人点名）

| 面 | 最低用例 | CI |
|----|----------|-----|
| ready 列表 | E2E-01 · E2E-02 · E2E-03 | 🔴 |
| decide | E2E-10 · E2E-11 · E2E-12 | 🔴 |
| `missing[]` | E2E-20 · E2E-21 | 🔴 |
| 禁口头 done | E2E-30 · E2E-31 · E2E-32 | 🔴 |

缺任一 🔴 → Inbox E2E job 红（实现 PR 验收打回）。

---

## 1. ready 列表

| ID | 用例名 | 步骤要点 | 期望 |
|----|--------|----------|------|
| E2E-01 | `inbox_lists_only_ready` | Mock：pending+ready 各有卡；打开 Inbox | 仅 `status=ready`；默认请求 `GET /v1/gates?status=ready` |
| E2E-02 | `inbox_empty_state_quiet` | ready=0 | 安静空态；**无**「去画布看进度」CTA |
| E2E-03 | `inbox_card_shows_predicate_meta` | 一卡 ready | 卡面可见 `predicate_id` / `predicate_version` / `ready_at` |
| E2E-04 | `inbox_no_run_progress_timeline` | SSE/轮询有 run 进度事件 | 主 UI **不**渲染 Run 进度流水 |
| E2E-05 | `inbox_sse_gate_ready_upsert` | 推 `gate.ready` 两次同 id | 幂等 upsert 一卡，不重复 |

---

## 2. decide

| ID | 用例名 | 步骤要点 | 期望 |
|----|--------|----------|------|
| E2E-10 | `decide_pass_uses_version` | 点 pass；抓请求 | `POST /v1/gates/{id}/decide` body 含 **`version`**（非 expected_version）；decision=pass |
| E2E-11 | `decide_revise_default_same_assignment` | revise，不勾 structural | `structural_change` 缺省/false；成功后卡离 ready 列表 |
| E2E-12 | `decide_optimistic_lock_409_refresh` | 先改 version 制造 409 | 提示冲突并**刷新卡**；禁止静默覆盖重试 |
| E2E-13 | `decide_defer_removes_from_ready` | defer | 卡离开 ready 列表 |
| E2E-14 | `decide_disabled_when_not_ready` | 深链打开已 decided | 无 decide 主按钮 / 只读 |

---

## 3. `missing[]`

| ID | 用例名 | 步骤要点 | 期望 |
|----|--------|----------|------|
| E2E-20 | `card_renders_missing_array` | ready_result_json.missing 非空 | 卡面**逐条**展示 missing；禁止只写「请批准」 |
| E2E-21 | `missing_empty_still_shows_ready_ok` | missing=[] 且 ok | 可 decide；不伪造成「缺证据」 |
| E2E-22 | `pending_with_missing_not_in_inbox` | Gate pending + missing 有值 | **不**进默认 Inbox（仅 ready） |

---

## 4. 禁口头 done（UI 反例）

| ID | 用例名 | 步骤要点 | 期望 |
|----|--------|----------|------|
| E2E-30 | `no_mark_done_button` | 扫 Inbox / 卡面控件 | **无**「标记完成 / mark done / 我确认好了」类完成 SoT 控件 |
| E2E-31 | `chat_done_text_never_creates_card` | Mock：仅聊天 done 事件、无 Gate ready | Inbox 不出现新卡 |
| E2E-32 | `run_succeeded_banner_not_decide` | 展示 run.succeeded 例外/旁路（若有） | 不得一键当 Gate pass；无「Run 绿了直接通过」 |
| E2E-33 | `advisory_not_hard_gate_card` | advisory_hint 事件 | **不**画成可 decide 的硬停 Gate 卡 |

---

## 5. 非目标（故意不做）

- 画布 / Roster 作 E2E 前置（对标 `canvas_not_required_for_dispatch`）
- 把 Playwright 步骤写进 Brief
- 用 E2E 替代 `tests/ready-anti` 14 / `security-anti` 8
- explore 自动弹假交付卡

---

## 6. 实现 PR 覆盖检查表（QA 盯）

PR 描述或 CI 须勾：

- [ ] E2E-01/02/03 ready 列表  
- [ ] E2E-10/11/12 decide + 409  
- [ ] E2E-20/21 missing[]  
- [ ] E2E-30/31/32 禁口头 done  
- [ ] 选择器稳定（`data-testid`：`gate-card` / `missing-item` / `decide-pass|revise|defer`）  
- [ ] Mock 或 compose；不依赖真 Cursor / 真画布  

未勾满 → **打回**，口头「测过了」无效。

---

## 7. CDP / Playwright 草图

```ts
// connectOverCDP 或 Playwright test runner
test('inbox_lists_only_ready', async ({ page }) => {
  await page.goto('/inbox');
  await expect(page.getByTestId('gate-card')).toHaveCount(1); // mock: 1 ready
});
```

CI job 名建议：`e2e-gate-inbox`（M2；与 unit-vitest 并列，不挤掉 anti 强制集）。

---

## 变更

| 版本 | 说明 |
|------|------|
| v1 | 首版：ready / decide / missing[] / 禁口头 done 强制面 |
