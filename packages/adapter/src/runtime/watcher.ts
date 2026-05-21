import { watch as fsWatch, type FSWatcher } from "node:fs";
import path from "node:path";

import type { AgenticSkill } from "../core/types";

type WatchListener = (eventType: string, filename: string | Buffer | null) => void;
type WatchFunction = (
  root: string,
  options: { recursive: boolean },
  listener: WatchListener
) => Pick<FSWatcher, "close">;

type SkillFileWatcherOptions = {
  root: string;
  skills: AgenticSkill[];
  debounceMs?: number;
  onChange: (filePath: string) => Promise<void> | void;
  watch?: WatchFunction;
};

const IGNORED_SEGMENTS = new Set([".git", "node_modules", "dist", "build", "coverage"]);

function metadataStringList(metadata: Record<string, unknown> | undefined, key: string): string[] {
  const value = metadata?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function skillLegalFiles(skill: AgenticSkill): string[] {
  return [
    skill.bodyPath,
    ...skill.exampleFiles.map((file) => path.join(skill.path, file)),
    ...metadataStringList(skill.metadata, "references").map((file) => path.join(skill.path, file)),
    ...metadataStringList(skill.metadata, "referenceFiles").map((file) =>
      path.join(skill.path, file)
    )
  ].map((file) => path.resolve(file));
}

function shouldIgnore(relativePath: string): boolean {
  return relativePath
    .split(/[\\/]/)
    .some((segment) => segment.startsWith(".") || IGNORED_SEGMENTS.has(segment));
}

function isSkillFile(relativePath: string): boolean {
  const name = path.basename(relativePath).toLowerCase();
  return name === "skill" || name === "skill.md";
}

export function createSkillFileWatcher(options: SkillFileWatcherOptions): Pick<FSWatcher, "close"> {
  const root = path.resolve(options.root);
  const debounceMs = options.debounceMs ?? 500;
  const legalFiles = new Set(options.skills.flatMap(skillLegalFiles));
  const timers = new Map<string, NodeJS.Timeout>();
  const watch = options.watch ?? fsWatch;

  const watcher = watch(root, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    const relativePath = filename.toString();
    if (shouldIgnore(relativePath)) return;
    const filePath = path.resolve(root, relativePath);
    if (!legalFiles.has(filePath) && !isSkillFile(relativePath)) return;

    const existing = timers.get(filePath);
    if (existing) clearTimeout(existing);
    timers.set(
      filePath,
      setTimeout(() => {
        timers.delete(filePath);
        void options.onChange(filePath);
      }, debounceMs)
    );
  });

  return {
    close: () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      watcher.close();
    }
  };
}
