# SkillDeck

Turn local Agent Skills into a capability deck that models can discover, use, and share.

```bash
npm install skill-deck
```

## Three Capabilities, One Experience

| Line | Scenario | Why It Matters | What SkillDeck Does |
| --- | --- | --- | --- |
| Adapter | Connect Skills to OpenAI, Anthropic, or your own runtime. | You do not want to hand-write schema, handlers, and stable ids for every `SKILL.md`. | Scans and validates Skills, then emits provider-neutral tools, handlers, prompts, and adapters. |
| MCP | Connect Skills to Claude Desktop, Codex, Cursor, or a custom MCP client. | Plain `list_skills` / `read_skill` is not enough; the model may not know to inspect Skills first. | Uses `compact`, `guided`, and `active` modes so models can discover and load Skills during the task. |
| Share | Share a private Skill Pack with peers or social channels. | Local paths, secrets, and private URLs must stay private; screenshots are not enough. | Generates static share pages and two images through MCP and agent conversation, with redaction on by default. |

## Skill Activation Modes

| Mode | Capability | Description |
| --- | --- | --- |
| `compact` | Basic discovery and read interfaces | Short tool list for compatibility and large Skill libraries. |
| `guided` | `compact` + `skill_guide` + MCP instructions | Gives the model a clear entry point without turning every Skill into a tool. |
| `active` | `guided` + dynamic `use_skill_*` tools | Default MCP mode; common Skills appear directly in `tools/list` for the strongest discovery behavior. |

## Secure Defaults

- Shell is off by default and requires `includeShell` or `--enable-shell`.
- Management tools are off by default and require `includeManagement` or `--enable-management-tools`.
- Share tools are enabled by default and write to `~/skilldeck-shares`; use `--share-output-root` to override it.
- Hot reload is off by default and requires `--hot-reload`.
- Duplicate Skill names are resolved with stable ids instead of relying on `name` alone.
- MCP Registry uses npm / stdio metadata; user Skill folders stay on the user's machine.
