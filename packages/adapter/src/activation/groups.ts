import type { AgenticSkill } from "../core/types";
import { toUseSkillToolName } from "./skill-tools";

export type CapabilityGroupName =
  | "content_creation"
  | "engineering"
  | "product_planning"
  | "research_knowledge"
  | "automation_productivity"
  | "operations_publishing"
  | "other";

type CapabilityDefinition = {
  name: CapabilityGroupName;
  title: string;
  description: string;
  keywords: string[];
};

export type CapabilityGroup = {
  name: CapabilityGroupName;
  description: string;
  skills: Array<{
    id: string;
    name: string;
    description?: string;
    toolName?: string;
  }>;
};

const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  {
    name: "content_creation",
    title: "Content Creation",
    description: "Writing, presentation, design, media, and content production skills.",
    keywords: ["content", "writing", "writer", "story", "article", "ppt", "slide", "design", "image"]
  },
  {
    name: "engineering",
    title: "Engineering",
    description: "Code, repository, debugging, testing, and software engineering skills.",
    keywords: ["engineering", "code", "repo", "review", "debug", "test", "typescript", "frontend"]
  },
  {
    name: "product_planning",
    title: "Product and Planning",
    description: "Product strategy, planning, requirements, and roadmap skills.",
    keywords: ["product", "planning", "prd", "roadmap", "requirements", "strategy"]
  },
  {
    name: "research_knowledge",
    title: "Research and Knowledge",
    description: "Research, retrieval, synthesis, and knowledge management skills.",
    keywords: ["research", "knowledge", "retrieval", "summarize", "summary", "paper"]
  },
  {
    name: "automation_productivity",
    title: "Automation and Productivity",
    description: "Workflow automation, browser work, repetitive tasks, and productivity skills.",
    keywords: ["automation", "productivity", "browser", "workflow", "agent", "task"]
  },
  {
    name: "operations_publishing",
    title: "Operations and Publishing",
    description: "Publishing, operations, release, deployment, and distribution skills.",
    keywords: ["publish", "publishing", "release", "deploy", "ops", "operations"]
  },
  {
    name: "other",
    title: "Other",
    description: "Skills that do not strongly match the fixed taxonomy.",
    keywords: []
  }
];

function skillText(skill: AgenticSkill): string {
  return [
    skill.name,
    skill.description,
    skill.category ?? "",
    skill.tags.join(" "),
    skill.whenToUse.join(" "),
    skill.dependencies.join(" ")
  ]
    .join(" ")
    .toLowerCase();
}

export function classifySkill(skill: AgenticSkill): CapabilityGroupName {
  const text = skillText(skill);
  let best: { name: CapabilityGroupName; score: number } = { name: "other", score: 0 };
  for (const definition of CAPABILITY_DEFINITIONS) {
    if (definition.name === "other") continue;
    const score = definition.keywords.filter((keyword) => text.includes(keyword)).length;
    if (score > best.score) {
      best = { name: definition.name, score };
    }
  }
  return best.name;
}

export function buildCapabilityGroups(skills: AgenticSkill[], includeToolNames = false): CapabilityGroup[] {
  const grouped = new Map<CapabilityGroupName, CapabilityGroup>();
  for (const definition of CAPABILITY_DEFINITIONS) {
    grouped.set(definition.name, {
      name: definition.name,
      description: definition.description,
      skills: []
    });
  }

  for (const skill of skills) {
    const group = grouped.get(classifySkill(skill)) ?? grouped.get("other")!;
    group.skills.push({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      ...(includeToolNames ? { toolName: toUseSkillToolName(skill) } : {})
    });
  }

  return CAPABILITY_DEFINITIONS.map((definition) => grouped.get(definition.name)!).filter(
    (group) => group.skills.length > 0
  );
}
