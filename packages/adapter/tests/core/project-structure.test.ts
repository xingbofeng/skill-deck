import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { describe, expect, test } from "vitest";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe("project structure", () => {
  test("keeps adapter source and layered tests under packages/adapter", async () => {
    await expect(exists("packages/adapter/src/index.ts")).resolves.toBe(true);
    await expect(exists("packages/adapter/src/activation/groups.ts")).resolves.toBe(true);
    await expect(exists("packages/adapter/src/activation/guide.ts")).resolves.toBe(true);
    await expect(exists("packages/adapter/src/activation/skill-tools.ts")).resolves.toBe(true);
    await expect(exists("packages/adapter/tests/core/scan.test.ts")).resolves.toBe(true);
    await expect(exists("packages/adapter/tests/mcp/mcp-server.test.ts")).resolves.toBe(true);
    await expect(exists("packages/adapter/tests/share/share.test.ts")).resolves.toBe(true);
    await expect(exists("packages/adapter/tests/runtime/handlers.test.ts")).resolves.toBe(true);
    await expect(exists("src/index.ts")).resolves.toBe(false);
    await expect(exists("tests/scan.test.ts")).resolves.toBe(false);
    await expect(exists("packages/adapter/tests/scan.test.ts")).resolves.toBe(false);
  });
});
