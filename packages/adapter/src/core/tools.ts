import type { AgenticSkill, AgenticTool } from "./types";
import { rankSkillsForExposure, toUseSkillToolName, type SkillPriorityMap } from "../activation/skill-tools";

type ToolOptions = {
  includeShell?: boolean;
  includeSearch?: boolean;
  includeManagement?: boolean;
  skillMode?: "compact" | "guided" | "active";
  skills?: AgenticSkill[];
  exposeSkills?: number;
  skillPriorities?: SkillPriorityMap;
  includeShare?: boolean;
};

const EMPTY_SCHEMA = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false
} as const;

export { toUseSkillToolName };

export function getAgenticSkillTools(options: ToolOptions = {}): AgenticTool[] {
  const includeShell = options.includeShell ?? false;
  const includeSearch = options.includeSearch ?? true;
  const includeManagement = options.includeManagement ?? false;
  const skillMode = options.skillMode ?? "compact";

  const tools: AgenticTool[] = [
    {
      name: "list_skills",
      description: "List available skills.",
      inputSchema: EMPTY_SCHEMA
    },
    {
      name: "read_skill",
      description: "Read a skill by id or unique name.",
      inputSchema: {
        type: "object",
        properties: {
          ref: {
            type: "string",
            description: "Skill id returned by list_skills, or a unique skill name."
          }
        },
        required: ["ref"],
        additionalProperties: false
      }
    }
  ];

  if (includeSearch) {
    tools.push(
      {
        name: "search_skills",
        description: "Search skills by text and metadata filters.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            category: { type: "string" },
            tag: { type: "string" },
            complexity: {
              type: "string",
              enum: ["beginner", "intermediate", "advanced"]
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 100
            },
            offset: {
              type: "integer",
              minimum: 0
            },
            fields: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "id",
                  "name",
                  "description",
                  "category",
                  "tags",
                  "complexity",
                  "whenToUse",
                  "dependencies",
                  "hasExamples",
                  "path",
                  "bodyPath",
                  "valid",
                  "warnings",
                  "errors",
                  "score"
                ]
              }
            }
          },
          required: [],
          additionalProperties: false
        }
      },
      {
        name: "get_skill_info",
        description: "Get metadata for a skill by id or unique name.",
        inputSchema: {
          type: "object",
          properties: {
            ref: {
              type: "string",
              description: "Skill id returned by list_skills, or a unique skill name."
            }
          },
          required: ["ref"],
          additionalProperties: false
        }
      }
    );
  }

  if (skillMode === "guided" || skillMode === "active") {
    tools.push({
      name: "skill_guide",
      description:
        "Call this first when the user asks for a complex task. It returns available local Agent Skills and explains how to load the full SKILL.md before applying a skill.",
      inputSchema: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description: "Optional user task used to rank recommended skills."
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 50
          }
        },
        required: [],
        additionalProperties: false
      }
    });
  }

  if (skillMode === "active") {
    const exposeSkills = options.exposeSkills ?? 20;
    for (const skill of rankSkillsForExposure(options.skills ?? [], options.skillPriorities).slice(0, exposeSkills)) {
      tools.push({
        name: toUseSkillToolName(skill),
        description: `Load the full SKILL.md for ${skill.name}. ${skill.description}`,
        inputSchema: EMPTY_SCHEMA
      });
    }
  }

  if (includeManagement) {
    tools.push(
      {
        name: "list_skill_folders",
        description: "List folders and whether they contain valid skill files.",
        inputSchema: EMPTY_SCHEMA
      },
      {
        name: "validate_skills",
        description: "Validate skill folder structure and skill files.",
        inputSchema: {
          type: "object",
          properties: {
            includeSkipped: {
              type: "boolean",
              default: true
            }
          },
          required: [],
          additionalProperties: false
        }
      },
      {
        name: "reload_skills",
        description: "Reload skills from disk.",
        inputSchema: EMPTY_SCHEMA
      }
    );
  }

  if (includeShell) {
    tools.push({
      name: "run_skill_shell",
      description: "Run a shell command for a skill with host security policy.",
      inputSchema: {
        type: "object",
        properties: {
          skillRef: {
            type: "string",
            description: "Skill id or unique skill name associated with this shell action."
          },
          command: {
            type: "string",
            description: "Shell command to execute. Must be non-empty."
          },
          cwd: {
            type: "string",
            description: "Working directory. Must resolve inside allowedRoots."
          },
          timeoutMs: {
            type: "integer",
            minimum: 1,
            maximum: 120000
          },
          maxOutputLength: {
            type: "integer",
            minimum: 1,
            maximum: 200000
          },
          reason: {
            type: "string",
            description: "Brief reason why this command is needed."
          }
        },
        required: ["command"],
        additionalProperties: false
      }
    });
  }

  if (options.includeShare) {
    tools.push(
      {
        name: "generate_skill_share",
        description: "Generate a redacted static SkillDeck share page plus cover.png and detail.png.",
        inputSchema: {
          type: "object",
          properties: {
            refs: {
              type: "array",
              items: { type: "string" },
              description: "Optional Skill ids or unique names. Empty means all loaded Skills."
            },
            ref: { type: "string", description: "Deprecated single-skill alias for refs." },
            outDir: { type: "string" },
            audience: { type: "string" },
            redact: { type: "boolean", default: true },
            highlights: {
              type: "array",
              items: { type: "string" }
            },
            caseStudies: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  result: { type: "string" },
                  skillRefs: {
                    type: "array",
                    items: { type: "string" }
                  }
                },
                required: ["title", "result"],
                additionalProperties: false
              }
            }
          },
          required: ["outDir"],
          additionalProperties: false
        }
      },
      {
        name: "get_skill_share_artifact",
        description: "Read a generated SkillDeck share artifact from an allowed output root.",
        inputSchema: {
          type: "object",
          properties: {
            artifactId: { type: "string" },
            kind: {
              type: "string",
              enum: ["manifest", "html", "cover", "detail"]
            },
            path: { type: "string" }
          },
          required: [],
          additionalProperties: false
        }
      }
    );
  }

  return tools;
}
