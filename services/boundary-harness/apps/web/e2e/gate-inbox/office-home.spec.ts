import { join } from "node:path";
import {
  clearHeartbeats,
  drainReadyGates,
  expect,
  seedBusyDesk,
  seedDeliverPending,
  seedDeliverReady,
  shotDir,
  test,
} from "./helpers";

const DISPATCH_RE = /指派给|拖到工位|开始跑|派活|dispatch|assign/i;

test.describe("E2E office home P0", () => {
  test("office_home_p0_30s", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await clearHeartbeats(baseURL!);
    await seedDeliverPending(baseURL!);
    await seedBusyDesk(baseURL!);

    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("AI 办公室");
    await expect(page.getByTestId("new-goal")).toBeVisible();
    await expect(page.getByTestId("desks-entry")).toHaveText("工位心跳");
    await expect(page.getByTestId("office-shell").getByTestId("gate-card")).toHaveCount(0);
    await expect(page.getByTestId("inbox-drawer")).not.toHaveClass(/open/);
    const homeText = await page.getByTestId("office-shell").innerText();
    expect(homeText).not.toMatch(DISPATCH_RE);
    expect(homeText).not.toContain("OpenAPI");
    await expect(page.getByTestId("office-empty")).toContainText("还没有目标。建一个，同事才会开工。");

    const title = `办公室周报-${Date.now()}`;
    await page.getByTestId("goal-title-input").fill(title);
    await page.getByTestId("goal-intent-input").fill("写一份能读的周报");
    await page.getByTestId("new-goal").click();
    const card = page.getByTestId("goal-card").filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(card.getByTestId("fill-slot")).toBeVisible();
    await expect(card.getByTestId("slot-progress")).toContainText(/等同事填|在填|等证据|已交产物/);
    await expect(card.getByTestId("human-fill")).toHaveText("我来填");
    await expect(card.getByTestId("slot-required-kinds")).toContainText("结论摘要");
    await expect(card.getByTestId("slot-required-kinds")).toContainText("summary_md");
    await card.getByTestId("human-fill").click();
    await expect(page.getByTestId("fill-form")).toBeVisible();
    await expect(page.getByTestId("fill-required-kinds")).toContainText("结论摘要");
    await page.getByTestId("fill-submit").click();
    await expect(card.getByTestId("slot-filler")).toContainText("人填");
    await expect(card.getByRole("button", { name: /指派|开跑|dispatch/i })).toHaveCount(0);

    const roster = page.getByTestId("roster");
    await expect(roster).toBeVisible();
    await expect(roster).toHaveAttribute("data-readonly", "true");
    await expect(page.getByTestId("desks-empty")).toHaveText("还没有 Bot 报心跳");
    await expect(page.getByTestId("desk-row")).toHaveCount(0);
    await expect(roster.getByRole("button")).toHaveCount(0);
    await expect(roster.locator("[draggable='true']")).toHaveCount(0);
    expect(await roster.innerText()).not.toMatch(/交付同事|Cursor 同事/);

    await page.screenshot({ path: join(shotDir, "office_home_goals.png"), fullPage: true });

    await seedDeliverReady(baseURL!);
    await page.getByTestId("open-inbox").click();
    await expect(page.getByTestId("inbox-drawer")).toHaveClass(/open/);
    await expect(page.getByTestId("inbox-heading")).toHaveText(/待办/);
    await expect(page.getByTestId("gate-card").first()).toBeVisible();
    await expect(page.getByTestId("decide-pass").first()).toHaveText("通过");
    await expect(page.getByTestId("decide-revise").first()).toHaveText("打回重做");
    await expect(page.getByTestId("gate-title").first()).not.toHaveText(/e2e|g-[0-9]/i);
    await page.screenshot({ path: join(shotDir, "office_home_drawer.png"), fullPage: true });

    await page.goto("/inbox");
    await expect(page.getByTestId("inbox-heading")).toHaveText(/待办/);
    await expect(page.getByTestId("gate-card").first()).toBeVisible();
  });

  test("fill_slot_shows_required_evidence_kinds", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await page.goto("/");
    const title = `门禁种类-${Date.now()}`;
    await page.getByTestId("goal-title-input").fill(title);
    await page.getByTestId("goal-intent-input").fill("写一份能读的周报");
    await page.getByTestId("new-goal").click();
    const card = page.getByTestId("goal-card").filter({ hasText: title });
    await expect(card.getByTestId("fill-slot")).toBeVisible();
    await expect(card.getByTestId("slot-required-kinds")).toContainText("结论摘要");
    await expect(card.getByTestId("slot-required-kinds")).toContainText("summary_md");
    await expect(card.getByTestId("slot-required-kinds")).toHaveText(/结论摘要 summary_md/);
    await card.getByTestId("human-fill").click();
    await expect(page.getByTestId("fill-form")).toBeVisible();
    await expect(page.getByTestId("fill-required-kinds")).toContainText("结论摘要");
    await expect(page.getByTestId("fill-required-kinds")).toContainText("summary_md");
    await expect(page.getByTestId("fill-kind-summary_md")).toBeChecked();
    await expect(page.getByTestId("fill-submit")).toBeEnabled();
    await page.screenshot({ path: join(shotDir, "fill_slot_required_kinds.png"), fullPage: true });
  });

  test("fill_ui_prompts_missing_summary_md", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await page.goto("/");
    const title = `提示摘要-${Date.now()}`;
    await page.getByTestId("goal-title-input").fill(title);
    await page.getByTestId("goal-intent-input").fill("写一份能读的周报");
    await page.getByTestId("new-goal").click();
    const card = page.getByTestId("goal-card").filter({ hasText: title });
    await expect(card.getByTestId("slot-required-kinds")).toContainText("结论摘要");
    await expect(card.getByTestId("slot-required-kinds")).toContainText("summary_md");
    await card.getByTestId("human-fill").click();
    await expect(page.getByTestId("fill-form")).toBeVisible();
    await expect(page.getByTestId("fill-required-kinds")).toContainText("结论摘要 summary_md");
    await expect(page.getByTestId("fill-kind-summary_md")).toBeChecked();
    await page.getByTestId("fill-kind-summary_md").uncheck();
    await page.getByTestId("fill-kind-report_md").check();
    await expect(page.getByTestId("fill-kind-warn")).toContainText("结论摘要");
    await expect(page.getByTestId("fill-kind-warn")).toContainText("summary_md");
    await expect(page.getByTestId("fill-submit")).toBeDisabled();
    await page.route("**/v1/goals/*/assignments", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          code: "predicate_evidence_mismatch",
          message: "Brief evidence_shape is missing kinds required by the GateDef predicate: summary_md. Check or add those kinds and retry.",
          missing_kinds: ["summary_md"],
          required_kinds: ["summary_md"],
          evidence_shape: ["report_md"],
          details: { missing_kinds: ["summary_md"], required_kinds: ["summary_md"], evidence_shape: ["report_md"] },
          error: {
            code: "predicate_evidence_mismatch",
            missing_kinds: ["summary_md"],
            required_kinds: ["summary_md"],
            evidence_shape: ["report_md"],
          },
        }),
      });
    });
    await page.getByTestId("fill-kind-summary_md").check();
    await page.getByTestId("fill-submit").click();
    await expect(page.getByTestId("fill-kind-error")).toContainText("结论摘要");
    await expect(page.getByTestId("fill-kind-error")).toContainText("还差");
    await expect(page.getByTestId("fill-kind-error")).not.toHaveText("predicate_evidence_mismatch");
  });

  test("fill_slot_missing_kinds_human_message", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await page.goto("/");
    const title = `种类对不上-${Date.now()}`;
    await page.getByTestId("goal-title-input").fill(title);
    await page.getByTestId("goal-intent-input").fill("写一份能读的周报");
    await page.getByTestId("new-goal").click();
    const card = page.getByTestId("goal-card").filter({ hasText: title });
    await card.getByTestId("human-fill").click();
    await expect(page.getByTestId("fill-form")).toBeVisible();

    await page.getByTestId("fill-kind-summary_md").uncheck();
    await page.getByTestId("fill-kind-report_md").check();
    await expect(page.getByTestId("fill-kind-warn")).toBeVisible();
    await expect(page.getByTestId("fill-kind-warn")).toContainText("结论摘要");
    await expect(page.getByTestId("fill-kind-warn")).toContainText("summary_md");
    await expect(page.getByTestId("fill-kind-warn")).not.toHaveText(/^summary_md$/);
    await expect(page.getByTestId("fill-submit")).toBeDisabled();

    await page.route("**/v1/goals/*/assignments", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          code: "predicate_evidence_mismatch",
          message: "predicate kinds must be ⊆ assignment evidence_shape",
          missing_kinds: ["summary_md"],
          details: { missing_kinds: ["summary_md"] },
          error: {
            code: "predicate_evidence_mismatch",
            details: { missing_kinds: ["summary_md"] },
          },
        }),
      });
    });
    await page.getByTestId("fill-kind-summary_md").check();
    await expect(page.getByTestId("fill-kind-warn")).toBeHidden();
    await expect(page.getByTestId("fill-submit")).toBeEnabled();
    await page.getByTestId("fill-submit").click();
    await expect(page.getByTestId("fill-kind-error")).toBeVisible();
    await expect(page.getByTestId("fill-kind-error")).toContainText("结论摘要");
    await expect(page.getByTestId("fill-kind-error")).toContainText("还差");
    await expect(page.getByTestId("fill-kind-error")).not.toHaveText("predicate_evidence_mismatch");
    await expect(page.getByTestId("goal-flash")).toContainText("结论摘要");
    await page.screenshot({ path: join(shotDir, "fill_slot_missing_kinds.png"), fullPage: true });
  });
});
