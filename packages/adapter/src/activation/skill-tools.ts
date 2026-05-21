import type { AgenticSkill } from "../core/types";

export type SkillPriorityMap = Record<string, number>;

function safeToolNamePart(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function toUseSkillToolName(skill: AgenticSkill): string {
  const suffix = (skill.id.split("@").at(-1) ?? skill.id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  const safeName = safeToolNamePart(skill.name) || "skill";
  return `use_skill_${safeName}_${suffix}`.slice(0, 64);
}

function metadataPriority(skill: AgenticSkill): number {
  const value = skill.metadata?.priority ?? skill.frontmatter?.priority;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function metadataQuality(skill: AgenticSkill): number {
  return [
    skill.description.trim().length > 0,
    skill.whenToUse.length > 0,
    skill.tags.length > 0,
    Boolean(skill.category),
    skill.dependencies.length > 0,
    skill.hasExamples
  ].filter(Boolean).length;
}

function configuredPriority(skill: AgenticSkill, priorities: SkillPriorityMap | undefined): number {
  return priorities?.[skill.id] ?? priorities?.[skill.name] ?? 0;
}

export function rankSkillsForExposure(
  skills: AgenticSkill[],
  priorities?: SkillPriorityMap
): AgenticSkill[] {
  return [...skills].sort((a, b) => {
    const configured = configuredPriority(b, priorities) - configuredPriority(a, priorities);
    if (configured !== 0) return configured;
    const metadata = metadataPriority(b) - metadataPriority(a);
    if (metadata !== 0) return metadata;
    const quality = metadataQuality(b) - metadataQuality(a);
    if (quality !== 0) return quality;
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id);
  });
}
