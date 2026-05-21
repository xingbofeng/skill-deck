import path from "node:path";
import { readFile as fsReadFile } from "node:fs/promises";
import type { AgenticSkill } from "../core/types";
import { readShareArtifact, readShareManifestForArtifact } from "../runtime/share";

type Reader = (path: string) => Promise<string>;
type ResourceMimeType = "application/json" | "text/markdown" | "text/html";
type ReadResourceOptions = {
  shareOutputRoots?: string[];
};

function encodedSkillUri(skill: AgenticSkill): string {
  return `skill://id/${encodeURIComponent(skill.id)}`;
}

function countBy(skills: AgenticSkill[], key: "category" | "complexity"): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const skill of skills) {
    const value = skill[key];
    if (!value) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function buildStats(skills: AgenticSkill[]): {
  total: number;
  valid: number;
  invalid: number;
  byCategory: Record<string, number>;
  byComplexity: Record<string, number>;
} {
  const valid = skills.filter((skill) => skill.valid).length;
  return {
    total: skills.length,
    valid,
    invalid: skills.length - valid,
    byCategory: countBy(skills, "category"),
    byComplexity: countBy(skills, "complexity")
  };
}

function metadataStringList(metadata: Record<string, unknown> | undefined, key: string): string[] {
  const value = metadata?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function declaredFiles(skill: AgenticSkill): Set<string> {
  return new Set([
    ...skill.exampleFiles,
    ...metadataStringList(skill.metadata, "references"),
    ...metadataStringList(skill.metadata, "referenceFiles")
  ]);
}

function normalizeResourcePath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error("invalid resource path");
  }
  const normalized = path.posix.normalize(relativePath.replaceAll(path.sep, "/"));
  if (normalized === "." || normalized.startsWith("../") || normalized === "..") {
    throw new Error("invalid resource path");
  }
  return normalized;
}

function resolveDeclaredFile(skill: AgenticSkill, relativePath: string): string {
  const normalized = normalizeResourcePath(relativePath);
  if (!declaredFiles(skill).has(normalized)) {
    throw new Error(`resource file is not declared: ${relativePath}`);
  }
  const fullPath = path.resolve(skill.path, normalized);
  const root = path.resolve(skill.path);
  if (fullPath !== root && !fullPath.startsWith(`${root}${path.sep}`)) {
    throw new Error("invalid resource path");
  }
  return fullPath;
}

function assertTextResource(relativePath: string, content: string): void {
  const extension = path.extname(relativePath).toLowerCase();
  const allowedExtensions = new Set([".md", ".markdown", ".txt", ".json", ".yaml", ".yml"]);
  if (!allowedExtensions.has(extension) || content.includes("\u0000")) {
    throw new Error("binary resource files are not supported");
  }
}

