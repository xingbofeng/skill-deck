import { realpath } from "node:fs/promises";
import path from "node:path";

import type { AgenticSkill } from "../core/types";

export type ShellSecurityOptions = {
  allowedRoots?: string[];
  defaultCwd?: string;
  timeoutMs?: number;
  maxOutputLength?: number;
  inheritEnv?: boolean;
  env?: Record<string, string>;
  approveShell?: (input: {
    command: string;
    cwd: string;
    skill?: AgenticSkill;
  }) => Promise<boolean>;
  isCommandAllowed?: (input: {
    command: string;
    cwd: string;
  }) => boolean | Promise<boolean>;
};

function isWithin(allowedRoot: string, candidate: string): boolean {
  const relative = path.relative(allowedRoot, candidate);
  if (relative === "") return true;
  if (relative.startsWith("..")) return false;
  return !path.isAbsolute(relative);
}

export async function ensureAllowedCwd(
  cwd: string,
  allowedRoots: string[]
): Promise<string> {
  const resolvedCwd = await realpath(path.resolve(cwd));
  for (const root of allowedRoots) {
    const resolvedRoot = await realpath(path.resolve(root));
    if (isWithin(resolvedRoot, resolvedCwd)) return resolvedCwd;
  }
  throw new Error("cwd is outside allowedRoots");
}
