import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import type { AgenticSkill } from "../../src/core/types";
import { createSkillHandlers } from "../../src/runtime/handlers";

function makeSkill(id: string, name: string, path: string): AgenticSkill {
  return {
    id,
    name,
    description: `${name} description`,
    tags: ["general"],
    dependencies: [],
    whenToUse: ["when needed"],
    relatedSkills: [],
    hasExamples: false,
    exampleFiles: [],
    category: "utility",
    complexity: "beginner",
    path,
    bodyPath: `${path}/skill.md`,
    valid: true,
    warnings: [],
    errors: []
  };
}

describe("createSkillHandlers", () => {
  test("list_skills returns summaries", async () => {
    const handlers = createSkillHandlers({
      skills: [makeSkill("a@11111111", "a", "/tmp/a")]
    });
    const res = await handlers.list_skills?.({});
    expect(res?.data).toEqual([
      expect.objectContaining({
        id: "a@11111111",
        name: "a"
      })
    ]);
  });

  test("read_skill resolves by id", async () => {
    const handlers = createSkillHandlers({
      skills: [makeSkill("a@11111111", "a", "/tmp/a")],
      readFile: async () => "skill content"
    });
    const res = await handlers.read_skill?.({ ref: "a@11111111" });
    expect(res?.data).toMatchObject({
      id: "a@11111111",
      body: "skill content"
    });
  });

  test("read_skill name ambiguity returns candidates", async () => {
    const handlers = createSkillHandlers({
      skills: [
        makeSkill("a@11111111", "dup", "/tmp/a"),
        makeSkill("a@22222222", "dup", "/tmp/b")
      ],
      readFile: async () => "skill content"
    });
    const res = await handlers.read_skill?.({ ref: "dup" });
    expect(res?.error).toContain("ambiguous");
    expect(res?.data).toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({ id: "a@11111111", name: "dup" }),
        expect.objectContaining({ id: "a@22222222", name: "dup" })
      ])
    });
  });

  test("search_skills filters by query and tag", async () => {
    const handlers = createSkillHandlers({
      skills: [
        makeSkill("a@11111111", "git-helper", "/tmp/a"),
        { ...makeSkill("b@11111111", "docker-helper", "/tmp/b"), tags: ["devops"] }
      ]
    });
    const res = await handlers.search_skills?.({ query: "git", tag: "general" });
    const data = res?.data as {
      items: Array<{ skill: { name: string } }>;
      pagination: { total: number };
    };
    expect(data.items.map((item) => item.skill.name)).toEqual(["git-helper"]);
    expect(data.pagination.total).toBe(1);
  });

  test("search_skills supports pagination and field projection", async () => {
    const handlers = createSkillHandlers({
      skills: [
        makeSkill("picturebook@11111111", "picturebook-maker", "/tmp/a"),
        { ...makeSkill("tag@11111111", "tag-helper", "/tmp/b"), tags: ["picturebook"] },
        {
          ...makeSkill("desc@11111111", "desc-helper", "/tmp/c"),
          description: "picturebook workflow"
        }
      ]
    });

    const res = await handlers.search_skills?.({
      query: "picturebook",
      limit: 1,
      offset: 1,
      fields: ["id", "name", "score"]
    });

    expect(res?.data).toEqual({
      items: [
        {
          score: 80,
          skill: {
            id: "tag@11111111",
            name: "tag-helper"
          }
        }
      ],
      pagination: {
        limit: 1,
        offset: 1,
        total: 3,
        nextOffset: 2
      }
    });
  });

  test("get_skill_info returns metadata only", async () => {
    const handlers = createSkillHandlers({
      skills: [makeSkill("a@11111111", "a", "/tmp/a")]
    });
    const res = await handlers.get_skill_info?.({ ref: "a@11111111" });
    expect(res?.data).toMatchObject({
      id: "a@11111111",
      name: "a",
      path: "/tmp/a"
    });
    expect(res?.data).not.toHaveProperty("body");
  });

  test("shell handler returns disabled error by default", async () => {
    const handlers = createSkillHandlers({
      skills: [makeSkill("a@11111111", "a", "/tmp/a")]
    });
    const res = await handlers.run_skill_shell?.({ command: "pwd" });
    expect(res?.error).toContain("disabled");
  });

  test("shell handler applies security options before running commands", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-handler-shell-"));
    const child = path.join(root, "child");
    await mkdir(child);
    let captured:
      | {
          command: string;
          cwd?: string;
          timeoutMs?: number;
          maxOutputLength?: number;
          env?: Record<string, string>;
        }
      | undefined;
    const handlers = createSkillHandlers({
      skills: [makeSkill("a@11111111", "a", root)],
      runShell: async (input) => {
        captured = input;
        return { stdout: "ok", stderr: "", exitCode: 0 };
      },
      security: {
        allowedRoots: [root],
        defaultCwd: root,
        timeoutMs: 12,
        maxOutputLength: 34,
        env: { ASA_TEST: "1" }
      }
    } as Parameters<typeof createSkillHandlers>[0] & {
      security: {
        allowedRoots: string[];
        defaultCwd: string;
        timeoutMs: number;
        maxOutputLength: number;
        env: Record<string, string>;
      };
    });

    const res = await handlers.run_skill_shell?.({
      skillRef: "a@11111111",
      command: "pwd",
      cwd: child
    });

    expect(res?.error).toBeUndefined();
    expect(captured).toEqual({
      command: "pwd",
      cwd: await realpath(child),
      timeoutMs: 12,
      maxOutputLength: 34,
      env: { ASA_TEST: "1" }
    });
  });

  test("shell handler rejects cwd outside allowed roots", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-handler-shell-root-"));
    const outside = await mkdtemp(path.join(tmpdir(), "asa-handler-shell-out-"));
    let called = false;
    const handlers = createSkillHandlers({
      skills: [makeSkill("a@11111111", "a", root)],
      runShell: async () => {
        called = true;
        return { stdout: "bad", stderr: "", exitCode: 0 };
      },
      security: {
        allowedRoots: [root],
        defaultCwd: root
      }
    } as Parameters<typeof createSkillHandlers>[0] & {
      security: { allowedRoots: string[]; defaultCwd: string };
    });

    const res = await handlers.run_skill_shell?.({ command: "pwd", cwd: outside });

    expect(res?.error).toContain("outside allowedRoots");
    expect(called).toBe(false);
  });

  test("shell handler handles security hook exceptions as validation errors", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-handler-shell-hook-"));
    const handlers = createSkillHandlers({
      skills: [makeSkill("a@11111111", "a", root)],
      runShell: async () => {
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      security: {
        allowedRoots: [root],
        defaultCwd: root,
        isCommandAllowed: async () => {
          throw new Error("policy service unavailable");
        }
      }
    });

    const res = await handlers.run_skill_shell?.({ command: "pwd" });
    expect(res?.error).toContain("command policy check failed");
    expect(res?.error).toContain("policy service unavailable");
  });

  test("management handlers diagnose folders and reload skills", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-handler-management-"));
    const validDir = path.join(root, "valid");
    const invalidDir = path.join(root, "invalid");
    const missingDir = path.join(root, "missing");
    await mkdir(validDir);
    await mkdir(invalidDir);
    await mkdir(missingDir);
    await writeFile(
      path.join(validDir, "skill.md"),
      `---
name: valid
description: valid skill
---`,
      "utf8"
    );
    await writeFile(path.join(invalidDir, "skill.md"), "# invalid", "utf8");

    const handlers = createSkillHandlers({
      skills: [],
      skillsRoot: root,
      includeManagement: true
    } as Parameters<typeof createSkillHandlers>[0] & {
      skillsRoot: string;
      includeManagement: boolean;
    });

    const folders = await handlers.list_skill_folders?.({});
    expect(folders?.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "valid", status: "valid" }),
        expect.objectContaining({ name: "invalid", status: "invalid" }),
        expect.objectContaining({ name: "missing", status: "missing" })
      ])
    );

    const diagnostics = await handlers.validate_skills?.({});
    expect(diagnostics?.data).toMatchObject({ valid: 1, invalid: 1, skipped: 0 });

    const reload = await handlers.reload_skills?.({});
    expect(reload?.data).toMatchObject({ loaded: 1, failed: 1, total: 2 });

    const listed = await handlers.list_skills?.({});
    expect(listed?.data).toEqual([expect.objectContaining({ name: "valid" })]);
  });
});
