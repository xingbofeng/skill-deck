import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { createManagementHandlers } from "../../src/runtime/management";
import type { AgenticSkill } from "../../src/core/types";

describe("createManagementHandlers", () => {
  test("returns folder diagnostics, validation counts, and reload stats", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-management-"));
    const validDir = path.join(root, "valid");
    const invalidDir = path.join(root, "invalid");
    await mkdir(validDir);
    await mkdir(invalidDir);
    await writeFile(
      path.join(validDir, "skill.md"),
      `---
name: valid
description: valid desc
---`,
      "utf8"
    );
    await writeFile(path.join(invalidDir, "skill.md"), "# invalid", "utf8");
    const state: { skills: AgenticSkill[] } = { skills: [] };
    const handlers = createManagementHandlers({ skillsRoot: root, state });

    const folders = await handlers.list_skill_folders({});
    expect(folders.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "valid" }),
        expect.objectContaining({ status: "invalid" })
      ])
    );

    const validation = await handlers.validate_skills({});
    expect(validation.data).toMatchObject({ valid: 1, invalid: 1, skipped: 0 });

    const reload = await handlers.reload_skills({});
    expect(reload.data).toMatchObject({ loaded: 1, failed: 1, total: 2 });
    expect(state.skills.map((skill) => skill.name)).toEqual(["valid"]);
  });
});
