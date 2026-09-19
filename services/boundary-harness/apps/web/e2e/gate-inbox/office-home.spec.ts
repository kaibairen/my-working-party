import { join } from "node:path";
import {
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
    await expect(page.getByTestId("desks-empty")).toHaveText("还没有同事上线");
    await expect(page.getByTestId("desk-row")).toHaveCount(0);
    const rosterText = await roster.innerText();
    expect(rosterText).not.toContain("交付同事");
    expect(rosterText).not.toContain("Cursor 同事");
    await expect(roster.getByRole("button")).toHaveCount(0);
    await expect(roster.locator("[draggable='true']")).toHaveCount(0);

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

  test("desks_no_pool_seed_fake_names", async ({ page }) => {
    const desksReq = page.waitForRequest((req) => {
      if (req.method() !== "GET") return false;
      const url = new URL(req.url());
      return url.pathname === "/v1/desks";
    });
    await page.goto("/");
    const req = await desksReq;
    expect(new URL(req.url()).searchParams.get("heartbeat_fresh")).toBe("true");
    const roster = page.getByTestId("roster");
    await expect(roster).toBeVisible();
    await expect(roster).toHaveAttribute("data-readonly", "true");
    await expect(page.getByTestId("desks-empty")).toHaveText("还没有同事上线");
    await expect(page.getByTestId("desk-row")).toHaveCount(0);
    const rosterText = await roster.innerText();
    expect(rosterText).not.toContain("交付同事");
    expect(rosterText).not.toContain("Cursor 同事");
    expect(rosterText).not.toMatch(/派活|指派|dispatch|assign|开始跑/i);
    await expect(roster.getByRole("button")).toHaveCount(0);
    await expect(roster.locator("[draggable='true']")).toHaveCount(0);
    await expect(page.getByTestId("inbox-drawer")).not.toHaveClass(/open/);
  });

  test("desks_list_requires_fresh_heartbeat", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("desks-empty")).toHaveText("还没有同事上线");
    await expect(page.getByTestId("desk-row")).toHaveCount(0);
    const emptyRoster = await page.getByTestId("roster").innerText();
    expect(emptyRoster).not.toContain("在忙");
    expect(emptyRoster).not.toContain("交付同事");
    expect(emptyRoster).not.toContain("Cursor 同事");

    const now = new Date().toISOString();
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await page.route("**/v1/desks**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          readonly: true,
          hitl: "待我拍板",
          heartbeat_ttl_seconds: 90,
          desks: [
            {
              id: "pool_noop",
              name: "交付同事",
              presence: "idle",
              status: "空闲",
              last_heartbeat: null,
              source: "pool_seed",
            },
            {
              id: "pool_cursor",
              name: "Cursor 同事",
              presence: "busy",
              status: "在忙",
              last_heartbeat: now,
              heartbeat_fresh: false,
              source: "pool_seed",
            },
            {
              id: "agent:stale",
              name: "过期同事",
              presence: "busy",
              status: "在忙",
              last_heartbeat: stale,
              heartbeat_fresh: false,
              source: "heartbeat",
              ttl_seconds: 90,
            },
            {
              id: "agent:live",
              name: "小艾",
              avatar: "小",
              presence: "busy",
              status: "在忙",
              last_heartbeat: now,
              heartbeat_fresh: true,
              source: "heartbeat",
              ttl_seconds: 90,
            },
          ],
        }),
      });
    });
    await page.goto("/");
    const roster = page.getByTestId("roster");
    await expect(page.getByTestId("desk-row")).toHaveCount(1);
    await expect(page.getByTestId("desk-name")).toHaveText("小艾");
    await expect(page.getByTestId("desk-status")).toHaveText("在忙");
    await expect(page.getByTestId("desk-row")).toHaveAttribute("data-heartbeat-fresh", "true");
    await expect(page.getByTestId("desk-row")).toHaveAttribute("data-presence", "busy");
    const rosterText = await roster.innerText();
    expect(rosterText).not.toContain("交付同事");
    expect(rosterText).not.toContain("Cursor 同事");
    expect(rosterText).not.toContain("过期同事");
    await expect(page.getByTestId("desks-empty")).toHaveCount(0);
    await expect(roster.getByRole("button")).toHaveCount(0);
    await expect(roster.locator("[draggable='true']")).toHaveCount(0);
    await expect(page.getByTestId("inbox-drawer")).not.toHaveClass(/open/);
  });
});
