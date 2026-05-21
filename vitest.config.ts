import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/adapter/tests/**/*.test.ts"],
    environment: "node",
    globals: true
  }
});
