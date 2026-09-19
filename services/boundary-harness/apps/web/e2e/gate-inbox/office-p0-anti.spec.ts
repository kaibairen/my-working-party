import {
  drainReadyGates,
  expect,
  HUMAN_GOAL,
  seedBusyDesk,
  seedDeliverPending,
  seedDeliverReady,
  test,
} from "./helpers";

const ASSIGN_RE = /指派给|派活|assign to|assign desk/i;
const DRAG_RE = /拖到工位|drag-dispatch|drag to desk|drag.?assign/i;
const START_RUN_RE = /开始跑|start run|start-run|dispatch now/i;
const DISPATCH_CONSOLE_RE = /指派给|拖到工位|开始跑|派活|assign|drag-dispatch|dispatch/i;

test.describe("P0 office anti (QA-frozen names)", () => {
  test("office_home_not_inbox_wall", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverPending(baseURL!);
    await page.goto("/");
    await expect(page.locator("header.top h1")).toHaveText("AI 办公室");
    await expect(page.getByTestId("office-shell")).toBeVisible();
    await expect(page.getByTestId("goals-panel")).toBeVisible();
    await expect(page.getByTestId("create-goal")).toBeVisible();
    await expect(page.getByTestId("goal-list")).toBeVisible();
    await expect(page.getByTestId("goal-card").first()).toBeVisible();
    await expect(page.getByTestId("fill-slots").first()).toBeVisible();
    const roster = page.getByTestId("roster");
    await expect(roster).toBeVisible();
    await expect(roster).toHaveAttribute("data-readonly", "true");
    await expect(page.getByTestId("desks-entry")).toContainText("工位心跳");
    await expect(page.getByTestId("inbox-drawer")).toHaveAttribute("data-open", "false");
    await expect(page.getByTestId("inbox-heading")).not.toBeVisible();
    await expect(page.getByTestId("gate-inbox")).not.toBeVisible();
  });

  test("inbox_is_drawer_not_home", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverReady(baseURL!);
    await page.goto("/");
    await expect(page.locator("header.top h1")).toHaveText("AI 办公室");
    await expect(page.getByTestId("office-shell")).toBeVisible();
    await expect(page.getByTestId("inbox-drawer")).toHaveAttribute("data-open", "false");
    await page.getByTestId("open-inbox").click();
    await expect(page.getByTestId("inbox-drawer")).toHaveAttribute("data-open", "true");
    await expect(page.getByTestId("gate-inbox")).toBeVisible();
    await expect(page.getByTestId("office-shell")).toBeVisible();
    await expect(page.getByTestId("goals-panel")).toBeVisible();
    await expect(page.getByTestId("inbox-heading")).toHaveText(/待办/);
    await expect(page.getByTestId("decide-pass")).toHaveText("通过");
    await expect(page.getByTestId("decide-revise")).toHaveText("打回重做");
    await expect(page.getByTestId("decide-defer")).toHaveText("稍后处理");
    await expect(page.getByTestId("gate-title")).toHaveText(HUMAN_GOAL.deliver);
    await page.goto("/inbox");
    await expect(page.getByTestId("inbox-drawer")).toHaveAttribute("data-open", "true");
    await expect(page.getByTestId("office-shell")).toBeVisible();
    await expect(page.locator("header.top h1")).toHaveText("AI 办公室");
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
    expect(rosterText).not.toMatch(/owner|指派|派工/i);
    await expect(page.getByRole("button", { name: /指派给|assign/i })).toHaveCount(0);
  });

  test("office_no_drag_dispatch", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverPending(baseURL!);
    await seedBusyDesk(baseURL!);
    await page.goto("/");
    await expect(page.getByTestId("roster")).toBeVisible();
    await expect(page.getByTestId("fill-slots").first()).toBeVisible();
    await expect(page.locator("[draggable='true']")).toHaveCount(0);
    await expect(page.getByTestId("desk-row").first()).toHaveAttribute("draggable", "false");
    await expect(page.getByTestId("fill-slot").first()).toHaveAttribute("draggable", "false");
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
    const slots = page.getByTestId("fill-slots").first();
    await expect(slots.getByRole("button")).toHaveCount(0);
    const roster = page.getByTestId("roster");
    await expect(roster.getByRole("button")).toHaveCount(0);
  });

  test("fill_board_not_dispatch_console", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverPending(baseURL!);
    await page.goto("/");
    const board = page.getByTestId("fill-slots").first();
    await expect(board).toBeVisible();
    await expect(page.getByTestId("fill-slot").first()).toBeVisible();
    await expect(page.getByTestId("slot-filler").first()).toBeVisible();
    await expect(page.getByTestId("slot-progress").first()).toBeVisible();
    await expect(board.getByRole("button")).toHaveCount(0);
    await expect(board.locator("[draggable='true']")).toHaveCount(0);
    const text = await board.innerText();
    expect(text).not.toMatch(DISPATCH_CONSOLE_RE);
    expect(text).toMatch(/还没人填|同事在填|填到|等同事接手|交付同事|Cursor 同事/);
  });
});
