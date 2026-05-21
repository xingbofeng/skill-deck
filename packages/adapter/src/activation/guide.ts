import type { AgenticSkill } from "../core/types";
import { buildCapabilityGroups } from "./groups";
import { rankSkillsForExposure, toUseSkillToolName, type SkillPriorityMap } from "./skill-tools";

type SkillActivationMode = "compact" | "guided" | "active";

function taskScore(skill: AgenticSkill, task: string | undefined): number {
  if (!task) return 0;
  const terms = task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2);
  const haystack = [
    skill.name,
    skill.description,
    skill.category ?? "",
    skill.tags.join(" "),
    skill.whenToUse.join(" ")
  ]
    .join(" ")
    .toLowerCase();
  return terms.filter((term) => haystack.includes(term)).length;
}

export function recommendedSkills(
  skills: AgenticSkill[],
  task: string | undefined,
  limit: number,
  priorities?: SkillPriorityMap
): AgenticSkill[] {
  const ranked = rankSkillsForExposure(skills, priorities).map((skill) => ({
    skill,
    score: taskScore(skill, task)
  }));
  return ranked
    .filter((item) => !task || item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const byName = a.skill.name.localeCompare(b.skill.name);
      if (byName !== 0) return byName;
      return a.skill.id.localeCompare(b.skill.id);
    })
    .slice(0, limit)
    .map((item) => item.skill);
}

export function buildSkillGuideResult(input: {
  skills: AgenticSkill[];
  mode: SkillActivationMode;
  task?: string;
  limit: number;
  priorities?: SkillPriorityMap;
  exposedSkills?: number;
}): Record<string, unknown> {
  const active = input.mode === "active";
  const exposed = active
    ? rankSkillsForExposure(input.skills, input.priorities).slice(0, input.exposedSkills ?? 20)
    : [];
  const directTools = exposed.map(toUseSkillToolName);
  const recommended = recommendedSkills(input.skills, input.task, input.limit, input.priorities);

  return {
    mode: input.mode,
    totalSkills: input.skills.length,
    summary: {
      totalSkills: input.skills.length,
      mode: input.mode,
      exposedSkillTools: directTools.length
    },
    recommendedFlow: [
      "Call search_skills or skill_guide to choose a skill.",
      "Always call read_skill or a use_skill_* tool to load the full SKILL.md before applying it.",
      "Apply the loaded instructions to the user's task."
    ],
    capabilityGroups: buildCapabilityGroups(input.skills, active),
    recommendedSkills: recommended.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      whenToUse: skill.whenToUse,
      ...(active ? { toolName: toUseSkillToolName(skill) } : {})
    })),
    availableTools: {
      search: "search_skills",
      info: "get_skill_info",
      read: "read_skill",
      directTools
    },
    safetyNotes: [
      "Skill Activation only reads skill markdown.",
      "Do not run shell commands unless run_skill_shell is explicitly enabled."
    ]
  };
}
