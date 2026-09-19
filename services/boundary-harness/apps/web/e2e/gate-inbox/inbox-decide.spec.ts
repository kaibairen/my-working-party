import { join } from "node:path";
import { api, drainReadyGates, expect, headers, seedDeliverReady, shotDir, test } from "./helpers";

test.describe("E2E decide", () => {
  test("decide_pass_uses_version", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    const ready = await seedDeliverReady(baseURL!);
    expect(ready.gate?.id).toBeTruthy();

    await page.goto("/inbox");
    await expect(page.getByTestId("gate-card")).toHaveCount(1);

    const decideReq = page.waitForRequest(
      (req) => req.method() === "POST" && req.url().includes(`/v1/gates/${ready.gate!.id}/decide`),
    );
    await page.getByTestId("decide-pass").click();
    const req = await decideReq;
    const body = req.postDataJSON() as Record<string, unknown>;
    expect(body.decision).toBe("pass");
    expect(body.version).toBe(ready.gate!.version);
    expect(body).not.toHaveProperty("expected_version");
    expect(typeof body.version).toBe("number");

    await expect(page.getByTestId("inbox-flash")).toContainText(/已通过/);
    await expect(page.getByTestId("gate-card")).toHaveCount(0);
    await page.screenshot({ path: join(shotDir, "e2e10_decide_pass_uses_version.png"), fullPage: true });
  });

  test("decide_revise_default_same_assignment", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    const ready = await seedDeliverReady(baseURL!);
    const assignmentId = ready.gate?.assignment_id ?? ready.assignment.id;

    await page.goto("/inbox");
    const decideReq = page.waitForRequest(
      (req) => req.method() === "POST" && req.url().includes(`/v1/gates/${ready.gate!.id}/decide`),
    );
    const decideRes = page.waitForResponse(
      (res) => res.request().method() === "POST" && res.url().includes(`/v1/gates/${ready.gate!.id}/decide`),
    );
    await page.getByTestId("decide-revise").click();
    const req = await decideReq;
    const body = req.postDataJSON() as Record<string, unknown>;
    expect(body.decision).toBe("revise");
    expect(body.structural_change === false || body.structural_change === undefined).toBe(true);
    expect(body.version).toBe(ready.gate!.version);

    const json = (await (await decideRes).json()) as { follow_up?: { assignment_id?: string } };
    expect(json.follow_up?.assignment_id ?? assignmentId).toBe(assignmentId);

    await expect(page.getByTestId("inbox-flash")).toContainText(/已打回重做|已通过|已稍后处理/);
    await expect(page.locator(`[data-testid="gate-card"][data-id="${ready.gate!.id}"]`)).toHaveCount(0);
    await page.screenshot({ path: join(shotDir, "e2e11_decide_revise_same_assignment.png"), fullPage: true });
  });

  test("decide_optimistic_lock_409_refresh", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    const ready = await seedDeliverReady(baseURL!);

    await page.goto("/inbox");
    await expect(page.getByTestId("gate-card")).toHaveCount(1);

    const uiDecidePosts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes(`/v1/gates/${ready.gate!.id}/decide`)) {
        uiDecidePosts.push(req.postData() ?? "");
      }
    });

    const conflict = await api(baseURL!, `/v1/gates/${ready.gate!.id}/decide`, {
      method: "POST",
      headers: headers.decisionMaker,
      body: JSON.stringify({ decision: "pass", version: ready.gate!.version }),
    });
    expect(conflict.status).toBe(200);

    await page.getByTestId("decide-pass").click();
    await expect(page.getByTestId("inbox-flash")).toContainText(/这条已有人处理，已为你刷新/);
    await expect(page.getByTestId("inbox-flash")).toHaveClass(/conflict/);
    await expect(page.getByTestId("gate-card")).toHaveCount(0);

    expect(uiDecidePosts).toHaveLength(1);
    const posted = JSON.parse(uiDecidePosts[0] || "{}") as { version?: number; decision?: string };
    expect(posted.version).toBe(ready.gate!.version);
    expect(posted.decision).toBe("pass");
    await page.screenshot({ path: join(shotDir, "e2e12_decide_optimistic_lock_409.png"), fullPage: true });
  });
});
