import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { inspectSkillFolders } from "../../src/core/diagnostics";

describe("inspectSkillFolders", () => {
  test("reports valid, invalid, missing, skipped, and root skill diagnostics", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-diagnostics-"));
    await writeFile(
      path.join(root, "skill.md"),
      `---
name: root-skill
description: root desc
---`,
      "utf8"
    );
    const validDir = path.join(root, "valid");
    const invalidDir = path.join(root, "invalid");
    const missingDir = path.join(root, "missing");
    const skippedDir = path.join(root, "_private");
    await mkdir(validDir);
    await mkdir(invalidDir);
    await mkdir(missingDir);
    await mkdir(skippedDir);
    await writeFile(
      path.join(validDir, "skill.md"),
      `---
name: valid
description: valid desc
---`,
      "utf8"
    );
    await writeFile(path.join(invalidDir, "skill.md"), "# invalid", "utf8");

    const diagnostics = await inspectSkillFolders(root, { layout: "direct" });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "valid", status: "valid" }),
        expect.objectContaining({ name: "invalid", status: "invalid" }),
        expect.objectContaining({ name: "missing", status: "missing" }),
        expect.objectContaining({ name: "_private", status: "skipped" }),
        expect.objectContaining({ code: "root_skill_file", status: "skipped" })
      ])
    );
  });

  test("reports symlink folders as skipped or followed", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-diagnostics-symlink-"));
    const externalSkill = path.join(root, "target");
    await mkdir(externalSkill);
    await writeFile(
      path.join(externalSkill, "skill.md"),
      `---
name: linked
description: linked desc
---`,
      "utf8"
    );
    await symlink(externalSkill, path.join(root, "linked"), "dir");

    const skipped = await inspectSkillFolders(root, { layout: "direct" });
    expect(skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "linked",
          status: "skipped",
          code: "symlink_skipped",
          warnings: expect.arrayContaining(["symlink not followed"])
        })
      ])
    );

    const followed = await inspectSkillFolders(root, {
      layout: "direct",
      followSymlinks: true
    });
    expect(followed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "linked",
          status: "valid",
          code: "symlink_followed",
          warnings: expect.arrayContaining(["symlink followed"])
        })
      ])
    );
  });

  test("reports symlink folders that escape the root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-diagnostics-symlink-escape-"));
    const external = await mkdtemp(path.join(tmpdir(), "asa-diagnostics-symlink-escape-ext-"));
    const externalSkill = path.join(external, "linked");
    await mkdir(externalSkill);
    await writeFile(
      path.join(externalSkill, "skill.md"),
      `---
name: linked
description: linked desc
---`,
      "utf8"
    );
    await symlink(externalSkill, path.join(root, "linked"), "dir");

    const diagnostics = await inspectSkillFolders(root, {
      layout: "direct",
      followSymlinks: true
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "linked",
          status: "skipped",
          code: "symlink_escape",
          warnings: expect.arrayContaining(["symlink target escapes skill root"])
        })
      ])
    );
  });
});
