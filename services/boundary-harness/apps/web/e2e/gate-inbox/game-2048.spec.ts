import { expect, test } from "./helpers";

const filledTiles = (page: { locator: (sel: string) => { filter: (opts: { hasNotText: RegExp }) => unknown } }) =>
  page.locator('[data-testid="tile"]').filter({ hasNotText: /^$/ });

test.describe("QA 2048 freeze", () => {
  test("game_2048_loads_playable", async ({ page }) => {
    await page.goto("/examples/2048/");
    await expect(page.locator("h1")).toHaveText("2048");
    await expect(page.getByTestId("board")).toBeVisible();
    await expect(page.getByTestId("new-game")).toBeVisible();
    await expect(page.getByTestId("score")).toHaveText("0");
    await expect(filledTiles(page)).toHaveCount(2);
  });

  test("game_2048_moves", async ({ page }) => {
    await page.goto("/examples/2048/");
    await page.getByTestId("board").click();
    const snapshot = () =>
      page.locator('[data-testid="tile"]').evaluateAll((els) => els.map((el) => el.textContent));
    const before = await snapshot();
    for (const key of ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"] as const) {
      await page.keyboard.press(key);
      const after = await snapshot();
      if (JSON.stringify(after) !== JSON.stringify(before)) return;
    }
    throw new Error("2048 board did not change after arrow keys");
  });

  test("game_2048_score_updates", async ({ page }) => {
    await page.goto("/examples/2048/");
    await page.getByTestId("board").click();
    for (let i = 0; i < 48; i += 1) {
      for (const key of ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"] as const) {
        await page.keyboard.press(key);
        if ((await page.getByTestId("score").innerText()) !== "0") {
          await expect(page.getByTestId("score")).not.toHaveText("0");
          return;
        }
      }
    }
    throw new Error("2048 score stayed 0 after arrow moves");
  });

  test("game_2048_new_game_resets", async ({ page }) => {
    await page.goto("/examples/2048/");
    await page.getByTestId("board").click();
    for (const key of ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"] as const) {
      await page.keyboard.press(key);
    }
    await page.getByTestId("new-game").click();
    await expect(page.getByTestId("score")).toHaveText("0");
    await expect(filledTiles(page)).toHaveCount(2);
  });
});
