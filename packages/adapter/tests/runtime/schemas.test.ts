import { describe, expect, test } from "vitest";

import { validateToolArguments } from "../../src/runtime/schemas";

describe("validateToolArguments", () => {
  test("rejects malformed read_skill arguments", () => {
    const result = validateToolArguments("read_skill", {});

    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("ref")
    });
  });

  test("rejects whitespace shell commands", () => {
    const result = validateToolArguments("run_skill_shell", { command: "   " });

    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("command")
    });
  });

  test("accepts search filters", () => {
    const result = validateToolArguments("search_skills", {
      query: "git",
      category: "coding",
      tag: "review",
      complexity: "advanced"
    });

    expect(result).toMatchObject({ ok: true });
  });

  test("validates skill_guide arguments", () => {
    expect(validateToolArguments("skill_guide", { task: "review code", limit: 3 })).toEqual({
      ok: true,
      args: { task: "review code", limit: 3 }
    });
    expect(validateToolArguments("skill_guide", { limit: 0 })).toMatchObject({
      ok: false,
      error: expect.stringContaining("limit")
    });
  });

  test("validates share generation arguments", () => {
    expect(
      validateToolArguments("generate_skill_share", {
        refs: ["a@11111111"],
        outDir: "/tmp/share",
        highlights: ["fast"],
        redact: false,
        caseStudies: [{ title: "Case", result: "Won", skillRefs: ["a@11111111"] }]
      })
    ).toEqual({
      ok: true,
      args: {
        refs: ["a@11111111"],
        ref: undefined,
        outDir: "/tmp/share",
        audience: undefined,
        highlights: ["fast"],
        redact: false,
        caseStudies: [{ title: "Case", result: "Won", skillRefs: ["a@11111111"] }]
      }
    });
    expect(
      validateToolArguments("generate_skill_share", {
        refs: ["a@11111111"],
        ref: "b@22222222"
      })
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("either refs or ref")
    });
  });

  test("validates share artifact arguments", () => {
    expect(validateToolArguments("get_skill_share_artifact", { artifactId: "abc" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("kind")
    });
    expect(
      validateToolArguments("get_skill_share_artifact", { artifactId: "abc", kind: "html" })
    ).toEqual({
      ok: true,
      args: { artifactId: "abc", kind: "html", path: undefined }
    });
    expect(validateToolArguments("get_skill_share_artifact", { path: "/tmp/index.html" })).toEqual({
      ok: true,
      args: { artifactId: undefined, kind: undefined, path: "/tmp/index.html" }
    });
  });
});
