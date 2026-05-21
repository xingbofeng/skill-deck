import { describe, expect, test } from "vitest";

import { toMcpCallResult } from "../../src/mcp/result";

describe("toMcpCallResult", () => {
  test("maps success to content + structuredContent", () => {
    const out = toMcpCallResult({
      text: "ok",
      data: { a: 1 }
    });
    expect(out).toMatchObject({
      content: [{ type: "text", text: "ok" }],
      structuredContent: { a: 1 }
    });
    expect(out.isError).toBeUndefined();
  });

  test("wraps non-object data for MCP structuredContent compatibility", () => {
    const out = toMcpCallResult({
      data: [{ id: "sample@11111111" }]
    });

    expect(out.structuredContent).toEqual({
      data: [{ id: "sample@11111111" }]
    });
  });

  test("maps errors to isError true", () => {
    const out = toMcpCallResult({
      error: "failed"
    });
    expect(out.isError).toBe(true);
    expect(out.content[0]?.text).toContain("failed");
  });
});
