import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "packages/adapter/src/index.ts",
    "packages/adapter/src/cli/index.ts",
    "packages/adapter/src/adapters/openai-chat.ts",
    "packages/adapter/src/adapters/openai-responses.ts",
    "packages/adapter/src/adapters/anthropic.ts",
    "packages/adapter/src/adapters/openai-agents.ts",
    "packages/adapter/src/mcp/server.ts"
  ],
  format: ["esm"],
  target: "node20",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false
});
