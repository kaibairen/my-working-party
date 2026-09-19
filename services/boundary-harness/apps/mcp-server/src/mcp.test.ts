import { describe, expect, it } from "vitest";
import { MCP_TOOL_NAMES } from "@harness/domain";
import { callTool, listTools } from "./index";

describe("MCP M1 surface", () => {
  it("exposes PRD aliases and denylists raw Cursor / set_steps", () => {
    const names = listTools().map((t) => t.name);
    expect(names).toEqual([...MCP_TOOL_NAMES]);
    expect(names).toContain("harness_fill_assignment");
    expect(names).toContain("harness_propose_assignment");
    expect(names).toContain("harness_dispatch");
    expect(names).toContain("harness_dispatch_assignment");
    expect(names).toContain("harness_get_run");
    expect(names).toContain("harness_get_status");
    expect(names).toContain("harness_list_ready_gates");
    expect(names.some((n) => n.includes("cursor_raw"))).toBe(false);
    expect(names).not.toContain("set_steps");
  });

  it("rejects cursor_raw / set_steps calls", async () => {
    await expect(callTool("cursor_raw_launch", {}, {})).rejects.toThrow(/not registered/);
    await expect(callTool("set_steps", {}, {})).rejects.toThrow(/not registered/);
  });
});
