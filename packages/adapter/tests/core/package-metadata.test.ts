import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("package metadata", () => {
  test("uses SkillDeck npm package name", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));

    expect(pkg.name).toBe("skill-deck");
    expect(pkg.mcpName).toBe("io.github.xingbofeng/skill-deck");
    expect(pkg.bin).toMatchObject({ "skill-deck": "./dist/cli/index.js" });
  });

  test("ships the share image renderer browser as an install dependency", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));

    expect(pkg.dependencies).toHaveProperty("puppeteer");
    expect(pkg.dependencies).toHaveProperty("eta");
    expect(pkg.devDependencies ?? {}).not.toHaveProperty("puppeteer");
    expect(pkg.devDependencies ?? {}).not.toHaveProperty("eta");
  });
});
