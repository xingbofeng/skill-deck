import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const examples = [
  "openai-chat-completions.ts",
  "openai-responses.ts",
  "anthropic-messages.ts",
  "openai-agents-shell-tool.ts",
  "mcp-config.json",
  "share-cli.ts",
  "mcp-skill-activation-modes.json"
];

describe("examples", () => {
  test("ships every example required by the plan", async () => {
    for (const example of examples) {
      await expect(access(path.join("examples", example))).resolves.toBeUndefined();
    }
  });

  test("examples document stable ids, shell approval, and MCP resources", async () => {
    const agents = await readFile("examples/openai-agents-shell-tool.ts", "utf8");
    const mcp = await readFile("examples/mcp-config.json", "utf8");

    expect(agents).toContain("needsApproval: true");
    expect(mcp).toContain("--transport");
    expect(mcp).toContain("stdio");
  });

  test("examples include share generation and all Skill Activation modes", async () => {
    const share = await readFile("examples/share-cli.ts", "utf8");
    const modes = await readFile("examples/mcp-skill-activation-modes.json", "utf8");

    expect(share).toContain("skill-deck");
    expect(share).toContain("share");
    expect(share).toContain("--out");
    expect(share).toContain("--no-redact");
    expect(modes).toContain("--skill-mode");
    expect(modes).toContain("compact");
    expect(modes).toContain("guided");
    expect(modes).toContain("active");
    expect(modes).toContain("--expose-skills");
  });
});
