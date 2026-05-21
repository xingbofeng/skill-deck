import { describe, expect, test } from "vitest";

import type { AgenticSkill } from "../../src/core/types";
import { getAgenticSkillTools } from "../../src/core/tools";
import { createSkillHandlers } from "../../src/runtime/handlers";

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

describe("Skill Activation tools", () => {
  test("compact exposes only the base discovery tools", () => {
    const tools = getAgenticSkillTools({ skillMode: "compact" });

    expect(tools.map((tool) => tool.name)).toEqual([
      "list_skills",
      "read_skill",
      "search_skills",
      "get_skill_info"
    ]);
  });

  test("guided adds skill_guide", () => {
    const tools = getAgenticSkillTools({
      skillMode: "guided",
      skills: [skill({ id: "repo@11111111", name: "repo-review" })]
    });

    expect(tools.map((tool) => tool.name)).toContain("skill_guide");
    expect(tools.find((tool) => tool.name === "skill_guide")?.description).toContain(
      "Call this first"
    );
  });

  test("active adds capped deterministic use_skill tools", () => {
    const tools = getAgenticSkillTools({
      skillMode: "active",
      exposeSkills: 1,
      skills: [
        skill({ id: "picturebook@abcdef12", name: "picturebook-maker" }),
        skill({ id: "repo@34567890", name: "repo review" })
      ]
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      "list_skills",
      "read_skill",
      "search_skills",
      "get_skill_info",
      "skill_guide",
      "use_skill_picturebook_maker_abcdef12"
    ]);
  });

  test("active exposes skills by configured and metadata priority before metadata quality", () => {
    const tools = getAgenticSkillTools({
      skillMode: "active",
      exposeSkills: 2,
      skillPriorities: {
        "planned@22222222": 100
      },
      skills: [
        skill({
          id: "low@11111111",
          name: "alpha-low",
          description: "low",
          metadata: { priority: 1 }
        }),
        skill({
          id: "planned@22222222",
          name: "planned-work",
          description: "planned",
          metadata: { priority: 1 }
        }),
        skill({
          id: "metadata@33333333",
          name: "metadata-priority",
          description: "metadata",
          metadata: { priority: 50 }
        })
      ]
    });

    expect(tools.map((tool) => tool.name).filter((name) => name.startsWith("use_skill_"))).toEqual(
      ["use_skill_planned_work_22222222", "use_skill_metadata_priority_33333333"]
    );
  });

  test("skill_guide recommends skills for the task and reminds to load full markdown", async () => {
    const handlers = createSkillHandlers({
      skills: [
        skill({
          id: "picturebook@abcdef12",
          name: "picturebook-maker",
          description: "make picture books",
          tags: ["story"],
          whenToUse: ["make picturebook pages"]
        }),
        skill({ id: "repo@34567890", name: "repo-review", description: "review code" })
      ],
      skillMode: "guided"
    });

    const result = await handlers.skill_guide?.({ task: "make a picturebook", limit: 1 });

    expect(result?.data).toMatchObject({
      mode: "guided",
      totalSkills: 2,
      recommendedFlow: expect.arrayContaining([
        expect.stringContaining("read_skill")
      ]),
      recommendedSkills: [
        expect.objectContaining({
          id: "picturebook@abcdef12",
          name: "picturebook-maker"
        })
      ]
    });
    expect(JSON.stringify(result?.data)).toContain("full SKILL.md");
  });

  test("skill_guide returns fixed capability groups with grouped skills and direct tool names", async () => {
    const handlers = createSkillHandlers({
      skills: [
        skill({
          id: "writer@11111111",
          name: "story-writer",
          description: "draft articles and stories",
          tags: ["writing"],
          category: "content"
        }),
        skill({
          id: "repo@22222222",
          name: "repo-review",
          description: "review TypeScript code",
          tags: ["code"],
          category: "engineering"
        })
      ],
      skillMode: "active"
    });

    const result = await handlers.skill_guide?.({ task: "review code", limit: 1 });

    expect(result?.data).toMatchObject({
      summary: {
        totalSkills: 2,
        mode: "active",
        exposedSkillTools: 2
      },
      availableTools: {
        search: "search_skills",
        info: "get_skill_info",
        read: "read_skill",
        directTools: expect.arrayContaining([
          "use_skill_story_writer_11111111",
          "use_skill_repo_review_22222222"
        ])
      },
      recommendedSkills: [
        expect.objectContaining({
          id: "repo@22222222",
          toolName: "use_skill_repo_review_22222222"
        })
      ]
    });
    expect((result?.data as { capabilityGroups: Array<{ name: string; skills: unknown[] }> }).capabilityGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "content_creation",
          skills: [expect.objectContaining({ id: "writer@11111111" })]
        }),
        expect.objectContaining({
          name: "engineering",
          skills: [expect.objectContaining({ id: "repo@22222222" })]
        })
      ])
    );
  });

  test("active use_skill tool returns the matching full skill body", async () => {
    const handlers = createSkillHandlers({
      skills: [skill({ id: "picturebook@abcdef12", name: "picturebook-maker" })],
      skillMode: "active",
      readFile: async (filePath) => `body from ${filePath}`
    });

    const result = await handlers.use_skill_picturebook_maker_abcdef12?.({});

    expect(result?.data).toMatchObject({
      id: "picturebook@abcdef12",
      name: "picturebook-maker",
      body: "body from /tmp/base/skill.md"
    });
  });

  test("active handlers use the same exposure ranking as tools list", async () => {
    const skills = [
      skill({
        id: "alpha@11111111",
        name: "alpha-low",
        description: "low priority",
        bodyPath: "/tmp/alpha/skill.md",
        metadata: { priority: 1 }
      }),
      skill({
        id: "zeta@22222222",
        name: "zeta-high",
        description: "high priority",
        bodyPath: "/tmp/zeta/skill.md",
        metadata: { priority: 100 }
      })
    ];
    const toolNames = getAgenticSkillTools({
      skillMode: "active",
      exposeSkills: 1,
      skills
    }).map((tool) => tool.name);
    const activeToolName = toolNames.find((name) => name.startsWith("use_skill_"));
    const handlers = createSkillHandlers({
      skills,
      skillMode: "active",
      exposeSkills: 1,
      readFile: async (filePath) => `body from ${filePath}`
    });

    expect(activeToolName).toBe("use_skill_zeta_high_22222222");
    expect(handlers.use_skill_alpha_low_11111111).toBeUndefined();
    const result = await handlers[activeToolName!]?.({});

    expect(result?.data).toMatchObject({
      id: "zeta@22222222",
      body: "body from /tmp/zeta/skill.md"
    });
  });
});
