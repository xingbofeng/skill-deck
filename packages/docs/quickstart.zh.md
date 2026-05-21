# 快速开始

SkillDeck 的最快路径不是先写代码，而是先把本机 Skill 接进 MCP host，让 agent 能发现、加载、分享你的 Skill 工作流。

## 1. 准备 Skill 目录

默认示例使用 Codex 的本地 Skill 目录：

```bash
ls ~/.codex/skills
```

你也可以换成自己的 Skill 根目录。SkillDeck 会递归扫描其中的 `SKILL.md`、`skill.md` 或 `skill` 文件，并为每个有效 Skill 生成 stable id。

## 2. 安装 MCP

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

Codex / Cursor / 其他 MCP host 使用同一组 stdio 参数；如需切换模式，在 `args` 中追加 `--skill-mode` 和对应值：

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

Share tools 默认开启，分享产物默认写入 `~/skilldeck-shares`。如需换目录，使用 `--share-output-root <dir>`；如果你不想暴露 Share tools，使用 `--disable-share-tools`。

## 3. 确认连接

Claude Code 中输入：

```text
/mcp
```

确认 `skill-deck` connected，并且工具列表中能看到：

```text
generate_skill_share
search_skills
read_skill
use_skill_...
```

## 4. 直接让 agent 生成分享物

```text
请使用 SkillDeck MCP 的 generate_skill_share 工具，为当前已加载的 ~/.codex/skills 生成一套可以分享给同行看的 Skill 工作流分享物。

输出到 ~/skilldeck-shares/codex-skills-share，注意脱敏，并在完成后告诉我 index.html、cover.png、detail.png 和 manifest.json 的路径。
```

生成后检查：

```bash
ls -lah ~/skilldeck-shares/codex-skills-share
open ~/skilldeck-shares/codex-skills-share/index.html
```

## 5. 测试另外两种 Skill Activation 模式

`active` 适合第一轮体验，因为常用 Skill 会直接出现在 `tools/list`。另外两种模式这样测：

| 模式 | 怎么启动 | 怎么验证 |
| --- | --- | --- |
| `guided` | 在默认命令后追加 `--skill-mode guided`。 | 在 Claude / Codex 问：“请先调用 SkillDeck 的 skill_guide，告诉我有哪些 Skill 分组。”验收：能看到 `skill_guide`，但不会出现一堆 `use_skill_*`。 |
| `compact` | 在默认命令后追加 `--skill-mode compact`。 | 让 agent 调用 `search_skills` 搜索某类能力，再用 `read_skill` 读取完整 Skill。验收：没有 `skill_guide` 和 `use_skill_*`，但 `list/search/info/read` 可用。 |

示例 prompt：

```text
请使用 SkillDeck MCP 搜索适合分析 GitHub Actions 失败的 Skill，然后读取最匹配 Skill 的完整说明。
```

## 6. 本地 CLI 检查

接 MCP 前可以先跑一次校验：

```bash
npx -y skill-deck validate --skills ~/.codex/skills --layout recursive
```

常见结果：

- `valid`：可被加载的 Skill 数量。
- `invalid`：结构或 frontmatter 不合规的 Skill。
- `skipped`：被安全规则跳过的目录，比如越界 symlink。

## 7. SDK 接入才需要写代码

如果你是在自己的 Node.js runtime 里接 OpenAI / Anthropic / Agents SDK，再使用代码接口：

```ts
import {
  createSkillHandlers,
  getAgenticSkillTools,
  scanSkills,
} from "skill-deck";
import { toOpenAIResponsesTools } from "skill-deck/openai-responses";

const skills = await scanSkills("~/.codex/skills");
const tools = toOpenAIResponsesTools(
  getAgenticSkillTools({ skills, skillMode: "guided" })
);
const handlers = createSkillHandlers({ skills, skillMode: "guided" });
```

这条路径适合你自己维护 tool loop；普通 Claude / Codex 用户优先走 MCP。
