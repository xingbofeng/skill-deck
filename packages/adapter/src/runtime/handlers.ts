import { readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";

import type {
  AgenticHandlerResult,
  AgenticSkill,
  AgenticToolName,
  SkillParseMode,
  SkillScanLayout
} from "../core/types";
import { createSkillRepository } from "../core/repository";
import { buildSkillGuideResult } from "../activation/guide";
import { rankSkillsForExposure, toUseSkillToolName } from "../activation/skill-tools";
import { createManagementHandlers } from "./management";
import {
  generateSkillShare,
  readShareArtifact,
  readShareManifestForArtifact,
  type RenderShareImage
} from "./share";
import { ensureAllowedCwd, type ShellSecurityOptions } from "./security";
import { validateToolArguments } from "./schemas";

type LocalShellRunner = (input: {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  maxOutputLength?: number;
  env?: Record<string, string>;
}) => Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut?: boolean;
  truncated?: boolean;
  durationMs?: number;
}>;

type HandlerOptions = {
  skills: AgenticSkill[];
  exposeSkills?: number;
  skillsRoot?: string;
  layout?: SkillScanLayout;
  mode?: SkillParseMode;
  followSymlinks?: boolean;
  skillMode?: "compact" | "guided" | "active";
  includeShare?: boolean;
  shareOutputRoots?: string[];
  renderShareImage?: RenderShareImage;
  includeManagement?: boolean;
  readFile?: (path: string) => Promise<string>;
  runShell?: LocalShellRunner;
  security?: ShellSecurityOptions;
  onSkillsReload?: (skills: AgenticSkill[]) => void;
};

type HandlerMap = Partial<
  Record<AgenticToolName, (args: unknown) => Promise<AgenticHandlerResult>>
>;

function getRef(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const ref = (args as { ref?: unknown }).ref;
  return typeof ref === "string" ? ref : undefined;
}

function summarizeSkill(skill: AgenticSkill): Record<string, unknown> {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    author: skill.author,
    created: skill.created,
    updated: skill.updated,
    category: skill.category,
    tags: skill.tags,
    complexity: skill.complexity,
    dependencies: skill.dependencies,
    whenToUse: skill.whenToUse,
    relatedSkills: skill.relatedSkills,
    hasExamples: skill.hasExamples,
    exampleFiles: skill.exampleFiles,
    metadata: skill.metadata,
    path: skill.path,
    bodyPath: skill.bodyPath,
    valid: skill.valid,
    warnings: skill.warnings,
    errors: skill.errors
  };
}

