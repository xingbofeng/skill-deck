import type { AgenticSkill } from "../core/types";

export function toOpenAIAgentsLocalSkills(skills: AgenticSkill[]): Array<{
  name: string;
  description: string;
  path: string;
}> {
  return skills
    .filter((skill) => skill.valid)
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      path: skill.path
    }));
}
