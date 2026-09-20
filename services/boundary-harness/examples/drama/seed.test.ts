import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEMO_ID,
  createDemoProject,
  guessTitle,
  inferCast,
  placeholderShots,
  projectShotCount,
  seedProject,
  splitEpisodes,
} from "./seed.js";

const here = dirname(fileURLToPath(import.meta.url));
const pageHtml = readFileSync(join(here, "index.html"), "utf8");
const appJs = readFileSync(join(here, "app.js"), "utf8");

describe("drama MVP slice", () => {
  it("demo project is guest-browsable with script, cast, and shots", () => {
    const demo = createDemoProject();
    expect(demo.id).toBe(DEMO_ID);
    expect(demo.guest).toBe(true);
    expect(demo.sourceText).toContain("丧尸清道夫");
    expect(demo.episodes.length).toBeGreaterThanOrEqual(3);
    expect(demo.characters.length).toBeGreaterThanOrEqual(3);
    expect(demo.characters.every((c) => c.name && c.desc)).toBe(true);
    expect(demo.episodes.every((ep) => ep.shots.length >= 3)).toBe(true);
    expect(projectShotCount(demo)).toBeGreaterThanOrEqual(9);
    expect(pageHtml).toContain("开始创作");
    expect(pageHtml).toContain("./app.js");
    expect(appJs).toContain("无需登录");
    expect(appJs).toMatch(/剧本|角色|分镜|预览/);
  });

  it("pasting inspiration seeds episodes and placeholder shots", () => {
    const project = seedProject({ sourceText: "便利店夜班听到冷柜里有人敲门" });
    expect(project.guest).toBe(true);
    expect(project.episodes).toHaveLength(3);
    expect(project.episodes[0].shots.length).toBeGreaterThanOrEqual(3);
    expect(project.characters.length).toBeGreaterThanOrEqual(2);
    expect(project.characters.some((c) => /店员|夜班/.test(c.name))).toBe(true);
  });

  it("pasting a script with 第N集 splits outlines", () => {
    const project = seedProject({
      sourceText: [
        "第1集 钩子",
        "门开了一条缝。",
        "第2集 反转",
        "缝里伸出的不是手。",
        "第3集 悬置",
        "对讲机要她不要回头。",
      ].join("\n"),
    });
    expect(project.episodes.map((ep) => ep.title).join(" ")).toMatch(/钩子/);
    expect(project.episodes).toHaveLength(3);
    expect(splitEpisodes("一句灵感").map((ep) => ep.title)).toEqual([
      "第1集 · 钩子",
      "第2集 · 反转",
      "第3集 · 悬置",
    ]);
  });

  it("infers a title and placeholder shots without a model", () => {
    expect(guessTitle("雨夜便利店\n第二行")).toBe("雨夜便利店");
    expect(inferCast("高考成绩条", "高考那年").some((c) => c.name === "班主任")).toBe(true);
    const shots = placeholderShots({ title: "第1集 · 钩子" }, 0);
    expect(shots[0].size).toBe("远景");
    expect(shots.every((s) => s.duration >= 2 && s.prompt.length > 4)).toBe(true);
    expect(() => seedProject({ sourceText: "   " })).toThrow(/source_required/);
  });
});
