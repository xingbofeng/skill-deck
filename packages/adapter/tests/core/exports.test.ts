import { describe, expect, test } from "vitest";

import * as api from "../../src/index";

describe("root exports", () => {
  test("exposes adapters, MCP helpers, and shell runtime from the package root", () => {
    expect(api.toOpenAIChatTools).toBeTypeOf("function");
    expect(api.toOpenAIResponsesTools).toBeTypeOf("function");
    expect(api.toAnthropicTools).toBeTypeOf("function");
    expect(api.toOpenAIAgentsLocalSkills).toBeTypeOf("function");
    expect(api.createSkillMcpServer).toBeTypeOf("function");
    expect(api.toMcpCallResult).toBeTypeOf("function");
    expect(api.createLocalShellRunner).toBeTypeOf("function");
    expect(api.ensureAllowedCwd).toBeTypeOf("function");
  });
});
