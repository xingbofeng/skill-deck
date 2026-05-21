import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { createLocalShellRunner } from "../../src/runtime/shell";
import { ensureAllowedCwd } from "../../src/runtime/security";

describe("ensureAllowedCwd", () => {
  test("allows cwd inside allowedRoots", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "asa-shell-root-"));
    const child = path.join(root, "child");
    await mkdir(child);
    const result = await ensureAllowedCwd(child, [root]);
    expect(result).toBe(await realpath(child));
  });

  test("rejects prefix attack like /tmp/root2 for /tmp/root", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "asa-shell-prefix-"));
    const root = path.join(base, "root");
    const root2 = path.join(base, "root2");
    await mkdir(root);
    await mkdir(root2);
    await expect(ensureAllowedCwd(root2, [root])).rejects.toThrow(
      "outside allowedRoots"
    );
  });

  test("rejects symlink escape", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "asa-shell-link-"));
    const root = path.join(base, "root");
    const outside = path.join(base, "outside");
    await mkdir(root);
    await mkdir(outside);
    await writeFile(path.join(outside, "x.txt"), "x", "utf8");
    const link = path.join(root, "link-out");
    await symlink(outside, link, "dir");
    await expect(ensureAllowedCwd(link, [root])).rejects.toThrow("outside allowedRoots");
  });
});

describe("createLocalShellRunner", () => {
  test("does not inherit env by default", async () => {
    const runner = createLocalShellRunner();
    const res = await runner({
      command: "echo ${ASA_SECRET_TEST:-empty}",
      env: { ASA_SECRET_TEST: "from-runner" }
    });
    expect(res.stdout.trim()).toBe("from-runner");
  });

  test("truncates output and strips ANSI", async () => {
    const runner = createLocalShellRunner();
    const res = await runner({
      command: "printf '\\033[31mHELLO\\033[0m-WORLD'",
      maxOutputLength: 5
    });
    expect(res.stdout).toBe("HELLO");
    expect(res.truncated).toBe(true);
  });
});
