import { join } from "node:path";
import {
  drainReadyGates,
  expect,
  seedBusyDesk,
  seedDeliverPending,
  seedDeliverReady,
  seedHeartbeat,
  shotDir,
  test,
} from "./helpers";

const DISPATCH_RE = /指派给|拖到工位|开始跑|派活|dispatch|assign/i;

test.describe("E2E office home P0", () => {
  test("office_home_p0_30s", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
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
    await card.getByTestId("human-fill").click();
    await expect(card.getByTestId("slot-filler")).toContainText("人填");
    await expect(card.getByRole("button", { name: /指派|开跑|dispatch/i })).toHaveCount(0);

    const roster = page.getByTestId("roster");
    await expect(roster).toBeVisible();
    await expect(roster).toHaveAttribute("data-readonly", "true");
    const empty = page.getByTestId("desks-empty");
    if (await empty.count()) {
      await expect(empty).toHaveText("还没有 Bot 报心跳");
      await expect(page.getByTestId("desk-row")).toHaveCount(0);
    } else {
      await expect(page.getByTestId("desk-group").first()).toBeVisible();
    }
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

  test("desks_grouped_layout_readonly", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedHeartbeat(baseURL!, { actor: "bot-qa-h", display_name: "QA Harness Bot", group: "harness" });
    await seedHeartbeat(baseURL!, { actor: "bot-qa-2", display_name: "QA 2048 Bot", group: "2048" });
    await page.goto("/");
    const roster = page.getByTestId("roster");
    await expect(roster).toHaveAttribute("data-readonly", "true");
    await expect(page.getByTestId("desk-group-title").filter({ hasText: "harness开发" })).toHaveCount(1);
    await expect(page.getByTestId("desk-group-title").filter({ hasText: "2048工作组" })).toHaveCount(1);
    await expect(page.getByTestId("desk-name").filter({ hasText: "QA Harness Bot" })).toHaveCount(1);
    await expect(page.getByTestId("desk-name").filter({ hasText: "QA 2048 Bot" })).toHaveCount(1);
    await expect(page.locator('[data-testid="desk-group"][data-group="harness开发"]')).toBeVisible();
  });

  test("desks_group_no_drag_assign", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedHeartbeat(baseURL!, { actor: "bot-qa-h", display_name: "QA Harness Bot", group: "harness" });
    await page.goto("/");
    const roster = page.getByTestId("roster");
    await expect(page.getByTestId("desk-group").first()).toBeVisible();
    await expect(roster.getByRole("button")).toHaveCount(0);
    await expect(roster.locator("[draggable='true']")).toHaveCount(0);
    await expect(roster.getByRole("link")).toHaveCount(0);
    expect(await roster.innerText()).not.toMatch(DISPATCH_RE);
  });

  test("desks_group_no_fake_seeds", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedHeartbeat(baseURL!, { actor: "bot-qa-h", display_name: "QA Harness Bot", group: "harness" });
    await page.goto("/");
    const text = await page.getByTestId("roster").innerText();
    expect(text).not.toMatch(/交付同事|Cursor 同事|群组同事/);
    expect(text).toContain("QA Harness Bot");
  });

  test("desks_ungrouped_bucket", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedHeartbeat(baseURL!, { actor: "bot-qa-other", display_name: "QA Other Bot" });
    await page.goto("/");
    await expect(page.getByTestId("desk-group-title").filter({ hasText: "其他" })).toHaveCount(1);
    await expect(
      page.locator('[data-testid="desk-group"][data-group="其他"]').getByTestId("desk-name").filter({
        hasText: "QA Other Bot",
      }),
    ).toHaveCount(1);
  });
});
