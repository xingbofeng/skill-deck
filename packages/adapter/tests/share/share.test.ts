import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import type { AgenticSkill } from "../../src/core/types";
import { createSkillHandlers } from "../../src/runtime/handlers";
import { generateSkillShare } from "../../src/runtime/share";

function skill(overrides: Partial<AgenticSkill>): AgenticSkill {
  return {
    id: "sample@11111111",
    name: "sample",
    description: "sample desc",
    tags: ["demo"],
    dependencies: [],
    whenToUse: ["share sample"],
    relatedSkills: [],
    hasExamples: false,
    exampleFiles: [],
    path: "/Users/counter/private/sample",
    bodyPath: "/Users/counter/private/sample/skill.md",
    valid: true,
    warnings: [],
    errors: [],
    ...overrides
  };
}

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

describe("Share MCP handlers", () => {
  test("default share renderer does not depend on system Chrome paths", async () => {
    const source = await readFile("packages/adapter/src/runtime/share.ts", "utf8");

    expect(source).toContain("puppeteer");
    expect(source).not.toContain("/Applications/Google Chrome.app");
    expect(source).not.toContain("google-chrome");
    expect(source).not.toContain("chromium-browser");
  });

  test("share renderer reads html templates from adapter src/template", async () => {
    const source = await readFile("packages/adapter/src/runtime/share.ts", "utf8");

    expect(source).toContain("src/template");
    expect(source).toContain("share-page.html");
    expect(source).toContain("share-cover.html");
    expect(source).toContain("share-detail.html");
    expect(source).not.toContain("packages/docs");
    expect(source).not.toContain("share-cover-template.html");
    expect(source).not.toContain("share-detail-template.html");
  });

  test("generate_skill_share writes static page and two image html sources with redaction", async () => {
    const outRoot = await mkdtemp(path.join(tmpdir(), "skilldeck-share-"));
    const handlers = createSkillHandlers({
      skills: [skill({ name: "picturebook-maker", id: "picturebook@abcdef12" })],
      includeShare: true,
      shareOutputRoots: [outRoot],
      renderShareImage: async (_htmlPath, pngPath, viewport) => {
        await writeFile(pngPath, pngWithDimensions(viewport.width, viewport.height));
      },
      readFile: async () =>
        "Use /Users/counter/private/sample and https://internal.example.com?token=secret-key"
    });

    const result = await handlers.generate_skill_share?.({
      refs: ["picturebook@abcdef12"],
      outDir: outRoot,
      audience: "同行",
      highlights: ["把本地 Skill 变成可读分享页"]
    });

    expect(result?.data).toMatchObject({
      artifactId: expect.any(String),
      files: expect.arrayContaining([
        expect.objectContaining({ kind: "html", path: expect.stringContaining("index.html"), mimeType: "text/html" }),
        expect.objectContaining({ kind: "cover", path: expect.stringContaining("cover.png"), mimeType: "image/png" }),
        expect.objectContaining({ kind: "detail", path: expect.stringContaining("detail.png"), mimeType: "image/png" })
      ]),
      skillCount: 1,
      redacted: true,
      redactionSummary: {
        paths: 1,
        privateUrls: 1,
        secrets: 0,
        truncatedBodies: 0,
        omittedChars: 0
      }
    });
    const pagePath = (
      result?.data as { files: Array<{ kind: string; path: string }> }
    ).files.find((file) => file.kind === "html")?.path;
    expect(pagePath).toBeDefined();
    const html = await readFile(pagePath as string, "utf8");
    expect(html).toContain("我整理了一套可以直接分享的 Skill 合集");
    expect(html).toContain("picturebook-maker");
    expect(html).toContain("[REDACTED_PATH]");
    expect(html).toContain("[REDACTED_URL]");
    expect(html).not.toContain("secret-key");
    const coverPath = (
      result?.data as { files: Array<{ kind: string; path: string }> }
    ).files.find((file) => file.kind === "cover")?.path;
    expect(await readFile(coverPath as string)).toEqual(pngWithDimensions(1080, 1440));
  });

  test("share image html uses the product cover and detail layouts", async () => {
    const outRoot = await mkdtemp(path.join(tmpdir(), "skilldeck-share-image-html-"));
    const renderedViewports: Array<{ width: number; height: number; fullPage?: boolean }> = [];
    const handlers = createSkillHandlers({
      skills: [
        skill({
          name: "superpowers",
          id: "superpowers@11111111",
          description: "Use disciplined workflows to plan, execute, and verify complex work.",
          tags: ["workflow"]
        }),
        skill({
          name: "agent-browser",
          id: "agent-browser@22222222",
          description: "Drive browser sessions for UI checks and local app verification.",
          tags: ["browser"]
        }),
        skill({
          name: "pptx",
          id: "pptx@33333333",
          description: "Create and refine polished presentation decks.",
          tags: ["slides"]
        })
      ],
      includeShare: true,
      shareOutputRoots: [outRoot],
      renderShareImage: async (_htmlPath, pngPath, viewport) => {
        renderedViewports.push(viewport);
        await writeFile(pngPath, pngWithDimensions(viewport.width, viewport.height));
      },
      readFile: async () => "skill body"
    });

    const result = await handlers.generate_skill_share?.({ outDir: outRoot });
    const files = (result?.data as { files: Array<{ kind: string; path: string }> }).files;
    const coverHtmlPath = path.join(path.dirname(files.find((file) => file.kind === "cover")!.path), "cover.html");
    const detailHtmlPath = path.join(path.dirname(files.find((file) => file.kind === "detail")!.path), "detail.html");
    const coverHtml = await readFile(coverHtmlPath, "utf8");
    const detailHtml = await readFile(detailHtmlPath, "utf8");

    expect(renderedViewports).toEqual([
      { width: 1080, height: 1440 },
      { width: 1080, height: 1760, fullPage: true }
    ]);
    expect(coverHtml).toContain('aria-label="SkillDeck cover image"');
    expect(coverHtml).toContain("分享我的 Skill 工作流");
    expect(coverHtml).toContain("适合想把常用 Agent 流程沉淀下来、复用起来、分享给团队的人");
    expect(coverHtml).toContain("完整说明");
    expect(coverHtml).toContain("搜索下钻");
    expect(coverHtml).toContain("安全分享");
    expect(coverHtml).not.toContain(">Adapter<");
    expect(coverHtml).not.toContain(">MCP<");
    expect(coverHtml).not.toContain(">Share<");
    expect(coverHtml).toContain("superpowers");
    expect(coverHtml).toContain("agent-browser");
    expect(coverHtml).toContain("pptx");
    expect(detailHtml).toContain('aria-label="SkillDeck detail image"');
    expect(coverHtml).toContain("SkillDeck Share Cover Template");
    expect(detailHtml).toContain("SkillDeck Share Detail Template");
    expect(detailHtml).toContain("分享我的 Skill 工作流");
    expect(detailHtml).toContain("如何复用");
    expect(detailHtml).toContain("通过 MCP 动态发现并加载");
    expect(detailHtml).not.toContain("适合分享给谁");
    expect(detailHtml).not.toContain("如何浏览");
    expect(detailHtml).not.toContain("Skill Activation 模式");
    expect(detailHtml).not.toContain(">compact<");
    expect(detailHtml).not.toContain(">guided<");
    expect(detailHtml).not.toContain(">active<");
    expect(detailHtml).not.toContain("分享安全");
    expect(detailHtml).not.toContain("# superpowers");
  });

  test("get_skill_share_artifact reads only generated artifacts under allowed roots", async () => {
    const outRoot = await mkdtemp(path.join(tmpdir(), "skilldeck-share-read-"));
    const handlers = createSkillHandlers({
      skills: [skill({ name: "sample", id: "sample@11111111" })],
      includeShare: true,
      shareOutputRoots: [outRoot],
      renderShareImage: async (_htmlPath, pngPath, viewport) => {
        await writeFile(pngPath, pngWithDimensions(viewport.width, viewport.height));
      },
      readFile: async () => "body"
    });
    const generated = await handlers.generate_skill_share?.({
      refs: ["sample@11111111"],
      outDir: outRoot
    });
    const generatedData = generated?.data as { artifactId: string };

    const read = await handlers.get_skill_share_artifact?.({
      artifactId: generatedData.artifactId,
      kind: "html"
    });
    expect(read?.data).toMatchObject({
      artifactId: generatedData.artifactId,
      kind: "html",
      mimeType: "text/html",
      text: expect.stringContaining("sample")
    });

    const png = await handlers.get_skill_share_artifact?.({
      artifactId: generatedData.artifactId,
      kind: "cover"
    });
    expect(png?.data).toMatchObject({
      artifactId: generatedData.artifactId,
      kind: "cover",
      mimeType: "image/png",
      path: expect.stringContaining("cover.png")
    });
    expect((png?.data as { text?: string }).text).toBeUndefined();

    const denied = await handlers.get_skill_share_artifact?.({
      path: "/tmp/not-allowed.html"
    });
    expect(denied?.error).toContain("outside shareOutputRoots");
  });

  test("generate_skill_share rejects outDir outside shareOutputRoots", async () => {
    const outRoot = await mkdtemp(path.join(tmpdir(), "skilldeck-share-safe-"));
    const handlers = createSkillHandlers({
      skills: [skill({ name: "sample", id: "sample@11111111" })],
      includeShare: true,
      shareOutputRoots: [outRoot],
      readFile: async () => "body"
    });

    const result = await handlers.generate_skill_share?.({
      refs: ["sample@11111111"],
      outDir: "/tmp/outside-share-root"
    });

    expect(result?.error).toContain("outside shareOutputRoots");
  });

  test("share page includes static search and per-skill detail sections for all skills", async () => {
    const outRoot = await mkdtemp(path.join(tmpdir(), "skilldeck-share-browser-"));
    const handlers = createSkillHandlers({
      skills: [
        skill({ name: "superpowers", id: "superpowers@11111111" }),
        skill({ name: "agent-browser", id: "agent-browser@22222222" })
      ],
      includeShare: true,
      shareOutputRoots: [outRoot],
      renderShareImage: async (_htmlPath, pngPath, viewport) => {
        await writeFile(pngPath, pngWithDimensions(viewport.width, viewport.height));
      },
      readFile: async (filePath) => `body from ${filePath}`
    });

    const generated = await handlers.generate_skill_share?.({ outDir: outRoot });
    const htmlPath = (
      generated?.data as { files: Array<{ kind: string; path: string }> }
    ).files.find((file) => file.kind === "html")?.path;
    const html = await readFile(htmlPath as string, "utf8");

    expect(html).toContain('type="search"');
    expect(html).toContain('data-skill-card="superpowers"');
    expect(html).toContain('data-skill-detail="agent-browser"');
    expect(html).toContain("function filterSkills");
  });

  test("share page lists declared reference paths without reading reference contents", async () => {
    const outRoot = await mkdtemp(path.join(tmpdir(), "skilldeck-share-refs-"));
    const readPaths: string[] = [];
    const handlers = createSkillHandlers({
      skills: [
        skill({
          name: "sample",
          id: "sample@11111111",
          exampleFiles: ["references/guide.md"],
          metadata: { references: ["docs/reference.md"] }
        })
      ],
      includeShare: true,
      shareOutputRoots: [outRoot],
      renderShareImage: async (_htmlPath, pngPath, viewport) => {
        await writeFile(pngPath, pngWithDimensions(viewport.width, viewport.height));
      },
      readFile: async (filePath) => {
        readPaths.push(filePath);
        return "skill body";
      }
    });

    const generated = await handlers.generate_skill_share?.({
      refs: ["sample@11111111"],
      outDir: outRoot
    });
    const htmlPath = (
      generated?.data as { files: Array<{ kind: string; path: string }> }
    ).files.find((file) => file.kind === "html")?.path;
    const html = await readFile(htmlPath as string, "utf8");

    expect(html).toContain("references/guide.md");
    expect(html).toContain("docs/reference.md");
    expect(readPaths).toEqual(["/Users/counter/private/sample/skill.md"]);
  });

  test("generate_skill_share can disable redaction and surface a warning", async () => {
    const outRoot = await mkdtemp(path.join(tmpdir(), "skilldeck-share-no-redact-"));
    const handlers = createSkillHandlers({
      skills: [skill({ name: "sample", id: "sample@11111111" })],
      includeShare: true,
      shareOutputRoots: [outRoot],
      renderShareImage: async (_htmlPath, pngPath, viewport) => {
        await writeFile(pngPath, pngWithDimensions(viewport.width, viewport.height));
      },
      readFile: async () =>
        "Use /Users/counter/private/sample and https://internal.example.com?token=secret-key"
    });

    const result = await handlers.generate_skill_share?.({
      refs: ["sample@11111111"],
      outDir: outRoot,
      redact: false
    });

    expect(result?.data).toMatchObject({
      redacted: false,
      warnings: expect.arrayContaining([expect.stringMatching(/redaction disabled/i)])
    });
    const pagePath = (
      result?.data as { files: Array<{ kind: string; path: string }> }
    ).files.find((file) => file.kind === "html")?.path;
    const html = await readFile(pagePath as string, "utf8");
    expect(html).toContain("Redaction disabled");
    expect(html).toContain("/Users/counter/private/sample");
    expect(html).toContain("https://internal.example.com?token=secret-key");
    expect(html).not.toContain("[REDACTED_PATH]");
    expect(html).not.toContain("[REDACTED_URL]");
  });

  test("share page renders case studies when provided", async () => {
    const outRoot = await mkdtemp(path.join(tmpdir(), "skilldeck-share-cases-"));
    const handlers = createSkillHandlers({
      skills: [skill({ name: "superpowers", id: "superpowers@11111111" })],
      includeShare: true,
      shareOutputRoots: [outRoot],
      renderShareImage: async (_htmlPath, pngPath, viewport) => {
        await writeFile(pngPath, pngWithDimensions(viewport.width, viewport.height));
      },
      readFile: async () => "skill body"
    });

    const result = await handlers.generate_skill_share?.({
      refs: ["superpowers@11111111"],
      outDir: outRoot,
      caseStudies: [
        {
          title: "三天搭出自动化研究流",
          result: "把日报、检索和汇总串成一个稳定流程",
          skillRefs: ["superpowers@11111111"]
        }
      ]
    });

    const pagePath = (
      result?.data as { files: Array<{ kind: string; path: string }> }
    ).files.find((file) => file.kind === "html")?.path;
    const html = await readFile(pagePath as string, "utf8");
    expect(html).toContain("三天搭出自动化研究流");
    expect(html).toContain("把日报、检索和汇总串成一个稳定流程");
    expect(html).toContain("superpowers");
  });

  test("generateSkillShare rejects renderer output that is not a complete PNG image", async () => {
    const outRoot = await mkdtemp(path.join(tmpdir(), "skilldeck-share-invalid-image-"));

    await expect(
      generateSkillShare({
        skills: [{ skill: skill({ name: "sample", id: "sample@11111111" }), body: "body" }],
        outDir: outRoot,
        renderImage: async (_htmlPath, pngPath) => {
          await writeFile(pngPath, Buffer.from("89504e470d0a1a0a", "hex"));
        }
      })
    ).rejects.toThrow("invalid PNG");
  });
});
