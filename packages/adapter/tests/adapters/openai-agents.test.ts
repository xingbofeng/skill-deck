import { describe, expect, test } from "vitest";

import { toOpenAIAgentsLocalSkills } from "../../src/adapters/openai-agents";
import type { AgenticSkill } from "../../src/core/types";

const sample: AgenticSkill = {
  id: "sample@11111111",
  name: "sample",
  description: "sample desc",
  tags: [],
  dependencies: [],
  whenToUse: [],
  relatedSkills: [],
  hasExamples: false,
  exampleFiles: [],
  path: "/tmp/sample",
  bodyPath: "/tmp/sample/skill.md",
  valid: true,
  warnings: [],
  errors: []
};

describe("toOpenAIAgentsLocalSkills", () => {
  test("returns only valid skills with root path", () => {
    const out = toOpenAIAgentsLocalSkills([
      sample,
      { ...sample, id: "bad@22222222", name: "bad", valid: false }
    ]);
    expect(out).toEqual([
      {
        name: "sample",
        description: "sample desc",
        path: "/tmp/sample"
      }
    ]);
  });
});
