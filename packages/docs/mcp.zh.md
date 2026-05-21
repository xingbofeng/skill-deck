# MCP 接入

把同一套 skill inventory 包装成 MCP stdio 服务或本地 HTTP sidecar，给 Claude Desktop、Codex、Cursor 和自研 MCP client 使用。SkillDeck 的重点不是只暴露 `list_skills` / `read_skill`，而是让模型在没有额外系统提示词时，也能发现、选择并加载本地 Skill。

## 1. 安装 MCP

Claude Code 可以按三种 Skill Activation 模式安装。推荐先用默认 `active`：

三种命令的 MCP server 名都叫 `skill-deck`；切换模式时更新同名 server 即可。

```bash
# active：默认模式，常用 Skill 会直接出现在 tools/list
claude mcp add skill-deck \
  -- npx -y skill-deck mcp serve \
  --skills ~/.codex/skills
```

```bash
# guided：暴露 skill_guide，让模型先看分组和推荐入口
claude mcp add skill-deck \
  -- npx -y skill-deck mcp serve \
  --skills ~/.codex/skills \
  --skill-mode guided
```

```bash
# compact：只暴露 list/search/info/read/resources，工具列表最短
claude mcp add skill-deck \
  -- npx -y skill-deck mcp serve \
  --skills ~/.codex/skills \
  --skill-mode compact
```

Codex / 其他 MCP host 可以使用同一组 stdio 参数；如需切换模式，在 `args` 中追加 `--skill-mode` 和对应值：

```json
{
  "mcpServers": {
    "skill-deck": {
      "command": "npx",
      "args": [
        "-y",
        "skill-deck",
        "mcp",
        "serve",
        "--skills",
        "~/.codex/skills"
      ]
    }
  }
}
```

## 2. 在 Claude / Codex 中确认连接

Claude Code 中输入：

```text
/mcp
```

确认 `skill-deck` 显示为 connected，并且 tools 中能看到 `generate_skill_share`、`search_skills`、`read_skill` 或 `use_skill_*`。

Codex 或其他 MCP host 中，确认 `skill-deck` server 已连接，且 `tools/list` 能看到 SkillDeck tools。

## 3. 输入分享提示词

```text
请使用 SkillDeck MCP 的 generate_skill_share 工具，为当前已加载的 ~/.codex/skills 生成一套可以分享给同行看的 Skill 工作流分享物。
```

如果需要指定输出目录，可以追加：

```text
输出到 ~/skilldeck-shares/codex-skills-share，注意脱敏，并在完成后告诉我 index.html、cover.png、detail.png 和 manifest.json 的路径。
```

## 三种 Skill Activation 模式

| 模式 | 模型看到什么 | 适合场景 | 代价 |
| --- | --- | --- | --- |
| `compact` | 基础 tools + `skill://` resources | Skill 很多、工具列表要短、需要最大兼容性。 | 模型需要主动搜索或读取 catalog。 |
| `guided` | `compact` + `skill_guide` + MCP instructions | 想要明确 Skill 使用入口，但不想把每个 Skill 都变成 tool。 | 仍依赖模型主动调用 `skill_guide`。 |
| `active` | `guided` + N 个 `use_skill_*` 动态工具 | 默认模式，常用 Skill 会直接出现在 `tools/list` 里，提高自动发现概率。 | 工具数量增加，可用 `--expose-skills` 调整上限。 |

## `compact` 模式接口

`compact` 是最小完整模式，适合所有 MCP client。它暴露基础检索、读取和 resources，不额外为每个 Skill 创建 tool。

启动方式：

```bash
npx -y skill-deck mcp serve \
  --skills ~/.skills \
  --skill-mode compact
```

### Tools

| Tool | 用途 | 输入 |
| --- | --- | --- |
| `list_skills` | 返回当前 skill inventory 摘要列表。 | 无 |
| `search_skills` | 按关键词、分类、标签或复杂度搜索 Skill。 | `query?`、`category?`、`tag?`、`complexity?` |
| `get_skill_info` | 读取某个 Skill 的元数据，不加载完整 markdown。 | `ref` |
| `read_skill` | 读取完整 `SKILL.md` 内容。 | `ref` |

### Resources

| Resource | 内容 |
| --- | --- |
| `skill://catalog` | JSON catalog 对象，包含 `version`、`stats` 和 `skills` 摘要列表；每个条目带 `skill://id/{encodedId}` URI。 |
| `skill://stats` | 当前 Skill inventory 的统计对象，包含总数、有效/无效数量、分类和复杂度分布。 |
| `skill://id/{encodedId}` | 单个 Skill 的完整 markdown 内容。 |
| `skill://id/{encodedId}/file/{relativePath}` | 读取 `SKILL.md` 声明过的相对 reference 文件；拒绝未声明、越界和二进制内容。 |

