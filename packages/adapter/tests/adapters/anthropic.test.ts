import { describe, expect, test } from "vitest";

import { toAnthropicTools } from "../../src/adapters/anthropic";
import { getAgenticSkillTools } from "../../src/core/tools";

describe("toAnthropicTools", () => {
  test("emits input_schema shape", () => {
    const source = getAgenticSkillTools();
    const out = toAnthropicTools(source);
    expect(out[0]).toMatchObject({
      name: "list_skills",
      input_schema: {
        additionalProperties: false
      }
    });
  });
});
