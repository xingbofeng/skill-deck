import { EventEmitter } from "node:events";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

import type { AgenticSkill } from "../../src/core/types";
import { createSkillFileWatcher } from "../../src/runtime/watcher";

function makeSkill(root: string): AgenticSkill {
  return {
    id: "sample@11111111",
    name: "sample",
    description: "sample desc",
    tags: [],
    dependencies: [],
    whenToUse: [],
    relatedSkills: [],
    hasExamples: true,
    exampleFiles: ["references/guide.md"],
    metadata: { references: ["docs/reference.md"] },
    path: path.join(root, "sample"),
    bodyPath: path.join(root, "sample", "skill.md"),
    valid: true,
    warnings: [],
    errors: []
  };
}

describe("createSkillFileWatcher", () => {
  test("debounces legal skill file changes per file", async () => {
    vi.useFakeTimers();
    const root = "/tmp/skills";
    const emitter = new EventEmitter();
    const changed: string[] = [];

    createSkillFileWatcher({
      root,
      skills: [makeSkill(root)],
      debounceMs: 25,
      onChange: async (filePath) => {
        changed.push(filePath);
      },
      watch: (_root, _options, listener) => {
        emitter.on("change", (eventType, filename) => listener(eventType, filename));
        return { close: vi.fn() };
      }
    });

    emitter.emit("change", "change", "sample/skill.md");
    emitter.emit("change", "change", "sample/skill.md");
    emitter.emit("change", "change", "sample/references/guide.md");
    emitter.emit("change", "change", "added/SKILL.md");
    await vi.advanceTimersByTimeAsync(30);

    expect(changed).toEqual([
      path.join(root, "sample", "skill.md"),
      path.join(root, "sample", "references", "guide.md"),
      path.join(root, "added", "SKILL.md")
    ]);
    vi.useRealTimers();
  });

  test("ignores undeclared files and common generated folders", async () => {
    vi.useFakeTimers();
    const root = "/tmp/skills";
    const emitter = new EventEmitter();
    const changed: string[] = [];

    createSkillFileWatcher({
      root,
      skills: [makeSkill(root)],
      debounceMs: 10,
      onChange: async (filePath) => {
        changed.push(filePath);
      },
      watch: (_root, _options, listener) => {
        emitter.on("change", (eventType, filename) => listener(eventType, filename));
        return { close: vi.fn() };
      }
    });

    emitter.emit("change", "change", "sample/private.md");
    emitter.emit("change", "change", "sample/node_modules/pkg/skill.md");
    emitter.emit("change", "change", "sample/.git/config");
    await vi.advanceTimersByTimeAsync(20);

    expect(changed).toEqual([]);
    vi.useRealTimers();
  });
});
