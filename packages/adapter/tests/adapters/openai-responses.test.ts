import { describe, expect, test } from "vitest";

import { toOpenAIResponsesTools } from "../../src/adapters/openai-responses";
import { getAgenticSkillTools } from "../../src/core/tools";

describe("toOpenAIResponsesTools", () => {
  test("emits direct function shape", () => {
    const source = getAgenticSkillTools();
    const out = toOpenAIResponsesTools(source);
    expect(out[0]).toMatchObject({
      type: "function",
      name: "list_skills"
    });
    expect(out[0]).not.toHaveProperty("function");
  });
});
