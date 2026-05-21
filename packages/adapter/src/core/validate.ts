import type { AgenticSkill } from "./types";

export function validateSkill(skill: AgenticSkill): AgenticSkill {
  const errors = [...skill.errors];
  const warnings = [...skill.warnings];

  if (!skill.name) errors.push("missing required name");
  if (!skill.description) errors.push("missing required description");
  if (skill.description && skill.description.length > 1024) {
    errors.push("description exceeds 1024 characters");
  }
  if (skill.name && !/^[A-Za-z0-9][A-Za-z0-9-_ ]{0,127}$/.test(skill.name)) {
    errors.push("invalid name format");
  }
  if (
    skill.complexity &&
    !["beginner", "intermediate", "advanced"].includes(skill.complexity)
  ) {
    errors.push("invalid complexity");
  }

  return {
    ...skill,
    valid: errors.length === 0,
    warnings: Array.from(new Set(warnings)),
    errors: Array.from(new Set(errors))
  };
}
