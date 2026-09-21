import { join } from "node:path";
import { expect, seedResearchThenDeliver, shotDir, test } from "./helpers";

const DISPATCH_RE = /指派给|拖到工位|开始跑|派活|强制开工|dispatch|assign/i;

test.describe("E2E office stage strip", () => {
  test("stage_strip_shows_locked_downstream", async ({ page, baseURL }) => {
    const { goal } = await seedResearchThenDeliver(baseURL!, "调研后交付");
    await page.goto("/");
    const card = page.getByTestId("goal-card").filter({ hasText: goal.title });
    await expect(card).toBeVisible();
    const strip = card.getByTestId("stage-strip");
    await expect(strip).toBeVisible();
    const nodes = strip.getByTestId("stage-node");
    await expect(nodes).toHaveCount(2);
    await expect(nodes.nth(0)).toHaveAttribute("data-state", "current");
    await expect(nodes.nth(0)).toHaveAttribute("data-stage-key", "research");
    await expect(nodes.nth(0).getByTestId("stage-node-label")).toHaveText("调研");
    await expect(nodes.nth(1)).toHaveAttribute("data-state", "locked");
    await expect(nodes.nth(1)).toHaveAttribute("data-stage-key", "deliver");
    await expect(nodes.nth(1).getByTestId("stage-node-label")).toHaveText("交付");
    await expect(nodes.nth(1)).toHaveAttribute("title", /需先通过/);
    const lockedSlot = card.locator('[data-testid="fill-slot"][data-stage-locked="true"]');
    await expect(lockedSlot).toBeVisible();
    await expect(lockedSlot).toHaveClass(/is-locked/);
    await expect(lockedSlot.getByTestId("slot-progress")).toContainText("阶段未解锁：先完成上一道门禁");
    await expect(lockedSlot.getByTestId("human-fill")).toHaveCount(0);
    await expect(card.getByRole("button", { name: /强制开工|开始跑|指派|dispatch/i })).toHaveCount(0);
    const cardText = await card.innerText();
    expect(cardText).not.toMatch(DISPATCH_RE);
    expect(cardText).toContain("锁");
    await page.screenshot({ path: join(shotDir, "stage_strip_locked_downstream.png"), fullPage: true });
  });

  test("stage_locked_423_human_message", async ({ page, baseURL }) => {
    const { goal } = await seedResearchThenDeliver(baseURL!, "阶段未解锁验收");
    await page.goto("/");
    const card = page.getByTestId("goal-card").filter({ hasText: goal.title });
    await expect(card).toBeVisible();
    const locked = card.locator('[data-testid="stage-node"][data-state="locked"]');
    await expect(locked).toBeVisible();
    const respPromise = page.waitForResponse(
      (r) => r.url().includes("/assignments") && r.request().method() === "POST",
    );
    await locked.click();
    const resp = await respPromise;
    expect(resp.status()).toBe(423);
    const body = (await resp.json()) as { code?: string; error?: { code?: string }; strip?: string };
    const code = body.code ?? body.error?.code;
    expect(code).toBe("stage_locked");
    expect(code).not.toBe("freeze_active");
    await expect(page.getByTestId("stage-locked-message")).toHaveText("阶段未解锁：先完成上一道门禁");
    await expect(page.getByTestId("goal-flash")).toContainText("阶段未解锁：先完成上一道门禁");
    await expect(page.getByTestId("goal-flash")).toContainText("上一关还没通过，先别跳到下一阶段。");
    await expect(card.getByRole("button", { name: /强制开工|开始跑|dispatch/i })).toHaveCount(0);
    await page.screenshot({ path: join(shotDir, "stage_locked_423_human_message.png"), fullPage: true });
  });
});
