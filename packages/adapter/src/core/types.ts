export type SkillParseMode = "strict" | "loose";
export type SkillScanLayout = "recursive" | "direct";
export type SkillComplexity = "beginner" | "intermediate" | "advanced";

export type AgenticSkill = {
  id: string;
  name: string;
  description: string;
  version?: string;
  author?: string;
  created?: string;
  updated?: string;
  category?: string;
  tags: string[];
  complexity?: SkillComplexity;
  dependencies: string[];
  whenToUse: string[];
  relatedSkills: string[];
  hasExamples: boolean;
  exampleFiles: string[];
  path: string;
  bodyPath: string;
  frontmatter?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  valid: boolean;
  warnings: string[];
  errors: string[];
};

export type AgenticToolName = string;

export type AgenticTool = {
  name: AgenticToolName;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type AgenticHandlerResult = {
  text?: string;
  data?: unknown;
  error?: string;
};
