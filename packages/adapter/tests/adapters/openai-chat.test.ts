import { describe, expect, test } from "vitest";

import { toOpenAIChatTools } from "../../src/adapters/openai-chat";
import { getAgenticSkillTools } from "../../src/core/tools";

describe("toOpenAIChatTools", () => {
  test("emits nested function shape", () => {
    const source = getAgenticSkillTools();
    const out = toOpenAIChatTools(source);
    expect(out[0]).toMatchObject({
      type: "function",
      function: {
        name: "list_skills"
      }
    });
  });
});
