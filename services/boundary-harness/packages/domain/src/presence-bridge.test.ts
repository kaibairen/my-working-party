import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  asciiActor,
  heartbeatPayload,
  mapOfficeGroup,
  scanAgentDirs,
  shouldSkipAgentDir,
} from "../../../scripts/presence-bridge.mjs";

function writeAgent(root: string, dir: string, files: Record<string, unknown>) {
  const path = join(root, dir);
  mkdirSync(path, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(path, name), typeof body === "string" ? body : JSON.stringify(body, null, 2));
  }
  return path;
}

describe("presence-bridge agent-data scan", () => {
  it("skips channels with group.json and placeholder / fake names", () => {
    const root = mkdtempSync(join(tmpdir(), "presence-bridge-"));
    const channel = writeAgent(root, "chan-2048", {
      "profile.json": { name: "2048工作组" },
      "group.json": { memberIds: ["cto"] },
    });
    expect(shouldSkipAgentDir(channel, "2048工作组")).toEqual({ skip: true, reason: "group.json" });
    expect(shouldSkipAgentDir(writeAgent(root, "new-one", { "profile.json": { name: "New Agent" } }), "New Agent")).toEqual({
      skip: true,
      reason: "new_placeholder",
    });
    expect(shouldSkipAgentDir(writeAgent(root, "empty", { "profile.json": { name: "  " } }), "  ")).toEqual({
      skip: true,
      reason: "empty_name",
    });
    expect(shouldSkipAgentDir(writeAgent(root, "fake", { "profile.json": { name: "交付同事" } }), "交付同事")).toEqual({
      skip: true,
      reason: "fake_colleague",
    });
    const bot = writeAgent(root, "cto", { "profile.json": { name: "CTO统筹bot" } });
    expect(shouldSkipAgentDir(bot, "CTO统筹bot")).toEqual({ skip: false, reason: "" });
  });

  it("maps 2048 members, Harness* developers, and bot harness section", () => {
    expect(mapOfficeGroup({}, "CTO统筹bot")).toBe("2048工作组");
    expect(mapOfficeGroup({}, "HarnessQA")).toBe("2048工作组");
    expect(mapOfficeGroup({}, "HarnessBackendDev")).toBe("harness开发");
    expect(mapOfficeGroup({ section: "bot harness" }, "Someone")).toBe("2048工作组");
    expect(mapOfficeGroup({ group: "harness" }, "Someone")).toBe("harness开发");
    expect(mapOfficeGroup({}, "闲逛 Bot")).toBe("其他");
  });

  it("scanAgentDirs heartbeats only real bots and never invents colleague names", () => {
    const root = mkdtempSync(join(tmpdir(), "presence-scan-"));
    writeAgent(root, "chan-2048", {
      "profile.json": { name: "2048工作组" },
      "group.json": { memberIds: ["a"] },
    });
    writeAgent(root, "new-bot", { "profile.json": { name: "New Friend" } });
    writeAgent(root, "cto", { "profile.json": { name: "CTO统筹bot", section: "bot harness" } });
    writeAgent(root, "hdev", { "profile.json": { display_name: "HarnessBackendDev" } });
    const scanned = scanAgentDirs(root);
    expect(scanned.filter((a) => a.skip).map((a) => a.reason).sort()).toEqual(["group.json", "new_placeholder"]);
    const live = scanned.filter((a) => !a.skip);
    expect(live.map((a) => a.displayName).sort()).toEqual(["CTO统筹bot", "HarnessBackendDev"]);
    expect(live.find((a) => a.displayName === "CTO统筹bot")?.group).toBe("2048工作组");
    expect(live.find((a) => a.displayName === "HarnessBackendDev")?.group).toBe("harness开发");
    expect(JSON.stringify(live)).not.toMatch(/交付同事|Cursor 同事/);
    expect(heartbeatPayload(live[0]!).kind).toBe("bot");
    expect(asciiActor("cto", "CTO统筹bot")).toBe("cto");
  });
});
