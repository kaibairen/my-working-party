import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clickPass, drainReadyGates, expect, seedDeliverReady, shotDir, test } from "./helpers";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const evidenceDir = join(dirname(fileURLToPath(import.meta.url)), "../../evidence");
mkdirSync(evidenceDir, { recursive: true });

test.describe("Decision-maker shell", () => {
  test("decision_maker_shell_has_no_openapi_link", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("AI 办公室");
    await expect(page.getByTestId("board-title")).toContainText("待我拍板");
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
    await expect(page.getByTestId("gate-id")).toHaveText(ready.gate!.id);
    await page.screenshot({ path: join(shotDir, "inbox_card_title_not_uuid.png"), fullPage: true });
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
    await expect(page.getByTestId("gate-title")).toBeVisible();
    await expect(page.getByTestId("gate-title")).not.toHaveText(UUID_RE);
    await page.screenshot({ path: join(evidenceDir, "inbox_one_card_human.png"), fullPage: true });
    await page.screenshot({ path: join(shotDir, "inbox_one_card_human.png"), fullPage: true });

    await clickPass(page);
    await expect(page.getByTestId("inbox-flash")).toContainText("已通过。");
    await expect(page.getByTestId("inbox-flash")).not.toHaveText(UUID_RE);
    await expect(page.getByTestId("inbox-empty")).toBeVisible();
    await page.screenshot({ path: join(evidenceDir, "inbox_after_pass_quiet.png"), fullPage: true });
    await page.screenshot({ path: join(shotDir, "inbox_after_pass_quiet.png"), fullPage: true });
  });
});
