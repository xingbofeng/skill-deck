# Agent SDK Integration

Connect the scanned skill inventory into the OpenAI Agents SDK local shell environment.

## Basic example

```ts
import { scanSkills } from "skill-deck";
import { toOpenAIAgentsLocalSkills } from "skill-deck/openai-agents";
import { shellTool } from "@openai/agents";

const skills = await scanSkills("/Users/me/.skills");

const tool = shellTool({
  shell,
  environment: {
    type: "local",
    skills: toOpenAIAgentsLocalSkills(skills),
  },
  needsApproval: true,
});
```

## Interface list

### `scanSkills(root, options)`

Description: scans a skill root and returns normalized `AgenticSkill[]`. The root can be one skill directory or a parent directory containing many skills.

Input:

- `root: string`, a local skill directory or skill root.
- `options.mode?: "strict" | "loose"`, defaults to `strict`.
- `options.layout?: "recursive" | "direct"`, defaults to `recursive`.
- `options.recursive?: boolean`, defaults to `true`.
- `options.followSymlinks?: boolean`, defaults to `false`.
- `options.includeInvalid?: boolean`, defaults to `false`.

Output:

```ts
Promise<AgenticSkill[]>
```

### `parseSkillFile(filePath, options)`

Description: parses one skill file, useful for debugging or importing one known skill.

Input:

- `filePath: string`, path to the skill file.
- `options.mode?: "strict" | "loose"`, defaults to `strict`.

Output:

```ts
Promise<AgenticSkill>
```

### `toOpenAIAgentsLocalSkills(skills)`

Description: converts `AgenticSkill[]` into Agents SDK local skills. It only passes the minimum SDK fields.

Input:

- `skills: AgenticSkill[]`; pass `valid: true` skills whenever possible.

Output:

```ts
Array<{
  name: string;
  description: string;
  path: string;
}>
```

Field notes:

- `name`: skill name.
- `description`: model-facing description used to decide when to use the skill.
- `path`: skill root directory, not the skill file path.

### `buildSkillsPrompt(skills, options)`

Description: use this when your host wants both Agents SDK local skills and a lightweight summary prompt.

Input:

- `skills: AgenticSkill[]`.
- `options.maxChars?: number`, defaults to `8000`.
- `options.includePaths?: boolean`, defaults to `true`.
- `options.pathKind?: "skillRoot" | "skillFile"`, defaults to `skillRoot`.

Output:

```ts
string
```

## Core object

### `AgenticSkill`

```ts
type AgenticSkill = {
  id: string;
  name: string;
  description: string;
  version?: string;
  category?: string;
  tags: string[];
  complexity?: "beginner" | "intermediate" | "advanced";
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
```

Field notes:

- `id`: stable path-based id for duplicate-name disambiguation.
- `category` / `tags` / `complexity`: searchable fields for `search_skills` and host-side filtering.
- `whenToUse`: scenario hints for skill selection.
- `dependencies` / `exampleFiles`: dependency and example asset metadata.
- `path`: skill root directory.
- `bodyPath`: skill file path.
- `valid` / `warnings` / `errors`: parse and validation state.

## Integration notes

- Expose only `valid: true` skills to the Agents SDK by default.
- `path` must point to the skill root directory.
- If shell is also enabled, use `needsApproval: true` or your host approval hook.
- This path fits apps already built on OpenAI Agents SDK that want to reuse SDK local skills.
