import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { parseSkillFile } from "../../src/core/parse";

async function createSkillFile(content: string, fileName = "skill.md") {
  const root = await mkdtemp(path.join(tmpdir(), "asa-parse-"));
  const skillDir = path.join(root, "my-skill");
  await mkdir(skillDir, { recursive: true });
  const skillPath = path.join(skillDir, fileName);
  await writeFile(skillPath, content, "utf8");
  return { root, skillDir, skillPath };
}

describe("parseSkillFile", () => {
  test("strict mode rejects missing frontmatter", async () => {
    const { skillPath } = await createSkillFile("# My Skill\n\nbody");
    const parsed = await parseSkillFile(skillPath);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.join(" ")).toContain("frontmatter");
  });

  test("strict mode accepts valid frontmatter", async () => {
    const { skillPath } = await createSkillFile(
      `---
name: my-skill
description: test skill
---

# heading`
    );
    const parsed = await parseSkillFile(skillPath);
    expect(parsed.valid).toBe(true);
    expect(parsed.name).toBe("my-skill");
    expect(parsed.id).toMatch(/^my-skill@[a-f0-9]{8}$/);
  });

  test("loose mode falls back to heading and directory name", async () => {
    const { skillPath } = await createSkillFile("# Heading Name\n\nfirst para");
    const parsed = await parseSkillFile(skillPath, { mode: "loose" });
    expect(parsed.name).toBe("Heading Name");
    expect(parsed.description).toBe("first para");
    expect(parsed.valid).toBe(true);
  });

  test("normalizes searchable metadata from frontmatter", async () => {
    const { skillPath } = await createSkillFile(
      `---
name: my-skill
description: test skill
version: 1.2.3
author: Ada
created: 2026-05-20
updated: 2026-05-21
category: devtools
tags:
  - git
  - review
complexity: intermediate
dependencies:
  - rg
when_to_use:
  - when reviewing code
related_skills:
  - another-skill
examples:
  - examples/demo.md
metadata:
  provider: local
allowed-tools:
  - read
license: MIT
compatibility:
  - codex
---

# heading`
    );

    const parsed = await parseSkillFile(skillPath);

    expect(parsed).toMatchObject({
      version: "1.2.3",
      author: "Ada",
      created: "2026-05-20",
      updated: "2026-05-21",
      category: "devtools",
      tags: ["git", "review"],
      complexity: "intermediate",
      dependencies: ["rg"],
      whenToUse: ["when reviewing code"],
      relatedSkills: ["another-skill"],
      hasExamples: true,
      exampleFiles: ["examples/demo.md"],
      metadata: { provider: "local" }
    });
    expect(parsed.frontmatter?.["allowed-tools"]).toEqual(["read"]);
    expect(parsed.frontmatter?.license).toBe("MIT");
    expect(parsed.frontmatter?.compatibility).toEqual(["codex"]);
  });

  test("strict mode rejects overlong descriptions", async () => {
    const longDescription = "x".repeat(1025);
    const { skillPath } = await createSkillFile(
      `---
name: my-skill
description: ${longDescription}
---`
    );

    const parsed = await parseSkillFile(skillPath);

    expect(parsed.valid).toBe(false);
    expect(parsed.errors.join(" ")).toContain("description exceeds");
  });
});
