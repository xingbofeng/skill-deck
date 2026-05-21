import type { AgenticToolName } from "../core/types";

type ValidationResult =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string };

function objectArgs(args: unknown): Record<string, unknown> {
  return args && typeof args === "object" && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {};
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === "boolean" ? value : undefined;
}

function optionalStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key];
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string");
  return items.length > 0 ? items : [];
}

function parseCaseStudies(args: Record<string, unknown>): Array<{
  title: string;
  result: string;
  skillRefs?: string[];
}> | undefined {
  const value = args.caseStudies;
  if (!Array.isArray(value)) return undefined;
  const parsed = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || item === null) continue;
    const title = optionalString(item as Record<string, unknown>, "title");
    const result = optionalString(item as Record<string, unknown>, "result");
    if (!title || !result) return undefined;
    parsed.push({
      title,
      result,
      skillRefs: optionalStringArray(item as Record<string, unknown>, "skillRefs")
    });
  }
  return parsed;
}

export function validateToolArguments(
  toolName: AgenticToolName,
  rawArgs: unknown
): ValidationResult {
  const args = objectArgs(rawArgs);

  if (toolName === "read_skill") {
    const ref = optionalString(args, "ref");
    if (!ref?.trim()) return { ok: false, error: "ref is required" };
    return { ok: true, args: { ref } };
  }

  if (toolName === "search_skills") {
    const complexity = optionalString(args, "complexity");
    if (
      complexity &&
      !["beginner", "intermediate", "advanced"].includes(complexity)
    ) {
      return { ok: false, error: "invalid complexity" };
    }
    return {
      ok: true,
      args: {
        query: optionalString(args, "query"),
        category: optionalString(args, "category"),
        tag: optionalString(args, "tag"),
        complexity,
        limit:
          Number.isFinite(optionalNumber(args, "limit")) && optionalNumber(args, "limit")! > 0
            ? optionalNumber(args, "limit")
            : undefined,
        offset:
          Number.isFinite(optionalNumber(args, "offset")) && optionalNumber(args, "offset")! >= 0
            ? optionalNumber(args, "offset")
            : undefined,
        fields: optionalStringArray(args, "fields")
      }
    };
  }

  if (toolName === "get_skill_info") {
    const ref = optionalString(args, "ref");
    if (!ref?.trim()) return { ok: false, error: "ref is required" };
    return { ok: true, args: { ref } };
  }

  if (toolName === "skill_guide") {
    const limit = optionalNumber(args, "limit");
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
      return { ok: false, error: "limit must be an integer between 1 and 50" };
    }
    return {
      ok: true,
      args: {
        task: optionalString(args, "task"),
        limit
      }
    };
  }

  if (toolName === "generate_skill_share") {
    const refs = optionalStringArray(args, "refs");
    const ref = optionalString(args, "ref");
    if (refs && ref) {
      return { ok: false, error: "provide either refs or ref, not both" };
    }
    const caseStudies = parseCaseStudies(args);
    if (args.caseStudies !== undefined && caseStudies === undefined) {
      return { ok: false, error: "invalid caseStudies payload" };
    }

    return {
      ok: true,
      args: {
        refs,
        ref,
        outDir: optionalString(args, "outDir"),
        audience: optionalString(args, "audience"),
        highlights: optionalStringArray(args, "highlights"),
        redact: optionalBoolean(args, "redact"),
        caseStudies: caseStudies
      }
    };
  }

  if (toolName === "get_skill_share_artifact") {
    const artifactId = optionalString(args, "artifactId");
    const kind = optionalString(args, "kind");
    const filePath = optionalString(args, "path");
    if (!artifactId && !filePath) {
      return {
        ok: false,
        error: "artifactId or path is required"
      };
    }
    if (artifactId && !kind) {
      return {
        ok: false,
        error: "kind is required when artifactId is provided"
      };
    }
    if (filePath && artifactId) {
      return {
        ok: false,
        error: "provide either artifactId/kind or path, not both"
      };
    }
    return {
      ok: true,
      args: { artifactId, kind, path: filePath }
    };
  }

  if (toolName === "run_skill_shell") {
    const command = optionalString(args, "command");
    if (!command?.trim()) return { ok: false, error: "command is required" };
    return {
      ok: true,
      args: {
        command,
        cwd: optionalString(args, "cwd"),
        skillRef: optionalString(args, "skillRef"),
        reason: optionalString(args, "reason"),
        timeoutMs: optionalNumber(args, "timeoutMs"),
        maxOutputLength: optionalNumber(args, "maxOutputLength")
      }
    };
  }

  if (
    toolName === "list_skills" ||
    toolName === "list_skill_folders" ||
    toolName === "reload_skills"
  ) {
    return { ok: true, args: {} };
  }

  if (toolName === "validate_skills") {
    const includeSkipped = args.includeSkipped;
    return {
      ok: true,
      args: {
        includeSkipped: typeof includeSkipped === "boolean" ? includeSkipped : true
      }
    };
  }

  return { ok: false, error: `unknown tool: ${toolName}` };
}
