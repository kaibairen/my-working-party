import { join } from "node:path";
import {
  drainReadyGates,
  expect,
  seedDeliverPending,
  seedDeliverReady,
  seedHeartbeat,
  shotDir,
  test,
} from "./helpers";

test.describe("E2E one-click human attach", () => {
  test("one_click_attach_ui_dm_only", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    const pending = await seedDeliverPending(baseURL!, "待补证据周报");
    const ready = await seedDeliverReady(baseURL!);
    expect(pending.run?.id).toBeTruthy();
    expect(ready.run?.id).toBeTruthy();
    await seedHeartbeat(baseURL!, {
      actor: "bot-attach",
      display_name: "周报 Bot",
      pool_id: "pool_noop",
      group: "harness",
    });

    await page.goto("/");
    await expect(page.locator("body")).toHaveAttribute("data-shell-role", "decision_maker");
    await expect(page.locator("body")).toHaveAttribute("data-human-attach", "true");
    await expect(page.getByTestId("roster").getByTestId("attach-from-file")).toHaveCount(0);
    await expect(page.getByTestId("desk-row").getByTestId("attach-from-file")).toHaveCount(0);

    const pendingCard = page.getByTestId("goal-card").filter({ hasText: "待补证据周报" });
    await pendingCard.click();
    const goalAttach = pendingCard.getByTestId("attach-from-file");
    await expect(goalAttach).toBeVisible();
    await expect(goalAttach).toHaveText("从附件入账");
    await expect(pendingCard.getByTestId("attach-hint")).toContainText("Bot 回写请戴 MCP 手套");

    await page.getByTestId("open-inbox").click();
    const drawer = page.getByTestId("inbox-drawer");
    await expect(drawer).toHaveClass(/open/);
    const drawerBtn = drawer.getByTestId("attach-from-file").first();
    await expect(drawerBtn).toBeVisible();
    await expect(drawerBtn).toHaveText("从附件入账");
    await expect(drawer.getByTestId("evidence-area").first()).toBeVisible();
    await page.screenshot({ path: join(shotDir, "one_click_attach_dm_drawer.png"), fullPage: true });

    await page.goto("/inbox");
    const inboxBtn = page.getByTestId("attach-from-file").first();
    await expect(inboxBtn).toBeVisible();
    await inboxBtn.click();
    await expect(page.getByTestId("attach-dialog")).toBeVisible();
    await expect(page.getByTestId("attach-kind")).toHaveValue("summary_md");
    await expect(page.locator("#attach-kind option[value='summary_md']")).toHaveAttribute(
      "data-required",
      "true",
    );
    await expect(page.locator("#attach-kind option[value='summary_md']")).toContainText("门禁要");
    await expect(page.locator("#attach-kind option[value='summary_md']")).toContainText("结论摘要");

    await page.getByTestId("attach-file").setInputFiles({
      name: "summary.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# 结论\n人补挂\n"),
    });

    const attachReq = page.waitForRequest(
      (req) => req.method() === "POST" && /\/v1\/runs\/[^/]+\/evidence$/.test(new URL(req.url()).pathname),
    );
    await page.getByTestId("attach-confirm").click();
    const req = await attachReq;
    expect(req.headers()["authorization"]).toMatch(/^Bearer decision_maker:/);
    expect(req.headers()["x-harness-entry"]).toBeUndefined();
    expect(req.headers()["x-harness-role"]).toBe("decision_maker");
    const posted = req.postDataJSON() as { items?: Array<{ kind?: string; uri?: string }> };
    expect(posted.items?.[0]?.kind).toBe("summary_md");
    expect(posted.items?.[0]?.uri).toBe("file://summary.md");

    await expect(page.getByTestId("attach-dialog")).toBeHidden();
    await expect(page.getByTestId("evidence-item").filter({ hasText: "summary.md" }).first()).toBeVisible();
    await page.screenshot({ path: join(shotDir, "one_click_attach_dm_success.png"), fullPage: true });

    await page.goto("/?role=executor");
    await expect(page.locator("body")).toHaveAttribute("data-shell-role", "executor");
    await expect(page.locator("body")).toHaveAttribute("data-human-attach", "false");
    await expect(page.getByTestId("attach-from-file")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "从附件入账" })).toHaveCount(0);

    await page.goto("/inbox?role=executor");
    await expect(page.locator("body")).toHaveAttribute("data-shell-role", "executor");
    await expect(page.getByTestId("attach-from-file")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "从附件入账" })).toHaveCount(0);
    await page.screenshot({ path: join(shotDir, "one_click_attach_hidden_executor.png"), fullPage: true });
  });

  test("fill_ui_prompts_missing_summary_md", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverPending(baseURL!, "提示结论摘要");
    await page.goto("/");
    const card = page.getByTestId("goal-card").filter({ hasText: "提示结论摘要" });
    await expect(card.getByTestId("attach-from-file")).toBeVisible();
    await card.getByTestId("attach-from-file").click();
    await expect(page.getByTestId("attach-dialog")).toBeVisible();
    await expect(page.getByTestId("attach-kind")).toHaveValue("summary_md");
    const summaryOpt = page.locator("#attach-kind option[value='summary_md']");
    await expect(summaryOpt).toContainText("结论摘要");
    await expect(summaryOpt).toContainText("summary_md");
    await expect(summaryOpt).toContainText("门禁要");
    await expect(summaryOpt).toHaveAttribute("data-required", "true");

    await page.getByTestId("attach-kind").selectOption("report_md");
    await page.getByTestId("attach-file").setInputFiles({
      name: "report.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# 报告\n"),
    });
    await page.route("**/v1/runs/*/evidence", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          code: "predicate_evidence_mismatch",
          message: "Brief evidence_shape is missing kinds required by the GateDef predicate: summary_md.",
          missing_kinds: ["summary_md"],
          required_kinds: ["summary_md"],
          details: { missing_kinds: ["summary_md"], required_kinds: ["summary_md"] },
        }),
      });
    });
    await page.getByTestId("attach-confirm").click();
    await expect(page.getByTestId("attach-error")).toBeVisible();
    await expect(page.getByTestId("attach-error")).toContainText("还差：结论摘要");
    await expect(page.getByTestId("attach-error")).toContainText("summary_md");
    await page.screenshot({ path: join(shotDir, "fill_ui_prompts_missing_summary_md.png"), fullPage: true });
  });
});
