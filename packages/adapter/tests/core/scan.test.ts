import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { scanSkills } from "../../src/core/scan";

async function createSkill(dir: string, name: string, description = "desc") {
  const skillDir = path.join(dir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "skill.md"),
    `---
name: ${name}
description: ${description}
---`,
    "utf8"
  );
  return skillDir;
}

describe("scanSkills", () => {
  test("discovers root itself as a skill", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-scan-root-"));
    await writeFile(
      path.join(root, "skill.md"),
      `---
name: root-skill
description: root
---`,
      "utf8"
    );
    const skills = await scanSkills(root);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("root-skill");
  });

  test("recursive layout discovers nested skills", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-scan-rec-"));
    await createSkill(root, "one");
    await createSkill(path.join(root, "nested"), "two");
    const skills = await scanSkills(root, { layout: "recursive" });
    expect(skills.map((skill) => skill.name)).toEqual(["one", "two"]);
  });

  test("direct layout only reads direct child folders", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-scan-dir-"));
    await createSkill(root, "one");
    await createSkill(path.join(root, "nested"), "two");
    const skills = await scanSkills(root, { layout: "direct" });
    expect(skills.map((skill) => skill.name)).toEqual(["one"]);
  });

  test("includeInvalid false filters invalid skills", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-scan-invalid-"));
    await createSkill(root, "ok", "ok");
    const badDir = path.join(root, "bad");
    await mkdir(badDir, { recursive: true });
    await writeFile(path.join(badDir, "skill.md"), "# bad", "utf8");
    const skills = await scanSkills(root);
    expect(skills.map((skill) => skill.name)).toEqual(["ok"]);
  });

  test("symlink folders are ignored by default", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-scan-link-"));
    const external = await mkdtemp(path.join(tmpdir(), "asa-scan-ext-"));
    await createSkill(external, "external-skill");
    await symlink(external, path.join(root, "external-link"), "dir");
    const skills = await scanSkills(root);
    expect(skills).toHaveLength(0);
  });

  test("follows symlink folders only when enabled", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-scan-follow-link-"));
    const internal = path.join(root, "internal");
    await mkdir(internal);
    await createSkill(internal, "linked-skill");
    await symlink(internal, path.join(root, "internal-link"), "dir");

    const skills = await scanSkills(root, { followSymlinks: true });

    expect(skills.map((skill) => skill.name)).toEqual(["linked-skill"]);
  });

  test("does not follow symlink folders that escape the root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-scan-link-escape-"));
    const external = await mkdtemp(path.join(tmpdir(), "asa-scan-link-escape-ext-"));
    await createSkill(external, "external-skill");
    await symlink(external, path.join(root, "external-link"), "dir");

    const skills = await scanSkills(root, { followSymlinks: true });

    expect(skills).toEqual([]);
  });

  test("does not loop when following recursive symlinks", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-scan-link-loop-"));
    await createSkill(root, "local-skill");
    await symlink(root, path.join(root, "loop"), "dir");

    const skills = await scanSkills(root, { followSymlinks: true });

    expect(skills.map((skill) => skill.name)).toEqual(["local-skill"]);
  });

  test("direct layout ignores root skill file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-scan-direct-root-"));
    await writeFile(
      path.join(root, "skill.md"),
      `---
name: root-skill
description: root
---`,
      "utf8"
    );
    await createSkill(root, "child-skill");

    const skills = await scanSkills(root, { layout: "direct" });

    expect(skills.map((skill) => skill.name)).toEqual(["child-skill"]);
  });

  test("normalizes metadata while scanning", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-scan-metadata-"));
    const skillDir = path.join(root, "meta-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, "skill.md"),
      `---
name: meta-skill
description: meta desc
category: coding
tags: git, review
complexity: advanced
dependencies: rg
when_to_use: review code
---`,
      "utf8"
    );

    const skills = await scanSkills(root);

    expect(skills[0]).toMatchObject({
      category: "coding",
      tags: ["git", "review"],
      complexity: "advanced",
      dependencies: ["rg"],
      whenToUse: ["review code"]
    });
  });
});
