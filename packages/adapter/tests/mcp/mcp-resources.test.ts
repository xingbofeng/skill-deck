import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";

import type { AgenticSkill } from "../../src/core/types";
import { readMcpResource, toMcpResources } from "../../src/mcp/resources";
import { generateSkillShare } from "../../src/runtime/share";

const sample: AgenticSkill = {
  id: "sample@11111111",
  name: "sample",
  description: "sample desc",
  tags: ["t1"],
  dependencies: ["d1"],
  whenToUse: ["w1"],
  relatedSkills: [],
  hasExamples: false,
  exampleFiles: [],
  category: "utility",
  complexity: "beginner",
  path: "/tmp/sample",
  bodyPath: "/tmp/sample/skill.md",
  valid: true,
  warnings: [],
  errors: []
};

function pngWithDimensions(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(45);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  bytes.writeUInt32BE(0, 29);
  bytes.writeUInt32BE(0, 33);
  bytes.write("IEND", 37, "ascii");
  bytes.writeUInt32BE(0, 41);
  return bytes;
}

describe("MCP resources", () => {
  test("includes catalog and encoded id resources", () => {
    const resources = toMcpResources([sample]);
    expect(resources.map((resource) => resource.uri)).toEqual([
      "skill://catalog",
      "skill://stats",
      "skill://id/sample%4011111111",
      "share://template/page",
      "share://template/cover",
      "share://template/detail"
    ]);
  });

  test("reads catalog object, stats json and skill markdown", async () => {
    const readFile = async () => "# markdown";
    const catalog = await readMcpResource("skill://catalog", [sample], readFile);
    expect(catalog.mimeType).toBe("application/json");
    expect(JSON.parse(catalog.text)).toMatchObject({
      version: 1,
      stats: {
        total: 1,
        valid: 1,
        invalid: 0
      },
      skills: [
        {
          id: "sample@11111111",
          uri: "skill://id/sample%4011111111"
        }
      ]
    });

    const stats = await readMcpResource("skill://stats", [sample], readFile);
    expect(JSON.parse(stats.text)).toEqual({
      total: 1,
      valid: 1,
      invalid: 0,
      byCategory: { utility: 1 },
      byComplexity: { beginner: 1 }
    });

    const body = await readMcpResource("skill://id/sample%4011111111", [sample], readFile);
    expect(body.mimeType).toBe("text/markdown");
    expect(body.text).toBe("# markdown");
  });

  test("reads only declared skill files through file resources", async () => {
    const root = "/tmp/sample";
    const withFiles: AgenticSkill = {
      ...sample,
      path: root,
      bodyPath: path.join(root, "skill.md"),
      exampleFiles: ["references/guide.md"],
      metadata: {
        references: ["docs/reference.md"]
      }
    };
    const seen: string[] = [];
    const readFile = async (filePath: string) => {
      seen.push(filePath);
      return "# declared";
    };

    const resource = await readMcpResource(
      "skill://id/sample%4011111111/file/references%2Fguide.md",
      [withFiles],
      readFile
    );

    expect(resource).toEqual({
      mimeType: "text/markdown",
      text: "# declared"
    });
    expect(seen).toEqual([path.join(root, "references/guide.md")]);
  });

  test("rejects undeclared or escaping skill file resources", async () => {
    const root = "/tmp/sample";
    const withFiles: AgenticSkill = {
      ...sample,
      path: root,
      bodyPath: path.join(root, "skill.md"),
      exampleFiles: ["references/guide.md"]
    };

    await expect(
      readMcpResource(
        "skill://id/sample%4011111111/file/private.md",
        [withFiles],
        async () => "private"
      )
    ).rejects.toThrow("not declared");

    await expect(
      readMcpResource(
        "skill://id/sample%4011111111/file/..%2Fsecret.md",
        [withFiles],
        async () => "secret"
      )
    ).rejects.toThrow("invalid resource path");
  });

  test("rejects declared binary skill file resources", async () => {
    const root = "/tmp/sample";
    const withFiles: AgenticSkill = {
      ...sample,
      path: root,
      bodyPath: path.join(root, "skill.md"),
      exampleFiles: ["assets/image.png"]
    };

    await expect(
      readMcpResource(
        "skill://id/sample%4011111111/file/assets%2Fimage.png",
        [withFiles],
        async () => "\u0000PNG"
      )
    ).rejects.toThrow("binary resource files are not supported");
  });

  test("reads share template resources", async () => {
    const page = await readMcpResource("share://template/page", [sample]);
    const cover = await readMcpResource("share://template/cover", [sample]);
    const detail = await readMcpResource("share://template/detail", [sample]);

    expect(page).toMatchObject({
      mimeType: "text/html",
      text: expect.stringContaining("SkillDeck")
    });
    expect(page.text).toContain('type="search"');
    expect(page.text).toContain("data-skill-card");
    expect(page.text).not.toContain("share template</p>");
    expect(cover.text).toContain('data-template="cover"');
    expect(cover.text).toContain("github.com/xingbofeng/skill-deck");
    expect(cover.text).toContain("cover.png");
    expect(detail.text).toContain('data-template="detail"');
    expect(detail.text).toContain("detail.png");
    expect(detail.text).toContain("完整详情见 HTML");
  });

  test("reads generated share artifact resources from allowed output roots", async () => {
    const outRoot = await mkdtemp(path.join(tmpdir(), "skilldeck-resource-share-"));
    const generated = await generateSkillShare({
      skills: [{ skill: sample, body: "sample body" }],
      outDir: outRoot,
      renderImage: async (_htmlPath, pngPath, viewport) => {
        await writeFile(pngPath, pngWithDimensions(viewport.width, viewport.height));
      }
    });

    const manifest = await readMcpResource(
      `share://artifact/${generated.artifactId}/manifest`,
      [sample],
      undefined,
      { shareOutputRoots: [outRoot] }
    );
    expect(manifest.mimeType).toBe("application/json");
    expect(JSON.parse(manifest.text)).toMatchObject({
      artifactId: generated.artifactId,
      skillCount: 1
    });

    const html = await readMcpResource(
      `share://artifact/${generated.artifactId}/index.html`,
      [sample],
      undefined,
      { shareOutputRoots: [outRoot] }
    );
    expect(html).toMatchObject({
      mimeType: "text/html",
      text: expect.stringContaining("sample")
    });
  });
});
