import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

import { isCliEntrypoint, runCli } from "../../src/cli/index";

async function createSkillsRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "asa-cli-root-"));
  const skillDir = path.join(root, "sample");
  await createSkillInDir(skillDir, "sample");
  return root;
}

async function createSkillInDir(skillDir: string, name: string) {
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "skill.md"),
    `---
name: ${name}
description: ${name} desc
---`,
    "utf8"
  );
}

function pngWithDimensions(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(45);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  bytes.writeUInt32BE(0, 29);
  bytes.writeUInt32BE(0, 33);
  bytes.write("IEND", 37, "ascii");
  bytes.writeUInt32BE(0, 41);
  return bytes;
}

const serversToClose: Server[] = [];

afterEach(async () => {
  await Promise.all(
    serversToClose.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((err?: Error) => (err ? reject(err) : resolve()));
        })
    )
  );
  serversToClose.length = 0;
});

describe("CLI", () => {
  test("detects npm bin symlink as cli entrypoint", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skilldeck-cli-bin-"));
    const target = path.join(root, "dist", "cli", "index.js");
    const binDir = path.join(root, "node_modules", ".bin");
    const bin = path.join(binDir, "skill-deck");
    await mkdir(path.dirname(target), { recursive: true });
    await mkdir(binDir, { recursive: true });
    await writeFile(target, "#!/usr/bin/env node\n", "utf8");
    await symlink(target, bin);

    expect(isCliEntrypoint(pathToFileURL(target).href, bin)).toBe(true);
  });

  test("top-level help lists commands and exits successfully", async () => {
    let output = "";
    let stderr = "";

    const exitCode = await runCli(["--help"], {
      stdout: (text) => {
        output += text;
      },
      stderr: (text) => {
        stderr += text;
      }
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(output).toContain("Usage: skill-deck <command>");
    expect(output).toContain("mcp serve");
    expect(output).toContain("share <skill-or-root>");
  });

  test("share help lists share options without requiring --out", async () => {
    let output = "";
    let stderr = "";

    const exitCode = await runCli(["share", "--help"], {
      stdout: (text) => {
        output += text;
      },
      stderr: (text) => {
        stderr += text;
      }
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(output).toContain("Usage: skill-deck share <skill-or-root> --out <dir>");
    expect(output).toContain("--no-redact");
  });

  test("scan command outputs json", async () => {
    const skillsRoot = await createSkillsRoot();
    let output = "";
    const exitCode = await runCli(["scan", "--skills", skillsRoot], {
      stdout: (text) => {
        output += text;
      },
      stderr: () => {}
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(output);
    expect(parsed[0]?.name).toBe("sample");
  });

  test("scan command follows symlinks only when requested", async () => {
    const skillsRoot = await mkdtemp(path.join(tmpdir(), "asa-cli-link-root-"));
    const internal = path.join(skillsRoot, "internal");
    await mkdir(internal);
    await createSkillInDir(internal, "sample");
    await symlink(internal, path.join(skillsRoot, "linked"), "dir");
    let output = "";

    const exitCode = await runCli(["scan", "--skills", skillsRoot, "--follow-symlinks"], {
      stdout: (text) => {
        output += text;
      },
      stderr: () => {}
    });

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(output);
    expect(parsed.map((skill: { name: string }) => skill.name)).toEqual(["sample"]);
  });

  test("validate command outputs diagnostics", async () => {
    const skillsRoot = await createSkillsRoot();
    let output = "";
    const exitCode = await runCli(["validate", "--skills", skillsRoot], {
      stdout: (text) => {
        output += text;
      },
      stderr: () => {}
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(output);
    expect(parsed.valid).toBe(1);
    expect(parsed.invalid).toBe(0);
  });

  test("validate command respects --layout recursive", async () => {
    const skillsRoot = await mkdtemp(path.join(tmpdir(), "asa-cli-validate-layout-"));
    const nested = path.join(skillsRoot, "nested");
    await mkdir(nested);
    await createSkillInDir(nested, "nested");
    let output = "";
    const exitCode = await runCli(["validate", "--skills", skillsRoot, "--layout", "recursive"], {
      stdout: (text) => {
        output += text;
      },
      stderr: () => {}
    });

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(output);
    expect(parsed.valid).toBe(1);
  });

  test("validate command reports invalid, missing, and skipped folder diagnostics", async () => {
    const skillsRoot = await mkdtemp(path.join(tmpdir(), "asa-cli-diagnostics-"));
    const validDir = path.join(skillsRoot, "valid");
    const invalidDir = path.join(skillsRoot, "invalid");
    const missingDir = path.join(skillsRoot, "missing");
    const skippedDir = path.join(skillsRoot, "_private");
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
    let output = "";

    const exitCode = await runCli(["validate", "--skills", skillsRoot], {
      stdout: (text) => {
        output += text;
      },
      stderr: () => {}
    });

    expect(exitCode).toBe(2);
    const parsed = JSON.parse(output);
    expect(parsed).toMatchObject({ valid: 1, invalid: 1, skipped: 1 });
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid" }),
        expect.objectContaining({ code: "missing" }),
        expect.objectContaining({ code: "skipped" })
      ])
    );
  });

  test("validate command reports followed symlink diagnostics when enabled", async () => {
    const skillsRoot = await mkdtemp(path.join(tmpdir(), "asa-cli-validate-link-"));
    const internal = path.join(skillsRoot, "internal");
    await createSkillInDir(internal, "sample");
    await symlink(internal, path.join(skillsRoot, "linked"), "dir");
    let output = "";

    const exitCode = await runCli(["validate", "--skills", skillsRoot, "--follow-symlinks"], {
      stdout: (text) => {
        output += text;
      },
      stderr: () => {}
    });

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(output);
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "symlink_followed",
          warnings: expect.arrayContaining(["symlink followed"])
        })
      ])
    );
  });

  test("mcp serve command starts server", async () => {
    const skillsRoot = await createSkillsRoot();
    const exitCode = await runCli(
      [
        "mcp",
        "serve",
        "--transport",
        "http",
        "--skills",
        skillsRoot,
        "--port",
        "0"
      ],
      {
        stdout: () => {},
        stderr: () => {},
        onServerStart: (server) => {
          serversToClose.push(server as Server);
        }
      }
    );
    expect(exitCode).toBe(0);
    expect(serversToClose.length).toBe(1);
  });

  test("mcp serve passes management and shell security options", async () => {
    const skillsRoot = await createSkillsRoot();
    const exitCode = await runCli(
      [
        "mcp",
        "serve",
        "--transport",
        "http",
        "--skills",
        skillsRoot,
        "--port",
        "0",
        "--enable-management-tools",
        "--enable-shell",
        "--allowed-root",
        skillsRoot,
        "--default-cwd",
        skillsRoot,
        "--timeout-ms",
        "123",
        "--max-output",
        "456",
        "--hot-reload",
        "--debounce-ms",
        "500"
      ],
      {
        stdout: () => {},
        stderr: () => {},
        onServerStart: (server) => {
          serversToClose.push(server as Server);
        }
      }
    );
    expect(exitCode).toBe(0);
    expect(serversToClose.length).toBe(1);
    const address = serversToClose[0]?.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;
    const callRes = await fetch(`${base}/tools/call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "validate_skills", arguments: {} })
    });
    const callJson = await callRes.json();
    expect(callJson.structuredContent).toMatchObject({ valid: 1, invalid: 0 });
  });

  test("invalid mcp serve option exits non-zero and writes stderr", async () => {
    let stderr = "";
    const exitCode = await runCli(
      ["mcp", "serve", "--transport", "bogus", "--skills", "/tmp/skills"],
      {
        stdout: () => {},
        stderr: (text) => {
          stderr += text;
        }
      }
    );

    expect(exitCode).toBe(1);
    expect(stderr).toContain("invalid --transport");
  });

  test("share command generates share files and supports --no-redact", async () => {
    const skillsRoot = await createSkillsRoot();
    const outDir = await mkdtemp(path.join(tmpdir(), "skilldeck-cli-share-"));
    await writeFile(
      path.join(skillsRoot, "sample", "skill.md"),
      `---
name: sample
description: sample desc
---
# Sample
Use /Users/counter/private/sample and https://internal.example.com?token=secret-key.
`,
      "utf8"
    );
    let output = "";
    let stderr = "";

    const exitCode = await runCli(["share", skillsRoot, "--out", outDir, "--no-redact"], {
      stdout: (text) => {
        output += text;
      },
      stderr: (text) => {
        stderr += text;
      },
      renderShareImage: async (_htmlPath, pngPath, viewport) => {
        await writeFile(pngPath, pngWithDimensions(viewport.width, viewport.height));
      }
    });

    expect(exitCode).toBe(0);
    expect(stderr).toContain("Redaction disabled");
    expect(output).toContain("Share package generated");
    expect(output).toContain("Skills: 1");
    expect(output).toContain("Redaction: disabled");
    expect(output).toContain(path.join(outDir, "index.html"));
    expect(output).toContain(path.join(outDir, "cover.png"));
    expect(output).toContain(path.join(outDir, "detail.png"));
    expect(output).toContain(path.join(outDir, "manifest.json"));
    expect(() => JSON.parse(output)).toThrow();
  });
});
