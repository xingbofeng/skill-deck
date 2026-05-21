# SkillDeck

把散落在本机的 Agent Skills，变成模型看得见、用得上、也分享得出去的能力牌组。

```bash
npm install skill-deck
```

## 三大能力，一体体验

| 主线 | 典型场景 | 为什么需要 | SkillDeck 做什么 |
| --- | --- | --- | --- |
| Adapter | 把一组 Skills 接入 OpenAI / Anthropic / 自研 runtime。 | 不想为每个 `SKILL.md` 手写 schema、handler 和 stable id。 | 扫描、解析、校验 Skills，生成通用 tools、handlers、prompt 和 adapters。 |
| MCP | 接到 Claude Desktop、Codex、Cursor 或自研 MCP client。 | 只给 `list_skills` / `read_skill` 还不够，模型不一定知道要先查 Skills。 | 通过 `compact` / `guided` / `active` 三种模式，让模型自动发现并加载 Skills。 |
| Share | 把私有 Skill Pack 分享给朋友圈、小红书或同行。 | 不能泄露本地路径、secret、私有 URL，也不想只发截图。 | 通过 MCP 和 agent 对话生成静态分享页与双图，默认脱敏。 |

## Skill Activation 模式

| 模式 | 能力 | 说明 |
| --- | --- | --- |
| `compact` | 基础检索与读取接口 | 工具列表短，适合兼容旧接入和大型 Skill 库。 |
| `guided` | `compact` + `skill_guide` + MCP instructions | 给模型一个明确入口，但不把每个 Skill 都变成 tool。 |
| `active` | `guided` + `use_skill_*` 动态工具 | MCP 默认模式，常用 Skill 直接出现在 `tools/list`，自动发现能力最强。 |

## 默认安全态度

- shell 默认关闭，必须显式 `includeShell` 或 `--enable-shell`。
- 管理工具默认关闭，必须显式 `includeManagement` 或 `--enable-management-tools`。
- Share tools 默认开启，产物默认写入 `~/skilldeck-shares`；可用 `--share-output-root` 覆盖。
- hot reload 默认关闭，必须显式 `--hot-reload`。
- 同名 Skill 依靠 stable id 消歧，不只靠 `name`。
- MCP Registry 使用 npm / stdio 元数据；用户的 Skill 目录仍然只在本机。
