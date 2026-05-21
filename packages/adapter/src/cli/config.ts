import type { SkillScanLayout } from "../core/types";

const DEFAULT_SHARE_OUTPUT_ROOT = "~/skilldeck-shares";

export type McpServeConfig = {
  skillsRoot: string;
  transport: "stdio" | "http" | "streamable-http";
  host?: string;
  port?: number;
  includeShell: boolean;
  includeManagementTools: boolean;
  allowedRoots?: string[];
  defaultCwd?: string;
  timeoutMs?: number;
  maxOutputLength?: number;
  hotReload: boolean;
  debounceMs?: number;
  layout: SkillScanLayout;
  followSymlinks: boolean;
  skillMode: "compact" | "guided" | "active";
  exposeSkills: number;
  includeShare: boolean;
  shareOutputRoot?: string;
};

export function valueAfterFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx < 0) return undefined;
  return args[idx + 1];
}

export function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export function numberAfterFlag(args: string[], flag: string): number | undefined {
  const value = valueAfterFlag(args, flag);
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseMcpServeConfig(args: string[]): McpServeConfig {
  const skillsRoot = valueAfterFlag(args, "--skills");
  if (!skillsRoot) {
    throw new Error("--skills is required");
  }

  const transport = valueAfterFlag(args, "--transport") ?? "stdio";
  if (transport !== "stdio" && transport !== "http" && transport !== "streamable-http") {
    throw new Error("invalid --transport");
  }
  const layout = valueAfterFlag(args, "--layout") ?? "recursive";
  if (layout !== "recursive" && layout !== "direct") {
    throw new Error("invalid --layout");
  }
  const skillMode = valueAfterFlag(args, "--skill-mode") ?? "active";
  if (skillMode !== "compact" && skillMode !== "guided" && skillMode !== "active") {
    throw new Error("invalid --skill-mode");
  }

  const allowedRoot = valueAfterFlag(args, "--allowed-root");
  const includeShare = !hasFlag(args, "--disable-share-tools");
  const shareOutputRoot = valueAfterFlag(args, "--share-output-root") ?? DEFAULT_SHARE_OUTPUT_ROOT;
  return {
    skillsRoot,
    transport,
    host: valueAfterFlag(args, "--host"),
    port: numberAfterFlag(args, "--port"),
    includeShell: hasFlag(args, "--enable-shell"),
    includeManagementTools: hasFlag(args, "--enable-management-tools"),
    allowedRoots: allowedRoot ? [allowedRoot] : undefined,
    defaultCwd: valueAfterFlag(args, "--default-cwd"),
    timeoutMs: numberAfterFlag(args, "--timeout-ms"),
    maxOutputLength: numberAfterFlag(args, "--max-output"),
    hotReload: hasFlag(args, "--hot-reload"),
    debounceMs: numberAfterFlag(args, "--debounce-ms"),
    layout,
    followSymlinks: hasFlag(args, "--follow-symlinks"),
    skillMode,
    exposeSkills: numberAfterFlag(args, "--expose-skills") ?? 20,
    includeShare,
    shareOutputRoot
  };
}
