import { expect, test as base, chromium, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const shotDir = join(dirname(fileURLToPath(import.meta.url)), "../../artifacts/screenshots");
mkdirSync(shotDir, { recursive: true });

const test = base.extend<{ page: Page }>({
  page: async ({ page: defaultPage }, use) => {
    if (!process.env.CDP_URL) {
      await use(defaultPage);
      return;
    }
    const browser: Browser = await chromium.connectOverCDP(process.env.CDP_URL);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = await context.newPage();
    await use(page);
    await page.close();
  },
});

async function seedReadyGate(baseURL: string) {
  const h = {
    "content-type": "application/json",
    "x-harness-role": "coordinator",
    "x-harness-actor": "coord-1",
  };
  const goal = await (await fetch(`${baseURL}/v1/goals`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ title: "Inbox demo", mode: "deliver", coordinator_ref: "coord-1" }),
  })).json();
  const asg = await (await fetch(`${baseURL}/v1/goals/${goal.id}/assignments`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      pool_id: "pool_noop",
      brief: { outcome: "demo", constraints: [], evidence_shape: ["summary_md", "artifact_uri"] },
    }),
  })).json();
  const run = await (await fetch(`${baseURL}/v1/assignments/${asg.id}/dispatch`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ idempotency_key: `e2e-${Date.now()}` }),
  })).json();
  await fetch(`${baseURL}/v1/runs/${run.id}/evidence`, {
    method: "POST",
    headers: { ...h, "x-harness-role": "executor", "x-harness-actor": "exec-1" },
    body: JSON.stringify({
      items: [
        { kind: "summary_md", uri: "file://summary.md" },
        { kind: "artifact_uri", uri: "file://out.tgz" },
      ],
    }),
  });
  return { goal, run };
}

test("Gate Inbox lists ready gate, shows missing[], decide pass", async ({ page, baseURL }) => {
  await seedReadyGate(baseURL!);

  await page.goto("/ops");
  await expect(page.locator("#health")).toContainText("schema_version");
  await page.screenshot({ path: join(shotDir, "health_openapi.png"), fullPage: true });

  await page.goto("/inbox");
  await expect(page.getByTestId("inbox-heading")).toContainText("待我拍板");
  await expect(page.locator(".card").first()).toBeVisible();
  await expect(page.getByTestId("gate-title")).toHaveText(/Inbox demo/);
  await expect(page.getByTestId("decide-pass")).toHaveText("通过");
  await page.screenshot({ path: join(shotDir, "gate_inbox_ready.png"), fullPage: true });

  await page.getByTestId("decide-pass").click();
  await page.getByTestId("decide-pass-confirm").click();
  await expect(page.locator("#flash")).toContainText("已通过");
  await page.screenshot({ path: join(shotDir, "gate_decide_success.png"), fullPage: true });
});