function shareTemplate(kind: "page" | "cover" | "detail"): string {
  if (kind === "page") {
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SkillDeck Share Page Template</title>
<style>
:root{color-scheme:light;--ink:#17231f;--muted:#63746d;--line:#d8e2dc;--paper:#fbfaf6;--soft:#eef6f1;--green:#0f7d62;--gold:#e8b55d}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.topbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid rgba(17,59,52,.12);background:rgba(251,250,246,.9);padding:16px clamp(20px,5vw,64px);backdrop-filter:blur(16px)}
.brand{font-size:18px;font-weight:800}.search{width:min(360px,42vw);border:1px solid var(--line);border-radius:999px;background:white;padding:12px 16px}
.hero{display:grid;gap:22px;max-width:1120px;margin:0 auto;padding:64px clamp(20px,5vw,64px) 34px}.eyebrow{color:var(--green);font-weight:800}.hero h1{max-width:820px;margin:0;font-size:clamp(42px,7vw,86px);line-height:.98}.lead{max-width:760px;color:var(--muted);font-size:20px;line-height:1.6}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;max-width:1120px;margin:0 auto;padding:20px clamp(20px,5vw,64px) 70px}
.skill-card,.skill-detail{border:1px solid var(--line);border-radius:8px;background:white;padding:22px}.skill-card h2{margin:0 0 10px}.skill-card p{color:var(--muted);line-height:1.55}.skill-card a{display:inline-flex;margin-top:8px;color:var(--green);font-weight:800}
.skill-detail{grid-column:1/-1}.skill-detail pre{white-space:pre-wrap;overflow-wrap:anywhere;border-radius:8px;background:#10231f;color:#edfff7;padding:20px}
</style>
</head>
<body data-template="page">
<header class="topbar"><div class="brand">SkillDeck</div><input class="search" type="search" placeholder="搜索 Skill..." aria-label="搜索 Skill" oninput="filterSkills(this.value)"></header>
<main>
<section class="hero"><div class="eyebrow">Share your local Agent Skills</div><h1>{{title}}</h1><p class="lead">{{tagline}}</p></section>
<section class="grid">
<article class="skill-card" data-skill-card="{{skillName}}"><h2>{{skillName}}</h2><p>{{skillDescription}}</p><a href="#skill-1">查看详情</a></article>
<section class="skill-detail" id="skill-1" data-skill-detail="{{skillName}}"><h2>{{skillName}}</h2><p>{{skillDescription}}</p><pre>{{redactedSkillMarkdown}}</pre></section>
</section>
</main>
<script>
function filterSkills(query){const normalized=String(query||'').toLowerCase();document.querySelectorAll('[data-skill-card]').forEach((card)=>{card.hidden=!card.textContent.toLowerCase().includes(normalized);});}
</script>
</body>
</html>`;
  }

  const dimensions = kind === "cover" ? "1080px;height:1440px" : "1080px;min-height:1760px";
  const imageName = kind === "cover" ? "cover.png" : "detail.png";
  const headline = kind === "cover" ? "{{title}}" : "{{title}} 能力详情";
  const body =
    kind === "cover"
      ? "{{tagline}}"
      : "{{capabilityMap}}\n\n代表性 Skill：{{skillNames}}\n\n完整详情见 HTML";

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SkillDeck ${kind} Image Template</title>
<style>
:root{--ink:#18251f;--muted:#60746b;--paper:#fbfaf4;--green:#0e735c;--gold:#e6b75e;--line:rgba(16,58,51,.14)}
*{box-sizing:border-box}body{display:grid;min-height:100vh;place-items:center;margin:0;background:#dfe6e1;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.canvas{width:${dimensions};overflow:hidden;border:1px solid var(--line);background:linear-gradient(160deg,#fffdf7 0%,#f2f7f2 58%,#dcefe6 100%);box-shadow:0 30px 90px rgba(20,54,45,.24)}
.inner{display:flex;min-height:100%;flex-direction:column;padding:72px}.top{display:flex;align-items:center;justify-content:space-between;gap:28px}.brand{font-size:28px;font-weight:850}.badge{border:1px solid rgba(14,115,92,.22);border-radius:999px;background:white;padding:12px 18px;color:var(--green);font-weight:800}
h1{margin:76px 0 24px;font-size:${kind === "cover" ? "76px" : "60px"};line-height:1.04;letter-spacing:0}.body{white-space:pre-wrap;color:var(--muted);font-size:30px;line-height:1.5}.footer{margin-top:auto;border-top:1px solid var(--line);padding-top:28px;color:var(--green);font-weight:800}
</style>
</head>
<body data-template="${kind}">
<main class="canvas"><section class="inner"><div class="top"><div class="brand">SkillDeck</div><div class="badge">${imageName}</div></div><h1>${headline}</h1><div class="body">${body}</div><div class="footer">github.com/xingbofeng/skill-deck</div></section></main>
</body>
</html>`;
}

export function toMcpResources(skills: AgenticSkill[]): Array<{
  uri: string;
  name: string;
  description: string;
  mimeType: ResourceMimeType;
}> {
  const catalog = {
    uri: "skill://catalog",
    name: "Skill Catalog",
    description: "Catalog of available skills",
    mimeType: "application/json" as const
  };
  const stats = {
    uri: "skill://stats",
    name: "Skill Stats",
    description: "Aggregate skill catalog statistics",
    mimeType: "application/json" as const
  };

  const skillResources = skills.map((skill) => ({
    uri: encodedSkillUri(skill),
    name: skill.name,
    description: skill.description,
    mimeType: "text/markdown" as const
  }));

  const fileResources = skills.flatMap((skill) =>
    Array.from(declaredFiles(skill)).map((relativePath) => ({
      uri: `${encodedSkillUri(skill)}/file/${encodeURIComponent(relativePath)}`,
      name: `${skill.name}: ${relativePath}`,
      description: `Declared file for ${skill.name}`,
      mimeType: "text/markdown" as const
    }))
  );
  const shareTemplateResources = [
    {
      uri: "share://template/page",
      name: "Share Page Template",
      description: "HTML template used for SkillDeck share pages",
      mimeType: "text/html" as const
    },
    {
      uri: "share://template/cover",
      name: "Share Cover Template",
      description: "HTML template used for SkillDeck cover images",
      mimeType: "text/html" as const
    },
    {
      uri: "share://template/detail",
      name: "Share Detail Template",
      description: "HTML template used for SkillDeck detail images",
      mimeType: "text/html" as const
    }
  ];

  return [catalog, stats, ...skillResources, ...fileResources, ...shareTemplateResources];
}

export async function readMcpResource(
  uri: string,
  skills: AgenticSkill[],
  readFile: Reader = async (filePath: string) => fsReadFile(filePath, "utf8"),
  options: ReadResourceOptions = {}
): Promise<{ mimeType: ResourceMimeType; text: string }> {
  if (uri === "skill://catalog") {
    const catalog = {
      version: 1,
      generatedAt: new Date().toISOString(),
      stats: buildStats(skills),
      skills: skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        version: skill.version,
        category: skill.category,
        tags: skill.tags,
        complexity: skill.complexity,
        hasExamples: skill.hasExamples,
        dependencies: skill.dependencies,
        uri: encodedSkillUri(skill)
      }))
    };
    return {
      mimeType: "application/json",
      text: JSON.stringify(catalog)
    };
  }

  if (uri === "skill://stats") {
    return {
      mimeType: "application/json",
      text: JSON.stringify(buildStats(skills))
    };
  }

  if (uri === "share://template/page") {
    return { mimeType: "text/html", text: shareTemplate("page") };
  }
  if (uri === "share://template/cover") {
    return { mimeType: "text/html", text: shareTemplate("cover") };
  }
  if (uri === "share://template/detail") {
    return { mimeType: "text/html", text: shareTemplate("detail") };
  }

  const shareArtifactPrefix = "share://artifact/";
  if (uri.startsWith(shareArtifactPrefix)) {
    const rest = uri.slice(shareArtifactPrefix.length);
    const separatorIndex = rest.indexOf("/");
    if (separatorIndex < 0) throw new Error(`unknown resource uri: ${uri}`);
    const artifactId = decodeURIComponent(rest.slice(0, separatorIndex));
    const kind = rest.slice(separatorIndex + 1);
    const manifest = await readShareManifestForArtifact(artifactId, options.shareOutputRoots ?? []);
    if (kind === "manifest") {
      return {
        mimeType: "application/json",
        text: JSON.stringify(manifest)
      };
    }
    if (kind === "index.html") {
      const html = manifest.files.find((file) => file.kind === "html");
      if (!html) throw new Error(`share artifact html not found: ${artifactId}`);
      const data = await readShareArtifact(html.path, options.shareOutputRoots ?? [], "text/html");
      return {
        mimeType: "text/html",
        text: data.text ?? ""
      };
    }
    throw new Error(`unknown resource uri: ${uri}`);
  }

  const prefix = "skill://id/";
  if (!uri.startsWith(prefix)) {
    throw new Error(`unknown resource uri: ${uri}`);
  }

  const rest = uri.slice(prefix.length);
  const fileMarker = "/file/";
  const fileIndex = rest.indexOf(fileMarker);
  const encodedId = fileIndex >= 0 ? rest.slice(0, fileIndex) : rest;
  const id = decodeURIComponent(encodedId);
  const skill = skills.find((item) => item.id === id);
  if (!skill) {
    throw new Error(`skill not found for uri: ${uri}`);
  }

  if (fileIndex >= 0) {
    const relativePath = decodeURIComponent(rest.slice(fileIndex + fileMarker.length));
    const markdown = await readFile(resolveDeclaredFile(skill, relativePath));
    assertTextResource(relativePath, markdown);
    return {
      mimeType: "text/markdown",
      text: markdown
    };
  }

  const markdown = await readFile(skill.bodyPath);
  return {
    mimeType: "text/markdown",
    text: markdown
  };
}