不使用 `skill://{name}` 作为唯一资源地址，因为同名 Skill 需要 stable id 消歧。

## `guided` 模式接口

`guided` 在 `compact` 基础上增加一个强引导入口。它适合默认配置，因为工具数量仍然少，但模型更容易知道“复杂任务要先看看 Skill”。

启动方式：

```bash
npx -y skill-deck mcp serve \
  --skills ~/.skills \
  --skill-mode guided
```

### 新增 Tool

| Tool | 用途 | 输入 |
| --- | --- | --- |
| `skill_guide` | 返回可用 Skill 概览、推荐调用顺序，以及提醒模型先加载完整 `SKILL.md`。 | `task?`、`limit?` |

### MCP instructions

server 初始化时返回 instructions，核心语义是：

```text
This server exposes local Agent Skills.
For complex tasks, call skill_guide, search_skills, or read_skill first.
Always load the full SKILL.md before applying a skill.
```

instructions 是增强能力，不是唯一发现路径；不同 MCP client 对 instructions 的呈现方式可能不同，所以 `skill_guide` 仍然是主要入口。

## `active` 模式接口

`active` 在 `guided` 基础上，把排名靠前的 Skill 直接变成 MCP tools。模型在 `tools/list` 阶段就能看到这些 Skill，因此动态发现效果最强。

启动方式：

```bash
npx -y skill-deck mcp serve \
  --skills ~/.skills
```

### 新增动态 Tools

动态 tool 名称格式：

```text
use_skill_<safe_name>_<short_id>
```

示例：

| Tool | 用途 |
| --- | --- |
| `use_skill_picturebook_maker_a1b2c3` | 加载 picturebook-maker 的完整 `SKILL.md`，并返回适用说明。 |
| `use_skill_repo_review_f4e5d6` | 加载 repo-review 的完整 `SKILL.md`，并返回适用说明。 |

每个动态 tool 的 description 来自对应 `SKILL.md` 的 description。调用结果等价于带上下文提示的 `read_skill`：返回 Skill metadata、完整 markdown、warnings，以及“使用前必须阅读完整内容”的说明。

### 排名和上限

- `--expose-skills <n>` 控制最多暴露多少个动态 tools。
- 默认按显式配置、metadata 质量、name 和 stable id 做 deterministic 排序。
- 同名 Skill 通过 `<short_id>` 消歧。

## 可选管理接口

管理工具默认关闭，必须显式开启：

```bash
npx -y skill-deck mcp serve \
  --skills ~/.skills \
  --enable-management-tools
```

| Tool | 用途 |
| --- | --- |
| `list_skill_folders` | 列出 root 下各目录状态，例如 `valid`、`invalid`、`missing`、`skipped`。 |
| `validate_skills` | 返回 valid / invalid / skipped 统计和结构化 issue codes。 |
| `reload_skills` | 重新扫描并刷新 server 内部 repository，返回 loaded / failed / total。 |

## 可选 Shell 接口

shell 默认关闭，必须显式开启：

```bash
npx -y skill-deck mcp serve \
  --skills ~/.skills \
  --enable-shell \
  --allowed-root /Users/me/projects
```

### `run_skill_shell`

描述：在受限 cwd 内执行 shell 命令。

入参：

```json
{
  "type": "object",
  "properties": {
    "skillRef": { "type": "string" },
    "command": { "type": "string" },
    "cwd": { "type": "string" },
    "timeoutMs": { "type": "integer", "minimum": 1, "maximum": 120000 },
    "maxOutputLength": { "type": "integer", "minimum": 1, "maximum": 200000 },
    "reason": { "type": "string" }
  },
  "required": ["command"],
  "additionalProperties": false
}
```

出参：

```ts
{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut?: boolean;
  truncated?: boolean;
  durationMs?: number;
}
```

## 可选 Share 接口

Share 不作为官网独立栏目展示，但 MCP 可以按需生成可传播的静态分享物：`index.html`、`cover.png`、`detail.png`。整个过程不需要 provider key，不调用 LLM，默认脱敏本地路径、secret 和 private URL。

Share tools 默认开启，方便 MCP host 中的 agent 直接调用 `generate_skill_share`。分享产物默认写入 `~/skilldeck-shares`；如果要换目录，使用 `--share-output-root <dir>`；如果宿主不想暴露 Share tools，可以用 `--disable-share-tools`。

```bash
npx -y skill-deck mcp serve \
  --skills ~/.skills \
  --share-output-root /Users/me/skill-shares
```

默认目录会在运行时展开到当前用户 home 下。

### `generate_skill_share`

描述：基于当前 MCP server 已加载的 skill inventory 生成静态分享页、`cover.png` 和 `detail.png`。该工具只读取 `SKILL.md`，reference 只列路径，不读取 reference 文件内容。

入参：

