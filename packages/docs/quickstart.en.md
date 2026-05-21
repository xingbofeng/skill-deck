# Quick Start

The fastest SkillDeck path is not writing code first. Start by connecting your local Skills to an MCP host so the agent can discover, load, and share your Skill workflows.

## 1. Prepare A Skill Folder

The examples use Codex's local Skill folder:

```bash
ls ~/.codex/skills
```

You can replace it with any Skill root. SkillDeck recursively scans `SKILL.md`, `skill.md`, or `skill` files and assigns each valid Skill a stable id.

## 2. Install The MCP Server

Claude Code can be installed in three Skill Activation modes. Start with the default `active` mode:

All three commands use the same MCP server name, `skill-deck`; update the same server when switching modes.

```bash
# active: default mode; common Skills appear directly in tools/list
claude mcp add skill-deck \
  -- npx -y skill-deck mcp serve \
  --skills ~/.codex/skills
```

```bash
# guided: exposes skill_guide so the model can inspect groups and recommendations first
claude mcp add skill-deck \
  -- npx -y skill-deck mcp serve \
  --skills ~/.codex/skills \
  --skill-mode guided
```

```bash
# compact: only exposes list/search/info/read/resources for the shortest tool list
claude mcp add skill-deck \
  -- npx -y skill-deck mcp serve \
  --skills ~/.codex/skills \
  --skill-mode compact
```

Codex, Cursor, or another MCP host can use the same stdio arguments. To switch modes, append `--skill-mode` and the mode value to `args`:

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

Share tools are enabled by default, and artifacts are written to `~/skilldeck-shares` by default. Use `--share-output-root <dir>` to change the directory, or `--disable-share-tools` to hide Share tools.

## 3. Confirm The Connection

In Claude Code, type:

```text
/mcp
```

Confirm `skill-deck` is connected and the tool list includes:

```text
generate_skill_share
search_skills
read_skill
use_skill_...
```

## 4. Ask The Agent To Generate Share Artifacts

```text
Please use the SkillDeck MCP generate_skill_share tool to generate a shareable Skill workflow package for the currently loaded ~/.codex/skills.

Write it to ~/skilldeck-shares/codex-skills-share, keep redaction enabled, and tell me the paths for index.html, cover.png, detail.png, and manifest.json when done.
```

Then check the output:

```bash
ls -lah ~/skilldeck-shares/codex-skills-share
open ~/skilldeck-shares/codex-skills-share/index.html
```

## 5. Test The Other Skill Activation Modes

`active` is best for the first run because common Skills appear directly in `tools/list`. Test the other two modes like this:

| Mode | How To Start | How To Verify |
| --- | --- | --- |
| `guided` | Append `--skill-mode guided` to the default command. | Ask Claude / Codex: “Please call SkillDeck skill_guide first and summarize the available Skill groups.” Acceptance: `skill_guide` is visible, but many `use_skill_*` tools are not. |
| `compact` | Append `--skill-mode compact` to the default command. | Ask the agent to call `search_skills`, then `read_skill` for the best match. Acceptance: no `skill_guide` or `use_skill_*`, but `list/search/info/read` work. |

Example prompt:

```text
Please use SkillDeck MCP to search for a Skill that can analyze GitHub Actions failures, then read the full instructions for the best match.
```

## 6. Validate Locally With The CLI

Before wiring MCP, you can validate the folder:

```bash
npx -y skill-deck validate --skills ~/.codex/skills --layout recursive
```

Common fields:

- `valid`: Skills that can be loaded.
- `invalid`: Skills with invalid structure or frontmatter.
- `skipped`: folders skipped by safety rules, such as escaping symlinks.

## 7. Use SDK APIs When You Own The Runtime

If you are integrating with your own Node.js runtime for OpenAI, Anthropic, or the OpenAI Agents SDK, use the code APIs:

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

Use this path when you maintain the tool loop yourself. Claude / Codex users should start with MCP.
