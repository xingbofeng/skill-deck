# MCP Integration

Wrap the same Skill inventory as an MCP stdio service or local HTTP sidecar for Claude Desktop, Codex, Cursor, and custom MCP clients. SkillDeck is not just `list_skills` / `read_skill`; it helps the model discover, choose, and load local Skills without an extra system prompt.

## 1. Install The MCP Server

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

Codex or another MCP host can use the same stdio arguments. To switch modes, append `--skill-mode` and the mode value to `args`:

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

## 2. Confirm In Claude / Codex

In Claude Code, type:

```text
/mcp
```

Confirm `skill-deck` is connected and the tool list includes `generate_skill_share`, `search_skills`, `read_skill`, or `use_skill_*`.

In Codex or another MCP host, confirm the `skill-deck` server is connected and `tools/list` includes SkillDeck tools.

## 3. Ask The Agent To Share

```text
Please use the SkillDeck MCP generate_skill_share tool to generate a shareable Skill workflow package for the currently loaded ~/.codex/skills.
```

To specify an output directory, add:

```text
Write it to ~/skilldeck-shares/codex-skills-share, keep redaction enabled, and tell me the paths for index.html, cover.png, detail.png, and manifest.json when done.
```

## Three Skill Activation Modes

| Mode | What The Model Sees | Best For | Cost |
| --- | --- | --- | --- |
| `compact` | Base tools + `skill://` resources | Many Skills, short tool lists, maximum compatibility. | The model must actively search or read the catalog. |
| `guided` | `compact` + `skill_guide` + MCP instructions | Use it when you want a clear Skill entry point without turning every Skill into a tool. | Still depends on the model calling `skill_guide`. |
| `active` | `guided` + N dynamic `use_skill_*` tools | Default mode. Common Skills appear directly in `tools/list`. | More tools; use `--expose-skills` to cap the count. |

## `compact` Mode Interfaces

```bash
npx -y skill-deck mcp serve \
  --skills ~/.skills \
  --skill-mode compact
```

| Tool | Purpose | Input |
| --- | --- | --- |
| `list_skills` | Return summary entries for the current Skill inventory. | none |
| `search_skills` | Search by query, category, tag, or complexity. | `query?`, `category?`, `tag?`, `complexity?` |
| `get_skill_info` | Read Skill metadata without loading the full markdown body. | `ref` |
| `read_skill` | Read the full `SKILL.md`. | `ref` |

| Resource | Content |
| --- | --- |
| `skill://catalog` | JSON catalog object with `version`, `stats`, and `skills`; each entry includes a stable `skill://id/{encodedId}` URI. |
| `skill://stats` | Aggregate inventory stats, including totals, valid/invalid counts, categories, and complexity buckets. |
| `skill://id/{encodedId}` | Full markdown content for one Skill. |
| `skill://id/{encodedId}/file/{relativePath}` | Read a declared relative reference file; undeclared, escaping, and binary files are rejected. |

## `guided` Mode Interfaces

```bash
npx -y skill-deck mcp serve \
  --skills ~/.skills \
  --skill-mode guided
```

| Additional Tool | Purpose | Input |
| --- | --- | --- |
| `skill_guide` | Return available Skill groups, suggested load order, and a reminder to read the full `SKILL.md`. | `task?`, `limit?` |

The server also returns MCP instructions telling the model to call `skill_guide`, `search_skills`, or `read_skill` first for complex tasks.

## `active` Mode Interfaces

```bash
npx -y skill-deck mcp serve \
  --skills ~/.skills
```

Dynamic tool names use this format:

```text
use_skill_<safe_name>_<short_id>
```

| Tool Example | Purpose |
| --- | --- |
| `use_skill_picturebook_maker_a1b2c3` | Load the full picturebook-maker `SKILL.md`. |
| `use_skill_repo_review_f4e5d6` | Load the full repo-review `SKILL.md`. |

Each dynamic tool description comes from the matching `SKILL.md` description. Its result is equivalent to a guided `read_skill`: metadata, full markdown body, warnings, and usage guidance.

## Optional Management Interfaces

| Tool | Purpose |
| --- | --- |
| `list_skill_folders` | List folder states such as `valid`, `invalid`, `missing`, and `skipped`. |
| `validate_skills` | Return valid / invalid / skipped counts and structured issue codes. |
| `reload_skills` | Rescan and refresh the server repository. |

Enable them with `--enable-management-tools`.

## Optional Shell Interface

Enable shell with `--enable-shell` and constrain it with `--allowed-root`.

### `run_skill_shell`

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

## Optional Share Interfaces

Share is not a top-level docs-site section, but MCP can generate static share artifacts: `index.html`, `cover.png`, and `detail.png`. It does not require provider keys or LLM calls, and redaction is on by default.

| Tool | Purpose |
| --- | --- |
| `generate_skill_share` | Generate static share HTML and image artifacts from the loaded Skill inventory. |
| `get_skill_share_artifact` | Read artifact metadata or HTML content for preview, download, or transfer. |

| Resource | Content |
| --- | --- |
| `share://template/page` | Static share page template. |
| `share://template/cover` | HTML-to-image cover template. |
| `share://template/detail` | HTML-to-image detail template. |
| `share://artifact/{artifactId}/manifest` | Generated file manifest. |
| `share://artifact/{artifactId}/index.html` | Generated static share page. |

Share tools are enabled by default so an MCP host agent can call `generate_skill_share` directly. Artifacts are written to `~/skilldeck-shares` by default. Use `--share-output-root <dir>` to change the directory, or `--disable-share-tools` when a host wants to hide Share tools.

## Registry Metadata

SkillDeck uses npm / stdio metadata for MCP Registry. The Registry provides discovery and installation metadata only; the MCP host still starts the server on the user's machine, and the user's Skill files stay local.

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

## TypeScript Interface

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

## Secure Defaults

- `active` is the default MCP mode, so common Skills appear directly in `tools/list`.
- `guided` keeps `skill_guide` without exposing per-skill tools.
- `compact` is the smallest read-only surface when the tool list must stay short.
- Share tools are enabled by default and write to `~/skilldeck-shares`; `shareOutputRoots` / `--share-output-root` overrides that directory.
- Shell, management tools, and hot reload are off by default.
- `cwd`, `defaultCwd`, `allowedRoots`, and `shareOutputRoots` are checked with `resolve + realpath`.
- MCP handler errors return `isError: true` without breaking the protocol channel.
