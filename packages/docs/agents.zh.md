# Agent SDK 接入

把扫描后的 skill inventory 接到 OpenAI Agents SDK 的 local shell 环境里，让现有本地 Skills 直接进入 agent runtime。

## 基本示例

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

## 接口列表

### `scanSkills(root, options)`

描述：扫描一个 skill root，返回标准化后的 `AgenticSkill[]`。root 可以是单个 skill 目录，也可以是包含多个 skill 的父目录。

入参：

- `root: string`，本地 skill 目录或 skill root。
- `options.mode?: "strict" | "loose"`，默认 `strict`。
- `options.layout?: "recursive" | "direct"`，默认 `recursive`。
- `options.recursive?: boolean`，默认 `true`。
- `options.followSymlinks?: boolean`，默认 `false`。
- `options.includeInvalid?: boolean`，默认 `false`。

出参：

```ts
Promise<AgenticSkill[]>
```

### `parseSkillFile(filePath, options)`

描述：解析单个 skill 文件，适合调试或导入一个明确的 skill。

入参：

- `filePath: string`，skill 文件路径。
- `options.mode?: "strict" | "loose"`，默认 `strict`。

出参：

```ts
Promise<AgenticSkill>
```

### `toOpenAIAgentsLocalSkills(skills)`

描述：把 `AgenticSkill[]` 转成 Agents SDK local skills。这里只传 SDK 需要的最小字段。

入参：

- `skills: AgenticSkill[]`，建议只传 `valid: true` 的 skill。

出参：

```ts
Array<{
  name: string;
  description: string;
  path: string;
}>
```

字段说明：

- `name`：skill 名称。
- `description`：给模型判断是否使用该 skill 的描述。
- `path`：skill 根目录，不是 skill 文件路径。

### `buildSkillsPrompt(skills, options)`

描述：当你的宿主既使用 Agents SDK local skills，又想给模型补一层轻量摘要 prompt 时使用。

入参：

- `skills: AgenticSkill[]`。
- `options.maxChars?: number`，默认 `8000`。
- `options.includePaths?: boolean`，默认 `true`。
- `options.pathKind?: "skillRoot" | "skillFile"`，默认 `skillRoot`。

出参：

```ts
string
```

## 核心对象

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

字段说明：

- `id`：基于真实路径生成的 stable id，用来处理同名 skill。
- `category` / `tags` / `complexity`：用于 `search_skills` 和宿主侧筛选。
- `whenToUse`：给模型或宿主做技能选择时使用的场景提示。
- `dependencies` / `exampleFiles`：用于展示依赖和示例资产。
- `path`：skill 根目录。
- `bodyPath`：skill 文件路径。
- `valid` / `warnings` / `errors`：解析和校验结果。

## 接入要点

- 默认只把 `valid: true` 的 skill 暴露给 Agents SDK。
- `path` 必须指向 skill 根目录。
- 如果同时开启 shell，请使用 `needsApproval: true` 或宿主自己的 approval hook。
- 这条路径适合已经基于 OpenAI Agents SDK 构建、希望复用 SDK local skills 能力的应用。
