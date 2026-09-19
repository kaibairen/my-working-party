import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { api, clickPass, drainReadyGates, expect, headers, seedAuthorityReady, seedDeliverReady, shotDir, test } from "./helpers";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const evidenceDir = join(dirname(fileURLToPath(import.meta.url)), "../../evidence");
mkdirSync(evidenceDir, { recursive: true });

test.describe("Decision-maker shell", () => {
  test("decision_maker_shell_has_no_openapi_link", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("AI 办公室");
    await expect(page.getByTestId("board-title")).toContainText("待我拍板");
    await expect(page.getByTestId("todo-chip")).toHaveText(/^待办/);
    await expect(page.getByTestId("office-sub")).toContainText("同事在工位上干活");
    await expect(page.getByTestId("board-cta")).toHaveCount(0);
    await expect(page.getByTestId("dm-topbar")).toBeVisible();
    await expect(page.getByRole("link", { name: /openapi|health/i })).toHaveCount(0);
    await expect(page.locator("a[href*='openapi']")).toHaveCount(0);
    await expect(page.locator("a[href='/health']")).toHaveCount(0);
    const top = await page.getByTestId("dm-topbar").innerText();
    expect(top).not.toMatch(/OpenAPI/i);
    expect(top).not.toMatch(/Health/);
    expect(top).not.toMatch(/decision_maker|Reload ready/i);
    await page.screenshot({ path: join(shotDir, "dm_shell_no_openapi_link.png"), fullPage: true });
  });

  test("inbox_card_title_not_uuid", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    const ready = await seedDeliverReady(baseURL!);
    await page.goto("/inbox");
    const card = page.getByTestId("gate-card");
    await expect(card).toHaveCount(1);
    const title = page.getByTestId("gate-title");
    await expect(title).toBeVisible();
    await expect(title).not.toHaveText(UUID_RE);
    await expect(title).not.toHaveText(ready.gate!.id);
    const titleText = (await title.innerText()).trim();
    expect(titleText.length).toBeGreaterThan(0);
    expect(titleText).not.toMatch(UUID_RE);
    await expect(page.getByTestId("gate-id")).toContainText(ready.gate!.id);
    await expect(page.getByTestId("card-face")).not.toContainText(ready.gate!.id);
    await expect(page.getByTestId("card-face")).not.toContainText(/predicate_id|predicate_version/);
    await expect(page.getByTestId("gate-status")).toHaveText("待你决定");
    await page.screenshot({ path: join(shotDir, "inbox_card_title_not_uuid.png"), fullPage: true });
  });

  test("inbox_r17_r25_copy_field_map", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await page.goto("/");
    await expect(page.getByTestId("inbox-empty")).toHaveText("此刻没有待办。安静是正常的。");
    await expect(page.getByTestId("todo-chip")).toHaveText("待办");
    const top = await page.getByTestId("dm-topbar").innerText();
    expect(top).toMatch(/^AI 办公室/);
    expect(top).toContain("待办");
    expect(top).not.toMatch(/Health|OpenAPI|Reload ready|decision_maker/i);
    await expect(page.getByRole("button", { name: "刷新" })).toBeVisible();

    const ready = await seedDeliverReady(baseURL!, "本周交付包");
    await page.goto("/inbox");
    await expect(page.getByTestId("gate-title")).toHaveText("本周交付包");
    await expect(page.getByTestId("working-who")).toContainText(/工位/);
    await expect(page.getByTestId("working-who")).not.toHaveText(UUID_RE);
    await expect(page.getByTestId("todo-chip")).toHaveText("待办 · 1");
    await expect(page.getByTestId("output-summary")).toHaveText("同事已交：结论摘要、产物");
    await expect(page.getByTestId("output-summary")).not.toContainText("{");
    await expect(page.getByTestId("output-summary")).not.toContainText("[");
    await expect(page.getByTestId("card-face")).not.toContainText(ready.gate!.id);
    await expect(page.getByTestId("card-face")).not.toContainText(ready.goal.id);
    await expect(page.getByTestId("card-face")).not.toContainText(/predicate_id|predicate_version/);
    await expect(page.getByTestId("gate-status")).toHaveText("待你决定");
    await expect(page.getByTestId("gate-status")).not.toHaveText(/^ready$/i);
    await expect(page.getByTestId("missing-block")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "通过" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "打回重做" })).toBeVisible();
    await expect(page.getByRole("button", { name: "稍后处理" })).toBeVisible();

    const auth = await seedAuthorityReady(baseURL!);
    const missing = auth.gate?.ready_result?.missing ?? [];
    expect(missing.length).toBeGreaterThan(0);
    await page.getByTestId("reload-ready").click();
    const missingCard = page.locator("[data-testid=gate-card]").filter({ has: page.getByTestId("missing-block") });
    await expect(missingCard).toHaveCount(1);
    await expect(missingCard.getByTestId("missing-title")).toHaveText("还差");
    await expect(missingCard.getByTestId("decide-pass")).toBeDisabled();
    for (const entry of missing) {
      await expect(missingCard.getByTestId("missing-item").filter({ hasText: entry })).toHaveCount(0);
      await expect(missingCard.getByTestId("card-face")).not.toContainText(entry);
    }
    await expect(page.getByTestId("todo-chip")).toHaveText("待办 · 2");
    await expect(page.getByTestId("gate-inbox")).toHaveCount(1);
    await expect(page.locator("body")).not.toContainText("决策抽屉");
    await expect(page.locator("body")).not.toContainText("材料齐全");
    await expect(page.locator("body")).not.toContainText("还缺这些");
    await expect(page.locator("body")).not.toContainText("已打回重做");
    await expect(page.locator("body")).not.toContainText("已稍后处理");
  });

  test("inbox_one_hitl_queue_section7", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await page.goto("/");
    await expect(page.getByTestId("board-title")).toHaveText("待我拍板");
    await expect(page.getByTestId("gate-inbox")).toHaveCount(1);
    await expect(page.getByTestId("inbox-empty")).toHaveCount(1);
    await expect(page.getByTestId("board-cta")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("决策抽屉");
    await expect(page.getByTestId("roster-weak")).toBeVisible();
    await expect(page.getByRole("link", { name: "工位一览" })).toHaveCount(0);

    await page.goto("/inbox");
    await expect(page.getByTestId("board-title")).toHaveText("待我拍板");
    await expect(page.getByTestId("gate-inbox")).toHaveCount(1);
    await expect(page.getByTestId("inbox-empty")).toHaveText("此刻没有待办。安静是正常的。");

    const ready = await seedDeliverReady(baseURL!, "本周交付包");
    await page.reload();
    await expect(page.getByTestId("gate-card")).toHaveCount(1);
    await expect(page.getByTestId("todo-chip")).toHaveText("待办 · 1");
    await expect(page.getByTestId("gate-title")).toHaveText("本周交付包");
    await expect(page.getByTestId("working-who")).toHaveText("交付工位 · 协调人");
    await expect(page.getByTestId("working-who")).not.toHaveText(UUID_RE);
    await expect(page.getByTestId("output-summary")).toHaveText("同事已交：结论摘要、产物");
    await expect(page.getByTestId("output-summary")).not.toContainText(ready.gate!.id);
    await expect(page.getByTestId("card-face")).not.toContainText("{");

    await api(baseURL!, "/v1/policy/check", {
      method: "POST",
      headers: headers.executor,
      body: JSON.stringify({
        action: "chat_done",
        track: "advisory_hint",
        context: { text: "hint" },
      }),
    });
    await page.getByTestId("reload-ready").click();
    await expect(page.getByTestId("gate-card")).toHaveCount(1);
  });

  test("ops_routes_forbidden_for_dm", async ({ page }) => {
    await page.goto("/inbox");
    await expect(page.getByTestId("dev-controls")).toBeHidden();
    await expect(page.getByTestId("ops-link")).toBeHidden();
    await expect(page.getByTestId("role-impersonation")).toBeHidden();
    await expect(page.getByRole("link", { name: /openapi|health|ops|outbox|运维/i })).toHaveCount(0);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/OpenAPI/i);
    expect(body).not.toMatch(/\bHealth\b/);
    expect(body).not.toMatch(/outbox/i);

    await page.goto("/inbox?dev=1");
    await expect(page.getByTestId("dev-controls")).toBeVisible();
    await expect(page.getByTestId("ops-link")).toBeVisible();
    await expect(page.getByTestId("role-impersonation")).toBeVisible();
    await page.getByTestId("ops-link").click();
    await expect(page).toHaveURL(/\/ops/);
    await expect(page.getByTestId("outbox-table")).toBeVisible();
  });

  test("office_empty_and_pass_shots", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await page.goto("/");
    await expect(page.getByTestId("inbox-empty")).toBeVisible();
    await page.screenshot({ path: join(evidenceDir, "office_empty_quiet.png"), fullPage: true });
    await page.screenshot({ path: join(shotDir, "office_empty_quiet.png"), fullPage: true });

    await seedDeliverReady(baseURL!, "本周交付包");
    await page.goto("/inbox");
    await expect(page.getByTestId("gate-title")).toHaveText("本周交付包");
    await expect(page.getByTestId("gate-title")).not.toHaveText(UUID_RE);
    await expect(page.getByTestId("working-who")).toHaveText("交付工位 · 协调人");
    await expect(page.getByTestId("output-summary")).toHaveText("同事已交：结论摘要、产物");
    await expect(page.getByTestId("todo-chip")).toHaveText("待办 · 1");
    await page.screenshot({ path: join(evidenceDir, "inbox_one_card_human.png"), fullPage: true });
    await page.screenshot({ path: join(shotDir, "inbox_one_card_human.png"), fullPage: true });

    await clickPass(page);
    await expect(page.getByTestId("inbox-flash")).toHaveText("已通过。");
    await expect(page.getByTestId("inbox-flash")).not.toHaveText(UUID_RE);
    await expect(page.getByTestId("inbox-empty")).toBeVisible();
    await page.screenshot({ path: join(evidenceDir, "inbox_after_pass_quiet.png"), fullPage: true });
    await page.screenshot({ path: join(shotDir, "inbox_after_pass_quiet.png"), fullPage: true });
  });
});
