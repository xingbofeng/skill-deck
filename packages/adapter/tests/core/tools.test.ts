import { describe, expect, test } from "vitest";

import { getAgenticSkillTools } from "../../src/core/tools";

describe("getAgenticSkillTools", () => {
  test("default tools exclude shell and include read/search/info", () => {
    const tools = getAgenticSkillTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual([
      "list_skills",
      "read_skill",
      "search_skills",
      "get_skill_info"
    ]);
  });

  test("includeShell true includes run_skill_shell", () => {
    const tools = getAgenticSkillTools({ includeShell: true });
    expect(tools.some((tool) => tool.name === "run_skill_shell")).toBe(true);
  });

  test("all schemas set additionalProperties false", () => {
    const tools = getAgenticSkillTools({
      includeShell: true,
      includeManagement: true
    });
    for (const tool of tools) {
      expect(tool.inputSchema).toHaveProperty("additionalProperties", false);
    }
  });
});
