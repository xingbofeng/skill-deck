import { describe, expect, test } from "vitest";

import { buildDocSearchIndex, searchDocs } from "../../../docs-site/src/search";

describe("docs search index", () => {
  test("returns section hash targets for matching headings", () => {
    const index = buildDocSearchIndex({
      mcp: {
        title: "MCP 接入",
        lead: "接入 SkillDeck 的 MCP 文档。",
        body: "包含 compact、guided、active 等模式。",
        sections: [
          {
            title: "三种 Skill Activation 模式",
            hash: "#san-zhong-skill-activation-mo-shi"
          }
        ]
      }
    });
    const results = searchDocs(index, "三种 Skill Activation 模式");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({
      view: "mcp",
      hash: "#san-zhong-skill-activation-mo-shi"
    });
  });

  test("returns doc-level targets when the query matches body text but not a heading", () => {
    const index = buildDocSearchIndex({
      mcp: {
        title: "MCP 接入",
        lead: "接入 SkillDeck 的 MCP 文档。",
        body: "run_skill_shell 默认关闭，只有显式开启才暴露。",
        sections: [
          {
            title: "三种 Skill Activation 模式",
            hash: "#san-zhong-skill-activation-mo-shi"
          }
        ]
      }
    });
    const results = searchDocs(index, "run_skill_shell");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.view).toBe("mcp");
    expect(results[0]?.hash).toBeUndefined();
  });
});
