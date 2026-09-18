import { expect, type Page } from "@playwright/test";
import { HIDDEN_NON_READY_GATES, INITIAL_MOCK_GATES } from "../../src/data/mockGates";
import type { GateDecideRequest, GateInstance } from "../../src/types/gate";

export type CapturedDecide = { id: string; body: GateDecideRequest };

export function cloneDomainStore(): GateInstance[] {
  return [...INITIAL_MOCK_GATES, ...HIDDEN_NON_READY_GATES].map((g) => ({
    ...g,
    ready_result_json: {
      ...g.ready_result_json,
      missing: [...g.ready_result_json.missing],
    },
  }));
}

export async function installDomainStub(page: Page, store: GateInstance[]) {
  const captured = {
    listQueries: [] as string[],
    decides: [] as CapturedDecide[],
  };

  await page.route("**/v1/gates**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const parts = url.pathname.split("/").filter(Boolean);

    if (req.method() === "GET" && parts.length === 2) {
      captured.listQueries.push(url.searchParams.get("status") ?? "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: store.filter((g) => g.status === "ready") }),
      });
      return;
    }

    if (req.method() === "GET" && parts.length === 3) {
      const gate = store.find((g) => g.id === parts[2]);
      if (!gate) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ code: "not_found" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(gate),
      });
      return;
    }

    if (req.method() === "POST" && parts[3] === "decide") {
      const id = parts[2] ?? "";
      const body = req.postDataJSON() as GateDecideRequest;
      captured.decides.push({ id, body });
      const gate = store.find((g) => g.id === id);
      if (!gate || gate.version !== body.version) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            code: "optimistic_lock",
            message: "Gate version mismatch",
          }),
        });
        return;
      }
      gate.status = "decided";
      gate.version += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    await route.fallback();
  });

  return captured;
}

/** API source + in-page Domain stub (no live Cursor / no canvas). */
export async function openInboxApi(page: Page, store: GateInstance[]) {
  const captured = await installDomainStub(page, store);
  await page.addInitScript(() => {
    sessionStorage.removeItem("bh.gate-inbox.mock.v1");
    localStorage.setItem("bh.gate-inbox.source", "api");
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Gate Inbox" })).toBeVisible();
  return captured;
}
