import { dirname, basename } from "node:path";
import { readFile } from "node:fs/promises";
import matter from "gray-matter";

import type { AgenticSkill, SkillParseMode } from "./types";
import { buildStableSkillId } from "./ids";

type ParseOptions = {
  mode?: SkillParseMode;
};

function firstHeading(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function firstParagraph(content: string): string | undefined {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));
  return lines[0];
}

function normalizeName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeDescription(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeString(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeStringList(item));
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  const normalized = normalizeString(value);
  return normalized ? [normalized] : [];
}

function baseSkill(filePath: string): AgenticSkill {
  const skillDir = dirname(filePath);
  return {
    id: "",
    name: "",
    description: "",
    tags: [],
    dependencies: [],
    whenToUse: [],
    relatedSkills: [],
    hasExamples: false,
    exampleFiles: [],
    path: skillDir,
    bodyPath: filePath,
    valid: true,
    warnings: [],
    errors: []
  };
}

export async function parseSkillFile(
  filePath: string,
  options: ParseOptions = {}
): Promise<AgenticSkill> {
  const mode = options.mode ?? "strict";
  const raw = await readFile(filePath, "utf8");
  const parsed = matter(raw);
  const skill = baseSkill(filePath);
  const directoryName = basename(dirname(filePath));

  const hasFrontmatter = raw.trimStart().startsWith("---");
  let name = normalizeName(parsed.data.name);
  let description = normalizeDescription(parsed.data.description);

  if (mode === "strict" && !hasFrontmatter) {
    skill.errors.push("missing required frontmatter");
  }

  if (mode === "loose" && !name) {
    name = firstHeading(parsed.content) ?? directoryName;
  }
  if (mode === "loose" && !description) {
    description = firstParagraph(parsed.content);
    if (!description) {
      description = "";
      skill.warnings.push("description fallback is empty");
    }
  }

  if (!name) {
    skill.errors.push("missing required name");
  }
  if (!description) {
    skill.errors.push("missing required description");
  }
  if (description && description.length > 1024) {
    skill.errors.push("description exceeds 1024 characters");
  }
  if (name && !/^[A-Za-z0-9][A-Za-z0-9-_ ]{0,127}$/.test(name)) {
    skill.errors.push("invalid name format");
  }
  if (name && name !== directoryName) {
    skill.warnings.push("name differs from directory name");
  }

  skill.name = name ?? "";
  skill.description = description ?? "";
  skill.frontmatter = (parsed.data ?? {}) as Record<string, unknown>;
  skill.metadata = (parsed.data?.metadata ?? {}) as Record<string, unknown>;
  skill.version = normalizeString(parsed.data.version);
  skill.author = normalizeString(parsed.data.author);
  skill.created = normalizeString(parsed.data.created);
  skill.updated = normalizeString(parsed.data.updated);
  skill.category = normalizeString(parsed.data.category);
  skill.tags = normalizeStringList(parsed.data.tags);
  skill.dependencies = normalizeStringList(parsed.data.dependencies);
  skill.whenToUse = normalizeStringList(parsed.data.when_to_use ?? parsed.data.whenToUse);
  skill.relatedSkills = normalizeStringList(
    parsed.data.related_skills ?? parsed.data.relatedSkills
  );
  skill.exampleFiles = normalizeStringList(parsed.data.examples ?? parsed.data.exampleFiles);
  skill.hasExamples = skill.exampleFiles.length > 0;
  const complexity = normalizeString(parsed.data.complexity);
  if (complexity) {
    if (["beginner", "intermediate", "advanced"].includes(complexity)) {
      skill.complexity = complexity as AgenticSkill["complexity"];
    } else {
      skill.errors.push("invalid complexity");
    }
  }
  skill.valid = skill.errors.length === 0;
  skill.id = await buildStableSkillId(skill.name || directoryName, skill.path);

  return skill;
}
