import { realpath, readdir } from "node:fs/promises";
import path from "node:path";

import { parseSkillFile } from "./parse";
import type { SkillParseMode, SkillScanLayout } from "./types";

export type SkillFolderStatus = "valid" | "invalid" | "missing" | "skipped";

export type SkillFolderDiagnostic = {
  name: string;
  path: string;
  status: SkillFolderStatus;
  code: string;
  message: string;
  errors: string[];
  warnings: string[];
};

type DiagnosticsOptions = {
  mode?: SkillParseMode;
  layout?: SkillScanLayout;
  followSymlinks?: boolean;
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

export async function inspectSkillFolders(
  root: string,
  options: DiagnosticsOptions = {}
): Promise<SkillFolderDiagnostic[]> {
  const mode = options.mode ?? "strict";
  const layout = options.layout ?? "recursive";
  const followSymlinks = options.followSymlinks ?? false;
  const ignoredFolders = new Set(options.ignoredFolders ?? Array.from(DEFAULT_IGNORED));
  const diagnostics: SkillFolderDiagnostic[] = [];
  const rootRealPath = await realpath(root);

  const rootSkillFile = await findSkillFileInDir(root);
  if (rootSkillFile && layout === "direct") {
    diagnostics.push({
      name: path.basename(rootSkillFile),
      path: rootSkillFile,
      status: "skipped",
      code: "root_skill_file",
      message: "Skill files should live in dedicated skill folders for direct layout.",
      errors: [],
      warnings: ["root skill file is ignored in direct layout"]
    });
  }

  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const folderPath = path.join(root, entry.name);
    const isSymlink = entry.isSymbolicLink();
    if (!entry.isDirectory() && !isSymlink) continue;

    if (entry.name.startsWith(".") || entry.name.startsWith("_") || ignoredFolders.has(entry.name)) {
      diagnostics.push({
        name: entry.name,
        path: folderPath,
        status: "skipped",
        code: "skipped",
        message: "Folder skipped by scan policy.",
        errors: [],
        warnings: ["folder skipped"]
      });
      continue;
    }

    if (isSymlink && !followSymlinks) {
      diagnostics.push({
        name: entry.name,
        path: folderPath,
        status: "skipped",
        code: "symlink_skipped",
        message: "Symlink folder skipped because followSymlinks is not enabled.",
        errors: [],
        warnings: ["symlink not followed"]
      });
      continue;
    }

    if (isSymlink) {
      const targetRealPath = await realpath(folderPath);
      if (targetRealPath !== rootRealPath && !targetRealPath.startsWith(`${rootRealPath}${path.sep}`)) {
        diagnostics.push({
          name: entry.name,
          path: folderPath,
          status: "skipped",
          code: "symlink_escape",
          message: "Symlink folder skipped because target escapes the skill root.",
          errors: [],
          warnings: ["symlink target escapes skill root"]
        });
        continue;
      }
    }

    const skillFile = await findSkillFileInDir(folderPath);
    if (!skillFile) {
      diagnostics.push({
        name: entry.name,
        path: folderPath,
        status: "missing",
        code: "missing",
        message: "Missing skill file.",
        errors: [],
        warnings: ["missing skill file"]
      });
      continue;
    }

    const skill = await parseSkillFile(skillFile, { mode });
    const symlinkWarnings = isSymlink ? ["symlink followed"] : [];
    const symlinkPath = isSymlink ? await realpath(folderPath) : undefined;
    diagnostics.push({
      name: entry.name,
      path: symlinkPath ?? folderPath,
      status: skill.valid ? "valid" : "invalid",
      code: isSymlink ? "symlink_followed" : skill.valid ? "valid" : "invalid",
      message: isSymlink
        ? skill.valid
          ? "Valid skill folder reached through followed symlink."
          : "Invalid skill folder reached through followed symlink."
        : skill.valid
          ? "Valid skill folder."
          : "Invalid skill folder.",
      errors: skill.errors,
      warnings: [...symlinkWarnings, ...skill.warnings]
    });
  }

  diagnostics.sort((a, b) => {
    const byPath = a.path.localeCompare(b.path);
    if (byPath !== 0) return byPath;
    return a.code.localeCompare(b.code);
  });
  return diagnostics;
}