```json
{
  "type": "object",
  "properties": {
    "refs": {
      "type": "array",
      "items": { "type": "string" }
    },
    "outDir": { "type": "string" },
    "formats": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["html", "cover", "detail"]
      },
      "default": ["html", "cover", "detail"]
    },
    "redact": { "type": "boolean", "default": true },
    "title": { "type": "string" },
    "audience": {
      "type": "string",
      "enum": ["friends", "xiaohongshu", "peers", "general"],
      "default": "general"
    }
  },
  "required": ["outDir"],
  "additionalProperties": false
}
```

出参：

```ts
{
  artifactId: string;
  files: Array<{
    kind: "html" | "cover" | "detail";
    path: string;
    mimeType: "text/html" | "image/png";
  }>;
  skillCount: number;
  redacted: boolean;
  warnings: string[];
}
```

### `get_skill_share_artifact`

描述：读取 `generate_skill_share` 生成的 artifact 元数据或 HTML 内容，方便 MCP client 预览、下载或转存。

入参：

```json
{
  "type": "object",
  "properties": {
    "artifactId": { "type": "string" },
    "kind": {
      "type": "string",
      "enum": ["manifest", "html", "cover", "detail"]
    }
  },
  "required": ["artifactId", "kind"],
  "additionalProperties": false
}
```

出参：

```ts
{
  artifactId: string;
  kind: "manifest" | "html" | "cover" | "detail";
  path: string;
  mimeType: "application/json" | "text/html" | "image/png";
  text?: string;
}
```

### Share resources

| Resource | 内容 |
| --- | --- |
| `share://template/page` | 最终静态分享页模板。 |
| `share://template/cover` | 封面图 HTML 转图模板。 |
| `share://template/detail` | 详情长图 HTML 转图模板。 |
| `share://artifact/{artifactId}/manifest` | 某次生成结果的文件清单。 |
| `share://artifact/{artifactId}/index.html` | 某次生成结果的静态分享页。 |

图片本体通过 `get_skill_share_artifact` 返回本地路径，避免把大图直接塞进 MCP text result。

## Registry 元数据

SkillDeck 使用 npm / stdio 形态接入 MCP Registry。Registry 只提供发现和安装元数据；server 仍由 MCP host 在用户本机启动，用户的 Skill 文件也仍然只在本机。

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.xingbofeng/skill-deck",
  "title": "SkillDeck",
  "description": "MCP server that exposes local Agent Skills folders as tools and resources.",
  "version": "0.1.0",
  "websiteUrl": "https://skill.counterxing.top",
  "repository": {
    "url": "https://github.com/xingbofeng/skill-deck",
    "source": "github"
  },
  "packages": [
    {
      "registryType": "npm",
      "identifier": "skill-deck",
      "version": "0.1.0",
      "transport": { "type": "stdio" },
      "environmentVariables": [
        {
          "name": "AGENTIC_SKILL_ROOT",
          "description": "Path to the local skills root.",
          "isRequired": true
        }
      ]
    }
  ]
}
```

## TypeScript 接口

### `createSkillMcpServer(options)`

```ts
type SkillMcpServerOptions = {
  skillsRoot: string;
  layout?: "recursive" | "direct";
  transport?: "stdio" | "http" | "streamable-http";
  host?: string;
  port?: number;
  parseMode?: "strict" | "loose";
  skillMode?: "compact" | "guided" | "active";
  exposeSkills?: number;
  hotReload?: boolean;
  debounceMs?: number;
  includeShell?: boolean;
  includeManagementTools?: boolean;
  includeShareTools?: boolean;
  allowedRoots?: string[];
  shareOutputRoots?: string[];
  defaultCwd?: string;
  timeoutMs?: number;
  maxOutputLength?: number;
};
```

### `toMcpResources(skills)`

```ts
Array<{
  uri: string;
  name: string;
  description: string;
  mimeType: "application/json" | "text/markdown";
}>
```

### `toMcpTools(tools)`

```ts
Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}>
```

### `toMcpCallResult(result)`

```ts
{
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}
```

## 安全默认值

- 默认暴露 `active` 模式，常用 Skill 会直接进入 `tools/list`。
- `guided` 适合想保留 `skill_guide`、但不想暴露 per-skill tools 的场景。
- `compact` 是最小只读接口，适合工具列表必须很短的场景。
- shell 默认关闭。
- Share tools 默认开启；默认输出到 `~/skilldeck-shares`，可用 `--share-output-root` 覆盖。
- 管理工具默认关闭。
- hot reload 默认关闭。
- 默认不继承 `process.env`。
- `cwd`、`defaultCwd`、`allowedRoots` 和 `shareOutputRoots` 都先做 `resolve + realpath`。
- stdout / stderr 分别截断并去掉 ANSI 控制字符。
- MCP 执行错误通过 `isError: true` 返回，不破坏 stdio 或 HTTP 协议通道。
