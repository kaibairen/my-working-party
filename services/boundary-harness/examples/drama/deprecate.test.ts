import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const readme = readFileSync(join(here, "README.md"), "utf8");
const pageHtml = readFileSync(join(here, "index.html"), "utf8");

describe("drama example is a deprecated pointer", () => {
  it("README states product moved to video-copilot and must not grow here", () => {
    expect(readme).toContain("DEPRECATED");
    expect(readme).toContain("https://github.com/kaibairen/video-copilot");
    expect(readme).toMatch(/不再长功能|do not grow/i);
    expect(readme).toContain("kaibairen/my-working-party");
    expect(readme).not.toMatch(/请先登录|login required/i);
  });

  it("stub page points at video-copilot without a login wall", () => {
    expect(pageHtml).toContain("DEPRECATED");
    expect(pageHtml).toContain("https://github.com/kaibairen/video-copilot");
    expect(pageHtml).toContain("短剧工场");
    expect(pageHtml).not.toContain("./app.js");
    expect(pageHtml).not.toMatch(/请先登录|login required/i);
  });
});
