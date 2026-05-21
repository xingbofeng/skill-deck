import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("MCP Registry metadata", () => {
  test("server.json declares npm stdio package without hosted deployment", async () => {
    const raw = await readFile("server.json", "utf8");
    const metadata = JSON.parse(raw);

    expect(metadata).toMatchObject({
      name: "io.github.xingbofeng/skill-deck",
      packages: [
        {
          registryType: "npm",
          identifier: "skill-deck",
          transport: {
            type: "stdio"
          }
        }
      ]
    });
    expect(JSON.stringify(metadata)).not.toContain("docker");
    expect(JSON.stringify(metadata)).not.toContain("remote_url");
  });
});
