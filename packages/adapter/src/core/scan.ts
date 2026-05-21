import { readdir, realpath } from "node:fs/promises";
import path from "node:path";

import type { AgenticSkill, SkillParseMode, SkillScanLayout } from "./types";
import { parseSkillFile } from "./parse";

type ScanOptions = {
  mode?: SkillParseMode;
  layout?: SkillScanLayout;
  recursive?: boolean;
  followSymlinks?: boolean;
  includeInvalid?: boolean;
  ignoredFolders?: string[];
};

const DEFAULT_IGNORED = new Set([
  ".git",
  ".vscode",
  ".idea",
  "__pycache__",
  "node_modules",
  "venv",
  ".venv"
]);

function isSkillFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "skill" || lower === "skill.md";
}

async function findSkillFileInDir(dir: string): Promise<string | undefined> {
  const entries = await readdir(dir, { withFileTypes: true });
  const file = entries.find((entry) => entry.isFile() && isSkillFileName(entry.name));
  return file ? path.join(dir, file.name) : undefined;
}

async function collectRecursiveSkillFiles(
  root: string,
  options: Required<Pick<ScanOptions, "followSymlinks">> & { ignoredFolders: Set<string> }
): Promise<string[]> {
  const files: string[] = [];
  const queue = [root];
  const visited = new Set<string>();
  const rootRealPath = await realpath(root);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const currentRealPath = await realpath(current);
    if (visited.has(currentRealPath)) continue;
    visited.add(currentRealPath);
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isFile() && isSkillFileName(entry.name)) {
        files.push(fullPath);
        continue;
      }
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
        if (options.ignoredFolders.has(entry.name)) continue;
        queue.push(fullPath);
        continue;
      }
      if (entry.isSymbolicLink() && options.followSymlinks) {
        const targetRealPath = await realpath(fullPath);
        if (targetRealPath !== rootRealPath && !targetRealPath.startsWith(`${rootRealPath}${path.sep}`)) {
          continue;
        }
        queue.push(fullPath);
      }
    }
  }

  return files;
}

export async function scanSkills(
  root: string,
  options: ScanOptions = {}
): Promise<AgenticSkill[]> {
  const mode = options.mode ?? "strict";
  const layout = options.layout ?? "recursive";
  const followSymlinks = options.followSymlinks ?? false;
  const includeInvalid = options.includeInvalid ?? false;
  const ignoredFolders = new Set(options.ignoredFolders ?? Array.from(DEFAULT_IGNORED));

  const skillFiles: string[] = [];

  if (layout === "direct") {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
      if (ignoredFolders.has(entry.name)) continue;
      const file = await findSkillFileInDir(path.join(root, entry.name));
      if (file) skillFiles.push(file);
    }
  } else {
    const rootSkillFile = await findSkillFileInDir(root);
    if (rootSkillFile) {
      skillFiles.push(rootSkillFile);
    }
    const recursiveFiles = await collectRecursiveSkillFiles(root, {
      followSymlinks,
      ignoredFolders
    });
    for (const file of recursiveFiles) {
      if (!skillFiles.includes(file)) skillFiles.push(file);
    }
  }

  const parsed: AgenticSkill[] = [];
  for (const file of skillFiles) {
    const skill = await parseSkillFile(file, { mode });
    if (skill.valid || includeInvalid) parsed.push(skill);
  }

  parsed.sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id);
  });

  return parsed;
}
