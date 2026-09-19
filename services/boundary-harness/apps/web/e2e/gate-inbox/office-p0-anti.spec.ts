import { join } from "node:path";
import {
  drainReadyGates,
  expect,
  HUMAN_GOAL,
  seedBusyDesk,
  seedDeliverPending,
  seedDeliverReady,
  shotDir,
  test,
} from "./helpers";

const ASSIGN_RE = /指派给|派活|assign to|assign desk/i;
const DRAG_RE = /拖到工位|drag-dispatch|drag to desk|drag.?assign/i;
const START_RUN_RE = /开始跑|start run|start-run|dispatch now/i;
const DISPATCH_CONSOLE_RE = /指派给|拖到工位|开始跑|派活/;

test.describe("P0 office anti (QA-frozen names)", () => {
  test("office_home_not_inbox_wall", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverPending(baseURL!);
    await page.goto("/");
    await expect(page.locator("header.top h1")).toHaveText("AI 办公室");
    await expect(page.getByTestId("office-shell")).toBeVisible();
    await expect(page.getByTestId("goals-panel")).toBeVisible();
    await expect(page.getByTestId("new-goal")).toBeVisible();
    await expect(page.getByTestId("goal-list")).toBeVisible();
    await expect(page.getByTestId("desks-entry")).toHaveText("工位心跳");
    await expect(page.getByTestId("office-shell").getByTestId("gate-card")).toHaveCount(0);
    await expect(page.getByTestId("inbox-drawer")).not.toHaveClass(/open/);
    await page.screenshot({ path: join(shotDir, "office_home_not_inbox_wall.png"), fullPage: true });
  });

  test("inbox_is_drawer_not_home", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverReady(baseURL!);
    await page.goto("/");
    await expect(page.locator("header.top h1")).toHaveText("AI 办公室");
    await expect(page.getByTestId("office-shell")).toBeVisible();
    await expect(page.getByTestId("inbox-drawer")).not.toHaveClass(/open/);
    await page.getByTestId("open-inbox").click();
    await expect(page.getByTestId("inbox-drawer")).toHaveClass(/open/);
    await expect(page.getByTestId("gate-inbox")).toBeVisible();
    await expect(page.getByTestId("office-shell")).toBeVisible();
    await expect(page.getByTestId("goals-panel")).toBeVisible();
    await expect(page.getByTestId("inbox-heading")).toHaveText(/待办/);
    await expect(page.getByTestId("decide-pass")).toHaveText("通过");
    await expect(page.getByTestId("decide-revise")).toHaveText("打回重做");
    await expect(page.getByTestId("decide-defer")).toHaveText("稍后处理");
    await expect(page.getByTestId("gate-title")).toHaveText(HUMAN_GOAL.deliver);
    await page.goto("/inbox");
    await expect(page.getByTestId("inbox-heading")).toHaveText(/待办/);
    await expect(page.getByTestId("gate-card").first()).toBeVisible();
  });

  test("office_no_assign_desk", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedBusyDesk(baseURL!);
    await page.goto("/");
    const roster = page.getByTestId("roster");
    await expect(roster).toBeVisible();
    await expect(roster).toHaveAttribute("data-readonly", "true");
    await expect(roster.getByRole("button")).toHaveCount(0);
    await expect(roster.getByRole("combobox")).toHaveCount(0);
    await expect(roster.getByRole("textbox")).toHaveCount(0);
    const rosterText = await roster.innerText();
    expect(rosterText).not.toMatch(ASSIGN_RE);
    expect(rosterText).not.toMatch(/writable|指派给|派工台/i);
    await expect(page.getByRole("button", { name: /指派给|assign/i })).toHaveCount(0);
  });

  test("office_no_drag_dispatch", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverPending(baseURL!);
    await seedBusyDesk(baseURL!);
    await page.goto("/");
    await expect(page.getByTestId("roster")).toBeVisible();
    await expect(page.getByTestId("fill-board").first()).toBeVisible();
    await expect(page.locator("[draggable='true']")).toHaveCount(0);
    await expect(page.getByTestId("fill-slot").first()).toHaveAttribute("draggable", "false");
    const deskRows = page.getByTestId("desk-row");
    if ((await deskRows.count()) > 0) {
      await expect(deskRows.first()).toHaveAttribute("draggable", "false");
    }
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(DRAG_RE);
  });

  test("office_no_start_run_button", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverPending(baseURL!);
    await page.goto("/");
    await expect(page.getByTestId("office-shell")).toBeVisible();
    await expect(page.getByRole("button", { name: /开始跑|start run/i })).toHaveCount(0);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(START_RUN_RE);
    await expect(page.getByTestId("roster").getByRole("button")).toHaveCount(0);
  });

  test("fill_board_not_dispatch_console", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverPending(baseURL!);
    await page.goto("/");
    const board = page.getByTestId("fill-board").first();
    await expect(board).toBeVisible();
    await expect(page.getByTestId("fill-slot").first()).toBeVisible();
    await expect(page.getByTestId("slot-filler").first()).toBeVisible();
    await expect(page.getByTestId("slot-progress").first()).toBeVisible();
    await expect(board.locator("[draggable='true']")).toHaveCount(0);
    await expect(board.getByRole("button", { name: /指派给|拖到工位|开始跑/ })).toHaveCount(0);
    const text = await board.innerText();
    expect(text).not.toMatch(DISPATCH_CONSOLE_RE);
    expect(text).toMatch(/还没人填|同事在填|在填|等同事填|等证据|我来填|人填|Bot 填/);
  });
});
