import { describe, expect, test } from "vitest";

import { createSkillRepository } from "../../src/core/repository";
import type { AgenticSkill } from "../../src/core/types";

function skill(overrides: Partial<AgenticSkill>): AgenticSkill {
  return {
    id: "base@11111111",
    name: "base",
    description: "base description",
    tags: [],
    dependencies: [],
    whenToUse: [],
    relatedSkills: [],
    hasExamples: false,
    exampleFiles: [],
    path: "/tmp/base",
    bodyPath: "/tmp/base/skill.md",
    valid: true,
    warnings: [],
    errors: [],
    ...overrides
  };
}

describe("createSkillRepository", () => {
  test("searches by query and metadata with AND semantics", () => {
    const repository = createSkillRepository([
      skill({
        id: "git@11111111",
        name: "git-helper",
        description: "review git changes",
        category: "coding",
        tags: ["git", "review"],
        complexity: "intermediate",
        whenToUse: ["when reviewing code"]
      }),
      skill({
        id: "docs@11111111",
        name: "docs-helper",
        description: "write docs",
        category: "writing",
        tags: ["docs"],
        complexity: "beginner"
      })
    ]);

    const results = repository.search({
      query: "review",
      category: "coding",
      tag: "git",
      complexity: "intermediate"
    });

    expect(results.items.map((item) => item.skill.id)).toEqual(["git@11111111"]);
  });

  test("ranks query matches by field weight with stable pagination", () => {
    const repository = createSkillRepository([
      skill({
        id: "description@11111111",
        name: "alpha",
        description: "picturebook helper",
        tags: []
      }),
      skill({
        id: "tag@11111111",
        name: "beta",
        description: "helper",
        tags: ["picturebook"]
      }),
      skill({
        id: "name@11111111",
        name: "picturebook-maker",
        description: "helper",
        tags: []
      }),
      skill({
        id: "when@11111111",
        name: "gamma",
        description: "helper",
        tags: [],
        whenToUse: ["make a picturebook"]
      })
    ]);

    const page = repository.search({
      query: "picturebook",
      limit: 2,
      offset: 1
    });

    expect(page.items.map((item) => item.skill.id)).toEqual([
      "tag@11111111",
      "description@11111111"
    ]);
    expect(page.pagination).toEqual({
      limit: 2,
      offset: 1,
      total: 4,
      nextOffset: 3
    });
    expect(page.items.map((item) => item.score)).toEqual([80, 60]);
  });

  test("can project search results to requested summary fields", () => {
    const repository = createSkillRepository([
      skill({
        id: "docs@11111111",
        name: "docs-helper",
        description: "write docs",
        category: "writing",
        tags: ["docs"]
      })
    ]);

    const page = repository.search({
      query: "docs",
      fields: ["id", "name", "score"]
    });

    expect(page.items).toEqual([
      {
        score: 100,
        skill: {
          id: "docs@11111111",
          name: "docs-helper"
        }
      }
    ]);
  });

  test("resolves duplicate names as ambiguity candidates", () => {
    const repository = createSkillRepository([
      skill({ id: "dup@11111111", name: "dup", path: "/tmp/a" }),
      skill({ id: "dup@22222222", name: "dup", path: "/tmp/b" })
    ]);

    const resolved = repository.resolve("dup");

    expect(resolved).toMatchObject({
      error: "ambiguous skill reference: dup",
      candidates: [
        { id: "dup@11111111", name: "dup", path: "/tmp/a" },
        { id: "dup@22222222", name: "dup", path: "/tmp/b" }
      ]
    });
  });

  test("reload replaces the repository contents", () => {
    const repository = createSkillRepository([skill({ id: "a@11111111", name: "a" })]);

    repository.replace([skill({ id: "b@11111111", name: "b" })]);

    expect(repository.list().map((item) => item.name)).toEqual(["b"]);
    expect(repository.resolve("a")).toMatchObject({ error: "skill not found: a" });
  });
});
