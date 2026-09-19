import { describe, expect, it } from "vitest";
import { isHumanTitle, sanitizeCardTitle } from "./cardTitle";

describe("sanitizeCardTitle", () => {
  it("keeps a human Goal name", () => {
    expect(sanitizeCardTitle({ title: "交付季度报告" })).toBe("交付季度报告");
  });

  it("rejects e2e / g-… / UUID and falls back to summary or 未命名目标", () => {
    expect(isHumanTitle("e2e pending g-1789786901848-a5tcbi")).toBe(false);
    expect(sanitizeCardTitle({ title: "e2e pending g-1789786901848-a5tcbi" })).toBe("未命名目标");
    expect(
      sanitizeCardTitle({
        title: "e2e pending g-1",
        summary: "交付季度报告",
      }),
    ).toBe("交付季度报告");
    expect(sanitizeCardTitle({ title: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" })).toBe("未命名目标");
  });
});
