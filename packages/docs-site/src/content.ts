import landingZh from "@docs/landing.zh.md?raw";
import landingEn from "@docs/landing.en.md?raw";
import quickstartZh from "@docs/quickstart.zh.md?raw";
import quickstartEn from "@docs/quickstart.en.md?raw";
import agentsZh from "@docs/agents.zh.md?raw";
import agentsEn from "@docs/agents.en.md?raw";
import mcpZh from "@docs/mcp.zh.md?raw";
import mcpEn from "@docs/mcp.en.md?raw";

export type Lang = "zh" | "en";
export type View = "home" | "quickstart" | "agents" | "mcp";

export type ParsedDoc = {
  title: string;
  lead: string;
  topSnippet?: {
    label: string;
    code: string;
  };
  body: string;
};

export type DocSection = {
  title: string;
  hash: string;
};

export type SearchDocRecord = ParsedDoc & {
  sections: DocSection[];
};

export function slugifyHeading(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractSections(markdown: string): DocSection[] {
  return Array.from(markdown.matchAll(/^##\s+(.+)$/gm)).map((match) => ({
    title: match[1]!.trim(),
    hash: `#${slugifyHeading(match[1]!.trim())}`
  }));
}

function parseDoc(markdown: string): SearchDocRecord {
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1]?.trim() ?? "";

  let rest = markdown.replace(/^#\s+.+$/m, "").trim();

  const leadMatch = rest.match(/^([^\n#][\s\S]*?)(?:\n{2,}|$)/);
  const lead = leadMatch?.[1]?.trim() ?? "";
  rest = rest.replace(leadMatch?.[0] ?? "", "").trim();

  let topSnippet: ParsedDoc["topSnippet"];
  const codeMatch = rest.match(/^```(\w+)?\n([\s\S]*?)\n```/);
  if (codeMatch) {
    const lang = codeMatch[1]?.toLowerCase() ?? "";
    topSnippet = {
      label: lang === "json" ? "MCP JSON" : lang === "ts" ? "TypeScript" : "CLI",
      code: codeMatch[2].trim(),
    };
    rest = rest.replace(codeMatch[0], "").trim();
  }

  return {
    title,
    lead,
    topSnippet,
    body: rest,
    sections: extractSections(markdown)
  };
}

export const docsContent: Record<Lang, Record<View, ParsedDoc>> = {
  zh: {
    home: parseDoc(landingZh),
    quickstart: parseDoc(quickstartZh),
    agents: parseDoc(agentsZh),
    mcp: parseDoc(mcpZh),
  },
  en: {
    home: parseDoc(landingEn),
    quickstart: parseDoc(quickstartEn),
    agents: parseDoc(agentsEn),
    mcp: parseDoc(mcpEn),
  },
};

export const uiCopy: Record<
  Lang,
  {
    brandSubtitle: string;
    quickstartLabel: string;
    agentsLabel: string;
    mcpLabel: string;
    primaryAction: string;
    secondaryAction: string;
    installTitle: string;
    installHint: string;
    copyInstall: string;
    copiedInstall: string;
  }
> = {
  zh: {
    brandSubtitle: "分享、适配、激活本地 Agent Skills",
    quickstartLabel: "快速开始",
    agentsLabel: "Agent SDK 接入",
    mcpLabel: "MCP 接入",
    primaryAction: "快速开始",
    secondaryAction: "查看 GitHub",
    installTitle: "一键安装",
    installHint: "复制 npm 安装命令，先把 SkillDeck 放进你的本地 agent runtime。",
    copyInstall: "复制",
    copiedInstall: "已复制"
  },
  en: {
    brandSubtitle: "Share, adapt, and activate local Agent Skills",
    quickstartLabel: "Quick Start",
    agentsLabel: "Agent SDK",
    mcpLabel: "MCP",
    primaryAction: "Quick Start",
    secondaryAction: "Open GitHub",
    installTitle: "Install",
    installHint: "Copy the npm install command and add the adapter to your local agent runtime.",
    copyInstall: "Copy",
    copiedInstall: "Copied"
  },
};

export const providerPills = [
  "OpenAI Chat",
  "OpenAI Responses",
  "Anthropic Messages",
  "OpenAI Agents SDK",
  "MCP stdio / HTTP",
];

export const architectureSnippets = [
  "scanSkills(root)",
  "buildSkillsPrompt(skills)",
  "getAgenticSkillTools({ includeShell, includeManagement })",
  "createSkillHandlers({ skills, security })",
  "toMcpResources(skills)",
  "createSkillMcpServer(options)",
];
