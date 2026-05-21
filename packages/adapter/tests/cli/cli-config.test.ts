import { describe, expect, test } from "vitest";

import { parseMcpServeConfig } from "../../src/cli/config";

describe("parseMcpServeConfig", () => {
  test("uses product defaults for MCP serve", () => {
    const config = parseMcpServeConfig([
      "mcp",
      "serve",
      "--skills",
      "/tmp/skills"
    ]);

    expect(config.transport).toBe("stdio");
    expect(config.skillMode).toBe("active");
    expect(config.includeShare).toBe(true);
    expect(config.shareOutputRoot).toBe("~/skilldeck-shares");
  });

  test("can disable Share MCP tools explicitly", () => {
    const config = parseMcpServeConfig([
      "mcp",
      "serve",
      "--skills",
      "/tmp/skills",
      "--disable-share-tools"
    ]);

    expect(config.includeShare).toBe(false);
  });

  test("normalizes MCP serve flags", () => {
    const config = parseMcpServeConfig([
      "mcp",
      "serve",
      "--transport",
      "http",
      "--skills",
      "/tmp/skills",
      "--host",
      "127.0.0.1",
      "--port",
      "3333",
      "--enable-shell",
      "--allowed-root",
      "/tmp",
      "--default-cwd",
      "/tmp/skills",
      "--timeout-ms",
      "123",
      "--max-output",
      "456",
      "--hot-reload",
      "--debounce-ms",
      "789",
      "--follow-symlinks",
      "--skill-mode",
      "active",
      "--expose-skills",
      "7",
      "--enable-share-tools",
      "--share-output-root",
      "/tmp/share"
    ]);

    expect(config).toEqual({
      skillsRoot: "/tmp/skills",
      transport: "http",
      host: "127.0.0.1",
      port: 3333,
      includeShell: true,
      includeManagementTools: false,
      allowedRoots: ["/tmp"],
      defaultCwd: "/tmp/skills",
      timeoutMs: 123,
      maxOutputLength: 456,
      hotReload: true,
      debounceMs: 789,
      layout: "recursive",
      followSymlinks: true,
      skillMode: "active",
      exposeSkills: 7,
      includeShare: true,
      shareOutputRoot: "/tmp/share"
    });
  });
});