function numberArg(args: unknown, key: string, fallback: number): number {
  if (!args || typeof args !== "object") return fallback;
  const value = (args as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function stringArg(args: unknown, key: string): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function stringListArg(args: unknown, key: string): string[] | undefined {
  if (!args || typeof args !== "object") return undefined;
  const value = (args as Record<string, unknown>)[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function pathInsideRoots(filePath: string, roots: string[]): boolean {
  const resolved = path.resolve(filePath);
  return roots.some((root) => {
    const resolvedRoot = path.resolve(root);
    return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`);
  });
}

export function createSkillHandlers(options: HandlerOptions): HandlerMap {
  const readFile =
    options.readFile ??
    (async (filePath: string) => fsReadFile(filePath, "utf8"));
  let skills = options.skills;
  const repository = createSkillRepository(skills);
  const mode = options.mode ?? "strict";
  const layout = options.layout ?? "recursive";
  const skillMode = options.skillMode ?? "compact";
  const exposeSkills = options.exposeSkills ?? 20;
  const activeToolNames = new Set<string>();

  function resolveSkillByRef(raw: unknown): { skill?: AgenticSkill; error?: string; candidates?: unknown } {
    const ref = getRef(raw);
    if (!ref) return { error: "ref is required" };
    const resolved = repository.resolve(ref);
    if ("error" in resolved) {
      return { error: resolved.error, candidates: resolved.candidates };
    }
    return { skill: resolved.skill };
  }

  function refreshActiveToolHandlers() {
    if (skillMode !== "active") return;
    for (const oldName of activeToolNames) {
      delete handlers[oldName];
    }
    activeToolNames.clear();
    for (const skill of rankSkillsForExposure(repository.list()).slice(0, exposeSkills)) {
      const toolName = toUseSkillToolName(skill);
      activeToolNames.add(toolName);
      handlers[toolName] = async () => {
        const body = await readFile(skill.bodyPath);
        return {
          data: {
            ...summarizeSkill(skill),
            body
          }
        };
      };
    }
  }

  const handlers: HandlerMap = {
    list_skills: async () => ({
      data: repository.list().map(summarizeSkill)
    }),

    read_skill: async (args) => {
      const parsed = validateToolArguments("read_skill", args);
      if (!parsed.ok) return { error: parsed.error };
      const resolvedRef = resolveSkillByRef(parsed.args);
      if (resolvedRef.error || !resolvedRef.skill) {
        return {
          error: resolvedRef.error,
          data: resolvedRef.candidates ? { candidates: resolvedRef.candidates } : undefined
        };
      }
      const body = await readFile(resolvedRef.skill.bodyPath);
      return {
        data: {
          ...summarizeSkill(resolvedRef.skill),
          body
        }
      };
    },

    search_skills: async (args) => {
      const parsed = validateToolArguments("search_skills", args);
      if (!parsed.ok) return { error: parsed.error };
      const page = repository.search({
        query: stringArg(parsed.args, "query"),
        category: stringArg(parsed.args, "category"),
        tag: stringArg(parsed.args, "tag"),
        complexity: stringArg(parsed.args, "complexity"),
        limit: numberArg(parsed.args, "limit", 50),
        offset: numberArg(parsed.args, "offset", 0),
        fields: stringListArg(parsed.args, "fields")
      });
      return {
        data: page
      };
    },

    get_skill_info: async (args) => {
      const parsed = validateToolArguments("get_skill_info", args);
      if (!parsed.ok) return { error: parsed.error };
      const resolvedRef = resolveSkillByRef(parsed.args);
      if (resolvedRef.error || !resolvedRef.skill) {
        return {
          error: resolvedRef.error,
          data: resolvedRef.candidates ? { candidates: resolvedRef.candidates } : undefined
        };
      }
      return { data: summarizeSkill(resolvedRef.skill) };
    },

    run_skill_shell: async (args) => {
      if (!options.runShell) {
        return { error: "run_skill_shell is disabled" };
      }
      const parsed = validateToolArguments("run_skill_shell", args);
      if (!parsed.ok) return { error: parsed.error };
      const security = options.security;
      let skill: AgenticSkill | undefined;
      if (typeof parsed.args.skillRef === "string") {
        const resolved = repository.resolve(parsed.args.skillRef);
        if ("error" in resolved) {
          return {
            error: resolved.error,
            data: resolved.candidates ? { candidates: resolved.candidates } : undefined
          };
        }
        skill = resolved.skill;
      }

      const command = typeof parsed.args.command === "string" ? parsed.args.command : "";
      let cwd =
        typeof parsed.args.cwd === "string"
          ? parsed.args.cwd
          : security?.defaultCwd ?? skill?.path ?? options.skillsRoot;

      if (security) {
        const allowedRoots = security.allowedRoots ?? [
          options.skillsRoot ?? security.defaultCwd ?? skill?.path ?? process.cwd()
        ];
        try {
          cwd = await ensureAllowedCwd(cwd ?? allowedRoots[0]!, allowedRoots);
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) };
        }
        if (security.isCommandAllowed) {
          try {
            const allowed = await security.isCommandAllowed({ command, cwd });
            if (!allowed) return { error: "command rejected by policy" };
          } catch (error) {
            return {
              error: `command policy check failed: ${
                error instanceof Error ? error.message : String(error)
              }`
            };
          }
        }
        if (security.approveShell) {
          try {
            const approved = await security.approveShell({ command, cwd, skill });
            if (!approved) return { error: "command rejected by approval hook" };
          } catch (error) {
            return {
              error: `command approval failed: ${
                error instanceof Error ? error.message : String(error)
              }`
            };
          }
        }
      }

      const result = await options.runShell({
        command,
        cwd,
        timeoutMs:
          typeof parsed.args.timeoutMs === "number" ? parsed.args.timeoutMs : security?.timeoutMs,
        maxOutputLength:
          typeof parsed.args.maxOutputLength === "number"
            ? parsed.args.maxOutputLength
            : security?.maxOutputLength,
        env: security?.env
      });
      return { data: result };
    }
  };

  if (skillMode === "guided" || skillMode === "active") {
    handlers.skill_guide = async (args) => {
      const parsed = validateToolArguments("skill_guide", args);
      if (!parsed.ok) return { error: parsed.error };
      const task = stringArg(parsed.args, "task");
      const limit = numberArg(parsed.args, "limit", 5);
      return {
        data: buildSkillGuideResult({
          skills: repository.list(),
          mode: skillMode,
          task,
          limit
        })
      };
    };
  }

  if (options.skillsRoot) {
    const skillsRoot = options.skillsRoot;
    handlers.reload_skills = async () => {
      const management = createManagementHandlers({
        skillsRoot,
        state: { skills },
        mode,
        layout,
        followSymlinks: options.followSymlinks ?? false
      });
      const result = await management.reload_skills({});
      repository.replace(skills);
      refreshActiveToolHandlers();
      options.onSkillsReload?.(repository.list());
      return result;
    };

    if (options.includeManagement) {
      const management = createManagementHandlers({
        skillsRoot,
        state: { skills },
        mode,
        layout,
        followSymlinks: options.followSymlinks ?? false
      });
      handlers.list_skill_folders = management.list_skill_folders;
      handlers.validate_skills = management.validate_skills;
    }
  }

  if (skillMode === "active") {
    refreshActiveToolHandlers();
  }

  if (options.includeShare) {
    handlers.generate_skill_share = async (args) => {
      const parsed = validateToolArguments("generate_skill_share", args);
      if (!parsed.ok) return { error: parsed.error };
      const shareOutputRoots = options.shareOutputRoots ?? [];
      const outDir = stringArg(parsed.args, "outDir") ?? shareOutputRoots[0];
      if (!outDir) return { error: "outDir is required" };
      if (!pathInsideRoots(outDir, shareOutputRoots)) {
        return { error: "outDir is outside shareOutputRoots" };
      }

      const refs =
        stringListArg(parsed.args, "refs") ??
        (getRef(parsed.args) ? [getRef(parsed.args)!] : []);
      const selectedSkills: AgenticSkill[] = [];
      for (const ref of refs.length > 0 ? refs : repository.list().map((skill) => skill.id)) {
        const resolved = repository.resolve(ref);
        if ("error" in resolved) {
          return {
            error: resolved.error,
            data: resolved.candidates ? { candidates: resolved.candidates } : undefined
          };
        }
        selectedSkills.push(resolved.skill);
      }

      const result = await generateSkillShare({
        skills: await Promise.all(
          selectedSkills.map(async (skill) => ({
            skill,
            body: await readFile(skill.bodyPath)
          }))
        ),
        outDir,
        renderImage: options.renderShareImage,
        audience: stringArg(parsed.args, "audience"),
        highlights: stringListArg(parsed.args, "highlights"),
        redact:
          typeof parsed.args.redact === "boolean"
            ? parsed.args.redact
            : true,
        caseStudies: Array.isArray(parsed.args.caseStudies)
          ? parsed.args.caseStudies
          : undefined
      });
      return { data: result };
    };

    handlers.get_skill_share_artifact = async (args) => {
      const parsed = validateToolArguments("get_skill_share_artifact", args);
      if (!parsed.ok) return { error: parsed.error };
      const artifactId = stringArg(parsed.args, "artifactId");
      const kind = stringArg(parsed.args, "kind");
      const filePath = stringArg(parsed.args, "path");
      if (artifactId && kind) {
        try {
          const manifest = await readShareManifestForArtifact(
            artifactId,
            options.shareOutputRoots ?? []
          );
          const file = manifest.files.find((item) => item.kind === kind);
          if (!file) return { error: `artifact kind not found: ${kind}` };
          const data = await readShareArtifact(
            file.path,
            options.shareOutputRoots ?? [],
            file.mimeType
          );
          return {
            data: {
              artifactId,
              kind,
              path: file.path,
              ...data
            }
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) };
        }
      }
      if (!filePath) return { error: "path is required" };
      try {
        return {
          data: await readShareArtifact(filePath, options.shareOutputRoots ?? [])
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    };
  }

  return handlers;
}
